from pydantic import BaseModel, Field
from typing import Optional, Union, List
from datetime import datetime


class DeviceInfoSchema(BaseModel):
    """Schema for device information"""
    userAgent: Optional[str] = Field(None, description="Browser/App user agent string")
    deviceType: Optional[str] = Field(None, description="Device type: mobile, desktop, tablet, ios, android")
    os: Optional[str] = Field(None, description="Operating system")
    browser: Optional[str] = Field(None, description="Browser name")
    deviceName: Optional[str] = Field(None, description="Device name/model")
    fcmToken: Optional[str] = Field(None, description="Firebase Cloud Messaging token for push notifications")


class LoginSchema(BaseModel):
    """Schema for user login - validation is done at service level for proper error logging"""
    userId: Optional[str] = Field(None, description="Police User Identifier (8 digits)")
    phoneNumber: Optional[str] = Field(None, description="Mobile number (Indian format: +91XXXXXXXXXX, 91XXXXXXXXXX, or XXXXXXXXXX)")
    mpin: Optional[Union[int, str]] = Field(None, description="4-digit MPIN for authentication (integer)")
    deviceInfo: Optional[DeviceInfoSchema] = Field(None, description="Device information for session tracking")


class TokenSchema(BaseModel):
    """Schema for JWT token response"""
    accessToken: str = Field(..., description="JWT access token")
    refreshToken: str = Field(..., description="Refresh token for obtaining new access tokens")
    tokenType: str = Field(default="bearer", description="Token type")
    expiresIn: int = Field(..., description="Access token expiration time in minutes")
    refreshExpiresIn: int = Field(..., description="Refresh token expiration time in days")


class TokenDataSchema(BaseModel):
    """Schema for token data"""
    userId: Optional[str] = None
    id: Optional[str] = Field(None, description="Personnel MongoDB ObjectId")
    fullName: Optional[str] = None
    unitId: Optional[str] = Field(None, description="Current unit ID")
    unitName: Optional[str] = Field(None, description="Current unit name")
    roleId: Optional[str] = Field(None, description="Current role ID")
    roleName: Optional[str] = Field(None, description="Current role name")
    districtId: Optional[str] = Field(None, description="District ID")
    districtName: Optional[str] = Field(None, description="District name")
    units: list[dict] = Field(default=[], description="Array of units with roles: [{name, unitId, roles: [{name, roleId}], designationId}]")


class VerifyOTPSchema(BaseModel):
    """Schema for OTP verification request"""
    personnelId: str = Field(..., description="Personnel MongoDB ObjectId")
    otp: str = Field(..., description="6-digit OTP code")


class UpdateMPINSchema(BaseModel):
    """Schema for updating MPIN after OTP verification"""
    personnelId: str = Field(..., description="Personnel MongoDB ObjectId")
    otpSessionId: str = Field(..., description="OTP session ID from verify-otp response")
    newMpin: Union[int, str] = Field(..., description="New 4-digit MPIN (integer)")


class OTPResponseSchema(BaseModel):
    """Schema for OTP send response"""
    personnelId: str = Field(..., description="Personnel MongoDB ObjectId")
    message: str = Field(..., description="Status message")
    otpSentTo: str = Field(..., description="Masked phone number where OTP was sent")


class OTPVerifyResponseSchema(BaseModel):
    """Schema for OTP verification response"""
    personnelId: str = Field(..., description="Personnel MongoDB ObjectId")
    otpSessionId: str = Field(..., description="Session ID for MPIN update")
    message: str = Field(..., description="Status message")


class MPINUpdateResponseSchema(BaseModel):
    """Schema for MPIN update response"""
    personnelId: str = Field(..., description="Personnel MongoDB ObjectId")
    message: str = Field(..., description="Status message")


# =========================================================================
# Refresh Token Schemas
# =========================================================================

class RefreshTokenSchema(BaseModel):
    """Schema for refresh token request"""
    refreshToken: str = Field(..., description="Refresh token to exchange for new tokens")


class LogoutSchema(BaseModel):
    """Schema for logout request"""
    refreshToken: str = Field(..., description="Refresh token to revoke")


class SessionSchema(BaseModel):
    """Schema for session/active device information"""
    sessionId: str = Field(..., description="Session ID")
    deviceInfo: Optional[DeviceInfoSchema] = Field(None, description="Device information")
    ipAddress: Optional[str] = Field(None, description="IP address")
    lastUsedAt: Optional[datetime] = Field(None, description="Last activity timestamp")
    createdAt: Optional[datetime] = Field(None, description="Session creation timestamp")
    isCurrent: bool = Field(default=False, description="Whether this is the current session")


class SessionListResponseSchema(BaseModel):
    """Schema for list of active sessions"""
    sessions: List[SessionSchema] = Field(..., description="List of active sessions")
    totalSessions: int = Field(..., description="Total number of active sessions")


class RevokeSessionSchema(BaseModel):
    """Schema for revoking a specific session"""
    sessionId: str = Field(..., description="Session ID to revoke")