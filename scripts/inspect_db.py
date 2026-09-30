import asyncio
from api.db import get_or_init_db_pool

async def main():
    pool = await get_or_init_db_pool()
    if not pool:
        print("Could not connect to pool")
        return
    async with pool.acquire() as conn:
        tables = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        print("Tables:", [t['table_name'] for t in tables])
        for t in ['Thread', 'Step', 'UserMemory', 'UserPreference']:
            cols = await conn.fetch("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            """, t)
            if cols:
                print(f"\nColumns in {t}:", [(c['column_name'], c['data_type']) for c in cols])
            
            if t == 'Thread':
                stats = await conn.fetch("""
                    SELECT "userId", count(*) as total
                    FROM "Thread"
                    GROUP BY "userId"
                """)
                print("Thread stats by userId:", [(str(s['userId']), s['total']) for s in stats])
                rows = await conn.fetch("""
                    SELECT id, name, "createdAt"
                    FROM "Thread"
                    WHERE "deletedAt" IS NULL
                    ORDER BY "createdAt" DESC
                    LIMIT 10
                """)
                for r in rows:
                    print(f"  - Thread {r['id']}: {r['name']} ({r['createdAt']})")
            elif t == 'UserMemory':
                stats = await conn.fetch("""
                    SELECT user_id, count(*) as total
                    FROM "UserMemory"
                    GROUP BY user_id
                """)
                print("UserMemory stats by user_id:", [(s['user_id'], s['total']) for s in stats])

        users = await conn.fetch("""
            SELECT id, email, created_at, raw_user_meta_data
            FROM auth.users
        """)
        print(f"\nTotal users in auth.users: {len(users)}")
        for u in users:
            print(f"User in auth.users: id={u['id']}, email={u['email']}")

        cols = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'User'
        """)
        print("\nColumns in public.User:", [(c['column_name'], c['data_type']) for c in cols])
        p_users = await conn.fetch('SELECT * FROM "User"')
        print(f"Total rows in public.User: {len(p_users)}")
        for pu in p_users:
            print(f"public.User: {dict(pu)}")

if __name__ == "__main__":
    asyncio.run(main())
