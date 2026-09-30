"""Teste automatizado de isolamento estrito de dados entre contas (Multi-tenancy)."""

import asyncio
import uuid
from httpx import ASGITransport, AsyncClient
from api.main import app
from api.db import get_or_init_db_pool

USER1_ID = "5451c1b4-b5f8-4193-a643-bce1b96a901e"
USER1_EMAIL = "lucassilvacosta060@gmail.com"

USER2_ID = "e50ad90e-7bed-4c0f-a550-1b3e6b1aea53"
USER2_EMAIL = "lucas.teste.charlie@gmail.com"

# Criamos tokens JWT sintéticos simulando Supabase Auth para teste direto
import base64
import json
import time

def make_test_jwt(user_id: str, email: str, name: str) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({
        "sub": user_id,
        "email": email,
        "user_metadata": {"name": name},
        "exp": int(time.time()) + 3600,
    }).encode()).decode().rstrip("=")
    sig = "mock_sig_1234567890abcdef"
    return f"{header}.{payload}.{sig}"

async def main():
    token_u1 = make_test_jwt(USER1_ID, USER1_EMAIL, "Garoto de programa")
    token_u2 = make_test_jwt(USER2_ID, USER2_EMAIL, "Lucas Teste")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Limpeza prévia para garantir estado limpo do Usuário 2
        res_pre = await ac.get("/api/threads", headers={"Authorization": f"Bearer {token_u2}"})
        if res_pre.status_code == 200:
            for t in res_pre.json():
                await ac.delete(f"/api/threads/{t['id']}", headers={"Authorization": f"Bearer {token_u2}"})

        print("\n--- Teste 1: Acesso sem autenticação ---")
        res = await ac.get("/api/threads")
        assert res.status_code == 401, f"Esperado 401, obtido {res.status_code}"
        print("[OK] Requisição sem token bloqueada com 401 Unauthorized!")

        print("\n--- Teste 2: Listagem de conversas do Usuário 1 ---")
        res1 = await ac.get("/api/threads", headers={"Authorization": f"Bearer {token_u1}"})
        assert res1.status_code == 200, f"Erro: {res1.text}"
        threads_u1 = res1.json()
        print(f"[OK] Usuário 1 listou {len(threads_u1)} conversas.")
        assert len(threads_u1) > 0, "Usuário 1 deveria ter suas conversas migradas."
        u1_first_thread_id = threads_u1[0]["id"]

        print("\n--- Teste 3: Listagem de conversas do Usuário 2 ---")
        res2 = await ac.get("/api/threads", headers={"Authorization": f"Bearer {token_u2}"})
        assert res2.status_code == 200, f"Erro: {res2.text}"
        threads_u2 = res2.json()
        print(f"[OK] Usuário 2 listou {len(threads_u2)} conversas.")
        assert len(threads_u2) == 0, f"Usuário 2 NÃO deveria ver conversas do Usuário 1! Viu: {len(threads_u2)}"

        print("\n--- Teste 4: Usuário 2 tenta ler mensagens de uma conversa do Usuário 1 ---")
        res_cross = await ac.get(f"/api/messages?thread_id={u1_first_thread_id}", headers={"Authorization": f"Bearer {token_u2}"})
        assert res_cross.status_code == 404, f"Esperado 404, obtido {res_cross.status_code}"
        print("[OK] Usuário 2 bloqueado ao tentar espionar mensagens do Usuário 1 (404 Not Found)!")

        print("\n--- Teste 5: Usuário 2 tenta apagar conversa do Usuário 1 ---")
        res_del = await ac.delete(f"/api/threads/{u1_first_thread_id}", headers={"Authorization": f"Bearer {token_u2}"})
        assert res_del.status_code == 404, f"Esperado 404, obtido {res_del.status_code}"
        print("[OK] Usuário 2 impedido de apagar conversa do Usuário 1!")

        print("\n--- Teste 6: Usuário 2 cria sua própria conversa ---")
        res_create = await ac.post("/api/threads", json={"name": "Conversa Secreta do Usuário 2"}, headers={"Authorization": f"Bearer {token_u2}"})
        assert res_create.status_code == 200
        new_u2_thread_id = res_create.json()["id"]
        print(f"[OK] Conversa criada com sucesso para Usuário 2: {new_u2_thread_id}")

        print("\n--- Teste 7: Usuário 1 lista conversas e NÃO vê a conversa do Usuário 2 ---")
        res1_again = await ac.get("/api/threads", headers={"Authorization": f"Bearer {token_u1}"})
        threads_u1_again = res1_again.json()
        u1_ids = [t["id"] for t in threads_u1_again]
        assert new_u2_thread_id not in u1_ids, "Vazamento detectado: Usuário 1 viu a conversa criada pelo Usuário 2!"
        print(f"[OK] Usuário 1 não vê a nova conversa do Usuário 2 (total U1={len(threads_u1_again)})")

        print("\n--- Teste 8: Usuário 2 lista conversas e vê APENAS a sua ---")
        res2_again = await ac.get("/api/threads", headers={"Authorization": f"Bearer {token_u2}"})
        threads_u2_again = res2_again.json()
        assert len(threads_u2_again) == 1 and threads_u2_again[0]["id"] == new_u2_thread_id
        print("\n--- Limpeza: Usuário 2 apaga sua conversa de teste ---")
        del_clean = await ac.delete(f"/api/threads/{new_u2_thread_id}", headers={"Authorization": f"Bearer {token_u2}"})
        assert del_clean.status_code == 200
        print("[OK] Conversa de teste do Usuário 2 limpa com sucesso.")

    print("\n[SUCESSO] TODOS OS TESTES DE SEGURANÇA E ISOLAMENTO PASSARAM COM SUCESSO ABSOLUTO!")

if __name__ == "__main__":
    asyncio.run(main())
