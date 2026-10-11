"""Serviço de auditoria interna, telemetria técnica (p50/p95), qualidade (👍/👎), gestão de usuários e rastreamento de custos em dólar (USD)."""

import logging
import math
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional
import asyncpg
from config import config

logger = logging.getLogger("charlie.audit")

# Tabela de preços de inferência por 1 Milhão de Tokens (USD)
# Referência oficial: Google Gemini API & OpenAI / Groq API pricing
MODEL_PRICING_PER_1M: Dict[str, Dict[str, float]] = {
    # Google Gemini 2.5 Models
    "gemini-2.5-flash-lite": {"input": 0.075, "output": 0.30},
    "gemini-2.5-flash": {"input": 0.15, "output": 0.60},
    "gemini-2.5-pro": {"input": 1.25, "output": 5.00},
    # Google Gemini 2.0 / 1.5 Models
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

# Buffer em memória para resiliência quando o pool PostgreSQL não está ativo (ex.: testes ou modo local offline)
_memory_audit_logs: Deque[Dict[str, Any]] = deque(maxlen=500)


def clear_memory_audit_logs() -> None:
    """Limpa o buffer em memória (usado em testes automatizados)."""
    _memory_audit_logs.clear()


def _percentile(sorted_vals: List[float], pct: float) -> float:
    """Calcula o percentil (ex.: 0.50 ou 0.95) de uma lista ordenada de números."""
    if not sorted_vals:
        return 0.0
    n = len(sorted_vals)
    if n == 1:
        return float(sorted_vals[0])
    idx = (n - 1) * pct
    lo = int(math.floor(idx))
    hi = int(math.ceil(idx))
    if lo == hi:
        return float(sorted_vals[lo])
    weight = idx - lo
    return round(sorted_vals[lo] * (1.0 - weight) + sorted_vals[hi] * weight, 1)


def estimate_tokens(text: str) -> int:
    """Estima a contagem de tokens usando heurística calibrada para português, código e pontuação.

    Aproximação: ~3.8 caracteres por token.
    """
    if not text:
        return 0
    clean = text.strip()
    if not clean:
        return 0
    estimated = math.ceil(len(clean) / 3.8)
    return max(1, estimated)


def calculate_cost_usd(model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Calcula o custo total em dólar com precisão de 6 casas decimais."""
    clean_model = (model_name or "").lower().strip()

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
    """Garante a criação idempotente da tabela e colunas estendidas de telemetria/auditoria."""
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
        tokens_source TEXT DEFAULT 'heuristic',
        cached_tokens INT DEFAULT 0,
        latency_ms INT DEFAULT 0,
        ttft_ms INT DEFAULT 0,
        route_mode TEXT DEFAULT 'FAST',
        provider_name TEXT DEFAULT 'gemini',
        fallback_used BOOLEAN DEFAULT FALSE,
        fallback_reason TEXT,
        status TEXT DEFAULT 'completed',
        error_category TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS tokens_source TEXT DEFAULT 'heuristic';
    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS cached_tokens INT DEFAULT 0;
    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS latency_ms INT DEFAULT 0;
    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS ttft_ms INT DEFAULT 0;
    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS route_mode TEXT DEFAULT 'FAST';
    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS provider_name TEXT DEFAULT 'gemini';
    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN DEFAULT FALSE;
    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS fallback_reason TEXT;
    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
    ALTER TABLE audit_chat_logs ADD COLUMN IF NOT EXISTS error_category TEXT;

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
    cached_tokens: Optional[int] = None,
    tokens_source: Optional[str] = None,
    latency_ms: Optional[int] = None,
    ttft_ms: Optional[int] = None,
    route_mode: Optional[str] = None,
    provider_name: Optional[str] = None,
    fallback_used: bool = False,
    fallback_reason: Optional[str] = None,
    status: str = "completed",
    error_category: Optional[str] = None,
    usage_metadata: Optional[Dict[str, Any]] = None,
) -> Optional[dict]:
    """Registra uma interação de usuário na tabela audit_chat_logs com distinção clara entre tokens da API e estimados."""
    from api.db import get_or_init_db_pool

    try:
        # 1. Normaliza identificadores
        if isinstance(user_id, str):
            try:
                u_uuid = uuid.UUID(user_id)
            except ValueError:
                u_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, user_id or "anonymous")
        else:
            u_uuid = user_id

        # 2. Determina o nome do modelo e provedor
        if not model_name or not model_name.strip():
            if config.llm_provider.lower() == "gemini":
                model_name = config.gemini_model or "gemini-2.5-flash"
            elif config.llm_provider.lower() == "openai":
                model_name = config.openai_model or "gpt-4o-mini"
            else:
                model_name = getattr(config, f"{config.llm_provider.lower()}_model", config.llm_provider)

        eff_provider = (provider_name or config.llm_provider or "gemini").lower()
        eff_route = (route_mode or "FAST").upper()

        # 3. Determina tokens e fonte ('api' vs 'heuristic')
        eff_source = tokens_source
        eff_cached = int(cached_tokens or 0)

        if usage_metadata and isinstance(usage_metadata, dict):
            api_p = int(usage_metadata.get("prompt_tokens") or 0)
            api_c = int(usage_metadata.get("completion_tokens") or 0)
            eff_cached = int(usage_metadata.get("cached_tokens") or eff_cached)
            if api_p > 0 or api_c > 0:
                prompt_tokens = api_p
                completion_tokens = api_c
                eff_source = "api"

        if prompt_tokens is not None and completion_tokens is not None:
            p_tokens = int(prompt_tokens)
            c_tokens = int(completion_tokens)
            eff_source = eff_source or "api"
        else:
            p_tokens = int(prompt_tokens) if prompt_tokens is not None else estimate_tokens(user_prompt)
            c_tokens = int(completion_tokens) if completion_tokens is not None else estimate_tokens(model_response)
            eff_source = eff_source or "heuristic"

        t_tokens = p_tokens + c_tokens

        # 4. Calcula custo em dólar
        cost = calculate_cost_usd(model_name, p_tokens, c_tokens)

        eff_latency = int(latency_ms or 0)
        eff_ttft = int(ttft_ms or 0)
        eff_status = (status or "completed").lower()
        now_dt = datetime.now(timezone.utc)
        log_id = str(uuid.uuid4())

        entry = {
            "id": log_id,
            "user_id": str(u_uuid),
            "user_email": user_email or "usuario@teste.com",
            "ip_address": ip_address or "127.0.0.1",
            "session_id": session_id or "",
            "user_prompt": user_prompt or "",
            "model_response": model_response or "",
            "model_name": model_name,
            "prompt_tokens": p_tokens,
            "completion_tokens": c_tokens,
            "total_tokens": t_tokens,
            "cost_usd": cost,
            "tokens_source": eff_source,
            "cached_tokens": eff_cached,
            "latency_ms": eff_latency,
            "ttft_ms": eff_ttft,
            "route_mode": eff_route,
            "provider_name": eff_provider,
            "fallback_used": bool(fallback_used),
            "fallback_reason": fallback_reason,
            "status": eff_status,
            "error_category": error_category,
            "created_at": now_dt.isoformat(),
        }
        _memory_audit_logs.appendleft(entry)

        # 5. Persiste no PostgreSQL se disponível
        pool = await get_or_init_db_pool()
        if pool:
            try:
                async with pool.acquire() as conn:
                    row = await conn.fetchrow(
                        """
                        INSERT INTO audit_chat_logs (
                            id, user_id, user_email, ip_address, session_id,
                            user_prompt, model_response, model_name,
                            prompt_tokens, completion_tokens, total_tokens,
                            cost_usd, tokens_source, cached_tokens,
                            latency_ms, ttft_ms, route_mode, provider_name,
                            fallback_used, fallback_reason, status, error_category,
                            created_at
                        ) VALUES (
                            $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                            $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW()
                        )
                        RETURNING id, created_at;
                        """,
                        log_id,
                        u_uuid,
                        user_email or "usuario@teste.com",
                        ip_address,
                        session_id,
                        user_prompt or "",
                        model_response or "",
                        model_name,
                        p_tokens,
                        c_tokens,
                        t_tokens,
                        cost,
                        eff_source,
                        eff_cached,
                        eff_latency,
                        eff_ttft,
                        eff_route,
                        eff_provider,
                        bool(fallback_used),
                        fallback_reason,
                        eff_status,
                        error_category,
                    )
                    if row:
                        entry["id"] = str(row["id"])
            except Exception as db_err:
                logger.debug(f"Fallback para log de auditoria em memória (colunas/conexão): {db_err}")
                try:
                    async with pool.acquire() as conn:
                        await conn.execute(
                            """
                            INSERT INTO audit_chat_logs (
                                id, user_id, user_email, ip_address, session_id,
                                user_prompt, model_response, model_name,
                                prompt_tokens, completion_tokens, total_tokens,
                                cost_usd, created_at
                            ) VALUES (
                                $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
                            )
                            """,
                            log_id,
                            u_uuid,
                            user_email or "usuario@teste.com",
                            ip_address,
                            session_id,
                            user_prompt or "",
                            model_response or "",
                            model_name,
                            p_tokens,
                            c_tokens,
                            t_tokens,
                            cost,
                        )
                except Exception:
                    pass

        from api.services.privacy import mask_email, sanitize_log_message
        masked_e = mask_email(user_email)
        safe_model = sanitize_log_message(str(model_name), max_length=50)
        logger.info(
            f"[Audit Log] Gravado para {masked_e} | Modelo: {safe_model} ({eff_source}) | "
            f"Tokens: {t_tokens} (P:{p_tokens}/C:{c_tokens}) | Custo: ${cost:.6f} | Latência: {eff_latency}ms"
        )
        return {
            "id": entry["id"],
            "cost_usd": cost,
            "total_tokens": t_tokens,
            "tokens_source": eff_source,
            "latency_ms": eff_latency,
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
    anonymize: bool = False,
) -> Dict[str, Any]:
    """Recupera logs paginados de auditoria com filtros textuais e opção de anonimização."""
    from api.db import get_or_init_db_pool
    from api.services.privacy import mask_email, mask_ip

    limit = min(max(limit, 1), 100)
    offset = (page - 1) * limit

    pool = await get_or_init_db_pool()
    if pool:
        try:
            conditions = []
            params: List[Any] = []
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
                total_row = await conn.fetchrow(f"SELECT COUNT(*) as count FROM audit_chat_logs {where_clause}", *params)
                total = total_row["count"] if total_row else 0

                query = f"""
                    SELECT id, user_id, user_email, ip_address, session_id,
                           user_prompt, model_response, model_name,
                           prompt_tokens, completion_tokens, total_tokens,
                           cost_usd,
                           COALESCE(tokens_source, 'heuristic') as tokens_source,
                           COALESCE(cached_tokens, 0) as cached_tokens,
                           COALESCE(latency_ms, 0) as latency_ms,
                           COALESCE(ttft_ms, 0) as ttft_ms,
                           COALESCE(route_mode, 'FAST') as route_mode,
                           COALESCE(provider_name, 'gemini') as provider_name,
                           COALESCE(fallback_used, FALSE) as fallback_used,
                           fallback_reason,
                           COALESCE(status, 'completed') as status,
                           error_category,
                           created_at
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
                        "user_email": mask_email(r["user_email"]) if anonymize else r["user_email"],
                        "ip_address": mask_ip(r["ip_address"]) if anonymize else (r["ip_address"] or "N/A"),
                        "session_id": r["session_id"] or "",
                        "user_prompt": r["user_prompt"],
                        "model_response": r["model_response"],
                        "model_name": r["model_name"],
                        "prompt_tokens": r["prompt_tokens"],
                        "completion_tokens": r["completion_tokens"],
                        "total_tokens": r["total_tokens"],
                        "cost_usd": float(r["cost_usd"]),
                        "tokens_source": r["tokens_source"],
                        "cached_tokens": r["cached_tokens"],
                        "latency_ms": r["latency_ms"],
                        "ttft_ms": r["ttft_ms"],
                        "route_mode": r["route_mode"],
                        "provider_name": r["provider_name"],
                        "fallback_used": bool(r["fallback_used"]),
                        "fallback_reason": r["fallback_reason"],
                        "status": r["status"],
                        "error_category": r["error_category"],
                        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    }
                    for r in rows
                ]

                if logs or not _memory_audit_logs:
                    total_pages = math.ceil(total / limit) if total > 0 else 0
                    return {
                        "logs": logs,
                        "total": total,
                        "page": page,
                        "limit": limit,
                        "total_pages": total_pages,
                    }
        except Exception as e:
            logger.debug(f"Fallback para _memory_audit_logs em get_audit_logs: {e}")

    # Fallback em memória
    items = list(_memory_audit_logs)
    if user_email and user_email.strip():
        q = user_email.strip().lower()
        items = [x for x in items if q in x["user_email"].lower()]
    if model_name and model_name.strip():
        q = model_name.strip().lower()
        items = [x for x in items if q in x["model_name"].lower()]
    if search and search.strip():
        q = search.strip().lower()
        items = [
            x for x in items
            if q in x["user_prompt"].lower() or q in x["model_response"].lower() or q in x["user_email"].lower()
        ]

    total = len(items)
    sliced = items[offset : offset + limit]
    logs_out = []
    for r in sliced:
        copy_r = dict(r)
        if anonymize:
            copy_r["user_email"] = mask_email(copy_r["user_email"])
            copy_r["ip_address"] = mask_ip(copy_r["ip_address"])
        logs_out.append(copy_r)

    return {
        "logs": logs_out,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": math.ceil(total / limit) if total > 0 else 0,
    }


