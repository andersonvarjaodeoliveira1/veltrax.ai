-- De onde veio cada post: corte do ClipGringa, vídeo orgânico (com CTA) ou feito à mão no Facebook
ALTER TABLE fb_posts ADD COLUMN IF NOT EXISTS source VARCHAR(12) NOT NULL DEFAULT 'corte';
UPDATE fb_posts SET source = 'organico' WHERE source = 'corte' AND kind = 'video' AND task_id IS NULL AND clip_id IS NOT NULL
