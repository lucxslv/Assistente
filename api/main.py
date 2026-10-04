"""Aplicação FastAPI Principal do Charlie."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db import close_db_pool, init_db_pool
from api.routes import auth, chat, messages, settings, system, threads, tools, agent, admin, pair

logger = logging.getLogger("charlie.api")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Inicializando Charlie Modular API Server...")
    # Inicializa pool com PostgreSQL / Supabase
    try:
        await init_db_pool()
    except Exception as e:
        logger.error(f"Aviso: Não foi possível conectar ao banco de dados: {e}")

    # Inicializa pipeline de IA
    try:
        chat.get_pipeline()
    except Exception as e:
        logger.error(f"Aviso: Não foi possível pré-carregar o pipeline no lifespan: {e}")

    yield

    await close_db_pool()
    logger.info("Charlie Modular API Server finalizado.")


app = FastAPI(
    title="Charlie API",
    version="2.0.0",
    description="API Modular e Reativa do Assistente Charlie",
    lifespan=lifespan,
)

# CORS seguro e restrito para desktop Tauri, localhost e domínios oficiais na Vercel
ALLOWED_ORIGINS = [
    # Web Dev & Vite / React
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8005",
    "http://127.0.0.1:8005",
    # Mobile Dev (Expo / React Native)
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    # Tauri Desktop Local Schemes
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
    # Ambientes de Produção Oficiais
    "https://web-charlie.vercel.app",
    "https://assistente-xi.vercel.app",
]

ALLOWED_ORIGIN_REGEX = r"^https:\/\/(?:assistente-[a-zA-Z0-9_-]+|web-charlie-[a-zA-Z0-9_-]+)\.vercel\.app$|^tauri:\/\/localhost$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)

# Registro Modular de Rotas
app.include_router(auth.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(threads.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(agent.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(pair.router, prefix="/api")


@app.get("/")
async def root():
    """Rota raiz da API do Charlie Cloud Brain."""
    return {
        "status": "online",
        "service": "Charlie Cloud Brain API",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/health")
@app.get("/api/health")
async def health_check():
    """Healthcheck rápido e diagnóstico."""
    from api.db import get_or_init_db_pool, get_last_db_error
    pool = await get_or_init_db_pool()
    return {
        "status": "ok",
        "service": "charlie-api",
        "version": "2.0.0",
        "database_connected": pool is not None,
        "database_error": get_last_db_error(),
    }


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.getenv("PORT", "8005"))
    host = os.getenv("HOST", "0.0.0.0" if os.getenv("PORT") else "127.0.0.1")
    reload = os.getenv("ENV") != "production" and not os.getenv("PORT")
    uvicorn.run("api.main:app", host=host, port=port, reload=reload)
