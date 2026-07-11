import Link from "next/link";
import { DateTime } from "luxon";
import { ArrowLeft, Bot, Check, CheckCheck, ChevronRight, MessageCircle, PawPrint, UserRound } from "lucide-react";
import type { ConversationStatus } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";
import { openConversation, resolveConversation, returnConversationToAutomation } from "@/lib/actions/messages";
import { MessageComposer } from "./message-composer";
import { ConversationReadMarker } from "./conversation-read-marker";

const STATUS_META: Record<ConversationStatus, { label: string; className: string }> = {
  AUTOMATED: { label: "Automática", className: "bg-violet-50 text-violet-700" },
  REQUIRES_HUMAN: { label: "Requiere atención", className: "bg-rose-50 text-rose-700" },
  HUMAN_ACTIVE: { label: "En atención", className: "bg-blue-50 text-blue-700" },
  RESOLVED: { label: "Resuelta", className: "bg-slate-100 text-slate-600" },
};

const MESSAGE_STATUS: Record<string, string> = {
  HUMAN_QUEUED: "En cola", QUEUED: "En cola", SENDING: "Enviando", SENT: "Enviado", FAILED: "No enviado", RECEIVED: "Recibido",
};

const FILTERS = [
  ["", "Todas"], ["REQUIRES_HUMAN", "Pendientes"], ["AUTOMATED", "Automáticas"], ["HUMAN_ACTIVE", "En atención"], ["RESOLVED", "Resueltas"],
] as const;

