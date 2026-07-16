import "dotenv/config";
import { getPrisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth/password";

/**
 * Seed MÍNIMO: sólo la clínica y los 4 usuarios de login, sin datos de ejemplo (clientes,
 * mascotas, turnos, etc.). Es el que corre `npm run db:seed`.
 *
 * Idempotente y NO destructivo: si la clínica ya existe (por `whatsappSessionKey`), no la borra
 * ni la recrea — sólo asegura que los usuarios y sus membresías existan con la contraseña demo.
 * Pensado para poder correrse en la base de producción sin riesgo de pisar datos reales (clientes,
 * turnos, conversaciones de WhatsApp) que ya vivan en esa clínica.
 *
 * Para agregar además los datos de ejemplo (clientes, mascotas, turnos demo), correr
 * `npm run db:seed:demo` (ver `prisma/seed-demo.ts`).
 */

export const CLINIC_KEY = "patitas-demo";
export const TIMEZONE = "America/Argentina/Buenos_Aires";
export const DEMO_PASSWORD = "Patitas2026!";

const prisma = getPrisma();

export async function ensureClinicAndUsers() {
  let clinic = await prisma.clinic.findUnique({ where: { whatsappSessionKey: CLINIC_KEY } });
  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: {
        name: "Veterinaria Patitas",
        phone: "5491123456789",
        timezone: TIMEZONE,
        whatsappSessionKey: CLINIC_KEY,
        defaultAppointmentDuration: 30,
        status: "APPROVED",
        openingHours: {
          monday: ["09:00", "18:00"],
          tuesday: ["09:00", "18:00"],
          wednesday: ["09:00", "18:00"],
          thursday: ["09:00", "18:00"],
          friday: ["09:00", "18:00"],
        },
      },
    });
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const [owner, receptionist, vetAna, vetMartin] = await Promise.all([
    prisma.user.upsert({
      where: { email: "sofia@patitas.com" },
      update: { passwordHash },
      create: { name: "Sofía Martínez", email: "sofia@patitas.com", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "diego@patitas.com" },
      update: { passwordHash },
      create: { name: "Diego Torres", email: "diego@patitas.com", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "ana@patitas.com" },
      update: { passwordHash },
      create: { name: "Dra. Ana Pérez", email: "ana@patitas.com", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "martin@patitas.com" },
      update: { passwordHash },
      create: { name: "Dr. Martín Suárez", email: "martin@patitas.com", passwordHash },
    }),
  ]);

  await Promise.all([
    prisma.clinicMember.upsert({
      where: { clinicId_userId: { clinicId: clinic.id, userId: owner.id } },
      update: { active: true },
      create: { clinicId: clinic.id, userId: owner.id, role: "OWNER" },
    }),
    prisma.clinicMember.upsert({
      where: { clinicId_userId: { clinicId: clinic.id, userId: receptionist.id } },
      update: { active: true },
      create: { clinicId: clinic.id, userId: receptionist.id, role: "RECEPTIONIST" },
    }),
    prisma.clinicMember.upsert({
      where: { clinicId_userId: { clinicId: clinic.id, userId: vetAna.id } },
      update: { active: true },
      create: { clinicId: clinic.id, userId: vetAna.id, role: "VETERINARIAN" },
    }),
    prisma.clinicMember.upsert({
      where: { clinicId_userId: { clinicId: clinic.id, userId: vetMartin.id } },
      update: { active: true },
      create: { clinicId: clinic.id, userId: vetMartin.id, role: "VETERINARIAN" },
    }),
  ]);

  return { clinic, owner, receptionist, vetAna, vetMartin };
}

/**
 * Da de alta (o promueve) al superadmin de la plataforma si vienen las env vars, sin tocar nada si
 * no vienen — así el seed sigue corriendo igual en cualquier ambiente que no las tenga configuradas.
 * El superadmin no pertenece a ninguna clínica: solo aprueba/rechaza altas desde /admin/clinicas.
 */
async function ensureSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) return null;

  const passwordHash = await hashPassword(password);
  const superAdmin = await prisma.user.upsert({
    where: { email },
    update: { isSuperAdmin: true },
    create: { name: "Superadmin", email, passwordHash, isSuperAdmin: true },
  });
  return superAdmin;
}

async function main() {
  const { clinic } = await ensureClinicAndUsers();
  console.log(`Seed mínimo listo: clínica "${clinic.name}" + 4 usuarios (sin datos de ejemplo).`);
  console.log(`Para cargar datos de ejemplo: npm run db:seed:demo`);

  const superAdmin = await ensureSuperAdmin();
  if (superAdmin) console.log(`Superadmin listo: ${superAdmin.email}`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
