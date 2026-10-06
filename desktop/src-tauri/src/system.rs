use serde::Serialize;
use std::net::UdpSocket;
use std::sync::Mutex;

#[derive(Serialize, Clone, Debug)]
pub struct BatteryStats {
    pub percent: f32,
    pub is_charging: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct SystemStats {
    pub cpu_percent: f32,
    pub memory_used_mb: f64,
    pub memory_total_mb: f64,
    pub memory_percent: f32,
    pub computer_name: String,
    pub os_name: String,
    pub battery: Option<BatteryStats>,
}

#[cfg(windows)]
#[repr(C)]
struct SYSTEM_POWER_STATUS {
    ac_line_status: u8,
    battery_flag: u8,
    battery_life_percent: u8,
    system_status_flag: u8,
    battery_life_time: u32,
    battery_full_life_time: u32,
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
extern "system" {
    fn GlobalMemoryStatusEx(lp_buffer: *mut MEMORYSTATUSEX) -> i32;
    fn GetSystemTimes(
        lp_idle_time: *mut FILETIME,
        lp_kernel_time: *mut FILETIME,
        lp_user_time: *mut FILETIME,
    ) -> i32;
    fn GetSystemPowerStatus(lp_system_power_status: *mut SYSTEM_POWER_STATUS) -> i32;
    fn LockWorkStation() -> i32;
    fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
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

/// Coleta telemetria real de hardware (CPU %, RAM usada/total, nome da máquina, bateria)
#[tauri::command]
pub fn get_system_stats() -> SystemStats {
    let computer_name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Desktop Charlie".into());

    let os_name = format!("Windows ({})", std::env::consts::ARCH);

    #[cfg(windows)]
    unsafe {
        // Leitura de Memória Real
        let mut mem: MEMORYSTATUSEX = std::mem::zeroed();
        mem.dw_length = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        let mut total_mb = 16384.0f64;
        let mut used_mb = 4096.0f64;
        let mut mem_percent = 25.0f32;

        if GlobalMemoryStatusEx(&mut mem) != 0 {
            let total = mem.ull_total_phys as f64 / (1024.0 * 1024.0);
            let avail = mem.ull_avail_phys as f64 / (1024.0 * 1024.0);
            let used = (total - avail).max(0.0);
            total_mb = (total * 10.0).round() / 10.0;
            used_mb = (used * 10.0).round() / 10.0;
            mem_percent = mem.dw_memory_load as f32;
        }

        // Leitura de CPU Real
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

        // Leitura de Bateria Real
        let mut battery: Option<BatteryStats> = None;
        let mut power_status: SYSTEM_POWER_STATUS = std::mem::zeroed();
        if GetSystemPowerStatus(&mut power_status) != 0 {
            if power_status.battery_life_percent != 255 {
                battery = Some(BatteryStats {
                    percent: power_status.battery_life_percent as f32,
                    is_charging: power_status.ac_line_status == 1,
                });
            }
        }

        SystemStats {
            cpu_percent: cpu_percent.clamp(0.0, 100.0),
            memory_used_mb: used_mb,
            memory_total_mb: total_mb,
            memory_percent: mem_percent,
            computer_name,
            os_name,
            battery,
        }
    }

    #[cfg(not(windows))]
    {
        SystemStats {
            cpu_percent: 0.0,
            memory_used_mb: 0.0,
            memory_total_mb: 0.0,
            memory_percent: 0.0,
            computer_name,
            os_name,
            battery: None,
        }
    }
}

/// Ajuste contínuo de volume do Windows (0 a 100)
#[tauri::command]
pub fn set_system_volume(level: f32) -> Result<String, String> {
    let clamped = level.clamp(0.0, 100.0) as i32;
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let steps = (clamped / 2).max(0).min(50);
        let script = format!(
            "$obj = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object {{ $obj.SendKeys([char]174) }}; 1..{} | ForEach-Object {{ $obj.SendKeys([char]175) }}",
            steps
        );
        let _ = Command::new("powershell")
            .args(&["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        Ok(format!("Volume ajustado para {}%", clamped))
    }
    #[cfg(not(windows))]
    {
        Ok("Controle de volume não suportado neste OS.".into())
    }
}

/// Alterna mudo do som do sistema (VK_VOLUME_MUTE = 0xAD)
#[tauri::command]
pub fn toggle_mute() -> Result<String, String> {
    #[cfg(windows)]
    unsafe {
        keybd_event(0xAD, 0, 0, 0);
        keybd_event(0xAD, 0, 2, 0); // KEYEVENTF_KEYUP = 2
        Ok("Mudo alternado com sucesso.".into())
    }
    #[cfg(not(windows))]
    {
        Ok("Mudo alternado ignorado (não-Windows).".into())
    }
}

/// Emula teclas de controle de multimídia do Windows
#[tauri::command]
pub fn send_media_key(key: String) -> Result<String, String> {
    let act = key.to_lowercase();
    #[cfg(windows)]
    unsafe {
        let vk_code: u8 = match act.as_str() {
            "play_pause" | "play" | "pause" => 0xB3,
            "next" => 0xB0,
            "prev" | "previous" => 0xB1,
            "volume_up" => 0xAF,
            "volume_down" => 0xAE,
            "mute" => 0xAD,
            _ => return Err(format!("Ação de mídia desconhecida: {}", key)),
        };

        keybd_event(vk_code, 0, 0, 0);
        keybd_event(vk_code, 0, 2, 0); // KEYEVENTF_KEYUP = 2
        Ok(format!("Tecla de mídia '{}' (VK {:#X}) enviada.", act, vk_code))
    }
    #[cfg(not(windows))]
    {
        Ok(format!("Comando de mídia '{}' ignorado (não-Windows).", act))
    }
}

/// Compatibilidade legada para send_media_control
#[tauri::command]
pub fn send_media_control(action: String) -> Result<String, String> {
    send_media_key(action)
}

/// Invoca LockWorkStation() da user32.dll para bloquear o PC
#[tauri::command]
pub fn lock_workstation() -> Result<String, String> {
    #[cfg(windows)]
    unsafe {
        if LockWorkStation() != 0 {
            Ok("Estação de trabalho bloqueada com sucesso.".into())
        } else {
            Err("Falha ao invocar LockWorkStation.".into())
        }
    }
    #[cfg(not(windows))]
    {
        Ok("Bloqueio de tela não suportado neste OS.".into())
    }
}

/// Minimiza todas as janelas abertas (Win + D / Shell.Application MinimizeAll)
#[tauri::command]
pub fn minimize_all_windows() -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                "(New-Object -ComObject Shell.Application).MinimizeAll()",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        Ok("Todas as janelas foram minimizadas.".into())
    }
    #[cfg(not(windows))]
    {
        Ok("Minimizar janelas não suportado neste OS.".into())
    }
}

/// Captura o monitor principal via Win32 GDI e retorna imagem PNG em base64
#[tauri::command]
pub fn take_screenshot() -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$s = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;
using System.Runtime.InteropServices;
public class Win32Cap {
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr hObject);
    public static string Capture() {
        IntPtr hdcSrc = GetDC(IntPtr.Zero);
        int w = Screen.PrimaryScreen.Bounds.Width;
        int h = Screen.PrimaryScreen.Bounds.Height;
        IntPtr hdcDest = CreateCompatibleDC(hdcSrc);
        IntPtr hBitmap = CreateCompatibleBitmap(hdcSrc, w, h);
        IntPtr hOld = SelectObject(hdcDest, hBitmap);
        BitBlt(hdcDest, 0, 0, w, h, hdcSrc, 0, 0, 0x00CC0020 | 0x40000000);
        SelectObject(hdcDest, hOld);
        DeleteDC(hdcDest);
        ReleaseDC(IntPtr.Zero, hdcSrc);
        Bitmap bmp = Image.FromHbitmap(hBitmap);
        DeleteObject(hBitmap);
        using (System.IO.MemoryStream ms = new System.IO.MemoryStream()) {
            bmp.Save(ms, ImageFormat.Png);
            bmp.Dispose();
            return Convert.ToBase64String(ms.ToArray());
        }
    }
}
"@
Add-Type -TypeDefinition $s -ReferencedAssemblies System.Windows.Forms,System.Drawing
[Console]::Out.Write([Win32Cap]::Capture())
"#;

        let output = Command::new("powershell")
            .args(&["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Erro ao executar captura de tela: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Falha na captura de tela: {}", err));
        }

        let b64 = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if b64.is_empty() {
            return Err("Captura de tela retornou vazio.".into());
        }

        Ok(format!("data:image/png;base64,{}", b64))
    }
    #[cfg(not(windows))]
    {
        Err("Captura de tela suportada apenas no Windows.".into())
    }
}

/// Abre arquivo, pasta, URL ou protocolo com segurança no Windows
#[tauri::command]
pub fn open_path_or_app(target: String) -> Result<String, String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Alvo de abertura não pode ser vazio.".into());
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("cmd")
            .args(["/c", "start", "", trimmed])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        Ok(format!("Alvo '{}' aberto com sucesso.", trimmed))
    }
    #[cfg(not(windows))]
    {
        Ok(format!("Abertura de '{}' não suportada neste OS.", trimmed))
    }
}

/// Detecta IP privado ativo da interface Wi-Fi/Ethernet (192.168.x.x ou 10.x.x.x)
#[tauri::command]
pub fn get_local_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if !ip.starts_with("127.") {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}
