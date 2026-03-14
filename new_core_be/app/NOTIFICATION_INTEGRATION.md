# Core Notifications Service - Integration Guide

This guide explains how to integrate the **Core Notifications Service** into your application using REST APIs.

---

## Table of Contents

1. [Overview](#overview)
2. [Base URL Configuration](#base-url-configuration)
3. [Authentication](#authentication)
4. [Quick Start](#quick-start)
5. [Integration in This Project](#integration-in-this-project)
   - [Step 1: Configuration](#step-1-configuration)
   - [Step 2: Notification Logger Service](#step-2-notification-logger-service)
   - [Step 3: Using in Routers](#step-3-using-in-routers)
   - [Step 4: Adding New Notification Types](#step-4-adding-new-notification-types)
6. [API Endpoints](#api-endpoints)
   - [Notification Masters (Templates)](#1-notification-masters-templates)
   - [Notifications (Emit & Manage)](#2-notifications-emit--manage)
   - [Push Subscriptions](#3-push-subscriptions)
   - [Analytics](#4-analytics)
   - [WebSocket (Real-time)](#5-websocket-real-time)
7. [Request/Response Format](#requestresponse-format)
8. [Code Examples](#code-examples)
9. [Error Handling](#error-handling)
10. [Best Practices](#best-practices)

---

## Overview

The Core Notifications Service is a multi-channel notification delivery system supporting:

| Channel | Description |
|---------|-------------|
| `inApp` | In-app notifications (WebSocket) |
| `email` | Email notifications |
| `sms` | SMS text messages |
| `whatsapp` | WhatsApp messages |
| `push` | Mobile push (Firebase FCM) |
| `webPush` | Browser push (VAPID) |

---

## Base URL Configuration

Replace `{{BASE_URL}}` with your deployed service URL:

```
{{BASE_URL}}/core-notifications
```

**Example:**
```
https://your-domain.com/core-notifications
```

**API Documentation (Swagger UI):**
```
{{BASE_URL}}/core-notifications/docs
```

---

## Authentication

All API endpoints (except VAPID public key) require **JWT Bearer Token** authentication.

### Request Header

```http
Authorization: Bearer <your_jwt_token>
```

### Token Structure

The JWT token should contain:
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "exp": 1703001600
}
```

---

## Quick Start

### Step 1: Create a Notification Template

```http
POST {{BASE_URL}}/core-notifications/api/v1/notification-masters/create
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "notification_type": "ORDER_CONFIRMED",
  "name": "Order Confirmation",
  "description": "Sent when an order is confirmed",
  "category": "TRANSACTIONAL",
  "default_channels": ["inApp", "email", "push"],
  "notification_template": {
    "title": "Order Confirmed!",
    "body": "Hi {userName}, your order #{orderId} has been confirmed and will be delivered by {deliveryDate}."
  },
  "notification_parameters": [
    { "name": "userName", "type": "string", "required": true },
    { "name": "orderId", "type": "string", "required": true },
    { "name": "deliveryDate", "type": "string", "required": true }
  ],
  "priority": "HIGH",
  "active": true
}
```

### Step 2: Emit a Notification

```http
POST {{BASE_URL}}/core-notifications/api/v1/notifications/emit
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "notificationType": "ORDER_CONFIRMED",
  "contactId": "user_123",
  "payload": {
    "userName": "John Doe",
    "orderId": "ORD-2024-001",
    "deliveryDate": "December 25, 2024"
  }
}
```

### Step 3: Fetch User Notifications

```http
GET {{BASE_URL}}/core-notifications/api/v1/notifications/user/user_123
Authorization: Bearer {{token}}
```

---

## Integration in This Project

This section explains how to integrate notifications in your routers using the existing `notification_logger.py` service.

### Step 1: Configuration

The notification service URL is configured in `app/core/config.py`:

```python
# In app/core/config.py
class Settings(BaseSettings):
    # ... other settings ...

    # ------------------------------------------------
    # NOTIFICATION SERVICE
    # ------------------------------------------------
    NOTIFICATION_SERVICE_URL: str = "https://devapi.ai4andhrapolice.com/core-notifications"

    @property
    def get_notification_emit_url(self) -> str:
        """Get the notification emit URL."""
        return f"{self.NOTIFICATION_SERVICE_URL}/api/v1/notifications/emit"
```

You can override this in your `.env` file:
```env
NOTIFICATION_SERVICE_URL=https://your-notification-service-url.com/core-notifications
```

### Step 2: Notification Logger Service

The notification logger service is located at `app/api/v1/services/notification_logger.py`. It provides:

#### Core Functions

| Function | Description |
|----------|-------------|
| `emit_notification()` | Emit notification using FastAPI request (auto-extracts JWT token) |
| `emit_notification_with_token()` | Emit notification with explicit token (for background tasks) |

#### Payload Builder Functions (Personnel Example)

| Function | Description |
|----------|-------------|
| `build_personnel_created_payload()` | Build payload for PERSONNEL_CREATED notification |
| `build_personnel_updated_payload()` | Build payload for PERSONNEL_UPDATED notification |
| `build_personnel_deleted_payload()` | Build payload for PERSONNEL_DELETED notification |
| `build_personnel_restored_payload()` | Build payload for PERSONNEL_RESTORED notification |
| `build_personnel_rank_changed_payload()` | Build payload for PERSONNEL_RANK_CHANGED notification |
| `build_personnel_unit_assigned_payload()` | Build payload for PERSONNEL_UNIT_ASSIGNED notification |
| `build_personnel_unit_removed_payload()` | Build payload for PERSONNEL_UNIT_REMOVED notification |

#### Notification Types

```python
class NotificationTypes:
    """Centralized notification type constants."""
    # Personnel notifications
    PERSONNEL_CREATED = "PERSONNEL_CREATED"
    PERSONNEL_UPDATED = "PERSONNEL_UPDATED"
    PERSONNEL_DELETED = "PERSONNEL_DELETED"
    PERSONNEL_RESTORED = "PERSONNEL_RESTORED"
    PERSONNEL_UNIT_ASSIGNED = "PERSONNEL_UNIT_ASSIGNED"
    PERSONNEL_UNIT_REMOVED = "PERSONNEL_UNIT_REMOVED"
    PERSONNEL_RANK_CHANGED = "PERSONNEL_RANK_CHANGED"

    # Add more notification types as needed for other modules
```

### Step 3: Using in Routers

Here's a complete example from the Personnel Router showing how to integrate notifications:

#### 1. Import the notification logger

```python
# In your router file (e.g., app/api/v1/routers/your_router.py)
from app.api.v1.services.notification_logger import (
    emit_notification,
    NotificationTypes,
    build_personnel_created_payload,  # Or your custom payload builder
    build_personnel_updated_payload
)
```

#### 2. Emit notification after successful operation

```python
@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_endpoint(
    data: CreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    try:
        # Perform the create operation
        result = await create_entity(data, current_user.id)

        # Emit notification for creation
        # Determine recipients - usually the creator and the created entity
        recipient_ids = [current_user.id]
        created_entity_id = result.get("_id")
        if created_entity_id and created_entity_id != current_user.id:
            recipient_ids.append(created_entity_id)

        await emit_notification(
            request=request,
            notification_type=NotificationTypes.PERSONNEL_CREATED,  # Use your type
            contact_ids=recipient_ids,
            payload=build_personnel_created_payload(
                personnel_data=result,
                created_by_name=current_user.fullName or "System",
                created_by_id=current_user.id
            ),
            actor_user_id=current_user.id
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_created(data=result, message="Created successfully")
        )
    except Exception as e:
        # Handle errors...
        pass
```

#### 3. Complete Personnel Router Example

Here's the actual implementation from `personnel_router.py`:

```python
@router.post(
    "/create",
    response_model=PersonnelCreateResponseSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new personnel record"
)
async def create_personnel_endpoint(
    personnel: PersonnelCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user),
    x_forwarded_for: Optional[str] = Header(None, alias="X-Forwarded-For")
):
    try:
        # RBAC: Check CREATE permission
        has_permission = await check_job_permission(request, JOB_NAME, "CREATE")
        if not has_permission:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content=ResponseBuilder.forbidden(message="Permission denied")
            )

        client_ip = get_client_ip(request)
        result = await create_personnel(personnel, current_user.id, client_ip)

        # Log successful creation
        await log_transaction(
            request=request,
            log_code=LogCodes.PERSONNEL_CREATED,
            json_values={
                "personnelId": result.get("_id", ""),
                "name": result.get("name", ""),
                "email": result.get("email", ""),
                "createdBy": current_user.id
            },
            level="info"
        )

        # Emit notification for personnel creation
        # Notify both the creator and the created personnel
        recipient_ids = [current_user.id]
        created_personnel_id = result.get("_id")
        if created_personnel_id and created_personnel_id != current_user.id:
            recipient_ids.append(created_personnel_id)

        await emit_notification(
            request=request,
            notification_type=NotificationTypes.PERSONNEL_CREATED,
            contact_ids=recipient_ids,
            payload=build_personnel_created_payload(
                personnel_data=result,
                created_by_name=current_user.fullName or "System",
                created_by_id=current_user.id
            ),
            actor_user_id=current_user.id
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=api_created(
                data=result,
                message=SuccessMessages.format(SuccessMessages.CREATED, ENTITY_NAME)
            )
        )
    except HTTPException as e:
        # Handle HTTP exceptions...
        pass
    except Exception as e:
        # Handle unexpected errors...
        pass
```

### Step 4: Adding New Notification Types

To add notifications for a new module (e.g., Units):

#### 1. Add notification types to `notification_logger.py`

```python
class NotificationTypes:
    # ... existing types ...

    # Unit notifications
    UNIT_CREATED = "UNIT_CREATED"
    UNIT_UPDATED = "UNIT_UPDATED"
    UNIT_DELETED = "UNIT_DELETED"
```

#### 2. Create payload builder functions

```python
def build_unit_created_payload(
    unit_data: Dict[str, Any],
    created_by_name: str,
    created_by_id: str
) -> Dict[str, Any]:
    """
    Build payload for UNIT_CREATED notification.

    Args:
        unit_data: The created unit document.
        created_by_name: Name of the user who created the unit.
        created_by_id: ID of the user who created the unit.

    Returns:
        Payload dictionary matching the notification master parameters.
    """
    return {
        "unitId": str(unit_data.get("_id", "")),
        "unitName": unit_data.get("name", ""),
        "unitCode": unit_data.get("code", ""),
        "unitType": _extract_name(unit_data.get("unitType")),
        "parentUnit": _extract_name(unit_data.get("parentUnit")),
        "createdByName": created_by_name,
        "createdBy": created_by_id
    }
```

#### 3. Create notification master in notification service

Before using a notification type, you must create the notification master (template) in the notification service:

```http
POST {{BASE_URL}}/core-notifications/api/v1/notification-masters/create
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "notification_type": "UNIT_CREATED",
  "name": "Unit Created",
  "description": "Sent when a new unit is created",
  "category": "TRANSACTIONAL",
  "default_channels": ["inApp"],
  "notification_template": {
    "title": "New Unit Created",
    "body": "A new unit '{unitName}' ({unitCode}) has been created by {createdByName}."
  },
  "notification_parameters": [
    { "name": "unitId", "type": "string", "required": true },
    { "name": "unitName", "type": "string", "required": true },
    { "name": "unitCode", "type": "string", "required": true },
    { "name": "unitType", "type": "string", "required": false },
    { "name": "parentUnit", "type": "string", "required": false },
    { "name": "createdByName", "type": "string", "required": true },
    { "name": "createdBy", "type": "string", "required": true }
  ],
  "priority": "NORMAL",
  "active": true
}
```

#### 4. Use in your router

```python
from app.api.v1.services.notification_logger import (
    emit_notification,
    NotificationTypes,
    build_unit_created_payload
)

@router.post("/create")
async def create_unit_endpoint(
    unit: UnitCreateSchema,
    request: Request,
    current_user: TokenDataSchema = Depends(get_current_user)
):
    result = await create_unit(unit, current_user.id)

    # Emit notification
    await emit_notification(
        request=request,
        notification_type=NotificationTypes.UNIT_CREATED,
        contact_ids=[current_user.id],  # Add more recipients as needed
        payload=build_unit_created_payload(
            unit_data=result,
            created_by_name=current_user.fullName or "System",
            created_by_id=current_user.id
        ),
        actor_user_id=current_user.id
    )

    return JSONResponse(status_code=201, content={"data": result})
```

---

## API Endpoints

### 1. Notification Masters (Templates)

Base path: `/api/v1/notification-masters`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/create` | Create a new notification template |
| `GET` | `/list` | List all templates (paginated) |
| `GET` | `/{master_id}` | Get template by ID |
| `PUT` | `/update/{master_id}` | Update a template |
| `DELETE` | `/delete/{master_id}` | Soft delete a template |

#### Create Template

```http
POST /api/v1/notification-masters/create
```

**Request Body:**
```json
{
  "notification_type": "string (unique identifier)",
  "name": "string (display name)",
  "description": "string (optional)",
  "category": "TRANSACTIONAL | PROMOTIONAL | SYSTEM | ALERT",
  "default_channels": ["inApp", "email", "sms", "whatsapp", "push", "webPush"],
  "notification_template": {
    "title": "string (supports {placeholders})",
    "body": "string (supports {placeholders})"
  },
  "notification_parameters": [
    {
      "name": "string",
      "type": "string | number | boolean | date | object",
      "required": true,
      "default": "optional default value",
      "description": "optional description"
    }
  ],
  "notification_actions": [
    {
      "action_id": "approve",
      "label": "Approve",
      "action_type": "button | link | deeplink | api",
      "url": "optional URL",
      "method": "GET | POST | PUT | DELETE",
      "payload": {},
      "style": "primary | secondary | success | danger | warning | info",
      "requires_memo": false,
      "confirm_message": "Are you sure?"
    }
  ],
  "priority": "LOW | NORMAL | HIGH | URGENT",
  "settings": {
    "allow_user_opt_out": true,
    "retry_on_failure": true,
    "max_retries": 3,
    "retry_delay_minutes": 5,
    "expires_after_minutes": 1440
  },
  "active": true
}
```

#### List Templates

```http
GET /api/v1/notification-masters/list?page=1&pageSize=20&category=TRANSACTIONAL&active=true&search=order
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | int | Page number (default: 1) |
| `pageSize` | int | Items per page (default: 20, max: 100) |
| `search` | string | Search in name/type/description |
| `category` | string | Filter by category |
| `active` | boolean | Filter by active status |

---

### 2. Notifications (Emit & Manage)

Base path: `/api/v1/notifications`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/emit` | Emit notification to user(s) |
| `GET` | `/` | List all notifications |
| `GET` | `/{notification_id}` | Get notification by ID |
| `GET` | `/user/{contact_id}` | Get user's notifications |
| `POST` | `/{notification_id}/read` | Mark as read |
| `POST` | `/read-all` | Mark all as read for user |
| `POST` | `/{notification_id}/action` | Record user action |
| `DELETE` | `/{notification_id}` | Soft delete notification |

#### Emit Notification

```http
POST /api/v1/notifications/emit
```

**Request Body:**
```json
{
  "notificationType": "ORDER_CONFIRMED",
  "contactId": "user_123",
  "payload": {
    "userName": "John Doe",
    "orderId": "ORD-001"
  },
  "priority": "NORMAL",
  "channels": ["inApp", "email"],
  "scheduledAt": "2024-12-25T10:00:00Z",
  "expiresAt": "2024-12-26T10:00:00Z",
  "requestId": "req-uuid",
  "traceId": "trace-uuid"
}
```

**Send to Multiple Users:**
```json
{
  "notificationType": "ANNOUNCEMENT",
  "contactId": ["user_1", "user_2", "user_3"],
  "payload": {
    "message": "System maintenance scheduled"
  }
}
```

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Notification emitted successfully",
  "data": {
    "success": true,
    "count": 1,
    "notifications": [
      {
        "notificationId": "507f1f77bcf86cd799439011",
        "contactId": "user_123",
        "deliveryChannels": ["inApp", "email"],
        "proposedTime": "2024-12-20T10:30:00Z"
      }
    ]
  },
  "error": null
}
```

#### Get User Notifications

```http
GET /api/v1/notifications/user/{contact_id}?page=1&pageSize=20&unreadOnly=true
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | int | Page number |
| `pageSize` | int | Items per page |
| `unreadOnly` | boolean | Return only unread notifications |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "contactId": "user_123",
      "notificationId": "507f1f77bcf86cd799439011",
      "notificationType": "ORDER_CONFIRMED",
      "title": "Order Confirmed!",
      "body": "Your order #ORD-001 has been confirmed.",
      "priority": "HIGH",
      "status": "DELIVERED",
      "deliveryChannel": "inApp",
      "isRead": false,
      "availableActions": [
        {
          "action_id": "view_order",
          "label": "View Order",
          "action_type": "deeplink",
          "url": "/orders/ORD-001"
        }
      ],
      "createdDateTime": "2024-12-20T10:30:00Z",
      "sentAt": "2024-12-20T10:30:01Z",
      "deliveredAt": "2024-12-20T10:30:02Z"
    }
  ],
  "total": 50,
  "unreadCount": 5,
  "page": 1,
  "pageSize": 20,
  "totalPages": 3
}
```

#### Mark as Read

```http
POST /api/v1/notifications/{notification_id}/read
```

#### Mark All as Read

```http
POST /api/v1/notifications/read-all
Content-Type: application/json

{
  "contactId": "user_123"
}
```

#### Record User Action

```http
POST /api/v1/notifications/{notification_id}/action
Content-Type: application/json

{
  "contactId": "user_123",
  "actionId": "approve",
  "memo": "Approved after review"
}
```

---

### 3. Push Subscriptions

Base path: `/api/v1/push`

#### Mobile Push (Firebase FCM)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/devices` | Register device token |
| `GET` | `/devices` | Get user's devices |
| `DELETE` | `/devices/{device_id}` | Unregister device |

**Register Device:**
```http
POST /api/v1/push/devices
Content-Type: application/json

{
  "contactId": "user_123",
  "token": "fcm_device_token_here",
  "platform": "android",
  "deviceId": "device-uuid",
  "deviceName": "Samsung Galaxy S24",
  "deviceModel": "SM-S921U",
  "osVersion": "14",
  "appVersion": "2.1.0"
}
```

#### Web Push (Browser VAPID)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/web/vapid-key` | Get VAPID public key (no auth) |
| `POST` | `/web/subscribe` | Subscribe browser |
| `DELETE` | `/web/unsubscribe` | Unsubscribe browser |
| `GET` | `/web/subscriptions` | Get user's subscriptions |

**Get VAPID Key (No Auth Required):**
```http
GET /api/v1/push/web/vapid-key
```

**Response:**
```json
{
  "success": true,
  "data": {
    "publicKey": "BNbxGYN5..."
  }
}
```

**Subscribe Browser:**
```http
POST /api/v1/push/web/subscribe
Content-Type: application/json

{
  "contactId": "user_123",
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "encryption_key_here",
    "auth": "auth_secret_here"
  },
  "userAgent": "Mozilla/5.0...",
  "browser": "chrome"
}
```

---

### 4. Analytics

Base path: `/api/v1/analytics`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/dashboard` | Full dashboard analytics |
| `GET` | `/channels` | Channel statistics |
| `GET` | `/timeline` | Delivery timeline |
| `GET` | `/retry` | Retry analysis |
| `GET` | `/templates/top` | Top templates by usage |

#### Dashboard Analytics

```http
GET /api/v1/analytics/dashboard?dateRange=last_7_days&channel=email
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `dateRange` | string | `last_hour`, `last_24_hours`, `last_7_days`, `last_30_days`, `custom` |
| `startDate` | datetime | Start date for custom range (ISO 8601) |
| `endDate` | datetime | End date for custom range (ISO 8601) |
| `channel` | string | Filter by channel |
| `status` | string | Filter by status |
| `notificationType` | string | Filter by template type |

**Response:**
```json
{
  "success": true,
  "data": {
    "channelStats": [
      {
        "channel": "email",
        "total": 1000,
        "delivered": 950,
        "failed": 50,
        "pending": 0,
        "successRate": 95.0
      }
    ],
    "totalNotifications": 5000,
    "totalDelivered": 4750,
    "totalFailed": 250,
    "overallSuccessRate": 95.0,
    "deliveryTimeline": [
      {
        "timestamp": "2024-12-20T00:00:00Z",
        "total": 100,
        "delivered": 95,
        "failed": 5
      }
    ],
    "topTemplates": [
      {
        "notificationType": "ORDER_CONFIRMED",
        "name": "Order Confirmation",
        "count": 500
      }
    ]
  }
}
```

---

### 5. WebSocket (Real-time)

Connect to receive real-time notifications:

```
ws://{{BASE_URL}}/core-notifications/notifications/ws/{contactId}?token={jwt_token}
```

**Example:**
```
wss://your-domain.com/core-notifications/notifications/ws/user_123?token=eyJhbGc...
```

#### Message Types

**Client -> Server:**
```json
// Ping (keep-alive)
{ "type": "ping" }

// Mark notification as read
{ "type": "mark_read", "notificationId": "507f1f77..." }
```

**Server -> Client:**
```json
// Connection confirmed
{ "type": "connected", "message": "Connected", "contactId": "user_123" }

// Pong response
{ "type": "pong" }

// New notification
{
  "type": "new_notification",
  "data": {
    "id": "507f1f77...",
    "title": "Order Confirmed!",
    "body": "Your order has been confirmed.",
    "priority": "HIGH",
    "availableActions": []
  }
}

// Read confirmation
{ "type": "marked_read", "notificationId": "507f1f77...", "success": true }
```

---

## Request/Response Format

All API responses follow this standard format:

```json
{
  "success": true,
  "code": 200,
  "message": "Operation successful",
  "data": { ... },
  "error": null
}
```

**Error Response:**
```json
{
  "success": false,
  "code": 400,
  "message": "Validation error",
  "data": null,
  "error": {
    "detail": "notificationType is required"
  }
}
```

---

## Code Examples

### JavaScript/TypeScript (Fetch)

```typescript
const BASE_URL = 'https://your-domain.com/core-notifications';
const TOKEN = 'your_jwt_token';

// Emit Notification
async function emitNotification(notificationType: string, contactId: string, payload: object) {
  const response = await fetch(`${BASE_URL}/api/v1/notifications/emit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: JSON.stringify({
      notificationType,
      contactId,
      payload
    })
  });

  return response.json();
}

// Get User Notifications
async function getUserNotifications(contactId: string, page = 1) {
  const response = await fetch(
    `${BASE_URL}/api/v1/notifications/user/${contactId}?page=${page}`,
    {
      headers: {
        'Authorization': `Bearer ${TOKEN}`
      }
    }
  );

  return response.json();
}

// WebSocket Connection
function connectWebSocket(contactId: string) {
  const ws = new WebSocket(
    `wss://your-domain.com/core-notifications/notifications/ws/${contactId}?token=${TOKEN}`
  );

  ws.onopen = () => console.log('Connected');

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'new_notification') {
      console.log('New notification:', message.data);
    }
  };

  // Keep-alive ping every 30 seconds
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);

  return ws;
}
```

### Python (Requests)

```python
import requests

BASE_URL = 'https://your-domain.com/core-notifications'
TOKEN = 'your_jwt_token'

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Content-Type': 'application/json'
}

# Emit Notification
def emit_notification(notification_type: str, contact_id: str, payload: dict):
    response = requests.post(
        f'{BASE_URL}/api/v1/notifications/emit',
        headers=headers,
        json={
            'notificationType': notification_type,
            'contactId': contact_id,
            'payload': payload
        }
    )
    return response.json()

# Get User Notifications
def get_user_notifications(contact_id: str, page: int = 1):
    response = requests.get(
        f'{BASE_URL}/api/v1/notifications/user/{contact_id}',
        headers=headers,
        params={'page': page}
    )
    return response.json()

# Usage
result = emit_notification(
    notification_type='ORDER_CONFIRMED',
    contact_id='user_123',
    payload={
        'userName': 'John Doe',
        'orderId': 'ORD-001',
        'deliveryDate': 'December 25, 2024'
    }
)
print(result)
```

### cURL

```bash
# Emit Notification
curl -X POST "https://your-domain.com/core-notifications/api/v1/notifications/emit" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notificationType": "ORDER_CONFIRMED",
    "contactId": "user_123",
    "payload": {
      "userName": "John Doe",
      "orderId": "ORD-001"
    }
  }'

# Get User Notifications
curl -X GET "https://your-domain.com/core-notifications/api/v1/notifications/user/user_123" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Mark as Read
curl -X POST "https://your-domain.com/core-notifications/api/v1/notifications/507f1f77.../read" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request - Invalid input |
| `401` | Unauthorized - Invalid/expired token |
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `422` | Validation Error - Schema mismatch |
| `500` | Internal Server Error |

### Common Errors

**Invalid Token:**
```json
{
  "success": false,
  "code": 401,
  "message": "Invalid or expired token",
  "error": { "detail": "Token has expired" }
}
```

**Notification Type Not Found:**
```json
{
  "success": false,
  "code": 404,
  "message": "Notification master not found",
  "error": { "detail": "No template found for type: INVALID_TYPE" }
}
```

**Validation Error:**
```json
{
  "success": false,
  "code": 422,
  "message": "Validation error",
  "error": {
    "detail": [
      {
        "loc": ["body", "contactId"],
        "msg": "field required",
        "type": "value_error.missing"
      }
    ]
  }
}
```

---

## Best Practices

### 1. Template Management
- Create templates for each notification type before emitting
- Use meaningful `notification_type` identifiers (e.g., `ORDER_CONFIRMED`, `PASSWORD_RESET`)
- Define all required parameters with proper types

### 2. Payload Variables
- Use `{variableName}` syntax in templates
- Ensure all required parameters are provided in the payload
- Use default values for optional parameters

### 3. Channel Selection
- Use `default_channels` in templates for consistency
- Override with `channels` in emit request when needed
- Consider user preferences and opt-outs

### 4. Real-time Notifications
- Implement WebSocket reconnection logic
- Send ping messages every 30 seconds to keep connection alive
- Handle connection errors gracefully

### 5. Error Handling
- Always check `success` field in responses
- Implement retry logic for transient failures
- Log `requestId` and `traceId` for debugging
- Notifications should not crash your application - handle errors gracefully

### 6. Performance
- Use bulk emission (`contactId` as array) for multiple recipients
- Paginate list queries appropriately
- Cache notification masters client-side if possible

### 7. Security
- Never expose JWT tokens in client-side code
- Validate `contactId` matches authenticated user
- Use HTTPS in production

### 8. Integration in This Project
- Always use the `notification_logger.py` service for consistency
- Create payload builder functions for each notification type
- Add new notification types to `NotificationTypes` class
- Emit notifications after successful operations, not before
- Don't let notification failures crash the main operation

---

## Support

- **API Documentation (Swagger UI):** `{{BASE_URL}}/core-notifications/docs`
- **API Documentation (ReDoc):** `{{BASE_URL}}/core-notifications/redoc`
- **Health Check:** `{{BASE_URL}}/core-notifications/health`

---

## Files Reference

| File | Description |
|------|-------------|
| `app/core/config.py` | Configuration with `NOTIFICATION_SERVICE_URL` |
| `app/api/v1/services/notification_logger.py` | Notification emission service |
| `app/api/v1/routers/personnel_router.py` | Example implementation |

---

*Generated for Core Notifications Service v1.0.0*
