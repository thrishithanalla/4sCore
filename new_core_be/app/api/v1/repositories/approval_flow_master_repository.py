"""
Approval Flow Master Repository.

This module provides the data access layer for the approval_flow_master collection
in MongoDB. Approval flow masters define templates for approval workflows,
specifying the sequence of approvers and conditions for each approval stage.

An approval flow master is a blueprint that gets instantiated as an approval chain
when a user submits a request requiring approval. It defines:
    - The sequence of approval stages
    - Who can approve at each stage (by role, designation, or specific user)
    - Conditions for automatic approval or escalation
    - Timeout and delegation rules

Key Features:
    - CRUD operations for approval flow master records
    - Query by name and module
    - Unique name constraint enforcement
    - Soft delete pattern with isDelete flag
    - Automatic ObjectId conversion for foreign key fields
    - Pagination support for list operations

Collections Referenced:
    - approval_flow_master: Primary collection for this repository
    - modules: Referenced by moduleId to categorize flows
    - personnel_master: Referenced by createdBy, updatedBy, deletedBy

Usage:
    from app.api.v1.repositories.approval_flow_master_repository import ApprovalFlowMasterRepository

    repo = ApprovalFlowMasterRepository(db)

    # Create a new approval flow
    flow = await repo.create({
        "name": "Leave Request Approval",
        "moduleId": module_id,
        "stages": [
            {"order": 1, "approverType": "role", "roleId": supervisor_role_id},
            {"order": 2, "approverType": "role", "roleId": hr_role_id}
        ]
    })

    # Check if name exists before creating
    if await repo.exists_by_name("Leave Request Approval"):
        raise ValueError("Flow name already exists")
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class ApprovalFlowMasterRepository(BaseRepository):
    """
    Repository class for approval flow master CRUD operations.

    This class extends BaseRepository to provide specialized data access methods
    for the approval_flow_master collection. It handles automatic ObjectId conversion
    for foreign key fields and provides query methods for common access patterns.

    Approval flow masters are templates that define how approval workflows should
    be structured, including the sequence of approvers, conditions, and rules.

    Attributes:
        OBJECTID_FIELDS (list): List of field names that should be converted
            to/from ObjectId when reading/writing documents.

    Example:
        repo = ApprovalFlowMasterRepository(db)
        flow = await repo.find_by_name("Leave Request Approval")
    """

    OBJECTID_FIELDS = ["moduleId", "createdBy", "updatedBy", "deletedBy"]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        """
        Initialize the ApprovalFlowMasterRepository.

        Args:
            db: AsyncIOMotorDatabase instance. If None, will be set later
                via dependency injection.
        """
        super().__init__(Collections.APPROVAL_FLOW_MASTER, db)

    async def create(self, data: dict) -> dict:
        """
        Create a new approval flow master record.

        Args:
            data: Dictionary containing approval flow data including:
                - name: Unique name for the approval flow
                - moduleId: Reference to the module this flow belongs to
                - stages: List of approval stages with order and approver info
                - description: Optional description of the flow

        Returns:
            dict: The created approval flow master document with _id.

        Note:
            ObjectId fields are automatically converted from string to ObjectId.
            The name field should be unique (validated at service layer).
        """
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """
        Find an approval flow master by its MongoDB ObjectId.

        Args:
            id: MongoDB ObjectId as a hex string.
            include_deleted: If True, includes soft-deleted records.

        Returns:
            dict: The approval flow master document if found.
            None: If no matching record exists.
        """
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_name(self, name: str, include_deleted: bool = False) -> Optional[dict]:
        """
        Find an approval flow master by its unique name.

        This is useful for looking up flows by human-readable identifiers
        rather than MongoDB ObjectIds.

        Args:
            name: The unique name of the approval flow.
            include_deleted: If True, includes soft-deleted records.

        Returns:
            dict: The approval flow master document if found.
            None: If no matching record exists.
        """
        query = {"name": name}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_module(self, module_id: str, include_deleted: bool = False) -> List[dict]:
        """
        Find all approval flows belonging to a specific module.

        This allows listing all approval workflows available for a particular
        feature or functional area of the application.

        Args:
            module_id: MongoDB ObjectId of the module.
            include_deleted: If True, includes soft-deleted records.

        Returns:
            List[dict]: List of approval flow master documents.
        """
        query = {"moduleId": ObjectId(module_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_all(
        self,
        query: dict = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        sort_field: str = "createdAt",
        sort_order: int = -1
    ) -> tuple[List[dict], int]:
        """
        Find all approval flow masters with optional pagination and sorting.

        Args:
            query: MongoDB query filter. Defaults to empty (all records).
            page: Page number for pagination (1-indexed). None for no pagination.
            page_size: Number of records per page. Required if page is specified.
            sort_field: Field name to sort by. Defaults to "createdAt".
            sort_order: Sort direction. -1 for descending, 1 for ascending.

        Returns:
            tuple: (List of approval flow master documents, Total count)
        """
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """
        Update an approval flow master record.

        Args:
            id: MongoDB ObjectId as a hex string.
            update_data: Dictionary of fields to update. May include:
                - name: New name (must be unique)
                - stages: Updated approval stages
                - description: Updated description
                - isActive: Enable/disable the flow
                - updatedBy, updatedAt: Audit fields

        Returns:
            dict: The updated approval flow master document.
            None: If no matching record was found.

        Note:
            Name uniqueness should be validated at the service layer before
            calling this method.
        """
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def exists_by_name(self, name: str, exclude_id: str = None) -> bool:
        """
        Check if an approval flow with the given name already exists.

        This is useful for validation before creating or updating a flow
        to ensure name uniqueness.

        Args:
            name: The name to check for existence.
            exclude_id: Optional ObjectId to exclude from the check.
                       Used when updating to allow the same name if it's
                       the record being updated.

        Returns:
            bool: True if a flow with this name exists (excluding exclude_id).
                  False otherwise.
        """
        return await self.exists_by_field("name", name, exclude_id)

    async def get_all_active(self) -> List[dict]:
        """
        Get all non-deleted approval flow masters.

        Returns:
            List[dict]: List of all active (not soft-deleted) approval flows.

        Note:
            This method has no pagination - use with caution on large datasets.
            Consider using find_all with pagination for production use.
        """
        docs, _ = await self.find_all({"isDelete": False})
        return docs
