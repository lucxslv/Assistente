"""
Charlie Agentic Runtime 1.2 — Persistência SQLite
Gerencia o armazenamento persistente de sessões, grafos de tarefas, evidências e métricas.
"""

import json
import os
import sqlite3
from typing import Any, Dict, List, Optional
from datetime import datetime


class AgentPersistence:
    def __init__(self, db_path: Optional[str] = None):
        if not db_path:
            # Pasta data/ na raiz do projeto ou diretório local
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
            os.makedirs(base_dir, exist_ok=True)
            db_path = os.path.join(base_dir, "agent_runtime.db")

        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_sessions (
                    id TEXT PRIMARY KEY,
                    goal TEXT NOT NULL,
                    project TEXT NOT NULL DEFAULT 'Charlie',
                    status TEXT NOT NULL,
                    progress INTEGER DEFAULT 0,
                    summary TEXT,
                    tasks_count INTEGER DEFAULT 0,
                    completed_count INTEGER DEFAULT 0,
                    failed_count INTEGER DEFAULT 0,
                    started_at TEXT,
                    updated_at TEXT,
                    completed_at TEXT,
                    payload_json TEXT
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON agent_sessions (started_at DESC)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_status ON agent_sessions (status)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_project ON agent_sessions (project)"
            )
            conn.commit()

    def save_session(self, session_data: Dict[str, Any]) -> None:
        session_id = session_data.get("id")
        if not session_id:
            return

        goal = session_data.get("goal", "")
        project = session_data.get("project", "Charlie")
        status = session_data.get("status", "running")
        progress = int(session_data.get("progress", 0))
        summary = session_data.get("summary")
        started_at = session_data.get("startedAt") or session_data.get("started_at")
        updated_at = session_data.get("updatedAt") or session_data.get("updated_at") or datetime.utcnow().isoformat()
        completed_at = None
        if status in ("completed", "failed"):
            completed_at = updated_at

        tasks = session_data.get("tasks", [])
        tasks_count = len(tasks)
        completed_count = sum(1 for t in tasks if t.get("status") == "success")
        failed_count = sum(1 for t in tasks if t.get("status") == "failure")

        payload_json = json.dumps(session_data, ensure_ascii=False)

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO agent_sessions (
                    id, goal, project, status, progress, summary,
                    tasks_count, completed_count, failed_count,
                    started_at, updated_at, completed_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status=excluded.status,
                    progress=excluded.progress,
                    summary=excluded.summary,
                    tasks_count=excluded.tasks_count,
                    completed_count=excluded.completed_count,
                    failed_count=excluded.failed_count,
                    updated_at=excluded.updated_at,
                    completed_at=COALESCE(excluded.completed_at, agent_sessions.completed_at),
                    payload_json=excluded.payload_json
                """,
                (
                    session_id,
                    goal,
                    project,
                    status,
                    progress,
                    summary,
                    tasks_count,
                    completed_count,
                    failed_count,
                    started_at,
                    updated_at,
                    completed_at,
                    payload_json,
                ),
            )
            conn.commit()

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT payload_json FROM agent_sessions WHERE id = ?", (session_id,)
            )
            row = cursor.fetchone()
            if row and row["payload_json"]:
                try:
                    return json.loads(row["payload_json"])
                except Exception:
                    return None
            return None

    def list_sessions(
        self, limit: int = 50, offset: int = 0, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if status:
                cursor.execute(
                    """
                    SELECT id, goal, project, status, progress, summary,
                           tasks_count, completed_count, failed_count,
                           started_at, updated_at, completed_at
                    FROM agent_sessions
                    WHERE status = ?
                    ORDER BY started_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (status, limit, offset),
                )
            else:
                cursor.execute(
                    """
                    SELECT id, goal, project, status, progress, summary,
                           tasks_count, completed_count, failed_count,
                           started_at, updated_at, completed_at
                    FROM agent_sessions
                    ORDER BY started_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (limit, offset),
                )
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    def delete_session(self, session_id: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM agent_sessions WHERE id = ?", (session_id,))
            conn.commit()
            return cursor.rowcount > 0

    def get_metrics(self) -> Dict[str, Any]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    COUNT(*) as total_sessions,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_sessions,
                    SUM(tasks_count) as total_tasks,
                    SUM(completed_count) as total_completed_tasks
                FROM agent_sessions
                """
            )
            row = cursor.fetchone()
            total = row["total_sessions"] or 0
            completed = row["completed_sessions"] or 0
            failed = row["failed_sessions"] or 0
            total_tasks = row["total_tasks"] or 0
            total_completed_tasks = row["total_completed_tasks"] or 0

            success_rate = (completed / total * 100) if total > 0 else 0.0

            return {
                "total_sessions": total,
                "completed_sessions": completed,
                "failed_sessions": failed,
                "success_rate": round(success_rate, 1),
                "total_tasks": total_tasks,
                "total_completed_tasks": total_completed_tasks,
            }


# Instância singleton padrão
agent_persistence = AgentPersistence()
