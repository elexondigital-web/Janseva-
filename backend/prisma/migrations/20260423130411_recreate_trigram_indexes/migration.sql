-- CreateIndex
CREATE INDEX "Person_fullName_trgm_idx" ON "Person" USING GIN ("fullName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Person_phone_trgm_idx" ON "Person" USING GIN ("phone" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Person_address_trgm_idx" ON "Person" USING GIN ("address" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Person_aadhaarNumber_trgm_idx" ON "Person" USING GIN ("aadhaarNumber" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Person_voterId_trgm_idx" ON "Person" USING GIN ("voterId" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Person_uniqueId_trgm_idx" ON "Person" USING GIN ("uniqueId" gin_trgm_ops);
