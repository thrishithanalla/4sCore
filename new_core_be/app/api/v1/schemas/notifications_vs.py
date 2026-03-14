from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import (BaseModel, ConfigDict, Field, ValidationInfo,
                      field_validator)


# -----------------------------
# Camel model
# -----------------------------
def to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])

class CamelModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        extra="ignore",
        # We are validating strings against value-sets, so no enums here.
    )


# -----------------------------
# Constants: Value Set Keys
# (Rename to match your collection contents.)
# -----------------------------
VS_NOTIFICATION_CHANNEL = "NOTIFICATION_CHANNEL"
VS_NOTIFICATION_PRIORITY = "NOTIFICATION_PRIORITY"
VS_NOTIFICATION_STATUS  = "NOTIFICATION_STATUS"


def _upper_or_none(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s.upper() if s else None


def _coerce_channel_to_db_value(code_upper: str) -> str:
    """
    Map the upper code to DB canonical string if you want different storage.
    Example mapping: INAPP->'inApp', SMS->'sms', WHATSAPP->'whatsapp'
    Adjust as per your DB convention.
    """
    if code_upper == "INAPP":
        return "inApp"
    if code_upper == "SMS":
        return "sms"
    if code_upper == "WHATSAPP":
        return "whatsapp"
    # default: store as-is
    return code_upper


# -----------------------------
# Masters
# -----------------------------
class BatchTemplate(CamelModel):
    title: str
    body: str

class NotificationMasterBase(CamelModel):
    notification_type: str = Field(...)
    description: Optional[str] = None
    module_id: Optional[str] = Field(default=None, description="Foreign key reference to modules collection _id")
    # Store in DB as strings; validate via value-sets in validators:
    default_channels: List[str] = Field(default_factory=list)
    priority: Optional[str] = None
    can_be_batched: bool = False
    batch_window_minutes: Optional[int] = None
    batch_template: Optional[BatchTemplate] = None
    active: bool = True

    @field_validator("default_channels", mode="before")
    @classmethod
    def _listify_channels(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return v
        return [v]

    @field_validator("default_channels")
    @classmethod
    def _validate_default_channels(
        cls, v: List[str], info: ValidationInfo
    ) -> List[str]:
        """
        Validate against value-set NOTIFICATION_CHANNEL (case-insensitive),
        then coerce to your canonical DB string ('inApp'/'sms'/'whatsapp').
        Requires context: info.context['value_sets'][VS_NOTIFICATION_CHANNEL] == set of UPPER codes.
        """
        codes_upper = (info.context or {}).get("value_sets", {}).get(VS_NOTIFICATION_CHANNEL, set())
        if not codes_upper:
            # No value-set available -> accept but do not coerce (or raise if you prefer strict)
            return v

        out: List[str] = []
        seen = set()
        for item in (v or []):
            code_upper = _upper_or_none(item)
            if not code_upper or code_upper not in codes_upper:
                raise ValueError(f"invalid channel '{item}' (not in {VS_NOTIFICATION_CHANNEL})")
            canonical = _coerce_channel_to_db_value(code_upper)
            if canonical not in seen:
                out.append(canonical)
                seen.add(canonical)
        # If empty, you can choose a default:
        return out or [_coerce_channel_to_db_value("INAPP")] if "INAPP" in codes_upper else out

    @field_validator("priority", mode="before")
    @classmethod
    def _normalize_priority_upper(cls, v):
        return _upper_or_none(v)

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, v: Optional[str], info: ValidationInfo) -> Optional[str]:
        if v is None:
            return v
        codes_upper = (info.context or {}).get("value_sets", {}).get(VS_NOTIFICATION_PRIORITY, set())
        if codes_upper and v not in codes_upper:
            raise ValueError(f"invalid priority '{v}' (not in {VS_NOTIFICATION_PRIORITY})")
        return v


class NotificationMasterCreate(NotificationMasterBase):
    pass


class NotificationMasterUpdate(CamelModel):
    description: Optional[str] = None
    module_id: Optional[str] = Field(default=None, description="Foreign key reference to modules collection _id")
    default_channels: Optional[List[str]] = None
    priority: Optional[str] = None
    can_be_batched: Optional[bool] = None
    batch_window_minutes: Optional[int] = None
    batch_template: Optional[BatchTemplate] = None
    active: Optional[bool] = None

    @field_validator("default_channels", mode="before")
    @classmethod
    def _listify_channels(cls, v):
        if v is None:
            return v
        if isinstance(v, list):
            return v
        return [v]

    @field_validator("default_channels")
    @classmethod
    def _validate_default_channels(
        cls, v: Optional[List[str]], info: ValidationInfo
    ) -> Optional[List[str]]:
        if v is None:
            return v
        codes_upper = (info.context or {}).get("value_sets", {}).get(VS_NOTIFICATION_CHANNEL, set())
        if not codes_upper:
            return v
        out: List[str] = []
        seen = set()
        for item in (v or []):
            code_upper = _upper_or_none(item)
            if not code_upper or code_upper not in codes_upper:
                raise ValueError(f"invalid channel '{item}' (not in {VS_NOTIFICATION_CHANNEL})")
            canonical = _coerce_channel_to_db_value(code_upper)
            if canonical not in seen:
                out.append(canonical)
                seen.add(canonical)
        return out

    @field_validator("priority", mode="before")
    @classmethod
    def _normalize_priority_upper(cls, v):
        return _upper_or_none(v)

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, v: Optional[str], info: ValidationInfo) -> Optional[str]:
        if v is None:
            return v
        codes_upper = (info.context or {}).get("value_sets", {}).get(VS_NOTIFICATION_PRIORITY, set())
        if codes_upper and v not in codes_upper:
            raise ValueError(f"invalid priority '{v}' (not in {VS_NOTIFICATION_PRIORITY})")
        return v


