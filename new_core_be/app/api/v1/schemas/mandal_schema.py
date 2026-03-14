from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.api.v1.utils.validators import validate_name_field, validate_required_string_field


class MandalBaseSchema(BaseModel):
    """Base schema for Mandal"""
    districtId: str = Field(..., description="Reference to district (FK: district._id) - required, must exist in district collection")
    mandalName: str = Field(..., max_length=255, description="Name of the mandal - alphabets, spaces, hyphens, underscores only, min 2 alphabets")

    @field_validator('districtId', mode='before')
    @classmethod
    def validate_district_id(cls, v):
        """Validate districtId is not empty (DB existence checked in service layer)"""
        return validate_required_string_field(v, "districtId")

    @field_validator('mandalName', mode='before')
    @classmethod
    def validate_mandal_name(cls, v):
        """Validate mandalName: alphabets, spaces, hyphens, underscores only, min 2 alphabets"""
        return validate_name_field(v, "mandalName", min_alphabets=2)


class MandalCreateSchema(MandalBaseSchema):
    """Schema for creating a new Mandal - createdBy is set automatically from authenticated user token"""
    pass


class MandalUpdateSchema(BaseModel):
    """Schema for updating Mandal - updatedBy is set automatically from authenticated user token"""
    districtId: Optional[str] = Field(None, description="Reference to district (FK: district._id)")
    mandalName: Optional[str] = Field(None, max_length=255, description="Name of the mandal - alphabets, spaces, hyphens, underscores only, min 2 alphabets")

    @field_validator('districtId', mode='before')
    @classmethod
    def validate_district_id(cls, v):
        """Validate districtId is not empty if provided (DB existence checked in service layer)"""
        if v is None:
            return v
        return validate_required_string_field(v, "districtId")

    @field_validator('mandalName', mode='before')
    @classmethod
    def validate_mandal_name(cls, v):
        """Validate mandalName: alphabets, spaces, hyphens, underscores only, min 2 alphabets (if provided)"""
        if v is None:
            return v
        return validate_name_field(v, "mandalName", min_alphabets=2)


class NestedDistrictSchema(BaseModel):
    """Nested district data in mandal response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    cctnsDistrictCd: Optional[str] = None
    stateName: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class MandalResponseSchema(BaseModel):
    """Schema for Mandal response"""
    id: str = Field(..., alias="_id", description="Mandal ID")
    districtId: str = Field(..., description="Reference to district (FK: district._id)")
    mandalName: str = Field(..., max_length=255, description="Name of the mandal")
    createdBy: str = Field(..., description="User who created this record")
    createdAt: datetime = Field(..., description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    # Populated nested objects
    district: Optional[NestedDistrictSchema] = Field(None, description="Populated district data")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )


class MandalSearchSchema(BaseModel):
    """Schema for searching Mandals"""
    districtId: Optional[str] = None
    mandalName: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)

