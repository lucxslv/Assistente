use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

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
extern "system" {
    fn GlobalMemoryStatusEx(lp_buffer: *mut MEMORYSTATUSEX) -> i32;
    fn GetSystemTimes(
        lp_idle_time: *mut FILETIME,
        lp_kernel_time: *mut FILETIME,
        lp_user_time: *mut FILETIME,
    ) -> i32;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_system_metrics])
        .setup(|app| {
            // Cria menu do System Tray (Bandeja)
            let open_item = MenuItem::with_id(app, "open", "Abrir Charlie", true, None::<&str>)?;
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
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Quando clicar no X da janela, apenas minimiza para a bandeja
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
