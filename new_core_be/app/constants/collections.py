"""
Centralized Collection Names Configuration
All MongoDB collection names used across the application.
Import from here instead of defining collection names in individual files.
"""


class Collections:
    """MongoDB collection names"""

    # Master Data Collections
    DEPARTMENT = "department_master"
    DESIGNATION_MASTER = "designation_master"
    DISTRICT = "district_master"
    MANDAL = "mandal_master"
    RANK_MASTER = "rank_master"
    TITLE_MASTER = "title_master"
    UNIT_TYPE = "unit_type_master"

    # Core Collections
    PERSONNEL_MASTER = "personnel_master"
    UNIT = "unit_master"
    UNIT_VILLAGES = "unit_villages_master"

    # Auth & RBAC Collections
    ROLES = "roles_master"
    PERMISSIONS = "permissions_master"
    PERMISSION_MAPPINGS = "permissions_mapping_master"
    USER_MAPPING = "user_mapping"
    USER_ROLE_PERMISSIONS = "user_role_permissions_master"
    JOBS = "jobs_master"

    # Module Collections
    MODULES = "modules_master"
    MODULE_HIERARCHY = "moduleHierarchy"
    MODULE_JOB_MAPPINGS = "module_job_mapping_master"

    # Approval Collections
    APPROVAL_FLOW_MASTER = "approval_flow_master"
    APPROVAL_CHAIN = "approval_chain"

    # Prompt Collections
    PROMPT_MASTER = "prompt_master"
    PROMPT_EXECUTION = "prompt_execution"

    # Logging Collections
    ERROR_MASTER = "error_master"
    ERROR_LOGS = "error_logs"
    LOG_MASTER = "audit_log_master"
    LOG_TRANSACTION = "audit_log"

    # Value Sets
    VALUE_SETS = "value_sets_master"

    # Feedback Collections
    FEEDBACK_MASTER = "feedback_master"
    FEEDBACKS = "feedback"

    # Test Collections
    TEST_MASTER = "test_master"
    TEST_EXECUTION = "test_execution"

    # OTP Collections
    OTP_VERIFICATION = "otp_verification"

    # Session/Token Collections
    REFRESH_TOKENS = "refresh_tokens"

    # Third Party API Collections
    THIRD_PARTY_API_LOGS = "third_party_api_logs"


# Export as module-level constants for convenience
DEPARTMENT = Collections.DEPARTMENT
DESIGNATION_MASTER = Collections.DESIGNATION_MASTER
DISTRICT = Collections.DISTRICT
MANDAL = Collections.MANDAL
RANK_MASTER = Collections.RANK_MASTER
TITLE_MASTER = Collections.TITLE_MASTER
UNIT_TYPE = Collections.UNIT_TYPE
PERSONNEL_MASTER = Collections.PERSONNEL_MASTER
UNIT = Collections.UNIT
UNIT_VILLAGES = Collections.UNIT_VILLAGES
ROLES = Collections.ROLES
PERMISSIONS = Collections.PERMISSIONS
PERMISSION_MAPPINGS = Collections.PERMISSION_MAPPINGS
USER_MAPPING = Collections.USER_MAPPING
USER_ROLE_PERMISSIONS = Collections.USER_ROLE_PERMISSIONS
JOBS = Collections.JOBS
MODULES = Collections.MODULES
MODULE_HIERARCHY = Collections.MODULE_HIERARCHY
MODULE_JOB_MAPPINGS = Collections.MODULE_JOB_MAPPINGS
APPROVAL_FLOW_MASTER = Collections.APPROVAL_FLOW_MASTER
APPROVAL_CHAIN = Collections.APPROVAL_CHAIN
PROMPT_MASTER = Collections.PROMPT_MASTER
PROMPT_EXECUTION = Collections.PROMPT_EXECUTION
ERROR_MASTER = Collections.ERROR_MASTER
ERROR_LOGS = Collections.ERROR_LOGS
LOG_MASTER = Collections.LOG_MASTER
LOG_TRANSACTION = Collections.LOG_TRANSACTION
VALUE_SETS = Collections.VALUE_SETS
FEEDBACK_MASTER = Collections.FEEDBACK_MASTER
FEEDBACKS = Collections.FEEDBACKS
TEST_MASTER = Collections.TEST_MASTER
TEST_EXECUTION = Collections.TEST_EXECUTION
OTP_VERIFICATION = Collections.OTP_VERIFICATION
REFRESH_TOKENS = Collections.REFRESH_TOKENS
THIRD_PARTY_API_LOGS = Collections.THIRD_PARTY_API_LOGS


# Collection name aliases for backward compatibility
ERROR_LOG_HOT = Collections.ERROR_LOGS
ERROR_LOG_ARCHIVE = "error_logs_archive"
