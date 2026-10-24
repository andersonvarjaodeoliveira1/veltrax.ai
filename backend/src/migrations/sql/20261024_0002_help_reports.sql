CREATE TABLE IF NOT EXISTS help_reports (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36),
    kind VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(40),
    page VARCHAR(300),
    handled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_help_reports_created ON help_reports (created_at DESC);
