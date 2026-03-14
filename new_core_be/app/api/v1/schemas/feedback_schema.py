"""
Schema definitions for Feedback.

Naming: <Entity><Action>Schema

Fields:
- comment: Mandatory user feedback text (max 2000 chars)
- quickFeedback: Optional array of strings - selected quick feedback options from FeedbackMaster
  - When isLiked=true: select from FeedbackMaster.options.likedOptions
  - When isLiked=false: select from FeedbackMaster.options.dislikedOptions
- userFeedback: Structured object containing component-specific data:
  - screen: Required fields: screenPath, screenName. Optional: issue, description
    (NO componentId or componentExecutionId)
  - prompt: Required fields: componentExecutionId + (componentId OR promptName). Optional: userQuestion, userExpectedOutput, actualOutput
    (ONLY prompt type has componentId/promptName and componentExecutionId)
    - promptName: Pass prompt name to auto-resolve componentId from prompt_master collection
    - componentId: Direct ObjectId reference (use either promptName OR componentId, not both)
  - api: Fields: endpoint, method, expectedResponse, actualResponse, statusCode
    (NO componentId or componentExecutionId)
  - function: Fields: functionName, input, expectedOutput, actualOutput
    (NO componentId or componentExecutionId)

Only the component type matching feedbackMaster.componentType should be populated; others are null.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


class UserFeedbackStructure(BaseModel):
    """Structured user feedback with component-specific data"""
    screen: Optional[Dict[str, Any]] = Field(
        None,
        description="Screen feedback data. Required: screenPath, screenName. Optional: issue, description (NO componentId or componentExecutionId)"
    )
    prompt: Optional[Dict[str, Any]] = Field(
        None,
        description="Prompt feedback data. Required: componentExecutionId + (componentId OR promptName). "
                    "Use promptName to auto-resolve componentId from prompt_master. Optional: userQuestion, userExpectedOutput, actualOutput"
    )
    api: Optional[Dict[str, Any]] = Field(
        None,
        description="API feedback data. Fields: endpoint, method, expectedResponse, actualResponse, statusCode (NO componentId or componentExecutionId)"
    )
    function: Optional[Dict[str, Any]] = Field(
        None,
        description="Function feedback data. Fields: functionName, input, expectedOutput, actualOutput (NO componentId or componentExecutionId)"
    )

    @model_validator(mode='after')
    def validate_only_one_component_populated(self):
        """Ensure exactly one component type field is populated (not null)"""
        component_fields = [self.screen, self.prompt, self.api, self.function]
        populated_count = sum(1 for field in component_fields if field is not None)

        if populated_count == 0:
            raise ValueError("At least one component type field (screen, prompt, api, function) must be populated")

        if populated_count > 1:
            raise ValueError("Only one component type field (screen, prompt, api, function) can be populated at a time")

        # Validate screen type required fields
        if self.screen is not None:
            if not self.screen.get("screenPath"):
                raise ValueError("screenPath is required in screen feedback")
            if not self.screen.get("screenName"):
                raise ValueError("screenName is required in screen feedback")

        return self

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "screen": {
                        "screenPath": "/dashboard",
                        "screenName": "Dashboard",
                        "issue": "Button not responding",
                        "description": "The save button does not respond when clicked"
                    },
                    "prompt": None,
                    "api": None,
                    "function": None
                },
                {
                    "screen": None,
                    "prompt": {
                        "promptName": "AI Case Summary",
                        "componentExecutionId": "507f191e810c19729de860ea",
                        "userQuestion": "What is the capital of France?",
                        "userExpectedOutput": "Paris",
                        "actualOutput": "The capital of France is Paris"
                    },
                    "api": None,
                    "function": None
                },
                {
                    "screen": None,
                    "prompt": None,
                    "api": {
                        "endpoint": "/api/v1/users",
                        "method": "GET",
                        "expectedResponse": {"status": "success"},
                        "actualResponse": {"status": "error"},
                        "statusCode": 500
                    },
                    "function": None
                },
                {
                    "screen": None,
                    "prompt": None,
                    "api": None,
                    "function": {
                        "functionName": "calculateTotal",
                        "input": {"items": [10, 20, 30]},
                        "expectedOutput": 60,
                        "actualOutput": 55
                    }
                }
            ]
        }
    )


class FeedbackBaseSchema(BaseModel):
    """Base schema for Feedback"""
    feedbackMasterName: str = Field(..., description="FeedbackMaster name - will be resolved to ID in service")
    userFeedback: UserFeedbackStructure = Field(
        ...,
        description="Structured user feedback containing component-specific data. "
                    "Only one component type (screen/prompt/api/function) should be populated, others null."
    )
    comment: str = Field(..., max_length=2000, description="User feedback comment (mandatory, max 2000 characters)")
    isLiked: Optional[bool] = Field(None, description="Indicates user satisfaction (true=liked, false=disliked)")
    quickFeedback: Optional[List[str]] = Field(
        None,
        description="Selected quick feedback options from FeedbackMaster's likedOptions (when isLiked=true) or dislikedOptions (when isLiked=false)"
    )
    rating: Optional[float] = Field(None, description="Numeric rating")
    isRegenerated: Optional[bool] = Field(None, description="Indicates if evaluation is for regenerated output")


class FeedbackCreateSchema(FeedbackBaseSchema):
    """Schema for creating a new Feedback"""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "feedbackMasterName": "Screen Feedback",
                    "userFeedback": {
                        "screen": {
                            "screenPath": "/dashboard",
                            "screenName": "Dashboard",
                            "issue": "Button not responding",
                            "description": "The save button does not respond when clicked"
                        },
                        "prompt": None,
                        "api": None,
                        "function": None
                    },
                    "comment": "The save button is not clickable. This is causing issues with form submission.",
                    "isLiked": False,
                    "quickFeedback": ["Bug found", "Missing features"],
                    "rating": 2.5,
                    "isRegenerated": False
                },
                {
                    "feedbackMasterName": "Prompt Feedback",
                    "userFeedback": {
                        "screen": None,
                        "prompt": {
                            "promptName": "AI Case Summary",
                            "componentExecutionId": "507f191e810c19729de860ea",
                            "userQuestion": "What is the capital of France?",
                            "userExpectedOutput": "Paris",
                            "actualOutput": "The capital of France is Paris"
                        },
                        "api": None,
                        "function": None
                    },
                    "comment": "Perfect answer! Very accurate and concise.",
                    "isLiked": True,
                    "quickFeedback": ["Accurate response", "Helpful answer"],
                    "rating": 5.0,
                    "isRegenerated": False
                },
                {
                    "feedbackMasterName": "API Feedback",
                    "userFeedback": {
                        "screen": None,
                        "prompt": None,
                        "api": {
                            "endpoint": "/api/v1/users",
                            "method": "GET",
                            "expectedResponse": {"status": "success", "data": []},
                            "actualResponse": {"status": "error", "message": "Database error"},
                            "statusCode": 500
                        },
                        "function": None
                    },
                    "comment": "API returned a server error. Expected successful response with user data.",
                    "isLiked": False,
                    "quickFeedback": ["Server error 500"],
                    "rating": 1.0
                },
                {
                    "feedbackMasterName": "Function Feedback",
                    "userFeedback": {
                        "screen": None,
                        "prompt": None,
                        "api": None,
                        "function": {
                            "functionName": "calculateTotal",
                            "input": {"items": [10, 20, 30]},
                            "expectedOutput": 60,
                            "actualOutput": 55
                        }
                    },
                    "comment": "Calculation is incorrect. Expected sum to be 60 but got 55.",
                    "isLiked": False,
                    "quickFeedback": ["Incorrect result"],
                    "rating": 1.5
                }
            ]
        }
    )


class FeedbackResponseSchema(BaseModel):
    """Schema for Feedback response"""
    id: str = Field(..., alias="_id", description="Feedback ID")
    feedbackMasterId: str = Field(..., description="Foreign key reference to FeedbackMaster._id")
    userFeedback: UserFeedbackStructure = Field(..., description="Structured user feedback with component-specific data")
    comment: str = Field(..., description="User feedback comment")
    isLiked: Optional[bool] = Field(None, description="Indicates user satisfaction (true=liked, false=disliked)")
    quickFeedback: Optional[List[str]] = Field(
        None,
        description="Selected quick feedback options from FeedbackMaster's likedOptions or dislikedOptions"
    )
    rating: Optional[float] = Field(None, description="Numeric rating")
    isRegenerated: Optional[bool] = Field(None, description="Indicates if evaluation is for regenerated output")
    state: Optional[str] = Field(None, description="Feedback state from valueSet (key: state)")

    # Audit fields (no isActive for Feedback)
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was updated")

    # Populated nested objects
    feedbackMaster: Optional[dict] = Field(None, description="Populated FeedbackMaster data")

    model_config = ConfigDict(populate_by_name=True)


class FeedbackListResponseSchema(BaseModel):
    """Schema for Feedback list response"""
    data: List[FeedbackResponseSchema]
    totalItems: int
