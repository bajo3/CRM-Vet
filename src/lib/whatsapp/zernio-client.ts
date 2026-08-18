// Cliente mínimo para la API REST de Zernio (https://docs.zernio.com/). Solo cubre lo que
// necesita el flujo de conexión de WhatsApp (coexistencia): crear el profile de la clínica y
// obtener la URL de Embedded Signup de Meta. Server-only: nunca importar desde un client component.

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
