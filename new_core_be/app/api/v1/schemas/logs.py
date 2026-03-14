from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field

class LevelEnum(Enum):
    DEBUG = "DEBUG"
    INFO  = "INFO"
    WARN  = "WARN"
    ERROR = "ERROR"

class LogTypeEnum(Enum):
    app = "app"; access = "access"; job = "job"; integration = "integration"

class EnvEnum(Enum):
    prod = "prod"; stg = "stg"; dev = "dev"

# class LogIn(BaseModel):
#     model_config = ConfigDict(populate_by_name=True, extra="ignore")
#     ts: Optional[datetime] = Field(default=None, alias="ts")
#     level: LevelEnum = Field(alias="level")
#     logType: LogTypeEnum = Field(alias="logType")
#     message: str = Field(alias="message")
#     serviceKey: str = Field(alias="serviceKey")
#     module: Optional[str] = Field(default=None, alias="module")
#     function: Optional[str] = Field(default=None, alias="function")
#     actorUserId: Optional[str] = Field(default=None, alias="actorUserId")
#     requestId: Optional[str] = Field(default=None, alias="requestId")
#     traceId: Optional[str] = Field(default=None, alias="traceId")
#     endpoint: Optional[str] = Field(default=None, alias="endpoint")
#     method: Optional[str] = Field(default=None, alias="method")
#     statusCode: Optional[int] = Field(default=None, alias="statusCode")
#     durationMs: Optional[int] = Field(default=None, alias="durationMs")
#     kv: Optional[Dict[str, Any]] = Field(default=None, alias="kv")
#     environment: Optional[EnvEnum] = Field(default=None, alias="environment")

class LogIn(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        extra="ignore",
        json_schema_extra={
            "example": {
                "ts": "2025-01-01T10:20:30Z",
                "level": "INFO",
                "logType": "access",
                "message": "User login",
                "serviceKey": "auth-service",
                "module": "login",
                "function": "perform_login",
                "actorUserId": "68ee44954ff9d82c2f19befe",
                "requestId": "req-12345",
                "traceId": "trace-12345",
                "endpoint": "/api/login",
                "method": "POST",
                "statusCode": 200,
                "durationMs": 120,
                "kv": {
                    "username": "john",
                    "browser": "chrome"
                },
                "environment": "dev"
            }
        }
    )

    ts: Optional[datetime] = Field(default=None, alias="ts")
    level: str = Field(alias="level")
    logType: str = Field(alias="logType")
    message: str = Field(alias="message")
    serviceKey: str = Field(alias="serviceKey")
    module: Optional[str] = Field(default=None, alias="module")
    function: Optional[str] = Field(default=None, alias="function")
    actorUserId: Optional[str] = Field(default=None, alias="actorUserId")
    requestId: Optional[str] = Field(default=None, alias="requestId")
    traceId: Optional[str] = Field(default=None, alias="traceId")
    endpoint: Optional[str] = Field(default=None, alias="endpoint")
    method: Optional[str] = Field(default=None, alias="method")
    statusCode: Optional[int] = Field(default=None, alias="statusCode")
    durationMs: Optional[int] = Field(default=None, alias="durationMs")
    kv: Optional[Dict[str, Any]] = Field(default=None, alias="kv")
    environment: Optional[str] = Field(default=None, alias="environment")



class VerifyResult(BaseModel):
    chainId: str = Field(alias="chainId")
    passed: bool = Field(alias="passed")
    mismatchAtId: Optional[str] = Field(default=None, alias="mismatchAtId")
    details: Optional[str] = Field(default=None, alias="details")



class SealSummaryOut(BaseModel):
    day: str = Field(..., pattern=r"^\d{8}$", description="Day sealed in YYYYMMDD")
    sealed: int
    skipped: int
    totalItems: int
