"""
Unit Villages Repository
Handles all database operations for the unit_villages_master collection.
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class UnitVillagesRepository(BaseRepository):
    """Repository class for unit villages CRUD operations"""

    OBJECTID_FIELDS = [
        "unitId", "districtId", "mandalId",
        "createdBy", "updatedBy", "deletedBy"
    ]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.UNIT_VILLAGES, db)

    async def create(self, data: dict) -> dict:
        """Create a new unit village mapping"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find unit village by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_unit(self, unit_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all villages for a unit"""
        query = {"unitId": ObjectId(unit_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_mandal(self, mandal_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all unit villages in a mandal"""
        query = {"mandalId": ObjectId(mandal_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_district(self, district_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all unit villages in a district"""
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
        """Find all unit villages with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a unit village"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def exists_by_village_in_unit(
        self,
        village_name: str,
        unit_id: str,
        exclude_id: str = None
    ) -> bool:
        """Check if village already mapped to unit"""
        query = {
            "villageName": village_name,
            "unitId": ObjectId(unit_id),
            "isDelete": False
        }
        if exclude_id:
            query["_id"] = {"$ne": ObjectId(exclude_id)}
        return await self.exists(query)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted unit villages"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs

    async def delete_by_unit(self, unit_id: str, update_data: dict) -> int:
        """Soft delete all villages for a unit"""
        return await self.update_many(
            {"unitId": ObjectId(unit_id), "isDelete": False},
            update_data
        )
