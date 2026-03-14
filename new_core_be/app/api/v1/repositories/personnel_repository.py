"""
Personnel Repository
Handles all database operations for the personnel_master collection.
"""
from typing import Optional, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class PersonnelRepository(BaseRepository):
    """Repository class for personnel CRUD operations"""

    OBJECTID_FIELDS = [
        "unitId", "rankId", "designationId", "departmentId",
        "districtId", "mandalId", "createdBy", "updatedBy", "deletedBy"
    ]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.PERSONNEL_MASTER, db)

    async def create(self, data: dict) -> dict:
        """Create a new personnel"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find personnel by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_employee_id(self, employee_id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find personnel by employee ID"""
        query = {"employeeId": employee_id}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_phone(self, phone: str, include_deleted: bool = False) -> Optional[dict]:
        """Find personnel by phone number"""
        query = {"phone": phone}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_email(self, email: str, include_deleted: bool = False) -> Optional[dict]:
        """Find personnel by email"""
        query = {"email": email}
        return await self.find_one(query, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_unit(self, unit_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all personnel in a unit"""
        query = {"unitId": ObjectId(unit_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_rank(self, rank_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all personnel with a specific rank"""
        query = {"rankId": ObjectId(rank_id)}
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
        """Find all personnel with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a personnel"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def exists_by_employee_id(self, employee_id: str, exclude_id: str = None) -> bool:
        """Check if personnel with employee ID exists"""
        return await self.exists_by_field("employeeId", employee_id, exclude_id)

    async def exists_by_phone(self, phone: str, exclude_id: str = None) -> bool:
        """Check if personnel with phone exists"""
        return await self.exists_by_field("phone", phone, exclude_id)

    async def exists_by_email(self, email: str, exclude_id: str = None) -> bool:
        """Check if personnel with email exists"""
        return await self.exists_by_field("email", email, exclude_id)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted personnel"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs

    async def search(
        self,
        search_term: str,
        page: Optional[int] = None,
        page_size: Optional[int] = None
    ) -> tuple[List[dict], int]:
        """Search personnel by name, employee ID, phone, or email"""
        query = {
            "isDelete": False,
            "$or": [
                {"name": {"$regex": search_term, "$options": "i"}},
                {"employeeId": {"$regex": search_term, "$options": "i"}},
                {"phone": {"$regex": search_term, "$options": "i"}},
                {"email": {"$regex": search_term, "$options": "i"}}
            ]
        }
        return await self.find_all(query, page, page_size, objectid_fields=self.OBJECTID_FIELDS)
