from abc import ABC, abstractmethod
from typing import Any

class BaseTool(ABC):
    @property
    @abstractmethod
    def name(self) -> str: pass

    @property
    @abstractmethod
    def description(self) -> str: pass

    @property
    @abstractmethod
    def parameters(self) -> dict[str, Any]: pass

    @abstractmethod
    async def run(self, **kwargs) -> Any: pass
