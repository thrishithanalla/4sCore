"""
Prompt Schema
Defines Pydantic schemas for prompt_master collection
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Dict, Any, List
from datetime import datetime
from bson import ObjectId


class PromptBaseSchema(BaseModel):
    """Base schema for Prompt"""
    # Optional fields (nullable=true)
    moduleId: Optional[str] = Field(None, description="Module ID (must exist in modules collection if provided)")
    iconPath: Optional[str] = Field(None, max_length=500, description="File or asset path to an icon")
    tech: Optional[str] = Field(None, description="Technology/framework (e.g., 'OpenAI GPT-5', 'LangChain')")
    taskInstructions: Optional[str] = Field(None, description="Steps or logic flow to execute the task")
    taskInput: Optional[str] = Field(None, description="Required inputs or parameters")
    taskOutputFormat: Optional[str] = Field(None, description="Expected structure or data format of output")
    taskExample: Optional[Dict[str, Any]] = Field(None, description="Sample input-output scenario in JSON format")
    llm: Optional[str] = Field(None, max_length=100, description="LLM or version used (e.g., 'gpt-5', 'claude', 'gemini')")
    settingsJson: Optional[Dict[str, Any]] = Field(None, description="Configurable runtime variables and parameters in JSON format")

    @field_validator('moduleId')
    @classmethod
    def validate_module_id(cls, v):
        """Validate moduleId is a valid ObjectId format if provided"""
        if v is not None:
            if not v.strip():
                return None
            if not ObjectId.is_valid(v.strip()):
                raise ValueError("Invalid moduleId format. Must be a 24-character hex string.")
            return v.strip()
        return v


class PromptCreateSchema(PromptBaseSchema):
    """Schema for creating a new Prompt"""
    # Required fields for creation
    type: str = Field(..., max_length=200, description="Prompt type/category (e.g., 'text', 'code', 'data-analysis')")
    name: str = Field(..., max_length=200, description="Prompt name - unique within type")
    aiRole: str = Field(..., description="AI's purpose or behavior (e.g., 'Code Assistant')")
    systemRole: str = Field(..., description="System's expected actions or interactions")
    objective: str = Field(..., description="Main goal or function of the prompt")


class PromptUpdateSchema(BaseModel):
    """Schema for updating Prompt"""
    # Required fields for update
    type: str = Field(..., max_length=200, description="Prompt type/category")
    name: str = Field(..., max_length=200, description="Prompt name - unique within type")
    aiRole: str = Field(..., description="AI's purpose or behavior")
    systemRole: str = Field(..., description="System's expected actions or interactions")
    objective: str = Field(..., description="Main goal or function of the prompt")

    # Optional fields
    moduleId: Optional[str] = Field(None, description="Module ID (must exist in modules collection if provided)")
    iconPath: Optional[str] = Field(None, max_length=500)
    tech: Optional[str] = Field(None)
    taskInstructions: Optional[str] = Field(None)
    taskInput: Optional[str] = Field(None)
    taskOutputFormat: Optional[str] = Field(None)
    taskExample: Optional[Dict[str, Any]] = None
    llm: Optional[str] = Field(None, max_length=100)
    settingsJson: Optional[Dict[str, Any]] = None

    @field_validator('moduleId')
    @classmethod
    def validate_module_id(cls, v):
        """Validate moduleId is a valid ObjectId format if provided"""
        if v is not None:
            if not v.strip():
                return None
            if not ObjectId.is_valid(v.strip()):
                raise ValueError("Invalid moduleId format. Must be a 24-character hex string.")
            return v.strip()
        return v


class PromptResponseSchema(BaseModel):
    """Schema for Prompt response"""
    id: str = Field(..., alias="_id", description="Prompt ID (Primary Key)")

    # Required fields
    type: str = Field(..., description="Prompt type/category")
    name: str = Field(..., description="Prompt name")
    aiRole: str = Field(..., description="AI's purpose or behavior")
    systemRole: str = Field(..., description="System's expected actions or interactions")
    objective: str = Field(..., description="Main goal or function of the prompt")

    # Optional fields
    moduleId: Optional[str] = Field(None, description="Module ID reference")
    iconPath: Optional[str] = Field(None, description="Icon asset path")
    tech: Optional[str] = Field(None, description="Technology/framework")
    taskInstructions: Optional[str] = Field(None, description="Task execution steps")
    taskInput: Optional[str] = Field(None, description="Required inputs")
    taskOutputFormat: Optional[str] = Field(None, description="Expected output structure")
    taskExample: Optional[Dict[str, Any]] = Field(None, description="Sample input-output scenario in JSON format")
    llm: Optional[str] = Field(None, description="LLM model identifier")
    settingsJson: Optional[Dict[str, Any]] = Field(None, description="Runtime variables and parameters")

    # Standardized audit fields
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User ID who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User ID who last updated this record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")

    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)


class PromptSearchSchema(BaseModel):
    """Schema for searching Prompts"""
    name: Optional[str] = Field(None, description="Search by prompt name (partial match, case-insensitive)")
    type: Optional[str] = Field(None, description="Filter by prompt type (partial match, case-insensitive)")
    aiRole: Optional[str] = Field(None, description="Filter by AI role (partial match, case-insensitive)")
    llm: Optional[str] = Field(None, description="Filter by LLM model (partial match, case-insensitive)")
    page: int = Field(1, ge=1, description="Page number (starting from 1)")
    pageSize: int = Field(50, ge=1, le=500, description="Number of items per page (default: 50, max: 500)")


class PromptBulkCreateSchema(BaseModel):
    """Schema for bulk creating prompts"""
    items: List[PromptCreateSchema] = Field(..., min_length=1, description="List of prompts to create")


class PromptBulkCreateResponseSchema(BaseModel):
    """Response schema for bulk create operation"""
    success: List[dict] = Field(default=[], description="Successfully created prompts")
    failed: List[dict] = Field(default=[], description="Failed items with error details")
    totalSuccess: int = Field(default=0, description="Total successfully created")
    totalFailed: int = Field(default=0, description="Total failed to create")
