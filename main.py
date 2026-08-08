"""Ponto de entrada — loop principal da assistente."""

import asyncio
import logging
import sys

from config import config
from core.engine import AssistantEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    engine = AssistantEngine()
    logger.info("Iniciando %s (provider: %s)", config.assistant_name, config.llm_provider)

    try:
        await engine.run()
    except KeyboardInterrupt:
        logger.info("Encerrando assistente...")
    finally:
        await engine.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
