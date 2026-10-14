# ClipGringa

Cortes virais com IA: transforma vídeos longos em cortes verticais (9:16) com legenda
sincronizada, rosto centralizado e nota de potencial viral.

- **Publicar em produção:** veja [DEPLOY.md](DEPLOY.md).
- **Rodar no seu computador:** `cp .env.example .env`, preencha as chaves e rode
  `docker compose up -d --build`. Acesse `http://localhost:3107`.
- **Arquitetura e comandos de desenvolvimento:** veja [CLAUDE.md](CLAUDE.md).

Obrigatório no `.env`: uma chave de transcrição (`ASSEMBLY_AI_API_KEY`) e uma chave de IA
(`GOOGLE_API_KEY`, `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY`) com `LLM=` apontando para o mesmo provedor.

## Licença
AGPL-3.0, derivado do projeto SupoClip. Veja [LICENSE](LICENSE) e [NOTICE.md](NOTICE.md).
