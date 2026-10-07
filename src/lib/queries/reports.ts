import { DateTime } from "luxon";
import { getPrisma } from "../prisma";

export const REPORT_PERIODS = [30, 90, 365] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Un cliente se considera inactivo si ninguna de sus mascotas tuvo turno ni atención en este lapso. */
export const INACTIVE_AFTER_MONTHS = 12;

/**
 * Indicadores de gestión de la clínica para los últimos `days` días. Todo se calcula con datos que
 * el panel ya registra (turnos, atenciones, clientes): no hay tablas propias de reportes.
 */
export async function getClinicReport(clinicId: string, timezone: string, days: ReportPeriod) {
  const prisma = getPrisma();
  const now = DateTime.now().setZone(timezone);
  const from = now.minus({ days }).startOf("day").toJSDate();
  const to = now.toJSDate();
  const inactiveSince = now.minus({ months: INACTIVE_AFTER_MONTHS }).toJSDate();
  const inRange = { gte: from, lte: to };

  const inactiveWhere = {
    clinicId,
    createdAt: { lt: inactiveSince },
    pets: {
      some: {},
      every: {
        appointments: { none: { startAt: { gte: inactiveSince } } },
        medicalRecords: { none: { createdAt: { gte: inactiveSince } } },
      },
    },
  };

  const [byStatus, byVet, bySource, recordsByType, newClients, totalClients, inactiveCount, inactiveClients, salesByMethod] = await Promise.all([
    prisma.appointment.groupBy({ by: ["status"], where: { clinicId, startAt: inRange }, _count: { _all: true } }),
    prisma.appointment.groupBy({ by: ["veterinarianId", "status"], where: { clinicId, startAt: inRange }, _count: { _all: true } }),
    prisma.appointment.groupBy({ by: ["source"], where: { clinicId, createdAt: inRange }, _count: { _all: true } }),
    prisma.medicalRecord.groupBy({ by: ["type"], where: { clinicId, createdAt: inRange }, _count: { _all: true } }),
    prisma.client.count({ where: { clinicId, createdAt: inRange } }),
    prisma.client.count({ where: { clinicId } }),
    prisma.client.count({ where: inactiveWhere }),
    prisma.client.findMany({
      where: inactiveWhere,
      select: { id: true, name: true, phone: true, pets: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: 10,
    }),
    prisma.sale.groupBy({ by: ["paymentMethod"], where: { clinicId, status: "COMPLETED", createdAt: inRange }, _sum: { total: true }, _count: { _all: true } }),
  ]);

  const vets = await prisma.user.findMany({
    where: { id: { in: [...new Set(byVet.map((row) => row.veterinarianId))] } },
    select: { id: true, name: true },
  });

  const statusCount = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
  const attended = statusCount("ATTENDED");
  const noShow = statusCount("NO_SHOW");
  const cancelled = statusCount("CANCELLED");
  const totalAppointments = byStatus.reduce((sum, row) => sum + row._count._all, 0);
  const concluded = attended + noShow;

  const vetName = new Map(vets.map((vet) => [vet.id, vet.name]));
  const perVet = new Map<string, { name: string; total: number; attended: number; noShow: number }>();
  for (const row of byVet) {
    const entry = perVet.get(row.veterinarianId) ?? { name: vetName.get(row.veterinarianId) ?? "Sin nombre", total: 0, attended: 0, noShow: 0 };
    entry.total += row._count._all;
    if (row.status === "ATTENDED") entry.attended += row._count._all;
    if (row.status === "NO_SHOW") entry.noShow += row._count._all;
    perVet.set(row.veterinarianId, entry);
  }

  const sourceCount = (source: string) => bySource.find((row) => row.source === source)?._count._all ?? 0;

  return {
    totalAppointments,
    attended,
    noShow,
    cancelled,
    upcoming: statusCount("PENDING") + statusCount("CONFIRMED"),
    /** Ausentes sobre los turnos que ya tuvieron desenlace (atendidos + ausentes). `null` si no hubo ninguno. */
    noShowRate: concluded > 0 ? noShow / concluded : null,
    veterinarians: [...perVet.values()].sort((a, b) => b.total - a.total),
    bookedByWhatsapp: sourceCount("WHATSAPP"),
    bookedByCrm: sourceCount("CRM"),
    bookedOnline: sourceCount("ONLINE"),
    revenue: salesByMethod.reduce((sum, row) => sum + Math.round(Number(row._sum.total ?? 0) * 100), 0) / 100,
    salesCount: salesByMethod.reduce((sum, row) => sum + row._count._all, 0),
    revenueByMethod: salesByMethod.map((row) => ({ method: row.paymentMethod, total: Number(row._sum.total ?? 0) })).sort((a, b) => b.total - a.total),
    recordsByType: recordsByType.map((row) => ({ type: row.type, count: row._count._all })).sort((a, b) => b.count - a.count),
    newClients,
    totalClients,
    inactiveCount,
    inactiveClients: inactiveClients.map((client) => ({ id: client.id, name: client.name, phone: client.phone, pets: client.pets.map((pet) => pet.name) })),
  };
}

export type ClinicReport = Awaited<ReturnType<typeof getClinicReport>>;
