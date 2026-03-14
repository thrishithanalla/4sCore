"""
User Onboarding Service Module
Provides atomic user onboarding combining personnel creation with role mappings
"""
from typing import List, Optional, Dict, Any
from bson import ObjectId
from datetime import datetime

from fastapi import Request

from app.core.database import get_database
from app.utils.time_utils import get_ist_now
from app.api.v1.utils.validators import validate_personnel_foreign_keys
from app.utils.error_messages import get_field_error
from app.api.v1.schemas.onboarding_schema import (
    UserOnboardingCreateSchema,
    UserOnboardingUpdateSchema,
    RoleMappingItem,
    RoleMappingUpdateItem
)
from app.constants.collections import Collections
from app.api.v1.services.personnel_master_service import (
    check_email_exists,
    check_userid_exists,
    _convert_document_for_json,
    add_personnel_to_units,
    extract_unit_ids_from_units,
    remove_personnel_from_all_units
)
from app.api.v1.services.user_mapping_service import (
    _validate_role,
    _validate_permissions_structure,
    _convert_permissions_moduleids_to_objectid,
    _convert_objectid_to_str
)


def _to_objectid(value: str) -> ObjectId:
    """Convert string to ObjectId, raise ValueError if invalid"""
    if not value or not ObjectId.is_valid(value):
        raise ValueError(f"Invalid ObjectId format: '{value}'")
    return ObjectId(value)


async def _validate_onboarding_data(db, data: UserOnboardingCreateSchema):
    """
    Validate all onboarding data upfront before any database writes.

    Validates:
    - Email uniqueness
    - UserId uniqueness
    - Personnel foreign keys (units, department, rank)
    - Role mappings (roleId, unitId existence)
    - Additional/exclusion permissions structure

    Raises:
        ValueError: If any validation fails
    """
    # Check email uniqueness
    if await check_email_exists(db, data.email):
        raise ValueError(get_field_error("email_exists"))

    # Check userId uniqueness
    if data.userId and await check_userid_exists(db, data.userId):
        raise ValueError(get_field_error("userId_exists"))

    # Prepare personnel dict for FK validation
    personnel_dict_temp = data.model_dump(exclude={"password", "roleMappings"})

    # Convert units to list of dicts for validation
    if personnel_dict_temp.get("units"):
        personnel_dict_temp["units"] = [
            {"unitId": u.get("unitId"), "designationId": u.get("designationId")}
            if isinstance(u, dict) else {"unitId": u.unitId, "designationId": getattr(u, "designationId", None)}
            for u in personnel_dict_temp["units"]
        ]

    # Validate personnel foreign keys (units, department, rank)
    await validate_personnel_foreign_keys(db, personnel_dict_temp)

    # Validate each role mapping
    for idx, mapping in enumerate(data.roleMappings):
        # Validate roleId exists
        try:
            await _validate_role(db, mapping.roleId)
        except ValueError as e:
            raise ValueError(f"Role mapping [{idx}]: {str(e)}")

        # Validate unitId exists
        if not ObjectId.is_valid(mapping.unitId):
            raise ValueError(f"Role mapping [{idx}]: Invalid unitId format: '{mapping.unitId}'")

        unit = await db[Collections.UNIT].find_one({
            "_id": ObjectId(mapping.unitId),
            "isDelete": False
        })
        if not unit:
            raise ValueError(f"Role mapping [{idx}]: Unit with ID '{mapping.unitId}' not found or is deleted")

        # Validate additional permissions structure
        if mapping.additionalPermissions:
            try:
                await _validate_permissions_structure(db, mapping.additionalPermissions)
            except ValueError as e:
                raise ValueError(f"Role mapping [{idx}] additionalPermissions: {str(e)}")

        # Validate exclusion permissions structure
        if mapping.exclusionPermissions:
            try:
                await _validate_permissions_structure(db, mapping.exclusionPermissions)
            except ValueError as e:
                raise ValueError(f"Role mapping [{idx}] exclusionPermissions: {str(e)}")


