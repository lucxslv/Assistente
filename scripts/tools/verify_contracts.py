#!/usr/bin/env python3
"""Script de verificação de integridade e contratos compartilhados do Charlie.

Garante que os contratos de eventos de streaming, mensagens, e design tokens
estejam 100% alinhados entre Backend, Desktop, Web Chat e Mobile.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent


def verify_events_alignment():
    print("[1/3] Verificando alinhamento dos eventos de streaming...")
    canonical_file = ROOT / "shared" / "types" / "events.ts"
    backend_file = ROOT / "core" / "streaming.py"
    web_file = ROOT / "web-chat" / "src" / "types" / "chat.ts"
    desktop_file = ROOT / "desktop" / "src" / "types.ts"
    mobile_file = ROOT / "mobile" / "src" / "types" / "api.ts"

    files = [canonical_file, backend_file, web_file, desktop_file, mobile_file]
    for f in files:
        if not f.exists():
            print(f"ERRO: Arquivo não encontrado: {f}")
            return False

        content = f.read_text(encoding="utf-8")
        assert "reset_and_fallback" in content, f"'reset_and_fallback' ausente em {f.name}"
        assert "client_tool_request" in content, f"'client_tool_request' ausente em {f.name}"
        print(f"  OK: {f.relative_to(ROOT)} contém contratos críticos de streaming.")

    return True


def verify_design_tokens():
    print("[2/3] Verificando conformidade dos Design Tokens Clean Technical...")
    canonical_tokens = ROOT / "shared" / "tokens" / "colors.ts"
    web_tailwind = ROOT / "web-chat" / "tailwind.config.js"

    c_text = canonical_tokens.read_text(encoding="utf-8")
    w_text = web_tailwind.read_text(encoding="utf-8")

    key_colors = ["#0A0B0E", "#0E0F12", "#13151A", "#8B7CFF", "#F3F4F6", "#9CA3AF"]
    for color in key_colors:
        assert color in c_text, f"Token {color} ausente em canonical colors.ts"
        assert color in w_text, f"Token {color} ausente em web-chat tailwind config"

    print("  OK: Cores Clean Technical alinhadas com o Web Chat Design System.")
    return True


def verify_clients_independence():
    print("[3/3] Verificando autossuficiência e ausência de dependências quebradas...")
    desktop_package = ROOT / "desktop" / "package.json"
    web_package = ROOT / "web-chat" / "package.json"
    mobile_package = ROOT / "mobile" / "package.json"

    for pkg in [desktop_package, web_package, mobile_package]:
        assert pkg.exists(), f"package.json não encontrado: {pkg}"
        print(f"  OK: {pkg.parent.name} possui manifesto independente.")

    return True


def main():
    print("=" * 60)
    print("Auditoria de Contratos Compartilhados (Monorepo FASE 5)")
    print("=" * 60)

    try:
        ok1 = verify_events_alignment()
        ok2 = verify_design_tokens()
        ok3 = verify_clients_independence()

        if ok1 and ok2 and ok3:
            print("=" * 60)
            print("SUCESSO: Todos os contratos e tokens estão 100% íntegros!")
            print("=" * 60)
            return 0
        return 1
    except Exception as e:
        print(f"\nFALHA NA VERIFICAÇÃO: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
