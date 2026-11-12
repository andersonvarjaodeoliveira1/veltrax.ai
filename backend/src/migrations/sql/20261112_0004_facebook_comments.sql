-- Comentários nos posts das páginas conectadas: quem comentou, em qual página e, pela palavra-chave, de qual produto (oferta)
CREATE TABLE IF NOT EXISTS fb_comments (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_id VARCHAR(36) NOT NULL REFERENCES fb_pages(id) ON DELETE CASCADE,
    fb_comment_id VARCHAR(80) NOT NULL,
    fb_post_id VARCHAR(80) NOT NULL DEFAULT '',
    from_id VARCHAR(40) NOT NULL DEFAULT '',
    from_name VARCHAR(160) NOT NULL DEFAULT '',
    message VARCHAR(1000) NOT NULL DEFAULT '',
    keyword VARCHAR(30) NOT NULL DEFAULT '',
    product VARCHAR(200) NOT NULL DEFAULT '',
    commented_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_comments_fb ON fb_comments (fb_comment_id);
CREATE INDEX IF NOT EXISTS idx_fb_comments_user ON fb_comments (user_id, commented_at DESC)
