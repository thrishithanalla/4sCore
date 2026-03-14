"""
Notification Logger Service for centralized notification emission.

This module provides functions to emit notifications via the Core Notifications Service API.
It can be used throughout the application to send notifications with full context including
template variables and recipient information.

Usage:
    from app.api.v1.services.notification_logger import emit_notification

    # Basic notification emission
    await emit_notification(
        request=request,
        notification_type="PERSONNEL_CREATED",
        contact_ids=["user_123", "user_456"],
        payload={"name": "John Doe", "userId": "12345678"},
        actor_user_id=current_user.id
    )
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

import httpx
from fastapi import Request

from app.core.config import settings

# Module logger for internal logging
logger = logging.getLogger(__name__)

# Source identification for notifications
SOURCE_NAME = "CoreService"

# HTTP timeout for notification API calls (seconds)
NOTIFICATION_TIMEOUT = 10.0


class NotificationTypes:
    """
    Centralized notification type constants.
    Add new notification types here as they are created in the notification service.
    """
    # Personnel notifications
    PERSONNEL_CREATED = "PERSONNEL_CREATED"
    PERSONNEL_UPDATED = "PERSONNEL_UPDATED"
    PERSONNEL_DELETED = "PERSONNEL_DELETED"
    PERSONNEL_RESTORED = "PERSONNEL_RESTORED"
    PERSONNEL_UNIT_ASSIGNED = "PERSONNEL_UNIT_ASSIGNED"
    PERSONNEL_UNIT_REMOVED = "PERSONNEL_UNIT_REMOVED"
    PERSONNEL_RANK_CHANGED = "PERSONNEL_RANK_CHANGED"

    # Onboarding notifications
    USER_ONBOARDED_SMS = "USER_ONBOARDED_SMS"

    # Unit notifications (add when needed)
    # UNIT_CREATED = "UNIT_CREATED"
    # UNIT_UPDATED = "UNIT_UPDATED"

    # Add more notification types as needed for other modules


async def emit_notification(
    request: Optional[Request],
    notification_type: str,
    contact_ids: Union[str, List[str]],
    payload: Dict[str, Any],
    actor_user_id: Optional[str] = None,
    priority: str = "NORMAL",
    channels: Optional[List[str]] = None,
    request_id: Optional[str] = None,
    trace_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Emit a notification via the Core Notifications Service API.

    This function sends a notification to one or more recipients through
    the configured notification service. It handles authentication,
    error handling, and logging automatically.

    Args:
        request: FastAPI Request object for extracting auth token.
                 Can be None if auth_token is extracted elsewhere.
        notification_type: The notification type (e.g., "PERSONNEL_CREATED").
                          Must match a notification master in the notification service.
        contact_ids: Single contact ID or list of contact IDs to notify.
                     These should be valid user IDs from personnel_master.
        payload: Dictionary containing the template variables.
                 Keys should match the notification_parameters defined in the master.
        actor_user_id: User ID who triggered the notification (for logging).
        priority: Notification priority (LOW, NORMAL, HIGH, URGENT).
        channels: Optional list of channels to override defaults.
                  Valid values: inApp, email, sms, whatsapp, push, webPush.
        request_id: Optional request ID for tracing.
        trace_id: Optional trace ID for distributed tracing.

    Returns:
        Dict containing the API response on success, or None on failure.
        The response includes: success, code, message, data (with notification details).

    Example:
        await emit_notification(
            request=request,
            notification_type=NotificationTypes.PERSONNEL_CREATED,
            contact_ids=["user_123", current_user.id],
            payload={
                "personnelId": "abc123",
                "name": "John Doe",
                "userId": "12345678",
                "departmentName": "IT Department",
                "rankName": "Manager",
                "createdByName": "Admin User"
            },
            actor_user_id=current_user.id
        )
    """
    try:
        # Get notification emit URL from settings
        emit_url = settings.get_notification_emit_url

        if not emit_url:
            logger.warning("Notification service URL not configured")
            return None

        # Extract auth token from request
        auth_token = _extract_auth_token(request)
        if not auth_token:
            logger.warning("No auth token available for notification emission")
            return None

        # Prepare request body
        request_body: Dict[str, Any] = {
            "notificationType": notification_type,
            "contactId": contact_ids,
            "payload": payload,
            "priority": priority
        }

        # Add optional fields
        if channels:
            request_body["channels"] = channels
        if request_id:
            request_body["requestId"] = request_id
        if trace_id:
            request_body["traceId"] = trace_id

        # Prepare headers
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }

        # Make async HTTP request
        async with httpx.AsyncClient(timeout=NOTIFICATION_TIMEOUT) as client:
            response = await client.post(
                emit_url,
                json=request_body,
                headers=headers
            )

            if response.status_code in [200, 201]:
                logger.info(
                    f"Notification emitted successfully: type={notification_type}, "
                    f"contacts={contact_ids}, actor={actor_user_id}"
                )
                return response.json()
            else:
                logger.warning(
                    f"Notification emit failed: status={response.status_code}, "
                    f"type={notification_type}, response={response.text[:500]}"
                )
                return None

    except httpx.TimeoutException:
        logger.error(
            f"Notification emit timeout: type={notification_type}, "
            f"contacts={contact_ids}"
        )
        return None
    except httpx.RequestError as e:
        logger.error(
            f"Notification emit request error: type={notification_type}, "
            f"error={str(e)}"
        )
        return None
    except Exception as e:
        # Don't let notification failures crash the application
        logger.exception(
            f"Unexpected error emitting notification: type={notification_type}, "
            f"error={str(e)}"
        )
        return None


