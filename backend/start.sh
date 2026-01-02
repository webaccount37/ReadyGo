#!/bin/bash
set -e

echo "Applying database migrations..."
alembic stamp 7dbe7fb867e1 2>/dev/null || true
alembic upgrade head

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000










