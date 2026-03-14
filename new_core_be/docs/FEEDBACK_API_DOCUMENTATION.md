# Feedback API - Complete Payload Documentation

## Overview

When creating feedback, the `userFeedback` payload structure depends on the `componentType` defined in the FeedbackMaster record.

**Valid Component Types:** `screen` | `prompt` | `api` | `function`

**Rule:** Only ONE component type can be populated in `userFeedback`. All others must be `null`.

---

## 1. Component Type: `screen`

**Use for:** UI/Screen feedback (buttons, forms, pages)

```json
{
  "feedbackMasterName": "Your Screen Feedback Master Name",
  "userFeedback": {
    "screen": {
      "screenPath": "/dashboard",
      "screenName": "Dashboard",
      "issue": "Button not responding",
      "description": "The save button does not respond when clicked"
    },
    "prompt": null,
    "api": null,
    "function": null
  },
  "comment": "Detailed feedback about the screen issue",
  "isLiked": false,
  "quickFeedback": ["Bug found", "Missing features"],
  "rating": 2.5,
  "isRegenerated": false
}
```

### Screen Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `screenPath` | **Yes** | string | URL path of the screen (e.g., `/dashboard`) |
| `screenName` | **Yes** | string | Display name of the screen |
| `issue` | No | string | Brief issue description |
| `description` | No | string | Detailed description |

> **Note:** `screen` type does **NOT** have `componentId` or `componentExecutionId`

---

## 2. Component Type: `prompt`

**Use for:** AI/LLM prompt feedback

### Option A: Using `promptName` (Recommended)

Pass the prompt name and the system will automatically resolve it to `componentId` from `prompt_master` collection.

```json
{
  "feedbackMasterName": "Your Prompt Feedback Master Name",
  "userFeedback": {
    "screen": null,
    "prompt": {
      "promptName": "AI Case Summary",
      "componentExecutionId": "507f191e810c19729de860ea",
      "userQuestion": "What is the capital of France?",
      "userExpectedOutput": "Paris",
      "actualOutput": "The capital of France is Paris"
    },
    "api": null,
    "function": null
  },
  "comment": "Perfect answer! Very accurate and concise.",
  "isLiked": true,
  "quickFeedback": ["Accurate response", "Helpful answer"],
  "rating": 5.0,
  "isRegenerated": false
}
```

### Option B: Using `componentId` (Direct ObjectId)

If you already have the ObjectId, you can pass it directly.

```json
{
  "feedbackMasterName": "Your Prompt Feedback Master Name",
  "userFeedback": {
    "screen": null,
    "prompt": {
      "componentId": "507f1f77bcf86cd799439011",
      "componentExecutionId": "507f191e810c19729de860ea",
      "userQuestion": "What is the capital of France?",
      "userExpectedOutput": "Paris",
      "actualOutput": "The capital of France is Paris"
    },
    "api": null,
    "function": null
  },
  "comment": "Perfect answer! Very accurate and concise.",
  "isLiked": true,
  "quickFeedback": ["Accurate response", "Helpful answer"],
  "rating": 5.0,
  "isRegenerated": false
}
```

### Prompt Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `promptName` | **Yes*** | string | Name of the prompt in `prompt_master` collection (auto-resolves to componentId) |
| `componentId` | **Yes*** | string | Reference to the prompt component (MongoDB ObjectId) |
| `componentExecutionId` | **Yes** | string | Reference to specific execution (MongoDB ObjectId) |
| `userQuestion` | No | string | The question asked by user |
| `userExpectedOutput` | No | string | What user expected as output |
| `actualOutput` | No | string | What was actually returned |

> **\*Note:** You must provide **either** `promptName` **OR** `componentId` (not both). Use `promptName` for convenience - the system will look up the prompt in `prompt_master` and get its `_id` as `componentId`.

> **Note:** `prompt` is the **ONLY** type that has `componentId`/`promptName` and `componentExecutionId`

---

## 3. Component Type: `api`

**Use for:** API endpoint feedback

