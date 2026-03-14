from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.utils.security import decode_access_token
from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.utils.error_messages import get_auth_message

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenDataSchema:
    """
    Dependency to get the current authenticated user from JWT token

    Args:
        credentials: HTTP authorization credentials

    Returns:
        TokenDataSchema with user information

    Raises:
        HTTPException: If token is invalid or expired
    """
    token = credentials.credentials
    token_data = decode_access_token(token)

    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=get_auth_message("token_invalid"),
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token_data