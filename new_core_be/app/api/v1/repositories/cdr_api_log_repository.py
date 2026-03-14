"""
CDR API Log Repository
Handles all database operations for the cdr_api_logs collection.
"""
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class CdrApiLogRepository(BaseRepository):
    """Repository class for CDR API log CRUD operations"""

    OBJECTID_FIELDS = ["userId", "createdBy"]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.THIRD_PARTY_API_LOGS, db)

    async def create(self, data: dict) -> dict:
        """Create a new CDR API log"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str) -> Optional[dict]:
        """Find CDR API log by ID"""
        return await super().find_by_id(id, include_deleted=True, objectid_fields=self.OBJECTID_FIELDS)

    async def find_by_user(
        self,
        user_id: str,
        page: Optional[int] = None,
        page_size: Optional[int] = None
    ) -> tuple[List[dict], int]:
        """Find all CDR API logs for a user"""
        query = {"userId": ObjectId(user_id)}
        return await super().find_all(query, page, page_size, objectid_fields=self.OBJECTID_FIELDS)

    async def find_by_keyword(
        self,
        keyword: str,
        page: Optional[int] = None,
        page_size: Optional[int] = None
    ) -> tuple[List[dict], int]:
        """Find all CDR API logs for a keyword"""
        query = {"keyword": keyword}
        return await super().find_all(query, page, page_size, objectid_fields=self.OBJECTID_FIELDS)

    async def find_by_date_range(
        self,
        start_date: datetime,
        end_date: datetime,
        page: Optional[int] = None,
        page_size: Optional[int] = None
    ) -> tuple[List[dict], int]:
        """Find CDR API logs within a date range"""
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
        """Find all CDR API logs with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)
