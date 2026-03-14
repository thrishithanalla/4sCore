"""
Permission Checker Dependency
FastAPI dependency for RBAC permission checking.

This replaces the repetitive permission checking code in every endpoint.

Usage:
    from app.api.v1.dependencies.permission_checker import PermissionChecker

    @router.post("/create")
    async def create_unit(
        unit: UnitCreateSchema,
        request: Request,
        current_user: TokenDataSchema = Depends(get_current_user),
        _: bool = Depends(PermissionChecker("units", "CREATE", ErrorCodes.UNIT_CREATE_FAILED))
    ):
        # Permission already verified - just do business logic
        pass
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from typing import Optional

from app.utils.permission_checker import check_job_permission
from app.api.v1.services.error_logger import log_error
from app.api.v1.utils.standard_response import ResponseBuilder
from app.constants.api_constants import PermissionMessages


class PermissionChecker:
    """
    FastAPI Dependency class for checking RBAC permissions.

    This class can be used as a dependency in any endpoint to enforce
    permission checks before the endpoint logic runs.

    Attributes:
        job_name: The job/resource name (e.g., "units", "roles", "permissions")
        action: The action being performed (e.g., "CREATE", "READ", "UPDATE", "DELETE")
        error_code: Optional error code for logging (e.g., ErrorCodes.UNIT_CREATE_FAILED)
        entity_name: Human-readable entity name for error messages

    Example:
        # In router:
        @router.post("/create")
        async def create_unit(
            ...,
            _: bool = Depends(PermissionChecker("units", "CREATE", ErrorCodes.UNIT_CREATE_FAILED, "Unit"))
        ):
            pass
    """

    def __init__(
        self,
        job_name: str,
        action: str,
        error_code: Optional[str] = None,
        entity_name: Optional[str] = None
    ):
        """
        Initialize the permission checker.

        Args:
            job_name: The job/resource name for permission check
            action: The action being performed (CREATE, READ, UPDATE, DELETE)
            error_code: Error code for logging (optional)
            entity_name: Human-readable entity name for error messages (optional)
        """
        self.job_name = job_name
        self.action = action
        self.error_code = error_code or f"{job_name.upper()}_{action}_FAILED"
        self.entity_name = entity_name or job_name.replace("_", " ").replace("-", " ").title()

    async def __call__(self, request: Request) -> bool:
        """
        Check if the current user has permission for the specified action.

        This method is called automatically by FastAPI's dependency injection.

        Args:
            request: The FastAPI Request object

        Returns:
            True if permission is granted

        Raises:
            HTTPException: 403 Forbidden if permission is denied
        """
        # Check permission using existing permission checker
        has_permission = await check_job_permission(request, self.job_name, self.action)

        if not has_permission:
            # Get user ID from request state (set by auth dependency)
            user_id = self._get_user_id(request)

            # Log the permission denial
            error_log = await log_error(
                request=request,
                error_code=self.error_code,
                parameters={"errorMessage": "Permission denied"},
                actor_user_id=user_id
            )

            # Get error message
            error_message = (error_log or {}).get("resolvedMessage") or \
                self._get_permission_message()

            # Raise HTTP 403 Forbidden
            # FastAPI will handle this and return proper response
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=error_message
            )

        return True

    def _get_user_id(self, request: Request) -> Optional[str]:
        """Extract user ID from request state."""
        # Try to get from request.state (set by auth middleware/dependency)
        if hasattr(request.state, "user"):
            user = request.state.user
            if hasattr(user, "id"):
                return user.id
            if isinstance(user, dict):
                return user.get("id") or user.get("sub")

        # Try to get from authorization header
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            try:
                from app.utils.security import decode_access_token
                token = auth_header.split(" ")[1]
                token_data = decode_access_token(token)
                if token_data:
                    return token_data.id
            except Exception:
                pass

        return None

    def _get_permission_message(self) -> str:
        """Generate permission denied message."""
        action_map = {
            "CREATE": PermissionMessages.CREATE if hasattr(PermissionMessages, "CREATE") else "create",
            "READ": PermissionMessages.READ if hasattr(PermissionMessages, "READ") else "read",
            "UPDATE": PermissionMessages.UPDATE if hasattr(PermissionMessages, "UPDATE") else "update",
            "DELETE": PermissionMessages.DELETE if hasattr(PermissionMessages, "DELETE") else "delete",
            "LIST": PermissionMessages.LIST if hasattr(PermissionMessages, "LIST") else "list",
            "RESTORE": PermissionMessages.RESTORE if hasattr(PermissionMessages, "RESTORE") else "restore",
        }

        action_text = action_map.get(self.action, self.action.lower())

        if hasattr(PermissionMessages, "format"):
            return PermissionMessages.format(action_text, self.entity_name.lower())

        return f"You do not have permission to {self.action.lower()} {self.entity_name.lower()}"


# Convenience functions for common permission patterns
def require_create(job_name: str, error_code: str = None, entity_name: str = None) -> PermissionChecker:
    """Create a PermissionChecker for CREATE action."""
    return PermissionChecker(job_name, "CREATE", error_code, entity_name)


def require_read(job_name: str, error_code: str = None, entity_name: str = None) -> PermissionChecker:
    """Create a PermissionChecker for READ action."""
    return PermissionChecker(job_name, "READ", error_code, entity_name)


def require_update(job_name: str, error_code: str = None, entity_name: str = None) -> PermissionChecker:
    """Create a PermissionChecker for UPDATE action."""
    return PermissionChecker(job_name, "UPDATE", error_code, entity_name)


def require_delete(job_name: str, error_code: str = None, entity_name: str = None) -> PermissionChecker:
    """Create a PermissionChecker for DELETE action."""
    return PermissionChecker(job_name, "DELETE", error_code, entity_name)


def require_list(job_name: str, error_code: str = None, entity_name: str = None) -> PermissionChecker:
    """Create a PermissionChecker for LIST/READ action."""
    return PermissionChecker(job_name, "READ", error_code, entity_name)
