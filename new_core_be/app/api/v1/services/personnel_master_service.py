"""
Personnel Master Service Module
Provides business logic for Personnel Master management
"""
from typing import List, Optional, Tuple, Dict, Any
from bson import ObjectId
from datetime import datetime
import asyncio

from fastapi import Request

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.utils.security import hash_password
from app.api.v1.utils.validators import validate_personnel_foreign_keys
from app.utils.error_messages import get_field_error, get_business_error
from app.api.v1.schemas.personnel_schema import (
    PersonnelCreateSchema,
    PersonnelUpdateSchema
)
from app.constants.collections import Collections
from app.api.v1.services.error_logger import log_error
from app.constants.error_codes import ErrorCodes


# Collection name from centralized constants
COLLECTION_NAME = Collections.PERSONNEL_MASTER


def _convert_document_for_json(document: dict) -> dict:
    """Convert MongoDB document fields for JSON serialization"""
    if not document:
        return document

    result = {}
    for key, value in document.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, list):
            # Handle arrays (like units)
            converted_list = []
            for item in value:
                if isinstance(item, dict):
                    converted_item = {}
                    for k, v in item.items():
                        if isinstance(v, ObjectId):
                            converted_item[k] = str(v)
                        elif isinstance(v, datetime):
                            converted_item[k] = v.isoformat()
                        else:
                            converted_item[k] = v
                    converted_list.append(converted_item)
                elif isinstance(item, ObjectId):
                    converted_list.append(str(item))
                else:
                    converted_list.append(item)
            result[key] = converted_list
        else:
            result[key] = value

    return result


# =============================================================================
# Unit Personnel List Management Functions
# =============================================================================

async def add_personnel_to_units(db, personnel_id: ObjectId, unit_ids: List[ObjectId]):
    """
    Add personnel ID to unitPersonnelList in each unit document.
    Uses $addToSet to prevent duplicates.

    Args:
        db: Database instance
        personnel_id: Personnel ObjectId to add
        unit_ids: List of unit ObjectIds to update
    """
    if not unit_ids:
        return

    await db[Collections.UNIT].update_many(
        {"_id": {"$in": unit_ids}},
        {"$addToSet": {"unitPersonnelList": personnel_id}}
    )


async def remove_personnel_from_units(db, personnel_id: ObjectId, unit_ids: List[ObjectId]):
    """
    Remove personnel ID from unitPersonnelList in each unit document.

    Args:
        db: Database instance
        personnel_id: Personnel ObjectId to remove
        unit_ids: List of unit ObjectIds to update
    """
    if not unit_ids:
        return

    await db[Collections.UNIT].update_many(
        {"_id": {"$in": unit_ids}},
        {"$pull": {"unitPersonnelList": personnel_id}}
    )


async def remove_personnel_from_all_units(db, personnel_id: ObjectId):
    """
    Remove personnel ID from unitPersonnelList in ALL unit documents.
    Used when personnel is deleted.

    Args:
        db: Database instance
        personnel_id: Personnel ObjectId to remove
    """
    await db[Collections.UNIT].update_many(
        {"unitPersonnelList": personnel_id},
        {"$pull": {"unitPersonnelList": personnel_id}}
    )


async def sync_personnel_units(db, personnel_id: ObjectId, old_units: List[dict], new_units: List[dict]):
    """
    Synchronize personnel ID in unitPersonnelList when units are updated.
    Removes personnel from units that were removed and adds to newly assigned units.

    Args:
        db: Database instance
        personnel_id: Personnel ObjectId
        old_units: Previous list of unit assignments from existing personnel document
        new_units: New list of unit assignments from update request
    """
    # Extract unit IDs from old and new assignments
    old_unit_ids = set()
    for unit in (old_units or []):
        unit_id = unit.get("unitId")
        if unit_id:
            old_unit_ids.add(unit_id if isinstance(unit_id, ObjectId) else ObjectId(unit_id))

    new_unit_ids = set()
    for unit in (new_units or []):
        unit_id = unit.get("unitId")
        if unit_id:
            new_unit_ids.add(unit_id if isinstance(unit_id, ObjectId) else ObjectId(unit_id))

    # Units to remove personnel from (were in old, not in new)
    units_to_remove = old_unit_ids - new_unit_ids
    # Units to add personnel to (in new, not in old)
    units_to_add = new_unit_ids - old_unit_ids

    # Perform updates
    if units_to_remove:
        await remove_personnel_from_units(db, personnel_id, list(units_to_remove))

    if units_to_add:
        await add_personnel_to_units(db, personnel_id, list(units_to_add))


def extract_unit_ids_from_units(units: List[dict]) -> List[ObjectId]:
    """
    Extract unit ObjectIds from units array.

    Args:
        units: List of unit assignment dicts with unitId field

    Returns:
        List of ObjectId for all units
    """
    unit_ids = []
    for unit in (units or []):
        unit_id = unit.get("unitId")
        if unit_id:
            if isinstance(unit_id, ObjectId):
                unit_ids.append(unit_id)
            elif ObjectId.is_valid(unit_id):
                unit_ids.append(ObjectId(unit_id))
    return unit_ids


# =============================================================================
# Population Functions
# =============================================================================

async def populate_personnel_relations(db, document: dict) -> dict:
    """
    Populate foreign key relations with actual data - optimized with bulk queries.
    This function collects all IDs first then fetches in bulk.
    """
    if not document:
        return document

    # Collect all IDs for bulk fetching
    unit_ids = set()
    designation_ids = set()
    dept_id = document.get("departmentId")
    rank_id = document.get("rankId")

    if document.get("units"):
        for unit_assignment in document["units"]:
            if isinstance(unit_assignment, dict):
                unit_id_val = unit_assignment.get("unitId")
                designation_id_val = unit_assignment.get("designationId")
            elif isinstance(unit_assignment, (str, ObjectId)):
                unit_id_val = unit_assignment
                designation_id_val = None
            else:
                continue

            if unit_id_val:
                try:
                    unit_ids.add(ObjectId(str(unit_id_val)) if not isinstance(unit_id_val, ObjectId) else unit_id_val)
                except:
                    pass
            if designation_id_val:
                try:
                    designation_ids.add(ObjectId(str(designation_id_val)) if not isinstance(designation_id_val, ObjectId) else designation_id_val)
                except:
                    pass

    # Bulk fetch all related documents
    units_map = {}
    designations_map = {}
    unit_types_map = {}
    districts_map = {}
    department = None
    rank = None

    if unit_ids:
        units_list = await db[Collections.UNIT].find(
            {"_id": {"$in": list(unit_ids)}, "isDelete": False},
            {"_id": 1, "name": 1, "policeReferenceId": 1, "unitTypeId": 1, "districtId": 1}
        ).to_list(length=None)
        units_map = {u["_id"]: u for u in units_list}

        # Collect unit type IDs and district IDs for bulk fetch
        unit_type_ids = set()
        district_ids = set()
        for u in units_list:
            if u.get("unitTypeId"):
                unit_type_ids.add(u["unitTypeId"] if isinstance(u["unitTypeId"], ObjectId) else ObjectId(u["unitTypeId"]))
            if u.get("districtId"):
                district_ids.add(u["districtId"] if isinstance(u["districtId"], ObjectId) else ObjectId(u["districtId"]))

        # Bulk fetch unit types
        if unit_type_ids:
            unit_types_list = await db[Collections.UNIT_TYPE].find(
                {"_id": {"$in": list(unit_type_ids)}, "isDelete": False},
                {"_id": 1, "name": 1}
            ).to_list(length=None)
            unit_types_map = {ut["_id"]: ut for ut in unit_types_list}

        # Bulk fetch districts
        if district_ids:
            districts_list = await db[Collections.DISTRICT].find(
                {"_id": {"$in": list(district_ids)}, "isDelete": False},
                {"_id": 1, "name": 1}
            ).to_list(length=None)
            districts_map = {d["_id"]: d for d in districts_list}

    if designation_ids:
        designations_list = await db[Collections.DESIGNATION_MASTER].find(
            {"_id": {"$in": list(designation_ids)}, "isDelete": False},
            {"_id": 1, "name": 1, "designationCd": 1}
        ).to_list(length=None)
        designations_map = {d["_id"]: d for d in designations_list}

    if dept_id:
        dept_obj_id = dept_id if isinstance(dept_id, ObjectId) else ObjectId(dept_id)
        department = await db[Collections.DEPARTMENT].find_one({"_id": dept_obj_id}, {"_id": 1, "name": 1})

    if rank_id:
        rank_obj_id = rank_id if isinstance(rank_id, ObjectId) else ObjectId(rank_id)
        rank = await db[Collections.RANK_MASTER].find_one({"_id": rank_obj_id}, {"_id": 1, "name": 1})

    # Populate units array
    if document.get("units"):
        populated_units = []
        for unit_assignment in document["units"]:
            if isinstance(unit_assignment, dict):
                unit_id_val = unit_assignment.get("unitId")
                designation_id_val = unit_assignment.get("designationId")
            elif isinstance(unit_assignment, (str, ObjectId)):
                unit_id_val = unit_assignment
                designation_id_val = None
            else:
                continue

            populated_assignment = {
                "unitId": str(unit_id_val) if unit_id_val else None,
                "designationId": str(designation_id_val) if designation_id_val else None
            }

            # Use pre-fetched unit data
            if unit_id_val:
                try:
                    unit_obj_id = ObjectId(str(unit_id_val)) if not isinstance(unit_id_val, ObjectId) else unit_id_val
                    if unit_obj_id in units_map:
                        unit = units_map[unit_obj_id]
                        unit_data = {
                            "_id": str(unit["_id"]),
                            "name": unit.get("name"),
                            "policeReferenceId": unit.get("policeReferenceId")
                        }
                        # Add unitType if available
                        unit_type_id = unit.get("unitTypeId")
                        if unit_type_id:
                            ut_obj_id = unit_type_id if isinstance(unit_type_id, ObjectId) else ObjectId(unit_type_id)
                            if ut_obj_id in unit_types_map:
                                unit_type = unit_types_map[ut_obj_id]
                                unit_data["unitType"] = {
                                    "_id": str(unit_type["_id"]),
                                    "name": unit_type.get("name")
                                }
                        # Add district if available
                        district_id = unit.get("districtId")
                        if district_id:
                            dist_obj_id = district_id if isinstance(district_id, ObjectId) else ObjectId(district_id)
                            if dist_obj_id in districts_map:
                                district = districts_map[dist_obj_id]
                                unit_data["district"] = {
                                    "_id": str(district["_id"]),
                                    "name": district.get("name")
                                }
                        populated_assignment["unit"] = unit_data
                except:
                    pass

            # Use pre-fetched designation data
            if designation_id_val:
                try:
                    des_obj_id = ObjectId(str(designation_id_val)) if not isinstance(designation_id_val, ObjectId) else designation_id_val
                    if des_obj_id in designations_map:
                        designation = designations_map[des_obj_id]
                        populated_assignment["designation"] = {
                            "_id": str(designation["_id"]),
                            "name": designation.get("name"),
                            "designationCd": designation.get("designationCd")
                        }
                except:
                    pass

            populated_units.append(populated_assignment)

        document["units"] = populated_units

    # Populate department
    if department:
        document["department"] = {"_id": str(department["_id"]), "name": department.get("name")}

    # Populate rank
    if rank:
        document["rank"] = {"_id": str(rank["_id"]), "name": rank.get("name")}

    return document


