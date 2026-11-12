-- Entrar com o Facebook: acesso de longa duração da pessoa (criptografado), para listar e conectar as páginas dela
CREATE TABLE IF NOT EXISTS fb_meta_auth (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    fb_user_id VARCHAR(40) NOT NULL DEFAULT '',
    fb_user_name VARCHAR(160) NOT NULL DEFAULT '',
    token_enc TEXT NOT NULL,
    connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
)
