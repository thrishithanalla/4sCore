"""
MSDP (Mobile Seva) SMS Service Utility
Provides functions for sending SMS messages via MSDP API (Government of India)
API Documentation: https://mgov.gov.in/msdp_sms_push.jsp
"""
import hashlib
import logging
import random
import httpx
from typing import Optional, Tuple
from app.core.config import settings

logger = logging.getLogger(__name__)

# MSDP API Response Codes
MSDP_RESPONSE_CODES = {
    "401": "Credentials error - invalid username or password",
    "402": "Messages submitted successfully",
    "403": "Credits not available",
    "404": "Internal database error",
    "405": "Internal networking error",
    "406": "Invalid or duplicate numbers",
    "407": "Network error on SMSC",
    "408": "Network error on SMSC",
    "409": "SMSC response timed out, message will be submitted",
    "410": "Internal limit exceeded - contact support",
    "411": "Sender ID not approved",
    "412": "Sender ID not approved",
    "413": "Suspect spam - message rejected",
    "414": "Rejected by operator (DND, SPAM, etc.)",
    "415": "Secure key not available",
    "416": "Hash doesn't match",
    "418": "Daily limit exceeded",
}


def generate_otp(length: int = 6) -> str:
    """
    Generate a random numeric OTP of specified length.

    Args:
        length: Number of digits in OTP (default: 6)

    Returns:
        String OTP of specified length
    """
    return ''.join([str(random.randint(0, 9)) for _ in range(length)])


def _encrypt_password(password: str) -> str:
    """
    Encrypt password using SHA-1 as required by MSDP API.

    Args:
        password: Plain text password

    Returns:
        SHA-1 encrypted password in hexadecimal format
    """
    return hashlib.sha1(password.encode('iso-8859-1')).hexdigest()


def _generate_hash(username: str, sender_id: str, message: str, secure_key: str) -> str:
    """
    Generate SHA-512 hash for MSDP API authentication.

    Hash is generated from concatenation of: username + senderid + message + securekey

    Args:
        username: MSDP username
        sender_id: Sender ID (6 characters, uppercase)
        message: SMS message content
        secure_key: Department secure key from MSDP portal

    Returns:
        SHA-512 hash in hexadecimal format
    """
    hash_string = f"{username.strip()}{sender_id.strip()}{message.strip()}{secure_key.strip()}"
    return hashlib.sha512(hash_string.encode('utf-8')).hexdigest()


def _format_mobile_number(phone_number: str) -> str:
    """
    Format phone number for MSDP API.

    MSDP accepts 10-digit or 12-digit (with 91 prefix) mobile numbers.
    Converts E.164 format (+919876543210) to MSDP format (9876543210 or 919876543210).

    Args:
        phone_number: Phone number in E.164 format (e.g., +919876543210)

    Returns:
        Formatted phone number for MSDP (10 or 12 digits)
    """
    # Remove any spaces or hyphens
    phone = phone_number.replace(" ", "").replace("-", "")

    # Remove + prefix if present
    if phone.startswith("+"):
        phone = phone[1:]

    # If starts with 91 and is 12 digits, keep as is or strip to 10 digits
    if phone.startswith("91") and len(phone) == 12:
        # Return 10-digit format (without country code)
        return phone[2:]

    # If already 10 digits, return as is
    if len(phone) == 10:
        return phone

    return phone


def _parse_response(response_text: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Parse MSDP API response.

    Response format: "402,MsgID = 150620161466003974245msdgsms" for success
    Response format: "401" for errors

    Args:
        response_text: Raw response from MSDP API

    Returns:
        Tuple of (success: bool, message_id: Optional[str], error: Optional[str])
    """
    response_text = response_text.strip()

    # Check if response is HTML error page (API returned error page)
    if response_text.startswith("<!DOCTYPE") or response_text.startswith("<html") or "<html>" in response_text.lower():
        logger.error(f"MSDP API returned HTML error page instead of expected response")
        return False, None, "API endpoint error - received HTML response instead of SMS status"

    # Split by comma to get response code
    parts = response_text.split(",", 1)
    response_code = parts[0].strip()

    if response_code == "402":
        # Success - extract message ID if available
        message_id = None
        if len(parts) > 1:
            # Extract MsgID from "MsgID = xxxxx" or just the ID
            msg_part = parts[1].strip()
            if "=" in msg_part:
                message_id = msg_part.split("=", 1)[1].strip()
            else:
                message_id = msg_part
        return True, message_id, None

    # Error case
    error_message = MSDP_RESPONSE_CODES.get(response_code, f"Unknown error (code: {response_code})")
    return False, None, error_message


def send_sms(phone_number: str, message: str, sms_service_type: str = "singlemsg") -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Send an SMS message via MSDP API.

    Args:
        phone_number: Recipient phone number in E.164 format (e.g., +919876543210)
        message: SMS message content
        sms_service_type: Type of SMS service (singlemsg, bulkmsg, otpmsg, unicodemsg)

    Returns:
        Tuple of (success: bool, message_id: Optional[str], error: Optional[str])
    """
    try:
        # Check if MSDP is configured (including mandatory DLT Template ID)
        if not all([
            settings.MSDP_USERNAME,
            settings.MSDP_PASSWORD,
            settings.MSDP_SENDER_ID,
            settings.MSDP_SECURE_KEY,
            settings.MSDP_TEMPLATE_ID
        ]):
            logger.error("MSDP SMS configuration is missing (check USERNAME, PASSWORD, SENDER_ID, SECURE_KEY, TEMPLATE_ID)")
            return False, None, "MSDP SMS configuration is missing"

        # Prepare parameters
        username = settings.MSDP_USERNAME.strip()
        encrypted_password = _encrypt_password(settings.MSDP_PASSWORD)
        sender_id = settings.MSDP_SENDER_ID.strip().upper()
        secure_key = settings.MSDP_SECURE_KEY.strip()
        formatted_mobile = _format_mobile_number(phone_number)
        message_content = message.strip()

        # Generate hash
        hash_key = _generate_hash(username, sender_id, message_content, secure_key)

        # Prepare request payload (DLT-compliant with templateid)
        payload = {
            "username": username,
            "password": encrypted_password,
            "senderid": sender_id,
            "content": message_content,
            "smsservicetype": sms_service_type,
            "mobileno": formatted_mobile,
            "key": hash_key,
            "templateid": settings.MSDP_TEMPLATE_ID.strip()
        }

        # Log request details for debugging
        logger.debug(f"MSDP API Request - URL: {settings.MSDP_API_URL}")
        logger.debug(f"MSDP API Request - Mobile: {formatted_mobile}, ServiceType: {sms_service_type}")

        # Make API request with TLS 1.2
        with httpx.Client(verify=True, timeout=30.0) as client:
            response = client.post(
                settings.MSDP_API_URL,
                data=payload,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/4.0 (compatible; MSIE 5.0; Windows 98; DigExt)"
                }
            )
            response_text = response.text

        # Log response status and content
        logger.info(f"MSDP API Response - Status: {response.status_code}, Mobile: {formatted_mobile}")
        logger.debug(f"MSDP API Response Body: {response_text[:500] if response_text else 'Empty'}")

        # Parse response
        success, message_id, error = _parse_response(response_text)

        if success:
            logger.info(f"SMS sent successfully to {formatted_mobile}, MsgID: {message_id}")
        else:
            logger.error(f"Failed to send SMS to {formatted_mobile}: {error}")

        return success, message_id, error

    except httpx.TimeoutException:
        logger.error(f"Timeout sending SMS to {phone_number}")
        return False, None, "Request timeout - please try again"
    except httpx.RequestError as e:
        logger.error(f"Network error sending SMS to {phone_number}: {str(e)}")
        return False, None, f"Network error: {str(e)}"
    except Exception as e:
        logger.exception(f"Error sending SMS to {phone_number}")
        return False, None, str(e)