def _compute_metrics_from_records(
    records: List[Dict[str, Any]],
    feedback_items: List[Dict[str, Any]],
    operational_limits: Dict[str, float],
) -> Dict[str, Any]:
    """Consolida métricas operacionais, financeiras (API vs Heurística), técnicas (p50/p95) e de qualidade (👍/👎)."""
    total_requests = len(records)
    total_tokens = sum(int(r.get("total_tokens") or 0) for r in records)
    total_prompt = sum(int(r.get("prompt_tokens") or 0) for r in records)
    total_completion = sum(int(r.get("completion_tokens") or 0) for r in records)
    total_cost = round(sum(float(r.get("cost_usd") or 0.0) for r in records), 6)
    unique_users = len({str(r.get("user_id") or r.get("user_email")) for r in records if r.get("user_id") or r.get("user_email")})
    avg_cost = round(total_cost / total_requests, 6) if total_requests > 0 else 0.0

    # Separação estrita: Registrado pela API vs Estimado por Heurística
    api_reqs = [r for r in records if (r.get("tokens_source") or "heuristic") == "api"]
    heur_reqs = [r for r in records if (r.get("tokens_source") or "heuristic") != "api"]

    cost_source_breakdown = {
        "api_reported_requests": len(api_reqs),
        "api_reported_tokens": sum(int(r.get("total_tokens") or 0) for r in api_reqs),
        "api_reported_cost_usd": round(sum(float(r.get("cost_usd") or 0.0) for r in api_reqs), 6),
        "heuristic_estimated_requests": len(heur_reqs),
        "heuristic_estimated_tokens": sum(int(r.get("total_tokens") or 0) for r in heur_reqs),
        "heuristic_estimated_cost_usd": round(sum(float(r.get("cost_usd") or 0.0) for r in heur_reqs), 6),
        "cached_tokens_total": sum(int(r.get("cached_tokens") or 0) for r in records),
    }

    # Diagnóstico Técnico (p50 / p95, fallbacks, erros)
    latencies = sorted(float(r.get("latency_ms") or 0) for r in records if int(r.get("latency_ms") or 0) > 0)
    ttfts = sorted(float(r.get("ttft_ms") or 0) for r in records if int(r.get("ttft_ms") or 0) > 0)
    fallback_count = sum(1 for r in records if r.get("fallback_used"))
    error_count = sum(1 for r in records if (r.get("status") or "completed") in ("failed", "error"))
    cancelled_count = sum(1 for r in records if (r.get("status") or "completed") == "cancelled")
    interrupted_count = sum(1 for r in records if (r.get("status") or "completed") == "interrupted")

    err_cats: Dict[str, int] = {}
    for r in records:
        cat = r.get("error_category")
        if cat:
            err_cats[str(cat)] = err_cats.get(str(cat), 0) + 1
        elif (r.get("status") or "completed") in ("failed", "error"):
            err_cats["execution_error"] = err_cats.get("execution_error", 0) + 1

    prov_map: Dict[str, Dict[str, Any]] = {}
    for r in records:
        p_name = str(r.get("provider_name") or "gemini").lower()
        if p_name not in prov_map:
            prov_map[p_name] = {"provider_name": p_name, "requests_count": 0, "fallback_count": 0, "error_count": 0, "latencies": []}
        prov_map[p_name]["requests_count"] += 1
        if r.get("fallback_used"):
            prov_map[p_name]["fallback_count"] += 1
        if (r.get("status") or "completed") in ("failed", "error"):
            prov_map[p_name]["error_count"] += 1
        if int(r.get("latency_ms") or 0) > 0:
            prov_map[p_name]["latencies"].append(float(r["latency_ms"]))

    providers_breakdown = []
    for p_name, p_data in prov_map.items():
        lats = p_data["latencies"]
        providers_breakdown.append({
            "provider_name": p_name,
            "requests_count": p_data["requests_count"],
            "fallback_count": p_data["fallback_count"],
            "error_count": p_data["error_count"],
            "avg_latency_ms": round(sum(lats) / len(lats), 1) if lats else 0.0,
        })

    technical_diagnostics = {
        "latency_p50_ms": _percentile(latencies, 0.50),
        "latency_p95_ms": _percentile(latencies, 0.95),
        "ttft_p50_ms": _percentile(ttfts, 0.50),
        "ttft_p95_ms": _percentile(ttfts, 0.95),
        "fallback_count": fallback_count,
        "fallback_rate": round((fallback_count / total_requests) * 100.0, 1) if total_requests > 0 else 0.0,
        "error_count": error_count,
        "cancelled_count": cancelled_count,
        "interrupted_count": interrupted_count,
        "errors_by_category": [{"category": k, "count": v} for k, v in sorted(err_cats.items(), key=lambda x: -x[1])],
        "providers_breakdown": providers_breakdown,
    }

    # Breakdown por modelo
    models_map: Dict[str, Dict[str, Any]] = {}
    for r in records:
        m = str(r.get("model_name") or "gemini-2.5-flash")
        if m not in models_map:
            models_map[m] = {"model_name": m, "requests_count": 0, "total_tokens": 0, "total_cost_usd": 0.0}
        models_map[m]["requests_count"] += 1
        models_map[m]["total_tokens"] += int(r.get("total_tokens") or 0)
        models_map[m]["total_cost_usd"] = round(models_map[m]["total_cost_usd"] + float(r.get("cost_usd") or 0.0), 6)

    models_breakdown = sorted(models_map.values(), key=lambda x: -x["total_cost_usd"])

    # Top usuários
    users_map: Dict[str, Dict[str, Any]] = {}
    for r in records:
        em = str(r.get("user_email") or "usuario@teste.com")
        if em not in users_map:
            users_map[em] = {"user_email": em, "requests_count": 0, "total_tokens": 0, "total_cost_usd": 0.0, "last_active": None}
        users_map[em]["requests_count"] += 1
        users_map[em]["total_tokens"] += int(r.get("total_tokens") or 0)
        users_map[em]["total_cost_usd"] = round(users_map[em]["total_cost_usd"] + float(r.get("cost_usd") or 0.0), 6)
        ca = str(r.get("created_at") or "")
        if ca and (not users_map[em]["last_active"] or ca > users_map[em]["last_active"]):
            users_map[em]["last_active"] = ca

    top_users = sorted(users_map.values(), key=lambda x: -x["total_cost_usd"])[:10]

    # Consumo diário
    daily_map: Dict[str, Dict[str, Any]] = {}
    for r in records:
        ca = str(r.get("created_at") or "")[:10]
        if not ca:
            continue
        if ca not in daily_map:
            daily_map[ca] = {"date": ca, "requests_count": 0, "total_tokens": 0, "total_cost_usd": 0.0}
        daily_map[ca]["requests_count"] += 1
        daily_map[ca]["total_tokens"] += int(r.get("total_tokens") or 0)
        daily_map[ca]["total_cost_usd"] = round(daily_map[ca]["total_cost_usd"] + float(r.get("cost_usd") or 0.0), 6)

    recent_daily = [daily_map[k] for k in sorted(daily_map.keys())[-14:]]

    # Qualidade (👍 / 👎)
    def _is_positive(val: Any) -> bool:
        return val in (1, "1", "up", "positive", True)

    def _is_negative(val: Any) -> bool:
        return val in (-1, "-1", "down", "negative", False) and val is not None and val is not True

    pos_count = sum(1 for f in feedback_items if _is_positive(f.get("rating")))
    neg_count = sum(1 for f in feedback_items if _is_negative(f.get("rating")))
    tot_fb = pos_count + neg_count
    approval_rate = round((pos_count / tot_fb) * 100.0, 1) if tot_fb > 0 else 100.0
    neg_items = [
        {**f, "rating": "down"}
        for f in feedback_items
        if _is_negative(f.get("rating"))
    ][:20]

    quality_summary = {
        "positive_count": pos_count,
        "negative_count": neg_count,
        "total_feedback": tot_fb,
        "approval_rate": approval_rate,
        "recent_negative_feedback": neg_items,
    }

    return {
        "total_requests": total_requests,
        "total_tokens": total_tokens,
        "total_prompt_tokens": total_prompt,
        "total_completion_tokens": total_completion,
        "total_cost_usd": total_cost,
        "unique_users_count": unique_users,
        "avg_cost_per_request": avg_cost,
        "cost_source_breakdown": cost_source_breakdown,
        "technical_diagnostics": technical_diagnostics,
        "quality_summary": quality_summary,
        "operational_limits": operational_limits,
        "models_breakdown": models_breakdown,
        "top_users": top_users,
        "recent_daily": recent_daily,
    }


