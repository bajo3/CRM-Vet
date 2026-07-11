import { MedicalRecordType, Prisma } from "@prisma/client";
import { getPrisma } from "../prisma";

const CONTROL_REMINDER_OFFSETS = [
  { days: 7, suffix: "7d" },
  { days: 1, suffix: "1d" },
] as const;

export type CreateMedicalRecordInput = {
  clinicId: string;
  petId: string;
  userId: string;
  appointmentId?: string | null;
  type: MedicalRecordType;
  reason: string;
  notes?: string | null;
  weight?: Prisma.Decimal | number | string | null;
  treatment?: string | null;
  nextDueDate?: Date | null;
};

/**
 * Registra un acto médico. Si tiene `nextDueDate` y el cliente tiene los recordatorios
 * habilitados, agenda dos recordatorios CONTROL_DUE (7 y 1 día antes), omitiendo los que ya
 * caerían en el pasado. Valida que `nextDueDate` sea posterior a la fecha de atención.
 */
export async function createMedicalRecord(input: CreateMedicalRecordInput) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const pet = await tx.pet.findFirst({ where: { id: input.petId, clinicId: input.clinicId }, include: { client: true } });
    if (!pet) throw new Error("PET_NOT_FOUND");

    const attendedAt = new Date();
    if (input.nextDueDate && input.nextDueDate <= attendedAt) {
      throw new Error("INVALID_NEXT_DUE_DATE");
    }

    const record = await tx.medicalRecord.create({
      data: {
        clinicId: input.clinicId,
        petId: input.petId,
        userId: input.userId,
        appointmentId: input.appointmentId ?? null,
        type: input.type,
        reason: input.reason,
        notes: input.notes ?? null,
        weight: input.weight ?? null,
        treatment: input.treatment ?? null,
        nextDueDate: input.nextDueDate ?? null,
      },
    });

    if (input.nextDueDate && pet.client.remindersEnabled) {
      for (const offset of CONTROL_REMINDER_OFFSETS) {
        const scheduledAt = new Date(input.nextDueDate.getTime() - offset.days * 24 * 60 * 60 * 1000);
        if (scheduledAt <= attendedAt) continue;
        await tx.reminder.create({
          data: {
            clinicId: input.clinicId,
            clientId: pet.clientId,
            petId: pet.id,
            medicalRecordId: record.id,
            type: "CONTROL_DUE",
            scheduledAt,
            deduplicationKey: `control:${record.id}:${offset.suffix}`,
          },
        });
      }
    }

    return record;
  });
}
