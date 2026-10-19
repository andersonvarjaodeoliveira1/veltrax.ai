# ClipGringa text-card renderer (BETA). Isolated service: HTML/CSS -> MP4 via
# HyperFrames (Apache-2.0, github.com/heygen-com/hyperframes).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates chromium ffmpeg libgbm1 libnss3 libatk-bridge2.0-0 libdrm2 \
    libxcomposite1 libxdamage1 libxrandr2 libcups2 libasound2 libpangocairo-1.0-0 \
    libxshmfence1 libgtk-3-0 fonts-liberation fonts-noto-color-emoji fonts-noto-core fonts-inter \
    && rm -rf /var/lib/apt/lists/*

ENV HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    HYPERFRAMES_NO_TELEMETRY=1 \
    DO_NOT_TRACK=1 \
    NODE_ENV=production

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs template.mjs ./

EXPOSE 8100
USER node
CMD ["node", "server.mjs"]
