"""
Unit Enhance Schema
Enhanced unit schema with:
- unitCd: Unique combination of name_unitTypeName
- unitPath: Array of strings (instead of backslash-delimited string)
- name: Non-unique (uniqueness enforced via unitCd)
"""
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from app.api.v1.utils.validators import (
    validate_unit_name_field,
    validate_zip_field,
    validate_phone_list_landline
)


class ResponsibleUserHistoryEnhance(BaseModel):
    """Schema for responsible user history entry"""
    userId: str
    fromDate: datetime = Field(..., alias="from")
    toDate: datetime = Field(..., alias="to")
    title: str
    reason: str
    changedBy: str
    changedAt: datetime

    model_config = ConfigDict(populate_by_name=True)


class UnitEnhanceBaseSchema(BaseModel):
    """
    Base schema for Unit Enhance

    Key differences from original Unit schema:
    - name: Non-unique (same name allowed with different unit types)
    - unitCd: Auto-generated unique code (name_unitTypeName)
    - unitPath: Array of strings instead of backslash-delimited string
    """
    # Required fields
    policeReferenceId: str = Field(..., max_length=100, description="Canonical string code for the unit (unique, required)")
    name: str = Field(..., max_length=200, description="Name of the organizational unit (NOT unique - uniqueness via unitCd)")
    email: EmailStr = Field(..., max_length=255, description="Official email address (required)")
    districtId: str = Field(..., description="District (FK: district._id) - required")
    unitTypeId: str = Field(..., description="Unit type (FK: unitType._id) - required for unitCd generation")

    # Optional fields
    responsibleUserId: Optional[str] = Field(None, description="Responsible user (FK: personnel_master._id) - optional")
    logo: Optional[str] = Field(None, description="Reference to unit's logo image/media")
    address1: Optional[str] = Field(None, max_length=500, description="First line of unit's address")
    address2: Optional[str] = Field(None, max_length=500, description="Second line of unit's address")
    city: Optional[str] = Field(None, max_length=100, description="City where unit is located")
    zip: Optional[str] = Field(None, max_length=6, description="Postal/ZIP code (exactly 6 digits)")
    phone: Optional[List[str]] = Field(None, description="Array of phone numbers (numbers and hyphens only)")
    responsiblePersonTitle: Optional[str] = Field(None, max_length=255, description="Title/designation of responsible person")
    isVirtual: Optional[bool] = Field(None, description="Indicates if this is a virtual unit")
    departmentId: Optional[str] = Field(None, description="Department (FK: department._id)")
    proxyUserId: Optional[str] = Field(None, description="Proxy user (FK: personnel_master._id)")
    parentUnitId: Optional[str] = Field(None, description="Parent unit's _id (FK: unit_enhance._id)")
    unitPersonnelList: Optional[List[str]] = Field(None, description="Array of personnel IDs (FK: personnel_master._id)")
    responsibleUserHistory: Optional[List[ResponsibleUserHistoryEnhance]] = Field(None, description="History of responsible users")

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
            return stripped
        return v

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate unit name: alphabets, spaces, -_() only, min 2 alphabets"""
        return validate_unit_name_field(v, "name", min_alphabets=2)

    @field_validator('unitTypeId', mode='before')
    @classmethod
    def validate_unit_type_id(cls, v):
        """Validate unitTypeId: required for unitCd generation"""
        if v is None:
            raise ValueError("unitTypeId is required")
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                raise ValueError("unitTypeId cannot be empty or contain only spaces")
            return stripped
        return v

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


class UnitEnhanceCreateSchema(UnitEnhanceBaseSchema):
    """Schema for creating a new Unit Enhance"""
    pass


class UnitEnhanceUpdateSchema(BaseModel):
    """Schema for updating Unit Enhance"""
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
    unitPersonnelList: Optional[List[str]] = None
    responsibleUserHistory: Optional[List[ResponsibleUserHistoryEnhance]] = None

    # Field for responsible user change (not stored in unit, used for personnel sync)
    responsibleUserDesignationId: Optional[str] = Field(None, description="Designation ID for new responsible user in this unit (not stored in unit)")

    @field_validator('policeReferenceId', mode='before')
    @classmethod
    def validate_police_reference_id(cls, v):
        """Validate policeReferenceId if provided: cannot be empty or spaces only"""
        if v is None:
            return v
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                raise ValueError("policeReferenceId cannot be empty or contain only spaces")
            return stripped
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
        """Validate responsibleUserId - null and empty string are allowed (field is optional)"""
        if v is not None and isinstance(v, str) and not v.strip():
            return None  # Convert empty string to None
        return v

    @field_validator('unitTypeId', mode='before')
    @classmethod
    def validate_unit_type_id(cls, v):
        """Validate unitTypeId cannot be set to empty string (null is allowed to skip update)"""
        if v is not None and isinstance(v, str) and not v.strip():
            raise ValueError("unitTypeId cannot be empty. This is a required field.")
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
    unitCd: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedResponsibleUserSchema(BaseModel):
    """Nested responsible user data in unit response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class UnitEnhanceResponseSchema(UnitEnhanceBaseSchema):
    """Schema for Unit Enhance response"""
    id: str = Field(..., alias="_id", description="Unit ID (Primary Key)")
    unitCd: str = Field(..., description="Unique unit code (name_unitTypeName)")
    unitPath: List[str] = Field(default=[], description="Hierarchical path as array of unit names (includes current unit)")
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