```json
{
  "feedbackMasterName": "Your API Feedback Master Name",
  "userFeedback": {
    "screen": null,
    "prompt": null,
    "api": {
      "endpoint": "/api/v1/users",
      "method": "GET",
      "expectedResponse": {"status": "success", "data": []},
      "actualResponse": {"status": "error", "message": "Database error"},
      "statusCode": 500
    },
    "function": null
  },
  "comment": "API returned a server error. Expected successful response.",
  "isLiked": false,
  "quickFeedback": ["Server error 500"],
  "rating": 1.0
}
```

### API Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `endpoint` | No | string | API endpoint path (e.g., `/api/v1/users`) |
| `method` | No | string | HTTP method (GET, POST, PUT, PATCH, DELETE) |
| `expectedResponse` | No | object | Expected response object/data |
| `actualResponse` | No | object | Actual response received |
| `statusCode` | No | number | HTTP status code (e.g., 200, 400, 500) |

> **Note:** `api` type does **NOT** have `componentId` or `componentExecutionId`

---

## 4. Component Type: `function`

**Use for:** Function/method feedback (e.g., `EvidenceChecklist`, `calculateTotal`)

```json
{
  "feedbackMasterName": "EvidenceChecklist",
  "userFeedback": {
    "screen": null,
    "prompt": null,
    "api": null,
    "function": {
      "functionName": "EvidenceChecklist",
      "input": {
        "caseId": "12345",
        "evidenceType": "document"
      },
      "expectedOutput": {
        "success": true,
        "items": ["item1", "item2"]
      },
      "actualOutput": {
        "success": false,
        "error": "Processing failed"
      }
    }
  },
  "comment": "Function returned error instead of expected result.",
  "isLiked": false,
  "quickFeedback": ["Incorrect result"],
  "rating": 1.5
}
```

### Function Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `functionName` | No | string | Name of the function |
| `input` | No | object | Input parameters passed to the function |
| `expectedOutput` | No | any | Expected output from the function |
| `actualOutput` | No | any | Actual output received from the function |

> **Note:** `function` type does **NOT** have `componentId` or `componentExecutionId`

---

## Common Fields (All Component Types)

These fields are common across all feedback types:

| Field | Required | Type | Max Length | Description |
|-------|----------|------|------------|-------------|
| `feedbackMasterName` | **Yes** | string | 300 | Name of the FeedbackMaster record |
| `userFeedback` | **Yes** | object | - | Contains component-specific data |
| `comment` | **Yes** | string | 2000 | User feedback comment (mandatory) |
| `isLiked` | No | boolean | - | User satisfaction (`true` = liked, `false` = disliked) |
| `quickFeedback` | No | string[] | - | Selected quick options from FeedbackMaster.options |
| `rating` | No | number | - | Numeric rating (e.g., 1.0 to 5.0) |
| `isRegenerated` | No | boolean | - | If feedback is for regenerated output |

### Quick Feedback Options

When `isLiked = true`: Select from `FeedbackMaster.options.likedOptions`
When `isLiked = false`: Select from `FeedbackMaster.options.dislikedOptions`

---

## Quick Reference Table

| componentType | Data Key | Has componentId? | Has componentExecutionId? | Required Fields |
|---------------|----------|------------------|---------------------------|-----------------|
| `screen` | `userFeedback.screen` | **No** | **No** | `screenPath`, `screenName` |
| `prompt` | `userFeedback.prompt` | **Yes** | **Yes** | (`promptName` OR `componentId`) + `componentExecutionId` |
| `api` | `userFeedback.api` | **No** | **No** | None (all optional) |
| `function` | `userFeedback.function` | **No** | **No** | None (all optional) |

---

## Validation Rules

1. **Exactly ONE** component type must be populated in `userFeedback` (others must be `null`)
2. The populated component type **MUST match** the `componentType` defined in FeedbackMaster
3. For `screen` type: `screenPath` and `screenName` are **required**
4. For `prompt` type: Either `promptName` OR `componentId` is **required** (not both), plus `componentExecutionId`
   - If `promptName` is provided: System looks up `prompt_master` by name and uses its `_id` as `componentId`
   - If `componentId` is provided: Used directly as MongoDB ObjectId
