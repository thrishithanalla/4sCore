# Error Handling Guide - Frontend

## Overview
This guide explains how error messages are displayed in the UI based on backend error responses.

## Backend Error Response Format

The backend uses a standardized response format from `ResponseBuilder` class:

```json
{
  "success": false,
  "code": 422,
  "message": "Validation error",
  "data": null,
  "error": {
    "errorCode": "ERR.VALIDATION",
    "details": "name: name can only contain alphabets, spaces, hyphens (-), underscores (_), ampersand (&), and forward slash (/)"
  }
}
```

## Frontend Error Handling Rules

The `extractErrorMessage()` function in `src/utils/error-handler.ts` handles errors with these rules:

### 1. **422 Validation Errors** → Show `error.details`

**Backend Response:**
```json
{
  "success": false,
  "code": 422,
  "message": "Validation error",
  "error": {
    "errorCode": "ERR.VALIDATION",
    "details": "name: name can only contain alphabets, spaces, hyphens (-), underscores (_), ampersand (&), and forward slash (/)"
  }
}
```

**Toast Message Shown:**
```
name: name can only contain alphabets, spaces, hyphens (-), underscores (_), ampersand (&), and forward slash (/)
```

---

### 2. **Other Error Codes (400, 404, 409, etc.)** → Show `message`

**Backend Response:**
```json
{
  "success": false,
  "code": 400,
  "message": "User ID already exists",
  "error": {
    "errorCode": "ERR.PERSONNEL_MASTER.VALIDATION"
  }
}
```

**Toast Message Shown:**
```
User ID already exists
```

---

## How to Use in Forms

### Example 1: Role Form (Already Implemented)

```tsx
const handleSubmit = async () => {
  setLoading(true);
  setError('');

  try {
    if (isEditMode && id) {
      await updateRole(id, payload);
    } else {
      await createRole(payload);
    }

    toast.current?.show({
      severity: 'success',
      summary: 'Success',
      detail: 'Role created successfully',
      life: 3000
    });

  } catch (err: any) {
    // extractErrorMessage automatically handles 422 vs other errors
    const errorMsg = extractErrorMessage(err, 'Failed to save role');
    setError(errorMsg); // Show in UI

    // Optionally show in toast
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: errorMsg,
      life: 5000
    });
  } finally {
    setLoading(false);
  }
};
```

---

### Example 2: Generic Form Handler

```tsx
import { extractErrorMessage } from '../../utils/error-handler';

const handleFormSubmit = async (formData: any) => {
  try {
    await apiService.create(formData);
    // Success handling
  } catch (error: any) {
    const message = extractErrorMessage(error);

    // Option A: Show in state
    setError(message);

    // Option B: Show in toast
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message
    });

    // Option C: Show both
    setError(message);
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message
    });
  }
};
```

---

## Error Display Patterns

### Pattern 1: Inline Error Message (Form-level)

```tsx
{error && (
  <Message
    severity="error"
    text={error}
    className="w-full mb-3"
  />
)}
```

### Pattern 2: Toast Notification

```tsx
toast.current?.show({
  severity: 'error',
  summary: 'Error',
  detail: errorMessage,
  life: 5000
});
```

### Pattern 3: Field-level Error (Custom)

For field-specific errors, you can parse the 422 validation details:

```tsx
// If error.details = "email: Invalid email format"
const parseFieldError = (errorDetails: string) => {
  const match = errorDetails.match(/^(\w+):\s*(.+)$/);
  if (match) {
    return { field: match[1], message: match[2] };
  }
  return { field: null, message: errorDetails };
};

// Usage
const { field, message } = parseFieldError(errorDetails);
setFieldErrors({ [field]: message });
```

---

## Testing Error Handling

### Test Case 1: 422 Validation Error

**Test:** Create a role with invalid name (e.g., "Test@Role")

**Expected Backend Response:**
```json
{
  "success": false,
  "code": 422,
  "message": "Validation error",
  "error": {
    "errorCode": "ERR.VALIDATION",
    "details": "name: name can only contain alphabets, spaces, hyphens (-), underscores (_), ampersand (&), and forward slash (/)"
  }
}
```

**Expected Toast:**
```
Error
name: name can only contain alphabets, spaces, hyphens (-), underscores (_), ampersand (&), and forward slash (/)
```

---

### Test Case 2: 400 Duplicate Error

**Test:** Create a user with duplicate user ID

**Expected Backend Response:**
```json
{
  "success": false,
  "code": 400,
  "message": "User ID already exists",
  "error": {
    "errorCode": "ERR.PERSONNEL_MASTER.VALIDATION"
  }
}
```

**Expected Toast:**
```
Error
User ID already exists
```

---

### Test Case 3: 404 Not Found

**Test:** Edit a deleted role

**Expected Backend Response:**
```json
{
  "success": false,
  "code": 404,
  "message": "Role not found",
  "error": {
    "errorCode": "ERR.NOT_FOUND"
  }
}
```

**Expected Toast:**
```
Error
Role not found
```

---

## Summary

✅ **422 Errors** → Show detailed validation message from `error.details`
✅ **Other Errors** → Show user-friendly message from `message` field
✅ **Network Errors** → Show "Network error. Please check your connection"
✅ **Fallback** → Show custom default message

---

## Time Estimate

The error handling is **already implemented** and ready to use:

- ✅ `extractErrorMessage()` function updated
- ✅ Already integrated in role-form.tsx
- ✅ Works with all forms using the same pattern

**No additional time needed** - just test the existing implementation!

To test:
1. Submit a form with invalid data (422 error)
2. Check that the validation details appear in the error message
3. Submit a form with duplicate data (400 error)
4. Check that the main message appears

---

## Quick Reference

| Error Code | Shows | Example |
|------------|-------|---------|
| **422** | `error.details` | "name: name can only contain alphabets..." |
| **400** | `message` | "User ID already exists" |
| **404** | `message` | "Resource not found" |
| **409** | `message` | "Resource already exists" |
| **500** | `message` | "Internal server error" |
| **Network** | Default | "Network error. Please check your connection" |
