# Accounts and Contacts Schema Migration Instructions

This document explains how to apply the database migration for the accounts and contacts schema changes.

## Changes Included

1. **Removes Account Status**: Removes `AccountStatus` enum and `status` column from accounts table
2. **Adds Account Type**: Creates `AccountType` enum (vendor, customer, partner, network) and adds required `type` column
3. **Makes Fields Optional**: Makes `street_address`, `city`, `region`, and `billing_term_id` nullable in accounts
4. **Adds Created Date**: Adds `created_at` timestamp column with default value
5. **Adds Billing Contact**: Adds `is_billing` column to contacts table

## Prerequisites

1. Ensure your PostgreSQL database is running (via Docker or locally)
2. Ensure your database connection is configured in `.env` or environment variables
3. Ensure you have Alembic installed: `pip install alembic`

## Step 1: Check Current Migration Status

```bash
cd backend
alembic current
```

This will show you the current migration revision.

## Step 2: Check for Multiple Heads

```bash
alembic heads
```

If you see multiple heads, you may need to merge them first:

```bash
alembic merge -m "merge heads" <head1> <head2>
```

## Step 3: Review Migration File

The migration file is located at:
`backend/alembic/versions/update_accounts_and_contacts_schema.py`

Review it to ensure it matches your current database state.

## Step 4: Apply Migration

### Option A: Using the Helper Script

```bash
cd backend
python apply_accounts_migration.py
```

### Option B: Manual Application

```bash
cd backend
alembic upgrade head
```

## Step 5: Verify Migration

```bash
alembic current
```

You should see `update_accounts_contacts` as the current revision.

## Step 6: Verify Database Changes

Connect to your database and verify:

```sql
-- Check accounts table structure
\d accounts

-- Check contacts table structure  
\d contacts

-- Verify AccountType enum exists
SELECT typname FROM pg_type WHERE typname = 'accounttype';

-- Verify AccountStatus enum is removed (should return no rows)
SELECT typname FROM pg_type WHERE typname = 'accountstatus';
```

## Rollback (if needed)

If you need to rollback the migration:

```bash
cd backend
alembic downgrade -1
```

## Troubleshooting

### Issue: Multiple migration heads

**Solution**: Merge the heads first:
```bash
alembic merge -m "merge heads" <head1> <head2>
alembic upgrade head
```

### Issue: Migration fails with "column already exists"

**Solution**: The migration includes checks for existing columns, but if you encounter issues, you may need to manually adjust the migration file.

### Issue: Enum type already exists

**Solution**: The migration includes checks for existing enums. If you still encounter issues, you may need to drop the enum manually:
```sql
DROP TYPE IF EXISTS accounttype CASCADE;
```

### Issue: Cannot drop AccountStatus enum

**Solution**: Check if any other tables are using it:
```sql
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE udt_name = 'accountstatus';
```

If other tables use it, you'll need to update those tables first or modify the migration.

## Docker-Specific Instructions

If you're running PostgreSQL in Docker:

1. Ensure the container is running:
   ```bash
   docker ps
   ```

2. Apply migration from host (if database port is exposed):
   ```bash
   cd backend
   alembic upgrade head
   ```

3. Or apply migration from within container:
   ```bash
   docker exec -it <container_name> bash
   cd backend
   alembic upgrade head
   ```

## Notes

- The migration is idempotent - it checks for existing columns/enums before creating/dropping them
- Existing accounts will be set to type 'customer' by default
- The migration preserves all existing data
- The `created_at` column will be set to the current timestamp for existing rows
