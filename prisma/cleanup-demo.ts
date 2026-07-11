import "dotenv/config";
import { getPrisma } from "../src/lib/prisma";

/**
 * Borra ÚNICAMENTE los datos de ejemplo cargados por `prisma/seed.ts` (los 5 clientes demo,
 * identificados por nombre+teléfono exactos, sus mascotas, turnos, registros médicos,
 * recordatorios, conversaciones y mensajes de WhatsApp asociados).
 *
 * NO toca: la clínica, los 4 usuarios de login, ni ningún cliente/mascota/conversación real
 * (p.ej. los creados desde el WhatsApp real de producción). Si un cliente demo tiene mascotas
 * que NO están en la lista esperada del seed (alguien las agregó después), el script NO borra
 * ese cliente ni sus mascotas y lo reporta como advertencia, para evitar borrar datos reales por
 * error.
 *
 * Uso:
 *   npx tsx prisma/cleanup-demo.ts --dry-run   → sólo imprime qué borraría, no borra nada.
 *   npx tsx prisma/cleanup-demo.ts             → imprime el plan y después borra.
 */

const prisma = getPrisma();

// Debe reflejar EXACTAMENTE los clientes y mascotas de CLIENTS_SEED en prisma/seed.ts.
const DEMO_CLIENTS = [
  { name: "María González", phone: "5491160011001", pets: ["Lola", "Toby"] },
  { name: "Juan Rodríguez", phone: "5491160011002", pets: ["Rocco"] },
  { name: "Camila Fernández", phone: "5491160011003", pets: ["Milo", "Nala"] },
  { name: "Martín López", phone: "5491160011004", pets: ["Mora"] },
  { name: "Lucía Benítez", phone: "5491160011005", pets: ["Simón", "Coco"] },
] as const;

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(dryRun ? "=== MODO DRY-RUN: no se borra nada ===" : "=== Limpieza de datos demo ===");
  console.log();

  const safeClientIds: string[] = [];
  const safePetIds: string[] = [];
  const skipped: string[] = [];

  for (const seedClient of DEMO_CLIENTS) {
    const client = await prisma.client.findFirst({
      where: { name: seedClient.name, phone: seedClient.phone },
      include: { pets: { select: { id: true, name: true } } },
    });

    if (!client) {
      console.log(`- ${seedClient.name} (${seedClient.phone}): no existe en la base (ya estaba limpio o nunca se sembró). Se omite.`);
      continue;
    }

    const unexpectedPets = client.pets.filter((pet) => !(seedClient.pets as readonly string[]).includes(pet.name));
    if (unexpectedPets.length > 0) {
      skipped.push(client.id);
      console.log(
        `! ${seedClient.name} (${seedClient.phone}): tiene mascotas que NO están en el seed (${unexpectedPets
          .map((pet) => pet.name)
          .join(", ")}). NO se borra este cliente ni sus mascotas por seguridad.`
      );
      continue;
    }

    const missingPets = (seedClient.pets as readonly string[]).filter((name) => !client.pets.some((pet) => pet.name === name));
    if (missingPets.length > 0) {
      console.log(`  (aviso: ${seedClient.name} no tiene la mascota "${missingPets.join(", ")}" del seed original — puede haber sido borrada antes; se continúa igual con lo que existe)`);
    }

    safeClientIds.push(client.id);
    for (const pet of client.pets) safePetIds.push(pet.id);
    console.log(`- ${seedClient.name} (${seedClient.phone}): OK, mascotas: ${client.pets.map((pet) => pet.name).join(", ") || "(ninguna)"}`);
  }

  console.log();

  if (safeClientIds.length === 0) {
    console.log("No hay clientes demo seguros para borrar. Nada para hacer.");
    if (skipped.length > 0) {
      console.log(`Se omitieron ${skipped.length} cliente(s) por tener datos no reconocidos (ver advertencias arriba). Revisar manualmente.`);
    }
    await prisma.$disconnect();
    return;
  }

  // Consultas secuenciales (no Promise.all): este script corre una sola vez, a mano, y el pool
  // compartido (pool_size 15, entre dev/start/workers/tests de todo el equipo) suele estar
  // saturado — minimizar conexiones simultáneas importa más acá que la velocidad.
  const appointments = await prisma.appointment.findMany({ where: { petId: { in: safePetIds } }, select: { id: true, reason: true, startAt: true } });
  const medicalRecords = await prisma.medicalRecord.findMany({ where: { petId: { in: safePetIds } }, select: { id: true, type: true } });
  const reminders = await prisma.reminder.findMany({ where: { OR: [{ clientId: { in: safeClientIds } }, { petId: { in: safePetIds } }] }, select: { id: true } });
  const conversations = await prisma.whatsappConversation.findMany({ where: { OR: [{ clientId: { in: safeClientIds } }, { petId: { in: safePetIds } }] }, select: { id: true, contactName: true, phone: true } });
  const appointmentIds = appointments.map((appointment) => appointment.id);
  const conversationIds = conversations.map((conversation) => conversation.id);
  const messages = conversationIds.length
    ? await prisma.whatsappMessage.findMany({ where: { conversationId: { in: conversationIds } }, select: { id: true } })
    : [];
  const activities = appointmentIds.length
    ? await prisma.appointmentActivity.findMany({ where: { appointmentId: { in: appointmentIds } }, select: { id: true } })
    : [];

  console.log("Se van a borrar:");
  console.log(`  Clientes: ${safeClientIds.length}`);
  console.log(`  Mascotas: ${safePetIds.length}`);
  console.log(`  Turnos: ${appointments.length}`);
  console.log(`  Actividad de turnos: ${activities.length}`);
  console.log(`  Registros médicos: ${medicalRecords.length}`);
  console.log(`  Recordatorios: ${reminders.length}`);
  console.log(`  Conversaciones de WhatsApp: ${conversations.length}${conversations.length ? ` (${conversations.map((c) => c.contactName ?? c.phone).join(", ")})` : ""}`);
  console.log(`  Mensajes de WhatsApp: ${messages.length}`);
  if (skipped.length > 0) console.log(`  (${skipped.length} cliente(s) demo NO se tocan por tener datos no reconocidos)`);
  console.log();

  if (dryRun) {
    console.log("Dry-run: no se realizó ningún borrado.");
    await prisma.$disconnect();
    return;
  }

  // Orden por las FK Restrict: Appointment.pet es Restrict, así que los turnos (y lo que cuelga
  // de ellos) se borran antes que las mascotas. El resto de las relaciones son Cascade/SetNull y
  // no bloquean, pero igual se borran explícitamente para poder contarlas con precisión.
  const messageIds = messages.map((message) => message.id);
  if (messageIds.length) await prisma.whatsappMessage.deleteMany({ where: { id: { in: messageIds } } });
  if (conversationIds.length) await prisma.whatsappConversation.deleteMany({ where: { id: { in: conversationIds } } });

  const reminderIds = reminders.map((reminder) => reminder.id);
  if (reminderIds.length) await prisma.reminder.deleteMany({ where: { id: { in: reminderIds } } });

  const activityIds = activities.map((activity) => activity.id);
  if (activityIds.length) await prisma.appointmentActivity.deleteMany({ where: { id: { in: activityIds } } });

  const medicalRecordIds = medicalRecords.map((record) => record.id);
  if (medicalRecordIds.length) await prisma.medicalRecord.deleteMany({ where: { id: { in: medicalRecordIds } } });

  if (appointmentIds.length) await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });

  await prisma.pet.deleteMany({ where: { id: { in: safePetIds } } });
  await prisma.client.deleteMany({ where: { id: { in: safeClientIds } } });

  console.log("Listo. Datos demo borrados; clínica, usuarios y datos reales preservados.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