async def _create_personnel_document(db, data: UserOnboardingCreateSchema, created_by: str, created_ip: str) -> dict:
    """
    Create personnel document in database.

    Returns:
        Created personnel document with _id
    """
    collection = db[Collections.PERSONNEL_MASTER]

    # Prepare personnel document (exclude mpin and roleMappings from model_dump, we'll add mpin separately)
    personnel_dict = data.model_dump(exclude={"mpin", "roleMappings"})
    personnel_dict["email"] = personnel_dict["email"].lower()
    # Store MPIN as integer (4 digits) if provided
    if data.mpin is not None:
        personnel_dict["mpin"] = data.mpin
    if data.mpin is None:
        personnel_dict["mpin"] = 1111
    personnel_dict["isFirstTime"] = True  # Flag for first-time login
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

    return created_personnel


async def _create_role_mapping(
    db,
    user_id: ObjectId,
    rank_id: ObjectId,
    mapping: RoleMappingItem,
    created_by: str,
    created_ip: str
) -> dict:
    """
    Create a single role mapping document.

    Args:
        db: Database instance
        user_id: Personnel ObjectId
        rank_id: Personnel's rank ObjectId
        mapping: Role mapping data
        created_by: Creator user ID
        created_ip: Creator IP address

    Returns:
        Created role mapping document
    """
    mapping_dict = {
        "userId": user_id,
        "roleId": _to_objectid(mapping.roleId),
        "unitId": _to_objectid(mapping.unitId),
        "rankId": rank_id,
        "additionalPermissions": [],
        "exclusionPermissions": [],
        "isActive": True,
        "isDelete": False,
        "createdBy": ObjectId(created_by) if created_by and ObjectId.is_valid(created_by) else None,
        "createdAt": get_ist_now(),
        "createdIp": created_ip,
        "updatedBy": None,
        "updatedAt": None,
        "updatedIp": None
    }

    # Convert additional permissions if provided
    if mapping.additionalPermissions:
        permissions_data = [p.model_dump() if hasattr(p, 'model_dump') else p for p in mapping.additionalPermissions]
        mapping_dict["additionalPermissions"] = _convert_permissions_moduleids_to_objectid(permissions_data)

    # Convert exclusion permissions if provided
    if mapping.exclusionPermissions:
        permissions_data = [p.model_dump() if hasattr(p, 'model_dump') else p for p in mapping.exclusionPermissions]
        mapping_dict["exclusionPermissions"] = _convert_permissions_moduleids_to_objectid(permissions_data)

    # Insert into database
    result = await db[Collections.USER_ROLE_PERMISSIONS].insert_one(mapping_dict)
    created_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({"_id": result.inserted_id})

    return created_mapping


async def _rollback_onboarding(db, personnel_id: ObjectId, mapping_ids: List[ObjectId]):
    """
    Rollback onboarding operation by deleting created documents.

    Args:
        db: Database instance
        personnel_id: Personnel ObjectId to delete (can be None)
        mapping_ids: List of role mapping ObjectIds to delete
    """
    # Delete role mappings
    if mapping_ids:
        await db[Collections.USER_ROLE_PERMISSIONS].delete_many({
            "_id": {"$in": mapping_ids}
        })

    # Delete personnel and remove from unit personnel lists
    if personnel_id:
        await remove_personnel_from_all_units(db, personnel_id)
        await db[Collections.PERSONNEL_MASTER].delete_one({"_id": personnel_id})


async def onboard_user(
    data: UserOnboardingCreateSchema,
    created_by: str,
    created_ip: str = None,
    request: Optional[Request] = None
) -> Dict[str, Any]:
    """
    Onboard a new user by creating personnel record and role mappings atomically.

    This function performs:
    1. Validates all inputs upfront (email/userId uniqueness, FK references, role mappings)
    2. Creates personnel record
    3. Creates all role mappings for the new personnel
    4. If any step fails after personnel creation, rolls back all changes

    Args:
        data: User onboarding schema with personnel data and role mappings
        created_by: User ID who is creating this record (from token id)
        created_ip: IP address of the creator
        request: FastAPI request object for error logging

    Returns:
        Dictionary with 'personnel' and 'roleMappings' keys

    Raises:
        ValueError: If validation fails or operation cannot be completed
    """
    db = get_database()

    # Step 1: Validate all data upfront
    await _validate_onboarding_data(db, data)

    personnel_id = None
    created_mapping_ids = []

    try:
        # Step 2: Create personnel record
        created_personnel = await _create_personnel_document(db, data, created_by, created_ip)
        personnel_id = created_personnel["_id"]
        rank_id = created_personnel.get("rankId")

        # Step 3: Create role mappings
        created_mappings = []
        for mapping in data.roleMappings:
            created_mapping = await _create_role_mapping(
                db,
                personnel_id,
                rank_id,
                mapping,
                created_by,
                created_ip
            )
            created_mapping_ids.append(created_mapping["_id"])
            created_mappings.append(_convert_objectid_to_str(created_mapping))

        # Step 4: Return combined response
        return {
            "personnel": _convert_document_for_json(created_personnel),
            "roleMappings": created_mappings
        }

    except Exception as e:
        # Rollback on any failure
        await _rollback_onboarding(db, personnel_id, created_mapping_ids)
        raise ValueError(f"Onboarding failed: {str(e)}")


