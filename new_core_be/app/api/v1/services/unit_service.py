"""
Unit Service
Business logic for Unit collection operations
"""
import re
import asyncio
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status, Request

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.utils.validators import validate_unit_foreign_keys
from app.utils.error_messages import get_validation_error, get_field_error, get_business_error
from app.constants.collections import Collections
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error

# Collection name from centralized constants
COLLECTION_NAME = Collections.UNIT


async def _check_name_uniqueness(
    db,
    name: str,
    exclude_id: Optional[ObjectId] = None
) -> None:
    """
    Check if name is unique among non-deleted records.
    Returns different error messages based on isActive state if duplicate found.

    Args:
        db: Database connection
        name: Unit name to check
        exclude_id: ObjectId to exclude from check (for updates)

    Raises:
        HTTPException: If duplicate name found
    """
    query = {
        "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
        "isDelete": False
    }

    if exclude_id:
        query["_id"] = {"$ne": exclude_id}

    existing = await db[COLLECTION_NAME].find_one(query)

    if existing:
        if existing.get("isActive", True):
            # Active record exists
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists_active", field_names="name")
            )
        else:
            # Inactive record exists
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists_inactive", field_names="name")
            )


async def calculate_parent_unit_path(db, parent_unit_id: str) -> Optional[str]:
    """
    Calculate parentUnitPath based on parent unit's name and path.
    Format: \\parentName + parentUnit.parentUnitPath

    Example:
    - If parent name is "A1" and parent's path is "\\A"
    - Result for new unit: "\\A1\\A"

    Args:
        db: Database connection
        parent_unit_id: The _id (ObjectId as string) of the parent unit

    Returns:
        str: Path in format \\parentName\\ancestor1\\ancestor2... or None if no parent
    """
    if not parent_unit_id:
        return None

    # Fetch parent unit by _id
    try:
        parent_object_id = ObjectId(parent_unit_id)
    except:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="parentUnitId")
        )

    parent_unit = await db[COLLECTION_NAME].find_one({"_id": parent_object_id, "isDelete": False})

    if not parent_unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("parent_unit_not_found")
        )

    parent_name = parent_unit.get("name", "")
    parent_path = parent_unit.get("parentUnitPath", "")

    # Calculate: \\parentName + parentPath
    if parent_path:
        calculated_path = f"\\{parent_name}{parent_path}"
    else:
        calculated_path = f"\\{parent_name}"

    return calculated_path


async def check_circular_hierarchy(db, unit_id: str, new_parent_id: Optional[str]) -> bool:
    """
    Check if setting new_parent_id would create a circular hierarchy.
    Returns True if circular reference is detected.

    Args:
        db: Database connection
        unit_id: The _id (ObjectId as string) of the unit being updated
        new_parent_id: The _id (ObjectId as string) of the proposed parent unit
    """
    if not new_parent_id:
        return False

    # If trying to set itself as parent
    if unit_id == new_parent_id:
        return True

    # Fetch current unit
    current_unit = await db[COLLECTION_NAME].find_one({"_id": ObjectId(unit_id), "isDelete": False})
    if not current_unit:
        return False

    # Fetch proposed parent unit
    try:
        parent_object_id = ObjectId(new_parent_id)
    except:
        return False

    parent_unit = await db[COLLECTION_NAME].find_one({"_id": parent_object_id, "isDelete": False})
    if not parent_unit:
        return False

    parent_path = parent_unit.get("parentUnitPath", "")
    current_unit_name = current_unit.get("name", "")

    # If parent's path contains current unit's name, it's circular
    # Path format is \\name1\\name2, so check if \\currentName\\ or \\currentName exists
    if parent_path and current_unit_name:
        if f"\\{current_unit_name}\\" in parent_path or parent_path.endswith(f"\\{current_unit_name}"):
            return True

    return False


async def update_descendant_paths(
    db,
    unit_id: str,
    old_name: str,
    new_name: str,
    old_path: Optional[str],
    new_path: Optional[str]
) -> int:
    """
    Update parentUnitPath for all descendant units when a unit's name or path changes.

    This function efficiently updates all children's paths in bulk.

    Args:
        db: Database connection
        unit_id: The _id of the unit being updated
        old_name: The unit's previous name
        new_name: The unit's new name
        old_path: The unit's previous parentUnitPath
        new_path: The unit's new parentUnitPath

    Returns:
        int: Number of documents updated
    """
    # Build the old path segment that children would have
    # Children's path format: \\thisUnitName\\thisUnit'sParentPath
    if old_path:
        old_child_path_prefix = f"\\{old_name}{old_path}"
    else:
        old_child_path_prefix = f"\\{old_name}"

    # Build the new path segment for children
    if new_path:
        new_child_path_prefix = f"\\{new_name}{new_path}"
    else:
        new_child_path_prefix = f"\\{new_name}"

    # If nothing changed, skip
    if old_child_path_prefix == new_child_path_prefix:
        return 0

    # Escape backslashes for regex
    escaped_old_prefix = old_child_path_prefix.replace("\\", "\\\\")

    # Find matching documents - paths that start with the old prefix
    regex_pattern = f"^{escaped_old_prefix}(\\\\|$)"

    cursor = db[COLLECTION_NAME].find({
        "parentUnitPath": {"$regex": regex_pattern},
        "isDelete": False
    })

    updated_count = 0
    async for unit in cursor:
        current_path = unit.get("parentUnitPath", "")
        if current_path:
            # Replace the old prefix with the new prefix
            updated_path = current_path.replace(old_child_path_prefix, new_child_path_prefix, 1)
            await db[COLLECTION_NAME].update_one(
                {"_id": unit["_id"]},
                {"$set": {"parentUnitPath": updated_path}}
            )
            updated_count += 1

    return updated_count


async def handle_responsible_user_change(
    db,
    unit_id: ObjectId,
    old_responsible_user_id: Optional[ObjectId],
    new_responsible_user_id: ObjectId,
    designation_id: Optional[str]
) -> None:
    """
    Handle all the side effects when a unit's responsible user changes.

    This function:
    1. Removes the unit from the OLD responsible person's units array
    2. Adds/updates the unit in the NEW responsible person's units array (with designationId if provided)
    3. Updates the unit's unitPersonnelList (remove old, add new)

    Note: History entry (responsibleUserHistory) should be passed from frontend via update_data
    and will be stored as part of the normal update operation.

    Args:
        db: Database connection
        unit_id: The unit's ObjectId
        old_responsible_user_id: Previous responsible user's ObjectId (can be None for first assignment)
        new_responsible_user_id: New responsible user's ObjectId
        designation_id: Optional designation ID for the new responsible user in this unit
    """
    # Convert designation_id to ObjectId if provided
    designation_obj_id = None
    if designation_id:
        try:
            designation_obj_id = ObjectId(designation_id)
        except:
            pass

    # 1. Remove unit from OLD responsible user's units array (if there was a previous responsible user)
    if old_responsible_user_id:
        await db[Collections.PERSONNEL_MASTER].update_one(
            {"_id": old_responsible_user_id},
            {"$pull": {"units": {"unitId": unit_id}}}
        )

    # 2. Add/update unit in NEW responsible user's units array
    # First check if the unit already exists in the new user's units array
    new_user = await db[Collections.PERSONNEL_MASTER].find_one(
        {"_id": new_responsible_user_id},
        {"units": 1}
    )

    if new_user:
        existing_units = new_user.get("units", [])
        unit_exists = False

        for unit_assignment in existing_units:
            if isinstance(unit_assignment, dict):
                existing_unit_id = unit_assignment.get("unitId")
                if existing_unit_id:
                    existing_unit_obj_id = existing_unit_id if isinstance(existing_unit_id, ObjectId) else ObjectId(str(existing_unit_id))
                    if existing_unit_obj_id == unit_id:
                        unit_exists = True
                        break

        if unit_exists:
            # Unit already exists - update designation if provided
            if designation_obj_id:
                await db[Collections.PERSONNEL_MASTER].update_one(
                    {"_id": new_responsible_user_id, "units.unitId": unit_id},
                    {"$set": {"units.$.designationId": designation_obj_id}}
                )
        else:
            # Unit doesn't exist - add it
            new_unit_assignment = {"unitId": unit_id}
            if designation_obj_id:
                new_unit_assignment["designationId"] = designation_obj_id

            await db[Collections.PERSONNEL_MASTER].update_one(
                {"_id": new_responsible_user_id},
                {"$push": {"units": new_unit_assignment}}
            )

    # 3. Update unit's unitPersonnelList (remove old, add new)
    # First, remove old responsible user from unitPersonnelList
    if old_responsible_user_id:
        await db[COLLECTION_NAME].update_one(
            {"_id": unit_id},
            {"$pull": {"unitPersonnelList": old_responsible_user_id}}
        )

    # Add new responsible user to unitPersonnelList (if not already present)
    await db[COLLECTION_NAME].update_one(
        {"_id": unit_id},
        {"$addToSet": {"unitPersonnelList": new_responsible_user_id}}
    )


async def populate_unit_relations(db, document: dict) -> dict:
    """Populate foreign key relations with actual data - DEPRECATED, use get_unit_with_populated_data instead"""
    if not document:
        return document

    # Collect all IDs for bulk fetching
    dept_id = document.get("departmentId")
    parent_id = document.get("parentUnitId")
    unit_type_id = document.get("unitTypeId")
    district_id = document.get("districtId")

    # Bulk fetch all related documents in parallel
    dept_doc, parent_doc, unit_type_doc, district_doc = None, None, None, None

    if dept_id:
        dept_obj_id = dept_id if isinstance(dept_id, ObjectId) else ObjectId(dept_id)
        dept_doc = await db[Collections.DEPARTMENT].find_one({"_id": dept_obj_id}, {"_id": 1, "name": 1})

    if parent_id:
        parent_obj_id = parent_id if isinstance(parent_id, ObjectId) else ObjectId(parent_id)
        parent_doc = await db[COLLECTION_NAME].find_one({"_id": parent_obj_id, "isDelete": False}, {"_id": 1, "name": 1, "policeReferenceId": 1})

    if unit_type_id:
        unit_type_obj_id = unit_type_id if isinstance(unit_type_id, ObjectId) else ObjectId(unit_type_id)
        unit_type_doc = await db[Collections.UNIT_TYPE].find_one({"_id": unit_type_obj_id}, {"_id": 1, "name": 1})

    if district_id:
        district_obj_id = district_id if isinstance(district_id, ObjectId) else ObjectId(district_id)
        district_doc = await db[Collections.DISTRICT].find_one({"_id": district_obj_id}, {"_id": 1, "name": 1, "cctnsDistrictCd": 1, "stateName": 1})

    # Populate results
    if dept_doc:
        document["department"] = {"_id": str(dept_doc["_id"]), "name": dept_doc.get("name")}

    if parent_doc:
        document["parentUnit"] = {"_id": str(parent_doc["_id"]), "name": parent_doc.get("name"), "policeReferenceId": parent_doc.get("policeReferenceId")}

    if unit_type_doc:
        document["unitType"] = {"_id": str(unit_type_doc["_id"]), "name": unit_type_doc.get("name")}

    if district_doc:
        document["district"] = {"_id": str(district_doc["_id"]), "name": district_doc.get("name"), "cctnsDistrictCd": district_doc.get("cctnsDistrictCd"), "stateName": district_doc.get("stateName")}

    return document


