from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from app.api.v1.utils.validators import (
    validate_unit_name_field,
    validate_zip_field,
    validate_phone_list_landline
)


class ResponsibleUserHistory(BaseModel):
    """Schema for responsible user history entry"""
    userId: str
    fromDate: datetime = Field(..., alias="from")
    toDate: datetime = Field(..., alias="to")
    title: str
    reason: str
    changedBy: str
    changedAt: datetime

    model_config = ConfigDict(populate_by_name=True)


class UnitBaseSchema(BaseModel):
    """Base schema for Unit"""
    # Required fields
    policeReferenceId: str = Field(..., max_length=100, description="Canonical string code for the unit (unique, required)")
    name: str = Field(..., max_length=200, description="Name of the organizational unit (alphabets, spaces, -_() only)")
    email: EmailStr = Field(..., max_length=255, description="Official email address (required)")
    districtId: str = Field(..., description="District (FK: district._id) - required")
    responsibleUserId: str = Field(..., description="Responsible user (FK: personnel_master._id) - required")

    # Optional fields
    logo: Optional[str] = Field(None, description="Reference to unit's logo image/media")
    address1: Optional[str] = Field(None, max_length=500, description="First line of unit's address")
    address2: Optional[str] = Field(None, max_length=500, description="Second line of unit's address")
    city: Optional[str] = Field(None, max_length=100, description="City where unit is located")
    zip: Optional[str] = Field(None, max_length=6, description="Postal/ZIP code (exactly 6 digits)")
    phone: Optional[List[str]] = Field(None, description="Array of phone numbers (numbers and hyphens only)")
    responsiblePersonTitle: Optional[str] = Field(None, max_length=255, description="Title/designation of responsible person")
    isVirtual: Optional[bool] = Field(None, description="Indicates if this is a virtual unit")
    unitTypeId: Optional[str] = Field(None, description="Unit type (FK: unitType._id)")
    departmentId: Optional[str] = Field(None, description="Department (FK: department._id)")
    proxyUserId: Optional[str] = Field(None, description="Proxy user (FK: personnel_master._id)")
    parentUnitId: Optional[str] = Field(None, description="Parent unit's _id (FK: unit._id)")
    parentUnitPath: Optional[str] = Field(None, description="Hierarchical path of ancestor unit names (e.g., \\parentName\\grandparentName)")
    unitPersonnelList: Optional[List[str]] = Field(None, description="Array of personnel IDs (FK: personnel_master._id)")
    responsibleUserHistory: Optional[List[ResponsibleUserHistory]] = Field(None, description="History of responsible users")

    @field_validator('policeReferenceId', mode='before')
    @classmethod
    def validate_police_reference_id(cls, v):
        """Validate policeReferenceId: required, cannot be empty or spaces only"""
        if v is None:
            raise ValueError("policeReferenceId is required")
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                raise ValueError("policeReferenceId cannot be empty or contain only spaces")
            return stripped  # Return trimmed value
        return v

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate unit name: alphabets, spaces, -_() only, min 2 alphabets"""
        return validate_unit_name_field(v, "name", min_alphabets=2)

    @field_validator('zip', mode='before')
    @classmethod
    def validate_zip(cls, v):
        """Validate ZIP code: exactly 6 digits"""
        return validate_zip_field(v, "zip")

    @field_validator('phone', mode='before')
    @classmethod
    def validate_phone_list(cls, v):
        """Validate phone numbers: numbers and hyphens only"""
        return validate_phone_list_landline(v, "phone")


class UnitCreateSchema(UnitBaseSchema):
    """Schema for creating a new Unit"""
    pass


class UnitUpdateSchema(BaseModel):
    """Schema for updating Unit"""
    policeReferenceId: Optional[str] = Field(None, max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    logo: Optional[str] = None
    address1: Optional[str] = Field(None, max_length=500)
    address2: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    districtId: Optional[str] = None
    zip: Optional[str] = Field(None, max_length=6)
    email: Optional[EmailStr] = None
    phone: Optional[List[str]] = None
    responsibleUserId: Optional[str] = None
    responsiblePersonTitle: Optional[str] = Field(None, max_length=255)
    isVirtual: Optional[bool] = None
    unitTypeId: Optional[str] = None
    departmentId: Optional[str] = None
    proxyUserId: Optional[str] = None
    parentUnitId: Optional[str] = None
    parentUnitPath: Optional[str] = None
    unitPersonnelList: Optional[List[str]] = None
    responsibleUserHistory: Optional[List[ResponsibleUserHistory]] = None

    # Field for responsible user change (not stored in unit, used for personnel sync)
    responsibleUserDesignationId: Optional[str] = Field(None, description="Designation ID for new responsible user in this unit (not stored in unit)")

    @field_validator('policeReferenceId', mode='before')
    @classmethod
    def validate_police_reference_id(cls, v):
        """Validate policeReferenceId if provided: cannot be empty or spaces only"""
        if v is None:
            return v  # None is allowed for update (field not being updated)
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                raise ValueError("policeReferenceId cannot be empty or contain only spaces")
            return stripped  # Return trimmed value
        return v

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate unit name if provided: alphabets, spaces, -_() only, min 2 alphabets"""
        if v is None:
            return v
        return validate_unit_name_field(v, "name", min_alphabets=2)

    @field_validator('zip', mode='before')
    @classmethod
    def validate_zip(cls, v):
        """Validate ZIP code if provided: exactly 6 digits"""
        return validate_zip_field(v, "zip")

    @field_validator('phone', mode='before')
    @classmethod
    def validate_phone_list(cls, v):
        """Validate phone numbers if provided: numbers and hyphens only"""
        return validate_phone_list_landline(v, "phone")

    @field_validator('districtId', mode='before')
    @classmethod
    def validate_district_id(cls, v):
        """Validate districtId cannot be set to empty string (null is allowed to skip update)"""
        if v is not None and isinstance(v, str) and not v.strip():
            raise ValueError("districtId cannot be empty. This is a required field.")
        return v

    @field_validator('responsibleUserId', mode='before')
    @classmethod
    def validate_responsible_user_id(cls, v):
        """Validate responsibleUserId cannot be set to empty string (null is allowed to skip update)"""
        if v is not None and isinstance(v, str) and not v.strip():
            raise ValueError("responsibleUserId cannot be empty. This is a required field.")
        return v


