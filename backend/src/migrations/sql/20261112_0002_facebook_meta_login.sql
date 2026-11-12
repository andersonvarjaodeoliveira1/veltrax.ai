-- Entrar com o Facebook: um acesso de longa duração por perfil do Facebook (criptografado).
-- Cada login mapeia sozinho o perfil (conta) e todas as páginas dele.
CREATE TABLE IF NOT EXISTS fb_meta_auth (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fb_user_id VARCHAR(40) NOT NULL,
    fb_user_name VARCHAR(160) NOT NULL DEFAULT '',
    account_id VARCHAR(36) REFERENCES fb_accounts(id) ON DELETE SET NULL,
    token_enc TEXT NOT NULL,
    connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_meta_auth_profile ON fb_meta_auth (user_id, fb_user_id);
-- Números lidos do Facebook (posts normais, vídeos, programados e seguidores)
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS fb_followers INTEGER;
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS fb_posts_normal INTEGER;
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS fb_posts_video INTEGER;
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS fb_scheduled INTEGER;
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS fb_synced_at TIMESTAMP WITH TIME ZONE
