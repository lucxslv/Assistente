"""Suíte de testes de regressão para o Milestone 1:
Segurança Crítica, Autenticação Própria, Recuperação de Senha, Rate Limiting, IDOR e Isolamento Multi-Tenant.
"""

import asyncio
import secrets
import time
import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.routes.auth import (
    _token_cache,
    _hash_token,
    _in_memory_reset_tokens,
    _revoke_token,
    _is_token_revoked,
    get_current_user,
    verify_supabase_token,
)
from api.security.rate_limiter import (
    rate_limiter,
    set_user_suspended_in_memory,
)
from api.state import CharlieStatus, state
from brain.agent.governance import permission_gate, RiskLevel, PermissionRequest
from brain.agent.persistence import AgentPersistence
from brain.broker.device_broker import RemoteDeviceBroker


@pytest.fixture(autouse=True)
def clean_security_state():
    """Garante estado limpo de rate limiter e suspensões antes e depois de cada teste."""
    rate_limiter.reset_all()
    set_user_suspended_in_memory("user-a", False)
    set_user_suspended_in_memory("user-b", False)
    permission_gate.clear()
    yield
    rate_limiter.reset_all()
    set_user_suspended_in_memory("user-a", False)
    set_user_suspended_in_memory("user-b", False)
    permission_gate.clear()
    app.dependency_overrides.clear()


def test_m1_static_admin_bypass_token_removed():
    """Garante que o token estático charlie_admin_local_token foi completamente removido."""
    client = TestClient(app)
    res_me = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer charlie_admin_local_token"},
    )
    assert res_me.status_code == 401

    res_admin = client.get(
        "/api/admin/audit/verify",
        headers={"Authorization": "Bearer charlie_admin_local_token"},
    )
    assert res_admin.status_code in (401, 404)


def test_m1_guest_token_is_never_admin():
    """Garante que charlie_guest_token em ambiente de teste possui is_admin=False e role='guest'."""
    client = TestClient(app)
    res_me = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer charlie_guest_token"},
    )
    assert res_me.status_code == 200
    body = res_me.json()
    assert body["is_admin"] is False
    assert body["role"] == "guest"

    res_admin = client.get(
        "/api/admin/audit/verify",
        headers={"Authorization": "Bearer charlie_guest_token"},
    )
    assert res_admin.status_code == 404


def test_m1_token_revocation_on_logout():
    """Garante que um token revogado via logout é imediatamente invalidado no cache e na blacklist."""
    fake_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.revocation_test_token_m1"
    user_payload = {
        "id": "user-revoke-test",
        "email": "revoke@charlie.ai",
        "name": "Revoke Test",
        "is_admin": False,
        "role": "user",
    }
    _token_cache.set(fake_jwt, user_payload)
    assert _token_cache.get(fake_jwt) is not None

    _revoke_token(fake_jwt)
    assert _is_token_revoked(fake_jwt) is True
    assert _token_cache.get(fake_jwt) is None

    verified = asyncio.run(verify_supabase_token(fake_jwt))
    assert verified is None


def test_m1_password_recovery_anti_enumeration_and_single_use():
    """Valida recuperação de senha sem enumeração de conta, validação de força e token de uso único."""
    client = TestClient(app)

    # 1. Resposta neutra idêntica para e-mail existente ou inexistente
    r1 = client.post("/api/auth/forgot-password", json={"email": "naoexiste_12345@charlie.ai"})
    r2 = client.post("/api/auth/forgot-password", json={"email": "outro_usuario@charlie.ai"})
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["message"] == r2.json()["message"]

    # 2. Senha fraca no reset deve retornar 400
    r_weak = client.post(
        "/api/auth/reset-password",
        json={"token": "qualquer_token_123456", "new_password": "123"},
    )
    assert r_weak.status_code == 400

    # 3. Token inválido deve retornar 400
    r_invalid = client.post(
        "/api/auth/reset-password",
        json={"token": "token_inexistente_999999", "new_password": "NovaSenhaForte!2026"},
    )
    assert r_invalid.status_code == 400

    # 4. Emissão real de token de uso único e consumo único
    raw_token = secrets.token_urlsafe(32)
    th = _hash_token(raw_token)
    _in_memory_reset_tokens[th] = {
        "user_id": "user-reset-1",
        "email": "reset1@charlie.ai",
        "token_hash": th,
        "expires_at": time.time() + 900,
        "used_at": None,
        "request_ip": "127.0.0.1",
    }

    r_ok = client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "NovaSenhaForte!2026"},
    )
    assert r_ok.status_code == 200
    assert r_ok.json()["ok"] is True

    # 5. Reutilização do mesmo token deve falhar imediatamente (uso único)
    r_reuse = client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "OutraSenhaForte!2026"},
    )
    assert r_reuse.status_code == 400


