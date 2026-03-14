"""
Example Router - NEW PATTERN
This file demonstrates the new middleware/decorator pattern.

BEFORE (Old Pattern - 80+ lines per endpoint):
- Manual permission check with error logging
- Manual try-except with HTTPException, ValueError, Exception handling
- Manual transaction logging
- Manual client IP extraction

AFTER (New Pattern - 15-20 lines per endpoint):
- PermissionChecker dependency handles RBAC
- @handle_errors decorator handles exceptions
- @log_operation decorator handles transaction logging
- request.state.client_ip from middleware

Compare this with any existing router to see the difference!
"""

import logging
from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse

# Auth dependency (unchanged)
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.schemas.auth_schema import TokenDataSchema

# NEW: Permission Checker Dependency
from app.api.v1.dependencies.permission_checker import PermissionChecker

# NEW: Decorators
from app.api.v1.decorators.error_handler import handle_errors
from app.api.v1.decorators.transaction_logger import log_operation

# Standard response utilities (unchanged)
from app.api.v1.utils.standard_response import api_success, api_paginated

# Constants (unchanged)
from app.constants.jobs import Jobs
from app.constants.error_codes import ErrorCodes
from app.constants.log_codes import LogCodes
from app.constants.api_constants import SuccessMessages


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/example-new", tags=["example-new-pattern"])

# Job name for RBAC
JOB_NAME = Jobs.UNITS  # Example: using units job
ENTITY_NAME = "Example Entity"


# =============================================================================
# EXAMPLE 1: CREATE Endpoint - New Pattern
# =============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create example (NEW PATTERN)",
    description="Demonstrates the new pattern for CREATE endpoints"
)
@handle_errors(ErrorCodes.UNIT_CREATE_FAILED, ENTITY_NAME)  # Handles all exceptions
@log_operation(LogCodes.UNIT_CREATED, ["_id", "name"])  # Logs on success
async def create_example_new_pattern(
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "CREATE", ErrorCodes.UNIT_CREATE_FAILED, ENTITY_NAME))
):
    """
    NEW PATTERN - Only 15 lines!

    What happens automatically:
    1. PermissionChecker dependency checks RBAC permission
       - If denied: returns 403 with proper error logging
    2. If permission granted, endpoint executes
    3. @handle_errors catches any exception:
       - ValueError → 400 with logging
       - Exception → 500 with stack trace logging
    4. If success (2xx), @log_operation logs the transaction

    Compare this to the old pattern which had 80+ lines!
    """
    # Get client IP from middleware (no need to call get_client_ip manually)
    client_ip = request.state.client_ip

    # Your business logic here
    # created = await example_service.create(data, current_user.id, client_ip)

    # Example response
    created = {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "name": "Example Entity",
        "createdBy": current_user.id,
        "createdIp": client_ip
    }

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=api_success(
            data=created,
            message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
        )
    )


# =============================================================================
# EXAMPLE 2: GET/READ Endpoint - New Pattern
# =============================================================================

@router.get(
    "/get/{entity_id}",
    summary="Get example by ID (NEW PATTERN)",
    description="Demonstrates the new pattern for GET endpoints"
)
@handle_errors(ErrorCodes.UNIT_GET_NOT_FOUND, ENTITY_NAME)
async def get_example_new_pattern(
    entity_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "READ", ErrorCodes.UNIT_GET_NOT_FOUND, ENTITY_NAME))
):
    """
    GET endpoint with new pattern.
    """
    # Your business logic here
    # entity = await example_service.get(entity_id)

    # Example: simulate not found
    if entity_id == "not-found":
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"{ENTITY_NAME} not found")

    entity = {
        "_id": entity_id,
        "name": "Example Entity"
    }

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_success(
            data=entity,
            message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
        )
    )


# =============================================================================
# EXAMPLE 3: UPDATE Endpoint - New Pattern
# =============================================================================

@router.put(
    "/update/{entity_id}",
    summary="Update example (NEW PATTERN)",
    description="Demonstrates the new pattern for UPDATE endpoints"
)
@handle_errors(ErrorCodes.UNIT_UPDATE_FAILED, ENTITY_NAME)
@log_operation(LogCodes.UNIT_UPDATED, ["_id"])
async def update_example_new_pattern(
    entity_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "UPDATE", ErrorCodes.UNIT_UPDATE_FAILED, ENTITY_NAME))
):
    """
    UPDATE endpoint with new pattern.
    """
    client_ip = request.state.client_ip

    # Your business logic here
    # updated = await example_service.update(entity_id, data, current_user.id, client_ip)

    updated = {
        "_id": entity_id,
        "name": "Updated Entity",
        "updatedBy": current_user.id,
        "updatedIp": client_ip
    }

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_success(
            data=updated,
            message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
        )
    )


