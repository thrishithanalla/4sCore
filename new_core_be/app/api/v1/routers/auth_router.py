"""
Auth Router
Provides API endpoints for Authentication
Routes: /api/v1/auth
"""
import logging
import re
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from bson import ObjectId
from jose import jwt, JWTError
from app.api.v1.services.personnel_master_service import get_personnel
from app.api.v1.schemas.auth_schema import (
    LoginSchema, TokenSchema, TokenDataSchema, VerifyOTPSchema, UpdateMPINSchema,
    RefreshTokenSchema, LogoutSchema, SessionSchema, DeviceInfoSchema
)
from app.core.database import get_database
from app.core.config import settings
from app.utils.security import (
    create_access_token, generate_refresh_token, hash_token,
    generate_family_id, create_refresh_token_jwt, decode_refresh_token
)
from app.utils.msdp_sms import generate_otp, send_otp_sms
from app.utils.time_utils import get_ist_now
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.standard_response import (
    ResponseBuilder,
    api_success
)
from app.constants.api_constants import ErrorMessages
from app.constants.error_codes import ErrorCodes
from app.constants.collections import Collections
from app.constants.log_codes import LogCodes
from app.utils.error_messages import get_auth_message
from app.api.v1.services.error_logger import log_error, log_error_with_exception
from app.api.v1.services.log_logger import log_transaction

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
security = HTTPBearer()


def _error_code(code: str) -> str:
    """Generate error code with module prefix"""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)


async def _enrich_permissions_with_job_data(db, permissions: list) -> list:
    """
    Enrich permissions structure with isMenu, displayName, route, displayOrder from jobs_master
    and moduleDescription, displayOrder from modules_master

    Args:
        db: Database instance
        permissions: List of permission modules with structure:
            [{moduleId, moduleName, jobs: [{jobName, permissions}]}]

    Returns:
        Enriched permissions with isMenu, displayName, route, displayOrder added to each job
        and moduleDescription, displayOrder added to each module.
        Modules are sorted by displayOrder (ascending, can be negative).
    """
    if not permissions:
        return permissions

    # Collect all unique job names and module IDs
    job_names = set()
    module_ids = set()
    for module in permissions:
        module_id = module.get("moduleId")
        if module_id:
            module_ids.add(module_id)
        for job in module.get("jobs", []):
            job_name = job.get("jobName")
            if job_name:
                job_names.add(job_name)

    # Fetch job data (isMenu, displayName, route, displayOrder) for all jobs in one query
    jobs_data = await db[Collections.JOBS].find(
        {"name": {"$in": list(job_names)}, "isDelete": False},
        {"name": 1, "isMenu": 1, "displayName": 1, "route": 1, "displayOrder": 1}
    ).to_list(length=None)

    # Create a lookup map: jobName -> {isMenu, displayName, route, displayOrder}
    job_data_map = {
        job["name"]: {
            "isMenu": job.get("isMenu", True),
            "displayName": job.get("displayName", ""),
            "route": job.get("route", ""),
            "displayOrder": job.get("displayOrder", 1 if job.get("isMenu", True) else 0)
        }
        for job in jobs_data
    }

    # Fetch description and displayOrder from modules_master
    module_data_map = {}
    if module_ids:
        # Convert string IDs to ObjectId for query
        module_object_ids = []
        for mid in module_ids:
            try:
                module_object_ids.append(ObjectId(mid))
            except:
                pass  # Skip invalid ObjectIds

        if module_object_ids:
            modules_data = await db[Collections.MODULES].find(
                {"_id": {"$in": module_object_ids}, "isDelete": False},
                {"_id": 1, "description": 1, "displayOrder": 1}
            ).to_list(length=None)

            # Create lookup map: moduleId (string) -> {description, displayOrder}
            module_data_map = {
                str(mod["_id"]): {
                    "description": mod.get("description", ""),
                    "displayOrder": mod.get("displayOrder", 0)
                }
                for mod in modules_data
            }

    # Enrich permissions with job data and module description/displayOrder
    enriched_permissions = []
    for module in permissions:
        enriched_module = {**module}
        module_id = module.get("moduleId")

        # Add moduleDescription and displayOrder from modules_master
        module_data = module_data_map.get(module_id, {})
        enriched_module["moduleDescription"] = module_data.get("description", "")
        enriched_module["displayOrder"] = module_data.get("displayOrder", 0)

        enriched_jobs = []

        for job in module.get("jobs", []):
            enriched_job = {**job}
            job_name = job.get("jobName")

            # isMenu and displayOrder from role's permission structure (NOT from jobs_master)
            # displayName and route from jobs_master
            job_data = job_data_map.get(job_name, {})
            enriched_job["isMenu"] = job.get("isMenu", True)
            enriched_job["displayName"] = job_data.get("displayName", "")
            enriched_job["route"] = job_data.get("route", "")
            enriched_job["displayOrder"] = job.get("displayOrder", 1)

            enriched_jobs.append(enriched_job)

        enriched_module["jobs"] = enriched_jobs
        enriched_permissions.append(enriched_module)

    # Sort modules by displayOrder (ascending, can be negative)
    enriched_permissions.sort(key=lambda m: m.get("displayOrder", 0))

    return enriched_permissions


