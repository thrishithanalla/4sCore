"""
TestMaster API (v1).
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.api.v1.schemas.test_master_schema import (
    TestMasterCreateSchema,
    TestMasterUpdateSchema,
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.api.v1.services.test_master_service import (
    create_test_master,
    get_test_master_by_id,
    update_test_master,
    delete_test_master,
    restore_test_master,
    list_test_masters,
)
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ErrorCodes, ModulePrefixes
from app.constants.error_codes import ErrorCodes as CentralizedErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/test-master", tags=["test-master"])

# Job name for RBAC permission checks
JOB_NAME = Jobs.TEST_MASTER

# Module configuration
MODULE_PREFIX = ModulePrefixes.TEST_MASTER
ENTITY_NAME = "Test Master"
ENTITY_NAME_PLURAL = "Test Masters"


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Test Master",
    description="Creates a new Test Master record with the provided details. Requires CREATE permission for test-master module."
)
async def create_test_master_endpoint(
    payload: TestMasterCreateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Create a new Test Master record.

    This endpoint creates a new Test Master entity in the database with the provided
    module reference, name, and list of questions with expected answers. The name
    must be unique across all Test Master records.

    Request Body (TestMasterCreateSchema):
        - moduleId (str, required): Foreign key reference to Module._id. Cannot be empty.
        - name (str, required): Test name, max 300 characters. Must be unique.
        - questions (List[QuestionSchema], required): List of test questions (minimum 1).
            Each question contains:
            - questionId (str, required): Unique identifier within the test. Cannot be empty.
            - question (str, required): The test question text. Cannot be empty.
            - expectedAnswer (Dict[str, Any], required): Expected answer as JSON object.

    Path Parameters:
        None

    Query Parameters:
        None

    Response (201 Created):
        {
            "success": true,
            "code": 201,
            "message": "Test Master created successfully",
            "data": {
                "_id": "string",
                "moduleId": "string",
                "name": "string",
                "questions": [...],
                "isActive": true,
                "isDelete": false,
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string",
                "module": {...}
            }
        }

    Error Responses:
        - 400 Bad Request: Validation error or user ID not found in token.
            Error codes: TM-AUTH
        - 403 Forbidden: User lacks CREATE permission for test-master module.
            Error codes: TM-PERMISSION_DENIED
        - 409 Conflict: Test Master with the same name already exists.
            Error codes: TEST_MASTER_CREATE_DUPLICATE_NAME
        - 500 Internal Server Error: Unexpected server error during creation.
            Error codes: TEST_MASTER_CREATE_FAILED

    Side Effects:
        - Records client IP address (createdIp) from request headers.
        - Logs successful creation transaction with log code TEST_MASTER_CREATED.
        - Logs errors to centralized error logging system.

    Raises:
        HTTPException: 400 on validation error, 409 on duplicate name, 500 on server error.
    """
    try:


        if not current_user.id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=ErrorMessages.USER_ID_NOT_FOUND,
                    error_code=ErrorCodes.with_prefix(MODULE_PREFIX, ErrorCodes.AUTH)
                )
            )

        # Get client IP using centralized helper
        created_ip = get_client_ip(request)

        created = await create_test_master(
            db, payload,
            created_by=current_user.id,
            created_ip=created_ip
        )

        # Log successful created
        await log_transaction(
            request=request,
            log_code=LogCodes.TEST_MASTER_CREATED,
            json_values={
                "testMasterId": created.get("_id", ""),
                "name": created.get("name", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_success(
                data=created.model_dump(mode="json", by_alias=True),
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME),
                code=201
            )
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_409_CONFLICT:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.TEST_MASTER_CREATE_DUPLICATE_NAME,
                parameters={"errorMessage": str(e.detail) if isinstance(e.detail, str) else e.detail.get("message", str(e.detail))},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=e.status_code,
                content=ResponseBuilder.error(
                    message=error_message,
                    error_code=CentralizedErrorCodes.TEST_MASTER_CREATE_DUPLICATE_NAME,
                    code=e.status_code
                )
            )
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail) if isinstance(e.detail, str) else e.detail.get("message", str(e.detail))},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_CREATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("create_test_master_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_CREATE_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all Test Masters",
    description="Retrieves a list of Test Master records with optional pagination and filtering. Requires READ permission for test-master module."
)
async def list_test_masters_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    pageSize: Optional[int] = Query(None, ge=1, le=200, description="Number of records per page."),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    List Test Masters with optional pagination and filtering.

    This endpoint retrieves a list of Test Master records from the database.
    By default, only non-deleted (active) records are returned. Pagination is
    optional - if page parameter is not provided, all matching records are returned.

    Request Body:
        None

    Path Parameters:
        None

    Query Parameters:
        - include_deleted (bool, optional): Include soft-deleted records in the response.
            Default: false
        - page (int, optional): Page number for pagination (1-indexed, minimum 1).
            If not provided, returns all records without pagination.
        - pageSize (int, optional): Number of records per page (1-200).
            Default: 20 when pagination is enabled.

    Response (200 OK) - Without Pagination:
        {
            "success": true,
            "code": 200,
            "message": "Test Master list fetched successfully",
            "data": [
                {
                    "_id": "string",
                    "moduleId": "string",
                    "name": "string",
                    "questions": [...],
                    "isActive": true,
                    "isDelete": false,
                    "createdBy": "string",
                    "createdAt": "datetime",
                    "module": {...}
                },
                ...
            ]
        }

    Response (200 OK) - With Pagination:
        {
            "success": true,
            "code": 200,
            "message": "Test Master list fetched successfully",
            "data": [...],
            "pagination": {
                "total": 100,
                "page": 1,
                "pageSize": 20,
                "totalPages": 5
            }
        }

    Error Responses:
        - 403 Forbidden: User lacks READ permission for test-master module.
            Error codes: TM-PERMISSION_DENIED
        - 500 Internal Server Error: Unexpected server error during list retrieval.
            Error codes: TEST_MASTER_LIST_FAILED

    Side Effects:
        - Logs errors to centralized error logging system.
    """
    try:

        data, total = await list_test_masters(
            db=db,
            include_deleted=include_deleted,
            page=page,
            page_size=pageSize
        )

        # Convert to dict for response
        data_list = [item.model_dump(mode="json", by_alias=True) for item in data]

        # Use paginated response only when pagination is requested
        if page is not None:
            effective_page_size = pageSize if pageSize is not None else 20
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=api_paginated(
                    data=data_list,
                    total=total,
                    page=page,
                    page_size=effective_page_size,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )

        # Return simple list response without pagination
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=data_list,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("list_test_masters_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_LIST_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_LIST_FAILED
            )
        )


@router.get(
    "/get/{id}",
    summary="Get a Test Master by ID",
    description="Retrieves a single Test Master record by its unique identifier. Requires READ permission for test-master module."
)
async def get_test_master_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get a Test Master by ID.

    This endpoint retrieves a single Test Master record from the database
    using its unique identifier. Returns the complete Test Master object
    including all questions and populated module data.

    Request Body:
        None

    Path Parameters:
        - id (str, required): The unique identifier (_id) of the Test Master to retrieve.

    Query Parameters:
        None

    Response (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Test Master fetched successfully",
            "data": {
                "_id": "string",
                "moduleId": "string",
                "name": "string",
                "questions": [
                    {
                        "questionId": "string",
                        "question": "string",
                        "expectedAnswer": {...}
                    },
                    ...
                ],
                "isActive": true,
                "isDelete": false,
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string",
                "updatedBy": "string",
                "updatedAt": "datetime",
                "updatedIp": "string",
                "module": {...}
            }
        }

    Error Responses:
        - 403 Forbidden: User lacks READ permission for test-master module.
            Error codes: TM-PERMISSION_DENIED
        - 404 Not Found: Test Master with the specified ID does not exist.
            Error codes: TEST_MASTER_GET_NOT_FOUND
        - 500 Internal Server Error: Unexpected server error during retrieval.
            Error codes: TEST_MASTER_GET_NOT_FOUND

    Side Effects:
        - Logs errors to centralized error logging system.
    """
    try:

        doc = await get_test_master_by_id(db, id)
        if not doc:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.TEST_MASTER_GET_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.TEST_MASTER_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=doc.model_dump(mode="json", by_alias=True),
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_GET_NOT_FOUND,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_test_master_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_GET_NOT_FOUND,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_GET_NOT_FOUND
            )
        )


