import { getPrisma } from "../prisma";

/**
 * Datos de la libreta de vacunación de una mascota: sus atenciones de tipo `VACCINE`, de la más
 * reciente a la más antigua. Siempre filtra por `clinicId` además del id de la mascota.
 */
export async function getVaccinationCard(clinicId: string, petId: string) {
  return getPrisma().pet.findFirst({
    where: { id: petId, clinicId },
    select: {
      id: true,
      name: true,
      species: true,
      breed: true,
      sex: true,
      birthDate: true,
      client: { select: { name: true, phone: true } },
      clinic: { select: { name: true, phone: true, logoUrl: true, timezone: true } },
      medicalRecords: {
        where: { type: "VACCINE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, reason: true, treatment: true, createdAt: true, nextDueDate: true, user: { select: { name: true, licenseNumber: true } } },
      },
    },
  });
}

export type VaccinationCard = NonNullable<Awaited<ReturnType<typeof getVaccinationCard>>>;
