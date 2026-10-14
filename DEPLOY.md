# Publicar o ClipGringa em um subdomínio

Resultado: `https://clipgringa.gringatools.com` (site) e
`https://api.clipgringa.gringatools.com` (API, usada nos uploads de vídeo), com HTTPS automático.
Se o domínio for outro, troque nos três lugares do `.env` (veja o passo 3).

## O que você precisa
- Um servidor Linux (VPS) com **4 GB de RAM ou mais**, Docker e Docker Compose instalados.
  O processamento de vídeo é pesado; com 2 GB costuma travar.
- Acesso ao DNS do domínio.
- Chaves: AssemblyAI, Gemini (ou Claude/OpenAI), e Stripe se for cobrar.

## Passo a passo

1. **DNS.** Crie dois registros **A** apontando para o IP do servidor:
   `clipgringa` e `api.clipgringa` (ambos para o mesmo IP).
   Se usar Cloudflare, deixe os dois em "somente DNS" (nuvem cinza) até o HTTPS funcionar.

2. **Envie o projeto** para o servidor (git clone do seu repositório ou `scp` do zip) e entre na pasta.

3. **Configure o `.env`:**
   ```bash
   cp .env.production.example .env
   nano .env
   ```
   Preencha os segredos com valores aleatórios (`openssl rand -hex 32` gera um):
   `BETTER_AUTH_SECRET`, `BACKEND_AUTH_SECRET`, `APP_SETTINGS_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`.
   Preencha as chaves de IA e `NEXT_PUBLIC_SOURCE_URL` (seu repositório público).
   Se o domínio não for `gringatools.com`, ajuste `APP_DOMAIN`, `API_DOMAIN`,
   `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_API_URL` e `CORS_ORIGINS`.

4. **Suba tudo:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d --build
   ```
   A primeira vez leva vários minutos. Depois, `docker compose ps` deve mostrar tudo como running/healthy.

5. **Teste:** abra o site, crie uma conta e processe um vídeo curto.

## Cobrança (Stripe)
Com `SELF_HOST=false`, o app cobra pelos planos Pro e Scale.
1. Crie dois preços mensais no Stripe e coloque os IDs em `STRIPE_PRO_PRICE_ID` e `STRIPE_SCALE_PRICE_ID`.
2. Crie um webhook apontando para `https://clipgringa.gringatools.com/api/billing/webhook`
   e coloque o segredo em `STRIPE_WEBHOOK_SECRET`.
3. Rode `docker compose ... up -d` de novo para aplicar.
Com `SELF_HOST=true` o app fica gratuito e sem limite de gerações.

## Manutenção
- Ver erros: `docker compose logs worker --tail 200` e `docker compose logs backend --tail 200`.
- Atualizar após mudar o código: repita o comando do passo 4.
- Backup: o banco fica no volume `postgres_data` e os vídeos em `uploads` e `clips`.
  Faça `docker compose exec postgres pg_dump -U clipgringa clipgringa > backup.sql` com frequência.
- Se o servidor não suportar vídeos longos, mantenha `MAX_VIDEO_DURATION` baixo (padrão 90 min).

## Licença
O projeto é AGPL-3.0. Mantenha o link "Código-fonte" no rodapé apontando para o repositório
público com o código atual do serviço. Veja `NOTICE.md`.
