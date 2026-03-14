"""
Error Log Repository
Handles all database operations for the error_logs collection.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class ErrorLogRepository(BaseRepository):
    """Repository class for error log CRUD operations"""

    OBJECTID_FIELDS = ["errorMasterId", "userId", "createdBy"]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.ERROR_LOGS, db)

    async def create(self, data: dict) -> dict:
        """Create a new error log"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find error log by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_error_master(self, error_master_id: str) -> List[dict]:
        """Find all logs for an error master"""
        query = {"errorMasterId": ObjectId(error_master_id)}
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_user(self, user_id: str) -> List[dict]:
        """Find all error logs for a user"""
        query = {"userId": ObjectId(user_id)}
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_level(self, level: str) -> List[dict]:
        """Find all error logs by level"""
        query = {"level": level}
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_date_range(
        self,
        start_date: datetime,
        end_date: datetime,
        page: Optional[int] = None,
        page_size: Optional[int] = None
    ) -> tuple[List[dict], int]:
        """Find error logs within a date range"""
        query = {
            "createdAt": {
                "$gte": start_date,
                "$lte": end_date
            }
        }
        return await super().find_all(query, page, page_size, objectid_fields=self.OBJECTID_FIELDS)

    async def find_all(
        self,
        query: dict = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        sort_field: str = "createdAt",
        sort_order: int = -1
    ) -> tuple[List[dict], int]:
        """Find all error logs with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def get_level_counts(self, match_query: dict = None) -> Dict[str, int]:
        """Get error counts grouped by level"""
        pipeline = []
        if match_query:
            pipeline.append({"$match": match_query})
        pipeline.append({
            "$group": {
                "_id": "$level",
                "count": {"$sum": 1}
            }
        })

        results = await self.aggregate(pipeline)
        level_counts = {"error": 0, "warning": 0, "info": 0, "critical": 0}
        for r in results:
            if r["_id"] in level_counts:
                level_counts[r["_id"]] = r["count"]
        level_counts["total"] = sum(level_counts.values())
        return level_counts

    async def get_stats_by_date(
        self,
        start_date: datetime = None,
        end_date: datetime = None
    ) -> List[Dict[str, Any]]:
        """Get error counts grouped by date"""
        match_query = {}
        if start_date:
            match_query["createdAt"] = {"$gte": start_date}
        if end_date:
            match_query.setdefault("createdAt", {})["$lte"] = end_date

        pipeline = []
        if match_query:
            pipeline.append({"$match": match_query})
        pipeline.extend([
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$createdAt"}
                    },
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id": 1}}
        ])

        return await self.aggregate(pipeline)

    async def delete_old_logs(self, cutoff_date: datetime) -> int:
        """Delete logs older than cutoff date"""
        result = await self.collection.delete_many({
            "createdAt": {"$lt": cutoff_date}
        })
        return result.deleted_count

    async def archive_logs(
        self,
        cutoff_date: datetime,
        archive_collection: str
    ) -> int:
        """Archive old logs to another collection"""
        # Find logs to archive
        cursor = self.collection.find({"createdAt": {"$lt": cutoff_date}})
        logs = await cursor.to_list(length=None)

        if not logs:
            return 0

        # Insert into archive collection
        archive = self.db[archive_collection]
        await archive.insert_many(logs)

        # Delete from main collection
        result = await self.collection.delete_many({
            "_id": {"$in": [log["_id"] for log in logs]}
        })
        return result.deleted_count
