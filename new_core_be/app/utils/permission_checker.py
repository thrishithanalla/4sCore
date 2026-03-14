"""
Permission Checker
RBAC (Role-Based Access Control) utility functions for checking user permissions
"""
import logging
from typing import Optional
from fastapi import Request, HTTPException, status
from bson import ObjectId
from jose import jwt, JWTError

from app.core.database import get_database
from app.core.config import settings
from app.api.v1.utils.response_helpers import error_response
from app.constants.collections import Collections

logger = logging.getLogger(__name__)


async def get_user_info_from_request(request: Request) -> dict:
    """
    Extract user information from JWT token in request

    Args:
        request: FastAPI Request object

    Returns:
        Dict containing user info: {
            "_id": str,
            "id": str,
            "userId": str,
            "role": str (roleName),
            "roleId": str,
            "unitId": str,
            "districtId": str,
            "fullName": str
        }

    Raises:
        HTTPException: If token is missing or invalid
    """
    # Extract token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_response(
                error_code="ERR.AUTH.TOKEN.MISSING",
                message="Authorization token is required",
                code=401
            )
        )

    token = auth_header.split(" ")[1]

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_response(
                error_code="ERR.AUTH.TOKEN.INVALID",
                message="Invalid or expired token",
                code=401
            )
        )

    return {
        "_id": payload.get("id"),
        "id": payload.get("id"),
        "userId": payload.get("userId"),
        "role": payload.get("roleName", ""),
        "roleId": payload.get("roleId"),
        "unitId": payload.get("unitId"),
        "unitName": payload.get("unitName"),
        "districtId": payload.get("districtId"),
        "districtName": payload.get("districtName"),
        "fullName": payload.get("fullName")
    }


async def get_user_id_from_request(request: Request) -> str:
    """
    Extract user ID from JWT token in request

    Args:
        request: FastAPI Request object

    Returns:
        User ID string

    Raises:
        HTTPException: If token is missing or invalid
    """
    user_info = await get_user_info_from_request(request)
    return user_info.get("id", "")


async def check_job_permission(
    request: Request,
    job_name: str,
    permission: str
) -> bool:
    """
    Check if the current user has a specific permission for a job.

    Permission Formula:
    Final Permissions = (Base Role Permissions + Additional Permissions) - Exclusion Permissions

    Args:
        request: FastAPI Request object
        job_name: Resource identifier (e.g., "permissions", "roles", "units")
        permission: Action type: "CREATE", "READ", "UPDATE", "DELETE", or custom

    Returns:
        True if user has the permission, False otherwise
    """
    db = get_database()

    # Get user info from token
    user_info = await get_user_info_from_request(request)
    user_id = user_info.get("id")
    role_id = user_info.get("roleId")
    unit_id = user_info.get("unitId")

    # If no roleId in token, user doesn't have permissions set up
    if not role_id:
        return False

    # Fetch the role to get base permissions
    try:
        role = await db[Collections.ROLES].find_one({
            "_id": ObjectId(role_id),
            "isDelete": False
        })
        print(f"[PERM DEBUG] role_id: {role_id}, role found: {role is not None}")
    except Exception as e:
        print(f"[PERM DEBUG] Error fetching role: {e}")
        return False

    if not role:
        print(f"[PERM DEBUG] Role not found for role_id: {role_id}")
        return False

    # Get base permissions from role
    
    role_permissions = role.get("permissions", [])
    print(f"[PERM DEBUG] job_name: {job_name}, permission: {permission}, role has {len(role_permissions)} modules")

    # Check if the user has the specific permission in the role
    # Role structure: [{moduleId, moduleName, jobs: [{jobName, permissions: [{name, isSelf}]}]}]
    has_base_permission = False
    for module in role_permissions:
        jobs = module.get("jobs", [])
        for job in jobs:
            if job.get("jobName", "").upper() == job_name.upper():
                perms = job.get("permissions", [])
                for perm in perms:
                    # Handle both string and dict permission formats
                    if isinstance(perm, dict):
                        perm_name = perm.get("name", "")
                    else:
                        perm_name = str(perm)

                    if perm_name.upper() == permission.upper():
                        has_base_permission = True
                        print(f"[PERM DEBUG] FOUND match: job={job_name}, perm={permission}")
                        break
                if has_base_permission:
                    break
        if has_base_permission:
            break

    if not has_base_permission:
        print(f"[PERM DEBUG] No base permission found for job={job_name}, perm={permission}")

    # Now check user_role_permissions for additional/exclusion permissions
    if user_id and unit_id and role_id:
        try:
            user_id_obj = ObjectId(user_id)
            unit_id_obj = ObjectId(unit_id)
            role_id_obj = ObjectId(role_id)

            user_mapping = await db[Collections.USER_ROLE_PERMISSIONS].find_one({
                "userId": {"$in": [user_id, user_id_obj]},
                "unitId": {"$in": [unit_id, unit_id_obj]},
                "roleId": {"$in": [role_id, role_id_obj]},
                "isDelete": False
            })

            if user_mapping:
                additional_permissions = user_mapping.get("additionalPermissions", [])
                exclusion_permissions = user_mapping.get("exclusionPermissions", [])

                # Check if permission is in exclusion list
                for module in exclusion_permissions:
                    jobs = module.get("jobs", [])
                    for job in jobs:
                        if job.get("jobName", "").lower() == job_name.lower():
                            perms = job.get("permissions", [])
                            for perm in perms:
                                if isinstance(perm, dict):
                                    perm_name = perm.get("name", "")
                                else:
                                    perm_name = str(perm)

                                if perm_name.upper() == permission.upper():
                                    # Permission is excluded
                                    return False

                # Check if permission is in additional list (if not in base)
                if not has_base_permission:
                    for module in additional_permissions:
                        jobs = module.get("jobs", [])
                        for job in jobs:
                            if job.get("jobName", "").lower() == job_name.lower():
                                perms = job.get("permissions", [])
                                for perm in perms:
                                    if isinstance(perm, dict):
                                        perm_name = perm.get("name", "")
                                    else:
                                        perm_name = str(perm)

                                    if perm_name.upper() == permission.upper():
                                        has_base_permission = True
                                        break
                                if has_base_permission:
                                    break
                        if has_base_permission:
                            break

        except Exception:
            # If there's any error with user_role_permissions, just use base role permissions
            pass

    return has_base_permission


async def require_permission(
    request: Request,
    job_name: str,
    permission: str
) -> None:
    """
    Require a specific permission, raising HTTPException if not granted.

    This is a convenience function that combines check_job_permission with
    automatic error handling.

    Args:
        request: FastAPI Request object
        job_name: Resource identifier
        permission: Action type

    Raises:
        HTTPException: 403 Forbidden if user doesn't have the permission
    """
    has_permission = await check_job_permission(request, job_name, permission)
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_response(
                error_code="ERR.PERMISSION.DENIED",
                message=f"You don't have permission to perform this action ({permission} on {job_name})",
                code=403
            )
        )


async def check_is_admin(request: Request) -> bool:
    """
    Check if the current user has ADMIN role.

    Args:
        request: FastAPI Request object

    Returns:
        True if user is ADMIN, False otherwise
    """
    user_info = await get_user_info_from_request(request)
    role_name = user_info.get("role", "")
    return role_name.upper() == "ADMIN"


async def require_admin(request: Request) -> None:
    """
    Require ADMIN role, raising HTTPException if not ADMIN.

    Args:
        request: FastAPI Request object

    Raises:
        HTTPException: 403 Forbidden if user is not ADMIN
    """
    is_admin = await check_is_admin(request)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_response(
                error_code="ERR.PERMISSION.ADMIN_REQUIRED",
                message="Admin access required for this operation",
                code=403
            )
        )