5. `comment` field is **always required** (max 2000 characters)
6. `feedbackMasterName` must match an existing FeedbackMaster record name
7. `promptName` must match an existing record in `prompt_master` collection (if used)

---

## Error Scenarios

### 400 Bad Request - Component Type Mismatch

**Cause:** Sending `screen` data when FeedbackMaster has `componentType: "function"`

```json
// WRONG - FeedbackMaster has componentType: "function"
{
  "feedbackMasterName": "EvidenceChecklist",
  "userFeedback": {
    "screen": { ... },  // ERROR: Wrong type!
    "prompt": null,
    "api": null,
    "function": null
  }
}

// CORRECT
{
  "feedbackMasterName": "EvidenceChecklist",
  "userFeedback": {
    "screen": null,
    "prompt": null,
    "api": null,
    "function": { ... }  // Matches componentType: "function"
  }
}
```

### 400 Bad Request - Missing Required Fields

**Cause:** Missing `screenPath` or `screenName` for screen type

```json
// WRONG - Missing required fields
{
  "userFeedback": {
    "screen": {
      "issue": "Button broken"  // Missing screenPath and screenName!
    }
  }
}

// CORRECT
{
  "userFeedback": {
    "screen": {
      "screenPath": "/dashboard",
      "screenName": "Dashboard",
      "issue": "Button broken"
    }
  }
}
```

### 400 Bad Request - Multiple Component Types

**Cause:** Populating more than one component type

```json
// WRONG - Multiple types populated
{
  "userFeedback": {
    "screen": { ... },
    "function": { ... }  // ERROR: Only one allowed!
  }
}

// CORRECT - Only one type populated
{
  "userFeedback": {
    "screen": null,
    "prompt": null,
    "api": null,
    "function": { ... }
  }
}
```

### 400 Bad Request - Invalid promptName

**Cause:** `promptName` doesn't exist in `prompt_master` collection

```json
// ERROR: Prompt name not found
{
  "userFeedback": {
    "prompt": {
      "promptName": "NonExistentPrompt",  // Not in prompt_master!
      "componentExecutionId": "507f191e810c19729de860ea"
    }
  }
}

// Response:
{
  "success": false,
  "code": 400,
  "message": "Prompt with name 'NonExistentPrompt' not found in prompt_master",
  "errors": {
    "errorCode": "ERR.CORE.FEEDBACK.CREATE.INVALID_PROMPT"
  }
}
```

### 400 Bad Request - Missing promptName/componentId

**Cause:** Neither `promptName` nor `componentId` provided for prompt type

```json
// WRONG - No identifier provided
{
  "userFeedback": {
    "prompt": {
      "componentExecutionId": "507f191e810c19729de860ea",
      "userQuestion": "Some question"
      // Missing both promptName and componentId!
    }
  }
}

// Response:
{
  "success": false,
  "code": 400,
  "message": "prompt feedback requires either 'promptName' or 'componentId'"
}
```

---

## Complete Examples

### Example 1: Screen Feedback (Bug Report)

```json
{
  "feedbackMasterName": "Dashboard Screen Feedback",
  "userFeedback": {
    "screen": {
      "screenPath": "/dashboard/analytics",
      "screenName": "Analytics Dashboard",
      "issue": "Chart not loading",
      "description": "The bar chart in the analytics section fails to render when there are more than 100 data points"
    },
    "prompt": null,
    "api": null,
    "function": null
  },
  "comment": "The analytics chart crashes when loading large datasets. This started happening after the last update.",
  "isLiked": false,
  "quickFeedback": ["Bug found", "Performance issue"],
  "rating": 2.0,
  "isRegenerated": false
}
```

### Example 2: Prompt Feedback (AI Response) - Using promptName

