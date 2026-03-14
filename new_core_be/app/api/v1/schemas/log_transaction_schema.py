from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Dict, Any
from datetime import datetime
from bson import ObjectId


class LogTransactionCreateSchema(BaseModel):
    """Schema for creating a new Audit Log entry"""
    layer: str = Field(..., min_length=1, max_length=100, description="Application layer")
    eventcode: str = Field(..., min_length=1, max_length=200, description="Event code (FK: audit_log_master.eventCode)")
    EventTimeStamp: datetime = Field(..., description="Event occurrence time")
    actorRole: str = Field(..., min_length=1, max_length=200, description="Role of the actor (e.g., SHO)")
    keyFields: str = Field(..., min_length=1, max_length=500, description="Identifier fields for the record")
    parameters: Optional[Dict[str, Any]] = Field(None, description="Additional parameters")
    retentionPeriod: int = Field(..., gt=0, description="Retention period in days")
    endpoint: str = Field(..., min_length=1, max_length=500, description="API endpoint")
    entityType: str = Field(..., min_length=1, max_length=200, description="Entity type (e.g., Case)")
    entityId: str = Field(..., min_length=1, max_length=200, description="Entity identifier (e.g., CASE-2025-001)")
    orgUnitId: str = Field(..., min_length=1, max_length=200, description="Org unit identifier (e.g., PS-101)")
    requestId: str = Field(..., min_length=1, max_length=200, description="Request identifier (e.g., req-789)")
    message: Optional[str] = Field(None, max_length=2000, description="Log message")
    Details: Optional[Dict[str, Any]] = Field(None, description="Additional contextual data")
    # Note: actorId is auto-populated from the current user's token

    @field_validator('eventcode')
    @classmethod
    def validate_eventcode(cls, v):
        if not v or v.strip() == "":
            raise ValueError("eventcode cannot be empty")
        return v.strip()

    @field_validator('entityType')
    @classmethod
    def validate_entity_type(cls, v):
        if not v or v.strip() == "":
            raise ValueError("entityType cannot be empty")
        return v.strip()

    @field_validator('entityId')
    @classmethod
    def validate_entity_id(cls, v):
        if not v or v.strip() == "":
            raise ValueError("entityId cannot be empty")
        return v.strip()


class LogTransactionResponseSchema(BaseModel):
    """Schema for Audit Log response"""
    id: str = Field(..., alias="_id", description="Audit Log ID (Primary Key)")
    layer: str = Field(..., description="Application layer")
    actorId: Optional[str] = Field(None, description="User who performed the action (FK: user._id)")
    eventcode: str = Field(..., description="Event code (FK: audit_log_master.eventCode)")
    EventTimeStamp: datetime = Field(..., description="Event occurrence time")
    actorRole: str = Field(..., description="Role of the actor")
    keyFields: Optional[str] = Field(None, description="Identifier fields")
    parameters: Optional[Dict[str, Any]] = Field(None, description="Additional parameters")
    retentionPeriod: Optional[int] = Field(None, description="Retention period in days")
    message: Optional[str] = Field(None, description="Log message")
    endpoint: Optional[str] = Field(None, description="API endpoint")
    entityType: Optional[str] = Field(None, description="Entity type")
    entityId: Optional[str] = Field(None, description="Entity identifier")
    orgUnitId: Optional[str] = Field(None, description="Org unit identifier")
    requestId: Optional[str] = Field(None, description="Request identifier")
    Details: Optional[Dict[str, Any]] = Field(None, description="Additional contextual data")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )
