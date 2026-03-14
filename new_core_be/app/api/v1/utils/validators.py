"""
Validation utilities for foreign key constraints and business rules
"""
import re
from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.utils.error_messages import get_validation_error, get_field_error, get_business_error
from app.constants.collections import Collections


# ===========================
# COMMON FIELD VALIDATORS
# ===========================

# Regex pattern for name validation: alphabets, spaces, hyphens, underscores only
NAME_PATTERN = re.compile(r'^[a-zA-Z\s\-_]+$')

# Regex pattern for department name validation: alphabets, spaces, hyphens, underscores, & and / allowed
DEPARTMENT_NAME_PATTERN = re.compile(r'^[a-zA-Z\s\-_&/]+$')

# Regex pattern for unit name validation: alphabets, spaces, hyphens, underscores, parentheses
UNIT_NAME_PATTERN = re.compile(r'^[a-zA-Z\s\-_()\s]+$')

# Regex pattern for numeric string validation: numbers only
NUMERIC_STRING_PATTERN = re.compile(r'^\d+$')

# Regex pattern for userId validation: exactly 8 digits
USERID_PATTERN = re.compile(r'^\d{8}$')

# Regex pattern for ZIP code validation: exactly 6 digits
ZIP_PATTERN = re.compile(r'^\d{6}$')

# Regex pattern for phone/landline validation: numbers and hyphens only
PHONE_LANDLINE_PATTERN = re.compile(r'^[\d\-]+$')

# Regex pattern for policeReferenceId validation: alphanumeric, hyphens, underscores only
POLICE_REFERENCE_ID_PATTERN = re.compile(r'^[a-zA-Z0-9\-_]+$')

# Regex pattern for stateName validation: alphabets and spaces only
STATE_NAME_PATTERN = re.compile(r'^[a-zA-Z\s]+$')

# Regex pattern for villageName validation: alphabets, spaces, hyphens only
VILLAGE_NAME_PATTERN = re.compile(r'^[a-zA-Z\s\-]+$')

# Regex pattern for value set key validation: alphabets and spaces only (case insensitive)
VALUE_SET_KEY_PATTERN = re.compile(r'^[a-zA-Z\s]+$')

# Regex pattern for value set item code: SCREAMING_SNAKE_CASE (A-Z, 0-9, _, -)
VALUE_SET_CODE_PATTERN = re.compile(r'^[A-Z][A-Z0-9_\-]{0,63}$')

# Regex pattern for value set label: 2 characters short name
VALUE_SET_LABEL_PATTERN = re.compile(r'^[A-Za-z]{2}$')


def validate_name_field(value: str, field_name: str, min_alphabets: int = 2) -> str:
    """
    Validate a name field: alphabets, spaces, hyphens, underscores only.
    Must have at least min_alphabets alphabet characters.
    No empty strings or whitespace only.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)
        min_alphabets: Minimum number of alphabet characters required

    Returns:
        The validated value (stripped)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    # Check pattern (alphabets, spaces, hyphens, underscores only)
    if not NAME_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_name_format", field_name=field_name))

    # Count alphabet characters
    alpha_count = sum(1 for c in stripped if c.isalpha())
    if alpha_count < min_alphabets:
        raise ValueError(get_validation_error("field_min_alphabets", field_name=field_name, min_count=min_alphabets))

    return stripped


def validate_department_name_field(value: str, field_name: str, min_alphabets: int = 2) -> str:
    """
    Validate a department name field: alphabets, spaces, hyphens, underscores, & and / allowed.
    Must have at least min_alphabets alphabet characters.
    No empty strings or whitespace only.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)
        min_alphabets: Minimum number of alphabet characters required

    Returns:
        The validated value (stripped)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    # Check pattern (alphabets, spaces, hyphens, underscores, & and / allowed)
    if not DEPARTMENT_NAME_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_department_name_format", field_name=field_name))

    # Count alphabet characters
    alpha_count = sum(1 for c in stripped if c.isalpha())
    if alpha_count < min_alphabets:
        raise ValueError(get_validation_error("field_min_alphabets", field_name=field_name, min_count=min_alphabets))

    return stripped


