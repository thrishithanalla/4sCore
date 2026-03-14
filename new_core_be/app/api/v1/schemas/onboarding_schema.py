"""
User Onboarding Schema
Defines Pydantic schemas for user onboarding API that combines personnel creation with role mappings
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict, EmailStr

from app.api.v1.schemas.personnel_schema import (
    PersonnelBaseSchema,
    PersonnelCreateResponseSchema,
    UnitAssignmentSchema
)
from app.api.v1.schemas.user_mapping_schema import (
    ModulePermissionItem,
    UserMappingResponseSchema
)
from app.api.v1.utils.validators import validate_required_string_field


class RoleMappingItem(BaseModel):
    """Schema for role-unit mapping in onboarding request"""
    roleId: str = Field(
        ...,
        description="Role ID to assign (must exist in roles collection)"
    )
    unitId: str = Field(
        ...,
        description="Unit ID for this role mapping (must exist in unit collection)"
    )
    additionalPermissions: List[ModulePermissionItem] = Field(
        default=[],
        description="Array of additional permissions in module hierarchy format"
    )
    exclusionPermissions: List[ModulePermissionItem] = Field(
        default=[],
        description="Array of excluded permissions in module hierarchy format"
    )

    @field_validator('roleId', mode='before')
    @classmethod
    def validate_role_id(cls, v):
        """Validate roleId is not empty"""
        return validate_required_string_field(v, "roleId")

    @field_validator('unitId', mode='before')
    @classmethod
    def validate_unit_id(cls, v):
        """Validate unitId is not empty"""
        return validate_required_string_field(v, "unitId")


class UserOnboardingCreateSchema(PersonnelBaseSchema):
    """
    Schema for user onboarding - combines personnel creation with role mappings.

    This schema extends PersonnelBaseSchema to include:
    - MPIN for personnel authentication (4-digit integer) - optional
    - Role mappings array for assigning roles to the new user
    """
    # Optional MPIN field
    mpin: Optional[int] = Field(
        None,
        ge=1000,
        le=9999,
        description="4-digit MPIN for authentication (integer between 1000-9999) - optional"
    )

    # Role mappings - at least one required
    roleMappings: List[RoleMappingItem] = Field(
        ...,
        min_length=1,
        description="Array of role-unit mappings for the new user - at least one required"
    )

    @field_validator('mpin', mode='before')
    @classmethod
    def validate_mpin(cls, v):
        """Validate MPIN is exactly 4 digits (1000-9999) if provided"""
        if v is None or v == "":
            return None
        try:
            mpin_value = int(str(v).strip())
            if mpin_value < 1000 or mpin_value > 9999:
                raise ValueError("MPIN must be exactly 4 digits (1000-9999)")
            return mpin_value
        except (ValueError, TypeError):
            raise ValueError("MPIN must be exactly 4 digits (1000-9999)")

    @model_validator(mode='after')
    def validate_role_mappings(self):
        """Validate that at least one role mapping is provided"""
        if not self.roleMappings or len(self.roleMappings) == 0:
            raise ValueError("At least one role mapping is required")
        return self


class RoleMappingResponseItem(BaseModel):
    """Schema for role mapping in onboarding response"""
    id: str = Field(..., alias="_id", description="UserMapping ID")
    roleId: str = Field(..., description="Role ID")
    userId: str = Field(..., description="User/Personnel ID")
    unitId: str = Field(..., description="Unit ID")
    rankId: Optional[str] = Field(None, description="Rank ID from personnel")
    additionalPermissions: List[ModulePermissionItem] = Field(
        default=[],
        description="Additional permissions"
    )
    exclusionPermissions: List[ModulePermissionItem] = Field(
        default=[],
        description="Exclusion permissions"
    )
    isActive: bool = Field(default=True, description="Active status")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="Creator user ID")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    createdIp: Optional[str] = Field(None, description="Creator IP address")

    model_config = ConfigDict(populate_by_name=True)


class UserOnboardingResponseSchema(BaseModel):
    """
    Response schema for user onboarding endpoint.

    Contains:
    - personnel: The created personnel record
    - roleMappings: Array of created role-unit permission mappings
    """
    personnel: dict = Field(
        ...,
        description="Created personnel record"
    )
    roleMappings: List[dict] = Field(
        ...,
        description="Array of created role-unit permission mappings"
    )

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True
    )


# ==================== UPDATE SCHEMAS ====================

class RoleMappingUpdateItem(BaseModel):
    """
    Schema for role-unit mapping in onboarding update request.

    - If `_id` is provided: Updates existing role mapping
    - If `_id` is not provided: Creates new role mapping
    - Role mappings not included in the array will be deleted
    """
    id: Optional[str] = Field(
        None,
        alias="_id",
        description="Role mapping ID - if provided, updates existing; if not, creates new"
    )
    roleId: str = Field(
        ...,
        description="Role ID to assign (must exist in roles collection)"
    )
    unitId: str = Field(
        ...,
        description="Unit ID for this role mapping (must exist in unit collection)"
    )
    additionalPermissions: List[ModulePermissionItem] = Field(
        default=[],
        description="Array of additional permissions in module hierarchy format"
    )
    exclusionPermissions: List[ModulePermissionItem] = Field(
        default=[],
        description="Array of excluded permissions in module hierarchy format"
    )

    model_config = ConfigDict(populate_by_name=True)

    @field_validator('roleId', mode='before')
    @classmethod
    def validate_role_id(cls, v):
        """Validate roleId is not empty"""
        return validate_required_string_field(v, "roleId")

    @field_validator('unitId', mode='before')
    @classmethod
    def validate_unit_id(cls, v):
        """Validate unitId is not empty"""
        return validate_required_string_field(v, "unitId")


class UserOnboardingUpdateSchema(BaseModel):
    """
    Schema for updating an onboarded user.

    All fields are optional - only provided fields will be updated.

    For roleMappings:
    - Mappings with `_id`: Will be updated
    - Mappings without `_id`: Will be created
    - Existing mappings not in the array: Will be deleted (if roleMappings is provided)
    """
    # Optional personnel fields
    email: Optional[EmailStr] = Field(None, max_length=255, description="Email address")
    name: Optional[str] = Field(None, max_length=255, description="Full name")
    mpin: Optional[int] = Field(None, ge=1000, le=9999, description="4-digit MPIN (1000-9999)")
    title: Optional[str] = Field(None, max_length=32, description="Honorific title")
    firstName: Optional[str] = Field(None, max_length=80, description="First name")
    lastName: Optional[str] = Field(None, max_length=80, description="Last name")
    picture: Optional[str] = Field(None, max_length=512, description="Profile picture URL")
    mobile: Optional[str] = Field(None, max_length=20, description="Mobile number")
    batchYear: Optional[int] = Field(None, description="Batch year")
    badgeNo: Optional[str] = Field(None, max_length=64, description="Badge number")
    dateOfBirth: Optional[datetime] = Field(None, description="Date of birth")
    gender: Optional[str] = Field(None, max_length=32, description="Gender (male/female)")
    caste: Optional[str] = Field(None, max_length=100, description="Caste")
    dateOfEnlistment: Optional[datetime] = Field(None, description="Date of enlistment")
    deputation: Optional[str] = Field(None, max_length=255, description="Deputation info")

    # Unit assignments - optional
    units: Optional[List[UnitAssignmentSchema]] = Field(
        None,
        description="Array of unit assignments with designations"
    )

    # Department and Rank - optional
    departmentId: Optional[str] = Field(None, description="Department ID")
    rankId: Optional[str] = Field(None, description="Rank ID")

    # Role mappings - optional
    roleMappings: Optional[List[RoleMappingUpdateItem]] = Field(
        None,
        description="Array of role-unit mappings. If provided, syncs mappings (creates/updates/deletes)"
    )

    @field_validator('mpin', mode='before')
    @classmethod
    def validate_mpin(cls, v):
        """Validate MPIN is exactly 4 digits (1000-9999) if provided"""
        if v is None:
            return v
        try:
            mpin_value = int(str(v).strip())
            if mpin_value < 1000 or mpin_value > 9999:
                raise ValueError("MPIN must be exactly 4 digits (1000-9999)")
            return mpin_value
        except (ValueError, TypeError):
            raise ValueError("MPIN must be exactly 4 digits (1000-9999)")

    @model_validator(mode='after')
    def validate_at_least_one_field(self):
        """Validate that at least one field is provided for update"""
        fields = self.model_dump(exclude_none=True)
        if not fields:
            raise ValueError("At least one field must be provided for update")
        return self


class UserOnboardingUpdateResponseSchema(BaseModel):
    """
    Response schema for user onboarding update endpoint.
    """
    personnel: dict = Field(
        ...,
        description="Updated personnel record"
    )
    roleMappings: List[dict] = Field(
        ...,
        description="Current role-unit permission mappings after update"
    )
    changes: dict = Field(
        default={},
        description="Summary of changes made"
    )

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True
    )
