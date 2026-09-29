CREATE TABLE "personal_documents" (
  "owner_id" UUID NOT NULL,
  "key" VARCHAR(240) NOT NULL,
  "value" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "personal_documents_pkey" PRIMARY KEY ("owner_id", "key")
);
ALTER TABLE "personal_documents" ENABLE ROW LEVEL SECURITY;
