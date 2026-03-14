"""
Unit Repository
Handles all database operations for the unit_master collection.
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class UnitRepository(BaseRepository):
    """Repository class for unit CRUD operations"""

    OBJECTID_FIELDS = [
        "parentUnitId", "unitTypeId", "districtId", "mandalId",
        "departmentId", "createdBy", "updatedBy", "deletedBy"
    ]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.UNIT, db)

    async def create(self, data: dict) -> dict:
        """Create a new unit"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find unit by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_name(self, name: str, include_deleted: bool = False) -> Optional[dict]:
        """Find unit by name"""
        query = {"name": name}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_code(self, code: str, include_deleted: bool = False) -> Optional[dict]:
        """Find unit by code"""
        query = {"code": code}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_parent(self, parent_unit_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all child units of a parent unit"""
        query = {"parentUnitId": ObjectId(parent_unit_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_unit_type(self, unit_type_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all units of a specific type"""
        query = {"unitTypeId": ObjectId(unit_type_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_district(self, district_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all units in a district"""
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
        """Find all units with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a unit"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def exists_by_name(self, name: str, exclude_id: str = None) -> bool:
        """Check if unit with name exists"""
        return await self.exists_by_field("name", name, exclude_id)

    async def exists_by_code(self, code: str, exclude_id: str = None) -> bool:
        """Check if unit with code exists"""
        return await self.exists_by_field("code", code, exclude_id)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted units"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs

    async def get_hierarchy(self, unit_id: str) -> List[dict]:
        """Get unit hierarchy (ancestors) for a unit"""
        hierarchy = []
        current_id = unit_id

        while current_id:
            unit = await self.find_by_id(current_id)
            if not unit:
                break
            hierarchy.append(unit)
            current_id = unit.get("parentUnitId")

        return hierarchy

    async def get_children_recursive(self, unit_id: str, include_deleted: bool = False) -> List[dict]:
        """Get all descendant units recursively"""
        all_children = []
        children = await self.find_by_parent(unit_id, include_deleted)

        for child in children:
            all_children.append(child)
            descendants = await self.get_children_recursive(child["_id"], include_deleted)
            all_children.extend(descendants)

        return all_children
