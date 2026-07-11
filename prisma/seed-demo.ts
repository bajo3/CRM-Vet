import "dotenv/config";
import { DateTime } from "luxon";
import type { Client, Pet } from "@prisma/client";
import { getPrisma } from "../src/lib/prisma";
import { createAppointment, updateAppointmentStatus } from "../src/lib/services/appointments";
import { createMedicalRecord } from "../src/lib/services/medical-records";
import { ensureClinicAndUsers, TIMEZONE } from "./seed";

/**
 * Seed de DATOS DE EJEMPLO: agrega los 5 clientes demo (con mascotas, turnos, historial médico,
 * recordatorios y un par de conversaciones de WhatsApp) sobre la clínica base. Es el que corre
 * `npm run db:seed:demo`.
 *
 * Primero asegura que exista la clínica y los 4 usuarios (mismo bootstrap que `npm run db:seed`,
 * no destructivo). NUNCA borra ni recrea la clínica — si ya corriste este seed antes (o si la
 * clínica tiene datos reales de producción), cada cliente demo que ya exista (por teléfono) se
 * deja como está y se salta, en vez de duplicarlo o pisar la clínica entera.
 */

const prisma = getPrisma();

type PetSeed = {
  name: string;
  species: string;
  breed: string;
  sex: "Macho" | "Hembra";
  birthDate?: Date;
  approximateAge?: string;
  weight: number;
};

type ClientSeed = {
  name: string;
  phone: string;
  address: string;
  remindersEnabled?: boolean;
  pets: PetSeed[];
};

const CLIENTS_SEED: ClientSeed[] = [
  {
    name: "María González",
    phone: "5491160011001",
    address: "Av. Rivadavia 4520, CABA",
    pets: [
      { name: "Lola", species: "Perro", breed: "Labrador", sex: "Hembra", birthDate: new Date("2019-03-12"), weight: 28.4 },
      { name: "Toby", species: "Perro", breed: "Caniche", sex: "Macho", birthDate: new Date("2022-07-01"), weight: 7.2 },
    ],
  },
  {
    name: "Juan Rodríguez",
    phone: "5491160011002",
    address: "Calle 50 N.º 1234, La Plata",
    pets: [{ name: "Rocco", species: "Perro", breed: "Bóxer", sex: "Macho", birthDate: new Date("2020-11-20"), weight: 32.1 }],
  },
  {
    name: "Camila Fernández",
    phone: "5491160011003",
    address: "Bv. Oroño 1580, Rosario",
    pets: [
      { name: "Milo", species: "Gato", breed: "Común europeo", sex: "Macho", approximateAge: "5 años", weight: 4.8 },
      { name: "Nala", species: "Gato", breed: "Siamés", sex: "Hembra", birthDate: new Date("2023-02-14"), weight: 3.6 },
    ],
  },
  {
    name: "Martín López",
    phone: "5491160011004",
    address: "San Martín 800, Córdoba",
    remindersEnabled: false,
    pets: [{ name: "Mora", species: "Gato", breed: "Persa", sex: "Hembra", birthDate: new Date("2021-05-30"), weight: 4.1 }],
  },
  {
    name: "Lucía Benítez",
    phone: "5491160011005",
    address: "Mitre 210, Mar del Plata",
    pets: [
      { name: "Simón", species: "Perro", breed: "Mestizo", sex: "Macho", approximateAge: "3 años", weight: 18.5 },
      { name: "Coco", species: "Perro", breed: "Beagle", sex: "Macho", birthDate: new Date("2020-09-09"), weight: 12.3 },
    ],
  },
];

function atClinicTime(daysOffset: number, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  return DateTime.now().setZone(TIMEZONE).plus({ days: daysOffset }).set({ hour, minute, second: 0, millisecond: 0 }).toJSDate();
}

