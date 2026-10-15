CREATE TABLE IF NOT EXISTS "folders" (
    "id" VARCHAR(36) NOT NULL PRIMARY KEY,
    "user_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_folders_user_id" ON "folders" ("user_id");

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "folder_id" VARCHAR(36);

CREATE INDEX IF NOT EXISTS "idx_tasks_folder_id" ON "tasks" ("folder_id");
