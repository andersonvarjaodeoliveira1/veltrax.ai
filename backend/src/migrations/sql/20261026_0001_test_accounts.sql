ALTER TABLE users ADD COLUMN IF NOT EXISTS test_expires_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_users_test_expires ON users (test_expires_at) WHERE test_expires_at IS NOT NULL