class UnitEnhanceListItemSchema(BaseModel):
    """Schema for Unit Enhance list response with populated nested objects"""
    id: str = Field(..., alias="_id", description="Unit ID (Primary Key)")
    unitCd: str = Field(..., description="Unique unit code (name_unitTypeName)")
    policeReferenceId: Optional[str] = Field(None, description="Canonical string code for the unit")
    name: str = Field(..., description="Name of the organizational unit")
    unitPath: List[str] = Field(default=[], description="Hierarchical path as array of unit names")
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
    parentUnitId: Optional[str] = Field(None, description="Parent unit ID (FK: unit_enhance._id)")
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


class UnitEnhanceSearchSchema(BaseModel):
    """Schema for searching Unit Enhance"""
    policeReferenceId: Optional[str] = None
    unitCd: Optional[str] = None
    name: Optional[str] = None
    districtId: Optional[str] = None
    city: Optional[str] = None
    departmentId: Optional[str] = None
    unitTypeId: Optional[str] = None
    parentUnitId: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)


class UnitEnhanceMinimalSchema(BaseModel):
    """Minimal unit schema for dropdowns and selection lists"""
    id: str = Field(..., alias="_id", description="Unit ID")
    name: str = Field(..., description="Unit name")
    unitCd: str = Field(..., description="Unique unit code")

    model_config = ConfigDict(populate_by_name=True)


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


class UnitEnhanceCreateResponseDTO(BaseModel):
    """
    Response DTO for POST /units-enhance/create

    Returns the newly created unit with auto-generated unitCd and unitPath.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (201 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[UnitEnhanceResponseSchema] = Field(None, description="Created unit data")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 201,
                "message": "Unit created successfully",
                "data": {
                    "_id": "507f1f77bcf86cd799439011",
                    "unitCd": "CentralStation_PoliceStation",
                    "name": "Central Station",
                    "unitPath": ["Central Station", "City Police", "State Police"]
                },
                "errors": None
            }
        }
    )


class UnitEnhanceListResponseDTO(BaseModel):
    """
    Response DTO for GET /units-enhance/list

    Returns paginated list of units with populated nested objects.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[List[UnitEnhanceListItemSchema]] = Field(None, description="List of units")
    pagination: Optional[PaginationDTO] = Field(None, description="Pagination information")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Units fetched successfully",
                "data": [],
                "pagination": {
                    "page": 1,
                    "pageSize": 10,
                    "total": 100,
                    "totalPages": 10
                },
                "errors": None
            }
        }
    )


class UnitEnhanceMinimalListResponseDTO(BaseModel):
    """
    Response DTO for GET /units-enhance/list-minimal

    Returns minimal unit list (id, name, unitCd) for dropdowns.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[List[UnitEnhanceMinimalSchema]] = Field(None, description="List of minimal units")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Units fetched successfully",
                "data": [
                    {"_id": "507f1f77bcf86cd799439011", "name": "Central Station", "unitCd": "CentralStation_PoliceStation"}
                ],
                "errors": None
            }
        }
    )


class UnitEnhanceGetResponseDTO(BaseModel):
    """
    Response DTO for GET /units-enhance/get/{unit_id}

    Returns single unit with all populated nested objects.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[UnitEnhanceResponseSchema] = Field(None, description="Unit data")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")


class UnitEnhanceUpdateResponseDTO(BaseModel):
    """
    Response DTO for PATCH /units-enhance/update/{unit_id}

    Returns updated unit. If name or unitTypeId changed, unitCd is regenerated.
    If name or parentUnitId changed, unitPath is recalculated for this unit and all descendants.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[UnitEnhanceResponseSchema] = Field(None, description="Updated unit data")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")


class UnitEnhanceDeleteResponseDTO(BaseModel):
    """
    Response DTO for DELETE /units-enhance/delete/{unit_id}

    Returns soft-deleted unit (isDelete=true).
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[UnitEnhanceResponseSchema] = Field(None, description="Deleted unit data")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")


class UnitEnhanceRestoreResponseDTO(BaseModel):
    """
    Response DTO for POST /units-enhance/restore/{unit_id}

    Returns restored unit (isDelete=false). Validates unitCd uniqueness before restore.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[UnitEnhanceResponseSchema] = Field(None, description="Restored unit data")
    errors: Optional[ErrorDetailDTO] = Field(None, description="Error details if failed")
