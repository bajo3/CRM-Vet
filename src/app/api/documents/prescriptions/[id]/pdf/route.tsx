import { renderToBuffer } from "@react-pdf/renderer";
import { getSession } from "@/lib/auth/session";
import { getPrescriptionForClinic } from "@/lib/services/prescriptions";
import { PrescriptionDocument } from "@/lib/pdf/prescription-document";
import { slugifyForFilename } from "@/lib/pdf/filename";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("No autorizado.", { status: 401 });

  const { id } = await params;
  // Nunca confiar en el id solo: siempre se filtra también por la clínica de la sesión, así una
  // clínica jamás puede descargar la receta de otra.
  const prescription = await getPrescriptionForClinic(session.clinicId, id);
  if (!prescription) return new Response("No encontramos esa receta.", { status: 404 });

  const buffer = await renderToBuffer(<PrescriptionDocument prescription={prescription} timezone={prescription.clinic.timezone} />);
  const filename = `receta-${slugifyForFilename(prescription.pet.name)}-${prescription.createdAt.toISOString().slice(0, 10)}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
