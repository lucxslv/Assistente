Set WshShell = CreateObject("WScript.Shell")
' Executa o assistente no formato oculto (0)
WshShell.Run "cmd /c uv run python main.py", 0, False