@router.post(
    "/login",
    status_code=status.HTTP_200_OK,
    summary="User login",
    description="Authenticates a user using UserID or Phone Number with MPIN and returns a JWT access token with unit-role mappings."
)
async def login(request: Request, login_data: LoginSchema):
    """
    Authenticate user and return JWT access token.

    This endpoint authenticates a user using either userId or phoneNumber with MPIN,
    then returns a JWT token containing user identity and unit-role assignments.

    **Request Body (LoginSchema):**
    - `userId` (optional): Police User Identifier (8 digits) - required if phoneNumber not provided
    - `phoneNumber` (optional): Mobile number (Indian format) - required if userId not provided
    - `mpin` (required): 4-digit MPIN for authentication

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Login successful"
    - `data`:
      - `accessToken`: JWT token for authentication
      - `tokenType`: "bearer"
      - `expiresIn`: Token expiration time in minutes

    **Token Payload Contains:**
    - `sub`: User's MongoDB _id
    - `id`: User's MongoDB _id
    - `userId`: Police User Identifier
    - `fullName`: User's full name
    - `units`: Array of unit assignments with roles and designations

    **Error Responses:**
    - 400: Missing identifier (userId or phoneNumber), invalid MPIN format
    - 401: User not found, user deleted, or invalid MPIN
    - 500: Internal server error
    """
    db = get_database()

    try:
        # Build query based on provided credentials
        query = {"isDelete": False}

        # Check if identifier fields are provided
        user_id_empty = not login_data.userId or not login_data.userId.strip()
        phone_empty = not login_data.phoneNumber or not login_data.phoneNumber.strip()
        mpin_empty = login_data.mpin is None or (isinstance(login_data.mpin, str) and not login_data.mpin.strip())

        # At least one identifier (userId or phoneNumber) is required
        if user_id_empty and phone_empty:
            logger.warning("Login attempt with no identifier (userId or phoneNumber)")
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_IDENTIFIER_REQUIRED,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Either User ID or Phone Number is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_IDENTIFIER_REQUIRED
                )
            )

        # Validate MPIN is provided
        if mpin_empty:
            logger.warning("Login attempt with empty MPIN")
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_MPIN_REQUIRED,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "MPIN is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_MPIN_REQUIRED
                )
            )

        # Convert MPIN to integer and validate format (exactly 4 digits: 1000-9999)
        try:
            mpin_value = int(str(login_data.mpin).strip())
            if mpin_value < 1000 or mpin_value > 9999:
                raise ValueError("MPIN out of range")
        except (ValueError, TypeError):
            logger.warning("Login attempt with invalid MPIN format")
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_MPIN_INVALID_FORMAT,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "MPIN must be exactly 4 digits (1000-9999)"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_MPIN_INVALID_FORMAT
                )
            )

        # Determine which identifier to use for lookup
        identifier_type = None
        identifier_value = None

        if not user_id_empty:
            # Use userId for lookup
            user_id_cleaned = login_data.userId.strip()

            # Validate userId maximum length (prevent DoS with very long inputs)
            if len(user_id_cleaned) > 50:
                logger.warning(f"Login attempt with userId exceeding max length: {len(user_id_cleaned)} characters")
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.AUTH_USER_ID_TOO_LONG,
                    parameters={"maxLength": "50", "actualLength": str(len(user_id_cleaned))},
                    actor_user_id=None
                )
                error_message = (error_log or {}).get("resolvedMessage") or "User ID must not exceed 50 characters"
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=ErrorCodes.AUTH_USER_ID_TOO_LONG
                    )
                )

            # Validate userId contains only alphanumeric characters
            if not re.match(r'^[a-zA-Z0-9_-]+$', user_id_cleaned):
                logger.warning(f"Login attempt with invalid characters in userId: {user_id_cleaned[:20]}...")
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.AUTH_USER_ID_INVALID_CHARACTERS,
                    parameters={"userId": user_id_cleaned[:20] + "..." if len(user_id_cleaned) > 20 else user_id_cleaned},
                    actor_user_id=None
                )
                error_message = (error_log or {}).get("resolvedMessage") or "User ID contains invalid characters. Only alphanumeric characters, underscores, and hyphens are allowed"
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=ErrorCodes.AUTH_USER_ID_INVALID_CHARACTERS
                    )
                )

            query["userId"] = user_id_cleaned
            identifier_type = "userId"
            identifier_value = user_id_cleaned
            logger.info(f"Login attempt for userId: {user_id_cleaned}")

        else:
            # Use phoneNumber for lookup
            phone_cleaned = login_data.phoneNumber.strip()

            # Normalize phone number to +91XXXXXXXXXX format
            try:
                from app.utils.phone_validator import validate_indian_phone
                normalized_phone = validate_indian_phone(phone_cleaned, "phoneNumber")
                if not normalized_phone:
                    raise ValueError("Invalid phone number")
            except ValueError as e:
                logger.warning(f"Login attempt with invalid phone format: {str(e)}")
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.AUTH_PHONE_INVALID_FORMAT,
                    parameters={},
                    actor_user_id=None
                )
                error_message = (error_log or {}).get("resolvedMessage") or "Invalid phone number format. Must be Indian phone number: +91XXXXXXXXXX, 91XXXXXXXXXX, or XXXXXXXXXX"
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=ErrorCodes.AUTH_PHONE_INVALID_FORMAT
                    )
                )

            query["mobile"] = normalized_phone
            identifier_type = "phoneNumber"
            identifier_value = normalized_phone
            logger.info(f"Login attempt for phoneNumber: {normalized_phone}")

        logger.debug(f"Query: {query}, Collection: {Collections.PERSONNEL_MASTER}")

        # Find user in database using personnel_master collection
        user = await db[Collections.PERSONNEL_MASTER].find_one(query)

        if not user:
            logger.warning(f"User not found for {identifier_type}: {identifier_value}")
            # Check if user exists but is deleted
            deleted_query = {"userId": identifier_value} if identifier_type == "userId" else {"mobile": identifier_value}
            deleted_user = await db[Collections.PERSONNEL_MASTER].find_one(deleted_query)
            if deleted_user:
                # User exists but is deleted
                logger.warning(f"User exists but isDelete={deleted_user.get('isDelete', 'not set')}")
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.AUTH_USER_DELETED,
                    parameters={identifier_type: identifier_value},
                    actor_user_id=None
                )
                error_message = (error_log or {}).get("resolvedMessage") or "User account is deleted"
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content=ResponseBuilder.unauthorized(
                        message=error_message,
                        error_code=ErrorCodes.AUTH_USER_DELETED
                    )
                )
            # User does not exist at all
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_USER_NOT_FOUND,
                parameters={identifier_type: identifier_value},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "User not found"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_USER_NOT_FOUND
                )
            )

        logger.info(f"User found: {user.get('_id')}, name: {user.get('name')}")

        # Verify MPIN (stored as integer)
        stored_mpin = user.get("mpin")
        if stored_mpin is None or int(stored_mpin) != mpin_value:
            logger.warning(f"MPIN verification failed for {identifier_type}: {identifier_value}")
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_INVALID_MPIN,
                parameters={identifier_type: identifier_value},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid MPIN"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_INVALID_MPIN
                )
            )

        logger.info(f"MPIN verified successfully for {identifier_type}: {identifier_value}")

        # Check if this is a first-time login - require OTP verification and MPIN setup
        is_first_time = user.get("isFirstTime", True)
        if is_first_time:
            logger.info(f"First-time login detected for user: {user.get('_id')}")

            # Get user's mobile number
            user_mobile = user.get("mobile")
            if not user_mobile:
                logger.warning(f"User {user.get('_id')} does not have a mobile number for OTP")
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.USER_MOBILE_NOT_FOUND,
                    parameters={"personnelId": str(user["_id"])},
                    actor_user_id=str(user["_id"])
                )
                error_message = (error_log or {}).get("resolvedMessage") or "Mobile number not found for OTP verification"
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content=ResponseBuilder.bad_request(
                        message=error_message,
                        error_code=ErrorCodes.USER_MOBILE_NOT_FOUND
                    )
                )

            # Generate 6-digit OTP
            otp = generate_otp(6)
            otp_expiry = get_ist_now() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)

            # Send OTP via Twilio SMS
            success, message_sid, error = send_otp_sms(user_mobile, otp)
            if not success:
                logger.error(f"Failed to send OTP SMS to {user_mobile}: {error}")
                error_log = await log_error(
                    request=request,
                    error_code=ErrorCodes.OTP_SEND_FAILED,
                    parameters={"personnelId": str(user["_id"]), "error": error or "Unknown error"},
                    actor_user_id=str(user["_id"])
                )
                error_message = (error_log or {}).get("resolvedMessage") or "Failed to send OTP. Please try again."
                return JSONResponse(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content=ResponseBuilder.server_error(
                        message=error_message,
                        error_code=ErrorCodes.OTP_SEND_FAILED
                    )
                )

            # Store OTP in database
            otp_record = {
                "personnelId": user["_id"],
                "otp": otp,
                "validTill": otp_expiry,
                "isUsed": False,
                "isVerified": False,
                "createdAt": get_ist_now(),
                "createdIp": request.client.host if request.client else None,
                "twilioMessageSid": message_sid,  # Kept for backward compatibility
                "msdpMessageId": message_sid,  # New MSDP message ID field
                "smsProvider": "MSDP"  # Track which provider was used
            }
            await db[Collections.OTP_VERIFICATION].insert_one(otp_record)

            # Mask phone number for response (show last 4 digits)
            masked_phone = f"****{user_mobile[-4:]}" if len(user_mobile) >= 4 else "****"

            logger.info(f"OTP sent successfully to {masked_phone} for user: {user.get('_id')}")

            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=api_success(
                    data={
                        "isFirstTime": True,
                        "personnelId": str(user["_id"]),
                        "otpSentTo": masked_phone,
                        "otpExpiryMinutes": settings.OTP_EXPIRY_MINUTES
                    },
                    message="First-time login. OTP sent to your registered mobile number. Please verify and set your MPIN."
                )
            )

        # Fetch unit-role combinations from user_role_permissions collection
        user_id_str = str(user["_id"])
        user_mappings = await db[Collections.USER_ROLE_PERMISSIONS].find({
            "userId": {"$in": [user_id_str, user["_id"]]},
            "isDelete": False
        }).to_list(length=None)

        # Build units array structure: [{name, unitId, roles: [{name, roleId}], designationId}]
        unit_roles_dict = {}
        for mapping in user_mappings:
            unit_id_str = str(mapping["unitId"]) if isinstance(mapping["unitId"], ObjectId) else mapping["unitId"]
            role_id = str(mapping["roleId"]) if isinstance(mapping["roleId"], ObjectId) else mapping["roleId"]

            if unit_id_str not in unit_roles_dict:
                unit_roles_dict[unit_id_str] = {
                    "unitId": unit_id_str,
                    "name": None,
                    "roles": [],
                    "designationId": None
                }

            unit_roles_dict[unit_id_str]["roles"].append(role_id)

        # Fetch unit names and role names from database
        for unit_id_str, unit_data in unit_roles_dict.items():
            # Fetch unit name from unit_master collection
            unit_doc = await db[Collections.UNIT].find_one({
                "_id": ObjectId(unit_id_str),
                "isDelete": False
            })
            if unit_doc:
                unit_data["name"] = unit_doc.get("name", "")

            # Fetch role names for all roles in this unit
            roles_with_names = []
            for role_id in unit_data["roles"]:
                role_doc = await db[Collections.ROLES].find_one({
                    "_id": ObjectId(role_id),
                    "isDelete": False
                })
                if role_doc:
                    roles_with_names.append({
                        "roleId": role_id,
                        "name": role_doc.get("name", "")
                    })
            unit_data["roles"] = roles_with_names

        # Get designationId from personnel.units array
        personnel_units = user.get("units", [])
        if personnel_units and isinstance(personnel_units, list):
            for unit_item in personnel_units:
                if isinstance(unit_item, list) and len(unit_item) >= 1:
                    unit_id_from_personnel = unit_item[0]
                    if isinstance(unit_id_from_personnel, ObjectId):
                        unit_id_from_personnel = str(unit_id_from_personnel)

                    designation_id = unit_item[1] if len(unit_item) > 1 else None

                    if designation_id and isinstance(designation_id, ObjectId):
                        designation_id = str(designation_id)

                    if unit_id_from_personnel in unit_roles_dict:
                        unit_roles_dict[unit_id_from_personnel]["designationId"] = designation_id

        # Convert to array
        units_array = list(unit_roles_dict.values())

        # Create access token
        access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

        token_data = {
            "sub": str(user["_id"]),
            "id": str(user["_id"]),
            "userId": user.get("userId"),
            "fullName": user.get("name"),
            "units": units_array
        }

        access_token = create_access_token(
            data=token_data,
            expires_delta=access_token_expires
        )

        # Generate refresh token
        family_id = generate_family_id()
        refresh_token_expires = timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

        refresh_token_data = {
            "sub": str(user["_id"]),
            "personnelId": str(user["_id"]),
            "familyId": family_id
        }

        refresh_token = create_refresh_token_jwt(
            data=refresh_token_data,
            expires_delta=refresh_token_expires
        )

        # Hash refresh token for storage
        refresh_token_hash = hash_token(refresh_token)

        # Extract device info from request
        device_info = {
            "userAgent": request.headers.get("user-agent", ""),
            "deviceType": login_data.deviceInfo.deviceType if login_data.deviceInfo and login_data.deviceInfo.deviceType else "unknown",
            "os": login_data.deviceInfo.os if login_data.deviceInfo and login_data.deviceInfo.os else "",
            "browser": login_data.deviceInfo.browser if login_data.deviceInfo and login_data.deviceInfo.browser else "",
            "deviceName": login_data.deviceInfo.deviceName if login_data.deviceInfo and login_data.deviceInfo.deviceName else "",
            "fcmToken": login_data.deviceInfo.fcmToken if login_data.deviceInfo and login_data.deviceInfo.fcmToken else ""
        }

        # Save fcmToken and deviceType to personnel_master for mobile push notifications
        if login_data.deviceInfo and login_data.deviceInfo.fcmToken:
            await db[Collections.PERSONNEL_MASTER].update_one(
                {"_id": user["_id"]},
                {
                    "$set": {
                        "fcmToken": login_data.deviceInfo.fcmToken,
                        "deviceType": device_info["deviceType"],
                        "lastLoginAt": get_ist_now()
                    }
                }
            )
            logger.info(f"FCM token saved for user: {user.get('_id')}")

        # Check max sessions limit and remove oldest if exceeded
        existing_sessions = await db[Collections.REFRESH_TOKENS].count_documents({
            "personnelId": user["_id"],
            "isRevoked": False
        })

        if existing_sessions >= settings.MAX_SESSIONS_PER_USER:
            # Revoke oldest session
            oldest_session = await db[Collections.REFRESH_TOKENS].find_one(
                {"personnelId": user["_id"], "isRevoked": False},
                sort=[("createdAt", 1)]
            )
            if oldest_session:
                await db[Collections.REFRESH_TOKENS].update_one(
                    {"_id": oldest_session["_id"]},
                    {"$set": {"isRevoked": True, "revokedAt": get_ist_now(), "revokedReason": "max_sessions_exceeded"}}
                )

        # Store refresh token in database
        refresh_token_record = {
            "personnelId": user["_id"],
            "tokenHash": refresh_token_hash,
            "familyId": family_id,
            "deviceInfo": device_info,
            "ipAddress": request.client.host if request.client else None,
            "expiresAt": get_ist_now() + refresh_token_expires,
            "createdAt": get_ist_now(),
            "lastUsedAt": get_ist_now(),
            "isRevoked": False,
            "revokedAt": None,
            "revokedReason": None
        }

        await db[Collections.REFRESH_TOKENS].insert_one(refresh_token_record)

        token_response = {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "tokenType": "bearer",
            "expiresIn": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
            "refreshExpiresIn": settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
        }

        # Log successful login
        await log_transaction(
            request=request,
            log_code=LogCodes.AUTH_LOGIN_SUCCESS,
            json_values={
                "userId": user.get("userId", ""),
                "personnelId": str(user["_id"]),
                "userName": user.get("name", ""),
                "unitsCount": len(units_array),
                "loginMethod": identifier_type
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=token_response,
                message="Login successful"
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error during login")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.AUTH_LOGIN_FAILED,
            parameters={
                "userId": login_data.userId if login_data.userId else "",
                "phoneNumber": login_data.phoneNumber if login_data.phoneNumber else ""
            },
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Login failed"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.AUTH_LOGIN_FAILED
            )
        )