async def get_personnel_with_populated_data(db, personnel_id: str) -> Optional[dict]:
    """
    Get a single personnel with populated nested objects using aggregation pipeline.
    Optimized for low latency - single database round trip.
    """
    try:
        object_id = ObjectId(personnel_id) if isinstance(personnel_id, str) else personnel_id
    except:
        return None

    pipeline = [
        {"$match": {"_id": object_id}},
        # Lookup department
        {
            "$lookup": {
                "from": Collections.DEPARTMENT,
                "localField": "departmentId",
                "foreignField": "_id",
                "as": "departmentData"
            }
        },
        # Lookup rank
        {
            "$lookup": {
                "from": Collections.RANK_MASTER,
                "localField": "rankId",
                "foreignField": "_id",
                "as": "rankData"
            }
        },
        # Add populated fields
        {
            "$addFields": {
                "department": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$departmentData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$departmentData._id", 0]}},
                            "name": {"$arrayElemAt": ["$departmentData.name", 0]}
                        },
                        "else": None
                    }
                },
                "rank": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$rankData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$rankData._id", 0]}},
                            "name": {"$arrayElemAt": ["$rankData.name", 0]}
                        },
                        "else": None
                    }
                }
            }
        },
        # Remove temporary lookup arrays and password
        {
            "$project": {
                "departmentData": 0,
                "rankData": 0,
                "password": 0
            }
        }
    ]

    cursor = db[COLLECTION_NAME].aggregate(pipeline)
    results = await cursor.to_list(length=1)

    if not results:
        return None

    doc = results[0]
    # Populate units array with bulk fetch
    if doc.get("units"):
        doc = await populate_personnel_relations(db, doc)

    return _convert_document_for_json(doc)


# =============================================================================
# CRUD Operations
# =============================================================================

async def check_email_exists(db, email: str, exclude_id: ObjectId = None) -> bool:
    """Check if email already exists (including soft-deleted records)"""
    query = {"email": email.lower()}
    if exclude_id:
        query["_id"] = {"$ne": exclude_id}
    return await db[COLLECTION_NAME].find_one(query) is not None


async def check_userid_exists(db, user_id: str, exclude_id: ObjectId = None) -> bool:
    """Check if userId already exists (including soft-deleted records)"""
    query = {"userId": user_id}
    if exclude_id:
        query["_id"] = {"$ne": exclude_id}
    return await db[COLLECTION_NAME].find_one(query) is not None


async def create_personnel(
    data: PersonnelCreateSchema,
    created_by: str,
    created_ip: str = None,
    request: Optional[Request] = None
) -> dict:
    """
    Create a new personnel record

    Args:
        data: Personnel creation schema
        created_by: User ID who is creating this record (from token id)
        created_ip: IP address of the creator (from request headers)
        request: FastAPI request object for error logging

    Returns:
        Created personnel document

    Raises:
        ValueError: If email or userId already exists
    """
    db = get_database()
    collection = db[COLLECTION_NAME]

    # Check email uniqueness
    if await check_email_exists(db, data.email):
        await log_error(
            request=request,
            error_code=ErrorCodes.PERSONNEL_CREATE_DUPLICATE_EMAIL,
            parameters={"email": data.email},
            actor_user_id=created_by
        )
        raise ValueError(get_field_error("email_exists"))

    # Check userId uniqueness
    if data.userId and await check_userid_exists(db, data.userId):
        await log_error(
            request=request,
            error_code=ErrorCodes.PERSONNEL_USERID_EXISTS,
            parameters={"userId": data.userId},
            actor_user_id=created_by
        )
        raise ValueError(get_field_error("userId_exists"))

    # Prepare personnel document for FK validation
    personnel_dict_temp = data.model_dump(exclude={"password", "createdIp"})

    # Convert units to list of dicts for validation
    if personnel_dict_temp.get("units"):
        personnel_dict_temp["units"] = [
            {"unitId": u.get("unitId") or u.unitId, "designationId": u.get("designationId") or getattr(u, "designationId", None)}
            if hasattr(u, "unitId") else u
            for u in personnel_dict_temp["units"]
        ]

    # Validate foreign key constraints
    await validate_personnel_foreign_keys(db, personnel_dict_temp)

    # Hash the password
    hashed_password = hash_password(data.password)

    # Prepare personnel document
    personnel_dict = data.model_dump(exclude={"password"})
    personnel_dict["email"] = personnel_dict["email"].lower()
    personnel_dict["password"] = hashed_password
    personnel_dict["isActive"] = True
    personnel_dict["isDelete"] = False
    personnel_dict["createdBy"] = ObjectId(created_by) if created_by and ObjectId.is_valid(created_by) else None
    personnel_dict["createdAt"] = get_ist_now()
    personnel_dict["createdIp"] = created_ip
    personnel_dict["updatedBy"] = None
    personnel_dict["updatedAt"] = None
    personnel_dict["updatedIp"] = None

    # Convert units array - convert unitId and designationId to ObjectId
    if personnel_dict.get("units"):
        converted_units = []
        for unit_assignment in personnel_dict["units"]:
            converted_unit = {}
            if unit_assignment.get("unitId"):
                converted_unit["unitId"] = ObjectId(unit_assignment["unitId"]) if ObjectId.is_valid(unit_assignment["unitId"]) else unit_assignment["unitId"]
            if unit_assignment.get("designationId"):
                converted_unit["designationId"] = ObjectId(unit_assignment["designationId"]) if ObjectId.is_valid(unit_assignment["designationId"]) else unit_assignment["designationId"]
            converted_units.append(converted_unit)
        personnel_dict["units"] = converted_units

    # Convert departmentId and rankId to ObjectId
    if personnel_dict.get("departmentId") and ObjectId.is_valid(personnel_dict["departmentId"]):
        personnel_dict["departmentId"] = ObjectId(personnel_dict["departmentId"])
    if personnel_dict.get("rankId") and ObjectId.is_valid(personnel_dict["rankId"]):
        personnel_dict["rankId"] = ObjectId(personnel_dict["rankId"])

    # Insert into database
    result = await collection.insert_one(personnel_dict)
    created_personnel = await collection.find_one({"_id": result.inserted_id})

    # Add personnel to unitPersonnelList in each assigned unit
    unit_ids = extract_unit_ids_from_units(personnel_dict.get("units", []))
    if unit_ids:
        await add_personnel_to_units(db, result.inserted_id, unit_ids)

    return _convert_document_for_json(created_personnel)


