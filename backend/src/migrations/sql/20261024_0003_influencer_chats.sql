CREATE TABLE IF NOT EXISTS influencer_chats (
    id VARCHAR(40) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(200) NOT NULL DEFAULT '',
    project VARCHAR(80),
    snap TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_influencer_chats_user ON influencer_chats (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_influencer_chats_deleted ON influencer_chats (deleted_at DESC) WHERE deleted_at IS NOT NULL;
