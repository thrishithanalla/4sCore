"""
Renderer Registry Service.

This module provides a registry of notification renderers that transform
notification payloads into rich, formatted content with titles, bodies,
and action buttons.

Key Features:
    - Registry-based renderer lookup by notification type
    - Customizable title and body generation
    - Action button support (deep links, web links)
    - Default fallback for unregistered notification types

Registered Renderers:
    - JOB_STATUS_CHANGE: Renders job status transition notifications

Output Format:
    {
        "title": "Human-readable title",
        "body": "<p>HTML formatted body</p>",
        "actions": [
            {"label": "Button Text", "type": "deeplink|link", "url": "..."}
        ]
    }

Usage:
    from app.api.v1.services.renderer_registry import render

    content = render("JOB_STATUS_CHANGE", {"jobId": "123", "newStatus": "DONE"})
"""
from typing import Dict, Any


def render_job_status_change(payload: Dict[str, Any]):
    
    jid = payload.get("jobId")
    old = payload.get("oldStatus", "Unknown")
    new = payload.get("newStatus", "Unknown")
    return {
        "title": f"Job #{jid} moved to {new}",
        "body": f"<p>The status changed from <b>{old}</b> to <b>{new}</b>.</p>",
        "actions": [
            {"label": "View Job", "type": "deeplink", "url": f"app://jobs/{jid}"},
            {"label": "Open in Web", "type": "link", "url": f"https://app.example.com/jobs/{jid}"}
        ]
    }

rendererRegistry = {
    "JOB_STATUS_CHANGE": render_job_status_change
}

def render(notificationType: str, payload: Dict[str, Any]):
    fn = rendererRegistry.get(notificationType)
    if not fn:
        # default generic
        return {"title": notificationType, "body": "<p>New notification.</p>", "actions": []}
    return fn(payload)
