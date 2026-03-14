"""
Organizational Structure Router
Read-only API endpoints for AP Police organizational hierarchy
"""
import logging
from typing import Optional
from fastapi import APIRouter, Query, Request, HTTPException, status
from fastapi.responses import JSONResponse

from app.api.v1.schemas.org_structure_schema import OrgStructureResponseDTO
from app.api.v1.services.org_structure_service import OrgStructureService
from app.api.v1.utils.standard_response import api_success, ResponseBuilder
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/org-structure", tags=["org-structure"])


@router.get(
    "",
    response_model=OrgStructureResponseDTO,
    status_code=status.HTTP_200_OK,
    summary="Get AP Police organizational structure",
    description="Retrieves the organizational hierarchy in tree (nested) or flat (array) format."
)
async def get_org_structure(
    request: Request,
    format: str = Query(
        "tree",
        description="Response format: 'tree' for nested hierarchy or 'flat' for array with parent references",
        regex="^(tree|flat)$"
    ),
    level: Optional[str] = Query(
        None,
        description="Filter by hierarchy level (L1, L2, L3, etc.)",
        regex="^L[1-8]$"
    ),
    unit_id: Optional[str] = Query(
        None,
        alias="unitId",
        description="Get subtree starting from specific unit ID"
    ),
    district_id: Optional[str] = Query(
        None,
        alias="districtId",
        description="Filter by district ObjectId"
    ),
    unit_type_id: Optional[str] = Query(
        None,
        alias="unitTypeId",
        description="Filter by unit type ObjectId"
    ),
    include_inactive: bool = Query(
        False,
        alias="includeInactive",
        description="Include inactive units (default: false)"
    )
):
    """
    Get AP Police organizational structure.

    This endpoint returns the complete organizational hierarchy of AP Police
    based on the existing unit_enhance collection.

    **Query Parameters:**
    - `format` (required): Response format
      - `tree`: Nested hierarchy with children (good for org charts)
      - `flat`: Array with parentUnitId references (good for large datasets)
    - `level` (optional): Filter by hierarchy level (L1=State, L2=Zone, L3=Range, etc.)
    - `unitId` (optional): Get subtree starting from specific unit
    - `districtId` (optional): Filter units by district
    - `unitTypeId` (optional): Filter units by type
    - `includeInactive` (optional): Include inactive units (default: false)

    **Tree Format Response:**
    Returns nested structure where each unit contains:
    - `unitId`, `unitName`, `unitCd`, `unitType`, `hierarchyLevel`, `rank`
    - `incharge`: Officer in-charge with name, badge, rank, phone, email
    - `jurisdiction`: Array of jurisdictions (district, mandal, village)
    - `personnelCount`: Number of personnel in this unit
    - `totalChildUnits`: Total child units at all levels below
    - `totalPersonnel`: Total personnel including all children
    - `children`: Array of child units (recursive)

    **Flat Format Response:**
    Returns array of units with:
    - Same fields as tree but without nested children
    - `parentUnitId`: Reference to parent unit for building tree on frontend

    **Hierarchy Levels:**
    - L1: State (DGP)
    - L2: Zone (IGP)
    - L3: Range/Commissionerate (DIG/CP)
    - L4: District (SP) / City Zone (DCP)
    - L5: Sub-Division (DSP) / Division (ACP)
    - L6: Circle (CI)
    - L7: Police Station (Inspector)
    - L8: Beat (HC/ASI)

    **Error Responses:**
    - 400: Invalid query parameters
    - 404: Unit not found (when unitId provided)
    - 500: Internal server error
    """
    try:
        result = await OrgStructureService.get_org_structure(
            format=format,
            level=level,
            unit_id=unit_id,
            district_id=district_id,
            unit_type_id=unit_type_id,
            include_inactive=include_inactive
        )

        # Log successful fetch
        await log_transaction(
            request=request,
            log_code=LogCodes.ORG_STRUCTURE_VIEWED,
            json_values={
                "format": format,
                "level": level,
                "unitId": unit_id,
                "totalUnits": result.get("totalUnits", 0)
            },
            level="info"
        )

        # Build response with totalUnits
        response_data = {
            "units": result["data"],
            "totalUnits": result.get("totalUnits", 0)
        }

        return JSONResponse(
            status_code=200,
            content=api_success(
                data=response_data,
                message="Organizational structure fetched successfully"
            )
        )
    except HTTPException as e:
        # Extract unit name from error detail if available (format: "Unit 'Name' not found")
        error_detail = str(e.detail)
        unit_name = None
        if "Unit '" in error_detail and "' not found" in error_detail:
            try:
                unit_name = error_detail.split("Unit '")[1].split("' not found")[0]
            except:
                pass

        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.ORG_STRUCTURE_FETCH_FAILED,
            parameters={
                "format": format,
                "unitId": unit_id or "N/A",
                "unitName": unit_name or "Unknown",
                "errorMessage": error_detail
            },
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.ORG_STRUCTURE_FETCH_FAILED,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception("Error fetching organizational structure")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.ORG_STRUCTURE_FETCH_FAILED,
            parameters={
                "format": format,
                "unitId": unit_id or "N/A",
                "unitName": "Unknown",
                "errorMessage": str(e)
            },
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to fetch organizational structure"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.ORG_STRUCTURE_FETCH_FAILED
            )
        )
