"""
Charlie Agentic Runtime 1.2 — Persistência SQLite
Gerencia o armazenamento persistente de sessões, grafos de tarefas, evidências e métricas.
"""

import json
import os
import sqlite3
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone


class AgentPersistence:
    def __init__(self, db_path: Optional[str] = None):
        if not db_path:
            # No ambiente Vercel serverless, apenas /tmp é gravável
            if os.getenv("VERCEL") or not os.access(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")), os.W_OK):
                base_dir = "/tmp"
            else:
                base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))

            try:
                os.makedirs(base_dir, exist_ok=True)
                db_path = os.path.join(base_dir, "agent_runtime.db")
            except Exception:
                base_dir = "/tmp"
                try:
                    os.makedirs(base_dir, exist_ok=True)
                except Exception:
                    pass
                db_path = os.path.join(base_dir, "agent_runtime.db")

        self.db_path = db_path
        try:
            self._init_db()
        except Exception as e:
            pass

    def _get_connection(self) -> sqlite3.Connection:
        try:
            conn = sqlite3.connect(self.db_path)
        except Exception:
            conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL DEFAULT 'default',
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
            try:
                cursor.execute("ALTER TABLE agent_sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'")
            except Exception:
                pass
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON agent_sessions (started_at DESC)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_status ON agent_sessions (status)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_project ON agent_sessions (project)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON agent_sessions (user_id)"
            )
            conn.commit()

    def save_session(self, session_data: Dict[str, Any], user_id: Optional[str] = None) -> None:
        session_id = session_data.get("id")
        if not session_id:
            return

        uid = str(user_id or session_data.get("user_id") or "default")
        session_data["user_id"] = uid
        goal = session_data.get("goal", "")
        project = session_data.get("project", "Charlie")
        status = session_data.get("status", "running")
        progress = int(session_data.get("progress", 0))
        summary = session_data.get("summary")
        started_at = session_data.get("startedAt") or session_data.get("started_at")
        updated_at = session_data.get("updatedAt") or session_data.get("updated_at") or datetime.now(timezone.utc).isoformat()
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
            # Verifica titularidade se sessão já existir
            cursor.execute("SELECT user_id FROM agent_sessions WHERE id = ?", (session_id,))
            existing = cursor.fetchone()
            if existing and existing["user_id"] not in ("default", uid) and uid != "default":
                raise PermissionError("Esta sessão pertence a outro usuário.")

            cursor.execute(
                """
                INSERT INTO agent_sessions (
                    id, user_id, goal, project, status, progress, summary,
                    tasks_count, completed_count, failed_count,
                    started_at, updated_at, completed_at, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    user_id=COALESCE(NULLIF(excluded.user_id, 'default'), agent_sessions.user_id),
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
                    uid,
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

    def get_session(self, session_id: str, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if user_id and user_id not in ("default", "local-loopback"):
                cursor.execute(
                    "SELECT * FROM agent_sessions WHERE id = ? AND (user_id = ? OR user_id = 'default')",
                    (session_id, str(user_id)),
                )
            else:
                cursor.execute(
                    "SELECT * FROM agent_sessions WHERE id = ?", (session_id,)
                )
            row = cursor.fetchone()
            if row:
                result = dict(row)
                if row["payload_json"]:
                    try:
                        payload = json.loads(row["payload_json"])
                        result.update(payload)
                    except Exception:
                        pass
                result["tasks_count"] = row["tasks_count"]
                result["completed_count"] = row["completed_count"]
                result["failed_count"] = row["failed_count"]
                return result
            return None

    def list_sessions(
        self,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            filter_user = user_id and user_id not in ("default", "local-loopback")
            if status and filter_user:
                cursor.execute(
                    """
                    SELECT id, user_id, goal, project, status, progress, summary,
                           tasks_count, completed_count, failed_count,
                           started_at, updated_at, completed_at
                    FROM agent_sessions
                    WHERE status = ? AND (user_id = ? OR user_id = 'default')
                    ORDER BY started_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (status, str(user_id), limit, offset),
                )
            elif status:
                cursor.execute(
                    """
                    SELECT id, user_id, goal, project, status, progress, summary,
                           tasks_count, completed_count, failed_count,
                           started_at, updated_at, completed_at
                    FROM agent_sessions
                    WHERE status = ?
                    ORDER BY started_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (status, limit, offset),
                )
            elif filter_user:
                cursor.execute(
                    """
                    SELECT id, user_id, goal, project, status, progress, summary,
                           tasks_count, completed_count, failed_count,
                           started_at, updated_at, completed_at
                    FROM agent_sessions
                    WHERE (user_id = ? OR user_id = 'default')
                    ORDER BY started_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (str(user_id), limit, offset),
                )
            else:
                cursor.execute(
                    """
                    SELECT id, user_id, goal, project, status, progress, summary,
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

    def delete_session(self, session_id: str, user_id: Optional[str] = None) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if user_id and user_id not in ("default", "local-loopback"):
                cursor.execute(
                    "DELETE FROM agent_sessions WHERE id = ? AND (user_id = ? OR user_id = 'default')",
                    (session_id, str(user_id)),
                )
            else:
                cursor.execute("DELETE FROM agent_sessions WHERE id = ?", (session_id,))
            conn.commit()
            return cursor.rowcount > 0

    def get_metrics(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            if user_id and user_id not in ("default", "local-loopback"):
                cursor.execute(
                    """
                    SELECT
                        COUNT(*) as total_sessions,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
                        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_sessions,
                        SUM(tasks_count) as total_tasks,
                        SUM(completed_count) as total_completed_tasks
                    FROM agent_sessions
                    WHERE (user_id = ? OR user_id = 'default')
                    """,
                    (str(user_id),),
                )
            else:
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