async def update_personnel(
    personnel_id: str,
    patch: PersonnelUpdateSchema,
    updated_by: str,
    updated_ip: str = None,
    request: Optional[Request] = None
) -> dict:
    """
    Update an existing personnel record

    Args:
        personnel_id: Personnel ID
        patch: Update schema with fields to change
        updated_by: User ID who is updating this record (from token id)
        updated_ip: IP address of the updater (from request headers)
        request: FastAPI request object for error logging

    Returns:
        Updated personnel document

    Raises:
        ValueError: If personnel not found, deleted, or validation fails
    """
    db = get_database()
    collection = db[COLLECTION_NAME]

    if not ObjectId.is_valid(personnel_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PERSONNEL_UPDATE_NOT_FOUND,
            parameters={"personnelId": personnel_id, "reason": "Invalid ID format"},
            actor_user_id=updated_by
        )
        raise ValueError("Invalid personnel ID format")

    object_id = ObjectId(personnel_id)

    # Check if personnel exists
    existing_personnel = await collection.find_one({"_id": object_id, "isDelete": False})
    if not existing_personnel:
        await log_error(
            request=request,
            error_code=ErrorCodes.PERSONNEL_UPDATE_NOT_FOUND,
            parameters={"personnelId": personnel_id},
            actor_user_id=updated_by
        )
        raise ValueError(get_field_error("personnel_not_found"))

    # Prepare update data
    update_data = patch.model_dump(exclude_unset=True)

    if not update_data:
        await log_error(
            request=request,
            error_code=ErrorCodes.PERSONNEL_UPDATE_FAILED,
            parameters={"personnelId": personnel_id, "reason": "No fields to update"},
            actor_user_id=updated_by
        )
        raise ValueError(get_business_error("no_fields_to_update"))

    # Check email uniqueness if being updated
    if "email" in update_data:
        update_data["email"] = update_data["email"].lower()
        if await check_email_exists(db, update_data["email"], object_id):
            await log_error(
                request=request,
                error_code=ErrorCodes.PERSONNEL_UPDATE_DUPLICATE_EMAIL,
                parameters={"personnelId": personnel_id, "email": update_data["email"]},
                actor_user_id=updated_by
            )
            raise ValueError(get_field_error("email_exists"))

    # Check userId uniqueness if being updated
    if "userId" in update_data and update_data["userId"]:
        if await check_userid_exists(db, update_data["userId"], object_id):
            await log_error(
                request=request,
                error_code=ErrorCodes.PERSONNEL_USERID_EXISTS,
                parameters={"personnelId": personnel_id, "userId": update_data["userId"]},
                actor_user_id=updated_by
            )
            raise ValueError(get_field_error("userId_exists"))

    # Hash password if provided
    if "password" in update_data and update_data["password"]:
        update_data["password"] = hash_password(update_data["password"])

    # Validate foreign key constraints
    await validate_personnel_foreign_keys(db, update_data, is_create=False)

    # Set updatedBy, updatedAt, and updatedIp
    update_data["updatedBy"] = ObjectId(updated_by) if updated_by and ObjectId.is_valid(updated_by) else None
    update_data["updatedAt"] = get_ist_now()
    update_data["updatedIp"] = updated_ip

    # Handle units update and sync with unit collection
    if "units" in update_data and update_data["units"]:
        # Get old units before converting
        old_units = existing_personnel.get("units", [])

        # Convert units array - convert unitId and designationId to ObjectId
        converted_units = []
        for unit_assignment in update_data["units"]:
            converted_unit = {}
            if unit_assignment.get("unitId"):
                converted_unit["unitId"] = ObjectId(unit_assignment["unitId"]) if ObjectId.is_valid(unit_assignment["unitId"]) else unit_assignment["unitId"]
            if unit_assignment.get("designationId"):
                converted_unit["designationId"] = ObjectId(unit_assignment["designationId"]) if ObjectId.is_valid(unit_assignment["designationId"]) else unit_assignment["designationId"]
            converted_units.append(converted_unit)
        update_data["units"] = converted_units

        # Sync personnel in unit's unitPersonnelList
        await sync_personnel_units(db, object_id, old_units, converted_units)

    # Convert departmentId and rankId to ObjectId where needed
    if update_data.get("departmentId") and ObjectId.is_valid(update_data["departmentId"]):
        update_data["departmentId"] = ObjectId(update_data["departmentId"])
    if update_data.get("rankId") and ObjectId.is_valid(update_data["rankId"]):
        update_data["rankId"] = ObjectId(update_data["rankId"])

    # Build changes dictionary showing old → new values for notification
    # Only include fields that actually changed (exclude system fields and unchanged values)
    system_fields = {"updatedBy", "updatedAt", "updatedIp"}
    changes = {}
    for field in update_data.keys():
        if field not in system_fields:
            old_value = existing_personnel.get(field)
            new_value = update_data.get(field)
            # Convert ObjectId to string for comparison
            old_compare = str(old_value) if isinstance(old_value, ObjectId) else old_value
            new_compare = str(new_value) if isinstance(new_value, ObjectId) else new_value
            # Only add to changes if values are actually different
            if old_compare != new_compare:
                changes[field] = {
                    "old": old_compare,
                    "new": new_compare
                }

    # Update in database
    await collection.update_one({"_id": object_id}, {"$set": update_data})
    updated_personnel = await collection.find_one({"_id": object_id})

    result = _convert_document_for_json(updated_personnel)
    result["_changes"] = changes
    return result


async def delete_personnel(
    personnel_id: str,
    updated_by: str,
    request: Optional[Request] = None
) -> bool:
    """
    Soft delete a personnel record

    Args:
        personnel_id: Personnel ID
        updated_by: User ID who is deleting this record (from token id)
        request: FastAPI request object for error logging

    Returns:
        True if deleted successfully

    Raises:
        ValueError: If personnel not found or already deleted
    """
    db = get_database()
    collection = db[COLLECTION_NAME]

    if not ObjectId.is_valid(personnel_id):
        await log_error(
            request=request,
            error_code=ErrorCodes.PERSONNEL_DELETE_NOT_FOUND,
            parameters={"personnelId": personnel_id, "reason": "Invalid ID format"},
            actor_user_id=updated_by
        )
        raise ValueError("Invalid personnel ID format")

    object_id = ObjectId(personnel_id)

    # Check if personnel exists
    existing_personnel = await collection.find_one({"_id": object_id, "isDelete": False})
    if not existing_personnel:
        await log_error(
            request=request,
            error_code=ErrorCodes.PERSONNEL_DELETE_NOT_FOUND,
            parameters={"personnelId": personnel_id},
            actor_user_id=updated_by
        )
        raise ValueError(get_field_error("personnel_not_found"))

    # Check if personnel is a responsible user for any unit (among non-deleted units)
    unit_with_responsible_user = await db[Collections.UNIT].find_one({
        "responsibleUserId": object_id,
        "isDelete": False
    })
    if unit_with_responsible_user:
        unit_name = unit_with_responsible_user.get("name", "Unknown")
        await log_error(
            request=request,
            error_code=ErrorCodes.PERSONNEL_DELETE_IS_RESPONSIBLE_USER,
            parameters={"personnelId": personnel_id, "unitId": str(unit_with_responsible_user["_id"]), "unitName": unit_name},
            actor_user_id=updated_by
        )
        raise ValueError(f"Cannot delete personnel. This personnel is assigned as responsible user for unit '{unit_name}'.")

    # Check if personnel is a proxy user for any unit (among non-deleted units)
    unit_with_proxy_user = await db[Collections.UNIT].find_one({
        "proxyUserId": object_id,
        "isDelete": False
    })
    if unit_with_proxy_user:
        unit_name = unit_with_proxy_user.get("name", "Unknown")
        await log_error(
            request=request,
            error_code=ErrorCodes.PERSONNEL_DELETE_IS_PROXY_USER,
            parameters={"personnelId": personnel_id, "unitId": str(unit_with_proxy_user["_id"]), "unitName": unit_name},
            actor_user_id=updated_by
        )
        raise ValueError(f"Cannot delete personnel. This personnel is assigned as proxy user for unit '{unit_name}'.")

    # Remove personnel from all units' unitPersonnelList
    await remove_personnel_from_all_units(db, object_id)

    # CASCADE: Soft delete all user_role_permissions (user_mapping) for this personnel
    # This ensures no orphaned role mappings exist after personnel deletion
    cascade_update_result = await db[Collections.USER_MAPPING].update_many(
        {"userId": object_id, "isDelete": {"$ne": True}},
        {
            "$set": {
                "isDelete": True,
                "updatedBy": ObjectId(updated_by) if updated_by and ObjectId.is_valid(updated_by) else None,
                "updatedAt": get_ist_now()
            }
        }
    )

    # Soft delete the personnel
    result = await collection.update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": True,
                "updatedBy": ObjectId(updated_by) if updated_by and ObjectId.is_valid(updated_by) else None,
                "updatedAt": get_ist_now()
            }
        }
    )

    return result.modified_count > 0


