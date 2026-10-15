# Use Python 3.11 slim image
FROM python:3.11-slim

# Install system dependencies including ffmpeg and unzip (for deno).
# Noto provides fallback glyphs for multilingual captions (including Hindi)
# and colour emoji. libass/fontconfig selects them when a chosen font lacks glyphs.
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    unzip \
    fonts-noto-core \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    fontconfig \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# Install deno (required by yt-dlp for YouTube JS challenge solving)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_DIR=/root/.deno
ENV PATH="/root/.deno/bin:${PATH}"

# Install uv package manager
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy pyproject.toml and uv.lock for dependency installation
COPY pyproject.toml uv.lock* ./

# New self-hosted setups can select CPU wheels without changing legacy builds.
ARG BACKEND_CPU_ONLY=false
RUN uv venv .venv && \
    if [ "$BACKEND_CPU_ONLY" = "true" ]; then \
      uv sync --frozen --extra cpu; \
    else \
      uv sync --frozen --extra cuda; \
    fi

# Force update yt-dlp to the absolute latest version to handle YouTube API changes
# Also install from git to get the very latest commits
RUN uv pip install --upgrade --force-reinstall yt-dlp
RUN uv pip install --upgrade --force-reinstall "yt-dlp[default]"

# Copy source code
COPY src/ ./src/

# Code protection: ship compiled bytecode only (no readable .py sources) so
# anyone who pulls or opens the image cannot simply read the application code.
ARG STRIP_SOURCE=true
RUN if [ "$STRIP_SOURCE" = "true" ]; then \
      .venv/bin/python -m compileall -b -q -j 0 src && \
      find src -name "*.py" -type f -delete && \
      find src -name "__pycache__" -type d -prune -exec rm -rf {} + ; \
    fi

# Copy fonts and transitions directories
COPY fonts/ ./fonts/
COPY transitions/ ./transitions/

# Create necessary directories for video processing
RUN mkdir -p /app/uploads /app/clips /app/logs /tmp

# Expose the port FastAPI will run on
EXPOSE 8000

# Activate virtual environment and start the application
CMD [".venv/bin/uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