class NestedDepartmentSchema(BaseModel):
    """Nested department data in unit response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedDistrictSchema(BaseModel):
    """Nested district data in unit response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    cctnsDistrictCd: Optional[str] = None
    stateName: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedUnitTypeSchema(BaseModel):
    """Nested unit type data in unit response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedParentUnitSchema(BaseModel):
    """Nested parent unit data in unit response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    policeReferenceId: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedResponsibleUserSchema(BaseModel):
    """Nested responsible user data in unit response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class UnitResponseSchema(UnitBaseSchema):
    """Schema for Unit response"""
    id: str = Field(..., alias="_id", description="Unit ID (Primary Key)")
    createdBy: str = Field(..., description="User who created (FK: users._id)")
    createdAt: datetime = Field(..., description="Creation timestamp")
    createdIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified (FK: users._id)")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, max_length=50, description="IP address from which record was last updated")
    isActive: bool = Field(default=True, description="Active flag (true=active, false=inactive)")
    isDelete: bool = Field(default=False, description="Soft delete flag (false=active, true=deleted)")

    # Populated nested objects
    department: Optional[NestedDepartmentSchema] = Field(None, description="Populated department data")
    unitType: Optional[NestedUnitTypeSchema] = Field(None, description="Populated unit type data")
    parentUnit: Optional[NestedParentUnitSchema] = Field(None, description="Populated parent unit data")
    district: Optional[NestedDistrictSchema] = Field(None, description="Populated district data")
    responsibleUser: Optional[NestedResponsibleUserSchema] = Field(None, description="Populated responsible user data")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )


class UnitListItemSchema(BaseModel):
    """Schema for Unit list response with populated nested objects"""
    id: str = Field(..., alias="_id", description="Unit ID (Primary Key)")
    policeReferenceId: Optional[str] = Field(None, description="Canonical string code for the unit")
    name: str = Field(..., description="Name of the organizational unit")
    logo: Optional[str] = Field(None, description="Reference to unit's logo image/media")
    address1: Optional[str] = Field(None, description="First line of unit's address")
    address2: Optional[str] = Field(None, description="Second line of unit's address")
    city: Optional[str] = Field(None, description="City where unit is located")
    districtId: Optional[str] = Field(None, description="District ID (FK: district._id)")
    zip: Optional[str] = Field(None, description="Postal/ZIP code")
    email: Optional[EmailStr] = Field(None, description="Official email address")
    phone: Optional[List[str]] = Field(None, description="Array of phone numbers")
    responsibleUserId: Optional[str] = Field(None, description="Responsible user ID (FK: users._id)")
    responsiblePersonTitle: Optional[str] = Field(None, description="Title/designation of responsible person")
    isVirtual: Optional[bool] = Field(None, description="Indicates if this is a virtual unit")
    unitTypeId: Optional[str] = Field(None, description="Unit type ID (FK: Core.Unit_Type_Mst._id)")
    departmentId: Optional[str] = Field(None, description="Department ID (FK: Core.Department._id)")
    parentUnitId: Optional[str] = Field(None, description="Parent unit ID (FK: unit._id)")
    parentUnitPath: Optional[str] = Field(None, description="Hierarchical path of ancestor unit names")
    createdBy: str = Field(..., description="User who created (FK: users._id)")
    createdAt: datetime = Field(..., description="Creation timestamp")
    createdIp: Optional[str] = Field(None, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified (FK: users._id)")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, description="IP address from which record was last updated")
    isActive: bool = Field(default=True, description="Active flag (true=active, false=inactive)")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    # Populated nested objects
    department: Optional[NestedDepartmentSchema] = Field(None, description="Populated department data")
    unitType: Optional[NestedUnitTypeSchema] = Field(None, description="Populated unit type data")
    parentUnit: Optional[NestedParentUnitSchema] = Field(None, description="Populated parent unit data")
    district: Optional[NestedDistrictSchema] = Field(None, description="Populated district data")
    responsibleUser: Optional[NestedResponsibleUserSchema] = Field(None, description="Populated responsible user data")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )


class UnitSearchSchema(BaseModel):
    """Schema for searching Units"""
    policeReferenceId: Optional[str] = None
    name: Optional[str] = None
    districtId: Optional[str] = None
    city: Optional[str] = None
    departmentId: Optional[str] = None
    parentUnitId: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)


class UnitHierarchyItemSchema(BaseModel):
    """Schema for a single unit in hierarchy response"""
    unitId: str = Field(..., description="Unit ID")
    unitName: str = Field(..., description="Unit name")
    parentUnitId: Optional[str] = Field(None, description="Parent unit ID")
    responsibleUserId: Optional[str] = Field(None, description="Responsible user ID")
    rankId: Optional[str] = Field(None, description="Rank ID from personnel")
    rankShortCode: Optional[str] = Field(None, description="Rank short code from rankMaster")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )


class UnitHierarchyResponseSchema(BaseModel):
    """Schema for unit hierarchy response"""
    success: bool = Field(default=True, description="Success status")
    message: str = Field(..., description="Response message")
    data: List[UnitHierarchyItemSchema] = Field(..., description="List of units in hierarchy from top to bottom")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )


class UnitBulkCreateSchema(BaseModel):
    """Schema for bulk creating units"""
    items: List[UnitCreateSchema] = Field(..., min_length=1, description="List of units to create")


class UnitBulkCreateResponseSchema(BaseModel):
    """Response schema for bulk create operation"""
    success: List[dict] = Field(default=[], description="Successfully created units")
    failed: List[dict] = Field(default=[], description="Failed items with error details")
    totalSuccess: int = Field(default=0, description="Total successfully created")
    totalFailed: int = Field(default=0, description="Total failed to create")