export default async function MensajesPage({ searchParams }: { searchParams: Promise<{ conversation?: string; status?: string }> }) {
  const session = await requireSession();
  const query = await searchParams;
  const validStatus = ["AUTOMATED", "REQUIRES_HUMAN", "HUMAN_ACTIVE", "RESOLVED"].includes(query.status ?? "")
    ? query.status as ConversationStatus
    : undefined;
  const prisma = getPrisma();
  const clinic = await prisma.clinic.findUnique({ where: { id: session.clinicId }, select: { timezone: true } });
  const timezone = clinic?.timezone ?? "America/Argentina/Buenos_Aires";
  const conversations = await prisma.whatsappConversation.findMany({
    where: { clinicId: session.clinicId, ...(validStatus ? { status: validStatus } : {}) },
    include: {
      client: true,
      pet: true,
      assignedUser: true,
      messages: { orderBy: { createdAt: "asc" }, take: 100 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });
  const selected = conversations.find((item) => item.id === query.conversation) ?? conversations[0];
  const mobileHasSelection = Boolean(query.conversation && selected);

  return (
    <div className="grid min-h-[calc(100vh-65px)] bg-white lg:h-screen lg:min-h-0 lg:grid-cols-[380px_1fr] lg:overflow-hidden">
      <aside className={`${mobileHasSelection ? "hidden lg:flex" : "flex"} min-h-[calc(100vh-65px)] flex-col border-r border-slate-200 bg-white lg:min-h-0`}>
        <header className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">Centro de atención</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Mensajes</h1></div><span className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><MessageCircle size={21} /></span></div>
          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar conversaciones">
            {FILTERS.map(([value, label]) => {
              const active = validStatus === value || (!validStatus && !value);
              return <Link key={value} href={`/mensajes${value ? `?status=${value}` : ""}`} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</Link>;
            })}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="grid min-h-72 place-items-center p-8 text-center"><div><MessageCircle size={36} className="mx-auto text-slate-200" /><p className="mt-3 text-sm font-medium text-slate-700">No hay conversaciones</p><p className="mt-1 text-xs leading-5 text-slate-400">Las conversaciones de WhatsApp aparecerán acá.</p></div></div>
          ) : conversations.map((conversation) => {
            const meta = STATUS_META[conversation.status];
            const lastMessage = conversation.messages.at(-1);
            const initials = (conversation.contactName || conversation.client?.name || conversation.phone).split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
            return (
              <Link key={conversation.id} href={`/mensajes?conversation=${conversation.id}${validStatus ? `&status=${validStatus}` : ""}`} className={`group grid grid-cols-[44px_1fr_auto] gap-3 border-b border-slate-100 p-4 transition hover:bg-slate-50 ${selected?.id === conversation.id ? "bg-emerald-50/70 lg:border-l-2 lg:border-l-emerald-500" : ""}`}>
                <span className="grid size-11 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials}</span>
                <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{conversation.contactName || conversation.client?.name || conversation.phone}</p>{conversation.pet && <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-400"><PawPrint size={11} />{conversation.pet.name}</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{lastMessage?.direction === "OUTBOUND" ? "Vos: " : ""}{lastMessage?.content ?? "Sin mensajes"}</p><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>{meta.label}</span></div>
                <div className="flex flex-col items-end justify-between"><span className="text-[10px] text-slate-400">{DateTime.fromJSDate(conversation.lastMessageAt).setZone(timezone).toFormat("HH:mm")}</span>{conversation.unreadCount > 0 ? <span className="grid min-w-5 place-items-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">{conversation.unreadCount}</span> : <ChevronRight size={15} className="text-slate-300 transition group-hover:translate-x-0.5" />}</div>
              </Link>
            );
          })}
        </div>
      </aside>

      <section className={`${mobileHasSelection ? "flex" : "hidden lg:flex"} min-h-[calc(100vh-65px)] flex-col bg-[#f4f7f5] lg:min-h-0`}>
        {selected ? (
          <>
            <ConversationReadMarker conversationId={selected.id} unreadCount={selected.unreadCount} />
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex min-w-0 items-center gap-3"><Link href="/mensajes" aria-label="Volver a conversaciones" className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden"><ArrowLeft size={18} /></Link><div className="min-w-0"><h2 className="truncate font-semibold">{selected.contactName || selected.client?.name || selected.phone}</h2><div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{selected.phone}</span><span>·</span><span className={STATUS_META[selected.status].className.split(" ").at(-1)}>{STATUS_META[selected.status].label}</span>{selected.assignedUser && <><span>·</span><span>Atiende {selected.assignedUser.name}</span></>}</div></div></div>
              <div className="flex items-center gap-2">
                {selected.status === "REQUIRES_HUMAN" && <form action={openConversation.bind(null, selected.id)}><button className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"><UserRound size={14} />Tomar</button></form>}
                {selected.status === "HUMAN_ACTIVE" && <form action={returnConversationToAutomation.bind(null, selected.id)}><button title="Volver al bot" className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Bot size={14} />Automatizar</button></form>}
                {selected.status !== "RESOLVED" && <form action={resolveConversation.bind(null, selected.id)}><button title="Marcar como resuelta" className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><Check size={16} /></button></form>}
              </div>
            </header>

            {selected.pet && <div className="border-b border-slate-200 bg-white px-4 py-2.5"><Link href={`/clientes/mascotas/${selected.pet.id}`} className="inline-flex items-center gap-2 rounded-lg text-xs font-medium text-emerald-700 hover:underline"><PawPrint size={14} />Ver ficha de {selected.pet.name}</Link></div>}

            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {selected.messages.map((message) => {
                const outbound = message.direction === "OUTBOUND";
                return <div key={message.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[70%] ${outbound ? "rounded-br-md bg-emerald-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}><p className="whitespace-pre-wrap leading-5">{message.content}</p><div className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] ${outbound ? "text-emerald-100" : "text-slate-400"}`}><span>{DateTime.fromJSDate(message.createdAt).setZone(timezone).toFormat("HH:mm")}</span>{outbound && <><CheckCheck size={12} /><span>{MESSAGE_STATUS[message.status] ?? "En proceso"}</span></>}</div></div></div>;
              })}
            </div>
            <MessageComposer conversationId={selected.id} disabled={selected.status === "RESOLVED" || selected.status === "AUTOMATED"} />
          </>
        ) : <div className="grid flex-1 place-items-center p-8 text-center"><div><MessageCircle size={44} className="mx-auto text-slate-200" /><p className="mt-4 font-medium text-slate-700">Elegí una conversación</p><p className="mt-1 text-sm text-slate-400">Seleccioná un contacto para ver el historial.</p></div></div>}
      </section>
    </div>
  );
}
