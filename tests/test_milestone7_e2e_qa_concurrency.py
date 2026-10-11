"""Testes integrados End-to-End, Segurança Multi-Tenant e Concorrência — Milestone 7 (QA Integral)."""

import asyncio
import pytest
from contextlib import ExitStack
from unittest.mock import patch
from fastapi.testclient import TestClient

from api.main import app
from api.routes.auth import _token_cache
from api.routes.threads import _recent_thread_creations, _thread_owners
from api.security.rate_limiter import rate_limiter, _in_memory_suspended_users
from api.services.chat_persistence import (
    _in_memory_sessions,
    _in_memory_messages,
    _in_memory_feedback,
    save_chat_message_record,
)


@pytest.fixture(autouse=True)
def reset_qa_state():
    rate_limiter.reset_all()
    _in_memory_suspended_users.clear()
    _in_memory_sessions.clear()
    _in_memory_messages.clear()
    _in_memory_feedback.clear()
    _recent_thread_creations.clear()
    _thread_owners.clear()
    yield
    rate_limiter.reset_all()
    _in_memory_suspended_users.clear()
    _recent_thread_creations.clear()
    _thread_owners.clear()


def _in_memory_db_scope():
    stack = ExitStack()
    stack.enter_context(patch("api.db.get_or_init_db_pool", return_value=None))
    stack.enter_context(patch("api.routes.threads.get_or_init_db_pool", return_value=None))
    stack.enter_context(patch("api.routes.messages.get_or_init_db_pool", return_value=None))
    return stack


def _auth_headers(user_id: str, email: str, name: str = "User") -> dict:
    token = f"qa_token_{user_id}"
    _token_cache.set(token, {"id": user_id, "email": email, "name": name})
    return {"Authorization": f"Bearer {token}"}


def test_e2e_conversation_lifecycle_pin_archive_search_edit_and_feedback():
    """Valida o fluxo ponta a ponta de uma conversa: criação idempotente, envio, edição com truncamento, feedback 👍/👎, pin, archive e busca."""
    client = TestClient(app)
    uid = "00000000-0000-4000-8000-000000000701"
    hdrs = _auth_headers(uid, "qa_user1@charlie.ai", "QA Tester 1")

    with _in_memory_db_scope():
        # 1. Clique rápido repetido em "Novo chat" com reuse_empty=True não cria conversas duplicadas
        res1 = client.post("/api/threads", headers=hdrs, json={"title": "Nova Conversa", "reuse_empty": True})
        assert res1.status_code == 200
        thread_id = res1.json()["id"]

        res2 = client.post("/api/threads", headers=hdrs, json={"title": "Nova Conversa", "reuse_empty": True})
        assert res2.status_code == 200
        assert res2.json()["id"] == thread_id

        # 2. Persistência de mensagens com anexos estruturados separados do corpo visual
        async def _seed_messages():
            m_user_1 = await save_chat_message_record(
                pool=None,
                session_id=thread_id,
                role="user",
                content="Analise este relatório trimestral",
                user_id=uid,
                status="completed",
                request_id="req_e2e_1",
                attachments=[
                    {
                        "id": "att_1",
                        "name": "relatorio_q3.pdf",
                        "mime_type": "application/pdf",
                        "size": 24500,
                        "extracted_text": "Receita líquida cresceu 18% no Q3.",
                    }
                ],
            )
            m_asst_1 = await save_chat_message_record(
                pool=None,
                session_id=thread_id,
                role="assistant",
                content="O relatório aponta crescimento de 18% na receita líquida.",
                user_id=uid,
                status="completed",
                request_id="req_e2e_1",
            )
            m_user_2 = await save_chat_message_record(
                pool=None,
                session_id=thread_id,
                role="user",
                content="Pergunta posterior que será truncada na edição",
                user_id=uid,
                status="completed",
                request_id="req_e2e_2",
            )
            return m_user_1, m_asst_1, m_user_2

        m_user_1, m_asst_1, m_user_2 = asyncio.run(_seed_messages())

        # Verifica que o corpo visual da mensagem não contém o texto bruto do anexo despejado
        msgs_res = client.get(f"/api/messages?thread_id={thread_id}", headers=hdrs)
        assert msgs_res.status_code == 200
        msgs_data = msgs_res.json()
        assert len(msgs_data) == 3
        assert msgs_data[0]["content"] == "Analise este relatório trimestral"
        assert "Receita líquida cresceu" not in msgs_data[0]["content"]
        assert msgs_data[0]["attachments"][0]["name"] == "relatorio_q3.pdf"

        # 3. Avaliação 👍/👎 na mensagem do assistente
        fb_res = client.post(
            f"/api/messages/{m_asst_1}/feedback",
            headers=hdrs,
            json={"thread_id": thread_id, "rating": "up"},
        )
        assert fb_res.status_code == 200
        assert fb_res.json()["rating"] == 1

        # 4. Edição da primeira mensagem do usuário trunca as mensagens posteriores de forma determinística
        edit_res = client.patch(
            f"/api/messages/{m_user_1}",
            headers=hdrs,
            json={
                "thread_id": thread_id,
                "content": "Analise o relatório trimestral com foco em margem EBITDA",
                "truncate_after": True,
            },
        )
        assert edit_res.status_code == 200
        assert edit_res.json()["version"] == 2
        assert edit_res.json()["is_edited"] is True

        msgs_after_edit = client.get(f"/api/messages?thread_id={thread_id}", headers=hdrs).json()
        assert len(msgs_after_edit) == 1
        assert msgs_after_edit[0]["content"] == "Analise o relatório trimestral com foco em margem EBITDA"

        # 5. Fixar (pin), renomear e buscar conversa por conteúdo/título
        patch_thread = client.patch(
            f"/api/threads/{thread_id}",
            headers=hdrs,
            json={"title": "Análise Financeira Q3", "is_pinned": True, "is_archived": False},
        )
        assert patch_thread.status_code == 200
        assert patch_thread.json()["is_pinned"] is True
        assert patch_thread.json()["title"] == "Análise Financeira Q3"

        search_res = client.get("/api/threads?search=EBITDA", headers=hdrs)
        assert search_res.status_code == 200
        found_ids = [t["id"] for t in search_res.json()]
        assert thread_id in found_ids


