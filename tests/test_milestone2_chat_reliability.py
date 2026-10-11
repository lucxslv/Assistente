"""Testes automatizados do Milestone 2 — Confiabilidade de Chat, Streaming, Cancelamento, Idempotência e Anexos."""

import asyncio
import threading
import uuid
from fastapi.testclient import TestClient

from api.main import app
from api.routes.auth import _token_cache
from api.routes.chat import (
    _active_streams,
    _split_message_and_embedded_attachments,
)
from api.services.chat_persistence import (
    reset_in_memory_chat_store,
    _in_memory_sessions,
    _in_memory_messages,
    ensure_session_record,
    save_chat_message_record,
    update_chat_message_state,
    recover_stale_in_progress_messages,
)


def _make_test_user(email: str, name: str = "User") -> tuple[str, str]:
    user_id = str(uuid.uuid4())
    token = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{uuid.uuid4().hex}"
    _token_cache.set(
        token,
        {
            "id": user_id,
            "email": email,
            "name": name,
            "is_admin": False,
            "role": "user",
        },
    )
    return user_id, token


def test_split_embedded_attachments_separates_file_dump_from_user_text():
    """Garante que despejos de arquivo concatenados no prompt sejam separados do texto visível da mensagem."""
    raw_msg = (
        "--- Conteúdo do Arquivo (relatorio_financeiro.txt) ---\n"
        "Receita Q1: R$ 150.000\nDespesa Q1: R$ 90.000\n"
        "--- Fim de relatorio_financeiro.txt ---\n\n"
        "Resuma os números acima em dois tópicos."
    )
    clean_text, extracted_atts, llm_prompt = _split_message_and_embedded_attachments(raw_msg, None)

    assert clean_text == "Resuma os números acima em dois tópicos."
    assert len(extracted_atts) == 1
    assert extracted_atts[0]["name"] == "relatorio_financeiro.txt"
    assert "Receita Q1: R$ 150.000" in extracted_atts[0]["extracted_text"]
    assert "Receita Q1: R$ 150.000" in llm_prompt


def test_message_state_machine_and_idempotency():
    """Valida idempotência por request_id e transições in_progress -> completed/cancelled/interrupted."""
    async def _run():
        reset_in_memory_chat_store()
        user_id = str(uuid.uuid4())
        session_id = str(uuid.uuid4())
        req_id = f"req-{uuid.uuid4()}"

        await ensure_session_record(None, session_id=session_id, user_id=user_id, prompt="Olá Charlie")

        # 1. Salva mensagem do usuário com request_id
        u_msg_1 = await save_chat_message_record(
            None,
            session_id=session_id,
            user_id=user_id,
            role="user",
            content="Explique como funciona o cancelamento de stream",
            status="completed",
            request_id=req_id,
            attachments=[{"name": "arquitetura.md", "type": "document", "extracted_text": "# Arquitetura"}],
        )
        # 2. Tentativa duplicada com mesmo request_id não deve duplicar registro
        u_msg_2 = await save_chat_message_record(
            None,
            session_id=session_id,
            user_id=user_id,
            role="user",
            content="Explique como funciona o cancelamento de stream",
            status="completed",
            request_id=req_id,
        )
        assert u_msg_1 == u_msg_2
        user_msgs = [m for m in _in_memory_messages[session_id] if m["role"] == "user"]
        assert len(user_msgs) == 1
        assert len(user_msgs[0]["attachments"]) == 1
        assert user_msgs[0]["attachments"][0]["name"] == "arquitetura.md"

        # 3. Cria placeholder in_progress do assistente
        a_msg_id = await save_chat_message_record(
            None,
            session_id=session_id,
            user_id=user_id,
            role="assistant",
            content="",
            status="in_progress",
            request_id=req_id,
            parent_message_id=u_msg_1,
        )
        assistant_msgs = [m for m in _in_memory_messages[session_id] if m["role"] == "assistant"]
        assert len(assistant_msgs) == 1
        assert assistant_msgs[0]["status"] == "in_progress"

        # 4. Atualiza para cancelled com conteúdo parcial
        await update_chat_message_state(
            None,
            session_id=session_id,
            message_id=a_msg_id,
            request_id=req_id,
            role="assistant",
            content="O cancelamento funciona sinalizando um threading.Event...",
            status="cancelled",
        )
        assert assistant_msgs[0]["status"] == "cancelled"
        assert "threading.Event" in assistant_msgs[0]["content"]

    asyncio.run(_run())


def test_recover_stale_in_progress_messages():
    """Garante que mensagens órfãs em 'in_progress' sejam convertidas para 'interrupted' ou 'unknown'."""
    async def _run():
        reset_in_memory_chat_store()
        user_id = str(uuid.uuid4())
        session_id = str(uuid.uuid4())

        await ensure_session_record(None, session_id=session_id, user_id=user_id, prompt="Teste")

        # Mensagem in_progress com conteúdo parcial -> deve virar 'interrupted'
        msg_with_partial = await save_chat_message_record(
            None,
            session_id=session_id,
            user_id=user_id,
            role="assistant",
            content="Resposta parcial antes da queda...",
            status="in_progress",
            request_id="req-stale-1",
        )
        # Mensagem in_progress vazia -> deve virar 'unknown'
        msg_empty = await save_chat_message_record(
            None,
            session_id=session_id,
            user_id=user_id,
            role="assistant",
            content="",
            status="in_progress",
            request_id="req-stale-2",
        )
        # Mensagem in_progress com stream ativo -> NÃO deve ser alterada
        msg_active = await save_chat_message_record(
            None,
            session_id=session_id,
            user_id=user_id,
            role="assistant",
            content="Gerando agora...",
            status="in_progress",
            request_id="req-active-3",
        )

        recovered = await recover_stale_in_progress_messages(
            None,
            session_id=session_id,
            active_request_ids={"req-active-3"},
            stale_after_seconds=0.0,
        )
        assert recovered == 2

        by_id = {m["id"]: m for m in _in_memory_messages[session_id]}
        assert by_id[msg_with_partial]["status"] == "interrupted"
        assert by_id[msg_empty]["status"] == "unknown"
        assert by_id[msg_active]["status"] == "in_progress"

    asyncio.run(_run())