def validate_userid_field(value: str, field_name: str = "userId") -> str:
    """
    Validate userId field: exactly 8 digits, numbers only.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value (stripped)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    # Check length
    if len(stripped) != 8:
        raise ValueError(get_validation_error("invalid_userid_length", field_name=field_name))

    # Check if numeric only
    if not USERID_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_userid_format", field_name=field_name))

    return stripped


def validate_numeric_string_field(value: str, field_name: str) -> str:
    """
    Validate a string field that should contain only numbers.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value (stripped)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    # Check if contains only numbers
    if not NUMERIC_STRING_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_cctns_format", field_name=field_name))

    return stripped


def validate_required_int_field(value: int, field_name: str) -> int:
    """
    Validate a required integer field.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    return value


def validate_required_string_field(value, field_name: str) -> str:
    """
    Validate a required string field (not empty, not whitespace only).

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value (stripped)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Ensure value is a string
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string, got {type(value).__name__}")

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    return stripped


def validate_badge_number_field(value: str, field_name: str = "badgeNo") -> str:
    """
    Validate badgeNo field: string containing only numbers.
    Optional field - returns None if value is None or empty.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value (stripped) or None

    Raises:
        ValueError: If validation fails
    """
    if value is None or value == "":
        return None

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        return None

    # Check if contains only numbers
    if not NUMERIC_STRING_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_badge_format", field_name=field_name))

    return stripped


# Valid gender values
VALID_GENDERS = {"male", "female"}


def validate_gender_field(value: str, field_name: str = "gender") -> str:
    """
    Validate gender field: must be either 'male' or 'female'.
    Optional field - returns None if value is None or empty.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value (lowercase) or None

    Raises:
        ValueError: If validation fails
    """
    if value is None or value == "":
        return None

    # Strip whitespace and convert to lowercase
    stripped = value.strip().lower()

    # Check if empty after stripping
    if not stripped:
        return None

    # Check if valid gender value
    if stripped not in VALID_GENDERS:
        raise ValueError(get_validation_error("invalid_gender", field_name=field_name))

    return stripped


def validate_unit_name_field(value: str, field_name: str, min_alphabets: int = 2) -> str:
    """
    Validate unit name field: alphabets, spaces, hyphens, underscores, parentheses only.
    Must have at least min_alphabets alphabet characters.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)
        min_alphabets: Minimum number of alphabet characters required

    Returns:
        The validated value (stripped)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    # Check pattern (alphabets, spaces, hyphens, underscores, parentheses only)
    if not UNIT_NAME_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_unit_name_format", field_name=field_name))

    # Count alphabet characters
    alpha_count = sum(1 for c in stripped if c.isalpha())
    if alpha_count < min_alphabets:
        raise ValueError(get_validation_error("field_min_alphabets", field_name=field_name, min_count=min_alphabets))

    return stripped


def validate_zip_field(value: str, field_name: str = "zip") -> str:
    """
    Validate ZIP code field: exactly 6 digits.
    Optional field - returns None if value is None or empty.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value (stripped) or None

    Raises:
        ValueError: If validation fails
    """
    if value is None or value == "":
        return None

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        return None

    # Check if exactly 6 digits
    if not ZIP_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_zip_format", field_name=field_name))

    return stripped


def validate_phone_landline_field(value: str, field_name: str = "phone") -> str:
    """
    Validate phone/landline field: only numbers and hyphens allowed.
    Optional field - returns None if value is None or empty.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value (stripped) or None

    Raises:
        ValueError: If validation fails
    """
    if value is None or value == "":
        return None

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        return None

    # Check if contains only numbers and hyphens
    if not PHONE_LANDLINE_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_phone_landline_format", field_name=field_name))

    return stripped


def validate_phone_list_landline(value: list, field_name: str = "phone") -> list:
    """
    Validate a list of phone numbers (landline format - numbers and hyphens only).
    Optional field - returns None if value is None or empty list.

    Args:
        value: List of phone numbers to validate
        field_name: Name of the field (for error messages)

    Returns:
        List of validated phone numbers or None

    Raises:
        ValueError: If any validation fails
    """
    if value is None or len(value) == 0:
        return None

    validated_phones = []
    for idx, phone in enumerate(value):
        validated = validate_phone_landline_field(phone, f"{field_name}[{idx}]")
        if validated:
            validated_phones.append(validated)

    return validated_phones if validated_phones else None


def validate_state_name_field(value: str, field_name: str = "stateName", min_length: int = 2) -> str:
    """
    Validate stateName field: alphabets and spaces only, min 2 characters when provided.
    Optional field - returns None if value is None or empty.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)
        min_length: Minimum length required (default 2)

    Returns:
        The validated value (stripped) or None

    Raises:
        ValueError: If validation fails
    """
    if value is None or value == "":
        return None

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        return None

    # Check minimum length
    if len(stripped) < min_length:
        raise ValueError(get_validation_error("field_min_length", field_name=field_name, min_length=min_length))

    # Check pattern (alphabets and spaces only)
    if not STATE_NAME_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_state_name_format", field_name=field_name))

    return stripped


def validate_value_set_key_field(value: str, field_name: str = "key", max_length: int = 120) -> str:
    """
    Validate value set key field: alphabets and spaces only (case insensitive).
    No empty strings or whitespace only.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)
        max_length: Maximum allowed length (default 120)

    Returns:
        The validated value (stripped, lowercased)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    # Check max length
    if len(stripped) > max_length:
        raise ValueError(get_validation_error("field_max_length", field_name=field_name, max_length=max_length))

    # Check pattern (alphabets and spaces only)
    if not VALUE_SET_KEY_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_value_set_key_format", field_name=field_name))

    return stripped