# ==================== UPDATE FUNCTIONS ====================

async def _validate_update_data(db, personnel_id: str, data: UserOnboardingUpdateSchema):
    """
    Validate update data before any database writes.

    Validates:
    - Personnel exists
    - Email uniqueness (if being changed)
    - Personnel foreign keys (units, department, rank) if provided
    - Role mappings validation if provided
    """
    # Check personnel exists
    if not ObjectId.is_valid(personnel_id):
        raise ValueError(f"Invalid personnel ID format: '{personnel_id}'")

    personnel = await db[Collections.PERSONNEL_MASTER].find_one({
        "_id": ObjectId(personnel_id),
        "isDelete": False
    })
    if not personnel:
        raise ValueError(f"Personnel with ID '{personnel_id}' not found or is deleted")

    # Check email uniqueness if being changed
    if data.email:
        existing = await db[Collections.PERSONNEL_MASTER].find_one({
            "email": data.email.lower(),
            "_id": {"$ne": ObjectId(personnel_id)},
            "isDelete": False
        })
        if existing:
            raise ValueError(get_field_error("email_exists"))

    # Validate foreign keys if provided
    update_dict = data.model_dump(exclude_none=True, exclude={"roleMappings"})
    if update_dict:
        # Only validate FK fields that are being updated
        fk_fields = {}
        if "units" in update_dict:
            fk_fields["units"] = update_dict["units"]
        if "departmentId" in update_dict:
            fk_fields["departmentId"] = update_dict["departmentId"]
        if "rankId" in update_dict:
            fk_fields["rankId"] = update_dict["rankId"]

        if fk_fields:
            await validate_personnel_foreign_keys(db, fk_fields)

    # Validate role mappings if provided
    if data.roleMappings:
        for idx, mapping in enumerate(data.roleMappings):
            # Validate existing mapping ID if provided
            if mapping.id:
                if not ObjectId.is_valid(mapping.id):
                    raise ValueError(f"Role mapping [{idx}]: Invalid mapping ID format: '{mapping.id}'")
                existing_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
                    "_id": ObjectId(mapping.id),
                    "userId": ObjectId(personnel_id),
                    "isDelete": False
                })
                if not existing_mapping:
                    raise ValueError(f"Role mapping [{idx}]: Mapping with ID '{mapping.id}' not found for this user")

            # Validate roleId exists
            try:
                await _validate_role(db, mapping.roleId)
            except ValueError as e:
                raise ValueError(f"Role mapping [{idx}]: {str(e)}")

            # Validate unitId exists
            if not ObjectId.is_valid(mapping.unitId):
                raise ValueError(f"Role mapping [{idx}]: Invalid unitId format: '{mapping.unitId}'")

            unit = await db[Collections.UNIT].find_one({
                "_id": ObjectId(mapping.unitId),
                "isDelete": False
            })
            if not unit:
                raise ValueError(f"Role mapping [{idx}]: Unit with ID '{mapping.unitId}' not found or is deleted")

            # Validate additional permissions structure
            if mapping.additionalPermissions:
                try:
                    await _validate_permissions_structure(db, mapping.additionalPermissions)
                except ValueError as e:
                    raise ValueError(f"Role mapping [{idx}] additionalPermissions: {str(e)}")

            # Validate exclusion permissions structure
            if mapping.exclusionPermissions:
                try:
                    await _validate_permissions_structure(db, mapping.exclusionPermissions)
                except ValueError as e:
                    raise ValueError(f"Role mapping [{idx}] exclusionPermissions: {str(e)}")

    return personnel


