from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.api.v1.utils.validators import validate_name_field


class UnitTypeBaseSchema(BaseModel):
    """Base schema for UnitType"""
    name: str = Field(..., max_length=100, description="Unit type name - alphabets, spaces, hyphens, underscores only, min 2 alphabets")
    departmentId: Optional[str] = Field(None, description="Reference to department (FK: department._id)")
    level: int = Field(..., ge=0, description="Hierarchy level (integer, minimum 0)")

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: alphabets, spaces, hyphens, underscores only, min 2 alphabets"""
        return validate_name_field(v, "name", min_alphabets=2)


class UnitTypeCreateSchema(UnitTypeBaseSchema):
    """Schema for creating a new UnitType - createdBy is set automatically from authenticated user token"""
    pass


class UnitTypeUpdateSchema(BaseModel):
    """Schema for updating UnitType - updatedBy is set automatically from authenticated user token"""
    name: Optional[str] = Field(None, max_length=100, description="Unit type name - alphabets, spaces, hyphens, underscores only, min 2 alphabets")
    departmentId: Optional[str] = None
    level: Optional[int] = Field(None, ge=0, description="Hierarchy level (integer, minimum 0)")

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: alphabets, spaces, hyphens, underscores only, min 2 alphabets (if provided)"""
        if v is None:
            return v
        return validate_name_field(v, "name", min_alphabets=2)


class NestedDepartmentSchema(BaseModel):
    """Nested department data in unit type response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    cctnsDepartmentCd: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class UnitTypeResponseSchema(BaseModel):
    """Schema for UnitType response"""
    id: str = Field(..., alias="_id", description="Unit Type ID")
    name: str = Field(..., max_length=100, description="Unit type name")
    departmentId: Optional[str] = Field(None, description="Reference to department (FK: department._id)")
    level: Optional[int] = Field(None, description="Hierarchy level")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    # Populated nested objects
    department: Optional[NestedDepartmentSchema] = Field(None, description="Populated department data")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, json_encoders={ObjectId: str})


class UnitTypeSearchSchema(BaseModel):
    """Schema for searching UnitTypes"""
    name: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)