def validate_value_set_code_field(value: str, field_name: str = "code") -> str:
    """
    Validate value set item code field: SCREAMING_SNAKE_CASE format.
    Must start with letter, contain only A-Z, 0-9, _, -

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value (stripped, uppercased)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Strip whitespace and uppercase
    stripped = value.strip().upper()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    # Check pattern (SCREAMING_SNAKE_CASE)
    if not VALUE_SET_CODE_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_value_set_code_format", field_name=field_name))

    return stripped


def validate_value_set_label_key(value: str, field_name: str = "label key") -> str:
    """
    Validate value set label key: exactly 2 alphabetic characters (e.g., 'en', 'hi').

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)

    Returns:
        The validated value (stripped, lowercased)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Strip whitespace and lowercase
    stripped = value.strip().lower()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    # Check pattern (exactly 2 alphabets)
    if not VALUE_SET_LABEL_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_value_set_label_format", field_name=field_name))

    return stripped


async def validate_module_exists(db, module_name: str, field_name: str = "module") -> bool:
    """
    Validate that module name exists in module_master collection (case insensitive).

    Args:
        db: Database instance
        module_name: Name of the module to validate
        field_name: Name of the field (for error messages)

    Returns:
        True if validation passes

    Raises:
        HTTPException: If module not found
    """
    if not module_name:
        return True  # Module is optional

    # Strip and check
    stripped = module_name.strip()
    if not stripped:
        return True

    # Check if module exists (case insensitive)
    from app.constants.collections import Collections
    module = await db[Collections.MODULES].find_one({
        "name": {"$regex": f"^{stripped}$", "$options": "i"},
        "$or": [
            {"isDelete": False},
            {"isDelete": {"$exists": False}, "isDeleted": {"$ne": True}}
        ]
    })

    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_validation_error("fk_not_found", field_name=field_name, collection_name="modules_master")
        )

    return True


def validate_village_name_field(value: str, field_name: str = "villageName", max_length: int = 200) -> str:
    """
    Validate villageName field: alphabets, spaces, hyphens only, max 200 chars.
    Required field.

    Args:
        value: The value to validate
        field_name: Name of the field (for error messages)
        max_length: Maximum allowed length (default 200)

    Returns:
        The validated value (stripped)

    Raises:
        ValueError: If validation fails
    """
    if value is None:
        raise ValueError(get_validation_error("field_required", field_name=field_name))

    # Strip whitespace
    stripped = value.strip()

    # Check if empty after stripping
    if not stripped:
        raise ValueError(get_validation_error("field_whitespace_only", field_name=field_name))

    # Check max length
    if len(stripped) > max_length:
        raise ValueError(get_validation_error("field_max_length", field_name=field_name, max_length=max_length))

    # Check pattern (alphabets, spaces, hyphens only)
    if not VILLAGE_NAME_PATTERN.match(stripped):
        raise ValueError(get_validation_error("invalid_village_name_format", field_name=field_name))

    return stripped


