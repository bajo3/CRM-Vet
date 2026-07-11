CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'VETERINARIAN', 'RECEPTIONIST');
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "AppointmentSource" AS ENUM ('CRM', 'WHATSAPP');
CREATE TYPE "ConversationStatus" AS ENUM ('AUTOMATED', 'REQUIRES_HUMAN', 'HUMAN_ACTIVE', 'RESOLVED');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TABLE "Clinic" (
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "phone" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires', "openingHours" JSONB NOT NULL,
  "defaultAppointmentDuration" INTEGER NOT NULL DEFAULT 30, "whatsappSessionKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "email" TEXT NOT NULL);
CREATE TABLE "ClinicMember" (
  "id" TEXT PRIMARY KEY, "clinicId" TEXT NOT NULL, "userId" TEXT NOT NULL, "role" "Role" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ClinicMember_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClinicMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Client" (
  "id" TEXT PRIMARY KEY, "clinicId" TEXT NOT NULL, "name" TEXT NOT NULL, "phone" TEXT NOT NULL, "email" TEXT,
  "remindersEnabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Client_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Pet" (
  "id" TEXT PRIMARY KEY, "clinicId" TEXT NOT NULL, "clientId" TEXT NOT NULL, "name" TEXT NOT NULL, "species" TEXT NOT NULL,
  "breed" TEXT, "weight" DECIMAL(6,2), "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Pet_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Pet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Appointment" (
  "id" TEXT PRIMARY KEY, "clinicId" TEXT NOT NULL, "petId" TEXT NOT NULL, "veterinarianId" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL, "endAt" TIMESTAMP(3) NOT NULL, "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
  "source" "AppointmentSource" NOT NULL DEFAULT 'CRM', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Appointment_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Appointment_veterinarianId_fkey" FOREIGN KEY ("veterinarianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "WhatsappConversation" (
  "id" TEXT PRIMARY KEY, "clinicId" TEXT NOT NULL, "clientId" TEXT, "petId" TEXT, "phone" TEXT NOT NULL, "contactName" TEXT,
  "status" "ConversationStatus" NOT NULL DEFAULT 'AUTOMATED', "flowState" JSONB, "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsappConversation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsappConversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WhatsappConversation_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "WhatsappMessage" (
  "id" TEXT PRIMARY KEY, "clinicId" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "direction" "MessageDirection" NOT NULL,
  "content" TEXT NOT NULL, "externalMessageId" TEXT, "status" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsappMessage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsappMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "WebhookEvent" (
  "id" TEXT PRIMARY KEY, "clinicId" TEXT NOT NULL, "externalEventId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Clinic_whatsappSessionKey_key" ON "Clinic"("whatsappSessionKey");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "ClinicMember_clinicId_userId_key" ON "ClinicMember"("clinicId", "userId");
CREATE INDEX "ClinicMember_clinicId_role_active_idx" ON "ClinicMember"("clinicId", "role", "active");
CREATE UNIQUE INDEX "Client_clinicId_phone_key" ON "Client"("clinicId", "phone");
CREATE INDEX "Client_clinicId_name_idx" ON "Client"("clinicId", "name");
CREATE INDEX "Pet_clinicId_name_idx" ON "Pet"("clinicId", "name");
CREATE INDEX "Appointment_clinicId_veterinarianId_startAt_endAt_idx" ON "Appointment"("clinicId", "veterinarianId", "startAt", "endAt");
CREATE INDEX "Appointment_clinicId_petId_startAt_idx" ON "Appointment"("clinicId", "petId", "startAt");
CREATE UNIQUE INDEX "WhatsappConversation_clinicId_phone_key" ON "WhatsappConversation"("clinicId", "phone");
CREATE INDEX "WhatsappConversation_clinicId_status_lastMessageAt_idx" ON "WhatsappConversation"("clinicId", "status", "lastMessageAt");
CREATE UNIQUE INDEX "WhatsappMessage_clinicId_externalMessageId_key" ON "WhatsappMessage"("clinicId", "externalMessageId");
CREATE INDEX "WhatsappMessage_clinicId_conversationId_createdAt_idx" ON "WhatsappMessage"("clinicId", "conversationId", "createdAt");
CREATE UNIQUE INDEX "WebhookEvent_clinicId_externalEventId_key" ON "WebhookEvent"("clinicId", "externalEventId");
