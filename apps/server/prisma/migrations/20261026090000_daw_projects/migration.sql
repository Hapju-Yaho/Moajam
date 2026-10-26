CREATE TABLE "daw_projects" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "song_id" VARCHAR(160) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "data" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "legacy_key" VARCHAR(240),
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "daw_projects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daw_projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "daw_projects_workspace_id_legacy_key_key" ON "daw_projects"("workspace_id", "legacy_key");
CREATE INDEX "daw_projects_workspace_id_song_id_deleted_at_idx" ON "daw_projects"("workspace_id", "song_id", "deleted_at");
