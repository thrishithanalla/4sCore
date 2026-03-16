from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import settings
from app.core.constants import Collections
from app.core.logger import logger, log_database_operation
from typing import Optional
import pymongo



class Database:
    """
    MongoDB database connection manager
    """
    client: Optional[AsyncIOMotorClient] = None
    database: Optional[AsyncIOMotorDatabase] = None


db = Database()

async def create_indexes():
    """
    Create indexes for optimized query performance.
    Skips indexes that already exist with different names.
    """
    indexes = [
        (Collections.LOGS, [("EventTimeStamp", pymongo.DESCENDING)]),
        (Collections.LOGS, [("entityType", pymongo.ASCENDING)]),
        (Collections.LOGS, [("eventcode", pymongo.ASCENDING)]),
        (Collections.LOGS, [("actorId", pymongo.ASCENDING)]),
        (Collections.LOGS, [("EventTimeStamp", pymongo.DESCENDING), ("entityType", pymongo.ASCENDING)]),
        (Collections.LOG_MASTER, [("eventCode", pymongo.ASCENDING)]),
        (Collections.LOG_MASTER, [("isDelete", pymongo.ASCENDING)]),
        (Collections.LOG_MASTER, [("name", pymongo.ASCENDING)]),
    ]
    created = 0
    for collection_name, keys in indexes:
        try:
            await db.database[collection_name].create_index(keys, background=True)
            created += 1
        except Exception:
            pass  # Index already exists (possibly with different name)
    print(f"[OK] Indexes: {created}/{len(indexes)} created/verified")
    log_database_operation("create_indexes", "system", success=True)


async def connect_to_mongodb():
    """
    Connect to MongoDB database
    """
    db.client = AsyncIOMotorClient(settings.MONGODB_URI)
    db.database = db.client[settings.MONGODB_DB]

    # Verify connection by pinging the database
    await db.client.admin.command("ping")
    print(f"[OK] Connected to MongoDB: {settings.MONGODB_DB}")


async def close_mongodb_connection():
    """Close MongoDB database connection"""
    if db.client:
        db.client.close()
        print("[CLOSED] Closed MongoDB connection")


def get_database() -> AsyncIOMotorDatabase:
    """Get database instance"""
    return db.database
