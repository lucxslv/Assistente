"""Testes do contrato de widgets estruturados e resiliência de fallback textual."""

import pytest
from core.widgets import (
    build_server_health_widget_payload,
    build_storage_widget_payload,
    build_unavailable_widget_payload,
    validate_and_normalize_widget,
)


def test_server_health_widget_has_deterministic_fallback():
    """Garante que o widget de saúde gera fallback textual rico e coerente com os dados."""
    payload = build_server_health_widget_payload(
        cpu_percent=42.5,
        ram_percent=68.0,
        database="healthy",
        websocket="connected",
    )
    assert payload["type"] == "server_health"
    assert payload["version"] == 1
    assert "fallbackText" in payload
    fb = payload["fallbackText"]
    assert "42.5%" in fb
    assert "68" in fb
    assert "saudável" in fb or "healthy" in fb


def test_storage_widget_has_deterministic_fallback():
    """Garante que o widget de storage gera fallback textual coerente."""
    payload = build_storage_widget_payload(
        title="Disco Local C:",
        used_percent=75,
        used_label="750 GB",
        total_label="1000 GB",
    )
    assert payload["type"] == "storage_usage"
    assert "750 GB" in payload["fallbackText"]
    assert "1000 GB" in payload["fallbackText"]


def test_unavailable_widget_payload_preserves_text_and_reason():
    """Garante que o estado embedded_widget_unavailable preserva a mensagem e permite continuar o chat."""
    payload = build_unavailable_widget_payload(
        original_kind="advanced_3d_viewer",
        reason="Visualizador não suportado no dispositivo atual",
        fallback_text="O modelo 3D 'sensor_chassis.gltf' está pronto com 4.2 MB.",
    )
    assert payload["type"] == "embedded_widget_unavailable"
    assert payload["data"]["originalKind"] == "advanced_3d_viewer"
    assert payload["fallbackText"] == "O modelo 3D 'sensor_chassis.gltf' está pronto com 4.2 MB."


def test_validate_and_normalize_widget_recovers_missing_fallback():
    """Se um widget vier malformado ou sem fallbackText, a normalização sintetiza uma alternativa segura."""
    raw_widget = {
        "id": "w1",
        "type": "server_health",
        "data": {"cpuPercent": 50, "ramPercent": 60, "database": True, "webSocket": True},
    }
    normalized = validate_and_normalize_widget(raw_widget)
    assert normalized["fallbackText"] != ""
    assert "50%" in normalized["fallbackText"]


def test_validate_and_normalize_unknown_widget_converts_to_unavailable():
    """Se receber um widget desconhecido de versão futura, degrada graciosamente para embedded_widget_unavailable."""
    unknown = {
        "id": "w2",
        "type": "quantum_simulator_v9",
        "data": {"qubits": 128},
        "fallbackText": "Simulador quântico com 128 qubits concluído com sucesso.",
    }
    normalized = validate_and_normalize_widget(unknown)
    assert normalized["type"] == "embedded_widget_unavailable"
    assert normalized["fallbackText"] == "Simulador quântico com 128 qubits concluído com sucesso."
