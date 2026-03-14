"""
Schema definitions for TestMaster.

Naming: <Entity><Action>Schema
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


class QuestionSchema(BaseModel):
    """Schema for Question nested object in TestMaster"""
    questionId: str = Field(..., description="Unique question identifier within the test")
    question: str = Field(..., description="The test question text")
    expectedAnswer: Dict[str, Any] = Field(..., description="Expected answer as JSON object")

    @field_validator('questionId', mode='before')
    @classmethod
    def validate_question_id(cls, v):
        """Validate questionId: cannot be null or empty"""
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("questionId is required and cannot be empty")
        return v.strip() if isinstance(v, str) else v

    @field_validator('question', mode='before')
    @classmethod
    def validate_question(cls, v):
        """Validate question: cannot be null or empty"""
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("question is required and cannot be empty")
        return v.strip() if isinstance(v, str) else v


class TestMasterBaseSchema(BaseModel):
    """Base schema for TestMaster"""
    moduleId: str = Field(..., description="Foreign key reference to Module._id")
    name: str = Field(..., max_length=300, description="Test name - required and unique")
    questions: List[QuestionSchema] = Field(..., min_length=1, description="List of test questions with expected answers")

    @field_validator('moduleId', mode='before')
    @classmethod
    def validate_module_id(cls, v):
        """Validate moduleId: cannot be null or empty"""
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("moduleId is required and cannot be empty")
        return v.strip() if isinstance(v, str) else str(v)

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: cannot be null or empty"""
        if v is None or (isinstance(v, str) and not v.strip()):
            raise ValueError("name is required and cannot be empty")
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode='after')
    def validate_unique_question_ids(self):
        """Validate that all questionIds are unique within the questions array"""
        if self.questions:
            question_ids = [q.questionId for q in self.questions]
            if len(question_ids) != len(set(question_ids)):
                raise ValueError("questionId must be unique within the questions array")
        return self


class TestMasterCreateSchema(TestMasterBaseSchema):
    """Schema for creating a new TestMaster"""
    pass


class TestMasterUpdateSchema(BaseModel):
    """Schema for updating TestMaster (PATCH - all fields optional)"""
    moduleId: Optional[str] = Field(None, description="Foreign key reference to Module._id")
    name: Optional[str] = Field(None, max_length=300, description="Test name - required and unique")
    questions: Optional[List[QuestionSchema]] = Field(None, min_length=1, description="List of test questions with expected answers")

    @field_validator('moduleId', mode='before')
    @classmethod
    def validate_module_id(cls, v):
        """Validate moduleId: if provided, cannot be empty"""
        if v is not None and isinstance(v, str) and not v.strip():
            raise ValueError("moduleId cannot be empty")
        return v.strip() if isinstance(v, str) else v

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: if provided, cannot be empty"""
        if v is not None and isinstance(v, str) and not v.strip():
            raise ValueError("name cannot be empty")
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode='after')
    def validate_unique_question_ids(self):
        """Validate that all questionIds are unique within the questions array"""
        if self.questions:
            question_ids = [q.questionId for q in self.questions]
            if len(question_ids) != len(set(question_ids)):
                raise ValueError("questionId must be unique within the questions array")
        return self


class TestMasterResponseSchema(BaseModel):
    """Schema for TestMaster response"""
    id: str = Field(..., alias="_id", description="TestMaster ID")
    moduleId: str = Field(..., description="Foreign key reference to Module._id")
    name: str = Field(..., description="Test name")
    questions: List[QuestionSchema] = Field(..., description="List of test questions")

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
    module: Optional[dict] = Field(None, description="Populated Module data")

    model_config = ConfigDict(populate_by_name=True)


class TestMasterListResponseSchema(BaseModel):
    """Schema for TestMaster list response"""
    data: List[TestMasterResponseSchema]
    totalItems: int
