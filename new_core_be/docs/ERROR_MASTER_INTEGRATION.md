# Error Master & Error Log Integration Guide

This document explains how to integrate with the **Error Master** and **Error Log** APIs for centralized error management across microservices.

---

## Quick Start

If Error Master templates are already created, you only need to call the Error Log create API with:
- `errorCode` - The error code from Error Master
- `parametersJson` - Values to fill in the template placeholders
- `sourceType` - Where the error originated (e.g., "api", "ui", "service")
- `sourceName` - Specific source name (e.g., "AuthService", "PaymentGateway")

---

## Error Log Create API

**Endpoint:** `POST /api/v1/error-logs/create`

**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `errorCode` | string | Yes | Error Master code (e.g., `"ERR.AUTH.LOGIN_FAILED"`) |
| `parametersJson` | object | Yes | Values to replace template `{placeholders}` |
| `language` | string | No | ISO-639-1 language code (default: `"en"`) |
| `sourceType` | string | Yes | Must exist in 'sourceType' value-set |
| `sourceName` | string | Yes | Specific source name (max 200 chars) |
| `actorUserId` | string | No | User ID who triggered the error |
| `ip` | string | No | Client IP address (max 64 chars) |
| `userAgent` | string | No | Client user agent (max 512 chars) |
| `environment` | string | No | Must exist in 'environment' value-set |
| `stack` | string | No | Stack trace (max 12,000 chars) |
| `parameters` | array | No | List of `{name, value}` pairs |

---

## Example: Using Existing Error Master

### Error Master Template (Already Created)
```json
{
  "_id": "69252b970f12097edf21a3a7",
  "errorCode": "ERR.AUTH.LOGIN_FAILED",
  "errorType": "Business",
  "errorSeverity": "WARNING",
  "log": true,
  "messages": [
    {
      "language": "en",
      "template": "Login failed for user {userName} from IP {clientIp}. Reason: {reason}"
    },
    {
      "language": "hi",
      "template": "उपयोगकर्ता {userName} के लिए IP {clientIp} से लॉगिन विफल। कारण: {reason}"
    }
  ],
  "devMessage": "Check if user exists and password is correct",
  "businessArea": "Authentication",
  "technicalArea": "Security"
}
```

### Error Log Create Request
```json
{
  "errorCode": "ERR.AUTH.LOGIN_FAILED",
  "parametersJson": {
    "userName": "john.doe@example.com",
    "clientIp": "192.168.1.100",
    "reason": "Invalid password"
  },
  "language": "en",
  "sourceType": "api",
  "sourceName": "AuthService",
  "actorUserId": "68ee46b5d4c7a020fdf3a87c",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "environment": "production",
  "stack": "Error: Invalid password\n    at AuthService.login (auth.js:45)"
}
```

### Response (201 Created)
```json
{
  "success": true,
  "code": 201,
  "message": "Error Log created successfully",
  "data": {
    "id": "674f5678abcd1234ef567890",
    "errorCode": "ERR.AUTH.LOGIN_FAILED",
    "errorSeverity": "WARNING",
    "eventDateTime": "2025-11-29T15:45:30.000Z",
    "actorUserId": "68ee46b5d4c7a020fdf3a87c",
    "sourceType": "api",
    "sourceName": "AuthService",
    "ip": "192.168.1.100",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "environment": "production",
    "resolvedMessage": "Login failed for user john.doe@example.com from IP 192.168.1.100. Reason: Invalid password",
    "parameters": []
  }
}
```

### Auto-Generated Fields

| Field | Source |
|-------|--------|
| `id` | MongoDB generated ObjectId |
| `errorSeverity` | SNAPSHOT from Error Master at log time |
| `eventDateTime` | Current UTC timestamp |
| `resolvedMessage` | Generated from `errorMaster.messages` template + your `parametersJson` values |

---

## Code Examples

### Python

```python
import requests

def log_error(token: str, error_code: str, params: dict,
              source_type: str, source_name: str,
              actor_user_id: str = None, ip: str = None,
              environment: str = None, stack: str = None):
    payload = {
        "errorCode": error_code,
        "parametersJson": params,
        "sourceType": source_type,
        "sourceName": source_name
    }
    if actor_user_id:
        payload["actorUserId"] = actor_user_id
    if ip:
        payload["ip"] = ip
    if environment:
        payload["environment"] = environment
    if stack:
        payload["stack"] = stack

    response = requests.post(
        "https://your-domain.com/api/v1/error-logs/create",
        json=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    return response.json()

# Usage
log_error(
    token="your_jwt_token",
    error_code="ERR.AUTH.LOGIN_FAILED",
    params={
        "userName": "john.doe@example.com",
        "clientIp": "192.168.1.100",
        "reason": "Invalid password"
    },
    source_type="api",
    source_name="AuthService",
    environment="production"
)
```

### JavaScript/TypeScript

```typescript
async function logError(
  token: string,
  errorCode: string,
  params: Record<string, any>,
  sourceType: string,
  sourceName: string,
  options?: {
    actorUserId?: string;
    ip?: string;
    userAgent?: string;
    environment?: string;
    stack?: string;
    language?: string;
  }
) {
  const payload: any = {
    errorCode,
    parametersJson: params,
    sourceType,
    sourceName,
    ...options
  };

  const response = await fetch(
    "https://your-domain.com/api/v1/error-logs/create",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  return response.json();
}

// Usage
await logError(
  "your_jwt_token",
  "ERR.AUTH.LOGIN_FAILED",
  {
    userName: "john.doe@example.com",
    clientIp: "192.168.1.100",
    reason: "Invalid password"
  },
  "api",
  "AuthService",
  { environment: "production" }
);
```

### cURL

```bash
curl -X POST "https://your-domain.com/api/v1/error-logs/create" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "errorCode": "ERR.AUTH.LOGIN_FAILED",
    "parametersJson": {
      "userName": "john.doe@example.com",
      "clientIp": "192.168.1.100",
      "reason": "Invalid password"
    },
    "sourceType": "api",
    "sourceName": "AuthService",
    "environment": "production"
  }'
```

---

## Querying Error Logs

### List Error Logs

**Endpoint:** `GET /api/v1/error-logs/list`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | int | Page number (>=1). If not provided, returns all records |
| `pageSize` | int | Items per page (>=1, max: 2000). Default: 50 |
| `q` | string | Full-text search on resolvedMessage |
| `errorCode` | string | Filter by exact errorCode |
| `errorSeverity` | string | Filter: `CRITICAL` \| `HIGH` \| `MEDIUM` \| `LOW` |
| `sourceType` | string | Filter by sourceType |
| `sourceName` | string | Filter by sourceName |
| `actorUserId` | string | Filter by user ID |
| `environment` | string | Filter by environment |
| `fromDate` | datetime | Filter from date (ISO format) |
| `toDate` | datetime | Filter to date (ISO format) |
| `includeArchive` | bool | Include archived logs (default: false) |

**Example:**
```bash
curl "https://your-domain.com/api/v1/error-logs/list?errorCode=ERR.AUTH.LOGIN_FAILED&page=1&pageSize=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Error Log list fetched successfully",
  "data": {
    "items": [...],
    "total": 150,
    "page": 1,
    "page_size": 20,
    "total_pages": 8
  }
}
```

### Export Error Logs to CSV

**Endpoint:** `GET /api/v1/error-logs/export`

Exports error logs as a streaming CSV file.

**Query Parameters:** Same filters as `/list` endpoint (except pagination).

**Example:**
```bash
curl "https://your-domain.com/api/v1/error-logs/export?errorCode=ERR.AUTH.LOGIN_FAILED&fromDate=2025-01-01" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o error-logs.csv
```

**Response:** CSV file download with headers:
- `id`, `eventDateTime`, `errorCode`, `errorSeverity`, `sourceType`, `sourceName`, `actorUserId`, `environment`, `ip`, `userAgent`, `resolvedMessage`

---

## Error Master API

### Create Error Master

**Endpoint:** `POST /api/v1/error-master/create`

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `errorCode` | string | Yes | Unique error code (3-120 chars, format: `ERR.<MODULE>.<ACTION>`) |
| `errorType` | string | Yes | Must exist in 'errorType' value-set (`Business` \| `System` \| `Integration`) |
| `errorSeverity` | string | Yes | Must exist in 'errorSeverity' value-set (`CRITICAL` \| `HIGH` \| `MEDIUM` \| `LOW`) |
| `messages` | array | Yes | List of localized message templates |
| `log` | boolean | No | Whether to log this error (default: true) |
| `moduleId` | string | No | Foreign key reference to modules collection |
| `businessArea` | string | No | Business area (max 120 chars) |
| `technicalArea` | string | No | Technical area (max 120 chars) |
| `tool` | string | No | Tool name (max 120 chars) |
| `partnerSystem` | string | No | Partner system name (max 120 chars) |
| `thirdParty` | string | No | Third party name (max 120 chars) |
| `devMessage` | string | No | Developer message (max 2000 chars) |
| `helpLink` | string | No | Help documentation URL |
| `videoLink` | string | No | Video tutorial URL |

### Localized Message Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `language` | string | Yes | ISO-639-1 language code (e.g., `"en"`, `"hi"`) |
| `template` | string | Yes | Message template with `{lowerCamelCase}` placeholders |

