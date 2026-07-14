import { renderToBuffer } from "@react-pdf/renderer";
import { getSession } from "@/lib/auth/session";
import { getQuoteForClinic } from "@/lib/services/quotes";
import { QuoteDocument } from "@/lib/pdf/quote-document";
import { slugifyForFilename } from "@/lib/pdf/filename";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("No autorizado.", { status: 401 });

  const { id } = await params;
  // Nunca confiar en el id solo: siempre se filtra también por la clínica de la sesión, así una
  // clínica jamás puede descargar el presupuesto de otra.
  const quote = await getQuoteForClinic(session.clinicId, id);
  if (!quote) return new Response("No encontramos ese presupuesto.", { status: 404 });

  const buffer = await renderToBuffer(<QuoteDocument quote={quote} timezone={quote.clinic.timezone} />);
  const filename = `presupuesto-${slugifyForFilename(quote.pet.name)}-${quote.createdAt.toISOString().slice(0, 10)}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
