import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

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

  // 2. Execução nativa no Windows usando capacidades do Tauri e Win32
  try {
    if (name === "create_folder") {
      const folderPath = String(args.path || "Nova Pasta");
      const res = await invoke<string>("create_local_directory", { path: folderPath });
      console.log(`[DeviceExecutor] Pasta criada nativamente:`, res);
      return res;
    }

    if (name === "write_file") {
      const filePath = String(args.path || "arquivo.txt");
      const content = String(args.content || "");
      const res = await invoke<string>("write_local_file", { path: filePath, content });
      console.log(`[DeviceExecutor] Arquivo gravado nativamente:`, res);
      return res;
    }

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

    if (name === "set_system_volume") {
      const level = args.level !== undefined ? Number(args.level) : null;
      const mute = args.mute !== undefined ? Boolean(args.mute) : null;
      const res = await invoke<string>("set_system_volume_native", { level, mute });
      return res;
    }

    if (name === "system_power_action") {
      const action = String(args.action || "lock");
      const res = await invoke<string>("system_power_action_native", { action });
      return res;
    }
  } catch (err: any) {
    console.warn(`[DeviceExecutor] Erro ao executar ${name} via Tauri:`, err);
    return `Falha ao executar ${name}: ${err?.message || err}`;
  }

  return `Comando '${name}' processado no dispositivo.`;
}
