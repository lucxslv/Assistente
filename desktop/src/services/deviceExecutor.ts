import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  success: boolean;
  execution_time_ms: number;
}

export interface LocalFileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_at?: string;
}

export interface LocalProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory_mb: number;
  status: string;
}

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

export async function executeSystemCommand(
  command: string,
  cwd?: string
): Promise<CommandExecutionResult> {
  try {
    return await invoke<CommandExecutionResult>("execute_system_command", {
      command,
      cwd: cwd || null,
    });
  } catch (err: any) {
    return {
      stdout: "",
      stderr: String(err?.message || err),
      exit_code: -1,
      success: false,
      execution_time_ms: 0,
    };
  }
}

export async function readLocalFile(path: string, maxBytes?: number): Promise<string> {
  return await invoke<string>("read_local_file", {
    path,
    maxBytes: maxBytes || null,
  });
}

export async function listLocalDirectory(path: string): Promise<LocalFileInfo[]> {
  return await invoke<LocalFileInfo[]>("list_local_directory", { path });
}

export async function getRunningProcesses(): Promise<LocalProcessInfo[]> {
  try {
    return await invoke<LocalProcessInfo[]>("get_process_list");
  } catch (err) {
    console.warn("[DeviceExecutor] Erro ao buscar processos nativos:", err);
    return [];
  }
}

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
    if (name === "create_folder" || name === "create_directory") {
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

    if (name === "read_file" || name === "view_file" || name === "cat") {
      const filePath = String(args.path || "");
      const res = await readLocalFile(filePath);
      return res;
    }

    if (name === "list_directory" || name === "file_explorer.list_directory" || name === "ls" || name === "dir") {
      const targetPath = String(args.path || ".");
      const files = await listLocalDirectory(targetPath);
      const summary = files
        .map((f) => `${f.is_dir ? "[DIR]" : "[FILE]"} ${f.name} (${f.size} B)`)
        .join("\n");
      return summary || "Diretório vazio.";
    }

    if (name === "replace_in_file") {
      const filePath = String(args.path || "");
      const targetText = String(args.target_text || "");
      const replacementText = String(args.replacement_text || "");
      const current = await readLocalFile(filePath);
      if (!current.includes(targetText)) {
        return `Erro: Texto alvo '${targetText}' não foi encontrado no arquivo local.`;
      }
      const updated = current.replace(targetText, replacementText);
      await invoke<string>("write_local_file", { path: filePath, content: updated });
      return `Sucesso: Texto substituído com sucesso no arquivo '${filePath}'.`;
    }

    if (
      name === "execute_command" ||
      name === "run_command" ||
      name === "exec_command" ||
      name === "shell_exec" ||
      name === "powershell" ||
      name === "cmd"
    ) {
      const command = String(args.command || args.cmd || "");
      const cwd = args.cwd ? String(args.cwd) : undefined;
      const res = await executeSystemCommand(command, cwd);
      const output = [
        res.stdout ? `STDOUT:\n${res.stdout.trim()}` : "",
        res.stderr ? `STDERR:\n${res.stderr.trim()}` : "",
        `[Código de saída: ${res.exit_code} | Tempo: ${res.execution_time_ms}ms]`,
      ]
        .filter(Boolean)
        .join("\n\n");
      return output;
    }

    if (name === "get_process_list" || name === "ps") {
      const procs = await getRunningProcesses();
      return procs.map((p) => `PID ${p.pid}: ${p.name} (CPU: ${p.cpu}%, MEM: ${p.memory_mb} MB)`).join("\n");
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

    if (name === "take_screenshot" || name === "screenshot") {
      const b64 = await invoke<string>("take_screenshot");
      return b64;
    }

    if (name === "set_system_volume" || name === "volume") {
      const level = args.level !== undefined ? Number(args.level) : 50;
      const res = await invoke<string>("set_system_volume", { level });
      return res;
    }

    if (name === "toggle_mute" || name === "mute") {
      const res = await invoke<string>("toggle_mute");
      return res;
    }

    if (name === "send_media_key" || name === "media") {
      const key = String(args.key || "play_pause");
      const res = await invoke<string>("send_media_key", { key });
      return res;
    }

    if (name === "minimize_all" || name === "minimize_all_windows") {
      const res = await invoke<string>("minimize_all_windows");
      return res;
    }

    if (name === "open_path_or_app" || name === "open") {
      const target = String(args.target || args.path || "");
      const res = await invoke<string>("open_path_or_app", { target });
      return res;
    }

    if (name === "lock_workstation" || name === "lock" || name === "system_power_action") {
      const res = await invoke<string>("lock_workstation");
      return res;
    }
  } catch (err: any) {
    console.warn(`[DeviceExecutor] Erro ao executar ${name} via Tauri:`, err);
    return `Falha ao executar ${name}: ${err?.message || err}`;
  }

  return `Comando '${name}' processado no dispositivo.`;
}
