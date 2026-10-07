import { renderToBuffer } from "@react-pdf/renderer";
import { getSession } from "@/lib/auth/session";
import { getVaccinationCard } from "@/lib/queries/vaccination-card";
import { VaccinationCardDocument } from "@/lib/pdf/vaccination-card-document";
import { slugifyForFilename } from "@/lib/pdf/filename";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ petId: string }> }) {
  const session = await getSession();
  if (!session) return new Response("No autorizado.", { status: 401 });

  const { petId } = await params;
  // Siempre se filtra por la clínica de la sesión: una clínica nunca descarga la libreta de otra.
  const card = await getVaccinationCard(session.clinicId, petId);
  if (!card) return new Response("No encontramos esa mascota.", { status: 404 });

  const buffer = await renderToBuffer(<VaccinationCardDocument card={card} />);
  const filename = `libreta-vacunacion-${slugifyForFilename(card.name)}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
