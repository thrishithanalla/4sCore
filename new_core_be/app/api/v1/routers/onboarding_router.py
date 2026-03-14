"""
User Onboarding Router
Provides API endpoint for user onboarding (personnel + role mappings)
Routes: /api/v1/onboarding
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from fastapi.responses import JSONResponse
from typing import Optional

from app.api.v1.schemas.onboarding_schema import (
    UserOnboardingCreateSchema,
    UserOnboardingResponseSchema,
    UserOnboardingUpdateSchema,
    UserOnboardingUpdateResponseSchema
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import (
    ResponseBuilder,
    api_created,
    api_success
)
from app.constants.api_constants import (
    ErrorCodes,
    ErrorMessages,
    PermissionMessages,
    ModulePrefixes
)
from app.api.v1.services.onboarding_service import onboard_user, update_onboarded_user
from app.constants.jobs import Jobs
from app.constants.error_codes import ErrorCodes as ErrorCodeConstants
from app.constants.log_codes import LogCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.services.notification_logger import (
    emit_notification,
    NotificationTypes,
    build_user_onboarded_sms_payload
)
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])

# Job names for RBAC permission checks
JOB_NAME_PERSONNEL = Jobs.PERSONNEL_MASTER
JOB_NAME_USER_MAPPING = Jobs.USER_ROLE_PERMISSIONS
MODULE_PREFIX = ModulePrefixes.ONBOARDING if hasattr(ModulePrefixes, 'ONBOARDING') else "ONBOARD"
ENTITY_NAME = "User"


def _error_code(code: str) -> str:
    """Generate error code with module prefix"""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)


@router.post(
    "/create",
    response_model=UserOnboardingResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Onboard a new user",
    description="Creates a new personnel record with role-unit permission mappings in a single atomic operation."
)
async def onboard_user_endpoint(
    data: UserOnboardingCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Onboard a new user with personnel record and role mappings.

    This endpoint performs an atomic operation that:
    1. Creates a new personnel record with MPIN and profile data
    2. Creates one or more role-unit permission mappings for the new user
    3. If any step fails, rolls back all changes

    **Request Body (UserOnboardingCreateSchema):**
    - Personnel fields (email, mpin, userId, name, units, departmentId, rankId, etc.)
    - `mpin` (required): 4-digit MPIN for authentication (integer 1000-9999)
    - `roleMappings` (required): Array of role-unit mappings, each containing:
      - `roleId`: Role to assign (must exist in roles collection)
      - `unitId`: Unit for this role mapping (must exist in units collection)
      - `additionalPermissions`: Optional array of additional permissions
      - `exclusionPermissions`: Optional array of excluded permissions

    **Response (UserOnboardingResponseSchema):**
    - `success`: true on success
    - `code`: 201
    - `message`: "User onboarded successfully"
    - `data`:
      - `personnel`: Created personnel record
      - `roleMappings`: Array of created role-unit permission mappings

    **Error Responses:**
    - 400: Validation error (duplicate email/userId, invalid references)
    - 403: Permission denied (requires CREATE on both personnel-master and user-mapping)
    - 500: Internal server error

    **Side Effects:**
    - Adds personnel to unitPersonnelList in assigned units
    - Emits USER_ONBOARDED notification
    - Logs transaction with USER_ONBOARDED code

    **Atomicity:**
    - If personnel creation succeeds but role mapping fails, personnel is deleted
    - All role mappings are created or none are created
    """
    try:
    

        client_ip = get_client_ip(request)
        result = await onboard_user(data, current_user.id, client_ip, request)

        # Log successful onboarding
        await log_transaction(
            request=request,
            log_code=LogCodes.USER_ONBOARDED,
            json_values={
                "personnelId": result["personnel"].get("_id", ""),
                "name": result["personnel"].get("name", ""),
                "email": result["personnel"].get("email", ""),
                "roleMappingsCount": len(result["roleMappings"]),
                "createdBy": current_user.id
            },
            level="info"
        )

        # Emit SMS notification to the newly onboarded user with login credentials
        created_personnel_id = result["personnel"].get("_id")
        if created_personnel_id:
            # Get mpin from result (defaults to 1111 if not provided in request)
            mpin_value = result["personnel"].get("mpin", data.mpin or 1111)
            await emit_notification(
                request=request,
                notification_type=NotificationTypes.USER_ONBOARDED_SMS,
                contact_ids=created_personnel_id,
                payload=build_user_onboarded_sms_payload(
                    personnel_data=result["personnel"],
                    mpin=str(mpin_value)
                ),
                channels=["sms"],
                priority="HIGH",
                actor_user_id=current_user.id
            )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_created(
                data=result,
                message="User onboarded successfully"
            )
        )

    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.ONBOARDING_FAILED,
            parameters={"email": data.email, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=_error_code(ErrorCodes.CREATE),
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.ONBOARDING_FAILED,
            parameters={"email": data.email, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=_error_code(ErrorCodes.VALIDATION)
            )
        )
    except Exception as e:
        logger.exception("Error onboarding user")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.ONBOARDING_FAILED,
            parameters={"email": data.email, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.CREATE)
            )
        )


