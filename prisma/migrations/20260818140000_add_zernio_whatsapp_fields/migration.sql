-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "zernioProfileId" TEXT,
ADD COLUMN     "zernioAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_zernioProfileId_key" ON "Clinic"("zernioProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_zernioAccountId_key" ON "Clinic"("zernioAccountId");
