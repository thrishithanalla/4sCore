"""
Schema definitions for FeedbackMaster.

Naming: <Entity><Action>Schema

Fields:
- options: Object containing likedOptions and dislikedOptions arrays
  - likedOptions: Options shown when isLiked = true (e.g., "Accurate", "Helpful", "Fast response")
  - dislikedOptions: Options shown when isLiked = false (e.g., "Inaccurate", "Not helpful", "Too slow")
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.api.v1.utils.validators import validate_name_field


# Component type enum values
ComponentType = Literal["prompt", "api", "function", "screen"]


class FeedbackOptionsSchema(BaseModel):
    """Schema for feedback options structure"""
    likedOptions: Optional[List[str]] = Field(
        None,
        description="List of predefined feedback options when isLiked = true (e.g., 'Accurate', 'Helpful', 'Fast response')"
    )
    dislikedOptions: Optional[List[str]] = Field(
        None,
        description="List of predefined feedback options when isLiked = false (e.g., 'Inaccurate', 'Not helpful', 'Too slow')"
    )


class FeedbackMasterBaseSchema(BaseModel):
    """Base schema for FeedbackMaster"""
    name: str = Field(..., max_length=300, description="Human-readable name of the master entry")
    componentType: ComponentType = Field(..., description="Component type: prompt, api, function, or screen")
    options: Optional[FeedbackOptionsSchema] = Field(
        None,
        description="Object containing likedOptions and dislikedOptions arrays for positive and negative feedback"
    )
    moduleId: Optional[str] = Field(None, description="Foreign key reference to modules collection _id")

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: cannot be null or empty"""
        return validate_name_field(v, "name", min_alphabets=2)


class FeedbackMasterCreateSchema(FeedbackMasterBaseSchema):
    """Schema for creating a new FeedbackMaster"""
    pass


class FeedbackMasterUpdateSchema(BaseModel):
    """Schema for updating FeedbackMaster - updatedBy is set automatically from authenticated user token"""
    name: Optional[str] = Field(None, max_length=300, description="Human-readable name of the master entry")
    componentType: Optional[ComponentType] = Field(None, description="Component type: prompt, api, function, or screen")
    options: Optional[FeedbackOptionsSchema] = Field(
        None,
        description="Object containing likedOptions and dislikedOptions arrays for positive and negative feedback"
    )
    moduleId: Optional[str] = Field(None, description="Foreign key reference to modules collection _id")

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name if provided: cannot be empty"""
        if v is None:
            return v
        return validate_name_field(v, "name", min_alphabets=2)


class FeedbackMasterResponseSchema(BaseModel):
    """Schema for FeedbackMaster response"""
    id: str = Field(..., alias="_id", description="FeedbackMaster ID")
    name: str = Field(..., max_length=300, description="Human-readable name of the master entry")
    componentType: str = Field(..., description="Component type: prompt, api, function, or screen")
    options: Optional[FeedbackOptionsSchema] = Field(
        None,
        description="Object containing likedOptions and dislikedOptions arrays for positive and negative feedback"
    )
    moduleId: Optional[str] = Field(None, description="Foreign key reference to modules collection _id")

    # Audit fields (master table - includes isActive)
    isActive: bool = Field(default=True, description="Whether this record is active")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was updated")

    # Populated nested objects
    module: Optional[dict] = Field(None, description="Populated module data")

    model_config = ConfigDict(populate_by_name=True)


class FeedbackMasterListResponseSchema(BaseModel):
    """Schema for FeedbackMaster list response"""
    data: List[FeedbackMasterResponseSchema]
    totalItems: int


class FeedbackMasterActiveToggleSchema(BaseModel):
    """Schema for toggling FeedbackMaster active status"""
    isActive: bool = Field(..., description="New active status (true or false)")
