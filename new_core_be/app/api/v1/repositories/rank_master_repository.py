"""
Rank Master Repository
Handles all database operations for the rank_master collection.
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class RankMasterRepository(BaseRepository):
    """Repository class for rank master CRUD operations"""

    OBJECTID_FIELDS = ["createdBy", "updatedBy", "deletedBy"]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.RANK_MASTER, db)

    async def create(self, data: dict) -> dict:
        """Create a new rank"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find rank by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_name(self, name: str, include_deleted: bool = False) -> Optional[dict]:
        """Find rank by name"""
        query = {"name": name}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_code(self, code: str, include_deleted: bool = False) -> Optional[dict]:
        """Find rank by code"""
        query = {"code": code}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_all(
        self,
        query: dict = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        sort_field: str = "createdAt",
        sort_order: int = -1
    ) -> tuple[List[dict], int]:
        """Find all ranks with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a rank"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def exists_by_name(self, name: str, exclude_id: str = None) -> bool:
        """Check if rank with name exists"""
        return await self.exists_by_field("name", name, exclude_id)

    async def exists_by_code(self, code: str, exclude_id: str = None) -> bool:
        """Check if rank with code exists"""
        return await self.exists_by_field("code", code, exclude_id)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted ranks"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs

    async def find_by_hierarchy(self, sort_order: int = 1) -> List[dict]:
        """Find all ranks sorted by hierarchy level"""
        docs, _ = await super().find_all(
            {"isDelete": False},
            sort_field="hierarchyLevel",
            sort_order=sort_order,
            objectid_fields=self.OBJECTID_FIELDS
        )
        return docs
