-- Entrada por link de e-mail: quando uma conta com e-mail "não confirmado" entra pelo link, a senha antiga é apagada
-- (proteção contra alguém ter criado a conta com o e-mail de outra pessoa). As contas que já existiam foram criadas
-- pelo administrador ou por convite e já são usadas pelos donos, então contam como confirmadas: quem usar o link
-- continua com a senha (e com o desbloqueio do Admin). Contas criadas pela captura pública ficam como estão.
UPDATE users u SET "emailVerified" = TRUE
WHERE u."emailVerified" = FALSE
  AND NOT EXISTS (SELECT 1 FROM signup_requests r WHERE r.user_id = u.id)
