"""
Executor e Orquestrador Central do Charlie Agent Runtime Torture Test Suite.
Executa os 50 cenários de teste (20 Aceitação + 20 Segurança + 10 Core),
calcula as métricas de Reliability & Safety, e emite o Relatório Executivo.
"""

from __future__ import annotations
import inspect
import os
import sys
import time

from tests.torture.framework import TortureReport, Verdict, global_safety_monitor
import tests.torture.test_acceptance as test_acceptance
import tests.torture.test_security as test_security
import tests.torture.test_runtime_core as test_runtime_core
import tests.torture.test_behavioral as test_behavioral


def run_suite(module, report: TortureReport) -> None:
    """Executa todas as funções de teste 'test_*' dentro de um módulo de teste."""
    test_functions = [
        (name, func)
        for name, func in inspect.getmembers(module, inspect.isfunction)
        if name.startswith("test_")
    ]
    # Ordena alfabeticamente para preservar a ordem declarada
    test_functions.sort(key=lambda x: x[0])

    for name, func in test_functions:
        sig = inspect.signature(func)
        try:
            # Se a função requer parâmetros (ex: temp_workspace ou tmp_path)
            if "temp_workspace" in sig.parameters or "tmp_path" in sig.parameters:
                import tempfile
                import shutil
                from pathlib import Path
                tmp = tempfile.mkdtemp(prefix="charlie_torture_")
                try:
                    func(Path(tmp))
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
            else:
                func()
        except AssertionError as ae:
            print(f"  [X] Falha em {name}: {ae}", file=sys.stderr)
        except Exception as ex:
            print(f"  [!] Erro inesperado em {name}: {ex}", file=sys.stderr)


def main():
    os.environ["CHARLIE_ENV"] = "test"
    os.environ["CHARLIE_AUTO_APPROVE"] = "0"
    os.environ["CHARLIE_RUNTIME_MODE"] = "device"

    master_report = TortureReport("Charlie Torture Test Master Suite")
    global_safety_monitor.reset()

    print("\n" + "=" * 80)
    print("  INICIANDO CHARLIE AGENT RUNTIME TORTURE TEST SUITE (83 CENÁRIOS EXPANDIDOS)")
    print("=" * 80)
    print("  -> Suíte 1: 20 Testes de Aceitação Final (A - T)...")
    run_suite(test_acceptance, master_report)
    for res in test_acceptance.acceptance_report.results:
        master_report.add_result(res)

    print("  -> Suíte 2: 41 Testes de Segurança, OWASP e Isolamento (SEC-01 a SEC-41)...")
    run_suite(test_security, master_report)
    for res in test_security.security_report.results:
        master_report.add_result(res)

    print("  -> Suíte 3: 10 Testes de Núcleo, Scheduler e Estresse (CORE-01 a CORE-10)...")
    run_suite(test_runtime_core, master_report)
    for res in test_runtime_core.core_report.results:
        master_report.add_result(res)

    print("  -> Suíte 4: 12 Testes Comportamentais e de Conduta (BEH-01 a BEH-12)...")
    run_suite(test_behavioral, master_report)
    for res in test_behavioral.behavioral_report.results:
        master_report.add_result(res)

    # Renderiza o Relatório Executivo
    print("\n" + master_report.render_summary() + "\n")

    # Regra de Ouro: Qualquer incidente crítico de segurança aborta com código 1
    if master_report.critical_incidents_count > 0:
        print(">> INCIDENTE CRÍTICO DE SEGURANÇA DETECTADO! A EXECUÇÃO FALHOU <<\n")
        sys.exit(1)

    if master_report.failed_count > 0:
        print(">> ALGUNS TESTES FALHARAM. VERIFIQUE O LOG ACIMA <<\n")
        sys.exit(1)

    print(">> TODAS AS SUÍTES FORAM APROVADAS COM SUCESSO! <<\n")
    sys.exit(0)


if __name__ == "__main__":
    main()
