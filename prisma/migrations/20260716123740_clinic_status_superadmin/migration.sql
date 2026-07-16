-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "status" "ClinicStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "statusReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Las clínicas que ya existían (creadas por seed/scripts antes de que existiera el registro
-- público) deben quedar operativas: sólo las que se den de alta desde /registro a partir de ahora
-- arrancan PENDING.
UPDATE "Clinic" SET "status" = 'APPROVED';
