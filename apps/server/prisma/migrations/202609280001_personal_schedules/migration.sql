CREATE TABLE "personal_schedules" (
  "owner_id" UUID NOT NULL,
  "id" VARCHAR(120) NOT NULL,
  "value" JSONB NOT NULL,
  CONSTRAINT "personal_schedules_pkey" PRIMARY KEY ("owner_id", "id")
);
ALTER TABLE "personal_schedules" ENABLE ROW LEVEL SECURITY;
