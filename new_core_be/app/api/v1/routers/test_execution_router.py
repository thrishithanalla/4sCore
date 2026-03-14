"""
TestExecution API (v1).
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_database
from app.api.v1.schemas.test_execution_schema import (
    TestExecutionCreateSchema,
)
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.api.v1.services.test_execution_service import (
    create_test_execution,
    get_test_execution_by_id,
    delete_test_execution,
    list_test_executions,
)
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ErrorCodes, ModulePrefixes
from app.constants.error_codes import ErrorCodes as CentralizedErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/test-execution", tags=["test-execution"])

# Job name for RBAC permission checks
JOB_NAME = Jobs.TEST_EXECUTIONS

# Module configuration
MODULE_PREFIX = ModulePrefixes.TEST_EXECUTIONS
ENTITY_NAME = "Test Execution"
ENTITY_NAME_PLURAL = "Test Executions"


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new test execution",
    description="Creates a new test execution record to track test run results."
)
async def create_test_execution_endpoint(
    payload: TestExecutionCreateSchema,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Create a new test execution record.

    This endpoint creates a test execution entry that records the result
    of running a test case against the system.

    **Request Body (TestExecutionCreateSchema):**
    - `testMasterId` (required): FK to test_master collection
    - `result` (required): Test result (PASS/FAIL)
    - `executionTime` (optional): Time taken to execute the test
    - `logs` (optional): Execution logs or output
    - `errorMessage` (optional): Error message if test failed

    **Response:**
    - `success`: true on success
    - `code`: 201
    - `message`: "Test Execution created successfully"
    - `data`: Created test execution object

    **Error Responses:**
    - 400: Validation error or user ID not found
    - 403: Permission denied (CREATE permission required)
    - 500: Internal server error

    **Side Effects:**
    - Logs transaction with TEST_EXECUTION_CREATED code
    - Records createdIp from request
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

        created = await create_test_execution(
            db, payload,
            created_by=current_user.id,
            created_ip=created_ip
        )

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.TEST_EXECUTION_CREATED,
            json_values={
                "testExecutionId": str(created.id) if hasattr(created, 'id') else "",
                "testMasterId": str(created.testMasterId) if hasattr(created, 'testMasterId') else "",
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
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_EXEC_CREATE_FAILED,
            parameters={"errorMessage": str(e.detail) if isinstance(e.detail, str) else e.detail.get("message", str(e.detail))},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_EXEC_CREATE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("create_test_execution_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_EXEC_CREATE_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_EXEC_CREATE_FAILED
            )
        )


@router.get(
    "/list",
    summary="List all test executions",
    description="Retrieves all test execution records with optional pagination and filters."
)
async def list_test_executions_endpoint(
    request: Request,
    test_master_id: Optional[str] = Query(None, description="Filter by TestMaster ID"),
    result: Optional[str] = Query(None, description="Filter by result (PASS/FAIL)"),
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    pageSize: Optional[int] = Query(None, ge=1, le=200, description="Number of records per page."),
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    List all test executions with optional pagination and filters.

    This endpoint retrieves test execution records with support for
    filtering by test master and result status.

    **Query Parameters:**
    - `test_master_id` (optional): Filter by TestMaster ID
    - `result` (optional): Filter by result status (PASS/FAIL)
    - `include_deleted` (optional): Include soft-deleted records (default: false)
    - `page` (optional): Page number starting from 1
    - `pageSize` (optional): Items per page (1-200, default: 20)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Test Execution list fetched successfully"
    - `data`: Array of test execution objects
    - `pagination`: Pagination metadata when page is provided

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error
    """
    try:

        data, total = await list_test_executions(
            db=db,
            test_master_id=test_master_id,
            result=result,
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
            error_code=CentralizedErrorCodes.TEST_EXEC_LIST_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_EXEC_LIST_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("list_test_executions_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_EXEC_LIST_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_EXEC_LIST_FAILED
            )
        )


@router.get(
    "/get/{id}",
    summary="Get test execution by ID",
    description="Retrieves a single test execution record by its MongoDB ObjectId."
)
async def get_test_execution_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Get a test execution record by ID.

    This endpoint retrieves a specific test execution record with all
    its details including result, logs, and execution time.

    **Path Parameters:**
    - `id` (required): MongoDB ObjectId of the test execution

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Test Execution fetched successfully"
    - `data`: Test execution object

    **Error Responses:**
    - 400: Invalid ID format
    - 403: Permission denied (READ permission required)
    - 404: Test execution not found
    - 500: Internal server error
    """
    try:


        doc = await get_test_execution_by_id(db, id)
        if not doc:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.TEST_EXEC_GET_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.TEST_EXEC_GET_NOT_FOUND
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
            error_code=CentralizedErrorCodes.TEST_EXEC_GET_NOT_FOUND,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_EXEC_GET_NOT_FOUND,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("get_test_execution_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_EXEC_GET_NOT_FOUND,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_EXEC_GET_NOT_FOUND
            )
        )


@router.delete(
    "/delete/{id}",
    summary="Soft delete a test execution",
    description="Performs a soft delete on a test execution record by setting isDelete=True."
)
async def delete_test_execution_endpoint(
    id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: TokenDataSchema = Depends(get_current_user),
):
    """
    Soft delete a test execution record.

    This endpoint performs a soft delete on a test execution record.
    The record remains in the database but is excluded from normal queries.

    **Path Parameters:**
    - `id` (required): MongoDB ObjectId of the test execution

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Test Execution deleted successfully"

    **Error Responses:**
    - 400: Invalid ID format
    - 403: Permission denied (DELETE permission required)
    - 404: Test execution not found or already deleted
    - 500: Internal server error

    **Side Effects:**
    - Sets isDelete=True
    - Logs transaction with TEST_EXECUTION_DELETED code
    - Records deletedIp from request
    """
    try:


        # Get client IP using centralized helper
        deleted_ip = get_client_ip(request)
        ok = await delete_test_execution(db, id, deleted_by=current_user.id, deleted_ip=deleted_ip)

        if not ok:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.TEST_EXEC_DELETE_NOT_FOUND,
                parameters={"errorMessage": ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.format(ErrorMessages.NOT_FOUND, ENTITY_NAME)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.TEST_EXEC_DELETE_NOT_FOUND
                )
            )

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.TEST_EXECUTION_DELETED,
            json_values={
                "testExecutionId": id,
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
            error_code=CentralizedErrorCodes.TEST_EXEC_DELETE_FAILED,
            parameters={"errorMessage": str(e.detail)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
        return JSONResponse(
            status_code=e.status_code,
            content=ResponseBuilder.error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_EXEC_DELETE_FAILED,
                code=e.status_code
            )
        )
    except Exception as exc:
        logger.exception("delete_test_execution_endpoint failed")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.TEST_EXEC_DELETE_FAILED,
            parameters={"errorMessage": str(exc)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.TEST_EXEC_DELETE_FAILED
            )
        )
