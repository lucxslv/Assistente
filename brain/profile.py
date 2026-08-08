from dataclasses import dataclass
from config import config

@dataclass
class AssistantProfile:
    name: str = config.assistant_name
    language: str = config.language
    humor: str = 'focada e objetiva'
