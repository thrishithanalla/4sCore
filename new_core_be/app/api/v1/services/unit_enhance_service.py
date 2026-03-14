"""
Unit Enhance Service
Business logic for Unit Enhance collection operations
Connects to secondary database (MONGODB_URI1/MONGODB_DB1)
Returns data as-is from the database without schema transformations
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status

from app.core.database import get_database1
from app.constants.collections import Collections

# Collection name from centralized constants
COLLECTION_NAME = Collections.UNIT_ENHANCE


def convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    if not document:
        return document

    result = {}
    for key, value in document.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, list):
            result[key] = [
                str(item) if isinstance(item, ObjectId)
                else item.isoformat() if isinstance(item, datetime)
                else convert_objectid_to_str(item) if isinstance(item, dict)
                else item
                for item in value
            ]
        elif isinstance(value, dict):
            result[key] = convert_objectid_to_str(value)
        else:
            result[key] = value

    return result


class UnitEnhanceService:
    """Service class for Unit Enhance operations - returns data as-is"""

    @staticmethod
    async def get_units(
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        search: Optional[str] = None,
        department_id: Optional[str] = None,
        parent_unit_id: Optional[str] = None,
        district_id: Optional[str] = None,
        unit_type_id: Optional[str] = None,
        include_deleted: bool = False,
        is_active: Optional[bool] = True
    ) -> dict:
        """
        Get all units with optional pagination and filters.
        Returns data as-is from the database.
        """
        db = get_database1()

        # Build query
        query = {}

        # Search across multiple fields (adjust field names to match your DB)
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"unitCode": {"$regex": search, "$options": "i"}},
                {"legacyReferenceId": {"$regex": search, "$options": "i"}},
                {"city": {"$regex": search, "$options": "i"}},
                {"displayLabel": {"$regex": search, "$options": "i"}}
            ]

        # Apply filters - these are strings in your DB, not ObjectIds
        if department_id:
            query["departmentId"] = department_id

        if parent_unit_id:
            # parentUnitId might be ObjectId in your DB
            try:
                query["parentUnitId"] = ObjectId(parent_unit_id)
            except:
                query["parentUnitId"] = parent_unit_id

        if district_id:
            query["district"] = district_id

        if unit_type_id:
            query["unitTypeId"] = unit_type_id

        # Default pagination if not provided (to avoid fetching all docs)
        if page is None:
            page = 1
        if page_size is None:
            page_size = 100  # Default limit to prevent fetching all documents

        skip = (page - 1) * page_size

        # Use estimated count for better performance on large collections
        # Only use count_documents when filters are applied
        if query:
            total = await db[COLLECTION_NAME].count_documents(query)
        else:
            total = await db[COLLECTION_NAME].estimated_document_count()

        total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0

        # Fetch with projection to reduce data transfer (exclude heavy fields)
        projection = {
            "responsibleUserHistory": 0,
            "unitPersonnelList": 0
        }

        cursor = db[COLLECTION_NAME].find(query, projection).sort("name", 1).skip(skip).limit(page_size)
        units_list = await cursor.to_list(length=page_size)

        return {
            "data": [convert_objectid_to_str(doc) for doc in units_list],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }

    @staticmethod
    async def get_unit_by_id(unit_id: str) -> dict:
        """
        Get a unit by ID. Returns data as-is.
        """
        db = get_database1()

        try:
            object_id = ObjectId(unit_id)
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid unit ID format"
            )

        unit = await db[COLLECTION_NAME].find_one({"_id": object_id})

        if not unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Unit not found"
            )

        return convert_objectid_to_str(unit)

    @staticmethod
    async def get_units_minimal(
        search: Optional[str] = None,
        department_id: Optional[str] = None,
        unit_type_id: Optional[str] = None,
        include_deleted: bool = False
    ) -> List[Dict[str, str]]:
        """
        Get all units with only _id and name for dropdowns.
        """
        db = get_database1()

        query = {}

        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"unitCode": {"$regex": search, "$options": "i"}},
                {"legacyReferenceId": {"$regex": search, "$options": "i"}}
            ]

        if department_id:
            query["departmentId"] = department_id

        if unit_type_id:
            query["unitTypeId"] = unit_type_id

        cursor = db[COLLECTION_NAME].find(query, {"_id": 1, "name": 1, "unitCode": 1}).sort("name", 1)
        units_list = await cursor.to_list(length=None)

        return [{"_id": str(u["_id"]), "name": u.get("name", ""), "unitCode": u.get("unitCode", "")} for u in units_list]

    @staticmethod
    async def create_unit(unit_data: dict, current_user_id: Optional[str]) -> dict:
        """
        Create a new unit. Stores data as provided.
        """
        db = get_database1()

        # Set audit fields
        unit_data["createdAt"] = datetime.utcnow()
        if current_user_id:
            unit_data["createdBy"] = current_user_id

        # Insert into database
        result = await db[COLLECTION_NAME].insert_one(unit_data)
        created_unit = await db[COLLECTION_NAME].find_one({"_id": result.inserted_id})

        return convert_objectid_to_str(created_unit)

    @staticmethod
    async def update_unit(unit_id: str, update_data: dict, current_user_id: Optional[str]) -> dict:
        """
        Update a unit. Updates data as provided.
        """
        db = get_database1()

        try:
            object_id = ObjectId(unit_id)
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid unit ID format"
            )

        # Check if unit exists
        existing_unit = await db[COLLECTION_NAME].find_one({"_id": object_id})
        if not existing_unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Unit not found"
            )

        # Set audit fields
        update_data["updatedAt"] = datetime.utcnow()
        if current_user_id:
            update_data["updatedBy"] = current_user_id

        # Update the unit
        await db[COLLECTION_NAME].update_one({"_id": object_id}, {"$set": update_data})

        updated_unit = await db[COLLECTION_NAME].find_one({"_id": object_id})
        return convert_objectid_to_str(updated_unit)

    @staticmethod
    async def delete_unit(
        unit_id: str,
        current_user_id: Optional[str],
        deleted_ip: Optional[str] = None
    ) -> dict:
        """
        Delete a unit (hard delete).
        """
        db = get_database1()

        try:
            object_id = ObjectId(unit_id)
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid unit ID format"
            )

        existing_unit = await db[COLLECTION_NAME].find_one({"_id": object_id})
        if not existing_unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Unit not found"
            )

        await db[COLLECTION_NAME].delete_one({"_id": object_id})

        return {"message": "Unit deleted successfully"}

    @staticmethod
    async def restore_unit(
        unit_id: str,
        current_user_id: Optional[str],
        restored_ip: Optional[str] = None
    ) -> dict:
        """
        Restore a unit (not applicable for this schema - returns the unit as-is).
        """
        db = get_database1()

        try:
            object_id = ObjectId(unit_id)
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid unit ID format"
            )

        unit = await db[COLLECTION_NAME].find_one({"_id": object_id})
        if not unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Unit not found"
            )

        return convert_objectid_to_str(unit)
