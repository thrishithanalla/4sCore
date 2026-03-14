"""
Log Codes Constants for UC2 Core Main BE

This file contains all log code constants used throughout the application.
Log codes follow the naming convention: LOG.CORE.<MODULE>.<ACTION>

Usage:
    from app.constants.log_codes import LogCodes

    log_code = LogCodes.PERSONNEL_CREATED
"""


class LogCodes:
    """
    Centralized log code constants.

    Naming Convention: LOG.CORE.<MODULE>.<ACTION>

    Actions:
    - CREATED: New record created
    - UPDATED: Record updated
    - DELETED: Record soft deleted
    - RESTORED: Deleted record restored
    - READ: Single record viewed
    - LIST_VIEWED: List of records viewed
    - EXPORTED: Data exported
    - BULK_CREATED: Multiple records created at once
    """

    # =========================================================================
    # PERSONNEL Log Codes
    # =========================================================================
    PERSONNEL_CREATED = "LOG.CORE.PERSONNEL.CREATED"
    PERSONNEL_UPDATED = "LOG.CORE.PERSONNEL.UPDATED"
    PERSONNEL_DELETED = "LOG.CORE.PERSONNEL.DELETED"
    PERSONNEL_RESTORED = "LOG.CORE.PERSONNEL.RESTORED"
    PERSONNEL_READ = "LOG.CORE.PERSONNEL.READ"
    PERSONNEL_LIST_VIEWED = "LOG.CORE.PERSONNEL.LIST_VIEWED"
    PERSONNEL_EXPORTED = "LOG.CORE.PERSONNEL.EXPORTED"

    # =========================================================================
    # UNIT Log Codes
    # =========================================================================
    UNIT_CREATED = "LOG.CORE.UNIT.CREATED"
    UNIT_UPDATED = "LOG.CORE.UNIT.UPDATED"
    UNIT_DELETED = "LOG.CORE.UNIT.DELETED"
    UNIT_RESTORED = "LOG.CORE.UNIT.RESTORED"
    UNIT_READ = "LOG.CORE.UNIT.READ"
    UNIT_LIST_VIEWED = "LOG.CORE.UNIT.LIST_VIEWED"
    UNIT_HIERARCHY_VIEWED = "LOG.CORE.UNIT.HIERARCHY_VIEWED"
    UNIT_PERSONNEL_BY_RANK_VIEWED = "LOG.CORE.UNIT.PERSONNEL_BY_RANK_VIEWED"
    UNIT_MINIMAL_LIST_VIEWED = "LOG.CORE.UNIT.MINIMAL_LIST_VIEWED"
    UNIT_EXPORTED = "LOG.CORE.UNIT.EXPORTED"

    # =========================================================================
    # UNIT_ENHANCE Log Codes
    # =========================================================================
    UNIT_ENHANCE_CREATED = "LOG.CORE.UNIT_ENHANCE.CREATED"
    UNIT_ENHANCE_UPDATED = "LOG.CORE.UNIT_ENHANCE.UPDATED"
    UNIT_ENHANCE_DELETED = "LOG.CORE.UNIT_ENHANCE.DELETED"
    UNIT_ENHANCE_RESTORED = "LOG.CORE.UNIT_ENHANCE.RESTORED"
    UNIT_ENHANCE_READ = "LOG.CORE.UNIT_ENHANCE.READ"
    UNIT_ENHANCE_LIST_VIEWED = "LOG.CORE.UNIT_ENHANCE.LIST_VIEWED"

    # =========================================================================
    # ORG_STRUCTURE Log Codes
    # =========================================================================
    ORG_STRUCTURE_VIEWED = "LOG.CORE.ORG_STRUCTURE.VIEWED"

    # =========================================================================
    # UNIT_TYPE Log Codes
    # =========================================================================
    UNIT_TYPE_CREATED = "LOG.CORE.UNIT_TYPE.CREATED"
    UNIT_TYPE_UPDATED = "LOG.CORE.UNIT_TYPE.UPDATED"
    UNIT_TYPE_DELETED = "LOG.CORE.UNIT_TYPE.DELETED"
    UNIT_TYPE_RESTORED = "LOG.CORE.UNIT_TYPE.RESTORED"
    UNIT_TYPE_READ = "LOG.CORE.UNIT_TYPE.READ"
    UNIT_TYPE_LIST_VIEWED = "LOG.CORE.UNIT_TYPE.LIST_VIEWED"

    # =========================================================================
    # UNIT_VILLAGES Log Codes
    # =========================================================================
    UNIT_VILLAGES_CREATED = "LOG.CORE.UNIT_VILLAGES.CREATED"
    UNIT_VILLAGES_UPDATED = "LOG.CORE.UNIT_VILLAGES.UPDATED"
    UNIT_VILLAGES_DELETED = "LOG.CORE.UNIT_VILLAGES.DELETED"
    UNIT_VILLAGES_RESTORED = "LOG.CORE.UNIT_VILLAGES.RESTORED"
    UNIT_VILLAGES_READ = "LOG.CORE.UNIT_VILLAGES.READ"
    UNIT_VILLAGES_LIST_VIEWED = "LOG.CORE.UNIT_VILLAGES.LIST_VIEWED"

    # =========================================================================
    # ROLE Log Codes
    # =========================================================================
    ROLE_CREATED = "LOG.CORE.ROLE.CREATED"
    ROLE_UPDATED = "LOG.CORE.ROLE.UPDATED"
    ROLE_DELETED = "LOG.CORE.ROLE.DELETED"
    ROLE_RESTORED = "LOG.CORE.ROLE.RESTORED"
    ROLE_READ = "LOG.CORE.ROLE.READ"
    ROLE_LIST_VIEWED = "LOG.CORE.ROLE.LIST_VIEWED"

    # =========================================================================
    # PERMISSION Log Codes
    # =========================================================================
    PERMISSION_CREATED = "LOG.CORE.PERMISSION.CREATED"
    PERMISSION_UPDATED = "LOG.CORE.PERMISSION.UPDATED"
    PERMISSION_DELETED = "LOG.CORE.PERMISSION.DELETED"
    PERMISSION_RESTORED = "LOG.CORE.PERMISSION.RESTORED"
    PERMISSION_READ = "LOG.CORE.PERMISSION.READ"
    PERMISSION_LIST_VIEWED = "LOG.CORE.PERMISSION.LIST_VIEWED"

    # =========================================================================
    # PERMISSION_MAPPING Log Codes
    # =========================================================================
    PERMISSION_MAPPING_CREATED = "LOG.CORE.PERMISSION_MAPPING.CREATED"
    PERMISSION_MAPPING_UPDATED = "LOG.CORE.PERMISSION_MAPPING.UPDATED"
    PERMISSION_MAPPING_DELETED = "LOG.CORE.PERMISSION_MAPPING.DELETED"
    PERMISSION_MAPPING_RESTORED = "LOG.CORE.PERMISSION_MAPPING.RESTORED"
    PERMISSION_MAPPING_READ = "LOG.CORE.PERMISSION_MAPPING.READ"
    PERMISSION_MAPPING_LIST_VIEWED = "LOG.CORE.PERMISSION_MAPPING.LIST_VIEWED"

    # =========================================================================
    # MODULE Log Codes
    # =========================================================================
    MODULE_CREATED = "LOG.CORE.MODULE.CREATED"
    MODULE_UPDATED = "LOG.CORE.MODULE.UPDATED"
    MODULE_DELETED = "LOG.CORE.MODULE.DELETED"
    MODULE_RESTORED = "LOG.CORE.MODULE.RESTORED"
    MODULE_READ = "LOG.CORE.MODULE.READ"
    MODULE_LIST_VIEWED = "LOG.CORE.MODULE.LIST_VIEWED"

    # =========================================================================
    # MODULE_HIERARCHY Log Codes
    # =========================================================================
    MODULE_HIERARCHY_CREATED = "LOG.CORE.MODULE_HIERARCHY.CREATED"
    MODULE_HIERARCHY_UPDATED = "LOG.CORE.MODULE_HIERARCHY.UPDATED"
    MODULE_HIERARCHY_DELETED = "LOG.CORE.MODULE_HIERARCHY.DELETED"
    MODULE_HIERARCHY_RESTORED = "LOG.CORE.MODULE_HIERARCHY.RESTORED"
    MODULE_HIERARCHY_READ = "LOG.CORE.MODULE_HIERARCHY.READ"
    MODULE_HIERARCHY_LIST_VIEWED = "LOG.CORE.MODULE_HIERARCHY.LIST_VIEWED"

    # =========================================================================
    # MODULE_JOB_MAPPING Log Codes
    # =========================================================================
    MODULE_JOB_MAPPING_CREATED = "LOG.CORE.MODULE_JOB_MAPPING.CREATED"
    MODULE_JOB_MAPPING_UPDATED = "LOG.CORE.MODULE_JOB_MAPPING.UPDATED"
    MODULE_JOB_MAPPING_DELETED = "LOG.CORE.MODULE_JOB_MAPPING.DELETED"
    MODULE_JOB_MAPPING_RESTORED = "LOG.CORE.MODULE_JOB_MAPPING.RESTORED"
    MODULE_JOB_MAPPING_READ = "LOG.CORE.MODULE_JOB_MAPPING.READ"
    MODULE_JOB_MAPPING_LIST_VIEWED = "LOG.CORE.MODULE_JOB_MAPPING.LIST_VIEWED"

    # =========================================================================
    # USER_MAPPING Log Codes
    # =========================================================================
    USER_MAPPING_CREATED = "LOG.CORE.USER_MAPPING.CREATED"
    USER_MAPPING_UPDATED = "LOG.CORE.USER_MAPPING.UPDATED"
    USER_MAPPING_DELETED = "LOG.CORE.USER_MAPPING.DELETED"
    USER_MAPPING_RESTORED = "LOG.CORE.USER_MAPPING.RESTORED"
    USER_MAPPING_READ = "LOG.CORE.USER_MAPPING.READ"
    USER_MAPPING_LIST_VIEWED = "LOG.CORE.USER_MAPPING.LIST_VIEWED"

    # =========================================================================
    # DEPARTMENT Log Codes
    # =========================================================================
    DEPARTMENT_CREATED = "LOG.CORE.DEPARTMENT.CREATED"
    DEPARTMENT_UPDATED = "LOG.CORE.DEPARTMENT.UPDATED"
    DEPARTMENT_DELETED = "LOG.CORE.DEPARTMENT.DELETED"
    DEPARTMENT_RESTORED = "LOG.CORE.DEPARTMENT.RESTORED"
    DEPARTMENT_READ = "LOG.CORE.DEPARTMENT.READ"
    DEPARTMENT_LIST_VIEWED = "LOG.CORE.DEPARTMENT.LIST_VIEWED"

    # =========================================================================
    # DISTRICT Log Codes
    # =========================================================================
    DISTRICT_CREATED = "LOG.CORE.DISTRICT.CREATED"
    DISTRICT_UPDATED = "LOG.CORE.DISTRICT.UPDATED"
    DISTRICT_DELETED = "LOG.CORE.DISTRICT.DELETED"
    DISTRICT_RESTORED = "LOG.CORE.DISTRICT.RESTORED"
    DISTRICT_READ = "LOG.CORE.DISTRICT.READ"
    DISTRICT_LIST_VIEWED = "LOG.CORE.DISTRICT.LIST_VIEWED"

    # =========================================================================
    # MANDAL Log Codes
    # =========================================================================
    MANDAL_CREATED = "LOG.CORE.MANDAL.CREATED"
    MANDAL_UPDATED = "LOG.CORE.MANDAL.UPDATED"
    MANDAL_DELETED = "LOG.CORE.MANDAL.DELETED"
    MANDAL_RESTORED = "LOG.CORE.MANDAL.RESTORED"
    MANDAL_READ = "LOG.CORE.MANDAL.READ"
    MANDAL_LIST_VIEWED = "LOG.CORE.MANDAL.LIST_VIEWED"

    # =========================================================================
    # DESIGNATION Log Codes
    # =========================================================================
    DESIGNATION_CREATED = "LOG.CORE.DESIGNATION.CREATED"
    DESIGNATION_UPDATED = "LOG.CORE.DESIGNATION.UPDATED"
    DESIGNATION_DELETED = "LOG.CORE.DESIGNATION.DELETED"
    DESIGNATION_RESTORED = "LOG.CORE.DESIGNATION.RESTORED"
    DESIGNATION_READ = "LOG.CORE.DESIGNATION.READ"
    DESIGNATION_LIST_VIEWED = "LOG.CORE.DESIGNATION.LIST_VIEWED"

    # =========================================================================
    # RANK Log Codes
    # =========================================================================
    RANK_CREATED = "LOG.CORE.RANK.CREATED"
    RANK_UPDATED = "LOG.CORE.RANK.UPDATED"
    RANK_DELETED = "LOG.CORE.RANK.DELETED"
    RANK_RESTORED = "LOG.CORE.RANK.RESTORED"
    RANK_READ = "LOG.CORE.RANK.READ"
    RANK_LIST_VIEWED = "LOG.CORE.RANK.LIST_VIEWED"

    # =========================================================================
    # VALUE_SET Log Codes
    # =========================================================================
    VALUE_SET_CREATED = "LOG.CORE.VALUE_SET.CREATED"
    VALUE_SET_UPDATED = "LOG.CORE.VALUE_SET.UPDATED"
    VALUE_SET_DELETED = "LOG.CORE.VALUE_SET.DELETED"
    VALUE_SET_RESTORED = "LOG.CORE.VALUE_SET.RESTORED"
    VALUE_SET_READ = "LOG.CORE.VALUE_SET.READ"
    VALUE_SET_LIST_VIEWED = "LOG.CORE.VALUE_SET.LIST_VIEWED"
    VALUE_SET_VALIDATED = "LOG.CORE.VALUE_SET.VALIDATED"
    VALUE_SET_BOOTSTRAPPED = "LOG.CORE.VALUE_SET.BOOTSTRAPPED"
    VALUE_SET_PRELOADED = "LOG.CORE.VALUE_SET.PRELOADED"
    VALUE_SET_LABEL_FETCHED = "LOG.CORE.VALUE_SET.LABEL_FETCHED"
    VALUE_SET_ITEMS_FETCHED = "LOG.CORE.VALUE_SET.ITEMS_FETCHED"

    # =========================================================================
    # FEEDBACK Log Codes
    # =========================================================================
    FEEDBACK_CREATED = "LOG.CORE.FEEDBACK.CREATED"
    FEEDBACK_UPDATED = "LOG.CORE.FEEDBACK.UPDATED"
    FEEDBACK_DELETED = "LOG.CORE.FEEDBACK.DELETED"
    FEEDBACK_RESTORED = "LOG.CORE.FEEDBACK.RESTORED"
    FEEDBACK_READ = "LOG.CORE.FEEDBACK.READ"
    FEEDBACK_LIST_VIEWED = "LOG.CORE.FEEDBACK.LIST_VIEWED"

    # =========================================================================
    # FEEDBACK_MASTER Log Codes
    # =========================================================================
    FEEDBACK_MASTER_CREATED = "LOG.CORE.FEEDBACK_MASTER.CREATED"
    FEEDBACK_MASTER_UPDATED = "LOG.CORE.FEEDBACK_MASTER.UPDATED"
    FEEDBACK_MASTER_DELETED = "LOG.CORE.FEEDBACK_MASTER.DELETED"
    FEEDBACK_MASTER_RESTORED = "LOG.CORE.FEEDBACK_MASTER.RESTORED"
    FEEDBACK_MASTER_READ = "LOG.CORE.FEEDBACK_MASTER.READ"
    FEEDBACK_MASTER_LIST_VIEWED = "LOG.CORE.FEEDBACK_MASTER.LIST_VIEWED"

    # =========================================================================
    # PROMPT Log Codes
    # =========================================================================
    PROMPT_CREATED = "LOG.CORE.PROMPT.CREATED"
    PROMPT_UPDATED = "LOG.CORE.PROMPT.UPDATED"
    PROMPT_DELETED = "LOG.CORE.PROMPT.DELETED"
    PROMPT_RESTORED = "LOG.CORE.PROMPT.RESTORED"
    PROMPT_READ = "LOG.CORE.PROMPT.READ"
    PROMPT_LIST_VIEWED = "LOG.CORE.PROMPT.LIST_VIEWED"

    # =========================================================================
    # PROMPT_EXECUTION Log Codes
    # =========================================================================
    PROMPT_EXECUTION_CREATED = "LOG.CORE.PROMPT_EXECUTION.CREATED"
    PROMPT_EXECUTION_DELETED = "LOG.CORE.PROMPT_EXECUTION.DELETED"
    PROMPT_EXECUTION_RESTORED = "LOG.CORE.PROMPT_EXECUTION.RESTORED"
    PROMPT_EXECUTION_READ = "LOG.CORE.PROMPT_EXECUTION.READ"
    PROMPT_EXECUTION_LIST_VIEWED = "LOG.CORE.PROMPT_EXECUTION.LIST_VIEWED"
    PROMPT_EXECUTION_DASHBOARD_VIEWED = "LOG.CORE.PROMPT_EXECUTION.DASHBOARD_VIEWED"
    PROMPT_EXECUTION_RECENT_CALLS_VIEWED = "LOG.CORE.PROMPT_EXECUTION.RECENT_CALLS_VIEWED"

    # =========================================================================
    # APPROVAL_CHAIN Log Codes
    # =========================================================================
    APPROVAL_CHAIN_CREATED = "LOG.CORE.APPROVAL_CHAIN.CREATED"
    APPROVAL_CHAIN_UPDATED = "LOG.CORE.APPROVAL_CHAIN.UPDATED"
    APPROVAL_CHAIN_DELETED = "LOG.CORE.APPROVAL_CHAIN.DELETED"
    APPROVAL_CHAIN_RESTORED = "LOG.CORE.APPROVAL_CHAIN.RESTORED"
    APPROVAL_CHAIN_READ = "LOG.CORE.APPROVAL_CHAIN.READ"
    APPROVAL_CHAIN_LIST_VIEWED = "LOG.CORE.APPROVAL_CHAIN.LIST_VIEWED"

    # =========================================================================
    # APPROVAL_FLOW_MASTER Log Codes
    # =========================================================================
    APPROVAL_FLOW_MASTER_CREATED = "LOG.CORE.APPROVAL_FLOW_MASTER.CREATED"
    APPROVAL_FLOW_MASTER_UPDATED = "LOG.CORE.APPROVAL_FLOW_MASTER.UPDATED"
    APPROVAL_FLOW_MASTER_DELETED = "LOG.CORE.APPROVAL_FLOW_MASTER.DELETED"
    APPROVAL_FLOW_MASTER_RESTORED = "LOG.CORE.APPROVAL_FLOW_MASTER.RESTORED"
    APPROVAL_FLOW_MASTER_READ = "LOG.CORE.APPROVAL_FLOW_MASTER.READ"
    APPROVAL_FLOW_MASTER_LIST_VIEWED = "LOG.CORE.APPROVAL_FLOW_MASTER.LIST_VIEWED"

    # =========================================================================
    # ERROR_MASTER Log Codes
    # =========================================================================
    ERROR_MASTER_CREATED = "LOG.CORE.ERROR_MASTER.CREATED"
    ERROR_MASTER_UPDATED = "LOG.CORE.ERROR_MASTER.UPDATED"
    ERROR_MASTER_DELETED = "LOG.CORE.ERROR_MASTER.DELETED"
    ERROR_MASTER_RESTORED = "LOG.CORE.ERROR_MASTER.RESTORED"
    ERROR_MASTER_READ = "LOG.CORE.ERROR_MASTER.READ"
    ERROR_MASTER_LIST_VIEWED = "LOG.CORE.ERROR_MASTER.LIST_VIEWED"
    ERROR_MASTER_BULK_CREATED = "LOG.CORE.ERROR_MASTER.BULK_CREATED"

    # =========================================================================
    # ERROR_LOG Log Codes
    # =========================================================================
    ERROR_LOG_CREATED = "LOG.CORE.ERROR_LOG.CREATED"
    ERROR_LOG_READ = "LOG.CORE.ERROR_LOG.READ"
    ERROR_LOG_LIST_VIEWED = "LOG.CORE.ERROR_LOG.LIST_VIEWED"

    # =========================================================================
    # LOG_MASTER Log Codes
    # =========================================================================
    LOG_MASTER_CREATED = "LOG.CORE.LOG_MASTER.CREATED"
    LOG_MASTER_UPDATED = "LOG.CORE.LOG_MASTER.UPDATED"
    LOG_MASTER_DELETED = "LOG.CORE.LOG_MASTER.DELETED"
    LOG_MASTER_RESTORED = "LOG.CORE.LOG_MASTER.RESTORED"
    LOG_MASTER_READ = "LOG.CORE.LOG_MASTER.READ"
    LOG_MASTER_LIST_VIEWED = "LOG.CORE.LOG_MASTER.LIST_VIEWED"
    LOG_MASTER_BULK_CREATED = "LOG.CORE.LOG_MASTER.BULK_CREATED"

    # =========================================================================
    # LOG_TRANSACTION Log Codes
    # =========================================================================
    LOG_TRANSACTION_CREATED = "LOG.CORE.LOG_TRANSACTION.CREATED"
    LOG_TRANSACTION_READ = "LOG.CORE.LOG_TRANSACTION.READ"
    LOG_TRANSACTION_LIST_VIEWED = "LOG.CORE.LOG_TRANSACTION.LIST_VIEWED"

    # =========================================================================
    # JOB Log Codes
    # =========================================================================
    JOB_CREATED = "LOG.CORE.JOB.CREATED"
    JOB_UPDATED = "LOG.CORE.JOB.UPDATED"
    JOB_DELETED = "LOG.CORE.JOB.DELETED"
    JOB_RESTORED = "LOG.CORE.JOB.RESTORED"
    JOB_READ = "LOG.CORE.JOB.READ"
    JOB_LIST_VIEWED = "LOG.CORE.JOB.LIST_VIEWED"
    JOB_STARTED = "LOG.CORE.JOB.STARTED"
    JOB_COMPLETED = "LOG.CORE.JOB.COMPLETED"
    JOB_FAILED = "LOG.CORE.JOB.FAILED"

    # =========================================================================
    # TEST_MASTER Log Codes
    # =========================================================================
    TEST_MASTER_CREATED = "LOG.CORE.TEST_MASTER.CREATED"
    TEST_MASTER_UPDATED = "LOG.CORE.TEST_MASTER.UPDATED"
    TEST_MASTER_DELETED = "LOG.CORE.TEST_MASTER.DELETED"
    TEST_MASTER_RESTORED = "LOG.CORE.TEST_MASTER.RESTORED"
    TEST_MASTER_READ = "LOG.CORE.TEST_MASTER.READ"
    TEST_MASTER_LIST_VIEWED = "LOG.CORE.TEST_MASTER.LIST_VIEWED"
    TEST_MASTER_EXPORTED = "LOG.CORE.TEST_MASTER.EXPORTED"

    # =========================================================================
    # TEST_EXECUTION Log Codes
    # =========================================================================
    TEST_EXECUTION_CREATED = "LOG.CORE.TEST_EXECUTION.CREATED"
    TEST_EXECUTION_DELETED = "LOG.CORE.TEST_EXECUTION.DELETED"
    TEST_EXECUTION_READ = "LOG.CORE.TEST_EXECUTION.READ"
    TEST_EXECUTION_LIST_VIEWED = "LOG.CORE.TEST_EXECUTION.LIST_VIEWED"
    TEST_EXECUTION_EXPORTED = "LOG.CORE.TEST_EXECUTION.EXPORTED"

    # =========================================================================
    # AUTH Log Codes
    # =========================================================================
    AUTH_LOGIN_SUCCESS = "LOG.CORE.AUTH.LOGIN_SUCCESS"
    AUTH_LOGIN_FAILED = "LOG.CORE.AUTH.LOGIN_FAILED"
    AUTH_LOGOUT = "LOG.CORE.AUTH.LOGOUT"
    AUTH_TOKEN_REFRESHED = "LOG.CORE.AUTH.TOKEN_REFRESHED"
    AUTH_PASSWORD_CHANGED = "LOG.CORE.AUTH.PASSWORD_CHANGED"
    AUTH_PASSWORD_RESET_REQUESTED = "LOG.CORE.AUTH.PASSWORD_RESET_REQUESTED"
    AUTH_PASSWORD_RESET_COMPLETED = "LOG.CORE.AUTH.PASSWORD_RESET_COMPLETED"
    AUTH_USER_PROFILE_VIEWED = "LOG.CORE.AUTH.USER_PROFILE_VIEWED"
    AUTH_SESSION_EXPIRED = "LOG.CORE.AUTH.SESSION_EXPIRED"
    AUTH_UNAUTHORIZED_ACCESS = "LOG.CORE.AUTH.UNAUTHORIZED_ACCESS"

    # =========================================================================
    # NOTIFICATION_MASTER Log Codes
    # =========================================================================
    NOTIFICATION_MASTER_CREATED = "LOG.CORE.NOTIFICATION_MASTER.CREATED"
    NOTIFICATION_MASTER_UPDATED = "LOG.CORE.NOTIFICATION_MASTER.UPDATED"
    NOTIFICATION_MASTER_DELETED = "LOG.CORE.NOTIFICATION_MASTER.DELETED"
    NOTIFICATION_MASTER_RESTORED = "LOG.CORE.NOTIFICATION_MASTER.RESTORED"
    NOTIFICATION_MASTER_READ = "LOG.CORE.NOTIFICATION_MASTER.READ"
    NOTIFICATION_MASTER_LIST_VIEWED = "LOG.CORE.NOTIFICATION_MASTER.LIST_VIEWED"

    # =========================================================================
    # ONBOARDING Log Codes
    # =========================================================================
    USER_ONBOARDED = "LOG.CORE.ONBOARDING.USER_ONBOARDED"

    # =========================================================================
    # THIRD_PARTY_API Log Codes
    # =========================================================================
    THIRD_PARTY_API_EXECUTED = "LOG.CORE.THIRD_PARTY_API.EXECUTED"
    THIRD_PARTY_API_BULK_EXECUTED = "LOG.CORE.THIRD_PARTY_API.BULK_EXECUTED"
    THIRD_PARTY_API_FAILED = "LOG.CORE.THIRD_PARTY_API.FAILED"