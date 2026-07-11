import { getPrisma } from "../prisma";
import { normalizePhone } from "../phone";

/** Busca clientes de la clínica por nombre de cliente, nombre de mascota o teléfono (case-insensitive). */
export async function searchClients(clinicId: string, query: string) {
  const prisma = getPrisma();
  const q = query.trim();
  if (!q) {
    return prisma.client.findMany({
      where: { clinicId },
      include: { pets: { orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  const digits = normalizePhone(q);
  return prisma.client.findMany({
    where: {
      clinicId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
        { pets: { some: { name: { contains: q, mode: "insensitive" } } } },
      ],
    },
    include: { pets: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}

/** Lista simple de clientes de la clínica, para selects de "tutor". */
export async function listClientsForSelect(clinicId: string) {
  const prisma = getPrisma();
  return prisma.client.findMany({ where: { clinicId }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } });
}
