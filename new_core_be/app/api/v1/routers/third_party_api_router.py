"""
Third Party API Manager Router (3PAPIMANAGER)
Provides API endpoints for CDR Softwares Network Lookup

Routes: /api/v1/3papi

Uses the new middleware/decorator pattern:
- PermissionChecker dependency for RBAC
- @handle_errors decorator for exception handling
- @log_operation decorator for transaction logging
- request.state.client_ip from middleware
"""
import logging
from fastapi import APIRouter, Depends, status, Request
from fastapi.responses import JSONResponse

# Schemas
from app.api.v1.schemas.third_party_api_schema import (
    NetworkLookupRequestSchema,
    NetworkLookupResponseSchema
)
from app.api.v1.schemas.auth_schema import TokenDataSchema

# Dependencies
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.dependencies.permission_checker import PermissionChecker

# Decorators
from app.api.v1.decorators.error_handler import handle_errors
from app.api.v1.decorators.transaction_logger import log_operation

# Standard response utilities
from app.api.v1.utils.standard_response import api_success

# Constants
from app.constants.api_constants import SuccessMessages
from app.constants.error_codes import ErrorCodes
from app.constants.jobs import Jobs
from app.constants.log_codes import LogCodes

# Services
from app.api.v1.services.third_party_api_service import lookup_network

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/3papi", tags=["3rd Party API Manager"])

# Job name for RBAC permission checks
JOB_NAME = Jobs.THIRD_PARTY_API
ENTITY_NAME = "Network Lookup"


# =============================================================================
# NETWORK LOOKUP
# =============================================================================

@router.post(
    "/ctrace/network",
    status_code=status.HTTP_200_OK,
    summary="Lookup network information",
    description="Lookup network information for a phone number using CDR Softwares API."
)
@handle_errors(ErrorCodes.THIRD_PARTY_API_EXECUTE_FAILED, ENTITY_NAME)
@log_operation(LogCodes.THIRD_PARTY_API_EXECUTED, ["keyword"])
async def network_lookup_endpoint(
    request_data: NetworkLookupRequestSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(
        JOB_NAME, "CREATE",
        ErrorCodes.THIRD_PARTY_API_EXECUTE_FAILED, ENTITY_NAME
    ))
):
    """
    Lookup network information for a phone number.

    This endpoint calls CDR Softwares API to get network information
    for the provided phone number/keyword.

    **Request Body (NetworkLookupRequestSchema):**
    - `keyword` (required): Phone number to lookup (e.g., "8142526457")

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Network Lookup executed successfully"
    - `data`: Contains API response with network information

    **Error Responses:**
    - 400: Validation error (invalid keyword format)
    - 403: Permission denied (CREATE permission required on THIRD_PARTY_API job)
    - 408: Request timeout to CDR API
    - 500: Internal server error or CDR API not configured
    - 502: CDR API request failed
    """
    # Get client IP from middleware
    client_ip = request.state.client_ip

    # Call CDR Network Lookup API
    result = await lookup_network(
        keyword=request_data.keyword,
        user_id=current_user.id,
        client_ip=client_ip
    )

    # Check if 3rd party API call failed
    if not result.success:
        error_status_code = result.status_code if result.status_code >= 400 else status.HTTP_502_BAD_GATEWAY
        return JSONResponse(
            status_code=error_status_code,
            content={
                "success": False,
                "code": error_status_code,
                "message": f"{ENTITY_NAME} failed",
                "data": result.model_dump(),
                "errors": {
                    "errorCode": ErrorCodes.THIRD_PARTY_API_EXECUTE_FAILED,
                    "service": "CDR",
                    "keyword": request_data.keyword,
                    "thirdPartyMessage": result.message or result.error
                }
            }
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_success(
            data=result.model_dump(),
            message=SuccessMessages.format(SuccessMessages.EXECUTED, ENTITY_NAME)
        )
    )


# =============================================================================
# HEALTH CHECK
# =============================================================================

@router.get(
    "/health",
    status_code=status.HTTP_200_OK,
    summary="Health check for 3rd party API gateway",
    description="Checks if the 3rd party API gateway is operational."
)
async def health_check_endpoint(request: Request):
    """
    Health check endpoint for the 3rd party API gateway.

    This endpoint does not require authentication and can be used
    for monitoring and load balancer health checks.

    **Response:**
    - `success`: true
    - `code`: 200
    - `message`: "Third Party API gateway is healthy"
    - `data`: Contains status and gateway info
    """
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_success(
            data={
                "status": "healthy",
                "gateway": "3PAPIMANAGER",
                "version": "1.0.0"
            },
            message="Third Party API gateway is healthy"
        )
    )
