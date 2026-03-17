"""
Schema Masters for Error Masters.

Naming: <Entity><Action>Schema
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, ConfigDict

# consolidate helpers into one module as you did
from app.api.v1.utils.error_master_helpers import (
    ERRCODE_STRICT,
    ERRCODE_PREFERRED,
    assert_iso_639_1,
    assert_lower_camel_placeholders,
)
# from app.utils.pagination import PageOut
from pydantic import BaseModel, Field

class PageOut(BaseModel):
    totalItems: int
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)

class LocalizedMessageSchema(BaseModel):
    """Localized i18n message with placeholders."""

    language: str = Field(..., description='ISO-639-1 language code, e.g. "en"')
    template: str = Field(..., description="Template with {lowerCamelCase} placeholders")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("language")
    @classmethod
    def _v_language(cls, v: str) -> str:
        return assert_iso_639_1(v)

    @field_validator("template")
    @classmethod
    def _v_template(cls, v: str) -> str:
        return assert_lower_camel_placeholders(v)


# API accepts strings; service normalizes against valueSets and stores canonical strings
# Removed Literal types to allow value-sets to define valid codes dynamically

class ErrorMasterBaseSchema(BaseModel):
    """Common fields for Error Masters."""

    errorCode: str = Field(..., max_length=120)
    errorType: str = Field(..., description="Must exist in 'errorType' value-set")
    errorSeverity: str = Field(..., description="Must exist in 'errorSeverity' value-set")
    log: bool = Field(default=True)
    moduleId: Optional[str] = Field(default=None, description="Foreign key reference to modules collection _id")
    businessArea: Optional[str] = Field(default=None, max_length=120)
    technicalArea: Optional[str] = Field(default=None, max_length=120)
    tool: Optional[str] = Field(default=None, max_length=120)
    partnerSystem: Optional[str] = Field(default=None, max_length=120)
    thirdParty: Optional[str] = Field(default=None, max_length=120)
    sourceType: str = Field(..., description="Must exist in 'sourceType' value-set")
    sourceName: str = Field(..., max_length=200)
    appCode: Optional[str] = Field(default=None, description="Application code identifier")
    notificationId: Optional[str] = Field(default=None, description="FK to notification_master._id")
    messages: List[LocalizedMessageSchema]
    devMessage: Optional[str] = Field(default=None, max_length=2000)
    helpLink: Optional[HttpUrl] = None
    videoLink: Optional[HttpUrl] = None

    @field_validator("errorCode")
    @classmethod
    def _v_error_code(cls, v: str) -> str:
        if not ERRCODE_STRICT.match(v or ""):
            raise ValueError("errorCode must match ^[A-Za-z0-9_\\.:-]{3,120}$")
        if not ERRCODE_PREFERRED.match(v or ""):
            raise ValueError(
                "errorCode should follow namespaced form: "
                "ERR.<MODULE>.<COMPONENT>.<ACTION>[.<QUALIFIERS>...]"
            )
        return v


class ErrorMasterCreateSchema(ErrorMasterBaseSchema):
    """Create schema - createdBy and createdIp are set automatically from authenticated user context."""
    pass


# class ErrorMasterUpdateSchema(BaseModel):
#     """Patch schema; errorCode immutable."""
#     errorType: Optional[str] = Field(None, description="Must exist in 'errorType' value-set")
#     errorSeverity: Optional[str] = Field(None, description="Must exist in 'errorSeverity' value-set")
#     log: Optional[bool] = None
#     businessArea: Optional[str] = None
#     technicalArea: Optional[str] = None
#     tool: Optional[str] = None
#     partnerSystem: Optional[str] = None
#     thirdParty: Optional[str] = None
#     messages: Optional[List[LocalizedMessageSchema]] = None
#     devMessage: Optional[str] = None
#     helpLink: Optional[HttpUrl] = None
#     videoLink: Optional[HttpUrl] = None
#     updatedBy: str = None
class ErrorMasterUpdateSchema(BaseModel):
    """Patch schema; errorCode immutable. updatedBy is set automatically from authenticated user token."""
    errorType: Optional[str] = Field(None, description="Must exist in 'errorType' value-set")
    errorSeverity: Optional[str] = Field(None, description="Must exist in 'errorSeverity' value-set")
    isActive: Optional[bool] = Field(None, description="Active status. Setting to false also sets log=false.")
    log: Optional[bool] = None
    moduleId: Optional[str] = Field(None, description="Foreign key reference to modules collection _id")
    sourceType: Optional[str] = Field(None, description="Must exist in 'sourceType' value-set")
    sourceName: Optional[str] = Field(None, max_length=200)
    appCode: Optional[str] = Field(None, description="Application code identifier")
    notificationId: Optional[str] = Field(None, description="FK to notification_master._id")
    businessArea: Optional[str] = None
    technicalArea: Optional[str] = None
    tool: Optional[str] = None
    partnerSystem: Optional[str] = None
    thirdParty: Optional[str] = None
    messages: Optional[List[LocalizedMessageSchema]] = None
    devMessage: Optional[str] = None
    helpLink: Optional[HttpUrl] = None
    videoLink: Optional[HttpUrl] = None


# class ErrorMasterOutSchema(ErrorMasterBaseSchema):
#     """Read schema."""
#     id: str
#     createdBy: str
#     createdDateTime: datetime
#     # NOTE: updateDateTime intentionally NOT present

class ErrorMasterResponseSchema(ErrorMasterBaseSchema):
    id: str
    notificationId: Optional[str] = Field(None, description="FK to notification_master._id")

    # Override base fields to allow null values from existing DB records
    sourceType: Optional[str] = Field(None, description="Must exist in 'sourceType' value-set")
    sourceName: Optional[str] = Field(None, max_length=200)

    # Audit fields (master table - includes isActive)
    isActive: bool = Field(default=True, description="Whether this record is active")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: str
    createdAt: datetime
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedAt: Optional[datetime] = None
    updatedBy: Optional[str] = None
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was updated")


# Backward compatibility alias (deprecated - use ErrorMasterResponseSchema)
ErrorMasterOutSchema = ErrorMasterResponseSchema





class ErrorMasterSearchInSchema(BaseModel):
    """Search filters."""
    q: Optional[str] = Field(default=None, description="Search in errorCode (regex, case-insensitive)")
    errorSeverity: Optional[str] = None
    errorType: Optional[str] = None
    createdFrom: Optional[datetime] = None
    createdTo: Optional[datetime] = None
    limit: int = Field(default=20, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class ErrorMasterSearchOutSchema(BaseModel):
    """Paginated search response."""
    data: List[ErrorMasterOutSchema]
    page: PageOut

class ErrorMasterListOutSchema(BaseModel):
    data: List[ErrorMasterOutSchema]
    totalItems: int


class ErrorMasterBulkCreateSchema(BaseModel):
    """Schema for bulk creating error masters"""
    items: List[ErrorMasterCreateSchema] = Field(..., min_length=1, description="List of error masters to create")


class ErrorMasterBulkCreateResponseSchema(BaseModel):
    """Response schema for bulk create operation"""
    success: List[ErrorMasterOutSchema] = Field(default=[], description="Successfully created error masters")
    failed: List[dict] = Field(default=[], description="Failed items with error details")
    totalSuccess: int = Field(default=0, description="Total successfully created")
    totalFailed: int = Field(default=0, description="Total failed to create")


# =============================================================================
# API Response DTOs (Data Transfer Objects)
# =============================================================================

class ErrorDetailDTO(BaseModel):
    """Error detail structure for API responses"""
    errorCode: str = Field(..., description="Error code identifier")
    details: Optional[str] = Field(None, description="Additional error details")


class PaginationDTO(BaseModel):
    """Pagination information for list responses"""
    page: int = Field(..., description="Current page number")
    pageSize: int = Field(..., description="Number of items per page")
    totalItems: int = Field(..., description="Total number of items")
    totalPages: int = Field(..., description="Total number of pages")


class ErrorMasterCreateResponseDTO(BaseModel):
    """
    Response DTO for POST /error-master/create

    Returns the newly created error master record.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (201 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[ErrorMasterResponseSchema] = Field(None, description="Created error master data")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 201,
                "message": "Error Master created successfully",
                "data": {
                    "id": "507f1f77bcf86cd799439011",
                    "errorCode": "ERR.AUTH.LOGIN.FAILED",
                    "errorType": "Business",
                    "errorSeverity": "Warning"
                },
                "errors": None
            }
        }
    )


