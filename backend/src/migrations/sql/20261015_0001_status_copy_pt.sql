UPDATE "service_statuses"
SET "headline" = 'Links do YouTube instáveis',
    "description" = 'Alguns links do YouTube podem falhar. Se der erro, baixe o vídeo e envie o arquivo.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'video-downloads';
