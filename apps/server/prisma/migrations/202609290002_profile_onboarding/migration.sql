ALTER TABLE "profiles" ADD COLUMN "parts" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "profiles" ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ(3);
