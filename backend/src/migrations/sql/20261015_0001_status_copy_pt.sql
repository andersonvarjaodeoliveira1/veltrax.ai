UPDATE "service_statuses"
SET "headline" = 'Links do YouTube instáveis',
    "description" = 'Se o link falhar, baixe o vídeo e envie o arquivo.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'video-downloads';
