"""
Constants module for standardized collection names and other application constants.

Collection names follow snake_case convention for maintainability.
"""


class CollectionNames:
    """
    MongoDB collection name constants.
    All collection names use snake_case for standardization.
    """
    # Log collections
    LOG_MASTER = "audit_log_master"
    LOG_TRANSACTION = "audit_log"
    LOGS = "audit_log"

    # Master collections
    MODULES_MASTER = "modules_master"

    # User/Personnel collections
    PERSONNEL = "personnel"
    USER_ROLE_PERMISSIONS = "user_role_permissions"

    # Other master collections
    UNIT = "unit"
    DEPARTMENT = "department"
    RANK_MASTER = "rank_master"
    UNIT_TYPE = "unit_type"
    DISTRICT = "district"
    UNIT_VILLAGES = "unit_villages"


# Alias for convenience
Collections = CollectionNames