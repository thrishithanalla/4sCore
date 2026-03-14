"""
Schema definitions for TestExecution.

Naming: <Entity><Action>Schema
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator


class TestResultEnum(str, Enum):
    """Enum for test execution result"""
    PASS = "PASS"
    FAIL = "FAIL"


class AnswerSchema(BaseModel):
    """Schema for Answer nested object in TestExecution"""
    questionId: str = Field(..., description="Reference to question ID from TestMaster")
    actualAnswer: Dict[str, Any] = Field(..., description="Actual answer as JSON object")

    @field_validator('questionId', mode='before')
    @classmethod
    def validate_question_id(cls, v):
        """Validate questionId: cannot be null or empty"""
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("questionId is required and cannot be empty")
        return v.strip() if isinstance(v, str) else v


class TestExecutionBaseSchema(BaseModel):
    """Base schema for TestExecution"""
    testMasterId: str = Field(..., description="Foreign key reference to TestMaster._id")
    answers: List[AnswerSchema] = Field(..., min_length=1, description="List of actual answers")
    result: TestResultEnum = Field(..., description="Final test result (PASS/FAIL)")

    @field_validator('testMasterId', mode='before')
    @classmethod
    def validate_test_master_id(cls, v):
        """Validate testMasterId: cannot be null or empty"""
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("testMasterId is required and cannot be empty")
        return v.strip() if isinstance(v, str) else v


class TestExecutionCreateSchema(TestExecutionBaseSchema):
    """Schema for creating a new TestExecution"""
    pass


class TestExecutionResponseSchema(BaseModel):
    """Schema for TestExecution response"""
    id: str = Field(..., alias="_id", description="TestExecution ID")
    testMasterId: str = Field(..., description="Foreign key reference to TestMaster._id")
    answers: List[AnswerSchema] = Field(..., description="List of actual answers")
    result: TestResultEnum = Field(..., description="Final test result (PASS/FAIL)")

    # Audit fields
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was updated")

    # Populated nested objects
    testMaster: Optional[dict] = Field(None, description="Populated TestMaster data")

    model_config = ConfigDict(populate_by_name=True)


class TestExecutionListResponseSchema(BaseModel):
    """Schema for TestExecution list response"""
    data: List[TestExecutionResponseSchema]
    totalItems: int
