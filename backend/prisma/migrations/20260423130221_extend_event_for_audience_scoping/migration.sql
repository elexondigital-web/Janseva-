-- DropIndex
DROP INDEX "Person_aadhaarNumber_trgm_idx";

-- DropIndex
DROP INDEX "Person_address_trgm_idx";

-- DropIndex
DROP INDEX "Person_fullName_trgm_idx";

-- DropIndex
DROP INDEX "Person_phone_trgm_idx";

-- DropIndex
DROP INDEX "Person_uniqueId_trgm_idx";

-- DropIndex
DROP INDEX "Person_voterId_trgm_idx";

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "boothId" TEXT,
ADD COLUMN     "targetLevel" "TargetLevel" NOT NULL DEFAULT 'BLOCK',
ADD COLUMN     "wardId" TEXT;

-- CreateIndex
CREATE INDEX "Event_blockId_idx" ON "Event"("blockId");

-- CreateIndex
CREATE INDEX "Event_wardId_idx" ON "Event"("wardId");

-- CreateIndex
CREATE INDEX "Event_boothId_idx" ON "Event"("boothId");

-- CreateIndex
CREATE INDEX "Event_date_idx" ON "Event"("date");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_boothId_fkey" FOREIGN KEY ("boothId") REFERENCES "Booth"("id") ON DELETE SET NULL ON UPDATE CASCADE;
