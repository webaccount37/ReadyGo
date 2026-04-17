-- Preflight: row counts before running 01_purge_data.sql (optional sanity check).
-- Run: psql -U postgres -d readygo -v ON_ERROR_STOP=1 -f 00_preflight.sql

SELECT 'alembic_version' AS tbl, count(*)::bigint AS n FROM alembic_version
UNION ALL SELECT 'currency_rates', count(*) FROM currency_rates
UNION ALL SELECT 'delivery_centers', count(*) FROM delivery_centers
UNION ALL SELECT 'billing_terms', count(*) FROM billing_terms
UNION ALL SELECT 'roles', count(*) FROM roles
UNION ALL SELECT 'role_rates', count(*) FROM role_rates
UNION ALL SELECT 'expense_categories', count(*) FROM expense_categories
UNION ALL SELECT 'calendars', count(*) FROM calendars
UNION ALL SELECT 'employees', count(*) FROM employees
UNION ALL SELECT 'accounts', count(*) FROM accounts
UNION ALL SELECT 'contacts', count(*) FROM contacts
UNION ALL SELECT 'opportunities', count(*) FROM opportunities
UNION ALL SELECT 'estimates', count(*) FROM estimates
UNION ALL SELECT 'quotes', count(*) FROM quotes
UNION ALL SELECT 'engagements', count(*) FROM engagements
UNION ALL SELECT 'timesheets', count(*) FROM timesheets
UNION ALL SELECT 'expense_sheets', count(*) FROM expense_sheets
ORDER BY tbl;
