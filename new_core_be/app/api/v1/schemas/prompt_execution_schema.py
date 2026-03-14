"""
Prompt Execution Schema
Defines Pydantic schemas for prompt_execution_master collection
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
from bson import ObjectId


class PromptExecutionBaseSchema(BaseModel):
    """Base schema for PromptExecution"""
    # Optional fields (nullable)
    promptConstructionRecord: Optional[str] = Field(None, description="Process or methodology used in constructing the final prompt")
    finalPrompt: Optional[str] = Field(None, description="Final prompt text that was executed")
    promptOutput: Optional[str] = Field(None, description="Output generated from the prompt execution")
    inputTokenCount: Optional[int] = Field(None, ge=0, description="Number of tokens in the input prompt")
    outputTokenCount: Optional[int] = Field(None, ge=0, description="Number of tokens generated in response")
    cost: Optional[float] = Field(None, ge=0, description="Cost associated with executing the prompt")
    executionTime: Optional[float] = Field(None, ge=0, description="Time taken to execute the prompt in seconds")
    originalWorkId: Optional[str] = Field(None, description="Links to original work if this is a revision or follow-up")
    revision: Optional[int] = Field(None, ge=0, description="Revision number if this is a follow-up or modification")
    feedbackId: Optional[str] = Field(None, description="Reference to feedback record (FK: feedback._id)")

    @field_validator('originalWorkId', 'feedbackId')
    @classmethod
    def validate_objectid_fields(cls, v):
        """Validate ObjectId format if provided"""
        if v is not None:
            if not v.strip():
                return None
            if not ObjectId.is_valid(v.strip()):
                raise ValueError("Invalid ObjectId format. Must be a 24-character hex string.")
            return v.strip()
        return v


class PromptExecutionCreateSchema(PromptExecutionBaseSchema):
    """Schema for creating a new PromptExecution"""
    # Required fields for creation
    promptId: str = Field(..., description="Reference to prompt in prompt_master table (FK: prompt_master._id)")
    userId: str = Field(..., description="User who executed the prompt (FK: personnel._id)")

    @field_validator('promptId')
    @classmethod
    def validate_prompt_id(cls, v):
        """Validate promptId ObjectId field"""
        if not v or not v.strip():
            raise ValueError("This field is required")
        if not ObjectId.is_valid(v.strip()):
            raise ValueError("Invalid ObjectId format. Must be a 24-character hex string.")
        return v.strip()

    @field_validator('userId')
    @classmethod
    def validate_user_id(cls, v):
        """Validate userId ObjectId field if provided"""
        if v is None:
            return None
        if not v.strip():
            return None
        if not ObjectId.is_valid(v.strip()):
            raise ValueError("Invalid ObjectId format. Must be a 24-character hex string.")
        return v.strip()


class PromptExecutionUpdateSchema(BaseModel):
    """Schema for updating PromptExecution"""
    # All fields are optional for update
    promptId: Optional[str] = Field(None, description="Reference to prompt in prompt_master table")
    userId: Optional[str] = Field(None, description="User who executed the prompt")
    promptConstructionRecord: Optional[str] = None
    finalPrompt: Optional[str] = None
    promptOutput: Optional[str] = None
    inputTokenCount: Optional[int] = Field(None, ge=0)
    outputTokenCount: Optional[int] = Field(None, ge=0)
    cost: Optional[float] = Field(None, ge=0)
    executionTime: Optional[float] = Field(None, ge=0)
    originalWorkId: Optional[str] = None
    revision: Optional[int] = Field(None, ge=0)
    feedbackId: Optional[str] = None

    @field_validator('promptId', 'userId', 'originalWorkId', 'feedbackId')
    @classmethod
    def validate_objectid_fields(cls, v):
        """Validate ObjectId format if provided"""
        if v is not None:
            if not v.strip():
                return None
            if not ObjectId.is_valid(v.strip()):
                raise ValueError("Invalid ObjectId format. Must be a 24-character hex string.")
            return v.strip()
        return v


class PromptExecutionResponseSchema(BaseModel):
    """Schema for PromptExecution response"""
    id: str = Field(..., alias="_id", description="Execution ID (Primary Key)")

    # Required fields
    promptId: str = Field(..., description="Reference to prompt (FK: prompt_master._id)")
    userId: str = Field(..., description="User who executed the prompt (FK: personnel._id)")
    executionDateTime: datetime = Field(..., description="Timestamp when the prompt was executed")

    # Optional fields
    promptConstructionRecord: Optional[str] = Field(None, description="Prompt construction process")
    finalPrompt: Optional[str] = Field(None, description="Final prompt text")
    promptOutput: Optional[str] = Field(None, description="Prompt execution output")
    inputTokenCount: Optional[int] = Field(None, description="Input token count")
    outputTokenCount: Optional[int] = Field(None, description="Output token count")
    cost: Optional[float] = Field(None, description="Execution cost")
    executionTime: Optional[float] = Field(None, description="Execution time in seconds")
    originalWorkId: Optional[str] = Field(None, description="Original work reference")
    revision: Optional[int] = Field(None, description="Revision number")
    feedbackId: Optional[str] = Field(None, description="Feedback reference (FK: feedback._id)")

    # Audit fields (transaction table - no isActive)
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last updated this record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)


class PromptExecutionSearchSchema(BaseModel):
    """Schema for searching PromptExecution records"""
    promptId: Optional[str] = Field(None, description="Filter by prompt ID")
    userId: Optional[str] = Field(None, description="Filter by user ID")
    feedbackId: Optional[str] = Field(None, description="Filter by feedback ID")
    originalWorkId: Optional[str] = Field(None, description="Filter by original work ID")
    minCost: Optional[float] = Field(None, ge=0, description="Filter by minimum cost")
    maxCost: Optional[float] = Field(None, ge=0, description="Filter by maximum cost")
    minExecutionTime: Optional[float] = Field(None, ge=0, description="Filter by minimum execution time")
    maxExecutionTime: Optional[float] = Field(None, ge=0, description="Filter by maximum execution time")
    fromDate: Optional[datetime] = Field(None, description="Filter executions from this date")
    toDate: Optional[datetime] = Field(None, description="Filter executions until this date")
    page: int = Field(1, ge=1, description="Page number (starting from 1)")
    pageSize: int = Field(50, ge=1, le=500, description="Number of items per page (default: 50, max: 500)")


# =============================================================================
# API Response Wrapper Schemas (for OpenAPI documentation)
# =============================================================================

class ErrorDetail(BaseModel):
    """Error detail for API responses"""
    errorCode: str = Field(..., description="Error code identifier")
    details: Optional[str] = Field(None, description="Error details")


class PaginationInfo(BaseModel):
    """Pagination metadata"""
    page: int = Field(..., description="Current page number")
    pageSize: int = Field(..., description="Number of items per page")
    totalItems: int = Field(..., description="Total number of items")
    totalPages: int = Field(..., description="Total number of pages")


class PromptExecutionListResponse(BaseModel):
    """Response schema for GET /api/v1/prompt-executions/list (non-paginated)"""
    success: bool = Field(True, description="Whether the request was successful")
    code: int = Field(200, description="HTTP status code")
    message: str = Field(..., description="Response message")
    data: List[PromptExecutionResponseSchema] = Field(..., description="List of prompt executions")
    errors: Optional[ErrorDetail] = Field(None, description="Error details if any")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Prompt Execution list fetched successfully",
                "data": [
                    {
                        "_id": "507f1f77bcf86cd799439011",
                        "promptId": "507f1f77bcf86cd799439012",
                        "userId": "507f1f77bcf86cd799439013",
                        "executionDateTime": "2025-12-16T10:30:00Z",
                        "finalPrompt": "Generate a summary of...",
                        "promptOutput": "Here is the summary...",
                        "inputTokenCount": 150,
                        "outputTokenCount": 500,
                        "cost": 0.0025,
                        "executionTime": 2.5,
                        "isDelete": False,
                        "createdAt": "2025-12-16T10:30:00Z"
                    }
                ],
                "errors": None
            }
        }
    )


class PromptExecutionListPaginatedResponse(BaseModel):
    """Response schema for GET /api/v1/prompt-executions/list (paginated)"""
    success: bool = Field(True, description="Whether the request was successful")
    code: int = Field(200, description="HTTP status code")
    message: str = Field(..., description="Response message")
    data: List[PromptExecutionResponseSchema] = Field(..., description="List of prompt executions")
    pagination: PaginationInfo = Field(..., description="Pagination information")
    errors: Optional[ErrorDetail] = Field(None, description="Error details if any")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Prompt Execution list fetched successfully",
                "data": [
                    {
                        "_id": "507f1f77bcf86cd799439011",
                        "promptId": "507f1f77bcf86cd799439012",
                        "userId": "507f1f77bcf86cd799439013",
                        "executionDateTime": "2025-12-16T10:30:00Z",
                        "finalPrompt": "Generate a summary of...",
                        "promptOutput": "Here is the summary...",
                        "inputTokenCount": 150,
                        "outputTokenCount": 500,
                        "cost": 0.0025,
                        "executionTime": 2.5,
                        "isDelete": False,
                        "createdAt": "2025-12-16T10:30:00Z"
                    }
                ],
                "pagination": {
                    "page": 1,
                    "pageSize": 50,
                    "total": 150,
                    "totalPages": 3
                },
                "errors": None
            }
        }
    )
