# UC2 Core Main BE - API Documentation

> **Version**: 1.0.0
> **Base URL**: `{HOST}/core`
> **Root Path**: `/core`
> **Port**: 8000
> **Framework**: FastAPI + MongoDB (Motor async driver)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Standard Response Format](#standard-response-format)
4. [Pagination](#pagination)
5. [Error Handling](#error-handling)
6. [API Endpoints](#api-endpoints)
   - [Authentication](#1-authentication-apiv1auth)
   - [Personnel Master](#2-personnel-master-apiv1personnel-master)
   - [Units](#3-units-apiv1units)
   - [Departments](#4-departments-apiv1departments)
   - [Districts](#5-districts-apiv1districts)
   - [Mandals](#6-mandals-apiv1mandals)
   - [Rank Master](#7-rank-master-apiv1rank-master)
   - [Designation Master](#8-designation-master-apiv1designation-master)
   - [Unit Type](#9-unit-type-apiv1unit-types)
   - [Unit Villages](#10-unit-villages-apiv1unit-villages)
   - [Roles](#11-roles-apiv1roles)
   - [Permissions](#12-permissions-apiv1permissions)
   - [Jobs](#13-jobs-apiv1jobs)
   - [User Role Permissions](#14-user-role-permissions-apiv1user-role-permissions)
   - [Modules](#15-modules-apiv1modules)
   - [Value Sets](#16-value-sets-apiv1value-sets)
   - [Error Master](#17-error-master-apiv1error-masters)
   - [Error Logs](#18-error-logs-apiv1error-logs)
   - [Prompts](#19-prompts-apiv1prompts)
   - [Approval Flows](#20-approval-flows-apiv1approval-flows)
7. [Foreign Key References](#foreign-key-references)
8. [RBAC Permission Matrix](#rbac-permission-matrix)

---

## Overview

This API provides core services for the UC2 platform including:

- **Master Data Management**: Personnel, Units, Departments, Districts, Ranks, Designations
- **RBAC (Role-Based Access Control)**: Roles, Permissions, Jobs, User Mappings
- **Logging & Error Tracking**: Error Master, Error Logs
- **Configuration**: Value Sets, Modules, Prompts

### Who Uses This API?

| Consumer | Use Case |
|----------|----------|
| **Frontend Applications** | User authentication, data management UI |
| **Other Microservices** | Personnel lookup, unit hierarchy, permissions validation |
| **Admin Dashboard** | RBAC management, error monitoring |
| **Background Jobs** | Log archival, data sync |

---

## Authentication

### Authentication Flow

```
1. Login with userId + password → Get initial JWT token
2. Select unit + role → Get auth token with specific permissions
3. Use auth token for all subsequent API calls
```

### Headers Required

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Token Types

| Token Type | Obtained From | Contains | Use For |
|------------|---------------|----------|---------|
| **Login Token** | `POST /api/v1/auth/login` | userId, fullName, units array | Selecting unit/role |
| **Auth Token** | `POST /api/v1/auth/get-auth-token` | unitId, roleId, districtId | All API operations |

---

## Standard Response Format

### Success Response

```json
{
  "success": true,
  "code": 200,
  "message": "Request successful",
  "data": { },
  "pagination": null
}
```

### Success Response with Pagination

```json
{
  "success": true,
  "code": 200,
  "message": "Personnel fetched successfully",
  "data": [ ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### Error Response

```json
{
  "success": false,
  "code": 400,
  "message": "Validation error",
  "data": null,
  "error": {
    "errorCode": "ERR.PERSONNEL.VALIDATION",
    "details": "userId: must be exactly 8 digits"
  }
}
```

---

## Pagination

### Query Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | int | null | - | Page number (1-indexed). If not provided, returns all records |
| `page_size` | int | 10 | 1000 | Records per page. Only used if `page` is provided |

### Behavior

- **Without `page`**: Returns ALL records (no pagination)
- **With `page` only**: Uses default `page_size` of 10
- **With both**: Paginated response

---

## Error Handling

### Error Code Format

```
ERR.{MODULE}.{ACTION}
```

**Examples:**
- `ERR.PERSONNEL.VALIDATION`
- `ERR.UNITS.NOT_FOUND`
- `ERR.AUTH.INVALID_CREDENTIALS`

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized |
| 403 | Forbidden (No Permission) |
| 404 | Not Found |
| 409 | Conflict (Duplicate) |
| 422 | Validation Error (Pydantic) |
| 500 | Internal Server Error |

---

## API Endpoints

---

## 1. Authentication (`/api/v1/auth`)

### 1.1 Login

**Endpoint:** `POST /api/v1/auth/login`
**Auth Required:** No
**RBAC Job:** N/A

**Purpose:** Authenticate user and get initial JWT token with unit-role assignments.

**Request Body:**
```json
{
  "userId": "12345678",
  "password": "your_password"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | string | Yes | 8-digit police user identifier |
| password | string | Yes | Min 8 characters |

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "tokenType": "bearer",
    "expiresIn": 60
  }
}
```

**Token Payload Contains:**
```json
{
  "sub": "64f1234567890abcdef12345",
  "id": "64f1234567890abcdef12345",
  "userId": "12345678",
  "fullName": "John Doe",
  "units": [
    {
      "unitId": "64f...",
      "name": "District HQ",
      "roles": [
        { "roleId": "64f...", "name": "Inspector" }
      ],
      "designationId": "64f..."
    }
  ]
}
```

---

### 1.2 Get Current User

**Endpoint:** `GET /api/v1/auth/me`
**Auth Required:** Yes (Bearer Token)
**RBAC Job:** N/A

**Purpose:** Get authenticated user's profile information.

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "User info fetched successfully",
  "data": {
    "_id": "64f1234567890abcdef12345",
    "userId": "12345678",
    "name": "John Doe",
    "email": "john.doe@police.gov.in",
    "mobile": "+919876543210",
    "departmentId": "64f...",
    "rankId": "64f...",
    "units": [...]
  }
}
```

---

### 1.3 Get Auth Token

**Endpoint:** `POST /api/v1/auth/get-auth-token`
**Auth Required:** Yes (Bearer Token from login)
**RBAC Job:** N/A

**Purpose:** Generate auth token for specific unit + role combination (required for all other API operations).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| unitId | string | Yes | MongoDB ObjectId of the unit |
| roleId | string | Yes | MongoDB ObjectId of the role |

**Request:**
```http
POST /api/v1/auth/get-auth-token?unitId=64f...&roleId=64f...
Authorization: Bearer <login_token>
```

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Auth token generated successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "tokenType": "bearer",
    "expiresIn": 60
  }
}
```

**Auth Token Payload Contains:**
```json
{
  "sub": "64f1234567890abcdef12345",
  "id": "64f1234567890abcdef12345",
  "unitId": "64f...",
  "unitName": "District HQ",
  "roleId": "64f...",
  "roleName": "Inspector",
  "districtId": "64f...",
  "districtName": "Hyderabad"
}
```

---

### 1.4 Get Permissions

**Endpoint:** `GET /api/v1/auth/get-permissions`
**Auth Required:** Yes (Bearer Token from get-auth-token)
**RBAC Job:** N/A

**Purpose:** Get consolidated permissions for the current user's unit + role.

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Permissions fetched successfully",
  "data": {
    "id": "64f...",
    "unitId": "64f...",
    "roleId": "64f...",
    "permissions": [
      {
        "moduleId": "64f...",
        "moduleName": "Core",
        "jobs": [
          {
            "jobName": "PERSONNELS",
            "permissions": [
              { "name": "CREATE", "isSelf": false },
              { "name": "READ", "isSelf": false },
              { "name": "UPDATE", "isSelf": false },
              { "name": "DELETE", "isSelf": false }
            ]
          }
        ]
      }
    ]
  }
}
```

---

### 1.5 Decode Token (Debug)

**Endpoint:** `GET /api/v1/auth/decode-token`
**Auth Required:** No
**RBAC Job:** N/A

**Purpose:** Decode and view JWT token payload (for debugging).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | JWT token string |

---

## 2. Personnel Master (`/api/v1/personnel-master`)

**Collection:** `personnel_master`
**RBAC Job:** `PERSONNELS`

### 2.1 Create Personnel

**Endpoint:** `POST /api/v1/personnel-master/create`
**Permission Required:** CREATE

**Request Body:**
```json
{
  "email": "officer@police.gov.in",
  "name": "John Doe",
  "userId": "12345678",
  "password": "securepassword123",
  "units": [
    {
      "unitId": "64f1234567890abcdef12345",
      "designationId": "64f1234567890abcdef12346"
    }
  ],
  "departmentId": "64f1234567890abcdef12347",
  "rankId": "64f1234567890abcdef12348",
  "mobile": "+919876543210",
  "gender": "male",
  "dateOfBirth": "1990-01-15",
  "badgeNo": "123456",
  "createdIp": "192.168.1.1"
}
```

| Field | Type | Required | Validation | FK Reference |
|-------|------|----------|------------|--------------|
| email | string | Yes | RFC 5322, unique | - |
| name | string | Yes | Alphabets, spaces, hyphens, min 3 letters | - |
| userId | string | Yes | Exactly 8 digits, unique | - |
| password | string | Yes | Min 8 chars, BCrypt hashed | - |
| units | array | Yes | Min 1 item, at least one with designationId | `unit_master._id`, `designation_master._id` |
| departmentId | string | Yes | Valid ObjectId | `department_master._id` |
| rankId | string | Yes | Valid ObjectId | `rank_master._id` |
| mobile | string | No | Indian format (+91XXXXXXXXXX) | - |
| gender | string | No | "male" or "female" | - |
| badgeNo | string | No | Numbers only, unique | - |
| dateOfBirth | datetime | No | - | - |

**Response (201):**
```json
{
  "success": true,
  "code": 201,
  "message": "Personnel created successfully",
  "data": {
    "_id": "64f1234567890abcdef12345",
    "email": "officer@police.gov.in",
    "name": "John Doe",
    "userId": "12345678",
    "units": [...],
    "isActive": true,
    "isDelete": false,
    "createdBy": "64f...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### 2.2 List Personnel

**Endpoint:** `GET /api/v1/personnel-master/list`
**Permission Required:** READ

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | null | Page number (1-indexed) |
| page_size | int | 10 | Records per page (max 1000) |
| search | string | null | Search in name, email, userId, badgeNo |
| unitId | string | null | Filter by unit ID (FK) |
| departmentId | string | null | Filter by department ID (FK) |
| rankId | string | null | Filter by rank ID (FK) |
| include_deleted | bool | false | Include soft-deleted records |

**Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Personnel fetched successfully",
  "data": [
    {
      "_id": "64f...",
      "email": "officer@police.gov.in",
      "name": "John Doe",
      "userId": "12345678",
      "units": [
        {
          "unitId": "64f...",
          "designationId": "64f...",
          "unit": { "_id": "64f...", "name": "District HQ" },
          "designation": { "_id": "64f...", "name": "Inspector" }
        }
      ],
      "department": { "_id": "64f...", "name": "CID" },
      "rank": { "_id": "64f...", "name": "SI" }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

---

### 2.3 Get Personnel by ID

**Endpoint:** `GET /api/v1/personnel-master/{personnel_id}`
**Permission Required:** READ

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| personnel_id | string | MongoDB ObjectId |

---

### 2.4 Update Personnel

**Endpoint:** `PATCH /api/v1/personnel-master/update/{personnel_id}`
**Permission Required:** UPDATE

> **Note:** `userId` cannot be updated once created.

**Request Body (partial update):**
```json
{
  "name": "Updated Name",
  "mobile": "+919876543211",
  "rankId": "64f...",
  "updatedIp": "192.168.1.2"
}
```

---

### 2.5 Delete Personnel (Soft Delete)

**Endpoint:** `DELETE /api/v1/personnel-master/delete/{personnel_id}`
**Permission Required:** DELETE

Sets `isDelete: true`. Record remains in database.

---

### 2.6 Restore Personnel

**Endpoint:** `PATCH /api/v1/personnel-master/restore/{personnel_id}`
**Permission Required:** UPDATE

Sets `isDelete: false`.

---

## 3. Units (`/api/v1/units`)

**Collection:** `unit_master`
**RBAC Job:** `UNITS`

### 3.1 Create Unit

**Endpoint:** `POST /api/v1/units/create`
**Permission Required:** CREATE

**Request Body:**
```json
{
  "policeReferenceId": "HYD-001",
  "name": "Hyderabad City Police",
  "email": "hcp@police.gov.in",
  "districtId": "64f...",
  "responsibleUserId": "64f...",
  "departmentId": "64f...",
  "unitTypeId": "64f...",
  "parentUnitId": "64f...",
  "address1": "Police Bhavan",
  "city": "Hyderabad",
  "zip": "500001",
  "phone": ["040-12345678"]
}
```

| Field | Type | Required | Validation | FK Reference |
|-------|------|----------|------------|--------------|
| policeReferenceId | string | Yes | Unique | - |
| name | string | Yes | Alphabets, spaces, -_() only | - |
| email | string | Yes | Valid email | - |
| districtId | string | Yes | Valid ObjectId | `district_master._id` |
| responsibleUserId | string | Yes | Valid ObjectId | `personnel_master._id` |
| departmentId | string | No | Valid ObjectId | `department_master._id` |
| unitTypeId | string | No | Valid ObjectId | `unit_type_master._id` |
| parentUnitId | string | No | Valid ObjectId | `unit_master._id` (self-reference) |
| zip | string | No | Exactly 6 digits | - |
| phone | array | No | Numbers and hyphens only | - |

> **Auto-calculated:** `parentUnitPath` is automatically calculated based on `parentUnitId`.

---

### 3.2 List Units

**Endpoint:** `GET /api/v1/units/list`
**Permission Required:** READ

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | null | Page number |
| page_size | int | 10 | Records per page |
| search | string | null | Search in name, policeReferenceId, city |
| departmentId | string | null | Filter by department (FK) |
| parentUnitId | string | null | Filter by parent unit (FK) |
| districtId | string | null | Filter by district (FK) |
| include_deleted | bool | false | Include soft-deleted |

---

### 3.3 List Units Minimal (For Dropdowns)

**Endpoint:** `GET /api/v1/units/list-minimal`
**Permission Required:** READ

**Purpose:** Lightweight endpoint returning only `_id` and `name` for dropdowns/selects.

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": "64f...", "name": "District HQ" },
    { "id": "64f...", "name": "City Police" }
  ]
}
```

---

### 3.4 Get Unit Hierarchy

**Endpoint:** `GET /api/v1/units/unit-hierarchy/{unit_id}`
**Permission Required:** None (public)

**Purpose:** Get unit hierarchy from top-level parent to the specified unit.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "unitId": "64f...",
      "unitName": "State Police HQ",
      "parentUnitId": null,
      "responsibleUserId": "64f...",
      "rankId": "64f...",
      "rankShortCode": "DGP"
    },
    {
      "unitId": "64f...",
      "unitName": "District HQ",
      "parentUnitId": "64f...",
      "responsibleUserId": "64f...",
      "rankId": "64f...",
      "rankShortCode": "SP"
    }
  ]
}
```

---

### 3.5 Get Personnel by Unit and Rank

**Endpoint:** `GET /api/v1/units/personnel-by-rank/{unit_id}/{rank_id}`
**Permission Required:** READ

**Purpose:** Get all personnel working in a specific unit with a specific rank.

---

### 3.6 Toggle Active Status

**Endpoint:** `PATCH /api/v1/units/active/{unit_id}`
**Permission Required:** UPDATE

**Request Body:**
```json
{
  "isActive": false,
  "updatedIp": "192.168.1.1"
}
```

---

### 3.7 Delete Unit (Soft Delete)

**Endpoint:** `DELETE /api/v1/units/delete/{unit_id}`
**Permission Required:** DELETE

> **Validation:** Cannot delete if unit has child units (parentUnitId references).

---

## 4. Departments (`/api/v1/departments`)

**Collection:** `department_master`
**RBAC Job:** `DEPARTMENTS`

### Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | CREATE | Create department |
| GET | `/list` | READ | List with pagination & search |
| GET | `/get/{id}` | READ | Get by ID |
| PUT | `/update/{id}` | UPDATE | Update department |
| DELETE | `/delete/{id}` | DELETE | Soft delete |
| PATCH | `/restore/{id}` | UPDATE | Restore deleted |

**Create/Update Request:**
```json
{
  "name": "Criminal Investigation Department",
  "shortCode": "CID",
  "description": "Handles criminal investigations"
}
```

---

## 5. Districts (`/api/v1/districts`)

**Collection:** `district_master`
**RBAC Job:** `DISTRICT`

### Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | CREATE | Create district |
| GET | `/list` | READ | List with pagination & search |
| GET | `/get/{id}` | READ | Get by ID |
| PUT | `/update/{id}` | UPDATE | Update district |
| DELETE | `/delete/{id}` | DELETE | Soft delete |
| PATCH | `/restore/{id}` | UPDATE | Restore deleted |

**Create/Update Request:**
```json
{
  "name": "Hyderabad",
  "cctnsDistrictCd": "HYD001",
  "stateName": "Telangana"
}
```

---

## 6. Mandals (`/api/v1/mandals`)

**Collection:** `mandal_master`
**RBAC Job:** `MANDALS`

Standard CRUD endpoints same as Departments.

---

## 7. Rank Master (`/api/v1/rank-master`)

**Collection:** `rank_master`
**RBAC Job:** `RANK`

### Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | CREATE | Create rank |
| GET | `/list` | READ | List with pagination & search |
| GET | `/get/{id}` | READ | Get by ID |
| PUT | `/update/{id}` | UPDATE | Update rank |
| DELETE | `/delete/{id}` | DELETE | Soft delete |
| PATCH | `/restore/{id}` | UPDATE | Restore deleted |

**Create/Update Request:**
```json
{
  "name": "Sub Inspector",
  "shortCode": "SI",
  "level": 5,
  "description": "Sub Inspector rank"
}
```

---

## 8. Designation Master (`/api/v1/designation-master`)

**Collection:** `designation_master`
**RBAC Job:** `DESIGNATION MASTER`

### Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | CREATE | Create designation |
| POST | `/bulk-create` | CREATE | Create multiple designations |
| GET | `/list` | READ | List with pagination & search |
| GET | `/{id}` | READ | Get by ID |
| PATCH | `/update/{id}` | UPDATE | Update designation |
| DELETE | `/delete/{id}` | DELETE | Soft delete |
| PATCH | `/restore/{id}` | UPDATE | Restore deleted |
| PATCH | `/active/{id}` | UPDATE | Toggle active status |

---

## 9. Unit Type (`/api/v1/unit-types`)

**Collection:** `unit_type_master`
**RBAC Job:** `UNIT_TYPE`

Standard CRUD endpoints.

---

## 10. Unit Villages (`/api/v1/unit-villages`)

**Collection:** `unit_villages_master`
**RBAC Job:** `UNIT_VILLAGES`

**Purpose:** Map villages to units.

| Field | FK Reference |
|-------|--------------|
| unitId | `unit_master._id` |
| villageId | `value_sets._id` or village collection |

---

## 11. Roles (`/api/v1/roles`)

**Collection:** `roles_master`
**RBAC Job:** `ROLES`

### 11.1 Create Role

**Endpoint:** `POST /api/v1/roles/create`
**Permission Required:** CREATE

**Request Body:**
```json
{
  "name": "Inspector",
  "shortCode": "INS",
  "description": "Inspector role with full access",
  "permissions": [
    {
      "moduleId": "64f...",
      "moduleName": "Core",
      "jobs": [
        {
          "jobName": "PERSONNELS",
          "permissions": [
            { "name": "CREATE", "isSelf": false },
            { "name": "READ", "isSelf": false },
            { "name": "UPDATE", "isSelf": true },
            { "name": "DELETE", "isSelf": false }
          ]
        },
        {
          "jobName": "UNITS",
          "permissions": ["CREATE", "READ", "UPDATE"]
        }
      ]
    }
  ]
}
```

**Permission Structure:**
- **moduleId**: FK to `modules_master._id`
- **moduleName**: Display name for the module
- **jobs[].jobName**: Must exist in `jobs_master`
- **jobs[].permissions**: Can be string array or object array with `isSelf` flag
- **isSelf**: `true` = user can only access own data, `false` = can access all data

---

### 11.2 List Roles

**Endpoint:** `GET /api/v1/roles/list`
**Permission Required:** READ

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | null | Page number |
| page_size | int | 10 | Records per page |
| search | string | null | Search in name, shortCode, description |
| include_deleted | bool | false | Include soft-deleted |

---

## 12. Permissions (`/api/v1/permissions`)

**Collection:** `permissions_master`
**RBAC Job:** `PERMISSIONS`

**Purpose:** Define available permission types (CREATE, READ, UPDATE, DELETE, etc.).

**Create Request:**
```json
{
  "name": "CREATE",
  "description": "Permission to create new records"
}
```

---

## 13. Jobs (`/api/v1/jobs`)

**Collection:** `jobs_master`
**RBAC Job:** `JOBS`

**Purpose:** Define job names for RBAC checks.

### Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | CREATE | Create job |
| POST | `/bulk-create` | CREATE | Create multiple jobs |
| GET | `/list` | READ | List with pagination |
| GET | `/get/{id}` | READ | Get by ID |
| PUT | `/update/{id}` | UPDATE | Update job |
| DELETE | `/delete/{id}` | DELETE | Soft delete |
| PATCH | `/restore/{id}` | UPDATE | Restore deleted |
| PATCH | `/active/{id}` | UPDATE | Toggle active |

**Create Request:**
```json
{
  "name": "PERSONNELS",
  "description": "Personnel management job"
}
```

---

## 14. User Role Permissions (`/api/v1/user-role-permissions`)

**Collection:** `user_role_permissions_master`
**RBAC Job:** `USER_ROLE_PERMISSIONS`

**Purpose:** Map users to roles and units with additional/exclusion permissions.

### 14.1 Create User Role Permission

**Endpoint:** `POST /api/v1/user-role-permissions/create`
**Permission Required:** CREATE

**Request Body:**
```json
{
  "userId": "64f...",
  "unitId": "64f...",
  "roleId": "64f...",
  "additionalPermissions": [
    {
      "moduleId": "64f...",
      "moduleName": "Reports",
      "jobs": [
        {
          "jobName": "CRIME_REPORTS",
          "permissions": [{ "name": "READ", "isSelf": false }]
        }
      ]
    }
  ],
  "exclusionPermissions": []
}
```

| Field | Type | Required | FK Reference |
|-------|------|----------|--------------|
| userId | string | Yes | `personnel_master._id` |
| unitId | string | Yes | `unit_master._id` |
| roleId | string | Yes | `roles_master._id` |
| additionalPermissions | array | No | Extra permissions beyond role |
| exclusionPermissions | array | No | Permissions to remove from role |

**Consolidated Permissions Formula:**
```
Final Permissions = Role.permissions + additionalPermissions - exclusionPermissions
```

---

### 14.2 List User Role Permissions

**Endpoint:** `GET /api/v1/user-role-permissions/list`
**Permission Required:** READ

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | int | Page number |
| page_size | int | Records per page |
| userId | string | Filter by user ID |
| roleId | string | Filter by role ID |

---

## 15. Modules (`/api/v1/modules`)

**Collection:** `modules_master`
**RBAC Job:** `MODULES`

**Purpose:** Define application modules for RBAC hierarchy.

**Create Request:**
```json
{
  "name": "Core Services",
  "shortCode": "CORE",
  "description": "Core platform services"
}
```

---

## 16. Value Sets (`/api/v1/value-sets`)

**Collection:** `value_sets_master`
**RBAC Job:** `VALUE_SETS`

**Purpose:** Store enumeration values and configuration.

Standard CRUD endpoints.

---

## 17. Error Master (`/api/v1/error-masters`)

**Collection:** `error_master`
**RBAC Job:** `ERROR_MASTER`

**Purpose:** Define error codes with message templates for multi-language support.

### Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | CREATE | Create error definition |
| POST | `/bulk-create` | CREATE | Create multiple error definitions |
| GET | `/list` | READ | List with pagination & search |
| GET | `/get/{id}` | READ | Get by ID |
| GET | `/get/by-code/{error_code}` | READ | Get by error code |
| PATCH | `/update/{id}` | UPDATE | Update error definition |
| DELETE | `/delete/{id}` | DELETE | Soft delete |
| PATCH | `/restore/{id}` | UPDATE | Restore deleted |

**Create Request:**
```json
{
  "errorCode": "ERR.AUTH.INVALID_CREDENTIALS",
  "severity": "ERROR",
  "templates": {
    "en": "Invalid credentials provided",
    "hi": "अमान्य क्रेडेंशियल प्रदान किए गए"
  }
}
```

---

## 18. Error Logs (`/api/v1/error-logs`)

**Collection:** `error_logs`
**RBAC Job:** `ERROR_LOGS`

**Purpose:** Log error occurrences with context (transaction table - no isActive).

### 18.1 Create Error Log

**Endpoint:** `POST /api/v1/error-logs/create`
**Permission Required:** CREATE

**Request Body:**
```json
{
  "errorCode": "ERR.AUTH.INVALID_CREDENTIALS",
  "parametersJson": { "userId": "12345678" },
  "language": "en",
  "actorUserId": "64f...",
  "sourceType": "API",
  "sourceName": "auth_router",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "environment": "production",
  "stack": "Error stack trace..."
}
```

---

### 18.2 List Error Logs

**Endpoint:** `GET /api/v1/error-logs/list`
**Permission Required:** READ

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| page | int | Page number (default 1) |
| pageSize | int | Records per page (default 50, max 2000) |
| q | string | Full-text search on resolvedMessage |
| errorCode | string | Filter by error code |
| errorSeverity | string | Filter by severity |
| sourceType | string | Filter by source type |
| sourceName | string | Filter by source name |
| actorUserId | string | Filter by user ID |
| environment | string | Filter by environment |
| fromDate | datetime | Filter from date |
| toDate | datetime | Filter to date |
| includeArchive | bool | Include archived logs |

---

### 18.3 Export Error Logs

**Endpoint:** `GET /api/v1/error-logs/export`
**Permission Required:** READ

**Response:** CSV file download with all filtered logs.

---

## 19. Prompts (`/api/v1/prompts`)

**Collection:** `prompt_master`
**RBAC Job:** `PROMPT_TABLE`

Standard CRUD endpoints for managing prompts.

---

## 20. Approval Flows (`/api/v1/approval-flows`)

**Collection:** `approval_flow_master`
**RBAC Job:** `APPROVAL_FLOW_MASTER`

### Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/create` | CREATE | Create approval flow |
| GET | `/list` | READ | List flows |
| GET | `/get/{chain_id}` | READ | Get by ID |
| PATCH | `/update/{chain_id}` | UPDATE | Update flow |
| DELETE | `/delete/{chain_id}` | DELETE | Soft delete |
| PATCH | `/restore/{chain_id}` | UPDATE | Restore deleted |
| GET | `/get/pending/by-user-module-district/{module_id}` | READ | Get pending approvals for current user |

---

## Foreign Key References

### Quick Reference Table

| Collection | Field | References | Description |
|------------|-------|------------|-------------|
| `personnel_master` | departmentId | `department_master._id` | Employee's department |
| `personnel_master` | rankId | `rank_master._id` | Employee's rank |
| `personnel_master` | units[].unitId | `unit_master._id` | Assigned units |
| `personnel_master` | units[].designationId | `designation_master._id` | Designation in each unit |
| `unit_master` | districtId | `district_master._id` | Unit's district |
| `unit_master` | departmentId | `department_master._id` | Unit's department |
| `unit_master` | unitTypeId | `unit_type_master._id` | Type of unit |
| `unit_master` | responsibleUserId | `personnel_master._id` | Unit head |
| `unit_master` | proxyUserId | `personnel_master._id` | Acting head |
| `unit_master` | parentUnitId | `unit_master._id` | Parent unit (self-ref) |
| `user_role_permissions_master` | userId | `personnel_master._id` | User being mapped |
| `user_role_permissions_master` | unitId | `unit_master._id` | Unit context |
| `user_role_permissions_master` | roleId | `roles_master._id` | Role assignment |
| `unit_villages_master` | unitId | `unit_master._id` | Assigned unit |
| `error_logs` | actorUserId | `personnel_master._id` | User who caused error |

---

## RBAC Permission Matrix

### Job Names

| Job Constant | Job Name String | Used For |
|--------------|-----------------|----------|
| `PERSONNEL_MASTER` | "PERSONNELS" | Personnel management |
| `UNITS` | "UNITS" | Unit management |
| `DEPARTMENTS` | "DEPARTMENTS" | Department management |
| `DISTRICT` | "DISTRICT" | District management |
| `MANDALS` | "MANDALS" | Mandal management |
| `RANK` | "RANK" | Rank management |
| `DESIGNATION_MASTER` | "DESIGNATION MASTER" | Designation management |
| `UNIT_TYPE` | "UNIT_TYPE" | Unit type management |
| `UNIT_VILLAGES` | "UNIT_VILLAGES" | Unit-village mapping |
| `ROLES` | "ROLES" | Role management |
| `PERMISSIONS` | "PERMISSIONS" | Permission management |
| `JOBS` | "JOBS" | Job management |
| `USER_ROLE_PERMISSIONS` | "USER_ROLE_PERMISSIONS" | User-role mapping |
| `MODULES` | "MODULES" | Module management |
| `VALUE_SETS` | "VALUE_SETS" | Value set management |
| `ERROR_MASTER` | "ERROR_MASTER" | Error definition |
| `ERROR_LOGS` | "ERROR_LOGS" | Error logging |
| `PROMPT_MASTER` | "PROMPT_TABLE" | Prompt management |
| `APPROVAL_FLOW_MASTER` | "APPROVAL_FLOW_MASTER" | Approval workflow |

### Permission Types

| Permission | Description |
|------------|-------------|
| CREATE | Create new records |
| READ | Read/list records |
| UPDATE | Modify existing records |
| DELETE | Soft delete records |
| RESTORE | Restore soft-deleted records |

### isSelf Flag

When `isSelf: true` in permissions:
- User can only access records where `createdBy` matches their user ID
- Used for self-service operations

---

## Appendix

### Soft Delete Pattern

All master collections use soft delete:
- `isDelete: false` = Active record
- `isDelete: true` = Soft-deleted record
- Default queries filter `isDelete: false`
- Use `include_deleted=true` query param to include deleted records

### Audit Fields

All records include:
```json
{
  "createdBy": "64f...",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "createdIp": "192.168.1.1",
  "updatedBy": "64f...",
  "updatedAt": "2024-01-15T11:00:00.000Z",
  "updatedIp": "192.168.1.2",
  "isActive": true,
  "isDelete": false
}
```

### Correlation Headers

All requests/responses include:
- `x-request-id`: Unique request identifier
- `x-trace-id`: Trace ID for distributed tracing

---

> **Last Updated:** December 2024
> **Maintained By:** UC2 Core Team
