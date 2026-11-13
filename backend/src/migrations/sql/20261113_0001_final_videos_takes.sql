-- Guarda, no vídeo final, o que o planejador de takes precisa de entrada:
-- as bordas de cada cena do Flow (no tempo do vídeo já montado) e a transcrição.
ALTER TABLE final_videos ADD COLUMN IF NOT EXISTS scene_bounds TEXT;
ALTER TABLE final_videos ADD COLUMN IF NOT EXISTS transcript TEXT;
