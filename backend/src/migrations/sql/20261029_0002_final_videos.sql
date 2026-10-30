CREATE TABLE IF NOT EXISTS final_videos (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processing',
    step VARCHAR(120) NOT NULL DEFAULT '',
    error TEXT,
    warning TEXT,
    options TEXT NOT NULL DEFAULT '{}',
    path TEXT,
    duration DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_final_videos_user ON final_videos (user_id, created_at DESC);
