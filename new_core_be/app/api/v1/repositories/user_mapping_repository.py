"""
User Mapping Repository
Handles all database operations for the user_mapping collection.
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class UserMappingRepository(BaseRepository):
    """Repository class for user mapping CRUD operations"""

    OBJECTID_FIELDS = [
        "userId", "roleId", "unitId",
        "createdBy", "updatedBy", "deletedBy"
    ]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.USER_MAPPING, db)

    async def create(self, data: dict) -> dict:
        """Create a new user mapping"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find user mapping by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_user(self, user_id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find user mapping by user ID"""
        query = {"userId": ObjectId(user_id)}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_role(self, role_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all user mappings for a role"""
        query = {"roleId": ObjectId(role_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_unit(self, unit_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all user mappings for a unit"""
        query = {"unitId": ObjectId(unit_id)}
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
        """Find all user mappings with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a user mapping"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def exists_by_user(self, user_id: str, exclude_id: str = None) -> bool:
        """Check if user mapping exists for user"""
        return await self.exists_by_field("userId", ObjectId(user_id), exclude_id)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted user mappings"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs
