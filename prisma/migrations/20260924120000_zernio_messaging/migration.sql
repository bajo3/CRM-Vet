-- AlterTable
ALTER TABLE "WhatsappConversation" ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "zernioConversationId" TEXT;

-- AlterTable: columnas de un plan descartado (Meta Cloud API directa), nunca usadas.
ALTER TABLE "Clinic" DROP COLUMN "whatsappPhoneNumberId",
DROP COLUMN "whatsappBusinessAccountId";
