"""Regressões das tools de mídia no host Tauri e na honestidade dos resultados."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_host_advertises_all_music_tools():
    source = (ROOT / "desktop/src/services/hostService.ts").read_text(encoding="utf-8")
    for tool in ("play_music", "pause_music", "resume_music", "stop_music", "set_volume"):
        assert f'"{tool}"' in source


def test_device_executor_delegates_music_and_rejects_unknown_tools():
    source = (ROOT / "desktop/src/services/deviceExecutor.ts").read_text(encoding="utf-8")
    media = (ROOT / "desktop/src/services/mediaExecutor.ts")
    assert media.exists()
    for function in ("playMusic", "pauseMusic", "resumeMusic", "stopMusic", "setMusicVolume"):
        assert function in source
    assert 'return `Erro: Ferramenta' in source
    assert "processado no dispositivo" not in source


def test_media_executor_uses_real_vlc_ytdlp_and_pid_lifecycle():
    source = (ROOT / "desktop/src/services/mediaExecutor.ts").read_text(encoding="utf-8")

    assert "ytsearch1:" in source
    assert "--dump-single-json" in source
    assert "vlc.exe" in source
    assert "C:/Program Files/VideoLAN/VLC/vlc.exe" in source
    assert "$path; exit 0" in source  # não deixa Get-Command ausente transformar um VLC encontrado em erro
    assert "Start-Process" in source
    assert "Get-Process" in source
    assert "Stop-Process" in source
    assert "charlie_music_vlc_pid" in source
    assert "charlie_music_volume" in source
    for function in (
        "export async function playMusic",
        "export async function pauseMusic",
        "export async function resumeMusic",
        "export async function stopMusic",
        "export async function setMusicVolume",
    ):
        assert function in source


def test_host_marks_textual_tool_failures_as_errors():
    source = (ROOT / "desktop/src/services/hostService.ts").read_text(encoding="utf-8")
    assert "isDeviceToolError" in source
    assert 'status: isError ? "error" : "done"' in source
    assert 'error_type: isError ? "tool_reported_error" : undefined' in source


def test_long_system_commands_do_not_block_tauri_main_thread():
    source = (ROOT / "desktop/src-tauri/src/lib.rs").read_text(encoding="utf-8")
    assert "async fn execute_system_command" in source
    assert "tauri::async_runtime::spawn_blocking" in source
