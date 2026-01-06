#!/usr/bin/env python3
"""
Script to apply the accounts and contacts schema migration.
This script helps ensure the migration is applied correctly.
"""

import subprocess
import sys
import os

def run_command(cmd, description):
    """Run a command and handle errors."""
    print(f"\n{'='*60}")
    print(f"Step: {description}")
    print(f"Command: {cmd}")
    print(f"{'='*60}\n")
    
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"ERROR: {description} failed!")
        print(f"STDOUT: {result.stdout}")
        print(f"STDERR: {result.stderr}")
        return False
    
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
    
    return True

def main():
    """Main function to apply migration."""
    print("="*60)
    print("Accounts and Contacts Schema Migration")
    print("="*60)
    
    # Change to backend directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Step 1: Check current migration status
    if not run_command("alembic current", "Check current migration status"):
        print("\nWarning: Could not check current status. Continuing anyway...")
    
    # Step 2: Check for multiple heads
    if not run_command("alembic heads", "Check for multiple migration heads"):
        print("\nWarning: Could not check heads. Continuing anyway...")
    
    # Step 3: Show migration history
    if not run_command("alembic history", "Show migration history"):
        print("\nWarning: Could not show history. Continuing anyway...")
    
    # Step 4: Apply migration
    print("\n" + "="*60)
    print("READY TO APPLY MIGRATION")
    print("="*60)
    response = input("\nDo you want to apply the migration? (yes/no): ")
    
    if response.lower() not in ['yes', 'y']:
        print("Migration cancelled.")
        return 0
    
    if not run_command("alembic upgrade head", "Apply migration to head"):
        print("\nERROR: Migration failed!")
        print("\nYou may need to:")
        print("1. Check for multiple migration heads and merge them")
        print("2. Verify database connection")
        print("3. Check migration file for errors")
        return 1
    
    print("\n" + "="*60)
    print("MIGRATION COMPLETED SUCCESSFULLY!")
    print("="*60)
    
    # Step 5: Verify migration
    if not run_command("alembic current", "Verify migration was applied"):
        print("\nWarning: Could not verify migration status.")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