async def get_unit_with_populated_data(db, unit_id: str) -> Optional[dict]:
    """
    Get a single unit with populated nested objects using aggregation pipeline.
    This is optimized for low latency - single database round trip.
    """
    try:
        object_id = ObjectId(unit_id) if isinstance(unit_id, str) else unit_id
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
        # Lookup parent unit
        {
            "$lookup": {
                "from": Collections.UNIT,
                "localField": "parentUnitId",
                "foreignField": "_id",
                "as": "parentUnitData"
            }
        },
        # Lookup unit type
        {
            "$lookup": {
                "from": Collections.UNIT_TYPE,
                "localField": "unitTypeId",
                "foreignField": "_id",
                "as": "unitTypeData"
            }
        },
        # Lookup district
        {
            "$lookup": {
                "from": Collections.DISTRICT,
                "localField": "districtId",
                "foreignField": "_id",
                "as": "districtData"
            }
        },
        # Lookup responsible user
        {
            "$lookup": {
                "from": Collections.PERSONNEL_MASTER,
                "localField": "responsibleUserId",
                "foreignField": "_id",
                "as": "responsibleUserData"
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
                "parentUnit": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$parentUnitData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$parentUnitData._id", 0]}},
                            "name": {"$arrayElemAt": ["$parentUnitData.name", 0]},
                            "policeReferenceId": {"$arrayElemAt": ["$parentUnitData.policeReferenceId", 0]}
                        },
                        "else": None
                    }
                },
                "unitType": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$unitTypeData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$unitTypeData._id", 0]}},
                            "name": {"$arrayElemAt": ["$unitTypeData.name", 0]}
                        },
                        "else": None
                    }
                },
                "district": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$districtData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$districtData._id", 0]}},
                            "name": {"$arrayElemAt": ["$districtData.name", 0]},
                            "cctnsDistrictCd": {"$arrayElemAt": ["$districtData.cctnsDistrictCd", 0]},
                            "stateName": {"$arrayElemAt": ["$districtData.stateName", 0]}
                        },
                        "else": None
                    }
                },
                "responsibleUser": {
                    "$cond": {
                        "if": {"$gt": [{"$size": "$responsibleUserData"}, 0]},
                        "then": {
                            "_id": {"$toString": {"$arrayElemAt": ["$responsibleUserData._id", 0]}},
                            "name": {"$arrayElemAt": ["$responsibleUserData.name", 0]}
                        },
                        "else": None
                    }
                }
            }
        },
        # Remove temporary lookup arrays
        {
            "$project": {
                "departmentData": 0,
                "parentUnitData": 0,
                "unitTypeData": 0,
                "districtData": 0,
                "responsibleUserData": 0
            }
        }
    ]

    cursor = db[COLLECTION_NAME].aggregate(pipeline)
    results = await cursor.to_list(length=1)

    if not results:
        return None

    return convert_objectid_to_str(results[0])


async def get_units_with_populated_data(
    db,
    query: dict,
    skip: int = 0,
    limit: Optional[int] = None,
    sort_field: str = "createdAt",
    sort_order: int = -1
) -> List[dict]:
    """
    Get multiple units with populated nested objects using bulk fetch approach.
    Optimized for low latency - fetches units first, then bulk fetches related data.
    This is faster than $lookup for large collections.
    """
    # Projection to exclude heavy fields
    projection = {
        "proxyUserId": 0,
        "responsibleUserHistory": 0,
        "unitPersonnelList": 0
    }

    # First fetch units with pagination
    cursor = db[COLLECTION_NAME].find(query, projection).sort(sort_field, sort_order)
    if skip > 0:
        cursor = cursor.skip(skip)
    if limit is not None:
        cursor = cursor.limit(limit)

    units_list = await cursor.to_list(length=limit if limit else None)

    if not units_list:
        return []

    # Collect all unique IDs for bulk fetching
    dept_ids = set()
    parent_ids = set()
    unit_type_ids = set()
    district_ids = set()
    responsible_user_ids = set()

    for unit in units_list:
        if unit.get("departmentId"):
            dept_ids.add(unit["departmentId"] if isinstance(unit["departmentId"], ObjectId) else ObjectId(unit["departmentId"]))
        if unit.get("parentUnitId"):
            parent_ids.add(unit["parentUnitId"] if isinstance(unit["parentUnitId"], ObjectId) else ObjectId(unit["parentUnitId"]))
        if unit.get("unitTypeId"):
            unit_type_ids.add(unit["unitTypeId"] if isinstance(unit["unitTypeId"], ObjectId) else ObjectId(unit["unitTypeId"]))
        if unit.get("districtId"):
            district_ids.add(unit["districtId"] if isinstance(unit["districtId"], ObjectId) else ObjectId(unit["districtId"]))
        if unit.get("responsibleUserId"):
            responsible_user_ids.add(unit["responsibleUserId"] if isinstance(unit["responsibleUserId"], ObjectId) else ObjectId(unit["responsibleUserId"]))

    # Bulk fetch all related data in parallel using asyncio.gather
    async def fetch_departments():
        if not dept_ids:
            return {}
        depts = await db[Collections.DEPARTMENT].find(
            {"_id": {"$in": list(dept_ids)}},
            {"_id": 1, "name": 1}
        ).to_list(length=None)
        return {d["_id"]: d for d in depts}

    async def fetch_parents():
        if not parent_ids:
            return {}
        parents = await db[COLLECTION_NAME].find(
            {"_id": {"$in": list(parent_ids)}},
            {"_id": 1, "name": 1, "policeReferenceId": 1}
        ).to_list(length=None)
        return {p["_id"]: p for p in parents}

    async def fetch_unit_types():
        if not unit_type_ids:
            return {}
        unit_types = await db[Collections.UNIT_TYPE].find(
            {"_id": {"$in": list(unit_type_ids)}},
            {"_id": 1, "name": 1}
        ).to_list(length=None)
        return {ut["_id"]: ut for ut in unit_types}

    async def fetch_districts():
        if not district_ids:
            return {}
        districts = await db[Collections.DISTRICT].find(
            {"_id": {"$in": list(district_ids)}},
            {"_id": 1, "name": 1, "cctnsDistrictCd": 1, "stateName": 1}
        ).to_list(length=None)
        return {d["_id"]: d for d in districts}

    async def fetch_responsible_users():
        if not responsible_user_ids:
            return {}
        users = await db[Collections.PERSONNEL_MASTER].find(
            {"_id": {"$in": list(responsible_user_ids)}},
            {"_id": 1, "name": 1}
        ).to_list(length=None)
        return {u["_id"]: u for u in users}

    # Run all 5 queries in parallel
    dept_map, parent_map, unit_type_map, district_map, responsible_user_map = await asyncio.gather(
        fetch_departments(),
        fetch_parents(),
        fetch_unit_types(),
        fetch_districts(),
        fetch_responsible_users()
    )

    # Populate each unit with O(1) lookups from maps
    for unit in units_list:
        # Populate department
        dept_id = unit.get("departmentId")
        if dept_id:
            dept_obj_id = dept_id if isinstance(dept_id, ObjectId) else ObjectId(dept_id)
            if dept_obj_id in dept_map:
                dept = dept_map[dept_obj_id]
                unit["department"] = {"_id": str(dept["_id"]), "name": dept.get("name")}

        # Populate parent unit
        parent_id = unit.get("parentUnitId")
        if parent_id:
            parent_obj_id = parent_id if isinstance(parent_id, ObjectId) else ObjectId(parent_id)
            if parent_obj_id in parent_map:
                parent = parent_map[parent_obj_id]
                unit["parentUnit"] = {
                    "_id": str(parent["_id"]),
                    "name": parent.get("name"),
                    "policeReferenceId": parent.get("policeReferenceId")
                }

        # Populate unit type
        unit_type_id = unit.get("unitTypeId")
        if unit_type_id:
            ut_obj_id = unit_type_id if isinstance(unit_type_id, ObjectId) else ObjectId(unit_type_id)
            if ut_obj_id in unit_type_map:
                ut = unit_type_map[ut_obj_id]
                unit["unitType"] = {"_id": str(ut["_id"]), "name": ut.get("name")}

        # Populate district
        district_id = unit.get("districtId")
        if district_id:
            dist_obj_id = district_id if isinstance(district_id, ObjectId) else ObjectId(district_id)
            if dist_obj_id in district_map:
                dist = district_map[dist_obj_id]
                unit["district"] = {
                    "_id": str(dist["_id"]),
                    "name": dist.get("name"),
                    "cctnsDistrictCd": dist.get("cctnsDistrictCd"),
                    "stateName": dist.get("stateName")
                }

        # Populate responsible user
        resp_user_id = unit.get("responsibleUserId")
        if resp_user_id:
            resp_obj_id = resp_user_id if isinstance(resp_user_id, ObjectId) else ObjectId(resp_user_id)
            if resp_obj_id in responsible_user_map:
                resp_user = responsible_user_map[resp_obj_id]
                unit["responsibleUser"] = {
                    "_id": str(resp_user["_id"]),
                    "name": resp_user.get("name")
                }

    return [convert_objectid_to_str(doc) for doc in units_list]


def convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    if not document:
        return document

    # Convert _id
    if "_id" in document:
        document["_id"] = str(document["_id"])

    # Convert ObjectId fields
    objectid_fields = ["responsibleUserId", "unitTypeId", "departmentId", "proxyUserId", "createdBy", "updatedBy", "parentUnitId", "districtId", "rankId"]
    for field in objectid_fields:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    datetime_fields = ["createdAt", "updatedAt"]
    for field in datetime_fields:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    # Convert unitPersonnelList ObjectIds
    if "unitPersonnelList" in document and document["unitPersonnelList"]:
        document["unitPersonnelList"] = [str(uid) if isinstance(uid, ObjectId) else uid for uid in document["unitPersonnelList"]]

    # Convert units array (for personnel documents) - each item has unitId, designationId, roleId, etc.
    if "units" in document and document["units"]:
        for unit_item in document["units"]:
            if isinstance(unit_item, dict):
                for oid_field in ["unitId", "roleId", "designationId", "_id"]:
                    if oid_field in unit_item and isinstance(unit_item[oid_field], ObjectId):
                        unit_item[oid_field] = str(unit_item[oid_field])

    # Convert responsibleUserHistory datetime fields if present
    if "responsibleUserHistory" in document and document["responsibleUserHistory"]:
        for history_item in document["responsibleUserHistory"]:
            if isinstance(history_item, dict):
                for dt_field in ["from", "to", "changedAt", "fromDate", "toDate"]:
                    if dt_field in history_item and isinstance(history_item[dt_field], datetime):
                        history_item[dt_field] = history_item[dt_field].isoformat()
                # Convert userId and changedBy ObjectIds
                for oid_field in ["userId", "changedBy"]:
                    if oid_field in history_item and isinstance(history_item[oid_field], ObjectId):
                        history_item[oid_field] = str(history_item[oid_field])

    return document


