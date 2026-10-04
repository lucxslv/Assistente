"""
Script para identificação e consolidação de memórias duplicadas em public."UserMemory".
Por padrão, roda em modo DRY-RUN (apenas exibe o que seria consolidado sem alterar dados).
"""

import asyncio
import os
import sys
import json
import pathlib
from dotenv import load_dotenv
import asyncpg

# Carrega variáveis de ambiente
env_path = pathlib.Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

async def analyze_and_deduplicate(dry_run: bool = True):
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("[ERRO] DATABASE_URL não configurada no .env")
        return

    conn = await asyncpg.connect(db_url)
    try:
        rows = await conn.fetch(
            """
            SELECT id, user_id, COALESCE(fact, content) as content, confidence, importance, metadata, created_at, updated_at
            FROM public."UserMemory"
            ORDER BY user_id, created_at ASC
            """
        )
        print(f"\n=== ANÁLISE DE MEMÓRIAS EM public.\"UserMemory\" (Total: {len(rows)} registros) ===")

        # Agrupa por user_id e chave normalizada
        groups = {}
        for r in rows:
            uid = str(r["user_id"])
            c = (r["content"] or "").strip()
            if not c:
                continue

            # Normalização rigorosa: apenas consolida fatos estritamente redundantes
            clean_str = " ".join(c.lower().rstrip(".").split())
            if clean_str in [
                "o usuário se chama lucas",
                "o usuário chama-se lucas",
                "nome do usuário é lucas",
            ]:
                norm_key = "exact_user_name_lucas"
            elif clean_str in [
                "o usuário pratica jiu-jitsu",
                "o usuário tem interesse em jiu-jitsu",
            ]:
                norm_key = "exact_jiujitsu_practice"
            elif clean_str in [
                "o usuário pratica jiu-jitsu e treina na gfteam",
                "o usuário pratica jiu-jitsu na equipe gfteam",
            ]:
                norm_key = "exact_jiujitsu_gfteam"
            else:
                norm_key = clean_str

            key = (uid, norm_key)
            if key not in groups:
                groups[key] = []
            groups[key].append(r)

        duplicates_found = 0
        to_delete_ids = []

        for (uid, norm_key), mem_list in groups.items():
            if len(mem_list) > 1:
                duplicates_found += len(mem_list) - 1
                # Escolhe a melhor linha para manter (maior confiança, metadados mais ricos ou maior reinforcement_count)
                def score_mem(m):
                    meta = {}
                    try:
                        raw = m["metadata"]
                        meta = json.loads(raw) if isinstance(raw, str) else (raw or {})
                    except Exception:
                        pass
                    rc = meta.get("reinforcement_count", 0)
                    conf = m["confidence"] or 0.8
                    return (rc, conf, len(m["content"] or ""))

                sorted_mems = sorted(mem_list, key=score_mem, reverse=True)
                primary = sorted_mems[0]
                duplicates = sorted_mems[1:]

                print(f"\n[Usuário {uid[:8]}...] Grupo duplicado: '{primary['content'][:60]}'")
                print(f"  -> MANTER: ID={primary['id']} (conf={primary['confidence']}, meta={primary['metadata']})")
                for d in duplicates:
                    to_delete_ids.append(d["id"])
                    print(f"  -> REMOVER: ID={d['id']} ('{d['content'][:50]}...', conf={d['confidence']})")

        print(f"\n------------------------------------------------------------")
        print(f"Total de registros analisados: {len(rows)}")
        print(f"Total de duplicatas encontradas: {duplicates_found}")

        if dry_run:
            print("\n[MODO DRY-RUN] Nenhuma linha foi excluída do banco.")
            print("Para executar a limpeza real, rode com a flag: --execute")
        else:
            if to_delete_ids:
                print(f"\n[EXECUÇÃO] Excluindo {len(to_delete_ids)} registros duplicados...")
                await conn.execute(
                    'DELETE FROM public."UserMemory" WHERE id = ANY($1::uuid[])',
                    to_delete_ids
                )
                print("[SUCESSO] Banco limpo e deduplicado com sucesso!")
            else:
                print("[INFO] Nenhuma duplicata para excluir.")

    finally:
        await conn.close()

if __name__ == "__main__":
    is_dry = "--execute" not in sys.argv
    asyncio.run(analyze_and_deduplicate(dry_run=is_dry))