async def validate_foreign_key(
    db: AsyncIOMotorDatabase,
    collection_name: str,
    field_name: str,
    field_value: str,
    required: bool = True
) -> bool:
    """
    Validate that a foreign key reference exists in the target collection

    Args:
        db: Database instance
        collection_name: Name of the collection to check
        field_name: Name of the field being validated (for error messages)
        field_value: The ObjectId value to validate
        required: Whether the field is required (if False and value is None, validation passes)

    Returns:
        True if validation passes

    Raises:
        HTTPException: If validation fails
    """
    # If field is not required and value is None/empty, validation passes
    if not required and (field_value is None or field_value == ""):
        return True

    # If field is required and value is None/empty, raise error
    if required and (field_value is None or field_value == ""):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("field_required", field_name=field_name)
        )

    # Validate ObjectId format
    if not ObjectId.is_valid(field_value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name=field_name)
        )

    # Check if the referenced document exists
    collection = db[collection_name]
    object_id = ObjectId(field_value)

    doc = await collection.find_one({"_id": object_id})

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_validation_error("fk_not_found", field_name=field_name, collection_name=collection_name)
        )

    # Check if document is deleted (check both isDeleted and isDelete for compatibility)
    is_deleted = doc.get("isDeleted", doc.get("isDelete", False))

    if is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_validation_error("fk_deleted", field_name=field_name, collection_name=collection_name)
        )

    return True


async def validate_unique_constraint(
    db: AsyncIOMotorDatabase,
    collection_name: str,
    field_dict: dict,
    exclude_id: str = None,
    include_deleted: bool = False
) -> bool:
    """
    Validate that a combination of fields is unique in the collection

    Args:
        db: Database instance
        collection_name: Name of the collection to check
        field_dict: Dictionary of field names and values to check for uniqueness
        exclude_id: Optional document ID to exclude from check (for updates)
        include_deleted: If True, also check against deleted records (default: False)

    Returns:
        True if validation passes

    Raises:
        HTTPException: If validation fails (duplicate found)
    """
    collection = db[collection_name]

    # Build query
    query = {**field_dict}

    # Only filter by isDelete if we're not including deleted records
    if not include_deleted:
        query["$or"] = [{"isDelete": False}, {"isDelete": {"$exists": False}}]

    # Exclude current document if updating
    if exclude_id and ObjectId.is_valid(exclude_id):
        query["_id"] = {"$ne": ObjectId(exclude_id)}

    # Check if document with these field values already exists
    existing = await collection.find_one(query)

    if existing:
        field_names = ", ".join(field_dict.keys())
        # Provide different error message if the existing record is deleted
        if include_deleted and existing.get("isDelete", False):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=get_validation_error("already_exists_deleted", field_names=field_names)
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=get_validation_error("already_exists", field_names=field_names)
        )

    return True


async def validate_personnel_not_deleted(db: AsyncIOMotorDatabase, personnel_id: str):
    """
    Validate that a personnel master record exists and is not deleted.
    Use this when fetching a personnel by ID.

    Args:
        db: Database instance
        personnel_id: The personnel ID to check

    Returns:
        The personnel document if found and not deleted

    Raises:
        HTTPException: If personnel not found or is deleted
    """
    if not personnel_id or not ObjectId.is_valid(personnel_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("invalid_objectid", field_name="personnelId")
        )

    collection = db[Collections.PERSONNEL_MASTER]
    personnel = await collection.find_one({"_id": ObjectId(personnel_id)})

    if not personnel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("personnel_not_found")
        )

    if personnel.get("isDelete", False):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("personnel_not_found")
        )

    return personnel