```json
{
  "feedbackMasterName": "AI Assistant Feedback",
  "userFeedback": {
    "screen": null,
    "prompt": {
      "promptName": "FIR Case Summary",
      "componentExecutionId": "65f2a1b3c4d5e6f7a8b9c0d2",
      "userQuestion": "Summarize the case details for FIR #12345",
      "userExpectedOutput": "A brief summary of the case including date, location, and parties involved",
      "actualOutput": "FIR #12345 was filed on 2024-01-15 at Hyderabad PS. Complainant: John Doe. Accused: Unknown. Nature: Theft of mobile phone valued at Rs. 25,000."
    },
    "api": null,
    "function": null
  },
  "comment": "The AI provided an accurate and well-structured summary of the case.",
  "isLiked": true,
  "quickFeedback": ["Accurate response", "Well formatted"],
  "rating": 5.0,
  "isRegenerated": false
}
```

### Example 3: API Feedback (Error Report)

```json
{
  "feedbackMasterName": "API Error Feedback",
  "userFeedback": {
    "screen": null,
    "prompt": null,
    "api": {
      "endpoint": "/api/v1/personnel/search",
      "method": "POST",
      "expectedResponse": {
        "success": true,
        "data": [],
        "totalItems": 0
      },
      "actualResponse": {
        "success": false,
        "code": 500,
        "message": "Internal Server Error",
        "errors": {
          "errorCode": "ERR.CORE.DB.CONNECTION_FAILED"
        }
      },
      "statusCode": 500
    },
    "function": null
  },
  "comment": "Personnel search API is returning 500 error intermittently during peak hours.",
  "isLiked": false,
  "quickFeedback": ["Server error 500", "Intermittent issue"],
  "rating": 1.0
}
```

### Example 4: Function Feedback (EvidenceChecklist)

```json
{
  "feedbackMasterName": "EvidenceChecklist",
  "userFeedback": {
    "screen": null,
    "prompt": null,
    "api": null,
    "function": {
      "functionName": "EvidenceChecklist",
      "input": {
        "caseId": "FIR-2024-12345",
        "evidenceType": "digital",
        "filters": {
          "status": "pending",
          "priority": "high"
        }
      },
      "expectedOutput": {
        "success": true,
        "checklist": [
          {"item": "Mobile phone", "status": "collected"},
          {"item": "CCTV footage", "status": "pending"}
        ],
        "totalItems": 2
      },
      "actualOutput": {
        "success": false,
        "error": "Invalid evidence type",
        "errorCode": "EVIDENCE_TYPE_NOT_FOUND"
      }
    }
  },
  "comment": "The EvidenceChecklist function is not recognizing 'digital' as a valid evidence type.",
  "isLiked": false,
  "quickFeedback": ["Incorrect result", "Missing feature"],
  "rating": 2.0
}
```

---

## API Endpoint

**Create Feedback:**
```
POST /api/v1/feedback/create
Content-Type: application/json
Authorization: Bearer <token>
```

**Response (Success - 201):**
```json
{
  "success": true,
  "code": 201,
  "message": "Feedback created successfully",
  "data": {
    "_id": "65f2a1b3c4d5e6f7a8b9c0d3",
    "feedbackMasterId": "696232d26b3f9ca6354b010c",
    "userFeedback": { ... },
    "comment": "...",
    "isLiked": true,
    "rating": 4.5,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "createdBy": "user123"
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "code": 400,
  "message": "Component type mismatch: FeedbackMaster expects 'function' but received 'screen'",
  "errors": {
    "errorCode": "ERR.CORE.FEEDBACK.CREATE.INVALID_COMPONENT_TYPE"
  }
}
```

---

## FeedbackMaster Structure Reference

For reference, a FeedbackMaster record looks like:

```json
{
  "_id": "696232d26b3f9ca6354b010c",
  "name": "EvidenceChecklist",
  "componentType": "function",
  "options": {
    "likedOptions": ["Accurate", "Fast", "Helpful"],
    "dislikedOptions": ["Incorrect result", "Too slow", "Missing feature"]
  },
  "moduleId": "65f2a1b3c4d5e6f7a8b9c0d0",
  "isActive": true,
  "isDelete": false
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-10 | Initial documentation |
| 1.1 | 2025-01-10 | Added `promptName` support - auto-resolve prompt name to componentId from `prompt_master` |

---

*Generated for AP Police UC2 Core Backend*
