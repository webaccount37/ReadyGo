#!/bin/bash
set -e

echo "Applying database migrations..."
# Single baseline revision (see alembic/versions/); do not stamp on every boot.
alembic upgrade head

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000










