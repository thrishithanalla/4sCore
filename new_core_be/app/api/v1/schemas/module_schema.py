"""
Module Schema
Defines Pydantic schemas for Module collection
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
import re


class ModuleBaseSchema(BaseModel):
    """Base schema for Module"""
    name: str = Field(
        ...,
        min_length=1,
        max_length=120,
        description="Module name (must contain alphabets)"
    )
    shortCode: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Short code for the module"
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Module description"
    )
    displayOrder: Optional[int] = Field(
        default=0,
        ge=0,
        description="Display order for the module (non-negative integer, sorted ascending)"
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


class ModuleCreateSchema(ModuleBaseSchema):
    """Schema for creating a new module"""
    pass


class ModuleUpdateSchema(BaseModel):
    """Schema for updating an existing module"""
    name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=120,
        description="Module name (must contain alphabets)"
    )
    shortCode: Optional[str] = Field(
        None,
        min_length=1,
        max_length=20,
        description="Short code for the module"
    )
    description: Optional[str] = Field(
        None,
        max_length=500,
        description="Module description"
    )
    displayOrder: Optional[int] = Field(
        None,
        ge=0,
        description="Display order for the module (non-negative integer, sorted ascending)"
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


class ModuleActiveToggleSchema(BaseModel):
    """Schema for toggling module active status"""
    isActive: bool = Field(..., description="New active status (true or false)")


class ModuleResponseSchema(ModuleBaseSchema):
    """Schema for module response"""
    id: str = Field(..., alias="_id", description="Module ID (Primary Key)")
    isActive: bool = Field(default=True, description="Active flag (true=active, false=inactive)")
    isDelete: bool = Field(default=False, description="Soft delete flag (true=deleted, false=active)")
    createdBy: str = Field(..., description="User ID who created this record")
    createdAt: datetime = Field(..., description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User ID who last updated this record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)
