#!/usr/bin/env python3
"""Fix Alembic version and apply migration."""
import asyncio
import sys
from sqlalchemy import text
from app.db.session import async_session_maker


async def fix_and_apply():
    async with async_session_maker() as session:
        try:
            # Remove bad revision
            print("Removing bad revision from database...")
            await session.execute(text("DELETE FROM alembic_version WHERE version_num = 'convert_associations_001'"))
            await session.commit()
            print("✓ Fixed Alembic version table")
            
            # Check current version
            result = await session.execute(text("SELECT version_num FROM alembic_version"))
            current = result.scalar()
            print(f"Current version: {current}")
            
            print("\nNow run: alembic upgrade head")
            return 0
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            await session.rollback()
            return 1


if __name__ == "__main__":
    exit_code = asyncio.run(fix_and_apply())
    sys.exit(exit_code)