async def restore_personnel(personnel_id: str, updated_by: str, restored_ip: Optional[str] = None) -> dict:
    """
    Restore a soft-deleted personnel record

    Args:
        personnel_id: Personnel ID
        updated_by: User ID who is restoring this record (from token id)
        restored_ip: IP address of the user restoring the record

    Returns:
        Restored personnel document

    Raises:
        ValueError: If personnel not found or not deleted
    """
    db = get_database()
    collection = db[COLLECTION_NAME]

    if not ObjectId.is_valid(personnel_id):
        raise ValueError("Invalid personnel ID format")

    object_id = ObjectId(personnel_id)

    # Check if personnel exists
    existing_personnel = await collection.find_one({"_id": object_id})
    if not existing_personnel:
        raise ValueError(get_field_error("personnel_not_found"))

    # Check if already active
    if not existing_personnel.get("isDelete", False):
        raise ValueError(get_business_error("personnel_already_active"))

    # Build update document
    update_doc = {
        "isDelete": False,
        "updatedBy": ObjectId(updated_by) if updated_by and ObjectId.is_valid(updated_by) else None,
        "updatedAt": get_ist_now()
    }
    if restored_ip:
        update_doc["updatedIp"] = restored_ip

    # Restore
    await collection.update_one(
        {"_id": object_id},
        {"$set": update_doc}
    )

    restored_personnel = await collection.find_one({"_id": object_id})

    # Re-add personnel to unitPersonnelList for all assigned units
    unit_ids = extract_unit_ids_from_units(restored_personnel.get("units", []))
    if unit_ids:
        await add_personnel_to_units(db, object_id, unit_ids)

    return _convert_document_for_json(restored_personnel)


async def get_personnel(personnel_id: str, populate: bool = True) -> Optional[dict]:
    """
    Get a single personnel by ID (includes soft-deleted records).
    Uses optimized aggregation pipeline for low latency.

    Args:
        personnel_id: Personnel ID
        populate: Whether to populate foreign key relations

    Returns:
        Personnel document or None if not found
    """
    db = get_database()

    if not ObjectId.is_valid(personnel_id):
        return None

    if populate:
        # Use optimized aggregation pipeline
        return await get_personnel_with_populated_data(db, personnel_id)
    else:
        collection = db[COLLECTION_NAME]
        personnel = await collection.find_one({"_id": ObjectId(personnel_id)}, {"password": 0})
        if not personnel:
            return None
        return _convert_document_for_json(personnel)


async def list_personnel(
    include_deleted: bool = False,
    search: Optional[str] = None,
    unit_id: Optional[str] = None,
    department_id: Optional[str] = None,
    rank_id: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    populate: bool = True,
    accessible_unit_ids: Optional[List[ObjectId]] = None
) -> Tuple[List[dict], int]:
    """
    List personnel with optional pagination, filters, and hierarchy-based access control.

    Args:
        include_deleted: If True, include deleted records.
        search: Search in name, firstName, lastName, email, userId, badgeNo.
        unit_id: Filter by unit ID.
        department_id: Filter by department ID.
        rank_id: Filter by rank ID.
        page: Page number (optional).
        page_size: Records per page (optional).
        populate: Whether to populate foreign key relations.
        accessible_unit_ids: List of unit ObjectIds the user can access (for hierarchy filtering).
                             If provided, only personnel in these units are returned.
                             If None, no hierarchy filtering is applied.

    Returns:
        Tuple[List[dict], int]: Tuple of (list of personnel documents, total count).
    """
    db = get_database()
    collection = db[COLLECTION_NAME]

    # Build query
    query: Dict[str, Any] = {}
    if not include_deleted:
        query["isDelete"] = False

    # Apply hierarchy-based access control filter
    if accessible_unit_ids is not None:
        if not accessible_unit_ids:
            # No accessible units - return empty result
            return [], 0
        query["units.unitId"] = {"$in": accessible_unit_ids}

    # Search across multiple fields
    if search:
        search_conditions = [
            {"name": {"$regex": search, "$options": "i"}},
            {"firstName": {"$regex": search, "$options": "i"}},
            {"lastName": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"userId": {"$regex": search, "$options": "i"}},
            {"badgeNo": {"$regex": search, "$options": "i"}}
        ]
        # If we already have a units.unitId filter, use $and
        if "units.unitId" in query:
            existing_unit_filter = query.pop("units.unitId")
            query = {
                "$and": [
                    {"units.unitId": existing_unit_filter},
                    {"$or": search_conditions}
                ]
            }
            if not include_deleted:
                query["$and"].append({"isDelete": False})
        else:
            query["$or"] = search_conditions

    # Filter by unitId (search in units array) - only if not already filtered by hierarchy
    if unit_id and ObjectId.is_valid(unit_id):
        if accessible_unit_ids is None:
            query["units.unitId"] = ObjectId(unit_id)
        # If accessible_unit_ids is set, the unitId filter is already applied via hierarchy

    # Filter by departmentId
    if department_id and ObjectId.is_valid(department_id):
        query["departmentId"] = ObjectId(department_id)

    # Filter by rankId
    if rank_id and ObjectId.is_valid(rank_id):
        query["rankId"] = ObjectId(rank_id)

    # Build cursor with projection to exclude unnecessary fields
    projection = {"password": 0}  # Exclude sensitive data

    # Get total count and personnel list in parallel
    if not query:
        # Use estimated count for better performance when no filters
        count_task = collection.estimated_document_count()
    else:
        count_task = collection.count_documents(query)

    # Build find query
    cursor = collection.find(query, projection).sort("createdAt", -1)

    # Apply pagination if requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)

    # Execute count and find in parallel
    total, personnel_list = await asyncio.gather(
        count_task,
        cursor.to_list(length=None)
    )

    # Populate relations using batch fetching for better performance
    if populate and personnel_list:
        personnel_list = await batch_populate_personnel_relations(db, personnel_list)

    # Convert documents for JSON
    result_list = [_convert_document_for_json(p) for p in personnel_list]

    return result_list, total


async def get_personnel_by_unit(
    unit_id: str,
    include_deleted: bool = False,
    is_active: Optional[bool] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    populate: bool = True
) -> Tuple[List[dict], int, Optional[str]]:
    """
    Get all personnel assigned to a specific unit.

    Queries the personnel collection where the units array contains the given unitId.

    Args:
        unit_id: Unit ID to filter by
        include_deleted: If True, include deleted records
        is_active: Filter by active status (True/False). If None, returns all.
        page: Page number (optional)
        page_size: Records per page (optional)
        populate: Whether to populate foreign key relations

    Returns:
        Tuple of (list of personnel documents, total count, responsibleUserId)

    Raises:
        ValueError: If unit_id is invalid
    """
    db = get_database()
    collection = db[COLLECTION_NAME]

    if not ObjectId.is_valid(unit_id):
        raise ValueError("Invalid unit ID format")

    unit_object_id = ObjectId(unit_id)

    # Build query - filter by unitId in units array
    query = {
        "units.unitId": unit_object_id
    }

    # Filter by isActive if specified
    if is_active is not None:
        query["isActive"] = is_active

    if not include_deleted:
        query["isDelete"] = False

    # Build cursor with projection
    projection = {"password": 0}
    cursor = collection.find(query, projection).sort("createdAt", -1)

    # Apply pagination if requested
    if page is not None and page_size is not None:
        skip = (page - 1) * page_size
        cursor = cursor.skip(skip).limit(page_size)

    # Execute unit fetch, count, and personnel list in parallel
    unit_task = db[Collections.UNIT].find_one(
        {"_id": unit_object_id},
        {"responsibleUserId": 1}
    )
    count_task = collection.count_documents(query)
    personnel_task = cursor.to_list(length=None)

    unit_doc, total, personnel_list = await asyncio.gather(
        unit_task,
        count_task,
        personnel_task
    )

    # Extract responsible user ID
    responsible_user_id = None
    if unit_doc and unit_doc.get("responsibleUserId"):
        responsible_user_id = str(unit_doc["responsibleUserId"])

    # Populate relations using batch fetching for better performance
    if populate and personnel_list:
        personnel_list = await batch_populate_personnel_relations(db, personnel_list)

    # Convert documents for JSON
    result_list = [_convert_document_for_json(p) for p in personnel_list]

    return result_list, total, responsible_user_id


