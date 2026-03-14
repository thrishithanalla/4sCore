"""
UnitType Router
Provides API endpoints for UnitType management
Routes: /api/v1/unit-types
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from typing import List, Optional
from bson import ObjectId
from pydantic import BaseModel

from app.api.v1.schemas.unit_type_schema import (
    UnitTypeCreateSchema,
    UnitTypeUpdateSchema,
    UnitTypeResponseSchema
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import (
    ResponseBuilder,
    api_success,
    api_created,
    api_paginated
)
from app.constants.api_constants import (
    SuccessMessages,
    ErrorMessages,
    PermissionMessages,
    ModulePrefixes
)
from app.constants.error_codes import ErrorCodes
from app.constants.jobs import Jobs
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.services.unit_type_service import (
    create_unit_type,
    update_unit_type,
    delete_unit_type,
    restore_unit_type,
    get_unit_type,
    list_unit_types
)
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/unit-types", tags=["unit-types"])

# Job name for RBAC permission checks (from centralized constants)
JOB_NAME = Jobs.UNIT_TYPE
MODULE_PREFIX = ModulePrefixes.UNIT_TYPE
ENTITY_NAME = "Unit Type"
ENTITY_NAME_PLURAL = "Unit Types"


class PaginatedUnitTypeResponse(BaseModel):
    """Paginated response model for unit types list"""
    data: List[UnitTypeResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new unit type",
    description="Creates a new unit type record for categorizing organizational units in the hierarchy."
)
async def create_unit_type_endpoint(
    unit_type: UnitTypeCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new unit type record.

    This endpoint creates a unit type entry that categorizes
    organizational units in the hierarchy. Unit types define
    the classification of units within a department.

    **Request Body (UnitTypeCreateSchema):**
    - `name` (required): Unit type name - alphabets, spaces, hyphens, underscores only, min 2 alphabets, max 100 chars
    - `departmentId` (optional): Reference to department ID (FK: department._id)
    - `level` (required): Hierarchy level (integer, minimum 0)

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Unit Type created successfully"
    - `data`: Created unit type object with all fields including:
        - `_id`: Generated unit type ID
        - `name`: Unit type name
        - `departmentId`: Department reference
        - `level`: Hierarchy level
        - `createdBy`: User ID who created
        - `createdAt`: Creation timestamp
        - `createdIp`: Client IP address

    **Error Responses:**
    - 400: Validation error (invalid name format, invalid level)
    - 403: Permission denied (CREATE permission required on UNIT_TYPE job)
    - 409: Duplicate name within department
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with UNIT_TYPE_CREATED code on success
    - Records createdIp from request
    - Logs error with UNIT_TYPE_CREATE_FAILED code on failure
    """
    try:
        

        # Get client IP and set in data
        unit_type_data = unit_type.model_dump()
        client_ip = get_client_ip(request)
        unit_type_data["createdIp"] = client_ip

        result = await create_unit_type(unit_type_data, current_user.id)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_TYPE_CREATED,
            json_values={
                "unitTypeId": result.get("_id", ""),
                "name": result.get("name", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_created(
                data=result,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_CREATE_FAILED,
            parameters={"name": unit_type.name, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_CREATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_CREATE_FAILED,
            parameters={"name": unit_type.name, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_CREATE_FAILED,
            parameters={"name": unit_type.name, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all unit types",
    description="Retrieves a paginated list of unit types with optional filtering and search capabilities."
)
async def get_all_unit_types_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    search: Optional[str] = Query(None, description="Search by name"),
    departmentId: Optional[str] = Query(None, description="Filter by department ID"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all unit types with optional pagination and filters.

    This endpoint retrieves unit types with support for pagination,
    search filtering, and department-based filtering. Results are
    returned in a paginated format when pagination parameters are provided.

    **Query Parameters:**
    - `include_deleted` (optional, default: false): Include soft-deleted records in results
    - `search` (optional): Search filter for unit type name (partial match)
    - `departmentId` (optional): Filter by department ID (must be valid ObjectId)
    - `page` (optional): Page number for pagination (minimum: 1)
    - `page_size` (optional): Number of records per page (minimum: 1, maximum: 1000)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit Type list fetched successfully"
    - `data`: Array of unit type objects, each containing:
        - `_id`: Unit type ID
        - `name`: Unit type name
        - `departmentId`: Department reference
        - `level`: Hierarchy level
        - `department`: Populated department object (if available)
        - `isActive`: Active status flag
        - `isDelete`: Soft delete flag
    - `total`: Total number of matching records
    - `page`: Current page number (if paginated)
    - `page_size`: Records per page (if paginated)
    - `total_pages`: Total number of pages (if paginated)

    **Error Responses:**
    - 400: Invalid department ID format
    - 403: Permission denied (READ permission required on UNIT_TYPE job)
    - 500: Internal server error

    **Side Effects:**
    - Logs error with UNIT_TYPE_LIST_FAILED code on failure
    """
    try:
        

        # Validate departmentId if provided
        if departmentId and not ObjectId.is_valid(departmentId):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_TYPE_LIST_FAILED,
                parameters={"departmentId": departmentId, "errorMessage": "Invalid department ID"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, "department")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_TYPE_LIST_FAILED
                )
            )

        unit_types_list, total = await list_unit_types(
            include_deleted=include_deleted,
            search=search,
            department_id=departmentId,
            page=page,
            page_size=page_size
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=unit_types_list,
                total=total,
                page=page,
                page_size=page_size,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_LIST_FAILED
            )
        )


@router.get(
    "/get/{unit_type_id}",
    summary="Get unit type by ID",
    description="Retrieves a specific unit type record by its unique identifier."
)
async def get_unit_type_endpoint(
    unit_type_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a unit type by ID (includes soft-deleted records).

    This endpoint retrieves a single unit type record by its unique
    identifier. The endpoint returns the record even if it has been
    soft-deleted, allowing for record inspection before restoration.

    **Path Parameters:**
    - `unit_type_id` (required): The unique identifier of the unit type (MongoDB ObjectId format)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit Type fetched successfully"
    - `data`: Unit type object containing:
        - `_id`: Unit type ID
        - `name`: Unit type name
        - `departmentId`: Department reference
        - `level`: Hierarchy level
        - `department`: Populated department object (if available)
        - `createdBy`: User ID who created
        - `createdAt`: Creation timestamp
        - `createdIp`: IP address from creation
        - `updatedBy`: User ID who last updated
        - `updatedAt`: Last update timestamp
        - `updatedIp`: IP address from last update
        - `isActive`: Active status flag
        - `isDelete`: Soft delete flag

    **Error Responses:**
    - 400: Invalid unit type ID format
    - 403: Permission denied (READ permission required on UNIT_TYPE job)
    - 404: Unit type not found
    - 500: Internal server error

    **Side Effects:**
    - Logs error with UNIT_TYPE_GET_NOT_FOUND code on failure
    """
    try:
        

        if not ObjectId.is_valid(unit_type_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_TYPE_GET_NOT_FOUND,
                parameters={"id": unit_type_id, "errorMessage": "Invalid ID format"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_TYPE_GET_NOT_FOUND
                )
            )

        unit_type = await get_unit_type(unit_type_id)

        if not unit_type:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_TYPE_GET_NOT_FOUND,
                parameters={"id": unit_type_id, "errorMessage": "Unit type not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_TYPE_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=unit_type,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_GET_NOT_FOUND,
            parameters={"id": unit_type_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_GET_NOT_FOUND,
            parameters={"id": unit_type_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_GET_NOT_FOUND
            )
        )


@router.put(
    "/update/{unit_type_id}",
    summary="Update a unit type",
    description="Updates an existing unit type record with the provided data."
)
async def update_unit_type_endpoint(
    unit_type_id: str,
    unit_type_update: UnitTypeUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update a unit type record.

    This endpoint updates an existing unit type with the provided data.
    Only fields included in the request body will be updated (partial update).
    The updatedBy and updatedAt fields are automatically set.

    **Path Parameters:**
    - `unit_type_id` (required): The unique identifier of the unit type to update (MongoDB ObjectId format)

    **Request Body (UnitTypeUpdateSchema):**
    - `name` (optional): Unit type name - alphabets, spaces, hyphens, underscores only, min 2 alphabets, max 100 chars
    - `departmentId` (optional): Reference to department ID (FK: department._id)
    - `level` (optional): Hierarchy level (integer, minimum 0)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit Type updated successfully"
    - `data`: Updated unit type object with all fields including:
        - `_id`: Unit type ID
        - `name`: Unit type name
        - `departmentId`: Department reference
        - `level`: Hierarchy level
        - `updatedBy`: User ID who updated
        - `updatedAt`: Update timestamp
        - `updatedIp`: Client IP address

    **Error Responses:**
    - 400: Validation error (invalid name format, invalid level, invalid ID format)
    - 403: Permission denied (UPDATE permission required on UNIT_TYPE job)
    - 404: Unit type not found
    - 409: Duplicate name within department
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with UNIT_TYPE_UPDATED code on success
    - Records updatedIp from request
    - Logs error with UNIT_TYPE_UPDATE_FAILED code on failure
    """
    try:


        if not ObjectId.is_valid(unit_type_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_TYPE_UPDATE_NOT_FOUND,
                parameters={"id": unit_type_id, "errorMessage": "Invalid ID format"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_TYPE_UPDATE_NOT_FOUND
                )
            )

        # Get client IP and set in update data
        update_data = unit_type_update.model_dump(exclude_unset=True)
        client_ip = get_client_ip(request)
        update_data["updatedIp"] = client_ip

        result = await update_unit_type(unit_type_id, update_data, current_user.id)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_TYPE_UPDATED,
            json_values={
                "unitTypeId": unit_type_id,
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=result,
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED,
            parameters={"id": unit_type_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_NOT_FOUND,
            parameters={"id": unit_type_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_UPDATE_NOT_FOUND
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED,
            parameters={"id": unit_type_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{unit_type_id}",
    summary="Delete a unit type",
    description="Soft deletes a unit type record by marking it as deleted without permanent removal."
)
async def delete_unit_type_endpoint(
    unit_type_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a unit type record.

    This endpoint performs a soft delete on a unit type record by setting
    the isDelete flag to true. The record is not permanently removed from
    the database and can be restored using the restore endpoint.

    **Path Parameters:**
    - `unit_type_id` (required): The unique identifier of the unit type to delete (MongoDB ObjectId format)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit Type deleted successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid unit type ID format
    - 403: Permission denied (DELETE permission required on UNIT_TYPE job)
    - 404: Unit type not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete flag to true on the record
    - Sets deletedBy to current user ID
    - Sets deletedAt to current timestamp
    - Records deletedIp from request
    - Logs transaction with UNIT_TYPE_DELETED code on success
    - Logs error with UNIT_TYPE_DELETE_FAILED code on failure
    """
    try:
        

        if not ObjectId.is_valid(unit_type_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_TYPE_DELETE_NOT_FOUND,
                parameters={"id": unit_type_id, "errorMessage": "Invalid ID format"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_TYPE_DELETE_NOT_FOUND
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        await delete_unit_type(unit_type_id, current_user.id, deleted_ip=client_ip)

        # Log successful deleted
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_TYPE_DELETED,
            json_values={
                "unitTypeId": unit_type_id,
                "deletedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=None,
                message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        # HTTPException is already logged by the service with the correct error code
        # Just use the error message directly from the exception detail
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=str(e.detail),
                error_code=ErrorCodes.UNIT_TYPE_DELETE_HAS_REFERENCES if "mapped" in str(e.detail).lower() else ErrorCodes.UNIT_TYPE_DELETE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_DELETE_NOT_FOUND,
            parameters={"id": unit_type_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=ResponseBuilder.not_found(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_DELETE_NOT_FOUND
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_DELETE_FAILED,
            parameters={"id": unit_type_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{unit_type_id}",
    summary="Restore a deleted unit type",
    description="Restores a previously soft-deleted unit type record back to active status."
)
async def restore_unit_type_endpoint(
    unit_type_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted unit type record.

    This endpoint restores a unit type that was previously soft-deleted
    by setting the isDelete flag back to false. The record becomes
    active and visible in normal queries again.

    **Path Parameters:**
    - `unit_type_id` (required): The unique identifier of the unit type to restore (MongoDB ObjectId format)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Unit Type restored successfully"
    - `data`: null

    **Error Responses:**
    - 400: Invalid unit type ID format or unit type is not deleted
    - 403: Permission denied (UPDATE permission required on UNIT_TYPE job)
    - 404: Unit type not found
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete flag to false on the record
    - Clears deletedBy and deletedAt fields
    - Sets restoredBy to current user ID
    - Sets restoredAt to current timestamp
    - Records restoredIp from request
    - Logs transaction with UNIT_TYPE_RESTORED code on success
    - Logs error with UNIT_TYPE_UPDATE_FAILED code on failure
    """
    try:
        
        if not ObjectId.is_valid(unit_type_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_TYPE_UPDATE_NOT_FOUND,
                parameters={"id": unit_type_id, "errorMessage": "Invalid ID format"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_TYPE_UPDATE_NOT_FOUND
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        await restore_unit_type(unit_type_id, current_user.id, restored_ip=client_ip)

        # Log successful restored
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_TYPE_RESTORED,
            json_values={
                "unitTypeId": unit_type_id,
                "restoredBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=None,
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED,
            parameters={"id": unit_type_id, "errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_NOT_FOUND,
            parameters={"id": unit_type_id, "errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_UPDATE_NOT_FOUND
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED,
            parameters={"id": unit_type_id, "errorMessage": str(e)},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_TYPE_UPDATE_FAILED
            )
        )
