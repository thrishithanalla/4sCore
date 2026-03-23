"""
Enumeration types for the audit log service.
Contains all enum definitions used across schemas.
"""
from enum import Enum


class LayerEnum(str, Enum):
    """Enum for log layer types"""
    SCREEN = "screen"
    FUNCTION = "function"
    API = "api"
    CONFIG = "config"


class LevelEnum(str, Enum):
    """Enum for log level types"""
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class TimelineEnum(str, Enum):
    """Enum for dashboard timeline filter options"""
    LAST_HOUR = "lastHour"
    LAST_24_HOURS = "last24Hours"
    LAST_7_DAYS = "last7Days"
    LAST_30_DAYS = "last30Days"


class ParameterDatatypeEnum(str, Enum):
    """Enum for parameter datatype options in audit log master parameters"""
    STRING   = "string"
    NUMBER   = "number"
    BOOLEAN  = "boolean"
    DATE     = "date"
    DATETIME = "datetime"
    ARRAY    = "array"
    OBJECT   = "object"
