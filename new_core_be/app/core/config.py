from __future__ import annotations

from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, model_validator

def _coerce_bool(v: str | bool | None, default: bool = False) -> bool:
    """Convert environment variable to boolean."""
    if isinstance(v, bool):
        return v
    if v is None:
        return default
    return str(v).lower() in {"1", "true", "yes", "y", "on"}

class Settings(BaseSettings):
    """
    Central app configuration.
    Values load from:
    1. Environment variables
    2. .env file
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ------------------------------------------------
    # APP CONFIG (hardcoded - not from .env)
    # ------------------------------------------------
    APP_NAME: str = "CORE SERVICE'S"

    
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    PORT: int = 8082
    TIMEZONE: str = "Asia/Kolkata"
    ENVIRONMENT: str = Field(validation_alias="APP_ENVIRONMENT")

    # ------------------------------------------------
    # JWT CONFIG
    # ------------------------------------------------
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int =Field(validation_alias="AUTH_JWT_EXPIRY_MINUTES")
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_SECRET_KEY: str =Field(validation_alias="AUTH_JWT_SECRET")
    JWT_REFRESH_SECRET_KEY: str = Field(validation_alias="AUTH_JWT_REFRESH_SECRET")
    JWT_ALGORITHM: str = Field(validation_alias="AUTH_JWT_ALGORITHM")
    
    
    # ------------------------------------------------
    # LOGGING CONFIG
    # ------------------------------------------------
    MAX_SKEW_SECONDS: int = Field(default=300, validation_alias="MAX_SKEW_SECONDS")
    LOG_LEVEL_THRESHOLD: str = Field(default="INFO", validation_alias="LOG_LEVEL_THRESHOLD")
    LOG_SAMPLE_INFO_PCT: int = Field(default=100, validation_alias="LOG_SAMPLE_INFO_PCT")

    # ------------------------------------------------
    # SESSION CONFIG
    # ------------------------------------------------
    MAX_SESSIONS_PER_USER: int = 5
    REFRESH_TOKEN_ROTATION: bool = True

    # ------------------------------------------------
    # DATABASE
    # ------------------------------------------------
    MONGODB_URI: str = Field(validation_alias="DB_CONNECTION_URI")
    MONGODB_DB: str = Field(validation_alias="DB_NAME")
    
    # ------------------------------------------------
    # SIGNING
    # ------------------------------------------------
    SIGNING_MODE: str = Field(default="local", validation_alias="SIGNING_MODE")  # "local" | "azure"

    LOG_KEY_ACTIVE_ID: str = Field(default="kms-key-dev", validation_alias="LOG_KEY_ACTIVE_ID")
    LOG_KEY_ACTIVE_RAW: str = Field(default="local-signing-key-123456789012", validation_alias="LOG_KEY_ACTIVE_RAW")

    KEY_VAULT_URL: str = Field(default="", validation_alias="KEY_VAULT_URL")
    SIGNING_KEY_NAME: str = Field(default="", validation_alias="SIGNING_KEY_NAME")
    SIGNING_KEY_VERSION: Optional[str] = Field(default=None, validation_alias="SIGNING_KEY_VERSION")
    
    
        # ------------------------------------------------
    # CHAIN SEALING / TIMEZONE
    # ------------------------------------------------
    LOG_CHAIN_TZ: str = Field(default="UTC", validation_alias="LOG_CHAIN_TZ")
    SEAL_FORCE: bool = Field(default=False, validation_alias="SEAL_FORCE")
    SEAL_TARGET_DAY: Optional[str] = Field(default=None, validation_alias="SEAL_TARGET_DAY")  # YYYYMMDD
    

    # ------------------------------------------------
    # CORS
    # ------------------------------------------------
    ALLOWED_ORIGINS: str =Field(validation_alias="CORS_ALLOWED_ORIGINS")

    @property
    def allowed_origins_list(self) -> List[str]:
        """Get list of allowed origins."""
        raw = (self.ALLOWED_ORIGINS or "").strip()
        if raw == "*" or raw == "":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]
    
    
    
      # ------------------------------------------------
    # ERROR LOG API (External Error Logging Service)
    # ------------------------------------------------
    ERROR_LOG_API_URL: Optional[str] = Field(default=None, validation_alias="CORE_MAIN_BASE_URL")

    # ------------------------------------------------
    # LOG TRANSACTION API (External Activity Logging Service)
    # ------------------------------------------------
    LOG_TRANSACTION_API_URL: Optional[str] = Field(default=None, validation_alias="LOG_API_BASE_URL")

    # ------------------------------------------------
    # VALIDATORS
    # ------------------------------------------------
    @field_validator("LOG_LEVEL_THRESHOLD")
    @classmethod
    def validate_log_level(cls, v: str):
        allowed = {"DEBUG", "INFO", "WARN", "ERROR"}
        v_up = (v or "").upper()
        if v_up not in allowed:
            raise ValueError(f"LOG_LEVEL_THRESHOLD must be one of {sorted(allowed)}")
        return v_up

    @field_validator("LOG_SAMPLE_INFO_PCT")
    @classmethod
    def validate_pct(cls, v: int):
        v = int(v)
        if not (1 <= v <= 100):
            raise ValueError("LOG_SAMPLE_INFO_PCT must be between 1 and 100")
        return v

    @field_validator("SIGNING_MODE")
    @classmethod
    def validate_signing_mode(cls, v: str):
        allowed = {"local", "azure"}
        v_low = (v or "").lower()
        if v_low not in allowed:
            raise ValueError(f"SIGNING_MODE must be one of {allowed}")
        return v_low

    @model_validator(mode="after")
    def validate_signing_block(self):
        # Local mode key length check
        if self.SIGNING_MODE == "local":
            if not self.LOG_KEY_ACTIVE_RAW or len(self.LOG_KEY_ACTIVE_RAW) < 16:
                raise ValueError("LOG_KEY_ACTIVE_RAW must be at least 16 chars for local mode")

        # Azure mode requirements
        if self.SIGNING_MODE == "azure":
            if not self.KEY_VAULT_URL or not self.SIGNING_KEY_NAME:
                raise ValueError("Azure signing requires KEY_VAULT_URL and SIGNING_KEY_NAME")

        return self

    @property
    def allowed_origins_list(self) -> List[str]:
        raw = (self.ALLOWED_ORIGINS or "").strip()
        if raw == "*" or raw == "":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]



    # ------------------------------------------------
    # AUDITLOG SERVICE
    # ------------------------------------------------
    API_AUDITLOG_URL: str = ""

    @property
    def get_transaction_create_url(self) -> str:
        """Get the log transaction create URL."""
        return f"{self.API_AUDITLOG_URL}/log-transactions/create"

    # ------------------------------------------------
    # NOTIFICATION SERVICE
    # ------------------------------------------------
    NOTIFICATION_SERVICE_URL: str =Field(validation_alias="CORE_NOTIFICATIONS_BASE_URL")

    @property
    def get_notification_emit_url(self) -> str:
        """Get the notification emit URL."""
        return f"{self.NOTIFICATION_SERVICE_URL}/notifications/emit"

    # ------------------------------------------------
    # MSDP SMS CONFIGURATION (Mobile Seva - Government of India)
    # ------------------------------------------------

    MSDP_USERNAME: str = ""
    MSDP_PASSWORD: str = ""
    MSDP_SENDER_ID: str = ""  # 6 characters, uppercase, alphabets only
    MSDP_SECURE_KEY: str = ""  # Secure key from MSDP portal
    MSDP_TEMPLATE_ID: str = ""  # DLT Template ID (12-19 digits) - MANDATORY since Jan 2021
    MSDP_API_URL: str = "https://msdgweb.mgov.gov.in/esms/sendsmsrequestDLT"  # DLT-compliant endpoint
    OTP_EXPIRY_MINUTES: int = 5

    # ------------------------------------------------
    # CDR SOFTWARES 3RD PARTY API CONFIGURATION
    # ------------------------------------------------
    CDR_API_BASE_URL: str = "https://api.cdrsoftwares.com"
    CDR_API_CLIENT_ID: str = ""  # client_api_id from CDR Softwares
    CDR_API_TOKEN: str = ""  # api_token from CDR Softwares


# ------------------------------------------------
# INSTANCE (must be at bottom)
# ------------------------------------------------
settings = Settings()
