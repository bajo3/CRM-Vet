import { getPrisma } from "../prisma";

export type CreatePrescriptionInput = {
  clinicId: string;
  petId: string;
  userId: string;
  content: string;
};

const PRESCRIPTION_DOCUMENT_INCLUDE = {
  pet: { include: { client: true } },
  clinic: true,
  user: true,
} as const;

/**
 * Crea una receta (texto libre) para una mascota de la clínica. Devuelve el registro con las
 * relaciones necesarias para renderizar el PDF (pet + client + clinic + user).
 */
export async function createPrescription(input: CreatePrescriptionInput) {
  const content = input.content.trim();
  if (!content) throw new Error("EMPTY_CONTENT");

  const prisma = getPrisma();
  const pet = await prisma.pet.findFirst({ where: { id: input.petId, clinicId: input.clinicId } });
  if (!pet) throw new Error("PET_NOT_FOUND");

  return prisma.prescription.create({
    data: {
      clinicId: input.clinicId,
      petId: input.petId,
      userId: input.userId,
      content,
    },
    include: PRESCRIPTION_DOCUMENT_INCLUDE,
  });
}

export type PrescriptionWithDocumentData = Awaited<ReturnType<typeof createPrescription>>;

/** Busca una receta ya generada, verificando que pertenezca a la clínica (aislamiento multiempresa). */
export async function getPrescriptionForClinic(clinicId: string, prescriptionId: string) {
  const prisma = getPrisma();
  return prisma.prescription.findFirst({
    where: { id: prescriptionId, clinicId },
    include: PRESCRIPTION_DOCUMENT_INCLUDE,
  });
}
