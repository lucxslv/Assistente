"""Testes automatizados do Milestone 6 — Painel Administrativo, Observabilidade (p50/p95, Custos API vs Heurística), Qualidade e Controles Operacionais."""

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from api.main import app
from api.routes.auth import _token_cache
from api.services.audit_service import (
    clear_memory_audit_logs,
    record_audit_log,
    get_audit_metrics,
    get_audit_users_summary,
)
from api.services.chat_persistence import save_message_feedback_record, _in_memory_feedback
from api.security.rate_limiter import (
    rate_limiter,
    _in_memory_suspended_users,
    _in_memory_user_quotas,
)


@pytest.fixture(autouse=True)
def clean_audit_state():
    clear_memory_audit_logs()
    _in_memory_feedback.clear()
    _in_memory_suspended_users.clear()
    _in_memory_user_quotas.clear()
    rate_limiter.reset_all()
    yield
    clear_memory_audit_logs()
    _in_memory_feedback.clear()
    _in_memory_suspended_users.clear()
    _in_memory_user_quotas.clear()
    rate_limiter.reset_all()


def _admin_headers() -> dict:
    token = "test_m6_admin_token"
    _token_cache.set(token, {
        "id": "00000000-0000-4000-8000-000000000001",
        "email": "lucassilvacosta060@gmail.com",
        "name": "Lucas Admin",
    })
    return {"Authorization": f"Bearer {token}"}


def _regular_user_headers(uid: str = "00000000-0000-4000-8000-000000000099", email: str = "tester@charlie.ai") -> dict:
    token = f"test_m6_user_{uid}"
    _token_cache.set(token, {
        "id": uid,
        "email": email,
        "name": "Tester",
    })
    return {"Authorization": f"Bearer {token}"}


def test_cost_source_separation_and_technical_percentiles():
    """Garante separação entre tokens/custos reportados pela API vs estimados por heurística e cálculo p50/p95."""
    import asyncio

    async def _run():
        with patch("api.db.get_or_init_db_pool", return_value=None):
            # 1. Interação com usage_metadata real da API
            await record_audit_log(
                user_id="00000000-0000-4000-8000-000000000010",
                user_email="alice@charlie.ai",
                user_prompt="Explique arquitetura hexagonal",
                model_response="A arquitetura hexagonal separa o domínio das portas e adaptadores.",
                model_name="gemini-2.5-flash",
                latency_ms=420,
                ttft_ms=110,
                route_mode="REASONING",
                provider_name="gemini",
                fallback_used=False,
                status="completed",
                usage_metadata={"prompt_tokens": 1000, "completion_tokens": 2000, "cached_tokens": 300},
            )

            # 2. Interação estimada por heurística com fallback acionado
            await record_audit_log(
                user_id="00000000-0000-4000-8000-000000000020",
                user_email="bob@charlie.ai",
                user_prompt="Qual a previsão do tempo?",
                model_response="Ensolarado com 26 graus.",
                model_name="gemini-2.5-flash-lite",
                latency_ms=1200,
                ttft_ms=350,
                route_mode="FAST",
                provider_name="gemini",
                fallback_used=True,
                fallback_reason="rate_limit",
                status="completed",
            )

            # 3. Interação com falha técnica
            await record_audit_log(
                user_id="00000000-0000-4000-8000-000000000020",
                user_email="bob@charlie.ai",
                user_prompt="Teste erro",
                model_response="[failed]",
                model_name="gemini-2.5-flash",
                latency_ms=2500,
                ttft_ms=0,
                route_mode="FAST",
                provider_name="gemini",
                fallback_used=True,
                status="failed",
                error_category="provider_timeout",
            )

            # Registra feedbacks 👍 e 👎
            await save_message_feedback_record(
                pool=None,
                message_id="msg_ok_1",
                session_id="sess_1",
                user_id="00000000-0000-4000-8000-000000000010",
                rating=1,
            )
            await save_message_feedback_record(
                pool=None,
                message_id="msg_bad_1",
                session_id="sess_2",
                user_id="00000000-0000-4000-8000-000000000020",
                rating=-1,
                comment="Demorou demais",
            )

            metrics = await get_audit_metrics()

            # Verifica separação API vs Heurística
            csb = metrics["cost_source_breakdown"]
            assert csb["api_reported_requests"] == 1
            assert csb["api_reported_tokens"] == 3000
            assert csb["api_reported_cost_usd"] > 0
            assert csb["heuristic_estimated_requests"] == 2
            assert csb["cached_tokens_total"] == 300

            # Verifica percentis p50/p95 e diagnóstico técnico
            diag = metrics["technical_diagnostics"]
            assert diag["latency_p50_ms"] == 1200.0
            assert diag["latency_p95_ms"] > 1200.0
            assert diag["fallback_count"] == 2
            assert diag["error_count"] == 1
            assert any(e["category"] == "provider_timeout" for e in diag["errors_by_category"])

            # Verifica qualidade 👍/👎
            qual = metrics["quality_summary"]
            assert qual["positive_count"] == 1
            assert qual["negative_count"] == 1
            assert qual["approval_rate"] == 50.0
            assert len(qual["recent_negative_feedback"]) == 1
            assert qual["recent_negative_feedback"][0]["comment"] == "Demorou demais"

    asyncio.run(_run())


