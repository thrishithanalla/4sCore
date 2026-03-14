"""
Centralized error and success messages for the application.
This module contains all user-facing messages to ensure consistency
and easy maintenance across the application.
"""

# ===========================
# VALIDATION ERROR MESSAGES
# ===========================

VALIDATION_ERRORS = {
    # Required field errors
    "field_required": "{field_name} is required",
    "field_empty": "{field_name} cannot be empty",
    "field_whitespace_only": "{field_name} cannot contain only whitespace",
    "field_min_alphabets": "{field_name} must contain at least {min_count} alphabetic characters",
    "field_min_length": "{field_name} must be at least {min_length} characters",
    "field_max_length": "{field_name} must not exceed {max_length} characters",

    # Format errors
    "invalid_format": "Invalid {field_name} format",
    "invalid_objectid": "Invalid {field_name} ID format",
    "invalid_email": "Invalid email format",
    "invalid_phone": "Invalid {field_name} format. Must be Indian phone number: +91XXXXXXXXXX, 91XXXXXXXXXX, or XXXXXXXXXX (10 digits)",

    # Name validation errors
    "invalid_name_format": "{field_name} can only contain alphabets, spaces, hyphens (-), and underscores (_)",
    "invalid_department_name_format": "{field_name} can only contain alphabets, spaces, hyphens (-), underscores (_), ampersand (&), and forward slash (/)",
    "invalid_name_no_numbers": "{field_name} cannot contain numbers",

    # User ID validation errors
    "invalid_userid_format": "{field_name} must be exactly 8 digits (numbers only)",
    "invalid_userid_length": "{field_name} must be exactly 8 characters",
    "invalid_userid_numeric": "{field_name} must contain only numbers",

    # CCTNS code validation errors
    "invalid_cctns_format": "{field_name} must contain only numbers",
    "invalid_cctns_required": "{field_name} is required",

    # Badge number validation errors
    "invalid_badge_format": "{field_name} must contain only numbers",

    # Gender validation errors
    "invalid_gender": "{field_name} must be either 'male' or 'female'",

    # Unit name validation errors
    "invalid_unit_name_format": "{field_name} can only contain alphabets, spaces, hyphens (-), underscores (_), and parentheses ()",

    # ZIP code validation errors
    "invalid_zip_format": "{field_name} must be exactly 6 digits",

    # Phone/Landline validation errors
    "invalid_phone_landline_format": "{field_name} must contain only numbers and hyphens (-)",

    # State name validation errors
    "invalid_state_name_format": "{field_name} can only contain alphabets and spaces",

    # Village name validation errors
    "invalid_village_name_format": "{field_name} can only contain alphabets, spaces, and hyphens (-)",

    # Value set validation errors
    "invalid_value_set_key_format": "{field_name} can only contain alphabets and spaces",
    "invalid_value_set_code_format": "{field_name} must follow SCREAMING_SNAKE_CASE format (start with A-Z, contain only A-Z, 0-9, _, -)",
    "invalid_value_set_label_format": "{field_name} must be exactly 2 alphabetic characters (e.g., 'en', 'hi')",
    "duplicate_value_set_code": "Duplicate code '{code}' found in items. All codes must be unique within a value set",
    "duplicate_value_set_label": "Duplicate label '{label}' found for language '{lang}'. Labels must be unique per language",

    # Max length validation
    "field_max_length": "{field_name} must not exceed {max_length} characters",

    # Foreign key errors
    "fk_not_found": "{field_name} not found in {collection_name} collection",
    "fk_deleted": "{field_name} not found in {collection_name} collection (deleted)",

    # Unique constraint errors
    "already_exists": "A record with the same {field_names} already exists",
    "already_exists_active": "An active record with the same {field_names} already exists",
    "already_exists_inactive": "An inactive record with the same {field_names} already exists. Please activate it instead.",
    "already_exists_deleted": "A deleted record with the same {field_names} already exists. Please restore it instead.",
    "duplicate_found": "{field_name} already exists",
}

# ===========================
# SPECIFIC FIELD ERRORS
# ===========================

