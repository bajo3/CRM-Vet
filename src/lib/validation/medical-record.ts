import { z } from "zod";

export const MEDICAL_RECORD_TYPE_OPTIONS = [
  { value: "CONSULTATION", label: "Consulta" },
  { value: "VACCINE", label: "Vacuna" },
  { value: "TREATMENT", label: "Tratamiento" },
  { value: "CONTROL", label: "Control" },
  { value: "OTHER", label: "Otro" },
] as const;

export const NEXT_CONTROL_OPTIONS = [
  { value: "none", label: "Sin próximo control" },
  { value: "7d", label: "En 7 días", days: 7 },
  { value: "15d", label: "En 15 días", days: 15 },
  { value: "1m", label: "En 1 mes", days: 30 },
  { value: "3m", label: "En 3 meses", days: 90 },
  { value: "6m", label: "En 6 meses", days: 180 },
  { value: "1y", label: "En 1 año", days: 365 },
  { value: "custom", label: "Elegir fecha" },
] as const;

export type NextControlOptionValue = (typeof NEXT_CONTROL_OPTIONS)[number]["value"];

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined));

export const medicalRecordFormSchema = z
  .object({
    type: z.enum(["CONSULTATION", "VACCINE", "TREATMENT", "CONTROL", "OTHER"]).default("CONSULTATION"),
    reason: z.string().trim().min(1, { error: "Ingresá el motivo de la atención." }).max(200),
    notes: z.string().trim().min(1, { error: "Ingresá una nota." }).max(2000),
    weight: z
      .union([z.literal(""), z.coerce.number().min(0, { error: "El peso no puede ser negativo." }).max(500)])
      .optional()
      .transform((value) => (value === "" || value === undefined ? undefined : value)),
    treatment: optionalText(300),
    nextControlOption: z.enum(["none", "7d", "15d", "1m", "3m", "6m", "1y", "custom"]).default("none"),
    nextControlDate: z
      .union([z.string().trim().date({ error: "Ingresá una fecha válida." }), z.literal("")])
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .refine((data) => data.nextControlOption !== "custom" || !!data.nextControlDate, {
    error: "Elegí la fecha del próximo control.",
    path: ["nextControlDate"],
  });

/** Forma de los valores del formulario (antes de las transformaciones de zod). */
export type MedicalRecordFormValues = z.input<typeof medicalRecordFormSchema>;
/** Forma de los datos ya validados/transformados, la que reciben las server actions. */
export type MedicalRecordFormInput = z.output<typeof medicalRecordFormSchema>;