**Example:**
```json
{
  "errorCode": "ERR.PAYMENT.TRANSACTION_FAILED",
  "errorType": "Business",
  "errorSeverity": "HIGH",
  "log": true,
  "moduleId": "68f1234567890abcdef12345",
  "businessArea": "Payments",
  "technicalArea": "Gateway",
  "messages": [
    {
      "language": "en",
      "template": "Payment of {amount} {currency} failed for order {orderId}. Error: {errorMessage}"
    },
    {
      "language": "hi",
      "template": "आदेश {orderId} के लिए {amount} {currency} का भुगतान विफल। त्रुटि: {errorMessage}"
    }
  ],
  "devMessage": "Check payment gateway logs and retry configuration",
  "helpLink": "https://docs.example.com/payments/troubleshooting"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "code": 201,
  "message": "Error Master created successfully",
  "data": {
    "id": "69252b970f12097edf21a3a7",
    "errorCode": "ERR.PAYMENT.TRANSACTION_FAILED",
    "errorType": "Business",
    "errorSeverity": "HIGH",
    "log": true,
    "moduleId": "68f1234567890abcdef12345",
    "businessArea": "Payments",
    "technicalArea": "Gateway",
    "messages": [...],
    "devMessage": "Check payment gateway logs and retry configuration",
    "helpLink": "https://docs.example.com/payments/troubleshooting",
    "videoLink": null,
    "isActive": true,
    "isDelete": false,
    "createdBy": "68ee46b5d4c7a020fdf3a87c",
    "createdAt": "2025-11-29T10:00:00.000Z",
    "createdIp": "192.168.1.50",
    "updatedBy": null,
    "updatedAt": null,
    "updatedIp": null
  }
}
```

### Error Code Format

Error codes must follow the namespaced format:

```
<PREFIX>.<MODULE>.<COMPONENT>.<ACTION>[.<QUALIFIERS>...]
```

**Valid Prefixes:**
- `ERR` - Error codes
- `NOTIF` - Notification codes
- `LOG` - Log codes
- `PERM` - Permission codes
- `VALUESET` - Value set codes
- `CONFIG` - Configuration codes
- `WFSTEP` - Workflow step codes
- `PROMPT` - Prompt codes
- `AGENT` - Agent codes
- `CONN` - Connection codes
- `TESTCASE` - Test case codes

**Examples:**
- `ERR.AUTH.LOGIN_FAILED`
- `ERR.PAYMENT.GATEWAY.TIMEOUT`
- `ERR.FIR.VALIDATION.MISSING_FIELD`
- `NOTIF.USER.REGISTRATION_COMPLETE`

### Bulk Create Error Masters

**Endpoint:** `POST /api/v1/error-master/bulk-create`

**Request:**
```json
{
  "items": [
    {
      "errorCode": "ERR.AUTH.LOGIN_FAILED",
      "errorType": "Business",
      "errorSeverity": "WARNING",
      "log": true,
      "messages": [
        {"language": "en", "template": "Login failed for {userName}"}
      ]
    },
    {
      "errorCode": "ERR.AUTH.SESSION_EXPIRED",
      "errorType": "System",
      "errorSeverity": "LOW",
      "log": true,
      "messages": [
        {"language": "en", "template": "Session expired for user {userId}"}
      ]
    }
  ]
}
```

**Response:**
```json
{
  "success": [...],
  "failed": [...],
  "totalSuccess": 2,
  "totalFailed": 0
}
```

### List Error Masters

**Endpoint:** `GET /api/v1/error-master/list`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | - | Page number (>=1). If not provided, returns all records |
| `pageSize` | int | 20 | Items per page (>=1, max: 200) |
| `q` | string | - | Search in errorCode (case-insensitive regex) |
| `errorSeverity` | string | - | Filter by severity |
| `errorType` | string | - | Filter by type |
| `createdFrom` | datetime | - | Filter from creation date |
| `createdTo` | datetime | - | Filter to creation date |

### Get Error Master by ID

**Endpoint:** `GET /api/v1/error-master/get/{id}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | MongoDB ObjectId |

### Get Error Master by Code

**Endpoint:** `GET /api/v1/error-master/get/by-code/{error_code}`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `error_code` | string | Yes | Error code string |

**Example:**
```bash
curl "https://your-domain.com/api/v1/error-master/get/by-code/ERR.AUTH.LOGIN_FAILED" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update Error Master

**Endpoint:** `PATCH /api/v1/error-master/update/{id}`

All fields are optional. **Note:** `errorCode` is immutable and cannot be changed.

**Request:**
```json
{
  "errorSeverity": "CRITICAL",
  "devMessage": "Updated troubleshooting steps"
}
```

### Delete Error Master (Soft Delete)

