ALTER TABLE "notifications" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'NOTICE';
ALTER TABLE "notifications" ADD COLUMN "entity_id" TEXT;
