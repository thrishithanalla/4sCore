# Audit Log System - Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [Database Collections](#database-collections)
3. [Database Indexes](#database-indexes)
4. [Backend - Log Master Endpoints](#backend---log-master-endpoints)
5. [Backend - Log Transaction Endpoints](#backend---log-transaction-endpoints)
6. [Backend - Dashboard Endpoint](#backend---dashboard-endpoint)
7. [Backend - Internal Logging Service](#backend---internal-logging-service)
8. [Backend - Schemas & Validations](#backend---schemas--validations)
9. [Frontend - Architecture](#frontend---architecture)
10. [Frontend - Main Page](#frontend---main-page)
11. [Frontend - Overview Tab Components](#frontend---overview-tab-components)
12. [Frontend - Activity Log Tab Components](#frontend---activity-log-tab-components)
13. [Frontend - Master Log Tab Components](#frontend---master-log-tab-components)
14. [Frontend - Services & Hooks](#frontend---services--hooks)
15. [Frontend - TypeScript Types](#frontend---typescript-types)
16. [Data Flow](#data-flow)
17. [Performance Optimizations](#performance-optimizations)

---

## Overview

The Audit Log System is a full-stack logging and monitoring platform built with:
- **Backend**: FastAPI + MongoDB (Motor async driver) + Pydantic
- **Frontend**: React + TypeScript + PrimeReact + Tailwind CSS + React Query

Two main entities:
- **audit_log_master** - Configuration templates defining what events to log
- **audit_log** - Individual audit log entries created when events occur

---

## Database Collections

| Collection | Constant | Description |
|-----------|----------|-------------|
| `audit_log_master` | `Collections.LOG_MASTER` | Log template definitions |
| `audit_log` | `Collections.LOG_TRANSACTION` | Actual log entries |
| `personnel_master` | - | Personnel data (used for actor name lookups) |

---

## Database Indexes

Created on startup in `app/core/database.py`:

### audit_log
| Index | Fields | Purpose |
|-------|--------|---------|
| EventTimeStamp DESC | `EventTimeStamp: -1` | Sorting, date range filters |
| entityType ASC | `entityType: 1` | Entity type filter, breakdown chart |
| eventcode ASC | `eventcode: 1` | Event code filter, most repeated |
| actorId ASC | `actorId: 1` | User filter, top users |
| Compound | `EventTimeStamp: -1, entityType: 1` | Combined filter+sort queries |

### audit_log_master
| Index | Fields | Purpose |
|-------|--------|---------|
| eventCode ASC | `eventCode: 1` | Lookup by event code |
| isDelete ASC | `isDelete: 1` | Soft delete filtering |
| name ASC | `name: 1` | Lookup by log code name |

---

## Backend - Log Master Endpoints

**Router prefix**: `/api/v1/log-master`
**File**: `app/api/v1/routers/log_master_router.py`

### POST /create
Creates a new log master template.

**Request Body** (`LogMasterCreateSchema`):

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| eventCode | string | Yes | 1-200 chars, unique | Unique event identifier |
| logObject | string | Yes | 1-200 chars | Entity on which action is performed |
| action | string | Yes | 1-100 chars | Operation performed |
| keyFields | string | Yes | 1-500 chars | Identifier fields for tracking |
| parameters | string[] | No | - | Fields captured from API request |
| retentionPeriod | int | Yes | > 0, default 365 | Log retention in days |
| messageTemplate | string | Yes | min 1 char | Message format with {placeholders} |
| templateParameters | Dict | No | - | Variables used in messageTemplate |
| isActive | bool | No | default true | Whether template is active |
| layer | string | Yes | 1-100 chars | Application layer |
| isUsageTrackable | bool | Yes | - | Trackable for analytics |
| isSensitive | bool | Yes | - | Contains sensitive data |
| description | string | Yes | 1-1000 chars | Description of the audit event |
| logLevel | string | No | 1-50 chars, default "INFO" | INFO, WARNING, ERROR |
| logtype | string | No | 1-50 chars, default "AUDIT" | Log type category |

**Validations**:
- All string fields are trimmed
- `eventCode` must be unique across all records
- `retentionPeriod` must be > 0

**Response**: 201 Created with `LogMasterResponseSchema`

---

### POST /bulk-create
Bulk creates multiple log masters.

**Request Body**:
```json
{ "items": [LogMasterCreateSchema, ...] }
```

**Response**:
```json
{
  "success": [created items],
  "failed": [{ "index": 0, "eventCode": "...", "error": "..." }],
  "totalSuccess": number,
  "totalFailed": number
}
```

---

### GET /list
Lists log masters with pagination and filters.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | - | Page number (ge=1). If omitted, returns all |
| page_size | int | 10 | Items per page (1-1000) |
| layer | string | - | Filter by layer |
| action | string | - | Filter by action |
| logObject | string | - | Filter by logObject |
| logtype | string | - | Filter by logtype |
| eventCode | string | - | Search by eventCode (regex, case-insensitive) |
| include_deleted | bool | false | Include soft-deleted records |

**Response**: Paginated list of `LogMasterResponseSchema`

---

### GET /get
Get a single log master by ID.

**Query Parameters**: `id` (string, required) - MongoDB ObjectId

**Errors**: 400 (invalid ObjectId), 404 (not found)

---

### PUT /update
Update an existing log master.

**Query Parameters**: `id` (string, required)
**Request Body**: `LogMasterUpdateSchema` (all fields optional)

**Validations**: eventCode uniqueness if being changed

---

### DELETE /delete
Soft delete a log master (sets `isDelete: true`).

**Query Parameters**: `id` (string, required)

---

## Backend - Log Transaction Endpoints

**Router prefix**: `/api/v1/log-transactions`
**File**: `app/api/v1/routers/log_transaction_router.py`

### POST /create
Creates a new audit log entry.

**Request Body** (`LogTransactionCreateSchema`):

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| layer | string | Yes | 1-100 chars | Application layer |
| eventcode | string | Yes | 1-200 chars | Event code (FK: audit_log_master.eventCode) |
| EventTimeStamp | datetime | Yes | - | Event occurrence time |
| actorRole | string | Yes | 1-200 chars | Role of the actor (e.g., SHO) |
| keyFields | string | Yes | 1-500 chars | Identifier fields for the record |
| parameters | Dict | No | - | Additional parameters |
| retentionPeriod | int | Yes | > 0 | Retention period in days |
| endpoint | string | Yes | 1-500 chars | API endpoint |
| entityType | string | Yes | 1-200 chars | Entity type (e.g., Case) |
| entityId | string | Yes | 1-200 chars | Entity identifier |
| orgUnitId | string | Yes | 1-200 chars | Org unit identifier |
| requestId | string | Yes | 1-200 chars | Request identifier |
| message | string | No | max 2000 chars | Log message (auto-generated if not provided) |
| Details | Dict | No | - | Additional contextual data |

**Validations**:
- `eventcode` must exist in audit_log_master (not deleted)
- `eventcode`, `entityType`, `entityId` cannot be empty (trimmed)
- If `message` not provided, auto-generated from master's `messageTemplate`

**Note**: Does NOT log its own transaction (prevents recursive calls)

---

### GET /list
Lists audit logs with filters and pagination.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | - | Page number. If omitted, returns max 10,000 |
| page_size | int | 10 | Items per page (1-1000) |
| layer | string | - | Filter by layer (exact) |
| actorId | string | - | Filter by actor ID (ObjectId validation) |
| eventcode | string | - | Filter by eventcode (exact) |
| entityType | string | - | Filter by entityType (exact) |
| entityId | string | - | Filter by entityId (exact) |
| orgUnitId | string | - | Filter by orgUnitId (exact) |
| endpoint | string | - | Filter by endpoint (regex, case-insensitive) |
| fromDate | datetime | - | Filter from date (inclusive) |
| toDate | datetime | - | Filter until date (inclusive) |
| search | string | - | Search in message (regex, case-insensitive) |

**Sorting**: EventTimeStamp DESC (default)

---

### GET /get
Get a single log by ID.

**Query Parameters**: `id` (string, required) - MongoDB ObjectId

---

### GET /analytics
Get log level analytics.

**Query Parameters**: `fromDate`, `toDate` (optional)

**Response**:
```json
{
  "total": number,
  "infoCount": number,
  "warningCount": number,
  "errorCount": number
}
```

**Pipeline**: Looks up master by eventcode to get logLevel, groups by level.

---

### DELETE /cleanup
Retention-based deletion of old logs.

For each active master template, deletes logs older than `retentionPeriod` days.

**Response**: `{ "deleted_count": number, "processed_templates": number }`

---

### GET /export
Export logs as CSV file.

**Query Parameters**: Same filters as /list (layer, actorId, eventcode, entityType, endpoint, search, fromDate, toDate)

**CSV Columns**: Timestamp, Layer, Event Code, Message, Actor Role, Endpoint, Entity Type, Entity ID, Org Unit ID

**Limit**: Max 10,000 records

---

### GET /all-users
Get all personnel for the user filter dropdown.

**Response**: `[{ "actorId": string, "name": string }]`

**Source**: `personnel_master` collection (isDelete != true), sorted by name

---

### GET /all-templates
Get all log master templates for filter dropdowns.

**Response**: `[{ "eventCode", "name", "logObject", "logLevel", "isActive", "keyFields" }]`

**Source**: `audit_log_master` (isDelete: false), sorted by eventCode

---

## Backend - Dashboard Endpoint

### GET /dashboard
Comprehensive dashboard data with tab-based optimization.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number for logs (ge=1) |
| page_size | int | 10 | Items per page (1-100) |
| layer | string | - | Filter by layer |
| entityType | string | - | Filter by entityType |
| eventcode | string | - | Filter by eventcode |
| search | string | - | Search in message AND endpoint (regex) |
| fromDate | datetime | - | Filter from date |
| toDate | datetime | - | Filter until date |
| timeline | string | - | Preset: today, last7Days, last30Days, thisMonth, lastHour, last24Hours |
| paramKey | string | - | Parameter key to filter (e.g., vehicleId) |
| paramValue | string | - | Parameter value to search (regex) |
| actorId | string | - | Filter by actor/user ID |
| sortField | string | EventTimeStamp | Field to sort logs by |
| sortOrder | int | -1 | 1=ASC, -1=DESC |
| tab | string | - | Tab mode: "overview", "activity", or null (all) |

### Tab Modes

**`tab=activity`** (fastest ~0.3-0.8s):
- Fetches: paginated logs, overview counts, level breakdown, all entity types
- Skips: analytics, trend, top modules, users, endpoints, most repeated, template health

**`tab=overview`** (~1-2s):
- Fetches: analytics, top modules, overview, level breakdown, top users, top endpoints, most repeated, template health, all entity types
- Skips: paginated logs, trend data

**`tab=null`** (all data, slowest):
- Fetches everything including trend data

### Filter Query Building (`build_filter_query`)

| Filter | MongoDB Query |
|--------|--------------|
| layer | `{ layer: value }` |
| entityType | `{ entityType: value }` |
| eventcode | `{ eventcode: value }` |
| search | `{ $or: [{ message: {$regex} }, { endpoint: {$regex} }] }` |
| paramKey + paramValue | `{ "parameters.<key>": {$regex: value} }` |
| actorId | `{ actorId: value }` |
| timeline | Converts to date range using IST timezone |
| fromDate/toDate | `{ EventTimeStamp: { $gte: from, $lte: to } }` |

### Timeline Date Ranges

| Timeline | From | To |
|----------|------|-----|
| today | Start of today (IST) | Now |
| thisMonth | 1st of month (IST) | Now |
| lastHour | Now - 1 hour | Now |
| last24Hours | Now - 24 hours | Now |
| last7Days | Now - 7 days | Now |
| last30Days | Now - 30 days | Now |

### Response Structure (`DashboardResponse`)

```json
{
  "analytics": { "total": 0, "API": 9777, "FUNCTION": 196, ... },
  "trend": { "lastHour": [], "last24Hours": [], "last7Days": [], "last30Days": [] },
  "topLogModules": [{ "entityType": "AUTH", "logCount": 4678 }, ...],
  "logs": {
    "items": [{ log with actorName from personnel_master lookup }],
    "total": 10001, "page": 1, "page_size": 10, "total_pages": 1001
  },
  "overview": { "totalLogs": 10001, "totalTemplates": 1053, "todayLogs": 0, "weekLogs": 0 },
  "byLevel": { "info": 10000, "warning": 0, "error": 1 },
  "topUsers": [{ "actorId": "...", "name": "Officer Name", "count": 1974 }],
  "topEndpoints": [{ "endpoint": "/core/api/v1/auth/me", "count": 2237 }],
  "mostRepeated": [{ "eventcode": "LOG.CORE.AUTH...", "name": "...", "count": 4255 }],
  "templateHealth": { "total": 1053, "activeWithLogs": 50, "activeNoLogs": 1003, "inactive": 0, "deleted": 0 },
  "allEntityTypes": ["AUTH", "CRPC", "FILEUPLOAD", "OPERATOR", "PETITION", ...]
}
```

### Dashboard Aggregations Detail

| Aggregation | What it does | Limit |
|-------------|-------------|-------|
| `get_analytics_counts` | Groups by `$toUpper(layer)`, counts per layer | All |
| `get_top_log_entities` | Groups by entityType, top N | 5 |
| `get_paginated_logs` | Paginated + `$lookup` personnel_master for actorName | page_size |
| `get_overview_counts` | `$facet` for totalLogs, todayLogs, weekLogs, totalTemplates | All |
| `get_level_breakdown` | `$lookup` master for logLevel, group by level | All |
| `get_top_users` | Groups by actorId, `$lookup` personnel_master | 10 |
| `get_top_endpoints` | Groups by endpoint (non-null) | 10 |
| `get_most_repeated` | Groups by eventcode, `$lookup` master for name | 10 |
| `get_template_health` | `$facet` on master for active/inactive/deleted counts | All |
| `get_all_entity_types` | `distinct("entityType")` | All |

---

## Backend - Internal Logging Service

**File**: `app/api/v1/services/log_logger.py`

### log_transaction()
Used by other backend modules to log activity directly to the database.

```python
await log_transaction(
    request=request,
    log_code="LOG.CORE.PERSONNEL.CREATED",
    json_values={"personnelId": "123", "userName": "John"},
    layer="api",        # default
    level="info",       # default
    endpoint=None,      # auto-extracted from request
    actor_user_id=None  # auto-extracted from JWT
)
```

**Process**:
1. Extracts actor user ID from JWT token
2. Gets client IP from headers (X-Client-IP > X-Forwarded-For > client.host)
3. Looks up template in audit_log_master by `name` field
4. Generates message from template by replacing {placeholders}
5. Builds log document with: layer, level, message, eventcode, EventTimeStamp, entityType, keyFields, retentionPeriod, actorRole, parameters, endpoint, actorId
6. Inserts into audit_log collection

**Fields populated from master**: eventcode, entityType (from logObject), keyFields, retentionPeriod
**Fields set automatically**: EventTimeStamp (IST), actorRole ("SYSTEM"), parameters (json_values)

### Helper Functions

| Function | Purpose |
|----------|---------|
| `get_ist_now()` | Current datetime in IST (UTC+5:30) |
| `get_client_ip(request)` | Extract IP from headers |
| `get_user_id_from_token(request)` | Decode JWT for user ID |
| `generate_message_from_template(template, values)` | Replace {placeholders} in template |

---

## Backend - Schemas, Constraints & Validations

### Log Master - Field Constraints

**File**: `app/api/v1/schemas/log_master_schema.py`

#### LogMasterCreateSchema (all fields below are required unless noted)

| Field | Type | Required | Min Length | Max Length | Default | Constraints |
|-------|------|----------|------------|------------|---------|-------------|
| eventCode | string | Yes | 1 | 200 | - | Must be unique across all records (including soft-deleted). Trimmed. Cannot be empty/whitespace. |
| logObject | string | Yes | 1 | 200 | - | Trimmed. Cannot be empty/whitespace. Represents the entity (e.g., "Camera", "AUTH"). |
| action | string | Yes | 1 | 100 | - | Trimmed. Cannot be empty/whitespace. (e.g., "Create", "UPDATE", "VIEW") |
| keyFields | string | Yes | 1 | 500 | - | Trimmed. Cannot be empty/whitespace. Comma-separated identifier field names. |
| parameters | string[] | No | - | - | null | Array of parameter field names captured from API request. |
| retentionPeriod | integer | Yes | - | - | 365 | Must be > 0. Determines how many days logs are kept before cleanup. |
| messageTemplate | string | Yes | 1 | - | - | Trimmed. Cannot be empty/whitespace. Uses `{placeholder}` syntax for variable substitution. |
| templateParameters | Dict | No | - | - | null | Key-value pairs of variables used inside messageTemplate. |
| isActive | boolean | No | - | - | true | Whether this template is active and can generate logs. |
| layer | string | Yes | 1 | 100 | - | Application layer (e.g., "API", "screen", "function", "config"). |
| isUsageTrackable | boolean | Yes | - | - | - | Whether logs from this template count toward usage analytics. |
| isSensitive | boolean | Yes | - | - | - | Whether logs may contain sensitive data requiring masking. |
| description | string | Yes | 1 | 1000 | - | Trimmed. Cannot be empty/whitespace. Human-readable description. |
| logLevel | string | No | 1 | 50 | "INFO" | Severity level: INFO, WARNING, ERROR. |
| logtype | string | No | 1 | 50 | "AUDIT" | Log category type (e.g., AUDIT, USAGE). |

#### LogMasterUpdateSchema (all fields optional)

Same fields as create, but all optional. When provided:
- String fields are trimmed and validated for non-empty
- `retentionPeriod` must be > 0 if provided
- `eventCode` uniqueness re-validated if changed
- At least one field must be provided (empty update rejected)

#### Field Validators (Create & Update)

| Validator | Fields | Rule | Error Message |
|-----------|--------|------|---------------|
| `validate_log_object` | logObject | Strip whitespace, reject empty | "logObject cannot be empty" |
| `validate_action` | action | Strip whitespace, reject empty | "action cannot be empty" |
| `validate_key_fields` | keyFields | Strip whitespace, reject empty | "keyFields cannot be empty" |
| `validate_message_template` | messageTemplate | Strip whitespace, reject empty | "messageTemplate cannot be empty" |
| `validate_event_code` | eventCode | Strip whitespace, reject empty | "eventCode cannot be empty" |
| `validate_description` | description | Strip whitespace, reject empty | "description cannot be empty" |
| `validate_retention_period` | retentionPeriod | Must be > 0 | "retentionPeriod must be greater than 0" |

#### Business Rules - Log Master

| Rule | Endpoint | Error Code | HTTP Status |
|------|----------|------------|-------------|
| eventCode must be unique | POST /create, PUT /update | ERR.CORE.LOG_MASTER.DUPLICATE_EVENT_CODE | 422 |
| ID must be valid ObjectId | GET /get, PUT /update, DELETE /delete | ERR.CORE.VALIDATION.INVALID_OBJECTID | 400 |
| Record must exist and not be deleted | GET /get, PUT /update, DELETE /delete | ERR.CORE.LOG_MASTER.NOT_FOUND | 404 |
| At least one field required for update | PUT /update | ERR.CORE.LOG_MASTER.NO_FIELDS | 400 |
| Bulk create min 1 item | POST /bulk-create | Pydantic validation | 422 |

#### Audit Metadata (auto-populated)

| Field | On Create | On Update | On Delete |
|-------|-----------|-----------|-----------|
| createdBy | null (no auth required) | - | - |
| createdAt | Current IST time | - | - |
| createdIp | Client IP address | - | - |
| updatedBy | - | null | null |
| updatedAt | - | Current IST time | Current IST time |
| updatedIp | - | Client IP | Client IP |
| isDelete | false | - | true |

---

### Log Transaction - Field Constraints

**File**: `app/api/v1/schemas/log_transaction_schema.py`

#### LogTransactionCreateSchema

| Field | Type | Required | Min Length | Max Length | Constraints |
|-------|------|----------|------------|------------|-------------|
| layer | string | Yes | 1 | 100 | Application layer where event occurred. |
| eventcode | string | Yes | 1 | 200 | **FK: audit_log_master.eventCode**. Must exist in master and not be deleted. Trimmed. Cannot be empty. |
| EventTimeStamp | datetime | Yes | - | - | ISO 8601 format. Event occurrence time. |
| actorRole | string | Yes | 1 | 200 | Role of the user (e.g., "SHO", "SP", "SYSTEM"). |
| keyFields | string | Yes | 1 | 500 | Identifier field names for tracking. |
| parameters | Dict | No | - | - | JSON object of additional event parameters. |
| retentionPeriod | integer | Yes | - | - | Must be > 0. How long this log is kept (days). |
| endpoint | string | Yes | 1 | 500 | API endpoint or route that triggered the event. |
| entityType | string | Yes | 1 | 200 | Trimmed. Cannot be empty. Entity category (e.g., "AUTH", "CRPC"). |
| entityId | string | Yes | 1 | 200 | Trimmed. Cannot be empty. Unique entity identifier. |
| orgUnitId | string | Yes | 1 | 200 | Organization unit identifier. |
| requestId | string | Yes | 1 | 200 | Request tracking identifier. |
| message | string | No | - | 2000 | Log message. **Auto-generated from master's messageTemplate if not provided.** |
| Details | Dict | No | - | - | JSON object of additional contextual data. |
| actorId | - | Auto | - | - | **Auto-populated from JWT token** (not in request body). |

#### Field Validators (Log Transaction)

| Validator | Fields | Rule | Error Message |
|-----------|--------|------|---------------|
| `validate_eventcode` | eventcode | Strip whitespace, reject empty | "eventcode cannot be empty" |
| `validate_entity_type` | entityType | Strip whitespace, reject empty | "entityType cannot be empty" |
| `validate_entity_id` | entityId | Strip whitespace, reject empty | "entityId cannot be empty" |

#### Business Rules - Log Transaction

| Rule | Error Code | HTTP Status |
|------|------------|-------------|
| eventcode must exist in audit_log_master (isDelete: false) | ERR.CORE.LOG_CODE.NOT_FOUND | 404 |
| eventcode format must be valid | ERR.CORE.VALIDATION.REQUIRED | 400 |
| actorId (if provided for /list filter) must be valid ObjectId | ERR.CORE.VALIDATION.INVALID_OBJECTID | 400 |
| ID must be valid ObjectId (for /get) | ERR.CORE.VALIDATION.INVALID_OBJECTID | 400 |
| Message auto-generated if not provided | - | - |
| Does NOT log its own transaction (prevents recursion) | - | - |

---

### Dashboard Query Parameter Constraints

| Parameter | Type | Min | Max | Default | Constraint |
|-----------|------|-----|-----|---------|------------|
| page | integer | 1 | - | 1 | Must be >= 1 |
| page_size | integer | 1 | 100 | 10 | Must be 1-100 for dashboard, 1-1000 for list |
| sortField | string | - | - | "EventTimeStamp" | Must be a valid field name in audit_log |
| sortOrder | integer | - | - | -1 | Must be 1 (ASC) or -1 (DESC) |
| timeline | string | - | - | null | Must be one of: today, thisMonth, lastHour, last24Hours, last7Days, last30Days |
| tab | string | - | - | null | Must be one of: overview, activity, or null |
| fromDate | datetime | - | - | null | ISO 8601 format. Inclusive lower bound. |
| toDate | datetime | - | - | null | ISO 8601 format. Inclusive upper bound. |
| search | string | - | - | null | Regex pattern. Searches in message AND endpoint fields. |
| paramKey | string | - | - | null | Parameter key name for nested query. Used with paramValue. |
| paramValue | string | - | - | null | Regex pattern. Requires paramKey to be set. |

---

### Error Codes Reference

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| ERR.CORE.LOG_MASTER.NOT_FOUND | 404 | Log master with given ID not found or deleted |
| ERR.CORE.LOG_MASTER.DUPLICATE_EVENT_CODE | 422 | eventCode already exists in another record |
| ERR.CORE.LOG_MASTER.NO_FIELDS | 400 | Update request has no fields to update |
| ERR.CORE.LOG_CODE.NOT_FOUND | 404 | eventcode not found in audit_log_master |
| ERR.CORE.VALIDATION.REQUIRED | 400 | Required field missing or empty |
| ERR.CORE.VALIDATION.INVALID_OBJECTID | 400 | ID parameter is not a valid MongoDB ObjectId |
| ERR.CORE.INTERNAL.UNHANDLED_EXCEPTION | 500 | Unexpected server error |

---

### DashboardResponse Pydantic Schema

**File**: `app/api/v1/schemas/response_schemas.py`

| Field | Type | Required | Allows Extra |
|-------|------|----------|-------------|
| analytics | DashboardAnalytics | Yes | Yes (dynamic layer keys) |
| trend | TrendData | Yes | No (requires lastHour, last24Hours, last7Days, last30Days) |
| topLogModules | List[TopLogModule] | Yes | No |
| logs | DashboardLogsData | Yes | No |
| overview | OverviewData | No | No |
| byLevel | LevelBreakdown | No | No |
| topUsers | List[TopUserItem] | No | No |
| topEndpoints | List[TopEndpointItem] | No | No |
| mostRepeated | List[MostRepeatedItem] | No | No |
| templateHealth | TemplateHealthData | No | No |
| allEntityTypes | List[string] | No | No |

**Important**: `TrendData` has required fields. Passing `{}` for trend causes Pydantic validation error (500). Must always pass `{"lastHour": [], "last24Hours": [], "last7Days": [], "last30Days": []}`.

---

## Frontend - Architecture

```
uc2_core_fe/src/
  pages/log-transaction/
    log-transaction-list.tsx      # Main dashboard page
    log-detail-drawer.tsx         # Activity log detail sidebar
    components/
      OverviewCards.tsx            # Summary stat cards
      ModuleGrid.tsx              # Entity type breakdown chart
      LayerLevelBreakdown.tsx     # Layer activity chart
      TopActivity.tsx             # Top users/endpoints/repeated (clickable)
      SystemHealth.tsx            # Template health status
      ActivityFilterBar.tsx       # 10-field filter bar
      ActivityTable.tsx           # Paginated log table with sort
      MasterLogTab.tsx            # Master template list
      MasterDetailDrawer.tsx      # Master detail sidebar
  hooks/
    useAuditDashboard.ts          # React Query hooks
  services/
    log-transaction.service.ts    # API service (auditlogApi axios instance)
    log-master.service.ts         # Master API service
  types/
    log-transaction.types.ts      # All TypeScript interfaces
```

---

## Frontend - Main Page

**File**: `log-transaction-list.tsx`
**Route**: `/log-transaction`

### Layout
```
[Header: Title + Live Button]
[Overview Cards: Total | Info | Warnings | Errors]
[Tab View]
  [Overview] [Activity Log] [Master Log]
```

### State
| State | Type | Default | Purpose |
|-------|------|---------|---------|
| activeTab | number | 0 | 0=Overview, 1=Activity, 2=Master |
| autoRefresh | boolean | false | Live mode (120s interval) |
| filters | AuditDashboardFilters | {page:1, page_size:10} | All filter values |
| first | number | 0 | Pagination offset |
| selectedLog | LogTransaction | null | Selected log for detail drawer |
| drawerOpen | boolean | false | Detail drawer visibility |
| dateRange | Date[] | null | Calendar date range |

### Tab-Based API Optimization
- `tab` param derived from `activeTab`: 0 -> "overview", 1 -> "activity"
- Only fetches data needed for the active tab
- Switching tabs triggers a new API call with different `tab` param

---

## Frontend - Overview Tab Components

### OverviewCards
4 stat cards showing: Total Logs, Info count, Warnings, Errors (with percentages)

### ModuleGrid
Horizontal bar chart of top 5 entity types by log count.
Title: "Entity Type Activity Breakdown"

### LayerLevelBreakdown
Horizontal bar chart of logs grouped by layer (API, Function, Config, etc.).
Color-coded per layer. Shows count + percentage.

### TopActivity (Clickable)
Three ranked lists side by side:
1. **Top Users** (blue) - Click -> filters Activity tab by actorId
2. **Most Accessed Endpoints** (green) - Click -> searches Activity tab
3. **Most Repeated Logs** (purple) - Click -> filters Activity tab by eventcode

### SystemHealth
2x2 grid showing template health: Active with logs, Active no logs, Inactive, Deleted + Total.

---

## Frontend - Activity Log Tab Components

### ActivityFilterBar
10 filter fields in a flex row:

| Filter | Type | Stores | Features |
|--------|------|--------|----------|
| Layer | Dropdown | filters.layer | Static options |
| Entity Type | Dropdown | filters.entityType | Dynamic from API, searchable, virtual scroll |
| User | Dropdown | filters.actorId | All personnel, searchable, virtual scroll |
| Event Code | Dropdown | filters.eventcode | All templates, searchable, virtual scroll |
| Search | Text input | filters.search | Searches message + endpoint |
| Key Field | Dropdown | filters.paramKey | From template keyFields |
| Value | Text input | filters.paramValue | Visible only when Key Field selected |
| Date Range | Calendar | dateRange | Range picker, dd/mm/yy format |
| Presets | 4 buttons | filters.timeline | Today, 7 Days, 30 Days, This Month |
| Clear | Button | - | Resets all filters |

### ActivityTable
PrimeReact DataTable with lazy server-side pagination and sorting.

**Columns**:
| Column | Sortable | Width | Display |
|--------|----------|-------|---------|
| Timestamp | Yes | 140px | Formatted date, monospace |
| Layer | Yes | 90px | Color-coded Tag |
| Event Code | Yes | auto | Monospace |
| Message | No | 15% | Truncated (line-clamp-1) |
| Actor | Yes | auto | Name + (Role) |
| Endpoint | Yes | auto | Monospace |
| Actions | No | 100px | "View Details" link |

**Features**: Export CSV, live streaming indicator, rows per page [5,10,25,50,100]

### LogDetailDrawer
Right sidebar (700px) showing full log details in colored sections:
- Basic Info (Layer, Timestamp, Event Code, Actor Role, Actor Name, Retention)
- Entity Information (Entity Type, Entity ID, Org Unit, Request ID, Key Fields)
- Endpoint
- Message
- Parameters (expandable accordion)
- Details (expandable accordion)
- Raw JSON (expandable accordion)
- Log ID + Copy button

---

## Frontend - Master Log Tab Components

### MasterLogTab
Filter bar (search by eventCode + Layer dropdown) + DataTable + detail drawer.

**Columns**: Event Code (with logObject subtitle), Action, Description, Layer, Level (Tag), Key Fields, Actions

**Features**: Lazy pagination, export CSV, debounced search (500ms)

### MasterDetailDrawer
Right sidebar showing full template details:
- Event Code, Log Object, Action, Layer, Level, Type
- Description, Message Template
- Key Fields, Parameters (as tags), Retention Period
- Template Parameters (key-value pairs)
- Flags (Active, Usage Trackable, Sensitive)
- Metadata (Created/Updated timestamps, ID)

---

## Frontend - Services & Hooks

### logTransactionService
**Base URL**: `VITE_AUDITLOG_API_BASE_URL` (env variable)
**Auth**: Bearer token from localStorage

| Method | Path | Purpose |
|--------|------|---------|
| getDashboard(filters) | GET /dashboard | Combined dashboard data |
| search(params) | GET /list | Search logs |
| getAnalytics(params) | GET /analytics | Level analytics |
| exportCSV(params) | GET /export | CSV download |
| getAllUsers() | GET /all-users | Personnel for dropdown |
| getAllTemplates() | GET /all-templates | Templates for dropdown |

### logMasterService
| Method | Path | Purpose |
|--------|------|---------|
| getAllPaginated(params) | GET /list | Paginated list |
| getById(id) | GET /get | Single master |
| create(payload) | POST /create | Create master |
| update(id, payload) | PUT /update | Update master |
| delete(id) | DELETE /delete | Soft delete |
| bulkCreate(items) | POST /bulk-create | Bulk create |
| getAllForExport(params) | GET /list | Export data |

### React Query Hooks

| Hook | Query Key | Stale Time | Refetch Interval |
|------|-----------|------------|------------------|
| useAuditDashboard(filters) | ['audit-dashboard', filters] | 60s | 2 min |
| useAllUsers() | ['audit-dashboard-users'] | 5 min | - |
| useAllTemplates() | ['audit-dashboard-templates'] | 5 min | - |

---

## Frontend - TypeScript Types

### Core Types
```typescript
type LogLevel = 'info' | 'warning' | 'error';
type LogLayer = 'screen' | 'function' | 'api' | 'config' | 'API' | 'Server' | 'db';
```

### LogTransaction
```typescript
interface LogTransaction {
  _id: string;
  layer: string;
  eventcode: string;
  EventTimeStamp: string;
  actorId?: string;
  actorName?: string;         // From personnel_master lookup
  actorRole?: string;
  keyFields?: string;
  parameters?: Record<string, any>;
  retentionPeriod?: number;
  message?: string;
  endpoint?: string;
  entityType?: string;
  entityId?: string;
  orgUnitId?: string;
  requestId?: string;
  Details?: Record<string, any>;
}
```

### AuditDashboardFilters
```typescript
interface AuditDashboardFilters {
  layer?: string;
  entityType?: string;
  eventcode?: string;
  actorId?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  timeline?: string;          // today, last7Days, last30Days, thisMonth
  paramKey?: string;
  paramValue?: string;
  sortField?: string;         // default: EventTimeStamp
  sortOrder?: number;         // 1=ASC, -1=DESC
  tab?: string;               // overview, activity
  page?: number;
  page_size?: number;
}
```

### Dashboard Data Types
```typescript
interface AuditOverview { totalLogs, totalTemplates, todayLogs, weekLogs }
interface LevelBreakdown { info, warning, error }
interface TopUser { actorId, name, count }
interface TopEndpoint { endpoint, count }
interface MostRepeatedLog { eventcode, name, logObject?, count }
interface TopLogModule { entityType, logCount }
interface TemplateHealth { total, activeWithLogs, activeNoLogs, inactive, deleted }
interface LogTemplate { eventCode, name, logObject, logLevel, isActive, keyFields? }
interface UserOption { actorId, name }
```

---

## Data Flow

```
                    BACKEND                              FRONTEND

personnel_master ─┐
                  ├─> /dashboard ──> useAuditDashboard() ──> LogTransactionList
audit_log ────────┤     (tab=overview|activity)              ├── OverviewCards
                  │                                          ├── ModuleGrid
audit_log_master ─┘                                          ├── LayerLevelBreakdown
                                                             ├── TopActivity (clickable)
                                                             ├── SystemHealth
                                                             ├── ActivityFilterBar
                                                             ├── ActivityTable
                                                             │   └── LogDetailDrawer
                                                             └── MasterLogTab
                                                                 └── MasterDetailDrawer

personnel_master ──> /all-users ──> useAllUsers() ──> User dropdown
audit_log_master ──> /all-templates ──> useAllTemplates() ──> EventCode dropdown
audit_log_master ──> /log-master/list ──> logMasterService ──> MasterLogTab
```

---

## Performance Optimizations

### 1. MongoDB Indexes
Created on startup for all frequently queried fields. Reduces query time from full collection scans to index lookups.

### 2. Tab-Based Data Splitting
The `/dashboard` endpoint accepts a `tab` param:
- `tab=activity` runs only 4 queries (~0.3-0.8s)
- `tab=overview` runs 9 queries (~1-2s)
- Without tab, runs all 11 queries (~8-13s)

### 3. Layer Normalization
`get_analytics_counts` groups by `$toUpper(layer)` to merge `"api"` and `"API"` into one entry.

### 4. Template Health Optimization
Uses `distinct("eventcode")` + in-memory comparison instead of expensive `$lookup` from master to transaction collection.

### 5. Virtual Scrolling
Large dropdowns (Event Code: 1053 items, Entity Type, Users) use PrimeReact's `virtualScrollerOptions={{ itemSize: 38 }}` to render only visible items.

### 6. React Query Caching
- Dashboard data: staleTime 60s, refetchInterval 2 min
- Users/Templates: staleTime 5 min (rarely change)

### 7. Debounced Search
MasterLogTab search input debounced to 500ms to avoid excessive API calls.