class ErrorMasterListResponseDTO(BaseModel):
    """
    Response DTO for GET /error-master/list

    Returns paginated or full list of error masters.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[List[ErrorMasterResponseSchema]] = Field(None, description="List of error masters")
    pagination: Optional[PaginationDTO] = Field(None, description="Pagination information (when page provided)")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Error Master list fetched successfully",
                "data": [],
                "pagination": {
                    "page": 1,
                    "pageSize": 20,
                    "total": 100,
                    "totalPages": 5
                },
                "errors": None
            }
        }
    )


class ErrorMasterGetResponseDTO(BaseModel):
    """
    Response DTO for GET /error-master/get/{id} and /error-master/get/by-code/{error_code}

    Returns a single error master record.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[ErrorMasterResponseSchema] = Field(None, description="Error master data")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")


class ErrorMasterUpdateResponseDTO(BaseModel):
    """
    Response DTO for PATCH /error-master/update/{id}

    Returns the updated error master record.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[ErrorMasterResponseSchema] = Field(None, description="Updated error master data")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")


class ErrorMasterDeleteResponseDTO(BaseModel):
    """
    Response DTO for DELETE /error-master/delete/{id}

    Returns success message for soft delete operation.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[dict] = Field(None, description="Additional data (usually None)")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")


class ErrorMasterRestoreResponseDTO(BaseModel):
    """
    Response DTO for PATCH /error-master/restore/{id}

    Returns success message for restore operation.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[dict] = Field(None, description="Additional data (usually None)")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")