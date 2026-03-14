"""
Custom CORS Middleware with Wildcard/Regex Support

Supports patterns like:
- http://localhost:*        (any port on localhost)
- https://*.example.com     (any subdomain)
- http://127.0.0.1:*        (any port on 127.0.0.1)
- https://example.com       (exact match)
- *                         (allow all origins)
- ^regex$                   (raw regex pattern starting with ^)
"""

import re
from typing import List, Optional, Pattern
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp


class CustomCORSMiddleware(BaseHTTPMiddleware):
    """
    Custom CORS middleware that supports wildcard patterns and raw regex.

    Patterns:
    - `*` allows all origins
    - `http://localhost:*` matches any port on localhost
    - `https://*.domain.com` matches any subdomain of domain.com
    - `^regex$` raw regex pattern (detected by starting with ^)
    """

    def __init__(
        self,
        app: ASGIApp,
        allow_origins: List[str],
        allow_credentials: bool = True,
        allow_methods: List[str] = None,
        allow_headers: List[str] = None,
        expose_headers: List[str] = None,
        max_age: int = 600,
    ):
        super().__init__(app)
        self.allow_all_origins = "*" in allow_origins and not any(o.strip().startswith("^") for o in allow_origins)
        self.allow_credentials = allow_credentials
        self.allow_methods = allow_methods or ["*"]
        self.allow_headers = allow_headers or ["*"]
        self.expose_headers = expose_headers or []
        self.max_age = max_age

        # Compile patterns for non-wildcard origins
        self.origin_patterns: List[Pattern] = []
        self.exact_origins: set = set()

        if not self.allow_all_origins:
            for origin in allow_origins:
                origin = origin.strip()
                if not origin:
                    continue

                # Check if it's a raw regex pattern (starts with ^)
                if origin.startswith("^"):
                    try:
                        self.origin_patterns.append(re.compile(origin, re.IGNORECASE))
                    except re.error as e:
                        print(f"[CORS] Invalid regex pattern: {origin} - {e}")
                elif "*" in origin:
                    # Convert wildcard pattern to regex
                    pattern = self._wildcard_to_regex(origin)
                    self.origin_patterns.append(re.compile(pattern, re.IGNORECASE))
                else:
                    # Exact match
                    self.exact_origins.add(origin.lower())

    def _wildcard_to_regex(self, pattern: str) -> str:
        """
        Convert a wildcard pattern to a regex pattern.

        Examples:
        - http://localhost:* -> ^http://localhost:\\d+$
        - https://*.example.com -> ^https://[^/]+\\.example\\.com$
        """
        # Escape special regex characters except *
        escaped = re.escape(pattern)

        # Replace escaped \* with appropriate regex
        # For port wildcard (e.g., localhost:*)
        escaped = re.sub(r'\\\*$', r'\\d+', escaped)  # :* at end means any port
        escaped = re.sub(r':\\\*', r':\\d+', escaped)  # :* means any port

        # For subdomain wildcard (e.g., *.example.com)
        escaped = re.sub(r'^\\\*\\.', r'[a-zA-Z0-9-]+\\.', escaped)  # *.domain at start
        escaped = re.sub(r'://\\\*\\.', r'://[a-zA-Z0-9-]+\\.', escaped)  # protocol://*.domain

        return f'^{escaped}$'

    def _is_origin_allowed(self, origin: str) -> bool:
        """Check if the origin is allowed."""
        if not origin:
            return False

        if self.allow_all_origins:
            return True

        origin_lower = origin.lower()

        # Check exact matches first
        if origin_lower in self.exact_origins:
            return True

        # Check pattern matches
        for pattern in self.origin_patterns:
            if pattern.match(origin_lower):
                return True

        return False

    def _get_cors_headers(self, origin: str, is_preflight: bool = False) -> dict:
        """Generate CORS headers for the response."""
        headers = {}

        if self.allow_all_origins and not self.allow_credentials:
            headers["Access-Control-Allow-Origin"] = "*"
        else:
            headers["Access-Control-Allow-Origin"] = origin

        if self.allow_credentials:
            headers["Access-Control-Allow-Credentials"] = "true"

        if self.expose_headers:
            headers["Access-Control-Expose-Headers"] = ", ".join(self.expose_headers)

        if is_preflight:
            # Preflight-specific headers
            if "*" in self.allow_methods:
                headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD"
            else:
                headers["Access-Control-Allow-Methods"] = ", ".join(self.allow_methods)

            if "*" in self.allow_headers:
                headers["Access-Control-Allow-Headers"] = "Accept, Accept-Language, Content-Language, Content-Type, Authorization, X-Requested-With, X-Request-ID, X-Trace-ID"
            else:
                headers["Access-Control-Allow-Headers"] = ", ".join(self.allow_headers)

            headers["Access-Control-Max-Age"] = str(self.max_age)

        return headers

    async def dispatch(self, request: Request, call_next) -> Response:
        origin = request.headers.get("origin")

        # No origin header = same-origin request, skip CORS
        if not origin:
            return await call_next(request)

        # Check if origin is allowed
        if not self._is_origin_allowed(origin):
            # Origin not allowed - return response without CORS headers
            # Browser will block the request
            if request.method == "OPTIONS":
                return Response(status_code=403, content="Origin not allowed")
            return await call_next(request)

        # Handle preflight OPTIONS request
        if request.method == "OPTIONS":
            headers = self._get_cors_headers(origin, is_preflight=True)
            return Response(status_code=204, headers=headers)

        # Handle actual request
        response = await call_next(request)

        # Add CORS headers to response
        cors_headers = self._get_cors_headers(origin, is_preflight=False)
        for key, value in cors_headers.items():
            response.headers[key] = value

        return response
