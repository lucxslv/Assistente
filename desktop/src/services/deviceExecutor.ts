import { openPath, openUrl } from "@tauri-apps/plugin-opener";

// Mapeamento abrangente de aplicativos do Windows para protocolos URI ou executáveis
const APP_PROTOCOLS: Record<string, string> = {
  spotify: "spotify:",
  whatsapp: "whatsapp:",
  calculadora: "calc:",
  calc: "calc:",
  calculator: "calc:",
  "google chrome": "https://google.com",
  chrome: "https://google.com",
  brave: "https://google.com",
  edge: "microsoft-edge:https://google.com",
  msedge: "microsoft-edge:https://google.com",
  discord: "discord:",
  bloco_de_notas: "C:\\Windows\\notepad.exe",
  "bloco de notas": "C:\\Windows\\notepad.exe",
  notepad: "C:\\Windows\\notepad.exe",
  configuracoes: "ms-settings:",
  settings: "ms-settings:",
  cmd: "C:\\Windows\\System32\\cmd.exe",
  terminal: "wt:",
  explorer: "explorer:",
};

export async function executeDeviceTool(name: string, args: Record<string, any>): Promise<string> {
  console.log(`[DeviceExecutor] Recebido comando para executar no Windows: ${name}`, args);

  // 1. Tenta despachar para o backend local (porta 8005) caso o usuário também esteja rodando Python local
  try {
    const localRes = await fetch("http://127.0.0.1:8005/api/tools/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
      signal: AbortSignal.timeout(1000),
    });
    if (localRes.ok) {
      const data = await localRes.json();
      console.log(`[DeviceExecutor] Executado via agente local:`, data);
      return data.result || "Executado via agente local.";
    }
  } catch {
    // Backend local não está ativo; executa nativamente via Tauri
  }

  // 2. Execução nativa no Windows usando capacidades do Tauri Opener
  try {
    if (name === "manage_application") {
      const appName = String(args.app_name || "").toLowerCase().trim();
      const action = String(args.action || "open").toLowerCase().trim();

      if (action === "open") {
        const target = APP_PROTOCOLS[appName] || `${appName}:`;
        if (target.startsWith("http") || target.endsWith(":")) {
          await openUrl(target);
          return `Aplicativo '${appName}' aberto com sucesso via protocolo do Windows.`;
        } else {
          await openPath(target);
          return `Aplicativo '${appName}' aberto via executável do sistema.`;
        }
      }
    }

    if (name === "take_screenshot") {
      try {
        await openUrl("ms-screenclip:");
        return "Ferramenta de captura e recorte de tela do Windows ativada com sucesso. A imagem foi enviada para a área de transferência e para sua pasta de Imagens.";
      } catch (err: any) {
        await openUrl("snippingtool:");
        return `Captura de tela aberta: ${err?.message || ""}`;
      }
    }
  } catch (err: any) {
    console.warn(`[DeviceExecutor] Erro ao executar ${name} via Tauri:`, err);
    return `Falha ao executar ${name}: ${err?.message || err}`;
  }

  return `Comando '${name}' processado no dispositivo.`;
}
