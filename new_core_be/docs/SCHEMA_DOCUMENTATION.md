# UC2 Core Main Backend - API Schema Documentation

**Version:** 2.0.0
**Last Updated:** January 2026
**Framework:** Pydantic v2 + FastAPI
**Total Schemas:** 250+

---

## Table of Contents

1. [Overview](#overview)
2. [Schema Architecture](#schema-architecture)
3. [Common Patterns](#common-patterns)
4. [Authentication Schemas](#1-authentication-schemas)
5. [Personnel Schemas](#2-personnel-schemas)
6. [Unit Schemas](#3-unit-schemas)
7. [Unit Enhance Schemas](#4-unit-enhance-schemas)
8. [Unit Villages Schemas](#5-unit-villages-schemas)
9. [Role Schemas](#6-role-schemas)
10. [User Mapping Schemas](#7-user-mapping-schemas)
11. [Onboarding Schemas](#8-onboarding-schemas)
12. [Module Schemas](#9-module-schemas)
13. [Jobs Schemas](#10-jobs-schemas)
14. [Permissions Schemas](#11-permissions-schemas)
15. [Module Job Mapping Schemas](#12-module-job-mapping-schemas)
16. [Permissions Mapping Schemas](#13-permissions-mapping-schemas)
17. [Department Schemas](#14-department-schemas)
18. [District Schemas](#15-district-schemas)
19. [Designation Schemas](#16-designation-schemas)
20. [Rank Schemas](#17-rank-schemas)
21. [Unit Type Schemas](#18-unit-type-schemas)
22. [Mandal Schemas](#19-mandal-schemas)
23. [Approval Flow Master Schemas](#20-approval-flow-master-schemas)
24. [Approval Chain Schemas](#21-approval-chain-schemas)
25. [Feedback Master Schemas](#22-feedback-master-schemas)
26. [Feedback Schemas](#23-feedback-schemas)
27. [Prompt Schemas](#24-prompt-schemas)
28. [Prompt Execution Schemas](#25-prompt-execution-schemas)
29. [Log Master Schemas](#26-log-master-schemas)
30. [Log Transaction Schemas](#27-log-transaction-schemas)
31. [Error Master Schemas](#28-error-master-schemas)
32. [Error Log Schemas](#29-error-log-schemas)
33. [Test Master Schemas](#30-test-master-schemas)
34. [Test Execution Schemas](#31-test-execution-schemas)
35. [Value Set Schemas](#32-value-set-schemas)
36. [Third Party API Schemas](#33-third-party-api-schemas)
37. [Organization Structure Schemas](#34-organization-structure-schemas)
38. [Dashboard Schemas](#35-dashboard-schemas)
39. [Notification Schemas](#36-notification-schemas)
40. [Validation Reference](#validation-reference)
41. [Error Response Format](#error-response-format)

---

## Overview

This document provides comprehensive documentation for all Pydantic schemas used in the UC2 Core Main Backend API. The schemas are designed following industry best practices:

- **Type Safety:** Strong typing using Pydantic BaseModel
- **Validation:** Built-in validators with custom validation rules
- **Documentation:** Field-level descriptions for OpenAPI/Swagger
- **Consistency:** Standardized naming conventions across all entities
- **MongoDB Integration:** ObjectId handling and BSON serialization

---

## Schema Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Layer                                    │
├─────────────────────────────────────────────────────────────────────┤
│  Request Schemas              │  Response Schemas                    │
│  ├── CreateSchema             │  ├── ResponseSchema                  │
│  ├── UpdateSchema             │  ├── ListResponseSchema              │
│  ├── SearchSchema             │  ├── BulkCreateResponseSchema        │
│  └── BulkCreateSchema         │  └── PaginatedResponseSchema         │
├─────────────────────────────────────────────────────────────────────┤
│                         BaseSchema                                   │
│              (Common fields & validation logic)                      │
├─────────────────────────────────────────────────────────────────────┤
│                       Nested Schemas                                 │
│   (NestedUnitSchema, NestedDepartmentSchema, NestedDistrictSchema)  │
├─────────────────────────────────────────────────────────────────────┤
│                    API Response DTOs                                 │
│   (Wrapper schemas with success, code, message, data, errors)       │
└─────────────────────────────────────────────────────────────────────┘
```

### Schema Naming Convention

| Suffix | Purpose | Example |
|--------|---------|---------|
| `BaseSchema` | Base fields inherited by Create/Update | `PersonnelBaseSchema` |
| `CreateSchema` | Request body for POST endpoints | `PersonnelCreateSchema` |
| `UpdateSchema` | Request body for PATCH/PUT endpoints | `PersonnelUpdateSchema` |
| `ResponseSchema` | Response body structure | `PersonnelResponseSchema` |
| `SearchSchema` | Query parameters for list/search | `PersonnelSearchSchema` |
| `BulkCreateSchema` | Batch creation request | `PersonnelBulkCreateSchema` |
| `ListResponseSchema` | List response with pagination | `PersonnelListResponseSchema` |
| `ActiveToggleSchema` | Toggle isActive status | `ModuleActiveToggleSchema` |

---

## Common Patterns

### Standard Audit Fields

All response schemas include these audit fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `string` | Yes | MongoDB ObjectId (Primary Key) |
| `isActive` | `boolean` | Yes | Active status flag (default: true) |
| `isDelete` | `boolean` | Yes | Soft delete flag (default: false) |
| `createdBy` | `string` | Yes | User ID who created the record |
| `createdAt` | `datetime` | Yes | Creation timestamp (IST) |
| `createdIp` | `string` | No | IP address of creator (max 50 chars) |
| `updatedBy` | `string` | No | User ID who last modified |
| `updatedAt` | `datetime` | No | Last modification timestamp |
| `updatedIp` | `string` | No | IP address of last updater (max 50 chars) |

### Pagination Parameters

Standard pagination for SearchSchema types:

| Field | Type | Default | Constraints | Description |
|-------|------|---------|-------------|-------------|
| `skip` | `int` | 0 | >= 0 | Records to skip |
| `limit` | `int` | 10 | 1-100 | Page size |
| `page` | `int` | 1 | >= 1 | Page number (alternative) |
| `pageSize` | `int` | 50 | 1-500 | Items per page (alternative) |

---

## 1. Authentication Schemas

**File:** `app/api/v1/schemas/auth_schema.py`

### DeviceInfoSchema
Captures device information for session tracking and FCM notifications.

| Field | Type | Required | Max Length | Description |
|-------|------|----------|------------|-------------|
| `userAgent` | `string` | No | - | Browser/App user agent |
| `deviceType` | `string` | No | - | Device type: mobile, desktop, tablet, ios, android |
| `os` | `string` | No | - | Operating system |
| `browser` | `string` | No | - | Browser name |
| `deviceName` | `string` | No | - | Device name/model |
| `fcmToken` | `string` | No | - | Firebase Cloud Messaging token |

---

### LoginSchema
User authentication request.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `userId` | `string` | Conditional | Exactly 8 digits | Police User Identifier |
| `phoneNumber` | `string` | Conditional | Indian format | Mobile number |
| `mpin` | `int/string` | Conditional | 4 digits (1000-9999) | MPIN for authentication |
| `deviceInfo` | `DeviceInfoSchema` | No | - | Device information |

**Validation Rules:**
- Either `userId` or `phoneNumber` must be provided
- `mpin` must be exactly 4 digits

**Example:**
```json
{
  "userId": "12345678",
  "mpin": 1234,
  "deviceInfo": {
    "deviceType": "android",
    "os": "Android 13",
    "fcmToken": "fcm_token_here"
  }
}
```

---

### TokenSchema
JWT token response after successful authentication.

| Field | Type | Description |
|-------|------|-------------|
| `accessToken` | `string` | JWT access token |
| `refreshToken` | `string` | Refresh token for token renewal |
| `tokenType` | `string` | Token type (default: "bearer") |
| `expiresIn` | `int` | Access token expiration in minutes |
| `refreshExpiresIn` | `int` | Refresh token expiration in days |

---

### TokenDataSchema
JWT token payload structure.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | Police User Identifier (8 digits) |
| `id` | `string` | Personnel MongoDB ObjectId |
| `fullName` | `string` | User's full name |
| `unitId` | `string` | Current unit ObjectId |
| `unitName` | `string` | Current unit name |
| `roleId` | `string` | Current role ObjectId |
| `roleName` | `string` | Current role name |
| `districtId` | `string` | District ObjectId |
| `districtName` | `string` | District name |
| `units` | `array` | Array of unit assignments with roles |

---

### VerifyOTPSchema
OTP verification request.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `personnelId` | `string` | Yes | Personnel MongoDB ObjectId |
| `otp` | `string` | Yes | 6-digit OTP code |

---

### UpdateMPINSchema
Update MPIN after OTP verification.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `personnelId` | `string` | Yes | Valid ObjectId | Personnel MongoDB ObjectId |
| `otpSessionId` | `string` | Yes | - | Session ID from verify-otp response |
| `newMpin` | `int/string` | Yes | 4 digits (1000-9999) | New 4-digit MPIN |

---

### OTPResponseSchema
Response after sending OTP.

| Field | Type | Description |
|-------|------|-------------|
| `personnelId` | `string` | Personnel MongoDB ObjectId |
| `message` | `string` | Status message |
| `otpSentTo` | `string` | Masked phone number (e.g., ****543210) |

---

### RefreshTokenSchema
Request new access token using refresh token.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshToken` | `string` | Yes | Valid refresh token |

---

### LogoutSchema
Logout and revoke refresh token.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshToken` | `string` | Yes | Refresh token to revoke |

---

### SessionSchema
Active session/device information.

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Unique session identifier |
| `deviceInfo` | `DeviceInfoSchema` | Device information |
| `ipAddress` | `string` | Client IP address |
| `lastUsedAt` | `datetime` | Last activity timestamp |
| `createdAt` | `datetime` | Session creation timestamp |
| `isCurrent` | `boolean` | Whether this is the current session |

---

### SessionListResponseSchema
List of active sessions for a user.

| Field | Type | Description |
|-------|------|-------------|
| `sessions` | `SessionSchema[]` | Array of active sessions |
| `totalSessions` | `int` | Total number of sessions |

---

### RevokeSessionSchema
Revoke a specific session.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | `string` | Yes | Session ID to revoke |

---

## 2. Personnel Schemas

**File:** `app/api/v1/schemas/personnel_schema.py`

### UnitAssignmentSchema
Unit assignment with optional designation.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `unitId` | `string` | Yes | Valid ObjectId | Unit ID (FK: unit._id) |
| `designationId` | `string` | No | Valid ObjectId | Designation ID (FK: designation_master._id) |

---

### PersonnelBaseSchema
Base schema for personnel with all common fields.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `email` | `EmailStr` | Yes | RFC 5322, max 255 | Login identifier (unique) |
| `name` | `string` | Yes | max 255, min 3 alphabets | Full name |
| `userId` | `string` | Yes | Exactly 8 digits | Police User Identifier (unique) |
| `units` | `UnitAssignmentSchema[]` | Yes | min 1 item | Unit assignments |
| `departmentId` | `string` | Yes | Valid ObjectId | Department ID |
| `rankId` | `string` | Yes | Valid ObjectId | Rank ID |
| `title` | `string` | No | max 32 | Honorific (Mr, Ms, Dr) |
| `firstName` | `string` | No | max 80 | Given name |
| `lastName` | `string` | No | max 80 | Surname |
| `picture` | `string` | No | max 512 | Profile image path/URL |
| `mobile` | `string` | No | Indian format | Mobile number (+91XXXXXXXXXX) |
| `batchYear` | `int` | No | - | Academy/service batch year |
| `badgeNo` | `string` | No | max 64, numbers only | Badge identifier (unique) |
| `dateOfBirth` | `datetime` | No | - | Date of birth |
| `gender` | `string` | No | male/female | Gender |
| `caste` | `string` | No | max 100 | Caste |
| `dateOfEnlistment` | `datetime` | No | - | Service start date |
| `deputation` | `string` | No | max 255 | Deputation information |

**Validation Rules:**
- `name`: Alphabets, spaces, hyphens, underscores only; minimum 3 alphabet characters
- `userId`: Exactly 8 digits, numbers only
- `mobile`: Indian format (+91XXXXXXXXXX, 91XXXXXXXXXX, or XXXXXXXXXX - 10 digits)
- `badgeNo`: Numbers only, no letters or special characters
- `gender`: Must be exactly 'male' or 'female' (lowercase)

---

### PersonnelCreateSchema
Extends PersonnelBaseSchema with password for creation.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `password` | `string` | Yes | min 8, max 500 | Password (BCrypt hashed before storage) |

**Example:**
```json
{
  "email": "officer@police.gov.in",
  "name": "John Doe",
  "userId": "12345678",
  "password": "SecurePass@123",
  "units": [
    { "unitId": "507f1f77bcf86cd799439011", "designationId": "507f1f77bcf86cd799439012" }
  ],
  "departmentId": "507f1f77bcf86cd799439013",
  "rankId": "507f1f77bcf86cd799439014",
  "mobile": "+919876543210",
  "gender": "male"
}
```

---

### PersonnelUpdateSchema
Update personnel (userId cannot be modified).

All fields from PersonnelBaseSchema are optional except `userId` which is immutable.

| Field | Type | Description |
|-------|------|-------------|
| `password` | `string` | New password (optional, for password change) |

---

### PersonnelResponseSchema
Personnel response with populated nested objects.

Includes all PersonnelBaseSchema fields plus:

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Personnel ID (Primary Key) |
| `units` | `UnitAssignmentResponseSchema[]` | Populated unit assignments |
| `department` | `NestedDepartmentSchema` | Populated department data |
| `rank` | `NestedRankSchema` | Populated rank data |
| + Audit Fields | | Standard audit fields |

---

### PersonnelSearchSchema
Search/filter personnel with pagination.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `email` | `string` | null | Filter by email (partial match) |
| `userId` | `string` | null | Filter by userId (exact match) |
| `firstName` | `string` | null | Filter by firstName (partial match) |
| `lastName` | `string` | null | Filter by lastName (partial match) |
| `unitId` | `string` | null | Filter by unitId |
| `departmentId` | `string` | null | Filter by departmentId |
| `badgeNo` | `string` | null | Filter by badgeNo |
| `isDelete` | `boolean` | false | Include soft-deleted records |
| `skip` | `int` | 0 | Pagination offset (>= 0) |
| `limit` | `int` | 10 | Page size (1-100) |

---

### PersonnelBulkCreateSchema
Bulk create multiple personnel.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | `PersonnelCreateSchema[]` | Yes | List of personnel to create (min 1) |

---

### PersonnelBulkCreateResponseSchema
Response for bulk create operation.

| Field | Type | Description |
|-------|------|-------------|
| `success` | `dict[]` | Successfully created personnel with IDs |
| `failed` | `dict[]` | Failed items with error details |
| `totalSuccess` | `int` | Count of successfully created |
| `totalFailed` | `int` | Count of failed items |

---

### PersonnelByUnitsAndRoleRequestSchema
Query personnel by units and role.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `unitIds` | `string[]` | Yes | List of unit IDs (min 1) |
| `roleId` | `string` | Yes | Role ID to filter by |
| `includeDeleted` | `boolean` | No | Include soft-deleted records |

---

### Nested Schemas for Personnel

#### NestedUnitSchema
| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Unit ID |
| `name` | `string` | Unit name |
| `policeReferenceId` | `string` | Police reference ID |
| `unitType` | `object` | Nested unit type |
| `district` | `object` | Nested district |

#### NestedDesignationSchema
| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Designation ID |
| `name` | `string` | Designation name |
| `designationCd` | `string` | Designation code |

#### NestedDepartmentSchema
| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Department ID |
| `name` | `string` | Department name |

#### NestedRankSchema
| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Rank ID |
| `name` | `string` | Rank name |
| `shortCode` | `string` | Short code |

---

## 3. Unit Schemas

**File:** `app/api/v1/schemas/unit_schema.py`

### UnitBaseSchema
Base schema for organizational units.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `policeReferenceId` | `string` | Yes | max 100 | Canonical string code (unique) |
| `name` | `string` | Yes | max 200, min 2 alphabets | Unit name |
| `email` | `EmailStr` | Yes | max 255 | Official email address |
| `districtId` | `string` | Yes | Valid ObjectId | District FK |
| `responsibleUserId` | `string` | Yes | Valid ObjectId | Responsible user FK |
| `logo` | `string` | No | - | Logo image reference |
| `address1` | `string` | No | max 500 | Address line 1 |
| `address2` | `string` | No | max 500 | Address line 2 |
| `city` | `string` | No | max 100 | City |
| `zip` | `string` | No | Exactly 6 digits | Postal/ZIP code |
| `phone` | `string[]` | No | Numbers/hyphens only | Phone numbers array |
| `responsiblePersonTitle` | `string` | No | max 255 | Title of responsible person |
| `isVirtual` | `boolean` | No | - | Virtual unit flag |
| `unitTypeId` | `string` | No | Valid ObjectId | Unit type FK |
| `departmentId` | `string` | No | Valid ObjectId | Department FK |
| `proxyUserId` | `string` | No | Valid ObjectId | Proxy user FK |
| `parentUnitId` | `string` | No | Valid ObjectId | Parent unit FK |
| `parentUnitPath` | `string` | No | - | Hierarchical path string |
| `unitPersonnelList` | `string[]` | No | ObjectId array | Personnel list |

**Validation Rules:**
- `name`: Alphabets, spaces, -_() only; minimum 2 alphabet characters
- `zip`: Exactly 6 digits
- `phone`: Each phone number can only contain numbers and hyphens

---

### UnitResponseSchema
Includes all UnitBaseSchema fields plus populated nested objects:

| Field | Type | Description |
|-------|------|-------------|
| `department` | `NestedDepartmentSchema` | Populated department |
| `unitType` | `NestedUnitTypeSchema` | Populated unit type |
| `parentUnit` | `NestedParentUnitSchema` | Populated parent unit |
| `district` | `NestedDistrictSchema` | Populated district |
| `responsibleUser` | `NestedResponsibleUserSchema` | Populated responsible user |

---

### UnitSearchSchema
Search/filter units.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `policeReferenceId` | `string` | null | Filter by reference ID |
| `name` | `string` | null | Filter by name (partial match) |
| `districtId` | `string` | null | Filter by district |
| `city` | `string` | null | Filter by city |
| `departmentId` | `string` | null | Filter by department |
| `parentUnitId` | `string` | null | Filter by parent unit |
| `isDelete` | `boolean` | false | Include deleted records |
| `skip` | `int` | 0 | Pagination offset |
| `limit` | `int` | 10 | Page size |

---

### UnitHierarchyItemSchema
Unit in hierarchy response.

| Field | Type | Description |
|-------|------|-------------|
| `unitId` | `string` | Unit ID |
| `unitName` | `string` | Unit name |
| `parentUnitId` | `string` | Parent unit ID |
| `responsibleUserId` | `string` | Responsible user ID |
| `rankId` | `string` | Rank ID from personnel |
| `rankShortCode` | `string` | Rank short code |

---

## 4. Unit Enhance Schemas

**File:** `app/api/v1/schemas/unit_enhance_schema.py`

Enhanced unit schema with auto-generated `unitCd` and array-based `unitPath`.

### UnitEnhanceBaseSchema
Extended unit schema with enhanced features.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `policeReferenceId` | `string` | Yes | max 100, non-empty | Canonical string code (unique) |
| `name` | `string` | Yes | max 200, min 2 alphabets | Unit name (NOT unique - uniqueness via unitCd) |
| `email` | `EmailStr` | Yes | max 255 | Official email address |
| `districtId` | `string` | Yes | Valid ObjectId | District FK |
| `unitTypeId` | `string` | Yes | Valid ObjectId | Unit type FK (required for unitCd) |
| `responsibleUserId` | `string` | No | Valid ObjectId | Responsible user FK |
| `logo` | `string` | No | - | Logo image reference |
| `address1` | `string` | No | max 500 | Address line 1 |
| `address2` | `string` | No | max 500 | Address line 2 |
| `city` | `string` | No | max 100 | City |
| `zip` | `string` | No | 6 digits | Postal/ZIP code |
| `phone` | `string[]` | No | Numbers/hyphens | Phone numbers |
| `responsiblePersonTitle` | `string` | No | max 255 | Title of responsible person |
| `isVirtual` | `boolean` | No | - | Virtual unit flag |
| `departmentId` | `string` | No | Valid ObjectId | Department FK |
| `proxyUserId` | `string` | No | Valid ObjectId | Proxy user FK |
| `parentUnitId` | `string` | No | Valid ObjectId | Parent unit FK |
| `unitPersonnelList` | `string[]` | No | ObjectId array | Personnel list |
| `responsibleUserHistory` | `ResponsibleUserHistoryEnhance[]` | No | - | History of responsible users |

**Auto-generated Fields:**
- `unitCd`: Unique code generated as `{name}_{unitTypeName}` (e.g., "CentralStation_PoliceStation")
- `unitPath`: Array of unit names in hierarchical path (e.g., ["Central Station", "City Police", "State Police"])

---

### ResponsibleUserHistoryEnhance
History entry for responsible user changes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `string` | Yes | Previous user ID |
| `from` | `datetime` | Yes | Start date of assignment |
| `to` | `datetime` | Yes | End date of assignment |
| `title` | `string` | Yes | User's title at that time |
| `reason` | `string` | Yes | Reason for change |
| `changedBy` | `string` | Yes | User who made the change |
| `changedAt` | `datetime` | Yes | When the change was made |

---

### UnitEnhanceResponseSchema
Response with auto-generated fields and populated nested objects.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Unit ID (Primary Key) |
| `unitCd` | `string` | Unique unit code (name_unitTypeName) |
| `unitPath` | `string[]` | Hierarchical path as array of unit names |
| `department` | `NestedDepartmentSchema` | Populated department |
| `unitType` | `NestedUnitTypeSchema` | Populated unit type |
| `parentUnit` | `NestedParentUnitSchema` | Populated parent unit |
| `district` | `NestedDistrictSchema` | Populated district |
| `responsibleUser` | `NestedResponsibleUserSchema` | Populated responsible user |
| + Audit Fields | | Standard audit fields |

---

### UnitEnhanceMinimalSchema
Minimal unit schema for dropdowns.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Unit ID |
| `name` | `string` | Unit name |
| `unitCd` | `string` | Unique unit code |

---

### UnitEnhanceSearchSchema
Search/filter enhanced units.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `policeReferenceId` | `string` | null | Filter by reference ID |
| `unitCd` | `string` | null | Filter by unit code |
| `name` | `string` | null | Filter by name |
| `districtId` | `string` | null | Filter by district |
| `city` | `string` | null | Filter by city |
| `departmentId` | `string` | null | Filter by department |
| `unitTypeId` | `string` | null | Filter by unit type |
| `parentUnitId` | `string` | null | Filter by parent unit |
| `isDelete` | `boolean` | false | Include deleted records |
| `skip` | `int` | 0 | Pagination offset |
| `limit` | `int` | 10 | Page size (1-100) |

---

## 5. Unit Villages Schemas

**File:** `app/api/v1/schemas/unit_villages_schema.py`

Mapping between units and villages under their jurisdiction.

### UnitVillagesBaseSchema
Base schema for unit-village mapping.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `unitId` | `string` | Yes | Valid ObjectId | Reference to unit |
| `mandalId` | `string` | Yes | Valid ObjectId | Reference to mandal |
| `villageName` | `string` | Yes | max 200, alphabets/spaces/hyphens | Name of the village |

**Validation Rules:**
- `villageName`: Alphabets, spaces, and hyphens only; max 200 characters

---

### UnitVillagesResponseSchema
Response with populated nested objects.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Village Mapping ID |
| `unitId` | `string` | Unit ID |
| `mandalId` | `string` | Mandal ID |
| `villageName` | `string` | Village name |
| `unit` | `NestedUnitSchema` | Populated unit data |
| `mandal` | `NestedMandalSchema` | Populated mandal data |
| + Audit Fields | | Standard audit fields |

---

### NestedMandalSchema
Nested mandal data in unit-villages response.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Mandal ID |
| `mandalName` | `string` | Mandal name |
| `districtId` | `string` | District ID |

---

### UnitVillagesSearchSchema
Search/filter unit villages.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `unitId` | `string` | null | Filter by unit |
| `mandalId` | `string` | null | Filter by mandal |
| `villageName` | `string` | null | Filter by village name |
| `isDelete` | `boolean` | false | Include deleted records |
| `skip` | `int` | 0 | Pagination offset |
| `limit` | `int` | 10 | Page size (1-100) |

---

## 6. Role Schemas

**File:** `app/api/v1/schemas/role_schema.py`

### PermissionItem
Permission with access scope flag.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | - | Permission name (e.g., "VIEW", "CREATE") |
| `isSelf` | `boolean` | No | false | Access scope: true=own data only, false=all data |

---

### JobItem
Job with permissions array.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `jobName` | `string` | Yes | - | Job name |
| `isMenu` | `boolean` | No | true | Show in navigation menu |
| `displayOrder` | `int` | No | 1 | Display order in menu |
| `permissions` | `PermissionItem[]` | Yes | - | Permissions array (min 1) |

**Validation:**
- No duplicate permission names within a single job

---

### ModuleItem
Module with jobs hierarchy.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `moduleId` | `string` | Yes | Module ObjectId |
| `moduleName` | `string` | Yes | Module display name |
| `jobs` | `JobItem[]` | Yes | Jobs array (min 1) |

**Validation:**
- No duplicate job names within a single module

---

### RoleBaseSchema
Base schema for roles with hierarchical permissions.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | 1-120 chars, must contain alphabets | Role name |
| `shortCode` | `string` | Yes | 1-20 chars | Short code identifier |
| `description` | `string` | No | max 500 | Role description |
| `permissions` | `ModuleItem[]` | Yes | min 1 module | Module-job-permission hierarchy |

**Validation:**
- No duplicate module IDs in permissions array

---

### RoleResponseSchema
Role response with all permissions.

**Example Response:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Station House Officer",
  "shortCode": "SHO",
  "description": "Station House Officer role with case management permissions",
  "permissions": [
    {
      "moduleId": "507f1f77bcf86cd799439012",
      "moduleName": "Case Management",
      "jobs": [
        {
          "jobName": "View Cases",
          "isMenu": true,
          "displayOrder": 1,
          "permissions": [
            { "name": "VIEW", "isSelf": false },
            { "name": "CREATE", "isSelf": true },
            { "name": "UPDATE", "isSelf": true }
          ]
        }
      ]
    }
  ],
  "isActive": true,
  "isDelete": false,
  "createdBy": "507f1f77bcf86cd799439013",
  "createdAt": "2026-01-15T10:30:00Z"
}
```

---

## 7. User Mapping Schemas

**File:** `app/api/v1/schemas/user_mapping_schema.py`

User role-permission mappings with additional/exclusion permissions.

### ModulePermissionItem
Module-level permission structure.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `moduleId` | `string` | Yes | Module ObjectId |
| `moduleName` | `string` | Yes | Module name |
| `jobs` | `JobPermissionItem[]` | No | Jobs with permissions |

---

### JobPermissionItem
Job-level permission structure.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobName` | `string` | Yes | Job name |
| `permissions` | `PermissionItem[]` | No | Permissions array |

---

### UserMappingBaseSchema
Base schema for user-role mapping.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `roleId` | `string` | Yes | Role ObjectId |
| `userId` | `string` | Yes | User/Personnel ObjectId |
| `unitId` | `string` | Yes | Unit ObjectId |
| `additionalPermissions` | `ModulePermissionItem[]` | No | Extra permissions beyond role |
| `exclusionPermissions` | `ModulePermissionItem[]` | No | Permissions to exclude from role |

---

### UserMappingResponseSchema
Response with consolidated permissions.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | UserMapping ID |
| `roleId` | `string` | Role ID |
| `userId` | `string` | User/Personnel ID |
| `unitId` | `string` | Unit ID |
| `rankId` | `string` | Rank ID (from personnel) |
| `permissions` | `ModulePermissionItem[]` | Final permissions (role + additional - exclusion) |
| `additionalPermissions` | `ModulePermissionItem[]` | Additional permissions |
| `exclusionPermissions` | `ModulePermissionItem[]` | Excluded permissions |
| + Audit Fields | | Standard audit fields |

---

## 8. Onboarding Schemas

**File:** `app/api/v1/schemas/onboarding_schema.py`

User onboarding with personnel creation and role assignment.

### RoleMappingItem
Role-unit mapping for onboarding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `roleId` | `string` | Yes | Role ID to assign |
| `unitId` | `string` | Yes | Unit ID for the mapping |
| `additionalPermissions` | `ModulePermissionItem[]` | No | Additional permissions |
| `exclusionPermissions` | `ModulePermissionItem[]` | No | Excluded permissions |

---

### UserOnboardingCreateSchema
Complete user onboarding request.

Extends PersonnelBaseSchema with:

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `mpin` | `int` | No | 1000-9999 (4 digits) | Initial MPIN (defaults to 1111) |
| `roleMappings` | `RoleMappingItem[]` | Yes | min 1 | Role-unit mappings |

**Example:**
```json
{
  "email": "new.officer@police.gov.in",
  "name": "New Officer",
  "userId": "87654321",
  "units": [
    { "unitId": "507f1f77bcf86cd799439011" }
  ],
  "departmentId": "507f1f77bcf86cd799439012",
  "rankId": "507f1f77bcf86cd799439013",
  "mpin": 1234,
  "roleMappings": [
    {
      "roleId": "507f1f77bcf86cd799439014",
      "unitId": "507f1f77bcf86cd799439011"
    }
  ]
}
```

---

### UserOnboardingUpdateSchema
Update onboarded user.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| All PersonnelUpdateSchema fields | | No | Personnel fields to update |
| `roleMappings` | `RoleMappingUpdateItem[]` | No | Role mappings to sync |

**Role Mapping Sync Logic:**
- With `_id`: Updates existing mapping
- Without `_id`: Creates new mapping
- Mappings not in array: Soft-deleted

---

### UserOnboardingResponseSchema
Onboarding response.

| Field | Type | Description |
|-------|------|-------------|
| `personnel` | `dict` | Created/updated personnel record |
| `roleMappings` | `dict[]` | Created/updated role-unit mappings |

---

## 9. Module Schemas

**File:** `app/api/v1/schemas/module_schema.py`

### ModuleBaseSchema
Base schema for application modules.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | 1-120 chars, must contain alphabets | Module name |
| `shortCode` | `string` | Yes | 1-20 chars, non-empty | Short code identifier |
| `description` | `string` | No | max 500 | Module description |
| `displayOrder` | `int` | No | >= 0, default 0 | Display order (ascending) |

---

### ModuleActiveToggleSchema
Toggle module active status.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `isActive` | `boolean` | Yes | New active status |

---

### ModuleResponseSchema
Module response with audit fields.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Module ID |
| `name` | `string` | Module name |
| `shortCode` | `string` | Short code |
| `description` | `string` | Description |
| `displayOrder` | `int` | Display order |
| + Audit Fields | | Standard audit fields |

---

## 10. Jobs Schemas

**File:** `app/api/v1/schemas/jobs_schema.py`

### JobsBaseSchema
Base schema for jobs (actions within modules).

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | 1-120 chars, must contain alphabets | Job name |
| `shortCode` | `string` | Yes | 1-20 chars, non-empty | Short code |
| `description` | `string` | No | max 500 | Job description |
| `isMenu` | `boolean` | No | default true | Show in navigation menu |
| `displayOrder` | `int` | No | >= 0 | Display order in menu |

---

### JobsCreateSchema
Extends JobsBaseSchema with auto-generated fields.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `displayName` | `string` | No | Display name (auto-generated in PascalCase if not provided) |
| `route` | `string` | No | Route path (auto-generated in kebab-case if not provided) |

**Auto-generation Example:**
- Input name: "User Management"
- Generated displayName: "UserManagement"
- Generated route: "user-managements"

---

### JobsResponseSchema
Job response with auto-generated fields.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Job ID |
| `name` | `string` | Job name |
| `shortCode` | `string` | Short code |
| `displayName` | `string` | Display name in PascalCase |
| `route` | `string` | Route in lowercase with hyphens |
| `displayOrder` | `int` | Display order (0 if isMenu=false) |
| `isMenu` | `boolean` | Show in menu |
| + Audit Fields | | Standard audit fields |

---

## 11. Permissions Schemas

**File:** `app/api/v1/schemas/permissions_schema.py`

### PermissionsBaseSchema
Base schema for permissions.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | 1-120 chars, must contain alphabets | Permission name |
| `shortCode` | `string` | Yes | 1-20 chars, non-empty | Short code |
| `description` | `string` | No | max 500 | Permission description |

---

### PermissionsActiveToggleSchema
Toggle permission active status.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `isActive` | `boolean` | Yes | New active status |

---

## 12. Module Job Mapping Schemas

**File:** `app/api/v1/schemas/module_job_mapping_schema.py`

### ModuleJobMappingCreateSchema
Create module-job mapping.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `moduleId` | `string` | Yes | Module ObjectId |
| `jobId` | `string` | Yes | Job ObjectId |

---

### ModuleJobMappingResponseSchema
Response with resolved names.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Mapping ID |
| `moduleId` | `string` | Module ID |
| `moduleName` | `string` | Module name |
| `jobId` | `string` | Job ID |
| `jobName` | `string` | Job name |
| + Audit Fields | | Standard audit fields |

---

## 13. Permissions Mapping Schemas

**File:** `app/api/v1/schemas/permissions_mapping_schema.py`

### PermissionsMappingCreateSchema
Create module-job-permission mapping.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `moduleId` | `string` | Yes | Module ObjectId |
| `jobId` | `string` | Yes | Job ObjectId |
| `permissionId` | `string` | Yes | Permission ObjectId |

---

### PermissionsMappingResponseSchema
Response with resolved names.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Mapping ID |
| `moduleId` | `string` | Module ID |
| `moduleName` | `string` | Module name |
| `jobId` | `string` | Job ID |
| `jobName` | `string` | Job name |
| `permissionId` | `string` | Permission ID |
| `permissionName` | `string` | Permission name |
| + Audit Fields | | Standard audit fields |

---

## 14. Department Schemas

**File:** `app/api/v1/schemas/department_schema.py`

### DepartmentBaseSchema
Base schema for departments.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | max 255, min 2 alphabets | Department name |
| `cctnsDepartmentCd` | `string` | No | max 50 | CCTNS Department Code |

**Allowed Characters in Name:** Alphabets, spaces, hyphens, underscores, &, /

---

### DepartmentBulkCreateSchema
Bulk create departments.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | `DepartmentCreateSchema[]` | Yes | List of departments to create |

---

## 15. District Schemas

**File:** `app/api/v1/schemas/district_schema.py`

### DistrictBaseSchema
Base schema for districts.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | max 100, min 2 alphabets | District name |
| `cctnsDistrictCd` | `string` | Yes | max 50, numbers only | CCTNS District Code |
| `stateName` | `string` | No | max 100, alphabets/spaces | State name |

---

## 16. Designation Schemas

**File:** `app/api/v1/schemas/designation_master_schema.py`

### DesignationMasterBaseSchema
Base schema for designations.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | 2-200 chars, min 2 alphabets | Designation name |
| `designationCd` | `string` | Yes | 1-200 chars, alphanumeric only | Designation code |

**Allowed Characters in Name:** Alphabets, hyphen (-), underscore (_), parentheses (()), dot (.)

---

### DesignationMasterBulkCreateSchema
Bulk create designations.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | `DesignationMasterBulkCreateItemSchema[]` | Yes | List of designations (min 1) |

---

## 17. Rank Schemas

**File:** `app/api/v1/schemas/rank_master_schema.py`

### RankMasterBaseSchema
Base schema for ranks.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | max 100, min 2 alphabets | Rank name |
| `cctnsRankCd` | `int` | Yes | 0-999999 | CCTNS Rank Code |
| `level` | `int` | Yes | >= 0 | Rank level in hierarchy |
| `shortCode` | `string` | No | max 20 | Short code |

---

### RankMasterSearchSchema
Search/filter ranks.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | null | Filter by name |
| `isDelete` | `boolean` | false | Include deleted records |
| `skip` | `int` | 0 | Pagination offset |
| `limit` | `int` | 10 | Page size (1-100) |

---

## 18. Unit Type Schemas

**File:** `app/api/v1/schemas/unit_type_schema.py`

### UnitTypeBaseSchema
Base schema for unit types.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | max 100, min 2 alphabets | Unit type name |
| `departmentId` | `string` | No | Valid ObjectId | Department FK |
| `level` | `int` | Yes | >= 0 | Hierarchy level |

---

### UnitTypeResponseSchema
Response with populated department.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Unit Type ID |
| `name` | `string` | Unit type name |
| `level` | `int` | Hierarchy level |
| `department` | `NestedDepartmentSchema` | Populated department |
| + Audit Fields | | Standard audit fields |

---

## 19. Mandal Schemas

**File:** `app/api/v1/schemas/mandal_schema.py`

### MandalBaseSchema
Base schema for mandals (sub-districts/talukas).

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `districtId` | `string` | Yes | Valid ObjectId | District FK |
| `mandalName` | `string` | Yes | max 255, min 2 alphabets | Mandal name |

---

### MandalResponseSchema
Response with populated district.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Mandal ID |
| `districtId` | `string` | District ID |
| `mandalName` | `string` | Mandal name |
| `district` | `NestedDistrictSchema` | Populated district with cctnsDistrictCd |
| + Audit Fields | | Standard audit fields |

---

## 20. Approval Flow Master Schemas

**File:** `app/api/v1/schemas/approval_flow_master_schema.py`

### FurtherProcessSchema
Further process step configuration.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `requestType` | `string[]` | Yes | min 1 item | Request types (e.g., ["telecom"]) |
| `targetRole` | `string` | Yes | 1-100 chars | Target role for this step |
| `targetUserId` | `string` | Yes | Valid ObjectId | Target user ID |

---

### ApprovalFlowMasterBaseSchema
Base schema for approval flows.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `moduleId` | `string` | Yes | Valid ObjectId | Module FK |
| `flowName` | `string` | Yes | 1-255 chars, non-empty | Flow name |
| `description` | `string` | No | max 1000 | Flow description |
| `finalApprovalUnitId` | `string` | Yes | Valid ObjectId | Final approval unit FK |
| `finalApprovalRankId` | `string` | Yes | Valid ObjectId | Final approval rank FK |
| `districtId` | `string` | No | Valid ObjectId | District FK |
| `furtherProcess` | `FurtherProcessSchema[]` | No | - | Further process steps |
| `isActive` | `boolean` | No | default true | Active status |
| `ifRejected` | `string` | Yes | max 100 | Action on rejection: 'false', 'Creator', 'Previous' |

---

### ApprovalFlowMasterResponseSchema
Response with populated nested objects.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Approval Flow ID |
| `module` | `NestedModuleSchema` | Populated module |
| `finalApprovalUnit` | `NestedUnitSchema` | Populated final approval unit |
| `finalApprovalRank` | `NestedRankSchema` | Populated final approval rank |
| `district` | `NestedDistrictSchema` | Populated district |
| + Audit Fields | | Standard audit fields |

---

## 21. Approval Chain Schemas

**File:** `app/api/v1/schemas/approval_chain_schema.py`

### TransactionHistorySchema
Transaction history entry for approval chain.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `action` | `string` | Yes | 1-100 chars | Action: Approve, Reject, Forward |
| `unitId` | `string` | Yes | Valid ObjectId | Unit where action was taken |
| `userId` | `string` | Yes | Valid ObjectId | User who performed action |
| `timestamp` | `datetime` | Yes | - | When action was taken |
| `comments` | `string` | No | - | Optional comments |

---

### ApprovalChainBaseSchema
Base schema for approval chains.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `moduleId` | `string` | Yes | Module FK |
| `requestId` | `string` | Yes | Request/Application ID being tracked |
| `currentUnitId` | `string` | No | Current unit in approval chain |
| `finalApprovalUnitId` | `string` | Yes | Final approval unit FK |
| `districtId` | `string` | No | District FK |
| `approvalChainStatus` | `string` | Yes | Status: Pending, Approved, Rejected, Processed |
| `transactionHistory` | `TransactionHistorySchema[]` | No | History of actions |
| `finalApprovalDate` | `datetime` | No | Date of final approval |
| `finalApprovalRankId` | `string` | Yes | Final approval role FK |
| `currentApproverId` | `string` | No | Current approver personnel FK |

---

### ApprovalChainResponseSchema
Response with populated nested objects.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Approval Chain ID |
| `module` | `NestedModuleSchema` | Populated module |
| `currentUnit` | `NestedUnitSchema` | Populated current unit |
| `finalApprovalUnit` | `NestedUnitSchema` | Populated final approval unit |
| `district` | `NestedDistrictSchema` | Populated district |
| `finalApprovalRole` | `NestedRoleSchema` | Populated final approval role |
| `currentApprover` | `NestedPersonnelSchema` | Populated current approver |
| + Audit Fields | | Standard audit fields |

---

## 22. Feedback Master Schemas

**File:** `app/api/v1/schemas/feedback_master_schema.py`

### FeedbackOptionsSchema
Feedback options for like/dislike.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `likedOptions` | `string[]` | No | Options when isLiked=true (e.g., "Accurate", "Helpful") |
| `dislikedOptions` | `string[]` | No | Options when isLiked=false (e.g., "Inaccurate", "Too slow") |

---

### FeedbackMasterBaseSchema
Base schema for feedback master (feedback types).

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | max 300, min 2 alphabets | Feedback type name |
| `componentType` | `ComponentType` | Yes | prompt/api/function/screen | Component type |
| `options` | `FeedbackOptionsSchema` | No | - | Like/dislike options |
| `moduleId` | `string` | No | Valid ObjectId | Module FK |

**ComponentType Enum:** `"prompt"`, `"api"`, `"function"`, `"screen"`

---

### FeedbackMasterActiveToggleSchema
Toggle feedback master active status.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `isActive` | `boolean` | Yes | New active status |

---

## 23. Feedback Schemas

**File:** `app/api/v1/schemas/feedback_schema.py`

### UserFeedbackStructure
Structured user feedback with component-specific data.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `screen` | `dict` | Conditional | Screen feedback: screenPath, screenName required |
| `prompt` | `dict` | Conditional | Prompt feedback: componentExecutionId + (componentId OR promptName) required |
| `api` | `dict` | Conditional | API feedback: endpoint, method, statusCode |
| `function` | `dict` | Conditional | Function feedback: functionName, input, output |

**Validation:** Exactly one component type must be populated; others must be null.

---

### FeedbackBaseSchema
Base schema for user feedback.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `feedbackMasterName` | `string` | Yes | - | FeedbackMaster name (resolved to ID) |
| `userFeedback` | `UserFeedbackStructure` | Yes | - | Structured component-specific feedback |
| `comment` | `string` | Yes | max 2000 | User feedback comment |
| `isLiked` | `boolean` | No | - | User satisfaction (true=liked) |
| `quickFeedback` | `string[]` | No | - | Selected quick feedback options |
| `rating` | `float` | No | - | Numeric rating |
| `isRegenerated` | `boolean` | No | - | Whether this is for regenerated output |

**Example:**
```json
{
  "feedbackMasterName": "Prompt Feedback",
  "userFeedback": {
    "screen": null,
    "prompt": {
      "promptName": "AI Case Summary",
      "componentExecutionId": "507f191e810c19729de860ea",
      "userQuestion": "Summarize this case",
      "actualOutput": "The case involves..."
    },
    "api": null,
    "function": null
  },
  "comment": "The summary was very accurate and helpful.",
  "isLiked": true,
  "quickFeedback": ["Accurate", "Helpful"],
  "rating": 5.0
}
```

---

## 24. Prompt Schemas

**File:** `app/api/v1/schemas/prompt_schema.py`

### PromptBaseSchema
Base schema for AI prompts.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `moduleId` | `string` | No | Valid ObjectId format | Module FK |
| `iconPath` | `string` | No | max 500 | Icon asset path |
| `tech` | `string` | No | - | Technology (e.g., 'OpenAI GPT-5') |
| `taskInstructions` | `string` | No | - | Task execution steps |
| `taskInput` | `string` | No | - | Required inputs |
| `taskOutputFormat` | `string` | No | - | Expected output structure |
| `taskExample` | `dict` | No | - | Sample input-output JSON |
| `llm` | `string` | No | max 100 | LLM model (e.g., 'gpt-5', 'claude') |
| `settingsJson` | `dict` | No | - | Runtime configuration |

---

### PromptCreateSchema
Create a new prompt.

Extends PromptBaseSchema with required fields:

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `type` | `string` | Yes | max 200 | Prompt type/category |
| `name` | `string` | Yes | max 200 | Prompt name (unique within type) |
| `aiRole` | `string` | Yes | - | AI's purpose or behavior |
| `systemRole` | `string` | Yes | - | System's expected actions |
| `objective` | `string` | Yes | - | Main goal of the prompt |

---

### PromptSearchSchema
Search/filter prompts.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | null | Filter by name (partial, case-insensitive) |
| `type` | `string` | null | Filter by type |
| `aiRole` | `string` | null | Filter by AI role |
| `llm` | `string` | null | Filter by LLM model |
| `page` | `int` | 1 | Page number (>= 1) |
| `pageSize` | `int` | 50 | Items per page (1-500) |

---

### PromptBulkCreateSchema
Bulk create prompts.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | `PromptCreateSchema[]` | Yes | List of prompts (min 1) |

---

## 25. Prompt Execution Schemas

**File:** `app/api/v1/schemas/prompt_execution_schema.py`

### PromptExecutionBaseSchema
Base schema for prompt executions (AI interactions).

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `promptConstructionRecord` | `string` | No | - | Prompt construction methodology |
| `finalPrompt` | `string` | No | - | Final executed prompt text |
| `promptOutput` | `string` | No | - | Generated output |
| `inputTokenCount` | `int` | No | >= 0 | Input token count |
| `outputTokenCount` | `int` | No | >= 0 | Output token count |
| `cost` | `float` | No | >= 0 | Execution cost |
| `executionTime` | `float` | No | >= 0 | Execution time in seconds |
| `originalWorkId` | `string` | No | Valid ObjectId | Original work for revisions |
| `revision` | `int` | No | >= 0 | Revision number |
| `feedbackId` | `string` | No | Valid ObjectId | Feedback reference |

---

### PromptExecutionCreateSchema
Create a prompt execution record.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `promptId` | `string` | Yes | Prompt FK |
| `userId` | `string` | Yes | Executing user FK |

---

### PromptExecutionSearchSchema
Search/filter prompt executions.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `promptId` | `string` | null | Filter by prompt |
| `userId` | `string` | null | Filter by user |
| `feedbackId` | `string` | null | Filter by feedback |
| `minCost` | `float` | null | Minimum cost filter |
| `maxCost` | `float` | null | Maximum cost filter |
| `minExecutionTime` | `float` | null | Minimum execution time |
| `maxExecutionTime` | `float` | null | Maximum execution time |
| `fromDate` | `datetime` | null | From date filter |
| `toDate` | `datetime` | null | To date filter |
| `page` | `int` | 1 | Page number |
| `pageSize` | `int` | 50 | Items per page (1-500) |

---

## 26. Log Master Schemas

**File:** `app/api/v1/schemas/log_master_schema.py`

### LogMasterBaseSchema
Base schema for log types/templates.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `moduleId` | `string` | Yes | Valid ObjectId | Module FK |
| `name` | `string` | Yes | 1-200 chars | Log name (e.g., FIR_CREATE_SUCCESS) |
| `purpose` | `string` | Yes | 1-500 chars | Purpose of this log type |
| `template` | `string` | Yes | non-empty | Template with placeholders (e.g., 'FIR created by {user}') |
| `json` | `dict` | Yes | valid JSON object | Placeholder values schema |
| `retentionPeriod` | `int` | Yes | > 0 | Retention period in days |

---

### LogMasterBulkCreateSchema
Bulk create log masters.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | `LogMasterCreateSchema[]` | Yes | List of log masters (min 1) |

---

## 27. Log Transaction Schemas

**File:** `app/api/v1/schemas/log_transaction_schema.py`

### LayerEnum
Log layer types.

| Value | Description |
|-------|-------------|
| `screen` | UI/Screen layer |
| `function` | Business logic layer |
| `api` | API layer |
| `config` | Configuration layer |

### LevelEnum
Log severity levels.

| Value | Description |
|-------|-------------|
| `error` | Error level |
| `warning` | Warning level |
| `info` | Informational level |

---

### LogTransactionBaseSchema
Base schema for log transactions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `layer` | `LayerEnum` | Yes | Log layer |
| `level` | `LevelEnum` | Yes | Log level |
| `logCode` | `string` | Yes | Log Master name/code |
| `json` | `dict` | Yes | Values for template placeholders |
| `endpoint` | `string` | No | API endpoint or route (max 500) |

**Note:** `actorId` is auto-populated from user token; `message` is auto-generated from template.

---

### LogTransactionResponseSchema
Log transaction response.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Log Transaction ID |
| `layer` | `LayerEnum` | Log layer |
| `level` | `LevelEnum` | Log level |
| `message` | `string` | Generated log message |
| `json` | `dict` | Additional JSON data |
| `actorId` | `string` | User who performed action |
| `endpoint` | `string` | API endpoint |
| `logCode` | `string` | Log Master code |
| `templateId` | `string` | Log Master template ID |
| `createdAt` | `datetime` | Creation timestamp |

---

## 28. Error Master Schemas

**File:** `app/api/v1/schemas/error_master_schema.py`

### LocalizedMessageSchema
Localized error message with i18n support.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `language` | `string` | Yes | ISO-639-1 (e.g., "en", "hi") | Language code |
| `template` | `string` | Yes | {lowerCamelCase} placeholders | Message template |

---

### ErrorMasterBaseSchema
Base schema for error definitions.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `errorCode` | `string` | Yes | 3-120 chars, pattern: ERR.MODULE.COMPONENT.ACTION | Unique error code |
| `errorType` | `string` | Yes | From 'errorType' value-set | Error type |
| `errorSeverity` | `string` | Yes | From 'errorSeverity' value-set | Error severity |
| `log` | `boolean` | No | default true | Whether to log this error |
| `moduleId` | `string` | No | Valid ObjectId | Module FK |
| `businessArea` | `string` | No | max 120 | Business area |
| `technicalArea` | `string` | No | max 120 | Technical area |
| `tool` | `string` | No | max 120 | Tool/system |
| `partnerSystem` | `string` | No | max 120 | Partner system |
| `thirdParty` | `string` | No | max 120 | Third party |
| `messages` | `LocalizedMessageSchema[]` | Yes | - | Localized messages |
| `devMessage` | `string` | No | max 2000 | Developer message |
| `helpLink` | `HttpUrl` | No | valid URL | Help documentation link |
| `videoLink` | `HttpUrl` | No | valid URL | Video tutorial link |

**Error Code Pattern:**
- Format: `ERR.<MODULE>.<COMPONENT>.<ACTION>[.<QUALIFIERS>...]`
- Example: `ERR.AUTH.LOGIN.INVALID_CREDENTIALS`

---

### ErrorMasterBulkCreateSchema
Bulk create error masters.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | `ErrorMasterCreateSchema[]` | Yes | List of error masters (min 1) |

---

## 29. Error Log Schemas

**File:** `app/api/v1/schemas/error_log_schema.py`

### ParamKV
Key-value pair for error parameters.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `name` | `string` | Yes | min 1 char | Parameter name |
| `value` | `string` | Yes | min 1 char | Parameter value |

---

### ErrorLogCreateSchema
Create error log entry.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `errorCode` | `string` | Yes | - | Error code (from error master) |
| `parametersJson` | `dict` | No | default {} | Template parameters |
| `language` | `string` | No | ISO-639-1, default "en" | Language for message |
| `actorUserId` | `string` | No | ObjectId | User who caused error |
| `sourceType` | `string` | Yes | From value-set | Source type (API, UI, etc.) |
| `sourceName` | `string` | Yes | max 200 | Source name/endpoint |
| `ip` | `string` | No | max 64 | Client IP |
| `userAgent` | `string` | No | max 512 | User agent |
| `environment` | `string` | No | From value-set | Environment (DEV, UAT, PROD) |
| `stack` | `string` | No | max 12000 | Stack trace |
| `parameters` | `ParamKV[]` | No | - | Additional parameters |

---

### ErrorLogResponseSchema
Error log response.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Error Log ID |
| `errorCode` | `string` | Error code |
| `errorSeverity` | `string` | Severity (snapshot from error master) |
| `eventDateTime` | `datetime` | When error occurred |
| `actorUserId` | `string` | User who caused error |
| `sourceType` | `string` | Source type |
| `sourceName` | `string` | Source name |
| `ip` | `string` | Client IP |
| `userAgent` | `string` | User agent |
| `environment` | `string` | Environment |
| `resolvedMessage` | `string` | Localized message with parameters |
| `parameters` | `ParamKV[]` | Error parameters |

---

### ErrorLogSearchParams
Search error logs.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | `string` | null | Full-text search on resolvedMessage |
| `errorCode` | `string` | null | Filter by error code |
| `errorSeverity` | `string` | null | Filter by severity |
| `sourceType` | `string` | null | Filter by source type |
| `sourceName` | `string` | null | Filter by source name |
| `actorUserId` | `string` | null | Filter by user |
| `environment` | `string` | null | Filter by environment |
| `fromDate` | `datetime` | null | From date |
| `toDate` | `datetime` | null | To date |
| `page` | `int` | 1 | Page number |
| `page_size` | `int` | 50 | Items per page |

---

## 30. Test Master Schemas

**File:** `app/api/v1/schemas/test_master_schema.py`

### QuestionSchema
Test question with expected answer.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `questionId` | `string` | Yes | non-empty, unique within test | Question identifier |
| `question` | `string` | Yes | non-empty | Question text |
| `expectedAnswer` | `dict` | Yes | valid JSON | Expected answer as JSON |

---

### TestMasterBaseSchema
Base schema for test definitions.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `moduleId` | `string` | Yes | Valid ObjectId | Module FK |
| `name` | `string` | Yes | max 300, unique | Test name |
| `questions` | `QuestionSchema[]` | Yes | min 1, unique questionIds | Test questions |

**Validation:** All `questionId` values must be unique within the questions array.

---

### TestMasterResponseSchema
Response with populated module.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Test Master ID |
| `moduleId` | `string` | Module ID |
| `name` | `string` | Test name |
| `questions` | `QuestionSchema[]` | Test questions |
| `module` | `dict` | Populated module data |
| + Audit Fields | | Standard audit fields |

---

## 31. Test Execution Schemas

**File:** `app/api/v1/schemas/test_execution_schema.py`

### TestResultEnum
Test execution result.

| Value | Description |
|-------|-------------|
| `PASS` | Test passed |
| `FAIL` | Test failed |

---

### AnswerSchema
User's answer to a test question.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `questionId` | `string` | Yes | non-empty | Reference to question ID |
| `actualAnswer` | `dict` | Yes | valid JSON | User's answer as JSON |

---

### TestExecutionBaseSchema
Base schema for test executions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `testMasterId` | `string` | Yes | Test Master FK |
| `answers` | `AnswerSchema[]` | Yes | User's answers (min 1) |
| `result` | `TestResultEnum` | Yes | Final result: PASS/FAIL |

---

### TestExecutionResponseSchema
Response with populated test master.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Test Execution ID |
| `testMasterId` | `string` | Test Master ID |
| `answers` | `AnswerSchema[]` | User's answers |
| `result` | `TestResultEnum` | Test result |
| `testMaster` | `dict` | Populated test master data |
| + Audit Fields | | Standard audit fields |

---

## 32. Value Set Schemas

**File:** `app/api/v1/schemas/value_sets_schema.py`

### ItemLabels
Multi-language labels for value set items.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `en` | `string` | Yes | 1-256 chars | English label (required) |
| `[lang]` | `string` | No | - | Other language labels (e.g., hi, te) |

**Config:** Extra fields allowed for additional languages.

---

### ValueSetItem
Individual item in a value set.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `code` | `string` | Yes | 1-64 chars, SCREAMING_SNAKE_CASE | Unique code |
| `labels` | `ItemLabels` | Yes | - | Multi-language labels |

**Code Format:** SCREAMING_SNAKE_CASE (e.g., `HIGH_PRIORITY`, `PENDING_APPROVAL`)

---

### ValueSetBaseSchema
Base schema for value sets (enums/lookups).

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `key` | `string` | Yes | 1-120 chars, alphabets/spaces | Globally unique identifier |
| `module` | `string` | No | max 64 | Module name |
| `description` | `string` | No | max 1000 | Admin help text |
| `items` | `ValueSetItem[]` | Yes | 1-500 items | Enum items |

**Validation:**
- All codes must be unique within the value set
- All labels must be unique per language within the value set

**Example:**
```json
{
  "key": "error severity",
  "module": "Core",
  "description": "Severity levels for errors",
  "items": [
    { "code": "LOW", "labels": { "en": "Low", "hi": "कम" } },
    { "code": "MEDIUM", "labels": { "en": "Medium", "hi": "मध्यम" } },
    { "code": "HIGH", "labels": { "en": "High", "hi": "उच्च" } },
    { "code": "CRITICAL", "labels": { "en": "Critical", "hi": "गंभीर" } }
  ]
}
```

---

### ValueSetSearchSchema
Search/filter value sets.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `key` | `string` | null | Search by key (partial match) |
| `module` | `string` | null | Filter by module |
| `isDelete` | `boolean` | false | Include deleted records |
| `skip` | `int` | 0 | Pagination offset |
| `limit` | `int` | 10 | Page size (1-100) |

---

## 33. Third Party API Schemas

**File:** `app/api/v1/schemas/third_party_api_schema.py`

### NetworkLookupRequestSchema
CDR Softwares network lookup request.

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `keyword` | `string` | Yes | 1-15 chars | Phone number or keyword |

---

### NetworkDataSchema
Network data from CDR API response.

| Field | Type | Description |
|-------|------|-------------|
| `services` | `string` | Services |
| `operator_name` | `string` | Telecom operator name |
| `operator_code` | `string` | Operator code |
| `circle_name` | `string` | Circle/region name |
| `circle_common_name` | `string` | Circle common name |
| `circle_code` | `string` | Circle code |
| `service_type` | `string` | Service type (prepaid/postpaid) |

---

### NetworkLookupResponseSchema
Network lookup response.

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | API call success status |
| `status_code` | `int` | HTTP status from 3rd party |
| `data` | `NetworkDataSchema` | Network data |
| `message` | `string` | API message |
| `error` | `string` | Error message if failed |
| `elapsed_ms` | `int` | Request duration in milliseconds |

---

### CdrApiLogSchema
Third Party API call log for database.

| Field | Type | Description |
|-------|------|-------------|
| `service` | `string` | Third party service name (e.g., CDR, IMEI, etc.) |
| `serviceEndpoint` | `string` | Third party API endpoint URL |
| `keyword` | `string` | Phone number looked up |
| `status` | `boolean` | API response status |
| `operator_name` | `string` | Operator name |
| `operator_code` | `string` | Operator code |
| `circle_name` | `string` | Circle name |
| `circle_code` | `string` | Circle code |
| `service_type` | `string` | Service type |
| `message` | `string` | API message |
| `userId` | `string` | Requesting user ID |
| `clientIp` | `string` | Client IP address |
| `elapsed_ms` | `int` | Request duration |
| `createdAt` | `datetime` | Log timestamp |

---

## 34. Organization Structure Schemas

**File:** `app/api/v1/schemas/org_structure_schema.py`

### PersonnelMinimalSchema
Minimal personnel data for org structure.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | `string` | Personnel ID |
| `name` | `string` | Personnel name |
| `badge` | `string` | Badge number |
| `rank` | `string` | Rank/Designation |
| `phone` | `string` | Contact phone |
| `email` | `string` | Email address |
| `department` | `string` | Department/Wing |

---

### JurisdictionSchema
Jurisdiction data for org units.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | Jurisdiction type: District, Mandal |
| `refId` | `string` | No | Reference ID to master collection |
| `name` | `string` | Yes | Jurisdiction name |
| `code` | `string` | No | Jurisdiction code (CCTNS) |
| `villages` | `string[]` | No | Village names (for Mandal type only) |

---

### OrgUnitFlatSchema
Flat organizational unit for list view.

| Field | Type | Description |
|-------|------|-------------|
| `unitId` | `string` | Unit ID |
| `unitName` | `string` | Unit name |
| `unitCd` | `string` | Unique unit code |
| `unitType` | `string` | Unit type (Zone, Range, District, PS) |
| `hierarchyLevel` | `string` | Hierarchy level (L1-L8) |
| `rank` | `string` | Rank of officer in-charge |
| `parentUnitId` | `string` | Parent unit ID |
| `unitPath` | `string[]` | Hierarchical path array |
| `incharge` | `PersonnelMinimalSchema` | Officer in-charge |
| `jurisdiction` | `JurisdictionSchema[]` | Jurisdiction covered |
| `personnelCount` | `int` | Total personnel in unit |
| `districtName` | `string` | District name |
| `city` | `string` | City/Town |
| `address` | `string` | Full address |
| `phone` | `string[]` | Contact phone numbers |
| `email` | `string` | Official email |
| `isActive` | `boolean` | Active status |
| `createdAt` | `datetime` | Creation timestamp |
| `updatedAt` | `datetime` | Last update timestamp |

---

### OrgUnitTreeSchema
Nested tree organizational unit.

Extends OrgUnitFlatSchema with:

| Field | Type | Description |
|-------|------|-------------|
| `totalChildUnits` | `int` | Total child units (all levels) |
| `totalPersonnel` | `int` | Total personnel including children |
| `children` | `OrgUnitTreeSchema[]` | Child units (recursive) |

---

## 35. Dashboard Schemas

**File:** `app/api/v1/schemas/dashboard_schema.py`

Comprehensive dashboard analytics schemas.

### Enums

#### TimeRangeEnum
| Value | Description |
|-------|-------------|
| `today` | Today only |
| `yesterday` | Yesterday only |
| `7d` | Last 7 days |
| `30d` | Last 30 days |
| `this_month` | Current month |
| `last_month` | Previous month |
| `custom` | Custom date range |

#### GranularityEnum
| Value | Description |
|-------|-------------|
| `hourly` | Hourly aggregation |
| `daily` | Daily aggregation |
| `weekly` | Weekly aggregation |
| `monthly` | Monthly aggregation |

---

### JobCountItem
Count item with job metadata.

| Field | Type | Description |
|-------|------|-------------|
| `count` | `int` | Total count |
| `isMenu` | `boolean` | Whether job appears in menu |
| `route` | `string` | Route for this job |
| `displayName` | `string` | Display name |

---

### CountsData
Counts for all collections.

| Field | Type | Description |
|-------|------|-------------|
| `platform` | `PlatformCounts` | Platform/infrastructure counts |
| `application` | `ApplicationCounts` | Application/business counts |

**PlatformCounts includes:** valueSets, logMaster, logTransactions, errorMaster, errorLogs, approvalFlowMaster, approvalChains, testMaster, testExecutions, prompts, promptExecutions, feedbackMaster, feedbacks

**ApplicationCounts includes:** units, personnels, departments, districts, ranks, unitTypes, mandals, designations, unitVillages, roles, modules, jobs, permissions, permissionMappings, userMappings, userRolePermissions, moduleHierarchy, moduleJobMappings

---

### UserActivityDashboardData
User activity analytics.

| Field | Type | Description |
|-------|------|-------------|
| `summary` | `UserActivitySummary` | Total, active, new, inactive users |
| `topUsers` | `TopUserItem[]` | Top users by usage |
| `activityTrend` | `UserActivityTrend[]` | Activity over time |
| `usersByUnit` | `dict[]` | Users grouped by unit |

---

### PromptAnalyticsDashboardData
Prompt usage analytics.

| Field | Type | Description |
|-------|------|-------------|
| `summary` | `PromptUsageSummary` | Total prompts, executions, averages |
| `topPrompts` | `TopPromptItem[]` | Top prompts by usage |
| `byType` | `PromptTypeDistribution[]` | Distribution by type |
| `unusedPrompts` | `dict[]` | Prompts with no recent usage |

---

### CostAnalyticsDashboardData
Cost analytics.

| Field | Type | Description |
|-------|------|-------------|
| `summary` | `CostSummary` | Total, average, projected costs |
| `byDay` | `CostByDayItem[]` | Daily breakdown |
| `byModel` | `dict[]` | Cost by LLM model |
| `byUser` | `CostByUserItem[]` | Cost by user |
| `byPrompt` | `CostByPromptItem[]` | Cost by prompt |

---

### PerformanceDashboardData
Performance metrics.

| Field | Type | Description |
|-------|------|-------------|
| `summary` | `PerformanceSummary` | Avg, p50, p95, p99 response times |
| `responseTimeDistribution` | `ResponseTimeDistribution[]` | Distribution buckets |
| `byHour` | `PerformanceByHour[]` | Performance by hour |
| `byModel` | `dict[]` | Performance by model |
| `slowestCalls` | `dict[]` | Slowest executions |

---

### OverviewDashboardData
Combined overview statistics.

| Field | Type | Description |
|-------|------|-------------|
| `currentPeriod` | `OverviewStats` | Current period stats |
| `previousPeriod` | `OverviewStats` | Previous period stats |
| `change` | `OverviewChange` | Percentage changes |
| `topModel` | `string` | Most used model |
| `topPromptType` | `string` | Most used prompt type |
| `peakHour` | `int` | Peak usage hour (0-23) |

---

## 36. Notification Schemas

**File:** `app/api/v1/schemas/notification_schema.py`

### Action
Notification action button.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | `string` | Yes | Button label |
| `type` | `Literal` | Yes | Action type: "link", "api", "deeplink" |
| `url` | `string` | No | URL for link/deeplink |
| `actionKey` | `string` | No | Action key for API calls |
| `method` | `Literal` | No | HTTP method: GET, POST, PUT, DELETE |
| `payload` | `dict` | No | Request payload for API |

---

### NotificationEmitIn
Send notification request.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `notificationType` | `string` | Yes | Notification type |
| `contactId` | `string/string[]` | Yes | Recipient(s) - single or multiple |
| `payload` | `dict` | No | Notification payload |
| `priority` | `string` | No | Priority level |
| `shortMessage` | `string` | Yes | Short message content |
| `requestId` | `string` | No | Request ID for tracking |
| `traceId` | `string` | No | Trace ID for debugging |

---

### NotificationReadOut
Notification response.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Notification ID |
| `contactId` | `string` | Recipient ID |
| `notificationId` | `string` | Notification template ID |
| `notificationType` | `string` | Notification type |
| `priority` | `string` | Priority level |
| `title` | `string` | Notification title |
| `body` | `string` | Notification body |
| `actions` | `Action[]` | Action buttons |
| `status` | `string` | Delivery status |
| `deliveryChannel` | `string` | Channel (push, sms, email) |
| `proposedTime` | `string` | Scheduled time |
| `queuedAt` | `string` | When queued |
| `sentAt` | `string` | When sent |
| `deliveredAt` | `string` | When delivered |
| `readAt` | `string` | When read |
| `providerMessageId` | `string` | Provider message ID |
| `requestId` | `string` | Request ID |

---

## Validation Reference

### Common Validators

| Validator | Pattern/Rule | Example |
|-----------|--------------|---------|
| `validate_name_field` | Alphabets, spaces, hyphens, underscores; min N alphabets | "John Doe-Smith" |
| `validate_userid_field` | Exactly 8 digits, numbers only | "12345678" |
| `validate_indian_phone` | +91XXXXXXXXXX, 91XXXXXXXXXX, or XXXXXXXXXX | "+919876543210" |
| `validate_badge_number_field` | Numbers only, no letters or special chars | "12345" |
| `validate_gender_field` | Exactly 'male' or 'female' (lowercase) | "male" |
| `validate_zip_field` | Exactly 6 digits | "500001" |
| `validate_value_set_key_field` | Alphabets and spaces only | "error severity" |
| `validate_value_set_code_field` | SCREAMING_SNAKE_CASE | "HIGH_PRIORITY" |
| `validate_unit_name_field` | Alphabets, spaces, -_() only; min 2 alphabets | "Central PS" |
| `validate_village_name_field` | Alphabets, spaces, hyphens only | "Kondapur" |

---

## Error Response Format

All API endpoints return errors in this standardized format:

```json
{
  "success": false,
  "code": 400,
  "message": "Validation error",
  "data": null,
  "errors": {
    "errorCode": "ERR.VALIDATION.FIELD_INVALID",
    "details": "userId must be exactly 8 digits"
  }
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 422 | Unprocessable Entity |
| 500 | Internal Server Error |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | Jan 2026 | Complete documentation with all 250+ schemas |
| 1.0.0 | Jan 2026 | Initial documentation |

---

*UC2 Core Main Backend API - Schema Documentation*
*Generated for Pydantic v2 + FastAPI*
