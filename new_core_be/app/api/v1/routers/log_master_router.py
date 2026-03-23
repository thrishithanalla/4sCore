"""
Audit Log Master Router
CRUD operations for audit log master configuration management.
"""
from typing import List, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status, Query, Request
from pydantic import BaseModel, ConfigDict

from app.core.database import get_database
from app.core.constants import Collections
from app.utils.time_utils import get_ist_now
from app.api.v1.schemas.log_master_schema import (
    LogMasterCreateSchema,
    LogMasterResponseSchema,
    LogMasterUpdateSchema,
    LogMasterBulkCreateSchema,
    LogMasterBulkCreateResponseSchema
)
from app.api.v1.schemas.response_schemas import StandardResponse, ValidationErrorResponse, ErrorResponse
from app.utils.response_helpers import success_response, error_response
from app.api.v1.utils.validators import validate_unique_constraint
from app.api.v1.services.error_logger import log_error, log_error_with_exception, get_user_id_from_token, ErrorCodes
from app.api.v1.services.transaction_logger import log_transaction, get_user_info_for_log, get_client_ip as get_client_ip_for_log, LogCodes
from app.core.value_sets import normalize_code

router = APIRouter(prefix="/api/v1/log-master", tags=["log-master"])

JOB_NAME = "LOG_MASTER"


