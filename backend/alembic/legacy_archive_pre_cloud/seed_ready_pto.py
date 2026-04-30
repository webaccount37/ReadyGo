"""seed_ready_pto

Revision ID: seed_ready_pto
Revises: add_holiday_ts
Create Date: 2026-03-07

Creates system Account "Ready" and Engagement "PTO" for Holiday timesheet entries.
"""
from alembic import op
from sqlalchemy import text
import uuid


revision = 'seed_ready_pto'
down_revision = 'add_holiday_ts'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NO-OP: Do NOT create Ready account or PTO engagement.
    # Holiday timesheet rows use display-only fields (account_display_name, engagement_display_name)
    # to show "Ready" and "PTO" on the timesheet without creating actual Account/Project records.
    pass


def _upgrade_original_removed() -> None:
    """Original upgrade logic - removed per user request. Kept for reference only."""
    conn = op.get_bind()

    # Get or create billing term
    result = conn.execute(text("SELECT id FROM billing_terms LIMIT 1"))
    billing_term_row = result.fetchone()
    if not billing_term_row:
        bt_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO billing_terms (id, code, name, is_active, sort_order)
            VALUES (:id, 'NET30', 'Net 30 Days', true, 0)
        """), {"id": bt_id})
        billing_term_id = bt_id
    else:
        billing_term_id = str(billing_term_row[0])

    # Get or create delivery center
    result = conn.execute(text("SELECT id FROM delivery_centers LIMIT 1"))
    dc_row = result.fetchone()
    if not dc_row:
        dc_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO delivery_centers (id, name, code, default_currency, country_code)
            VALUES (:id, 'Default', 'default', 'USD', 'US')
        """), {"id": dc_id})
        delivery_center_id = dc_id
    else:
        delivery_center_id = str(dc_row[0])

    # Create Account "Ready" if not exists
    result = conn.execute(text("SELECT id FROM accounts WHERE company_name = 'Ready'"))
    account_row = result.fetchone()
    if not account_row:
        account_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO accounts (id, company_name, type, country, default_currency)
            VALUES (:id, 'Ready', 'customer', 'US', 'USD')
        """), {"id": account_id})
    else:
        account_id = str(account_row[0])

    # Create Opportunity "PTO" if not exists
    result = conn.execute(text("""
        SELECT id FROM opportunities WHERE name = 'PTO' AND account_id = :account_id
    """), {"account_id": account_id})
    opp_row = result.fetchone()
    if not opp_row:
        opportunity_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO opportunities (id, name, account_id, start_date, end_date, status,
                billing_term_id, delivery_center_id, default_currency)
            VALUES (:id, 'PTO', :account_id, '2020-01-01', '2030-12-31', 'qualified',
                :billing_term_id, :delivery_center_id, 'USD')
        """), {
            "id": opportunity_id,
            "account_id": account_id,
            "billing_term_id": billing_term_id,
            "delivery_center_id": delivery_center_id,
        })
    else:
        opportunity_id = str(opp_row[0])

    # Create Estimate "PTO" if not exists
    result = conn.execute(text("""
        SELECT id FROM estimates WHERE name = 'PTO' AND opportunity_id = :opp_id
    """), {"opp_id": opportunity_id})
    est_row = result.fetchone()
    if not est_row:
        estimate_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO estimates (id, opportunity_id, name, active_version)
            VALUES (:id, :opportunity_id, 'PTO', false)
        """), {"id": estimate_id, "opportunity_id": opportunity_id})
    else:
        estimate_id = str(est_row[0])

    # Create Quote "PTO-001" if not exists
    result = conn.execute(text("SELECT id FROM quotes WHERE quote_number = 'PTO-001'"))
    quote_row = result.fetchone()
    if not quote_row:
        quote_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO quotes (id, opportunity_id, estimate_id, quote_number, version, status, is_active)
            VALUES (:id, :opportunity_id, :estimate_id, 'PTO-001', 1, 'DRAFT', false)
        """), {
            "id": quote_id,
            "opportunity_id": opportunity_id,
            "estimate_id": estimate_id,
        })
    else:
        quote_id = str(quote_row[0])

    # Create Engagement "PTO" if not exists
    result = conn.execute(text("""
        SELECT id FROM engagements WHERE name = 'PTO' AND opportunity_id = :opp_id
    """), {"opp_id": opportunity_id})
    eng_row = result.fetchone()
    if not eng_row:
        engagement_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO engagements (id, quote_id, opportunity_id, name)
            VALUES (:id, :quote_id, :opportunity_id, 'PTO')
        """), {
            "id": engagement_id,
            "quote_id": quote_id,
            "opportunity_id": opportunity_id,
        })
    else:
        engagement_id = str(eng_row[0])

    # Create EngagementPhase "PTO" if not exists
    result = conn.execute(text("""
        SELECT id FROM engagement_phases WHERE name = 'PTO' AND engagement_id = :eng_id
    """), {"eng_id": engagement_id})
    phase_row = result.fetchone()
    if not phase_row:
        phase_id = str(uuid.uuid4())
        conn.execute(text("""
            INSERT INTO engagement_phases (id, engagement_id, name, start_date, end_date, color, row_order)
            VALUES (:id, :engagement_id, 'PTO', '2020-01-01', '2030-12-31', '#3B82F6', 0)
        """), {"id": phase_id, "engagement_id": engagement_id})


def downgrade() -> None:
    conn = op.get_bind()
    # Remove in reverse order due to FKs
    conn.execute(text("""
        DELETE FROM engagement_phases WHERE name = 'PTO' AND engagement_id IN
        (SELECT id FROM engagements WHERE name = 'PTO')
    """))
    conn.execute(text("DELETE FROM engagements WHERE name = 'PTO'"))
    conn.execute(text("DELETE FROM quotes WHERE quote_number = 'PTO-001'"))
    conn.execute(text("""
        DELETE FROM estimates WHERE name = 'PTO' AND opportunity_id IN
        (SELECT id FROM opportunities WHERE name = 'PTO')
    """))
    conn.execute(text("""
        DELETE FROM opportunities WHERE name = 'PTO' AND account_id IN
        (SELECT id FROM accounts WHERE company_name = 'Ready')
    """))
    conn.execute(text("DELETE FROM accounts WHERE company_name = 'Ready'"))
