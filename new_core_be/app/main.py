from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import ResponseValidationError, RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.core.logger import logger
from app.core.config import settings
from app.core.cors import CustomCORSMiddleware
from app.api.v1.services.error_logger import log_error, get_user_id_from_request
from app.constants.error_codes import ErrorCodes
from app.core.correlation import new_id, set_actor_user, set_ids
from app.api.v1.middleware import RequestContextMiddleware
from app.core.database import (close_mongodb_connection, connect_to_mongodb,
                               get_database)
# from app.core.db_indexes import initialize_database_indexes
from app.api.v1.routers import (auth_router, department_router, district_router,
                         error_log_router, error_master_router,
                         mandal_router, personnel_router, prompt_router,
                         prompt_execution_router, rank_master_router,
                         unit_router, unit_type_router, unit_villages_router,
                         value_sets_router, module_router,
                         jobs_router, permissions_router, role_router, module_hierarchy_router,
                         user_mapping_router, permissions_mapping_router, module_job_mapping_router,
                         approval_chain_router,
                         approval_flow_master,designation_master_router,
                         feedback_master_router, feedback_router,
                         test_master_router, test_execution_router,onboarding_router,
                         dashboard_router, org_structure_router, feedback_dashboard_router, third_party_api_router,
                         log_master_router,
                         log_transaction_router)
# Note: logs_router import removed as the file is fully commented out


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application
    Handles startup and shutdown events
    """
    # Startup: Connect to MongoDB
    await connect_to_mongodb()

    # Initialize database indexes
    db = get_database()
    #await initialize_database_indexes(db)

    yield

    # Shutdown: Close MongoDB connection
    await close_mongodb_connection()


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="CORE SERVICE  API's with JWT Authentication",
    lifespan=lifespan,
    root_path="/core"
)

# Custom CORS middleware with wildcard/regex pattern support
# Supports: http://localhost:*, https://*.domain.com, exact origins
print(f"[OK] CORS Allowed Origins: {settings.allowed_origins_list}")
app.add_middleware(
    CustomCORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Context Middleware - extracts client IP and request info
# This runs AFTER CORS but BEFORE endpoints
# Access via: request.state.client_ip, request.state.request_time
app.add_middleware(RequestContextMiddleware)
# Error codes that are already logged inline (skip global logging to prevent duplicates)
ALREADY_LOGGED_ERROR_PREFIXES = (
    "ERR.CORE.LOG.",          # Log operation errors (logged in routers)
    "ERR.CORE.LOG_MASTER.",   # Log master errors (logged in routers)
    "ERR.CORE.LOG_CODE.",     # Log code errors (logged in routers)
    "ERR.CORE.CHAIN.",        # Chain errors (logged in routers)
    "ERR.CORE.AUTH.",         # Auth errors (logged inline)
    "ERR.CORE.PERMISSION.",   # Permission errors (logged inline)
    "ERR.CORE.VALIDATION.",   # Validation errors (logged inline)
)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Handle request validation errors (Pydantic validation) with standard response format.
    Also logs the validation error to the error_logs collection.
    """
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error.get("loc", [])[1:])  # Skip 'body' prefix
        msg = error.get('msg', 'Validation error')
        # Remove "Value error, " prefix if present (from Pydantic validators)
        if msg.startswith("Value error, "):
            msg = msg[13:]
        # If field is empty (model-level validator), just use the message
        if field:
            errors.append(f"{field}: {msg}")
        else:
            errors.append(msg)

    error_details = errors if len(errors) > 1 else errors[0] if errors else "Validation failed"
    
     # Log the error to the external Error Log API
    try:
        from app.api.v1.services.error_logger import log_error_with_exception, get_user_id_from_token

        await log_error_with_exception(
            request=request,
            error_code="ERR.CORE.RESPONSE.VALIDATION_FAILED",
            parameters={
                "message": "Response validation failed. Data in database may be inconsistent with schema.",
                "endpoint": request.url.path,
                "method": request.method,
                "errors": str(errors)[:2000]
            },
            exception=exc,
            actor_user_id=get_user_id_from_token(request)
        )
    except Exception as log_error_exc:
        logger.warning(f"Failed to log response validation error: {str(log_error_exc)}")

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "code": 500,
            "message": "Response validation failed. Data in database may be inconsistent with schema.",
            "error_code": "ERR.CORE.RESPONSE.VALIDATION_FAILED",
            "data": {"errors": errors}
        }
    )

    # Log the validation error to the error_logs collection
    # Run in background to avoid blocking the response
    # asyncio.create_task(
    #     log_error(
    #         request=request,
    #         error_code=ErrorCodes.VALIDATION_REQUEST_FAILED,
    #         parameters={
    #             "endpoint": str(request.url.path),
    #             "method": request.method,
    #             "validation_errors": str(error_details)
    #         },
    #         actor_user_id=get_user_id_from_request(request)
    #     )
    # )

    # return JSONResponse(
    #     status_code=422,
    #     content={
    #         "success": False,
    #         "code": 422,
    #         "message": "Validation error",
    #         "data": None,
    #         "errors": {
    #             "errorCode": "ERR.VALIDATION",
    #             "details": error_details
    #         }
    #     }
    # )


