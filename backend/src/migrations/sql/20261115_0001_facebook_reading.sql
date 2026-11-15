-- Leitura da página: visualizações por vídeo lidas do Facebook, para achar o formato que se destacou
CREATE TABLE IF NOT EXISTS fb_video_stats (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_id VARCHAR(36) NOT NULL REFERENCES fb_pages(id) ON DELETE CASCADE,
    fb_video_id VARCHAR(80) NOT NULL,
    title VARCHAR(300) NOT NULL DEFAULT '',
    link VARCHAR(400) NOT NULL DEFAULT '',
    published_at TIMESTAMP WITH TIME ZONE,
    views INTEGER NOT NULL DEFAULT 0,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_video_stats ON fb_video_stats (page_id, fb_video_id);
-- Motivo quando o Facebook não entrega as visualizações (permissão que falta, por exemplo)
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS views_error VARCHAR(300);
-- Países que podem ver os posts da página (códigos de 2 letras separados por vírgula, vazio = todos)
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS countries VARCHAR(80) NOT NULL DEFAULT ''
