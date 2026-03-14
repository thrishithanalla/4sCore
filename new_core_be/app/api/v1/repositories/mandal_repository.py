"""
Mandal Repository
Handles all database operations for the mandal_master collection.
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class MandalRepository(BaseRepository):
    """Repository class for mandal CRUD operations"""

    OBJECTID_FIELDS = ["districtId", "createdBy", "updatedBy", "deletedBy"]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.MANDAL, db)

    async def create(self, data: dict) -> dict:
        """Create a new mandal"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find mandal by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_name(self, name: str, include_deleted: bool = False) -> Optional[dict]:
        """Find mandal by name"""
        query = {"name": name}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_district(self, district_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all mandals in a district"""
        query = {"districtId": ObjectId(district_id)}
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
        """Find all mandals with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a mandal"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def exists_by_name(self, name: str, exclude_id: str = None) -> bool:
        """Check if mandal with name exists"""
        return await self.exists_by_field("name", name, exclude_id)

    async def exists_by_name_in_district(self, name: str, district_id: str, exclude_id: str = None) -> bool:
        """Check if mandal with name exists in a district"""
        query = {"name": name, "districtId": ObjectId(district_id), "isDelete": False}
        if exclude_id:
            query["_id"] = {"$ne": ObjectId(exclude_id)}
        return await self.exists(query)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted mandals"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs
