// Impede a abertura de janela de terminal/console no Windows em qualquer modo de compilação
#![windows_subsystem = "windows"]


#[cfg(windows)]
mod single_instance {
    use std::ffi::c_void;

    extern "system" {
        fn CreateMutexW(lpMutexAttributes: *mut c_void, bInitialOwner: i32, lpName: *const u16) -> *mut c_void;
        fn GetLastError() -> u32;
        fn CloseHandle(hObject: *mut c_void) -> i32;
        fn OpenEventW(dwDesiredAccess: u32, bInheritHandle: i32, lpName: *const u16) -> *mut c_void;
        fn SetEvent(hEvent: *mut c_void) -> i32;
        fn FindWindowW(lpClassName: *const u16, lpWindowName: *const u16) -> *mut c_void;
        fn ShowWindow(hWnd: *mut c_void, nCmdShow: i32) -> i32;
        fn SetForegroundWindow(hWnd: *mut c_void) -> i32;
    }

    const ERROR_ALREADY_EXISTS: u32 = 183;
    const EVENT_MODIFY_STATE: u32 = 0x0002;
    const SW_RESTORE: i32 = 9;

    pub struct SingleInstanceGuard {
        handle: *mut c_void,
    }

    impl SingleInstanceGuard {
        pub fn acquire(name: &str) -> Option<Self> {
            let wide_name: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
            unsafe {
                let handle = CreateMutexW(std::ptr::null_mut(), 1, wide_name.as_ptr());
                if handle.is_null() {
                    return None;
                }
                if GetLastError() == ERROR_ALREADY_EXISTS {
                    CloseHandle(handle);

                    // Notifica a instância ativa via Named Event para restaurar a janela
                    let event_name: Vec<u16> = "Local\\CharlieShowMainWindowEvent\0".encode_utf16().collect();
                    let h_event = OpenEventW(EVENT_MODIFY_STATE, 0, event_name.as_ptr());
                    if !h_event.is_null() {
                        SetEvent(h_event);
                        CloseHandle(h_event);
                    }

                    // Fallback nativo: procura a janela e traz para frente
                    let wide_title: Vec<u16> = "Charlie - Assistente Inteligente\0".encode_utf16().collect();
                    let hwnd = FindWindowW(std::ptr::null(), wide_title.as_ptr());
                    if !hwnd.is_null() {
                        ShowWindow(hwnd, SW_RESTORE);
                        SetForegroundWindow(hwnd);
                    }
                    return None;
                }
                Some(Self { handle })
            }
        }
    }

    impl Drop for SingleInstanceGuard {
        fn drop(&mut self) {
            if !self.handle.is_null() {
                unsafe {
                    CloseHandle(self.handle);
                }
            }
        }
    }
}

fn main() {
    #[cfg(windows)]
    let _guard = match single_instance::SingleInstanceGuard::acquire("Local\\CharlieDesktopSingleInstanceMutex") {
        Some(guard) => guard,
        None => return, // Já existe outra instância em execução; a janela existente foi ativada e trazida para a frente.
    };

    desktop_lib::run()
}

