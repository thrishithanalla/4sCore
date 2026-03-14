from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List
from datetime import datetime
from bson import ObjectId


class FurtherProcessSchema(BaseModel):
    """Schema for further process nested object"""
    requestType: List[str] = Field(..., min_length=1, description="Array of request types (e.g., ['telecom'])")
    targetRole: str = Field(..., min_length=1, max_length=100, description="Target role for this process step")
    targetUserId: str = Field(..., description="Target user ID (FK: personnel._id)")

    @field_validator('requestType')
    @classmethod
    def validate_request_type(cls, v):
        """Validate requestType array is not empty and contains valid strings"""
        if not v or len(v) == 0:
            raise ValueError("requestType must contain at least one value")
        for item in v:
            if not item or not isinstance(item, str) or item.strip() == "":
                raise ValueError("requestType items cannot be empty strings")
        return v

    @field_validator('targetRole')
    @classmethod
    def validate_target_role(cls, v):
        """Validate targetRole is not empty"""
        if not v or v.strip() == "":
            raise ValueError("targetRole cannot be empty")
        return v.strip()

    model_config = ConfigDict(populate_by_name=True)


class ApprovalFlowMasterBaseSchema(BaseModel):
    """Base schema for Approval Flow Master"""
    moduleId: str = Field(..., description="Module ID (FK: module._id)")
    flowName: str = Field(..., min_length=1, max_length=255, description="Name of the approval flow")
    description: Optional[str] = Field(None, max_length=1000, description="Description of the approval flow")
    finalApprovalUnitId: str = Field(..., description="Final approval unit ID (FK: unit._id)")
    finalApprovalRankId: str = Field(..., description="Final approval rank ID (FK: rank_master._id)")
    districtId: Optional[str] = Field(None, description="District ID (FK: district._id)")
    furtherProcess: Optional[List[FurtherProcessSchema]] = Field(None, description="Array of further process steps (optional)")
    isActive: bool = Field(default=True, description="Whether this approval flow is active")
    ifRejected: str = Field(..., max_length=100, description="Action to take if rejected (e.g., 'false', 'Creator', 'Previous')")

    @field_validator('flowName')
    @classmethod
    def validate_flow_name(cls, v):
        """Validate flowName is not empty"""
        if not v or v.strip() == "":
            raise ValueError("flowName cannot be empty")
        return v.strip()

    # @field_validator('districtId')
    # @classmethod
    # def validate_district_id(cls, v):
    #     """Validate districtId exists in district collection"""
    #     # TODO: Validate against district collection in router
    #     if v is not None and v.strip() == "":
    #         raise ValueError("districtId cannot be empty if provided")
    #     return v.strip() if v else v

    @field_validator('furtherProcess')
    @classmethod
    def validate_further_process(cls, v):
        """Validate furtherProcess if provided"""
        # furtherProcess is now optional (can be null)
        if v is not None and len(v) == 0:
            return None  # Convert empty list to None
        return v


class ApprovalFlowMasterCreateSchema(ApprovalFlowMasterBaseSchema):
    """Schema for creating a new Approval Flow Master"""
    pass


class ApprovalFlowMasterUpdateSchema(BaseModel):
    """Schema for updating Approval Flow Master - all fields optional"""
    moduleId: Optional[str] = None
    flowName: Optional[str] = Field(None, max_length=255, description="Name of the approval flow")
    description: Optional[str] = Field(None, max_length=1000, description="Description of the approval flow")
    finalApprovalUnitId: Optional[str] = None
    finalApprovalRankId: Optional[str] = Field(None, description="Final approval rank ID (FK: rank_master._id)")
    districtId: Optional[str] = Field(None, description="District ID (FK: district._id)")
    furtherProcess: Optional[List[FurtherProcessSchema]] = None
    isActive: Optional[bool] = None
    ifRejected: Optional[str] = None

    @field_validator('flowName')
    @classmethod
    def validate_flow_name(cls, v):
        """Validate flowName is not empty if provided"""
        if v is not None and (not v or v.strip() == ""):
            raise ValueError("flowName cannot be empty")
        return v.strip() if v else v

    @field_validator('furtherProcess')
    @classmethod
    def validate_further_process(cls, v):
        """Validate furtherProcess if provided"""
        if v is not None and len(v) == 0:
            return None  # Convert empty list to None
        return v


class NestedModuleSchema(BaseModel):
    """Nested module data in response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedUnitSchema(BaseModel):
    """Nested unit data in response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    policeReferenceId: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedRankSchema(BaseModel):
    """Nested rank data in response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    shortCode: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedDistrictSchema(BaseModel):
    """Nested district data in response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class ApprovalFlowMasterResponseSchema(BaseModel):
    """Schema for Approval Flow Master response - handles flexible data"""
    id: str = Field(..., alias="_id", description="Approval Flow Master ID (Primary Key)")

    # Required fields
    moduleId: str = Field(..., description="Module ID (FK: module._id)")
    flowName: str = Field(..., description="Name of the approval flow")
    finalApprovalUnitId: str = Field(..., description="Final approval unit ID (FK: unit._id)")
    finalApprovalRankId: str = Field(..., description="Final approval rank ID (FK: rank_master._id)")

    # Optional fields
    description: Optional[str] = Field(None, description="Description of the approval flow")
    districtId: Optional[str] = Field(None, description="District ID (FK: district._id)")
    furtherProcess: Optional[List[FurtherProcessSchema]] = Field(None, description="Array of further process steps")
    isActive: bool = Field(default=True, description="Whether this approval flow is active")
    ifRejected: Optional[str] = Field(None, description="Action to take if rejected")

    # Audit fields
    createdBy: str = Field(..., description="User who created (FK: personnel._id)")
    createdAt: datetime = Field(..., description="Creation timestamp")
    createdIp: Optional[str] = Field(None, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified (FK: personnel._id)")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, description="IP address from which record was last updated")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    # Populated nested objects
    module: Optional[NestedModuleSchema] = Field(None, description="Populated module data")
    finalApprovalUnit: Optional[NestedUnitSchema] = Field(None, description="Populated final approval unit data")
    finalApprovalRank: Optional[NestedRankSchema] = Field(None, description="Populated final approval rank data")
    district: Optional[NestedDistrictSchema] = Field(None, description="Populated district data")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
        extra='ignore'
    )
