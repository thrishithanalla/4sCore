"""
UserMapping Schema
Defines Pydantic schemas for user_role_permissions collection
"""
from datetime import datetime
from typing import List, Optional, Union
from pydantic import BaseModel, Field, field_validator, ConfigDict
from app.api.v1.utils.validators import validate_required_string_field


class PermissionItem(BaseModel):
    """Permission with optional isSelf flag"""
    name: str = Field(..., description="Permission name (must exist in permissions collection)")
    isSelf: Optional[bool] = Field(default=False, description="Access scope: true=own data only, false=all data (optional, defaults to false)")


class JobPermissionItem(BaseModel):
    """Job with permissions array for additional/exclusion permissions"""
    jobName: str = Field(..., description="Job name (must exist in jobs collection)")
    permissions: List[Union[str, PermissionItem, dict]] = Field(
        default=[],
        description="Array of Permission names or objects with isSelf flag"
    )

    @field_validator('jobName')
    @classmethod
    def validate_job_name_not_empty(cls, v):
        """Ensure jobName is not empty"""
        if not isinstance(v, str):
            raise ValueError("Job name must be a string")
        if not v or not v.strip():
            raise ValueError("Job name cannot be empty")
        return v.strip()

    @field_validator('permissions')
    @classmethod
    def validate_permissions(cls, v):
        """Ensure permissions array has no empty strings or duplicates, normalize to include isSelf"""
        if v:
            # Normalize permissions to dict format with isSelf field
            normalized_perms = []
            perm_names = []

            for perm in v:
                if isinstance(perm, str):
                    # String format - convert to dict with isSelf: false
                    if not perm or not perm.strip():
                        raise ValueError("Permission name cannot be empty")
                    perm_name = perm.strip()
                    perm_names.append(perm_name)
                    normalized_perms.append({"name": perm_name, "isSelf": False})
                elif isinstance(perm, dict):
                    # Dict format - ensure isSelf defaults to false if not provided
                    perm_name = perm.get("name", "")
                    if not isinstance(perm_name, str):
                        raise ValueError("Permission name must be a string")
                    if not perm_name or not perm_name.strip():
                        raise ValueError("Permission name cannot be empty")
                    perm_name = perm_name.strip()
                    perm_names.append(perm_name)
                    normalized_perms.append({"name": perm_name, "isSelf": perm.get("isSelf", False)})
                elif hasattr(perm, 'name'):  # PermissionItem object
                    if not isinstance(perm.name, str):
                        raise ValueError("Permission name must be a string")
                    if not perm.name or not perm.name.strip():
                        raise ValueError("Permission name cannot be empty")
                    perm_name = perm.name.strip()
                    perm_names.append(perm_name)
                    # Pydantic already sets default isSelf to False, but be explicit
                    normalized_perms.append({"name": perm_name, "isSelf": getattr(perm, 'isSelf', False)})
                else:
                    raise ValueError("Permission must be a string or object with 'name' field")

            # Check for duplicates
            if len(perm_names) != len(set(perm_names)):
                raise ValueError("Duplicate permission names are not allowed within a job")

            # Return normalized permissions (as dicts that Pydantic will convert to PermissionItem)
            return normalized_perms
        return v or []


class ModulePermissionItem(BaseModel):
    """Module with jobs and permissions hierarchy for additional/exclusion permissions"""
    moduleId: str = Field(..., description="Module ID (must exist in modules collection)")
    moduleName: str = Field(..., description="Module name for display purposes")
    jobs: List[JobPermissionItem] = Field(
        default=[],
        description="Array of jobs with their permissions"
    )

    @field_validator('moduleId')
    @classmethod
    def validate_module_id_not_empty(cls, v):
        """Ensure moduleId is not empty"""
        if not isinstance(v, str):
            raise ValueError("Module ID must be a string")
        if not v or not v.strip():
            raise ValueError("Module ID cannot be empty")
        return v.strip()

    @field_validator('moduleName')
    @classmethod
    def validate_module_name_not_empty(cls, v):
        """Ensure moduleName is not empty"""
        if not isinstance(v, str):
            raise ValueError("Module name must be a string")
        if not v or not v.strip():
            raise ValueError("Module name cannot be empty")
        return v.strip()

    @field_validator('jobs')
    @classmethod
    def validate_jobs(cls, v):
        """Ensure no duplicate job names"""
        if v:
            # Check for duplicate job names
            job_names = [job.jobName for job in v]
            if len(job_names) != len(set(job_names)):
                raise ValueError("Duplicate job names are not allowed within a module")
        return v or []


