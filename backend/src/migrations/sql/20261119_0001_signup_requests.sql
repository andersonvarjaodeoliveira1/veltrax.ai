-- Captura do cadastro: a pessoa informa nome, e-mail, CPF e telefone e cria a conta,
-- mas só entra depois que o administrador libera (status 'pending' -> 'approved').
CREATE TABLE IF NOT EXISTS signup_requests (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    cpf VARCHAR(11) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_signup_requests_cpf ON signup_requests (cpf);
CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON signup_requests (status, created_at DESC)
