from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional
from datetime import datetime
from bson import ObjectId
from app.api.v1.utils.validators import validate_name_field, validate_required_int_field


class RankMasterBaseSchema(BaseModel):
    """Base schema for RankMaster"""
    name: str = Field(..., max_length=100, description="Rank name - alphabets, spaces, hyphens, underscores only, min 2 alphabets")
    cctnsRankCd: int = Field(..., ge=0, le=999999, description="CCTNS Rank Code - required, integer")
    level: int = Field(..., ge=0, description="Rank level - required, minimum 0, no maximum")
    shortCode: Optional[str] = Field(None, max_length=20, description="Short code for rank")

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: alphabets, spaces, hyphens, underscores only, min 2 alphabets"""
        return validate_name_field(v, "name", min_alphabets=2)

    @field_validator('cctnsRankCd', mode='before')
    @classmethod
    def validate_cctns_rank_code(cls, v):
        """Validate cctnsRankCd: required integer"""
        return validate_required_int_field(v, "cctnsRankCd")

    @field_validator('level', mode='before')
    @classmethod
    def validate_level(cls, v):
        """Validate level: required integer, minimum 0"""
        return validate_required_int_field(v, "level")


class RankMasterCreateSchema(RankMasterBaseSchema):
    """Schema for creating a new RankMaster - createdBy is set automatically from authenticated user token"""
    pass


class RankMasterUpdateSchema(BaseModel):
    """Schema for updating RankMaster - updatedBy is set automatically from authenticated user token"""
    name: Optional[str] = Field(None, max_length=100, description="Rank name - alphabets, spaces, hyphens, underscores only, min 2 alphabets")
    cctnsRankCd: Optional[int] = Field(None, ge=0, le=999999, description="CCTNS Rank Code - integer")
    level: Optional[int] = Field(None, ge=0, description="Rank level - minimum 0, no maximum")
    shortCode: Optional[str] = Field(None, max_length=20)

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: alphabets, spaces, hyphens, underscores only, min 2 alphabets (if provided)"""
        if v is None:
            return v
        return validate_name_field(v, "name", min_alphabets=2)


class RankMasterResponseSchema(BaseModel):
    """Schema for RankMaster response"""
    id: str = Field(..., alias="_id", description="Rank ID")
    name: str = Field(..., max_length=100, description="Rank name")
    cctnsRankCd: int = Field(..., ge=0, le=999999, description="CCTNS Rank Code - required, integer")
    level: int = Field(default=0, ge=0, description="Rank level - defaults to 0 for existing records")
    shortCode: Optional[str] = Field(None, max_length=20, description="Short code for rank")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    @field_validator('cctnsRankCd', mode='before')
    @classmethod
    def validate_cctns_rank_code_response(cls, v):
        """Handle cctnsRankCd from DB - return 0 for legacy data compatibility"""
        if v is None:
            return 0  # Return 0 for legacy data without cctnsRankCd
        return int(v)

    @field_validator('level', mode='before')
    @classmethod
    def validate_level_response(cls, v):
        """Handle level from DB - return 0 for existing records without level"""
        if v is None:
            return 0  # Default to 0 for existing records
        return int(v)

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, json_encoders={ObjectId: str})


class RankMasterSearchSchema(BaseModel):
    """Schema for searching RankMasters"""
    name: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)