class NotificationMasterOut(NotificationMasterBase):
    id: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_by: Optional[str] = None
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None


# -----------------------------
# Notifications
# -----------------------------
class Action(CamelModel):
    label: str
    type: str  # link | api | deeplink
    url: Optional[str] = None
    action_key: Optional[str] = None
    method: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class NotificationEmitIn(CamelModel):
    contact_id: List[str] = Field(alias="contactId")
    notification_type: str = Field(alias="notificationType")
    priority: Optional[str] = None
    payload: Dict[str, Any] | None = None
    title: str | None = None
    body: str | None = None
    delivery_channel: Optional[str] = Field(default=None, alias="deliveryChannel")
    request_id: Optional[str] = None
    trace_id: Optional[str] = None
    actions: Optional[List[Action]] = None

    @field_validator("contact_id", mode="before")
    @classmethod
    def _listify_contacts(cls, v):
        if v is None:
            return []
        if isinstance(v, list):
            return [str(x) for x in v]
        return [str(v)]

    @field_validator("priority", mode="before")
    @classmethod
    def _priority_upper(cls, v):
        return _upper_or_none(v)

    @field_validator("priority")
    @classmethod
    def _priority_in_vs(cls, v: Optional[str], info: ValidationInfo) -> Optional[str]:
        if v is None:
            return v
        codes_upper = (info.context or {}).get("value_sets", {}).get(VS_NOTIFICATION_PRIORITY, set())
        if codes_upper and v not in codes_upper:
            raise ValueError(f"invalid priority '{v}' (not in {VS_NOTIFICATION_PRIORITY})")
        return v

    @field_validator("delivery_channel", mode="before")
    @classmethod
    def _channel_upper(cls, v):
        return _upper_or_none(v)

    @field_validator("delivery_channel")
    @classmethod
    def _channel_in_vs(cls, v: Optional[str], info: ValidationInfo) -> Optional[str]:
        if v is None:
            return v
        codes_upper = (info.context or {}).get("value_sets", {}).get(VS_NOTIFICATION_CHANNEL, set())
        if codes_upper and v not in codes_upper:
            raise ValueError(f"invalid deliveryChannel '{v}' (not in {VS_NOTIFICATION_CHANNEL})")
        # return canonical DB string form if you want to store lower-camel variants:
        return _coerce_channel_to_db_value(v)


class NotificationPatch(CamelModel):
    title: Optional[str] = None
    body: Optional[str] = None
    actions: Optional[List[Action]] = None
    status: Optional[str] = None
    delivery_channel: Optional[str] = None
    error_code: Optional[str] = None

    @field_validator("status", mode="before")
    @classmethod
    def _status_upper(cls, v):
        return _upper_or_none(v)

    @field_validator("status")
    @classmethod
    def _status_in_vs(cls, v: Optional[str], info: ValidationInfo) -> Optional[str]:
        if v is None:
            return v
        codes_upper = (info.context or {}).get("value_sets", {}).get(VS_NOTIFICATION_STATUS, set())
        if codes_upper and v not in codes_upper:
            raise ValueError(f"invalid status '{v}' (not in {VS_NOTIFICATION_STATUS})")
        return v

    @field_validator("delivery_channel", mode="before")
    @classmethod
    def _channel_upper(cls, v):
        return _upper_or_none(v)

    @field_validator("delivery_channel")
    @classmethod
    def _channel_in_vs(cls, v: Optional[str], info: ValidationInfo) -> Optional[str]:
        if v is None:
            return v
        codes_upper = (info.context or {}).get("value_sets", {}).get(VS_NOTIFICATION_CHANNEL, set())
        if codes_upper and v not in codes_upper:
            raise ValueError(f"invalid deliveryChannel '{v}' (not in {VS_NOTIFICATION_CHANNEL})")
        return _coerce_channel_to_db_value(v)


class NotificationOut(CamelModel):
    id: str
    contact_id: List[str]
    notification_id: str
    notification_type: str
    priority: Optional[str] = None
    payload_json: Dict[str, Any] = Field(default_factory=dict)
    title: Optional[str] = None
    body: Optional[str] = None
    actions: Optional[List[Action]] = None
    proposed_time: Optional[datetime] = None
    queued_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    delivery_channel: Optional[str] = None
    provider_message_id: Optional[str] = None
    status: Optional[str] = None
    error_code: Optional[str] = None
    request_id: Optional[str] = None
    trace_id: Optional[str] = None
    environment: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_by: Optional[str] = None
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None


class PaginatedMasters(CamelModel):
    data: List[NotificationMasterOut]
    totalItems: int
    page: int
    page_size: int
    total_pages: int

class PaginatedNotifications(CamelModel):
    data: List[NotificationOut]
    totalItems: int
    page: int
    page_size: int
    total_pages: int
