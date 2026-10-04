"""Script para sincronizar public.User e migrar dados legados órfãos para o usuário proprietário no Supabase."""

import asyncio
import logging
import uuid
from api.db import get_or_init_db_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("charlie.tenant_migration")

PRIMARY_USER_ID = "5451c1b4-b5f8-4193-a643-bce1b96a901e"
PRIMARY_EMAIL = "lucassilvacosta060@gmail.com"

async def main():
    pool = await get_or_init_db_pool()
    if not pool:
        logger.error("Não foi possível conectar ao banco Supabase.")
        return

    async with pool.acquire() as conn:
        # 1. Sincroniza todos os usuários de auth.users para public."User"
        sync_res = await conn.execute("""
            INSERT INTO public."User" (id, identifier, metadata, "createdAt", "updatedAt")
            SELECT id, email, '{}'::jsonb, created_at, created_at
            FROM auth.users
            ON CONFLICT (id) DO UPDATE SET identifier = EXCLUDED.identifier;
        """)
        logger.info(f"Sincronizados auth.users para public.User: {sync_res}")

        # 2. Migra threads órfãs (userId IS NULL) para o proprietário principal
        res_threads = await conn.execute("""
            UPDATE "Thread"
            SET "userId" = $1, "userIdentifier" = $2
            WHERE "userId" IS NULL
        """, uuid.UUID(PRIMARY_USER_ID), PRIMARY_EMAIL)
        logger.info(f"Threads migradas: {res_threads}")

        # 3. Migra memórias de longo prazo (user_id = 'default')
        res_mem = await conn.execute("""
            UPDATE "UserMemory"
            SET user_id = $1
            WHERE user_id = 'default'
        """, PRIMARY_USER_ID)
        logger.info(f"UserMemory migradas: {res_mem}")

        # 4. Migra preferências (user_id = 'default')
        res_pref = await conn.execute("""
            UPDATE "UserPreference"
            SET user_id = $1
            WHERE user_id = 'default'
        """, PRIMARY_USER_ID)
        logger.info(f"UserPreference migradas: {res_pref}")

        # 5. Verificação final
        stats_threads = await conn.fetch("""
            SELECT "userId", count(*) as total
            FROM "Thread"
            GROUP BY "userId"
        """)
        logger.info("Distribuição de Threads por usuário no Supabase:")
        for s in stats_threads:
            logger.info(f"  - userId={s['userId']}: {s['total']} conversas")

        stats_mem = await conn.fetch("""
            SELECT user_id, count(*) as total
            FROM "UserMemory"
            GROUP BY user_id
        """)
        logger.info("Distribuição de Memórias por usuário no Supabase:")
        for s in stats_mem:
            logger.info(f"  - user_id={s['user_id']}: {s['total']} memórias")

if __name__ == "__main__":
    asyncio.run(main())
