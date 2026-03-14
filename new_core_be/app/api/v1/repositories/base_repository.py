"""
Base Repository
Provides common CRUD operations for all repositories.
"""
from typing import Optional, List, Dict, Any, TypeVar, Generic
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database

T = TypeVar('T')


class BaseRepository:
    """Base repository class with common CRUD operations"""

    def __init__(self, collection_name: str, db: AsyncIOMotorDatabase = None):
        """
        Initialize repository with collection name.

        Args:
            collection_name: MongoDB collection name
            db: Optional database instance
        """
        self.db = db or get_database()
        self.collection_name = collection_name
        self.collection = self.db[collection_name]

    @staticmethod
    def to_object_id(id_value: str) -> ObjectId:
        """Convert string to ObjectId"""
        return ObjectId(id_value)

    @staticmethod
    def convert_objectid_to_str(document: dict, objectid_fields: List[str] = None) -> dict:
        """
        Convert ObjectId fields to strings for JSON serialization.

        Args:
            document: MongoDB document
            objectid_fields: List of field names that contain ObjectIds

        Returns:
            Document with ObjectIds converted to strings
        """
        if not document:
            return document

        # Always convert _id
        if "_id" in document and isinstance(document["_id"], ObjectId):
            document["_id"] = str(document["_id"])

        # Convert specified ObjectId fields
        if objectid_fields:
            for field in objectid_fields:
                if field in document and isinstance(document[field], ObjectId):
                    document[field] = str(document[field])

        return document

    async def create(self, data: dict, objectid_fields: List[str] = None) -> dict:
        """
        Create a new document.

        Args:
            data: Document data
            objectid_fields: Fields to convert from ObjectId to string

        Returns:
            Created document with string IDs
        """
        result = await self.collection.insert_one(data)
        created = await self.collection.find_one({"_id": result.inserted_id})
        return self.convert_objectid_to_str(created, objectid_fields)

    async def find_by_id(
        self,
        id: str,
        include_deleted: bool = False,
        objectid_fields: List[str] = None
    ) -> Optional[dict]:
        """
        Find a document by ID.

        Args:
            id: Document ObjectId as string
            include_deleted: Whether to include soft-deleted records
            objectid_fields: Fields to convert from ObjectId to string

        Returns:
            Document or None
        """
        query = {"_id": ObjectId(id)}
        if not include_deleted:
            query["isDelete"] = False

        document = await self.collection.find_one(query)
        return self.convert_objectid_to_str(document, objectid_fields) if document else None

    async def find_one(
        self,
        query: dict,
        include_deleted: bool = False,
        objectid_fields: List[str] = None
    ) -> Optional[dict]:
        """
        Find a single document matching query.

        Args:
            query: MongoDB query filter
            include_deleted: Whether to include soft-deleted records
            objectid_fields: Fields to convert from ObjectId to string

        Returns:
            Document or None
        """
        if not include_deleted:
            query["isDelete"] = False

        document = await self.collection.find_one(query)
        return self.convert_objectid_to_str(document, objectid_fields) if document else None

    async def find_all(
        self,
        query: dict = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        sort_field: str = "createdAt",
        sort_order: int = -1,
        objectid_fields: List[str] = None,
        projection: dict = None
    ) -> tuple[List[dict], int]:
        """
        Find all documents with optional pagination.

        Args:
            query: MongoDB query filter
            page: Page number (1-based)
            page_size: Items per page
            sort_field: Field to sort by
            sort_order: Sort direction (-1 desc, 1 asc)
            objectid_fields: Fields to convert from ObjectId to string
            projection: Fields to include/exclude

        Returns:
            Tuple of (list of documents, total count)
        """
        query = query or {}
        total = await self.collection.count_documents(query)

        if page is not None and page_size is not None:
            skip = (page - 1) * page_size
            cursor = self.collection.find(query, projection).skip(skip).limit(page_size).sort(sort_field, sort_order)
            documents = await cursor.to_list(length=page_size)
        else:
            cursor = self.collection.find(query, projection).sort(sort_field, sort_order)
            documents = await cursor.to_list(length=None)

        return [self.convert_objectid_to_str(doc, objectid_fields) for doc in documents], total

    async def update(
        self,
        id: str,
        update_data: dict,
        objectid_fields: List[str] = None
    ) -> Optional[dict]:
        """
        Update a document.

        Args:
            id: Document ObjectId as string
            update_data: Fields to update
            objectid_fields: Fields to convert from ObjectId to string

        Returns:
            Updated document or None
        """
        await self.collection.update_one(
            {"_id": ObjectId(id)},
            {"$set": update_data}
        )
        updated = await self.collection.find_one({"_id": ObjectId(id)})
        return self.convert_objectid_to_str(updated, objectid_fields) if updated else None

    async def soft_delete(self, id: str, update_data: dict) -> bool:
        """
        Soft delete a document.

        Args:
            id: Document ObjectId as string
            update_data: Update data including isDelete=True and audit fields

        Returns:
            True if deleted successfully
        """
        result = await self.collection.update_one(
            {"_id": ObjectId(id)},
            {"$set": update_data}
        )
        return result.modified_count > 0

    async def hard_delete(self, id: str) -> bool:
        """
        Permanently delete a document.

        Args:
            id: Document ObjectId as string

        Returns:
            True if deleted successfully
        """
        result = await self.collection.delete_one({"_id": ObjectId(id)})
        return result.deleted_count > 0

    async def exists(self, query: dict) -> bool:
        """
        Check if a document exists.

        Args:
            query: MongoDB query filter

        Returns:
            True if exists
        """
        document = await self.collection.find_one(query)
        return document is not None

    async def exists_by_field(
        self,
        field: str,
        value: Any,
        exclude_id: str = None,
        include_deleted: bool = False
    ) -> bool:
        """
        Check if a document with specific field value exists.

        Args:
            field: Field name
            value: Field value
            exclude_id: Optional ID to exclude from check
            include_deleted: Whether to include soft-deleted records

        Returns:
            True if exists
        """
        query = {field: value}
        if not include_deleted:
            query["isDelete"] = False
        if exclude_id:
            query["_id"] = {"$ne": ObjectId(exclude_id)}

        return await self.exists(query)

    async def count(self, query: dict = None) -> int:
        """
        Count documents matching query.

        Args:
            query: MongoDB query filter

        Returns:
            Document count
        """
        query = query or {}
        return await self.collection.count_documents(query)

    async def aggregate(self, pipeline: List[dict]) -> List[dict]:
        """
        Execute aggregation pipeline.

        Args:
            pipeline: MongoDB aggregation pipeline

        Returns:
            Aggregation results
        """
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=None)

    async def bulk_create(self, documents: List[dict]) -> List[str]:
        """
        Insert multiple documents.

        Args:
            documents: List of documents to insert

        Returns:
            List of inserted IDs as strings
        """
        if not documents:
            return []
        result = await self.collection.insert_many(documents)
        return [str(id) for id in result.inserted_ids]

    async def update_many(self, query: dict, update_data: dict) -> int:
        """
        Update multiple documents.

        Args:
            query: MongoDB query filter
            update_data: Fields to update

        Returns:
            Number of modified documents
        """
        result = await self.collection.update_many(query, {"$set": update_data})
        return result.modified_count

    async def restore(self, id: str, update_data: dict, objectid_fields: List[str] = None) -> Optional[dict]:
        """
        Restore a soft-deleted document.

        Args:
            id: Document ObjectId as string
            update_data: Update data including isDelete=False

        Returns:
            Restored document or None
        """
        return await self.update(id, update_data, objectid_fields)
