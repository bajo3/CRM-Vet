import { DateTime } from "luxon";
import { getPrisma } from "../prisma";

/** Datos agregados para el panel de Inicio: agenda de hoy, contadores y mensajes que requieren atención. */
export async function getDashboardData(clinicId: string, timezone: string) {
  const prisma = getPrisma();
  const now = new Date();
  const dayStart = DateTime.now().setZone(timezone).startOf("day").toUTC().toJSDate();
  const dayEnd = DateTime.now().setZone(timezone).endOf("day").toUTC().toJSDate();
  const in7Days = DateTime.now().setZone(timezone).plus({ days: 7 }).toUTC().toJSDate();

  const [todayAppointments, pendingTodayCount, upcomingControlsCount, overdueControlsCount, requiresHumanConversations] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId, startAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { startAt: "asc" },
      include: { pet: { include: { client: true } } },
    }),
    prisma.appointment.count({ where: { clinicId, startAt: { gte: dayStart, lte: dayEnd }, status: "PENDING" } }),
    prisma.medicalRecord.count({ where: { clinicId, nextDueDate: { gte: now, lte: in7Days } } }),
    prisma.medicalRecord.count({ where: { clinicId, nextDueDate: { lt: now } } }),
    prisma.whatsappConversation.findMany({
      where: { clinicId, status: "REQUIRES_HUMAN" },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    todayAppointments,
    pendingTodayCount,
    upcomingControlsCount,
    overdueControlsCount,
    requiresHumanConversations,
  };
}
