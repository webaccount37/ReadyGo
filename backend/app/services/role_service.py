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
from app.db.repositories.delivery_center_repository import DeliveryCenterRepository
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse
from app.models.role_rate import RoleRate
from app.models.delivery_center import DeliveryCenter
from app.models.role import Role
from sqlalchemy import func


class RoleService(BaseService):
    """Service for role operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.role_repo = RoleRepository(session)
        self.role_rate_repo = RoleRateRepository(session)
        self.delivery_center_repo = DeliveryCenterRepository(session)
    
    async def create_role(self, role_data: RoleCreate) -> RoleResponse:
        """Create a new role with exactly one rate per delivery center."""
        role_dict = role_data.model_dump(exclude_unset=True)
        rates_payload = role_dict.pop("role_rates", [])

        # Build map of delivery_center_code -> rate values from payload
        rates_by_dc: dict[str, dict] = {
            r["delivery_center_code"].lower(): r for r in rates_payload
            if r.get("delivery_center_code")
        }

        role = await self.role_repo.create(**role_dict)
        all_dcs = await self.delivery_center_repo.list_all()

        for dc in all_dcs:
            dc_code = dc.code.lower()
            override = rates_by_dc.get(dc_code)
            if override:
                currency = override.get("default_currency", dc.default_currency)
                icr = override.get("internal_cost_rate", 0.0)
                ext = override.get("external_rate", 0.0)
            else:
                currency = dc.default_currency
                icr = 0.0
                ext = 0.0

            role_rate = RoleRate(
                role_id=role.id,
                delivery_center_id=dc.id,
                default_currency=currency,
                internal_cost_rate=float(icr),
                external_rate=float(ext),
            )
            self.session.add(role_rate)

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
    ) -> tuple[List[RoleResponse], int]:
        """List roles with optional filters."""
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

        updated = await self.role_repo.update(role_id, **update_dict)

        if rates is not None:
            await self._update_role_rates(role_id, rates)

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
            "role_rates": rates_payload,
        }

        return RoleResponse.model_validate(role_payload)

    async def _update_role_rates(self, role_id: UUID, rates: List[dict]) -> None:
        """Update existing role rates only. No add/remove."""
        rates_by_dc: dict[str, dict] = {
            r["delivery_center_code"].lower(): r for r in rates
            if r.get("delivery_center_code")
        }
        existing_rates_result = await self.session.execute(
            select(RoleRate)
            .options(selectinload(RoleRate.delivery_center))
            .where(RoleRate.role_id == role_id)
        )
        existing_rates = list(existing_rates_result.scalars().all())
        for rate in existing_rates:
            dc_code = getattr(rate.delivery_center, "code", None) if rate.delivery_center else None
            if not dc_code:
                continue
            override = rates_by_dc.get(dc_code.lower())
            if override:
                rate.default_currency = override.get("default_currency", rate.default_currency)
                rate.internal_cost_rate = float(override.get("internal_cost_rate", rate.internal_cost_rate))
                rate.external_rate = float(override.get("external_rate", rate.external_rate))
        await self.session.flush()

