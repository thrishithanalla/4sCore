"""
Twilio SMS Service Utility
Provides functions for sending SMS messages via Twilio API
"""
import logging
import random
from typing import Optional, Tuple
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from app.core.config import settings

logger = logging.getLogger(__name__)


def generate_otp(length: int = 6) -> str:
    """
    Generate a random numeric OTP of specified length.

    Args:
        length: Number of digits in OTP (default: 6)

    Returns:
        String OTP of specified length
    """
    return ''.join([str(random.randint(0, 9)) for _ in range(length)])


def send_sms(phone_number: str, message: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Send an SMS message via Twilio.

    Args:
        phone_number: Recipient phone number in E.164 format (e.g., +919876543210)
        message: SMS message content

    Returns:
        Tuple of (success: bool, message_sid: Optional[str], error: Optional[str])
    """
    try:
        # Check if Twilio is configured
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not settings.TWILIO_SMS_FROM:
            logger.error("Twilio configuration is missing")
            return False, None, "Twilio configuration is missing"

        # Initialize Twilio client
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

        # Send SMS
        twilio_message = client.messages.create(
            body=message,
            from_=settings.TWILIO_SMS_FROM,
            to=phone_number
        )

        logger.info(f"SMS sent successfully to {phone_number}, SID: {twilio_message.sid}")
        return True, twilio_message.sid, None

    except TwilioRestException as e:
        logger.error(f"Twilio error sending SMS to {phone_number}: {str(e)}")
        return False, None, str(e)
    except Exception as e:
        logger.exception(f"Error sending SMS to {phone_number}")
        return False, None, str(e)


def send_otp_sms(phone_number: str, otp: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Send an OTP SMS message via Twilio.

    Args:
        phone_number: Recipient phone number in E.164 format
        otp: The OTP code to send

    Returns:
        Tuple of (success: bool, message_sid: Optional[str], error: Optional[str])
    """
    message = f"Your OTP for MPIN setup is: {otp}. This OTP is valid for {settings.OTP_EXPIRY_MINUTES} minutes. Do not share this with anyone."
    return send_sms(phone_number, message)
