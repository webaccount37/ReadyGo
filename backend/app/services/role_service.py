"""
Role service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.repositories.role_repository import RoleRepository
from app.db.repositories.role_rate_repository import RoleRateRepository
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse
from app.models.role_rate import RoleRate
from app.models.delivery_center import DeliveryCenter
from app.models.role import Role, RoleStatus
import uuid
from sqlalchemy import func
from app.models.association_models import EmployeeEngagement, EmployeeRelease
from app.models.association_tables import engagement_roles, release_roles
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

        # Default legacy fields from first rate if not provided
        if rates:
            primary_rate = rates[0]
            role_dict.setdefault("role_internal_cost_rate", primary_rate["internal_cost_rate"])
            role_dict.setdefault("role_external_rate", primary_rate["external_rate"])
            role_dict.setdefault("default_currency", primary_rate["currency"])

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
        role = await self.role_repo.get_with_relationships(role_id)
        if not role:
            return None
        return RoleResponse.model_validate(role)
    
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

        # Refresh legacy fields if we have rates
        if rates:
            primary_rate = rates[0]
            update_dict.setdefault("role_internal_cost_rate", primary_rate["internal_cost_rate"])
            update_dict.setdefault("role_external_rate", primary_rate["external_rate"])
            update_dict.setdefault("default_currency", primary_rate["currency"])

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

        ep_result = await self.session.execute(
            select(DeliveryCenter.code)
            .join(EmployeeEngagement, EmployeeEngagement.delivery_center_id == DeliveryCenter.id)
            .where(EmployeeEngagement.role_id == role_id)
            .distinct()
        )
        used_dc_codes.update([row[0] for row in ep_result.fetchall() if row[0]])

        er_result = await self.session.execute(
            select(DeliveryCenter.code)
            .join(EmployeeRelease, EmployeeRelease.delivery_center_id == DeliveryCenter.id)
            .where(EmployeeRelease.role_id == role_id)
            .distinct()
        )
        used_dc_codes.update([row[0] for row in er_result.fetchall() if row[0]])

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
                current_rate_currency_by_dc[dc_code] = r.currency

        proposed_currency_by_dc = {r["delivery_center_code"]: r["currency"] for r in new_rates if r.get("delivery_center_code")}

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
        # engagement_roles
        proj = await self.session.execute(
            select(func.count()).select_from(engagement_roles).where(engagement_roles.c.role_id == role_id)
        )
        if proj.scalar_one() > 0:
            return True

        # release_roles
        rel = await self.session.execute(
            select(func.count()).select_from(release_roles).where(release_roles.c.role_id == role_id)
        )
        if rel.scalar_one() > 0:
            return True

        # employee_engagements
        ep = await self.session.execute(
            select(func.count()).select_from(EmployeeEngagement).where(EmployeeEngagement.role_id == role_id)
        )
        if ep.scalar_one() > 0:
            return True

        # employee_releases
        er = await self.session.execute(
            select(func.count()).select_from(EmployeeRelease).where(EmployeeRelease.role_id == role_id)
        )
        if er.scalar_one() > 0:
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

        # Build response payload, adding a fallback rate for legacy roles missing role_rates
        rates_payload = []
        if role.role_rates:
            for r in role.role_rates:
                rates_payload.append(
                    {
                        "id": r.id,
                        "delivery_center_code": getattr(r.delivery_center, "code", None)
                        or getattr(r, "delivery_center_code", None),
                        "currency": r.currency,
                        "internal_cost_rate": r.internal_cost_rate,
                        "external_rate": r.external_rate,
                        "delivery_center_id": getattr(r.delivery_center, "id", None),
                    }
                )
        else:
            # Fallback for existing roles without role_rates to avoid validation errors
            dc_code = "north-america"
            rates_payload.append(
                {
                    "id": uuid.uuid4(),
                    "delivery_center_code": dc_code,
                    "currency": role.default_currency or "USD",
                    "internal_cost_rate": role.role_internal_cost_rate or 0.0,
                    "external_rate": role.role_external_rate or 0.0,
                    "delivery_center_id": None,
                }
            )

        role_payload = {
            "id": role.id,
            "role_name": role.role_name,
            "role_internal_cost_rate": role.role_internal_cost_rate,
            "role_external_rate": role.role_external_rate,
            "status": role.status,
            "default_currency": role.default_currency,
            "role_rates": rates_payload,
        }

        return RoleResponse.model_validate(role_payload)

    async def _upsert_role_rates(
        self,
        role_id: UUID,
        rates: List[dict],
        replace_existing: bool = False,
    ) -> None:
        """Create or replace role rates for a role."""
        if replace_existing:
            await self.role_rate_repo.delete_for_role(role_id)

        for rate_data in rates:
            delivery_center = await self._get_or_create_delivery_center(rate_data["delivery_center_code"])
            role_rate = RoleRate(
                role_id=role_id,
                delivery_center_id=delivery_center.id,
                currency=rate_data["currency"],
                internal_cost_rate=rate_data["internal_cost_rate"],
                external_rate=rate_data["external_rate"],
            )
            self.session.add(role_rate)

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

