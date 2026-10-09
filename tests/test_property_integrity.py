"""
Testes de propriedades e invariantes de integridade para o parser de mensagens e pipeline do Charlie.

Garante que nenhuma transformação, regex ou chunking corrompa o código original,
generics de TypeScript, uniões de tipos, JSX/HTML em blocos de código ou JSON estruturado.
"""

import pytest
import random
from core.message_parser import parse_assistant_message_content, StreamingMessageParser


def test_property_raw_text_without_internal_tags_is_strictly_invariant():
    """Para qualquer texto sem tags internas conhecidas, parse_assistant_message_content preserva o conteúdo."""
    samples = [
        "export type Result<T, E> = | { ok: true; value: T } | { ok: false; error: E };",
        "Record<string, unknown> e Promise<Result<T, E>> são tipos essenciais.",
        "const mapping: Record<string, any> = { name: 'test', action: 'exec' };",
        "```tsx\nexport function Component() {\n  return <div className=\"box\"><span>Hello</span></div>;\n}\n```",
        "Complex generic: Array<Map<string, Set<number>>> with type constraints <T extends Record<string, any>>",
        "Math comparison: 5 < 10 and 20 > 15; a < b && c > d",
        "Normal conversational text: Olá Charlie! Como está o tempo hoje?",
    ]

    for sample in samples:
        content, metadata = parse_assistant_message_content(sample)
        assert content == sample.strip(), f"Falha na invariante para: {sample}"
        assert "internal_thoughts" not in metadata


def test_property_streaming_reconstruction_identical_to_batch():
    """
    Simula streaming com chunks de tamanhos aleatórios variáveis (1 a 15 caracteres),
    garantindo que o conteúdo final obtido via flush() seja 100% idêntico ao batch.
    """
    test_cases = [
        (
            "<thought>Planejando estrutura segura de tipos</thought>\n"
            "Aqui está o código completo:\n"
            "```typescript\n"
            "export type Result<T, E> =\n"
            "  | { ok: true; value: T }\n"
            "  | { ok: false; error: E };\n"
            "\n"
            "export async function fetchUser(id: string): Promise<Result<User, Error>> {\n"
            "  return { ok: true, value: { id, name: 'Alice' } };\n"
            "}\n"
            "```"
        ),
        (
            "Resposta direta sem pensamento.\n"
            "Verifique `Record<string, unknown>` e `<T extends keyof K>`."
        ),
        (
            "<thought>Pensamento longo com tags falsas como <div> e <span> internamente</thought>\n"
            "Texto após pensamento com <T, E> preservado."
        ),
    ]

    rng = random.Random(42)  # Seed fixa para reproducibilidade determinística

    for full_text in test_cases:
        batch_content, batch_meta = parse_assistant_message_content(full_text)

        # Fuzz de chunks de tamanhos variados
        for _ in range(5):
            stream_parser = StreamingMessageParser()

            idx = 0
            while idx < len(full_text):
                chunk_len = rng.randint(1, 15)
                chunk = full_text[idx : idx + chunk_len]
                idx += chunk_len
                stream_parser.feed(chunk)

            stream_content, stream_meta = stream_parser.flush()
            assert stream_content == batch_content, (
                f"Divergência entre stream e batch!\n"
                f"Stream:\n{stream_content}\n"
                f"Batch:\n{batch_content}"
            )
            assert stream_meta.get("internal_thoughts") == batch_meta.get("internal_thoughts")


def test_property_preserves_json_payloads_with_name_and_action():
    """Garante que payloads contendo name e action não tenham campos expurgados."""
    json_code = """```json
{
  "name": "system_diagnostics",
  "action": "run_full_check",
  "params": {
    "deep": true
  }
}
```"""
    content, _ = parse_assistant_message_content(json_code)
    assert '"name": "system_diagnostics"' in content
    assert '"action": "run_full_check"' in content
    assert content == json_code.strip()


def test_property_preserves_incomplete_or_partial_typescript_signatures():
    """
    Mesmo assinaturas parciais como 'Promise<Result>' ou 'export type Result = |'
    não devem ser truncadas nem sofrer substituição regex.
    """
    tricky_signatures = [
        "export type Result = |",
        "function parse(): Promise<",
        "type Handler = Record<string, ",
        "type State = | 'idle' | 'running' |",
    ]

    for sig in tricky_signatures:
        content, _ = parse_assistant_message_content(sig)
        assert content == sig.strip()
