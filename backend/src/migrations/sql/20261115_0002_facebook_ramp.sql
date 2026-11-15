-- Começar devagar: dia em que a rampa da página começou (1 post por dia, depois 2, depois o ritmo da página)
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS ramp_start DATE;
-- Horário dos posts: vazio espalha pelo dia, 'noite' concentra no fim do dia
ALTER TABLE fb_pages ADD COLUMN IF NOT EXISTS post_window VARCHAR(10) NOT NULL DEFAULT ''
