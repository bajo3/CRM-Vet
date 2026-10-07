-- Reserva online pública: origen del turno y slug público por clínica.
ALTER TYPE "AppointmentSource" ADD VALUE IF NOT EXISTS 'ONLINE';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "bookingSlug" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Clinic_bookingSlug_key" ON "Clinic"("bookingSlug");
