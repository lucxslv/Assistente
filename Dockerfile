# Multi-stage Dockerfile para o Charlie Cloud Brain
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Cache de dependências Python
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# Copia código da aplicação
COPY . .

# Instalação do projeto no venv
RUN uv sync --frozen --no-dev

# Estágio final de execução enxuto
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    PORT=8005

WORKDIR /app

# Instala libpq e dependências do sistema necessárias para networking e SSL
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copia build da aplicação e venv
COPY --from=builder /app /app

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8005}/api/health || exit 1

# Inicializa o Uvicorn na porta dinâmica informada pela nuvem
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8005}"]
