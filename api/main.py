"""Aplicação FastAPI Principal do Charlie."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db import close_db_pool, init_db_pool
from api.routes import chat, messages, settings, system, threads, tools

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
    chat.get_pipeline()

    yield

    await close_db_pool()
    logger.info("Charlie Modular API Server finalizado.")


app = FastAPI(
    title="Charlie API",
    version="2.0.0",
    description="API Modular e Reativa do Assistente Charlie",
    lifespan=lifespan,
)

# CORS irrestrito para desktop Tauri e navegadores locais
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registro Modular de Rotas
app.include_router(chat.router, prefix="/api")
app.include_router(threads.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.get("/api/health")
async def health_check():
    """Healthcheck rápido e diagnóstico."""
    from api.db import get_db_pool
    pool = get_db_pool()
    return {
        "status": "ok",
        "service": "charlie-api",
        "version": "2.0.0",
        "database_connected": pool is not None,
    }


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.getenv("PORT", "8005"))
    host = os.getenv("HOST", "0.0.0.0" if os.getenv("PORT") else "127.0.0.1")
    reload = os.getenv("ENV") != "production" and not os.getenv("PORT")
    uvicorn.run("api.main:app", host=host, port=port, reload=reload)
