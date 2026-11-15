-- Rampa rápida: 1 post no primeiro dia, 2 no segundo, depois o ritmo da página
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS ramp_fast BOOLEAN NOT NULL DEFAULT FALSE