async def _update_personnel_document(
    db,
    personnel_id: ObjectId,
    data: UserOnboardingUpdateSchema,
    updated_by: str,
    updated_ip: str
) -> dict:
    """
    Update personnel document in database.

    Returns:
        Updated personnel document
    """
    collection = db[Collections.PERSONNEL_MASTER]

    # Get current personnel for comparison
    current_personnel = await collection.find_one({"_id": personnel_id})
    old_unit_ids = extract_unit_ids_from_units(current_personnel.get("units", []))

    # Build update dict - exclude roleMappings and None values
    update_dict = data.model_dump(exclude_none=True, exclude={"roleMappings"})

    if not update_dict:
        return current_personnel  # No personnel fields to update

    # Lowercase email if provided
    if "email" in update_dict:
        update_dict["email"] = update_dict["email"].lower()

    # Convert units array - convert unitId and designationId to ObjectId
    if update_dict.get("units"):
        converted_units = []
        for unit_assignment in update_dict["units"]:
            converted_unit = {}
            if unit_assignment.get("unitId"):
                converted_unit["unitId"] = ObjectId(unit_assignment["unitId"]) if ObjectId.is_valid(unit_assignment["unitId"]) else unit_assignment["unitId"]
            if unit_assignment.get("designationId"):
                converted_unit["designationId"] = ObjectId(unit_assignment["designationId"]) if ObjectId.is_valid(unit_assignment["designationId"]) else unit_assignment["designationId"]
            converted_units.append(converted_unit)
        update_dict["units"] = converted_units

    # Convert departmentId and rankId to ObjectId
    if update_dict.get("departmentId") and ObjectId.is_valid(update_dict["departmentId"]):
        update_dict["departmentId"] = ObjectId(update_dict["departmentId"])
    if update_dict.get("rankId") and ObjectId.is_valid(update_dict["rankId"]):
        update_dict["rankId"] = ObjectId(update_dict["rankId"])

    # Add update metadata
    update_dict["updatedBy"] = ObjectId(updated_by) if updated_by and ObjectId.is_valid(updated_by) else None
    update_dict["updatedAt"] = get_ist_now()
    update_dict["updatedIp"] = updated_ip

    # Update personnel
    await collection.update_one(
        {"_id": personnel_id},
        {"$set": update_dict}
    )

    # Handle unit personnel list updates if units changed
    if "units" in update_dict:
        new_unit_ids = extract_unit_ids_from_units(update_dict.get("units", []))

        # Remove from old units not in new list
        units_to_remove = set(old_unit_ids) - set(new_unit_ids)
        for unit_id in units_to_remove:
            await db[Collections.UNIT].update_one(
                {"_id": unit_id},
                {"$pull": {"unitPersonnelList": personnel_id}}
            )

        # Add to new units not in old list
        units_to_add = set(new_unit_ids) - set(old_unit_ids)
        if units_to_add:
            await add_personnel_to_units(db, personnel_id, list(units_to_add))

    # Fetch and return updated personnel
    updated_personnel = await collection.find_one({"_id": personnel_id})
    return updated_personnel