async def validate_units_array(
    db: AsyncIOMotorDatabase,
    units: list,
    is_create: bool = True
) -> bool:
    """
    Validate units array - check that all unitIds and designationIds exist in respective collections

    Args:
        db: Database instance
        units: List of unit assignment objects [{unitId, designationId}, ...]
        is_create: Whether this is a create operation (at least one required) or update

    Returns:
        True if validation passes

    Raises:
        HTTPException: If any validation fails
    """
    if not units:
        if is_create:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("field_required", field_name="units")
            )
        return True

    for idx, unit_assignment in enumerate(units):
        unit_id = unit_assignment.get("unitId")
        designation_id = unit_assignment.get("designationId")

        # Validate unitId (required in each object)
        if not unit_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=get_validation_error("field_required", field_name=f"units[{idx}].unitId")
            )

        # Check unitId exists in unit collection (use correct collection name)
        await validate_foreign_key(
            db, Collections.UNIT, f"units[{idx}].unitId", unit_id, required=True
        )

        # Validate designationId if provided
        if designation_id:
            await validate_foreign_key(
                db, Collections.DESIGNATION_MASTER, f"units[{idx}].designationId", designation_id, required=False
            )

    return True


async def validate_personnel_foreign_keys(db: AsyncIOMotorDatabase, personnel_data: dict, is_create: bool = True):
    """
    Validate all foreign key constraints for personnel_master collection

    Args:
        db: Database instance
        personnel_data: Personnel document data
        is_create: Whether this is a create operation (units required) or update (units optional)

    Raises:
        HTTPException: If any validation fails
    """
    # Validate units array (required for create, optional for update)
    units = personnel_data.get("units")
    if is_create:
        # For create, units is required
        await validate_units_array(db, units, is_create=True)
    elif units:
        # For update, only validate if provided
        await validate_units_array(db, units, is_create=False)

    # Validate departmentId (required FK for create, optional for update)
    if is_create:
        await validate_foreign_key(
            db, Collections.DEPARTMENT, "departmentId", personnel_data.get("departmentId"), required=True
        )
    elif personnel_data.get("departmentId"):
        await validate_foreign_key(
            db, Collections.DEPARTMENT, "departmentId", personnel_data["departmentId"], required=False
        )

    # Validate rankId (required FK for create, optional for update)
    if is_create:
        await validate_foreign_key(
            db, Collections.RANK_MASTER, "rankId", personnel_data.get("rankId"), required=True
        )
    elif personnel_data.get("rankId"):
        await validate_foreign_key(
            db, Collections.RANK_MASTER, "rankId", personnel_data["rankId"], required=False
        )

    return True


async def validate_unit_foreign_keys(db: AsyncIOMotorDatabase, unit_data: dict, is_create: bool = True):
    """
    Validate all foreign key constraints for unit collection

    Args:
        db: Database instance
        unit_data: Unit document data
        is_create: Whether this is a create operation (some fields required) or update

    Raises:
        HTTPException: If any validation fails
    """
    # Validate districtId (required for create, optional for update)
    if is_create:
        await validate_foreign_key(
            db, Collections.DISTRICT, "districtId", unit_data.get("districtId"), required=True
        )
    elif unit_data.get("districtId"):
        await validate_foreign_key(
            db, Collections.DISTRICT, "districtId", unit_data["districtId"], required=False
        )

    # Validate responsibleUserId (required for create, optional for update)
    if is_create:
        await validate_foreign_key(
            db, Collections.PERSONNEL_MASTER, "responsibleUserId", unit_data.get("responsibleUserId"), required=True
        )
    elif unit_data.get("responsibleUserId"):
        await validate_foreign_key(
            db, Collections.PERSONNEL_MASTER, "responsibleUserId", unit_data["responsibleUserId"], required=False
        )

    # Validate departmentId (optional FK)
    if unit_data.get("departmentId"):
        await validate_foreign_key(
            db, Collections.DEPARTMENT, "departmentId", unit_data["departmentId"], required=False
        )

    # Validate unitTypeId (optional FK)
    if unit_data.get("unitTypeId"):
        await validate_foreign_key(
            db, Collections.UNIT_TYPE, "unitTypeId", unit_data["unitTypeId"], required=False
        )

    # Validate proxyUserId (optional FK)
    if unit_data.get("proxyUserId"):
        await validate_foreign_key(
            db, Collections.PERSONNEL_MASTER, "proxyUserId", unit_data["proxyUserId"], required=False
        )

    # Validate parentUnitId (optional FK)
    if unit_data.get("parentUnitId"):
        await validate_foreign_key(
            db, Collections.UNIT, "parentUnitId", unit_data["parentUnitId"], required=False
        )

    return True


