"""
Employee service with business logic.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.base_service import BaseService
from app.db.repositories.employee_repository import EmployeeRepository
from app.db.repositories.engagement_repository import EngagementRepository
from app.db.repositories.release_repository import ReleaseRepository
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse, EngagementReference, ReleaseReference
from app.schemas.relationships import LinkEmployeesToEngagementRequest, LinkEmployeesToReleaseRequest
from app.models.employee import Employee


class EmployeeService(BaseService):
    """Service for employee operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.employee_repo = EmployeeRepository(session)
        self.engagement_repo = EngagementRepository(session)
        self.release_repo = ReleaseRepository(session)
    
    async def create_employee(self, employee_data: EmployeeCreate) -> EmployeeResponse:
        """Create a new employee."""
        employee_dict = employee_data.model_dump(exclude_unset=True)
        delivery_center_code = employee_dict.pop("delivery_center", None)
        if delivery_center_code:
            dc = await self._get_or_create_delivery_center(delivery_center_code)
            employee_dict["delivery_center_id"] = dc.id
        employee = await self.employee_repo.create(**employee_dict)
        await self.session.commit()
        await self.session.refresh(employee)
        return self._employee_to_response(employee, include_relationships=False)
    
    async def get_employee(self, employee_id: UUID) -> Optional[EmployeeResponse]:
        """Get employee by ID."""
        employee = await self.employee_repo.get(employee_id)
        if not employee:
            return None
        return self._employee_to_response(employee, include_relationships=False)
    
    async def get_employee_with_relationships(self, employee_id: UUID) -> Optional[EmployeeResponse]:
        """Get employee with related engagements and releases."""
        import logging
        logger = logging.getLogger(__name__)
        
        try:
            employee = await self.employee_repo.get_with_relationships(employee_id)
            if not employee:
                return None
            return self._employee_to_response(employee, include_relationships=True)
        except Exception as e:
            logger.error(f"Error in get_employee_with_relationships: {e}", exc_info=True)
            # Fallback to basic employee retrieval without relationships
            employee = await self.employee_repo.get(employee_id)
            if not employee:
                return None
            return self._employee_to_response(employee, include_relationships=False)
    
    async def list_employees(
        self,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        employee_type: Optional[str] = None,
        billable: Optional[bool] = None,
    ) -> tuple[List[EmployeeResponse], int]:
        """List employees with optional filters."""
        from app.models.employee import EmployeeStatus, EmployeeType
        
        if status:
            try:
                status_enum = EmployeeStatus(status)
                employees = await self.employee_repo.list_by_status(status_enum, skip, limit)
            except ValueError:
                employees = []
        elif employee_type:
            try:
                type_enum = EmployeeType(employee_type)
                employees = await self.employee_repo.list_by_type(type_enum, skip, limit)
            except ValueError:
                employees = []
        elif billable is True:
            employees = await self.employee_repo.list_billable(skip, limit)
        else:
            employees = await self.employee_repo.list(skip=skip, limit=limit)
        
        total = len(employees)
        # Build responses without relationships (set to empty lists to avoid lazy loading issues)
        responses = []
        for emp in employees:
            responses.append(self._employee_to_response(emp, include_relationships=False))
        return responses, total
    
    async def update_employee(
        self,
        employee_id: UUID,
        employee_data: EmployeeUpdate,
    ) -> Optional[EmployeeResponse]:
        """Update an employee."""
        employee = await self.employee_repo.get(employee_id)
        if not employee:
            return None
        
        # Validate end_date against start_date
        # The schema validates when both are provided in the update
        # Here we validate when only end_date is provided (compare against existing start_date)
        # or when only start_date is provided (compare against existing end_date)
        new_start_date = employee_data.start_date if employee_data.start_date is not None else employee.start_date
        new_end_date = employee_data.end_date
        
        # If end_date is being set (not cleared), validate it
        if new_end_date is not None and new_start_date is not None:
            if new_end_date <= new_start_date:
                raise ValueError("End date must be after start date")
        
        # Use exclude_none=False to ensure None values are included (for clearing fields)
        update_dict = employee_data.model_dump(exclude_unset=True, exclude_none=False)
        if "delivery_center" in update_dict:
            dc_code = update_dict.pop("delivery_center")
            if dc_code is not None:
                dc = await self._get_or_create_delivery_center(dc_code)
                update_dict["delivery_center_id"] = dc.id
        updated = await self.employee_repo.update(employee_id, **update_dict)
        await self.session.commit()
        await self.session.refresh(updated)
        
        # Convert to dict first to avoid lazy loading issues, then add empty relationships
        employee_dict = {
            k: v for k, v in updated.__dict__.items() 
            if not k.startswith('_') and k not in ['engagements', 'releases']
        }
        employee_dict['delivery_center'] = getattr(updated.delivery_center, "code", None) if hasattr(updated, "delivery_center") else None
        employee_dict['engagements'] = []
        employee_dict['releases'] = []
        return EmployeeResponse.model_validate(employee_dict)
    
    async def delete_employee(self, employee_id: UUID) -> bool:
        """Delete an employee."""
        deleted = await self.employee_repo.delete(employee_id)
        await self.session.commit()
        return deleted

    def _employee_to_response(self, employee, include_relationships: bool) -> EmployeeResponse:
        """Build EmployeeResponse from model with eager-loaded relationships."""
        # Base dict without lazy attributes
        base = {
            "id": employee.id,
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "email": employee.email,
            "employee_type": employee.employee_type,
            "status": employee.status,
            "role_title": employee.role_title,
            "role_id": employee.role_id,
            "skills": employee.skills,
            "internal_cost_rate": employee.internal_cost_rate,
            "internal_bill_rate": employee.internal_bill_rate,
            "external_bill_rate": employee.external_bill_rate,
            "start_date": employee.start_date,
            "end_date": employee.end_date,
            "availability_calendar_id": employee.availability_calendar_id,
            "billable": employee.billable,
            "default_currency": employee.default_currency,
            "timezone": employee.timezone,
            "delivery_center": getattr(employee.delivery_center, "code", None) if hasattr(employee, "delivery_center") else None,
        }

        if include_relationships:
            # Build engagements and releases from eager-loaded associations
            engagements = []
            for assoc in getattr(employee, "engagement_associations", []) or []:
                if assoc.engagement:
                    engagements.append({
                        "id": str(assoc.engagement.id),
                        "name": assoc.engagement.name,
                        "role_id": str(assoc.role_id) if assoc.role_id else None,
                        "role_name": getattr(assoc.role, "role_name", None),
                        "start_date": assoc.start_date.isoformat() if assoc.start_date else None,
                        "end_date": assoc.end_date.isoformat() if assoc.end_date else None,
                        "project_rate": float(assoc.project_rate) if assoc.project_rate is not None else None,
                        "delivery_center": getattr(assoc.delivery_center, "code", None),
                    })
            releases = []
            for assoc in getattr(employee, "release_associations", []) or []:
                if assoc.release:
                    releases.append({
                        "id": str(assoc.release.id),
                        "name": assoc.release.name,
                        "engagement_id": str(assoc.release.engagement_id) if assoc.release.engagement_id else None,
                        "role_id": str(assoc.role_id) if assoc.role_id else None,
                        "role_name": getattr(assoc.role, "role_name", None),
                        "start_date": assoc.start_date.isoformat() if assoc.start_date else None,
                        "end_date": assoc.end_date.isoformat() if assoc.end_date else None,
                        "project_rate": float(assoc.project_rate) if assoc.project_rate is not None else None,
                        "delivery_center": getattr(assoc.delivery_center, "code", None),
                    })
            base["engagements"] = engagements
            base["releases"] = releases
        else:
            base["engagements"] = []
            base["releases"] = []

        return EmployeeResponse.model_validate(base)
    
    async def link_employees_to_engagement(
        self,
        engagement_id: UUID,
        request: LinkEmployeesToEngagementRequest,
    ) -> bool:
        """Link employees to an engagement and releases. Fields are only on releases, not engagements."""
        import logging
        from sqlalchemy import select
        from app.models.association_models import EmployeeEngagement, EmployeeRelease
        from app.db.repositories.role_repository import RoleRepository
        from app.db.repositories.release_repository import ReleaseRepository
        from app.models.delivery_center import DeliveryCenter as DeliveryCenterModel
        from datetime import date
        
        logger = logging.getLogger(__name__)
        
        try:
            engagement = await self.engagement_repo.get(engagement_id)
            if not engagement:
                logger.warning(f"Engagement {engagement_id} not found")
                return False
            
            # Get existing employee IDs from the engagement associations
            existing_associations = await self.session.execute(
                select(EmployeeEngagement).where(
                    EmployeeEngagement.engagement_id == engagement_id,
                    EmployeeEngagement.employee_id.in_(request.employee_ids)
                )
            )
            existing_employee_ids = {assoc.employee_id for assoc in existing_associations.scalars()}
            logger.info(f"Found {len(existing_employee_ids)} existing engagement associations")
            
            # Create engagement associations (without fields - fields are only on releases)
            # Note: EmployeeEngagement model still requires these fields, so we'll use placeholder values
            # TODO: Consider making these nullable or removing them in a future migration
            associations_created = 0
            role_repo = RoleRepository(self.session)
            # Get a default role (first role) for placeholder - or make these nullable
            default_role = await role_repo.list(limit=1)
            default_role_id = default_role[0].id if default_role else None
            if not default_role_id:
                raise ValueError("No roles exist in the system. Please create at least one role.")
            
            # Get default delivery center
            delivery_center_result = await self.session.execute(
                select(DeliveryCenterModel).limit(1)
            )
            default_dc = delivery_center_result.scalar_one_or_none()
            if not default_dc:
                raise ValueError("No delivery centers exist in the system.")
            
            for emp_id in request.employee_ids:
                if emp_id not in existing_employee_ids:
                    employee = await self.employee_repo.get(emp_id)
                    if not employee:
                        logger.warning(f"Employee {emp_id} not found")
                        continue
                    
                    # Create engagement association with placeholder values (fields are on releases only)
                    association = EmployeeEngagement(
                        employee_id=emp_id,
                        engagement_id=engagement_id,
                        role_id=default_role_id,  # Placeholder
                        start_date=date.today(),  # Placeholder
                        end_date=date.today(),  # Placeholder
                        project_rate=0.0,  # Placeholder
                        delivery_center_id=default_dc.id,  # Placeholder
                    )
                    logger.info(f"Creating EmployeeEngagement (placeholder fields): employee_id={emp_id}, engagement_id={engagement_id}")
                    self.session.add(association)
                    associations_created += 1
            
            # Now link employees to releases with actual fields
            release_repo = ReleaseRepository(self.session)
            releases_created = 0
            
            # Verify all releases belong to the engagement and link with fields
            for release_data in request.releases:
                release = await release_repo.get(release_data.release_id)
                if not release:
                    raise ValueError(f"Release {release_data.release_id} not found")
                if release.engagement_id != engagement_id:
                    raise ValueError(f"Release {release_data.release_id} does not belong to engagement {engagement_id}")
                
                # Verify role exists
                role = await role_repo.get(release_data.role_id)
                if not role:
                    raise ValueError(f"Role {release_data.role_id} does not exist")
                
                # Look up delivery center
                delivery_center_result = await self.session.execute(
                    select(DeliveryCenterModel).where(DeliveryCenterModel.code == release_data.delivery_center)
                )
                delivery_center = delivery_center_result.scalar_one_or_none()
                if not delivery_center:
                    raise ValueError(f"Delivery center with code '{release_data.delivery_center}' not found")
                
                # Link employees to this release with fields
                for emp_id in request.employee_ids:
                    if emp_id not in existing_employee_ids:
                        # Check if release association already exists
                        existing_release_assoc = await self.session.execute(
                            select(EmployeeRelease).where(
                                EmployeeRelease.employee_id == emp_id,
                                EmployeeRelease.release_id == release_data.release_id
                            )
                        )
                        if existing_release_assoc.scalar_one_or_none():
                            logger.info(f"Employee {emp_id} already linked to release {release_data.release_id}, skipping")
                            continue
                        
                        # Create release association with actual fields
                        release_association = EmployeeRelease(
                            employee_id=emp_id,
                            release_id=release_data.release_id,
                            role_id=release_data.role_id,
                            start_date=release_data.start_date,
                            end_date=release_data.end_date,
                            project_rate=release_data.project_rate,
                            delivery_center_id=delivery_center.id,
                        )
                        logger.info(f"Creating EmployeeRelease: employee_id={emp_id}, release_id={release_data.release_id}, role_id={release_data.role_id}")
                        self.session.add(release_association)
                        releases_created += 1
                        
                        # Track release IDs that need syncing
                        if not hasattr(self, '_releases_to_sync'):
                            self._releases_to_sync = {}
                        if release_data.release_id not in self._releases_to_sync:
                            self._releases_to_sync[release_data.release_id] = []
                        self._releases_to_sync[release_data.release_id].append(emp_id)
            
            if associations_created == 0 and releases_created == 0:
                logger.warning(f"No new associations created - all employees already linked")
                return True
            
            # Sync to estimate line items for all releases that were updated
            await self.session.flush()  # Flush to get associations saved
            if hasattr(self, '_releases_to_sync'):
                for release_id, employee_ids in self._releases_to_sync.items():
                    await self._sync_employee_release_to_quotes(release_id, employee_ids)
                delattr(self, '_releases_to_sync')
            
            logger.info(f"About to flush and commit {associations_created} engagement associations and {releases_created} release associations")
            await self.session.flush()
            await self.session.commit()
            logger.info(f"Successfully committed {associations_created} engagement associations and {releases_created} release associations")
            
            return True
        except ValueError as e:
            logger.error(f"Validation error linking employees to engagement: {e}", exc_info=True)
            await self.session.rollback()
            raise
        except Exception as e:
            logger.error(f"Unexpected error linking employees to engagement: {e}", exc_info=True)
            logger.error(f"Error type: {type(e).__name__}")
            logger.error(f"Error args: {e.args}")
            await self.session.rollback()
            raise
    
    async def unlink_employees_from_engagement(
        self,
        engagement_id: UUID,
        employee_ids: List[UUID],
    ) -> bool:
        """Unlink employees from an engagement."""
        from sqlalchemy import select
        from app.models.association_models import EmployeeEngagement
        
        # Delete association objects
        result = await self.session.execute(
            select(EmployeeEngagement).where(
                EmployeeEngagement.engagement_id == engagement_id,
                EmployeeEngagement.employee_id.in_(employee_ids)
            )
        )
        associations = result.scalars().all()
        for assoc in associations:
            await self.session.delete(assoc)
        
        await self.session.commit()
        return True

    async def _get_or_create_delivery_center(self, code: str):
        """Ensure a delivery center exists for the provided code."""
        from sqlalchemy import select
        from app.models.delivery_center import DeliveryCenter

        normalized = code.strip().lower()
        name_map = {
            "north-america": "North America",
            "thailand": "Thailand",
            "philippines": "Philippines",
            "australia": "Australia",
        }
        result = await self.session.execute(
            select(DeliveryCenter).where(DeliveryCenter.code == normalized)
        )
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        dc = DeliveryCenter(name=name_map.get(normalized, normalized.title()), code=normalized)
        self.session.add(dc)
        await self.session.flush()
        return dc
    
    async def link_employees_to_release(
        self,
        release_id: UUID,
        request: LinkEmployeesToReleaseRequest,
    ) -> bool:
        """Link employees to a release with association fields."""
        from sqlalchemy import select
        from app.models.association_models import EmployeeRelease
        
        release = await self.release_repo.get(release_id)
        if not release:
            return False
        
        # Get existing employee IDs from the release associations
        existing_associations = await self.session.execute(
            select(EmployeeRelease).where(EmployeeRelease.release_id == release_id)
        )
        existing_employee_ids = {assoc.employee_id for assoc in existing_associations.scalars()}
        
        # Look up delivery center by code
        from app.models.delivery_center import DeliveryCenter as DeliveryCenterModel
        delivery_center_result = await self.session.execute(
            select(DeliveryCenterModel).where(DeliveryCenterModel.code == request.delivery_center)
        )
        delivery_center = delivery_center_result.scalar_one_or_none()
        if not delivery_center:
            all_dc_result = await self.session.execute(select(DeliveryCenterModel))
            all_dcs = list(all_dc_result.scalars())
            available_codes = [dc.code for dc in all_dcs]
            raise ValueError(f"Delivery center with code '{request.delivery_center}' not found. Available codes: {available_codes}")
        
        # Verify role exists
        from app.db.repositories.role_repository import RoleRepository
        role_repo = RoleRepository(self.session)
        role = await role_repo.get(request.role_id)
        if not role:
            raise ValueError(f"Role {request.role_id} not found")
        
        # Create new associations for employees not already linked
        for emp_id in request.employee_ids:
            if emp_id not in existing_employee_ids:
                employee = await self.employee_repo.get(emp_id)
                if not employee:
                    continue
                
                # Create association with delivery_center_id foreign key
                association = EmployeeRelease(
                    employee_id=emp_id,
                    release_id=release_id,
                    role_id=request.role_id,
                    start_date=request.start_date,
                    end_date=request.end_date,
                    project_rate=request.project_rate,
                    delivery_center_id=delivery_center.id,
                )
                self.session.add(association)
        
        await self.session.flush()  # Flush to get associations saved
        
        # Sync to estimate line items for all employees in this request
        await self._sync_employee_release_to_quotes(release_id, request.employee_ids)
        
        await self.session.commit()
        return True
    
    async def _sync_employee_release_to_quotes(self, release_id: UUID, employee_ids: List[UUID]) -> None:
        """Sync EmployeeRelease associations to estimate line items."""
        from sqlalchemy import select
        from app.models.association_models import EmployeeRelease
        from app.models.estimate import Estimate, EstimateLineItem
        
        # Get all EmployeeRelease associations for these employees and release
        result = await self.session.execute(
            select(EmployeeRelease).where(
                EmployeeRelease.release_id == release_id,
                EmployeeRelease.employee_id.in_(employee_ids)
            )
        )
        associations = result.scalars().all()
        
        # Get all estimates for this release
        estimates_result = await self.session.execute(
            select(Estimate).where(Estimate.release_id == release_id)
        )
        estimates = estimates_result.scalars().all()
        
        # Update estimate line items for each association
        for assoc in associations:
            for estimate in estimates:
                # Find line items for this employee in this estimate
                line_items_result = await self.session.execute(
                    select(EstimateLineItem).where(
                        EstimateLineItem.quote_id == estimate.id,  # Keep column name for DB compatibility
                        EstimateLineItem.employee_id == assoc.employee_id
                    )
                )
                line_items = line_items_result.scalars().all()
                
                # Update each line item with values from EmployeeRelease
                for line_item in line_items:
                    line_item.role_id = assoc.role_id
                    line_item.start_date = assoc.start_date
                    line_item.end_date = assoc.end_date
                    line_item.rate = assoc.project_rate  # Use project_rate as rate
                    line_item.delivery_center_id = assoc.delivery_center_id
    
    async def unlink_employees_from_release(
        self,
        release_id: UUID,
        employee_ids: List[UUID],
    ) -> bool:
        """Unlink employees from a release."""
        from sqlalchemy import select
        from app.models.association_models import EmployeeRelease
        
        # Delete association objects
        result = await self.session.execute(
            select(EmployeeRelease).where(
                EmployeeRelease.release_id == release_id,
                EmployeeRelease.employee_id.in_(employee_ids)
            )
        )
        associations = result.scalars().all()
        for assoc in associations:
            await self.session.delete(assoc)
        
        await self.session.commit()
        return True

