"""
Feedback Repository
Handles all database operations for the feedback collection.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class FeedbackRepository(BaseRepository):
    """Repository class for feedback CRUD operations"""

    OBJECTID_FIELDS = ["feedbackMasterId", "userId", "createdBy", "updatedBy", "deletedBy"]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.FEEDBACKS, db)

    async def create(self, data: dict) -> dict:
        """Create a new feedback"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find feedback by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_master(self, master_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all feedbacks for a feedback master"""
        query = {"feedbackMasterId": ObjectId(master_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_user(self, user_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all feedbacks by a user"""
        query = {"userId": ObjectId(user_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_status(self, status: str, include_deleted: bool = False) -> List[dict]:
        """Find all feedbacks by status"""
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
        """Find all feedbacks with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a feedback"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted feedbacks"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs

    async def get_stats_by_rating(self, match_query: dict = None) -> Dict[int, int]:
        """Get feedback counts grouped by rating"""
        pipeline = []
        if match_query:
            pipeline.append({"$match": match_query})
        pipeline.append({
            "$group": {
                "_id": "$rating",
                "count": {"$sum": 1}
            }
        })

        results = await self.aggregate(pipeline)
        return {r["_id"]: r["count"] for r in results}

    async def get_average_rating(self, match_query: dict = None) -> float:
        """Get average rating"""
        pipeline = []
        if match_query:
            pipeline.append({"$match": match_query})
        pipeline.append({
            "$group": {
                "_id": None,
                "avgRating": {"$avg": "$rating"}
            }
        })

        results = await self.aggregate(pipeline)
        if results:
            return results[0].get("avgRating", 0.0)
        return 0.0
