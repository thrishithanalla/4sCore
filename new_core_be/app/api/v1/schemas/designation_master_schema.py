"""
Designation Master Schema
Defines Pydantic schemas for Designation Master collection
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
import re


class DesignationMasterBaseSchema(BaseModel):
    """Base schema for Designation Master"""
    name: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Designation name (must contain at least 2 alphabets, allows alphabets + -_().)"
    )
    designationCd: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Designation code (alphanumeric only)"
    )

    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        """
        Validate name:
        - Must contain at least 2 alphabets
        - Only allows alphabets, -, _, (, ), .
        """
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")

        v = v.strip()

        # Check for allowed characters only: alphabets, -, _, (, ), .
        allowed_pattern = r'^[a-zA-Z\-_().\s]+$'
        if not re.match(allowed_pattern, v):
            raise ValueError("Name can only contain alphabets, hyphen (-), underscore (_), parentheses (()), and dot (.)")

        # Check for at least 2 alphabets
        alphabet_count = len(re.findall(r'[a-zA-Z]', v))
        if alphabet_count < 2:
            raise ValueError("Name must contain at least 2 alphabet characters")

        return v

    @field_validator('designationCd')
    @classmethod
    def validate_designation_cd(cls, v):
        """
        Validate designationCd:
        - Alphanumeric only
        - Max 200 characters
        """
        if not v or not v.strip():
            raise ValueError("Designation code cannot be empty")

        v = v.strip()

        # Check for alphanumeric only
        if not re.match(r'^[a-zA-Z0-9]+$', v):
            raise ValueError("Designation code must be alphanumeric only (letters and numbers)")

        return v


class DesignationMasterCreateSchema(DesignationMasterBaseSchema):
    """Schema for creating a new designation master"""
    pass


class DesignationMasterUpdateSchema(BaseModel):
    """Schema for updating an existing designation master"""
    name: Optional[str] = Field(
        None,
        min_length=2,
        max_length=200,
        description="Designation name (must contain at least 2 alphabets, allows alphabets + -_().)"
    )
    designationCd: Optional[str] = Field(
        None,
        min_length=1,
        max_length=200,
        description="Designation code (alphanumeric only)"
    )

    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        """Validate name if provided"""
        if v is not None:
            if not v.strip():
                raise ValueError("Name cannot be empty")

            v = v.strip()

            # Check for allowed characters only
            allowed_pattern = r'^[a-zA-Z\-_().\s]+$'
            if not re.match(allowed_pattern, v):
                raise ValueError("Name can only contain alphabets, hyphen (-), underscore (_), parentheses (()), and dot (.)")

            # Check for at least 2 alphabets
            alphabet_count = len(re.findall(r'[a-zA-Z]', v))
            if alphabet_count < 2:
                raise ValueError("Name must contain at least 2 alphabet characters")

            return v
        return v

    @field_validator('designationCd')
    @classmethod
    def validate_designation_cd(cls, v):
        """Validate designationCd if provided"""
        if v is not None:
            if not v.strip():
                raise ValueError("Designation code cannot be empty")

            v = v.strip()

            # Check for alphanumeric only
            if not re.match(r'^[a-zA-Z0-9]+$', v):
                raise ValueError("Designation code must be alphanumeric only (letters and numbers)")

            return v
        return v


class DesignationMasterResponseSchema(DesignationMasterBaseSchema):
    """Schema for designation master response"""
    id: str = Field(..., alias="_id", description="Designation Master ID (Primary Key)")
    isActive: bool = Field(default=True, description="Active flag (true=active, false=inactive)")
    isDelete: bool = Field(default=False, description="Soft delete flag (true=deleted, false=active)")
    createdBy: str = Field(..., description="User ID who created this record")
    createdAt: datetime = Field(..., description="Creation timestamp")
    createdIp: Optional[str] = Field(None, description="IP address of creator")
    updatedBy: Optional[str] = Field(None, description="User ID who last updated this record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, description="IP address of updater")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)


class DesignationMasterActiveToggleSchema(BaseModel):
    """Schema for toggling active status"""
    isActive: bool = Field(..., description="New active status (true or false)")


class DesignationMasterBulkCreateItemSchema(BaseModel):
    """Schema for a single item in bulk create"""
    name: str = Field(
        ...,
        min_length=2,
        max_length=200,
        description="Designation name"
    )
    designationCd: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Designation code"
    )

    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        """Validate name"""
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        v = v.strip()
        allowed_pattern = r'^[a-zA-Z\-_().\s]+$'
        if not re.match(allowed_pattern, v):
            raise ValueError("Name can only contain alphabets, hyphen (-), underscore (_), parentheses (()), and dot (.)")
        alphabet_count = len(re.findall(r'[a-zA-Z]', v))
        if alphabet_count < 2:
            raise ValueError("Name must contain at least 2 alphabet characters")
        return v

    @field_validator('designationCd')
    @classmethod
    def validate_designation_cd(cls, v):
        """Validate designationCd"""
        if not v or not v.strip():
            raise ValueError("Designation code cannot be empty")
        v = v.strip()
        if not re.match(r'^[a-zA-Z0-9]+$', v):
            raise ValueError("Designation code must be alphanumeric only")
        return v


class DesignationMasterBulkCreateSchema(BaseModel):
    """Schema for bulk create designation masters"""
    items: list[DesignationMasterBulkCreateItemSchema] = Field(
        ...,
        min_length=1,
        description="List of designation masters to create"
    )
