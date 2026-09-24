// Cliente mínimo para la API REST de Zernio (https://docs.zernio.com/): conexión de WhatsApp
// (profile + Embedded Signup de Meta), envío de mensajes, estado del número y verificación de la
// firma de los webhooks. Server-only: nunca importar desde un client component.

import { createHmac, timingSafeEqual } from "node:crypto";

const ZERNIO_API_BASE = "https://zernio.com/api/v1";

function apiKey(): string {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new Error("ZERNIO_NOT_CONFIGURED");
  return key;
}

async function zernioFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${ZERNIO_API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  return response;
}

// Zernio envuelve las respuestas de forma inconsistente entre endpoints (la lista devuelve
// `{profiles: [...]}`), así que el id se busca tanto en la raíz como en los envoltorios habituales
// en vez de asumir una sola forma.
function extractProfileId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (typeof root._id === "string") return root._id;
  for (const key of ["profile", "data"]) {
    const nested = root[key];
    if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>)._id === "string") {
      return (nested as Record<string, unknown>)._id as string;
    }
  }
  return null;
}

/** Último recurso: los nombres son únicos por workspace, así que alcanza para reencontrar el profile. */
async function findProfileIdByName(name: string): Promise<string | null> {
  const response = await zernioFetch("/profiles");
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as { profiles?: { _id?: string; name?: string }[] } | null;
  const match = data?.profiles?.find((profile) => profile.name === name);
  return typeof match?._id === "string" ? match._id : null;
}

/**
 * Crea (o recupera, si ya existe una con el mismo nombre) el profile de Zernio para una clínica.
 * Un profile = un cliente/tenant en Zernio; cada clínica del CRM tiene el suyo.
 */
export async function ensureZernioProfile(clinicName: string, clinicId: string): Promise<string> {
  const response = await zernioFetch("/profiles", {
    method: "POST",
    headers: { "idempotency-key": `clinic-${clinicId}` },
    body: JSON.stringify({ name: clinicName, description: `CRM Vet — clínica ${clinicId}` }),
  });

  if (response.ok) {
    const created = extractProfileId(await response.json().catch(() => null));
    if (created) return created;
    const found = await findProfileIdByName(clinicName);
    if (found) return found;
    throw new Error("ZERNIO_PROFILE_MISSING_ID");
  }

  if (response.status === 409) {
    const data = (await response.json().catch(() => null)) as { details?: { existingProfileId?: string } } | null;
    const existingId = data?.details?.existingProfileId ?? (await findProfileIdByName(clinicName));
    if (existingId) return existingId;
  }

  throw new Error(`ZERNIO_PROFILE_CREATE_${response.status}`);
}

/**
 * Pide a Zernio la URL de Embedded Signup de Meta para vincular WhatsApp (modo coexistencia) al
 * profile de la clínica. Al terminar, Meta vuelve a `redirectUrl` con
 * `?connected=whatsapp&profileId=...&accountId=...&username=...` (o sin accountId si el usuario
 * canceló / hubo error).
 */
export async function getWhatsappConnectUrl(profileId: string, redirectUrl: string): Promise<string> {
  const params = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  const response = await zernioFetch(`/connect/whatsapp?${params.toString()}`);
  if (!response.ok) throw new Error(`ZERNIO_CONNECT_${response.status}`);
  const data = (await response.json()) as { authUrl?: string };
  if (!data.authUrl) throw new Error("ZERNIO_CONNECT_MISSING_AUTH_URL");
  return data.authUrl;
}

export function isZernioConfigured(): boolean {
  return Boolean(process.env.ZERNIO_API_KEY);
}

/** Ventana de atención de WhatsApp: se puede escribir texto libre hasta 24 h después del último mensaje del cliente. */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ZernioSendResult =
  | { ok: true; messageId: string; conversationId: string | null }
  | { ok: false; retryable: boolean; code: string };

