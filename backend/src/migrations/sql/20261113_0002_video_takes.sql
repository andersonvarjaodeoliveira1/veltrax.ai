-- Takes gerados a partir de um vídeo final: cada take é um corte com headline,
-- pronto para entrar no agendador de posts das páginas.
CREATE TABLE IF NOT EXISTS video_takes (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    final_video_id VARCHAR(36) NOT NULL REFERENCES final_videos(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL DEFAULT 0,
    path TEXT NOT NULL,
    hook_title VARCHAR(200),
    text TEXT,
    start_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    end_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_video_takes_final ON video_takes (final_video_id, idx);
CREATE INDEX IF NOT EXISTS idx_video_takes_user ON video_takes (user_id, created_at DESC);
