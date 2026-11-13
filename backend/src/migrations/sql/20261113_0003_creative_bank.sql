-- ClipSpy: biblioteca de criativos vencedores minerados por APIs oficiais.
-- Meta Ad Library na Fase 1, e YouTube ou TikTok nas fases seguintes.
CREATE TABLE IF NOT EXISTS creative_bank (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    source TEXT NOT NULL,                 -- meta_adlib | youtube | tiktok
    external_id TEXT NOT NULL,            -- id do anúncio/vídeo na fonte
    advertiser TEXT,                      -- page_name / channelTitle
    title TEXT,
    permalink TEXT,                       -- ad_snapshot_url / link do vídeo
    thumbnail TEXT,
    metrics TEXT,                         -- JSON: {views,likes,comments,shares,run_days}
    score DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_champion BOOLEAN NOT NULL DEFAULT FALSE,
    term TEXT,                            -- termo de busca que o trouxe
    status TEXT NOT NULL DEFAULT 'novo',  -- novo | salvo | usado | arquivado
    discovered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_creative_bank_user ON creative_bank (user_id, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_creative_bank_champ ON creative_bank (user_id, is_champion, score DESC);