@app.exception_handler(ResponseValidationError)
async def response_validation_exception_handler(request: Request, exc: ResponseValidationError):
    """
    Handle response validation errors gracefully.
    Returns a proper error response instead of Internal Server Error.
    Also logs the validation error to the error_logs collection.
    """
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error.get("loc", []))
        errors.append(f"{field}: {error.get('msg', 'Validation error')}")

    error_details = errors if len(errors) > 1 else errors[0] if errors else "Response validation failed"

    # Log the response validation error to the error_logs collection
    # Run in background to avoid blocking the response
    asyncio.create_task(
        log_error(
            request=request,
            error_code=ErrorCodes.VALIDATION_RESPONSE_FAILED,
            parameters={
                "endpoint": str(request.url.path),
                "method": request.method,
                "validation_errors": str(error_details)
            },
            actor_user_id=get_user_id_from_request(request)
        )
    )

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "code": 500,
            "message": "Response validation failed",
            "data": None,
            "errors": {
                "errorCode": "ERR.RESPONSE_VALIDATION",
                "details": error_details
            }
        }
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Handle ALL HTTP exceptions and log them to error_logs collection.
    """
    # Determine appropriate error code based on status
    error_code_map = {
        400: "ERR.CORE.HTTP.BAD_REQUEST",
        401: ErrorCodes.AUTH_TOKEN_MISSING,
        403: ErrorCodes.AUTH_PERMISSION_DENIED,
        404: "ERR.CORE.HTTP.NOT_FOUND",
        405: "ERR.CORE.HTTP.METHOD_NOT_ALLOWED",
        408: "ERR.CORE.HTTP.REQUEST_TIMEOUT",
        409: "ERR.CORE.HTTP.CONFLICT",
        422: "ERR.CORE.HTTP.UNPROCESSABLE_ENTITY",
        429: "ERR.CORE.HTTP.TOO_MANY_REQUESTS",
        500: "ERR.CORE.HTTP.INTERNAL_SERVER_ERROR",
        502: "ERR.CORE.HTTP.BAD_GATEWAY",
        503: "ERR.CORE.HTTP.SERVICE_UNAVAILABLE",
        504: "ERR.CORE.HTTP.GATEWAY_TIMEOUT",
    }

    error_code = error_code_map.get(exc.status_code, f"ERR.CORE.HTTP.{exc.status_code}")

    # Log ALL HTTP exceptions to error_logs
    asyncio.create_task(
        log_error(
            request=request,
            error_code=error_code,
            parameters={
                "endpoint": str(request.url.path),
                "method": request.method,
                "status_code": exc.status_code,
                "detail": str(exc.detail)
            },
            actor_user_id=get_user_id_from_request(request)
        )
    )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "code": exc.status_code,
            "message": exc.detail if isinstance(exc.detail, str) else "Request failed",
            "data": None,
            "errors": {
                "errorCode": error_code,
                "details": exc.detail
            }
        }
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """
    Handle ALL unhandled exceptions and log them to error_logs collection.
    This catches any exceptions that are not HTTPException or ValidationError.
    """
    import traceback

    error_code = "ERR.CORE.INTERNAL.UNHANDLED_EXCEPTION"

    # Log the unhandled exception to error_logs
    asyncio.create_task(
        log_error(
            request=request,
            error_code=error_code,
            parameters={
                "endpoint": str(request.url.path),
                "method": request.method,
                "exception_type": type(exc).__name__,
                "exception_message": str(exc),
                "traceback": traceback.format_exc()
            },
            actor_user_id=get_user_id_from_request(request)
        )
    )

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "code": 500,
            "message": "Internal server error",
            "data": None,
            "errors": {
                "errorCode": error_code,
                "details": str(exc)
            }
        }
    )


# NEW: Correlation middleware (applies to ALL routes)
# - Generates/propagates x-request-id and x-trace-id
# - Optionally stamps actorUserId from your auth (header shown as example)
@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    
    request_id = request.headers.get("x-request-id") or new_id()
    trace_id = request.headers.get("x-trace-id") or request_id  # v1 rule: same if absent
    set_ids(request_id, trace_id)

    # If you already decode JWT elsewhere, you can set it there instead.
    # This line just shows a placeholder header for actor identity:
    set_actor_user(request.headers.get("x-actor-user-id"))

    response = await call_next(request)
    # Echo back so clients/frontends can propagate across calls
    response.headers["x-request-id"] = request_id
    response.headers["x-trace-id"] = trace_id
    return response

# Include routers
app.include_router(auth_router.router)
app.include_router(personnel_router.router)
app.include_router(unit_router.router)
app.include_router(unit_villages_router.router)
app.include_router(department_router.router)
app.include_router(unit_type_router.router)
app.include_router(rank_master_router.router)
app.include_router(district_router.router)
app.include_router(mandal_router.router)
app.include_router(value_sets_router.router)
# app.include_router(notification_master_router.router)
app.include_router(error_master_router.router)

# app.include_router(logs_router.router)
app.include_router(error_log_router.router)
app.include_router(prompt_router.router)
app.include_router(prompt_execution_router.router)
# app.include_router(notification_router.router)
app.include_router(module_router.router)
app.include_router(jobs_router.router)
app.include_router(permissions_router.router)
app.include_router(role_router.router)
app.include_router(module_hierarchy_router.router)
app.include_router(user_mapping_router.router)
app.include_router(permissions_mapping_router.router)
app.include_router(module_job_mapping_router.router)
app.include_router(approval_flow_master.router)
app.include_router(approval_chain_router.router)
app.include_router(onboarding_router.router)

app.include_router(designation_master_router.router)
app.include_router(feedback_master_router.router)
app.include_router(feedback_router.router)
app.include_router(test_master_router.router)
app.include_router(test_execution_router.router)
app.include_router(dashboard_router.router)
app.include_router(org_structure_router.router)
app.include_router(feedback_dashboard_router.router)
app.include_router(third_party_api_router.router)

app.include_router(log_master_router.router)
app.include_router(log_transaction_router.router)



@app.get("/")
async def root():
    """
    Root endpoint - API health check
    """
    return {
        "message": "CORE SERVICE  API's",
        "version": settings.APP_VERSION,
        "status": "online"
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {
        "status": "healthy",
        "version": settings.APP_VERSION
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",  # Updated path
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )