-- Mensagem privada para quem comenta a palavra-chave da oferta (resposta privada oficial da Página)
ALTER TABLE offers ADD COLUMN IF NOT EXISTS dm_message TEXT NOT NULL DEFAULT '';
ALTER TABLE fb_comments ADD COLUMN IF NOT EXISTS dm_status VARCHAR(12) NOT NULL DEFAULT '';
ALTER TABLE fb_comments ADD COLUMN IF NOT EXISTS dm_error VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE fb_comments ADD COLUMN IF NOT EXISTS dm_at TIMESTAMP WITH TIME ZONE
