-- Enable trigram extension for fuzzy full-text search on Person
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for fast ILIKE + similarity() on Person search fields
CREATE INDEX "Person_fullName_trgm_idx"      ON "Person" USING gin ("fullName" gin_trgm_ops);
CREATE INDEX "Person_phone_trgm_idx"         ON "Person" USING gin ("phone" gin_trgm_ops);
CREATE INDEX "Person_address_trgm_idx"       ON "Person" USING gin ("address" gin_trgm_ops);
CREATE INDEX "Person_aadhaarNumber_trgm_idx" ON "Person" USING gin ("aadhaarNumber" gin_trgm_ops);
CREATE INDEX "Person_voterId_trgm_idx"       ON "Person" USING gin ("voterId" gin_trgm_ops);
CREATE INDEX "Person_uniqueId_trgm_idx"      ON "Person" USING gin ("uniqueId" gin_trgm_ops);
