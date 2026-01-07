"""
Script to check line items for a specific estimate.
Run with: python check_estimate_line_items.py
"""
import asyncio
import sys
from uuid import UUID
from sqlalchemy import select, text
from app.db.session import create_sessionmaker, init_db
from app.models.estimate import Estimate, EstimateLineItem

async def check_estimate_line_items(estimate_id: str):
    """Check line items for a specific estimate."""
    await init_db()
    async_session_maker = create_sessionmaker()
    
    async with async_session_maker() as session:
        # Direct SQL query to count line items
        result = await session.execute(
            text("SELECT COUNT(*) FROM estimate_line_items WHERE estimate_id = :estimate_id"),
            {"estimate_id": estimate_id}
        )
        count = result.scalar()
        print(f"\n=== Direct SQL Query ===")
        print(f"Total line items in database for estimate {estimate_id}: {count}")
        
        # Get all line items with details
        result = await session.execute(
            text("""
                SELECT 
                    id, 
                    estimate_id, 
                    role_rates_id, 
                    employee_id, 
                    rate, 
                    cost, 
                    row_order,
                    start_date,
                    end_date
                FROM estimate_line_items 
                WHERE estimate_id = :estimate_id
                ORDER BY row_order
            """),
            {"estimate_id": estimate_id}
        )
        rows = result.fetchall()
        print(f"\n=== Line Items Details ===")
        for i, row in enumerate(rows, 1):
            print(f"Row {i}:")
            print(f"  ID: {row[0]}")
            print(f"  Role Rates ID: {row[2]}")
            print(f"  Employee ID: {row[3]}")
            print(f"  Rate: {row[4]}")
            print(f"  Cost: {row[5]}")
            print(f"  Row Order: {row[6]}")
            print(f"  Start Date: {row[7]}")
            print(f"  End Date: {row[8]}")
            print()
        
        # Check using ORM
        estimate_result = await session.execute(
            select(Estimate).where(Estimate.id == UUID(estimate_id))
        )
        estimate = estimate_result.scalar_one_or_none()
        
        if estimate:
            print(f"\n=== Using ORM (relationship) ===")
            # Try to access line_items relationship
            print(f"Estimate ID: {estimate.id}")
            print(f"Estimate Name: {estimate.name}")
            
            # Direct query using repository method
            from app.db.repositories.estimate_line_item_repository import EstimateLineItemRepository
            line_item_repo = EstimateLineItemRepository(session)
            line_items = await line_item_repo.list_by_estimate(UUID(estimate_id))
            print(f"Line items from list_by_estimate: {len(line_items)}")
            for i, li in enumerate(line_items, 1):
                print(f"  {i}. ID: {li.id}, Row Order: {li.row_order}, Employee: {li.employee_id}, Rate: {li.rate}, Cost: {li.cost}")
            
            # Check relationship
            print(f"\n=== Using get_with_line_items ===")
            from app.db.repositories.estimate_repository import EstimateRepository
            estimate_repo = EstimateRepository(session)
            estimate_with_items = await estimate_repo.get_with_line_items(UUID(estimate_id))
            if estimate_with_items:
                print(f"Line items from get_with_line_items: {len(estimate_with_items.line_items) if estimate_with_items.line_items else 0}")
                if estimate_with_items.line_items:
                    for i, li in enumerate(estimate_with_items.line_items, 1):
                        print(f"  {i}. ID: {li.id}, Row Order: {li.row_order}, Employee: {li.employee_id}, Rate: {li.rate}, Cost: {li.cost}")
        else:
            print(f"Estimate {estimate_id} not found")

if __name__ == "__main__":
    estimate_id = "0b1d8231-45a9-42fb-b4b6-2b79505ca5a5"
    if len(sys.argv) > 1:
        estimate_id = sys.argv[1]
    
    asyncio.run(check_estimate_line_items(estimate_id))
