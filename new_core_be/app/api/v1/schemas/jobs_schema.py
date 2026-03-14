"""
Jobs Schema
Defines Pydantic schemas for Jobs collection
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
import re


class JobsBaseSchema(BaseModel):
    """Base schema for Jobs"""
    name: str = Field(
        ...,
        min_length=1,
        max_length=120,
        description="Job name (must contain alphabets)"
    )
    shortCode: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Short code for the job"
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Job description"
    )
    menuEligible: bool = Field(
        default=True,
        description="Whether this job is eligible to appear in menu (default: true). If false, isMenu in roles/user-mappings will be forced to false."
    )
    displayOrder: Optional[int] = Field(
        None,
        ge=0,
        description="Display order for menu (min=0, default: 1 if menuEligible=true, 0 if menuEligible=false)"
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


class JobsCreateSchema(JobsBaseSchema):
    """Schema for creating a new job"""
    displayName: Optional[str] = Field(
        None,
        max_length=120,
        description="Display name (e.g., 'UserManagement')"
    )
    route: Optional[str] = Field(
        None,
        max_length=120,
        description="Route path (e.g., 'user-managements')"
    )


class JobsUpdateSchema(BaseModel):
    """Schema for updating an existing job"""
    name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=120,
        description="Job name (must contain alphabets)"
    )
    shortCode: Optional[str] = Field(
        None,
        min_length=1,
        max_length=20,
        description="Short code for the job"
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Job description"
    )
    menuEligible: Optional[bool] = Field(
        None,
        description="Whether this job is eligible to appear in menu. If false, isMenu in roles/user-mappings will be forced to false."
    )
    displayName: Optional[str] = Field(
        None,
        max_length=120,
        description="Display name (can be manually set or auto-generated from name)"
    )
    route: Optional[str] = Field(
        None,
        max_length=120,
        description="Route (can be manually set or auto-generated from name)"
    )
    displayOrder: Optional[int] = Field(
        None,
        ge=0,
        description="Display order for menu (min=0)"
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


class JobsActiveToggleSchema(BaseModel):
    """Schema for toggling job active status"""
    isActive: bool = Field(..., description="New active status (true or false)")


class JobsResponseSchema(JobsBaseSchema):
    """Schema for jobs response"""
    id: str = Field(..., alias="_id", description="Job ID (Primary Key)")
    displayName: str = Field(..., description="Display name in PascalCase (auto-generated from name)")
    route: str = Field(..., description="Route in lowercase with hyphens and plural (auto-generated from name)")
    displayOrder: int = Field(..., description="Display order for menu (0 if menuEligible=false, 1+ if menuEligible=true)")
    isActive: bool = Field(default=True, description="Active flag (true=active, false=inactive)")
    isDelete: bool = Field(default=False, description="Soft delete flag (true=deleted, false=active)")
    createdBy: str = Field(..., description="User ID who created this record")
    createdAt: datetime = Field(..., description="Creation timestamp")
    updatedBy: Optional[str] = Field(None, description="User ID who last updated this record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)
