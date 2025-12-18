#!/bin/bash
# Fix Alembic version and apply migration

cd /app

# Fix the bad revision in the database
python -c "
import asyncio
from sqlalchemy import text
from app.db.session import async_session_maker

async def fix():
    async with async_session_maker() as session:
        await session.execute(text(\"DELETE FROM alembic_version WHERE version_num = 'convert_associations_001'\"))
        await session.commit()
        print('Fixed Alembic version table')

asyncio.run(fix())
"

# Now apply the migration
alembic upgrade head