async def validate_district_name_exists(db: AsyncIOMotorDatabase, name: str):
    """
    Validate that a district name exists in the district master collection

    Args:
        db: Database instance
        name: Name of the district to validate

    Raises:
        HTTPException: If district name not found
    """
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=get_validation_error("field_required", field_name="District name")
        )

    # Check if district exists by district field name
    collection = db[Collections.DISTRICT]

    # First, check with 'district' field (your actual field name)
    district_doc = await collection.find_one({"district": name})

    # If not found, try with 'name' field (standard naming)
    if not district_doc:
        district_doc = await collection.find_one({"name": name})

    if not district_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("district_not_found", district_name=name)
        )

    # Check if document is deleted (check both isDeleted and isDelete for compatibility)
    is_deleted = district_doc.get("isDeleted", district_doc.get("isDelete", False))

    if is_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=get_field_error("district_deleted", district_name=name)
        )

    return True


async def validate_unit_villages_foreign_keys(db: AsyncIOMotorDatabase, unit_villages_data: dict):
    """
    Validate all foreign key constraints for unitVillages collection

    Args:
        db: Database instance
        unit_villages_data: UnitVillages document data

    Raises:
        HTTPException: If any validation fails
    """
    # Validate unitId (required FK)
    await validate_foreign_key(
        db, Collections.UNIT, "unitId", unit_villages_data.get("unitId"), required=True
    )

    # Validate district name exists in district collection
    if unit_villages_data.get("district"):
        await validate_district_name_exists(db, unit_villages_data.get("district"))

    return True


async def validate_unit_villages_unique_constraint(
    db: AsyncIOMotorDatabase,
    village: str,
    mandal: str,
    district: str,
    exclude_id: str = None
):
    """
    Validate unique constraint for unitVillages: village + mandal + district

    Args:
        db: Database instance
        village: Village name
        mandal: Mandal name
        district: District name
        exclude_id: Optional document ID to exclude from check (for updates)

    Raises:
        HTTPException: If validation fails (duplicate found)
    """
    await validate_unique_constraint(
        db,
        Collections.UNIT_VILLAGES,
        {"village": village, "mandal": mandal, "district": district},
        exclude_id
    )

    return True


async def validate_user_mapping_foreign_keys(db: AsyncIOMotorDatabase, user_mapping_data: dict, is_create: bool = True):
    """
    Validate all foreign key constraints for user_mapping collection

    Args:
        db: Database instance
        user_mapping_data: UserMapping document data
        is_create: Whether this is a create operation (unitId required) or update (unitId optional)

    Raises:
        HTTPException: If any validation fails
    """
    # Validate unitId (required FK for both create and update when provided)
    # Note: Format validation is done in schema, this checks DB existence
    if is_create:
        # For create, unitId is required
        await validate_foreign_key(
            db, Collections.UNIT, "unitId", user_mapping_data.get("unitId"), required=True
        )
    elif user_mapping_data.get("unitId"):
        # For update, only validate if provided
        await validate_foreign_key(
            db, Collections.UNIT, "unitId", user_mapping_data["unitId"], required=False
        )

    # Validate roleId (required FK)
    if user_mapping_data.get("roleId"):
        await validate_foreign_key(
            db, Collections.ROLES, "roleId", user_mapping_data["roleId"], required=is_create
        )

    # Validate userId (required FK to personnel)
    if user_mapping_data.get("userId"):
        await validate_foreign_key(
            db, Collections.PERSONNEL_MASTER, "userId", user_mapping_data["userId"], required=is_create
        )

    return True


async def validate_mandal_foreign_keys(db: AsyncIOMotorDatabase, mandal_data: dict, is_create: bool = True):
    """
    Validate all foreign key constraints for mandal collection

    Args:
        db: Database instance
        mandal_data: Mandal document data
        is_create: Whether this is a create operation (districtId required) or update (districtId optional)

    Raises:
        HTTPException: If any validation fails
    """
    # Validate districtId (required FK)
    # Note: Format validation is done in schema, this checks DB existence
    if is_create:
        # For create, districtId is required
        await validate_foreign_key(
            db, Collections.DISTRICT, "districtId", mandal_data.get("districtId"), required=True
        )
    elif mandal_data.get("districtId"):
        # For update, only validate if provided
        await validate_foreign_key(
            db, Collections.DISTRICT, "districtId", mandal_data["districtId"], required=False
        )

    return True