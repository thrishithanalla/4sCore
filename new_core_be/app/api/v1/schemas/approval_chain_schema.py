from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Any
from datetime import datetime
from bson import ObjectId


class TransactionHistorySchema(BaseModel):
    """Schema for transaction history entry"""
    action: str = Field(..., min_length=1, max_length=100, description="Action taken (e.g., Approve, Reject, Forward)")
    unitId: str = Field(..., description="Unit ID where action was taken (FK: unit._id)")
    userId: str = Field(..., description="User who performed the action (FK: personnel._id)")
    timestamp: datetime = Field(..., description="Timestamp when action was taken")
    comments: Optional[str] = Field(None, description="Optional comments for this action")

    @field_validator('action')
    @classmethod
    def validate_action(cls, v):
        """Validate action is not empty"""
        if not v or v.strip() == "":
            raise ValueError("action cannot be empty")
        return v.strip()

    model_config = ConfigDict(populate_by_name=True)


class ApprovalChainBaseSchema(BaseModel):
    """Base schema for Approval Chain"""
    moduleId: str = Field(..., description="Module ID (FK: module._id)")
    requestId: str = Field(..., description="Request/Application ID that this approval chain is tracking")
    currentUnitId: Optional[str] = Field(None, description="Current unit ID in approval chain (FK: unit._id)")
    finalApprovalUnitId: str = Field(..., description="Final approval unit ID (FK: unit._id)")
    districtId: Optional[str] = Field(None, description="District ID (FK: district._id)")
    approvalChainStatus: str = Field(..., min_length=1, max_length=50, description="Status of approval chain (e.g., Pending, Approved, Rejected, Processed)")
    transactionHistory: List[TransactionHistorySchema] = Field(default_factory=list, description="Array of transaction history entries")
    finalApprovalDate: Optional[datetime] = Field(None, description="Date when final approval was given")
    finalApprovalRankId: str = Field(..., description="Final approval role ID (FK: roles._id)")
    currentApproverId: Optional[str] = Field(None, description="Current approver ID (FK: personnel._id)")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    @field_validator('approvalChainStatus')
    @classmethod
    def validate_approval_chain_status(cls, v):
        """Validate approvalChainStatus is not empty"""
        if not v or v.strip() == "":
            raise ValueError("approvalChainStatus cannot be empty")
        return v.strip()


class ApprovalChainCreateSchema(ApprovalChainBaseSchema):
    """Schema for creating a new Approval Chain"""
    pass


class ApprovalChainUpdateSchema(BaseModel):
    """Schema for updating Approval Chain - all fields optional"""
    moduleId: Optional[str] = None
    currentUnitId: Optional[str] = None
    currentApproverId: Optional[str] = None
    finalApprovalUnitId: Optional[str] = None
    districtId: Optional[str] = None
    finalApprovalRankId: Optional[str] = None
    approvalChainStatus: Optional[str] = None
    transactionHistory: Optional[List[TransactionHistorySchema]] = None
    finalApprovalDate: Optional[datetime] = None
    isDelete: Optional[bool] = None

    @field_validator('approvalChainStatus')
    @classmethod
    def validate_approval_chain_status(cls, v):
        """Validate approvalChainStatus is not empty if provided"""
        if v is not None and (not v or v.strip() == ""):
            raise ValueError("approvalChainStatus cannot be empty")
        return v.strip() if v else v


# Nested schemas for populated data
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


class NestedDistrictSchema(BaseModel):
    """Nested district data in response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedRoleSchema(BaseModel):
    """Nested role data in response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    shortCode: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class NestedPersonnelSchema(BaseModel):
    """Nested personnel data in response"""
    id: str = Field(..., alias="_id")
    name: Optional[str] = None
    email: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class ApprovalChainResponseSchema(BaseModel):
    """Schema for Approval Chain response"""
    id: str = Field(..., alias="_id", description="Approval Chain ID (Primary Key)")

    # Required fields
    moduleId: str = Field(..., description="Module ID (FK: module._id)")
    requestId: str = Field(..., description="Request/Application ID")
    finalApprovalUnitId: str = Field(..., description="Final approval unit ID (FK: unit._id)")
    finalApprovalRankId: str = Field(..., description="Final approval role ID (FK: roles._id)")
    approvalChainStatus: str = Field(..., description="Status of approval chain")

    # Optional fields
    currentUnitId: Optional[str] = Field(None, description="Current unit ID in approval chain")
    currentApproverId: Optional[str] = Field(None, description="Current approver ID")
    districtId: Optional[str] = Field(None, description="District ID")
    transactionHistory: List[TransactionHistorySchema] = Field(default_factory=list, description="Array of transaction history entries")
    finalApprovalDate: Optional[datetime] = Field(None, description="Date when final approval was given")
    isDelete: bool = Field(default=False, description="Soft delete flag")

    # Audit fields
    createdBy: str = Field(..., description="User who created (FK: personnel._id)")
    createdAt: datetime = Field(..., description="Creation timestamp")
    createdIp: Optional[str] = Field(None, description="IP address from which record was created")
    updatedBy: Optional[str] = Field(None, description="User who last modified (FK: personnel._id)")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")
    updatedIp: Optional[str] = Field(None, description="IP address from which record was last updated")

    # Populated nested objects
    module: Optional[NestedModuleSchema] = Field(None, description="Populated module data")
    currentUnit: Optional[NestedUnitSchema] = Field(None, description="Populated current unit data")
    finalApprovalUnit: Optional[NestedUnitSchema] = Field(None, description="Populated final approval unit data")
    district: Optional[NestedDistrictSchema] = Field(None, description="Populated district data")
    finalApprovalRole: Optional[NestedRoleSchema] = Field(None, description="Populated final approval role data")
    currentApprover: Optional[NestedPersonnelSchema] = Field(None, description="Populated current approver data")

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
        extra='ignore'
    )