def test_m1_user_profile_persistence_and_validation():
    """Valida atualização completa de perfil do usuário e limites de bio/website."""
    client = TestClient(app)
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "user-profile-m1",
        "email": "profile@charlie.ai",
        "name": "Lucas",
        "is_admin": False,
        "role": "user",
    }

    # Bio acima de 280 caracteres deve ser rejeitada (400)
    r_long_bio = client.patch(
        "/api/auth/profile",
        json={"bio": "x" * 285},
    )
    assert r_long_bio.status_code in (400, 422)

    # Website com protocolo inválido (javascript:) deve ser rejeitado (400)
    r_bad_web = client.patch(
        "/api/auth/profile",
        json={"website": "javascript:alert(1)"},
    )
    assert r_bad_web.status_code == 400

    # Atualização válida completa
    r_ok = client.patch(
        "/api/auth/profile",
        json={
            "first_name": "Lucas",
            "last_name": "Costa",
            "username": "lucas_charlie",
            "bio": "Engenheiro de IA testando o Charlie.",
            "website": "https://charlie.ai",
            "avatar_url": "https://charlie.ai/avatar.png",
            "banner_url": "https://charlie.ai/banner.png",
        },
    )
    assert r_ok.status_code == 200
    user_data = r_ok.json()
    assert user_data["first_name"] == "Lucas"
    assert user_data["last_name"] == "Costa"
    assert user_data["name"] == "Lucas Costa"
    assert user_data["username"] == "lucas_charlie"
    assert user_data["bio"] == "Engenheiro de IA testando o Charlie."
    assert user_data["website"] == "https://charlie.ai"
    assert user_data["avatar_url"] == "https://charlie.ai/avatar.png"
    assert user_data["banner_url"] == "https://charlie.ai/banner.png"


def test_m1_rate_limiting_and_user_suspension():
    """Valida que o rate limiter retorna 429 com Retry-After e que suspensão bloqueia usuário com 403."""
    client = TestClient(app)

    # 1. Rate limit por IP em forgot-password (limite de 5 por 15 min)
    for i in range(5):
        res = client.post("/api/auth/forgot-password", json={"email": f"flood_{i}@charlie.ai"})
        assert res.status_code == 200

    res_blocked = client.post("/api/auth/forgot-password", json={"email": "flood_6@charlie.ai"})
    assert res_blocked.status_code == 429
    assert "Retry-After" in res_blocked.headers

    # 2. Suspensão administrativa de usuário bloqueia execução de ferramentas e chat
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "user-a",
        "email": "usera@charlie.ai",
        "name": "User A",
        "is_admin": False,
        "role": "user",
    }
    set_user_suspended_in_memory("user-a", True, "Uso abusivo detectado.")

    res_tool = client.post(
        "/api/tools/execute",
        json={"name": "get_datetime", "arguments": {}},
    )
    assert res_tool.status_code == 403
    assert "suspens" in res_tool.json()["detail"].lower() or "bloqueado" in res_tool.json()["detail"].lower()


def test_m1_remote_unauthenticated_routes_blocked():
    """Garante que chamadas remotas (X-Forwarded-For público) sem token são barradas com 401."""
    client = TestClient(app)
    remote_headers = {"X-Forwarded-For": "203.0.113.99"}

    protected_gets = [
        "/api/agent/session",
        "/api/agent/sessions",
        "/api/agent/metrics",
        "/api/agent/permissions/pending",
        "/api/pair/devices",
        "/api/settings",
        "/api/tools",
        "/api/tools/status",
        "/api/system/presence",
        "/api/voice/status",
        "/api/device/status",
    ]
    for path in protected_gets:
        resp = client.get(path, headers=remote_headers)
        assert resp.status_code == 401, f"Endpoint GET {path} deveria exigir autenticação para IP remoto, mas retornou {resp.status_code}"

    resp_autolink = client.post(
        "/api/pair/auto-link",
        json={"device_id": "rogue-dev-1", "device_name": "Rogue"},
        headers=remote_headers,
    )
    assert resp_autolink.status_code == 401


