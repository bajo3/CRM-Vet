"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { GripVertical, Loader2, PlusCircle } from "lucide-react";
import { appointmentStatusBadge, formatTime } from "@/lib/format";
import { rescheduleAppointmentAction } from "@/lib/actions/appointments";
import type { AgendaAppointment } from "@/lib/queries/agenda";

type Vet = { id: string; name: string };

function AppointmentCard({
  appointment,
  timezone,
  draggable,
  isDragging,
  isMoving,
  onDragStart,
  onDragEnd,
}: {
  appointment: AgendaAppointment;
  timezone: string;
  draggable: boolean;
  isDragging: boolean;
  isMoving: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const badge = appointmentStatusBadge(appointment.status);
  return (
    <Link
      href={`/agenda/${appointment.id}`}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`flex h-[74px] flex-col justify-center gap-0.5 rounded-xl px-3 py-1.5 text-xs shadow-sm transition-opacity hover:opacity-90 ${badge.className} ${
        isDragging ? "opacity-30" : ""
      } ${isMoving ? "animate-pulse" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono font-semibold">{formatTime(appointment.startAt, timezone)}</span>
        <span className="flex items-center gap-1">
          {draggable && <GripVertical size={11} className="opacity-50" />}
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-medium">{badge.label}</span>
        </span>
      </div>
      <div className="truncate font-medium">{appointment.pet.name}</div>
      <div className="truncate text-[11px] opacity-80">{appointment.pet.client.name}</div>
    </Link>
  );
}

export function DayView({
  date,
  timezone,
  slots,
  vets,
  appointments,
  canCreate,
}: {
  date: string;
  timezone: string;
  slots: string[];
  vets: Vet[];
  appointments: AgendaAppointment[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const now = new Date();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Al entrar a la agenda de hoy, nos posicionamos en el horario actual en vez de arrancar siempre
  // desde el primer turno del día — así no hay que scrollear manualmente para ver "ahora".
  useEffect(() => {
    if (date !== DateTime.now().setZone(timezone).toISODate()) return;
    const nowSlot = DateTime.now().setZone(timezone).toFormat("HH:mm");
    const target = [...slots].reverse().find((slot) => slot <= nowSlot) ?? slots[0];
    if (!target) return;
    slotRefs.current[target]?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (vets.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
        No hay veterinarios activos en esta clínica.
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
        La clínica no abre este día. Elegí otra fecha o creá un turno igual desde &quot;Nuevo turno&quot;.
      </div>
    );
  }

  function appointmentAt(vetId: string, slot: string) {
    return appointments.find(
      (appointment) => appointment.veterinarianId === vetId && DateTime.fromJSDate(appointment.startAt).setZone(timezone).toFormat("HH:mm") === slot
    );
  }

  function slotIsPast(slot: string) {
    return DateTime.fromISO(`${date}T${slot}`, { zone: timezone }).toJSDate() < now;
  }

  function handleDrop(vetId: string, slot: string) {
    if (!draggingId) return;
    const dragged = appointments.find((appointment) => appointment.id === draggingId);
    setDraggingId(null);
    if (!dragged || dragged.veterinarianId !== vetId) return; // sólo se puede mover dentro de la misma columna del veterinario
    const currentSlot = DateTime.fromJSDate(dragged.startAt).setZone(timezone).toFormat("HH:mm");
    if (currentSlot === slot) return;
    if (appointmentAt(vetId, slot)) {
      setError("Ese horario ya está ocupado.");
      return;
    }
    if (slotIsPast(slot)) {
      setError("No podés mover un turno a un horario pasado.");
      return;
    }
    setError(null);
    setMovingId(dragged.id);
    startTransition(async () => {
      const result = await rescheduleAppointmentAction(dragged.id, { date, time: slot });
      setMovingId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {canCreate && <p className="text-xs text-slate-400">Podés arrastrar un turno a otro horario para reprogramarlo (dentro de la misma columna).</p>}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
          {error}
          <button type="button" onClick={() => setError(null)} className="text-xs font-medium underline">
            Cerrar
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid min-w-[560px]" style={{ gridTemplateColumns: `76px repeat(${vets.length}, minmax(200px, 1fr))` }}>
          <div className="sticky left-0 z-10 border-b border-r border-slate-100 bg-slate-50 p-3 text-xs font-medium text-slate-500">Hora</div>
          {vets.map((vet) => (
            <div key={vet.id} className="truncate border-b border-slate-100 p-3 text-sm font-semibold">
              {vet.name}
            </div>
          ))}

          {slots.map((slot) => {
            const past = slotIsPast(slot);
            return (
              <Fragment key={slot}>
                <div
                  ref={(el) => { slotRefs.current[slot] = el; }}
                  className={`sticky left-0 z-10 border-b border-r border-slate-100 bg-white p-3 font-mono text-xs ${past ? "text-slate-300" : "text-slate-500"}`}
                >
                  {slot}
                </div>
                {vets.map((vet) => {
                  const appointment = appointmentAt(vet.id, slot);
                  const canDropHere = canCreate && draggingId !== null;
                  return (
                    <div
                      key={`${vet.id}-${slot}`}
                      className={`border-b border-slate-100 p-1.5 ${past && !appointment ? "opacity-40" : ""} ${
                        canDropHere ? "rounded-xl outline-dashed outline-1 outline-transparent transition-colors hover:outline-emerald-300 hover:bg-emerald-50/40" : ""
                      }`}
                      onDragOver={(event) => {
                        if (!canDropHere) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        if (!canDropHere) return;
                        event.preventDefault();
                        handleDrop(vet.id, slot);
                      }}
                    >
                      {appointment ? (
                        <AppointmentCard
                          appointment={appointment}
                          timezone={timezone}
                          draggable={canCreate}
                          isDragging={draggingId === appointment.id}
                          isMoving={movingId === appointment.id}
                          onDragStart={() => setDraggingId(appointment.id)}
                          onDragEnd={() => setDraggingId(null)}
                        />
                      ) : past || !canCreate ? (
                        <div className="h-[74px]" />
                      ) : (
                        <Link
                          href={`/agenda/nuevo?date=${date}&time=${slot}&vetId=${vet.id}`}
                          className="flex h-[74px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-slate-300 transition-colors hover:border-emerald-300 hover:text-emerald-500"
                        >
                          <PlusCircle size={18} />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
      {movingId && (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" />
          Reprogramando...
        </p>
      )}
    </div>
  );
}
