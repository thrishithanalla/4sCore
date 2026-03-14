"""
Third Party API Service
Handles calls to CDR Softwares API for network lookup
"""
import logging
from datetime import datetime
from bson import ObjectId
import httpx

from app.core.config import settings
from app.api.v1.schemas.third_party_api_schema import (
    NetworkLookupResponseSchema,
    NetworkDataSchema
)
from app.api.v1.repositories.cdr_api_log_repository import CdrApiLogRepository
from app.api.v1.services.error_logger import log_error
from app.constants.error_codes import ErrorCodes

logger = logging.getLogger(__name__)

# CDR API Configuration
CDR_NETWORK_ENDPOINT = f"{settings.CDR_API_BASE_URL}/custom_api/network"
CDR_TIMEOUT = 30  # seconds

# Service identification
SERVICE_NAME = "CDR"


async def lookup_network(
    keyword: str,
    user_id: str,
    client_ip: str
) -> NetworkLookupResponseSchema:
    """
    Lookup network information using CDR Softwares API.

    Args:
        keyword: Phone number or keyword to lookup
        user_id: ID of the user making the request
        client_ip: Client IP address for logging

    Returns:
        NetworkLookupResponseSchema with the API response
    """
    start_time = datetime.utcnow()
    repository = CdrApiLogRepository()

    logger.info(
        f"CDR Network lookup: keyword={keyword} [user={user_id}, ip={client_ip}]"
    )

    # Check if CDR API is configured
    if not settings.CDR_API_CLIENT_ID or not settings.CDR_API_TOKEN:
        elapsed_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        error_message = "Third party API credentials not configured"
        logger.error(f"{error_message}: service={SERVICE_NAME}")

        # Log error to error_logs collection
        await log_error(
            request=None,
            error_code=ErrorCodes.THIRD_PARTY_API_EXECUTE_FAILED,
            parameters={
                "service": SERVICE_NAME,
                "endpoint": CDR_NETWORK_ENDPOINT,
                "keyword": keyword,
                "error": error_message
            },
            actor_user_id=user_id,
            source_type="third_party_api",
            source_name=SERVICE_NAME
        )

        return NetworkLookupResponseSchema(
            success=False,
            status_code=500,
            data=None,
            message=None,
            error=error_message,
            elapsed_ms=elapsed_ms
        )

    # Prepare request payload
    payload = {
        "client_api_id": int(settings.CDR_API_CLIENT_ID),
        "api_token": settings.CDR_API_TOKEN,
        "keyword": keyword
    }

    headers = {
        "Accept": "*/*",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient(timeout=CDR_TIMEOUT) as client:
            response = await client.post(
                CDR_NETWORK_ENDPOINT,
                json=payload,
                headers=headers
            )

            elapsed_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

            # Parse response
            try:
                response_data = response.json()
            except Exception:
                response_data = {"status": False, "message": response.text}

            is_success = 200 <= response.status_code < 300

            # Extract data from CDR API response
            api_status = response_data.get("status", False)
            api_message = response_data.get("message", "")
            api_data = response_data.get("data", {})

            # Build network data schema
            network_data = None
            if api_data and isinstance(api_data, dict):
                network_data = NetworkDataSchema(
                    services=api_data.get("services"),
                    operator_name=api_data.get("operator_name"),
                    operator_code=api_data.get("operator_code"),
                    circle_name=api_data.get("circle_name"),
                    circle_common_name=api_data.get("circle_common_name"),
                    circle_code=api_data.get("circle_code"),
                    service_type=api_data.get("service_type")
                )

            # Determine if the call was successful (both HTTP and API status)
            call_success = is_success and api_status

            if call_success:
                logger.info(
                    f"Third party API success: service={SERVICE_NAME}, keyword={keyword}, "
                    f"httpStatus={response.status_code} ({elapsed_ms}ms)"
                )
            else:
                logger.error(
                    f"Third party API failed: service={SERVICE_NAME}, keyword={keyword}, "
                    f"httpStatus={response.status_code}, apiStatus={api_status}, "
                    f"message={api_message} ({elapsed_ms}ms)"
                )

            # Save log to database (third_party_api_logs collection)
            log_data = {
                "service": SERVICE_NAME,
                "serviceEndpoint": CDR_NETWORK_ENDPOINT,
                "keyword": keyword,
                "status": api_status,
                "operator_name": api_data.get("operator_name") if api_data else None,
                "operator_code": api_data.get("operator_code") if api_data else None,
                "circle_name": api_data.get("circle_name") if api_data else None,
                "circle_common_name": api_data.get("circle_common_name") if api_data else None,
                "circle_code": api_data.get("circle_code") if api_data else None,
                "service_type": api_data.get("service_type") if api_data else None,
                "message": api_message,
                "userId": ObjectId(user_id),
                "clientIp": client_ip,
                "elapsed_ms": elapsed_ms,
                "createdAt": datetime.utcnow()
            }

            try:
                await repository.create(log_data)
                logger.info(f"Third party API log saved: service={SERVICE_NAME}, keyword={keyword}, status={api_status}")
            except Exception as save_error:
                logger.error(f"Failed to save third party API log: {str(save_error)}")

            # Log error to error_logs collection if API call failed
            if not call_success:
                await log_error(
                    request=None,
                    error_code=ErrorCodes.THIRD_PARTY_API_EXECUTE_FAILED,
                    parameters={
                        "service": SERVICE_NAME,
                        "endpoint": CDR_NETWORK_ENDPOINT,
                        "keyword": keyword,
                        "httpStatusCode": str(response.status_code),
                        "apiStatus": str(api_status),
                        "message": api_message or "API returned failure status",
                        "elapsedMs": str(elapsed_ms)
                    },
                    actor_user_id=user_id,
                    source_type="third_party_api",
                    source_name=SERVICE_NAME
                )
                logger.info(f"Third party API error logged to error_logs: service={SERVICE_NAME}, keyword={keyword}")

            return NetworkLookupResponseSchema(
                success=call_success,
                status_code=response.status_code,
                data=network_data,
                message=api_message,
                error=None if call_success else api_message,
                elapsed_ms=elapsed_ms
            )

    except httpx.TimeoutException as e:
        elapsed_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        error_message = f"Timeout: {str(e)}"
        logger.error(f"Third party API timeout: service={SERVICE_NAME}, keyword={keyword} ({elapsed_ms}ms)")

        # Save failed log to third_party_api_logs collection
        await _save_api_log(repository, keyword, user_id, client_ip, elapsed_ms, error_message)

        # Log error to error_logs collection
        await log_error(
            request=None,
            error_code=ErrorCodes.THIRD_PARTY_API_EXECUTE_TIMEOUT,
            parameters={
                "service": SERVICE_NAME,
                "endpoint": CDR_NETWORK_ENDPOINT,
                "keyword": keyword,
                "elapsedMs": str(elapsed_ms),
                "error": str(e)
            },
            actor_user_id=user_id,
            source_type="third_party_api",
            source_name=SERVICE_NAME
        )

        return NetworkLookupResponseSchema(
            success=False,
            status_code=408,
            data=None,
            message=None,
            error=f"Request timeout: {str(e)}",
            elapsed_ms=elapsed_ms
        )

    except httpx.RequestError as e:
        elapsed_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        error_message = f"Connection error: {str(e)}"
        logger.error(f"Third party API connection error: service={SERVICE_NAME}, keyword={keyword} - {str(e)} ({elapsed_ms}ms)")

        # Save failed log to third_party_api_logs collection
        await _save_api_log(repository, keyword, user_id, client_ip, elapsed_ms, error_message)

        # Log error to error_logs collection
        await log_error(
            request=None,
            error_code=ErrorCodes.THIRD_PARTY_API_EXECUTE_CONNECTION_ERROR,
            parameters={
                "service": SERVICE_NAME,
                "endpoint": CDR_NETWORK_ENDPOINT,
                "keyword": keyword,
                "elapsedMs": str(elapsed_ms),
                "error": str(e)
            },
            actor_user_id=user_id,
            source_type="third_party_api",
            source_name=SERVICE_NAME
        )

        return NetworkLookupResponseSchema(
            success=False,
            status_code=502,
            data=None,
            message=None,
            error=f"Request failed: {str(e)}",
            elapsed_ms=elapsed_ms
        )

    except Exception as e:
        elapsed_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        error_message = f"Internal error: {str(e)}"
        logger.exception(f"Third party API internal error: service={SERVICE_NAME}, keyword={keyword} - {str(e)} ({elapsed_ms}ms)")

        # Save failed log to third_party_api_logs collection
        await _save_api_log(repository, keyword, user_id, client_ip, elapsed_ms, error_message)

        # Log error to error_logs collection
        await log_error(
            request=None,
            error_code=ErrorCodes.THIRD_PARTY_API_EXECUTE_FAILED,
            parameters={
                "service": SERVICE_NAME,
                "endpoint": CDR_NETWORK_ENDPOINT,
                "keyword": keyword,
                "elapsedMs": str(elapsed_ms),
                "error": str(e),
                "errorType": type(e).__name__
            },
            actor_user_id=user_id,
            source_type="third_party_api",
            source_name=SERVICE_NAME
        )

        return NetworkLookupResponseSchema(
            success=False,
            status_code=500,
            data=None,
            message=None,
            error=f"Internal error: {str(e)}",
            elapsed_ms=elapsed_ms
        )


async def _save_api_log(
    repository: CdrApiLogRepository,
    keyword: str,
    user_id: str,
    client_ip: str,
    elapsed_ms: int,
    error_message: str
):
    """Save third party API log to database (for failed requests)"""
    try:
        log_data = {
            "service": SERVICE_NAME,
            "serviceEndpoint": CDR_NETWORK_ENDPOINT,
            "keyword": keyword,
            "status": False,
            "operator_name": None,
            "operator_code": None,
            "circle_name": None,
            "circle_common_name": None,
            "circle_code": None,
            "service_type": None,
            "message": error_message,
            "userId": ObjectId(user_id),
            "clientIp": client_ip,
            "elapsed_ms": elapsed_ms,
            "createdAt": datetime.utcnow()
        }
        await repository.create(log_data)
        logger.info(f"Third party API error log saved: service={SERVICE_NAME}, keyword={keyword}")
    except Exception as save_error:
        logger.error(f"Failed to save third party API log: {str(save_error)}")
