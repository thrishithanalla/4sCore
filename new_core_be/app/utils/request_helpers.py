"""
Request Helpers
Utility functions for extracting information from HTTP requests
"""
from fastapi import Request
from typing import Optional


def _is_ipv4(ip: str) -> bool:
    """Check if an IP address is IPv4 format"""
    if not ip:
        return False
    # IPv4: contains dots and no colons (e.g., 192.168.1.1)
    # IPv6: contains colons (e.g., 2001:0db8::1 or ::ffff:192.168.1.1)
    return "." in ip and ":" not in ip


def _extract_ipv4_from_mapped(ip: str) -> Optional[str]:
    """
    Extract IPv4 from IPv6-mapped IPv4 address if present

    IPv6-mapped IPv4 format: ::ffff:192.168.1.1
    """
    if ip and ip.lower().startswith("::ffff:"):
        return ip[7:]  # Remove "::ffff:" prefix
    return None


def _get_ip_from_header(request: Request, header_name: str, split_first: bool = False) -> Optional[str]:
    """Get IP from a specific header"""
    value = request.headers.get(header_name)
    if value:
        if split_first:
            return value.split(",")[0].strip()
        return value.strip()
    return None


def _normalize_ip(ip: str) -> str:
    """
    Normalize IP address - extract IPv4 from mapped format if present
    """
    if not ip:
        return ip
    # Check if it's an IPv6-mapped IPv4 (::ffff:x.x.x.x)
    mapped_ipv4 = _extract_ipv4_from_mapped(ip)
    if mapped_ipv4:
        return mapped_ipv4
    return ip


def get_client_ip(request: Request) -> str:
    """
    Extract real client IP address from request (Cloudflare + Azure Kubernetes deployment)

    Priority order (returns first available):
    1. CF-Connecting-IP (Cloudflare) - MOST TRUSTED
    2. True-Client-IP (Enterprise Cloudflare)
    3. X-Forwarded-For (first IP)
    4. X-Real-IP
    5. X-Original-Forwarded-For (Azure)
    6. Direct connection IP (pod/container IP - LEAST TRUSTED)

    Args:
        request: FastAPI Request object

    Returns:
        Client IP address string (IPv4 or IPv6 - whichever the user has)

    Notes:
        Your setup: User → Cloudflare CDN → Azure Kubernetes → FastAPI
        Cloudflare sets CF-Connecting-IP header with the real user IP
    """
    # Priority 1: CF-Connecting-IP (Cloudflare's trusted header for real client IP)
    cf_ip = _get_ip_from_header(request, "CF-Connecting-IP")
    if cf_ip:
        return _normalize_ip(cf_ip)

    # Priority 2: True-Client-IP (Enterprise Cloudflare or some CDNs)
    true_ip = _get_ip_from_header(request, "True-Client-IP")
    if true_ip:
        return _normalize_ip(true_ip)

    # Priority 3: X-Forwarded-For (Standard proxy header)
    xff_ip = _get_ip_from_header(request, "X-Forwarded-For", split_first=True)
    if xff_ip:
        return _normalize_ip(xff_ip)

    # Priority 4: X-Real-IP (Alternative proxy header)
    real_ip = _get_ip_from_header(request, "X-Real-IP")
    if real_ip:
        return _normalize_ip(real_ip)

    # Priority 5: X-Original-Forwarded-For (Azure-specific)
    orig_xff_ip = _get_ip_from_header(request, "X-Original-Forwarded-For", split_first=True)
    if orig_xff_ip:
        return _normalize_ip(orig_xff_ip)

    # Priority 6: Direct connection IP (pod/container IP in K8s)
    if request.client and request.client.host:
        return _normalize_ip(request.client.host)

    return "unknown"