async def batch_populate_personnel_relations(db, personnel_list: List[dict]) -> List[dict]:
    """
    Batch populate foreign key relations for multiple personnel documents.
    Uses single queries to fetch all related data instead of per-document queries.

    Args:
        db: Database instance
        personnel_list: List of personnel documents

    Returns:
        List of personnel documents with populated relations
    """
    if not personnel_list:
        return personnel_list

    # Collect all unique IDs needed for population
    all_unit_ids = set()
    all_designation_ids = set()
    all_department_ids = set()
    all_rank_ids = set()
    all_user_ids = set()  # For createdBy and updatedBy

    for personnel in personnel_list:
        # Collect unit and designation IDs from units array
        for unit_assignment in (personnel.get("units") or []):
            if isinstance(unit_assignment, dict):
                unit_id_val = unit_assignment.get("unitId")
                designation_id_val = unit_assignment.get("designationId")
            elif isinstance(unit_assignment, (str, ObjectId)):
                unit_id_val = unit_assignment
                designation_id_val = None
            else:
                continue

            if unit_id_val:
                try:
                    all_unit_ids.add(unit_id_val if isinstance(unit_id_val, ObjectId) else ObjectId(str(unit_id_val)))
                except Exception:
                    pass
            if designation_id_val:
                try:
                    all_designation_ids.add(designation_id_val if isinstance(designation_id_val, ObjectId) else ObjectId(str(designation_id_val)))
                except Exception:
                    pass

        # Collect department and rank IDs
        if personnel.get("departmentId"):
            try:
                dept_id = personnel["departmentId"]
                all_department_ids.add(dept_id if isinstance(dept_id, ObjectId) else ObjectId(str(dept_id)))
            except Exception:
                pass

        if personnel.get("rankId"):
            try:
                rank_id = personnel["rankId"]
                all_rank_ids.add(rank_id if isinstance(rank_id, ObjectId) else ObjectId(str(rank_id)))
            except Exception:
                pass

        # Collect createdBy and updatedBy IDs
        if personnel.get("createdBy"):
            try:
                created_by_id = personnel["createdBy"]
                all_user_ids.add(created_by_id if isinstance(created_by_id, ObjectId) else ObjectId(str(created_by_id)))
            except Exception:
                pass

        if personnel.get("updatedBy"):
            try:
                updated_by_id = personnel["updatedBy"]
                all_user_ids.add(updated_by_id if isinstance(updated_by_id, ObjectId) else ObjectId(str(updated_by_id)))
            except Exception:
                pass

    # Batch fetch all related documents in parallel using asyncio.gather
    units_map = {}
    units_raw = []  # Store raw units for unitType and district lookup
    designations_map = {}
    departments_map = {}
    ranks_map = {}
    unit_types_map = {}
    districts_map = {}

    # Define async functions for parallel fetching with projections
    async def fetch_units():
        nonlocal units_raw
        if all_unit_ids:
            projection = {"_id": 1, "name": 1, "policeReferenceId": 1, "unitTypeId": 1, "districtId": 1}
            cursor = db[Collections.UNIT].find(
                {"_id": {"$in": list(all_unit_ids)}, "isDelete": False},
                projection
            )
            units_raw = await cursor.to_list(length=None)
            for unit in units_raw:
                units_map[unit["_id"]] = {
                    "_id": str(unit["_id"]),
                    "name": unit.get("name"),
                    "policeReferenceId": unit.get("policeReferenceId"),
                    "unitTypeId": unit.get("unitTypeId"),
                    "districtId": unit.get("districtId")
                }

    async def fetch_designations():
        if all_designation_ids:
            projection = {"_id": 1, "name": 1, "designationCd": 1}
            cursor = db[Collections.DESIGNATION_MASTER].find(
                {"_id": {"$in": list(all_designation_ids)}, "isDelete": False},
                projection
            )
            designations = await cursor.to_list(length=None)
            for designation in designations:
                designations_map[designation["_id"]] = {
                    "_id": str(designation["_id"]),
                    "name": designation.get("name"),
                    "designationCd": designation.get("designationCd")
                }

    async def fetch_departments():
        if all_department_ids:
            projection = {"_id": 1, "name": 1}
            cursor = db[Collections.DEPARTMENT].find(
                {"_id": {"$in": list(all_department_ids)}},
                projection
            )
            departments = await cursor.to_list(length=None)
            for department in departments:
                departments_map[department["_id"]] = {
                    "_id": str(department["_id"]),
                    "name": department.get("name")
                }

    async def fetch_ranks():
        if all_rank_ids:
            projection = {"_id": 1, "name": 1}
            cursor = db[Collections.RANK_MASTER].find(
                {"_id": {"$in": list(all_rank_ids)}},
                projection
            )
            ranks = await cursor.to_list(length=None)
            for rank in ranks:
                ranks_map[rank["_id"]] = {
                    "_id": str(rank["_id"]),
                    "name": rank.get("name")
                }

    # Execute all fetches in parallel
    await asyncio.gather(
        fetch_units(),
        fetch_designations(),
        fetch_departments(),
        fetch_ranks()
    )

    # Fetch unit types after units are fetched (needs unitTypeId from units)
    all_unit_type_ids = set()
    for unit in units_raw:
        if unit.get("unitTypeId"):
            try:
                ut_id = unit["unitTypeId"]
                all_unit_type_ids.add(ut_id if isinstance(ut_id, ObjectId) else ObjectId(str(ut_id)))
            except Exception:
                pass

    if all_unit_type_ids:
        projection = {"_id": 1, "name": 1}
        cursor = db[Collections.UNIT_TYPE].find(
            {"_id": {"$in": list(all_unit_type_ids)}, "isDelete": False},
            projection
        )
        unit_types = await cursor.to_list(length=None)
        for ut in unit_types:
            unit_types_map[ut["_id"]] = {
                "_id": str(ut["_id"]),
                "name": ut.get("name")
            }

    # Fetch districts after units are fetched (needs districtId from units)
    all_district_ids = set()
    for unit in units_raw:
        if unit.get("districtId"):
            try:
                dist_id = unit["districtId"]
                all_district_ids.add(dist_id if isinstance(dist_id, ObjectId) else ObjectId(str(dist_id)))
            except Exception:
                pass

    if all_district_ids:
        projection = {"_id": 1, "name": 1}
        cursor = db[Collections.DISTRICT].find(
            {"_id": {"$in": list(all_district_ids)}, "isDelete": False},
            projection
        )
        districts = await cursor.to_list(length=None)
        for dist in districts:
            districts_map[dist["_id"]] = {
                "_id": str(dist["_id"]),
                "name": dist.get("name")
            }

    # Now populate each personnel document using the cached data
    for personnel in personnel_list:
        # Populate units array
        if personnel.get("units"):
            populated_units = []
            for unit_assignment in personnel["units"]:
                if isinstance(unit_assignment, dict):
                    unit_id_val = unit_assignment.get("unitId")
                    designation_id_val = unit_assignment.get("designationId")
                elif isinstance(unit_assignment, (str, ObjectId)):
                    unit_id_val = unit_assignment
                    designation_id_val = None
                else:
                    continue

                populated_assignment = {
                    "unitId": str(unit_id_val) if unit_id_val else None,
                    "designationId": str(designation_id_val) if designation_id_val else None
                }

                # Add unit data from cache
                if unit_id_val:
                    try:
                        unit_obj_id = unit_id_val if isinstance(unit_id_val, ObjectId) else ObjectId(str(unit_id_val))
                        if unit_obj_id in units_map:
                            unit_data = units_map[unit_obj_id].copy()
                            # Add unitType if available
                            unit_type_id = unit_data.pop("unitTypeId", None)
                            if unit_type_id:
                                ut_obj_id = unit_type_id if isinstance(unit_type_id, ObjectId) else ObjectId(str(unit_type_id))
                                if ut_obj_id in unit_types_map:
                                    unit_data["unitType"] = unit_types_map[ut_obj_id]
                            # Add district if available
                            district_id = unit_data.pop("districtId", None)
                            if district_id:
                                dist_obj_id = district_id if isinstance(district_id, ObjectId) else ObjectId(str(district_id))
                                if dist_obj_id in districts_map:
                                    unit_data["district"] = districts_map[dist_obj_id]
                            populated_assignment["unit"] = unit_data
                    except Exception:
                        pass

                # Add designation data from cache
                if designation_id_val:
                    try:
                        designation_obj_id = designation_id_val if isinstance(designation_id_val, ObjectId) else ObjectId(str(designation_id_val))
                        if designation_obj_id in designations_map:
                            populated_assignment["designation"] = designations_map[designation_obj_id]
                    except Exception:
                        pass

                populated_units.append(populated_assignment)

            personnel["units"] = populated_units

        # Populate department from cache
        if personnel.get("departmentId"):
            try:
                dept_id = personnel["departmentId"]
                dept_obj_id = dept_id if isinstance(dept_id, ObjectId) else ObjectId(str(dept_id))
                if dept_obj_id in departments_map:
                    personnel["department"] = departments_map[dept_obj_id]
            except Exception:
                pass

        # Populate rank from cache
        if personnel.get("rankId"):
            try:
                rank_id = personnel["rankId"]
                rank_obj_id = rank_id if isinstance(rank_id, ObjectId) else ObjectId(str(rank_id))
                if rank_obj_id in ranks_map:
                    personnel["rank"] = ranks_map[rank_obj_id]
            except Exception:
                pass

    return personnel_list