async function main() {
  const { clinic, owner, receptionist, vetAna, vetMartin } = await ensureClinicAndUsers();

  const alreadyDemoSeeded = await prisma.client.findFirst({ where: { clinicId: clinic.id, phone: CLIENTS_SEED[0].phone } });
  if (alreadyDemoSeeded) {
    console.log("Los clientes demo ya existen en esta clínica (se detectó por teléfono). No se vuelve a sembrar para no duplicar ni pisar datos.");
    console.log("Si querés recargar los datos de ejemplo desde cero, corré antes `npx tsx prisma/cleanup-demo.ts` y volvé a correr este comando.");
    await prisma.$disconnect();
    return;
  }

  const clientsByName = new Map<string, Client>();
  const petsByName = new Map<string, Pet>();

  for (const clientSeed of CLIENTS_SEED) {
    const client = await prisma.client.create({
      data: {
        clinicId: clinic.id,
        name: clientSeed.name,
        phone: clientSeed.phone,
        address: clientSeed.address,
        remindersEnabled: clientSeed.remindersEnabled ?? true,
      },
    });
    clientsByName.set(clientSeed.name, client);
    for (const petSeed of clientSeed.pets) {
      const pet = await prisma.pet.create({
        data: {
          clinicId: clinic.id,
          clientId: client.id,
          name: petSeed.name,
          species: petSeed.species,
          breed: petSeed.breed,
          sex: petSeed.sex,
          birthDate: petSeed.birthDate ?? null,
          approximateAge: petSeed.approximateAge ?? null,
          weight: petSeed.weight,
        },
      });
      petsByName.set(petSeed.name, pet);
    }
  }

  const pet = (name: string) => petsByName.get(name)!.id;
  const client = (name: string) => clientsByName.get(name)!;

  // Turnos en distintos estados, pasados y futuros. Se crean con el servicio real
  // (misma cascada de actividad y recordatorios que produce la app en uso normal).
  const apptRocco = await createAppointment({
    clinicId: clinic.id,
    petId: pet("Rocco"),
    veterinarianId: vetAna.id,
    reason: "Consulta general",
    startAt: atClinicTime(-10, "10:00"),
    endAt: atClinicTime(-10, "10:30"),
    source: "CRM",
    createdById: receptionist.id,
  });
  await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: apptRocco.id, status: "ATTENDED", changedById: vetAna.id });
  await createMedicalRecord({
    clinicId: clinic.id,
    petId: pet("Rocco"),
    userId: vetAna.id,
    appointmentId: apptRocco.id,
    type: "CONSULTATION",
    reason: "Consulta general",
    notes: "Buen estado general. Se recomienda control de rutina en 6 meses.",
    weight: 32.1,
  });

  const apptLola = await createAppointment({
    clinicId: clinic.id,
    petId: pet("Lola"),
    veterinarianId: vetMartin.id,
    reason: "Vacunación antirrábica",
    startAt: atClinicTime(-20, "11:00"),
    endAt: atClinicTime(-20, "11:30"),
    source: "WHATSAPP",
  });
  await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: apptLola.id, status: "NO_SHOW", changedById: receptionist.id });
  await createMedicalRecord({
    clinicId: clinic.id,
    petId: pet("Lola"),
    userId: vetMartin.id,
    type: "VACCINE",
    reason: "Vacunación antirrábica",
    treatment: "Aplicación de vacuna antirrábica anual",
    weight: 28.4,
    nextDueDate: atClinicTime(335, "10:00"),
  });

  const apptMilo = await createAppointment({
    clinicId: clinic.id,
    petId: pet("Milo"),
    veterinarianId: vetAna.id,
    reason: "Control de peso",
    startAt: atClinicTime(-5, "09:30"),
    endAt: atClinicTime(-5, "10:00"),
    source: "CRM",
    createdById: owner.id,
  });
  await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: apptMilo.id, status: "CANCELLED", changedById: owner.id });

  // Control histórico ya vencido, con sus dos recordatorios ya enviados (se cargan directo,
  // sin pasar por el servicio, porque representan un vencimiento pasado real).
  const miloRecord = await prisma.medicalRecord.create({
    data: {
      clinicId: clinic.id,
      petId: pet("Milo"),
      userId: vetAna.id,
      type: "CONTROL",
      reason: "Control de peso",
      notes: "Sobrepeso leve, se indicó dieta.",
      weight: 4.9,
      nextDueDate: atClinicTime(-3, "10:00"),
      createdAt: atClinicTime(-33, "10:00"),
    },
  });
  await prisma.reminder.createMany({
    data: [
      {
        clinicId: clinic.id,
        clientId: client("Camila Fernández").id,
        petId: pet("Milo"),
        medicalRecordId: miloRecord.id,
        type: "CONTROL_DUE",
        scheduledAt: atClinicTime(-10, "09:00"),
        status: "SENT",
        attempts: 1,
        sentAt: atClinicTime(-10, "09:05"),
        externalMessageId: `mock-seed-${miloRecord.id}-7d`,
        deduplicationKey: `control:${miloRecord.id}:7d`,
      },
      {
        clinicId: clinic.id,
        clientId: client("Camila Fernández").id,
        petId: pet("Milo"),
        medicalRecordId: miloRecord.id,
        type: "CONTROL_DUE",
        scheduledAt: atClinicTime(-4, "09:00"),
        status: "SENT",
        attempts: 1,
        sentAt: atClinicTime(-4, "09:04"),
        externalMessageId: `mock-seed-${miloRecord.id}-1d`,
        deduplicationKey: `control:${miloRecord.id}:1d`,
      },
    ],
  });

  // Simón: primero el control con nextDueDate próximo (genera un recordatorio CONTROL_DUE
  // pendiente); después su turno, cuya creación cancela ese recordatorio porque ya tiene
  // fecha agendada. Demuestra la cascada de appointments.ts en datos de ejemplo.
  await createMedicalRecord({
    clinicId: clinic.id,
    petId: pet("Simón"),
    userId: vetAna.id,
    type: "CONTROL",
    reason: "Control post-operatorio",
    notes: "Evolución favorable, continuar reposo relativo.",
    nextDueDate: atClinicTime(5, "09:00"),
  });
  const apptSimon = await createAppointment({
    clinicId: clinic.id,
    petId: pet("Simón"),
    veterinarianId: vetAna.id,
    reason: "Control",
    startAt: atClinicTime(3, "09:00"),
    endAt: atClinicTime(3, "09:30"),
    source: "WHATSAPP",
  });
  await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: apptSimon.id, status: "CONFIRMED", changedById: receptionist.id });

  await createAppointment({
    clinicId: clinic.id,
    petId: pet("Toby"),
    veterinarianId: vetMartin.id,
    reason: "Consulta por dermatitis",
    startAt: atClinicTime(5, "16:00"),
    endAt: atClinicTime(5, "16:30"),
    source: "WHATSAPP",
  });

  await createAppointment({
    clinicId: clinic.id,
    petId: pet("Nala"),
    veterinarianId: vetAna.id,
    reason: "Vacunación triple felina",
    startAt: atClinicTime(10, "11:30"),
    endAt: atClinicTime(10, "12:00"),
    source: "CRM",
    createdById: receptionist.id,
  });

  const apptCoco = await createAppointment({
    clinicId: clinic.id,
    petId: pet("Coco"),
    veterinarianId: vetMartin.id,
    reason: "Vacunación antiparasitaria",
    startAt: atClinicTime(-2, "10:30"),
    endAt: atClinicTime(-2, "11:00"),
    source: "CRM",
    createdById: owner.id,
  });
  await updateAppointmentStatus({ clinicId: clinic.id, appointmentId: apptCoco.id, status: "ATTENDED", changedById: vetMartin.id });
  await createMedicalRecord({
    clinicId: clinic.id,
    petId: pet("Coco"),
    userId: vetMartin.id,
    appointmentId: apptCoco.id,
    type: "VACCINE",
    reason: "Vacunación antiparasitaria",
    treatment: "Aplicación de antiparasitario de amplio espectro",
    weight: 12.3,
    nextDueDate: atClinicTime(180, "10:00"),
  });

  // Mora: cliente con remindersEnabled=false. El turno y su recordatorio se crean igual;
  // el motor de recordatorios lo cancelará al procesarlo, sin enviar nada.
  await createAppointment({
    clinicId: clinic.id,
    petId: pet("Mora"),
    veterinarianId: vetAna.id,
    reason: "Control anual",
    startAt: atClinicTime(7, "12:00"),
    endAt: atClinicTime(7, "12:30"),
    source: "CRM",
    createdById: owner.id,
  });

  // Conversaciones de WhatsApp: una automatizada en curso y una derivada a una persona.
  const maria = client("María González");
  const conv1 = await prisma.whatsappConversation.create({
    data: { clinicId: clinic.id, clientId: maria.id, petId: pet("Toby"), phone: maria.phone, contactName: maria.name, status: "AUTOMATED", unreadCount: 0 },
  });
  await prisma.whatsappMessage.createMany({
    data: [
      { clinicId: clinic.id, conversationId: conv1.id, direction: "INBOUND", content: "turno", status: "RECEIVED", createdAt: atClinicTime(-1, "09:00") },
      {
        clinicId: clinic.id,
        conversationId: conv1.id,
        direction: "OUTBOUND",
        content: "¿Para cuál mascota?\n\n1. Lola\n2. Toby\n3. Nueva mascota",
        status: "QUEUED",
        createdAt: atClinicTime(-1, "09:00"),
      },
    ],
  });

  const camila = client("Camila Fernández");
  const conv2 = await prisma.whatsappConversation.create({
    data: { clinicId: clinic.id, clientId: camila.id, petId: pet("Nala"), phone: camila.phone, contactName: camila.name, status: "REQUIRES_HUMAN", unreadCount: 1 },
  });
  await prisma.whatsappMessage.createMany({
    data: [
      { clinicId: clinic.id, conversationId: conv2.id, direction: "INBOUND", content: "Hola, mi gata Nala está vomitando desde ayer", status: "RECEIVED", createdAt: atClinicTime(0, "08:30") },
      {
        clinicId: clinic.id,
        conversationId: conv2.id,
        direction: "OUTBOUND",
        content: "Voy a derivar tu consulta a la veterinaria. Si es una emergencia, acudí de inmediato a una guardia veterinaria.",
        status: "QUEUED",
        createdAt: atClinicTime(0, "08:31"),
      },
    ],
  });

  console.log("Datos de ejemplo cargados sobre: Veterinaria Patitas / patitas-demo");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