def test_cancel_stream_endpoint_and_ownership_protection():
    """Garante que POST /api/chat/cancel sinalize o cancel_event imediatamente e bloqueie outros usuários."""
    reset_in_memory_chat_store()
    client = TestClient(app)

    user_a_id, token_a = _make_test_user("cancela@charlie.ai", "User A")
    user_b_id, token_b = _make_test_user("cancelb@charlie.ai", "User B")

    req_id = f"req-{uuid.uuid4()}"
    thread_id = str(uuid.uuid4())
    cancel_ev = threading.Event()

    _active_streams[req_id] = {
        "cancel_event": cancel_ev,
        "user_id": user_a_id,
        "thread_id": thread_id,
        "assistant_msg_id": str(uuid.uuid4()),
    }

    try:
        # Usuário B não pode cancelar stream do Usuário A
        res_forbidden = client.post(
            "/api/chat/cancel",
            json={"request_id": req_id, "thread_id": thread_id},
            headers={"Authorization": f"Bearer {token_b}"},
        )
        assert res_forbidden.status_code == 403
        assert not cancel_ev.is_set()

        # Usuário A cancela seu próprio stream com sucesso
        res_ok = client.post(
            "/api/chat/cancel",
            json={"request_id": req_id, "thread_id": thread_id},
            headers={"Authorization": f"Bearer {token_a}"},
        )
        assert res_ok.status_code == 200
        data = res_ok.json()
        assert data["cancelled_count"] == 1
        assert req_id in data["cancelled_request_ids"]
        assert cancel_ev.is_set()
    finally:
        _active_streams.pop(req_id, None)


def test_messages_edit_truncate_delete_and_feedback_endpoints():
    """Valida edição com truncamento de mensagens posteriores, deleção para regeneração e feedback 👍/👎."""
    reset_in_memory_chat_store()
    client = TestClient(app)
    user_id, token = _make_test_user("editor@charlie.ai", "Editor")
    other_id, other_token = _make_test_user("intruder@charlie.ai", "Intruder")
    headers = {"Authorization": f"Bearer {token}"}

    thread_id = str(uuid.uuid4())
    asyncio.run(ensure_session_record(None, session_id=thread_id, user_id=user_id, prompt="Pergunta 1"))

    m1 = asyncio.run(save_chat_message_record(None, session_id=thread_id, user_id=user_id, role="user", content="Pergunta 1"))
    m2 = asyncio.run(save_chat_message_record(None, session_id=thread_id, user_id=user_id, role="assistant", content="Resposta 1"))
    m3 = asyncio.run(save_chat_message_record(None, session_id=thread_id, user_id=user_id, role="user", content="Pergunta 2"))
    m4 = asyncio.run(save_chat_message_record(None, session_id=thread_id, user_id=user_id, role="assistant", content="Resposta 2"))

    # 1. Avaliar m2 positivamente (+1)
    fb_res = client.post(
        f"/api/messages/{m2}/feedback",
        json={"thread_id": thread_id, "rating": 1, "comment": "Excelente resposta"},
        headers=headers,
    )
    assert fb_res.status_code == 200
    assert fb_res.json()["feedback"]["rating"] == 1

    # 2. Listar mensagens e verificar feedback anexado
    list_res = client.get(f"/api/messages?thread_id={thread_id}", headers=headers)
    assert list_res.status_code == 200
    msgs = list_res.json()
    assert len(msgs) == 4
    m2_item = next(x for x in msgs if x["id"] == m2)
    assert m2_item["feedback"] == 1

    # 3. Outro usuário não pode editar mensagem na conversa de Editor
    forbidden_edit = client.patch(
        f"/api/messages/{m1}",
        json={"thread_id": thread_id, "content": "Hack", "truncate_subsequent": True},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert forbidden_edit.status_code == 403

    # 4. Editar m1 com truncate_subsequent=True deve remover m2, m3, m4 e incrementar version
    edit_res = client.patch(
        f"/api/messages/{m1}",
        json={"thread_id": thread_id, "content": "Pergunta 1 reformulada", "truncate_subsequent": True},
        headers=headers,
    )
    assert edit_res.status_code == 200
    edited_msg = edit_res.json()["message"]
    assert edited_msg["content"] == "Pergunta 1 reformulada"
    assert edited_msg["is_edited"] is True
    assert edited_msg["version"] == 2

    list_after_edit = client.get(f"/api/messages?thread_id={thread_id}", headers=headers).json()
    assert len(list_after_edit) == 1
    assert list_after_edit[0]["id"] == m1
    assert list_after_edit[0]["content"] == "Pergunta 1 reformulada"