@router.get(
    "/me",
    status_code=status.HTTP_200_OK,
    summary="Get current user info",
    description="Returns the authenticated user's profile information."
)
async def get_current_user_info(request: Request, current_user=Depends(get_current_user)):
    """
    Get current authenticated user information.

    This endpoint returns the full profile of the authenticated user,
    excluding sensitive fields like password.

    **Authentication:**
    - Requires valid JWT token in Authorization header

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "User info fetched successfully"
    - `data`: User profile object containing:
      - `_id`: User's MongoDB _id
      - `email`: User's email address
      - `name`: Full name
      - `userId`: Police User Identifier
      - `units`: Unit assignments
      - `departmentId`: Department reference
      - `rankId`: Rank reference
      - `roles`: Array of user's role assignments:
        - `roleId`: Role ID
        - `roleName`: Role name
        - `unitId`: Unit ID for this role
        - `unitName`: Unit name for this role
      - Other profile fields (password excluded)

    **Error Responses:**
    - 401: Unauthorized (invalid/expired token)
    - 404: User not found
    - 500: Internal server error
    """
    db = get_database()

    try:
        user = await get_personnel(current_user.id, populate=True)

        if not user:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_USER_NOT_FOUND,
                parameters={"id": current_user.id},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "User not found"
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_USER_NOT_FOUND
                )
            )

        # Convert all ObjectId and datetime fields to JSON-serializable format
        def convert_to_serializable(obj):
            if isinstance(obj, ObjectId):
                return str(obj)
            elif isinstance(obj, datetime):
                return obj.isoformat()
            elif isinstance(obj, dict):
                return {k: convert_to_serializable(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_to_serializable(item) for item in obj]
            return obj

        user = convert_to_serializable(user)

        # Build roles array from token data
        # Two token types:
        # 1. From /login: units: [{unitId, name, roles: [{roleId, name}], designationId}]
        # 2. From /get-auth-token: direct roleId, roleName, unitId, unitName
        roles = []

        # First, try to build from units array (login token)
        if current_user.units:
            for unit in current_user.units:
                if isinstance(unit, dict):
                    unit_id = unit.get("unitId")
                    unit_name = unit.get("name")
                    unit_roles = unit.get("roles", [])
                    for role in unit_roles:
                        if isinstance(role, dict):
                            roles.append({
                                "roleId": role.get("roleId"),
                                "roleName": role.get("name"),
                                "unitId": unit_id,
                                "unitName": unit_name
                            })
                        elif isinstance(role, str):
                            roles.append({
                                "roleId": role,
                                "roleName": None,
                                "unitId": unit_id,
                                "unitName": unit_name
                            })

        # If no roles from units, use direct roleId/roleName from token (get-auth-token)
        if not roles and current_user.roleId:
            roles.append({
                "roleId": current_user.roleId,
                "roleName": current_user.roleName,
                "unitId": current_user.unitId,
                "unitName": current_user.unitName
            })

        user["roles"] = roles

        # Log successful user info fetch
        await log_transaction(
            request=request,
            log_code=LogCodes.AUTH_USER_PROFILE_VIEWED,
            json_values={
                "personnelId": current_user.id,
                "userName": user.get("name", "")
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=user,
                message="User info fetched successfully"
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error fetching user info")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.AUTH_ME_FAILED,
            parameters={"id": current_user.id},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to fetch user info"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.AUTH_ME_FAILED
            )
        )


@router.post(
    "/get-auth-token",
    status_code=status.HTTP_200_OK,
    summary="Get unit-role specific auth token",
    description="Generates a JWT token for a specific unit and role combination."
)
async def get_auth_token(
    request: Request,
    unitId: str = Query(..., description="Unit ID for the token"),
    roleId: str = Query(..., description="Role ID for the token"),
    current_user=Depends(get_current_user)
):
    """
    Generate a simplified auth token for a specific unit and role combination.

    This endpoint validates that the authenticated user has access to the
    specified unitId + roleId combination in user_role_permissions and
    returns a focused token for that context.

    **Authentication:**
    - Requires valid JWT token from /login endpoint

    **Query Parameters:**
    - `unitId` (required): Unit ID to generate token for
    - `roleId` (required): Role ID to generate token for

    **Validation:**
    - User must have a valid mapping in user_role_permissions for the
      specified unitId + roleId combination

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Auth token generated successfully"
    - `data`:
      - `accessToken`: JWT token with unit-role context
      - `tokenType`: "bearer"
      - `expiresIn`: Token expiration time in minutes

    **Token Payload Contains:**
    - `sub`: User's MongoDB _id
    - `id`: User's MongoDB _id
    - `unitId`: Selected unit ID
    - `unitName`: Unit name
    - `roleId`: Selected role ID
    - `roleName`: Role name
    - `districtId`: Unit's district ID
    - `districtName`: District name

    **Error Responses:**
    - 400: Missing unitId or roleId
    - 403: Access denied (no permission mapping found)
    - 500: Internal server error
    """
    db = get_database()

    try:
        # Strip whitespace from parameters
        unitId = unitId.strip() if unitId else ""
        roleId = roleId.strip() if roleId else ""

        # Validate that unitId and roleId are provided
        if not unitId and not roleId:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_MISSING_REQUIRED_FIELDS,
                parameters={},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Unit ID and Role ID are required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_MISSING_REQUIRED_FIELDS
                )
            )
        if not unitId:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_MISSING_UNIT_ID,
                parameters={},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Unit ID is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_MISSING_UNIT_ID
                )
            )
        if not roleId:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_MISSING_ROLE_ID,
                parameters={},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Role ID is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_MISSING_ROLE_ID
                )
            )

        # Try to find the mapping with userId, unitId, roleId as both ObjectId and string
        try:
            unit_id_as_objectid = ObjectId(unitId)
            user_id_as_objectid = ObjectId(current_user.id)
            role_id_as_objectid = ObjectId(roleId)
            user_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
                "userId": {"$in": [current_user.id, user_id_as_objectid]},
                "unitId": {"$in": [unitId, unit_id_as_objectid]},
                "roleId": {"$in": [roleId, role_id_as_objectid]},
                "isDelete": False
            })
        except Exception:
            user_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
                "userId": current_user.id,
                "unitId": unitId,
                "roleId": roleId,
                "isDelete": False
            })

        if not user_mapping:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_ACCESS_DENIED,
                parameters={"unitId": unitId, "roleId": roleId},
                actor_user_id=current_user.id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Access denied"
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content=ResponseBuilder.forbidden(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_ACCESS_DENIED
                )
            )

        # Fetch unit details to get unitName and districtId
        try:
            unit_id_as_objectid = ObjectId(unitId)
            unit_doc = await db[Collections.UNIT].find_one({
                "$or": [
                    {"_id": unit_id_as_objectid, "isDelete": False},
                    {"_id": unitId, "isDelete": False}
                ]
            })
        except Exception:
            unit_doc = await db[Collections.UNIT].find_one({
                "_id": unitId,
                "isDelete": False
            })
        unit_name = unit_doc.get("name", "") if unit_doc else ""
        district_id = unit_doc.get("districtId") if unit_doc else None

        if district_id and isinstance(district_id, ObjectId):
            district_id = str(district_id)

        # Fetch district name from district collection
        district_name = ""
        if district_id:
            try:
                district_doc = await db[Collections.DISTRICT].find_one({
                    "_id": ObjectId(district_id)
                })
                if district_doc:
                    district_name = district_doc.get("name", "")
            except Exception:
                pass

        # Fetch role details to get roleName
        role_doc = await db[Collections.ROLES].find_one({
            "_id": ObjectId(roleId),
            "isDelete": False
        })

        role_name = role_doc.get("name", "") if role_doc else ""

        # Create token with unitId, roleId, id, roleName, unitName, districtId and districtName
        access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

        token_data = {
            "sub": current_user.id,
            "id": current_user.id,
            "unitId": unitId,
            "unitName": unit_name,
            "roleId": roleId,
            "roleName": role_name,
            "districtId": district_id,
            "districtName": district_name
        }

        access_token = create_access_token(
            data=token_data,
            expires_delta=access_token_expires
        )

        token_response = {
            "accessToken": access_token,
            "tokenType": "bearer",
            "expiresIn": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        }

        # Log successful auth token generation
        await log_transaction(
            request=request,
            log_code=LogCodes.AUTH_TOKEN_REFRESHED,
            json_values={
                "personnelId": current_user.id,
                "unitId": unitId,
                "unitName": unit_name,
                "roleId": roleId,
                "roleName": role_name,
                "districtId": district_id or "",
                "districtName": district_name
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=token_response,
                message="Auth token generated successfully"
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error generating auth token")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.AUTH_LOGIN_FAILED,
            parameters={"unitId": unitId if unitId else "", "roleId": roleId if roleId else ""},
            exception=e,
            actor_user_id=current_user.id
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to generate auth token"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.AUTH_LOGIN_FAILED
            )
        )


