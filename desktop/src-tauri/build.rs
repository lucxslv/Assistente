fn main() {
    #[cfg(windows)]
    {
        if let Ok(current_path) = std::env::var("PATH") {
            let mingw = r"C:\msys64\mingw64\bin";
            if !current_path.to_lowercase().contains("mingw64") && std::path::Path::new(mingw).exists() {
                std::env::set_var("PATH", format!("{};{}", mingw, current_path));
            }
        }
    }
    tauri_build::build()
}

