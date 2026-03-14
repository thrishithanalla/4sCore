# Repositories module
# Data Access Layer - handles all database operations

from app.api.v1.repositories.base_repository import BaseRepository

# Master Data Repositories
from app.api.v1.repositories.department_repository import DepartmentRepository
from app.api.v1.repositories.district_repository import DistrictRepository
from app.api.v1.repositories.mandal_repository import MandalRepository
from app.api.v1.repositories.rank_master_repository import RankMasterRepository
from app.api.v1.repositories.unit_type_repository import UnitTypeRepository
from app.api.v1.repositories.designation_master_repository import DesignationMasterRepository

# Core Repositories
from app.api.v1.repositories.personnel_repository import PersonnelRepository
from app.api.v1.repositories.unit_repository import UnitRepository
from app.api.v1.repositories.unit_villages_repository import UnitVillagesRepository

# Auth/RBAC Repositories
from app.api.v1.repositories.role_repository import RoleRepository
from app.api.v1.repositories.permissions_repository import PermissionsRepository
from app.api.v1.repositories.permissions_mapping_repository import PermissionsMappingRepository
from app.api.v1.repositories.user_mapping_repository import UserMappingRepository
from app.api.v1.repositories.jobs_repository import JobsRepository

# Module Repositories
from app.api.v1.repositories.module_repository import ModuleRepository
from app.api.v1.repositories.module_hierarchy_repository import ModuleHierarchyRepository

# Approval Repositories
from app.api.v1.repositories.approval_flow_master_repository import ApprovalFlowMasterRepository
from app.api.v1.repositories.approval_chain_repository import ApprovalChainRepository

# Prompt Repositories
from app.api.v1.repositories.prompt_repository import PromptRepository
from app.api.v1.repositories.prompt_execution_repository import PromptExecutionRepository

# Logging Repositories
from app.api.v1.repositories.error_master_repository import ErrorMasterRepository
from app.api.v1.repositories.error_log_repository import ErrorLogRepository
from app.api.v1.repositories.log_master_repository import LogMasterRepository
from app.api.v1.repositories.log_transaction_repository import LogTransactionRepository

# Other Repositories
from app.api.v1.repositories.value_sets_repository import ValueSetsRepository
from app.api.v1.repositories.feedback_master_repository import FeedbackMasterRepository
from app.api.v1.repositories.feedback_repository import FeedbackRepository
from app.api.v1.repositories.test_master_repository import TestMasterRepository
from app.api.v1.repositories.test_execution_repository import TestExecutionRepository

__all__ = [
    # Base
    "BaseRepository",

    # Master Data
    "DepartmentRepository",
    "DistrictRepository",
    "MandalRepository",
    "RankMasterRepository",
    "UnitTypeRepository",
    "DesignationMasterRepository",

    # Core
    "PersonnelRepository",
    "UnitRepository",
    "UnitVillagesRepository",

    # Auth/RBAC
    "RoleRepository",
    "PermissionsRepository",
    "PermissionsMappingRepository",
    "UserMappingRepository",
    "JobsRepository",

    # Module
    "ModuleRepository",
    "ModuleHierarchyRepository",

    # Approval
    "ApprovalFlowMasterRepository",
    "ApprovalChainRepository",

    # Prompt
    "PromptRepository",
    "PromptExecutionRepository",

    # Logging
    "ErrorMasterRepository",
    "ErrorLogRepository",
    "LogMasterRepository",
    "LogTransactionRepository",

    # Other
    "ValueSetsRepository",
    "FeedbackMasterRepository",
    "FeedbackRepository",
    "TestMasterRepository",
    "TestExecutionRepository",
]