async def get_audit_metrics() -> Dict[str, Any]:
    """Retorna estatísticas consolidadas, custos reais vs estimados, percentis p50/p95 e avaliação de qualidade."""
    from api.db import get_or_init_db_pool
    from api.security.rate_limiter import get_global_operational_limits
    from api.services.chat_persistence import _in_memory_feedback

    operational_limits = get_global_operational_limits()
    pool = await get_or_init_db_pool()

    records: List[Dict[str, Any]] = []
    feedback_list: List[Dict[str, Any]] = []

    if pool:
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT
                        id, user_id, user_email, model_name,
                        prompt_tokens, completion_tokens, total_tokens, cost_usd,
                        COALESCE(tokens_source, 'heuristic') as tokens_source,
                        COALESCE(cached_tokens, 0) as cached_tokens,
                        COALESCE(latency_ms, 0) as latency_ms,
                        COALESCE(ttft_ms, 0) as ttft_ms,
                        COALESCE(route_mode, 'FAST') as route_mode,
                        COALESCE(provider_name, 'gemini') as provider_name,
                        COALESCE(fallback_used, FALSE) as fallback_used,
                        fallback_reason,
                        COALESCE(status, 'completed') as status,
                        error_category,
                        created_at
                    FROM audit_chat_logs
                    ORDER BY created_at DESC
                    LIMIT 5000;
                    """
                )
                records = [
                    {
                        "id": str(r["id"]),
                        "user_id": str(r["user_id"]),
                        "user_email": r["user_email"],
                        "model_name": r["model_name"],
                        "prompt_tokens": int(r["prompt_tokens"] or 0),
                        "completion_tokens": int(r["completion_tokens"] or 0),
                        "total_tokens": int(r["total_tokens"] or 0),
                        "cost_usd": float(r["cost_usd"] or 0.0),
                        "tokens_source": r["tokens_source"],
                        "cached_tokens": int(r["cached_tokens"] or 0),
                        "latency_ms": int(r["latency_ms"] or 0),
                        "ttft_ms": int(r["ttft_ms"] or 0),
                        "route_mode": r["route_mode"],
                        "provider_name": r["provider_name"],
                        "fallback_used": bool(r["fallback_used"]),
                        "fallback_reason": r["fallback_reason"],
                        "status": r["status"],
                        "error_category": r["error_category"],
                        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    }
                    for r in rows
                ]
        except Exception as e:
            logger.debug(f"Fallback para query simples ou memória em get_audit_metrics: {e}")
            try:
                async with pool.acquire() as conn:
                    rows = await conn.fetch(
                        """
                        SELECT id, user_id, user_email, model_name,
                               prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at
                        FROM audit_chat_logs
                        ORDER BY created_at DESC
                        LIMIT 5000;
                        """
                    )
                    records = [
                        {
                            "id": str(r["id"]),
                            "user_id": str(r["user_id"]),
                            "user_email": r["user_email"],
                            "model_name": r["model_name"],
                            "prompt_tokens": int(r["prompt_tokens"] or 0),
                            "completion_tokens": int(r["completion_tokens"] or 0),
                            "total_tokens": int(r["total_tokens"] or 0),
                            "cost_usd": float(r["cost_usd"] or 0.0),
                            "tokens_source": "heuristic",
                            "cached_tokens": 0,
                            "latency_ms": 0,
                            "ttft_ms": 0,
                            "route_mode": "FAST",
                            "provider_name": "gemini",
                            "fallback_used": False,
                            "fallback_reason": None,
                            "status": "completed",
                            "error_category": None,
                            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                        }
                        for r in rows
                    ]
            except Exception:
                pass

        try:
            async with pool.acquire() as conn:
                fb_rows = await conn.fetch(
                    """
                    SELECT
                        f.message_id, f.session_id, f.user_id, f.rating, f.comment, f.updated_at,
                        m.content as message_content, m.model as model_name
                    FROM public.message_feedback f
                    LEFT JOIN public.chat_messages m ON m.id = f.message_id
                    ORDER BY f.updated_at DESC
                    LIMIT 500;
                    """
                )
                feedback_list = [
                    {
                        "message_id": r["message_id"],
                        "session_id": r["session_id"],
                        "user_id": r["user_id"],
                        "rating": r["rating"],
                        "comment": r["comment"],
                        "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
                        "message_content": (r["message_content"] or "")[:300],
                        "model_name": r["model_name"] or "gemini-2.5-flash",
                    }
                    for r in fb_rows
                ]
        except Exception:
            pass

    if not records and _memory_audit_logs:
        records = list(_memory_audit_logs)

    if not feedback_list and _in_memory_feedback:
        feedback_list = list(_in_memory_feedback.values())

    return _compute_metrics_from_records(records, feedback_list, operational_limits)


async def get_audit_users_summary() -> List[Dict[str, Any]]:
    """Retorna o diretório completo de usuários (incluindo usuários sem mensagens, status de suspensão e cotas)."""
    from api.db import get_or_init_db_pool
    from api.security.rate_limiter import (
        is_user_suspended_in_memory,
        _in_memory_user_quotas,
        get_global_operational_limits,
    )

    defaults = get_global_operational_limits()
    pool = await get_or_init_db_pool()
    users_by_email: Dict[str, Dict[str, Any]] = {}

    if pool:
        try:
            async with pool.acquire() as conn:
                # 1. Carrega perfis e contas cadastradas (mesmo sem uso no chat)
                try:
                    profile_rows = await conn.fetch(
                        """
                        SELECT
                            COALESCE(p.user_id, u.id::text) as user_id,
                            COALESCE(p.email, u.email) as user_email,
                            COALESCE(p.name, '') as name,
                            COALESCE(p.username, '') as username,
                            COALESCE(p.is_suspended, FALSE) as is_suspended,
                            p.suspended_reason,
                            COALESCE(u.created_at, p.updated_at, NOW()) as created_at,
                            q.daily_token_limit,
                            q.daily_request_limit,
                            q.monthly_cost_limit_usd
                        FROM auth.users u
                        FULL OUTER JOIN public.user_profiles p ON p.user_id = u.id::text
                        LEFT JOIN public.user_quotas q ON q.user_id = COALESCE(p.user_id, u.id::text)
                        WHERE COALESCE(p.email, u.email) IS NOT NULL;
                        """
                    )
                    for pr in profile_rows:
                        em = str(pr["user_email"]).strip().lower()
                        uid = str(pr["user_id"])
                        mem_susp = is_user_suspended_in_memory(uid, em)
                        mem_q = _in_memory_user_quotas.get(uid, {})
                        users_by_email[em] = {
                            "user_id": uid,
                            "user_email": pr["user_email"],
                            "name": pr["name"] or pr["user_email"].split("@")[0],
                            "username": pr["username"] or "",
                            "created_at": pr["created_at"].isoformat() if pr["created_at"] else None,
                            "total_messages": 0,
                            "total_sessions": 0,
                            "total_cost_usd": 0.0,
                            "api_cost_usd": 0.0,
                            "estimated_cost_usd": 0.0,
                            "total_tokens": 0,
                            "total_prompt_tokens": 0,
                            "total_completion_tokens": 0,
                            "error_count": 0,
                            "last_active": None,
                            "ip_address": "N/A",
                            "is_suspended": bool(pr["is_suspended"]) or bool(mem_susp),
                            "suspended_reason": pr["suspended_reason"] or mem_susp,
                            "daily_token_limit": int(pr["daily_token_limit"] or mem_q.get("daily_token_limit") or defaults["default_daily_token_limit"]),
                            "daily_request_limit": int(pr["daily_request_limit"] or mem_q.get("daily_request_limit") or defaults["default_daily_request_limit"]),
                            "monthly_cost_limit_usd": float(pr["monthly_cost_limit_usd"] or mem_q.get("monthly_cost_limit_usd") or defaults["default_monthly_cost_limit_usd"]),
                        }
                except Exception as prof_err:
                    logger.debug(f"Aviso ao unir auth.users/user_profiles: {prof_err}")

                # 2. Agrega estatísticas de audit_chat_logs
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
                for r in rows:
                    em = str(r["user_email"]).strip().lower()
                    uid = str(r["user_id"])
                    mem_susp = is_user_suspended_in_memory(uid, em)
                    mem_q = _in_memory_user_quotas.get(uid, {})
                    existing = users_by_email.get(em)
                    if existing:
                        existing["total_messages"] += int(r["total_messages"] or 0)
                        existing["total_sessions"] += int(r["total_sessions"] or 0)
                        existing["total_cost_usd"] = round(existing["total_cost_usd"] + float(r["total_cost_usd"] or 0.0), 6)
                        existing["total_tokens"] += int(r["total_tokens"] or 0)
                        existing["total_prompt_tokens"] += int(r["total_prompt_tokens"] or 0)
                        existing["total_completion_tokens"] += int(r["total_completion_tokens"] or 0)
                        la = r["last_active"].isoformat() if r["last_active"] else None
                        if la and (not existing["last_active"] or la > existing["last_active"]):
                            existing["last_active"] = la
                        if r["ip_address"] and existing["ip_address"] == "N/A":
                            existing["ip_address"] = r["ip_address"]
                    else:
                        users_by_email[em] = {
                            "user_id": uid,
                            "user_email": r["user_email"],
                            "name": r["user_email"].split("@")[0],
                            "username": "",
                            "created_at": r["last_active"].isoformat() if r["last_active"] else None,
                            "total_messages": int(r["total_messages"] or 0),
                            "total_sessions": int(r["total_sessions"] or 0),
                            "total_cost_usd": float(r["total_cost_usd"] or 0.0),
                            "api_cost_usd": 0.0,
                            "estimated_cost_usd": float(r["total_cost_usd"] or 0.0),
                            "total_tokens": int(r["total_tokens"] or 0),
                            "total_prompt_tokens": int(r["total_prompt_tokens"] or 0),
                            "total_completion_tokens": int(r["total_completion_tokens"] or 0),
                            "error_count": 0,
                            "last_active": r["last_active"].isoformat() if r["last_active"] else None,
                            "ip_address": r["ip_address"] or "N/A",
                            "is_suspended": bool(mem_susp),
                            "suspended_reason": mem_susp,
                            "daily_token_limit": int(mem_q.get("daily_token_limit") or defaults["default_daily_token_limit"]),
                            "daily_request_limit": int(mem_q.get("daily_request_limit") or defaults["default_daily_request_limit"]),
                            "monthly_cost_limit_usd": float(mem_q.get("monthly_cost_limit_usd") or defaults["default_monthly_cost_limit_usd"]),
                        }
        except Exception as e:
            logger.debug(f"Fallback em get_audit_users_summary: {e}")

    # Se não obteve do banco, usa _memory_audit_logs
    if not users_by_email and _memory_audit_logs:
        for r in _memory_audit_logs:
            em = str(r["user_email"]).strip().lower()
            uid = str(r["user_id"])
            mem_susp = is_user_suspended_in_memory(uid, em)
            mem_q = _in_memory_user_quotas.get(uid, {})
            if em not in users_by_email:
                users_by_email[em] = {
                    "user_id": uid,
                    "user_email": r["user_email"],
                    "name": r["user_email"].split("@")[0],
                    "username": "",
                    "created_at": r["created_at"],
                    "total_messages": 0,
                    "total_sessions": 1,
                    "total_cost_usd": 0.0,
                    "api_cost_usd": 0.0,
                    "estimated_cost_usd": 0.0,
                    "total_tokens": 0,
                    "total_prompt_tokens": 0,
                    "total_completion_tokens": 0,
                    "error_count": 0,
                    "last_active": r["created_at"],
                    "ip_address": r.get("ip_address") or "127.0.0.1",
                    "is_suspended": bool(mem_susp),
                    "suspended_reason": mem_susp,
                    "daily_token_limit": int(mem_q.get("daily_token_limit") or defaults["default_daily_token_limit"]),
                    "daily_request_limit": int(mem_q.get("daily_request_limit") or defaults["default_daily_request_limit"]),
                    "monthly_cost_limit_usd": float(mem_q.get("monthly_cost_limit_usd") or defaults["default_monthly_cost_limit_usd"]),
                }
            u = users_by_email[em]
            u["total_messages"] += 1
            cost = float(r.get("cost_usd") or 0.0)
            u["total_cost_usd"] = round(u["total_cost_usd"] + cost, 6)
            if r.get("tokens_source") == "api":
                u["api_cost_usd"] = round(u["api_cost_usd"] + cost, 6)
            else:
                u["estimated_cost_usd"] = round(u["estimated_cost_usd"] + cost, 6)
            u["total_tokens"] += int(r.get("total_tokens") or 0)
            u["total_prompt_tokens"] += int(r.get("prompt_tokens") or 0)
            u["total_completion_tokens"] += int(r.get("completion_tokens") or 0)
            if (r.get("status") or "completed") in ("failed", "error"):
                u["error_count"] += 1

    return sorted(
        users_by_email.values(),
        key=lambda x: (x["last_active"] or x["created_at"] or ""),
        reverse=True,
    )


async def get_user_conversations(user_email: str) -> Dict[str, Any]:
    """Retorna o histórico de conversas do usuário selecionado agrupado em sessões cronológicas."""
    from api.db import get_or_init_db_pool

    pool = await get_or_init_db_pool()
    rows_list: List[Dict[str, Any]] = []

    if pool:
        try:
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
                rows_list = [dict(r) for r in rows]
        except Exception:
            pass

    if not rows_list and _memory_audit_logs:
        target = user_email.strip().lower()
        rows_list = [
            r for r in reversed(_memory_audit_logs)
            if str(r.get("user_email") or "").strip().lower() == target
        ]

    if not rows_list:
        return {"user_email": user_email, "sessions": [], "total_messages": 0, "total_cost_usd": 0.0}

    sessions_map: Dict[str, Dict[str, Any]] = {}
    ordered_session_keys: List[str] = []

    total_cost = 0.0
    total_msgs = len(rows_list)
    current_inferred_session_idx = 0
    last_msg_time = None

    for r in rows_list:
        cost = float(r["cost_usd"])
        total_cost += cost
        created_at = r["created_at"]
        created_iso = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at or "")

        raw_session_id = (r.get("session_id") or "").strip()
        if raw_session_id and raw_session_id.lower() not in {"default", "main", "none", "null"}:
            session_key = raw_session_id
        else:
            if hasattr(created_at, "strftime"):
                if last_msg_time and hasattr(last_msg_time, "total_seconds") and (created_at - last_msg_time).total_seconds() > 2700:
                    current_inferred_session_idx += 1
                session_key = f"sess_{created_at.strftime('%Y%m%d')}_{current_inferred_session_idx}"
                last_msg_time = created_at
            else:
                session_key = f"sess_{created_iso[:10]}_{current_inferred_session_idx}"

        if session_key not in sessions_map:
            ordered_session_keys.append(session_key)
            sessions_map[session_key] = {
                "session_id": session_key,
                "started_at": created_iso,
                "updated_at": created_iso,
                "message_count": 0,
                "total_cost_usd": 0.0,
                "total_tokens": 0,
                "model_names": set(),
                "messages": [],
            }

        sess = sessions_map[session_key]
        sess["message_count"] += 1
        sess["total_cost_usd"] = round(sess["total_cost_usd"] + cost, 6)
        sess["total_tokens"] += int(r["total_tokens"] or 0)
        sess["updated_at"] = created_iso
        sess["model_names"].add(r["model_name"])

        sess["messages"].append({
            "id": str(r["id"]),
            "created_at": created_iso,
            "ip_address": r.get("ip_address") or "N/A",
            "model_name": r["model_name"],
            "prompt_tokens": int(r["prompt_tokens"] or 0),
            "completion_tokens": int(r["completion_tokens"] or 0),
            "total_tokens": int(r["total_tokens"] or 0),
            "cost_usd": cost,
            "user_prompt": r["user_prompt"],
            "model_response": r["model_response"],
        })

    sessions_list = []
    for key in reversed(ordered_session_keys):
        s = sessions_map[key]
        s["model_names"] = list(s["model_names"])
        sessions_list.append(s)

    return {
        "user_email": user_email,
        "user_id": str(rows_list[0]["user_id"]) if rows_list else "",
        "total_messages": total_msgs,
        "total_cost_usd": round(total_cost, 6),
        "sessions": sessions_list,
    }
