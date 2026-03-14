from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import timedelta
from typing import Optional, Tuple
import secrets
import hashlib
import uuid
from app.core.config import settings
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.utils.time_utils import get_ist_now

# Password hashing context using BCrypt
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """
    Hash a password using BCrypt

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against a hashed password

    Args:
        plain_password: Plain text password
        hashed_password: Hashed password to verify against

    Returns:
        True if password matches, False otherwise
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token

    Args:
        data: Data to encode in the token
        expires_delta: Optional expiration time delta

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()

    if expires_delta:
        expire = get_ist_now() + expires_delta
    else:
        expire = get_ist_now() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    return encoded_jwt


def decode_access_token(token: str) -> Optional[TokenDataSchema]:
    """
    Decode and verify a JWT access token

    Args:
        token: JWT token string

    Returns:
        TokenDataSchema if valid, None otherwise
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")

        if user_id is None:
            return None

        # Extract all fields from the token payload
        raw_user_id = payload.get("userId")
        return TokenDataSchema(
            userId=str(raw_user_id) if raw_user_id is not None else None,
            id=payload.get("id"),
            fullName=payload.get("fullName"),
            unitId=payload.get("unitId"),
            unitName=payload.get("unitName"),
            roleId=payload.get("roleId"),
            roleName=payload.get("roleName"),
            districtId=payload.get("districtId"),
            districtName=payload.get("districtName"),
            units=payload.get("units", [])
        )
    except JWTError:
        return None


# =========================================================================
# Refresh Token Functions
# =========================================================================

def generate_refresh_token() -> Tuple[str, str]:
    """
    Generate a secure refresh token and its hash.

    Returns:
        Tuple of (plain_token, hashed_token)
        - plain_token: The token to send to client
        - hashed_token: The token hash to store in database
    """
    # Generate a cryptographically secure random token
    plain_token = secrets.token_urlsafe(64)

    # Hash the token for storage (never store plain tokens)
    hashed_token = hash_token(plain_token)

    return plain_token, hashed_token


def hash_token(token: str) -> str:
    """
    Hash a token using SHA-256 for secure storage.

    Args:
        token: Plain token string

    Returns:
        SHA-256 hash of the token
    """
    return hashlib.sha256(token.encode()).hexdigest()


def generate_family_id() -> str:
    """
    Generate a unique family ID for token rotation tracking.

    Token families allow detection of refresh token reuse attacks.
    When a token is rotated, the new token inherits the family ID.
    If an old token from the same family is used, it indicates theft.

    Returns:
        UUID string for the token family
    """
    return str(uuid.uuid4())


def create_refresh_token_jwt(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT-based refresh token with embedded claims.

    Args:
        data: Data to encode (should include personnelId, familyId)
        expires_delta: Optional expiration time delta

    Returns:
        Encoded JWT refresh token
    """
    to_encode = data.copy()

    if expires_delta:
        expire = get_ist_now() + expires_delta
    else:
        expire = get_ist_now() + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode.update({
        "exp": expire,
        "type": "refresh"  # Mark as refresh token
    })

    # Use separate secret for refresh tokens if configured, otherwise use main secret
    secret_key = settings.JWT_REFRESH_SECRET_KEY or settings.JWT_SECRET_KEY
    encoded_jwt = jwt.encode(to_encode, secret_key, algorithm=settings.JWT_ALGORITHM)

    return encoded_jwt


def decode_refresh_token(token: str) -> Optional[dict]:
    """
    Decode and verify a JWT refresh token.

    Args:
        token: JWT refresh token string

    Returns:
        Token payload dict if valid, None otherwise
    """
    try:
        secret_key = settings.JWT_REFRESH_SECRET_KEY or settings.JWT_SECRET_KEY
        payload = jwt.decode(token, secret_key, algorithms=[settings.JWT_ALGORITHM])

        # Verify it's a refresh token
        if payload.get("type") != "refresh":
            return None

        return payload
    except JWTError:
        return None


def verify_refresh_token_hash(plain_token: str, hashed_token: str) -> bool:
    """
    Verify a plain refresh token against its stored hash.

    Args:
        plain_token: Plain token from client
        hashed_token: Hashed token from database

    Returns:
        True if tokens match, False otherwise
    """
    return hash_token(plain_token) == hashed_token