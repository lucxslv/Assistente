"""Testes automatizados de segurança, anti-vazamento de infraestrutura e banimento de run_desktop.bat."""

import os
import asyncio
from pathlib import Path
from tools.file_explorer import list_directory, read_file, is_blocked_path
from tools.registry import ToolRegistry, ToolScope
from brain.context.manager import ContextManager
from brain.prompts.prompts import build_system_prompt
from brain.profile import AssistantProfile

async def main():
    print("\n--- Teste 1: Bloqueio de leitura de arquivos sensíveis (.env, config.py) ---")
    res_env = read_file(".env")
    assert "Acesso negado" in res_env or "Erro" in res_env or "não existe" in res_env, f"Falha: {res_env}"
    print(f"[OK] Leitura de .env bloqueada: {res_env}")

    res_code = read_file("api/main.py")
    assert "Acesso negado" in res_code, f"Falha: {res_code}"
    print(f"[OK] Leitura de código interno api/main.py bloqueada: {res_code}")

    print("\n--- Teste 2: Bloqueio de listagem de diretório interno do servidor ---")
    blocked, reason = is_blocked_path(Path.cwd())
    assert blocked, "Falha: Raiz do servidor deveria ser bloqueada!"
    print(f"[OK] Raiz do servidor bloqueada: {reason}")

    res_list_api = list_directory("api")
    assert "Acesso negado" in res_list_api, f"Falha: {res_list_api}"
    print(f"[OK] Listagem de pasta interna 'api' bloqueada: {res_list_api}")

    print("\n--- Teste 3: Ausência total de 'run_desktop.bat' no registry e no prompt ---")
    reg = ToolRegistry()
    # Simula ambiente em nuvem
    os.environ["VERCEL"] = "1"
    tool_res = await reg.execute("list_directory", {"path": "Documentos"})
    assert "run_desktop.bat" not in tool_res, f"Vazou menção ao bat: {tool_res}"
    assert "enviado para o aplicativo Desktop" in tool_res or "Operação restrita" in tool_res, f"Mensagem incorreta: {tool_res}"
    print(f"[OK] Retorno da ferramenta na nuvem limpo e seguro: {tool_res}")

    profile = AssistantProfile()
    ctx_mgr = ContextManager()
    context = ctx_mgr.build_context(user_name="Lucas")
    prompt = build_system_prompt(profile, context, "", reg)
    assert "run_desktop.bat" not in prompt, "Vazou menção ao bat no system prompt!"
    assert "SEGURANÇA, PRIVACIDADE E PROTEÇÃO DA INFRAESTRUTURA" in prompt, "Faltam diretrizes de segurança no prompt!"
    print("[OK] System prompt possui diretrizes estritas e zero menções a scripts legados!")

    print("\n--- Teste 4: Context Manager não vaza hostname ou kernel de contêiner ---")
    assert "Host do Sistema" not in context, "Contexto ainda contém 'Host do Sistema'!"
    assert "Linux" not in context or "Ambiente: Charlie" in context, "Contexto expõe SO do contêiner da nuvem!"
    print(f"[OK] Contexto do sistema higienizado com sucesso:\n{context}")

    print("\n[SUCESSO] TODOS OS TESTES DE SEGURANÇA E NÃO-VAZAMENTO PASSARAM COM 100% DE SUCESSO!")

if __name__ == "__main__":
    asyncio.run(main())
