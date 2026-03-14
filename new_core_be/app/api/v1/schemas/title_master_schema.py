from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime


class TitleMasterBaseSchema(BaseModel):
    """Base schema for TitleMaster"""
    name: str = Field(..., max_length=50, description="Title name")


class TitleMasterCreateSchema(TitleMasterBaseSchema):
    """Schema for creating a new TitleMaster - createdBy is set automatically from authenticated user token"""
    pass


class TitleMasterUpdateSchema(BaseModel):
    """Schema for updating TitleMaster - updatedBy is set automatically from authenticated user token"""
    name: Optional[str] = Field(None, max_length=50)


class TitleMasterResponseSchema(TitleMasterBaseSchema):
    """Schema for TitleMaster response"""
    id: str = Field(..., alias="_id", description="Title ID")
    createdBy: str
    createdAt: datetime
    updatedBy: Optional[str] = None
    updatedAt: Optional[datetime] = None
    isDelete: bool = False

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)


class TitleMasterSearchSchema(BaseModel):
    """Schema for searching TitleMasters"""
    name: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)