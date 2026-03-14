"""
Approval Chain Repository.

This module provides the data access layer for the approval_chain collection
in MongoDB. Approval chains track the lifecycle of approval requests, including
the current approver, status, and history of approval actions.

The approval chain represents a workflow instance that moves through various
approval stages as defined by an approval flow master template.

Key Features:
    - CRUD operations for approval chain records
    - Query by flow, requester, approver, entity, and status
    - Soft delete pattern with isDelete flag
    - Automatic ObjectId conversion for foreign key fields
    - Pagination support for list operations

Approval Chain States:
    - pending: Awaiting action from current approver
    - approved: Approved by current approver, may proceed to next stage
    - rejected: Rejected by current approver
    - completed: All approval stages completed successfully
    - cancelled: Request cancelled by requester or admin

Collections Referenced:
    - approval_chain: Primary collection for this repository
    - approval_flow_master: Referenced by approvalFlowId
    - personnel_master: Referenced by requesterId, currentApproverId, createdBy, etc.

Usage:
    from app.api.v1.repositories.approval_chain_repository import ApprovalChainRepository

    repo = ApprovalChainRepository(db)

    # Create a new approval chain
    chain = await repo.create({
        "approvalFlowId": flow_id,
        "requesterId": requester_id,
        "currentApproverId": first_approver_id,
        "entityId": entity_id,
        "status": "pending"
    })

    # Get pending approvals for an approver
    pending = await repo.get_pending_for_approver(approver_id)
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class ApprovalChainRepository(BaseRepository):
    """
    Repository class for approval chain CRUD operations.

    This class extends BaseRepository to provide specialized data access methods
    for the approval_chain collection. It handles automatic ObjectId conversion
    for foreign key fields and provides query methods for common access patterns.

    Attributes:
        OBJECTID_FIELDS (list): List of field names that should be converted
            to/from ObjectId when reading/writing documents.

    Example:
        repo = ApprovalChainRepository(db)
        chain = await repo.find_by_id("507f1f77bcf86cd799439011")
    """

    OBJECTID_FIELDS = [
        "approvalFlowId", "requesterId", "currentApproverId",
        "entityId", "createdBy", "updatedBy", "deletedBy"
    ]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        """
        Initialize the ApprovalChainRepository.

        Args:
            db: AsyncIOMotorDatabase instance. If None, will be set later
                via dependency injection.
        """
        super().__init__(Collections.APPROVAL_CHAIN, db)

    async def create(self, data: dict) -> dict:
        """
        Create a new approval chain record.

        Args:
            data: Dictionary containing approval chain data including:
                - approvalFlowId: Reference to the approval flow master
                - requesterId: User who initiated the request
                - currentApproverId: Current approver in the chain
                - entityId: Entity being approved (e.g., leave request)
                - status: Initial status (typically "pending")

        Returns:
            dict: The created approval chain document with _id.

        Note:
            ObjectId fields are automatically converted from string to ObjectId.
        """
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """
        Find an approval chain by its MongoDB ObjectId.

        Args:
            id: MongoDB ObjectId as a hex string.
            include_deleted: If True, includes soft-deleted records.

        Returns:
            dict: The approval chain document if found.
            None: If no matching record exists.
        """
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_flow(self, flow_id: str, include_deleted: bool = False) -> List[dict]:
        """
        Find all approval chains for a specific approval flow.

        Args:
            flow_id: MongoDB ObjectId of the approval flow master.
            include_deleted: If True, includes soft-deleted records.

        Returns:
            List[dict]: List of approval chain documents.
        """
        query = {"approvalFlowId": ObjectId(flow_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_requester(self, requester_id: str, include_deleted: bool = False) -> List[dict]:
        """
        Find all approval chains initiated by a specific user.

        Args:
            requester_id: MongoDB ObjectId of the requester (personnel).
            include_deleted: If True, includes soft-deleted records.

        Returns:
            List[dict]: List of approval chain documents for this requester.
        """
        query = {"requesterId": ObjectId(requester_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_approver(self, approver_id: str, include_deleted: bool = False) -> List[dict]:
        """
        Find all approval chains where a user is the current approver.

        This includes chains at any status, not just pending. Use
        get_pending_for_approver() to get only actionable items.

        Args:
            approver_id: MongoDB ObjectId of the approver (personnel).
            include_deleted: If True, includes soft-deleted records.

        Returns:
            List[dict]: List of approval chain documents.
        """
        query = {"currentApproverId": ObjectId(approver_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_entity(self, entity_id: str, include_deleted: bool = False) -> List[dict]:
        """
        Find all approval chains for a specific entity.

        An entity is the object being approved (e.g., a leave request,
        expense report, or any other approvable item).

        Args:
            entity_id: MongoDB ObjectId of the entity.
            include_deleted: If True, includes soft-deleted records.

        Returns:
            List[dict]: List of approval chain documents for this entity.
        """
        query = {"entityId": ObjectId(entity_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_status(self, status: str, include_deleted: bool = False) -> List[dict]:
        """
        Find all approval chains with a specific status.

        Args:
            status: Status to filter by (pending, approved, rejected,
                   completed, cancelled).
            include_deleted: If True, includes soft-deleted records.

        Returns:
            List[dict]: List of approval chain documents with this status.
        """
        query = {"status": status}
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
        Find all approval chains with optional pagination and sorting.

        Args:
            query: MongoDB query filter. Defaults to empty (all records).
            page: Page number for pagination (1-indexed). None for no pagination.
            page_size: Number of records per page. Required if page is specified.
            sort_field: Field name to sort by. Defaults to "createdAt".
            sort_order: Sort direction. -1 for descending, 1 for ascending.

        Returns:
            tuple: (List of approval chain documents, Total count)
        """
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """
        Update an approval chain record.

        Args:
            id: MongoDB ObjectId as a hex string.
            update_data: Dictionary of fields to update. May include:
                - status: New status value
                - currentApproverId: Next approver in the chain
                - updatedBy, updatedAt: Audit fields

        Returns:
            dict: The updated approval chain document.
            None: If no matching record was found.
        """
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def get_all_active(self) -> List[dict]:
        """
        Get all non-deleted approval chains.

        Returns:
            List[dict]: List of all active (not soft-deleted) approval chains.

        Note:
            This method has no pagination - use with caution on large datasets.
        """
        docs, _ = await self.find_all({"isDelete": False})
        return docs

    async def get_pending_for_approver(self, approver_id: str) -> List[dict]:
        """
        Get pending approval requests for a specific approver.

        This is the primary method for building an approver's inbox/dashboard,
        returning only items that require action from this user.

        Args:
            approver_id: MongoDB ObjectId of the approver (personnel).

        Returns:
            List[dict]: List of pending approval chain documents where
                       this user is the current approver.
        """
        query = {
            "currentApproverId": ObjectId(approver_id),
            "status": "pending",
            "isDelete": False
        }
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs
