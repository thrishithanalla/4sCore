"""
Auth Router
Provides API endpoints for Authentication
Routes: /api/v1/auth
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from bson import ObjectId
from jose import jwt, JWTError

from app.schemas.auth_schema import LoginSchema, TokenSchema
from app.core.database import get_database
from app.core.config import settings
from app.utils.security import verify_password, create_access_token
from app.utils.dependencies import get_current_user
from app.utils.standard_response import (
    ResponseBuilder,
    api_success
)
from app.constants.api_constants import (
    ErrorCodes,
    ErrorMessages
)
from app.constants.collections import Collections
from app.utils.error_messages import get_auth_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
security = HTTPBearer()

# Module configuration
MODULE_PREFIX = "AUTH"


def _error_code(code: str) -> str:
    """Generate error code with module prefix"""
    return ErrorCodes.with_prefix(MODULE_PREFIX, code)


async def _enrich_permissions_with_job_data(db, permissions: list) -> list:
    """
    Enrich permissions with job display data and module description.

    - isMenu, displayOrder: From role's permission structure
    - displayName, route: From jobs_master collection
    - moduleDescription: From modules_master collection

    Args:
        db: Database instance
        permissions: List of permission modules with structure:
            [{moduleId, moduleName, jobs: [{jobName, isMenu, displayOrder, permissions}]}]

    Returns:
        Enriched permissions with displayName, route from jobs_master and moduleDescription from modules_master
    """
    if not permissions:
        return permissions

    # Collect all unique job names to fetch displayName and route from jobs_master
    job_names = set()
    # Collect all unique module IDs to fetch description from modules_master
    module_ids = set()
    for module in permissions:
        module_id = module.get("moduleId")
        if module_id:
            module_ids.add(module_id)
        for job in module.get("jobs", []):
            job_name = job.get("jobName")
            if job_name:
                job_names.add(job_name)

    # Fetch displayName and route from jobs_master
    job_data_map = {}
    if job_names:
        jobs_data = await db[Collections.JOBS].find(
            {"name": {"$in": list(job_names)}, "isDelete": False},
            {"name": 1, "displayName": 1, "route": 1}
        ).to_list(length=None)

        # Create lookup map: jobName -> {displayName, route}
        job_data_map = {
            job["name"]: {
                "displayName": job.get("displayName", ""),
                "route": job.get("route", "")
            }
            for job in jobs_data
        }

    # Fetch description from modules_master
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
                {"_id": 1, "description": 1}
            ).to_list(length=None)

            # Create lookup map: moduleId (string) -> description
            module_data_map = {
                str(mod["_id"]): mod.get("description", "")
                for mod in modules_data
            }

    # Enrich permissions
    enriched_permissions = []
    for module in permissions:
        enriched_module = {**module}
        module_id = module.get("moduleId")

        # Add moduleDescription from modules_master
        enriched_module["moduleDescription"] = module_data_map.get(module_id, "")

        enriched_jobs = []

        for job in module.get("jobs", []):
            job_name = job.get("jobName")

            # Get displayName and route from jobs_master
            job_data = job_data_map.get(job_name, {})

            # Build enriched job with consistent field order
            # isMenu and displayOrder from role (with defaults for backward compatibility)
            # displayName and route from jobs_master
            enriched_job = {
                "jobName": job_name,
                "isMenu": job.get("isMenu", True),
                "displayOrder": job.get("displayOrder", 1),
                "permissions": job.get("permissions", []),
                "displayName": job_data.get("displayName", ""),
                "route": job_data.get("route", "")
            }

            enriched_jobs.append(enriched_job)

        enriched_module["jobs"] = enriched_jobs
        enriched_permissions.append(enriched_module)

    return enriched_permissions




@router.post("/login")
async def login(login_data: LoginSchema):
    """
    Authenticate user and return JWT access token

    User can login using:
    - userId + password
    """
    db = get_database()

    try:
        # Build query based on provided credentials
        query = {"isDelete": False}

        # Validate userId is provided and not empty
        if not login_data.userId or not login_data.userId.strip():
            logger.warning("Login attempt with empty userId")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=get_auth_message("user_id_required"),
                    error_code=_error_code("INVALID_USER_ID")
                )
            )

        query["userId"] = login_data.userId.strip()
        logger.info(f"Login attempt for userId: {login_data.userId.strip()}")
        logger.debug(f"Query: {query}, Collection: {Collections.PERSONNEL_MASTER}")

        # Find user in database using personnel_master collection
        user = await db[Collections.PERSONNEL_MASTER].find_one(query)

        if not user:
            logger.warning(f"User not found for userId: {login_data.userId.strip()}")
            # Check if user exists but is deleted
            deleted_user = await db[Collections.PERSONNEL_MASTER].find_one({"userId": login_data.userId.strip()})
            if deleted_user:
                # User exists but is deleted
                logger.warning(f"User exists but isDelete={deleted_user.get('isDelete', 'not set')}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content=ResponseBuilder.unauthorized(
                        message=get_auth_message("userid_deleted"),
                        error_code=_error_code("USER_DELETED")
                    )
                )
            # User does not exist at all
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=get_auth_message("userid_not_found"),
                    error_code=_error_code("USER_NOT_FOUND")
                )
            )

        logger.info(f"User found: {user.get('_id')}, name: {user.get('name')}")

        # Verify password
        if not verify_password(login_data.password, user["password"]):
            logger.warning(f"Password verification failed for userId: {login_data.userId.strip()}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content=ResponseBuilder.unauthorized(
                    message=get_auth_message("invalid_credentials"),
                    error_code=_error_code("INVALID_CREDENTIALS")
                )
            )

        logger.info(f"Password verified successfully for userId: {login_data.userId.strip()}")

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

        token_response = {
            "accessToken": access_token,
            "tokenType": "bearer",
            "expiresIn": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        }

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
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.INTERNAL)
            )
        )


@router.get("/me")
async def get_current_user_info(current_user=Depends(get_current_user)):
    """
    Get current authenticated user information with populated nested data.

    Returns personnel data with nested objects for:
    - department: {_id, name}
    - rank: {_id, name}
    - units: [{unitId, designationId, unit: {_id, name, policeReferenceId}, designation: {_id, name, designationCd}}]
    """
    from app.services.personnel_master_service import get_personnel

    try:
        # Use existing service function to get personnel with populated nested data
        user = await get_personnel(current_user.id, populate=True)

        if not user:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message="User not found",
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )

        # Check if user is deleted
        if user.get("isDelete", False):
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message="User not found",
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
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
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.INTERNAL)
            )
        )


@router.post("/get-auth-token")
async def get_auth_token(
    unitId: str = Query(..., description="Unit ID for the token"),
    roleId: str = Query(..., description="Role ID for the token"),
    current_user=Depends(get_current_user)
):
    """
    Generate a simplified auth token for a specific unit and role combination.

    This endpoint validates that the authenticated user has access to the
    specified unitId + roleId combination and returns a token containing:
    - unitId (from query parameter)
    - roleId (from query parameter)
    - userId (from authenticated user's _id)
    - roleName (fetched from roles collection)
    - unitName (fetched from unit collection)
    - district (fetched from unit collection)
    """
    db = get_database()

    try:
        # Strip whitespace from parameters
        unitId = unitId.strip() if unitId else ""
        roleId = roleId.strip() if roleId else ""

        # Validate that unitId and roleId are provided
        if not unitId and not roleId:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=get_auth_message("unitid_roleid_required"),
                    error_code=_error_code("MISSING_REQUIRED_FIELDS")
                )
            )
        if not unitId:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=get_auth_message("unitid_required"),
                    error_code=_error_code("MISSING_UNIT_ID")
                )
            )
        if not roleId:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=get_auth_message("roleid_required"),
                    error_code=_error_code("MISSING_ROLE_ID")
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
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content=ResponseBuilder.forbidden(
                    message=get_auth_message("access_denied"),
                    error_code=_error_code("ACCESS_DENIED")
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
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.INTERNAL)
            )
        )


@router.get("/decode-token")
async def decode_token(
    token: str = Query(..., description="JWT token to decode")
):
    """
    Decode a JWT token and return its payload data.

    This is useful for debugging and verifying token contents.

    - **token**: JWT token string to decode
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
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ResponseBuilder.bad_request(
                message=f"Invalid token: {str(e)}",
                error_code=_error_code("INVALID_TOKEN")
            )
        )


@router.get("/get-permissions")
async def get_permissions(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Get consolidated permissions for a specific id + unitId + roleId combination.

    This endpoint decodes the provided JWT token (from /get-auth-token endpoint),
    extracts id, unitId, and roleId, and returns consolidated permissions
    (role.permissions + additionalPermissions - exclusionPermissions).

    Requires Bearer token in Authorization header.

    Returns:
        Consolidated permissions in module -> jobs -> permissions hierarchy format
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
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message=f"Invalid token: {str(e)}",
                    error_code=_error_code("INVALID_TOKEN")
                )
            )

        # Extract id, unitId, and roleId from the token payload
        user_id = payload.get("id")
        unit_id = payload.get("unitId")
        role_id = payload.get("roleId")

        if not user_id or not unit_id or not role_id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ResponseBuilder.bad_request(
                    message="Token must contain id, unitId, and roleId. Use /get-auth-token to generate a valid token.",
                    error_code=_error_code("INCOMPLETE_TOKEN")
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
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=f"No permissions found for id '{user_id}', unitId '{unit_id}', roleId '{role_id}'",
                    error_code=_error_code(ErrorCodes.NOT_FOUND)
                )
            )

        # Fetch the role to get base permissions
        role = await db[Collections.ROLES].find_one({
            "_id": ObjectId(role_id),
            "isDelete": False
        })

        if not role:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content=ResponseBuilder.not_found(
                    message=f"Role with ID '{role_id}' not found",
                    error_code=_error_code("ROLE_NOT_FOUND")
                )
            )

        # Get permission arrays
        role_permissions = role.get("permissions", [])
        additional_permissions = user_mapping.get("additionalPermissions", [])
        exclusion_permissions = user_mapping.get("exclusionPermissions", [])

        # Import the consolidation function from user_mapping_service
        from app.services.user_mapping_service import _consolidate_permissions

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
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ResponseBuilder.server_error(
                message=ErrorMessages.UNEXPECTED_ERROR,
                error_code=_error_code(ErrorCodes.INTERNAL)
            )
        )
