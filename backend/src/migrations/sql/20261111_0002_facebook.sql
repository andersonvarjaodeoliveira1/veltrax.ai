-- Módulo Facebook (em construção, só administradores): contas dos navegadores antidetect,
-- páginas, posts agendados (cortes do ClipGringa), diário e tarefas manuais. Tudo por usuário.
CREATE TABLE IF NOT EXISTS fb_accounts (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL DEFAULT 'manual',
    external_id VARCHAR(80) NOT NULL DEFAULT '',
    name VARCHAR(160) NOT NULL,
    proxy VARCHAR(200) NOT NULL DEFAULT '',
    email VARCHAR(200) NOT NULL DEFAULT '',
    account_created_on DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ativa',
    status_reason VARCHAR(300) NOT NULL DEFAULT '',
    status_changed_at TIMESTAMP WITH TIME ZONE,
    notes VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_accounts_external ON fb_accounts (user_id, provider, external_id) WHERE external_id <> '';
CREATE INDEX IF NOT EXISTS idx_fb_accounts_user ON fb_accounts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fb_pages (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id VARCHAR(36) REFERENCES fb_accounts(id) ON DELETE SET NULL,
    name VARCHAR(160) NOT NULL,
    link VARCHAR(400) NOT NULL DEFAULT '',
    niche VARCHAR(80) NOT NULL DEFAULT '',
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    status VARCHAR(20) NOT NULL DEFAULT 'ativa',
    has_photo BOOLEAN NOT NULL DEFAULT false,
    has_cover BOOLEAN NOT NULL DEFAULT false,
    posts_per_day INTEGER NOT NULL DEFAULT 3 CHECK (posts_per_day BETWEEN 1 AND 4),
    meta_page_id VARCHAR(40),
    meta_token_enc TEXT,
    meta_connected_at TIMESTAMP WITH TIME ZONE,
    meta_error VARCHAR(300),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fb_pages_user ON fb_pages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_pages_account ON fb_pages (account_id);

CREATE TABLE IF NOT EXISTS fb_posts (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_id VARCHAR(36) NOT NULL REFERENCES fb_pages(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL DEFAULT 'video',
    task_id VARCHAR(36),
    clip_id VARCHAR(36),
    file_path VARCHAR(500),
    title VARCHAR(200) NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    fb_post_id VARCHAR(80),
    error VARCHAR(300),
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fb_posts_page ON fb_posts (page_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_fb_posts_due ON fb_posts (status, scheduled_at) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_fb_posts_clip ON fb_posts (user_id, clip_id);

CREATE TABLE IF NOT EXISTS fb_events (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_id VARCHAR(36) REFERENCES fb_pages(id) ON DELETE CASCADE,
    account_id VARCHAR(36) REFERENCES fb_accounts(id) ON DELETE CASCADE,
    actor VARCHAR(10) NOT NULL DEFAULT 'app',
    text VARCHAR(400) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fb_events_page ON fb_events (page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_events_user ON fb_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fb_todos (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_id VARCHAR(36) NOT NULL REFERENCES fb_pages(id) ON DELETE CASCADE,
    text VARCHAR(400) NOT NULL,
    done_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fb_todos_page ON fb_todos (page_id, created_at);
