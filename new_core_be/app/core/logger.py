"""
Structured logging configuration for Audit Log Service.

This module provides a centralized logging setup with structured output
and IST (Indian Standard Time) timestamps for consistency across the service.
"""

import logging
import sys
from datetime import datetime, timezone, timedelta
from typing import Optional


# IST Timezone (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))


class ISTFormatter(logging.Formatter):
    """
    Custom formatter that uses IST (Indian Standard Time) for timestamps.

    Attributes:
        converter: Custom time converter function for IST timezone.
    """

    def converter(self, timestamp: float) -> datetime:
        """
        Convert timestamp to IST datetime.

        Args:
            timestamp: Unix timestamp to convert.

        Returns:
            datetime: Datetime object in IST timezone.
        """
        return datetime.fromtimestamp(timestamp, tz=IST)

    def formatTime(self, record: logging.LogRecord, datefmt: Optional[str] = None) -> str:
        """
        Format the time for the log record in IST.

        Args:
            record: The log record containing timestamp information.
            datefmt: Optional date format string.

        Returns:
            str: Formatted timestamp string in IST.
        """
        ct = self.converter(record.created)
        if datefmt:
            return ct.strftime(datefmt)
        return ct.strftime("%Y-%m-%d %H:%M:%S,%f")[:-3] + " IST"


def get_logger(name: str = "audit_log_service") -> logging.Logger:
    """
    Get or create a logger with structured formatting.

    Creates a logger with IST timestamps and consistent formatting
    suitable for both development and production environments.

    Args:
        name: Name of the logger instance. Defaults to 'audit_log_service'.

    Returns:
        logging.Logger: Configured logger instance.

    Example:
        >>> logger = get_logger(__name__)
        >>> logger.info("Log entry created successfully", extra={"log_id": "123"})
    """
    logger = logging.getLogger(name)

    if not logger.handlers:
        logger.setLevel(logging.INFO)

        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.INFO)

        formatter = ISTFormatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)

        logger.addHandler(handler)
        logger.propagate = False

    return logger


# Default logger instance for the service
logger = get_logger()


def log_request(
    method: str,
    path: str,
    status_code: int,
    duration_ms: float,
    user_id: Optional[str] = None,
    client_ip: Optional[str] = None
) -> None:
    """
    Log HTTP request details in a structured format.

    Args:
        method: HTTP method (GET, POST, etc.).
        path: Request path.
        status_code: HTTP response status code.
        duration_ms: Request duration in milliseconds.
        user_id: Optional authenticated user ID.
        client_ip: Optional client IP address.

    Example:
        >>> log_request("POST", "/api/v1/logs/create", 201, 150.5, "user123", "192.168.1.1")
    """
    log_message = f"{method} {path} | Status: {status_code} | Duration: {duration_ms:.2f}ms"
    if user_id:
        log_message += f" | User: {user_id}"
    if client_ip:
        log_message += f" | IP: {client_ip}"

    if status_code >= 500:
        logger.error(log_message)
    elif status_code >= 400:
        logger.warning(log_message)
    else:
        logger.info(log_message)


def log_database_operation(
    operation: str,
    collection: str,
    document_id: Optional[str] = None,
    success: bool = True,
    error_message: Optional[str] = None
) -> None:
    """
    Log database operation details.

    Args:
        operation: Type of operation (insert, update, delete, find).
        collection: MongoDB collection name.
        document_id: Optional document ID involved in operation.
        success: Whether the operation succeeded.
        error_message: Optional error message if operation failed.

    Example:
        >>> log_database_operation("insert", "logs", "abc123", success=True)
    """
    log_message = f"DB {operation.upper()} on {collection}"
    if document_id:
        log_message += f" | ID: {document_id}"

    if success:
        logger.info(log_message + " | Status: SUCCESS")
    else:
        logger.error(log_message + f" | Status: FAILED | Error: {error_message}")
