import { invoke } from "@tauri-apps/api/core";

interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  success: boolean;
  execution_time_ms: number;
}

interface YoutubeMedia {
  title: string;
  url: string;
  userAgent?: string;
}

const PID_KEY = "charlie_music_vlc_pid";
const VOLUME_KEY = "charlie_music_volume";

function ps(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function run(command: string): Promise<CommandExecutionResult> {
  try {
    return await invoke<CommandExecutionResult>("execute_system_command", {
      command,
      cwd: null,
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

function requireSuccess(result: CommandExecutionResult, action: string): CommandExecutionResult {
  if (!result.success) {
    throw new Error(`${action}: ${result.stderr.trim() || `código ${result.exit_code}`}`);
  }
  return result;
}

function storedVolume(): number {
  const raw = Number(localStorage.getItem(VOLUME_KEY) || "80");
  return Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 80;
}

async function activeVlcPid(): Promise<number | null> {
  const raw = localStorage.getItem(PID_KEY);
  const pid = raw ? Number(raw) : 0;
  if (!Number.isInteger(pid) || pid <= 0) return null;

  const result = await run(
    `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
    `if ($p -and $p.ProcessName -ieq 'vlc') { $p.Id }`
  );
  const value = result.stdout.trim();
  if (result.success && /^\d+$/.test(value)) return Number(value);

  localStorage.removeItem(PID_KEY);
  return null;
}

async function stopActiveVlc(): Promise<boolean> {
  const pid = await activeVlcPid();
  if (!pid) return false;
  const result = await run(`Stop-Process -Id ${pid} -ErrorAction Stop`);
  requireSuccess(result, "Falha ao parar o VLC");
  localStorage.removeItem(PID_KEY);
  return true;
}

async function findVlcPath(): Promise<string> {
  const result = await run(`
    $paths = @(
      'C:/Program Files/VideoLAN/VLC/vlc.exe',
      'C:/Program Files (x86)/VideoLAN/VLC/vlc.exe'
    )
    foreach ($path in $paths) {
      if (Test-Path $path) { $path; exit 0 }
    }
    $cmd = Get-Command vlc.exe -ErrorAction SilentlyContinue
    if ($cmd) { $cmd.Source; exit 0 }
  `);
  const path = result.stdout.trim().split(/\r?\n/)[0];
  if (!result.success || !path) {
    throw new Error("VLC não encontrado. Instale o VLC para reproduzir música em background.");
  }
  return path;
}

async function resolveYoutubeMedia(query: string): Promise<YoutubeMedia> {
  const args = [
    ps(`ytsearch1:${query}`),
    ps("--dump-single-json"),
    ps("--no-playlist"),
    ps("-f"),
    ps("bestaudio/best"),
    ps("--no-warnings"),
  ].join(",");
  const result = await run(`
    $ErrorActionPreference = 'Stop'
    $mediaArgs = @(${args})
    $yt = Get-Command yt-dlp -ErrorAction SilentlyContinue
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($yt) {
      & $yt.Source @mediaArgs
    } elseif ($uv) {
      & $uv.Source tool run yt-dlp @mediaArgs
    } elseif ($python) {
      & $python.Source -m yt_dlp @mediaArgs
    } else {
      throw 'yt-dlp não encontrado; instale yt-dlp ou uv.'
    }
  `);
  requireSuccess(result, "Falha ao buscar a música no YouTube");

  let info: any;
  try {
    info = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error("yt-dlp retornou uma resposta inválida.");
  }
  const entry = info?._type === "playlist" ? info?.entries?.[0] : info;
  if (!entry) throw new Error("Não encontrei nenhuma música com esse nome.");

  let streamUrl = entry.url as string | undefined;
  if (!streamUrl && Array.isArray(entry.formats)) {
    const formats = entry.formats
      .filter((f: any) => f.url && f.acodec !== "none")
      .sort((a: any, b: any) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
    streamUrl = formats[0]?.url;
  }
  if (!streamUrl) throw new Error("Não encontrei um stream de áudio utilizável.");

  return {
    title: String(entry.title || query),
    url: streamUrl,
    userAgent: entry.http_headers?.["User-Agent"],
  };
}

export async function playMusic(query: string): Promise<string> {
  const clean = query.trim();
  if (!clean) return "Erro: informe a música ou o artista que deseja ouvir.";

  await stopActiveVlc();
  const [vlcPath, media] = await Promise.all([findVlcPath(), resolveYoutubeMedia(clean)]);
  const vlcArgs = [
    "--no-video",
    "--quiet",
    "--network-caching=1000",
    `--volume=${Math.round(storedVolume() * 2.56)}`,
  ];
  if (media.userAgent) vlcArgs.push(`--http-user-agent=${media.userAgent}`);
  vlcArgs.push(media.url);

  const result = await run(`
    $p = Start-Process -FilePath ${ps(vlcPath)} -ArgumentList @(${vlcArgs.map(ps).join(",")}) -PassThru
    Start-Sleep -Milliseconds 750
    if (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) {
      $p.Id
    } else {
      throw 'O VLC encerrou antes de iniciar a reprodução.'
    }
  `);
  requireSuccess(result, "Falha ao iniciar o VLC");

  const pid = result.stdout.trim();
  if (!/^\d+$/.test(pid)) throw new Error("Não foi possível confirmar o processo do VLC.");
  localStorage.setItem(PID_KEY, pid);
  return `Tocando agora: ${media.title}`;
}

export async function pauseMusic(): Promise<string> {
  if (!(await activeVlcPid())) return "Nenhuma música está tocando.";
  await invoke("send_media_key", { key: "play_pause" });
  return "Música pausada.";
}

export async function resumeMusic(): Promise<string> {
  if (!(await activeVlcPid())) return "Nenhuma música está tocando.";
  await invoke("send_media_key", { key: "play_pause" });
  return "Música retomada.";
}

export async function stopMusic(): Promise<string> {
  if (!(await stopActiveVlc())) return "Nenhuma música está tocando.";
  return "Música parada.";
}

export async function setMusicVolume(level: number): Promise<string> {
  const safe = Number.isFinite(level) ? Math.max(0, Math.min(100, Math.round(level))) : 80;
  localStorage.setItem(VOLUME_KEY, String(safe));
  await invoke("set_system_volume", { level: safe });
  return `Volume do sistema ajustado para ${safe}%.`;
}
