/**
 * Extracts a user-friendly error message from various error response formats
 *
 * Backend Standard Response Format:
 * {
 *   "success": false,
 *   "code": 422,
 *   "message": "Validation error",
 *   "data": null,
 *   "error": {
 *     "errorCode": "ERR.VALIDATION",
 *     "details": "field: error message" // For 422 errors
 *   }
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const extractErrorMessage = (error: any, defaultMessage: string = 'Something went wrong'): string => {
  const responseData = error.response?.data;
  const statusCode = error.response?.status;

  // Handle standardized backend error response format
  if (responseData && typeof responseData === 'object') {
    // For 422 Validation Errors: Show error.details if available
    if (statusCode === 422 && responseData.error?.details) {
      return responseData.error.details;
    }

    // Check for errors.details (plural) - common in some API responses
    if (responseData.errors?.details) {
      // Include the message if available for context
      if (responseData.message && responseData.message !== 'Internal server error') {
        return `${responseData.message}: ${responseData.errors.details}`;
      }
      return responseData.errors.details;
    }

    // Check for errors.errorCode - return message or details without error code
    if (responseData.errors?.errorCode) {
      // Prefer message over details for user-friendly display
      if (responseData.message) {
        return responseData.message;
      }
      return responseData.errors.details || 'Unknown error';
    }

    // For all other error codes: Show the message field
    if (responseData.message) {
      return responseData.message;
    }

    // Fallback to error.details if message is not available
    if (responseData.error?.details) {
      return responseData.error.details;
    }
  }

  // Handle FastAPI validation errors (array format) - Legacy support
  if (Array.isArray(responseData?.detail)) {
    const validationErrors = responseData.detail;
    return validationErrors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((err: any) => {
        const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : '';
        const message = err.msg || err.message || 'Invalid value';
        return field ? `${field}: ${message}` : message;
      })
      .join(', ');
  }

  // Handle simple string detail - Legacy support
  if (typeof responseData?.detail === 'string') {
    return responseData.detail;
  }

  // Handle object detail with message field - Legacy support
  if (typeof responseData?.detail === 'object' && responseData?.detail?.message) {
    return responseData.detail.message;
  }

  // Handle error string field - Legacy support
  if (responseData?.error && typeof responseData.error === 'string') {
    return responseData.error;
  }

  // Handle network errors
  if (!error.response) {
    return 'Network error. Please check your connection and try again.';
  }

  // Handle HTTP status codes as fallback
  if (statusCode) {
    switch (statusCode) {
      case 400:
        return 'Bad request. Please check your input.';
      case 401:
        return 'Unauthorized. Please login again.';
      case 403:
        return 'Access forbidden. You do not have permission.';
      case 404:
        return 'Resource not found.';
      case 409:
        return 'Conflict. The resource already exists.';
      case 422:
        return 'Validation error. Please check your input.';
      case 500:
        return 'Server error. Please try again later.';
      case 503:
        return 'Service unavailable. Please try again later.';
      default:
        return defaultMessage;
    }
  }

  return defaultMessage;
};

/**
 * Handles errors in async thunks and returns a rejection with a user-friendly message
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleAsyncThunkError = (error: any, defaultMessage?: string) => {
  const errorMessage = extractErrorMessage(error, defaultMessage);
  console.error('Error:', error);
  return errorMessage;
};