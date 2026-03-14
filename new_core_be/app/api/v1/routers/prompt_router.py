"""
Prompt Router
Provides API endpoints for Prompt management
Routes: /api/v1/prompts
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.schemas.prompt_schema import (
    PromptCreateSchema,
    PromptUpdateSchema,
    PromptResponseSchema,
    PromptSearchSchema,
    PromptBulkCreateSchema,
    PromptBulkCreateResponseSchema,
)
from app.api.v1.services.prompt_service import (
    create_prompt,
    update_prompt,
    soft_delete_prompt,
    restore_prompt,
    get_prompt_by_id,
    list_prompts,
)
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import ResponseBuilder, api_success, api_paginated
from app.constants.jobs import Jobs
from app.constants.api_constants import ErrorMessages, SuccessMessages, PermissionMessages, ErrorCodes, ModulePrefixes
from app.constants.error_codes import ErrorCodes as CentralizedErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.constants.log_codes import LogCodes
from app.api.v1.services.log_logger import log_transaction
from app.api.v1.utils.request_helpers import get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/prompts",
    tags=["prompts"],
    responses={
        401: {"description": "Unauthorized - Invalid or missing authentication token"},
        403: {"description": "Forbidden - Insufficient permissions for the requested operation"},
        500: {"description": "Internal Server Error - Unexpected error occurred"}
    }
)

# Job name for RBAC permission checks (using centralized constant)
JOB_NAME = Jobs.PROMPT_MASTER

# Module configuration
MODULE_PREFIX = ModulePrefixes.PROMPTS
ENTITY_NAME = "Prompt"
ENTITY_NAME_PLURAL = "Prompts"


# ============================================================================
# CRUD Operations
# ============================================================================

@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new prompt",
    description="Creates a new prompt entry in the system with the provided configuration details."
)
async def create_prompt_endpoint(
    prompt: PromptCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Create a new prompt entry in the system.

    This endpoint allows authorized users to create a new prompt configuration
    that can be used for AI interactions. The prompt name must be unique within
    its type category.

    Request Body (PromptCreateSchema):
    ----------------------------------
    Required fields:
        - type (str): Prompt type/category for classification
        - name (str): Unique prompt name within the specified type
        - aiRole (str): Defines the AI's purpose, persona, or behavior
        - systemRole (str): Describes the system's expected actions and context
        - objective (str): The main goal or function of this prompt

    Optional fields:
        - iconPath (str): Path to the icon asset for UI display
        - tech (str): Technology or framework this prompt is designed for
        - taskInstructions (str): Step-by-step instructions for task execution
        - taskInput (str): Description of required input parameters
        - taskOutputFormat (str): Expected structure/format of the output
        - taskExample (str): Sample scenario demonstrating prompt usage
        - llm (str): Target LLM model identifier (e.g., "gpt-4", "claude-3")
        - settingsJson (dict): Runtime configuration variables in JSON format

    Response Structure:
    -------------------
    Success (201 Created):
        {
            "success": true,
            "message": "Prompt created successfully",
            "data": {
                "_id": "prompt_id",
                "type": "...",
                "name": "...",
                ...created prompt fields...
            }
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid input data or validation failure
        - Error Code: PROMPT_CREATE_FAILED
    - 403 Forbidden: User lacks CREATE permission for prompts
        - Error Code: PRPT_PERMISSION_DENIED
    - 409 Conflict: Prompt with same name already exists in the type
        - Error Code: PROMPT_CREATE_DUPLICATE
    - 500 Internal Server Error: Unexpected server error
        - Error Code: PROMPT_CREATE_FAILED

    Side Effects:
    -------------
    - Records client IP address (createdIp field)
    - Sets createdBy to current user ID
    - Sets createdAt to current timestamp
    - Logs transaction with code PROMPT_CREATED on success
    - Logs error details on failure

    Authorization:
    --------------
    Requires valid JWT token and CREATE permission on PROMPT_MASTER job.
    """
    try:
        

        created = await create_prompt(prompt, current_user.id, request)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.PROMPT_CREATED,
            json_values={
                "promptId": created.get("_id", ""),
                "type": created.get("type", ""),
                "name": created.get("name", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_success(
                data=created,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_409_CONFLICT:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_CREATE_DUPLICATE,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_CREATE_DUPLICATE
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_CREATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error creating {ENTITY_NAME.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_CREATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_CREATE_FAILED
            )
        )


@router.post(
    "/bulk-create",
    response_model=PromptBulkCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create multiple prompts",
    description="Creates multiple prompt entries in a single request with individual success/failure tracking."
)
async def bulk_create_prompt_endpoint(
    payload: PromptBulkCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Bulk create multiple prompts in a single request.

    This endpoint allows creating multiple prompts at once. Each prompt is
    processed individually, meaning failures for some items will not prevent
    other items from being created successfully.

    Request Body (PromptBulkCreateSchema):
    --------------------------------------
    Required fields:
        - items (list[PromptCreateSchema]): Array of prompt objects to create
            Each item follows the same schema as single prompt creation:
            - type (str, required): Prompt type/category
            - name (str, required): Unique prompt name within type
            - aiRole (str, required): AI's purpose or behavior
            - systemRole (str, required): System's expected actions
            - objective (str, required): Main goal or function
            - iconPath (str, optional): Icon asset path
            - tech (str, optional): Technology/framework used
            - taskInstructions (str, optional): Task execution steps
            - taskInput (str, optional): Required inputs
            - taskOutputFormat (str, optional): Expected output structure
            - taskExample (str, optional): Sample scenario
            - llm (str, optional): LLM model identifier
            - settingsJson (dict, optional): Runtime variables in JSON format

    Response Structure:
    -------------------
    Success (201 Created):
        {
            "success": [...created prompt objects...],
            "failed": [
                {
                    "index": 0,
                    "name": "prompt_name",
                    "type": "prompt_type",
                    "errors": "Error message describing the failure"
                }
            ],
            "totalSuccess": 5,
            "totalFailed": 2
        }

    Error Responses:
    ----------------
    - 403 Forbidden: User lacks CREATE permission for prompts
        - Error Code: PRPT_PERMISSION_DENIED

    Note: Individual item failures are returned in the 'failed' array rather
    than causing the entire request to fail.

    Side Effects:
    -------------
    - Records client IP address for each created prompt (createdIp field)
    - Sets createdBy to current user ID for each prompt
    - Sets createdAt to current timestamp for each prompt
    - Logs each individual creation attempt

    Authorization:
    --------------
    Requires valid JWT token and CREATE permission on PROMPT_MASTER job.
    """
    

    success_list = []
    failed_list = []

    # Get client IP using centralized helper
    client_ip = get_client_ip(request)

    for index, item in enumerate(payload.items):
        try:
            created = await create_prompt(item, current_user.id, request, created_ip=client_ip)
            success_list.append(created)
        except HTTPException as he:
            failed_list.append({
                "index": index,
                "name": item.name,
                "type": item.type,
                "errors": str(he.detail)
            })
        except ValueError as ve:
            failed_list.append({
                "index": index,
                "name": item.name,
                "type": item.type,
                "errors": str(ve)
            })
        except Exception as exc:
            logger.exception(f"bulk_create_prompt failed for item {index}")
            failed_list.append({
                "index": index,
                "name": item.name,
                "type": item.type,
                "errors": "Internal server error"
            })

    return PromptBulkCreateResponseSchema(
        success=success_list,
        failed=failed_list,
        totalSuccess=len(success_list),
        totalFailed=len(failed_list)
    )


@router.put(
    "/update/{prompt_id}",
    summary="Update an existing prompt",
    description="Updates an existing prompt entry with the provided fields. Only non-null fields will be updated."
)
async def update_prompt_endpoint(
    prompt_id: str,
    prompt_update: PromptUpdateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Update an existing prompt entry.

    This endpoint allows authorized users to modify an existing prompt's
    configuration. Only the fields provided in the request body will be
    updated; other fields remain unchanged.

    Path Parameters:
    ----------------
    - prompt_id (str, required): The unique identifier of the prompt to update

    Request Body (PromptUpdateSchema):
    ----------------------------------
    All fields are optional - only provided fields will be updated:
        - type (str): Prompt type/category for classification
        - name (str): Unique prompt name within the specified type
        - aiRole (str): Defines the AI's purpose, persona, or behavior
        - systemRole (str): Describes the system's expected actions and context
        - objective (str): The main goal or function of this prompt
        - iconPath (str): Path to the icon asset for UI display
        - tech (str): Technology or framework this prompt is designed for
        - taskInstructions (str): Step-by-step instructions for task execution
        - taskInput (str): Description of required input parameters
        - taskOutputFormat (str): Expected structure/format of the output
        - taskExample (str): Sample scenario demonstrating prompt usage
        - llm (str): Target LLM model identifier
        - settingsJson (dict): Runtime configuration variables in JSON format
        - isActive (bool): Whether the prompt is active

    Response Structure:
    -------------------
    Success (200 OK):
        {
            "success": true,
            "message": "Prompt updated successfully",
            "data": {
                "_id": "prompt_id",
                ...updated prompt fields...
            }
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid input data or validation failure
        - Error Code: PROMPT_UPDATE_FAILED
    - 403 Forbidden: User lacks UPDATE permission for prompts
        - Error Code: PRPT_PERMISSION_DENIED
    - 404 Not Found: Prompt with specified ID does not exist
        - Error Code: PROMPT_UPDATE_NOT_FOUND
    - 409 Conflict: Updated name conflicts with existing prompt in same type
        - Error Code: PROMPT_CREATE_DUPLICATE
    - 500 Internal Server Error: Unexpected server error
        - Error Code: PROMPT_UPDATE_FAILED

    Side Effects:
    -------------
    - Records client IP address (updatedIp field)
    - Sets updatedBy to current user ID
    - Sets updatedAt to current timestamp
    - Logs transaction with code PROMPT_UPDATED on success
    - Logs error details on failure

    Authorization:
    --------------
    Requires valid JWT token and UPDATE permission on PROMPT_MASTER job.
    """
    try:
        
        client_ip = get_client_ip(request)
        updated = await update_prompt(prompt_id, prompt_update, current_user.id, request, updated_ip=client_ip)

        # Log successful update
        await log_transaction(
            request=request,
            log_code=LogCodes.PROMPT_UPDATED,
            json_values={
                "promptId": prompt_id,
                "updatedBy": current_user.id
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=updated,
                message=SuccessMessages.format(SuccessMessages.UPDATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_404_NOT_FOUND:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_UPDATE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_UPDATE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_409_CONFLICT:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_CREATE_DUPLICATE,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content=ResponseBuilder.conflict(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_CREATE_DUPLICATE
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_UPDATE_FAILED,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_UPDATE_FAILED
                )
            )
        raise
    except ValueError as e:
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or str(e)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_UPDATE_FAILED
            )
        )
    except Exception as e:
        logger.exception(f"Error updating {ENTITY_NAME.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_UPDATE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_UPDATE_FAILED
            )
        )


@router.delete(
    "/delete/{prompt_id}",
    summary="Soft delete a prompt",
    description="Performs a soft delete on a prompt by marking it as deleted without removing it from the database."
)
async def delete_prompt_endpoint(
    prompt_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Soft delete a prompt entry.

    This endpoint performs a soft delete operation on the specified prompt.
    The prompt is not physically removed from the database but is marked as
    deleted and inactive. This allows for data recovery through the restore
    endpoint if needed.

    Path Parameters:
    ----------------
    - prompt_id (str, required): The unique identifier of the prompt to delete

    Response Structure:
    -------------------
    Success (200 OK):
        {
            "success": true,
            "message": "Prompt deleted successfully",
            "data": null
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid prompt ID format or operation not allowed
        - Error Code: PROMPT_DELETE_FAILED
    - 403 Forbidden: User lacks DELETE permission for prompts
        - Error Code: PRPT_PERMISSION_DENIED
    - 404 Not Found: Prompt with specified ID does not exist or already deleted
        - Error Code: PROMPT_DELETE_NOT_FOUND
    - 500 Internal Server Error: Unexpected server error
        - Error Code: PROMPT_DELETE_FAILED

    Side Effects:
    -------------
    - Sets isActive to false
    - Sets isDelete to true
    - Records client IP address (deletedIp field)
    - Sets deletedBy to current user ID
    - Sets deletedAt to current timestamp
    - Logs transaction with code PROMPT_DELETED on success
    - Logs error details on failure

    Authorization:
    --------------
    Requires valid JWT token and DELETE permission on PROMPT_MASTER job.

    Note:
    -----
    This is a soft delete operation. The prompt can be restored using the
    /restore/{prompt_id} endpoint.
    """
    try:


        await soft_delete_prompt(prompt_id, current_user.id, request)

        # Log successful deletion
        await log_transaction(
            request=request,
            log_code=LogCodes.PROMPT_DELETED,
            json_values={
                "promptId": prompt_id,
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
        if e.status_code == status.HTTP_404_NOT_FOUND:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_DELETE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_DELETE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_DELETE_FAILED,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_DELETE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error deleting {ENTITY_NAME.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_DELETE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_DELETE_FAILED
            )
        )


@router.patch(
    "/restore/{prompt_id}",
    summary="Restore a soft-deleted prompt",
    description="Restores a previously soft-deleted prompt by marking it as active again."
)
async def restore_prompt_endpoint(
    prompt_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Restore a soft-deleted prompt entry.

    This endpoint restores a prompt that was previously soft-deleted. The
    prompt will be marked as active again and will appear in normal listing
    queries.

    Path Parameters:
    ----------------
    - prompt_id (str, required): The unique identifier of the prompt to restore

    Response Structure:
    -------------------
    Success (200 OK):
        {
            "success": true,
            "message": "Prompt restored successfully",
            "data": null
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid prompt ID format or prompt is not in deleted state
        - Error Code: PROMPT_RESTORE_FAILED
    - 403 Forbidden: User lacks UPDATE permission for prompts
        - Error Code: PRPT_PERMISSION_DENIED
    - 404 Not Found: Prompt with specified ID does not exist
        - Error Code: PROMPT_RESTORE_NOT_FOUND
    - 500 Internal Server Error: Unexpected server error
        - Error Code: PROMPT_RESTORE_FAILED

    Side Effects:
    -------------
    - Sets isActive to true
    - Sets isDelete to false
    - Records client IP address (updatedIp field)
    - Sets updatedBy to current user ID
    - Sets updatedAt to current timestamp
    - Logs transaction with code PROMPT_RESTORED on success
    - Logs error details on failure

    Authorization:
    --------------
    Requires valid JWT token and UPDATE permission on PROMPT_MASTER job.
    (Restore is considered an update operation for permission purposes)

    Note:
    -----
    This operation is the inverse of soft delete. Only prompts that have
    been soft-deleted can be restored.
    """
    try:


        await restore_prompt(prompt_id, current_user.id, request)

        # Log successful restore
        await log_transaction(
            request=request,
            log_code=LogCodes.PROMPT_RESTORED,
            json_values={
                "promptId": prompt_id,
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
        if e.status_code == status.HTTP_404_NOT_FOUND:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_RESTORE_NOT_FOUND,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_RESTORE_NOT_FOUND
                )
            )
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_RESTORE_FAILED,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_RESTORE_FAILED
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error restoring {ENTITY_NAME.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_RESTORE_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_RESTORE_FAILED
            )
        )


@router.get(
    "/get/{prompt_id}",
    summary="Get a prompt by ID",
    description="Retrieves a single prompt entry by its unique identifier."
)
async def get_prompt_endpoint(
    prompt_id: str,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get a single prompt by its ID.

    This endpoint retrieves the complete details of a specific prompt
    identified by its unique ID.

    Path Parameters:
    ----------------
    - prompt_id (str, required): The unique identifier of the prompt to retrieve

    Response Structure:
    -------------------
    Success (200 OK):
        {
            "success": true,
            "message": "Prompt fetched successfully",
            "data": {
                "_id": "prompt_id",
                "type": "...",
                "name": "...",
                "aiRole": "...",
                "systemRole": "...",
                "objective": "...",
                "iconPath": "...",
                "tech": "...",
                "taskInstructions": "...",
                "taskInput": "...",
                "taskOutputFormat": "...",
                "taskExample": "...",
                "llm": "...",
                "settingsJson": {...},
                "isActive": true,
                "isDelete": false,
                "createdAt": "2024-01-01T00:00:00Z",
                "createdBy": "user_id",
                "createdIp": "192.168.1.1",
                "updatedAt": "2024-01-01T00:00:00Z",
                "updatedBy": "user_id",
                "updatedIp": "192.168.1.1"
            }
        }

    Error Responses:
    ----------------
    - 400 Bad Request: Invalid prompt ID format
        - Error Code: PROMPT_GET_NOT_FOUND
    - 403 Forbidden: User lacks READ permission for prompts
        - Error Code: PRPT_PERMISSION_DENIED
    - 404 Not Found: Prompt with specified ID does not exist
        - Error Code: PROMPT_GET_NOT_FOUND
    - 500 Internal Server Error: Unexpected server error
        - Error Code: PROMPT_GET_NOT_FOUND

    Side Effects:
    -------------
    - Logs error details on failure

    Authorization:
    --------------
    Requires valid JWT token and READ permission on PROMPT_MASTER job.
    """
    try:


        prompt = await get_prompt_by_id(prompt_id, request)

        if not prompt:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_GET_NOT_FOUND,
                parameters={"errorMessage": f"{ENTITY_NAME} not found"},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or f"{ENTITY_NAME} not found"
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_GET_NOT_FOUND
                )
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=prompt,
                message=SuccessMessages.format(SuccessMessages.FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        if e.status_code == status.HTTP_400_BAD_REQUEST:
            error_log = await log_error(
                request=request,
                error_code=CentralizedErrorCodes.PROMPT_GET_NOT_FOUND,
                parameters={"errorMessage": str(e.detail)},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or str(e.detail)
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=CentralizedErrorCodes.PROMPT_GET_NOT_FOUND
                )
            )
        raise
    except Exception as e:
        logger.exception(f"Error fetching {ENTITY_NAME.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_GET_NOT_FOUND,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_GET_NOT_FOUND
            )
        )


@router.get(
    "/list",
    summary="List all prompts",
    description="Retrieves a list of all prompts with optional filtering, search, and pagination support."
)
async def list_prompts_endpoint(
    request: Request,
    include_deleted: bool = Query(False, description="Include soft-deleted records"),
    search: Optional[str] = Query(None, description="Search by name, type, aiRole, or llm"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-indexed). If not provided, returns all records."),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Number of records per page. Required when page is provided."),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all prompts with optional pagination and search.

    This endpoint retrieves a list of prompts with support for pagination,
    search filtering, and optional inclusion of soft-deleted records.

    Query Parameters:
    -----------------
    - include_deleted (bool, optional, default=false):
        When true, includes soft-deleted prompts in the results.
        When false, only active (non-deleted) prompts are returned.

    - search (str, optional):
        Case-insensitive search string that filters prompts by matching
        against the following fields:
        - name
        - type
        - aiRole
        - llm

    - page (int, optional, min=1):
        Page number for paginated results (1-indexed).
        If not provided, all matching records are returned without pagination.

    - page_size (int, optional, min=1, max=100):
        Number of records to return per page.
        Required when 'page' parameter is provided.

    Response Structure:
    -------------------
    Success without pagination (200 OK):
        {
            "success": true,
            "message": "Prompt list fetched successfully",
            "data": [
                {
                    "_id": "prompt_id",
                    "type": "...",
                    "name": "...",
                    ...other prompt fields...
                },
                ...
            ]
        }

    Success with pagination (200 OK):
        {
            "success": true,
            "message": "Prompt list fetched successfully",
            "data": [...prompt objects...],
            "pagination": {
                "page": 1,
                "pageSize": 10,
                "total": 100,
                "totalPages": 10
            }
        }

    Error Responses:
    ----------------
    - 403 Forbidden: User lacks READ permission for prompts
        - Error Code: PRPT_PERMISSION_DENIED
    - 500 Internal Server Error: Unexpected server error
        - Error Code: PROMPT_LIST_FAILED

    Side Effects:
    -------------
    - Logs error details on failure

    Authorization:
    --------------
    Requires valid JWT token and READ permission on PROMPT_MASTER job.

    Examples:
    ---------
    - Get all prompts: GET /api/v1/prompts/list
    - Get with search: GET /api/v1/prompts/list?search=code
    - Get page 1: GET /api/v1/prompts/list?page=1&page_size=20
    - Include deleted: GET /api/v1/prompts/list?include_deleted=true
    """
    try:


        prompts_list, total = await list_prompts(
            include_deleted=include_deleted,
            search=search,
            page=page,
            page_size=page_size
        )

        # Use paginated response only when pagination is requested
        if page is not None and page_size is not None:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=api_paginated(
                    data=prompts_list,
                    total=total,
                    page=page,
                    page_size=page_size,
                    message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
                )
            )

        # Return simple list response without pagination
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=prompts_list,
                message=SuccessMessages.format(SuccessMessages.LIST_FETCHED, ENTITY_NAME)
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing {ENTITY_NAME_PLURAL.lower()}")
        error_log = await log_error(
            request=request,
            error_code=CentralizedErrorCodes.PROMPT_LIST_FAILED,
            parameters={"errorMessage": str(e)},
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or ErrorMessages.UNEXPECTED_ERROR
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=CentralizedErrorCodes.PROMPT_LIST_FAILED
            )
        )