# =============================================================================
# EXAMPLE 4: DELETE Endpoint - New Pattern
# =============================================================================

@router.delete(
    "/delete/{entity_id}",
    summary="Delete example (NEW PATTERN)",
    description="Demonstrates the new pattern for DELETE endpoints"
)
@handle_errors(ErrorCodes.UNIT_DELETE_FAILED, ENTITY_NAME)
@log_operation(LogCodes.UNIT_DELETED)
async def delete_example_new_pattern(
    entity_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "DELETE", ErrorCodes.UNIT_DELETE_FAILED, ENTITY_NAME))
):
    """
    DELETE endpoint with new pattern.
    """
    client_ip = request.state.client_ip

    # Your business logic here
    # await example_service.delete(entity_id, current_user.id, client_ip)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_success(
            data=None,
            message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
        )
    )


# =============================================================================
# EXAMPLE 5: LIST Endpoint - New Pattern
# =============================================================================

@router.get(
    "/list",
    summary="List examples (NEW PATTERN)",
    description="Demonstrates the new pattern for LIST endpoints"
)
@handle_errors(ErrorCodes.UNIT_LIST_FAILED, ENTITY_NAME)
async def list_examples_new_pattern(
    request: Request,
    page: int = 1,
    page_size: int = 10,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "READ", ErrorCodes.UNIT_LIST_FAILED, ENTITY_NAME))
):
    """
    LIST endpoint with new pattern.
    """
    # Your business logic here
    # items, total = await example_service.list(page=page, page_size=page_size)

    items = [
        {"_id": "1", "name": "Example 1"},
        {"_id": "2", "name": "Example 2"},
    ]
    total = 25

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=api_paginated(
            data=items,
            total=total,
            page=page,
            page_size=page_size,
            message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
        )
    )


# =============================================================================
# COMPARISON: Old Pattern vs New Pattern
# =============================================================================
"""
OLD PATTERN (80+ lines):
========================

@router.post("/create")
async def create_unit_endpoint(
    unit: UnitCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    try:
        # RBAC: Check CREATE permission (15 lines)
        has_permission = await check_job_permission(request, JOB_NAME, "CREATE")
        if not has_permission:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_CREATE_FAILED,
                parameters={"errorMessage": "Permission denied"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or PermissionMessages.format(...)
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content=ResponseBuilder.forbidden(message=error_message, error_code=ErrorCodes.UNIT_CREATE_FAILED)
            )

        # Business logic (5 lines)
        client_ip = get_client_ip(request)
        created = await create_unit(unit, current_user.id, client_ip)

        # Transaction logging (10 lines)
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_CREATED,
            json_values={"unitId": created.get("_id"), "name": created.get("name")},
            level="info"
        )

        # Success response (5 lines)
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_success(data=created, message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME))
        )

    # Exception handling (45+ lines)
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"name": unit.name, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(status_code=e.status_code, content=ResponseBuilder.error(...))

    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"name": unit.name, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(status_code=400, content=ResponseBuilder.bad_request(...))

    except Exception as e:
        logger.exception(f"Error creating unit")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_CREATE_FAILED,
            parameters={"name": unit.name},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(status_code=500, content=ResponseBuilder.server_error(...))


NEW PATTERN (15 lines):
=======================

@router.post("/create")
@handle_errors(ErrorCodes.UNIT_CREATE_FAILED, ENTITY_NAME)
@log_operation(LogCodes.UNIT_CREATED, ["_id", "name"])
async def create_unit_endpoint(
    unit: UnitCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    _: bool = Depends(PermissionChecker(JOB_NAME, "CREATE", ErrorCodes.UNIT_CREATE_FAILED, ENTITY_NAME))
):
    client_ip = request.state.client_ip
    created = await create_unit(unit, current_user.id, client_ip)

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=api_success(data=created, message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME))
    )


CODE REDUCTION: ~80% per endpoint!
TOTAL ACROSS 175 ENDPOINTS: ~12,000 lines → ~2,500 lines
"""
