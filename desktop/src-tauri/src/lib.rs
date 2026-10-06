use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

pub mod system;

#[derive(Serialize, Clone, Copy)]
pub struct SystemMetrics {
    pub cpu_percent: f32,
    pub memory_used_gb: f32,
    pub memory_total_gb: f32,
    pub memory_percent: f32,
}

#[cfg(windows)]
#[repr(C)]
struct MEMORYSTATUSEX {
    dw_length: u32,
    dw_memory_load: u32,
    ull_total_phys: u64,
    ull_avail_phys: u64,
    ull_total_page_file: u64,
    ull_avail_page_file: u64,
    ull_total_virtual: u64,
    ull_avail_virtual: u64,
    ull_avail_extended_virtual: u64,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct FILETIME {
    dw_low_date_time: u32,
    dw_high_date_time: u32,
}

#[cfg(windows)]
#[repr(C)]
struct POINT {
    x: i32,
    y: i32,
}

#[cfg(windows)]
#[repr(C)]
struct MSG {
    hwnd: *mut std::ffi::c_void,
    message: u32,
    w_param: usize,
    l_param: isize,
    time: u32,
    pt: POINT,
}

#[cfg(windows)]
extern "system" {
    fn GlobalMemoryStatusEx(lp_buffer: *mut MEMORYSTATUSEX) -> i32;
    fn GetSystemTimes(
        lp_idle_time: *mut FILETIME,
        lp_kernel_time: *mut FILETIME,
        lp_user_time: *mut FILETIME,
    ) -> i32;
    fn RegisterHotKey(hWnd: *mut std::ffi::c_void, id: i32, fsModifiers: u32, vk: u32) -> i32;
    fn UnregisterHotKey(hWnd: *mut std::ffi::c_void, id: i32) -> i32;
    fn GetMessageW(
        lpMsg: *mut MSG,
        hWnd: *mut std::ffi::c_void,
        wMsgFilterMin: u32,
        wMsgFilterMax: u32,
    ) -> i32;
    fn CreateEventW(lpEventAttributes: *mut std::ffi::c_void, bManualReset: i32, bInitialState: i32, lpName: *const u16) -> *mut std::ffi::c_void;
    fn WaitForSingleObject(hHandle: *mut std::ffi::c_void, dwMilliseconds: u32) -> u32;
    fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
}

#[cfg(windows)]
fn filetime_to_u64(ft: FILETIME) -> u64 {
    ((ft.dw_high_date_time as u64) << 32) | (ft.dw_low_date_time as u64)
}

struct CpuState {
    last_idle: u64,
    last_kernel: u64,
    last_user: u64,
    last_percent: f32,
}

static CPU_STATE: Mutex<Option<CpuState>> = Mutex::new(None);

#[tauri::command]
fn get_system_metrics() -> SystemMetrics {
    #[cfg(windows)]
    unsafe {
        let mut mem: MEMORYSTATUSEX = std::mem::zeroed();
        mem.dw_length = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        let mut total_gb = 16.0f32;
        let mut used_gb = 4.0f32;
        let mut mem_percent = 25.0f32;

        if GlobalMemoryStatusEx(&mut mem) != 0 {
            let total = mem.ull_total_phys as f32 / (1024.0 * 1024.0 * 1024.0);
            let avail = mem.ull_avail_phys as f32 / (1024.0 * 1024.0 * 1024.0);
            let used = (total - avail).max(0.0);
            total_gb = (total * 10.0).round() / 10.0;
            used_gb = (used * 10.0).round() / 10.0;
            mem_percent = mem.dw_memory_load as f32;
        }

        let mut idle = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        let mut cpu_percent = 5.0f32;

        if GetSystemTimes(&mut idle, &mut kernel, &mut user) != 0 {
            let cur_idle = filetime_to_u64(idle);
            let cur_kernel = filetime_to_u64(kernel);
            let cur_user = filetime_to_u64(user);

            let mut state = CPU_STATE.lock().unwrap();
            if let Some(prev) = state.as_mut() {
                let idle_diff = cur_idle.saturating_sub(prev.last_idle);
                let kernel_diff = cur_kernel.saturating_sub(prev.last_kernel);
                let user_diff = cur_user.saturating_sub(prev.last_user);
                let total_diff = kernel_diff + user_diff;

                if total_diff > 0 {
                    let busy = total_diff.saturating_sub(idle_diff);
                    let pct = (busy as f32 / total_diff as f32) * 100.0;
                    cpu_percent = (pct * 10.0).round() / 10.0;
                    prev.last_percent = cpu_percent;
                } else {
                    cpu_percent = prev.last_percent;
                }

                prev.last_idle = cur_idle;
                prev.last_kernel = cur_kernel;
                prev.last_user = cur_user;
            } else {
                *state = Some(CpuState {
                    last_idle: cur_idle,
                    last_kernel: cur_kernel,
                    last_user: cur_user,
                    last_percent: 5.0,
                });
            }
        }

        SystemMetrics {
            cpu_percent: cpu_percent.clamp(0.0, 100.0),
            memory_used_gb: used_gb,
            memory_total_gb: total_gb,
            memory_percent: mem_percent,
        }
    }

    #[cfg(not(windows))]
    {
        SystemMetrics {
            cpu_percent: 0.0,
            memory_used_gb: 0.0,
            memory_total_gb: 0.0,
            memory_percent: 0.0,
        }
    }
}

/// Abre e traz a janela principal completa para a frente
#[tauri::command]
fn open_main_window(app: tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Oculta a mini paleta Spotlight
#[tauri::command]
fn hide_spotlight(app: tauri::AppHandle) {
    if let Some(spotlight) = app.get_webview_window("spotlight") {
        let _ = spotlight.hide();
    }
}

/// Minimiza a janela que chamou o comando
#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

/// Alterna maximização da janela
#[tauri::command]
fn toggle_maximize_window(window: tauri::Window) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

/// Fecha a janela (que respeita o interceptor de bandeja)
#[tauri::command]
fn close_window(window: tauri::Window) {
    let _ = window.close();
}

fn resolve_local_user_path(input_path: &str) -> std::path::PathBuf {
    use std::path::{Path, PathBuf};

    let trimmed = input_path.trim().trim_matches('\'').trim_matches('"');
    let mut clean = trimmed;
    for prefix in &[
        "pasta do ", "pasta da ", "pasta de ", "pasta ",
        "diretório do ", "diretório da ", "diretório ",
        "diretorio do ", "diretorio da ", "diretorio ",
        "folder ",
    ] {
        if clean.to_lowercase().starts_with(prefix) {
            clean = &clean[prefix.len()..];
            break;
        }
    }
    clean = clean.trim().trim_matches('\'').trim_matches('"');

    let lower = clean.to_lowercase();
    let home = std::env::var("USERPROFILE").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("C:\\"));
    let onedrive = std::env::var("OneDrive").map(PathBuf::from).unwrap_or_else(|_| home.join("OneDrive"));

    let desktop_dir = if onedrive.join("Desktop").exists() {
        onedrive.join("Desktop")
    } else if onedrive.join("Área de Trabalho").exists() {
        onedrive.join("Área de Trabalho")
    } else if home.join("Desktop").exists() {
        home.join("Desktop")
    } else {
        home.join("Área de Trabalho")
    };

    let docs_dir = if onedrive.join("Documentos").exists() {
        onedrive.join("Documentos")
    } else if onedrive.join("Documents").exists() {
        onedrive.join("Documents")
    } else if home.join("Documentos").exists() {
        home.join("Documentos")
    } else {
        home.join("Documents")
    };

    let downloads_dir = home.join("Downloads");

    if clean.is_empty() || clean == "." {
        return desktop_dir;
    }

    if lower == "desktop" || lower == "área de trabalho" || lower == "area de trabalho" {
        return desktop_dir;
    }
    if lower == "documentos" || lower == "documents" {
        return docs_dir;
    }
    if lower == "downloads" {
        return downloads_dir;
    }

    for prefix in &["desktop/", "desktop\\", "área de trabalho/", "área de trabalho\\", "area de trabalho/", "area de trabalho\\"] {
        if lower.starts_with(prefix) {
            let sub = &clean[prefix.len()..];
            return desktop_dir.join(sub);
        }
    }
    for prefix in &["documentos/", "documentos\\", "documents/", "documents\\"] {
        if lower.starts_with(prefix) {
            let sub = &clean[prefix.len()..];
            return docs_dir.join(sub);
        }
    }
    for prefix in &["downloads/", "downloads\\"] {
        if lower.starts_with(prefix) {
            let sub = &clean[prefix.len()..];
            return downloads_dir.join(sub);
        }
    }

    let p = Path::new(clean);
    if p.is_absolute() {
        return p.to_path_buf();
    }

    desktop_dir.join(clean)
}

#[tauri::command]
fn create_local_directory(path: String) -> Result<String, String> {
    let target = resolve_local_user_path(&path);
    std::fs::create_dir_all(&target).map_err(|e| format!("Erro ao criar pasta: {}", e))?;
    Ok(format!("Pasta criada com sucesso em: {}", target.display()))
}

#[tauri::command]
fn write_local_file(path: String, content: String) -> Result<String, String> {
    let target = resolve_local_user_path(&path);
    if let Some(parent) = target.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&target, content).map_err(|e| format!("Erro ao escrever arquivo: {}", e))?;
    Ok(format!("Arquivo gravado com sucesso em: {}", target.display()))
}

