"""Testes automatizados para filtragem estrita de memória e busca cross-chat."""

import asyncio
import os
import pathlib
import uuid
import asyncpg
from dotenv import load_dotenv

# Carrega ambiente
env_path = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

from tools.registry import ToolRegistry
from api.routes.auth import current_user_id_var
from api.services.chat_persistence import (
    save_user_memory_entry,
    search_user_chat_history,
    get_chat_session_details,
)
from brain.memory.extractor import MemoryExtractor


async def test_all():
    db_url = os.getenv("DATABASE_URL")
    assert db_url, "DATABASE_URL deve estar configurada"
    conn = await asyncpg.connect(db_url)

    test_uid = str(uuid.uuid4())
    print(f"\n[SETUP] Usando UID isolado de teste: {test_uid}")

    try:
        # --- TESTE 1: Filtragem estrita de memórias triviais e efêmeras ---
        print("\n--- Teste 1: Filtragem de memórias irrelevantes / efêmeras ---")

        # 1.1 Fato efêmero com importância baixa deve ser descartado
        res_ephemeral = await save_user_memory_entry(
            conn,
            user_id=test_uid,
            fact="O usuário treinou fisicamente no sábado",
            category="routine",
            importance=0.4,
            confidence=0.6,
        )
        assert res_ephemeral == "", f"Fato efêmero deveria ter sido descartado, mas retornou: {res_ephemeral}"
        print("[OK] Fato efêmero descartado com sucesso pelo filtro de importância.")

        # 1.2 Fato relevante e duradouro com alta importância deve ser aceito
        res_important = await save_user_memory_entry(
            conn,
            user_id=test_uid,
            fact="O usuário é arquiteto de software e desenvolve o assistente Charlie em Python",
            category="projects",
            importance=0.95,
            confidence=0.95,
        )
        assert res_important != "", "Fato importante deveria ter sido salvo!"
        print(f"[OK] Fato importante salvo com sucesso (ID={res_important}).")

        # 1.3 Verificação de persistência
        rows = await conn.fetch('SELECT id, content, importance, confidence FROM public."UserMemory" WHERE user_id = $1', test_uid)
        assert len(rows) == 1, f"Deveria haver exatamente 1 memória, encontrada: {len(rows)}"
        assert "Charlie" in rows[0]["content"], "Conteúdo incorreto salvo"
        print(f"[OK] Banco possui estritamente a memória estrutural esperada: '{rows[0]['content']}'")

        # --- TESTE 2: Criação de sessões e mensagens para teste de Cross-Chat ---
        print("\n--- Teste 2: Criação de duas sessões distintas no histórico ---")
        sid_1 = uuid.uuid4()
        sid_2 = uuid.uuid4()
        now = asyncio.get_event_loop().time()

        # Chat 1: Discussão sobre ESP32 e sensores
        await conn.execute(
            """
            INSERT INTO public.chat_sessions (id, title, user_id, created_at, updated_at)
            VALUES ($1, 'Projeto ESP32 MetalSense', $2, NOW() - interval '2 days', NOW() - interval '2 days')
            """,
            sid_1, test_uid
        )
        await conn.execute(
            """
            INSERT INTO public.chat_messages (id, session_id, user_id, role, content, created_at)
            VALUES ($1, $2, $3, 'user', 'Decidimos usar o sensor indutivo NPN na esteira com o ESP32', NOW() - interval '2 days')
            """,
            uuid.uuid4(), sid_1, test_uid
        )
        await conn.execute(
            """
            INSERT INTO public.chat_messages (id, session_id, user_id, role, content, created_at)
            VALUES ($1, $2, $3, 'assistant', 'Excelente escolha. O sensor NPN opera com lógica pull-up invertida no GPIO do ESP32.', NOW() - interval '2 days')
            """,
            uuid.uuid4(), sid_1, test_uid
        )

        # Chat 2: Discussão sobre FastAPI e Web Chat
        await conn.execute(
            """
            INSERT INTO public.chat_sessions (id, title, user_id, created_at, updated_at)
            VALUES ($1, 'Refatoração do Web Chat', $2, NOW(), NOW())
            """,
            sid_2, test_uid
        )
        await conn.execute(
            """
            INSERT INTO public.chat_messages (id, session_id, user_id, role, content, created_at)
            VALUES ($1, $2, $3, 'user', 'Vamos otimizar o SSE streaming no FastAPI', NOW())
            """,
            uuid.uuid4(), sid_2, test_uid
        )
        print("[OK] Sessões 1 ('Projeto ESP32 MetalSense') e 2 ('Refatoração do Web Chat') criadas.")

        # --- TESTE 3: Busca Cross-Chat a partir do Chat 2 ---
        print("\n--- Teste 3: Consulta Cross-Chat (estando na sessão 2, buscar contexto da sessão 1) ---")
        matches = await search_user_chat_history(
            pool=conn,
            user_id=test_uid,
            query="sensor indutivo NPN",
            exclude_session_id=str(sid_2),
            limit=5,
        )
        assert len(matches) >= 1, f"Deveria ter encontrado mensagens do chat 1, retornou: {len(matches)}"
        assert matches[0]["session_title"] == "Projeto ESP32 MetalSense", f"Título incorreto: {matches[0]['session_title']}"
        assert "NPN" in matches[0]["content"], f"Conteúdo não encontrado: {matches[0]['content']}"
        print(f"[OK] Busca cross-chat localizou mensagem correta no Chat 1: '{matches[0]['content']}'")

        # --- TESTE 4: Detalhes de sessão passada ---
        print("\n--- Teste 4: Recuperação detalhada do histórico da sessão anterior ---")
        details = await get_chat_session_details(
            pool=conn,
            user_id=test_uid,
            session_id=str(sid_1),
        )
        assert details.get("session_id") == str(sid_1), "ID da sessão incorreto"
        assert len(details.get("messages", [])) == 2, f"Deveria ter 2 mensagens, retornou: {len(details.get('messages', []))}"
        print(f"[OK] Detalhes da sessão '{details['title']}' recuperados com 2 mensagens.")

        # --- TESTE 5: Tool Registry execution com context var ---
        print("\n--- Teste 5: Execução via ToolRegistry (search_chat_history & get_chat_session_context) ---")
        current_user_id_var.set(test_uid)
        registry = ToolRegistry()

        tool_search_res = await registry.execute(
            "search_chat_history",
            {"query": "ESP32", "limit": 3}
        )
        assert "Projeto ESP32 MetalSense" in tool_search_res, f"Falha na tool search_chat_history: {tool_search_res}"
        print(f"[OK] Tool search_chat_history executada com sucesso:\n{tool_search_res}")

        tool_context_res = await registry.execute(
            "get_chat_session_context",
            {"session_id": str(sid_1)}
        )
        assert "pull-up" in tool_context_res or "NPN" in tool_context_res, f"Falha na tool get_chat_session_context: {tool_context_res}"
        print(f"[OK] Tool get_chat_session_context executada com sucesso:\n{tool_context_res}")

        # --- TESTE 6: Isolamento Multi-Tenant Estrito ---
        print("\n--- Teste 6: Garantia de Isolamento Multi-Tenant ---")
        other_uid = str(uuid.uuid4())
        cross_user_matches = await search_user_chat_history(
            pool=conn,
            user_id=other_uid,
            query="ESP32",
            limit=5,
        )
        assert len(cross_user_matches) == 0, f"Vazou contexto de outro usuário! Retornou: {cross_user_matches}"
        print("[OK] Usuário B não consegue enxergar mensagens do Usuário A.")

    finally:
        # Limpeza dos dados de teste
        print("\n[TEARDOWN] Limpando dados gerados no teste...")
        await conn.execute('DELETE FROM public."UserMemory" WHERE user_id = $1', test_uid)
        await conn.execute("DELETE FROM public.chat_messages WHERE user_id = $1", test_uid)
        await conn.execute("DELETE FROM public.chat_sessions WHERE user_id = $1", test_uid)
        await conn.close()
        print("[TEARDOWN OK] Banco de dados limpo.")


if __name__ == "__main__":
    asyncio.run(test_all())
