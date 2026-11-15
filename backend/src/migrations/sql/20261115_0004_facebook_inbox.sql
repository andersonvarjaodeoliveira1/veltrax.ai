-- Resposta automática na caixa de mensagens da página (webhook de mensagens da Meta)
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS inbox_on BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS inbox_reply TEXT NOT NULL DEFAULT '';
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS inbox_error VARCHAR(300);
CREATE TABLE IF NOT EXISTS fb_inbox (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_id VARCHAR(36) NOT NULL REFERENCES fb_pages(id) ON DELETE CASCADE,
    psid VARCHAR(60) NOT NULL,
    mid VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL DEFAULT '',
    keyword VARCHAR(30) NOT NULL DEFAULT '',
    reply_status VARCHAR(14) NOT NULL DEFAULT '',
    reply_error VARCHAR(300) NOT NULL DEFAULT '',
    received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    replied_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_inbox_mid ON fb_inbox (mid);
CREATE INDEX IF NOT EXISTS idx_fb_inbox_person ON fb_inbox (page_id, psid, received_at DESC)