def test_admin_suspend_user_and_update_quotas_and_limits():
    """Valida suspensão/reativação de conta, ajuste de cota individual e limites operacionais via endpoints admin."""
    client = TestClient(app)
    admin_hdrs = _admin_headers()
    target_uid = "00000000-0000-4000-8000-000000000077"
    target_email = "suspended_tester@charlie.ai"
    user_hdrs = _regular_user_headers(uid=target_uid, email=target_email)

    with patch("api.db.get_or_init_db_pool", return_value=None):
        # 1. Usuário não-admin recebe 404 (Stealth Mode) ao tentar acessar rotas administrativas
        stealth_res = client.get("/api/admin/audit/metrics", headers=user_hdrs)
        assert stealth_res.status_code == 404

        # 2. Admin suspende a conta do usuário
        susp_res = client.post(
            f"/api/admin/audit/users/{target_uid}/suspend",
            headers=admin_hdrs,
            json={"suspended": True, "reason": "Uso abusivo de tokens", "email": target_email},
        )
        assert susp_res.status_code == 200
        assert susp_res.json()["is_suspended"] is True

        # 3. Usuário suspenso tenta enviar mensagem no chat e recebe 403 Forbidden
        chat_res = client.post(
            "/api/chat",
            headers=user_hdrs,
            json={"message": "Olá Charlie"},
        )
        assert chat_res.status_code == 403
        assert "Uso abusivo de tokens" in chat_res.json()["detail"]

        # 4. Admin reativa a conta do usuário
        react_res = client.post(
            f"/api/admin/audit/users/{target_uid}/suspend",
            headers=admin_hdrs,
            json={"suspended": False, "email": target_email},
        )
        assert react_res.status_code == 200
        assert react_res.json()["is_suspended"] is False

        # 5. Admin atualiza cota individual e limites operacionais globais
        quota_res = client.post(
            f"/api/admin/audit/users/{target_uid}/quotas",
            headers=admin_hdrs,
            json={
                "daily_token_limit": 500000,
                "daily_request_limit": 450,
                "monthly_cost_limit_usd": 25.0,
            },
        )
        assert quota_res.status_code == 200
        assert quota_res.json()["quotas"]["monthly_cost_limit_usd"] == 25.0

        limits_res = client.put(
            "/api/admin/audit/limits",
            headers=admin_hdrs,
            json={
                "default_daily_request_limit": 400,
                "chat_rate_limit_per_min": 25,
            },
        )
        assert limits_res.status_code == 200
        assert limits_res.json()["limits"]["default_daily_request_limit"] == 400
        assert limits_res.json()["limits"]["chat_rate_limit_per_min"] == 25
