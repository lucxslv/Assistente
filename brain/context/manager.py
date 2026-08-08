from datetime import datetime
import platform

class ContextManager:
    def build_context(self) -> str:
        now = datetime.now()
        os_info = platform.system()
        return f'1. Data/Hora Atuais: {now}\n2. SO: {os_info}'
