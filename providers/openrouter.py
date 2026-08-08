import json
import httpx
from typing import Any
from config import config
from providers.base import BaseLLMProvider, LLMResponse, ToolCall

class OpenRouterProvider(BaseLLMProvider):
    async def chat(self, system_prompt: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None) -> LLMResponse:
        api_messages = [{'role': 'system', 'content': system_prompt}] + messages
        payload = {
            'model': config.openrouter_model,
            'messages': api_messages
        }
        if tools:
            payload['tools'] = tools
            payload['tool_choice'] = 'auto'
            
        headers = {
            'Authorization': f'Bearer {config.openrouter_api_key}',
            'HTTP-Referer': 'https://github.com/lucxslv/assistente'
        }
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post('https://openrouter.ai/api/v1/chat/completions', json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
            
        msg = data['choices'][0]['message']
        tool_calls = []
        if 'tool_calls' in msg:
            for tc in msg['tool_calls']:
                tool_calls.append(ToolCall(name=tc['function']['name'], arguments=json.loads(tc['function']['arguments'])))
        return LLMResponse(content=msg.get('content'), tool_calls=tool_calls)
