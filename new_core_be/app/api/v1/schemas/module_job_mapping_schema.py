"""
Module Job Mapping Schema
Defines the mapping between modules and jobs (composite key: moduleId + jobId)
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional
from datetime import datetime


class ModuleJobMappingCreateSchema(BaseModel):
    """Schema for creating module job mapping"""
    moduleId: str = Field(
        ...,
        description="Module ID (must exist in modules collection)"
    )
    jobId: str = Field(
        ...,
        description="Job ID (must exist in jobs collection)"
    )

    @field_validator('moduleId', 'jobId')
    @classmethod
    def validate_id_not_empty(cls, v):
        """Ensure IDs are not empty"""
        if not v or not v.strip():
            raise ValueError("ID cannot be empty")
        return v.strip()


class ModuleJobMappingUpdateSchema(BaseModel):
    """Schema for updating module job mapping"""
    moduleId: Optional[str] = Field(
        None,
        description="Module ID (must exist in modules collection)"
    )
    jobId: Optional[str] = Field(
        None,
        description="Job ID (must exist in jobs collection)"
    )
    isActive: Optional[bool] = Field(
        None,
        description="Active status flag"
    )

    @field_validator('moduleId', 'jobId')
    @classmethod
    def validate_id_not_empty(cls, v):
        """Ensure IDs are not empty if provided"""
        if v is not None:
            if not v.strip():
                raise ValueError("ID cannot be empty")
            return v.strip()
        return v


class ModuleJobMappingResponseSchema(BaseModel):
    """Schema for module job mapping response"""
    id: str = Field(..., alias="_id", description="Module Job Mapping ID (Primary Key)")
    moduleId: str = Field(..., description="Module ID")
    moduleName: str = Field(..., description="Module name")
    jobId: str = Field(..., description="Job ID")
    jobName: str = Field(..., description="Job name")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User ID who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User ID who last updated this record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)
