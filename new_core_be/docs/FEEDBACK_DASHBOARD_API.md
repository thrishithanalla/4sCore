# Feedback Dashboard API Documentation

## Overview

The Feedback Dashboard API provides comprehensive analytics and monitoring for user feedback across the application. It consists of three main endpoints that return statistics, trends, feedback lists, and negative feedback analysis.

**Base URL:** `/core/api/v1/feedback-dashboard`

**Authentication:** Bearer Token (JWT) required in Authorization header

**Permission Required:** `READ` permission on `FEEDBACKS` job

---

## Table of Contents

1. [Get Feedback Dashboard](#1-get-feedback-dashboard)
2. [Get Top Negative Feedback](#2-get-top-negative-feedback)
3. [Get Negative Reports Detail](#3-get-negative-reports-detail)
4. [Enums & Constants](#enums--constants)
5. [Common Response Structures](#common-response-structures)

---

## 1. Get Feedback Dashboard

Returns combined dashboard data including stats, trends, and recent feedback list.

### Endpoint

```
GET /core/api/v1/feedback-dashboard
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `timeRange` | enum | No | `30d` | Time range for filtering data. Options: `today`, `yesterday`, `7d`, `30d`, `this_month`, `last_month`, `custom` |
| `granularity` | enum | No | `daily` | Granularity for trend data. Options: `hourly`, `daily`, `weekly`, `monthly` |
| `componentType` | string | No | `null` | Filter by component type. Options: `screen`, `prompt`, `api`, `function` |
| `moduleId` | string | No | `null` | Filter by module ID (ObjectId string) |
| `feedbackMasterId` | string | No | `null` | Filter by specific feedback master ID (ObjectId string) |
| `createdBy` | string | No | `null` | Filter by personnel ID who gave feedback (ObjectId string) |
| `unitId` | string | No | `null` | Filter by unit ID - returns feedback from all personnel in that unit |
| `state` | string | No | `null` | Filter by feedback state. Options: `SUBMITTED`, `ACKNOWLEDGED`, `IN_PROGRESS`, `RESOLVED` |
| `startDate` | datetime | No* | `null` | Start date for custom time range (ISO 8601 format). *Required when `timeRange=custom` |
| `endDate` | datetime | No* | `null` | End date for custom time range (ISO 8601 format). *Required when `timeRange=custom` |
| `page` | integer | No | `1` | Page number for feedback list (min: 1) |
| `pageSize` | integer | No | `20` | Number of items per page (min: 1, max: 100) |

### Example Requests

**Basic Request (defaults):**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard" \
  -H "Authorization: Bearer <your_token>"
```

**With filters:**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard?timeRange=7d&granularity=daily&componentType=prompt&page=1&pageSize=10" \
  -H "Authorization: Bearer <your_token>"
```

**Custom date range:**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard?timeRange=custom&startDate=2026-01-01T00:00:00&endDate=2026-01-15T23:59:59" \
  -H "Authorization: Bearer <your_token>"
```

**Filter by module:**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard?moduleId=691e0704ea8033468e05f4f4" \
  -H "Authorization: Bearer <your_token>"
```

**Filter by unit (all personnel in unit):**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard?unitId=6926c34da18dd11dae2898a7" \
  -H "Authorization: Bearer <your_token>"
```

### Success Response (200 OK)

```json
{
  "success": true,
  "code": 200,
  "message": "Feedback dashboard data retrieved successfully",
  "data": {
    "stats": {
      "totalFeedback": 55,
      "likedCount": 42,
      "dislikedCount": 13,
      "neutralCount": 0,
      "averageRating": 4.13,
      "likePercentage": 76.4,
      "dislikePercentage": 23.6
    },
    "statsByComponent": [
      {
        "componentType": "prompt",
        "totalFeedback": 38,
        "likedCount": 32,
        "dislikedCount": 6,
        "averageRating": 4.15
      },
      {
        "componentType": "screen",
        "totalFeedback": 17,
        "likedCount": 10,
        "dislikedCount": 7,
        "averageRating": 4.0
      }
    ],
    "statsByModule": [
      {
        "moduleId": "691e0704ea8033468e05f4f4",
        "moduleName": "Petition Management",
        "totalFeedback": 35,
        "likedCount": 29,
        "dislikedCount": 6,
        "averageRating": 4.08
      },
      {
        "moduleId": "691f09e9cbf64adcc11754d2",
        "moduleName": "Core",
        "totalFeedback": 20,
        "likedCount": 13,
        "dislikedCount": 7,
        "averageRating": 4.38
      }
    ],
    "trend": [
      {
        "timestamp": "2026-01-12T00:00:00",
        "date": "2026-01-12",
        "totalFeedback": 15,
        "likedCount": 14,
        "dislikedCount": 1,
        "neutralCount": 0,
        "averageRating": 4.37
      },
      {
        "timestamp": "2026-01-13T00:00:00",
        "date": "2026-01-13",
        "totalFeedback": 20,
        "likedCount": 17,
        "dislikedCount": 3,
        "neutralCount": 0,
        "averageRating": 4.1
      }
    ],
    "recentFeedback": [
      {
        "id": "69668a8e7b7ca496717f8a54",
        "feedbackMasterId": "696232d26b3f9ca6354b010c",
        "feedbackMasterName": "EvidenceChecklist",
        "componentType": "prompt",
        "moduleId": "691e0704ea8033468e05f4f4",
        "moduleName": "Petition Management",
        "isLiked": true,
        "rating": 4.5,
        "comment": "",
        "quickFeedback": ["Appropriate evidence types suggested"],
        "state": "SUBMITTED",
        "userFeedback": {
          "screen": null,
          "prompt": {
            "componentExecutionId": "69668a657b7ca496717f8a41",
            "componentId": "692e8b0ea69507208cd751b6"
          },
          "api": null,
          "function": null
        },
        "personnel": {
          "personnelId": "69342edb7087b9345de705a0",
          "name": "Jane Smith",
          "rank": "Inspector",
          "unitId": "6926c34da18dd11dae2898a7",
          "unitName": "Cyber Crime Unit",
          "districtName": "Hyderabad"
        },
        "createdAt": "2026-01-13T23:40:22.365000"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 55,
      "totalPages": 3
    }
  },
  "errors": null
}
```

### Response Fields

#### stats
| Field | Type | Description |
|-------|------|-------------|
| `totalFeedback` | integer | Total number of feedback entries |
| `likedCount` | integer | Count where `isLiked = true` |
| `dislikedCount` | integer | Count where `isLiked = false` |
| `neutralCount` | integer | Count where `isLiked = null` |
| `averageRating` | float | Average rating (null if no ratings) |
| `likePercentage` | float | Percentage of liked feedback |
| `dislikePercentage` | float | Percentage of disliked feedback |

#### statsByComponent
| Field | Type | Description |
|-------|------|-------------|
| `componentType` | string | Component type (screen/prompt/api/function) |
| `totalFeedback` | integer | Total feedback for this component |
| `likedCount` | integer | Liked count |
| `dislikedCount` | integer | Disliked count |
| `averageRating` | float | Average rating |

#### statsByModule
| Field | Type | Description |
|-------|------|-------------|
| `moduleId` | string | Module ID |
| `moduleName` | string | Module name |
| `totalFeedback` | integer | Total feedback for this module |
| `likedCount` | integer | Liked count |
| `dislikedCount` | integer | Disliked count |
| `averageRating` | float | Average rating |

#### trend
| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | datetime | Time bucket start |
| `date` | string | Date string for display |
| `totalFeedback` | integer | Total feedback in period |
| `likedCount` | integer | Liked count in period |
| `dislikedCount` | integer | Disliked count in period |
| `neutralCount` | integer | Neutral count in period |
| `averageRating` | float | Average rating in period |

#### recentFeedback
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Feedback ID |
| `feedbackMasterId` | string | Feedback master ID |
| `feedbackMasterName` | string | Feedback master name |
| `componentType` | string | Component type |
| `moduleId` | string | Module ID |
| `moduleName` | string | Module name |
| `isLiked` | boolean | Like/dislike status |
| `rating` | float | Rating value (1-5) |
| `comment` | string | User comment |
| `quickFeedback` | array | Quick feedback options selected |
| `state` | string | Feedback state |
| `userFeedback` | object | Component-specific feedback data |
| `personnel` | object | Personnel who submitted feedback |
| `createdAt` | datetime | Submission timestamp |

---

## 2. Get Top Negative Feedback

Returns top negative feedback issues grouped by feedback master.

### Endpoint

```
GET /core/api/v1/feedback-dashboard/top-negative
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `timeRange` | enum | No | `30d` | Time range. Options: `today`, `yesterday`, `7d`, `30d`, `this_month`, `last_month`, `custom` |
| `componentType` | string | No | `null` | Filter by component type |
| `moduleId` | string | No | `null` | Filter by module ID |
| `unitId` | string | No | `null` | Filter by unit ID |
| `startDate` | datetime | No* | `null` | Start date for custom range |
| `endDate` | datetime | No* | `null` | End date for custom range |
| `limit` | integer | No | `10` | Number of top items (min: 1, max: 50) |
| `ratingThreshold` | float | No | `2.5` | Rating below which is negative (min: 0, max: 5) |

### Negative Criteria

A feedback is considered **negative** if:
- `isLiked = false` **OR**
- `rating < ratingThreshold` (default: 2.5)

### Example Requests

**Basic Request:**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard/top-negative" \
  -H "Authorization: Bearer <your_token>"
```

**Top 5 negative for last 7 days:**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard/top-negative?timeRange=7d&limit=5" \
  -H "Authorization: Bearer <your_token>"
```

**With custom rating threshold:**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard/top-negative?ratingThreshold=3.0" \
  -H "Authorization: Bearer <your_token>"
```

### Success Response (200 OK)

```json
{
  "success": true,
  "code": 200,
  "message": "Top negative feedback retrieved successfully",
  "data": {
    "items": [
      {
        "feedbackMasterId": "696233536b3f9ca6354b011d",
        "feedbackMasterName": "ReportGeneration",
        "componentType": "prompt",
        "moduleId": "691e0704ea8033468e05f4f4",
        "moduleName": "Petition Management",
        "totalReports": 23,
        "dislikedCount": 18,
        "lowRatingCount": 12,
        "averageRating": 2.1,
        "severity": "CRITICAL",
        "status": "OPEN"
      },
      {
        "feedbackMasterId": "694b8d127b48af8f3c21fe73",
        "feedbackMasterName": "Screen",
        "componentType": "screen",
        "moduleId": "691f09e9cbf64adcc11754d2",
        "moduleName": "Core",
        "totalReports": 15,
        "dislikedCount": 10,
        "lowRatingCount": 8,
        "averageRating": 2.3,
        "severity": "HIGH",
        "status": "OPEN"
      }
    ],
    "totalNegativeFeedback": 38,
    "ratingThreshold": 2.5
  },
  "errors": null
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `feedbackMasterId` | string | Feedback master ID |
| `feedbackMasterName` | string | Name (e.g., "ReportGeneration", "EvidenceChecklist") |
| `componentType` | string | Component type |
| `moduleId` | string | Module ID |
| `moduleName` | string | Module name |
| `totalReports` | integer | Total negative reports |
| `dislikedCount` | integer | Count where `isLiked = false` |
| `lowRatingCount` | integer | Count where `rating < threshold` |
| `averageRating` | float | Average rating |
| `severity` | enum | Severity level based on count |
| `status` | string | Issue status (default: "OPEN") |

### Severity Levels

| Severity | Condition |
|----------|-----------|
| `CRITICAL` | `totalReports >= 20` |
| `HIGH` | `totalReports >= 10` |
| `MEDIUM` | `totalReports >= 5` |
| `LOW` | `totalReports < 5` |

---

## 3. Get Negative Reports Detail

Returns detailed negative feedback reports for a specific feedback master. Use this when clicking "View Reports" on a top negative item.

### Endpoint

```
GET /core/api/v1/feedback-dashboard/negative-reports/{feedbackMasterId}
```

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `feedbackMasterId` | string | Yes | Feedback master ID (ObjectId string) |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `timeRange` | enum | No | `30d` | Time range |
| `startDate` | datetime | No | `null` | Start date for custom range |
| `endDate` | datetime | No | `null` | End date for custom range |
| `page` | integer | No | `1` | Page number |
| `pageSize` | integer | No | `20` | Page size (max: 100) |
| `ratingThreshold` | float | No | `2.5` | Rating threshold |

### Example Requests

**Basic Request:**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard/negative-reports/696233536b3f9ca6354b011d" \
  -H "Authorization: Bearer <your_token>"
```

**With pagination:**
```bash
curl -X GET "http://localhost:8000/core/api/v1/feedback-dashboard/negative-reports/696233536b3f9ca6354b011d?page=2&pageSize=10" \
  -H "Authorization: Bearer <your_token>"
```

### Success Response (200 OK)

```json
{
  "success": true,
  "code": 200,
  "message": "Negative feedback reports retrieved successfully",
  "data": {
    "feedbackMasterId": "696233536b3f9ca6354b011d",
    "feedbackMasterName": "ReportGeneration",
    "componentType": "prompt",
    "moduleId": "691e0704ea8033468e05f4f4",
    "moduleName": "Petition Management",
    "totalReports": 23,
    "averageRating": 2.1,
    "reports": [
      {
        "id": "6966561f7b7ca496717f817b",
        "personnel": {
          "personnelId": "69342edb7087b9345de705a0",
          "name": "Jane Smith",
          "rank": "Inspector",
          "unitId": "6926c34da18dd11dae2898a7",
          "unitName": "Cyber Crime Unit",
          "districtName": "Hyderabad"
        },
        "isLiked": false,
        "rating": 2.5,
        "comment": "Report formatting needs improvement",
        "quickFeedback": ["Inaccurate complaint details"],
        "state": "SUBMITTED",
        "userFeedback": {
          "screen": null,
          "prompt": {
            "componentExecutionId": "696654ba7b7ca496717f812b",
            "componentId": "694327fc64c9ecaf58ace6b1"
          },
          "api": null,
          "function": null
        },
        "createdAt": "2026-01-13T19:56:38.967000"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "totalPages": 2
  },
  "errors": null
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `feedbackMasterId` | string | Feedback master ID |
| `feedbackMasterName` | string | Feedback master name |
| `componentType` | string | Component type |
| `moduleId` | string | Module ID |
| `moduleName` | string | Module name |
| `totalReports` | integer | Total negative reports |
| `averageRating` | float | Average rating of negative reports |
| `reports` | array | List of detailed reports |
| `page` | integer | Current page |
| `pageSize` | integer | Page size |
| `totalPages` | integer | Total pages |

---

## Enums & Constants

### Time Range Options (`timeRange`)

| Value | Description |
|-------|-------------|
| `today` | Today only (from midnight) |
| `yesterday` | Yesterday only |
| `7d` | Last 7 days |
| `30d` | Last 30 days (default) |
| `this_month` | Current month |
| `last_month` | Previous month |
| `custom` | Custom range (requires `startDate` and `endDate`) |

### Granularity Options (`granularity`)

| Value | Description | Use Case |
|-------|-------------|----------|
| `hourly` | Group by hour | Short time ranges (today, yesterday) |
| `daily` | Group by day (default) | Medium time ranges (7d, 30d) |
| `weekly` | Group by week | Longer time ranges |
| `monthly` | Group by month | Long-term trends |

### Component Types (`componentType`)

| Value | Description |
|-------|-------------|
| `screen` | UI screen feedback |
| `prompt` | AI prompt feedback |
| `api` | API endpoint feedback |
| `function` | Function/feature feedback |

### Feedback States (`state`)

| Value | Description |
|-------|-------------|
| `SUBMITTED` | Feedback submitted |
| `ACKNOWLEDGED` | Feedback acknowledged |
| `IN_PROGRESS` | Being addressed |
| `RESOLVED` | Issue resolved |

### Severity Levels

| Value | Threshold |
|-------|-----------|
| `CRITICAL` | >= 20 reports |
| `HIGH` | >= 10 reports |
| `MEDIUM` | >= 5 reports |
| `LOW` | < 5 reports |

---

## Common Response Structures

### Personnel Object

```json
{
  "personnelId": "69342edb7087b9345de705a0",
  "name": "Jane Smith",
  "rank": "Inspector",
  "unitId": "6926c34da18dd11dae2898a7",
  "unitName": "Cyber Crime Unit",
  "districtName": "Hyderabad"
}
```

### User Feedback Object

```json
{
  "screen": {
    "screenPath": "/petition-management/petitions/edit/123",
    "screenName": "Edit"
  },
  "prompt": {
    "componentExecutionId": "69668a657b7ca496717f8a41",
    "componentId": "692e8b0ea69507208cd751b6"
  },
  "api": null,
  "function": null
}
```

### Error Response

```json
{
  "success": false,
  "code": 400,
  "message": "startDate and endDate are required when timeRange is 'custom'",
  "data": null,
  "errors": {
    "errorCode": "FEEDBACK_DASHBOARD_VALIDATION",
    "details": "startDate and endDate are required when timeRange is 'custom'"
  }
}
```

---

## Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `ERR.CORE.FEEDBACK_DASHBOARD.FETCH.FAILED` | 500 | Failed to fetch dashboard data |
| `ERR.CORE.FEEDBACK_DASHBOARD.TOP_NEGATIVE.FAILED` | 500 | Failed to fetch top negative |
| `ERR.CORE.FEEDBACK_DASHBOARD.REPORTS.FAILED` | 500 | Failed to fetch reports |
| `ERR.CORE.FEEDBACK_DASHBOARD.INVALID_PARAMS` | 400 | Invalid parameters |
| `ERR.CORE.AUTH.PERMISSION_DENIED` | 403 | No permission |
| `ERR.CORE.AUTH.TOKEN_MISSING` | 401 | Token not provided |

---

## Usage Examples

### Frontend Integration

**JavaScript/TypeScript:**
```typescript
// Fetch dashboard data
const fetchDashboard = async (filters: DashboardFilters) => {
  const params = new URLSearchParams();

  if (filters.timeRange) params.append('timeRange', filters.timeRange);
  if (filters.granularity) params.append('granularity', filters.granularity);
  if (filters.componentType) params.append('componentType', filters.componentType);
  if (filters.moduleId) params.append('moduleId', filters.moduleId);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.pageSize) params.append('pageSize', filters.pageSize.toString());

  const response = await fetch(
    `/core/api/v1/feedback-dashboard?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.json();
};

// Fetch top negative issues
const fetchTopNegative = async (limit = 10) => {
  const response = await fetch(
    `/core/api/v1/feedback-dashboard/top-negative?limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  return response.json();
};

// Fetch negative reports for a specific issue
const fetchNegativeReports = async (feedbackMasterId: string, page = 1) => {
  const response = await fetch(
    `/core/api/v1/feedback-dashboard/negative-reports/${feedbackMasterId}?page=${page}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  return response.json();
};
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-16 | Initial release |
