"""
Third Party API Manager Schemas
Pydantic models for CDR Softwares Network API requests and responses
"""
from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime


class NetworkLookupRequestSchema(BaseModel):
    """Schema for network lookup request (CDR Softwares API)"""

    keyword: str = Field(
        ...,
        description="Phone number or keyword to lookup",
        min_length=1,
        max_length=15
    )


class NetworkDataSchema(BaseModel):
    """Schema for network data from CDR API response"""

    services: Optional[str] = None
    operator_name: Optional[str] = None
    operator_code: Optional[str] = None
    circle_name: Optional[str] = None
    circle_common_name: Optional[str] = None
    circle_code: Optional[str] = None
    service_type: Optional[str] = None


class NetworkLookupResponseSchema(BaseModel):
    """Schema for network lookup response from CDR Softwares API"""

    success: bool = Field(..., description="Whether the API call was successful")
    status_code: int = Field(..., description="HTTP status code from the 3rd party API")
    data: Optional[NetworkDataSchema] = Field(default=None, description="Network data from the API")
    message: Optional[str] = Field(default=None, description="Message from the API")
    error: Optional[str] = Field(default=None, description="Error message if request failed")
    elapsed_ms: int = Field(..., description="Request duration in milliseconds")


class CdrApiLogSchema(BaseModel):
    """Schema for Third Party API log stored in database"""

    service: Optional[str] = Field(default=None, description="Third party service name (e.g., CDR, IMEI, etc.)")
    serviceEndpoint: Optional[str] = Field(default=None, description="Third party API endpoint URL")
    keyword: str = Field(..., description="Phone number/keyword that was looked up")
    status: bool = Field(..., description="API response status")
    operator_name: Optional[str] = Field(default=None, description="Operator name from response")
    operator_code: Optional[str] = Field(default=None, description="Operator code from response")
    circle_name: Optional[str] = Field(default=None, description="Circle name from response")
    circle_common_name: Optional[str] = Field(default=None, description="Circle common name from response")
    circle_code: Optional[str] = Field(default=None, description="Circle code from response")
    service_type: Optional[str] = Field(default=None, description="Service type (prepaid/postpaid)")
    message: Optional[str] = Field(default=None, description="API response message")
    userId: str = Field(..., description="User ID who made the request")
    clientIp: str = Field(..., description="Client IP address")
    elapsed_ms: int = Field(..., description="Request duration in milliseconds")
    createdAt: datetime = Field(default_factory=datetime.utcnow, description="Log creation timestamp")
