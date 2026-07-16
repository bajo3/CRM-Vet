import { z } from "zod";

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined));

export const petFormSchema = z.object({
  name: z.string().trim().min(1, { error: "Ingresá el nombre de la mascota." }).max(80),
  species: z.string().trim().min(1, { error: "Ingresá la especie." }).max(60),
  clientId: z.string().trim().min(1, { error: "Elegí el tutor de la mascota." }),
  /** Cadena vacía = sin foto (o se quitó); si no, debe ser una imagen embebida como data URL (subida desde el navegador). */
  photoUrl: z
    .union([
      z.string().trim().max(400_000).regex(/^data:image\/(png|jpeg|webp);base64,/, { error: "La foto no se procesó correctamente." }),
      z.literal(""),
    ])
    .optional()
    .transform((value) => (value ? value : undefined)),
  breed: optionalText(80),
  sex: optionalText(20),
  birthDate: z
    .union([z.string().trim().date({ error: "Ingresá una fecha válida." }), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  approximateAge: optionalText(40),
  weight: z
    .union([z.literal(""), z.coerce.number().min(0, { error: "El peso no puede ser negativo." }).max(500)])
    .optional()
    .transform((value) => (value === "" || value === undefined ? undefined : value)),
  notes: optionalText(1000),
});

/** Forma de los valores del formulario (antes de las transformaciones de zod). */
export type PetFormValues = z.input<typeof petFormSchema>;
/** Forma de los datos ya validados/transformados, la que reciben las server actions. */
export type PetFormInput = z.output<typeof petFormSchema>;