@router.get(
    "/decode-token",
    status_code=status.HTTP_200_OK,
    summary="Decode JWT token",
    description="Decodes a JWT token and returns its payload for debugging purposes."
)
async def decode_token(
    request: Request,
    token: str = Query(..., description="JWT token to decode")
):
    """
    Decode a JWT token and return its payload data.

    This endpoint is useful for debugging and verifying token contents.
    It validates the token signature and returns the decoded payload.

    **Query Parameters:**
    - `token` (required): JWT token string to decode

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Token decoded successfully"
    - `data`:
      - `payload`: Decoded JWT payload object containing:
        - `sub`: Subject (user ID)
        - `id`: User's MongoDB _id
        - `exp`: Expiration timestamp
        - Other claims based on token type

    **Error Responses:**
    - 400: Invalid token (malformed, expired, or invalid signature)
    """
    try:
        # Decode the token and verify signature
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={"payload": payload},
                message="Token decoded successfully"
            )
        )
    except JWTError as e:
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.AUTH_INVALID_TOKEN,
            parameters={},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or f"Invalid token: {str(e)}"
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=error_message,
                error_code=ErrorCodes.AUTH_INVALID_TOKEN
            )
        )


@router.get(
    "/get-permissions",
    status_code=status.HTTP_200_OK,
    summary="Get user permissions",
    description="Returns consolidated permissions for the user's current unit-role context."
)
async def get_permissions(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Get consolidated permissions for a specific id + unitId + roleId combination.

    This endpoint decodes the provided JWT token (from /get-auth-token endpoint),
    extracts id, unitId, and roleId, and returns consolidated permissions.

    **Authentication:**
    - Requires Bearer token from /get-auth-token endpoint (not /login)
    - Token must contain: id, unitId, roleId

    **Permission Consolidation:**
    - Base: role.permissions (from roles collection)
    - Add: user's additionalPermissions (from user_role_permissions)
    - Remove: user's exclusionPermissions (from user_role_permissions)
    - Result: role.permissions + additionalPermissions - exclusionPermissions

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Permissions fetched successfully"
    - `data`:
      - `id`: User's MongoDB _id
      - `unitId`: Current unit context
      - `roleId`: Current role context
      - `permissions`: Array of consolidated permission objects in
        module -> jobs -> permissions hierarchy format

    **Error Responses:**
    - 400: Invalid token or token missing required fields (id, unitId, roleId)
    - 404: No permission mapping found for user/unit/role combination
    - 404: Role not found
    - 500: Internal server error
    """
    db = get_database()
    token = credentials.credentials

    try:
        # Decode the token to extract id, unitId, and roleId
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM]
            )
        except JWTError as e:
            error_log = await log_error_with_exception(
                request=request,
                error_code=ErrorCodes.AUTH_INVALID_TOKEN,
                parameters={},
                exception=e,
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or f"Invalid token: {str(e)}"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_INVALID_TOKEN
                )
            )

        # Extract id, unitId, and roleId from the token payload
        user_id = payload.get("id")
        unit_id = payload.get("unitId")
        role_id = payload.get("roleId")

        if not user_id or not unit_id or not role_id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_INCOMPLETE_TOKEN,
                parameters={},
                actor_user_id=user_id if user_id else None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Token must contain id, unitId, and roleId. Use /get-auth-token to generate a valid token."
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_INCOMPLETE_TOKEN
                )
            )

        # Find the user_role_permissions record
        try:
            unit_id_as_objectid = ObjectId(unit_id)
            user_id_as_objectid = ObjectId(user_id)
            role_id_as_objectid = ObjectId(role_id)
            user_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
                "userId": {"$in": [user_id, user_id_as_objectid]},
                "unitId": {"$in": [unit_id, unit_id_as_objectid]},
                "roleId": {"$in": [role_id, role_id_as_objectid]},
                "isDelete": False
            })
        except Exception:
            user_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
                "userId": user_id,
                "unitId": unit_id,
                "roleId": role_id,
                "isDelete": False
            })

        if not user_mapping:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_ACCESS_DENIED,
                parameters={"id": user_id, "unitId": unit_id, "roleId": role_id},
                actor_user_id=user_id
            )
            error_message = (error_log or {}).get("resolvedMessage") or f"No permissions found for id '{user_id}', unitId '{unit_id}', roleId '{role_id}'"
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_ACCESS_DENIED
                )
            )

        # Fetch the role to get base permissions
        role = await db[Collections.ROLES].find_one({
            "_id": ObjectId(role_id),
            "isDelete": False
        })

        if not role:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_ROLE_NOT_FOUND,
                parameters={"roleId": role_id},
                actor_user_id=user_id
            )
            error_message = (error_log or {}).get("resolvedMessage") or f"Role with ID '{role_id}' not found"
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_ROLE_NOT_FOUND
                )
            )

        # Get permission arrays
        role_permissions = role.get("permissions", [])
        additional_permissions = user_mapping.get("additionalPermissions", [])
        exclusion_permissions = user_mapping.get("exclusionPermissions", [])

        # Import the consolidation function from user_mapping_service
        from app.api.v1.services.user_mapping_service import _consolidate_permissions

        # Consolidate permissions
        consolidated_permissions = _consolidate_permissions(
            role_permissions,
            additional_permissions,
            exclusion_permissions
        )

        # Enrich permissions with isMenu, displayName, and route from jobs_master
        enriched_permissions = await _enrich_permissions_with_job_data(db, consolidated_permissions)

        permissions_data = {
            "id": user_id,
            "unitId": unit_id,
            "roleId": role_id,
            "permissions": enriched_permissions
        }

        # Log successful permissions fetch
        await log_transaction(
            request=request,
            log_code=LogCodes.AUTH_USER_PROFILE_VIEWED,
            json_values={
                "personnelId": user_id,
                "unitId": unit_id,
                "roleId": role_id,
                "roleName": role.get("name", ""),
                "permissionsCount": len(consolidated_permissions)
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data=permissions_data,
                message="Permissions fetched successfully"
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error fetching permissions")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.AUTH_GET_PERMISSIONS_FAILED,
            parameters={},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to fetch permissions"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.AUTH_GET_PERMISSIONS_FAILED
            )
        )


@router.post(
    "/verify-otp",
    status_code=status.HTTP_200_OK,
    summary="Verify OTP for first-time login",
    description="Verifies the OTP sent during first-time login and returns a session ID for MPIN update."
)
async def verify_otp(request: Request, otp_data: VerifyOTPSchema):
    """
    Verify OTP for first-time login users.

    This endpoint verifies the OTP sent to the user's mobile during first-time login.
    On successful verification, it returns a session ID that must be used to update the MPIN.

    **Request Body (VerifyOTPSchema):**
    - `personnelId` (required): Personnel MongoDB ObjectId from login response
    - `otp` (required): 6-digit OTP received via SMS

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "OTP verified successfully"
    - `data`:
      - `personnelId`: Personnel MongoDB ObjectId
      - `otpSessionId`: Session ID for MPIN update (valid for 10 minutes)

    **Error Responses:**
    - 400: OTP required, invalid format
    - 401: Invalid OTP, OTP expired, OTP already used
    - 404: Personnel not found
    - 500: Internal server error
    """
    db = get_database()

    try:
        # Validate personnelId
        if not otp_data.personnelId or not otp_data.personnelId.strip():
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_MISSING_REQUIRED_FIELDS,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Personnel ID is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_MISSING_REQUIRED_FIELDS
                )
            )

        # Validate OTP format
        otp_cleaned = otp_data.otp.strip() if otp_data.otp else ""
        if not otp_cleaned or not re.match(r'^\d{6}$', otp_cleaned):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.OTP_REQUIRED,
                parameters={},
                actor_user_id=otp_data.personnelId
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Valid 6-digit OTP is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.OTP_REQUIRED
                )
            )

        # Validate personnelId format
        try:
            personnel_oid = ObjectId(otp_data.personnelId.strip())
        except Exception:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_INVALID_USER_ID,
                parameters={"personnelId": otp_data.personnelId},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid Personnel ID format"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_INVALID_USER_ID
                )
            )

        # Check if personnel exists
        user = await db[Collections.PERSONNEL_MASTER].find_one({
            "_id": personnel_oid,
            "isDelete": False
        })
        if not user:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_USER_NOT_FOUND,
                parameters={"personnelId": otp_data.personnelId},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "User not found"
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_USER_NOT_FOUND
                )
            )

        # Find the latest unused OTP for this personnel
        otp_record = await db[Collections.OTP_VERIFICATION].find_one(
            {
                "personnelId": personnel_oid,
                "isUsed": False
            },
            sort=[("createdAt", -1)]
        )

        if not otp_record:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.OTP_NOT_FOUND,
                parameters={"personnelId": otp_data.personnelId},
                actor_user_id=otp_data.personnelId
            )
            error_message = (error_log or {}).get("resolvedMessage") or "No active OTP found. Please request a new OTP."
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.OTP_NOT_FOUND
                )
            )

        # Check if OTP is expired
        current_time = get_ist_now()
        if current_time > otp_record["validTill"]:
            # Mark OTP as used
            await db[Collections.OTP_VERIFICATION].update_one(
                {"_id": otp_record["_id"]},
                {"$set": {"isUsed": True}}
            )
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.OTP_EXPIRED,
                parameters={"personnelId": otp_data.personnelId},
                actor_user_id=otp_data.personnelId
            )
            error_message = (error_log or {}).get("resolvedMessage") or "OTP has expired. Please request a new OTP."
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.OTP_EXPIRED
                )
            )

        # Verify OTP
        if otp_record["otp"] != otp_cleaned:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.OTP_INVALID,
                parameters={"personnelId": otp_data.personnelId},
                actor_user_id=otp_data.personnelId
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid OTP"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.OTP_INVALID
                )
            )

        # OTP verified - generate session ID for MPIN update
        otp_session_id = secrets.token_urlsafe(32)
        session_expiry = get_ist_now() + timedelta(minutes=10)

        # Update OTP record with verification status and session
        await db[Collections.OTP_VERIFICATION].update_one(
            {"_id": otp_record["_id"]},
            {
                "$set": {
                    "isVerified": True,
                    "verifiedAt": current_time,
                    "otpSessionId": otp_session_id,
                    "sessionValidTill": session_expiry
                }
            }
        )

        logger.info(f"OTP verified successfully for personnel: {otp_data.personnelId}")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "personnelId": otp_data.personnelId,
                    "otpSessionId": otp_session_id,
                    "sessionExpiryMinutes": 10
                },
                message="OTP verified successfully. Please set your new MPIN."
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error verifying OTP")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.OTP_VERIFY_FAILED,
            parameters={"personnelId": otp_data.personnelId if otp_data.personnelId else ""},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "OTP verification failed"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.OTP_VERIFY_FAILED
            )
        )


@router.post(
    "/update-mpin",
    status_code=status.HTTP_200_OK,
    summary="Update MPIN after OTP verification",
    description="Updates the user's MPIN after successful OTP verification for first-time login."
)
async def update_mpin(request: Request, mpin_data: UpdateMPINSchema):
    """
    Update MPIN after OTP verification.

    This endpoint allows users to set their new MPIN after OTP verification.
    The otpSessionId from verify-otp response must be provided.

    **Request Body (UpdateMPINSchema):**
    - `personnelId` (required): Personnel MongoDB ObjectId
    - `otpSessionId` (required): Session ID from verify-otp response
    - `newMpin` (required): New 4-digit MPIN (integer)

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "MPIN updated successfully"
    - `data`:
      - `personnelId`: Personnel MongoDB ObjectId

    **Side Effects:**
    - Updates MPIN in personnel_master
    - Sets isFirstTime to false
    - Marks OTP session as used

    **Error Responses:**
    - 400: Missing fields, invalid MPIN format, session invalid/expired
    - 404: Personnel not found
    - 500: Internal server error
    """
    db = get_database()

    try:
        # Validate personnelId
        if not mpin_data.personnelId or not mpin_data.personnelId.strip():
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_MISSING_REQUIRED_FIELDS,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Personnel ID is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_MISSING_REQUIRED_FIELDS
                )
            )

        # Validate otpSessionId
        if not mpin_data.otpSessionId or not mpin_data.otpSessionId.strip():
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.OTP_SESSION_REQUIRED,
                parameters={},
                actor_user_id=mpin_data.personnelId
            )
            error_message = (error_log or {}).get("resolvedMessage") or "OTP session ID is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.OTP_SESSION_REQUIRED
                )
            )

        # Validate MPIN format (4 digits: 1000-9999)
        try:
            new_mpin_value = int(str(mpin_data.newMpin).strip())
            if new_mpin_value < 1000 or new_mpin_value > 9999:
                raise ValueError("MPIN out of range")
        except (ValueError, TypeError):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_MPIN_INVALID_FORMAT,
                parameters={},
                actor_user_id=mpin_data.personnelId
            )
            error_message = (error_log or {}).get("resolvedMessage") or "MPIN must be exactly 4 digits (1000-9999)"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_MPIN_INVALID_FORMAT
                )
            )

        # Validate personnelId format
        try:
            personnel_oid = ObjectId(mpin_data.personnelId.strip())
        except Exception:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_INVALID_USER_ID,
                parameters={"personnelId": mpin_data.personnelId},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid Personnel ID format"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_INVALID_USER_ID
                )
            )

        # Check if personnel exists
        user = await db[Collections.PERSONNEL_MASTER].find_one({
            "_id": personnel_oid,
            "isDelete": False
        })
        if not user:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_USER_NOT_FOUND,
                parameters={"personnelId": mpin_data.personnelId},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "User not found"
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_USER_NOT_FOUND
                )
            )

        # Verify OTP session
        otp_session = await db[Collections.OTP_VERIFICATION].find_one({
            "personnelId": personnel_oid,
            "otpSessionId": mpin_data.otpSessionId.strip(),
            "isVerified": True,
            "isUsed": False
        })

        if not otp_session:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.OTP_SESSION_INVALID,
                parameters={"personnelId": mpin_data.personnelId},
                actor_user_id=mpin_data.personnelId
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid or expired OTP session. Please verify OTP again."
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.OTP_SESSION_INVALID
                )
            )

        # Check if session is expired
        current_time = get_ist_now()
        if current_time > otp_session.get("sessionValidTill", current_time):
            # Mark session as used
            await db[Collections.OTP_VERIFICATION].update_one(
                {"_id": otp_session["_id"]},
                {"$set": {"isUsed": True}}
            )
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.OTP_SESSION_EXPIRED,
                parameters={"personnelId": mpin_data.personnelId},
                actor_user_id=mpin_data.personnelId
            )
            error_message = (error_log or {}).get("resolvedMessage") or "OTP session has expired. Please verify OTP again."
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.OTP_SESSION_EXPIRED
                )
            )

        # Update MPIN and set isFirstTime to false
        update_result = await db[Collections.PERSONNEL_MASTER].update_one(
            {"_id": personnel_oid},
            {
                "$set": {
                    "mpin": new_mpin_value,
                    "isFirstTime": False,
                    "updatedAt": current_time,
                    "updatedIp": request.client.host if request.client else None
                }
            }
        )

        if update_result.modified_count == 0:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.MPIN_UPDATE_FAILED,
                parameters={"personnelId": mpin_data.personnelId},
                actor_user_id=mpin_data.personnelId
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Failed to update MPIN"
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content=ResponseBuilder.server_error(
                    message=error_message,
                    error_code=ErrorCodes.MPIN_UPDATE_FAILED
                )
            )

        # Mark OTP session as used
        await db[Collections.OTP_VERIFICATION].update_one(
            {"_id": otp_session["_id"]},
            {"$set": {"isUsed": True, "usedAt": current_time}}
        )

        logger.info(f"MPIN updated successfully for personnel: {mpin_data.personnelId}")

        # Log successful MPIN update
        await log_transaction(
            request=request,
            log_code=LogCodes.AUTH_LOGIN_SUCCESS,
            json_values={
                "personnelId": mpin_data.personnelId,
                "action": "MPIN_UPDATE",
                "isFirstTime": False
            },
            level="info"
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "personnelId": mpin_data.personnelId,
                    "message": "MPIN updated successfully"
                },
                message="MPIN updated successfully. You can now login with your new MPIN."
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error updating MPIN")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.MPIN_UPDATE_FAILED,
            parameters={"personnelId": mpin_data.personnelId if mpin_data.personnelId else ""},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "MPIN update failed"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.MPIN_UPDATE_FAILED
            )
        )


# =========================================================================
# Refresh Token & Session Management Endpoints
# =========================================================================

@router.post(
    "/refresh-token",
    status_code=status.HTTP_200_OK,
    summary="Refresh access token",
    description="Exchange a valid refresh token for new access and refresh tokens."
)
async def refresh_token(request: Request, token_data: RefreshTokenSchema):
    """
    Refresh access token using a valid refresh token.

    This endpoint implements token rotation - each refresh token can only be used once.
    A new refresh token is issued with each request.

    **Request Body:**
    - `refreshToken` (required): Current refresh token

    **Response:**
    - New access token and refresh token
    - Old refresh token is invalidated

    **Security Features:**
    - Token rotation (one-time use refresh tokens)
    - Token family tracking for reuse detection
    - Automatic session cleanup
    """
    db = get_database()

    try:
        # Validate refresh token
        if not token_data.refreshToken or not token_data.refreshToken.strip():
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.REFRESH_TOKEN_REQUIRED,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Refresh token is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.REFRESH_TOKEN_REQUIRED
                )
            )

        # Decode and validate refresh token JWT
        refresh_payload = decode_refresh_token(token_data.refreshToken)
        if not refresh_payload:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.REFRESH_TOKEN_INVALID,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid or expired refresh token"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.REFRESH_TOKEN_INVALID
                )
            )

        personnel_id = refresh_payload.get("personnelId")
        family_id = refresh_payload.get("familyId")

        if not personnel_id or not family_id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.REFRESH_TOKEN_INVALID,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid refresh token claims"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.REFRESH_TOKEN_INVALID
                )
            )

        # Hash the token to find it in database
        token_hash = hash_token(token_data.refreshToken)

        # Find token in database
        stored_token = await db[Collections.REFRESH_TOKENS].find_one({
            "tokenHash": token_hash,
            "familyId": family_id
        })

        if not stored_token:
            # Token not found - might be reuse attack
            # Revoke all tokens in this family as precaution
            await db[Collections.REFRESH_TOKENS].update_many(
                {"familyId": family_id},
                {"$set": {"isRevoked": True, "revokedAt": get_ist_now(), "revokedReason": "token_reuse_detected"}}
            )
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.REFRESH_TOKEN_REUSED,
                parameters={"familyId": family_id},
                actor_user_id=personnel_id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Refresh token reuse detected. All sessions have been revoked for security."
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.REFRESH_TOKEN_REUSED
                )
            )

        # Check if token is revoked
        if stored_token.get("isRevoked"):
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.REFRESH_TOKEN_REVOKED,
                parameters={},
                actor_user_id=personnel_id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Refresh token has been revoked"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.REFRESH_TOKEN_REVOKED
                )
            )

        # Check if token is expired
        if get_ist_now() > stored_token.get("expiresAt"):
            await db[Collections.REFRESH_TOKENS].update_one(
                {"_id": stored_token["_id"]},
                {"$set": {"isRevoked": True, "revokedAt": get_ist_now(), "revokedReason": "expired"}}
            )
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.REFRESH_TOKEN_EXPIRED,
                parameters={},
                actor_user_id=personnel_id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Refresh token has expired"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.REFRESH_TOKEN_EXPIRED
                )
            )

        # Get user data
        try:
            personnel_oid = ObjectId(personnel_id)
        except Exception:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.REFRESH_TOKEN_INVALID,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid personnel ID in token"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.REFRESH_TOKEN_INVALID
                )
            )

        user = await db[Collections.PERSONNEL_MASTER].find_one({
            "_id": personnel_oid,
            "isDelete": False
        })

        if not user:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_USER_NOT_FOUND,
                parameters={"personnelId": personnel_id},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "User not found"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_USER_NOT_FOUND
                )
            )

        # Revoke old refresh token (token rotation)
        await db[Collections.REFRESH_TOKENS].update_one(
            {"_id": stored_token["_id"]},
            {"$set": {"isRevoked": True, "revokedAt": get_ist_now(), "revokedReason": "rotated"}}
        )

        # Fetch unit-role combinations for new access token
        user_id_str = str(user["_id"])
        user_mappings = await db[Collections.USER_ROLE_PERMISSIONS].find({
            "userId": {"$in": [user_id_str, user["_id"]]},
            "isDelete": False
        }).to_list(length=None)

        # Build units array
        unit_roles_dict = {}
        for mapping in user_mappings:
            unit_id_str = str(mapping["unitId"]) if isinstance(mapping["unitId"], ObjectId) else mapping["unitId"]
            role_id = str(mapping["roleId"]) if isinstance(mapping["roleId"], ObjectId) else mapping["roleId"]

            if unit_id_str not in unit_roles_dict:
                unit_roles_dict[unit_id_str] = {
                    "unitId": unit_id_str,
                    "name": None,
                    "roles": [],
                    "designationId": None
                }
            unit_roles_dict[unit_id_str]["roles"].append(role_id)

        # Fetch unit and role names
        for unit_id_str, unit_data in unit_roles_dict.items():
            unit_doc = await db[Collections.UNIT].find_one({"_id": ObjectId(unit_id_str), "isDelete": False})
            if unit_doc:
                unit_data["name"] = unit_doc.get("name", "")

            roles_with_names = []
            for role_id in unit_data["roles"]:
                role_doc = await db[Collections.ROLES].find_one({"_id": ObjectId(role_id), "isDelete": False})
                if role_doc:
                    roles_with_names.append({"roleId": role_id, "name": role_doc.get("name", "")})
            unit_data["roles"] = roles_with_names

        units_array = list(unit_roles_dict.values())

        # Create new access token
        access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token_data = {
            "sub": str(user["_id"]),
            "id": str(user["_id"]),
            "userId": user.get("userId"),
            "fullName": user.get("name"),
            "units": units_array
        }
        new_access_token = create_access_token(data=access_token_data, expires_delta=access_token_expires)

        # Create new refresh token (same family for rotation tracking)
        refresh_token_expires = timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        new_refresh_token_data = {
            "sub": str(user["_id"]),
            "personnelId": str(user["_id"]),
            "familyId": family_id  # Keep same family ID
        }
        new_refresh_token = create_refresh_token_jwt(data=new_refresh_token_data, expires_delta=refresh_token_expires)
        new_refresh_token_hash = hash_token(new_refresh_token)

        # Store new refresh token
        new_refresh_record = {
            "personnelId": user["_id"],
            "tokenHash": new_refresh_token_hash,
            "familyId": family_id,
            "deviceInfo": stored_token.get("deviceInfo", {}),
            "ipAddress": request.client.host if request.client else None,
            "expiresAt": get_ist_now() + refresh_token_expires,
            "createdAt": get_ist_now(),
            "lastUsedAt": get_ist_now(),
            "isRevoked": False,
            "revokedAt": None,
            "revokedReason": None
        }
        await db[Collections.REFRESH_TOKENS].insert_one(new_refresh_record)

        logger.info(f"Token refreshed successfully for personnel: {personnel_id}")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "accessToken": new_access_token,
                    "refreshToken": new_refresh_token,
                    "tokenType": "bearer",
                    "expiresIn": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
                    "refreshExpiresIn": settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS
                },
                message="Token refreshed successfully"
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error refreshing token")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.REFRESH_TOKEN_FAILED,
            parameters={},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Token refresh failed"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.REFRESH_TOKEN_FAILED
            )
        )


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Logout user",
    description="Revokes the refresh token and logs out the user from the current session."
)
async def logout(request: Request, logout_data: LogoutSchema):
    """
    Logout user by revoking their refresh token.

    This endpoint revokes the provided refresh token, effectively logging
    out the user from the current session/device.

    **Request Body:**
    - `refreshToken` (required): Refresh token to revoke

    **Note:**
    - The access token will remain valid until it expires (15 minutes)
    - For immediate access revocation, implement token blacklisting
    """
    db = get_database()

    try:
        if not logout_data.refreshToken or not logout_data.refreshToken.strip():
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.REFRESH_TOKEN_REQUIRED,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Refresh token is required"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.REFRESH_TOKEN_REQUIRED
                )
            )

        # Hash the token to find it
        token_hash = hash_token(logout_data.refreshToken)

        # Find and revoke the token
        result = await db[Collections.REFRESH_TOKENS].update_one(
            {"tokenHash": token_hash, "isRevoked": False},
            {"$set": {"isRevoked": True, "revokedAt": get_ist_now(), "revokedReason": "logout"}}
        )

        if result.modified_count == 0:
            # Token not found or already revoked - still return success for security
            logger.warning("Logout attempted with invalid or already revoked token")

        logger.info("User logged out successfully")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={"message": "Logged out successfully"},
                message="Logged out successfully"
            )
        )

    except Exception as e:
        logger.exception("Error during logout")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.LOGOUT_FAILED,
            parameters={},
            exception=e,
            actor_user_id=None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Logout failed"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.LOGOUT_FAILED
            )
        )


@router.post(
    "/logout-all",
    status_code=status.HTTP_200_OK,
    summary="Logout from all devices",
    description="Revokes all refresh tokens for the authenticated user, logging out from all sessions."
)
async def logout_all(
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Logout user from all devices/sessions.

    This endpoint revokes all refresh tokens for the authenticated user,
    effectively logging them out from all devices.

    **Authentication:** Required (Bearer token)

    **Use Cases:**
    - User suspects account compromise
    - User wants to sign out everywhere
    - Password change (should auto-trigger this)
    """
    db = get_database()

    try:
        personnel_id = current_user.id
        if not personnel_id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_TOKEN_INVALID,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid token"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_TOKEN_INVALID
                )
            )

        try:
            personnel_oid = ObjectId(personnel_id)
        except Exception:
            personnel_oid = personnel_id

        # Revoke all refresh tokens for this user
        result = await db[Collections.REFRESH_TOKENS].update_many(
            {"personnelId": personnel_oid, "isRevoked": False},
            {"$set": {"isRevoked": True, "revokedAt": get_ist_now(), "revokedReason": "logout_all"}}
        )

        logger.info(f"Logged out from all devices. Revoked {result.modified_count} sessions for user: {personnel_id}")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "message": "Logged out from all devices successfully",
                    "sessionsRevoked": result.modified_count
                },
                message="Logged out from all devices successfully"
            )
        )

    except Exception as e:
        logger.exception("Error during logout-all")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.LOGOUT_FAILED,
            parameters={},
            exception=e,
            actor_user_id=current_user.id if current_user else None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Logout from all devices failed"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.LOGOUT_FAILED
            )
        )


