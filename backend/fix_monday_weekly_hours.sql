-- Fix old EstimateWeeklyHours records that have Monday dates instead of Sunday dates
-- This script converts Monday week_start_date to the previous Sunday and handles duplicates

-- Step 1: Create a temporary table to track what needs to be updated
CREATE TEMP TABLE monday_records AS
SELECT 
    id,
    estimate_line_item_id,
    week_start_date as monday_date,
    week_start_date - INTERVAL '1 day' as sunday_date,
    hours
FROM estimate_weekly_hours
WHERE EXTRACT(DOW FROM week_start_date) = 1;  -- Monday = 1 in PostgreSQL

-- Step 2: For records where a Sunday record already exists, merge them
-- (Update Sunday record with max hours, then delete Monday record)
UPDATE estimate_weekly_hours ewh
SET hours = GREATEST(ewh.hours, mr.hours::numeric)
FROM monday_records mr
WHERE ewh.estimate_line_item_id = mr.estimate_line_item_id
  AND ewh.week_start_date = mr.sunday_date;

-- Step 3: Delete Monday records that have a corresponding Sunday record
DELETE FROM estimate_weekly_hours
WHERE id IN (
    SELECT mr.id
    FROM monday_records mr
    WHERE EXISTS (
        SELECT 1
        FROM estimate_weekly_hours ewh
        WHERE ewh.estimate_line_item_id = mr.estimate_line_item_id
          AND ewh.week_start_date = mr.sunday_date
    )
);

-- Step 4: Update remaining Monday records to Sunday (no duplicate exists)
UPDATE estimate_weekly_hours
SET week_start_date = week_start_date - INTERVAL '1 day'
WHERE id IN (
    SELECT mr.id
    FROM monday_records mr
    WHERE NOT EXISTS (
        SELECT 1
        FROM estimate_weekly_hours ewh
        WHERE ewh.estimate_line_item_id = mr.estimate_line_item_id
          AND ewh.week_start_date = mr.sunday_date
    )
);

-- Step 5: Verify the fix
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✓ SUCCESS: No Monday records found'
        ELSE '⚠ WARNING: ' || COUNT(*) || ' Monday records still exist'
    END as verification_result
FROM estimate_weekly_hours
WHERE EXTRACT(DOW FROM week_start_date) = 1;

-- Show summary
SELECT 
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM week_start_date) = 0) as sunday_records,
    COUNT(*) FILTER (WHERE EXTRACT(DOW FROM week_start_date) = 1) as monday_records,
    COUNT(*) as total_records
FROM estimate_weekly_hours;

