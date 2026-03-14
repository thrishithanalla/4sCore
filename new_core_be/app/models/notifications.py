from motor.motor_asyncio import AsyncIOMotorDatabase

COLL_MASTERS = "notification_master"
COLL_NOTIFS = "notifications"
COLL_ARCHIVE = "notificationsArchive"

async def ensure_notification_indexes(db: AsyncIOMotorDatabase) -> None:
    # Masters
    await db[COLL_MASTERS].create_index("notificationType", unique=True)
    await db[COLL_MASTERS].create_index("active")
    await db[COLL_MASTERS].create_index("isDeleted")
    # Notifications
    await db[COLL_NOTIFS].create_index("contactId")
    await db[COLL_NOTIFS].create_index("notificationId")
    await db[COLL_NOTIFS].create_index("notificationType")
    await db[COLL_NOTIFS].create_index([("status", 1), ("proposedTime", 1)])
    await db[COLL_NOTIFS].create_index("deliveryChannel")
    await db[COLL_NOTIFS].create_index("sentAt")
    await db[COLL_NOTIFS].create_index("deliveredAt")
    await db[COLL_NOTIFS].create_index("requestId")
    await db[COLL_NOTIFS].create_index("isDeleted")
