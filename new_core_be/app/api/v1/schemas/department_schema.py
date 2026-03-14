from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from app.api.v1.utils.validators import validate_department_name_field


class DepartmentBaseSchema(BaseModel):
    """Base schema for Department"""
    name: str = Field(..., max_length=255, description="Department name - alphabets, spaces, hyphens, underscores, & and / allowed, min 2 alphabets")
    cctnsDepartmentCd: Optional[str] = Field(None, max_length=50, description="CCTNS Department Code")

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: alphabets, spaces, hyphens, underscores, & and / allowed, min 2 alphabets"""
        return validate_department_name_field(v, "name", min_alphabets=2)


class DepartmentCreateSchema(DepartmentBaseSchema):
    """Schema for creating a new Department"""
    pass


class DepartmentUpdateSchema(BaseModel):
    """Schema for updating Department"""
    name: Optional[str] = Field(None, max_length=255, description="Department name - alphabets, spaces, hyphens, underscores, & and / allowed, min 2 alphabets")
    cctnsDepartmentCd: Optional[str] = Field(None, max_length=50)

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: alphabets, spaces, hyphens, underscores, & and / allowed, min 2 alphabets (if provided)"""
        if v is None:
            return v
        return validate_department_name_field(v, "name", min_alphabets=2)


class DepartmentResponseSchema(BaseModel):
    """Schema for Department response"""
    id: str = Field(..., alias="_id", description="Department ID (Primary Key)")
    name: str = Field(..., max_length=255, description="Department name")
    cctnsDepartmentCd: Optional[str] = Field(None, max_length=50, description="CCTNS Department Code")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )


class DepartmentSearchSchema(BaseModel):
    """Schema for searching Departments"""
    name: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)


class DepartmentBulkCreateSchema(BaseModel):
    """Schema for bulk creating departments"""
    items: List[DepartmentCreateSchema] = Field(..., min_length=1, description="List of departments to create")


class DepartmentBulkCreateResponseSchema(BaseModel):
    """Response schema for bulk create operation"""
    success: List[dict] = Field(default=[], description="Successfully created departments")
    failed: List[dict] = Field(default=[], description="Failed items with error details")
    totalSuccess: int = Field(default=0, description="Total successfully created")
    totalFailed: int = Field(default=0, description="Total failed to create")
