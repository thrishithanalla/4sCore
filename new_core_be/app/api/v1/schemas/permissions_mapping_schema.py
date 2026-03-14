"""
Permissions Mapping Schema
Defines the mapping between modules, jobs, and permissions
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional
from datetime import datetime


class PermissionsMappingCreateSchema(BaseModel):
    """Schema for creating permissions mapping"""
    moduleId: str = Field(
        ...,
        description="Module ID (must exist in modules collection)"
    )
    jobId: str = Field(
        ...,
        description="Job ID (must exist in jobs collection)"
    )
    permissionId: str = Field(
        ...,
        description="Permission ID (must exist in permissions collection)"
    )

    @field_validator('moduleId', 'jobId', 'permissionId')
    @classmethod
    def validate_id_not_empty(cls, v):
        """Ensure IDs are not empty"""
        if not v or not v.strip():
            raise ValueError("ID cannot be empty")
        return v.strip()


class PermissionsMappingUpdateSchema(BaseModel):
    """Schema for updating permissions mapping"""
    moduleId: Optional[str] = Field(
        None,
        description="Module ID (must exist in modules collection)"
    )
    jobId: Optional[str] = Field(
        None,
        description="Job ID (must exist in jobs collection)"
    )
    permissionId: Optional[str] = Field(
        None,
        description="Permission ID (must exist in permissions collection)"
    )

    @field_validator('moduleId', 'jobId', 'permissionId')
    @classmethod
    def validate_id_not_empty(cls, v):
        """Ensure IDs are not empty if provided"""
        if v is not None:
            if not v.strip():
                raise ValueError("ID cannot be empty")
            return v.strip()
        return v


class PermissionsMappingResponseSchema(BaseModel):
    """Schema for permissions mapping response"""
    id: str = Field(..., alias="_id", description="Permissions Mapping ID (Primary Key)")
    moduleId: str = Field(..., description="Module ID")
    moduleName: str = Field(..., description="Module name")
    jobId: str = Field(..., description="Job ID")
    jobName: str = Field(..., description="Job name")
    permissionId: str = Field(..., description="Permission ID")
    permissionName: str = Field(..., description="Permission name")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User ID who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User ID who last updated this record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)
