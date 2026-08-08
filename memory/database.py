"""Banco de Dados SQLite para Persistência de Memória do Assistente."""

import sqlite3
import logging
from typing import Any

logger = logging.getLogger(__name__)

class MemoryDatabase:
    """Singleton para gerenciar a conexão e operações no banco de dados SQLite."""
    
    _instance = None

    def __new__(cls, db_path: str = "charlie_memory.db"):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.db_path = db_path
            cls._instance._init_db()
        return cls._instance

    def _init_db(self):
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                # Tabela de Preferências (Chave-Valor)
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS preferences (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )
                ''')
                # Tabela de Fatos de Longo Prazo
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS facts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        fact TEXT NOT NULL UNIQUE
                    )
                ''')
                conn.commit()
        except Exception as e:
            logger.exception("Erro ao inicializar o banco de dados de memória: %s", e)

    def set_preference(self, key: str, value: str) -> None:
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (key, value)
                )
                conn.commit()
        except Exception as e:
            logger.error("Erro ao salvar preferência: %s", e)

    def get_all_preferences(self) -> dict[str, str]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT key, value FROM preferences")
                return {row[0]: row[1] for row in cursor.fetchall()}
        except Exception as e:
            logger.error("Erro ao buscar preferências: %s", e)
            return {}

    def add_fact(self, fact: str) -> None:
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("INSERT OR IGNORE INTO facts (fact) VALUES (?)", (fact,))
                conn.commit()
        except Exception as e:
            logger.error("Erro ao salvar fato: %s", e)

    def get_all_facts(self) -> list[str]:
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT fact FROM facts")
                return [row[0] for row in cursor.fetchall()]
        except Exception as e:
            logger.error("Erro ao buscar fatos: %s", e)
            return []

# Instância global do BD
db = MemoryDatabase()
