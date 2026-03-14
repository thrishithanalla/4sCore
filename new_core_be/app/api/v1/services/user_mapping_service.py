"""
UserMapping Service Module
Provides business logic for user_role_permissions management with role/user/permission validation
"""
import asyncio
from typing import List, Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.user_mapping_schema import (
    UserMappingCreateSchema,
    UserMappingUpdateSchema
)
from app.constants.collections import Collections


def _convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId and datetime fields to strings for JSON serialization"""
    from datetime import datetime

    if not document:
        return document

    if "_id" in document:
        document["_id"] = str(document["_id"])

    for field in ["createdBy", "updatedBy", "unitId", "rankId", "userId", "roleId"]:
        if field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    # Convert datetime fields to ISO format strings
    for field in ["createdAt", "updatedAt"]:
        if field in document and isinstance(document[field], datetime):
            document[field] = document[field].isoformat()

    # Convert moduleId in permissions structures
    for perm_field in ["additionalPermissions", "exclusionPermissions"]:
        if perm_field in document and document[perm_field]:
            for module_item in document[perm_field]:
                if isinstance(module_item, dict) and "moduleId" in module_item:
                    if isinstance(module_item["moduleId"], ObjectId):
                        module_item["moduleId"] = str(module_item["moduleId"])

    return document


def _to_objectid_or_str(value) -> ObjectId:
    """Convert string to ObjectId, pass through if already ObjectId.

    Raises:
        ValueError: If value is not a valid ObjectId format
    """
    if isinstance(value, ObjectId):
        return value
    if value is None:
        return None
    try:
        return ObjectId(value)
    except Exception:
        raise ValueError(f"Invalid ObjectId format: '{value}'. Must be a 24-character hex string.")


def _convert_permissions_moduleids_to_objectid(permissions_data: list) -> list:
    """
    Convert moduleId strings to ObjectId in permissions structure.
    Handles both dict and Pydantic object formats.
    """
    if not permissions_data:
        return permissions_data

    result = []
    for module_item in permissions_data:
        if isinstance(module_item, dict):
            module_item = module_item.copy()
            if "moduleId" in module_item and module_item["moduleId"]:
                module_item["moduleId"] = _to_objectid_or_str(module_item["moduleId"])
            result.append(module_item)
        else:
            # Pydantic object - convert to dict first
            module_dict = module_item.model_dump() if hasattr(module_item, 'model_dump') else dict(module_item)
            if "moduleId" in module_dict and module_dict["moduleId"]:
                module_dict["moduleId"] = _to_objectid_or_str(module_dict["moduleId"])
            result.append(module_dict)
    return result


async def _validate_role(db, role_id: str):
    """
    Validate that role ID exists in the roles collection

    Args:
        db: Database instance
        role_id: Role ID to validate

    Raises:
        ValueError: If role ID is invalid, doesn't exist, or is soft-deleted
    """
    # Validate ObjectId format first
    if not role_id or not ObjectId.is_valid(role_id):
        raise ValueError(f"Invalid roleId format: '{role_id}'. Must be a 24-character hex string.")

    role = await db[Collections.ROLES].find_one({
        "_id": ObjectId(role_id),
        "isDelete": False
    })
    if not role:
        raise ValueError(f"Role with ID '{role_id}' not found or is deleted")


async def _get_user_with_unit_rank(db, user_id: str):
    """
    Get user from personnel collection and return user with unitId and rankId

    Note: This function checks for units array first, then falls back to unitId field
    - If units array exists: extracts unitId from [[unitId, designationId], ...]
    - If units doesn't exist: uses unitId field directly
    - Only throws error if both are missing

    Args:
        db: Database instance
        user_id: User ID to validate

    Returns:
        User document with unitId and rankId extracted

    Raises:
        ValueError: If user ID is invalid, doesn't exist, is soft-deleted, or missing both units/unitId or rankId
    """
    # Validate ObjectId format first
    if not user_id or not ObjectId.is_valid(user_id):
        raise ValueError(f"Invalid userId format: '{user_id}'. Must be a 24-character hex string.")

    user = await db[Collections.PERSONNEL_MASTER].find_one({
        "_id": ObjectId(user_id),
        "isDelete": False
    })
    if not user:
        raise ValueError(f"User with ID '{user_id}' not found or is deleted")

    unit_id = None

    # Try to get unitId from units array first
    units = user.get("units", [])
    if units and isinstance(units, list) and len(units) > 0:
        # Get first unit from units array: [[unitId, designationId], ...]
        first_unit = units[0]
        if isinstance(first_unit, list) and len(first_unit) > 0:
            unit_id = first_unit[0]

    # If units array didn't work, fall back to unitId field
    if not unit_id:
        unit_id = user.get("unitId")

    # If both are missing, throw error
    if not unit_id:
        raise ValueError(f"User with ID '{user_id}' does not have unitId (neither in units array nor unitId field)")

    # Convert unitId to string if it's ObjectId
    if isinstance(unit_id, ObjectId):
        unit_id = str(unit_id)

    # Check for rankId
    if "rankId" not in user or user["rankId"] is None:
        raise ValueError(f"User with ID '{user_id}' does not have a rankId")

    # Add extracted unitId to user dict for consistency
    user["unitId"] = unit_id

    return user


async def _validate_is_menu_against_menu_eligible(db, permissions_data):
    """
    Validate that isMenu=true is only set for jobs where menuEligible=true in jobs_master.

    When a job has menuEligible=false, it cannot have isMenu=true in any user mapping.

    Args:
        db: Database instance
        permissions_data: List of ModulePermissionItem objects or dicts with nested structure

    Raises:
        ValueError: If isMenu=true is set for a job with menuEligible=false
    """
    if not permissions_data:
        return

    # Collect all jobs that have isMenu=true
    jobs_with_is_menu_true = set()

    for module_item in permissions_data:
        if isinstance(module_item, dict):
            jobs = module_item.get("jobs", [])
        else:
            jobs = module_item.jobs

        for job_item in jobs:
            if isinstance(job_item, dict):
                job_name = job_item.get("jobName")
                is_menu = job_item.get("isMenu", True)  # default is True
            else:
                job_name = job_item.jobName
                is_menu = getattr(job_item, "isMenu", True)

            if job_name and is_menu is True:
                jobs_with_is_menu_true.add(job_name)

    if not jobs_with_is_menu_true:
        return

    # Fetch menuEligible for these jobs from jobs_master
    jobs_data = await db[Collections.JOBS].find(
        {"name": {"$in": list(jobs_with_is_menu_true)}, "isDelete": False},
        {"name": 1, "menuEligible": 1}
    ).to_list(length=None)

    # Build map: jobName -> menuEligible
    job_menu_eligible_map = {
        job["name"]: job.get("menuEligible", True)  # default True for backward compatibility
        for job in jobs_data
    }

    # Check for violations
    for job_name in jobs_with_is_menu_true:
        menu_eligible = job_menu_eligible_map.get(job_name, True)
        if menu_eligible is False:
            raise ValueError(
                f"Cannot set isMenu=true for job '{job_name}' because it has menuEligible=false in jobs_master. "
                f"Please set isMenu=false for this job or update the job's menuEligible first."
            )


async def _validate_permissions_structure(db, permissions_data):
    """
    Validate nested permissions structure: modules -> jobs -> permissions

    OPTIMIZED: Uses batch queries instead of N+1 pattern.
    Collects all IDs/names first, then validates in 3 parallel queries.

    Args:
        db: Database instance
        permissions_data: List of ModulePermissionItem objects or dicts with nested structure

    Raises:
        ValueError: If any moduleId, jobName, or permission name doesn't exist or is soft-deleted
    """
    if not permissions_data:
        return

    # Validate isMenu against menuEligible first
    await _validate_is_menu_against_menu_eligible(db, permissions_data)

    # Collect all unique IDs and names to validate
    module_ids = set()
    job_names = set()
    permission_names = set()

    for module_item in permissions_data:
        # Handle both dict and object formats
        if isinstance(module_item, dict):
            module_id = module_item.get("moduleId")
            jobs = module_item.get("jobs", [])
        else:
            module_id = module_item.moduleId
            jobs = module_item.jobs

        # Validate moduleId format
        if not module_id or not ObjectId.is_valid(module_id):
            raise ValueError(f"Invalid moduleId format: '{module_id}'. Must be a 24-character hex string.")
        module_ids.add(module_id)

        for job_item in jobs:
            if isinstance(job_item, dict):
                job_name = job_item.get("jobName")
                permissions = job_item.get("permissions", [])
            else:
                job_name = job_item.jobName
                permissions = job_item.permissions

            if job_name:
                job_names.add(job_name.lower())

            for perm in permissions:
                if isinstance(perm, str):
                    perm_name = perm
                elif isinstance(perm, dict):
                    perm_name = perm.get("name", "")
                elif hasattr(perm, 'name'):
                    perm_name = perm.name
                else:
                    perm_name = str(perm)
                if perm_name:
                    permission_names.add(perm_name.lower())

    # Batch validate all modules, jobs, and permissions in parallel (3 queries total)
    async def validate_modules():
        if not module_ids:
            return set()
        valid_module_ids = [ObjectId(mid) for mid in module_ids if ObjectId.is_valid(mid)]
        if not valid_module_ids:
            return set()
        modules = await db[Collections.MODULES].find(
            {"_id": {"$in": valid_module_ids}, "isDelete": False},
            {"_id": 1}
        ).to_list(length=None)
        return {str(m["_id"]) for m in modules}

    async def validate_jobs():
        if not job_names:
            return set()
        jobs = await db[Collections.JOBS].find(
            {"isDelete": False},
            {"name": 1}
        ).to_list(length=None)
        return {j["name"].lower() for j in jobs if j.get("name")}

    async def validate_permissions():
        if not permission_names:
            return set()
        perms = await db[Collections.PERMISSIONS].find(
            {"isDelete": False},
            {"name": 1}
        ).to_list(length=None)
        return {p["name"].lower() for p in perms if p.get("name")}

    # Run all validations in parallel
    valid_modules, valid_jobs, valid_permissions = await asyncio.gather(
        validate_modules(),
        validate_jobs(),
        validate_permissions()
    )

    # Check for missing modules
    for module_id in module_ids:
        if module_id not in valid_modules:
            raise ValueError(f"Module with ID '{module_id}' not found or is deleted")

    # Check for missing jobs
    for job_name in job_names:
        if job_name not in valid_jobs:
            raise ValueError(f"Job with name '{job_name}' not found or is deleted")

    # Check for missing permissions
    for perm_name in permission_names:
        if perm_name not in valid_permissions:
            raise ValueError(f"Permission with name '{perm_name}' not found or is deleted")


# ============================================================================
# CRUD Operations
# ============================================================================

async def create_user_mapping(data: UserMappingCreateSchema, created_by: str, created_ip: Optional[str] = None) -> dict:
    """
    Create a new user role permissions mapping

    OPTIMIZED: Uses parallel queries for validation.

    Args:
        data: UserMapping creation schema
        created_by: User ID who is creating this record (from token _id)
        created_ip: IP address of the client making the request

    Returns:
        Created user mapping document

    Raises:
        ValueError: If roleId/userId are invalid, user missing unitId/rankId, or mapping exists
    """
    db = get_database()

    # Validate formats first (no DB calls)
    if not data.roleId or not ObjectId.is_valid(data.roleId):
        raise ValueError(f"Invalid roleId format: '{data.roleId}'. Must be a 24-character hex string.")
    if not data.userId or not ObjectId.is_valid(data.userId):
        raise ValueError(f"Invalid userId format: '{data.userId}'. Must be a 24-character hex string.")
    if data.unitId and not ObjectId.is_valid(data.unitId):
        raise ValueError(f"Invalid unitId format: '{data.unitId}'. Must be a 24-character hex string.")

    # OPTIMIZATION: Run role, user, and unit validations in parallel
    async def fetch_role():
        return await db[Collections.ROLES].find_one({
            "_id": ObjectId(data.roleId),
            "isDelete": False
        })

    async def fetch_user():
        return await db[Collections.PERSONNEL_MASTER].find_one({
            "_id": ObjectId(data.userId),
            "isDelete": False
        })

    async def fetch_unit():
        if data.unitId:
            return await db[Collections.UNIT].find_one({
                "_id": ObjectId(data.unitId),
                "isDelete": False
            })
        return None

    # Run all fetches in parallel
    role, user, unit = await asyncio.gather(fetch_role(), fetch_user(), fetch_unit())

    # Validate results
    if not role:
        raise ValueError(f"Role with ID '{data.roleId}' not found or is deleted")
    if not user:
        raise ValueError(f"User with ID '{data.userId}' not found or is deleted")
    if data.unitId and not unit:
        raise ValueError(f"Unit with ID '{data.unitId}' not found or is deleted")

    # Determine unit_id and rank_id
    if data.unitId:
        unit_id = data.unitId
        rank_id = user.get("rankId")
        if rank_id is None:
            raise ValueError(f"User with ID '{data.userId}' does not have a rankId")
    else:
        # Get unitId from user's units array or unitId field
        unit_id = None
        units = user.get("units", [])
        if units and isinstance(units, list) and len(units) > 0:
            first_unit = units[0]
            if isinstance(first_unit, list) and len(first_unit) > 0:
                unit_id = first_unit[0]
            elif isinstance(first_unit, dict) and first_unit.get("unitId"):
                unit_id = first_unit.get("unitId")
        if not unit_id:
            unit_id = user.get("unitId")
        if not unit_id:
            raise ValueError(f"User with ID '{data.userId}' does not have unitId")
        if isinstance(unit_id, ObjectId):
            unit_id = str(unit_id)
        rank_id = user.get("rankId")
        if rank_id is None:
            raise ValueError(f"User with ID '{data.userId}' does not have a rankId")

    # OPTIMIZATION: Validate permissions structures in parallel
    validation_tasks = []
    if data.additionalPermissions:
        validation_tasks.append(_validate_permissions_structure(db, data.additionalPermissions))
    if data.exclusionPermissions:
        validation_tasks.append(_validate_permissions_structure(db, data.exclusionPermissions))
    if validation_tasks:
        await asyncio.gather(*validation_tasks)

    # Check if mapping already exists for this role-user-unit combination (must be unique)
    # Handle both string and ObjectId for backward compatibility
    or_conditions = [
        {"roleId": data.roleId, "userId": data.userId, "unitId": unit_id}
    ]
    try:
        obj_condition = {
            "roleId": ObjectId(data.roleId),
            "userId": ObjectId(data.userId),
            "unitId": ObjectId(unit_id) if unit_id else None
        }
        or_conditions.append(obj_condition)
    except Exception:
        pass  # Skip ObjectId condition if conversion fails

    existing_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
        "$or": or_conditions,
        "isDelete": False
    })
    if existing_mapping:
        raise ValueError(f"User role permissions mapping for roleId '{data.roleId}', userId '{data.userId}', and unitId '{unit_id}' already exists")

    # Prepare document
    mapping_dict = data.model_dump()

    # Convert FK fields to ObjectId
    mapping_dict["userId"] = _to_objectid_or_str(data.userId)
    mapping_dict["roleId"] = _to_objectid_or_str(data.roleId)
    mapping_dict["unitId"] = _to_objectid_or_str(unit_id)  # Add unitId from personnel
    mapping_dict["rankId"] = _to_objectid_or_str(rank_id) if rank_id else None  # Add rankId from personnel

    # Convert moduleId to ObjectId in permissions structure
    if mapping_dict.get("additionalPermissions"):
        mapping_dict["additionalPermissions"] = _convert_permissions_moduleids_to_objectid(mapping_dict["additionalPermissions"])
    if mapping_dict.get("exclusionPermissions"):
        mapping_dict["exclusionPermissions"] = _convert_permissions_moduleids_to_objectid(mapping_dict["exclusionPermissions"])

    mapping_dict["isActive"] = True
    mapping_dict["isDelete"] = False
    mapping_dict["createdBy"] = ObjectId(created_by)
    mapping_dict["createdAt"] = get_ist_now()
    mapping_dict["createdIp"] = created_ip
    mapping_dict["updatedBy"] = None
    mapping_dict["updatedAt"] = None
    mapping_dict["updatedIp"] = None

    # Insert
    result = await db[Collections.USER_ROLE_PERMISSIONS].insert_one(mapping_dict)
    created_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({"_id": result.inserted_id})

    return _convert_objectid_to_str(created_mapping)


async def update_user_mapping(mapping_id: str, patch: UserMappingUpdateSchema, updated_by: str, updated_ip: Optional[str] = None) -> dict:
    """
    Update an existing user role permissions mapping (partial update)

    OPTIMIZED: Uses parallel queries for validation.

    Args:
        mapping_id: UserMapping ID
        patch: Update schema with fields to change
        updated_by: User ID who is updating this record (from token _id)
        updated_ip: IP address of the client making the request

    Returns:
        Updated user mapping document

    Raises:
        ValueError: If mapping_id is invalid, mapping not found, already deleted, or validation fails
    """
    # Validate ObjectId format first
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        raise ValueError(f"Invalid mappingId format: '{mapping_id}'. Must be a 24-character hex string.")

    db = get_database()

    # Check if mapping exists and is not soft-deleted
    existing = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": False
    })
    if not existing:
        raise ValueError(f"User role permissions mapping with ID '{mapping_id}' not found or already deleted")

    # Prepare update data
    update_data = patch.model_dump(exclude_unset=True)

    if not update_data:
        raise ValueError("No fields to update")

    # Validate ObjectId formats first (no DB calls)
    if "roleId" in update_data and not ObjectId.is_valid(update_data["roleId"]):
        raise ValueError(f"Invalid roleId format: '{update_data['roleId']}'. Must be a 24-character hex string.")
    if "userId" in update_data and not ObjectId.is_valid(update_data["userId"]):
        raise ValueError(f"Invalid userId format: '{update_data['userId']}'. Must be a 24-character hex string.")
    if "unitId" in update_data and not ObjectId.is_valid(update_data["unitId"]):
        raise ValueError(f"Invalid unitId format: '{update_data['unitId']}'. Must be a 24-character hex string.")

    # OPTIMIZATION: Collect all validation tasks and run in parallel
    validation_tasks = []
    task_names = []

    # Role validation
    if "roleId" in update_data:
        async def fetch_role():
            return await db[Collections.ROLES].find_one({
                "_id": ObjectId(update_data["roleId"]),
                "isDelete": False
            })
        validation_tasks.append(fetch_role())
        task_names.append("role")

    # User validation
    if "userId" in update_data:
        async def fetch_user():
            return await db[Collections.PERSONNEL_MASTER].find_one({
                "_id": ObjectId(update_data["userId"]),
                "isDelete": False
            })
        validation_tasks.append(fetch_user())
        task_names.append("user")

    # Unit validation
    if "unitId" in update_data:
        async def fetch_unit():
            return await db[Collections.UNIT].find_one({
                "_id": ObjectId(update_data["unitId"]),
                "isDelete": False
            })
        validation_tasks.append(fetch_unit())
        task_names.append("unit")

    # Run all entity validations in parallel
    if validation_tasks:
        results = await asyncio.gather(*validation_tasks)
        result_map = dict(zip(task_names, results))

        if "role" in result_map and not result_map["role"]:
            raise ValueError(f"Role with ID '{update_data['roleId']}' not found or is deleted")
        if "user" in result_map and not result_map["user"]:
            raise ValueError(f"User with ID '{update_data['userId']}' not found or is deleted")
        if "unit" in result_map and not result_map["unit"]:
            raise ValueError(f"Unit with ID '{update_data['unitId']}' not found or is deleted")

        # Handle rankId extraction from user
        if "user" in result_map:
            user = result_map["user"]
            rank_id = user.get("rankId")
            if rank_id is None:
                raise ValueError(f"User with ID '{update_data['userId']}' does not have a rankId")
            update_data["rankId"] = rank_id

            # If unitId not provided, get from user
            if "unitId" not in update_data:
                unit_id = None
                units = user.get("units", [])
                if units and isinstance(units, list) and len(units) > 0:
                    first_unit = units[0]
                    if isinstance(first_unit, list) and len(first_unit) > 0:
                        unit_id = first_unit[0]
                    elif isinstance(first_unit, dict) and first_unit.get("unitId"):
                        unit_id = first_unit.get("unitId")
                if not unit_id:
                    unit_id = user.get("unitId")
                if not unit_id:
                    raise ValueError(f"User with ID '{update_data['userId']}' does not have unitId")
                if isinstance(unit_id, ObjectId):
                    unit_id = str(unit_id)
                update_data["unitId"] = unit_id

    # OPTIMIZATION: Validate permissions structures in parallel
    perm_validation_tasks = []
    if "additionalPermissions" in update_data:
        perm_validation_tasks.append(_validate_permissions_structure(db, update_data["additionalPermissions"]))
    if "exclusionPermissions" in update_data:
        perm_validation_tasks.append(_validate_permissions_structure(db, update_data["exclusionPermissions"]))
    if perm_validation_tasks:
        await asyncio.gather(*perm_validation_tasks)

    # If roleId or userId is being updated, check uniqueness (roleId-userId-unitId must be unique)
    if "roleId" in update_data or "userId" in update_data:
        check_role_id = update_data.get("roleId", existing["roleId"])
        check_user_id = update_data.get("userId", existing["userId"])
        check_unit_id = update_data.get("unitId", existing["unitId"])

        # Convert to string for comparison (handles both string and ObjectId)
        check_role_id_str = str(check_role_id)
        check_user_id_str = str(check_user_id)
        check_unit_id_str = str(check_unit_id) if check_unit_id else None

        # Handle both string and ObjectId for backward compatibility
        or_conditions = [
            {"roleId": check_role_id_str, "userId": check_user_id_str, "unitId": check_unit_id_str}
        ]
        try:
            obj_condition = {
                "roleId": ObjectId(check_role_id_str),
                "userId": ObjectId(check_user_id_str),
                "unitId": ObjectId(check_unit_id_str) if check_unit_id_str else None
            }
            or_conditions.append(obj_condition)
        except Exception:
            pass  # Skip ObjectId condition if conversion fails

        mapping_exists = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
            "$or": or_conditions,
            "isDelete": False,
            "_id": {"$ne": ObjectId(mapping_id)}
        })
        if mapping_exists:
            raise ValueError(f"User role permissions mapping for roleId '{check_role_id_str}', userId '{check_user_id_str}', and unitId '{check_unit_id_str}' already exists")

    # Convert FK fields to ObjectId if present
    if "roleId" in update_data:
        update_data["roleId"] = _to_objectid_or_str(update_data["roleId"])
    if "userId" in update_data:
        update_data["userId"] = _to_objectid_or_str(update_data["userId"])
    if "unitId" in update_data:
        update_data["unitId"] = _to_objectid_or_str(update_data["unitId"])
    if "rankId" in update_data and update_data["rankId"]:
        update_data["rankId"] = _to_objectid_or_str(update_data["rankId"])

    # Convert moduleId to ObjectId in permissions structure
    if "additionalPermissions" in update_data and update_data["additionalPermissions"]:
        update_data["additionalPermissions"] = _convert_permissions_moduleids_to_objectid(update_data["additionalPermissions"])
    if "exclusionPermissions" in update_data and update_data["exclusionPermissions"]:
        update_data["exclusionPermissions"] = _convert_permissions_moduleids_to_objectid(update_data["exclusionPermissions"])

    # Update metadata
    update_data["updatedBy"] = ObjectId(updated_by)
    update_data["updatedAt"] = get_ist_now()
    update_data["updatedIp"] = updated_ip

    # Update in database
    await db[Collections.USER_ROLE_PERMISSIONS].update_one(
        {"_id": ObjectId(mapping_id)},
        {"$set": update_data}
    )
    updated_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({"_id": ObjectId(mapping_id)})

    return _convert_objectid_to_str(updated_mapping)


async def delete_user_mapping(mapping_id: str, deleted_by: str, deleted_ip: Optional[str] = None) -> bool:
    """
    Soft delete a user role permissions mapping

    Args:
        mapping_id: UserMapping ID
        deleted_by: User ID who is deleting this record (from token _id)
        deleted_ip: IP address of the request

    Returns:
        True if deleted successfully

    Raises:
        ValueError: If mapping_id is invalid, mapping not found, or already deleted
    """
    # Validate ObjectId format first
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        raise ValueError(f"Invalid mappingId format: '{mapping_id}'. Must be a 24-character hex string.")

    db = get_database()

    # Check if exists and not already deleted
    existing = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": False
    })
    if not existing:
        raise ValueError(f"User role permissions mapping with ID '{mapping_id}' not found or already deleted")

    # RESTRICTION: Check if this is the only role mapping for this user
    # Cannot delete if the user has only one active role assigned
    user_id = existing.get("userId")
    if user_id:
        user_mapping_count = await db[Collections.USER_ROLE_PERMISSIONS].count_documents({
            "userId": user_id,
            "isDelete": False
        })
        if user_mapping_count <= 1:
            raise ValueError("Cannot delete. This is the only role assigned to this user. Please assign another role before deleting this one.")

    # Soft delete by setting isDelete=True
    update_data = {
        "isDelete": True,
        "updatedBy": ObjectId(deleted_by),
        "updatedAt": get_ist_now()
    }
    if deleted_ip:
        update_data["updatedIp"] = deleted_ip

    result = await db[Collections.USER_ROLE_PERMISSIONS].update_one(
        {"_id": ObjectId(mapping_id)},
        {"$set": update_data}
    )

    return result.modified_count > 0


async def restore_user_mapping(mapping_id: str, restored_by: str, restored_ip: Optional[str] = None) -> bool:
    """
    Restore a soft-deleted user role permissions mapping

    Args:
        mapping_id: UserMapping ID
        restored_by: User ID who is restoring this record (from token _id)
        restored_ip: IP address of the request

    Returns:
        True if restored successfully

    Raises:
        ValueError: If mapping_id is invalid, mapping not found, or not deleted
    """
    # Validate ObjectId format first
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        raise ValueError(f"Invalid mappingId format: '{mapping_id}'. Must be a 24-character hex string.")

    db = get_database()

    # Check if exists and is deleted
    existing = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": True
    })
    if not existing:
        raise ValueError(f"User role permissions mapping with ID '{mapping_id}' not found or not deleted")

    # Restore by setting isActive=True, isDelete=False
    update_data = {
        "isActive": True,
        "isDelete": False,
        "updatedBy": ObjectId(restored_by),
        "updatedAt": get_ist_now()
    }
    if restored_ip:
        update_data["updatedIp"] = restored_ip

    result = await db[Collections.USER_ROLE_PERMISSIONS].update_one(
        {"_id": ObjectId(mapping_id)},
        {"$set": update_data}
    )

    return result.modified_count > 0


async def get_user_mapping(mapping_id: str) -> Optional[dict]:
    """
    Get a single user role permissions mapping by ID (excludes soft-deleted)

    Args:
        mapping_id: UserMapping ID

    Returns:
        UserMapping document with consolidated permissions or None if not found

    Raises:
        ValueError: If mapping_id is not a valid ObjectId format
    """
    # Validate ObjectId format first
    if not mapping_id or not ObjectId.is_valid(mapping_id):
        raise ValueError(f"Invalid mappingId format: '{mapping_id}'. Must be a 24-character hex string.")

    db = get_database()

    mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
        "_id": ObjectId(mapping_id),
        "isDelete": False
    })

    if not mapping:
        return None

    # Convert ObjectIds
    mapping = _convert_objectid_to_str(mapping)

    # Fetch role to get base permissions
    role = await db[Collections.ROLES].find_one({
        "_id": ObjectId(mapping["roleId"]),
        "isDelete": False
    })

    if role:
        role_permissions = role.get("permissions", [])
        additional_permissions = mapping.get("additionalPermissions", [])
        exclusion_permissions = mapping.get("exclusionPermissions", [])

        # Consolidate permissions
        consolidated = _consolidate_permissions(
            role_permissions,
            additional_permissions,
            exclusion_permissions
        )

        # Add consolidated permissions to the mapping
        mapping["permissions"] = consolidated
    else:
        # If role not found, just use empty permissions
        mapping["permissions"] = []

    return mapping


def _consolidate_permissions(
    role_permissions: List[dict],
    additional_permissions: List[dict],
    exclusion_permissions: List[dict]
) -> List[dict]:
    """
    Consolidate permissions: role.permissions + additionalPermissions - exclusionPermissions
    Consolidates at module, job, and permission levels

    Permissions now support isSelf field: {"name": "create", "isSelf": true/false}
    - Default isSelf: false (access to all data)
    - When same permission exists in multiple sources, isSelf: false wins
    - exclusionPermissions removes the permission entirely

    Args:
        role_permissions: Base permissions from role
        additional_permissions: Permissions to add
        exclusion_permissions: Permissions to remove

    Returns:
        Consolidated permissions list with isSelf flags
    """
    # Start with a deep copy of role permissions
    consolidated = {}

    # Helper function to normalize permission format
    def normalize_permission(perm):
        """Convert permission to dict format with isSelf field"""
        if isinstance(perm, str):
            return {"name": perm, "isSelf": False}
        elif isinstance(perm, dict):
            return {"name": perm.get("name"), "isSelf": perm.get("isSelf", False)}
        return {"name": str(perm), "isSelf": False}

    # Helper function to convert ObjectId to string
    def to_str(value):
        """Convert ObjectId to string if needed"""
        if isinstance(value, ObjectId):
            return str(value)
        return value

    # Step 1: Add all role permissions to consolidated dict (keyed by moduleId)
    for module in role_permissions:
        module_id = to_str(module.get("moduleId"))
        consolidated[module_id] = {
            "moduleId": module_id,
            "moduleName": module.get("moduleName"),
            "jobs": {}
        }
        for job in module.get("jobs", []):
            job_name = job.get("jobName")
            permissions_dict = {}

            for perm in job.get("permissions", []):
                normalized = normalize_permission(perm)
                perm_name = normalized["name"]
                permissions_dict[perm_name] = normalized

            consolidated[module_id]["jobs"][job_name] = {
                "jobName": job_name,
                "isMenu": job.get("isMenu", True),
                "displayOrder": job.get("displayOrder", 1),
                "permissions": permissions_dict
            }

    # Step 2: Add/merge additionalPermissions
    for module in additional_permissions:
        module_id = to_str(module.get("moduleId"))

        # If module doesn't exist, add it
        if module_id not in consolidated:
            consolidated[module_id] = {
                "moduleId": module_id,
                "moduleName": module.get("moduleName"),
                "jobs": {}
            }

        # Process jobs in this module
        for job in module.get("jobs", []):
            job_name = job.get("jobName")

            # If job doesn't exist in this module, add it
            if job_name not in consolidated[module_id]["jobs"]:
                consolidated[module_id]["jobs"][job_name] = {
                    "jobName": job_name,
                    "isMenu": job.get("isMenu", True),
                    "displayOrder": job.get("displayOrder", 1),
                    "permissions": {}
                }

            # Add/merge permissions to the job
            for perm in job.get("permissions", []):
                normalized = normalize_permission(perm)
                perm_name = normalized["name"]

                # If permission already exists, isSelf: false wins
                if perm_name in consolidated[module_id]["jobs"][job_name]["permissions"]:
                    existing = consolidated[module_id]["jobs"][job_name]["permissions"][perm_name]
                    # isSelf: false wins (lower value wins: False=0, True=1)
                    consolidated[module_id]["jobs"][job_name]["permissions"][perm_name] = {
                        "name": perm_name,
                        "isSelf": existing["isSelf"] and normalized["isSelf"]
                    }
                else:
                    # New permission, add it
                    consolidated[module_id]["jobs"][job_name]["permissions"][perm_name] = normalized

    # Step 3: Remove exclusionPermissions (removes permission entirely, ignoring isSelf)
    for module in exclusion_permissions:
        module_id = to_str(module.get("moduleId"))

        # Only process if module exists in consolidated
        if module_id in consolidated:
            for job in module.get("jobs", []):
                job_name = job.get("jobName")

                # Only process if job exists in this module
                if job_name in consolidated[module_id]["jobs"]:
                    # Remove permissions from the job
                    for perm in job.get("permissions", []):
                        normalized = normalize_permission(perm)
                        perm_name = normalized["name"]
                        # Remove the permission entirely (isSelf value doesn't matter)
                        consolidated[module_id]["jobs"][job_name]["permissions"].pop(perm_name, None)

    # Step 4: Convert back to list format and clean up empty jobs/modules
    result = []
    for module_id, module_data in consolidated.items():
        jobs_list = []
        for job_name, job_data in module_data["jobs"].items():
            # Only include jobs that have at least one permission
            if job_data["permissions"]:
                # Convert permissions dict to sorted list
                permissions_list = sorted(
                    list(job_data["permissions"].values()),
                    key=lambda x: x["name"]
                )
                jobs_list.append({
                    "jobName": job_name,
                    "isMenu": job_data.get("isMenu", True),
                    "displayOrder": job_data.get("displayOrder", 1),
                    "permissions": permissions_list
                })

        # Only include modules that have at least one job with permissions
        if jobs_list:
            result.append({
                "moduleId": module_id,
                "moduleName": module_data["moduleName"],
                "jobs": jobs_list
            })

    return result


async def search_user_mappings(
    roleId: Optional[str] = None,
    userId: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[dict]:
    """
    Search user role permissions mappings with optional filters (excludes soft-deleted)

    Args:
        roleId: Filter by role ID
        userId: Filter by user ID
        skip: Number of records to skip (pagination)
        limit: Maximum number of records to return

    Returns:
        List of user mapping documents with consolidated permissions
    """
    db = get_database()

    # Build query - always exclude soft-deleted
    query = {"isDelete": False}

    # Handle both string and ObjectId for backward compatibility
    if roleId:
        try:
            query["roleId"] = {"$in": [roleId, ObjectId(roleId)]}
        except Exception:
            query["roleId"] = roleId  # Fallback to string if invalid ObjectId
    if userId:
        try:
            query["userId"] = {"$in": [userId, ObjectId(userId)]}
        except Exception:
            query["userId"] = userId  # Fallback to string if invalid ObjectId

    # Execute query
    cursor = db[Collections.USER_ROLE_PERMISSIONS].find(query).skip(skip).limit(limit).sort("createdAt", -1)
    mappings = await cursor.to_list(length=limit)

    # Batch optimization: Collect all unique role IDs from all mappings
    role_ids = set()
    for mapping in mappings:
        role_id = mapping.get("roleId")
        if role_id:
            role_ids.add(ObjectId(role_id) if not isinstance(role_id, ObjectId) else role_id)

    # Fetch all roles in ONE query
    roles_map = {}
    if role_ids:
        roles_list = await db[Collections.ROLES].find(
            {"_id": {"$in": list(role_ids)}, "isDelete": False}
        ).to_list(length=None)
        roles_map = {str(role["_id"]): role for role in roles_list}

    # Process each mapping to add consolidated permissions
    result = []
    for mapping in mappings:
        # Convert ObjectIds
        mapping = _convert_objectid_to_str(mapping)

        # Get role from pre-fetched map
        role = roles_map.get(mapping["roleId"])

        if role:
            role_permissions = role.get("permissions", [])
            additional_permissions = mapping.get("additionalPermissions", [])
            exclusion_permissions = mapping.get("exclusionPermissions", [])

            # Consolidate permissions
            consolidated = _consolidate_permissions(
                role_permissions,
                additional_permissions,
                exclusion_permissions
            )

            # Add consolidated permissions to the mapping
            mapping["permissions"] = consolidated
        else:
            # If role not found, just use empty permissions
            mapping["permissions"] = []

        result.append(mapping)

    return result


async def count_user_mappings(
    roleId: Optional[str] = None,
    userId: Optional[str] = None
) -> int:
    """
    Count user role permissions mappings matching the filter criteria (excludes soft-deleted)

    Args:
        roleId: Filter by role ID
        userId: Filter by user ID

    Returns:
        Total count of matching user mappings
    """
    db = get_database()

    # Build query - always exclude soft-deleted
    query = {"isDelete": False}

    # Handle both string and ObjectId for backward compatibility
    if roleId:
        try:
            query["roleId"] = {"$in": [roleId, ObjectId(roleId)]}
        except Exception:
            query["roleId"] = roleId  # Fallback to string if invalid ObjectId
    if userId:
        try:
            query["userId"] = {"$in": [userId, ObjectId(userId)]}
        except Exception:
            query["userId"] = userId  # Fallback to string if invalid ObjectId

    return await db[Collections.USER_ROLE_PERMISSIONS].count_documents(query)