FIELD_ERRORS = {
    # Personnel fields
    "email_exists": "Email already exists",
    "userId_exists": "User ID already exists",
    "badgeNo_exists": "Badge number already exists",
    "personnel_not_found": "Personnel not found",
    "user_not_found": "User not found",

    # Unit fields
    "policeReferenceId_exists": "Unit with this police reference ID already exists",
    "unit_not_found": "Unit not found",
    "parent_unit_not_found": "Parent unit not found",

    # District validation
    "district_not_found": "District '{district_name}' not found in district master collection. Please select a valid district.",
    "district_deleted": "District '{district_name}' is deleted. Please select a valid district.",

    # UnitVillages
    "village_mapping_exists": "A mapping for this village, mandal, and district already exists",
    "village_mapping_not_found": "Unit-village mapping not found",

    # Department
    "department_not_found": "Department not found",

    # Rank
    "rank_not_found": "Rank not found",

    # Unit Type
    "unitType_not_found": "Unit type not found",

    # Mandal
    "mandal_not_found": "Mandal not found",

    # Value Sets
    "key_exists": "Value set with this key already exists",
    "value_set_not_found": "Value set not found",
    "value_set_not_found_or_deleted": "Value set not found or already deleted",
    "value_set_not_found_or_not_deleted": "Value set not found or not deleted",
    "value_set_already_active": "Value set is already active (not deleted)",

    # Module
    "module_not_found": "Module not found",

    # Error Master
    "error_master_not_found": "Error master not found",
    "error_code_exists": "Error code already exists",

    # Approval Flow Master
    "approval_flow_master_not_found": "Approval flow master not found",

    # Approval Chain
    "approval_chain_not_found": "Approval chain not found",

    # Prompt
    "prompt_not_found": "Prompt not found",

    # Log Master
    "log_master_not_found": "Log master not found",

    # Log Transaction
    "log_not_found": "Log transaction not found",

    # Feedback Master
    "feedback_master_not_found": "Feedback master not found",

    # Feedback
    "feedback_not_found": "Feedback not found",

    # Unit Type
    "unit_type_not_found": "Unit type not found",

    # Data Integrity
    "data_integrity_error": "Data integrity error: {details}",
}

# ===========================
# BUSINESS LOGIC ERRORS
# ===========================

BUSINESS_ERRORS = {
    # Hierarchy errors
    "circular_hierarchy": "Circular hierarchy detected. Cannot set this parent unit.",
    "unit_has_children_id": "Cannot delete unit. This unit is set as a parent for other units.",
    "unit_has_children_path": "Cannot delete unit. This unit appears in the hierarchy path of other units.",

    # Reference constraint errors (cannot delete when mapped to other entities)
    "unit_type_has_units": "Cannot delete unit type. One or more units are mapped to this unit type.",
    "department_has_units": "Cannot delete department. One or more units are mapped to this department.",
    "department_has_unit_types": "Cannot delete department. One or more unit types are mapped to this department.",
    "district_has_units": "Cannot delete district. One or more units are mapped to this district.",
    "district_has_mandals": "Cannot delete district. One or more mandals are mapped to this district.",
    "rank_has_personnel": "Cannot delete rank. One or more personnel are mapped to this rank.",
    "unit_has_personnel": "Cannot delete unit. One or more personnel are assigned to this unit.",
    "unit_has_villages": "Cannot delete unit. One or more villages are mapped to this unit.",
    "designation_has_personnel": "Cannot delete designation. One or more personnel are mapped to this designation.",
    "mandal_has_villages": "Cannot delete mandal. One or more villages are mapped to this mandal.",
    "prompt_has_executions": "Cannot delete prompt. One or more prompt executions reference this prompt.",
    "module_has_prompts": "Cannot delete module. One or more prompts are mapped to this module.",
    "module_has_hierarchy": "Cannot delete module. This module is used in module hierarchy.",
    "role_has_personnel": "Cannot delete role. One or more personnel are assigned to this role.",
    "personnel_is_responsible_user": "Cannot delete personnel. This personnel is assigned as responsible user for one or more units.",
    "entity_in_use": "Cannot delete {entity_name}. It is currently in use by other records.",

    # Update errors
    "no_fields_to_update": "No fields to update",
    "cannot_update_deleted": "Cannot update deleted record",

    # Delete errors
    "already_deleted": "Record already deleted",
    "already_active": "Record is already active (not deleted)",
    "cannot_delete": "Cannot delete this record",

    # Personnel errors
    "personnel_already_active": "Personnel is already active",
    "personnel_already_inactive": "Personnel is already inactive",
    "personnel_already_deleted": "Personnel is already deleted",

    # Approval Flow Master errors
    "approval_flow_master_already_active": "Approval flow master is already active (not deleted)",
    "unit_already_active": "Unit is already active (not deleted)",

    # Approval Chain errors
    "approval_chain_already_active": "Approval chain is already active (not deleted)",

    # Feedback Master errors
    "cannot_activate_deleted": "Cannot activate a deleted record",
    "cannot_deactivate_deleted": "Cannot deactivate a deleted record",
    "already_inactive": "Record is already inactive",
}

# ===========================
# SUCCESS MESSAGES
# ===========================

