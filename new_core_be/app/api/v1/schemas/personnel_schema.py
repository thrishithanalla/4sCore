from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, model_validator
from typing import Optional, Any, Union, List
from datetime import datetime
from bson import ObjectId
from app.utils.phone_validator import validate_indian_phone
from app.api.v1.utils.validators import validate_userid_field, validate_required_string_field, validate_badge_number_field, validate_gender_field, validate_name_field


def parse_date_flexible(v: Any) -> Optional[datetime]:
    """Parse date from various formats (datetime, string, or None)"""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        # Try common date formats
        for fmt in ["%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y %H:%M:%S", "%Y-%m-%dT%H:%M:%S"]:
            try:
                return datetime.strptime(v, fmt)
            except ValueError:
                continue
        # If no format matches, return None instead of raising
        return None
    return None


class PyObjectId(ObjectId):
    """Custom ObjectId type for Pydantic"""
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(cls, field_schema):
        field_schema.update(type="string")


class UnitAssignmentSchema(BaseModel):
    """Schema for unit assignment with designation"""
    unitId: str = Field(..., description="Unit ID (FK: unit._id) - required")
    designationId: Optional[str] = Field(None, description="Designation ID (FK: designation_master._id) - optional")

    @field_validator('unitId', mode='before')
    @classmethod
    def validate_unit_id(cls, v):
        """Validate unitId is not empty (DB existence checked in service layer)"""
        return validate_required_string_field(v, "unitId")

    @field_validator('designationId', mode='before')
    @classmethod
    def validate_designation_id(cls, v):
        """Validate designationId if provided (DB existence checked in service layer)"""
        if v is None or v == "":
            return None
        return v.strip() if isinstance(v, str) else v


