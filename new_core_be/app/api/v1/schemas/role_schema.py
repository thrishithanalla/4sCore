"""
Role Schema
Defines Pydantic schemas for Role collection with nested module-job-permission structure
"""
from datetime import datetime
from typing import List, Optional, Union
from pydantic import BaseModel, Field, field_validator, ConfigDict
import re


class PermissionItem(BaseModel):
    """Permission with optional isSelf flag"""
    name: str = Field(..., description="Permission name (must exist in permissions collection)")
    isSelf: Optional[bool] = Field(default=False, description="Access scope: true=own data only, false=all data (optional, defaults to false)")


class JobItem(BaseModel):
    """Job with permissions array and display settings"""
    jobName: str = Field(..., description="Job name (must exist in jobs collection)")
    isMenu: bool = Field(default=True, description="Whether this job should appear in menu for this role")
    displayOrder: int = Field(default=1, description="Display order for this job in this role (0=hidden)")
    permissions: List[Union[str, PermissionItem, dict]] = Field(
        ...,
        min_length=1,
        description="Array of Permission names or objects with isSelf flag"
    )
    @field_validator('jobName')
    @classmethod
    def validate_job_name_not_empty(cls, v):
        """Ensure jobName is not empty"""
        if not v or not v.strip():
            raise ValueError("Job name cannot be empty")
        return v.strip()

    @field_validator('permissions')
    @classmethod
    def validate_permissions_not_empty(cls, v):
        """Ensure permissions array has at least one name and no duplicates, normalize to include isSelf"""
        if not v:
            raise ValueError("Permissions array must have at least one permission name")

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
                if not perm_name or not perm_name.strip():
                    raise ValueError("Permission name cannot be empty")
                perm_name = perm_name.strip()
                perm_names.append(perm_name)
                normalized_perms.append({"name": perm_name, "isSelf": perm.get("isSelf", False)})
            elif hasattr(perm, 'name'):  # PermissionItem object
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


class ModuleItem(BaseModel):
    """Module with jobs array"""
    moduleId: str = Field(..., description="Module ID (must exist in modules collection)")
    moduleName: str = Field(..., description="Module name for display purposes")
    jobs: List[JobItem] = Field(
        ...,
        min_length=1,
        description="Array of jobs with their permissions"
    )

    @field_validator('moduleId')
    @classmethod
    def validate_module_id_not_empty(cls, v):
        """Ensure moduleId is not empty"""
        if not v or not v.strip():
            raise ValueError("Module ID cannot be empty")
        return v.strip()

    @field_validator('moduleName')
    @classmethod
    def validate_module_name_not_empty(cls, v):
        """Ensure moduleName is not empty"""
        if not v or not v.strip():
            raise ValueError("Module name cannot be empty")
        return v.strip()

    @field_validator('jobs')
    @classmethod
    def validate_jobs_not_empty(cls, v):
        """Ensure jobs array has at least one job"""
        if not v:
            raise ValueError("Jobs array must have at least one job")

        # Check for duplicate job names
        job_names = [job.jobName for job in v]
        if len(job_names) != len(set(job_names)):
            raise ValueError("Duplicate job names are not allowed within a module")

        return v


class RoleBaseSchema(BaseModel):
    """Base schema for Role"""
    name: str = Field(
        ...,
        min_length=1,
        max_length=120,
        description="Role name (must contain alphabets)"
    )
    shortCode: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Short code for the role"
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Role description"
    )
    permissions: List[ModuleItem] = Field(
        ...,
        min_length=1,
        description="Array of modules with jobs and permissions hierarchy"
    )

    @field_validator('name')
    @classmethod
    def validate_name_has_alphabets(cls, v):
        """Ensure name contains at least one alphabet"""
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        if not re.search(r'[a-zA-Z]', v):
            raise ValueError("Name must contain at least one alphabet character")
        return v.strip()

    @field_validator('shortCode')
    @classmethod
    def validate_short_code(cls, v):
        """Ensure shortCode is not empty"""
        if not v or not v.strip():
            raise ValueError("Short code cannot be empty")
        return v.strip()

    @field_validator('permissions')
    @classmethod
    def validate_permissions_structure(cls, v):
        """Ensure permissions array has at least one module and no duplicate modules"""
        if not v:
            raise ValueError("Permissions array must have at least one module")

        # Check for duplicate module IDs
        module_ids = [module.moduleId for module in v]
        if len(module_ids) != len(set(module_ids)):
            raise ValueError("Duplicate module IDs are not allowed in permissions")

        return v


class RoleCreateSchema(RoleBaseSchema):
    """Schema for creating a new role"""
    pass


class RoleUpdateSchema(BaseModel):
    """Schema for updating an existing role"""
    name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=120,
        description="Role name (must contain alphabets)"
    )
    shortCode: Optional[str] = Field(
        None,
        min_length=1,
        max_length=20,
        description="Short code for the role"
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Role description"
    )
    permissions: Optional[List[ModuleItem]] = Field(
        None,
        min_length=1,
        description="Array of modules with jobs and permissions hierarchy"
    )

    @field_validator('name')
    @classmethod
    def validate_name_has_alphabets(cls, v):
        """Ensure name contains at least one alphabet if provided"""
        if v is not None:
            if not v.strip():
                raise ValueError("Name cannot be empty")
            if not re.search(r'[a-zA-Z]', v):
                raise ValueError("Name must contain at least one alphabet character")
            return v.strip()
        return v

    @field_validator('shortCode')
    @classmethod
    def validate_short_code(cls, v):
        """Ensure shortCode is not empty if provided"""
        if v is not None:
            if not v.strip():
                raise ValueError("Short code cannot be empty")
            return v.strip()
        return v

    @field_validator('permissions')
    @classmethod
    def validate_permissions_structure(cls, v):
        """Ensure permissions array has at least one module if provided"""
        if v is not None:
            if not v:
                raise ValueError("Permissions array must have at least one module")

            # Check for duplicate module IDs
            module_ids = [module.moduleId for module in v]
            if len(module_ids) != len(set(module_ids)):
                raise ValueError("Duplicate module IDs are not allowed in permissions")

        return v


class RoleResponseSchema(RoleBaseSchema):
    """Schema for role response"""
    id: str = Field(..., alias="_id", description="Role ID (Primary Key)")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag (true=deleted, false=active)")
    createdBy: Optional[str] = Field(None, description="User ID who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User ID who last updated this record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)


class RoleBulkCreateSchema(BaseModel):
    """Schema for bulk creating roles"""
    items: List[RoleCreateSchema] = Field(..., min_length=1, description="List of roles to create")


class RoleBulkCreateResponseSchema(BaseModel):
    """Response schema for bulk create operation"""
    success: List[dict] = Field(default=[], description="Successfully created roles")
    failed: List[dict] = Field(default=[], description="Failed items with error details")
    totalSuccess: int = Field(default=0, description="Total successfully created")
    totalFailed: int = Field(default=0, description="Total failed to create")
