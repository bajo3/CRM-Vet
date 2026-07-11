import { getPrisma } from "../prisma";
import { normalizePhone } from "../phone";

/** Busca clientes de la clínica por nombre de cliente, nombre de mascota o teléfono (case-insensitive). */
// La lista de clientes solo muestra nombre, teléfono y mascotas (nombre + especie) por tutor: no
// hace falta traer el resto de columnas de Client ni de Pet en cada fila.
const CLIENT_LIST_SELECT = {
  id: true,
  name: true,
  phone: true,
  pets: { select: { id: true, name: true, species: true }, orderBy: { name: "asc" as const } },
};

export async function searchClients(clinicId: string, query: string) {
  const prisma = getPrisma();
  const q = query.trim();
  if (!q) {
    return prisma.client.findMany({
      where: { clinicId },
      select: CLIENT_LIST_SELECT,
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
    select: CLIENT_LIST_SELECT,
    orderBy: { name: "asc" },
  });
}

/** Lista simple de clientes de la clínica, para selects de "tutor". */
export async function listClientsForSelect(clinicId: string) {
  const prisma = getPrisma();
  return prisma.client.findMany({ where: { clinicId }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } });
}
