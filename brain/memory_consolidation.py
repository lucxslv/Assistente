"""Consolidação do histórico de curto prazo para memória de longo prazo."""

import logging

logger = logging.getLogger(__name__)

class MemoryConsolidator:
    """Extrai fatos e preferências da conversa do dia antes do encerramento."""

    def __init__(self, pipeline) -> None:
        self.pipeline = pipeline

    async def consolidate(self) -> None:
        """Lê a conversa atual e pede à LLM para extrair memórias usando as ferramentas."""
        messages = self.pipeline.memory.get_messages()
        
        # Filtra apenas mensagens do user e do assistant para não confundir a LLM com resultados de tools de antes
        history = []
        for m in messages:
            if m.get("role") in ["user", "assistant"] and m.get("content"):
                history.append(f"{m['role'].capitalize()}: {m['content']}")

        if not history:
            logger.info("Histórico vazio, nada para consolidar.")
            return

        conversation_text = "\n".join(history)
        
        system_prompt = (
            "Você é o módulo subconsciente de um assistente de IA. "
            "Seu trabalho é ler o histórico de conversa do dia e usar as ferramentas disponíveis "
            "('memorize_fact' e 'memorize_preference') para extrair e salvar informações importantes "
            "sobre o usuário (gostos, nome, profissão, projetos, fatos relevantes).\n"
            "Use as ferramentas rigorosamente se houver informações novas. Se não houver nada de novo ou importante, não use nenhuma ferramenta.\n\n"
            "HISTÓRICO DA CONVERSA:\n" + conversation_text
        )

        # Filtra apenas as ferramentas de memória do registry
        memory_schemas = [
            schema for schema in self.pipeline.tools.get_schemas()
            if schema["function"]["name"] in ["memorize_fact", "memorize_preference"]
        ]

        logger.info("Iniciando reflexão e consolidação de memória...")
        
        try:
            # Enviamos apenas o system_prompt (que já contém o histórico embutido) 
            # e uma mensagem em branco do user para disparar o modelo
            response = await self.pipeline.llm.chat(
                system_prompt=system_prompt,
                messages=[{"role": "user", "content": "Analise o histórico e salve as memórias pertinentes agora."}],
                tools=memory_schemas,
            )

            if response.tool_calls:
                count = 0
                for call in response.tool_calls:
                    if call.name in ["memorize_fact", "memorize_preference"]:
                        await self.pipeline.tools.execute(call.name, call.arguments)
                        count += 1
                logger.info(f"Consolidação concluída. {count} nova(s) memória(s) salva(s).")
            else:
                logger.info("Nenhuma nova memória extraída na consolidação.")

        except Exception as e:
            logger.exception("Erro ao tentar consolidar memórias: %s", e)
