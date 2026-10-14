-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'SALE_VOID', 'USAGE', 'ADJUSTMENT');
-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'ACCOUNT';
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "chargeWaivedAt" TIMESTAMP(3),
ADD COLUMN     "chargedSaleId" TEXT;
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "cost" DECIMAL(12,2);
-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "stockDeducted" BOOLEAN NOT NULL DEFAULT true;
-- CreateTable
CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lotNumber" TEXT,
    "expiresAt" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lotId" TEXT,
    "unitCost" DECIMAL(12,2),
    "supplier" TEXT,
    "note" TEXT,
    "saleId" TEXT,
    "medicalRecordId" TEXT,
    "petId" TEXT,
    "userId" TEXT,
    "chargedSaleId" TEXT,
    "chargeWaived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ClientPayment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientPayment_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "StockLot_clinicId_productId_expiresAt_idx" ON "StockLot"("clinicId", "productId", "expiresAt");
-- CreateIndex
CREATE INDEX "StockMovement_clinicId_productId_createdAt_idx" ON "StockMovement"("clinicId", "productId", "createdAt");
-- CreateIndex
CREATE INDEX "StockMovement_clinicId_type_chargedSaleId_idx" ON "StockMovement"("clinicId", "type", "chargedSaleId");
-- CreateIndex
CREATE INDEX "ClientPayment_clinicId_clientId_createdAt_idx" ON "ClientPayment"("clinicId", "clientId", "createdAt");
-- CreateIndex
CREATE INDEX "ClientPayment_clinicId_createdAt_idx" ON "ClientPayment"("clinicId", "createdAt");
-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_chargedSaleId_fkey" FOREIGN KEY ("chargedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_chargedSaleId_fkey" FOREIGN KEY ("chargedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El stock que ya existía queda como movimiento inicial, para que el historial cierre con el total.
INSERT INTO "StockMovement" ("id", "clinicId", "productId", "type", "quantity", "note", "createdAt")
SELECT gen_random_uuid()::text, "clinicId", "id", 'ADJUSTMENT', "stock", 'Stock inicial', CURRENT_TIMESTAMP
FROM "Product" WHERE "trackStock" = true AND "stock" > 0;

-- Los turnos atendidos antes de que existiera el cobro desde la agenda no se reclaman como pendientes.
UPDATE "Appointment" SET "chargeWaivedAt" = CURRENT_TIMESTAMP WHERE "status" = 'ATTENDED';
