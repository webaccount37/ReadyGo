"""
Role service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.role_rate_repository import RoleRateRepository
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse
from app.models.role_rate import RoleRate
from app.models.delivery_center import DeliveryCenter
from app.models.role import Role, RoleStatus
import uuid
from sqlalchemy import func
# TODO: Refactor to use ESTIMATE_LINE_ITEMS from active estimates instead of association models/tables
from app.models.delivery_center import DeliveryCenter


class RoleService(BaseService):
    """Service for role operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.role_repo = RoleRepository(session)
        self.role_rate_repo = RoleRateRepository(session)
    
    async def create_role(self, role_data: RoleCreate) -> RoleResponse:
        """Create a new role."""
        role_dict = role_data.model_dump(exclude_unset=True)
        rates = role_dict.pop("role_rates", [])

        role = await self.role_repo.create(**role_dict)
        await self._upsert_role_rates(role.id, rates)
        await self.session.commit()
        await self.session.refresh(role)
        return await self._build_role_response(role.id)
    
    async def get_role(self, role_id: UUID) -> Optional[RoleResponse]:
        """Get role by ID."""
        return await self._build_role_response(role_id)
    
    async def get_role_with_relationships(self, role_id: UUID) -> Optional[RoleResponse]:
        """Get role with related entities."""
        # Use _build_role_response which correctly extracts delivery_center_code from relationships
        return await self._build_role_response(role_id)
    
    async def list_roles(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
    ) -> tuple[List[RoleResponse], int]:
        """List roles with optional filters."""
        if status:
            try:
                status_enum = RoleStatus(status)
                roles = await self.role_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                roles = []
        else:
            result = await self.session.execute(
                select(Role)
                .options(
                    selectinload(Role.role_rates).selectinload(RoleRate.delivery_center)
                )
                .offset(skip)
                .limit(limit)
            )
            roles = list(result.scalars().all())
        
        total = len(roles)
        return [await self._build_role_response(role.id) for role in roles], total
    
    async def update_role(
        self,
        role_id: UUID,
        role_data: RoleUpdate,
    ) -> Optional[RoleResponse]:
        """Update a role."""
        role = await self.role_repo.get(role_id)
        if not role:
            return None
        
        update_dict = role_data.model_dump(exclude_unset=True)
        rates = update_dict.pop("role_rates", None)

        # If rates are being changed, enforce that all in-use delivery centers remain and currencies stay consistent
        if rates is not None:
            await self._validate_role_rates_update(role_id, rates)

        updated = await self.role_repo.update(role_id, **update_dict)

        if rates is not None:
            await self._upsert_role_rates(role_id, rates, replace_existing=True)

        await self.session.commit()
        await self.session.refresh(updated)
        return await self._build_role_response(role_id)
    
    async def delete_role(self, role_id: UUID) -> bool:
        """Delete a role."""
        # Prevent deletion if role is in use
        in_use = await self._role_in_use(role_id)
        if in_use:
            raise ValueError("Cannot delete role: it is assigned to projects or releases.")

        deleted = await self.role_repo.delete(role_id)
        await self.session.commit()
        return deleted

    async def _validate_role_rates_update(self, role_id: UUID, new_rates: list[dict]) -> None:
        """
        Ensure that updating role rates does not orphan existing assignments:
        - All delivery centers currently used by this role in employee project/release links must remain present.
        - Currency for those delivery centers must not change.
        """
        # Gather used delivery center codes from assignments
        used_dc_codes: set[str] = set()

        # Query ESTIMATE_LINE_ITEMS where ACTIVE_VERSION = TRUE
        from app.models.estimate import EstimateLineItem, Estimate
        from app.models.role_rate import RoleRate
        
        ep_result = await self.session.execute(
            select(DeliveryCenter.code)
            .join(RoleRate, RoleRate.delivery_center_id == DeliveryCenter.id)
            .join(EstimateLineItem, EstimateLineItem.role_rates_id == RoleRate.id)
            .join(Estimate, Estimate.id == EstimateLineItem.estimate_id)
            .where(
                and_(
                    RoleRate.role_id == role_id,
                    Estimate.active_version == True
                )
            )
            .distinct()
        )
        used_dc_codes.update([row[0] for row in ep_result.fetchall() if row[0]])

        if not used_dc_codes:
            return

        # Build maps from current and proposed rates
        current_role = await self.session.execute(
            select(Role).options(selectinload(Role.role_rates).selectinload(RoleRate.delivery_center)).where(Role.id == role_id)
        )
        role_obj = current_role.scalar_one()
        current_rate_currency_by_dc: dict[str, str] = {}
        for r in role_obj.role_rates:
            dc_code = getattr(r.delivery_center, "code", None)
            if dc_code:
                current_rate_currency_by_dc[dc_code] = r.default_currency

        proposed_currency_by_dc = {r["delivery_center_code"]: r["default_currency"] for r in new_rates if r.get("delivery_center_code")}

        missing_dcs = [dc for dc in used_dc_codes if dc not in proposed_currency_by_dc]
        if missing_dcs:
            raise ValueError(
                f"Cannot remove delivery center rates while role is in use. Missing rates for: {', '.join(missing_dcs)}"
            )

        currency_changes = []
        for dc in used_dc_codes:
            old_curr = current_rate_currency_by_dc.get(dc)
            new_curr = proposed_currency_by_dc.get(dc)
            if old_curr and new_curr and old_curr != new_curr:
                currency_changes.append(f"{dc} ({old_curr} -> {new_curr})")
        if currency_changes:
            raise ValueError(
                "Cannot change currency for delivery centers already assigned to projects/releases: "
                + "; ".join(currency_changes)
            )

    async def _role_in_use(self, role_id: UUID) -> bool:
        """Check if a role is referenced by projects, releases, or employee assignments."""
        # Check ESTIMATE_LINE_ITEMS where ACTIVE_VERSION = TRUE
        from app.models.estimate import EstimateLineItem, Estimate
        from app.models.role_rate import RoleRate
        result = await self.session.execute(
            select(func.count())
            .select_from(EstimateLineItem)
            .join(Estimate, Estimate.id == EstimateLineItem.estimate_id)
            .join(RoleRate, RoleRate.id == EstimateLineItem.role_rates_id)
            .where(and_(RoleRate.role_id == role_id, Estimate.active_version == True))
        )
        if result.scalar_one() > 0:
            return True

        return False

    async def _build_role_response(self, role_id: UUID) -> Optional[RoleResponse]:
        """Load a role with rates and build response."""
        result = await self.session.execute(
            select(Role)
            .options(
                selectinload(Role.role_rates).selectinload(RoleRate.delivery_center),
            )
            .where(Role.id == role_id)
        )
        role = result.scalar_one_or_none()
        if not role:
            return None

        # Build response payload
        rates_payload = []
        if role.role_rates:
            for r in role.role_rates:
                rates_payload.append(
                    {
                        "id": r.id,
                        "delivery_center_code": getattr(r.delivery_center, "code", None)
                        or getattr(r, "delivery_center_code", None),
                        "default_currency": r.default_currency,
                        "internal_cost_rate": r.internal_cost_rate,
                        "external_rate": r.external_rate,
                        "delivery_center_id": getattr(r.delivery_center, "id", None),
                    }
                )
        else:
            # Roles must have at least one role_rate - if none exist, return empty list
            # This should not happen in normal operation as roles require role_rates
            pass

        role_payload = {
            "id": role.id,
            "role_name": role.role_name,
            "status": role.status,
            "role_rates": rates_payload,
        }

        return RoleResponse.model_validate(role_payload)

    async def _upsert_role_rates(
        self,
        role_id: UUID,
        rates: List[dict],
        replace_existing: bool = False,
    ) -> None:
        """Create or update role rates for a role."""
        # Load existing rates for this role with delivery center relationship
        existing_rates_result = await self.session.execute(
            select(RoleRate)
            .options(selectinload(RoleRate.delivery_center))
            .where(RoleRate.role_id == role_id)
        )
        existing_rates = list(existing_rates_result.scalars().all())
        
        # Create a map of existing rates by (delivery_center_code, default_currency)
        existing_rate_map: dict[tuple[str, str], RoleRate] = {}
        for rate in existing_rates:
            dc_code = getattr(rate.delivery_center, "code", None) if rate.delivery_center else None
            if dc_code:
                key = (dc_code.lower(), rate.default_currency.upper())
                existing_rate_map[key] = rate
        
        # Track which rates we've processed
        processed_rate_ids: set[UUID] = set()
        
        # Process each new rate
        for rate_data in rates:
            delivery_center = await self._get_or_create_delivery_center(rate_data["delivery_center_code"])
            dc_code = delivery_center.code.lower()
            currency = rate_data["default_currency"].upper()
            key = (dc_code, currency)
            
            if key in existing_rate_map:
                # Update existing rate
                existing_rate = existing_rate_map[key]
                existing_rate.internal_cost_rate = rate_data["internal_cost_rate"]
                existing_rate.external_rate = rate_data["external_rate"]
                processed_rate_ids.add(existing_rate.id)
            else:
                # Create new rate
                role_rate = RoleRate(
                    role_id=role_id,
                    delivery_center_id=delivery_center.id,
                    default_currency=rate_data["default_currency"],
                    internal_cost_rate=rate_data["internal_cost_rate"],
                    external_rate=rate_data["external_rate"],
                )
                self.session.add(role_rate)
        
        # Delete rates that are not in the new list (only if replace_existing is True)
        # Note: Validation should have prevented deletion of rates in use
        if replace_existing:
            rates_to_delete = [r for r in existing_rates if r.id not in processed_rate_ids]
            if rates_to_delete:
                # Check which rates are in use by estimate_line_items
                from app.models.estimate import EstimateLineItem
                rate_ids_to_delete = [r.id for r in rates_to_delete]
                in_use_result = await self.session.execute(
                    select(EstimateLineItem.role_rates_id)
                    .where(EstimateLineItem.role_rates_id.in_(rate_ids_to_delete))
                    .distinct()
                )
                in_use_ids = set(in_use_result.scalars().all())
                
                # Only delete rates that are not in use
                for rate_to_delete in rates_to_delete:
                    if rate_to_delete.id not in in_use_ids:
                        await self.session.delete(rate_to_delete)
                    # If it is in use, skip deletion (validation should have caught this)

        await self.session.flush()

    async def _get_or_create_delivery_center(self, code: str) -> DeliveryCenter:
        """Find or create a delivery center by code."""
        normalized_code = code.strip().lower()
        name_map = {
            "north-america": "North America",
            "thailand": "Thailand",
            "philippines": "Philippines",
            "australia": "Australia",
        }

        existing = await self.session.execute(
            select(DeliveryCenter).where(DeliveryCenter.code == normalized_code)
        )
        delivery_center = existing.scalar_one_or_none()
        if delivery_center:
            return delivery_center

        # Create if it doesn't exist yet
        delivery_center = DeliveryCenter(
            name=name_map.get(normalized_code, normalized_code.replace("-", " ").title()),
            code=normalized_code,
        )
        self.session.add(delivery_center)
        await self.session.flush()
        return delivery_center

