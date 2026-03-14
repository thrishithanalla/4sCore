"""
Organizational Structure Schema
Defines schemas for AP Police organizational hierarchy API
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


class PersonnelMinimalSchema(BaseModel):
    """Minimal personnel data for org structure"""
    id: str = Field(..., alias="_id", description="Personnel ID")
    name: str = Field(..., description="Personnel name")
    badge: Optional[str] = Field(None, description="Badge number")
    rank: Optional[str] = Field(None, description="Rank/Designation")
    phone: Optional[str] = Field(None, description="Contact phone")
    email: Optional[str] = Field(None, description="Email address")
    department: Optional[str] = Field(None, description="Department/Wing")

    model_config = ConfigDict(populate_by_name=True)


class JurisdictionSchema(BaseModel):
    """Jurisdiction data for org units"""
    type: str = Field(..., description="Jurisdiction type: District, Mandal")
    refId: Optional[str] = Field(None, description="Reference ID to master collection")
    name: str = Field(..., description="Jurisdiction name")
    code: Optional[str] = Field(None, description="Jurisdiction code (e.g., CCTNS code)")
    villages: Optional[List[str]] = Field(None, description="List of village names (only for Mandal type)")

    model_config = ConfigDict(populate_by_name=True)


class OrgUnitFlatSchema(BaseModel):
    """Flat organizational unit schema for list view"""
    unitId: str = Field(..., description="Unit ID from unit_enhance collection")
    unitName: str = Field(..., description="Name of the organizational unit")
    unitCd: Optional[str] = Field(None, description="Unique unit code (name_unitTypeName)")
    unitType: Optional[str] = Field(None, description="Type of unit (Zone, Range, District, PS, etc.)")
    hierarchyLevel: Optional[str] = Field(None, description="Hierarchy level (L1-L8)")
    rank: Optional[str] = Field(None, description="Rank of officer in-charge (DGP, IGP, SP, etc.)")
    parentUnitId: Optional[str] = Field(None, description="Parent unit ID for hierarchy")
    unitPath: List[str] = Field(default=[], description="Hierarchical path array")

    # Officer in-charge
    incharge: Optional[PersonnelMinimalSchema] = Field(None, description="Officer in-charge of this unit")

    # Jurisdiction data
    jurisdiction: List[JurisdictionSchema] = Field(default=[], description="Jurisdiction covered by this unit")

    # Personnel count
    personnelCount: int = Field(default=0, description="Total personnel in this unit")

    # Location data
    districtName: Optional[str] = Field(None, description="District name")
    city: Optional[str] = Field(None, description="City/Town")
    address: Optional[str] = Field(None, description="Full address")

    # Contact
    phone: Optional[List[str]] = Field(None, description="Contact phone numbers")
    email: Optional[str] = Field(None, description="Official email")

    # Metadata
    isActive: bool = Field(default=True, description="Active status")
    createdAt: Optional[datetime] = Field(None, description="Creation timestamp")
    updatedAt: Optional[datetime] = Field(None, description="Last update timestamp")

    model_config = ConfigDict(populate_by_name=True)


class OrgUnitTreeSchema(BaseModel):
    """Nested tree organizational unit schema"""
    unitId: str = Field(..., description="Unit ID from unit_enhance collection")
    unitName: str = Field(..., description="Name of the organizational unit")
    unitCd: Optional[str] = Field(None, description="Unique unit code (name_unitTypeName)")
    unitType: Optional[str] = Field(None, description="Type of unit (Zone, Range, District, PS, etc.)")
    hierarchyLevel: Optional[str] = Field(None, description="Hierarchy level (L1-L8)")
    rank: Optional[str] = Field(None, description="Rank of officer in-charge")
    parentUnitId: Optional[str] = Field(None, description="Parent unit ID")
    unitPath: List[str] = Field(default=[], description="Hierarchical path array")

    # Officer in-charge
    incharge: Optional[PersonnelMinimalSchema] = Field(None, description="Officer in-charge of this unit")

    # Jurisdiction data
    jurisdiction: List[JurisdictionSchema] = Field(default=[], description="Jurisdiction covered by this unit")

    # Personnel count
    personnelCount: int = Field(default=0, description="Total personnel in this unit")

    # Statistics (for collapsed view)
    totalChildUnits: int = Field(default=0, description="Total child units (all levels)")
    totalPersonnel: int = Field(default=0, description="Total personnel including children")

    # Location data
    districtName: Optional[str] = Field(None, description="District name")
    city: Optional[str] = Field(None, description="City/Town")

    # Contact
    phone: Optional[List[str]] = Field(None, description="Contact phone numbers")
    email: Optional[str] = Field(None, description="Official email")

    # Children (nested)
    children: List['OrgUnitTreeSchema'] = Field(default=[], description="Child units in hierarchy")

    # Metadata
    isActive: bool = Field(default=True, description="Active status")

    model_config = ConfigDict(populate_by_name=True)


# Enable forward reference for nested children
OrgUnitTreeSchema.model_rebuild()


class OrgStructureResponseDTO(BaseModel):
    """Response DTO for org structure endpoint"""
    success: bool = Field(..., description="Whether the request was successful")
    code: int = Field(..., description="HTTP status code (200 on success)")
    message: str = Field(..., description="Response message")
    data: Optional[List[OrgUnitTreeSchema] | List[OrgUnitFlatSchema]] = Field(None, description="Org structure data (tree or flat)")
    totalUnits: Optional[int] = Field(None, description="Total number of units")
    errors: Optional[Dict[str, Any]] = Field(None, description="Error details if failed")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "code": 200,
                "message": "Organizational structure fetched successfully",
                "data": [],
                "totalUnits": 150,
                "errors": None
            }
        }
    )