#[tauri::command]
fn system_power_action_native(action: String) -> Result<String, String> {
    let act = action.to_lowercase();
    match act.as_str() {
        "lock" => {
            #[cfg(windows)]
            {
                use std::process::Command;
                let _ = Command::new("rundll32.exe")
                    .args(&["user32.dll,LockWorkStation"])
                    .spawn();
                Ok("Computador bloqueado com sucesso.".into())
            }
            #[cfg(not(windows))]
            {
                Ok("Bloqueio de tela não suportado neste OS.".into())
            }
        }
        "sleep" => {
            #[cfg(windows)]
            {
                use std::process::Command;
                let _ = Command::new("rundll32.exe")
                    .args(&["powrprof.dll,SetSuspendState", "0,1,0"])
                    .spawn();
                Ok("Comando de suspensão enviado.".into())
            }
            #[cfg(not(windows))]
            {
                Ok("Suspensão não suportada neste OS.".into())
            }
        }
        _ => Ok(format!("Ação '{}' executada.", action)),
    }
}

#[tauri::command]
fn set_system_volume_native(level: Option<i32>, mute: Option<bool>) -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        if let Some(m) = mute {
            unsafe {
                extern "system" {
                    fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
                }
                keybd_event(0xAD, 0, 0, 0);
                keybd_event(0xAD, 0, 2, 0);
            }
            return Ok(if m { "Áudio mutado com sucesso." } else { "Áudio desmutado com sucesso." }.into());
        }
        if let Some(lvl) = level {
            let steps = (lvl / 2).max(0).min(50);
            let script = format!(
                "$obj = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object {{ $obj.SendKeys([char]174) }}; 1..{} | ForEach-Object {{ $obj.SendKeys([char]175) }}",
                steps
            );
            let _ = Command::new("powershell")
                .args(&["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
                .spawn();
            return Ok(format!("Volume ajustado para aproximadamente {}%.", lvl));
        }
        Ok("Nenhum parâmetro de volume fornecido.".into())
    }
    #[cfg(not(windows))]
    {
        Ok("Controle de volume não suportado neste OS.".into())
    }
}

