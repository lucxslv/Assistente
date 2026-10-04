import asyncio
import os
from dotenv import load_dotenv
import asyncpg

load_dotenv('.env')
url = os.getenv('DATABASE_URL')
# asyncpg não aceita o "+asyncpg", tem que ser puro
if url and url.startswith('postgresql+asyncpg://'):
    url = url.replace('postgresql+asyncpg://', 'postgresql://', 1)

schema = """
CREATE TABLE IF NOT EXISTS "User" (
    "id" UUID PRIMARY KEY,
    "identifier" TEXT NOT NULL UNIQUE,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS "Thread" (
    "id" UUID PRIMARY KEY,
    "createdAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ,
    "name" TEXT,
    "userId" UUID,
    "userIdentifier" TEXT,
    "tags" TEXT[],
    "metadata" JSONB,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Step" (
    "id" UUID PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "threadId" UUID NOT NULL,
    "parentId" UUID,
    "streaming" BOOLEAN NOT NULL,
    "waitForAnswer" BOOLEAN,
    "isError" BOOLEAN,
    "metadata" JSONB,
    "tags" TEXT[],
    "input" TEXT,
    "output" TEXT,
    "createdAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ,
    "start" TIMESTAMPTZ,
    "end" TIMESTAMPTZ,
    "generation" JSONB,
    "showInput" TEXT,
    "language" TEXT,
    "indent" INT,
    "defaultOpen" BOOLEAN,
    FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Element" (
    "id" UUID PRIMARY KEY,
    "threadId" UUID,
    "type" TEXT,
    "url" TEXT,
    "chainlitKey" TEXT,
    "name" TEXT NOT NULL,
    "display" TEXT,
    "objectKey" TEXT,
    "size" TEXT,
    "page" INT,
    "language" TEXT,
    "forId" UUID,
    "mime" TEXT
);

CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" UUID PRIMARY KEY,
    "forId" UUID,
    "stepId" UUID NOT NULL,
    "value" INT NOT NULL,
    "comment" TEXT,
    "name" TEXT
);
"""

async def init_db():
    try:
        conn = await asyncpg.connect(url)
        for stmt in schema.split(';'):
            if stmt.strip():
                await conn.execute(stmt.strip())
        await conn.close()
        print("Tabelas do novo ChainlitDataLayer criadas com sucesso no Supabase!")
    except Exception as e:
        print(f"Erro ao criar tabelas: {e}")

if __name__ == '__main__':
    asyncio.run(init_db())