// Errores que no se arreglan reintentando: hay que cambiar algo del lado de Meta/Zernio (plantilla,
// elegibilidad de Direct Send, número inválido, destinatario que se dio de baja, etc.).
const PERMANENT_ERROR_CODES = new Set([
  "TEMPLATE_REQUIRED",
  "DIRECT_SEND_NOT_ELIGIBLE",
  "DIRECT_SEND_BLOCKED",
  "PLATFORM_NOT_SUPPORTED",
  "recipient_opted_out",
  "131026",
  "131030",
  "131047",
]);

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** Busca un código de error en las formas habituales de respuesta de Zernio (`code`, `error.code`, `platformError.code`). */
export function extractZernioErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const direct = stringField(root.code);
  if (direct) return direct;
  for (const key of ["error", "platformError", "details"]) {
    const nested = root[key];
    if (nested && typeof nested === "object") {
      const code = stringField((nested as Record<string, unknown>).code);
      if (code) return code;
    }
  }
  return null;
}

function classifyFailure(status: number, payload: unknown): { retryable: boolean; code: string } {
  const code = extractZernioErrorCode(payload) ?? `HTTP_${status}`;
  if (PERMANENT_ERROR_CODES.has(code)) return { retryable: false, code };
  // 429 (límite de ritmo, incluido el 131056 de WhatsApp) y 5xx son transitorios.
  if (status === 429 || status >= 500 || code === "131056" || code === "DIRECT_SEND_LIMITED") return { retryable: true, code };
  // Cualquier otro 4xx es un pedido que Zernio/Meta rechaza tal como está: reintentar no cambia nada.
  return { retryable: false, code };
}

function extractSendIds(payload: unknown): { messageId: string | null; conversationId: string | null } {
  if (!payload || typeof payload !== "object") return { messageId: null, conversationId: null };
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const messageIds = Array.isArray(data.messageIds) ? data.messageIds : [];
  return {
    messageId: stringField(data.messageId) ?? stringField(messageIds[0]),
    conversationId: stringField(data.conversationId),
  };
}

/**
 * Envía un texto por WhatsApp a través de Zernio.
 * - Con la ventana de 24 h abierta y una conversación conocida, responde dentro de esa conversación.
 * - Si no, abre (o reutiliza) la conversación con un mensaje de utilidad por Direct Send de Meta, que
 *   no necesita plantilla aprobada. Es lo que usan los recordatorios de turnos y controles.
 */
export async function sendZernioWhatsappText(input: {
  accountId: string;
  phone: string;
  text: string;
  conversationId: string | null;
  windowOpen: boolean;
}): Promise<ZernioSendResult> {
  let response: Response;
  try {
    if (input.windowOpen && input.conversationId) {
      response = await zernioFetch(`/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ accountId: input.accountId, message: input.text }),
      });
    } else {
      response = await zernioFetch("/inbox/conversations", {
        method: "POST",
        body: JSON.stringify({
          accountId: input.accountId,
          participantId: input.phone.replace(/\D/g, ""),
          message: input.text,
          category: "utility",
        }),
      });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "NETWORK_ERROR";
    return { ok: false, retryable: code !== "ZERNIO_NOT_CONFIGURED", code };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, ...classifyFailure(response.status, payload) };

  const ids = extractSendIds(payload);
  if (!ids.messageId) return { ok: false, retryable: false, code: "MISSING_MESSAGE_ID" };
  return { ok: true, messageId: ids.messageId, conversationId: ids.conversationId ?? input.conversationId };
}

export type ZernioNumberInfo = { phoneNumber: string | null; verifiedName: string | null; status: string | null };

/** Estado en vivo del número conectado (lo lee Zernio directo de Meta). `null` si no se pudo leer. */
export async function getZernioNumberInfo(accountId: string): Promise<ZernioNumberInfo | null> {
  try {
    const response = await zernioFetch(`/whatsapp/number-info?${new URLSearchParams({ accountId }).toString()}`);
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as { phone?: Record<string, unknown> } | null;
    const phone = data?.phone ?? {};
    return {
      phoneNumber: stringField(phone.display_phone_number),
      verifiedName: stringField(phone.verified_name),
      status: stringField(phone.status),
    };
  } catch {
    return null;
  }
}

/** Verifica `X-Zernio-Signature`: HMAC-SHA256 en hex del cuerpo crudo, con el secreto del webhook. */
export function verifyZernioSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(signature.trim().toLowerCase());
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
