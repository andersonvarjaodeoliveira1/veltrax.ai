-- Ideias de temas de cada página (geradas pela IA) e a variação do passo a passo sugerido
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS ideas JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS plan_seed INTEGER NOT NULL DEFAULT 0
