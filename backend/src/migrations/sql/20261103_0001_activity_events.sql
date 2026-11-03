CREATE TABLE IF NOT EXISTS activity_events (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(36),
    kind VARCHAR(40) NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activity_events_created ON activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_user ON activity_events (user_id, created_at DESC)
