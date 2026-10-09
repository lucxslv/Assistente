"""Parser estruturado de mensagens e separador de metadados do Charlie.

Garante a imutabilidade do conteúdo destinado ao usuário (Markdown, blocos de código,
tipos genéricos TypeScript/Java/C++, delimitadores e tags legítimas), separando
estritamente metadados internos sem destruição de texto por regex.
"""

from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

# Tags internas conhecidas de raciocínio do modelo que não devem ser exibidas ao usuário
INTERNAL_METADATA_TAGS = ("thought", "internal_thought", "thinking", "reflection")


@dataclass
class ParsedMessage:
    """Resultado da separação canônica entre texto de usuário e metadados internos."""
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    internal_thoughts: List[str] = field(default_factory=list)


def parse_assistant_message_content(raw_text: str) -> Tuple[str, Dict[str, Any]]:
    """Extrai metadados de tags internas conhecidas e preserva 100% do conteúdo do usuário.

    Regra arquitetural:
    - O conteúdo destinado ao usuário, incluindo Markdown, blocos de código, tags HTML,
      tipos genéricos (<T, E>, Record<K, V>) e JSONs é IMUTÁVEL.
    - Tags desconhecidas são categoricamente preservadas.
    - Apenas as tags internas explicitamente listadas em INTERNAL_METADATA_TAGS são
      removidas do fluxo de apresentação e armazenadas em metadata.
    """
    if not raw_text:
        return "", {}

    text = raw_text
    internal_thoughts: List[str] = []

    # 1. Extração cirúrgica apenas de tags internas explicitamente registradas
    for tag in INTERNAL_METADATA_TAGS:
        pattern = re.compile(rf"<{tag}>(.*?)</{tag}>", flags=re.DOTALL | re.IGNORECASE)
        for match in pattern.finditer(text):
            thought_content = match.group(1).strip()
            if thought_content:
                internal_thoughts.append(thought_content)
        # Remove apenas a tag interna conhecida
        text = pattern.sub("", text)

        # Remove tags abertas órfãs no início/fim caso o stream tenha sido truncado
        open_tag = f"<{tag}>"
        close_tag = f"</{tag}>"
        if text.startswith(open_tag):
            text = text[len(open_tag):]
        if text.endswith(close_tag):
            text = text[:-len(close_tag)]

    # 2. Remoção segura de linhas de eco de ferramenta na raiz do texto
    # Somente linhas que começam exatamente no início da linha com o marcador de depuração
    cleaned_lines: List[str] = []
    in_code_fence = False

    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_fence = not in_code_fence
            cleaned_lines.append(line)
            continue

        if not in_code_fence:
            # Fora de blocos de código, filtra linhas residuais óbvias de chamada de ferramenta
            if stripped.startswith("Chamando ferramenta:") or stripped.startswith("ToolCall("):
                continue

        cleaned_lines.append(line)

    final_content = "".join(cleaned_lines).strip()

    metadata: Dict[str, Any] = {}
    if internal_thoughts:
        metadata["internal_thoughts"] = internal_thoughts

    return final_content, metadata


# Conjunto de todos os prefixos parciais válidos de tags internas (abertura e fechamento)
_INTERNAL_TAG_PREFIXES = set()
for _t in INTERNAL_METADATA_TAGS:
    for _i in range(1, len(f"<{_t}>") + 1):
        _INTERNAL_TAG_PREFIXES.add(f"<{_t}>"[:_i].lower())
    for _i in range(1, len(f"</{_t}>") + 1):
        _INTERNAL_TAG_PREFIXES.add(f"</{_t}>"[:_i].lower())


class StreamingMessageParser:
    """Parser com estado para processar chunks durante o streaming contínuo.

    Garante que tags internas divididas entre múltiplos chunks não vazem para o cliente,
    enquanto preserva blocos de código e texto sem modificações indevidas.
    """

    def __init__(self) -> None:
        self._buffer: str = ""
        self._in_internal_tag: Optional[str] = None
        self._tag_buffer: str = ""
        self.accumulated_user_content: str = ""
        self.internal_thoughts: List[str] = []

    def feed(self, chunk: str) -> str:
        """Processa um novo pedaço de texto e retorna apenas os tokens que devem ser emitidos ao usuário."""
        if not chunk:
            return ""

        self._buffer += chunk
        emit_text = ""

        while self._buffer or (self._in_internal_tag and self._tag_buffer):
            if self._in_internal_tag is None:
                # Verifica se há início de tag interna completa
                earliest_idx = -1
                found_tag = None

                for tag in INTERNAL_METADATA_TAGS:
                    open_tag = f"<{tag}>"
                    idx = self._buffer.lower().find(open_tag)
                    if idx != -1 and (earliest_idx == -1 or idx < earliest_idx):
                        earliest_idx = idx
                        found_tag = tag

                if earliest_idx == -1:
                    # Nenhuma tag interna conhecida completa; verifica se há um prefixo de tag no fim do buffer
                    last_lt = self._buffer.rfind("<")
                    if last_lt != -1 and self._buffer[last_lt:].lower() in _INTERNAL_TAG_PREFIXES:
                        # Possível tag interna em corte no final do chunk; emite o que está antes
                        emit_part = self._buffer[:last_lt]
                        self._buffer = self._buffer[last_lt:]
                        emit_text += emit_part
                        break
                    else:
                        emit_text += self._buffer
                        self._buffer = ""
                        break
                else:
                    # Emite tudo antes da tag interna
                    emit_text += self._buffer[:earliest_idx]
                    open_tag_len = len(f"<{found_tag}>")
                    self._buffer = self._buffer[earliest_idx + open_tag_len:]
                    self._in_internal_tag = found_tag
                    self._tag_buffer = ""
            else:
                # Estamos dentro de uma tag interna; combina com tag_buffer para não perder fechamento fragmentado
                combined = self._tag_buffer + self._buffer
                close_tag = f"</{self._in_internal_tag}>"
                close_idx = combined.lower().find(close_tag)

                if close_idx != -1:
                    thought = combined[:close_idx]
                    if thought.strip():
                        self.internal_thoughts.append(thought.strip())
                    self._buffer = combined[close_idx + len(close_tag):]
                    self._in_internal_tag = None
                    self._tag_buffer = ""
                else:
                    self._tag_buffer = combined
                    self._buffer = ""
                    break

        self.accumulated_user_content += emit_text
        return emit_text

    def flush(self) -> Tuple[str, Dict[str, Any]]:
        """Finaliza o parsing e retorna o conteúdo completo final e metadados."""
        # Se restou tag aberta órfã no final do stream, fecha e salva em thoughts
        if self._in_internal_tag is not None:
            if self._tag_buffer.strip():
                self.internal_thoughts.append(self._tag_buffer.strip())
            self._in_internal_tag = None
            self._tag_buffer = ""

        # Se restou algo no buffer que não seja tag interna, adiciona ao conteúdo do usuário
        if self._buffer:
            self.accumulated_user_content += self._buffer
            self._buffer = ""

        final_clean, meta = parse_assistant_message_content(self.accumulated_user_content)
        if self.internal_thoughts:
            meta["internal_thoughts"] = self.internal_thoughts
        return final_clean, meta