@router.patch(
    "/update/{id}",
    summary="Update a Test Master",
    description="Partially updates an existing Test Master record. Requires UPDATE permission for test-master module."
)
async def update_test_master_endpoint(
    id: str,
    patch: TestMasterUpdateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Update a Test Master record.

    This endpoint performs a partial update (PATCH) on an existing Test Master
    record. Only the fields provided in the request body will be updated.
    The name, if updated, must remain unique across all Test Master records.

    Request Body (TestMasterUpdateSchema):
        - moduleId (str, optional): Foreign key reference to Module._id.
            If provided, cannot be empty.
        - name (str, optional): Test name, max 300 characters.
            If provided, must be unique.
        - questions (List[QuestionSchema], optional): List of test questions (minimum 1).
            Each question contains:
            - questionId (str, required): Unique identifier within the test. Cannot be empty.
            - question (str, required): The test question text. Cannot be empty.
            - expectedAnswer (Dict[str, Any], required): Expected answer as JSON object.
            Note: questionId values must be unique within the questions array.

    Path Parameters:
        - id (str, required): The unique identifier (_id) of the Test Master to update.

    Query Parameters:
        None

    Response (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Test Master updated successfully",
            "data": {
                "_id": "string",
                "moduleId": "string",
                "name": "string",
                "questions": [...],
                "isActive": true,
                "isDelete": false,
                "createdBy": "string",
                "createdAt": "datetime",
                "createdIp": "string",
                "updatedBy": "string",
                "updatedAt": "datetime",
                "updatedIp": "string",
                "module": {...}
            }
        }

    Error Responses:
        - 400 Bad Request: Validation error in request body.
            Error codes: TEST_MASTER_UPDATE_FAILED
        - 403 Forbidden: User lacks UPDATE permission for test-master module.
            Error codes: TM-PERMISSION_DENIED
        - 404 Not Found: Test Master with the specified ID does not exist.
            Error codes: TEST_MASTER_UPDATE_NOT_FOUND
        - 409 Conflict: Updated name conflicts with an existing Test Master.
            Error codes: TEST_MASTER_UPDATE_FAILED
        - 500 Internal Server Error: Unexpected server error during update.
            Error codes: TEST_MASTER_UPDATE_FAILED

    Side Effects:
        - Records client IP address (updatedIp) from request headers.
        - Updates updatedBy and updatedAt audit fields.
        - Logs successful update transaction with log code TEST_MASTER_UPDATED.
        - Logs errors to centralized error logging system.
    """
    try:


        # Get client IP using centralized helper
        updated_ip = get_client_ip(request)

        updated = await update_test_master(
            db, id, patch,
            updated_by=current_user.id,
            updated_ip=updated_ip
        )
        if not updated:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.TEST_MASTER_UPDATE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.TEST_MASTER_UPDATE_NOT_FOUND
                )
            )

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.TEST_MASTER_UPDATED,
            json_values={
                "testMasterId": id,
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=updated.model_dump(mode="json", by_alias=True),
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_UPDATE_FAILED,
            parameters={"errorMessage": str(e.detail) if isinstance(e.detail, str) else str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_UPDATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("update_test_master_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_UPDATE_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{id}",
    summary="Delete a Test Master",
    description="Soft deletes a Test Master record by setting isDelete flag to true. Requires DELETE permission for test-master module."
)
async def delete_test_master_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Soft delete a Test Master record.

    This endpoint performs a soft delete on a Test Master record by setting
    the isDelete flag to true. The record remains in the database and can
    be restored using the restore endpoint. Soft-deleted records are excluded
    from list queries by default.

    Request Body:
        None

    Path Parameters:
        - id (str, required): The unique identifier (_id) of the Test Master to delete.

    Query Parameters:
        None

    Response (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Test Master deleted successfully",
            "data": null
        }

    Error Responses:
        - 403 Forbidden: User lacks DELETE permission for test-master module.
            Error codes: TM-PERMISSION_DENIED
        - 404 Not Found: Test Master with the specified ID does not exist.
            Error codes: TEST_MASTER_DELETE_NOT_FOUND
        - 500 Internal Server Error: Unexpected server error during deletion.
            Error codes: TEST_MASTER_DELETE_FAILED

    Side Effects:
        - Sets isDelete flag to true (soft delete).
        - Records client IP address (deletedIp) from request headers.
        - Updates deletedBy and deletedAt audit fields.
        - Logs successful deletion transaction with log code TEST_MASTER_DELETED.
        - Logs errors to centralized error logging system.

    Note:
        This is a soft delete operation. The record can be restored using
        the POST /restore/{id} endpoint.
    """
    try:


        # Get client IP using centralized helper
        deleted_ip = get_client_ip(request)
        ok = await delete_test_master(db, id, deleted_by=current_user.id, deleted_ip=deleted_ip)

        if not ok:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.TEST_MASTER_DELETE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.TEST_MASTER_DELETE_NOT_FOUND
                )
            )

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.TEST_MASTER_DELETED,
            json_values={
                "testMasterId": id,
                "deletedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                message=SuccessMessages.format(SuccessMessages.DELETED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_DELETE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_DELETE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("delete_test_master_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_DELETE_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_DELETE_FAILED
            )
        )


