CREATE TABLE IF NOT EXISTS "multiplier_jobs" (
    "id" VARCHAR(36) NOT NULL PRIMARY KEY,
    "user_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'processing',
    "aspect" VARCHAR(8) NOT NULL DEFAULT '9:16',
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "outputs" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_multiplier_jobs_user_id" ON "multiplier_jobs" ("user_id", "created_at" DESC);
