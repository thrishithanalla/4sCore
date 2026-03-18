from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Dict, Any, List
from datetime import datetime
from bson import ObjectId


class LogMasterBaseSchema(BaseModel):
    """Base schema for Audit Log Master"""
    logObject: str = Field(..., min_length=1, max_length=200, description="Entity on which action is performed")
    action: str = Field(..., min_length=1, max_length=100, description="Operation performed on object (ValueSet: Actions)")
    keyFields: str = Field(..., min_length=1, max_length=500, description="Identifier fields used to track record")
    parameters: Optional[List[str]] = Field(None, description="Fields captured from API request")
    retentionPeriod: int = Field(default=365, gt=0, description="Log retention duration in days")
    messageTemplate: str = Field(..., min_length=1, description="Message format used for log generation")
    templateParameters: Optional[Dict[str, Any]] = Field(None, description="Variables used inside messageTemplate")
    isActive: Optional[bool] = Field(default=True, description="Whether this log master is active")
    canBeLogged: Optional[bool] = Field(default=True, description="Whether this log should be recorded")
    layer: str = Field(..., min_length=1, max_length=100, description="Application layer (ValueSet: layer)")
    isUsageTrackable: bool = Field(..., description="Whether this log is trackable for analytics")
    isSensitive: bool = Field(..., description="Whether this log contains sensitive data for masking")
    eventCode: str = Field(..., min_length=1, max_length=200, description="Unique event code (logObject.action pattern)")
    description: str = Field(..., min_length=1, max_length=1000, description="Description of the audit log")
    logLevel: str = Field(default="INFO", min_length=1, max_length=50, description="Log level (e.g., INFO, WARNING, ERROR)")
    logtype: str = Field(default="AUDIT", min_length=1, max_length=50, description="Log type (ValueSet: logType)")

    @field_validator('logObject')
    @classmethod
    def validate_log_object(cls, v):
        if not v or v.strip() == "":
            raise ValueError("logObject cannot be empty")
        return v.strip()

    @field_validator('action')
    @classmethod
    def validate_action(cls, v):
        if not v or v.strip() == "":
            raise ValueError("action cannot be empty")
        return v.strip()

    @field_validator('keyFields')
    @classmethod
    def validate_key_fields(cls, v):
        if not v or v.strip() == "":
            raise ValueError("keyFields cannot be empty")
        return v.strip()

    @field_validator('messageTemplate')
    @classmethod
    def validate_message_template(cls, v):
        if not v or v.strip() == "":
            raise ValueError("messageTemplate cannot be empty")
        return v.strip()

    @field_validator('eventCode')
    @classmethod
    def validate_event_code(cls, v):
        if not v or v.strip() == "":
            raise ValueError("eventCode cannot be empty")
        return v.strip()

    @field_validator('description')
    @classmethod
    def validate_description(cls, v):
        if not v or v.strip() == "":
            raise ValueError("description cannot be empty")
        return v.strip()

    @field_validator('retentionPeriod')
    @classmethod
    def validate_retention_period(cls, v):
        if v <= 0:
            raise ValueError("retentionPeriod must be greater than 0")
        return v


class LogMasterCreateSchema(LogMasterBaseSchema):
    """Schema for creating a new Audit Log Master"""
    pass


class LogMasterUpdateSchema(BaseModel):
    """Schema for updating Audit Log Master - all fields optional"""
    logObject: Optional[str] = None
    action: Optional[str] = None
    keyFields: Optional[str] = None
    parameters: Optional[List[str]] = None
    retentionPeriod: Optional[int] = None
    messageTemplate: Optional[str] = None
    templateParameters: Optional[Dict[str, Any]] = None
    isActive: Optional[bool] = None
    canBeLogged: Optional[bool] = None
    layer: Optional[str] = None
    isUsageTrackable: Optional[bool] = None
    isSensitive: Optional[bool] = None
    eventCode: Optional[str] = None
    description: Optional[str] = None
    logLevel: Optional[str] = None
    logtype: Optional[str] = None

    @field_validator('logObject')
    @classmethod
    def validate_log_object(cls, v):
        if v is not None and (not v or v.strip() == ""):
            raise ValueError("logObject cannot be empty")
        return v.strip() if v else v

    @field_validator('action')
    @classmethod
    def validate_action(cls, v):
        if v is not None and (not v or v.strip() == ""):
            raise ValueError("action cannot be empty")
        return v.strip() if v else v

    @field_validator('keyFields')
    @classmethod
    def validate_key_fields(cls, v):
        if v is not None and (not v or v.strip() == ""):
            raise ValueError("keyFields cannot be empty")
        return v.strip() if v else v

    @field_validator('messageTemplate')
    @classmethod
    def validate_message_template(cls, v):
        if v is not None and (not v or v.strip() == ""):
            raise ValueError("messageTemplate cannot be empty")
        return v.strip() if v else v

    @field_validator('eventCode')
    @classmethod
    def validate_event_code(cls, v):
        if v is not None and (not v or v.strip() == ""):
            raise ValueError("eventCode cannot be empty")
        return v.strip() if v else v

    @field_validator('description')
    @classmethod
    def validate_description(cls, v):
        if v is not None and (not v or v.strip() == ""):
            raise ValueError("description cannot be empty")
        return v.strip() if v else v

    @field_validator('retentionPeriod')
    @classmethod
    def validate_retention_period(cls, v):
        if v is not None and v <= 0:
            raise ValueError("retentionPeriod must be greater than 0")
        return v


class LogMasterResponseSchema(LogMasterBaseSchema):
    """Schema for Audit Log Master response"""
    id: str = Field(..., alias="_id", description="Audit Log Master ID (Primary Key)")
    createdBy: Optional[str] = Field(None, description="User who created (FK: personnel._id)")
    createdAt: datetime = Field(..., description="Creation timestamp")
    createdIp: Optional[str] = Field(None, description="IP address of creator")
    updatedBy: Optional[str] = Field(None, description="User who last modified (FK: personnel._id)")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, description="IP address of last updater")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )


class LogMasterBulkCreateSchema(BaseModel):
    """Schema for bulk creating audit log masters"""
    items: List[LogMasterCreateSchema] = Field(..., min_length=1, description="List of audit log masters to create")


class LogMasterBulkCreateResponseSchema(BaseModel):
    """Response schema for bulk create operation"""
    success: List[LogMasterResponseSchema] = Field(default=[], description="Successfully created audit log masters")
    failed: List[dict] = Field(default=[], description="Failed items with error details")
    totalSuccess: int = Field(default=0, description="Total successfully created")
    totalFailed: int = Field(default=0, description="Total failed to create")
