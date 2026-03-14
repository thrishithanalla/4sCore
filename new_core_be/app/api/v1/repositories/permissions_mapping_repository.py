"""
Permissions Mapping Repository
Handles all database operations for the permissions_mapping_master collection.
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class PermissionsMappingRepository(BaseRepository):
    """Repository class for permissions mapping CRUD operations"""

    OBJECTID_FIELDS = ["roleId", "permissionId", "createdBy", "updatedBy", "deletedBy"]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.PERMISSION_MAPPINGS, db)

    async def create(self, data: dict) -> dict:
        """Create a new permission mapping"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find permission mapping by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_role(self, role_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all permission mappings for a role"""
        query = {"roleId": ObjectId(role_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_permission(self, permission_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all mappings for a permission"""
        query = {"permissionId": ObjectId(permission_id)}
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
        """Find all permission mappings with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a permission mapping"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def exists_mapping(
        self,
        role_id: str,
        permission_id: str,
        exclude_id: str = None
    ) -> bool:
        """Check if role-permission mapping exists"""
        query = {
            "roleId": ObjectId(role_id),
            "permissionId": ObjectId(permission_id),
            "isDelete": False
        }
        if exclude_id:
            query["_id"] = {"$ne": ObjectId(exclude_id)}
        return await self.exists(query)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted permission mappings"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs

    async def delete_by_role(self, role_id: str, update_data: dict) -> int:
        """Soft delete all mappings for a role"""
        return await self.update_many(
            {"roleId": ObjectId(role_id), "isDelete": False},
            update_data
        )

    async def delete_by_permission(self, permission_id: str, update_data: dict) -> int:
        """Soft delete all mappings for a permission"""
        return await self.update_many(
            {"permissionId": ObjectId(permission_id), "isDelete": False},
            update_data
        )