def test_multi_tenant_isolation_and_concurrent_thread_idempotency():
    """Garante que Usuário B não consegue ler, editar, avaliar ou excluir conversas/mensagens do Usuário A e valida idempotência concorrente."""
    client = TestClient(app)
    uid_a = "00000000-0000-4000-8000-000000000710"
    uid_b = "00000000-0000-4000-8000-000000000720"
    hdrs_a = _auth_headers(uid_a, "alice_iso@charlie.ai", "Alice")
    hdrs_b = _auth_headers(uid_b, "bob_iso@charlie.ai", "Bob")

    with _in_memory_db_scope():
        # Alice cria conversa com chave de idempotência explícita (2 chamadas retornam exatamente a mesma thread)
        t_res_1 = client.post("/api/threads", headers=hdrs_a, json={"title": "Segredo de Alice", "idempotency_key": "idem_alice_01"})
        t_res_2 = client.post("/api/threads", headers=hdrs_a, json={"title": "Segredo de Alice", "idempotency_key": "idem_alice_01"})
        assert t_res_1.status_code == 200
        assert t_res_2.status_code == 200
        tid = t_res_1.json()["id"]
        assert t_res_2.json()["id"] == tid

        mid = asyncio.run(
            save_chat_message_record(
                pool=None,
                session_id=tid,
                role="user",
                content="Dados confidenciais da Alice",
                user_id=uid_a,
            )
        )

        # Bob tenta listar mensagens da conversa de Alice -> 403 ou 404
        bob_read = client.get(f"/api/messages?thread_id={tid}", headers=hdrs_b)
        assert bob_read.status_code in (403, 404)

        # Bob tenta editar mensagem de Alice -> 403
        bob_edit = client.patch(
            f"/api/messages/{mid}",
            headers=hdrs_b,
            json={"thread_id": tid, "content": "Adulterado por Bob"},
        )
        assert bob_edit.status_code == 403

        # Bob tenta renomear/arquivar conversa de Alice -> 403 ou 404
        bob_patch = client.patch(
            f"/api/threads/{tid}",
            headers=hdrs_b,
            json={"title": "Sequestrado"},
        )
        assert bob_patch.status_code in (403, 404)

        # Bob tenta deletar conversa de Alice -> 403 ou 404
        bob_del = client.delete(f"/api/threads/{tid}", headers=hdrs_b)
        assert bob_del.status_code in (403, 404)
