"""
Unit Villages Router
Provides API endpoints for Unit-Village mapping management
Routes: /api/v1/unit-villages
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from typing import List, Optional
from bson import ObjectId
from pydantic import BaseModel

from app.api.v1.schemas.unit_villages_schema import (
    UnitVillagesCreateSchema,
    UnitVillagesUpdateSchema,
    UnitVillagesResponseSchema
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
from app.api.v1.services.unit_villages_service import (
    create_unit_village,
    update_unit_village,
    delete_unit_village,
    restore_unit_village,
    get_unit_village,
    list_unit_villages
)
from app.api.v1.services.hierarchy_access_service import HierarchyAccessService
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/unit-villages",
    tags=["unit-villages"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication token"},
        403: {"description": "Forbidden - Insufficient permissions for this operation"},
        500: {"description": "Internal Server Error - Unexpected error occurred"}
    }
)

# Job name for RBAC permission checks (from centralized constants)
JOB_NAME = Jobs.UNIT_VILLAGES
MODULE_PREFIX = ModulePrefixes.UNIT_VILLAGES
ENTITY_NAME = "Unit Village"
ENTITY_NAME_PLURAL = "Unit Villages"


class PaginatedUnitVillagesResponse(BaseModel):
    """Paginated response model for unit-villages list"""
    data: List[UnitVillagesResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new unit-village mapping",
    description="Creates a new mapping between an organizational unit and a village. Requires CREATE permission on UNIT_VILLAGES job."
)
async def create_unit_village_endpoint(
    unit_village: UnitVillagesCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new unit-village mapping.

    This endpoint creates a new association between an organizational unit and a village,
    establishing the administrative relationship between them.

    **Request Body Parameters:**
    - **unitId** (str, required): Reference to organizational unit (FK: unit._id)
    - **mandalId** (str, required): Reference to mandal (FK: mandal._id)
    - **villageName** (str, required): Name of the village (max 200 chars, alphabets/spaces/hyphens only)

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Unit Village created successfully",
        "data": {
            "_id": "string",
            "unitId": "string",
            "mandalId": "string",
            "villageName": "string",
            "createdBy": "string",
            "createdAt": "datetime",
            "createdIp": "string",
            "isActive": true,
            "isDelete": false
        }
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: Invalid input data or validation error
        - Invalid villageName format (must be alphabets, spaces, hyphens only)
        - Invalid unitId or mandalId format
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks CREATE permission on UNIT_VILLAGES job
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address as createdIp
    - Logs transaction with code UNIT_VILLAGES_CREATED on success
    - Logs error with code UNIT_VILLAGE_CREATE_FAILED on failure

    **RBAC Permission Required:** CREATE on UNIT_VILLAGES job
    """
    try:
        

        # Get client IP and set in data
        unit_village_data = unit_village.model_dump()
        client_ip = get_client_ip(request)
        unit_village_data["createdIp"] = client_ip

        result = await create_unit_village(unit_village_data, current_user.id)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_VILLAGES_CREATED,
            json_values={
                "unitVillageId": result.get("_id", ""),
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
            error_code=ErrorCodes.UNIT_VILLAGE_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_CREATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_CREATE_FAILED,
            parameters={},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all unit-village mappings",
    description="Retrieves a paginated list of unit-village mappings with optional filters. Results are filtered based on user's unit hierarchy."
)
async def get_all_unit_villages_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include deleted records"),
    search: Optional[str] = Query(None, description="Search in villageName"),
    unitId: Optional[str] = Query(None, description="Filter by unit ID"),
    mandalId: Optional[str] = Query(None, description="Filter by mandal ID"),
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Records per page"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all unit-village mappings with optional pagination, filters, and hierarchy-based access control.

    Results are automatically filtered based on the user's assigned unit hierarchy:
    - Users can only see village mappings for their own unit and descendant units
    - Village mappings for parent and sibling units are not visible
    - Top-level users (no parent unit) can see all village mappings in their district

    This endpoint retrieves all unit-village associations with support for
    filtering, searching, and pagination. Results include populated unit
    and mandal data for each mapping.

    **Query Parameters:**
    - **include_deleted** (bool, optional): Include soft-deleted records. Default: false
    - **search** (str, optional): Search term to filter by villageName (case-insensitive partial match)
    - **unitId** (str, optional): Filter by specific organizational unit ID
    - **mandalId** (str, optional): Filter by specific mandal ID
    - **page** (int, optional): Page number for pagination (min: 1). If not provided, returns all records
    - **page_size** (int, optional): Number of records per page (min: 1, max: 1000). Required if page is provided

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Unit Village list fetched successfully",
        "data": [...],
        "pagination": {
            "page": 1,
            "pageSize": 10,
            "totalItems": 100,
            "totalPages": 10
        }
    }
    ```

    **Error Responses:**
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks READ permission on UNIT_VILLAGES job
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Logs error with code UNIT_VILLAGE_LIST_FAILED on failure

    **RBAC Permission Required:** READ on UNIT_VILLAGES job
    """
    try:
        # RBAC: Check READ permission
        

        # Get accessible unit IDs based on user's hierarchy
        accessible_unit_ids = await HierarchyAccessService.get_accessible_unit_ids(
            user_unit_id=current_user.unitId,
            district_id=current_user.districtId,
            include_deleted=include_deleted
        )

        mappings_list, total = await list_unit_villages(
            include_deleted=include_deleted,
            search=search,
            unit_id=unitId,
            mandal_id=mandalId,
            page=page,
            page_size=page_size,
            accessible_unit_ids=accessible_unit_ids
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_paginated(
                data=mappings_list,
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
            error_code=ErrorCodes.UNIT_VILLAGE_LIST_FAILED,
            parameters={"search": search, "unitId": unitId, "mandalId": mandalId},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_LIST_FAILED
            )
        )


@router.get(
    "/get/{mapping_id}",
    summary="Get a unit-village mapping by ID",
    description="Retrieves a single unit-village mapping by its ID. Includes soft-deleted records. Requires READ permission on UNIT_VILLAGES job."
)
async def get_unit_village_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a unit-village mapping by ID.

    This endpoint retrieves a specific unit-village mapping by its unique identifier.
    The response includes soft-deleted records, allowing administrators to view
    records that have been logically deleted.

    **Path Parameters:**
    - **mapping_id** (str, required): The unique identifier of the unit-village mapping (MongoDB ObjectId)

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Unit Village fetched successfully",
        "data": {
            "_id": "string",
            "unitId": "string",
            "mandalId": "string",
            "villageName": "string",
            "createdBy": "string",
            "createdAt": "datetime",
            "createdIp": "string",
            "updatedBy": "string",
            "updatedAt": "datetime",
            "updatedIp": "string",
            "isActive": true,
            "isDelete": false,
            "unit": {
                "_id": "string",
                "name": "string",
                "policeReferenceId": "string"
            },
            "mandal": {
                "_id": "string",
                "mandalName": "string",
                "districtId": "string"
            }
        }
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: Invalid mapping_id format (not a valid MongoDB ObjectId)
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks READ permission on UNIT_VILLAGES job
    - **404 Not Found**: Unit-village mapping with the specified ID does not exist
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Logs error with code UNIT_VILLAGE_GET_NOT_FOUND on failure

    **RBAC Permission Required:** READ on UNIT_VILLAGES job
    """
    try:

        if not ObjectId.is_valid(mapping_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_VILLAGE_GET_NOT_FOUND,
                parameters={"errorMessage": "Invalid ID format", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_VILLAGE_GET_NOT_FOUND
                )
            )

        mapping = await get_unit_village(mapping_id)

        if not mapping:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_VILLAGE_GET_NOT_FOUND,
                parameters={"errorMessage": "Unit village mapping not found", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_VILLAGE_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=mapping,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_GET_NOT_FOUND,
            parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_GET_NOT_FOUND,
            parameters={"mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_GET_NOT_FOUND
            )
        )


@router.put(
    "/update/{mapping_id}",
    summary="Update a unit-village mapping",
    description="Updates an existing unit-village mapping. Partial updates are supported. Requires UPDATE permission on UNIT_VILLAGES job."
)
async def update_unit_village_endpoint(
    mapping_id: str,
    unit_village_update: UnitVillagesUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update a unit-village mapping.

    This endpoint updates an existing unit-village mapping with the provided data.
    Partial updates are supported - only include fields that need to be changed.
    The updatedBy and updatedAt fields are automatically set.

    **Path Parameters:**
    - **mapping_id** (str, required): The unique identifier of the unit-village mapping (MongoDB ObjectId)

    **Request Body Parameters:**
    - **unitId** (str, optional): New reference to organizational unit (FK: unit._id)
    - **mandalId** (str, optional): New reference to mandal (FK: mandal._id)
    - **villageName** (str, optional): New name of the village (max 200 chars, alphabets/spaces/hyphens only)

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Unit Village updated successfully",
        "data": {
            "_id": "string",
            "unitId": "string",
            "mandalId": "string",
            "villageName": "string",
            "createdBy": "string",
            "createdAt": "datetime",
            "createdIp": "string",
            "updatedBy": "string",
            "updatedAt": "datetime",
            "updatedIp": "string",
            "isActive": true,
            "isDelete": false
        }
    }
    ```

    **Error Responses:**
    - **400 Bad Request**:
        - Invalid mapping_id format (not a valid MongoDB ObjectId)
        - Invalid villageName format (must be alphabets, spaces, hyphens only)
        - Invalid unitId or mandalId format
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks UPDATE permission on UNIT_VILLAGES job
    - **404 Not Found**: Unit-village mapping with the specified ID does not exist
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address as updatedIp
    - Sets updatedBy to current user ID
    - Sets updatedAt to current timestamp
    - Logs transaction with code UNIT_VILLAGES_UPDATED on success
    - Logs error with code UNIT_VILLAGE_UPDATE_FAILED on failure

    **RBAC Permission Required:** UPDATE on UNIT_VILLAGES job
    """
    try:

        if not ObjectId.is_valid(mapping_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
                parameters={"errorMessage": "Invalid ID format", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED
                )
            )

        # Get client IP and set in update data
        update_data = unit_village_update.model_dump(exclude_unset=True)
        client_ip = get_client_ip(request)
        update_data["updatedIp"] = client_ip

        result = await update_unit_village(mapping_id, update_data, current_user.id)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_VILLAGES_UPDATED,
            json_values={
                "unitVillageId": mapping_id,
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
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_NOT_FOUND if e.status_code == 404 else ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_NOT_FOUND if e.status_code == 404 else ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
            parameters={"mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{mapping_id}",
    summary="Soft delete a unit-village mapping",
    description="Performs a soft delete on a unit-village mapping by setting isDelete=true. Requires DELETE permission on UNIT_VILLAGES job."
)
async def delete_unit_village_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a unit-village mapping.

    This endpoint performs a soft delete on the specified unit-village mapping
    by setting the isDelete flag to true. The record is not physically removed
    from the database and can be restored using the restore endpoint.

    **Path Parameters:**
    - **mapping_id** (str, required): The unique identifier of the unit-village mapping (MongoDB ObjectId)

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Unit Village deleted successfully",
        "data": null
    }
    ```

    **Error Responses:**
    - **400 Bad Request**: Invalid mapping_id format (not a valid MongoDB ObjectId)
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks DELETE permission on UNIT_VILLAGES job
    - **404 Not Found**: Unit-village mapping with the specified ID does not exist or is already deleted
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address as deletedIp
    - Sets deletedBy to current user ID
    - Sets deletedAt to current timestamp
    - Sets isDelete to true
    - Logs transaction with code UNIT_VILLAGES_DELETED on success
    - Logs error with code UNIT_VILLAGE_DELETE_FAILED on failure

    **RBAC Permission Required:** DELETE on UNIT_VILLAGES job

    **Note:** This is a soft delete operation. The record remains in the database
    with isDelete=true and can be restored using the restore endpoint.
    """
    try:
    

        if not ObjectId.is_valid(mapping_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_VILLAGE_DELETE_FAILED,
                parameters={"errorMessage": "Invalid ID format", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_VILLAGE_DELETE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        await delete_unit_village(mapping_id, current_user.id, deleted_ip=client_ip)

        # Log successful deleted
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_VILLAGES_DELETED,
            json_values={
                "unitVillageId": mapping_id,
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
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_DELETE_NOT_FOUND if e.status_code == 404 else ErrorCodes.UNIT_VILLAGE_DELETE_FAILED,
            parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_DELETE_NOT_FOUND if e.status_code == 404 else ErrorCodes.UNIT_VILLAGE_DELETE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_DELETE_NOT_FOUND,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=ResponseBuilder.not_found(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_DELETE_NOT_FOUND
            )
        )
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_DELETE_FAILED,
            parameters={"mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{mapping_id}",
    summary="Restore a soft-deleted unit-village mapping",
    description="Restores a previously soft-deleted unit-village mapping by setting isDelete=false. Requires UPDATE permission on UNIT_VILLAGES job."
)
async def restore_unit_village_endpoint(
    mapping_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted unit-village mapping.

    This endpoint restores a previously soft-deleted unit-village mapping
    by setting the isDelete flag back to false. This reverses the effect
    of the delete operation, making the record active again.

    **Path Parameters:**
    - **mapping_id** (str, required): The unique identifier of the unit-village mapping (MongoDB ObjectId)

    **Response Structure:**
    ```json
    {
        "success": true,
        "message": "Unit Village restored successfully",
        "data": null
    }
    ```

    **Error Responses:**
    - **400 Bad Request**:
        - Invalid mapping_id format (not a valid MongoDB ObjectId)
        - Record is not deleted (cannot restore a non-deleted record)
    - **401 Unauthorized**: Missing or invalid authentication token
    - **403 Forbidden**: User lacks UPDATE permission on UNIT_VILLAGES job
    - **404 Not Found**: Unit-village mapping with the specified ID does not exist
    - **500 Internal Server Error**: Unexpected server error

    **Side Effects:**
    - Records client IP address as restoredIp
    - Sets restoredBy to current user ID
    - Sets restoredAt to current timestamp
    - Sets isDelete to false
    - Logs transaction with code UNIT_VILLAGES_RESTORED on success
    - Logs error with code UNIT_VILLAGE_UPDATE_FAILED on failure

    **RBAC Permission Required:** UPDATE on UNIT_VILLAGES job

    **Note:** This operation requires UPDATE permission as it modifies an existing record.
    Only records that have been soft-deleted (isDelete=true) can be restored.
    """
    try:

        if not ObjectId.is_valid(mapping_id):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
                parameters={"errorMessage": "Invalid ID format", "mappingId": mapping_id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.INVALID_ID, ENTITY_NAME.lower())
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED
                )
            )

        # Get client IP
        client_ip = get_client_ip(request)

        await restore_unit_village(mapping_id, current_user.id, restored_ip=client_ip)

        # Log successful restored
        await log_transaction(
            request=request,
            log_code=LogCodes.UNIT_VILLAGES_RESTORED,
            json_values={
                "unitVillageId": mapping_id,
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
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_NOT_FOUND if e.status_code == 404 else ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or (e.detail if isinstance(e.detail, str) else str(e.detail))
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_NOT_FOUND if e.status_code == 404 else ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
            parameters={"errorMessage": str(e), "mappingId": mapping_id},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED,
            parameters={"mappingId": mapping_id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.UNIT_VILLAGE_UPDATE_FAILED
            )
        )
