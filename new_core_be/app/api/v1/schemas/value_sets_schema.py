"""
Value Sets Schema
Pydantic schemas for value set (enum) management
"""
from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
from bson import ObjectId
from app.api.v1.utils.validators import (
    validate_value_set_key_field,
    validate_value_set_code_field
)
from app.utils.error_messages import get_validation_error


class ItemLabels(BaseModel):
    """Schema for item labels in multiple languages"""
    en: str = Field(..., min_length=1, max_length=256, description="English label (required)")

    model_config = ConfigDict(extra="allow")  # Allow other language codes like "hi", "fr", etc.

    @field_validator('en', mode='before')
    @classmethod
    def validate_en_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("English label (en) must be non-empty")
        return v.strip()


class ValueSetItem(BaseModel):
    """Schema for individual item in a value set"""
    code: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Unique code within the set (SCREAMING_SNAKE_CASE)"
    )
    labels: ItemLabels = Field(..., description="Labels in multiple languages (en required)")

    @field_validator('code', mode='before')
    @classmethod
    def validate_code_format(cls, v):
        """Validate code follows SCREAMING_SNAKE_CASE format"""
        return validate_value_set_code_field(v, "code")


class ValueSetBaseSchema(BaseModel):
    """Base schema for ValueSet"""
    key: str = Field(
        ...,
        min_length=1,
        max_length=120,
        description="Globally unique identifier - alphabets and spaces only"
    )
    module: Optional[str] = Field(
        None,
        max_length=64,
        description="Module name (must exist in modules_master)"
    )
    description: Optional[str] = Field(
        None,
        max_length=1000,
        description="Admin help text"
    )
    items: List[ValueSetItem] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="List of enum items with codes and labels"
    )

    @field_validator('key', mode='before')
    @classmethod
    def validate_key_format(cls, v):
        """Validate key: alphabets and spaces only"""
        return validate_value_set_key_field(v, "key")

    @field_validator('items', mode='after')
    @classmethod
    def validate_unique_codes(cls, v):
        """Ensure all codes are unique within the same document"""
        codes = [item.code for item in v]
        seen = set()
        for code in codes:
            if code in seen:
                raise ValueError(get_validation_error("duplicate_value_set_code", code=code))
            seen.add(code)
        return v

    @field_validator('items', mode='after')
    @classmethod
    def validate_unique_labels(cls, v):
        """Ensure labels are unique per language within the value set"""
        lang_labels: Dict[str, set] = {}

        for item in v:
            labels_dict = item.labels.model_dump()
            for lang, label in labels_dict.items():
                if not label:
                    continue
                if lang not in lang_labels:
                    lang_labels[lang] = set()
                if label in lang_labels[lang]:
                    raise ValueError(get_validation_error("duplicate_value_set_label", label=label, lang=lang))
                lang_labels[lang].add(label)
        return v


class ValueSetCreateSchema(ValueSetBaseSchema):
    """Schema for creating a new value set - createdBy is set automatically from authenticated user token"""
    pass


class ValueSetUpdateSchema(BaseModel):
    """Schema for updating an existing value set"""
    key: Optional[str] = Field(
        None,
        min_length=1,
        max_length=120,
        description="Globally unique identifier - alphabets and spaces only"
    )
    module: Optional[str] = Field(
        None,
        max_length=64,
        description="Module name (must exist in modules_master)"
    )
    description: Optional[str] = Field(
        None,
        max_length=1000,
        description="Admin help text"
    )
    items: Optional[List[ValueSetItem]] = Field(
        None,
        min_length=1,
        max_length=500,
        description="List of enum items with codes and labels"
    )

    @field_validator('key', mode='before')
    @classmethod
    def validate_key_format(cls, v):
        """Validate key: alphabets and spaces only"""
        if v is None:
            return v
        return validate_value_set_key_field(v, "key")

    @field_validator('items', mode='after')
    @classmethod
    def validate_unique_codes(cls, v):
        """Ensure all codes are unique within the same document"""
        if v is None:
            return v
        codes = [item.code for item in v]
        seen = set()
        for code in codes:
            if code in seen:
                raise ValueError(get_validation_error("duplicate_value_set_code", code=code))
            seen.add(code)
        return v

    @field_validator('items', mode='after')
    @classmethod
    def validate_unique_labels(cls, v):
        """Ensure labels are unique per language within the value set"""
        if v is None:
            return v
        lang_labels: Dict[str, set] = {}

        for item in v:
            labels_dict = item.labels.model_dump()
            for lang, label in labels_dict.items():
                if not label:
                    continue
                if lang not in lang_labels:
                    lang_labels[lang] = set()
                if label in lang_labels[lang]:
                    raise ValueError(get_validation_error("duplicate_value_set_label", label=label, lang=lang))
                lang_labels[lang].add(label)
        return v


class ValueSetResponseSchema(BaseModel):
    """Schema for value set response"""
    id: str = Field(..., alias="_id", description="Value Set ID (Primary Key)")
    key: str = Field(..., max_length=120, description="Globally unique identifier")
    module: Optional[str] = Field(None, max_length=64, description="Module name")
    description: Optional[str] = Field(None, max_length=1000, description="Admin help text")
    items: List[ValueSetItem] = Field(..., description="List of enum items")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified the record")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )


class ValueSetSearchSchema(BaseModel):
    """Schema for searching value sets"""
    key: Optional[str] = Field(None, description="Search by key (partial match)")
    module: Optional[str] = Field(None, description="Filter by module")
    isDelete: Optional[bool] = Field(False, description="Include deleted records")
    skip: int = Field(0, ge=0, description="Number of records to skip")
    limit: int = Field(10, ge=1, le=100, description="Number of records to return")
