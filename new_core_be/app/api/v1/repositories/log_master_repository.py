"""
Audit Log Master Repository
Handles all database operations for the audit_log_master collection.
"""
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.constants import Collections


class LogMasterRepository:
    """Repository class for audit log master CRUD operations"""

    def __init__(self, db: AsyncIOMotorDatabase = None):
        self.db = db or get_database()
        self.collection = self.db[Collections.LOG_MASTER]

    @staticmethod
    def convert_objectid_to_str(document: dict) -> dict:
        """Convert ObjectId fields to strings for JSON serialization"""
        if document and "_id" in document:
            document["_id"] = str(document["_id"])

        for field in ["createdBy", "updatedBy"]:
            if document and field in document and isinstance(document[field], ObjectId):
                document[field] = str(document[field])

        return document

    async def create(self, log_master_dict: dict) -> dict:
        """
        Create a new audit log master record.

        Args:
            log_master_dict: Audit log master data with all required fields

        Returns:
            Created audit log master document with string IDs
        """
        result = await self.collection.insert_one(log_master_dict)
        created = await self.collection.find_one({"_id": result.inserted_id})
        return self.convert_objectid_to_str(created)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """
        Find an audit log master by ID.

        Args:
            id: Audit log master ObjectId as string
            include_deleted: Whether to include soft-deleted records

        Returns:
            Audit log master document or None
        """
        query = {"_id": ObjectId(id)}
        if not include_deleted:
            query["isDelete"] = False

        document = await self.collection.find_one(query)
        return self.convert_objectid_to_str(document) if document else None

    async def find_by_eventcode(self, event_code: str, include_deleted: bool = False) -> Optional[dict]:
        """
        Find an audit log master by eventCode.

        Args:
            event_code: Event code string
            include_deleted: Whether to include soft-deleted records

        Returns:
            Audit log master document or None
        """
        query = {"eventCode": event_code}
        if not include_deleted:
            query["isDelete"] = False

        document = await self.collection.find_one(query)
        return self.convert_objectid_to_str(document) if document else None

    async def find_all(
        self,
        query: dict = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        sort_field: str = "createdAt",
        sort_order: int = -1
    ) -> tuple[List[dict], int]:
        """
        Find all audit log masters with optional pagination.

        Args:
            query: MongoDB query filter
            page: Page number (1-based)
            page_size: Items per page
            sort_field: Field to sort by
            sort_order: Sort direction (-1 for descending, 1 for ascending)

        Returns:
            Tuple of (list of documents, total count)
        """
        query = query or {}
        total = await self.collection.count_documents(query)

        if page is not None and page_size is not None:
            skip = (page - 1) * page_size
            cursor = self.collection.find(query).skip(skip).limit(page_size).sort(sort_field, sort_order)
            documents = await cursor.to_list(length=page_size)
        else:
            cursor = self.collection.find(query).sort(sort_field, sort_order)
            documents = await cursor.to_list(length=None)

        return [self.convert_objectid_to_str(doc) for doc in documents], total

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """
        Update an audit log master record.

        Args:
            id: Audit log master ObjectId as string
            update_data: Fields to update

        Returns:
            Updated audit log master document or None
        """
        await self.collection.update_one(
            {"_id": ObjectId(id)},
            {"$set": update_data}
        )
        updated = await self.collection.find_one({"_id": ObjectId(id)})
        return self.convert_objectid_to_str(updated) if updated else None

    async def soft_delete(self, id: str, update_data: dict) -> bool:
        """
        Soft delete an audit log master record.

        Args:
            id: Audit log master ObjectId as string
            update_data: Update data including isDelete=True and audit fields

        Returns:
            True if deleted successfully
        """
        result = await self.collection.update_one(
            {"_id": ObjectId(id)},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def exists_by_eventcode(self, event_code: str, exclude_id: str = None) -> bool:
        """
        Check if an audit log master with the given eventCode exists.

        Args:
            event_code: Event code string
            exclude_id: Optional ID to exclude from check (for updates)

        Returns:
            True if exists, False otherwise
        """
        query = {"eventCode": event_code, "isDelete": False}
        if exclude_id:
            query["_id"] = {"$ne": ObjectId(exclude_id)}

        existing = await self.collection.find_one(query)
        return existing is not None

    async def get_all_active(self) -> List[dict]:
        """
        Get all non-deleted audit log masters.

        Returns:
            List of audit log master documents
        """
        cursor = self.collection.find({"isDelete": False})
        documents = await cursor.to_list(length=None)
        return [self.convert_objectid_to_str(doc) for doc in documents]
