ReadyGo — one-time database deployment prep
============================================

Run in order (after a full backup):

  1) 00_preflight.sql     — optional row counts
  2) 01_purge_data.sql    — truncate application data (keeps seed tables)
  3) 02_seed_employees_from_entra.py — CSV (default) or Graph/JSON -> employees
  4) 03_load_crm_from_excel.py       — Excel -> accounts, contacts, opportunities

Prerequisites
-------------
- Docker Compose stack from config/docker-compose.yaml (postgres + optional backend for Poetry deps).
- PostgreSQL client or exec into postgres container.
- For steps 3–4: Python 3.12+ with backend dependencies OR mount repo into backend container.
- Database schema must exist before 00_preflight.sql (all tables). On an empty volume, apply migrations first, for example:

    docker compose -f config/docker-compose.yaml run --rm backend alembic upgrade head

  (Starts postgres/redis as needed, then runs Alembic from the backend image.)

Environment variables (steps 3–4)
------------------------------------
- DATABASE_URL
  - From host: postgresql://postgres:postgres@localhost:5432/readygo
  - From backend container: postgresql://postgres:postgres@postgres:5432/readygo
  - Strip "+asyncpg" if present (scripts use asyncpg directly).
- Step 3 Graph only: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and User.Read.All (application) + admin consent.

Step 1–2: run SQL in Docker (postgres service)
-----------------------------------------------
From repository root.

cmd.exe (input redirection):

  docker compose -f config/docker-compose.yaml exec -T postgres ^
    psql -U postgres -d readygo -v ON_ERROR_STOP=1 < deploy/db-prep/00_preflight.sql

  docker compose -f config/docker-compose.yaml exec -T postgres ^
    psql -U postgres -d readygo -v ON_ERROR_STOP=1 < deploy/db-prep/01_purge_data.sql

PowerShell (pipe SQL into psql — the "<" form above is unreliable in PowerShell):

  Get-Content -Raw deploy\db-prep\00_preflight.sql | docker compose -f config/docker-compose.yaml exec -T postgres psql -U postgres -d readygo -v ON_ERROR_STOP=1 -f -

  Get-Content -Raw deploy\db-prep\01_purge_data.sql | docker compose -f config/docker-compose.yaml exec -T postgres psql -U postgres -d readygo -v ON_ERROR_STOP=1 -f -

If stdin redirection is awkward, copy files into the container and use -f:

  docker compose -f config/docker-compose.yaml cp deploy/db-prep/01_purge_data.sql readygo-postgres:/tmp/
  docker compose -f config/docker-compose.yaml exec -T postgres psql -U postgres -d readygo -v ON_ERROR_STOP=1 -f /tmp/01_purge_data.sql

Step 3: Employees (CSV default, or Graph / JSON)
------------------------------------------------
Default: read uploads/users_4_17_2026 7_22_59 AM.csv (UTF-8, header row).

  CSV column -> Employee
  First name           -> first_name
  Last name            -> last_name
  Create date          -> start_date (also accepts header "Crate date" typo)
  Title                -> role_title
  Country              -> delivery center (matched to delivery_centers.name; see map below)
  Proxy address        -> email (lowercased; supports SMTP: prefix / angle-bracket form)

  Fixed: employee_type FULL_TIME, status ACTIVE (Postgres enum labels), timezone UTC, billable true,
  internal_cost_rate / internal_bill_rate / external_bill_rate = 0,
  default_currency = selected delivery_centers.default_currency for that row.

Host (example):

  cd backend
  set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/readygo
  poetry run python ../deploy/db-prep/02_seed_employees_from_entra.py

  poetry run python ../deploy/db-prep/02_seed_employees_from_entra.py --csv "..\uploads\other.csv"

Docker (mount repo; CSV under uploads/). Replace the host path with your clone (or use ${PWD} on Git Bash; on PowerShell use the full path, e.g. -v "${PWD}:/repo:ro" from the repo root if Docker accepts it):

  docker compose -f config/docker-compose.yaml run --rm --no-deps -v /path/to/ReadyGo:/repo:ro -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/readygo backend python /repo/deploy/db-prep/02_seed_employees_from_entra.py

Optional Graph instead of CSV:

  ... backend python /repo/deploy/db-prep/02_seed_employees_from_entra.py --from-graph

  If Graph returns 403 until User.Read.All (application) is granted:

  ... 02_seed_employees_from_entra.py --from-graph --on-graph-forbidden

JSON (legacy):

  ... 02_seed_employees_from_entra.py --from-json path\to\employees.json

Options for step 3:
  --csv PATH            override CSV file (default: uploads/users_4_17_2026 7_22_59 AM.csv)
  --from-graph          use Entra Graph licensed users
  --from-json PATH      load from JSON array
  --emit-sql PATH       write SQL instead of applying to the database
  --on-conflict update  upsert on email (default: skip)

Environment (optional):
  EMPLOYEE_SEED_DELIVERY_CENTER   fallback delivery_centers.name when Country is empty (default: North America)
  OPPORTUNITY_SEED_DELIVERY_CENTER same for Excel invoice-country mapping in step 4 (default: North America)

Step 4: Excel load
------------------
Default workbook paths (repo root on host):

  uploads/Clients_1776399772.xlsx
  uploads/Contacts_1776400628.xlsx
  uploads/Deal_Tracker_1776401286.xlsx

Host:

  cd backend
  set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/readygo
  poetry run python ../deploy/db-prep/03_load_crm_from_excel.py ^
    --clients ..\uploads\Clients_1776399772.xlsx ^
    --contacts ..\uploads\Contacts_1776400628.xlsx ^
    --deals ..\uploads\Deal_Tracker_1776401286.xlsx

Docker (same volume mount as step 3):

  docker compose -f config/docker-compose.yaml run --rm --no-deps -v /path/to/ReadyGo:/repo:ro -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/readygo backend python /repo/deploy/db-prep/03_load_crm_from_excel.py

Step 4 requires billing_terms.code "NET30". Delivery center names in the DB must match Country / invoice mappings (see EMPLOYEE_SEED_DELIVERY_CENTER / OPPORTUNITY_SEED_DELIVERY_CENTER).

Verification
------------
Re-run 00_preflight.sql: employees / accounts / contacts / opportunities counts should match expectations.
Preserved tables should be unchanged by 01_purge_data.sql.
