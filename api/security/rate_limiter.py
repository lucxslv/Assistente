"""Rate Limiter Híbrido (PostgreSQL Distribuído + Fallback LRU em Memória) e Guardião de Cotas."""

import hashlib
import logging
import os
import time
from collections import OrderedDict
from typing import Dict, Optional, Tuple
from fastapi import HTTPException, Request, status

from api.db import get_or_init_db_pool

logger = logging.getLogger("charlie.api.security.rate_limiter")


def extract_client_ip(request: Optional[Request]) -> str:
    """Extrai o IP real do cliente mesmo através de proxies e CDN da Vercel."""
    if not request:
        return "127.0.0.1"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


class HybridRateLimiter:
    """Controlador de taxa distribuído no PostgreSQL com fallback em memória para ambientes locais/offline."""

    def __init__(self, max_memory_buckets: int = 5000):
        self._memory_buckets: OrderedDict[str, Tuple[int, float]] = OrderedDict()
        self._max_memory_buckets = max_memory_buckets

    def _get_client_ip(self, request: Optional[Request]) -> str:
        return extract_client_ip(request)

    def _check_memory_bucket(self, bucket_key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int, int]:
        now = time.time()
        if bucket_key in self._memory_buckets:
            count, expires_at = self._memory_buckets[bucket_key]
            if now >= expires_at:
                count = 1
                expires_at = now + window_seconds
            else:
                count += 1
            self._memory_buckets.move_to_end(bucket_key)
        else:
            if len(self._memory_buckets) >= self._max_memory_buckets:
                expired = [k for k, (_, exp) in self._memory_buckets.items() if now >= exp]
                for k in expired:
                    self._memory_buckets.pop(k, None)
                while len(self._memory_buckets) >= self._max_memory_buckets:
                    self._memory_buckets.popitem(last=False)
            count = 1
            expires_at = now + window_seconds

        self._memory_buckets[bucket_key] = (count, expires_at)
        remaining = max(0, max_requests - count)
        retry_after = max(1, int(expires_at - now))
        return (count <= max_requests), remaining, retry_after

    async def check_rate_limit(
        self,
        scope: str,
        identifier: str,
        max_requests: int,
        window_seconds: int,
        use_db: bool = True,
    ) -> Tuple[bool, int, int]:
        """Verifica e incrementa o contador de requisições para (scope, identifier).

        Retorna (allowed, remaining, retry_after_seconds).
        """
        raw_key = f"{scope}:{identifier.strip().lower()}"
        hashed_suffix = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:32]
        bucket_key = f"rl:{scope}:{hashed_suffix}"

        # Sempre atualiza em memória para resposta imediata na instância atual
        allowed_mem, rem_mem, retry_mem = self._check_memory_bucket(bucket_key, max_requests, window_seconds)
        if not allowed_mem:
            return False, 0, retry_mem

        if use_db and not os.getenv("PYTEST_CURRENT_TEST"):
            pool = await get_or_init_db_pool()
            if pool:
                try:
                    async with pool.acquire() as conn:
                        row = await conn.fetchrow(
                            """
                            INSERT INTO public.rate_limit_buckets (bucket_key, count, window_start, expires_at)
                            VALUES ($1, 1, NOW(), NOW() + ($2 * INTERVAL '1 second'))
                            ON CONFLICT (bucket_key) DO UPDATE
                            SET count = CASE
                                    WHEN public.rate_limit_buckets.expires_at <= NOW() THEN 1
                                    ELSE public.rate_limit_buckets.count + 1
                                END,
                                window_start = CASE
                                    WHEN public.rate_limit_buckets.expires_at <= NOW() THEN NOW()
                                    ELSE public.rate_limit_buckets.window_start
                                END,
                                expires_at = CASE
                                    WHEN public.rate_limit_buckets.expires_at <= NOW() THEN NOW() + ($2 * INTERVAL '1 second')
                                    ELSE public.rate_limit_buckets.expires_at
                                END
                            RETURNING count, EXTRACT(EPOCH FROM (expires_at - NOW()))::INT AS retry_after;
                            """,
                            bucket_key,
                            float(window_seconds),
                        )
                        if row:
                            db_count = int(row["count"])
                            db_retry = max(1, int(row["retry_after"] or window_seconds))
                            remaining = max(0, max_requests - db_count)
                            if db_count > max_requests:
                                # Sincroniza bloqueio em memória local
                                self._memory_buckets[bucket_key] = (db_count, time.time() + db_retry)
                                return False, 0, db_retry
                            return True, remaining, db_retry
                except Exception as e:
                    logger.debug(f"Fallback para rate limit em memória ({scope}): {e}")

        return allowed_mem, rem_mem, retry_mem

    async def enforce(
        self,
        request_or_key=None,
        scope: Optional[str] = None,
        max_requests: Optional[int] = None,
        window_seconds: int = 60,
        identifier: Optional[str] = None,
        error_detail: str = "Muitas solicitações em um curto período. Aguarde alguns instantes e tente novamente.",
        limit: Optional[int] = None,
        detail: Optional[str] = None,
        request=None,
        key: Optional[str] = None,
    ) -> None:
        """Lança HTTPException 429 se o limite de taxa for excedido.

        Suporta chamadas tanto via `enforce(request, scope, max_requests, window_seconds, ...)`
        quanto via `enforce(request=request, scope=..., max_requests=..., ...)`
        e `enforce(key_str, limit=..., window_seconds=..., detail=...)`.
        """
        effective_limit = int(limit if limit is not None else (max_requests if max_requests is not None else 20))
        effective_detail = detail or error_detail
        target_arg = request_or_key if request_or_key is not None else (key if key is not None else request)

        if isinstance(target_arg, str):
            parts = target_arg.split(":", 1)
            eff_scope = scope or parts[0]
            target_id = parts[1] if len(parts) > 1 else target_arg
        else:
            ip = self._get_client_ip(target_arg) if target_arg is not None else "127.0.0.1"
            eff_scope = scope or "api"
            target_id = f"{ip}:{identifier}" if identifier else ip

        allowed, remaining, retry_after = await self.check_rate_limit(
            scope=eff_scope,
            identifier=target_id,
            max_requests=effective_limit,
            window_seconds=window_seconds,
        )
        if not allowed:
            logger.warning(f"[RATE_LIMIT] Bloqueado scope={eff_scope} id={target_id} (retry_after={retry_after}s)")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=effective_detail,
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(effective_limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

    def reset_all(self) -> None:
        """Limpa os buckets em memória (útil para isolamento em testes automatizados)."""
        self._memory_buckets.clear()


rate_limiter = HybridRateLimiter()


# Armazenamento em memória de apoio para cotas e suspensões quando o banco não está acessível
_in_memory_suspended_users: Dict[str, str] = {}  # user_id/email -> reason
_in_memory_user_quotas: Dict[str, Dict[str, float]] = {}  # user_id -> {daily_token_limit, daily_request_limit, monthly_cost_limit_usd}
_global_operational_limits: Dict[str, float] = {
    "default_daily_token_limit": 250000,
    "default_daily_request_limit": 300,
    "default_monthly_cost_limit_usd": 10.0,
    "chat_rate_limit_per_min": 20,
}


def set_user_suspended_in_memory(user_identifier: str, suspended: bool, reason: str = "") -> None:
    key = user_identifier.strip().lower()
    if suspended:
        _in_memory_suspended_users[key] = reason or "Conta suspensa pelo administrador."
    else:
        _in_memory_suspended_users.pop(key, None)


def is_user_suspended_in_memory(user_id: str, user_email: str = "") -> Optional[str]:
    uid_key = (user_id or "").strip().lower()
    em_key = (user_email or "").strip().lower()
    if uid_key in _in_memory_suspended_users:
        return _in_memory_suspended_users[uid_key]
    if em_key and em_key in _in_memory_suspended_users:
        return _in_memory_suspended_users[em_key]
    return None


def set_user_quota_in_memory(user_id: str, quota: Dict[str, float]) -> None:
    _in_memory_user_quotas[str(user_id)] = quota


def get_global_operational_limits() -> Dict[str, float]:
    return dict(_global_operational_limits)


def update_global_operational_limits(updates: Dict[str, float]) -> Dict[str, float]:
    for k, v in updates.items():
        if k in _global_operational_limits and v is not None and float(v) > 0:
            _global_operational_limits[k] = float(v)
    return dict(_global_operational_limits)


async def check_user_quota_and_status(user_id: str, user_email: str = "") -> None:
    """Verifica se o usuário está suspenso ou se excedeu suas cotas diárias/mensais de consumo."""
    susp_reason = is_user_suspended_in_memory(user_id, user_email)
    if susp_reason:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Acesso bloqueado: {susp_reason}",
        )

    pool = await get_or_init_db_pool()
    if not pool:
        return

    try:
        async with pool.acquire() as conn:
            # 1. Verifica suspensão no banco
            profile_row = await conn.fetchrow(
                """
                SELECT is_suspended, suspended_reason
                FROM public.user_profiles
                WHERE user_id = $1 OR (email IS NOT NULL AND LOWER(email) = LOWER($2))
                LIMIT 1;
                """,
                str(user_id),
                user_email or "",
            )
            if profile_row and profile_row["is_suspended"]:
                reason = profile_row["suspended_reason"] or "Sua conta está temporariamente suspensa."
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Acesso bloqueado: {reason}",
                )

            # 2. Obtém limites de cota do usuário (ou limites globais padrão)
            quota_row = await conn.fetchrow(
                """
                SELECT daily_token_limit, daily_request_limit, monthly_cost_limit_usd
                FROM public.user_quotas
                WHERE user_id = $1;
                """,
                str(user_id),
            )
            mem_quota = _in_memory_user_quotas.get(str(user_id), {})
            daily_token_limit = int(
                (quota_row["daily_token_limit"] if quota_row and quota_row["daily_token_limit"] else None)
                or mem_quota.get("daily_token_limit")
                or _global_operational_limits["default_daily_token_limit"]
            )
            daily_request_limit = int(
                (quota_row["daily_request_limit"] if quota_row and quota_row["daily_request_limit"] else None)
                or mem_quota.get("daily_request_limit")
                or _global_operational_limits["default_daily_request_limit"]
            )
            monthly_cost_limit = float(
                (quota_row["monthly_cost_limit_usd"] if quota_row and quota_row["monthly_cost_limit_usd"] else None)
                or mem_quota.get("monthly_cost_limit_usd")
                or _global_operational_limits["default_monthly_cost_limit_usd"]
            )

            # 3. Consulta consumo acumulado nas últimas 24h e 30 dias em audit_chat_logs
            usage_row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS reqs_24h,
                    COALESCE(SUM(total_tokens) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0) AS tokens_24h,
                    COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) AS cost_30d
                FROM public.audit_chat_logs
                WHERE user_id::text = $1 OR (user_email IS NOT NULL AND LOWER(user_email) = LOWER($2));
                """,
                str(user_id),
                user_email or "",
            )
            if usage_row:
                if int(usage_row["reqs_24h"] or 0) >= daily_request_limit:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Limite diário de mensagens atingido ({daily_request_limit} interações/24h).",
                    )
                if int(usage_row["tokens_24h"] or 0) >= daily_token_limit:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Limite diário de processamento atingido ({daily_token_limit:,} tokens/24h).",
                    )
                if float(usage_row["cost_30d"] or 0.0) >= monthly_cost_limit:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Cota mensal de uso da conta atingida (${monthly_cost_limit:.2f} USD).",
                    )
    except HTTPException:
        raise
    except Exception as e:
        logger.debug(f"Aviso não-bloqueante ao checar cotas do usuário {user_id}: {e}")
