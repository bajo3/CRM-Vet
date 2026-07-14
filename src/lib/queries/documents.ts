import { getPrisma } from "../prisma";

const DOCUMENT_LIMIT = 100;

export type ClinicDocument =
  | { kind: "quote"; id: string; createdAt: Date; petId: string; petName: string; clientName: string; userName: string; title: string | null; total: number }
  | { kind: "prescription"; id: string; createdAt: Date; petId: string; petName: string; clientName: string; userName: string; content: string };

/** Últimos presupuestos y recetas de la clínica (ambos tipos mezclados y ordenados por fecha), para el acceso rápido desde el menú. */
export async function listClinicDocuments(clinicId: string, search: string): Promise<ClinicDocument[]> {
  const prisma = getPrisma();
  const petFilter = search
    ? { OR: [{ pet: { name: { contains: search, mode: "insensitive" as const } } }, { pet: { client: { name: { contains: search, mode: "insensitive" as const } } } }] }
    : {};

  const [quotes, prescriptions] = await Promise.all([
    prisma.quote.findMany({
      where: { clinicId, ...petFilter },
      include: { pet: { select: { id: true, name: true, client: { select: { name: true } } } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: DOCUMENT_LIMIT,
    }),
    prisma.prescription.findMany({
      where: { clinicId, ...petFilter },
      include: { pet: { select: { id: true, name: true, client: { select: { name: true } } } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: DOCUMENT_LIMIT,
    }),
  ]);

  const documents: ClinicDocument[] = [
    ...quotes.map((quote) => ({
      kind: "quote" as const,
      id: quote.id,
      createdAt: quote.createdAt,
      petId: quote.pet.id,
      petName: quote.pet.name,
      clientName: quote.pet.client.name,
      userName: quote.user.name,
      title: quote.title,
      total: Number(quote.total),
    })),
    ...prescriptions.map((prescription) => ({
      kind: "prescription" as const,
      id: prescription.id,
      createdAt: prescription.createdAt,
      petId: prescription.pet.id,
      petName: prescription.pet.name,
      clientName: prescription.pet.client.name,
      userName: prescription.user.name,
      content: prescription.content,
    })),
  ];

  return documents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, DOCUMENT_LIMIT);
}