SUCCESS_MESSAGES = {
    # Create
    "created": "{resource} created successfully",

    # Update
    "updated": "{resource} updated successfully",

    # Delete
    "deleted": "{resource} deleted successfully",
    "soft_deleted": "{resource} marked as deleted successfully",

    # Specific resources
    "personnel_deleted": "Personnel deleted successfully",
    "personnel_restored": "Personnel restored successfully",
    "unit_deleted": "Unit deleted successfully",
    "village_mapping_deleted": "Unit-village mapping deleted successfully",
    "village_mapping_not_found_or_deleted": "Unit-village mapping not found or already deleted",
    "value_set_deleted": "Value set deleted successfully",
    "value_set_archived": "Value set archived successfully",
    "value_set_activated": "Value set activated successfully",
    "value_set_restored": "Value set restored successfully",
    "cache_refreshed": "Cache refreshed successfully",
    "unit_restored": "Unit restored successfully",

    # Approval Flow Master
    "approval_flow_master_deleted": "Approval flow master deleted successfully",
    "approval_flow_master_restored": "Approval flow master restored successfully",

    # Approval Chain
    "approval_chain_deleted": "Approval chain deleted successfully",
    "approval_chain_restored": "Approval chain restored successfully",
}

# ===========================
# AUTHENTICATION MESSAGES
# ===========================

AUTH_MESSAGES = {
    # Login validation
    "invalid_credentials": "Invalid userId or password",
    "userid_required": "userId is required",
    "password_required": "password is required",
    "userid_password_required": "userId and password are required",
    "password_min_length": "password must be at least 8 characters",
    "user_id_required": "User ID is required",
    "userid_not_found": "userId not found or invalid",
    "userid_deleted": "userId not found or invalid",

    # Token validation
    "token_expired": "Token has expired",
    "token_invalid": "Invalid authentication token",
    "incomplete_token": "Token must contain id, unitId, and roleId. Use /get-auth-token to generate a valid token.",

    # Auth token generation
    "unitid_required": "unitId is required",
    "roleid_required": "roleId is required",
    "unitid_roleid_required": "unitId and roleId are required",
    "access_denied": "User does not have access to the specified unitId and roleId combination",

    # General auth
    "unauthorized": "Unauthorized access",
    "user_not_found": "User not found",
    "user_inactive": "User account is inactive",
    "insufficient_permissions": "Insufficient permissions to perform this action",
}

# ===========================
# ERROR CODE MAPPING
# Maps message keys to their corresponding error codes from ErrorCodes class
# ===========================

AUTH_ERROR_CODES = {
    # Login validation
    "invalid_credentials": "ERR.CORE.AUTH.INVALID_CREDENTIALS",
    "userid_required": "ERR.CORE.AUTH.INVALID_USER_ID",
    "password_required": "ERR.CORE.AUTH.MISSING_REQUIRED_FIELDS",
    "userid_password_required": "ERR.CORE.AUTH.MISSING_REQUIRED_FIELDS",
    "password_min_length": "ERR.CORE.AUTH.INVALID_CREDENTIALS",
    "user_id_required": "ERR.CORE.AUTH.INVALID_USER_ID",
    "userid_not_found": "ERR.CORE.AUTH.USER_NOT_FOUND",
    "userid_deleted": "ERR.CORE.AUTH.USER_DELETED",

    # Token validation
    "token_expired": "ERR.CORE.AUTH.TOKEN_INVALID",
    "token_invalid": "ERR.CORE.AUTH.TOKEN_INVALID",
    "incomplete_token": "ERR.CORE.AUTH.INCOMPLETE_TOKEN",

    # Auth token generation
    "unitid_required": "ERR.CORE.AUTH.MISSING_UNIT_ID",
    "roleid_required": "ERR.CORE.AUTH.MISSING_ROLE_ID",
    "unitid_roleid_required": "ERR.CORE.AUTH.MISSING_REQUIRED_FIELDS",
    "access_denied": "ERR.CORE.AUTH.ACCESS_DENIED",

    # General auth
    "unauthorized": "ERR.CORE.AUTH.PERMISSION_DENIED",
    "user_not_found": "ERR.CORE.AUTH.USER_NOT_FOUND",
    "user_inactive": "ERR.CORE.AUTH.USER_DELETED",
    "insufficient_permissions": "ERR.CORE.AUTH.PERMISSION_DENIED",
}

# Generic validation error codes mapping
VALIDATION_ERROR_CODES = {
    "email_exists": "ERR.CORE.PERSONNEL.CREATE.DUPLICATE_EMAIL",
    "userId_exists": "ERR.CORE.PERSONNEL.USERID_EXISTS",
    "personnel_not_found": "ERR.CORE.PERSONNEL.GET.NOT_FOUND",
    "user_not_found": "ERR.CORE.USER.NOT_FOUND",
}


