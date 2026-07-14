import { cache } from "react";
import { getPrisma } from "../prisma";

/**
 * Datos de la clínica de la sesión, cacheados por request con `React.cache()`.
 *
 * El layout del panel y varias páginas (Inicio, Agenda, Configuración) necesitan la misma fila de
 * `Clinic` en el mismo request. Sin este cache cada uno hacía su propio `findUnique`, sumando
 * viajes redundantes a una base remota. `cache()` dedupea por los argumentos dentro del mismo
 * request de React Server Components (no persiste entre requests ni entre clínicas).
 */
export const getClinicSettings = cache(async (clinicId: string) => {
  return getPrisma().clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      name: true,
      phone: true,
      timezone: true,
      defaultAppointmentDuration: true,
      openingHours: true,
      logoUrl: true,
    },
  });
});
