"""
Audit Log Repository
Handles all database operations for the audit_log collection.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.core.constants import Collections


class LogTransactionRepository:
    """Repository class for audit log CRUD operations"""

    def __init__(self, db: AsyncIOMotorDatabase = None):
        self.db = db or get_database()
        self.collection = self.db[Collections.LOG_TRANSACTION]
        self.audit_log_master_collection = self.db[Collections.LOG_MASTER]

    @staticmethod
    def convert_objectid_to_str(document: dict) -> dict:
        """Convert ObjectId fields to strings for JSON serialization"""
        if document and "_id" in document:
            document["_id"] = str(document["_id"])

        for field in ["actorId"]:
            if document and field in document and isinstance(document[field], ObjectId):
                document[field] = str(document[field])

        return document

    async def get_master_from_eventcode(self, eventcode: str) -> Optional[dict]:
        """
        Get audit_log_master document by eventCode.

        Args:
            eventcode: Event code string

        Returns:
            Audit log master document or None
        """
        if not eventcode:
            return None
        try:
            master = await self.audit_log_master_collection.find_one(
                {"eventCode": eventcode, "isDelete": False}
            )
            return master
        except Exception:
            return None

    async def batch_get_masters_by_eventcode(self, eventcodes: set) -> Dict[str, dict]:
        """
        Batch fetch audit log masters for multiple event codes.

        Args:
            eventcodes: Set of event code strings

        Returns:
            Dict mapping eventcode to master document
        """
        if not eventcodes:
            return {}

        masters = await self.audit_log_master_collection.find(
            {"eventCode": {"$in": list(eventcodes)}, "isDelete": False},
            {"_id": 1, "eventCode": 1, "logObject": 1, "action": 1, "messageTemplate": 1}
        ).to_list(length=None)

        return {m["eventCode"]: m for m in masters}

    async def create(self, log_dict: dict) -> dict:
        """
        Create a new audit log record.

        Args:
            log_dict: Audit log data

        Returns:
            Created audit log document
        """
        result = await self.collection.insert_one(log_dict)
        created = await self.collection.find_one({"_id": result.inserted_id})
        return created

    async def find_by_id(self, id: str) -> Optional[dict]:
        """
        Find an audit log by ID.

        Args:
            id: Audit log ObjectId as string

        Returns:
            Audit log document or None
        """
        document = await self.collection.find_one({"_id": ObjectId(id)})
        if document:
            return self.convert_objectid_to_str(document)
        return None

    async def find_all(
        self,
        query: dict = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        sort_field: str = "EventTimeStamp",
        sort_order: int = -1,
        max_records: int = 10000
    ) -> tuple[List[dict], int]:
        """
        Find all audit logs with optional pagination.

        Args:
            query: MongoDB query filter
            page: Page number (1-based)
            page_size: Items per page
            sort_field: Field to sort by
            sort_order: Sort direction
            max_records: Maximum records when not paginating

        Returns:
            Tuple of (list of documents, total count)
        """
        query = query or {}

        if page is not None and page_size is not None:
            skip = (page - 1) * page_size
            cursor = self.collection.find(query).sort(sort_field, sort_order).skip(skip).limit(page_size)
            documents = await cursor.to_list(length=page_size)
            total = await self.collection.count_documents(query)
        else:
            cursor = self.collection.find(query).sort(sort_field, sort_order).limit(max_records)
            documents = await cursor.to_list(length=max_records)
            total = len(documents)

        result = [self.convert_objectid_to_str(doc) for doc in documents]
        return result, total

    async def get_layer_counts(self, match_query: dict = None) -> Dict[str, int]:
        """
        Get counts of audit logs grouped by layer.

        Args:
            match_query: Optional filter query

        Returns:
            Dict with layer counts and total
        """
        pipeline = []

        if match_query:
            pipeline.append({"$match": match_query})

        pipeline.append({
            "$group": {
                "_id": "$layer",
                "count": {"$sum": 1}
            }
        })

        cursor = self.collection.aggregate(pipeline)
        results = await cursor.to_list(length=None)

        layer_counts = {}
        total = 0
        for result in results:
            layer = result["_id"]
            count = result["count"]
            layer_counts[layer] = count
            total += count

        layer_counts["total"] = total
        return layer_counts

    async def delete_by_retention(self, cutoff_date: datetime) -> int:
        """
        Delete audit logs older than cutoff date based on EventTimeStamp.

        Args:
            cutoff_date: Delete logs created before this date

        Returns:
            Number of deleted documents
        """
        result = await self.collection.delete_many({
            "EventTimeStamp": {"$lt": cutoff_date}
        })
        return result.deleted_count