async def emit_notification_with_token(
    auth_token: str,
    notification_type: str,
    contact_ids: Union[str, List[str]],
    payload: Dict[str, Any],
    priority: str = "NORMAL",
    channels: Optional[List[str]] = None,
    request_id: Optional[str] = None,
    trace_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Emit a notification using a provided auth token.

    This is useful for background tasks or contexts where the request
    object is not available.

    Args:
        auth_token: JWT token for authentication with notification service.
        notification_type: The notification type.
        contact_ids: Single contact ID or list of contact IDs.
        payload: Template variables dictionary.
        priority: Notification priority.
        channels: Optional channel override.
        request_id: Optional request ID for tracing.
        trace_id: Optional trace ID.

    Returns:
        Dict containing the API response on success, or None on failure.
    """
    try:
        emit_url = settings.get_notification_emit_url

        if not emit_url:
            logger.warning("Notification service URL not configured")
            return None

        request_body: Dict[str, Any] = {
            "notificationType": notification_type,
            "contactId": contact_ids,
            "payload": payload,
            "priority": priority
        }

        if channels:
            request_body["channels"] = channels
        if request_id:
            request_body["requestId"] = request_id
        if trace_id:
            request_body["traceId"] = trace_id

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {auth_token}"
        }

        async with httpx.AsyncClient(timeout=NOTIFICATION_TIMEOUT) as client:
            response = await client.post(
                emit_url,
                json=request_body,
                headers=headers
            )

            if response.status_code in [200, 201]:
                logger.info(
                    f"Notification emitted successfully: type={notification_type}, "
                    f"contacts={contact_ids}"
                )
                return response.json()
            else:
                logger.warning(
                    f"Notification emit failed: status={response.status_code}, "
                    f"type={notification_type}"
                )
                return None

    except Exception as e:
        logger.exception(f"Error emitting notification: {str(e)}")
        return None


def build_personnel_created_payload(
    personnel_data: Dict[str, Any],
    created_by_name: str,
    created_by_id: str
) -> Dict[str, Any]:
    """
    Build payload for PERSONNEL_CREATED notification.

    Args:
        personnel_data: The created personnel document (with populated relations).
        created_by_name: Name of the user who created the personnel.
        created_by_id: ID of the user who created the personnel.

    Returns:
        Payload dictionary matching the notification master parameters.
    """
    return {
        "personnelId": str(personnel_data.get("_id", "")),
        "name": personnel_data.get("name", ""),
        "userId": personnel_data.get("userId", ""),
        "email": personnel_data.get("email", ""),
        "departmentName": _extract_name(personnel_data.get("department")),
        "rankName": _extract_name(personnel_data.get("rank")),
        "unitNames": _extract_unit_names(personnel_data.get("units")),
        "createdByName": created_by_name,
        "createdBy": created_by_id
    }


def build_personnel_updated_payload(
    personnel_data: Dict[str, Any],
    changes: Dict[str, Dict[str, Any]],
    updated_by_name: str,
    updated_by_id: str
) -> Dict[str, Any]:
    """
    Build payload for PERSONNEL_UPDATED notification.

    Args:
        personnel_data: The updated personnel document.
        changes: Dictionary of changes with old and new values.
                 Format: {"field": {"old": old_value, "new": new_value}}
        updated_by_name: Name of the user who updated the personnel.
        updated_by_id: ID of the user who updated the personnel.

    Returns:
        Payload dictionary matching the notification master parameters.
    """
    # Format changes as "Field Name: old_value → new_value"
    formatted_changes = []
    for field, values in changes.items():
        old_val = values.get("old")
        new_val = values.get("new")
        # Get user-friendly field name
        friendly_field = _get_friendly_field_name(field)
        # Format display values
        old_display = _format_value_for_display(old_val)
        new_display = _format_value_for_display(new_val)
        formatted_changes.append(f"{friendly_field}: {old_display} → {new_display}")

    return {
        "personnelId": str(personnel_data.get("_id", "")),
        "name": personnel_data.get("name", ""),
        "userId": personnel_data.get("userId", ""),
        "updatedFields": "; ".join(formatted_changes) if formatted_changes else "Details updated",
        "updatedByName": updated_by_name,
        "updatedBy": updated_by_id
    }


def build_personnel_deleted_payload(
    personnel_data: Dict[str, Any],
    deleted_by_name: str
) -> Dict[str, Any]:
    """
    Build payload for PERSONNEL_DELETED notification.

    Args:
        personnel_data: The personnel document being deleted.
        deleted_by_name: Name of the user who deleted the personnel.

    Returns:
        Payload dictionary matching the notification master parameters.
    """
    return {
        "personnelId": str(personnel_data.get("_id", "")),
        "name": personnel_data.get("name", ""),
        "userId": personnel_data.get("userId", ""),
        "email": personnel_data.get("email", ""),
        "departmentName": _extract_name(personnel_data.get("department")),
        "deletedByName": deleted_by_name
    }


def build_personnel_restored_payload(
    personnel_data: Dict[str, Any],
    restored_by_name: str
) -> Dict[str, Any]:
    """
    Build payload for PERSONNEL_RESTORED notification.

    Args:
        personnel_data: The personnel document being restored.
        restored_by_name: Name of the user who restored the personnel.

    Returns:
        Payload dictionary matching the notification master parameters.
    """
    return {
        "personnelId": str(personnel_data.get("_id", "")),
        "name": personnel_data.get("name", ""),
        "userId": personnel_data.get("userId", ""),
        "email": personnel_data.get("email", ""),
        "restoredByName": restored_by_name
    }


def build_personnel_rank_changed_payload(
    personnel_data: Dict[str, Any],
    old_rank_name: str,
    new_rank_name: str,
    changed_by_name: str
) -> Dict[str, Any]:
    """
    Build payload for PERSONNEL_RANK_CHANGED notification.

    Args:
        personnel_data: The personnel document.
        old_rank_name: Previous rank name.
        new_rank_name: New rank name.
        changed_by_name: Name of the user who changed the rank.

    Returns:
        Payload dictionary matching the notification master parameters.
    """
    return {
        "personnelId": str(personnel_data.get("_id", "")),
        "name": personnel_data.get("name", ""),
        "userId": personnel_data.get("userId", ""),
        "oldRankName": old_rank_name,
        "newRankName": new_rank_name,
        "changedByName": changed_by_name
    }


def build_personnel_unit_assigned_payload(
    personnel_data: Dict[str, Any],
    unit_name: str,
    designation_name: str,
    assigned_by_name: str,
    unit_id: str
) -> Dict[str, Any]:
    """
    Build payload for PERSONNEL_UNIT_ASSIGNED notification.

    Args:
        personnel_data: The personnel document.
        unit_name: Name of the unit assigned to.
        designation_name: Designation in the unit.
        assigned_by_name: Name of the user who assigned.
        unit_id: ID of the unit.

    Returns:
        Payload dictionary matching the notification master parameters.
    """
    return {
        "personnelId": str(personnel_data.get("_id", "")),
        "name": personnel_data.get("name", ""),
        "userId": personnel_data.get("userId", ""),
        "unitId": unit_id,
        "unitName": unit_name,
        "designationName": designation_name or "Not Specified",
        "assignedByName": assigned_by_name
    }


def build_personnel_unit_removed_payload(
    personnel_data: Dict[str, Any],
    unit_name: str,
    removed_by_name: str,
    unit_id: str
) -> Dict[str, Any]:
    """
    Build payload for PERSONNEL_UNIT_REMOVED notification.

    Args:
        personnel_data: The personnel document.
        unit_name: Name of the unit removed from.
        removed_by_name: Name of the user who removed.
        unit_id: ID of the unit.

    Returns:
        Payload dictionary matching the notification master parameters.
    """
    return {
        "personnelId": str(personnel_data.get("_id", "")),
        "name": personnel_data.get("name", ""),
        "userId": personnel_data.get("userId", ""),
        "unitId": unit_id,
        "unitName": unit_name,
        "removedByName": removed_by_name
    }


def build_user_onboarded_sms_payload(
    personnel_data: Dict[str, Any],
    mpin: str,
    department_name: str = None,
    rank_name: str = None
) -> Dict[str, Any]:
    """
    Build payload for USER_ONBOARDED_SMS notification.

    This payload is used to send SMS to newly onboarded users with their
    login credentials (userId and MPIN).

    Args:
        personnel_data: The created personnel document.
        mpin: The 4-digit MPIN assigned to the user.
        department_name: Optional department name.
        rank_name: Optional rank name.

    Returns:
        Payload dictionary matching the USER_ONBOARDED_SMS notification master parameters.
    """
    return {
        "name": personnel_data.get("name", ""),
        "userId": personnel_data.get("userId", ""),
        "mpin": str(mpin),
        "email": personnel_data.get("email", ""),
        "departmentName": department_name or _extract_name(personnel_data.get("department")) or "N/A",
        "rankName": rank_name or _extract_name(personnel_data.get("rank")) or "N/A"
    }


# =============================================================================
# Helper Functions (Private)
# =============================================================================

def _extract_auth_token(request: Optional[Request]) -> Optional[str]:
    """
    Extract JWT token from request Authorization header.

    Args:
        request: FastAPI Request object.

    Returns:
        Token string or None if not available.
    """
    if request is None:
        return None

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    return auth_header.split(" ")[1]


def _extract_name(obj: Any) -> str:
    """
    Extract name from a populated object or return default.

    Args:
        obj: Object that may contain a 'name' field.

    Returns:
        Name string or "N/A" if not available.
    """
    if obj is None:
        return "N/A"
    if isinstance(obj, dict):
        return obj.get("name", "N/A")
    return "N/A"


def _extract_unit_names(units: Any) -> str:
    """
    Extract comma-separated unit names from units array.

    Args:
        units: Units array from personnel document.

    Returns:
        Comma-separated unit names or "N/A".
    """
    if not units or not isinstance(units, list):
        return "N/A"

    names = []
    for unit in units:
        if isinstance(unit, dict):
            unit_info = unit.get("unit", {})
            if isinstance(unit_info, dict) and unit_info.get("name"):
                names.append(unit_info["name"])

    return ", ".join(names) if names else "N/A"


def _get_friendly_field_name(field: str) -> str:
    """
    Convert database field name to user-friendly display name.

    Args:
        field: Database field name (e.g., 'firstName', 'departmentId')

    Returns:
        User-friendly name (e.g., 'First Name', 'Department')
    """
    # Mapping of field names to friendly names
    field_mapping = {
        "email": "Email",
        "name": "Name",
        "title": "Title",
        "firstName": "First Name",
        "lastName": "Last Name",
        "units": "Units",
        "departmentId": "Department",
        "rankId": "Rank",
        "picture": "Profile Picture",
        "mobile": "Mobile Number",
        "batchYear": "Batch Year",
        "badgeNo": "Badge Number",
        "dateOfBirth": "Date of Birth",
        "gender": "Gender",
        "userId": "User ID",
        "mpin": "MPIN",
        "isActive": "Active Status",
        "address": "Address",
        "bloodGroup": "Blood Group",
        "emergencyContact": "Emergency Contact",
        "joiningDate": "Joining Date",
        "retirementDate": "Retirement Date",
    }
    return field_mapping.get(field, field.replace("_", " ").title())


def _format_value_for_display(value: Any) -> str:
    """
    Format a value for display in notification messages.

    Args:
        value: Any value to format (string, list, dict, None, etc.)

    Returns:
        Formatted string representation of the value.
    """
    if value is None:
        return "(not set)"
    if isinstance(value, str):
        return value if value.strip() else "(not set)"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        if not value:
            return "(not set)"
        # Handle list of dicts (like units array)
        if all(isinstance(item, dict) for item in value):
            return f"{len(value)} unit(s)"
        return ", ".join(str(v) for v in value)
    if isinstance(value, dict):
        # Try to get name from dict
        if "name" in value:
            return value["name"]
        return "(updated)"
    return str(value)
