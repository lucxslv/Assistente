import asyncio, os
from dotenv import load_dotenv
import asyncpg
import datetime
load_dotenv('.env')
url = os.getenv('DATABASE_URL').replace('postgresql+asyncpg://', 'postgresql://', 1)
async def test():
    conn = await asyncpg.connect(url)
    await conn.execute('DROP TABLE IF EXISTS "User" CASCADE')
    schema2 = """
    CREATE TABLE "User" (
        "id" UUID PRIMARY KEY,
        "identifier" TEXT NOT NULL UNIQUE,
        "metadata" JSONB NOT NULL,
        "createdAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ
    );
    """
    await conn.execute(schema2)
    await conn.execute('INSERT INTO "User" (id, identifier, metadata, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5)', 
        '123e4567-e89b-12d3-a456-426614174000', 'test_timestamp2', '{}', datetime.datetime.now(datetime.timezone.utc), datetime.datetime.now(datetime.timezone.utc))
    print('TIMESTAMPTZ SUCCESS')
    await conn.close()
if __name__ == '__main__':
    asyncio.run(test())
