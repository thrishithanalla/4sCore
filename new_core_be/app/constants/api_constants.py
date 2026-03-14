"""
API Constants
Centralized error codes and messages for all modules
Generic and reusable across collections
"""


class ErrorCodes:
    """Generic error codes - use with module prefix"""
    VALIDATION = "VALIDATION"
    NOT_FOUND = "NOT_FOUND"
    ALREADY_EXISTS = "ALREADY_EXISTS"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    AUTH = "AUTH"
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    RESTORE = "RESTORE"
    ACTIVATE = "ACTIVATE"
    DEACTIVATE = "DEACTIVATE"
    ACTIVE = "ACTIVE"
    LIST = "LIST"
    READ = "READ"
    BULK_CREATE = "BULK_CREATE"
    INTERNAL = "INTERNAL"

    @staticmethod
    def with_prefix(prefix: str, code: str) -> str:
        """Generate error code with module prefix"""
        return f"ERR.{prefix}.{code}"


class SuccessMessages:
    """Generic success messages - format with entity name"""
    CREATED = "{} created successfully"
    UPDATED = "{} updated successfully"
    DELETED = "{} deleted successfully"
    RESTORED = "{} restored successfully"
    ACTIVATED = "{} activated successfully"
    DEACTIVATED = "{} deactivated successfully"
    FETCHED = "{} fetched successfully"
    LIST_FETCHED = "{}s fetched successfully"
    BULK_CREATED = "Bulk create completed successfully"
    BULK_PARTIAL = "Bulk operation partially completed ({}/{} succeeded)"
    BULK_FAILED = "Bulk operation failed"
    EXECUTED = "{} executed successfully"
    BULK_EXECUTED = "{} bulk executed successfully"

    @staticmethod
    def format(message: str, entity: str) -> str:
        """Format message with entity name"""
        return message.format(entity)


class ErrorMessages:
    """Generic error messages - format with entity name or values"""
    NOT_FOUND = "{} not found"
    NOT_FOUND_OR_DELETED = "{} not found or already deleted"
    NOT_FOUND_OR_NOT_DELETED = "{} not found or not deleted"
    ALREADY_EXISTS = "{} already exists"
    NAME_EXISTS = "{} with name '{}' already exists"
    CODE_EXISTS = "{} with code '{}' already exists"
    FIELD_EXISTS = "{} with {} '{}' already exists"
    USER_ID_NOT_FOUND = "User ID not found in token"
    NO_FIELDS_TO_UPDATE = "No fields to update"
    UNEXPECTED_ERROR = "An unexpected error occurred"
    INVALID_ID = "Invalid {} ID format"

    @staticmethod
    def format(message: str, *args) -> str:
        """Format message with values"""
        return message.format(*args)


class PermissionMessages:
    """Permission denied messages"""
    CREATE = "You don't have permission to create {}"
    READ = "You don't have permission to read {}"
    UPDATE = "You don't have permission to update {}"
    DELETE = "You don't have permission to delete {}"
    RESTORE = "You don't have permission to restore {}"
    LIST = "You don't have permission to list {}"

    @staticmethod
    def format(message: str, entity: str) -> str:
        """Format permission message with entity name"""
        return message.format(entity)


# Module prefixes for error codes
class ModulePrefixes:
    """Module prefixes for generating error codes"""
    DESIGNATION_MASTER = "DESIGNATION_MASTER"
    PERSONNEL = "PERSONNEL"
    PERSONNEL_MASTER = "PERSONNEL_MASTER"
    UNIT = "UNIT"
    UNITS = "UNITS"
    DEPARTMENT = "DEPARTMENT"
    DISTRICT = "DISTRICT"
    MANDAL = "MANDAL"
    UNIT_VILLAGES = "UNIT_VILLAGES"
    RANK = "RANK"
    UNIT_TYPE = "UNIT_TYPE"
    ROLE = "ROLE"
    MODULE = "MODULE"
    PERMISSION = "PERMISSION"
    JOB = "JOB"
    USER_ROLE_PERMISSIONS = "USER_ROLE_PERMISSIONS"
    AUTH = "AUTH"
    VALUE_SETS = "VALUE_SETS"
    PROMPTS = "PROMPTS"
    PROMPT_EXECUTIONS = "PROMPT_EXECUTIONS"
    PERMISSION_MAPPINGS = "PERMISSION_MAPPINGS"
    ERROR_MASTER = "ERROR_MASTER"
    ERROR_LOGS = "ERROR_LOGS"
    APPROVAL_FLOW_MASTER = "APPROVAL_FLOW_MASTER"
    APPROVAL_CHAIN = "APPROVAL_CHAIN"
    FEEDBACK_MASTER = "FEEDBACK_MASTER"
    FEEDBACKS = "FEEDBACKS"
    TEST_MASTER = "TEST_MASTER"
    TEST_EXECUTIONS = "TEST_EXECUTIONS"


# Job names for RBAC permission checks
class JobNames:
    """Job names used for RBAC permission checks"""
    JOBS = "JOBS"
    MODULES = "MODULES"
    PERMISSIONS = "PERMISSIONS"
    ROLES = "ROLES"
    USER_ROLE_PERMISSIONS = "USER_ROLE_PERMISSIONS"
    PERSONNEL = "PERSONNEL"
    UNITS = "UNITS"
    DEPARTMENT = "DEPARTMENT"
    DISTRICT = "DISTRICT"
    DESIGNATION = "DESIGNATION"
    # Add more as needed
