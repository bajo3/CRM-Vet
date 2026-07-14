import { z } from "zod";
import { getPrisma } from "../prisma";

const quoteItemSchema = z.object({
  description: z.string().trim().min(1),
  amount: z.number().positive(),
});

const quoteItemsSchema = z.array(quoteItemSchema).min(1);

export type CreateQuoteItemInput = { description: string; amount: number };

export type CreateQuoteInput = {
  clinicId: string;
  petId: string;
  userId: string;
  title?: string | null;
  items: CreateQuoteItemInput[];
  notes?: string | null;
};

const QUOTE_DOCUMENT_INCLUDE = {
  pet: { include: { client: true } },
  clinic: true,
  user: true,
} as const;

/**
 * Crea un presupuesto para una mascota de la clínica. El total nunca se confía del llamador: se
 * recalcula siempre acá sumando los `items` recibidos. Devuelve el registro con las relaciones
 * necesarias para renderizar el PDF (pet + client + clinic + user) para no consultar de nuevo.
 */
export async function createQuote(input: CreateQuoteInput) {
  const parsedItems = quoteItemsSchema.parse(input.items);

  const prisma = getPrisma();
  const pet = await prisma.pet.findFirst({ where: { id: input.petId, clinicId: input.clinicId } });
  if (!pet) throw new Error("PET_NOT_FOUND");

  const total = parsedItems.reduce((sum, item) => sum + item.amount, 0);

  return prisma.quote.create({
    data: {
      clinicId: input.clinicId,
      petId: input.petId,
      userId: input.userId,
      title: input.title ?? null,
      items: parsedItems,
      total,
      notes: input.notes ?? null,
    },
    include: QUOTE_DOCUMENT_INCLUDE,
  });
}

export type QuoteWithDocumentData = Awaited<ReturnType<typeof createQuote>>;

/** Busca un presupuesto ya generado, verificando que pertenezca a la clínica (aislamiento multiempresa). */
export async function getQuoteForClinic(clinicId: string, quoteId: string) {
  const prisma = getPrisma();
  return prisma.quote.findFirst({
    where: { id: quoteId, clinicId },
    include: QUOTE_DOCUMENT_INCLUDE,
  });
}