class PaginatedLogMasterResponse(BaseModel):
    """Paginated response model for audit log master list"""
    items: List[LogMasterResponseSchema]
    total: int
    page: int
    page_size: int
    total_pages: int

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "items": [],
                "total": 15,
                "page": 1,
                "page_size": 20,
                "total_pages": 1
            }
        }
    )


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request."""
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def convert_objectid_to_str(document: dict) -> dict:
    """Convert ObjectId fields to strings for JSON serialization"""
    if document and "_id" in document:
        document["_id"] = str(document["_id"])

    for field in ["createdBy", "updatedBy"]:
        if document and field in document and isinstance(document[field], ObjectId):
            document[field] = str(document[field])

    return document


async def validate_value_set_fields(db, data: dict):
    """Validate ValueSet fields against value_sets_master collection."""
    valueset_fields = {
        "action": "Actions",
        "layer": "layer",
        "logtype": "logType",
    }

    for field, vs_key in valueset_fields.items():
        if field in data and data[field] is not None:
            try:
                data[field] = await normalize_code(db, vs_key, data[field])
            except ValueError as e:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=error_response(
                        message=str(e),
                        status_code=422,
                        error_code="ERR.CORE.VALIDATION.INVALID_VALUESET"
                    )
                )


@router.post(
    "/create",
    status_code=status.HTTP_201_CREATED,
    response_model=StandardResponse[LogMasterResponseSchema],
    responses={
        201: {"description": "Audit log master created successfully"},
        422: {"description": "Validation Error", "model": ValidationErrorResponse}
    }
)
async def create_log_master(
    log_master: LogMasterCreateSchema,
    request: Request
):
    """Create a new audit log master configuration"""
    db = get_database()
    log_master_dict = log_master.model_dump()

    try:
        await validate_unique_constraint(
            db,
            Collections.LOG_MASTER,
            {"eventCode": log_master_dict["eventCode"]},
            exclude_id=None
        )
    except HTTPException as e:
        await log_error(
            request=request,
            error_code=ErrorCodes.VALIDATION_DUPLICATE,
            parameters={"field": "eventCode", "value": log_master_dict["eventCode"], "collection": "audit_log_master"},
            actor_user_id=get_user_id_from_token(request)
        )
        raise e

    # TODO: Re-enable once value_sets_master is seeded
    # try:
    #     await validate_value_set_fields(db, log_master_dict)
    # except HTTPException as e:
    #     await log_error(
    #         request=request,
    #         error_code=ErrorCodes.VALIDATION_FAILED,
    #         parameters={"errorMessage": str(e.detail)},
    #         actor_user_id=get_user_id_from_token(request)
    #     )
    #     raise e

    client_ip = get_client_ip(request)

    log_master_dict["createdBy"] = None
    log_master_dict["createdAt"] = get_ist_now()
    log_master_dict["createdIp"] = client_ip
    log_master_dict["updatedBy"] = None
    log_master_dict["updatedAt"] = None
    log_master_dict["updatedIp"] = None
    log_master_dict["isDelete"] = False

    result = await db[Collections.LOG_MASTER].insert_one(log_master_dict)
    created_log_master = await db[Collections.LOG_MASTER].find_one({"_id": result.inserted_id})

    # Log successful creation to Log Transaction API
    await log_transaction(
        request=request,
        log_code=LogCodes.LOG_MASTER_CREATE_SUCCESS,
        json_values={
            "logMasterId": str(result.inserted_id),
            "eventCode": log_master.eventCode,
            "logObject": log_master.logObject,
            "action": log_master.action,
            "clientIp": client_ip
        },
        level="info"
    )

    return success_response(
        data=convert_objectid_to_str(created_log_master),
        message="Audit log master created successfully",
        status_code=201
    )


@router.post(
    "/bulk-create",
    status_code=status.HTTP_201_CREATED,
    response_model=StandardResponse[LogMasterBulkCreateResponseSchema],
    responses={
        201: {"description": "Bulk create completed"},
        422: {"description": "Validation Error", "model": ValidationErrorResponse}
    }
)
async def bulk_create_log_master(
    payload: LogMasterBulkCreateSchema,
    request: Request
):
    """Bulk create audit log masters."""
    db = get_database()
    success_list = []
    failed_list = []
    client_ip = get_client_ip(request)

    for index, item in enumerate(payload.items):
        try:
            log_master_dict = item.model_dump()

            try:
                await validate_unique_constraint(
                    db,
                    Collections.LOG_MASTER,
                    {"eventCode": log_master_dict["eventCode"]},
                    exclude_id=None
                )
            except HTTPException as ve:
                await log_error(
                    request=request,
                    error_code=ErrorCodes.VALIDATION_DUPLICATE,
                    parameters={"field": "eventCode", "value": log_master_dict["eventCode"], "index": index},
                    actor_user_id=get_user_id_from_token(request)
                )
                raise ve

            # TODO: Re-enable once value_sets_master is seeded
            # try:
            #     await validate_value_set_fields(db, log_master_dict)
            # except HTTPException as vse:
            #     await log_error(
            #         request=request,
            #         error_code=ErrorCodes.VALIDATION_FAILED,
            #         parameters={"errorMessage": str(vse.detail), "index": index},
            #         actor_user_id=get_user_id_from_token(request)
            #     )
            #     raise vse

            log_master_dict["createdBy"] = None
            log_master_dict["createdAt"] = get_ist_now()
            log_master_dict["createdIp"] = client_ip
            log_master_dict["updatedBy"] = None
            log_master_dict["updatedAt"] = None
            log_master_dict["updatedIp"] = None
            log_master_dict["isDelete"] = False

            result = await db[Collections.LOG_MASTER].insert_one(log_master_dict)
            created_log_master = await db[Collections.LOG_MASTER].find_one({"_id": result.inserted_id})

            success_list.append(convert_objectid_to_str(created_log_master))
        except HTTPException as he:
            failed_list.append({
                "index": index,
                "eventCode": item.eventCode,
                "error": he.detail
            })
        except ValueError as ve:
            failed_list.append({
                "index": index,
                "eventCode": item.eventCode,
                "error": str(ve)
            })
        except Exception as e:
            await log_error_with_exception(
                request=request,
                error_code="ERR.CORE.LOG_MASTER.BULK_CREATE_FAILED",
                parameters={
                    "index": index,
                    "eventCode": item.eventCode,
                    "errorMessage": str(e)
                },
                exception=e,
                actor_user_id=get_user_id_from_token(request)
            )
            failed_list.append({
                "index": index,
                "eventCode": item.eventCode,
                "error": "Internal server error"
            })

    # Log bulk create summary to Log Transaction API
    if success_list:
        await log_transaction(
            request=request,
            log_code=LogCodes.LOG_MASTER_BULK_CREATE_SUCCESS,
            json_values={
                "totalSuccess": len(success_list),
                "totalFailed": len(failed_list),
                "clientIp": client_ip
            },
            level="info"
        )

    return success_response(
        data={
            "success": success_list,
            "failed": failed_list,
            "totalSuccess": len(success_list),
            "totalFailed": len(failed_list)
        },
        message="Bulk create completed",
        status_code=201
    )


@router.get(
    "/list",
    response_model=StandardResponse[PaginatedLogMasterResponse],
    responses={
        200: {"description": "Audit log masters retrieved successfully"},
        403: {"description": "Permission denied", "model": ErrorResponse}
    }
)
async def get_all_log_masters(
    request: Request,
    page: Optional[int] = Query(None, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="Items per page"),
    layer: Optional[str] = Query(None, description="Filter by layer"),
    action: Optional[str] = Query(None, description="Filter by action"),
    logObject: Optional[str] = Query(None, description="Filter by logObject"),
    logtype: Optional[str] = Query(None, description="Filter by logtype"),
    eventCode: Optional[str] = Query(None, description="Search by eventCode (partial match)"),
    include_deleted: bool = Query(False, description="Include soft-deleted records")
):
    """Get all audit log masters with optional pagination and filters"""
    db = get_database()

    query = {}
    if not include_deleted:
        query["isDelete"] = False

    if layer:
        query["layer"] = layer

    if action:
        query["action"] = action

    if logObject:
        query["logObject"] = logObject

    if logtype:
        query["logtype"] = logtype

    if eventCode:
        query["eventCode"] = {"$regex": eventCode, "$options": "i"}

    total = await db[Collections.LOG_MASTER].count_documents(query)

    if page is not None:
        actual_page_size = page_size if page_size is not None else 10
        skip = (page - 1) * actual_page_size
        total_pages = (total + actual_page_size - 1) // actual_page_size

        cursor = db[Collections.LOG_MASTER].find(query).skip(skip).limit(actual_page_size).sort("createdAt", -1)
        log_masters_list = await cursor.to_list(length=actual_page_size)
        log_masters_list = [convert_objectid_to_str(lm) for lm in log_masters_list]

        await log_transaction(
            request=request,
            log_code=LogCodes.LOG_MASTER_LIST_SUCCESS,
            json_values={
                "count": len(log_masters_list),
                "page": page,
                "totalPages": total_pages,
                "clientIp": get_client_ip(request)
            },
            level="info"
        )

        return success_response(
            data={
                "items": log_masters_list,
                "total": total,
                "page": page,
                "page_size": actual_page_size,
                "total_pages": total_pages
            },
            message="Audit log masters retrieved successfully",
            status_code=200
        )
    else:
        cursor = db[Collections.LOG_MASTER].find(query).sort("createdAt", -1)
        log_masters_list = await cursor.to_list(length=None)
        log_masters_list = [convert_objectid_to_str(lm) for lm in log_masters_list]

        await log_transaction(
            request=request,
            log_code=LogCodes.LOG_MASTER_LIST_SUCCESS,
            json_values={
                "count": len(log_masters_list),
                "page": 1,
                "totalPages": 1,
                "clientIp": get_client_ip(request)
            },
            level="info"
        )

        return success_response(
            data={
                "items": log_masters_list,
                "total": total,
                "page": 1,
                "page_size": total,
                "total_pages": 1
            },
            message="Audit log masters retrieved successfully",
            status_code=200
        )


@router.get(
    "/get",
    response_model=StandardResponse[LogMasterResponseSchema],
    responses={
        200: {"description": "Audit log master retrieved successfully"},
        404: {"description": "Audit log master not found", "model": ErrorResponse}
    }
)
async def get_log_master(
    request: Request,
    id: str = Query(..., description="Audit log master ID")
):
    """Get an audit log master by ID"""

    db = get_database()

    try:
        object_id = ObjectId(id)
    except Exception:
        await log_error(
            request=request,
            error_code=ErrorCodes.VALIDATION_INVALID_OBJECTID,
            parameters={"field": "id", "value": id},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(
                message="Invalid id format",
                status_code=400,
                error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
            )
        )

    # First check if record exists at all (including deleted)
    log_master_any = await db[Collections.LOG_MASTER].find_one({"_id": object_id})

    if not log_master_any:
        await log_error(
            request=request,
            error_code=ErrorCodes.LOG_MASTER_NOT_FOUND,
            parameters={"id": id, "reason": "not_found"},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(
                message="Audit log master not found",
                status_code=404,
                error_code="ERR.CORE.LOG_MASTER.NOT_FOUND"
            )
        )

    if log_master_any.get("isDelete", False):
        await log_error(
            request=request,
            error_code=ErrorCodes.LOG_MASTER_NOT_FOUND,
            parameters={"id": id, "reason": "deleted", "eventCode": log_master_any.get("eventCode")},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(
                message="Audit log master not found or has been deleted",
                status_code=404,
                error_code="ERR.CORE.LOG_MASTER.NOT_FOUND"
            )
        )

    log_master = log_master_any

    await log_transaction(
        request=request,
        log_code=LogCodes.LOG_MASTER_FETCH_SUCCESS,
        json_values={
            "logMasterId": id,
            "eventCode": log_master.get("eventCode"),
            "clientIp": get_client_ip(request)
        },
        level="info"
    )

    return success_response(
        data=convert_objectid_to_str(log_master),
        message="Audit log master retrieved successfully",
        status_code=200
    )


@router.put(
    "/update",
    response_model=StandardResponse[LogMasterResponseSchema],
    responses={
        200: {"description": "Audit log master updated successfully"},
        404: {"description": "Audit log master not found", "model": ErrorResponse},
        422: {"description": "Validation Error", "model": ValidationErrorResponse}
    }
)
async def update_log_master(
    log_master_update: LogMasterUpdateSchema,
    request: Request,
    id: str = Query(..., description="Audit log master ID to update")
):
    """Update an audit log master"""

    db = get_database()

    try:
        object_id = ObjectId(id)
    except Exception:
        await log_error(
            request=request,
            error_code=ErrorCodes.VALIDATION_INVALID_OBJECTID,
            parameters={"field": "id", "value": id},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(
                message="Invalid id format",
                status_code=400,
                error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
            )
        )

    existing_log_master = await db[Collections.LOG_MASTER].find_one({"_id": object_id, "isDelete": False})
    if not existing_log_master:
        await log_error(
            request=request,
            error_code=ErrorCodes.LOG_MASTER_NOT_FOUND,
            parameters={"id": id, "action": "UPDATE"},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(
                message="Audit log master not found",
                status_code=404,
                error_code="ERR.CORE.LOG_MASTER.NOT_FOUND"
            )
        )

    update_data = log_master_update.model_dump(exclude_unset=True)

    if not update_data:
        await log_error(
            request=request,
            error_code=ErrorCodes.VALIDATION_FAILED,
            parameters={"reason": "No fields to update", "id": id},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(
                message="No fields to update",
                status_code=400,
                error_code="ERR.CORE.VALIDATION.NO_FIELDS"
            )
        )

    if "eventCode" in update_data:
        try:
            await validate_unique_constraint(
                db,
                Collections.LOG_MASTER,
                {"eventCode": update_data["eventCode"]},
                exclude_id=object_id
            )
        except HTTPException as e:
            await log_error(
                request=request,
                error_code=ErrorCodes.VALIDATION_DUPLICATE,
                parameters={"field": "eventCode", "value": update_data["eventCode"], "id": id},
                actor_user_id=get_user_id_from_token(request)
            )
            raise e

    # TODO: Re-enable once value_sets_master is seeded
    # try:
    #     await validate_value_set_fields(db, update_data)
    # except HTTPException as e:
    #     await log_error(
    #         request=request,
    #         error_code=ErrorCodes.VALIDATION_FAILED,
    #         parameters={"errorMessage": str(e.detail), "id": id},
    #         actor_user_id=get_user_id_from_token(request)
    #     )
    #     raise e

    client_ip = get_client_ip(request)

    update_data["updatedBy"] = None
    update_data["updatedAt"] = get_ist_now()
    update_data["updatedIp"] = client_ip

    await db[Collections.LOG_MASTER].update_one({"_id": object_id}, {"$set": update_data})
    updated_log_master = await db[Collections.LOG_MASTER].find_one({"_id": object_id})

    await log_transaction(
        request=request,
        log_code=LogCodes.LOG_MASTER_UPDATE_SUCCESS,
        json_values={
            "logMasterId": id,
            "updatedFields": list(log_master_update.model_dump(exclude_unset=True).keys()),
            "clientIp": client_ip
        },
        level="info"
    )

    return success_response(
        data=convert_objectid_to_str(updated_log_master),
        message="Audit log master updated successfully",
        status_code=200
    )


@router.delete(
    "/delete",
    response_model=StandardResponse[dict],
    responses={
        200: {"description": "Audit log master deleted successfully"},
        403: {"description": "Permission denied", "model": ErrorResponse},
        404: {"description": "Audit log master not found", "model": ErrorResponse}
    }
)
async def delete_log_master(
    request: Request,
    id: str = Query(..., description="Audit log master ID to delete")
):
    """Soft delete an audit log master"""

    db = get_database()

    try:
        object_id = ObjectId(id)
    except Exception:
        await log_error(
            request=request,
            error_code=ErrorCodes.VALIDATION_INVALID_OBJECTID,
            parameters={"field": "id", "value": id},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_response(
                message="Invalid id format",
                status_code=400,
                error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
            )
        )

    existing_log_master = await db[Collections.LOG_MASTER].find_one({"_id": object_id, "isDelete": False})
    if not existing_log_master:
        await log_error(
            request=request,
            error_code=ErrorCodes.LOG_MASTER_NOT_FOUND,
            parameters={"id": id, "action": "DELETE"},
            actor_user_id=get_user_id_from_token(request)
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_response(
                message="Audit log master not found",
                status_code=404,
                error_code="ERR.CORE.LOG_MASTER.NOT_FOUND"
            )
        )

    client_ip = get_client_ip(request)

    await db[Collections.LOG_MASTER].update_one(
        {"_id": object_id},
        {
            "$set": {
                "isDelete": True,
                "updatedBy": None,
                "updatedAt": get_ist_now(),
                "updatedIp": client_ip
            }
        }
    )

    await log_transaction(
        request=request,
        log_code=LogCodes.LOG_MASTER_DELETE_SUCCESS,
        json_values={
            "logMasterId": id,
            "eventCode": existing_log_master.get("eventCode"),
            "clientIp": client_ip
        },
        level="info"
    )

    return success_response(
        data={},
        message="Audit log master deleted successfully",
        status_code=200
    )
