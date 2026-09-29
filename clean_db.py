import asyncio
import os
from dotenv import load_dotenv
import asyncpg
import datetime

load_dotenv('.env')
url = os.getenv('DATABASE_URL')
if url and url.startswith('postgresql+asyncpg://'):
    url = url.replace('postgresql+asyncpg://', 'postgresql://', 1)

async def test():
    conn = await asyncpg.connect(url)
    
    # Clean up both schemas
    for table in ['"Feedback"', '"Element"', '"Step"', '"Thread"', '"User"', 'feedbacks', 'elements', 'steps', 'threads', 'users']:
        try:
            await conn.execute(f'DROP TABLE IF EXISTS {table} CASCADE')
            print(f'Dropped {table}')
        except Exception as e:
            pass
            
    # Recreate the ChainlitDataLayer schema using TIMESTAMPTZ instead of TEXT
    schema = """
    CREATE TABLE "User" (
        "id" UUID PRIMARY KEY,
        "identifier" TEXT NOT NULL UNIQUE,
        "metadata" JSONB NOT NULL,
        "createdAt" VARCHAR,
        "updatedAt" VARCHAR
    );
    """
    await conn.execute(schema)
    
    # Wait, actually let's test if VARCHAR works with asyncpg!
    # If not, we drop it and use TIMESTAMPTZ
    try:
        await conn.execute('INSERT INTO "User" (id, identifier, metadata, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5)', 
            '123e4567-e89b-12d3-a456-426614174000', 'test_varchar', '{}', datetime.datetime.now(), datetime.datetime.now())
        print('VARCHAR SUCCESS')
    except Exception as e:
        print('VARCHAR FAILED:', type(e).__name__)
        await conn.execute('DROP TABLE "User" CASCADE')
        
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
            '123e4567-e89b-12d3-a456-426614174000', 'test_timestamp', '{}', datetime.datetime.now(), datetime.datetime.now())
        print('TIMESTAMPTZ SUCCESS')
        
    await conn.close()

if __name__ == '__main__':
    asyncio.run(test())