def get_auth_message(message_key: str, **kwargs) -> str:
    """
    Get an authentication message with formatted parameters.

    Args:
        message_key: Key from AUTH_MESSAGES dict
        **kwargs: Parameters to format the message

    Returns:
        Formatted auth message
    """
    message = AUTH_MESSAGES.get(message_key, message_key)
    if kwargs:
        try:
            return message.format(**kwargs)
        except KeyError:
            return message
    return message


def get_auth_message_with_code(message_key: str, **kwargs) -> str:
    """
    Get an authentication message with embedded error code.
    The error code is embedded in the format: [ERR_CODE:xxx]message
    This allows the exception handler to extract and use the error code.

    Args:
        message_key: Key from AUTH_MESSAGES dict
        **kwargs: Parameters to format the message

    Returns:
        Formatted auth message with embedded error code

    Example:
        get_auth_message_with_code("userid_required")
        # Returns: "[ERR_CODE:ERR.CORE.AUTH.INVALID_USER_ID]userId is required"
    """
    message = AUTH_MESSAGES.get(message_key, message_key)
    error_code = AUTH_ERROR_CODES.get(message_key, "ERR.CORE.VALIDATION.REQUEST.FAILED")

    if kwargs:
        try:
            message = message.format(**kwargs)
        except KeyError:
            pass

    # Embed error code at the start of message
    return f"[ERR_CODE:{error_code}]{message}"


def extract_error_code_from_message(message: str) -> tuple:
    """
    Extract error code from a message that may contain embedded error code.

    Args:
        message: Error message that may contain [ERR_CODE:xxx] prefix

    Returns:
        Tuple of (error_code, clean_message)
        If no error code found, returns (None, original_message)

    Example:
        extract_error_code_from_message("[ERR_CODE:ERR.CORE.AUTH.INVALID_USER_ID]userId is required")
        # Returns: ("ERR.CORE.AUTH.INVALID_USER_ID", "userId is required")
    """
    import re
    pattern = r'^\[ERR_CODE:([^\]]+)\](.*)$'
    match = re.match(pattern, message)

    if match:
        return match.group(1), match.group(2)
    return None, message

# ===========================
# HELPER FUNCTIONS
# ===========================

def get_validation_error(error_key: str, **kwargs) -> str:
    """
    Get a validation error message with formatted parameters.

    Args:
        error_key: Key from VALIDATION_ERRORS dict
        **kwargs: Parameters to format the message

    Returns:
        Formatted error message

    Example:
        get_validation_error("fk_not_found", field_name="departmentId", collection_name="department")
        # Returns: "departmentId not found in department collection"
    """
    message = VALIDATION_ERRORS.get(error_key, "Validation error")
    return message.format(**kwargs)


def get_field_error(error_key: str, **kwargs) -> str:
    """
    Get a field-specific error message with formatted parameters.

    Args:
        error_key: Key from FIELD_ERRORS dict
        **kwargs: Parameters to format the message

    Returns:
        Formatted error message

    Example:
        get_field_error("district_not_found", district_name="Hyderabad")
        # Returns: "District 'Hyderabad' not found in district master collection..."
    """
    message = FIELD_ERRORS.get(error_key, "Field validation error")
    return message.format(**kwargs)


def get_business_error(error_key: str, **kwargs) -> str:
    """
    Get a business logic error message with formatted parameters.

    Args:
        error_key: Key from BUSINESS_ERRORS dict
        **kwargs: Parameters to format the message

    Returns:
        Formatted error message
    """
    message = BUSINESS_ERRORS.get(error_key, "Business logic error")
    return message.format(**kwargs)


def get_success_message(message_key: str, **kwargs) -> str:
    """
    Get a success message with formatted parameters.

    Args:
        message_key: Key from SUCCESS_MESSAGES dict
        **kwargs: Parameters to format the message

    Returns:
        Formatted success message

    Example:
        get_success_message("deleted", resource="Personnel")
        # Returns: "Personnel deleted successfully"
    """
    message = SUCCESS_MESSAGES.get(message_key, "Operation successful")
    return message.format(**kwargs)


def get_auth_message(message_key: str, **kwargs) -> str:
    """
    Get an authentication message with formatted parameters.

    Args:
        message_key: Key from AUTH_MESSAGES dict
        **kwargs: Parameters to format the message

    Returns:
        Formatted auth message
    """
    message = AUTH_MESSAGES.get(message_key, "Authentication error")
    return message.format(**kwargs)