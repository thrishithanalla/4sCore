from typing import Any, Dict, Optional
import re

SENSITIVE_KEYS = {
    "password", "token", "authorization", "secret", "otp", "ssn",
    "creditCard", "apiKey", "accessKey", "refreshToken",
}

def sanitize_parameters(d: Dict[str, Any]) -> Dict[str, Any]:
    def _walk(obj):
        if isinstance(obj, dict):
            return {k: ("***" if k in SENSITIVE_KEYS else _walk(v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_walk(x) for x in obj]
        return obj
    try:
        return _walk(d or {})
    except Exception:
        return {}

def sanitize_stack(stack: Optional[str]) -> Optional[str]:
    if not stack:
        return stack
    # naive bearer token redaction
    return re.sub(r"(Bearer\s+)[A-Za-z0-9._-]+", r"\1***", stack)
