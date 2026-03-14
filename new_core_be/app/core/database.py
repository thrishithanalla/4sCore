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
    Create indexes for optimized query performance
    """
    try:
        # Indexes for logs collection
        logs_collection = db.database[Collections.LOGS]

        # Index for sorting by createdAt (most common sort operation)
        await logs_collection.create_index(
            [("createdAt", pymongo.DESCENDING)],
            name="idx_createdAt_desc",
            background=True
        )

        # Compound index for common filters + sort
        await logs_collection.create_index(
            [("level", pymongo.ASCENDING), ("createdAt", pymongo.DESCENDING)],
            name="idx_level_createdAt",
            background=True
        )

        await logs_collection.create_index(
            [("layer", pymongo.ASCENDING), ("createdAt", pymongo.DESCENDING)],
            name="idx_layer_createdAt",
            background=True
        )

        await logs_collection.create_index(
            [("templateId", pymongo.ASCENDING), ("createdAt", pymongo.DESCENDING)],
            name="idx_templateId_createdAt",
            background=True
        )

        # Index for actorId filter
        await logs_collection.create_index(
            [("actorId", pymongo.ASCENDING)],
            name="idx_actorId",
            background=True
        )

        # Indexes for log_master collection
        log_master_collection = db.database[Collections.LOG_MASTER]

        await log_master_collection.create_index(
            [("name", pymongo.ASCENDING)],
            name="idx_name",
            background=True
        )

        await log_master_collection.create_index(
            [("moduleId", pymongo.ASCENDING), ("isDelete", pymongo.ASCENDING)],
            name="idx_moduleId_isDelete",
            background=True
        )

        log_database_operation("create_indexes", "system", success=True)
    except Exception as e:
        log_database_operation("create_indexes", "system", success=False, error_message=str(e))


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
