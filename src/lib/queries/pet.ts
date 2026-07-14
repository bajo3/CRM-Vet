import { getPrisma } from "../prisma";

/** Trae la mascota (con tutor), su historial médico completo y datos derivados para la ficha. */
export async function getPetDetail(clinicId: string, petId: string) {
  const prisma = getPrisma();
  const now = new Date();

  // Ninguna de estas seis consultas depende del resultado de otra (todas solo necesitan
  // petId/clinicId), así que se piden en paralelo en lugar de esperar la mascota primero.
  const [pet, medicalRecords, nextAppointment, nextControlRecord, quotes, prescriptions] = await Promise.all([
    prisma.pet.findFirst({
      where: { id: petId, clinicId },
      include: { client: { select: { name: true, phone: true } } },
    }),
    prisma.medicalRecord.findMany({
      where: { clinicId, petId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.appointment.findFirst({
      where: { clinicId, petId, status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: now } },
      select: { id: true, startAt: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.medicalRecord.findFirst({
      where: { clinicId, petId, nextDueDate: { gte: now } },
      orderBy: { nextDueDate: "asc" },
    }),
    prisma.quote.findMany({
      where: { clinicId, petId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.prescription.findMany({
      where: { clinicId, petId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!pet) return null;

  const lastVisit = medicalRecords[0] ?? null;
  const lastWeightRecord = medicalRecords.find((record) => record.weight !== null) ?? null;
  const lastKnownWeight = lastWeightRecord ? lastWeightRecord.weight : pet.weight;

  return { pet, medicalRecords, nextAppointment, nextControlRecord, lastVisit, lastKnownWeight, quotes, prescriptions };
}