@router.post(
    "/restore/{id}",
    summary="Restore a deleted Test Master",
    description="Restores a soft-deleted Test Master record by setting isDelete flag to false. Requires UPDATE permission for test-master module."
)
async def restore_test_master_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Restore a soft-deleted Test Master record.

    This endpoint restores a previously soft-deleted Test Master record by
    setting the isDelete flag back to false. The record will then appear
    in list queries again. Only records that have been soft-deleted
    (isDelete=true) can be restored.

    Request Body:
        None

    Path Parameters:
        - id (str, required): The unique identifier (_id) of the Test Master to restore.

    Query Parameters:
        None

    Response (200 OK):
        {
            "success": true,
            "code": 200,
            "message": "Test Master restored successfully",
            "data": null
        }

    Error Responses:
        - 403 Forbidden: User lacks UPDATE permission for test-master module.
            Error codes: TM-PERMISSION_DENIED
        - 404 Not Found: Test Master with the specified ID does not exist or is not deleted.
            Error codes: TEST_MASTER_RESTORE_NOT_FOUND
        - 500 Internal Server Error: Unexpected server error during restoration.
            Error codes: TEST_MASTER_RESTORE_FAILED

    Side Effects:
        - Sets isDelete flag to false (restores the record).
        - Records client IP address (restoredIp) from request headers.
        - Updates restoredBy and restoredAt audit fields.
        - Logs successful restoration transaction with log code TEST_MASTER_RESTORED.
        - Logs errors to centralized error logging system.

    Note:
        This endpoint requires UPDATE permission (not DELETE permission) as
        restoring a record is considered an update operation.
    """
    try:

        # Get client IP using centralized helper
        restored_ip = get_client_ip(request)
        ok = await restore_test_master(db, id, restored_by=current_user.id, restored_ip=restored_ip)

        if not ok:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.TEST_MASTER_RESTORE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_NOT_DELETED, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND_OR_NOT_DELETED, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.TEST_MASTER_RESTORE_NOT_FOUND
                )
            )

        # Log successful restoration
        await log_transaction(
            request=request,
            log_code=LogCodes.TEST_MASTER_RESTORED,
            json_values={
                "testMasterId": id,
                "restoredBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                message=SuccessMessages.format(SuccessMessages.RESTORED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_RESTORE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_RESTORE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("restore_test_master_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_MASTER_RESTORE_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_MASTER_RESTORE_FAILED
            )
        )