async def _sync_role_mappings(
    db,
    personnel_id: ObjectId,
    rank_id: ObjectId,
    mappings: List[RoleMappingUpdateItem],
    updated_by: str,
    updated_ip: str
) -> Dict[str, Any]:
    """
    Synchronize role mappings for a personnel.

    - Mappings with _id: Update existing
    - Mappings without _id: Create new
    - Existing mappings not in the list: Soft delete

    Returns:
        Dictionary with updated mappings list and changes summary
    """
    collection = db[Collections.USER_ROLE_PERMISSIONS]

    # Get current mappings for this user
    current_mappings = await collection.find({
        "userId": personnel_id,
        "isDelete": False
    }).to_list(length=None)
    current_mapping_ids = {str(m["_id"]) for m in current_mappings}

    # Track provided mapping IDs
    provided_mapping_ids = {m.id for m in mappings if m.id}

    # Track changes
    changes = {
        "created": 0,
        "updated": 0,
        "deleted": 0
    }

    updated_mappings = []

    # Process each mapping in the request
    for mapping in mappings:
        if mapping.id:
            # Update existing mapping
            mapping_update = {
                "roleId": _to_objectid(mapping.roleId),
                "unitId": _to_objectid(mapping.unitId),
                "rankId": rank_id,
                "additionalPermissions": [],
                "exclusionPermissions": [],
                "updatedBy": ObjectId(updated_by) if updated_by and ObjectId.is_valid(updated_by) else None,
                "updatedAt": get_ist_now(),
                "updatedIp": updated_ip
            }

            # Convert permissions
            if mapping.additionalPermissions:
                permissions_data = [p.model_dump() if hasattr(p, 'model_dump') else p for p in mapping.additionalPermissions]
                mapping_update["additionalPermissions"] = _convert_permissions_moduleids_to_objectid(permissions_data)

            if mapping.exclusionPermissions:
                permissions_data = [p.model_dump() if hasattr(p, 'model_dump') else p for p in mapping.exclusionPermissions]
                mapping_update["exclusionPermissions"] = _convert_permissions_moduleids_to_objectid(permissions_data)

            await collection.update_one(
                {"_id": ObjectId(mapping.id)},
                {"$set": mapping_update}
            )
            changes["updated"] += 1

            updated_mapping = await collection.find_one({"_id": ObjectId(mapping.id)})
            updated_mappings.append(_convert_objectid_to_str(updated_mapping))
        else:
            # Create new mapping
            new_mapping = await _create_role_mapping(
                db,
                personnel_id,
                rank_id,
                mapping,
                updated_by,
                updated_ip
            )
            changes["created"] += 1
            updated_mappings.append(_convert_objectid_to_str(new_mapping))

    # Soft delete mappings not in the provided list
    mappings_to_delete = current_mapping_ids - provided_mapping_ids
    if mappings_to_delete:
        delete_update = {
            "isDelete": True,
            "updatedBy": ObjectId(updated_by) if updated_by and ObjectId.is_valid(updated_by) else None,
            "updatedAt": get_ist_now(),
            "updatedIp": updated_ip
        }
        result = await collection.update_many(
            {"_id": {"$in": [ObjectId(mid) for mid in mappings_to_delete]}},
            {"$set": delete_update}
        )
        changes["deleted"] = result.modified_count

    return {
        "mappings": updated_mappings,
        "changes": changes
    }


async def update_onboarded_user(
    personnel_id: str,
    data: UserOnboardingUpdateSchema,
    updated_by: str,
    updated_ip: str = None,
    request: Optional[Request] = None
) -> Dict[str, Any]:
    """
    Update an onboarded user's personnel record and role mappings.

    This function performs:
    1. Validates all inputs upfront
    2. Updates personnel fields if provided
    3. Syncs role mappings if provided (create/update/delete)

    Args:
        personnel_id: Personnel ID to update
        data: Update schema with personnel fields and/or role mappings
        updated_by: User ID who is updating this record
        updated_ip: IP address of the updater
        request: FastAPI request object for error logging

    Returns:
        Dictionary with 'personnel', 'roleMappings', and 'changes' keys

    Raises:
        ValueError: If validation fails or operation cannot be completed
    """
    db = get_database()

    # Step 1: Validate all data upfront
    personnel = await _validate_update_data(db, personnel_id, data)
    personnel_oid = ObjectId(personnel_id)
    rank_id = personnel.get("rankId")

    # If rankId is being updated, use the new one for role mappings
    if data.rankId and ObjectId.is_valid(data.rankId):
        rank_id = ObjectId(data.rankId)

    changes = {
        "personnel": False,
        "roleMappings": {"created": 0, "updated": 0, "deleted": 0}
    }

    try:
        # Step 2: Update personnel fields if any provided
        personnel_update_fields = data.model_dump(exclude_none=True, exclude={"roleMappings"})
        if personnel_update_fields:
            updated_personnel = await _update_personnel_document(
                db, personnel_oid, data, updated_by, updated_ip
            )
            changes["personnel"] = True
        else:
            updated_personnel = personnel

        # Step 3: Sync role mappings if provided
        if data.roleMappings is not None:
            mapping_result = await _sync_role_mappings(
                db,
                personnel_oid,
                rank_id,
                data.roleMappings,
                updated_by,
                updated_ip
            )
            current_mappings = mapping_result["mappings"]
            changes["roleMappings"] = mapping_result["changes"]
        else:
            # Fetch current mappings without changes
            current_mappings_docs = await db[Collections.USER_ROLE_PERMISSIONS].find({
                "userId": personnel_oid,
                "isDelete": False
            }).to_list(length=None)
            current_mappings = [_convert_objectid_to_str(m) for m in current_mappings_docs]

        # Step 4: Return combined response
        return {
            "personnel": _convert_document_for_json(updated_personnel),
            "roleMappings": current_mappings,
            "changes": changes
        }

    except Exception as e:
        raise ValueError(f"Update failed: {str(e)}")