class PersonnelBaseSchema(BaseModel):
    """Base schema for Personnel"""
    # Required fields
    email: EmailStr = Field(..., max_length=255, description="Login identifier (unique across all records including soft-deleted, lowercase, RFC 5322)")
    name: str = Field(..., max_length=255, description="Full name (required)")
    userId: str = Field(..., max_length=8, description="Police User Identifier - exactly 8 digits, numbers only (unique across all records including soft-deleted)")
    units: List[UnitAssignmentSchema] = Field(..., min_length=1, description="Array of unit assignments with designations - at least one required")

    # Required fields
    departmentId: str = Field(..., description="Department ID (FK: department._id) - required")
    rankId: str = Field(..., description="Rank ID (FK: rank._id) - required")

    # Optional fields (nullable=true)
    title: Optional[str] = Field(None, max_length=32, description="Honorific or service title (Mr, Ms)")
    firstName: Optional[str] = Field(None, max_length=80, description="Given name for display/admin use")
    lastName: Optional[str] = Field(None, max_length=80, description="Surname for display/admin use")
    picture: Optional[str] = Field(None, max_length=512, description="Relative/URL path to profile image")
    mobile: Optional[str] = Field(None, max_length=20, description="Mobile number (Indian format: +91XXXXXXXXXX, 91XXXXXXXXXX, or XXXXXXXXXX)")
    batchYear: Optional[int] = Field(None, description="Academy/service batch identifier")
    badgeNo: Optional[str] = Field(None, max_length=64, description="Officer badge identifier - numbers only (unique when present)")
    dateOfBirth: Optional[datetime] = Field(None, description="Date of birth (PII, encrypted at rest)")
    gender: Optional[str] = Field(None, max_length=32, description="Gender value - 'male' or 'female' only")
    caste: Optional[str] = Field(None, max_length=100, description="Caste")
    dateOfEnlistment: Optional[datetime] = Field(None, description="Date of enlistment")
    deputation: Optional[str] = Field(None, max_length=255, description="Deputation information")

    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate name: alphabets, spaces, hyphens, underscores only, minimum 3 alphabets"""
        return validate_name_field(v, "name", min_alphabets=3)

    @field_validator('userId', mode='before')
    @classmethod
    def validate_user_id(cls, v):
        """Validate userId: exactly 8 digits, numbers only"""
        return validate_userid_field(v, "userId")

    @model_validator(mode='after')
    def validate_units_designations(self):
        """Validate that at least one unit is provided (designationId is optional)"""
        if not self.units:
            raise ValueError("At least one unit assignment is required")

        return self

    @field_validator('mobile', mode='before')
    @classmethod
    def validate_mobile(cls, v):
        """Validate and normalize Indian mobile number format"""
        return validate_indian_phone(v, "mobile")

    @field_validator('badgeNo', mode='before')
    @classmethod
    def validate_badge_no(cls, v):
        """Validate badgeNo: string containing only numbers"""
        return validate_badge_number_field(v, "badgeNo")

    @field_validator('gender', mode='before')
    @classmethod
    def validate_gender(cls, v):
        """Validate gender: must be 'male' or 'female'"""
        return validate_gender_field(v, "gender")

    @field_validator('departmentId', mode='before')
    @classmethod
    def validate_department_id(cls, v):
        """Validate departmentId is not empty (DB existence checked in service layer)"""
        return validate_required_string_field(v, "departmentId")

    @field_validator('rankId', mode='before')
    @classmethod
    def validate_rank_id(cls, v):
        """Validate rankId is not empty (DB existence checked in service layer)"""
        return validate_required_string_field(v, "rankId")


class PersonnelCreateSchema(PersonnelBaseSchema):
    """Schema for creating a new Personnel"""
    # Required fields for creation
    password: str = Field(..., min_length=8, max_length=500, description="Password (will be hashed with BCrypt)")


class UnitAssignmentUpdateSchema(BaseModel):
    """Schema for unit assignment update with designation"""
    unitId: str = Field(..., description="Unit ID (FK: unit._id) - required")
    designationId: Optional[str] = Field(None, description="Designation ID (FK: designation_master._id) - optional")

    @field_validator('unitId', mode='before')
    @classmethod
    def validate_unit_id(cls, v):
        """Validate unitId is not empty (DB existence checked in service layer)"""
        return validate_required_string_field(v, "unitId")

    @field_validator('designationId', mode='before')
    @classmethod
    def validate_designation_id(cls, v):
        """Validate designationId if provided (DB existence checked in service layer)"""
        if v is None or v == "":
            return None
        return v.strip() if isinstance(v, str) else v


class PersonnelUpdateSchema(BaseModel):
    """Schema for updating Personnel - userId cannot be updated"""
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(None, max_length=255)
    # userId is NOT included - cannot be updated once created
    title: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    units: Optional[List[UnitAssignmentUpdateSchema]] = Field(None, description="Array of unit assignments with designations")
    departmentId: Optional[str] = None
    rankId: Optional[str] = None
    picture: Optional[str] = None
    mobile: Optional[str] = None
    batchYear: Optional[int] = None
    badgeNo: Optional[str] = None
    dateOfBirth: Optional[datetime] = None
    gender: Optional[str] = None
    caste: Optional[str] = None
    dateOfEnlistment: Optional[datetime] = None
    deputation: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8, description="New password (will be hashed)")

    @model_validator(mode='after')
    def validate_units_if_provided(self):
        """Validate units array if provided"""
        if self.units is not None:
            if len(self.units) == 0:
                raise ValueError("At least one unit assignment is required when updating units")
            # Note: designationId is optional for unit assignments
            # Personnel can be associated with a unit without having a specific designation

        return self

    @field_validator('mobile', mode='before')
    @classmethod
    def validate_mobile(cls, v):
        """Validate and normalize Indian mobile number format"""
        return validate_indian_phone(v, "mobile")

    @field_validator('badgeNo', mode='before')
    @classmethod
    def validate_badge_no(cls, v):
        """Validate badgeNo: string containing only numbers"""
        return validate_badge_number_field(v, "badgeNo")

    @field_validator('gender', mode='before')
    @classmethod
    def validate_gender(cls, v):
        """Validate gender: must be 'male' or 'female'"""
        return validate_gender_field(v, "gender")


class NestedUnitSchema(BaseModel):
    """Nested unit data in personnel response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    policeReferenceId: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedDesignationSchema(BaseModel):
    """Nested designation data in personnel response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    designationCd: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class UnitAssignmentResponseSchema(BaseModel):
    """Schema for unit assignment response with populated data"""
    unitId: str = Field(..., description="Unit ID")
    designationId: Optional[str] = Field(None, description="Designation ID")
    unit: Optional[NestedUnitSchema] = Field(None, description="Populated unit data")
    designation: Optional[NestedDesignationSchema] = Field(None, description="Populated designation data")

    model_config = ConfigDict(populate_by_name=True)


class NestedDepartmentSchema(BaseModel):
    """Nested department data in personnel response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedRankSchema(BaseModel):
    """Nested rank data in personnel response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class PersonnelResponseSchema(BaseModel):
    """Schema for Personnel response - handles legacy data with flexible field types"""
    id: str = Field(..., alias="_id", description="User ID (Primary Key)")

    # Required fields - made optional for legacy data compatibility
    email: Optional[str] = Field(None, description="Login identifier")
    name: Optional[str] = Field(None, description="Full name (may be stored as nameAsPerAadhar in legacy data)")
    userId: str = Field(..., description="Police User Identifier - exactly 8 digits, numbers only")
    units: Optional[List[UnitAssignmentResponseSchema]] = Field(None, description="Array of unit assignments with designations")

    # Optional fields
    title: Optional[str] = Field(None, description="Honorific or service title")
    firstName: Optional[str] = Field(None, description="Given name")
    lastName: Optional[str] = Field(None, description="Surname")
    departmentId: Optional[str] = Field(None, description="Department ID")
    rankId: Optional[str] = Field(None, description="Rank ID")
    picture: Optional[str] = Field(None, description="Profile image path")
    mobile: Optional[str] = Field(None, description="Mobile number")
    batchYear: Optional[int] = Field(None, description="Batch year")
    badgeNo: Optional[str] = Field(None, description="Badge number")
    dateOfBirth: Optional[datetime] = Field(None, description="Date of birth")
    gender: Optional[str] = Field(None, description="Gender")
    caste: Optional[str] = Field(None, description="Caste")
    dateOfEnlistment: Optional[datetime] = Field(None, description="Date of enlistment")
    deputation: Optional[str] = Field(None, description="Deputation information")

    # Audit fields
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp (IST)")
    createdIp: Optional[str] = Field(None, description="IP address of the creator")
    updatedBy: Optional[str] = Field(None, description="User who last modified")
    updatedAt: Optional[datetime] = Field(None, description="Last modification timestamp (IST)")
    updatedIp: Optional[str] = Field(None, description="IP address of the updater")

    # Populated nested objects (for backward compatibility)
    department: Optional[NestedDepartmentSchema] = Field(None, description="Populated department data")
    rank: Optional[NestedRankSchema] = Field(None, description="Populated rank data")

    @field_validator('userId', mode='before')
    @classmethod
    def validate_user_id_response(cls, v):
        """Handle userId from DB - return as-is for legacy data compatibility"""
        if v is None:
            return ""  # Return empty string for legacy data without userId
        return str(v)

    @field_validator('dateOfBirth', 'dateOfEnlistment', mode='before')
    @classmethod
    def parse_dates(cls, v):
        """Parse dates from various formats"""
        return parse_date_flexible(v)

    @field_validator('mobile', mode='before')
    @classmethod
    def validate_mobile(cls, v):
        """Validate and normalize Indian mobile number format"""
        try:
            return validate_indian_phone(v, "mobile")
        except ValueError:
            # Return as-is if validation fails for legacy data
            return str(v) if v is not None else None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
        extra='ignore'  # Ignore extra fields from database
    )


class UnitAssignmentCreateResponseSchema(BaseModel):
    """Schema for unit assignment in create response"""
    unitId: str = Field(..., description="Unit ID")
    designationId: Optional[str] = Field(None, description="Designation ID")

    model_config = ConfigDict(populate_by_name=True)


class PersonnelCreateResponseSchema(BaseModel):
    """Schema for Personnel create response - without nested objects"""
    id: str = Field(..., alias="_id", description="User ID (Primary Key)")

    # Required fields
    email: Optional[str] = Field(None, description="Login identifier")
    name: Optional[str] = Field(None, description="Full name")
    userId: str = Field(..., description="Police User Identifier - exactly 8 digits, numbers only")
    units: Optional[List[UnitAssignmentCreateResponseSchema]] = Field(None, description="Array of unit assignments")

    # Optional fields
    title: Optional[str] = Field(None, description="Honorific or service title")
    firstName: Optional[str] = Field(None, description="Given name")
    lastName: Optional[str] = Field(None, description="Surname")
    departmentId: Optional[str] = Field(None, description="Department ID")
    rankId: Optional[str] = Field(None, description="Rank ID")
    picture: Optional[str] = Field(None, description="Profile image path")
    mobile: Optional[str] = Field(None, description="Mobile number")
    batchYear: Optional[int] = Field(None, description="Batch year")
    badgeNo: Optional[str] = Field(None, description="Badge number")
    dateOfBirth: Optional[datetime] = Field(None, description="Date of birth")
    gender: Optional[str] = Field(None, description="Gender")
    caste: Optional[str] = Field(None, description="Caste")
    dateOfEnlistment: Optional[datetime] = Field(None, description="Date of enlistment")
    deputation: Optional[str] = Field(None, description="Deputation information")

    # Audit fields
    isActive: bool = Field(default=True, description="Active status flag")
    isDelete: bool = Field(default=False, description="Soft delete flag")
    createdBy: Optional[str] = Field(None, description="User who created this record")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp (IST)")
    createdIp: Optional[str] = Field(None, description="IP address of the creator")
    updatedBy: Optional[str] = Field(None, description="User who last modified")
    updatedAt: Optional[datetime] = Field(None, description="Last modification timestamp (IST)")
    updatedIp: Optional[str] = Field(None, description="IP address of the updater")

    @field_validator('userId', mode='before')
    @classmethod
    def validate_user_id_response(cls, v):
        """Handle userId from DB - return as-is for legacy data compatibility"""
        if v is None:
            return ""
        return str(v)

    @field_validator('dateOfBirth', 'dateOfEnlistment', mode='before')
    @classmethod
    def parse_dates(cls, v):
        """Parse dates from various formats"""
        return parse_date_flexible(v)

    @field_validator('mobile', mode='before')
    @classmethod
    def validate_mobile(cls, v):
        """Validate and normalize Indian mobile number format"""
        try:
            return validate_indian_phone(v, "mobile")
        except ValueError:
            return str(v) if v is not None else None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
        extra='ignore'
    )


class PersonnelSearchSchema(BaseModel):
    """Schema for searching Personnel"""
    email: Optional[str] = None
    userId: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    unitId: Optional[str] = None
    departmentId: Optional[str] = None
    badgeNo: Optional[str] = None
    isDelete: Optional[bool] = False
    skip: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=100)


class PersonnelBulkCreateSchema(BaseModel):
    """Schema for bulk creating personnel"""
    items: List[PersonnelCreateSchema] = Field(..., min_length=1, description="List of personnel to create")


class PersonnelBulkCreateResponseSchema(BaseModel):
    """Response schema for bulk create operation"""
    success: List[dict] = Field(default=[], description="Successfully created personnel")
    failed: List[dict] = Field(default=[], description="Failed items with error details")
    totalSuccess: int = Field(default=0, description="Total successfully created")
    totalFailed: int = Field(default=0, description="Total failed to create")


# =============================================================================
# Personnel by Units and Role Schemas
# =============================================================================

class PersonnelByUnitsAndRoleRequestSchema(BaseModel):
    """
    Request schema for getting personnel by multiple units and a role.

    This endpoint queries user_role_permissions to find personnel who:
    1. Are assigned to any of the specified units
    2. Have the specified role mapping
    """
    unitIds: List[str] = Field(
        ...,
        min_length=1,
        description="List of unit IDs to filter by (at least one required)"
    )
    roleId: str = Field(
        ...,
        description="Role ID to filter by (must exist in user_role_permissions)"
    )
    includeDeleted: bool = Field(
        default=False,
        description="Include soft-deleted records"
    )

    @field_validator('roleId', mode='before')
    @classmethod
    def validate_role_id(cls, v):
        """Validate roleId is not empty"""
        if not v or not str(v).strip():
            raise ValueError("roleId is required")
        return str(v).strip()

    @field_validator('unitIds', mode='before')
    @classmethod
    def validate_unit_ids(cls, v):
        """Validate unitIds is not empty and contains valid strings"""
        if not v:
            raise ValueError("At least one unitId is required")
        if isinstance(v, list):
            cleaned = [str(uid).strip() for uid in v if uid and str(uid).strip()]
            if not cleaned:
                raise ValueError("At least one valid unitId is required")
            return cleaned
        return v


class PersonnelByUnitsAndRoleItemSchema(BaseModel):
    """Schema for each personnel item in the response"""
    id: str = Field(..., alias="_id", description="Personnel MongoDB _id")
    personnelId: str = Field(..., description="Personnel MongoDB _id (duplicate for convenience)")
    userId: str = Field(..., description="Police User Identifier (8 digits)")
    userName: str = Field(..., description="Full name of the personnel")
    email: Optional[str] = Field(None, description="Personnel email")
    unitId: str = Field(..., description="Unit ID from user_role_permissions")
    unitObjectId: Optional[str] = Field(None, description="Unit MongoDB _id")
    unitName: Optional[str] = Field(None, description="Unit name")
    rankId: Optional[str] = Field(None, description="Rank ID from personnel")
    rankName: Optional[str] = Field(None, description="Rank name")
    roleId: str = Field(..., description="Role ID from user_role_permissions")
    isActive: bool = Field(default=True, description="Active status")

    model_config = ConfigDict(populate_by_name=True)


class PersonnelByUnitsAndRoleResponseSchema(BaseModel):
    """
    Response schema for GET /personnel-master/by-units-and-role

    Returns personnel who have a role mapping in user_role_permissions
    for the specified units and role.
    """
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[List[PersonnelByUnitsAndRoleItemSchema]] = Field(
        None,
        description="List of personnel matching the criteria"
    )
    totalItems: int = Field(default=0, description="Total number of matching personnel")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Personnel fetched successfully",
                "data": [
                    {
                        "_id": "507f1f77bcf86cd799439011",
                        "personnelId": "507f1f77bcf86cd799439011",
                        "userId": "12345678",
                        "userName": "John Doe",
                        "email": "john.doe@police.gov.in",
                        "unitId": "507f1f77bcf86cd799439012",
                        "unitObjectId": "507f1f77bcf86cd799439012",
                        "unitName": "Central Station",
                        "rankId": "507f1f77bcf86cd799439013",
                        "rankName": "Inspector",
                        "roleId": "507f1f77bcf86cd799439014",
                        "isActive": True
                    }
                ],
                "totalItems": 1
            }
        }
    )