class UserMappingBaseSchema(BaseModel):
    """Base schema for UserMapping"""
    roleId: str = Field(
        ...,
        description="Role ID (must exist in roles collection)"
    )
    userId: str = Field(
        ...,
        description="User ID (must exist in personnel collection)"
    )
    unitId: str = Field(
        ...,
        description="Unit ID (must exist in unit collection) - required"
    )
    additionalPermissions: List[ModulePermissionItem] = Field(
        default=[],
        description="Array of additional permissions in module hierarchy format"
    )
    exclusionPermissions: List[ModulePermissionItem] = Field(
        default=[],
        description="Array of excluded permissions in module hierarchy format"
    )

    @field_validator('roleId', 'userId')
    @classmethod
    def validate_id_not_empty(cls, v):
        """Ensure IDs are not empty"""
        if v is not None:
            if not isinstance(v, str):
                raise ValueError("ID must be a string")
            if not v.strip():
                raise ValueError("ID cannot be empty")
            return v.strip()
        return v

    @field_validator('unitId', mode='before')
    @classmethod
    def validate_unit_id(cls, v):
        """Validate unitId is required and not empty (DB existence checked in service layer)"""
        return validate_required_string_field(v, "unitId")

    @field_validator('additionalPermissions', 'exclusionPermissions')
    @classmethod
    def validate_permission_structure(cls, v):
        """Ensure no duplicate module IDs in permissions"""
        if v:
            # Check for duplicate module IDs
            module_ids = [module.moduleId for module in v]
            if len(module_ids) != len(set(module_ids)):
                raise ValueError("Duplicate module IDs are not allowed in permissions")
        return v or []


class UserMappingCreateSchema(UserMappingBaseSchema):
    """Schema for creating a new user mapping"""
    """Schema for creating user role permissions mapping"""
    userId: str = Field(..., description="User/Personnel ID")
    roleId: str = Field(..., description="Role ID")
    unitId: Optional[str] = Field(None, description="Unit ID (optional, fetched from personnel if not provided)")
    additionalPermissions: Optional[List[ModulePermissionItem]] = Field(
        default=[],
        description="Additional permissions to grant beyond role permissions"
    )
    exclusionPermissions: Optional[List[ModulePermissionItem]] = Field(
        default=[],
        description="Permissions to exclude from role permissions"
    )


class UserMappingUpdateSchema(BaseModel):
    """Schema for updating an existing user mapping"""
    roleId: Optional[str] = Field(
        None,
        description="Role ID (must exist in roles collection)"
    )
    userId: Optional[str] = Field(
        None,
        description="User ID (must exist in personnel collection)"
    )
    unitId: Optional[str] = Field(
        None,
        description="Unit ID (must exist in unit collection)"
    )
    additionalPermissions: Optional[List[ModulePermissionItem]] = Field(
        None,
        description="Array of additional permissions in module hierarchy format"
    )
    exclusionPermissions: Optional[List[ModulePermissionItem]] = Field(
        None,
        description="Array of excluded permissions in module hierarchy format"
    )

    @field_validator('roleId', 'userId')
    @classmethod
    def validate_id_not_empty(cls, v):
        """Ensure IDs are not empty if provided"""
        if v is not None:
            if not isinstance(v, str):
                raise ValueError("ID must be a string")
            if not v.strip():
                raise ValueError("ID cannot be empty")
            return v.strip()
        return v

    @field_validator('unitId', mode='before')
    @classmethod
    def validate_unit_id(cls, v):
        """Validate unitId is not empty if provided (DB existence checked in service layer)"""
        if v is None:
            return v
        return validate_required_string_field(v, "unitId")

    @field_validator('additionalPermissions', 'exclusionPermissions')
    @classmethod
    def validate_permission_structure(cls, v):
        """Ensure no duplicate module IDs in permissions if provided"""
        if v is not None:
            # Check for duplicate module IDs
            module_ids = [module.moduleId for module in v]
            if len(module_ids) != len(set(module_ids)):
                raise ValueError("Duplicate module IDs are not allowed in permissions")
        return v


class UserMappingResponseSchema(UserMappingBaseSchema):
    """Schema for user mapping response"""
    id: str = Field(..., alias="_id", description="UserMapping ID (Primary Key)")
    unitId: str = Field(..., description="Unit ID (from personnel record)")
    rankId: str = Field(..., description="Rank ID (from personnel record)")
    permissions: List[ModulePermissionItem] = Field(
        default=[],
        description="Consolidated permissions (role.permissions + additionalPermissions - exclusionPermissions)"
    )
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User ID who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User ID who last updated this record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)
