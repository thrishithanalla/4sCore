"""
Request Context Middleware
Extracts and stores request context information for use throughout the request lifecycle.

This middleware runs FIRST and extracts:
- Client IP address (from various headers)
- Request timestamp
- Correlation IDs

Usage:
    # In your endpoint, access via request.state:
    client_ip = request.state.client_ip
    request_time = request.state.request_time
"""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from datetime import datetime
from typing import Optional

from app.api.v1.utils.request_helpers import get_client_ip
from app.utils.time_utils import get_ist_now


class RequestContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware to extract and store request context information.

    This middleware:
    1. Extracts client IP from headers (Cloudflare, proxy, direct)
    2. Records request timestamp in IST
    3. Makes this info available via request.state

    Benefits:
    - Client IP extracted ONCE per request (not in every endpoint)
    - Consistent access pattern across all endpoints
    - Reduces code duplication
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        """
        Process each request and extract context information.

        Args:
            request: The incoming HTTP request
            call_next: The next middleware/endpoint in the chain

        Returns:
            The HTTP response
        """
        # Extract client IP using centralized helper
        # Handles: CF-Connecting-IP, X-Forwarded-For, X-Real-IP, direct connection
        request.state.client_ip = get_client_ip(request)

        # Record request timestamp in IST
        request.state.request_time = get_ist_now()

        # Store the endpoint path for logging purposes
        request.state.endpoint = str(request.url.path)
        request.state.method = request.method

        # Continue to next middleware/endpoint
        response = await call_next(request)

        return response


def get_request_context(request: Request) -> dict:
    """
    Helper function to get all request context as a dictionary.

    Usage:
        context = get_request_context(request)
        # context = {"client_ip": "...", "request_time": "...", "endpoint": "...", "method": "..."}

    Args:
        request: FastAPI Request object

    Returns:
        Dictionary with context information
    """
    return {
        "client_ip": getattr(request.state, "client_ip", "unknown"),
        "request_time": getattr(request.state, "request_time", None),
        "endpoint": getattr(request.state, "endpoint", str(request.url.path)),
        "method": getattr(request.state, "method", request.method),
    }
