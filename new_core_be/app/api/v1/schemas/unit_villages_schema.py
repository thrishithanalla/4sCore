from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.api.v1.utils.validators import validate_village_name_field


class UnitVillagesBaseSchema(BaseModel):
    """Base schema for UnitVillages"""
    # Required fields (required=true, nullable=false)
    unitId: str = Field(..., description="Reference to organizational unit (FK: unit._id)")
    mandalId: str = Field(..., description="Reference to mandal (FK: mandal._id)")
    villageName: str = Field(..., max_length=200, description="Name of the village - alphabets, spaces, hyphens only")

    @field_validator('villageName', mode='before')
    @classmethod
    def validate_village_name(cls, v):
        """Validate villageName: alphabets, spaces, hyphens only, max 200 chars"""
        return validate_village_name_field(v, "villageName", max_length=200)


class UnitVillagesCreateSchema(UnitVillagesBaseSchema):
    """Schema for creating a new UnitVillages mapping - createdBy is set automatically from authenticated user token"""
    pass


class UnitVillagesUpdateSchema(BaseModel):
    """Schema for updating UnitVillages - updatedBy is set automatically from authenticated user token"""
    unitId: Optional[str] = None
    mandalId: Optional[str] = None
    villageName: Optional[str] = Field(None, max_length=200, description="Name of the village - alphabets, spaces, hyphens only")

    @field_validator('villageName', mode='before')
    @classmethod
    def validate_village_name(cls, v):
        """Validate villageName if provided: alphabets, spaces, hyphens only, max 200 chars"""
        if v is None:
            return v
        return validate_village_name_field(v, "villageName", max_length=200)


class NestedUnitSchema(BaseModel):
    """Nested unit data in unit-villages response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    policeReferenceId: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedMandalSchema(BaseModel):
    """Nested mandal data in unit-villages response"""
    id: str = Field(..., alias="_id")
    mandalName: Optional[str] = None
    districtId: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class UnitVillagesResponseSchema(UnitVillagesBaseSchema):
    """Schema for UnitVillages response"""
    id: str = Field(..., alias="_id", description="Village Mapping ID (Primary Key)")
    createdBy: str = Field(..., description="User who created the record (FK: user._id)")
    createdAt: datetime = Field(..., description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record (FK: user._id)")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag (false=active, true=logically deleted)")

    # Populated nested objects
    unit: Optional[NestedUnitSchema] = Field(None, description="Populated unit data")
    mandal: Optional[NestedMandalSchema] = Field(None, description="Populated mandal data")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )


class UnitVillagesSearchSchema(BaseModel):
    """Schema for searching UnitVillages"""
    unitId: Optional[str] = None
    mandalId: Optional[str] = None
    villageName: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)
