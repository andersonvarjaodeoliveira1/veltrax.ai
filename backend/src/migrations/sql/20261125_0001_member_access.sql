-- Acesso do assinante da Gringatools (ferramenta bônus).
-- Uma linha por e-mail que entrou pelo caminho "sou assinante": guarda a última conferência com a base da Gringatools.
-- Conta convidada pelo administrador ou liberada pela captura não tem linha aqui e continua entrando como sempre.
CREATE TABLE IF NOT EXISTS member_access (
    email VARCHAR(255) PRIMARY KEY,
    active BOOLEAN NOT NULL,
    reason VARCHAR(40),
    member_name VARCHAR(120),
    expires_on DATE,
    -- O administrador decidiu manter o acesso desta pessoa mesmo sem assinatura ativa.
    exempt BOOLEAN NOT NULL DEFAULT FALSE,
    checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lost_at TIMESTAMP WITH TIME ZONE
)
