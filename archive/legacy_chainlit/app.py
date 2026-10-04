"""Interface web do Assistente usando Chainlit."""

import chainlit as cl
from core.pipeline import AssistantPipeline
import asyncio
from config import config

# O Chainlit exige autenticação para habilitar o Histórico
@cl.password_auth_callback
async def auth_callback(username: str, password: str):
    if username == config.admin_username and password == config.admin_password:
        # Autenticação bem sucedida
        return cl.User(identifier=username)
    return None

@cl.on_chat_start
async def start():
    """Inicializa a sessão do chat e o pipeline."""
    # Instancia o pipeline da assistente para esta sessão
    pipeline = AssistantPipeline()
    cl.user_session.set("pipeline", pipeline)
    
    # Mensagem de boas-vindas
    welcome_msg = "Olá, meu nome é Charlie! Fui recriado com uma nova interface visual.\nComo posso te ajudar hoje?"
    await cl.Message(content=welcome_msg, author="Charlie").send()

from chainlit.types import ThreadDict

@cl.on_chat_resume
async def on_chat_resume(thread: ThreadDict):
    """Quando o usuário clica num chat antigo na barra lateral."""
    pipeline = AssistantPipeline()
    
    # Reconstrói a memória do Charlie baseada no histórico que o Chainlit puxou do banco
    for step in thread["steps"]:
        if step["type"] == "user_message":
            pipeline.memory.add_user(step["output"])
        elif step["type"] == "assistant_message":
            pipeline.memory.add_assistant(step["output"])
            
    cl.user_session.set("pipeline", pipeline)

@cl.on_message
async def main(message: cl.Message):
    """Lida com as mensagens enviadas pelo usuário na UI."""
    pipeline = cl.user_session.get("pipeline")
    
    # Processa a intenção e ferramentas de forma invisível
    # Passamos skip_tts=True para não falar em voz alta no PC por padrão enquanto usa o chat web
    # Se quiser que fale, basta mudar para False
    try:
        reply = await pipeline.run_pipeline(message.content, skip_tts=True)
        await cl.Message(content=reply, author="Charlie").send()
    except Exception as e:
        import traceback
        traceback.print_exc()
        await cl.Message(content=f"Erro interno: {str(e)}", author="System").send()
