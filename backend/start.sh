#!/bin/bash
set -e

echo "Applying database migrations..."
# Do not stamp on every boot (would reset alembic_version). Migrations chain from 7dbe7fb867e1 -> expense_mgmt_001.
alembic upgrade head

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000










