-- AntiGravity Fase 1: rótulo de beat (Hook, Retenção, CTA) por take.
-- Guarda a classificação da IA para ordenar e exibir o arco de retenção.
ALTER TABLE video_takes ADD COLUMN IF NOT EXISTS beat_role TEXT NOT NULL DEFAULT 'none';
