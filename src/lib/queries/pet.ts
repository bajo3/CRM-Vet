import { getPrisma } from "../prisma";

/** Trae la mascota (con tutor), su historial médico completo y datos derivados para la ficha. */
export async function getPetDetail(clinicId: string, petId: string) {
  const prisma = getPrisma();
  const now = new Date();

  const pet = await prisma.pet.findFirst({
    where: { id: petId, clinicId },
    include: { client: true },
  });
  if (!pet) return null;

  const [medicalRecords, nextAppointment, nextControlRecord] = await Promise.all([
    prisma.medicalRecord.findMany({
      where: { clinicId, petId },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.appointment.findFirst({
      where: { clinicId, petId, status: { in: ["PENDING", "CONFIRMED"] }, startAt: { gte: now } },
      orderBy: { startAt: "asc" },
    }),
    prisma.medicalRecord.findFirst({
      where: { clinicId, petId, nextDueDate: { gte: now } },
      orderBy: { nextDueDate: "asc" },
    }),
  ]);

  const lastVisit = medicalRecords[0] ?? null;
  const lastWeightRecord = medicalRecords.find((record) => record.weight !== null) ?? null;
  const lastKnownWeight = lastWeightRecord ? lastWeightRecord.weight : pet.weight;

  return { pet, medicalRecords, nextAppointment, nextControlRecord, lastVisit, lastKnownWeight };
}
