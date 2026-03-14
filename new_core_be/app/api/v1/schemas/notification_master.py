from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

VS_NOTIFICATION_CHANNEL = "notificationChannel"
VS_NOTIFICATION_PRIORITY = "notificationPriority"
VS_NOTIFICATION_STATUS  = "notificationStatus"

def to_camel(s: str) -> str:
    parts = s.split('_')
    return parts[0] + ''.join(p.capitalize() for p in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        use_enum_values=True,   # <-- add this
        extra="ignore",         # (optional but nice)
    )


# class CamelModel(BaseModel):
#     model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class NotificationChannel(str, Enum):
    INAPP = "inApp"
    SMS = "sms"
    WHATSAPP = "whatsapp"

    @classmethod
    def coerce(cls, v: "NotificationChannel | str | None") -> "NotificationChannel | None":
        if v is None:
            return None
        if isinstance(v, cls):
            return v
        s = str(v).strip().lower()
        if s in {"inapp", "in-app", "in_app"}:
            return cls.INAPP
        if s == "sms":
            return cls.SMS
        if s in {"whatsapp", "whatapp", "wa"}:
            return cls.WHATSAPP
        # let Pydantic raise later with a clean message
        raise ValueError("Input should be 'inApp', 'sms' or 'whatsapp'")


class NotificationPriority(str, Enum):
    HIGH = "HIGH"
    NORMAL = "NORMAL"
    LOW = "LOW"

class NotificationStatus(str, Enum):
    PENDING = "Pending"
    QUEUED = "Queued"
    SENT = "Sent"
    DELIVERED = "Delivered"
    READ = "Read"
    FAILED = "Failed"
    CANCELED = "Canceled"

class BatchTemplate(CamelModel):
    title: str
    body: str

# ------------ Masters ------------
class NotificationMasterBase(CamelModel):
    notification_type: str = Field(...)
    description: Optional[str] = None
    default_channels: List[NotificationChannel] = Field(default_factory=lambda: [NotificationChannel.INAPP])
    priority: NotificationPriority = NotificationPriority.NORMAL
    can_be_batched: bool = False
    batch_window_minutes: Optional[int] = None
    batch_template: Optional[BatchTemplate] = None
    active: bool = True

class NotificationMasterCreate(NotificationMasterBase):
    pass

class NotificationMasterUpdate(CamelModel):
    description: Optional[str] = None
    default_channels: Optional[List[NotificationChannel]] = None
    priority: Optional[NotificationPriority] = None
    can_be_batched: Optional[bool] = None
    batch_window_minutes: Optional[int] = None
    batch_template: Optional[BatchTemplate] = None
    active: Optional[bool] = None

class NotificationMasterOut(NotificationMasterBase):
    id: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_by: Optional[str] = None
    updated_at: datetime
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

# ------------ Notifications ------------
class Action(CamelModel):
    label: str
    type: str  # link | api | deeplink
    url: Optional[str] = None
    action_key: Optional[str] = None
    method: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class NotificationPatch(CamelModel):
    title: Optional[str] = None
    body: Optional[str] = None
    actions: Optional[List[Action]] = None
    status: Optional[NotificationStatus] = None
    delivery_channel: Optional[NotificationChannel] = None
    error_code: Optional[str] = None


class PaginatedMasters(CamelModel):
    data: List[NotificationMasterOut]
    totalItems: int
    page: int
    page_size: int
    total_pages: int


class NotificationCreate(CamelModel):
    contact_id: str
    notification_type: str
    title: str
    body: str
    priority: NotificationPriority = NotificationPriority.NORMAL
    delivery_channel: Optional[NotificationChannel] = NotificationChannel.INAPP
    actions: Optional[List[Dict[str, Any]]] = None


class NotificationOut(NotificationCreate):
    id: str
    status: NotificationStatus = NotificationStatus.PENDING
    created_at: datetime
    queued_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    is_deleted: bool = False


class NotificationMasterBulkCreateSchema(CamelModel):
    """Schema for bulk creating notification masters"""
    items: List[NotificationMasterCreate]


class NotificationMasterBulkCreateResponseSchema(CamelModel):
    """Response schema for bulk create operation"""
    success: List[NotificationMasterOut] = []
    failed: List[Dict[str, Any]] = []
    total_success: int = 0
    total_failed: int = 0