class UnitService:
    """Service class for Unit operations"""

    @staticmethod
    async def create_unit(
        unit_data: dict,
        current_user_id: str,
        request: Optional[Request] = None
    ) -> dict:
        """
        Create a new unit with automatic parentUnitPath calculation.

        Args:
            unit_data: Unit data dictionary
            current_user_id: ID of the user creating the unit

        Returns:
            dict: Created unit document
        """
        db = get_database()

        # Check if policeReferenceId already exists (case-insensitive)
        if unit_data.get("policeReferenceId"):
            police_ref_id = unit_data["policeReferenceId"].strip()
            existing_unit = await db[COLLECTION_NAME].find_one({
                "policeReferenceId": {"$regex": f"^{re.escape(police_ref_id)}$", "$options": "i"}
            })
            if existing_unit:
                await log_error(
                    request=request,
                    error_code=ErrorCodes.UNIT_CREATE_DUPLICATE_REFERENCE,
                    parameters={"policeReferenceId": police_ref_id},
                    actor_user_id=current_user_id
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_field_error("policeReferenceId_exists")
                )

        # Check if name already exists (case-insensitive, among non-deleted)
        # Returns different error messages based on isActive state
        if unit_data.get("name"):
            await _check_name_uniqueness(db, unit_data["name"])

        # Set createdBy
        unit_data["createdBy"] = current_user_id

        # Validate foreign key constraints (is_create=True for required field validation)
        await validate_unit_foreign_keys(db, unit_data, is_create=True)

        # Calculate parentUnitPath if parentUnitId is provided
        if unit_data.get("parentUnitId"):
            parent_unit_path = await calculate_parent_unit_path(db, unit_data["parentUnitId"])
            unit_data["parentUnitPath"] = parent_unit_path
        else:
            unit_data["parentUnitPath"] = None

        # Set audit fields
        unit_data["createdAt"] = get_ist_now()
        unit_data["isActive"] = True
        unit_data["isDelete"] = False

        # Convert string IDs to ObjectId
        for field in ["responsibleUserId", "unitTypeId", "departmentId", "proxyUserId", "createdBy", "parentUnitId", "districtId"]:
            if unit_data.get(field):
                try:
                    unit_data[field] = ObjectId(unit_data[field])
                except:
                    pass

        # Convert unitPersonnelList to ObjectIds
        if unit_data.get("unitPersonnelList"):
            unit_data["unitPersonnelList"] = [
                ObjectId(uid) if ObjectId.is_valid(uid) else uid
                for uid in unit_data["unitPersonnelList"]
            ]

        # Insert into database
        result = await db[COLLECTION_NAME].insert_one(unit_data)
        created_unit = await db[COLLECTION_NAME].find_one({"_id": result.inserted_id})

        # Sync responsible user: add unit to personnel's units array and personnel to unit's unitPersonnelList
        if unit_data.get("responsibleUserId"):
            responsible_user_id = unit_data["responsibleUserId"]
            if isinstance(responsible_user_id, ObjectId):
                await handle_responsible_user_change(
                    db=db,
                    unit_id=result.inserted_id,
                    old_responsible_user_id=None,  # No previous responsible user for new unit
                    new_responsible_user_id=responsible_user_id,
                    designation_id=None  # No designation for responsible user assignment during create
                )

        return convert_objectid_to_str(created_unit)

    @staticmethod
    async def get_units(
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        search: Optional[str] = None,
        department_id: Optional[str] = None,
        parent_unit_id: Optional[str] = None,
        district_id: Optional[str] = None,
        include_deleted: bool = False,
        accessible_unit_ids: Optional[List[ObjectId]] = None
    ) -> dict:
        """
        Get all units with optional pagination, filters, and hierarchy-based access control.

        Args:
            page: Page number (1-based). If None, returns all records.
            page_size: Number of items per page. Ignored if page is None.
            search: Search term for name, policeReferenceId, or city.
            department_id: Filter by department ObjectId string.
            parent_unit_id: Filter by parent unit ObjectId string.
            district_id: Filter by district ObjectId string.
            include_deleted: Whether to include soft-deleted records.
            accessible_unit_ids: List of unit ObjectIds the user can access (for hierarchy filtering).
                                 If provided, only units in this list are returned.
                                 If None, no hierarchy filtering is applied.

        Returns:
            dict: Paginated response with keys:
                - data: List of unit documents with populated relations
                - total: Total count of matching records
                - page: Current page number
                - page_size: Items per page
                - total_pages: Total number of pages
        """
        db = get_database()

        # Build query
        query: Dict[str, Any] = {}

        # Apply hierarchy-based access control filter
        if accessible_unit_ids is not None:
            if not accessible_unit_ids:
                # No accessible units - return empty result
                return {
                    "data": [],
                    "total": 0,
                    "page": page or 1,
                    "page_size": page_size or 0,
                    "total_pages": 0
                }
            query["_id"] = {"$in": accessible_unit_ids}

        # Filter by delete status
        if not include_deleted:
            query["isDelete"] = False

        # Search across multiple fields
        if search:
            search_conditions = [
                {"name": {"$regex": search, "$options": "i"}},
                {"policeReferenceId": {"$regex": search, "$options": "i"}},
                {"city": {"$regex": search, "$options": "i"}}
            ]
            # If we already have an $in filter, we need to use $and
            if "_id" in query:
                query = {"$and": [{"_id": query["_id"]}, {"$or": search_conditions}]}
                if not include_deleted:
                    query["$and"].append({"isDelete": False})
            else:
                query["$or"] = search_conditions

        # Apply filters
        if department_id:
            try:
                query["departmentId"] = ObjectId(department_id)
            except:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("invalid_objectid", field_name="departmentId")
                )

        if parent_unit_id:
            try:
                query["parentUnitId"] = ObjectId(parent_unit_id)
            except:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("invalid_objectid", field_name="parentUnitId")
                )

        if district_id:
            try:
                query["districtId"] = ObjectId(district_id)
            except:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("invalid_objectid", field_name="districtId")
                )

        # Get total count
        total = await db[COLLECTION_NAME].count_documents(query)

        # Check if pagination is requested
        if page is not None and page_size is not None:
            skip = (page - 1) * page_size
            total_pages = (total + page_size - 1) // page_size

            # Use optimized aggregation pipeline with population
            result_list = await get_units_with_populated_data(
                db, query, skip=skip, limit=page_size
            )

            return {
                "data": result_list,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages
            }
        else:
            # Use optimized aggregation pipeline with population
            result_list = await get_units_with_populated_data(db, query)

            return {
                "data": result_list,
                "total": total,
                "page": 1,
                "page_size": total,
                "total_pages": 1
            }

    @staticmethod
    async def get_unit_by_id(unit_id: str) -> dict:
        """
        Get a unit by ID (includes soft-deleted records).
        Uses aggregation pipeline for low latency population.

        Also includes personnel information:
        - responsibleUser: The person responsible for this unit (from responsibleUserId)
        - otherPersonnel: Other personnel assigned to this unit
        - totalPersonnelCount: Total count of personnel in this unit

        Args:
            unit_id: Unit ID string

        Returns:
            dict: Unit document with populated relations and personnel info
        """
        db = get_database()

        try:
            object_id = ObjectId(unit_id)
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="unit_id")
            )

        # Use optimized aggregation pipeline
        unit = await get_unit_with_populated_data(db, unit_id)

        if not unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_field_error("unit_not_found")
            )

        return unit

    @staticmethod
    async def update_unit(
        unit_id: str,
        update_data: dict,
        current_user_id: str,
        request: Optional[Request] = None
    ) -> dict:
        """
        Update a unit with automatic parentUnitPath recalculation.
        Also updates all descendant units' paths if necessary.

        Args:
            unit_id: Unit ID string
            update_data: Dictionary of fields to update
            current_user_id: ID of the user performing the update
            request: FastAPI Request object for error logging

        Returns:
            dict: Updated unit document
        """
        db = get_database()

        try:
            object_id = ObjectId(unit_id)
        except:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_UPDATE_FAILED,
                parameters={"unit_id": unit_id, "reason": "Invalid ObjectId format"},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="unit_id")
            )

        # Check if unit exists
        existing_unit = await db[COLLECTION_NAME].find_one({"_id": object_id, "isDelete": False})
        if not existing_unit:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_UPDATE_NOT_FOUND,
                parameters={"unit_id": unit_id},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_field_error("unit_not_found")
            )

        # Extract special field for responsible user change (not stored in unit, used for personnel sync)
        responsible_user_designation_id = update_data.pop("responsibleUserDesignationId", None)

        if not update_data:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_UPDATE_FAILED,
                parameters={"unit_id": unit_id, "reason": "No fields to update"},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_business_error("no_fields_to_update")
            )

        # Validate required fields cannot be set to null or empty
        # districtId is required - cannot be removed once set
        # responsibleUserId is optional - can be null
        required_fields = ["districtId"]
        for field in required_fields:
            if field in update_data:
                value = update_data[field]
                # Check if explicitly set to None or empty string
                if value is None or (isinstance(value, str) and not value.strip()):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=get_validation_error("field_required", field_name=field)
                    )

        # Check policeReferenceId uniqueness if being updated (case-insensitive)
        if "policeReferenceId" in update_data and update_data["policeReferenceId"]:
            police_ref_id = update_data["policeReferenceId"].strip()
            existing_ref = await db[COLLECTION_NAME].find_one({
                "policeReferenceId": {"$regex": f"^{re.escape(police_ref_id)}$", "$options": "i"},
                "_id": {"$ne": object_id}
            })
            if existing_ref:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_field_error("policeReferenceId_exists")
                )

        # Check name uniqueness if being updated (case-insensitive, among non-deleted)
        # Returns different error messages based on isActive state
        if "name" in update_data and update_data["name"]:
            await _check_name_uniqueness(db, update_data["name"], exclude_id=object_id)

        # Validate foreign keys if they are being updated
        if any(key in update_data for key in ["departmentId", "unitTypeId", "responsibleUserId", "proxyUserId", "parentUnitId", "districtId"]):
            temp_dict = {**existing_unit, **update_data}
            for field in ["departmentId", "unitTypeId", "responsibleUserId", "proxyUserId", "parentUnitId", "districtId"]:
                if field in temp_dict and isinstance(temp_dict[field], ObjectId):
                    temp_dict[field] = str(temp_dict[field])
            await validate_unit_foreign_keys(db, temp_dict, is_create=False)

        # Check for circular hierarchy if parentUnitId is being changed
        if "parentUnitId" in update_data and update_data["parentUnitId"]:
            is_circular = await check_circular_hierarchy(db, unit_id, update_data["parentUnitId"])
            if is_circular:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_business_error("circular_hierarchy")
                )

        # Store old values for descendant path updates
        old_name = existing_unit.get("name", "")
        old_path = existing_unit.get("parentUnitPath")

        # Recalculate parentUnitPath if parentUnitId or name is changed
        parent_changed = "parentUnitId" in update_data
        name_changed = "name" in update_data

        new_path = old_path  # Default to existing path

        if parent_changed or name_changed:
            new_name = update_data.get("name", existing_unit.get("name"))

            new_parent_id = update_data.get("parentUnitId")
            if new_parent_id is None and "parentUnitId" not in update_data:
                existing_parent_id = existing_unit.get("parentUnitId")
                if existing_parent_id:
                    new_parent_id = str(existing_parent_id) if isinstance(existing_parent_id, ObjectId) else existing_parent_id

            # Calculate new parent path
            if new_parent_id:
                new_path = await calculate_parent_unit_path(db, new_parent_id)
                update_data["parentUnitPath"] = new_path
            else:
                new_path = None
                update_data["parentUnitPath"] = None

        # Set updatedBy and updatedAt
        update_data["updatedBy"] = current_user_id
        update_data["updatedAt"] = get_ist_now()

        # Check if responsibleUserId is being changed (including setting to null)
        responsible_user_changed = False
        responsible_user_removed = False  # Track if responsibleUserId is being set to null
        old_responsible_user_id = existing_unit.get("responsibleUserId")

        # Check if responsibleUserId is in the update payload
        if "responsibleUserId" in update_data:
            new_responsible_user_id_str = update_data.get("responsibleUserId")

            if new_responsible_user_id_str:
                # New value is being set - check if it's different from old
                try:
                    new_resp_obj_id = ObjectId(new_responsible_user_id_str)
                    old_resp_obj_id = old_responsible_user_id if isinstance(old_responsible_user_id, ObjectId) else (ObjectId(old_responsible_user_id) if old_responsible_user_id else None)

                    if old_resp_obj_id != new_resp_obj_id:
                        responsible_user_changed = True
                except:
                    pass
            elif old_responsible_user_id:
                # responsibleUserId is being set to null and there was an old value
                responsible_user_removed = True

        # Convert string IDs to ObjectId
        for field in ["responsibleUserId", "unitTypeId", "departmentId", "proxyUserId", "updatedBy", "parentUnitId", "districtId"]:
            if field in update_data and update_data[field]:
                try:
                    update_data[field] = ObjectId(update_data[field])
                except:
                    pass

        # Convert unitPersonnelList to ObjectIds
        if "unitPersonnelList" in update_data and update_data["unitPersonnelList"]:
            update_data["unitPersonnelList"] = [
                ObjectId(uid) if ObjectId.is_valid(uid) else uid
                for uid in update_data["unitPersonnelList"]
            ]

        # Convert responsibleUserHistory ObjectId fields
        if "responsibleUserHistory" in update_data and update_data["responsibleUserHistory"]:
            for history_entry in update_data["responsibleUserHistory"]:
                if isinstance(history_entry, dict):
                    # Convert userId to ObjectId
                    if "userId" in history_entry and history_entry["userId"]:
                        try:
                            history_entry["userId"] = ObjectId(history_entry["userId"]) if isinstance(history_entry["userId"], str) else history_entry["userId"]
                        except:
                            pass
                    # Convert changedBy to ObjectId
                    if "changedBy" in history_entry and history_entry["changedBy"]:
                        try:
                            history_entry["changedBy"] = ObjectId(history_entry["changedBy"]) if isinstance(history_entry["changedBy"], str) else history_entry["changedBy"]
                        except:
                            pass

        # Handle responsible user change - sync personnel units arrays
        # Note: History entry (responsibleUserHistory) is passed from frontend via update_data
        # and will be stored as part of the normal update operation below
        if responsible_user_changed:
            old_resp_user_obj_id = old_responsible_user_id if isinstance(old_responsible_user_id, ObjectId) else (ObjectId(old_responsible_user_id) if old_responsible_user_id else None)
            new_resp_user_obj_id = update_data.get("responsibleUserId")

            await handle_responsible_user_change(
                db=db,
                unit_id=object_id,
                old_responsible_user_id=old_resp_user_obj_id,
                new_responsible_user_id=new_resp_user_obj_id,
                designation_id=responsible_user_designation_id
            )

        # Handle responsible user removal (set to null) - remove unit from old personnel's units array
        if responsible_user_removed:
            old_resp_user_obj_id = old_responsible_user_id if isinstance(old_responsible_user_id, ObjectId) else ObjectId(old_responsible_user_id)

            # Remove unit from old responsible user's units array
            await db[Collections.PERSONNEL_MASTER].update_one(
                {"_id": old_resp_user_obj_id},
                {"$pull": {"units": {"unitId": object_id}}}
            )

            # Remove old responsible user from unit's unitPersonnelList
            await db[COLLECTION_NAME].update_one(
                {"_id": object_id},
                {"$pull": {"unitPersonnelList": old_resp_user_obj_id}}
            )

        # Update the unit itself
        await db[COLLECTION_NAME].update_one({"_id": object_id}, {"$set": update_data})

        # Update descendant paths if name or parent changed
        if parent_changed or name_changed:
            new_name = update_data.get("name", old_name)
            await update_descendant_paths(db, unit_id, old_name, new_name, old_path, new_path)

        updated_unit = await db[COLLECTION_NAME].find_one({"_id": object_id})
        return convert_objectid_to_str(updated_unit)

    @staticmethod
    async def delete_unit(
        unit_id: str,
        current_user_id: str,
        deleted_ip: Optional[str] = None,
        request: Optional[Request] = None
    ) -> dict:
        """
        Soft delete a unit.

        Args:
            unit_id: Unit ID string
            current_user_id: ID of the user performing the deletion
            deleted_ip: IP address of the request
            request: FastAPI Request object for error logging

        Returns:
            dict: Success message
        """
        db = get_database()

        try:
            object_id = ObjectId(unit_id)
        except:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_DELETE_FAILED,
                parameters={"unit_id": unit_id, "reason": "Invalid ObjectId format"},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="unit_id")
            )

        existing_unit = await db[COLLECTION_NAME].find_one({"_id": object_id, "isDelete": False})
        if not existing_unit:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_DELETE_NOT_FOUND,
                parameters={"unit_id": unit_id},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_field_error("unit_not_found")
            )

        # Check if this unit is a parent of any other units
        child_by_id = await db[COLLECTION_NAME].find_one({"parentUnitId": object_id, "isDelete": False})
        if child_by_id:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_DELETE_HAS_CHILDREN,
                parameters={"unit_id": unit_id},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_business_error("unit_has_children_id")
            )

        # Check if this unit's name appears in any parentUnitPath
        unit_name = existing_unit.get("name", "")
        if unit_name:
            child_by_path = await db[COLLECTION_NAME].find_one({
                "parentUnitPath": {"$regex": f"\\\\{unit_name}(\\\\|$)"},
                "isDelete": False
            })
            if child_by_path:
                await log_error(
                    request=request,
                    error_code=ErrorCodes.UNIT_DELETE_HAS_CHILDREN,
                    parameters={"unit_id": unit_id, "reason": "Unit has children by path"},
                    actor_user_id=current_user_id
                )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_business_error("unit_has_children_path")
                )

        # Check if any personnel are assigned to this unit (low latency - just check existence)
        personnel_exists = await db[Collections.PERSONNEL_MASTER].find_one(
            {"units.unitId": object_id, "isDelete": False},
            {"_id": 1}  # Only fetch _id for performance
        )
        if personnel_exists:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_DELETE_HAS_PERSONNEL,
                parameters={"unit_id": unit_id},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_business_error("unit_has_personnel")
            )

        # Check if any villages are mapped to this unit (low latency - just check existence)
        village_exists = await db[Collections.UNIT_VILLAGES].find_one(
            {"unitId": object_id, "isDelete": False},
            {"_id": 1}  # Only fetch _id for performance
        )
        if village_exists:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_DELETE_HAS_VILLAGES,
                parameters={"unit_id": unit_id},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_business_error("unit_has_villages")
            )

        # Soft delete - sets isDelete=True
        update_data = {
            "isDelete": True,
            "updatedBy": ObjectId(current_user_id) if current_user_id else None,
            "updatedAt": get_ist_now()
        }

        if deleted_ip:
            update_data["updatedIp"] = deleted_ip

        await db[COLLECTION_NAME].update_one(
            {"_id": object_id},
            {"$set": update_data}
        )

        return {"message": "Unit deleted successfully"}

    @staticmethod
    async def get_units_minimal(
        search: Optional[str] = None,
        department_id: Optional[str] = None,
        parent_unit_id: Optional[str] = None,
        district_id: Optional[str] = None,
        include_deleted: bool = False
    ) -> List[Dict[str, str]]:
        """
        Get all units with only _id and name for faster response.

        Returns:
            List[dict]: List of units with only _id and name
        """
        db = get_database()

        # Build query
        query = {}
        if not include_deleted:
            query["isDelete"] = False

        # Search across multiple fields
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"policeReferenceId": {"$regex": search, "$options": "i"}},
                {"city": {"$regex": search, "$options": "i"}}
            ]

        # Apply filters
        if department_id:
            try:
                query["departmentId"] = ObjectId(department_id)
            except:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("invalid_objectid", field_name="departmentId")
                )

        if parent_unit_id:
            try:
                query["parentUnitId"] = ObjectId(parent_unit_id)
            except:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("invalid_objectid", field_name="parentUnitId")
                )

        if district_id:
            try:
                query["districtId"] = ObjectId(district_id)
            except:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=get_validation_error("invalid_objectid", field_name="districtId")
                )

        # Fetch only _id and name using projection
        cursor = db[COLLECTION_NAME].find(query, {"_id": 1, "name": 1}).sort("name", 1)
        units_list = await cursor.to_list(length=None)

        # Convert ObjectId to string
        return [{"_id": str(u["_id"]), "name": u.get("name", "")} for u in units_list]

    @staticmethod
    async def restore_unit(
        unit_id: str,
        current_user_id: str,
        restored_ip: Optional[str] = None,
        request: Optional[Request] = None
    ) -> dict:
        """
        Restore a soft-deleted unit (set isDelete=False only - isActive should be managed separately).

        Args:
            unit_id: Unit ID string
            current_user_id: ID of the user performing the restoration
            restored_ip: IP address of the request
            request: FastAPI Request object for error logging

        Returns:
            dict: Restored unit document

        Raises:
            HTTPException: If validation fails, not found, or not deleted
        """
        db = get_database()

        try:
            object_id = ObjectId(unit_id)
        except:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_RESTORE_FAILED,
                parameters={"unit_id": unit_id, "reason": "Invalid ObjectId format"},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="unit_id")
            )

        existing_unit = await db[COLLECTION_NAME].find_one({"_id": object_id})
        if not existing_unit:
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_RESTORE_NOT_FOUND,
                parameters={"unit_id": unit_id},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_field_error("unit_not_found")
            )

        # Check if not deleted - cannot restore non-deleted record
        if not existing_unit.get("isDelete", False):
            await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_RESTORE_ALREADY_ACTIVE,
                parameters={"unit_id": unit_id},
                actor_user_id=current_user_id
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_business_error("unit_already_active")
            )

        # Prepare update data - restore by setting isDelete=False only
        update_data = {
            "isDelete": False,
            "updatedBy": ObjectId(current_user_id) if current_user_id else None,
            "updatedAt": get_ist_now()
        }

        if restored_ip:
            update_data["updatedIp"] = restored_ip

        await db[COLLECTION_NAME].update_one(
            {"_id": object_id},
            {"$set": update_data}
        )

        restored_unit = await db[COLLECTION_NAME].find_one({"_id": object_id})
        return convert_objectid_to_str(restored_unit)

    @staticmethod
    async def get_unit_hierarchy(unit_id: str) -> dict:
        """
        Get complete unit hierarchy including ancestors and descendants with relative levels.

        OPTIMIZED VERSION: Uses batch queries instead of N+1 pattern.
        Reduces ~80 database queries to 4 queries.

        This method:
        1. Fetches ALL units in one query
        2. Builds hierarchy in-memory using parent-child relationships
        3. Batch fetches personnel and rank data

        Relative level calculation:
        - Current unit = 0 (reference point)
        - Parents/Ancestors = negative numbers (-1, -2, -3...)
        - Children/Descendants = positive numbers (+1, +2, +3...)

        Args:
            unit_id: Unit ID string

        Returns:
            dict: Response with success, message, and data (list of hierarchy items)
        """
        db = get_database()

        try:
            object_id = ObjectId(unit_id)
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="unit_id")
            )

        # OPTIMIZATION: Fetch ALL non-deleted units in ONE query
        # This replaces multiple recursive queries with a single query
        all_units = await db[COLLECTION_NAME].find({"isDelete": False}).to_list(length=None)

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

        # Check if the requested unit exists
        if object_id not in units_by_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_field_error("unit_not_found")
            )

        unit = units_by_id[object_id]

        # Build ancestors list by traversing up (in-memory, no DB calls)
        ancestors_with_level = []
        parent_id = unit.get("parentUnitId")
        relative_level = -1
        while parent_id and parent_id in units_by_id:
            parent_unit = units_by_id[parent_id]
            ancestors_with_level.append((parent_unit, relative_level))
            parent_id = parent_unit.get("parentUnitId")
            relative_level -= 1

        # Reverse to get top-to-bottom order
        ancestors_with_level.reverse()

        # Build descendants list (in-memory, no DB calls)
        def get_descendants_with_level(parent_unit_id: ObjectId, current_level: int) -> List[tuple]:
            descendants = []
            children = children_by_parent.get(parent_unit_id, [])
            for child in children:
                descendants.append((child, current_level))
                descendants.extend(get_descendants_with_level(child["_id"], current_level + 1))
            return descendants

        descendants_with_level = get_descendants_with_level(object_id, 1)

        # Combine hierarchy
        hierarchy_with_levels = ancestors_with_level + [(unit, 0)] + descendants_with_level

        # OPTIMIZATION: Collect all responsibleUserIds for batch query
        responsible_user_ids = set()
        for unit_doc, _ in hierarchy_with_levels:
            resp_id = unit_doc.get("responsibleUserId")
            if resp_id:
                responsible_user_ids.add(resp_id if isinstance(resp_id, ObjectId) else ObjectId(resp_id))

        # OPTIMIZATION: Batch fetch all personnel in ONE query
        personnel_map = {}
        rank_ids = set()
        if responsible_user_ids:
            personnel_list = await db[Collections.PERSONNEL_MASTER].find(
                {"_id": {"$in": list(responsible_user_ids)}}
            ).to_list(length=None)
            for p in personnel_list:
                personnel_map[p["_id"]] = p
                if p.get("rankId"):
                    rank_ids.add(p["rankId"] if isinstance(p["rankId"], ObjectId) else ObjectId(p["rankId"]))

        # OPTIMIZATION: Batch fetch all ranks in ONE query
        rank_map = {}
        if rank_ids:
            rank_list = await db[Collections.RANK_MASTER].find(
                {"_id": {"$in": list(rank_ids)}}
            ).to_list(length=None)
            for r in rank_list:
                rank_map[r["_id"]] = r

        # Build response using pre-fetched data (no more DB calls)
        result = []
        for unit_doc, rel_level in hierarchy_with_levels:
            unit_id_str = str(unit_doc["_id"])
            unit_name = unit_doc.get("name", "")
            parent_unit_id = unit_doc.get("parentUnitId")
            parent_unit_id_str = str(parent_unit_id) if parent_unit_id else None
            responsible_user_id = unit_doc.get("responsibleUserId")
            responsible_user_id_str = str(responsible_user_id) if responsible_user_id else None

            # Determine relation type
            if rel_level < 0:
                relation_type = "ancestor"
            elif rel_level == 0:
                relation_type = "self"
            else:
                relation_type = "descendant"

            rank_id = None
            rank_short_code = None

            # Get rank info from pre-fetched maps (O(1) lookup)
            if responsible_user_id:
                resp_user_object_id = responsible_user_id if isinstance(responsible_user_id, ObjectId) else ObjectId(responsible_user_id)
                personnel = personnel_map.get(resp_user_object_id)

                if personnel and personnel.get("rankId"):
                    rank_id_value = personnel.get("rankId")
                    rank_id = str(rank_id_value) if rank_id_value else None

                    if rank_id_value:
                        rank_object_id = rank_id_value if isinstance(rank_id_value, ObjectId) else ObjectId(rank_id_value)
                        rank = rank_map.get(rank_object_id)
                        if rank:
                            rank_short_code = rank.get("shortCode")

            result.append({
                "unitId": unit_id_str,
                "unitName": unit_name,
                "parentUnitId": parent_unit_id_str,
                "responsibleUserId": responsible_user_id_str,
                "rankId": rank_id,
                "rankShortCode": rank_short_code,
                "relativeLevel": rel_level,
                "relationType": relation_type
            })

        return {
            "success": True,
            "message": "Unit hierarchy retrieved successfully",
            "data": result
        }

    @staticmethod
    async def get_personnel_by_unit_and_rank(
        unit_id: str,
        rank_id: str,
        page: Optional[int] = None,
        page_size: Optional[int] = None
    ) -> dict:
        """
        Get all personnel working in a specific unit with a specific rank.

        MongoDB automatically handles array queries with dot notation.
        Query {"units.unitId": ObjectId} will match if ANY element in the
        units array has that unitId - no manual looping required.

        Args:
            unit_id: Unit ID string
            rank_id: Rank ID string
            page: Page number (optional)
            page_size: Items per page (optional)

        Returns:
            dict: Paginated response with data, total, page, page_size, total_pages
        """
        db = get_database()

        # Validate unit_id
        try:
            unit_object_id = ObjectId(unit_id)
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="unitId")
            )

        # Validate rank_id
        try:
            rank_object_id = ObjectId(rank_id)
        except:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("invalid_objectid", field_name="rankId")
            )

        # Verify unit exists
        unit = await db[COLLECTION_NAME].find_one({"_id": unit_object_id, "isDelete": False})
        if not unit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=get_field_error("unit_not_found")
            )

        # Verify rank exists
        rank = await db[Collections.RANK_MASTER].find_one({"_id": rank_object_id})
        if not rank:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rank not found"
            )

        # Build query - MongoDB automatically matches array elements with dot notation
        # Check both isDelete and isActive flags
        query = {
            "units.unitId": unit_object_id,
            "rankId": rank_object_id,
            "isDelete": False,
            "isActive": True
        }

        # Get total count
        total = await db[Collections.PERSONNEL_MASTER].count_documents(query)

        # Projection to exclude sensitive/heavy fields
        projection = {
            "password": 0,
            "createdIp": 0,
            "updatedIp": 0
        }

        # Check if pagination is requested
        if page is not None and page_size is not None:
            skip = (page - 1) * page_size
            total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0

            cursor = db[Collections.PERSONNEL_MASTER].find(query, projection).skip(skip).limit(page_size).sort("name", 1)
            personnel_list = await cursor.to_list(length=page_size)
        else:
            cursor = db[Collections.PERSONNEL_MASTER].find(query, projection).sort("name", 1)
            personnel_list = await cursor.to_list(length=None)

        # Convert ObjectIds to strings
        result_list = []
        for p in personnel_list:
            if "_id" in p:
                p["_id"] = str(p["_id"])
            for field in ["departmentId", "rankId", "createdBy", "updatedBy"]:
                if field in p and isinstance(p[field], ObjectId):
                    p[field] = str(p[field])
            # Convert units array ObjectIds
            if "units" in p and p["units"]:
                for unit_item in p["units"]:
                    if "unitId" in unit_item and isinstance(unit_item["unitId"], ObjectId):
                        unit_item["unitId"] = str(unit_item["unitId"])
                    if "designationId" in unit_item and isinstance(unit_item["designationId"], ObjectId):
                        unit_item["designationId"] = str(unit_item["designationId"])
            result_list.append(p)

        if page is not None:
            return {
                "data": result_list,
                "total": total,
                "page": page,
                "page_size": actual_page_size,
                "total_pages": total_pages
            }
        else:
            return {
                "data": result_list,
                "total": total,
                "page": 1,
                "page_size": total,
                "total_pages": 1
            }

    @staticmethod
    async def bulk_upload_units(
        file_id: str,
        mode: str,
        current_user_id: str,
        request: Request,
        created_ip: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Bulk upload units from an Excel file.

        OPTIMIZED VERSION:
        - Pre-fetches ALL existing units by policeReferenceId in ONE query
        - Pre-fetches ALL unit names for uniqueness check in ONE query
        - Uses bulk insert for new units (insert_many)
        - Uses bulk update for existing units (bulk_write)
        - Batches responsible user sync operations
        - Maps Excel column names to internal field names

        Excel Column Mapping:
        - CCTNSUNITID -> policeReferenceId
        - NAME -> name
        - EMAIL -> email
        - DISTRICT -> districtName
        - RESPONSIBLE UNIT HEAD CMFS ID -> responsibleUserId
        - ADDRESS1 -> address1
        - ADDRESS2 -> address2
        - CITY -> city
        - ZIP CODE -> zip
        - PHONE NUMBER(COMMA SEPARATED) -> phone
        - responsiblePersonTitle -> responsiblePersonTitle
        - ISVIRTUAL -> isVirtual
        - UNITTYPE NAME -> unitTypeName
        - DEPARTMENT NAME -> departmentName
        - SECOND RESPONSIBLE PERSON CMFS ID -> proxyUserId
        - PARENT UNIT CCTNS ID -> parentUnitPoliceReferenceId

        Args:
            file_id: File ID from FileUpload service
            mode: 'overwrite' (update existing + insert new) or 'skip' (skip existing)
            current_user_id: ID of the user performing the upload
            request: FastAPI Request object
            created_ip: IP address of the request

        Returns:
            dict: Response with totalProcessed, created, updated, skipped, failed counts and details
        """
        from pymongo import UpdateOne

        db = get_database()

        # Initialize response
        response = {
            "totalProcessed": 0,
            "created": 0,
            "updated": 0,
            "skipped": 0,
            "failed": 0,
            "successful": [],
            "skippedItems": [],
            "failedItems": []
        }

        # Download file from FileUpload service
        file_bytes = await FileUploadService.download_file_from_request(file_id, request)
        if not file_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to download file from FileUpload service. Please check the fileId."
            )

        # Parse Excel file using pandas
        try:
            df = pd.read_excel(io.BytesIO(file_bytes), engine='openpyxl')
        except Exception as e:
            logger.error(f"Failed to parse Excel file: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to parse Excel file: {str(e)}"
            )

        # Excel column name mapping (Excel Column -> Internal Field)
        # Case-insensitive matching
        COLUMN_MAPPING = {
            "cctnsunitid": "policeReferenceId",
            "name": "name",
            "email": "email",
            "district": "districtName",
            "responsible unit head cmfs id": "responsibleUserId",
            "address1": "address1",
            "address2": "address2",
            "city": "city",
            "zip code": "zip",
            "phone number(comma separated)": "phone",
            "responsiblepersontitle": "responsiblePersonTitle",
            "isvirtual": "isVirtual",
            "unittype name": "unitTypeName",
            "department name": "departmentName",
            "second responsible person cmfs id": "proxyUserId",
            "parent unit cctns id": "parentUnitPoliceReferenceId",
        }

        # Create a case-insensitive column name lookup
        excel_columns_lower = {col.strip().lower(): col for col in df.columns}

        # Rename columns based on mapping
        rename_map = {}
        for excel_col_lower, internal_field in COLUMN_MAPPING.items():
            if excel_col_lower in excel_columns_lower:
                original_col = excel_columns_lower[excel_col_lower]
                rename_map[original_col] = internal_field

        df = df.rename(columns=rename_map)

        # Validate required columns (using internal field names after mapping)
        # responsibleUserId is now optional
        required_columns = ['policeReferenceId', 'name', 'email', 'districtName']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            # Show user-friendly column names in error
            friendly_names = {
                'policeReferenceId': 'CCTNSUNITID',
                'name': 'NAME',
                'email': 'EMAIL',
                'districtName': 'DISTRICT'
            }
            missing_friendly = [friendly_names.get(col, col) for col in missing_columns]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required columns in Excel: {', '.join(missing_friendly)}"
            )

        # Replace NaN with None for easier handling
        df = df.where(pd.notnull(df), None)

        response["totalProcessed"] = len(df)

        if len(df) == 0:
            return response

        # =====================================================================
        # PHASE 1: Pre-fetch ALL lookup data in parallel (single batch)
        # =====================================================================
        lookup_cache = await _build_lookup_cache(db)

        # Pre-fetch ALL existing units by policeReferenceId in ONE query
        all_police_ref_ids = []
        for _, row in df.iterrows():
            ref_id = row.get('policeReferenceId')
            if ref_id and not pd.isna(ref_id):
                all_police_ref_ids.append(str(ref_id).strip())

        # Build regex pattern for all policeReferenceIds
        existing_units_map = {}
        if all_police_ref_ids:
            existing_units_cursor = db[COLLECTION_NAME].find({
                "policeReferenceId": {"$in": all_police_ref_ids}
            })
            existing_units_list = await existing_units_cursor.to_list(length=None)
            for unit in existing_units_list:
                ref_id = unit.get("policeReferenceId", "").strip().lower()
                existing_units_map[ref_id] = unit

        # Pre-fetch ALL existing unit names for uniqueness check
        existing_names_set = set()
        names_cursor = db[COLLECTION_NAME].find(
            {"isDelete": False},
            {"name": 1}
        )
        names_list = await names_cursor.to_list(length=None)
        for u in names_list:
            if u.get("name"):
                existing_names_set.add(u["name"].strip().lower())

        # =====================================================================
        # PHASE 2: Validate and categorize all rows
        # =====================================================================
        rows_to_insert = []  # List of (row_number, row_data, resolved_data)
        rows_to_update = []  # List of (row_number, row_data, resolved_data, existing_unit)

        for index, row in df.iterrows():
            row_number = index + 2  # Excel row number (1-indexed, +1 for header)

            try:
                # Extract and validate row data
                row_data = _extract_row_data(row)

                # Validate required fields
                validation_error = _validate_required_fields(row_data, row_number)
                if validation_error:
                    response["failed"] += 1
                    response["failedItems"].append(validation_error)
                    continue

                # Resolve foreign keys by name (uses pre-fetched cache - O(1) lookups)
                resolved_data, fk_error = await _resolve_foreign_keys(
                    db, row_data, lookup_cache, row_number
                )
                if fk_error:
                    response["failed"] += 1
                    response["failedItems"].append(fk_error)
                    continue

                # Check if unit already exists by policeReferenceId (from pre-fetched map)
                police_ref_id = row_data['policeReferenceId'].strip()
                police_ref_key = police_ref_id.lower()
                existing_unit = existing_units_map.get(police_ref_key)

                if existing_unit:
                    if mode == "skip":
                        # Skip existing units in skip mode
                        response["skipped"] += 1
                        response["skippedItems"].append({
                            "rowNumber": row_number,
                            "policeReferenceId": police_ref_id,
                            "name": row_data.get('name', ''),
                            "existingId": str(existing_unit["_id"]),
                            "reason": "already_exists"
                        })
                        continue
                    else:
                        # Queue for update in overwrite mode
                        rows_to_update.append((row_number, row_data, resolved_data, existing_unit))
                else:
                    # Check name uniqueness for new units
                    unit_name = resolved_data.get('name', '')
                    if unit_name and unit_name.strip().lower() in existing_names_set:
                        response["failed"] += 1
                        response["failedItems"].append({
                            "rowNumber": row_number,
                            "policeReferenceId": police_ref_id,
                            "name": unit_name,
                            "error": f"Unit name '{unit_name}' already exists"
                        })
                        continue

                    # Add to existing names to prevent duplicates within same batch
                    if unit_name:
                        existing_names_set.add(unit_name.strip().lower())

                    # Queue for insert
                    rows_to_insert.append((row_number, row_data, resolved_data))

            except Exception as e:
                logger.exception(f"Error processing row {row_number}: {str(e)}")
                response["failed"] += 1
                response["failedItems"].append({
                    "rowNumber": row_number,
                    "policeReferenceId": row.get('policeReferenceId', '') if hasattr(row, 'get') else str(row.get('policeReferenceId', '')),
                    "name": row.get('name', '') if hasattr(row, 'get') else str(row.get('name', '')),
                    "error": str(e)
                })

        # =====================================================================
        # PHASE 3: Bulk insert new units
        # =====================================================================
        if rows_to_insert:
            documents_to_insert = []
            insert_metadata = []  # Track row info for response

            for row_number, row_data, resolved_data in rows_to_insert:
                try:
                    # Prepare unit document
                    unit_data = {
                        "policeReferenceId": resolved_data.get('policeReferenceId'),
                        "name": resolved_data.get('name'),
                        "email": resolved_data.get('email'),
                        "districtId": ObjectId(resolved_data['districtId']),
                        "responsibleUserId": ObjectId(resolved_data['responsibleUserId']),
                        "createdBy": ObjectId(current_user_id),
                        "createdAt": get_ist_now(),
                        "isActive": True,
                        "isDelete": False
                    }

                    # Add optional fields
                    if resolved_data.get('address1'):
                        unit_data['address1'] = resolved_data['address1']
                    if resolved_data.get('address2'):
                        unit_data['address2'] = resolved_data['address2']
                    if resolved_data.get('city'):
                        unit_data['city'] = resolved_data['city']
                    if resolved_data.get('zip'):
                        unit_data['zip'] = resolved_data['zip']
                    if resolved_data.get('phone'):
                        unit_data['phone'] = resolved_data['phone']
                    if resolved_data.get('responsiblePersonTitle'):
                        unit_data['responsiblePersonTitle'] = resolved_data['responsiblePersonTitle']
                    if resolved_data.get('isVirtual') is not None:
                        unit_data['isVirtual'] = resolved_data['isVirtual']
                    if resolved_data.get('unitTypeId'):
                        unit_data['unitTypeId'] = ObjectId(resolved_data['unitTypeId'])
                    if resolved_data.get('departmentId'):
                        unit_data['departmentId'] = ObjectId(resolved_data['departmentId'])
                    if resolved_data.get('proxyUserId'):
                        unit_data['proxyUserId'] = ObjectId(resolved_data['proxyUserId'])
                    if resolved_data.get('parentUnitId'):
                        unit_data['parentUnitId'] = ObjectId(resolved_data['parentUnitId'])
                        # Calculate parentUnitPath
                        parent_unit_path = await calculate_parent_unit_path(db, resolved_data['parentUnitId'])
                        unit_data['parentUnitPath'] = parent_unit_path

                    if created_ip:
                        unit_data['createdIp'] = created_ip

                    documents_to_insert.append(unit_data)
                    insert_metadata.append({
                        "row_number": row_number,
                        "police_ref_id": row_data['policeReferenceId'].strip(),
                        "name": row_data.get('name', ''),
                        "responsible_user_id": ObjectId(resolved_data['responsibleUserId'])
                    })

                except Exception as e:
                    response["failed"] += 1
                    response["failedItems"].append({
                        "rowNumber": row_number,
                        "policeReferenceId": row_data.get('policeReferenceId', ''),
                        "name": row_data.get('name', ''),
                        "error": str(e)
                    })

            # Bulk insert
            if documents_to_insert:
                try:
                    result = await db[COLLECTION_NAME].insert_many(documents_to_insert, ordered=False)
                    inserted_ids = result.inserted_ids

                    # Track successful inserts and sync responsible users
                    for i, inserted_id in enumerate(inserted_ids):
                        meta = insert_metadata[i]
                        response["created"] += 1
                        response["successful"].append({
                            "rowNumber": meta["row_number"],
                            "policeReferenceId": meta["police_ref_id"],
                            "name": meta["name"],
                            "id": str(inserted_id),
                            "action": "created"
                        })

                        # Sync responsible user (can be batched further if needed)
                        await handle_responsible_user_change(
                            db=db,
                            unit_id=inserted_id,
                            old_responsible_user_id=None,
                            new_responsible_user_id=meta["responsible_user_id"],
                            designation_id=None
                        )

                except Exception as e:
                    logger.exception(f"Bulk insert error: {str(e)}")
                    # Mark all as failed if bulk insert fails
                    for meta in insert_metadata:
                        response["failed"] += 1
                        response["failedItems"].append({
                            "rowNumber": meta["row_number"],
                            "policeReferenceId": meta["police_ref_id"],
                            "name": meta["name"],
                            "error": f"Bulk insert failed: {str(e)}"
                        })

        # =====================================================================
        # PHASE 4: Bulk update existing units
        # =====================================================================
        if rows_to_update:
            update_operations = []
            update_metadata = []

            for row_number, row_data, resolved_data, existing_unit in rows_to_update:
                try:
                    unit_id = existing_unit["_id"]

                    # Check name uniqueness (exclude current unit)
                    new_name = resolved_data.get('name', '')
                    old_name = existing_unit.get('name', '')
                    if new_name and new_name.lower() != old_name.lower():
                        if new_name.strip().lower() in existing_names_set:
                            response["failed"] += 1
                            response["failedItems"].append({
                                "rowNumber": row_number,
                                "policeReferenceId": row_data['policeReferenceId'].strip(),
                                "name": new_name,
                                "error": f"Unit name '{new_name}' already exists"
                            })
                            continue

                    # Build update document
                    update_data = {
                        "name": resolved_data.get('name'),
                        "email": resolved_data.get('email'),
                        "districtId": ObjectId(resolved_data['districtId']),
                        "responsibleUserId": ObjectId(resolved_data['responsibleUserId']),
                        "updatedBy": ObjectId(current_user_id),
                        "updatedAt": get_ist_now(),
                        "address1": resolved_data.get('address1'),
                        "address2": resolved_data.get('address2'),
                        "city": resolved_data.get('city'),
                        "zip": resolved_data.get('zip'),
                        "responsiblePersonTitle": resolved_data.get('responsiblePersonTitle'),
                        "phone": resolved_data.get('phone') if resolved_data.get('phone') else None,
                    }

                    if resolved_data.get('isVirtual') is not None:
                        update_data['isVirtual'] = resolved_data['isVirtual']

                    # Handle optional FK fields
                    update_data['unitTypeId'] = ObjectId(resolved_data['unitTypeId']) if resolved_data.get('unitTypeId') else None
                    update_data['departmentId'] = ObjectId(resolved_data['departmentId']) if resolved_data.get('departmentId') else None
                    update_data['proxyUserId'] = ObjectId(resolved_data['proxyUserId']) if resolved_data.get('proxyUserId') else None

                    if resolved_data.get('parentUnitId'):
                        update_data['parentUnitId'] = ObjectId(resolved_data['parentUnitId'])
                        parent_unit_path = await calculate_parent_unit_path(db, resolved_data['parentUnitId'])
                        update_data['parentUnitPath'] = parent_unit_path
                    else:
                        update_data['parentUnitId'] = None
                        update_data['parentUnitPath'] = None

                    if created_ip:
                        update_data['updatedIp'] = created_ip

                    update_operations.append(
                        UpdateOne({"_id": unit_id}, {"$set": update_data})
                    )
                    update_metadata.append({
                        "row_number": row_number,
                        "police_ref_id": row_data['policeReferenceId'].strip(),
                        "name": row_data.get('name', ''),
                        "unit_id": unit_id,
                        "existing_unit": existing_unit,
                        "resolved_data": resolved_data,
                        "update_data": update_data
                    })

                except Exception as e:
                    response["failed"] += 1
                    response["failedItems"].append({
                        "rowNumber": row_number,
                        "policeReferenceId": row_data.get('policeReferenceId', ''),
                        "name": row_data.get('name', ''),
                        "error": str(e)
                    })

            # Bulk update
            if update_operations:
                try:
                    result = await db[COLLECTION_NAME].bulk_write(update_operations, ordered=False)

                    # Track successful updates and handle side effects
                    for meta in update_metadata:
                        response["updated"] += 1
                        response["successful"].append({
                            "rowNumber": meta["row_number"],
                            "policeReferenceId": meta["police_ref_id"],
                            "name": meta["name"],
                            "id": str(meta["unit_id"]),
                            "action": "updated"
                        })

                        # Handle responsible user change
                        old_responsible_user_id = meta["existing_unit"].get('responsibleUserId')
                        new_responsible_user_id = ObjectId(meta["resolved_data"]['responsibleUserId'])

                        if old_responsible_user_id != new_responsible_user_id:
                            await handle_responsible_user_change(
                                db=db,
                                unit_id=meta["unit_id"],
                                old_responsible_user_id=old_responsible_user_id,
                                new_responsible_user_id=new_responsible_user_id,
                                designation_id=None
                            )

                        # Update descendant paths if name or parent changed
                        old_name = meta["existing_unit"].get('name', '')
                        new_name = meta["resolved_data"].get('name', '')
                        old_path = meta["existing_unit"].get('parentUnitPath')
                        new_path = meta["update_data"].get('parentUnitPath')

                        if old_name != new_name or old_path != new_path:
                            await update_descendant_paths(
                                db, str(meta["unit_id"]), old_name, new_name, old_path, new_path
                            )

                except Exception as e:
                    logger.exception(f"Bulk update error: {str(e)}")
                    for meta in update_metadata:
                        response["failed"] += 1
                        response["failedItems"].append({
                            "rowNumber": meta["row_number"],
                            "policeReferenceId": meta["police_ref_id"],
                            "name": meta["name"],
                            "error": f"Bulk update failed: {str(e)}"
                        })

        return response


# =============================================================================
# Helper Functions for Bulk Upload
# =============================================================================

async def _build_lookup_cache(db) -> Dict[str, Dict]:
    """
    Pre-fetch all lookup data for better performance.
    Returns a cache with districts, unit_types, departments, personnel, and units.
    """
    cache = {
        "districts": {},
        "unit_types": {},
        "departments": {},
        "personnel": {},
        "units": {}
    }

    # Fetch districts (by name, case-insensitive key)
    districts = await db[Collections.DISTRICT].find(
        {"isDelete": False},
        {"_id": 1, "name": 1}
    ).to_list(length=None)
    for d in districts:
        if d.get("name"):
            cache["districts"][d["name"].strip().lower()] = str(d["_id"])

    # Fetch unit types (by name, case-insensitive key)
    unit_types = await db[Collections.UNIT_TYPE].find(
        {"isDelete": False},
        {"_id": 1, "name": 1}
    ).to_list(length=None)
    for ut in unit_types:
        if ut.get("name"):
            cache["unit_types"][ut["name"].strip().lower()] = str(ut["_id"])

    # Fetch departments (by name, case-insensitive key)
    departments = await db[Collections.DEPARTMENT].find(
        {"isDelete": False},
        {"_id": 1, "name": 1}
    ).to_list(length=None)
    for d in departments:
        if d.get("name"):
            cache["departments"][d["name"].strip().lower()] = str(d["_id"])

    # Fetch personnel (by userId, case-insensitive key)
    personnel = await db[Collections.PERSONNEL_MASTER].find(
        {"isDelete": False},
        {"_id": 1, "userId": 1}
    ).to_list(length=None)
    for p in personnel:
        if p.get("userId"):
            cache["personnel"][str(p["userId"]).strip().lower()] = str(p["_id"])

    # Fetch units (by policeReferenceId, case-insensitive key)
    units = await db[COLLECTION_NAME].find(
        {"isDelete": False},
        {"_id": 1, "policeReferenceId": 1}
    ).to_list(length=None)
    for u in units:
        if u.get("policeReferenceId"):
            cache["units"][u["policeReferenceId"].strip().lower()] = str(u["_id"])

    return cache


def _extract_row_data(row) -> Dict[str, Any]:
    """
    Extract and clean data from a pandas row.
    Handles Excel's tendency to store numbers as floats (e.g., 66666666 -> 66666666.0)
    """
    def clean_value(val):
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return None
        # Convert to string and strip whitespace
        str_val = str(val).strip() if val else None
        # Remove .0 suffix from float values that are actually integers
        # e.g., "66666666.0" -> "66666666"
        if str_val and str_val.endswith('.0'):
            try:
                # Verify it's a valid integer by converting
                int_val = int(float(str_val))
                str_val = str(int_val)
            except (ValueError, OverflowError):
                pass  # Keep original if conversion fails
        return str_val

    return {
        "policeReferenceId": clean_value(row.get('policeReferenceId')),
        "name": clean_value(row.get('name')),
        "email": clean_value(row.get('email')),
        "districtName": clean_value(row.get('districtName')),
        "responsibleUserId": clean_value(row.get('responsibleUserId')),
        "address1": clean_value(row.get('address1')),
        "address2": clean_value(row.get('address2')),
        "city": clean_value(row.get('city')),
        "zip": clean_value(row.get('zip')),
        "phone": clean_value(row.get('phone')),
        "responsiblePersonTitle": clean_value(row.get('responsiblePersonTitle')),
        "isVirtual": clean_value(row.get('isVirtual')),
        "unitTypeName": clean_value(row.get('unitTypeName')),
        "departmentName": clean_value(row.get('departmentName')),
        "proxyUserId": clean_value(row.get('proxyUserId')),
        "parentUnitPoliceReferenceId": clean_value(row.get('parentUnitPoliceReferenceId'))
    }


def _validate_required_fields(row_data: Dict[str, Any], row_number: int) -> Optional[Dict]:
    """
    Validate required fields are present.
    Returns error dict if validation fails, None otherwise.
    Note: responsibleUserId is now optional
    """
    required_fields = ['policeReferenceId', 'name', 'email', 'districtName']
    missing = []

    for field in required_fields:
        if not row_data.get(field):
            missing.append(field)

    if missing:
        return {
            "rowNumber": row_number,
            "policeReferenceId": row_data.get('policeReferenceId'),
            "name": row_data.get('name'),
            "error": f"Missing required fields: {', '.join(missing)}"
        }

    return None


async def _resolve_foreign_keys(
    db,
    row_data: Dict[str, Any],
    lookup_cache: Dict[str, Dict],
    row_number: int
) -> Tuple[Optional[Dict], Optional[Dict]]:
    """
    Resolve foreign keys from names to ObjectIds.
    Returns (resolved_data, error_dict). If successful, error_dict is None.
    """
    resolved = row_data.copy()
    errors = []

    # Resolve districtName -> districtId
    district_name = row_data.get('districtName')
    if district_name:
        district_key = district_name.strip().lower()
        if district_key in lookup_cache["districts"]:
            resolved['districtId'] = lookup_cache["districts"][district_key]
        else:
            errors.append(f"District '{district_name}' not found")

    # Resolve responsibleUserId (personnel userId) -> responsibleUserId (ObjectId)
    resp_user_id = row_data.get('responsibleUserId')
    if resp_user_id:
        user_key = str(resp_user_id).strip().lower()
        if user_key in lookup_cache["personnel"]:
            resolved['responsibleUserId'] = lookup_cache["personnel"][user_key]
        else:
            errors.append(f"Personnel with userId '{resp_user_id}' not found")

    # Resolve unitTypeName -> unitTypeId (optional)
    unit_type_name = row_data.get('unitTypeName')
    if unit_type_name:
        ut_key = unit_type_name.strip().lower()
        if ut_key in lookup_cache["unit_types"]:
            resolved['unitTypeId'] = lookup_cache["unit_types"][ut_key]
        else:
            errors.append(f"Unit type '{unit_type_name}' not found")

    # Resolve departmentName -> departmentId (optional)
    dept_name = row_data.get('departmentName')
    if dept_name:
        dept_key = dept_name.strip().lower()
        if dept_key in lookup_cache["departments"]:
            resolved['departmentId'] = lookup_cache["departments"][dept_key]
        else:
            errors.append(f"Department '{dept_name}' not found")

    # Resolve proxyUserId (personnel userId) -> proxyUserId (ObjectId) (optional)
    proxy_user_id = row_data.get('proxyUserId')
    if proxy_user_id:
        proxy_key = str(proxy_user_id).strip().lower()
        if proxy_key in lookup_cache["personnel"]:
            resolved['proxyUserId'] = lookup_cache["personnel"][proxy_key]
        else:
            errors.append(f"Proxy personnel with userId '{proxy_user_id}' not found")

    # Resolve parentUnitPoliceReferenceId -> parentUnitId (optional)
    parent_ref_id = row_data.get('parentUnitPoliceReferenceId')
    if parent_ref_id:
        parent_key = parent_ref_id.strip().lower()
        if parent_key in lookup_cache["units"]:
            resolved['parentUnitId'] = lookup_cache["units"][parent_key]
        else:
            errors.append(f"Parent unit with policeReferenceId '{parent_ref_id}' not found")

    # Handle phone (comma-separated to list)
    phone_str = row_data.get('phone')
    if phone_str:
        resolved['phone'] = [p.strip() for p in phone_str.split(',') if p.strip()]

    # Handle isVirtual (string to boolean)
    is_virtual_str = row_data.get('isVirtual')
    if is_virtual_str:
        resolved['isVirtual'] = is_virtual_str.lower() in ['true', '1', 'yes']

    # Remove lookup fields (not needed in final data)
    for field in ['districtName', 'unitTypeName', 'departmentName', 'parentUnitPoliceReferenceId']:
        resolved.pop(field, None)

    if errors:
        return None, {
            "rowNumber": row_number,
            "policeReferenceId": row_data.get('policeReferenceId'),
            "name": row_data.get('name'),
            "error": "; ".join(errors)
        }

    return resolved, None


async def _create_new_unit(
    db,
    resolved_data: Dict[str, Any],
    current_user_id: str,
    created_ip: Optional[str]
) -> Dict[str, Any]:
    """
    Create a new unit from resolved data.
    Returns {"success": True, "id": str} or {"success": False, "error": str}
    """
    try:
        # Prepare unit document
        unit_data = {
            "policeReferenceId": resolved_data.get('policeReferenceId'),
            "name": resolved_data.get('name'),
            "email": resolved_data.get('email'),
            "districtId": ObjectId(resolved_data['districtId']),
            "responsibleUserId": ObjectId(resolved_data['responsibleUserId']),
            "createdBy": ObjectId(current_user_id),
            "createdAt": get_ist_now(),
            "isActive": True,
            "isDelete": False
        }

        # Add optional fields
        if resolved_data.get('address1'):
            unit_data['address1'] = resolved_data['address1']
        if resolved_data.get('address2'):
            unit_data['address2'] = resolved_data['address2']
        if resolved_data.get('city'):
            unit_data['city'] = resolved_data['city']
        if resolved_data.get('zip'):
            unit_data['zip'] = resolved_data['zip']
        if resolved_data.get('phone'):
            unit_data['phone'] = resolved_data['phone']
        if resolved_data.get('responsiblePersonTitle'):
            unit_data['responsiblePersonTitle'] = resolved_data['responsiblePersonTitle']
        if resolved_data.get('isVirtual') is not None:
            unit_data['isVirtual'] = resolved_data['isVirtual']
        if resolved_data.get('unitTypeId'):
            unit_data['unitTypeId'] = ObjectId(resolved_data['unitTypeId'])
        if resolved_data.get('departmentId'):
            unit_data['departmentId'] = ObjectId(resolved_data['departmentId'])
        if resolved_data.get('proxyUserId'):
            unit_data['proxyUserId'] = ObjectId(resolved_data['proxyUserId'])
        if resolved_data.get('parentUnitId'):
            unit_data['parentUnitId'] = ObjectId(resolved_data['parentUnitId'])
            # Calculate parentUnitPath
            parent_unit_path = await calculate_parent_unit_path(db, resolved_data['parentUnitId'])
            unit_data['parentUnitPath'] = parent_unit_path

        if created_ip:
            unit_data['createdIp'] = created_ip

        # Check name uniqueness
        existing_name = await db[COLLECTION_NAME].find_one({
            "name": {"$regex": f"^{re.escape(resolved_data['name'])}$", "$options": "i"},
            "isDelete": False
        })
        if existing_name:
            return {"success": False, "error": f"Unit name '{resolved_data['name']}' already exists"}

        # Insert unit
        result = await db[COLLECTION_NAME].insert_one(unit_data)

        # Sync responsible user
        await handle_responsible_user_change(
            db=db,
            unit_id=result.inserted_id,
            old_responsible_user_id=None,
            new_responsible_user_id=ObjectId(resolved_data['responsibleUserId']),
            designation_id=None
        )

        return {"success": True, "id": str(result.inserted_id)}

    except Exception as e:
        logger.exception(f"Error creating unit: {str(e)}")
        return {"success": False, "error": str(e)}


async def _update_existing_unit(
    db,
    existing_unit: Dict,
    resolved_data: Dict[str, Any],
    current_user_id: str,
    updated_ip: Optional[str]
) -> Dict[str, Any]:
    """
    Update an existing unit with resolved data.
    Clears fields if empty in Excel (as per requirement).
    Returns {"success": True} or {"success": False, "error": str}
    """
    try:
        unit_id = existing_unit["_id"]

        # Build update document - include all fields (clear if None)
        update_data = {
            "name": resolved_data.get('name'),
            "email": resolved_data.get('email'),
            "districtId": ObjectId(resolved_data['districtId']),
            "responsibleUserId": ObjectId(resolved_data['responsibleUserId']),
            "updatedBy": ObjectId(current_user_id),
            "updatedAt": get_ist_now(),
            "address1": resolved_data.get('address1'),
            "address2": resolved_data.get('address2'),
            "city": resolved_data.get('city'),
            "zip": resolved_data.get('zip'),
            "responsiblePersonTitle": resolved_data.get('responsiblePersonTitle'),
        }

        # Handle phone
        if resolved_data.get('phone'):
            update_data['phone'] = resolved_data['phone']
        else:
            update_data['phone'] = None

        # Handle isVirtual
        if resolved_data.get('isVirtual') is not None:
            update_data['isVirtual'] = resolved_data['isVirtual']

        # Handle optional FK fields
        if resolved_data.get('unitTypeId'):
            update_data['unitTypeId'] = ObjectId(resolved_data['unitTypeId'])
        else:
            update_data['unitTypeId'] = None

        if resolved_data.get('departmentId'):
            update_data['departmentId'] = ObjectId(resolved_data['departmentId'])
        else:
            update_data['departmentId'] = None

        if resolved_data.get('proxyUserId'):
            update_data['proxyUserId'] = ObjectId(resolved_data['proxyUserId'])
        else:
            update_data['proxyUserId'] = None

        if resolved_data.get('parentUnitId'):
            update_data['parentUnitId'] = ObjectId(resolved_data['parentUnitId'])
            # Calculate parentUnitPath
            parent_unit_path = await calculate_parent_unit_path(db, resolved_data['parentUnitId'])
            update_data['parentUnitPath'] = parent_unit_path
        else:
            update_data['parentUnitId'] = None
            update_data['parentUnitPath'] = None

        if updated_ip:
            update_data['updatedIp'] = updated_ip

        # Check name uniqueness (exclude current unit)
        if resolved_data.get('name') and resolved_data['name'] != existing_unit.get('name'):
            existing_name = await db[COLLECTION_NAME].find_one({
                "name": {"$regex": f"^{re.escape(resolved_data['name'])}$", "$options": "i"},
                "_id": {"$ne": unit_id},
                "isDelete": False
            })
            if existing_name:
                return {"success": False, "error": f"Unit name '{resolved_data['name']}' already exists"}

        # Handle responsible user change
        old_responsible_user_id = existing_unit.get('responsibleUserId')
        new_responsible_user_id = ObjectId(resolved_data['responsibleUserId'])

        if old_responsible_user_id != new_responsible_user_id:
            await handle_responsible_user_change(
                db=db,
                unit_id=unit_id,
                old_responsible_user_id=old_responsible_user_id,
                new_responsible_user_id=new_responsible_user_id,
                designation_id=None
            )

        # Update unit
        await db[COLLECTION_NAME].update_one(
            {"_id": unit_id},
            {"$set": update_data}
        )

        # Update descendant paths if name or parent changed
        old_name = existing_unit.get('name', '')
        new_name = resolved_data.get('name', '')
        old_path = existing_unit.get('parentUnitPath')
        new_path = update_data.get('parentUnitPath')

        if old_name != new_name or old_path != new_path:
            await update_descendant_paths(db, str(unit_id), old_name, new_name, old_path, new_path)

        return {"success": True}

    except Exception as e:
        logger.exception(f"Error updating unit: {str(e)}")
        return {"success": False, "error": str(e)}
