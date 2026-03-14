from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.api.v1.utils.validators import validate_name_field, validate_numeric_string_field, validate_state_name_field


class DistrictBaseSchema(BaseModel):
    """Base schema for District"""
    name: str = Field(..., max_length=100, description="District name - alphabets, spaces, hyphens, underscores only, min 2 alphabets")
    cctnsDistrictCd: str = Field(..., max_length=50, description="CCTNS District Code - required, numbers only")
    stateName: Optional[str] = Field(None, max_length=100, description="State name")

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: alphabets, spaces, hyphens, underscores only, min 2 alphabets"""
        return validate_name_field(v, "name", min_alphabets=2)

    @field_validator('cctnsDistrictCd', mode='before')
    @classmethod
    def validate_cctns_code(cls, v):
        """Validate cctnsDistrictCd: required, numbers only (string format)"""
        return validate_numeric_string_field(v, "cctnsDistrictCd")

    @field_validator('stateName', mode='before')
    @classmethod
    def validate_state_name(cls, v):
        """Validate stateName: alphabets and spaces only (optional)"""
        return validate_state_name_field(v, "stateName")


class DistrictCreateSchema(DistrictBaseSchema):
    """Schema for creating a new District"""
    pass


class DistrictUpdateSchema(BaseModel):
    """Schema for updating District"""
    name: Optional[str] = Field(None, max_length=100, description="District name - alphabets, spaces, hyphens, underscores only, min 2 alphabets")
    cctnsDistrictCd: Optional[str] = Field(None, max_length=50, description="CCTNS District Code - numbers only")
    stateName: Optional[str] = Field(None, max_length=100)

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: alphabets, spaces, hyphens, underscores only, min 2 alphabets (if provided)"""
        if v is None:
            return v
        return validate_name_field(v, "name", min_alphabets=2)

    @field_validator('cctnsDistrictCd', mode='before')
    @classmethod
    def validate_cctns_code(cls, v):
        """Validate cctnsDistrictCd: numbers only (string format, if provided)"""
        if v is None:
            return v
        return validate_numeric_string_field(v, "cctnsDistrictCd")

    @field_validator('stateName', mode='before')
    @classmethod
    def validate_state_name(cls, v):
        """Validate stateName: alphabets and spaces only (if provided)"""
        return validate_state_name_field(v, "stateName")


class DistrictResponseSchema(BaseModel):
    """Schema for District response"""
    id: str = Field(..., alias="_id", description="District ID")
    name: str = Field(..., max_length=100, description="District name")
    cctnsDistrictCd: str = Field(..., max_length=50, description="CCTNS District Code - required, numbers only")
    stateName: Optional[str] = Field(None, max_length=100, description="State name")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    @field_validator('cctnsDistrictCd', mode='before')
    @classmethod
    def validate_cctns_code_response(cls, v):
        """Handle cctnsDistrictCd from DB - return as-is for legacy data compatibility"""
        if v is None:
            return ""  # Return empty string for legacy data without cctnsDistrictCd
        return str(v)

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, json_encoders={ObjectId: str})


class DistrictSearchSchema(BaseModel):
    """Schema for searching Districts"""
    name: Optional[str] = None
    cctnsDistrictCd: Optional[str] = None
    stateName: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)