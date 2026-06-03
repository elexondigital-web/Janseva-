-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "failedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subject" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "fingerprintEnrolled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fingerprintTemplate" TEXT;

-- CreateIndex
CREATE INDEX "Attendance_eventId_idx" ON "Attendance"("eventId");

-- CreateIndex
CREATE INDEX "Attendance_personId_idx" ON "Attendance"("personId");

-- CreateIndex
CREATE INDEX "Attendance_markedAt_idx" ON "Attendance"("markedAt");

-- CreateIndex
CREATE INDEX "Message_blockId_idx" ON "Message"("blockId");

-- CreateIndex
CREATE INDEX "Message_sentAt_idx" ON "Message"("sentAt");

-- CreateIndex
CREATE INDEX "Message_type_idx" ON "Message"("type");

-- CreateIndex
CREATE INDEX "Person_status_idx" ON "Person"("status");

-- CreateIndex
CREATE INDEX "Person_gender_idx" ON "Person"("gender");

-- CreateIndex
CREATE INDEX "Person_category_idx" ON "Person"("category");

-- CreateIndex
CREATE INDEX "Person_createdAt_idx" ON "Person"("createdAt");