**Endpoint:** `DELETE /api/v1/error-master/delete/{id}`

Performs a soft delete (sets `isDelete: true`, `isActive: false`).

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Error Master deleted successfully"
}
```

### Restore Error Master

**Endpoint:** `PATCH /api/v1/error-master/restore/{id}`

Restores a soft-deleted Error Master (sets `isDelete: false`, `isActive: true`).

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Error Master restored successfully"
}
```

---

## Error Handling

### Common Errors

| Error | HTTP | Cause | Solution |
|-------|------|-------|----------|
| `errorCode does not exist in master` | 400 | Error code not found | Verify errorCode exists in Error Master |
| `errorCode must match ^[A-Z0-9_\\.:-]{3,120}$` | 422 | Invalid errorCode format | Use valid characters and length |
| `errorCode should follow namespaced form` | 422 | Non-standard errorCode | Use format `ERR.<MODULE>.<ACTION>` |
| `Resolved message empty while master.log=true` | 400 | Missing template or params | Ensure template exists and all placeholders are filled |
| `Error Master already exists` | 409 | Duplicate errorCode | Use unique errorCode |
| `language must be ISO-639-1` | 422 | Invalid language code | Use valid 2-letter ISO-639-1 code |
| `template placeholder must be lowerCamelCase` | 422 | Invalid placeholder format | Use `{lowerCamelCase}` format |
| `You don't have permission to...` | 403 | RBAC permission denied | Check user permissions |
| `Invalid id format` | 400 | Invalid ObjectId | Use valid MongoDB ObjectId |
| `Module not found` | 404 | moduleId doesn't exist | Verify moduleId |

### Standard Response Format

All API responses follow this format:

**Success:**
```json
{
  "success": true,
  "code": 200,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "code": 400,
  "message": "Error description",
  "error_code": "ERR.ERROR_MASTER.VALIDATION"
}
```

### Missing Placeholder Values

If your `parametersJson` doesn't include all placeholders from the template:
```
Template: "Login failed for {userName} from {clientIp}"
parametersJson: {"userName": "john"}  // missing clientIp

Result: "Login failed for john from {clientIp}"
```
The missing placeholder will remain in the generated message.

---

## RBAC Permissions

All endpoints require authentication and appropriate RBAC permissions:

### ERROR_LOGS Permissions
| Operation | Required Permission |
|-----------|-------------------|
| Create error log | CREATE |
| List/Search logs | READ |
| Export CSV | READ |

### ERROR_MASTER Permissions
| Operation | Required Permission |
|-----------|-------------------|
| Create error master | CREATE |
| Bulk create | CREATE |
| List/Get error masters | READ |
| Update error master | UPDATE |
| Delete error master | DELETE |
| Restore error master | UPDATE |

---

## Best Practices

1. **Follow the errorCode naming convention:** `ERR.<MODULE>.<COMPONENT>.<ACTION>`
2. **Always include all placeholder values** from the Error Master template
3. **Use appropriate errorSeverity:**
   - `CRITICAL` - System down, immediate attention required
   - `HIGH` - Major functionality affected
   - `MEDIUM` - Partial impact, workaround available
   - `LOW` - Minor issues, informational
4. **Use appropriate errorType:**
   - `Business` - Business rule violations, validation errors
   - `System` - Infrastructure, database, internal errors
   - `Integration` - Third-party API failures, external service errors
5. **Include stack traces** for `CRITICAL` and `HIGH` severity errors
6. **Use i18n messages** - Always provide at least an `"en"` template
7. **Set `log: true`** for errors that need audit trail
8. **Include sourceType and sourceName** for traceability

---

## API Endpoints Summary

### Error Log Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/error-logs/create` | POST | Create error log entry |
| `/api/v1/error-logs/list` | GET | List logs with filters |
| `/api/v1/error-logs/export` | GET | Export logs to CSV |

### Error Master Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/error-master/create` | POST | Create error master |
| `/api/v1/error-master/bulk-create` | POST | Bulk create error masters |
| `/api/v1/error-master/list` | GET | List all Error Master templates |
| `/api/v1/error-master/get/{id}` | GET | Get error master by ID |
| `/api/v1/error-master/get/by-code/{error_code}` | GET | Get error master by errorCode |
| `/api/v1/error-master/update/{id}` | PATCH | Update error master |
| `/api/v1/error-master/delete/{id}` | DELETE | Soft delete error master |
| `/api/v1/error-master/restore/{id}` | PATCH | Restore soft-deleted error master |

---

## Archival

Error logs are automatically archived after 90 days:
- Hot collection: `error_logs` (recent logs)
- Archive collection: `error_logs_archive` (older logs)

Use `includeArchive=true` query parameter to search both collections.
