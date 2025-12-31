# Database Migration Guide

## Overview
This migration refactors the database structure to align with the new estimate-centric data model. It removes association tables and centralizes role/rate information in the `role_rates` table.

## Migration File
`backend/alembic/versions/refactor_estimate_structure_remove_associations.py`

## Pre-Migration Checklist

1. **Backup your database** - Always backup before running migrations
   ```bash
   pg_dump -U your_user -d your_database > backup_before_refactor.sql
   ```

2. **Verify current migration state**
   ```bash
   cd backend
   alembic current
   ```

3. **Check for pending migrations**
   ```bash
   alembic heads
   ```

## What This Migration Does

### 1. Adds `active_version` column to `quotes` table
   - Boolean column to track which estimate is active per release
   - Sets one quote per release as active (most recent by ID)

### 2. Renames `currency` to `default_currency` in `role_rates` table
   - Aligns with new naming convention

### 3. Adds `role_rates_id` to `quote_line_items` table
   - Migrates existing data from `role_id` + `delivery_center_id` to `role_rates_id`
   - Creates missing `role_rates` records if needed

### 4. Removes columns from `quote_line_items`
   - Removes `role_id` and `delivery_center_id` columns
   - Removes associated foreign keys and indexes

### 5. Removes `role_id` from `employees` table
   - Employees no longer have a direct role assignment

### 6. Removes columns from `roles` table
   - Removes `role_internal_cost_rate`
   - Removes `role_external_rate`
   - Removes `default_currency`
   - Rate information now only in `role_rates` table

### 7. Deletes association tables
   - `employee_releases`
   - `employee_engagements`
   - `engagement_roles`
   - `release_roles`

## Running the Migration

### Step 1: Update the down_revision
Before running, check the latest migration revision:
```bash
cd backend
alembic heads
```

Then update the `down_revision` in the migration file to match the latest revision.

### Step 2: Review the migration
```bash
# Show what will be executed
alembic upgrade head --sql
```

### Step 3: Run the migration
```bash
# Run the migration
alembic upgrade head
```

### Step 4: Verify the migration
```bash
# Check current revision
alembic current

# Verify tables were updated correctly
# Connect to your database and check:
# - quotes table has active_version column
# - quote_line_items has role_rates_id (not role_id/delivery_center_id)
# - role_rates has default_currency (not currency)
# - Association tables are gone
```

## Rollback (if needed)

If you need to rollback:
```bash
alembic downgrade -1
```

**Note**: The downgrade will recreate the association tables, but data will be lost as we can't fully reconstruct the many-to-many relationships from estimate line items alone.

## Post-Migration Verification

1. **Check application startup**
   ```bash
   cd backend
   python -m app.main
   ```

2. **Test key operations**
   - Create an estimate
   - Create estimate line items
   - Link employees to releases/engagements
   - Verify active version logic works

3. **Verify data integrity**
   - All quote_line_items should have a valid role_rates_id
   - Only one quote per release should have active_version = true
   - All role_rates should have valid role_id and delivery_center_id

## Troubleshooting

### Issue: Migration fails on constraint drop
**Solution**: The migration uses dynamic SQL to find and drop constraints. If it still fails, manually check constraint names:
```sql
SELECT conname FROM pg_constraint 
WHERE conrelid = 'quote_line_items'::regclass AND contype = 'f';
```

### Issue: Data migration fails
**Solution**: Check if there are quote_line_items with NULL role_id or delivery_center_id:
```sql
SELECT COUNT(*) FROM quote_line_items 
WHERE role_id IS NULL OR delivery_center_id IS NULL;
```

### Issue: Active version not set correctly
**Solution**: Manually set active versions:
```sql
UPDATE quotes q1
SET active_version = true
WHERE q1.id = (
    SELECT q2.id FROM quotes q2
    WHERE q2.release_id = q1.release_id
    ORDER BY q2.id DESC LIMIT 1
);
```

## Important Notes

- **Data Loss Warning**: The association tables (`employee_releases`, `employee_engagements`, etc.) will be deleted. Make sure you have backups.
- **Application Code**: The Python code has already been refactored to work with the new structure. Make sure you've deployed the updated code before running this migration.
- **Frontend Compatibility**: The backend maintains backward compatibility by accepting `role_id` + `delivery_center_id` and converting to `role_rates_id` automatically.