@router.get(
    "/sessions",
    status_code=status.HTTP_200_OK,
    summary="List active sessions",
    description="Returns a list of all active sessions/devices for the authenticated user."
)
async def list_sessions(
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    List all active sessions for the authenticated user.

    Returns information about each active session including device info,
    IP address, and last activity time.

    **Authentication:** Required (Bearer token)
    """
    db = get_database()

    try:
        personnel_id = current_user.id
        if not personnel_id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_TOKEN_INVALID,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid token"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_TOKEN_INVALID
                )
            )

        try:
            personnel_oid = ObjectId(personnel_id)
        except Exception:
            personnel_oid = personnel_id

        # Get current request's token hash for marking current session
        auth_header = request.headers.get("authorization", "")
        current_token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""

        # Find all active sessions
        sessions_cursor = db[Collections.REFRESH_TOKENS].find({
            "personnelId": personnel_oid,
            "isRevoked": False,
            "expiresAt": {"$gt": get_ist_now()}
        }).sort("lastUsedAt", -1)

        sessions = []
        async for session in sessions_cursor:
            sessions.append({
                "sessionId": str(session["_id"]),
                "deviceInfo": session.get("deviceInfo", {}),
                "ipAddress": session.get("ipAddress"),
                "lastUsedAt": session.get("lastUsedAt"),
                "createdAt": session.get("createdAt"),
                "isCurrent": False  # We can't easily determine this without storing access token info
            })

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={
                    "sessions": sessions,
                    "totalSessions": len(sessions)
                },
                message="Sessions retrieved successfully"
            )
        )

    except Exception as e:
        logger.exception("Error listing sessions")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message="Failed to retrieve sessions",
                error_code=ErrorCodes.AUTH_LOGIN_FAILED
            )
        )


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_200_OK,
    summary="Revoke specific session",
    description="Revokes a specific session by its ID, logging out that device."
)
async def revoke_session(
    request: Request,
    session_id: str,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Revoke a specific session by ID.

    Allows users to remotely log out from a specific device/session.

    **Authentication:** Required (Bearer token)

    **Path Parameters:**
    - `session_id`: The session ID to revoke
    """
    db = get_database()

    try:
        personnel_id = current_user.id
        if not personnel_id:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.AUTH_TOKEN_INVALID,
                parameters={},
                actor_user_id=None
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid token"
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=error_message,
                    error_code=ErrorCodes.AUTH_TOKEN_INVALID
                )
            )

        try:
            personnel_oid = ObjectId(personnel_id)
            session_oid = ObjectId(session_id)
        except Exception:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.SESSION_NOT_FOUND,
                parameters={"sessionId": session_id},
                actor_user_id=personnel_id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Invalid session ID"
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=error_message,
                    error_code=ErrorCodes.SESSION_NOT_FOUND
                )
            )

        # Find and revoke the session (only if it belongs to current user)
        result = await db[Collections.REFRESH_TOKENS].update_one(
            {
                "_id": session_oid,
                "personnelId": personnel_oid,
                "isRevoked": False
            },
            {"$set": {"isRevoked": True, "revokedAt": get_ist_now(), "revokedReason": "user_revoked"}}
        )

        if result.modified_count == 0:
            error_log = await log_error(
                request=request,
                error_code=ErrorCodes.SESSION_NOT_FOUND,
                parameters={"sessionId": session_id},
                actor_user_id=personnel_id
            )
            error_message = (error_log or {}).get("resolvedMessage") or "Session not found or already revoked"
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=error_message,
                    error_code=ErrorCodes.SESSION_NOT_FOUND
                )
            )

        logger.info(f"Session {session_id} revoked by user {personnel_id}")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=api_success(
                data={"sessionId": session_id, "message": "Session revoked successfully"},
                message="Session revoked successfully"
            )
        )

    except Exception as e:
        logger.exception("Error revoking session")
        error_log = await log_error_with_exception(
            request=request,
            error_code=ErrorCodes.SESSION_REVOKE_FAILED,
            parameters={"sessionId": session_id},
            exception=e,
            actor_user_id=current_user.id if current_user else None
        )
        error_message = (error_log or {}).get("resolvedMessage") or "Failed to revoke session"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=error_message,
                error_code=ErrorCodes.SESSION_REVOKE_FAILED
            )
        )
