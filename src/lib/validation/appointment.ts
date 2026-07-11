import { z } from "zod";

export const REASON_CHIPS = ["Consulta", "Vacunación", "Control", "Otro"] as const;

export const appointmentFormSchema = z.object({
  petId: z.string().trim().min(1, { error: "Elegí la mascota." }),
  veterinarianId: z.string().trim().min(1, { error: "Elegí el veterinario." }),
  reason: z.string().trim().min(1, { error: "Ingresá el motivo del turno." }).max(200),
  date: z.string().trim().date({ error: "Elegí una fecha válida." }),
  time: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, { error: "Elegí un horario válido." }),
});

/** Forma de los valores del formulario (antes de las transformaciones de zod). */
export type AppointmentFormValues = z.input<typeof appointmentFormSchema>;
/** Forma de los datos ya validados, la que reciben las server actions. */
export type AppointmentFormInput = z.output<typeof appointmentFormSchema>;

export const rescheduleFormSchema = z.object({
  date: z.string().trim().date({ error: "Elegí una fecha válida." }),
  time: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, { error: "Elegí un horario válido." }),
});

export type RescheduleFormValues = z.input<typeof rescheduleFormSchema>;
export type RescheduleFormInput = z.output<typeof rescheduleFormSchema>;
