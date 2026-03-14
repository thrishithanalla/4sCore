from typing import Any, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

class Action(BaseModel):
    label: str
    type: Literal["link", "api", "deeplink"]
    url: Optional[str] = None
    actionKey: Optional[str] = None
    method: Optional[Literal["GET", "POST", "PUT", "DELETE"]] = None
    payload: Optional[dict] = None

class NotificationEmitIn(BaseModel):
    notificationType: str
    contactId: Union[str, List[str]]  # Support single or multiple contact IDs
    payload: Optional[dict] = None
    priority: Optional[str] = None
    shortMessage: str
    requestId: Optional[str] = None
    traceId: Optional[str] = None

    @field_validator("contactId", mode="before")
    @classmethod
    def normalize_contact_ids(cls, v):
        """Normalize contactId to always be a list"""
        if isinstance(v, str):
            return [v]
        if isinstance(v, list):
            return v
        return [str(v)]

class NotificationReadOut(BaseModel):
    id: str
    contactId: str
    notificationId: str
    notificationType: str
    priority: str
    title: str
    body: str
    actions: List[Action] = []
    status: str
    deliveryChannel: str
    proposedTime: Optional[str] = None
    queuedAt: Optional[str] = None
    sentAt: Optional[str] = None
    deliveredAt: Optional[str] = None
    readAt: Optional[str] = None
    providerMessageId: Optional[str] = None
    requestId: Optional[str] = None
