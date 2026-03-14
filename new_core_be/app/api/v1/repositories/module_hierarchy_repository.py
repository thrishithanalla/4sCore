"""
Module Hierarchy Repository
Handles all database operations for the moduleHierarchy collection.
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class ModuleHierarchyRepository(BaseRepository):
    """Repository class for module hierarchy CRUD operations"""

    OBJECTID_FIELDS = ["moduleId", "parentModuleId", "createdBy", "updatedBy", "deletedBy"]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.MODULE_HIERARCHY, db)

    async def create(self, data: dict) -> dict:
        """Create a new module hierarchy entry"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find module hierarchy by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_module(self, module_id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find hierarchy entry for a module"""
        query = {"moduleId": ObjectId(module_id)}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_children(self, parent_module_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all children of a parent module"""
        query = {"parentModuleId": ObjectId(parent_module_id)}
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
        """Find all module hierarchies with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a module hierarchy"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted module hierarchies"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs
