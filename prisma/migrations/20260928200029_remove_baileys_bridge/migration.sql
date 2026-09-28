-- WhatsApp pasa a ser solo por la API oficial (Zernio): se elimina el bridge de Baileys.
DROP INDEX IF EXISTS "Clinic_whatsappSessionKey_key";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "whatsappSessionKey",
DROP COLUMN IF EXISTS "whatsappBridgeUrl";