def send_otp_sms(phone_number: str, otp: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Send an OTP SMS message via MSDP API.

    Uses 'otpmsg' service type which is specifically designed for OTP messages
    and has higher delivery priority.

    Args:
        phone_number: Recipient phone number in E.164 format (e.g., +919876543210)
        otp: The OTP code to send

    Returns:
        Tuple of (success: bool, message_id: Optional[str], error: Optional[str])
    """
    # Message must match DLT registered template exactly: MPIN_AI4Andhra Police
    # Include environment with OTP in the {#var#} placeholder (e.g., "DEV 123456")
    otp_with_env = f"{settings.ENVIRONMENT} {otp}" if settings.ENVIRONMENT else otp
    message = f"Dear User, {otp_with_env} is the OTP to setup the MPIN for AI4Andhra Police App. This OTP is valid for 5 minutes. Never share it with anyone."
    return send_sms(phone_number, message, sms_service_type="otpmsg")


def send_bulk_sms(phone_numbers: list, message: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Send bulk SMS messages via MSDP API.

    Args:
        phone_numbers: List of recipient phone numbers in E.164 format
        message: SMS message content

    Returns:
        Tuple of (success: bool, message_id: Optional[str], error: Optional[str])
    """
    try:
        # Check if MSDP is configured (including mandatory DLT Template ID)
        if not all([
            settings.MSDP_USERNAME,
            settings.MSDP_PASSWORD,
            settings.MSDP_SENDER_ID,
            settings.MSDP_SECURE_KEY,
            settings.MSDP_TEMPLATE_ID
        ]):
            logger.error("MSDP SMS configuration is missing (check USERNAME, PASSWORD, SENDER_ID, SECURE_KEY, TEMPLATE_ID)")
            return False, None, "MSDP SMS configuration is missing"

        # Prepare parameters
        username = settings.MSDP_USERNAME.strip()
        encrypted_password = _encrypt_password(settings.MSDP_PASSWORD)
        sender_id = settings.MSDP_SENDER_ID.strip().upper()
        secure_key = settings.MSDP_SECURE_KEY.strip()
        message_content = message.strip()

        # Format mobile numbers and join with comma
        formatted_mobiles = ",".join([_format_mobile_number(num) for num in phone_numbers])

        # Generate hash
        hash_key = _generate_hash(username, sender_id, message_content, secure_key)

        # Prepare request payload for bulk SMS (DLT-compliant with templateid)
        payload = {
            "username": username,
            "password": encrypted_password,
            "senderid": sender_id,
            "content": message_content,
            "smsservicetype": "bulkmsg",
            "bulkmobno": formatted_mobiles,
            "key": hash_key,
            "templateid": settings.MSDP_TEMPLATE_ID.strip()
        }

        # Make API request
        with httpx.Client(verify=True, timeout=30.0) as client:
            response = client.post(
                settings.MSDP_API_URL,
                data=payload,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": "Mozilla/4.0 (compatible; MSIE 5.0; Windows 98; DigExt)"
                }
            )
            response_text = response.text

        logger.info(f"MSDP Bulk SMS API response: {response_text}")

        # Parse response
        success, message_id, error = _parse_response(response_text)

        if success:
            logger.info(f"Bulk SMS sent successfully to {len(phone_numbers)} numbers, MsgID: {message_id}")
        else:
            logger.error(f"Failed to send bulk SMS: {error}")

        return success, message_id, error

    except Exception as e:
        logger.exception(f"Error sending bulk SMS")
        return False, None, str(e)
