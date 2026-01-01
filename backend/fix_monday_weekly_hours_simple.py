"""
Simple script to fix Monday weekly hours using psycopg2 (synchronous).
Run with: python fix_monday_weekly_hours_simple.py
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import os
from urllib.parse import urlparse

# Parse DATABASE_URL or use defaults
database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/readygo")

# Remove asyncpg:// prefix if present
if database_url.startswith("postgresql+asyncpg://"):
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

# Parse the URL
parsed = urlparse(database_url)
dbname = parsed.path[1:] if parsed.path else "readygo"
user = parsed.username or "postgres"
password = parsed.password or "postgres"
host = parsed.hostname or "localhost"
port = parsed.port or 5432

print(f"Connecting to database: {host}:{port}/{dbname}")

try:
    conn = psycopg2.connect(
        dbname=dbname,
        user=user,
        password=password,
        host=host,
        port=port
    )
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Find Monday records
    cur.execute("""
        SELECT id, estimate_line_item_id, week_start_date as monday_date,
               week_start_date - INTERVAL '1 day' as sunday_date, hours
        FROM estimate_weekly_hours
        WHERE EXTRACT(DOW FROM week_start_date) = 1
        ORDER BY estimate_line_item_id, week_start_date
    """)
    monday_records = cur.fetchall()
    
    print(f"\nFound {len(monday_records)} records with Monday dates")
    
    if not monday_records:
        print("No Monday records found. Nothing to fix.")
        conn.close()
        exit(0)
    
    updated_count = 0
    deleted_count = 0
    merged_count = 0
    
    for record in monday_records:
        record_id = record['id']
        line_item_id = record['estimate_line_item_id']
        monday_date = record['monday_date']
        sunday_date = record['sunday_date']
        hours = record['hours']
        
        print(f"\nProcessing record {record_id}: {monday_date} (Monday) -> {sunday_date} (Sunday), hours={hours}")
        
        # Check if Sunday record exists
        cur.execute("""
            SELECT id, hours
            FROM estimate_weekly_hours
            WHERE estimate_line_item_id = %s AND week_start_date = %s
        """, (line_item_id, sunday_date))
        existing_sunday = cur.fetchone()
        
        if existing_sunday:
            # Merge: use max hours
            new_hours = max(float(existing_sunday['hours']), float(hours))
            cur.execute("""
                UPDATE estimate_weekly_hours
                SET hours = %s
                WHERE id = %s
            """, (str(new_hours), existing_sunday['id']))
            print(f"  Merged: Updated Sunday record {existing_sunday['id']} with hours={new_hours}")
            
            # Delete Monday record
            cur.execute("DELETE FROM estimate_weekly_hours WHERE id = %s", (record_id,))
            deleted_count += 1
            merged_count += 1
        else:
            # Update Monday to Sunday
            cur.execute("""
                UPDATE estimate_weekly_hours
                SET week_start_date = %s
                WHERE id = %s
            """, (sunday_date, record_id))
            updated_count += 1
            print(f"  Updated: Changed {monday_date} to {sunday_date}")
    
    conn.commit()
    
    print(f"\n{'='*60}")
    print(f"Migration complete:")
    print(f"  - Updated {updated_count} records (Monday -> Sunday)")
    print(f"  - Deleted {deleted_count} duplicate Monday records")
    print(f"  - Merged {merged_count} duplicate weeks")
    print(f"{'='*60}")
    
    # Verify
    cur.execute("""
        SELECT COUNT(*) as count
        FROM estimate_weekly_hours
        WHERE EXTRACT(DOW FROM week_start_date) = 1
    """)
    monday_count = cur.fetchone()['count']
    
    cur.execute("""
        SELECT COUNT(*) as count
        FROM estimate_weekly_hours
        WHERE EXTRACT(DOW FROM week_start_date) = 0
    """)
    sunday_count = cur.fetchone()['count']
    
    print(f"\nVerification:")
    if monday_count == 0:
        print(f"  ✓ SUCCESS: No Monday records found")
    else:
        print(f"  ⚠ WARNING: {monday_count} Monday records still exist")
    print(f"  Found {sunday_count} Sunday records")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

