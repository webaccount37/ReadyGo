-- One-time purge: remove all application data while preserving reference/seed tables.
-- Preserved (NOT truncated): currency_rates, delivery_centers, billing_terms, roles,
--   role_rates, alembic_version, expense_categories, calendars
--
-- Run AFTER backup. Example (Docker):
--   docker compose -f config/docker-compose.yaml exec -T postgres \
--     psql -U postgres -d readygo -v ON_ERROR_STOP=1 -f /scripts/01_purge_data.sql
--
-- Truncates are ordered for foreign-key dependencies (children before parents).

-- Financial forecast: lines are parents of cells; CASCADE clears cells in one command.
-- (Postgres rejects truncating only cells first when FKs exist as observed in PG 16.)
TRUNCATE TABLE financial_forecast_expense_lines RESTART IDENTITY CASCADE;
TRUNCATE TABLE financial_forecast_line_overrides RESTART IDENTITY;
TRUNCATE TABLE financial_forecast_change_events RESTART IDENTITY;

-- Expenses: sheets are the root; CASCADE clears lines, status_history, and receipts.
TRUNCATE TABLE expense_sheets RESTART IDENTITY CASCADE;

-- Timesheets: CASCADE clears entries, day_notes, approved_snapshots, status_history,
-- dismissed_rows, and opportunity_permanent_locks (FK to timesheets).
TRUNCATE TABLE timesheets RESTART IDENTITY CASCADE;

-- Engagements: CASCADE clears phases, line_items, weekly_hours, approvers, and any
-- dependent rows that reference engagements (e.g. empty timesheet_entries / expense_lines).
TRUNCATE TABLE engagements RESTART IDENTITY CASCADE;

-- Quotes then estimates (quotes reference estimates; CASCADE clears line items, phases, triggers, etc.)
TRUNCATE TABLE quotes RESTART IDENTITY CASCADE;
TRUNCATE TABLE estimates RESTART IDENTITY CASCADE;

-- Opportunities (parent_opportunity_id self-FK requires CASCADE)
TRUNCATE TABLE opportunities RESTART IDENTITY CASCADE;

-- CRM (accounts are referenced by opportunities even when empty; CASCADE satisfies FK checks)
TRUNCATE TABLE contacts RESTART IDENTITY;
TRUNCATE TABLE accounts RESTART IDENTITY CASCADE;

-- Legacy tables (only if present in your database)
DO $$
BEGIN
    IF to_regclass('public.releases') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE releases RESTART IDENTITY';
    END IF;
    IF to_regclass('public.projects') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE projects RESTART IDENTITY';
    END IF;
    IF to_regclass('public.clients') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE clients RESTART IDENTITY';
    END IF;
END $$;

-- Employees (many child tables hold FKs even when empty; CASCADE clears them)
TRUNCATE TABLE employees RESTART IDENTITY CASCADE;