def test_m1_cross_tenant_isolation_state_governance_persistence_broker(tmp_path):
    """Garante isolamento estrito entre User A e User B em State, PermissionGate, AgentPersistence e DeviceBroker."""
    # 1. CharlieRuntimeState isolation
    state.set_tool_start("execute_command", {"command": "Get-Process"}, user_id="user-a")
    dict_a = state.to_dict(user_id="user-a")
    dict_b = state.to_dict(user_id="user-b")
    dict_anon = state.to_dict(include_sensitive=False)

    assert dict_a["active_tool"] == "execute_command"
    assert dict_b["active_tool"] is None
    assert dict_b["active_tool_args"] is None
    assert dict_b["status"] == "idle"
    assert dict_anon["active_tool"] is None
    state.set_status(CharlieStatus.IDLE, user_id="user-a")

    # 2. PermissionGate isolation
    req_a = PermissionRequest(
        id="perm_test_iso_a",
        task_id="task_1",
        tool="execute_command",
        arguments={"command": "Remove-Item test.txt"},
        risk_level=RiskLevel.HIGH,
        description="Teste de isolamento",
        user_id="user-a",
    )
    permission_gate._pending[req_a.id] = req_a
    permission_gate._events[req_a.id] = asyncio.Event()

    assert any(p["id"] == req_a.id for p in permission_gate.get_pending_requests(user_id="user-a"))
    assert not any(p["id"] == req_a.id for p in permission_gate.get_pending_requests(user_id="user-b"))

    # User B não pode aprovar a permissão de User A
    assert permission_gate.resolve_permission(req_a.id, approved=True, user_id="user-b") is False
    # User A pode resolver sua própria permissão
    assert permission_gate.resolve_permission(req_a.id, approved=False, user_id="user-a") is True

    # 3. RemoteDeviceBroker isolation
    broker = RemoteDeviceBroker()
    loop = asyncio.new_event_loop()
    fut = loop.create_future()
    broker._pending_calls["call_secret_a"] = fut
    broker._call_owners["call_secret_a"] = "user-a"

    # User B tenta resolver call_id de User A -> ignorado
    broker.resolve_tool_result("call_secret_a", "hacked_by_b", user_id="user-b")
    assert not fut.done()

    # User A resolve seu próprio call_id -> aceito
    broker.resolve_tool_result("call_secret_a", "legit_from_a", user_id="user-a")
    assert fut.done()
    assert fut.result() == "legit_from_a"
    loop.close()

    # 4. AgentPersistence isolation
    db_file = str(tmp_path / "test_agent_m1.db")
    ap = AgentPersistence(db_path=db_file)
    ap.save_session({"id": "sess-user-a", "goal": "Segredo de A", "status": "running", "tasks": []}, user_id="user-a")

    assert ap.get_session("sess-user-a", user_id="user-a") is not None
    assert ap.get_session("sess-user-a", user_id="user-b") is None
    assert len(ap.list_sessions(user_id="user-b")) == 0

    with pytest.raises(PermissionError):
        ap.save_session({"id": "sess-user-a", "goal": "Adulterado por B", "status": "failed"}, user_id="user-b")

    assert ap.delete_session("sess-user-a", user_id="user-b") is False
    assert ap.delete_session("sess-user-a", user_id="user-a") is True


def test_m1_healthcheck_does_not_leak_internal_db_errors():
    """Garante que /api/health não expõe campo database_error com detalhes internos."""
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert "database_error" not in data
    assert "database_status" in data


def test_m1_thread_creation_idempotency_and_idor_protection():
    """Garante que cliques rápidos em Novo Chat reutilizam o mesmo ID e que User B não pode alterar/excluir thread de User A."""
    client = TestClient(app)
    user_a = {
        "id": "11111111-1111-1111-1111-111111111111",
        "email": "usera_idor@charlie.ai",
        "name": "User A",
        "is_admin": False,
        "role": "user",
    }
    user_b = {
        "id": "22222222-2222-2222-2222-222222222222",
        "email": "userb_idor@charlie.ai",
        "name": "User B",
        "is_admin": False,
        "role": "user",
    }

    app.dependency_overrides[get_current_user] = lambda: user_a
    r1 = client.post("/api/threads", json={"name": "Novo Chat", "idempotency_key": "idem-m1-test-1"})
    r2 = client.post("/api/threads", json={"name": "Novo Chat", "idempotency_key": "idem-m1-test-1"})
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]

    thread_id = r1.json()["id"]

    # User B tenta excluir ou atualizar a conversa de User A -> deve retornar 403 Forbidden
    app.dependency_overrides[get_current_user] = lambda: user_b
    r_patch_b = client.patch(f"/api/threads/{thread_id}", json={"name": "Sequestrado por B"})
    r_del_b = client.delete(f"/api/threads/{thread_id}")
    assert r_patch_b.status_code == 403
    assert r_del_b.status_code == 403


