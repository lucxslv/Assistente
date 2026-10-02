"""Serviço de auditoria interna, telemetria e rastreamento de custos em dólar (USD)."""

import asyncio
import logging
import math
import uuid
from typing import Any, Dict, List, Optional
import asyncpg
from config import config

logger = logging.getLogger("charlie.audit")

# Tabela de preços de inferência por 1 Milhão de Tokens (USD)
# Referência oficial: Google Gemini API & OpenAI API pricing
MODEL_PRICING_PER_1M: Dict[str, Dict[str, float]] = {
    # Google Gemini Models
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.0-flash-exp": {"input": 0.10, "output": 0.40},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-1.5-flash-8b": {"input": 0.0375, "output": 0.15},
    "gemini-1.5-pro": {"input": 1.25, "output": 5.00},
    "gemini-2.0-pro": {"input": 1.50, "output": 6.00},
    "gemini-3.1-flash-lite": {"input": 0.075, "output": 0.30},

    # OpenAI Models
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},

    # Groq / OpenRouter / Llama
    "llama-3.3-70b": {"input": 0.59, "output": 0.79},
    "llama-3.1-8b": {"input": 0.05, "output": 0.08},
}

DEFAULT_PRICING: Dict[str, float] = {"input": 0.10, "output": 0.40}


def estimate_tokens(text: str) -> int:
    """Estima a contagem de tokens usando heurística calibrada para português, código e pontuação.
    
    Aproximação: ~3.8 caracteres por token.
    """
    if not text:
        return 0
    clean = text.strip()
    if not clean:
        return 0
    # Palavras e pontuação
    estimated = math.ceil(len(clean) / 3.8)
    return max(1, estimated)


