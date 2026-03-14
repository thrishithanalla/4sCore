"""
Audit Log Master Service
Business logic layer for audit log master operations.
"""
from typing import Optional, List, Dict, Any
from bson import ObjectId
from fastapi import HTTPException, status

from app.core.database import get_database
from app.core.constants import Collections
from app.api.v1.repositories.log_master_repository import LogMasterRepository
from app.utils.response_helpers import error_response
from app.utils.time_utils import get_ist_now
from app.core.value_sets import normalize_code


class LogMasterService:
    """Service class for audit log master business logic"""

    def __init__(self):
        self.repository = LogMasterRepository()
        self.db = get_database()

    async def validate_unique_eventcode(self, event_code: str, exclude_id: str = None) -> bool:
        """
        Validate that the audit log master eventCode is unique.

        Args:
            event_code: Event code string
            exclude_id: Optional ID to exclude (for updates)

        Returns:
            True if unique

        Raises:
            HTTPException: If eventCode already exists
        """
        exists = await self.repository.exists_by_eventcode(event_code, exclude_id)

        if exists:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=error_response(
                    message=f"Audit Log Master with eventCode '{event_code}' already exists",
                    status_code=409,
                    error_code="ERR.CORE.LOG_MASTER.DUPLICATE"
                )
            )

        return True

    async def validate_value_sets(self, data: dict):
        """
        Validate ValueSet fields against value_sets_master collection.

        Args:
            data: Dictionary containing fields to validate

        Raises:
            HTTPException: If any ValueSet value is invalid
        """
        valueset_fields = {
            "action": "Actions",
            "layer": "layer",
            "logtype": "logType",
        }

        for field, vs_key in valueset_fields.items():
            if field in data and data[field] is not None:
                try:
                    data[field] = await normalize_code(self.db, vs_key, data[field])
                except ValueError as e:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=error_response(
                            message=str(e),
                            status_code=422,
                            error_code="ERR.CORE.VALIDATION.INVALID_VALUESET"
                        )
                    )

    async def create(
        self,
        log_master_data: Dict[str, Any],
        created_by: str,
        created_ip: str
    ) -> dict:
        """
        Create a new audit log master.

        Args:
            log_master_data: Audit log master data from schema
            created_by: User ID creating the record
            created_ip: Client IP address

        Returns:
            Created audit log master document
        """
        # Validate unique eventCode
        await self.validate_unique_eventcode(log_master_data["eventCode"])

        # Validate ValueSet fields
        await self.validate_value_sets(log_master_data)

        # Set audit fields
        log_master_data["createdBy"] = ObjectId(created_by)
        log_master_data["createdAt"] = get_ist_now()
        log_master_data["createdIp"] = created_ip
        log_master_data["updatedBy"] = None
        log_master_data["updatedAt"] = None
        log_master_data["updatedIp"] = None
        log_master_data["isDelete"] = False

        return await self.repository.create(log_master_data)

    async def get_by_id(self, id: str) -> dict:
        """
        Get an audit log master by ID.

        Args:
            id: Audit log master ID

        Returns:
            Audit log master document

        Raises:
            HTTPException: If not found
        """
        if not ObjectId.is_valid(id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    message="Invalid id format",
                    status_code=400,
                    error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
                )
            )

        log_master = await self.repository.find_by_id(id, include_deleted=True)

        if not log_master:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    message="Audit log master not found",
                    status_code=404,
                    error_code="ERR.CORE.LOG_MASTER.NOT_FOUND"
                )
            )

        return log_master

    async def get_list(
        self,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        layer: Optional[str] = None,
        action: Optional[str] = None,
        logObject: Optional[str] = None,
        logtype: Optional[str] = None,
        eventCode: Optional[str] = None,
        include_deleted: bool = False
    ) -> Dict[str, Any]:
        """
        Get list of audit log masters with filters and pagination.

        Args:
            page: Page number
            page_size: Items per page
            layer: Filter by layer
            action: Filter by action
            logObject: Filter by logObject
            logtype: Filter by logtype
            eventCode: Filter/search by eventCode
            include_deleted: Include soft-deleted records

        Returns:
            Paginated response dict
        """
        query = {}

        if not include_deleted:
            query["isDelete"] = False

        if layer:
            query["layer"] = layer

        if action:
            query["action"] = action

        if logObject:
            query["logObject"] = logObject

        if logtype:
            query["logtype"] = logtype

        if eventCode:
            query["eventCode"] = {"$regex": eventCode, "$options": "i"}

        items, total = await self.repository.find_all(
            query=query,
            page=page,
            page_size=page_size
        )

        actual_page_size = page_size or total or 1
        total_pages = (total + actual_page_size - 1) // actual_page_size if actual_page_size > 0 else 1

        return {
            "items": items,
            "total": total,
            "page": page or 1,
            "page_size": actual_page_size,
            "total_pages": total_pages
        }

    async def update(
        self,
        id: str,
        update_data: Dict[str, Any],
        updated_by: str,
        updated_ip: str
    ) -> dict:
        """
        Update an audit log master.

        Args:
            id: Audit log master ID
            update_data: Fields to update
            updated_by: User ID updating the record
            updated_ip: Client IP address

        Returns:
            Updated audit log master document
        """
        if not ObjectId.is_valid(id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    message="Invalid id format",
                    status_code=400,
                    error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
                )
            )

        # Check if exists
        existing = await self.repository.find_by_id(id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    message="Audit log master not found",
                    status_code=404,
                    error_code="ERR.CORE.LOG_MASTER.NOT_FOUND"
                )
            )

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    message="No fields to update",
                    status_code=400,
                    error_code="ERR.CORE.VALIDATION.NO_FIELDS"
                )
            )

        # Validate unique eventCode if being updated
        if "eventCode" in update_data:
            await self.validate_unique_eventcode(update_data["eventCode"], exclude_id=id)

        # Validate ValueSet fields if being updated
        await self.validate_value_sets(update_data)

        # Set audit fields
        update_data["updatedBy"] = ObjectId(updated_by)
        update_data["updatedAt"] = get_ist_now()
        update_data["updatedIp"] = updated_ip

        return await self.repository.update(id, update_data)

    async def delete(
        self,
        id: str,
        deleted_by: str,
        deleted_ip: str
    ) -> bool:
        """
        Soft delete an audit log master.

        Args:
            id: Audit log master ID
            deleted_by: User ID deleting the record
            deleted_ip: Client IP address

        Returns:
            True if deleted
        """
        if not ObjectId.is_valid(id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    message="Invalid id format",
                    status_code=400,
                    error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
                )
            )

        existing = await self.repository.find_by_id(id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    message="Audit log master not found",
                    status_code=404,
                    error_code="ERR.CORE.LOG_MASTER.NOT_FOUND"
                )
            )

        update_data = {
            "isDelete": True,
            "updatedBy": ObjectId(deleted_by),
            "updatedAt": get_ist_now(),
            "updatedIp": deleted_ip
        }

        return await self.repository.soft_delete(id, update_data)
