"""
Phone number validation utilities for Indian phone numbers
"""
import re
from typing import Optional


def validate_indian_phone(phone, field_name: str = "phone") -> Optional[str]:
    """
    Validate and normalize Indian phone number format.

    Accepts:
    - +91XXXXXXXXXX (13 characters: +91 + 10 digits)
    - 91XXXXXXXXXX (12 characters: 91 + 10 digits)
    - XXXXXXXXXX (10 digits)
    - Numeric values (Int64, int) are converted to string

    Returns:
    - Normalized phone number in +91XXXXXXXXXX format
    - None if phone is None or empty

    Raises:
    - ValueError: If phone number format is invalid
    """
    if phone is None or phone == "":
        return None

    # Convert numeric types to string (handles Int64 from MongoDB)
    if isinstance(phone, (int, float)):
        phone = str(int(phone))
    else:
        phone = str(phone)

    # Remove any whitespace
    phone = phone.strip()
    
    # Remove any spaces, dashes, or parentheses
    phone = re.sub(r'[\s\-\(\)]', '', phone)

    # Check length first to avoid false positives with startswith checks
    # A 10-digit number starting with 9 (like 9876543210) should NOT match the 91 prefix check

    # Check if it's exactly 10 digits (most common case)
    if len(phone) == 10 and phone.isdigit():
        # Validate first digit (should be 6-9 for mobile numbers)
        if phone[0] not in ['6', '7', '8', '9']:
            raise ValueError(f"Invalid {field_name} format. Indian mobile numbers must start with 6, 7, 8, or 9")
        return f"+91{phone}"  # Normalize to +91 format

    # Check if it starts with +91 (13 characters total)
    elif phone.startswith('+91') and len(phone) == 13:
        digits = phone[3:]  # Get digits after +91
        if not digits.isdigit():
            raise ValueError(f"Invalid {field_name} format. +91 format must have exactly 10 digits after +91")
        # Validate first digit (should be 6-9 for mobile numbers)
        if digits[0] not in ['6', '7', '8', '9']:
            raise ValueError(f"Invalid {field_name} format. Indian mobile numbers must start with 6, 7, 8, or 9")
        return phone  # Already in correct format

    # Check if it starts with 91 (12 characters total)
    elif phone.startswith('91') and len(phone) == 12:
        digits = phone[2:]  # Get digits after 91
        if not digits.isdigit():
            raise ValueError(f"Invalid {field_name} format. 91 format must have exactly 10 digits after 91")
        # Validate first digit (should be 6-9 for mobile numbers)
        if digits[0] not in ['6', '7', '8', '9']:
            raise ValueError(f"Invalid {field_name} format. Indian mobile numbers must start with 6, 7, 8, or 9")
        return f"+91{digits}"  # Normalize to +91 format

    else:
        raise ValueError(f"Invalid {field_name} format. Must be Indian phone number: +91XXXXXXXXXX, 91XXXXXXXXXX, or XXXXXXXXXX (10 digits)")


def validate_indian_phone_list(phones: Optional[list], field_name: str = "phone") -> Optional[list]:
    """
    Validate and normalize a list of Indian phone numbers.

    Args:
        phones: List of phone number strings or numbers
        field_name: Name of the field for error messages

    Returns:
        List of normalized phone numbers in +91XXXXXXXXXX format
        None if phones is None or empty

    Raises:
        ValueError: If any phone number format is invalid
    """
    if phones is None or len(phones) == 0:
        return None

    normalized_phones = []
    for i, phone in enumerate(phones):
        if phone is None or phone == "":
            continue  # Skip empty entries
        try:
            normalized = validate_indian_phone(phone, f"{field_name}[{i}]")
            if normalized:
                normalized_phones.append(normalized)
        except ValueError as e:
            raise ValueError(str(e))
    
    return normalized_phones if normalized_phones else None