async def get_personnel_by_units_and_role(
    unit_ids: List[str],
    role_id: str,
    include_deleted: bool = False
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Get personnel matching specific units AND having a role mapping in user_role_permissions.

    Uses MongoDB aggregation pipeline for efficient single-query lookup:
    1. Starts from user_role_permissions_master (filtered by roleId + unitIds)
    2. Joins with personnel_master to get user details
    3. Joins with unit_master to get unit names
    4. Joins with rank_master to get rank names

    Args:
        unit_ids: List of unit IDs to filter by
        role_id: Role ID to filter by (must have mapping in user_role_permissions)
        include_deleted: If True, include soft-deleted records

    Returns:
        Tuple of (list of personnel with unit/role info, total count)

    Raises:
        ValueError: If role_id or unit_ids are invalid
    """
    db = get_database()

    # Validate inputs
    if not role_id or not ObjectId.is_valid(role_id):
        raise ValueError(f"Invalid roleId format: '{role_id}'. Must be a 24-character hex string.")

    if not unit_ids:
        raise ValueError("At least one unitId is required")

    # Convert and validate unit IDs
    valid_unit_object_ids = []
    for uid in unit_ids:
        if not ObjectId.is_valid(uid):
            raise ValueError(f"Invalid unitId format: '{uid}'. Must be a 24-character hex string.")
        valid_unit_object_ids.append(ObjectId(uid))

    role_object_id = ObjectId(role_id)

    # Build match conditions for user_role_permissions
    urp_match = {
        "roleId": role_object_id,
        "unitId": {"$in": valid_unit_object_ids},
        "isActive": True
    }
    if not include_deleted:
        urp_match["isDelete"] = False

    # Build match conditions for personnel
    personnel_match = {}
    if not include_deleted:
        personnel_match["personnel.isDelete"] = False

    # Aggregation pipeline - starts from user_role_permissions_master
    pipeline = [
        # Stage 1: Filter by roleId and unitIds
        {"$match": urp_match},

        # Stage 2: Lookup personnel details
        {
            "$lookup": {
                "from": Collections.PERSONNEL_MASTER,
                "localField": "userId",
                "foreignField": "_id",
                "as": "personnel"
            }
        },
        {"$unwind": {"path": "$personnel", "preserveNullAndEmptyArrays": False}},

        # Stage 3: Filter out deleted personnel if needed
        {"$match": personnel_match} if personnel_match else {"$match": {}},

        # Stage 4: Lookup unit details
        {
            "$lookup": {
                "from": Collections.UNIT,
                "localField": "unitId",
                "foreignField": "_id",
                "as": "unit"
            }
        },
        {"$unwind": {"path": "$unit", "preserveNullAndEmptyArrays": True}},

        # Stage 5: Lookup rank details from personnel's rankId
        {
            "$lookup": {
                "from": Collections.RANK_MASTER,
                "localField": "personnel.rankId",
                "foreignField": "_id",
                "as": "rank"
            }
        },
        {"$unwind": {"path": "$rank", "preserveNullAndEmptyArrays": True}},

        # Stage 6: Project only required fields
        {
            "$project": {
                "_id": {"$toString": "$personnel._id"},
                "personnelId": {"$toString": "$personnel._id"},
                "userId": "$personnel.userId",
                "userName": {
                    "$ifNull": [
                        "$personnel.name",
                        {"$concat": [
                            {"$ifNull": ["$personnel.firstName", ""]},
                            " ",
                            {"$ifNull": ["$personnel.lastName", ""]}
                        ]}
                    ]
                },
                "email": "$personnel.email",
                "unitId": {"$toString": "$unitId"},
                "unitObjectId": {"$toString": "$unit._id"},
                "unitName": "$unit.name",
                "rankId": {"$toString": "$personnel.rankId"},
                "rankName": "$rank.name",
                "roleId": {"$toString": "$roleId"},
                "isActive": "$personnel.isActive"
            }
        },

        # Stage 7: Sort by userName
        {"$sort": {"userName": 1}}
    ]

    # Remove empty match stage if no personnel filter
    pipeline = [stage for stage in pipeline if stage != {"$match": {}}]

    # Execute aggregation
    cursor = db[Collections.USER_ROLE_PERMISSIONS].aggregate(pipeline)
    results = await cursor.to_list(length=None)

    # Get total count
    total = len(results)

    return results, total


async def get_unit_hierarchy_with_personnel(personnel_id: str) -> dict:
    """
    Get unit hierarchy with personnel for a given personnel ID.

    OPTIMIZED: Uses batch queries to fetch all data efficiently.

    Flow:
    1. Find the unit where this personnel is the responsibleUserId
    2. Get the complete unit hierarchy (all descendants)
    3. Batch fetch all personnel for all units in the hierarchy
    4. Return hierarchical structure with personnel at each level

    Args:
        personnel_id: Personnel ID to find their responsible unit

    Returns:
        dict: Hierarchical structure with unit info and personnel at each level
        {
            "success": True,
            "message": "...",
            "data": {
                "unitId": "...",
                "unitName": "...",
                "relativeLevel": 0,
                "personnel": [...],
                "personnelCount": N,
                "children": [
                    {
                        "unitId": "...",
                        "unitName": "...",
                        "relativeLevel": 1,
                        "personnel": [...],
                        "personnelCount": N,
                        "children": [...]
                    }
                ]
            },
            "totalUnits": N,
            "totalPersonnel": N
        }

    Raises:
        ValueError: If personnel_id is invalid or personnel is not responsible for any unit
    """
    db = get_database()

    # Validate personnel ID format
    if not ObjectId.is_valid(personnel_id):
        raise ValueError("Invalid personnel ID format")

    personnel_object_id = ObjectId(personnel_id)

    # Step 1: Find the unit where this personnel is the responsibleUserId
    responsible_unit = await db[Collections.UNIT].find_one({
        "responsibleUserId": personnel_object_id,
        "isDelete": False
    })

    if not responsible_unit:
        raise ValueError(f"Personnel with ID '{personnel_id}' is not responsible for any unit")

    root_unit_id = responsible_unit["_id"]

    # Step 2: Fetch ALL non-deleted units in ONE query (same optimization as unit hierarchy)
    all_units = await db[Collections.UNIT].find({"isDelete": False}).to_list(length=None)

    # Build lookup maps for O(1) access
    units_by_id = {unit["_id"]: unit for unit in all_units}
    children_by_parent = {}
    for unit in all_units:
        parent_id = unit.get("parentUnitId")
        if parent_id:
            if parent_id not in children_by_parent:
                children_by_parent[parent_id] = []
            children_by_parent[parent_id].append(unit)

    # Sort children by name for consistent ordering
    for parent_id in children_by_parent:
        children_by_parent[parent_id].sort(key=lambda x: x.get("name", ""))

    # Step 3: Build list of all unit IDs in the hierarchy (root + all descendants)
    def collect_descendant_ids(parent_id: ObjectId) -> List[ObjectId]:
        """Recursively collect all descendant unit IDs"""
        ids = []
        children = children_by_parent.get(parent_id, [])
        for child in children:
            ids.append(child["_id"])
            ids.extend(collect_descendant_ids(child["_id"]))
        return ids

    all_hierarchy_unit_ids = [root_unit_id] + collect_descendant_ids(root_unit_id)

    # Step 4: Collect all responsibleUserIds from units in hierarchy
    responsible_user_ids = set()
    for unit_id in all_hierarchy_unit_ids:
        unit = units_by_id.get(unit_id, {})
        resp_user_id = unit.get("responsibleUserId")
        if resp_user_id:
            responsible_user_ids.add(resp_user_id if isinstance(resp_user_id, ObjectId) else ObjectId(resp_user_id))

    # Step 5: Batch fetch ALL personnel for ALL units + responsible users in ONE query
    personnel_query = {
        "$or": [
            {"units.unitId": {"$in": all_hierarchy_unit_ids}},
            {"_id": {"$in": list(responsible_user_ids)}}
        ],
        "isDelete": False
    }

    all_personnel = await db[COLLECTION_NAME].find(
        personnel_query,
        {"password": 0}
    ).to_list(length=None)

    # Step 6: Batch populate personnel relations
    if all_personnel:
        all_personnel = await batch_populate_personnel_relations(db, all_personnel)

    # Create a lookup map for personnel by ID (for responsible users)
    personnel_by_id = {p["_id"]: p for p in all_personnel}

    # Step 7: Group personnel by unit ID (only active ones for unit listing)
    personnel_by_unit = {}
    for unit_id in all_hierarchy_unit_ids:
        personnel_by_unit[unit_id] = []

    for person in all_personnel:
        # Only include active personnel in unit listings
        if not person.get("isActive", True):
            continue
        # A person can belong to multiple units, check their units array
        person_units = person.get("units", [])
        for unit_assignment in person_units:
            unit_id = unit_assignment.get("unitId")
            if unit_id:
                # Convert to ObjectId if string
                if isinstance(unit_id, str):
                    try:
                        unit_id = ObjectId(unit_id)
                    except:
                        continue
                if unit_id in personnel_by_unit:
                    personnel_by_unit[unit_id].append(person)

    # Step 10: Build hierarchical response structure
    def build_hierarchy_node(unit_id: ObjectId, level: int) -> dict:
        """Recursively build hierarchy node with personnel and responsible user info"""
        unit = units_by_id.get(unit_id, {})
        unit_personnel = personnel_by_unit.get(unit_id, [])

        # Convert personnel for JSON
        converted_personnel = [_convert_document_for_json(p) for p in unit_personnel]

        # Get responsible user info directly at unit level
        responsible_user_id = unit.get("responsibleUserId")
        responsible_user_name = None
        if responsible_user_id:
            resp_user_obj_id = responsible_user_id if isinstance(responsible_user_id, ObjectId) else ObjectId(responsible_user_id)
            resp_user = personnel_by_id.get(resp_user_obj_id)
            if resp_user:
                responsible_user_name = resp_user.get("name", "")

        # Build children recursively
        children_nodes = []
        children = children_by_parent.get(unit_id, [])
        for child in children:
            child_node = build_hierarchy_node(child["_id"], level + 1)
            children_nodes.append(child_node)

        return {
            "unitId": str(unit_id),
            "unitName": unit.get("name", ""),
            "responsibleUserId": str(responsible_user_id) if responsible_user_id else None,
            "responsibleUserName": responsible_user_name,
            "relativeLevel": level,
            "personnel": converted_personnel,
            "personnelCount": len(converted_personnel),
            "children": children_nodes
        }

    hierarchy = build_hierarchy_node(root_unit_id, 0)

    # Calculate totals
    def count_totals(node: dict) -> Tuple[int, int]:
        """Recursively count total units and personnel"""
        units = 1
        personnel = node["personnelCount"]
        for child in node.get("children", []):
            child_units, child_personnel = count_totals(child)
            units += child_units
            personnel += child_personnel
        return units, personnel

    total_units, total_personnel = count_totals(hierarchy)

    return {
        "success": True,
        "message": "Unit hierarchy with personnel retrieved successfully",
        "data": hierarchy,
        "totalUnits": total_units,
        "totalPersonnel": total_personnel
    }


async def get_unit_hierarchy_by_rank(
    rank_id: str,
    unit_id: Optional[str] = None
) -> dict:
    """
    Get unit hierarchy with personnel filtered by rank.

    This endpoint:
    1. If unit_id provided: Start from that unit, else start from root units
    2. Build the complete hierarchy tree
    3. Filter personnel at each unit by the given rank_id
    4. Return hierarchical structure with only personnel of that rank

    Args:
        rank_id: Rank ID to filter personnel
        unit_id: Optional unit ID to start the hierarchy from

    Returns:
        dict: Hierarchical structure with unit info and filtered personnel
        {
            "success": True,
            "message": "...",
            "data": [...],  # Array of root units with hierarchy
            "totalUnits": N,
            "totalPersonnel": N,
            "rankId": "...",
            "rankName": "..."
        }

    Raises:
        ValueError: If rank_id is invalid or not found
    """
    db = get_database()

    # Validate rank ID format
    if not ObjectId.is_valid(rank_id):
        raise ValueError("Invalid rank ID format")

    rank_object_id = ObjectId(rank_id)

    # Verify rank exists
    rank = await db[Collections.RANK_MASTER].find_one({
        "_id": rank_object_id,
        "isDelete": False
    })
    if not rank:
        raise ValueError(f"Rank with ID '{rank_id}' not found")

    rank_name = rank.get("name", "")

    # Step 1: Fetch ALL non-deleted units in ONE query
    all_units = await db[Collections.UNIT].find({"isDelete": False}).to_list(length=None)

    # Build lookup maps for O(1) access
    units_by_id = {unit["_id"]: unit for unit in all_units}
    children_by_parent = {}
    for unit in all_units:
        parent_id = unit.get("parentUnitId")
        if parent_id:
            if parent_id not in children_by_parent:
                children_by_parent[parent_id] = []
            children_by_parent[parent_id].append(unit)

    # Sort children by name for consistent ordering
    for parent_id in children_by_parent:
        children_by_parent[parent_id].sort(key=lambda x: x.get("name", ""))

    # Step 2: Determine root unit(s)
    if unit_id:
        if not ObjectId.is_valid(unit_id):
            raise ValueError("Invalid unit ID format")
        unit_object_id = ObjectId(unit_id)
        if unit_object_id not in units_by_id:
            raise ValueError(f"Unit with ID '{unit_id}' not found")
        root_unit_ids = [unit_object_id]
    else:
        # Find root units (units with no parent or parent not in our dataset)
        root_unit_ids = [
            unit["_id"] for unit in all_units
            if not unit.get("parentUnitId") or unit.get("parentUnitId") not in units_by_id
        ]

    # Step 3: Build list of all unit IDs in the hierarchy
    def collect_descendant_ids(parent_id: ObjectId) -> List[ObjectId]:
        """Recursively collect all descendant unit IDs"""
        ids = []
        children = children_by_parent.get(parent_id, [])
        for child in children:
            ids.append(child["_id"])
            ids.extend(collect_descendant_ids(child["_id"]))
        return ids

    all_hierarchy_unit_ids = []
    for root_id in root_unit_ids:
        all_hierarchy_unit_ids.append(root_id)
        all_hierarchy_unit_ids.extend(collect_descendant_ids(root_id))

    # Step 4: Batch fetch ALL personnel with the specified rank for ALL units
    personnel_query = {
        "units.unitId": {"$in": all_hierarchy_unit_ids},
        "rankId": rank_object_id,
        "isDelete": False,
        "isActive": True
    }

    all_personnel = await db[COLLECTION_NAME].find(
        personnel_query,
        {"password": 0}
    ).to_list(length=None)

    # Step 5: Batch populate personnel relations
    if all_personnel:
        all_personnel = await batch_populate_personnel_relations(db, all_personnel)

    # Step 6: Group personnel by unit ID
    personnel_by_unit = {unit_id: [] for unit_id in all_hierarchy_unit_ids}

    for person in all_personnel:
        person_units = person.get("units", [])
        for unit_assignment in person_units:
            p_unit_id = unit_assignment.get("unitId")
            if p_unit_id:
                if isinstance(p_unit_id, str):
                    try:
                        p_unit_id = ObjectId(p_unit_id)
                    except:
                        continue
                if p_unit_id in personnel_by_unit:
                    personnel_by_unit[p_unit_id].append(person)

    # Step 7: Collect responsible user IDs and fetch them
    responsible_user_ids = set()
    for unit_id in all_hierarchy_unit_ids:
        unit = units_by_id.get(unit_id, {})
        resp_user_id = unit.get("responsibleUserId")
        if resp_user_id:
            responsible_user_ids.add(resp_user_id if isinstance(resp_user_id, ObjectId) else ObjectId(resp_user_id))

    # Fetch responsible users
    personnel_by_id = {}
    if responsible_user_ids:
        resp_users = await db[COLLECTION_NAME].find(
            {"_id": {"$in": list(responsible_user_ids)}, "isDelete": False},
            {"name": 1, "rankId": 1}
        ).to_list(length=None)
        personnel_by_id = {p["_id"]: p for p in resp_users}

    # Step 8: Build hierarchical response structure
    def build_hierarchy_node(unit_id: ObjectId, level: int) -> dict:
        """Recursively build hierarchy node with personnel filtered by rank"""
        unit = units_by_id.get(unit_id, {})
        unit_personnel = personnel_by_unit.get(unit_id, [])

        # Convert personnel for JSON
        converted_personnel = [_convert_document_for_json(p) for p in unit_personnel]

        # Get responsible user info
        responsible_user_id = unit.get("responsibleUserId")
        responsible_user_name = None
        if responsible_user_id:
            resp_user_obj_id = responsible_user_id if isinstance(responsible_user_id, ObjectId) else ObjectId(responsible_user_id)
            resp_user = personnel_by_id.get(resp_user_obj_id)
            if resp_user:
                responsible_user_name = resp_user.get("name", "")

        # Build children recursively
        children_nodes = []
        children = children_by_parent.get(unit_id, [])
        for child in children:
            child_node = build_hierarchy_node(child["_id"], level + 1)
            children_nodes.append(child_node)

        return {
            "unitId": str(unit_id),
            "unitName": unit.get("name", ""),
            "unitCd": unit.get("unitCd"),
            "responsibleUserId": str(responsible_user_id) if responsible_user_id else None,
            "responsibleUserName": responsible_user_name,
            "relativeLevel": level,
            "personnel": converted_personnel,
            "personnelCount": len(converted_personnel),
            "children": children_nodes
        }

    # Build hierarchy for all root units
    hierarchy_data = []
    for root_id in root_unit_ids:
        hierarchy_data.append(build_hierarchy_node(root_id, 0))

    # Calculate totals
    def count_totals(nodes: List[dict]) -> Tuple[int, int]:
        """Recursively count total units and personnel"""
        units = 0
        personnel = 0
        for node in nodes:
            units += 1
            personnel += node["personnelCount"]
            child_units, child_personnel = count_totals(node.get("children", []))
            units += child_units
            personnel += child_personnel
        return units, personnel

    total_units, total_personnel = count_totals(hierarchy_data)

    return {
        "success": True,
        "message": f"Unit hierarchy with personnel of rank '{rank_name}' retrieved successfully",
        "data": hierarchy_data[0] if len(hierarchy_data) == 1 else hierarchy_data,
        "totalUnits": total_units,
        "totalPersonnel": total_personnel,
        "rankId": rank_id,
        "rankName": rank_name
    }


async def get_subordinate_personnel_by_rank(personnel_id: str) -> dict:
    """
    Get subordinate personnel (lower rank level) for a given personnel across all their units.

    Logic:
    1. Get the given personnel's rankId and units[] array
    2. Get the personnel's rank level from rank_master
    3. Get all ranks and build a rankId → level map
    4. For each unit in personnel's units[]:
       - Get all personnel in that unit
       - Filter to keep only personnel with rank level > given personnel's level
       - Exclude the given personnel themselves
    5. Return grouped by unit

    Note: Higher level number = lower rank (subordinate)
          e.g., DGP=1, IGP=2, SP=3, ... Constable=10

    Args:
        personnel_id: Personnel ID to find subordinates for

    Returns:
        dict: Subordinate personnel grouped by unit
        {
            "success": True,
            "message": "...",
            "data": {
                "givenPersonnel": { personnel info with rank },
                "unitWisePersonnel": [
                    {
                        "unitId": "...",
                        "unitName": "...",
                        "personnel": [...],
                        "personnelCount": N
                    }
                ]
            },
            "totalPersonnel": N,
            "filterCriteria": { ... }
        }

    Raises:
        ValueError: If personnel_id is invalid or personnel not found
    """
    db = get_database()

    # Validate personnel ID format
    if not ObjectId.is_valid(personnel_id):
        raise ValueError("Invalid personnel ID format")

    personnel_object_id = ObjectId(personnel_id)

    # Step 1: Get the given personnel
    given_personnel = await db[COLLECTION_NAME].find_one({
        "_id": personnel_object_id,
        "isDelete": False
    })

    if not given_personnel:
        raise ValueError(f"Personnel with ID '{personnel_id}' not found")

    # Get personnel's rankId and units
    given_rank_id = given_personnel.get("rankId")
    given_units = given_personnel.get("units", [])

    if not given_rank_id:
        raise ValueError(f"Personnel with ID '{personnel_id}' does not have a rank assigned")

    if not given_units or len(given_units) == 0:
        raise ValueError(f"Personnel with ID '{personnel_id}' is not assigned to any unit")

    # Step 2: Get the given personnel's rank level
    given_rank_obj_id = given_rank_id if isinstance(given_rank_id, ObjectId) else ObjectId(given_rank_id)
    given_rank = await db[Collections.RANK_MASTER].find_one({
        "_id": given_rank_obj_id,
        "isDelete": False
    })

    if not given_rank:
        raise ValueError(f"Rank with ID '{given_rank_id}' not found")

    given_rank_level = given_rank.get("level", 0)
    given_rank_name = given_rank.get("name", "")

    # Step 3: Get ALL ranks and build level map
    all_ranks = await db[Collections.RANK_MASTER].find({"isDelete": False}).to_list(length=None)
    rank_level_map = {}  # rankId (ObjectId) → level
    rank_name_map = {}   # rankId (ObjectId) → name
    for rank in all_ranks:
        rank_level_map[rank["_id"]] = rank.get("level", 0)
        rank_name_map[rank["_id"]] = rank.get("name", "")

    # Step 4: Collect all unit IDs from given personnel's units
    unit_ids = []
    for unit_assignment in given_units:
        unit_id = unit_assignment.get("unitId")
        if unit_id:
            if isinstance(unit_id, str):
                try:
                    unit_id = ObjectId(unit_id)
                except:
                    continue
            unit_ids.append(unit_id)

    if not unit_ids:
        raise ValueError(f"Personnel with ID '{personnel_id}' has no valid unit assignments")

    # Step 5: Batch fetch unit details
    units_cursor = db[Collections.UNIT].find(
        {"_id": {"$in": unit_ids}, "isDelete": False},
        {"name": 1, "unitCd": 1}
    )
    units_map = {}
    async for unit in units_cursor:
        units_map[unit["_id"]] = unit

    # Step 6: Batch fetch ALL personnel for ALL units in ONE query
    all_personnel = await db[COLLECTION_NAME].find({
        "units.unitId": {"$in": unit_ids},
        "isDelete": False,
        "isActive": True,
        "_id": {"$ne": personnel_object_id}  # Exclude the given personnel
    }, {"password": 0}).to_list(length=None)

    # Step 7: Populate personnel relations
    if all_personnel:
        all_personnel = await batch_populate_personnel_relations(db, all_personnel)

    # Step 8: Group personnel by unit and filter by rank level
    unit_wise_personnel = []
    total_subordinate_count = 0
    processed_personnel_ids = set()  # To avoid duplicates across units

    for unit_id in unit_ids:
        unit_info = units_map.get(unit_id, {})
        unit_personnel = []

        for person in all_personnel:
            # Check if this person belongs to this unit
            person_units = person.get("units", [])
            belongs_to_unit = False
            for pu in person_units:
                pu_id = pu.get("unitId")
                if pu_id:
                    if isinstance(pu_id, str):
                        try:
                            pu_id = ObjectId(pu_id)
                        except:
                            continue
                    if pu_id == unit_id:
                        belongs_to_unit = True
                        break

            if not belongs_to_unit:
                continue

            # Get person's rank level
            person_rank_id = person.get("rankId")
            if person_rank_id:
                if isinstance(person_rank_id, str):
                    try:
                        person_rank_id = ObjectId(person_rank_id)
                    except:
                        continue
                elif isinstance(person_rank_id, dict) and "_id" in person_rank_id:
                    # Already populated
                    person_rank_id = person_rank_id["_id"]
                    if isinstance(person_rank_id, str):
                        person_rank_id = ObjectId(person_rank_id)

                person_rank_level = rank_level_map.get(person_rank_id, 0)

                # Filter: Keep only if rank level > given personnel's level (subordinate)
                if person_rank_level > given_rank_level:
                    # Convert for JSON and add rank info
                    converted_person = _convert_document_for_json(person)
                    converted_person["rankLevel"] = person_rank_level
                    converted_person["rankName"] = rank_name_map.get(person_rank_id, "")
                    unit_personnel.append(converted_person)

                    # Track for total count (avoid duplicates)
                    if person["_id"] not in processed_personnel_ids:
                        processed_personnel_ids.add(person["_id"])
                        total_subordinate_count += 1

        unit_wise_personnel.append({
            "unitId": str(unit_id),
            "unitName": unit_info.get("name", ""),
            "unitCd": unit_info.get("unitCd"),
            "personnel": unit_personnel,
            "personnelCount": len(unit_personnel)
        })

    # Build given personnel info for response
    given_personnel_info = {
        "_id": str(given_personnel["_id"]),
        "name": given_personnel.get("name", ""),
        "rankId": str(given_rank_obj_id),
        "rankName": given_rank_name,
        "rankLevel": given_rank_level,
        "units": [
            {
                "unitId": str(uid),
                "unitName": units_map.get(uid, {}).get("name", "")
            }
            for uid in unit_ids if uid in units_map
        ]
    }

    return {
        "success": True,
        "message": f"Subordinate personnel retrieved successfully for {given_personnel.get('name', '')}",
        "data": {
            "givenPersonnel": given_personnel_info,
            "unitWisePersonnel": unit_wise_personnel
        },
        "totalPersonnel": total_subordinate_count,
        "filterCriteria": {
            "rankLevelGreaterThan": given_rank_level,
            "description": f"Personnel with rank level > {given_rank_level} (subordinates of {given_rank_name})"
        }
    }


async def list_personnel_minimal(
    search: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get a minimal list of all active, non-deleted personnel with only _id and name.

    This is a lightweight endpoint optimized for dropdowns and select components.
    Returns all personnel regardless of unit or district, filtering only for
    active and non-deleted records.

    Args:
        search: Optional search string to filter by name (case-insensitive partial match).

    Returns:
        List of dicts containing only '_id' (as string) and 'name' for each personnel.

    Example:
        personnel = await list_personnel_minimal(search="john")
        # Returns: [{"_id": "507f1f77bcf86cd799439011", "name": "John Doe"}, ...]
    """
    db = get_database()

    # Base query: only active and non-deleted personnel
    query: Dict[str, Any] = {
        "isDelete": {"$ne": True},
        "isActive": True
    }

    # Add search filter if provided
    if search:
        query["name"] = {"$regex": search, "$options": "i"}

    # Project only _id and name for minimal response
    cursor = db[COLLECTION_NAME].find(
        query,
        {"_id": 1, "name": 1}
    ).sort("name", 1)  # Sort alphabetically by name

    personnel_list = []
    async for doc in cursor:
        personnel_list.append({
            "_id": str(doc["_id"]),
            "name": doc.get("name", "")
        })

    return personnel_list