@router.patch(
    "/update/{personnel_id}",
    response_model=UserOnboardingUpdateResponseSchema,
    status_code=status.HTTP_200_OK,
    summary="Update an onboarded user",
    description="Updates personnel record and/or role-unit permission mappings for an existing user."
)
async def update_onboarded_user_endpoint(
    personnel_id: str,
    data: UserOnboardingUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an onboarded user's personnel record and role mappings.

    This endpoint allows partial updates to:
    - Personnel fields (email, name, mpin, units, etc.)
    - Role mappings (create new, update existing, delete removed)

    **Path Parameters:**
    - `personnel_id`: The ID of the personnel to update

    **Request Body (UserOnboardingUpdateSchema):**
    - All fields are optional - only provided fields will be updated
    - `roleMappings`: If provided, syncs role mappings:
      - Mappings with `_id`: Updates existing mapping
      - Mappings without `_id`: Creates new mapping
      - Existing mappings not in array: Soft deleted

    **Response (UserOnboardingUpdateResponseSchema):**
    - `success`: true on success
    - `code`: 200
    - `message`: "User updated successfully"
    - `data`:
      - `personnel`: Updated personnel record
      - `roleMappings`: Current role-unit permission mappings
      - `changes`: Summary of changes made

    **Error Responses:**
    - 400: Validation error (invalid references, duplicate email)
    - 403: Permission denied (requires UPDATE on both personnel-master and user-mapping)
    - 404: Personnel not found
    - 500: Internal server error
    """
    try:
        

        client_ip = get_client_ip(request)
        result = await update_onboarded_user(personnel_id, data, current_user.id, client_ip, request)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.USER_ONBOARDED,  # Could add a USER_UPDATED log code
            json_values={
                "personnelId": personnel_id,
                "name": result["personnel"].get("name", ""),
                "email": result["personnel"].get("email", ""),
                "changes": result.get("changes", {}),
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=result,
                message="User updated successfully"
            )
        )

    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodeConstants.ONBOARDING_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=_error_code(ErrorCodes.UPDATE),
                code=e.status_code
            )
        )
    except ValueError as e:
        error_message = str(e)
        # Check if it's a not found error
        if "not found" in error_message.lower():
            error_log = await log_error(
                request=request,
                error_code=ErrorCodeConstants.ONBOARDING_FAILED,
                parameters={"personnelId": personnel_id, "errorMessage": error_message},
                actor_user_id=current_user.id
            )
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )
        else:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodeConstants.ONBOARDING_FAILED,
                parameters={"personnelId": personnel_id, "errorMessage": error_message},
                actor_user_id=current_user.id
            )
            resolved_message = (error_log or {}).get("resolvedMessage") or error_message
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=resolved_message,
                    error_code=_error_code(ErrorCodes.VALIDATION)
                )
            )
    except Exception as e:
        logger.exception("Error updating onboarded user")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodeConstants.ONBOARDING_FAILED,
            parameters={"personnelId": personnel_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=_error_code(ErrorCodes.UPDATE)
            )
        )