#[derive(Serialize)]
pub struct CommandExecutionResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub success: bool,
    pub execution_time_ms: u64,
}

#[derive(Serialize)]
pub struct LocalFileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_at: Option<String>,
}

#[derive(Serialize)]
pub struct LocalProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub memory_mb: f32,
    pub status: String,
}

#[tauri::command]
fn execute_system_command(command: String, cwd: Option<String>) -> Result<CommandExecutionResult, String> {
    let start = std::time::Instant::now();
    let working_dir = cwd.map(|c| resolve_local_user_path(&c));

    #[cfg(windows)]
    {
        use std::process::Command;
        let mut cmd = Command::new("powershell.exe");
        cmd.args(&["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &command]);
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        let output = cmd.output().map_err(|e| format!("Erro ao executar comando: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);
        let duration = start.elapsed().as_millis() as u64;

        Ok(CommandExecutionResult {
            stdout,
            stderr,
            exit_code,
            success: output.status.success(),
            execution_time_ms: duration,
        })
    }

    #[cfg(not(windows))]
    {
        use std::process::Command;
        let mut cmd = Command::new("sh");
        cmd.args(&["-c", &command]);
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }

        let output = cmd.output().map_err(|e| format!("Erro ao executar comando: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let exit_code = output.status.code().unwrap_or(-1);
        let duration = start.elapsed().as_millis() as u64;

        Ok(CommandExecutionResult {
            stdout,
            stderr,
            exit_code,
            success: output.status.success(),
            execution_time_ms: duration,
        })
    }
}

#[tauri::command]
fn read_local_file(path: String, max_bytes: Option<usize>) -> Result<String, String> {
    let target = resolve_local_user_path(&path);
    if !target.exists() {
        return Err(format!("Arquivo não encontrado: {}", target.display()));
    }
    if target.is_dir() {
        return Err(format!("O caminho especificado é um diretório: {}", target.display()));
    }

    let metadata = std::fs::metadata(&target).map_err(|e| format!("Erro ao ler metadados: {}", e))?;
    let limit = max_bytes.unwrap_or(256 * 1024);
    if metadata.len() as usize > limit {
        use std::io::Read;
        let mut file = std::fs::File::open(&target).map_err(|e| format!("Erro ao abrir arquivo: {}", e))?;
        let mut buffer = vec![0; limit];
        let bytes_read = file.read(&mut buffer).map_err(|e| format!("Erro ao ler buffer: {}", e))?;
        let text = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
        return Ok(format!("{}\n\n[... Truncado em {} KB de {} KB ...]", text, limit / 1024, metadata.len() / 1024));
    }

    let bytes = std::fs::read(&target).map_err(|e| format!("Erro ao ler arquivo: {}", e))?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

#[tauri::command]
fn list_local_directory(path: String) -> Result<Vec<LocalFileInfo>, String> {
    let target = resolve_local_user_path(&path);
    if !target.exists() {
        return Err(format!("Diretório não encontrado: {}", target.display()));
    }
    if !target.is_dir() {
        return Err(format!("O caminho não é um diretório: {}", target.display()));
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(&target).map_err(|e| format!("Erro ao listar diretório: {}", e))?;

    for entry in read_dir.flatten() {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry_path.is_dir();
        let size = if is_dir { 0 } else { entry.metadata().map(|m| m.len()).unwrap_or(0) };
        let modified_at = entry.metadata().ok().and_then(|m| m.modified().ok()).map(|time| {
            let duration = time.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
            format!("{}", duration.as_secs())
        });

        entries.push(LocalFileInfo {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_dir,
            size,
            modified_at,
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
fn get_process_list() -> Result<Vec<LocalProcessInfo>, String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let script = r#"Get-Process | Where-Object { $_.Id -gt 0 -and $_.ProcessName -ne 'Idle' } | Sort-Object CPU -Descending | Select-Object -First 30 Id, ProcessName, CPU, WorkingSet64 | ForEach-Object { "$($_.Id)|$($_.ProcessName)|$([math]::Round($_.CPU, 1))|$([math]::Round($_.WorkingSet64 / 1MB, 1))" }"#;

        let output = Command::new("powershell.exe")
            .args(&["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
            .output()
            .map_err(|e| format!("Erro ao obter processos: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout);
        let mut list = Vec::new();

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 4 {
                let pid = parts[0].trim().parse::<u32>().unwrap_or(0);
                let name = parts[1].trim().to_string();
                let cpu = parts[2].trim().parse::<f32>().unwrap_or(0.0);
                let memory_mb = parts[3].trim().parse::<f32>().unwrap_or(0.0);

                list.push(LocalProcessInfo {
                    pid,
                    name,
                    cpu,
                    memory_mb,
                    status: "RUNNING".to_string(),
                });
            }
        }

        Ok(list)
    }

    #[cfg(not(windows))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn start_local_backend() -> Result<String, String> {
    if std::net::TcpStream::connect("127.0.0.1:8005").is_ok() {
        return Ok("Backend já está em execução na porta 8005.".to_string());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::path::PathBuf;
        use std::process::Stdio;

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const DETACHED_PROCESS: u32 = 0x00000008;

        // Lista abrangente de diretórios candidatos para a raiz do assistente
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Ok(dir) = std::env::var("CHARLIE_PROJECT_DIR") {
            if !dir.is_empty() {
                candidates.push(PathBuf::from(dir));
            }
        }
        candidates.push(PathBuf::from(r"C:\Users\lucas\OneDrive\Documentos\assistente"));
        if let Ok(cur) = std::env::current_dir() {
            candidates.push(cur.clone());
            if let Some(parent) = cur.parent() {
                candidates.push(parent.to_path_buf());
                if let Some(grandparent) = parent.parent() {
                    candidates.push(grandparent.to_path_buf());
                }
            }
        }

        // Localiza a raiz do projeto que contém api/main.py
        let found_root = candidates.into_iter().find(|p| p.join("api").join("main.py").exists());

        if let Some(root) = found_root {
            // 1. Prioridade absoluta: Python do ambiente virtual com todas as dependências instaladas
            let venv_py = root.join(".venv").join("Scripts").join("python.exe");
            let venv_py2 = root.join("venv").join("Scripts").join("python.exe");
            let python_path = if venv_py.exists() {
                Some(venv_py)
            } else if venv_py2.exists() {
                Some(venv_py2)
            } else {
                None
            };

            if let Some(py) = python_path {
                let _ = std::process::Command::new(py)
                    .args(["-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8005"])
                    .current_dir(&root)
                    .env("HOST", "0.0.0.0")
                    .env("PORT", "8005")
                    .env("ENV", "production")
                    .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| format!("Falha ao iniciar processo Python local: {}", e))?;

                return Ok("Serviço Python local (.venv) inicializado com sucesso na porta 8005.".to_string());
            }

            // 2. Fallback: uv instalado no usuário
            let uv_path = PathBuf::from(r"C:\Users\lucas\.local\bin\uv.exe");
            if uv_path.exists() {
                let _ = std::process::Command::new(uv_path)
                    .args(["run", "python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8005"])
                    .current_dir(&root)
                    .env("HOST", "0.0.0.0")
                    .env("PORT", "8005")
                    .env("ENV", "production")
                    .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|e| format!("Falha ao iniciar uv: {}", e))?;

                return Ok("Serviço Charlie via uv inicializado com sucesso.".to_string());
            }

            // 3. Fallback: PowerShell Start-Process desvinculado
            let ps_script = format!(
                r#"Start-Process -FilePath "uv" -ArgumentList "run python -m uvicorn api.main:app --host 0.0.0.0 --port 8005" -WorkingDirectory "{}" -WindowStyle Hidden"#,
                root.display()
            );
            let _ = std::process::Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();

            return Ok("Inicialização delegada com sucesso ao PowerShell.".to_string());
        }

        Err("Diretório raiz da API do Charlie não encontrado no disco.".into())
    }
    #[cfg(not(windows))]
    {
        Err("Inicialização local suportada apenas no Windows.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_metrics,
            open_main_window,
            hide_spotlight,
            minimize_window,
            toggle_maximize_window,
            close_window,
            create_local_directory,
            write_local_file,
            system_power_action_native,
            set_system_volume_native,
            execute_system_command,
            read_local_file,
            list_local_directory,
            get_process_list,
            system::get_system_stats,
            system::set_system_volume,
            system::toggle_mute,
            system::send_media_key,
            system::send_media_control,
            system::lock_workstation,
            system::minimize_all_windows,
            system::take_screenshot,
            system::open_path_or_app,
            system::get_local_ip,
            start_local_backend
        ])
        .setup(|app| {
            // Tenta inicializar o backend Python local (porta 8005) em background se disponível
            std::thread::spawn(|| {
                let _ = start_local_backend();
            });

            // Listener de ativação inter-processos (quando o usuário clica no atalho com app já aberto/oculto)
            #[cfg(windows)]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    unsafe {
                        let event_name: Vec<u16> = "Local\\CharlieShowMainWindowEvent\0".encode_utf16().collect();
                        let event = CreateEventW(std::ptr::null_mut(), 0, 0, event_name.as_ptr());
                        if !event.is_null() {
                            while WaitForSingleObject(event, 0xFFFFFFFF) == 0 {
                                if let Some(window) = handle.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                            CloseHandle(event);
                        }
                    }
                });
            }

            // Cria menu do System Tray (Bandeja)
            let open_item = MenuItem::with_id(app, "open", "Abrir Charlie Completo", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            // Cria o ícone na bandeja do Windows
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Registra o Atalho Global do Sistema Operacional (Ctrl + Alt + Espaço)
            // Abre EXCLUSIVAMENTE a mini paleta flutuante (Charlie Spotlight)
            #[cfg(windows)]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    unsafe {
                        let hotkey_id = 9001;
                        // MOD_ALT (0x0001) | MOD_CONTROL (0x0002) | MOD_NOREPEAT (0x4000)
                        // VK_SPACE = 0x20
                        let mut reg = RegisterHotKey(std::ptr::null_mut(), hotkey_id, 0x0001 | 0x0002 | 0x4000, 0x20);
                        if reg == 0 {
                            reg = RegisterHotKey(std::ptr::null_mut(), hotkey_id, 0x0001 | 0x0002, 0x20);
                        }

                        if reg != 0 {
                            let mut msg: MSG = std::mem::zeroed();
                            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                                if msg.message == 0x0312 { // WM_HOTKEY
                                    if let Some(spotlight) = handle.get_webview_window("spotlight") {
                                        let is_visible = spotlight.is_visible().unwrap_or(false);
                                        let is_focused = spotlight.is_focused().unwrap_or(false);

                                        if is_visible && is_focused {
                                            // Se já está aberta e em foco, alterna e oculta
                                            let _ = spotlight.hide();
                                        } else {
                                            // Mostra apenas a mini paleta flutuante centralizada
                                            let _ = spotlight.center();
                                            let _ = spotlight.show();
                                            let _ = spotlight.unminimize();
                                            let _ = spotlight.set_focus();
                                            let _ = spotlight.emit("open-spotlight", ());
                                        }
                                    }
                                }
                            }
                            UnregisterHotKey(std::ptr::null_mut(), hotkey_id);
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "spotlight" {
                // Ao perder foco (blur), fecha a mini paleta instantaneamente
                if let WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            } else if window.label() == "main" {
                // Ao fechar a janela principal, minimiza para a bandeja
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
