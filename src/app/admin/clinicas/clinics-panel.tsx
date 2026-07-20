"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageCircle, X } from "lucide-react";
import { approveClinic, rejectClinic, updateClinicWhatsappBridge } from "@/lib/actions/platform-admin";

type ClinicRow = {
  id: string;
  name: string;
  phone: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  statusReason: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  whatsappSessionKey: string | null;
  whatsappBridgeUrl: string | null;
};

function WhatsappBridgeEditor({ clinic }: { clinic: ClinicRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(clinic.whatsappSessionKey ?? "");
  const [bridgeUrl, setBridgeUrl] = useState(clinic.whatsappBridgeUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasOwnBridge = !!clinic.whatsappSessionKey && !!clinic.whatsappBridgeUrl;

  const onSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateClinicWhatsappBridge({
        clinicId: clinic.id,
        whatsappSessionKey: sessionKey.trim(),
        whatsappBridgeUrl: bridgeUrl.trim(),
      });
      if (!result.ok) { setError(result.message); return; }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        <MessageCircle size={13} />
        WhatsApp: {hasOwnBridge ? "bridge propio asignado" : "usa el bridge global (demo)"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Clave de sesión</label>
            <input
              value={sessionKey}
              onChange={(event) => setSessionKey(event.target.value)}
              placeholder="ej: san-martin"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
            />
            <p className="mt-1 text-xs text-slate-400">Tiene que coincidir con WHATSAPP_CLINIC_KEY del servicio de Railway.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">URL del bridge</label>
            <input
              value={bridgeUrl}
              onChange={(event) => setBridgeUrl(event.target.value)}
              placeholder="https://....up.railway.app"
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
            />
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error}</p>}
          {saved && !error && <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">Guardado.</p>}
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white disabled:opacity-60"
          >
            {isPending && <Loader2 size={13} className="animate-spin" />}
            Guardar
          </button>
        </div>
      )}
    </div>
  );
}

export function PendingClinicRow({ clinic }: { clinic: ClinicRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onApprove = () => {
    setError(null);
    startTransition(async () => {
      const result = await approveClinic({ clinicId: clinic.id });
      if (!result.ok) { setError(result.message); return; }
      router.refresh();
    });
  };

  const onReject = () => {
    setError(null);
    startTransition(async () => {
      const result = await rejectClinic({ clinicId: clinic.id, reason: reason.trim() || undefined });
      if (!result.ok) { setError(result.message); return; }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{clinic.name}</p>
          <p className="truncate text-sm text-slate-500">
            {clinic.ownerName} · {clinic.ownerEmail}
          </p>
          {clinic.phone && <p className="text-xs text-slate-400">{clinic.phone}</p>}
          <p className="mt-1 text-xs text-slate-400">Solicitado el {new Date(clinic.createdAt).toLocaleDateString("es-AR")}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={isPending}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-60"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => setShowReject((value) => !value)}
            disabled={isPending}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            <X size={14} />
            Rechazar
          </button>
        </div>
      </div>
      {showReject && (
        <div className="rounded-xl bg-slate-50 p-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">Motivo (opcional, se le muestra a quien se registró)</label>
          <div className="flex gap-2">
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-400"
              placeholder="Ej: no pudimos verificar los datos de la clínica"
            />
            <button
              type="button"
              onClick={onReject}
              disabled={isPending}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {isPending && <Loader2 size={13} className="animate-spin" />}
              Confirmar rechazo
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error}</p>}
    </div>
  );
}

export function DecidedClinicRow({ clinic }: { clinic: ClinicRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onApprove = () => {
    setError(null);
    startTransition(async () => {
      const result = await approveClinic({ clinicId: clinic.id });
      if (!result.ok) { setError(result.message); return; }
      router.refresh();
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{clinic.name}</p>
          <p className="truncate text-sm text-slate-500">
            {clinic.ownerName} · {clinic.ownerEmail}
          </p>
          {clinic.status === "REJECTED" && clinic.statusReason && (
            <p className="mt-1 text-xs text-rose-600">Motivo: {clinic.statusReason}</p>
          )}
          {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${clinic.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {clinic.status === "APPROVED" ? "Aprobada" : "Rechazada"}
          </span>
          {clinic.status === "REJECTED" && (
            <button
              type="button"
              onClick={onApprove}
              disabled={isPending}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Revertir
            </button>
          )}
        </div>
      </div>
      {clinic.status === "APPROVED" && <WhatsappBridgeEditor clinic={clinic} />}
    </div>
  );
}