def calculate_cost_usd(model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calcula o custo total em dólar com precisão de 6 casas decimais."""
    clean_model = (model_name or "").lower().strip()
    
    # Procura modelo exato ou por substring
    pricing = DEFAULT_PRICING
    for key, val in MODEL_PRICING_PER_1M.items():
        if key in clean_model:
            pricing = val
            break

    input_cost = (prompt_tokens / 1_000_000.0) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000.0) * pricing["output"]
    total = input_cost + output_cost
    return round(total, 6)


async def ensure_audit_schema(pool: asyncpg.Pool) -> None:
    """Garante a criação idempotente da tabela e dos índices de auditoria."""
    if not pool:
        return
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS audit_chat_logs (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID NOT NULL,
        user_email TEXT NOT NULL,
        ip_address TEXT,
        session_id TEXT,
        user_prompt TEXT NOT NULL,
        model_response TEXT NOT NULL,
        model_name TEXT NOT NULL,
        prompt_tokens INT NOT NULL DEFAULT 0,
        completion_tokens INT NOT NULL DEFAULT 0,
        total_tokens INT NOT NULL DEFAULT 0,
        cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_chat_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_chat_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_model_name ON audit_chat_logs(model_name);
    CREATE INDEX IF NOT EXISTS idx_audit_user_email ON audit_chat_logs(user_email);
    """
    try:
        async with pool.acquire() as conn:
            await conn.execute(create_table_sql)
        logger.info("Esquema de auditoria audit_chat_logs validado com sucesso.")
    except Exception as e:
        logger.warning(f"Aviso ao inicializar schema de auditoria: {e}")


async def record_audit_log(
    user_id: str | uuid.UUID,
    user_email: str,
    user_prompt: str,
    model_response: str,
    model_name: Optional[str] = None,
    ip_address: Optional[str] = None,
    session_id: Optional[str] = None,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
) -> Optional[dict]:
    """Registra uma interação de usuário na tabela imutável audit_chat_logs.
    
    Esta operação é não-bloqueante e segura contra falhas de conexão.
    """
    from api.db import get_or_init_db_pool

    pool = await get_or_init_db_pool()
    if not pool:
        logger.warning("Pool de banco indisponível para gravar audit log.")
        return None

    try:
        # 1. Normaliza identificadores
        if isinstance(user_id, str):
            try:
                u_uuid = uuid.UUID(user_id)
            except ValueError:
                u_uuid = uuid.uuid4()
        else:
            u_uuid = user_id

        # 2. Determina o nome do modelo
        if not model_name or not model_name.strip():
            if config.llm_provider.lower() == "gemini":
                model_name = config.gemini_model or "gemini-2.0-flash"
            elif config.llm_provider.lower() == "openai":
                model_name = config.openai_model or "gpt-4o-mini"
            else:
                model_name = getattr(config, f"{config.llm_provider.lower()}_model", config.llm_provider)

        # 3. Calcula tokens caso não informados
        p_tokens = prompt_tokens if prompt_tokens is not None else estimate_tokens(user_prompt)
        c_tokens = completion_tokens if completion_tokens is not None else estimate_tokens(model_response)
        t_tokens = p_tokens + c_tokens

        # 4. Calcula custo em dólar
        cost = calculate_cost_usd(model_name, p_tokens, c_tokens)

        # 5. Persiste no PostgreSQL
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO audit_chat_logs (
                    id, user_id, user_email, ip_address, session_id,
                    user_prompt, model_response, model_name,
                    prompt_tokens, completion_tokens, total_tokens,
                    cost_usd, created_at
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
                )
                RETURNING id, created_at;
            """, u_uuid, user_email, ip_address, session_id, user_prompt, model_response, model_name, p_tokens, c_tokens, t_tokens, cost)

            logger.info(
                f"[Audit Log] Gravado para {user_email} | Modelo: {model_name} | "
                f"Tokens: {t_tokens} (P:{p_tokens}/C:{c_tokens}) | Custo: ${cost:.6f}"
            )
            return {
                "id": str(row["id"]),
                "cost_usd": cost,
                "total_tokens": t_tokens,
            }

    except Exception as e:
        logger.error(f"Erro ao salvar audit log: {e}")
        return None


async def get_audit_logs(
    page: int = 1,
    limit: int = 30,
    search: Optional[str] = None,
    user_email: Optional[str] = None,
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Recupera logs paginados de auditoria com filtros textuais."""
    from api.db import get_or_init_db_pool

    pool = await get_or_init_db_pool()
    if not pool:
        return {"logs": [], "total": 0, "page": page, "limit": limit, "total_pages": 0}

    limit = min(max(limit, 1), 100)
    offset = (page - 1) * limit

    conditions = []
    params = []
    idx = 1

    if user_email and user_email.strip():
        conditions.append(f"user_email ILIKE ${idx}")
        params.append(f"%{user_email.strip()}%")
        idx += 1

    if model_name and model_name.strip():
        conditions.append(f"model_name ILIKE ${idx}")
        params.append(f"%{model_name.strip()}%")
        idx += 1

    if search and search.strip():
        conditions.append(f"(user_prompt ILIKE ${idx} OR model_response ILIKE ${idx} OR user_email ILIKE ${idx})")
        params.append(f"%{search.strip()}%")
        idx += 1

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    async with pool.acquire() as conn:
        # Total count
        total_row = await conn.fetchrow(f"SELECT COUNT(*) as count FROM audit_chat_logs {where_clause}", *params)
        total = total_row["count"] if total_row else 0

        # Paginated logs
        query = f"""
            SELECT id, user_id, user_email, ip_address, session_id,
                   user_prompt, model_response, model_name,
                   prompt_tokens, completion_tokens, total_tokens,
                   cost_usd, created_at
            FROM audit_chat_logs
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ${idx} OFFSET ${idx + 1}
        """
        rows = await conn.fetch(query, *params, limit, offset)

        logs = [
            {
                "id": str(r["id"]),
                "user_id": str(r["user_id"]),
                "user_email": r["user_email"],
                "ip_address": r["ip_address"] or "N/A",
                "session_id": r["session_id"] or "",
                "user_prompt": r["user_prompt"],
                "model_response": r["model_response"],
                "model_name": r["model_name"],
                "prompt_tokens": r["prompt_tokens"],
                "completion_tokens": r["completion_tokens"],
                "total_tokens": r["total_tokens"],
                "cost_usd": float(r["cost_usd"]),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]

        total_pages = math.ceil(total / limit) if total > 0 else 0

        return {
            "logs": logs,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
        }


async def get_audit_metrics() -> Dict[str, Any]:
    """Retorna estatísticas consolidadas e métricas de custo em dólar."""
    from api.db import get_or_init_db_pool

    pool = await get_or_init_db_pool()
    if not pool:
        return {
            "total_requests": 0,
            "total_tokens": 0,
            "total_prompt_tokens": 0,
            "total_completion_tokens": 0,
            "total_cost_usd": 0.0,
            "unique_users_count": 0,
            "avg_cost_per_request": 0.0,
            "models_breakdown": [],
            "top_users": [],
            "recent_daily": [],
        }

    async with pool.acquire() as conn:
        # Totais gerais
        summary = await conn.fetchrow("""
            SELECT 
                COUNT(*) as total_requests,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
                COALESCE(SUM(cost_usd), 0.0) as total_cost_usd,
                COUNT(DISTINCT user_id) as unique_users_count
            FROM audit_chat_logs;
        """)

        total_requests = summary["total_requests"] or 0
        total_cost = float(summary["total_cost_usd"] or 0.0)
        avg_cost = (total_cost / total_requests) if total_requests > 0 else 0.0

        # Breakdown por modelo
        model_rows = await conn.fetch("""
            SELECT 
                model_name,
                COUNT(*) as requests_count,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(cost_usd), 0.0) as total_cost_usd
            FROM audit_chat_logs
            GROUP BY model_name
            ORDER BY total_cost_usd DESC;
        """)

        models_breakdown = [
            {
                "model_name": r["model_name"],
                "requests_count": r["requests_count"],
                "total_tokens": r["total_tokens"],
                "total_cost_usd": float(r["total_cost_usd"]),
            }
            for r in model_rows
        ]

        # Top usuários por consumo
        user_rows = await conn.fetch("""
            SELECT 
                user_email,
                COUNT(*) as requests_count,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(cost_usd), 0.0) as total_cost_usd,
                MAX(created_at) as last_active
            FROM audit_chat_logs
            GROUP BY user_email
            ORDER BY total_cost_usd DESC
            LIMIT 10;
        """)

        top_users = [
            {
                "user_email": r["user_email"],
                "requests_count": r["requests_count"],
                "total_tokens": r["total_tokens"],
                "total_cost_usd": float(r["total_cost_usd"]),
                "last_active": r["last_active"].isoformat() if r["last_active"] else None,
            }
            for r in user_rows
        ]

        # Consumo diário recente (últimos 7 dias)
        daily_rows = await conn.fetch("""
            SELECT 
                DATE(created_at) as day,
                COUNT(*) as requests_count,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(cost_usd), 0.0) as total_cost_usd
            FROM audit_chat_logs
            WHERE created_at >= NOW() - INTERVAL '14 days'
            GROUP BY DATE(created_at)
            ORDER BY day ASC;
        """)

        recent_daily = [
            {
                "date": str(r["day"]),
                "requests_count": r["requests_count"],
                "total_tokens": r["total_tokens"],
                "total_cost_usd": float(r["total_cost_usd"]),
            }
            for r in daily_rows
        ]

        return {
            "total_requests": total_requests,
            "total_tokens": summary["total_tokens"],
            "total_prompt_tokens": summary["total_prompt_tokens"],
            "total_completion_tokens": summary["total_completion_tokens"],
            "total_cost_usd": round(total_cost, 6),
            "unique_users_count": summary["unique_users_count"],
            "avg_cost_per_request": round(avg_cost, 6),
            "models_breakdown": models_breakdown,
            "top_users": top_users,
            "recent_daily": recent_daily,
        }


async def get_audit_users_summary() -> List[Dict[str, Any]]:
    """Retorna a lista consolidada de amigos/usuários para a visão de conversas no painel de auditoria."""
    from api.db import get_or_init_db_pool

    pool = await get_or_init_db_pool()
    if not pool:
        return []

    async with pool.acquire() as conn:
        query = """
            SELECT 
                user_id,
                user_email,
                COUNT(*) as total_messages,
                COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id::text)) as total_sessions,
                COALESCE(SUM(cost_usd), 0.0) as total_cost_usd,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
                COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
                MAX(created_at) as last_active,
                MAX(ip_address) as ip_address
            FROM audit_chat_logs
            GROUP BY user_id, user_email
            ORDER BY last_active DESC;
        """
        rows = await conn.fetch(query)

        return [
            {
                "user_id": str(r["user_id"]),
                "user_email": r["user_email"],
                "total_messages": r["total_messages"],
                "total_sessions": r["total_sessions"],
                "total_cost_usd": float(r["total_cost_usd"]),
                "total_tokens": r["total_tokens"],
                "total_prompt_tokens": r["total_prompt_tokens"],
                "total_completion_tokens": r["total_completion_tokens"],
                "last_active": r["last_active"].isoformat() if r["last_active"] else None,
                "ip_address": r["ip_address"] or "N/A",
            }
            for r in rows
        ]


async def get_user_conversations(user_email: str) -> Dict[str, Any]:
    """Retorna o histórico de conversas do usuário selecionado agrupado em sessões cronológicas."""
    from api.db import get_or_init_db_pool

    pool = await get_or_init_db_pool()
    if not pool:
        return {"user_email": user_email, "sessions": [], "total_messages": 0, "total_cost_usd": 0.0}

    async with pool.acquire() as conn:
        query = """
            SELECT id, user_id, user_email, ip_address, session_id,
                   user_prompt, model_response, model_name,
                   prompt_tokens, completion_tokens, total_tokens,
                   cost_usd, created_at
            FROM audit_chat_logs
            WHERE LOWER(user_email) = LOWER($1)
            ORDER BY created_at ASC;
        """
        rows = await conn.fetch(query, user_email.strip())

        if not rows:
            return {"user_email": user_email, "sessions": [], "total_messages": 0, "total_cost_usd": 0.0}

        # Agrupamento inteligente de mensagens em sessões
        sessions_map: Dict[str, Dict[str, Any]] = {}
        ordered_session_keys: List[str] = []

        total_cost = 0.0
        total_msgs = len(rows)
        current_inferred_session_idx = 0
        last_msg_time = None

        for r in rows:
            cost = float(r["cost_usd"])
            total_cost += cost
            created_at = r["created_at"]

            raw_session_id = (r["session_id"] or "").strip()
            if raw_session_id and raw_session_id.lower() not in {"default", "main", "none", "null"}:
                session_key = raw_session_id
            else:
                # Cria nova sessão se houver intervalo de mais de 45 minutos entre interações
                if last_msg_time and (created_at - last_msg_time).total_seconds() > 2700:
                    current_inferred_session_idx += 1
                session_key = f"sess_{created_at.strftime('%Y%m%d')}_{current_inferred_session_idx}"
                last_msg_time = created_at

            if session_key not in sessions_map:
                ordered_session_keys.append(session_key)
                sessions_map[session_key] = {
                    "session_id": session_key,
                    "started_at": created_at.isoformat() if created_at else None,
                    "updated_at": created_at.isoformat() if created_at else None,
                    "message_count": 0,
                    "total_cost_usd": 0.0,
                    "total_tokens": 0,
                    "model_names": set(),
                    "messages": [],
                }

            sess = sessions_map[session_key]
            sess["message_count"] += 1
            sess["total_cost_usd"] = round(sess["total_cost_usd"] + cost, 6)
            sess["total_tokens"] += r["total_tokens"]
            sess["updated_at"] = created_at.isoformat() if created_at else None
            sess["model_names"].add(r["model_name"])

            sess["messages"].append({
                "id": str(r["id"]),
                "created_at": created_at.isoformat() if created_at else None,
                "ip_address": r["ip_address"] or "N/A",
                "model_name": r["model_name"],
                "prompt_tokens": r["prompt_tokens"],
                "completion_tokens": r["completion_tokens"],
                "total_tokens": r["total_tokens"],
                "cost_usd": cost,
                "user_prompt": r["user_prompt"],
                "model_response": r["model_response"],
            })

        sessions_list = []
        for key in reversed(ordered_session_keys):  # Sessões mais recentes primeiro
            s = sessions_map[key]
            s["model_names"] = list(s["model_names"])
            sessions_list.append(s)

        return {
            "user_email": user_email,
            "user_id": str(rows[0]["user_id"]) if rows else "",
            "total_messages": total_msgs,
            "total_cost_usd": round(total_cost, 6),
            "sessions": sessions_list,
        }

