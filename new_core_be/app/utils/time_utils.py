from datetime import datetime, timedelta, time, timezone
from dateutil import tz
from app.core.config import settings

TZ = tz.gettz(settings.TIMEZONE)

# IST offset: UTC + 5:30
IST_OFFSET = timezone(timedelta(hours=5, minutes=30))


def get_ist_now() -> datetime:
    """
    Returns current datetime in IST (UTC + 5:30) as a naive datetime.
    This ensures consistent IST timestamps regardless of server location.

    Note: Returns naive datetime (without timezone info) because MongoDB
    stores all datetimes in UTC. By returning a naive datetime that's already
    in IST, we ensure the stored value represents IST time.
    """
    # Get current UTC time and add IST offset (5 hours 30 minutes)
    utc_now = datetime.utcnow()
    ist_time = utc_now + timedelta(hours=5, minutes=30)
    return ist_time


def now_local():
    return datetime.now(tz=TZ)

def to_local(dt: datetime):
    return dt.astimezone(TZ) if dt.tzinfo else dt.replace(tzinfo=TZ)

def calculate_proposed_time(contact_times: dict | None, priority: str):
    # If HIGH priority, bypass window
    if priority == "HIGH":
        return now_local()

    # Default immediate when no prefs
    if not contact_times or not contact_times.get("frequencyType"):
        return now_local()

    ft = contact_times["frequencyType"]
    current = now_local()

    if ft == "IMMEDIATE":
        return current
    if ft == "HOURLY":
        return current.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    if ft == "CUSTOM_INTERVAL":
        minutes = int(contact_times.get("minutes", 30))
        return current + timedelta(minutes=minutes)
    if ft == "DAILY":
        hh, mm = contact_times.get("hour", 9), contact_times.get("minute", 0)
        candidate = current.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidate < current:
            candidate += timedelta(days=1)
        return candidate
    if ft == "WEEKLY":
        # days: list of ints 0=Mon ... 6=Sun
        days = contact_times.get("days", [0])
        hh, mm = contact_times.get("hour", 9), contact_times.get("minute", 0)
        for i in range(8):
            d = (current.weekday() + i) % 7
            if d in days:
                candidate = (current + timedelta(days=i)).replace(hour=hh, minute=mm, second=0, microsecond=0)
                if candidate >= current:
                    return candidate
        return current + timedelta(days=7)
    return current
