"""
Test Execution Repository
Handles all database operations for the test_execution collection.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.api.v1.repositories.base_repository import BaseRepository
from app.constants.collections import Collections


class TestExecutionRepository(BaseRepository):
    """Repository class for test execution CRUD operations"""

    OBJECTID_FIELDS = ["testMasterId", "executedBy", "createdBy", "updatedBy"]

    def __init__(self, db: AsyncIOMotorDatabase = None):
        super().__init__(Collections.TEST_EXECUTION, db)

    async def create(self, data: dict) -> dict:
        """Create a new test execution"""
        return await super().create(data, self.OBJECTID_FIELDS)

    async def find_by_id(self, id: str, include_deleted: bool = False) -> Optional[dict]:
        """Find test execution by ID"""
        return await super().find_by_id(id, include_deleted, self.OBJECTID_FIELDS)

    async def find_by_test_master(self, test_master_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all executions for a test master"""
        query = {"testMasterId": ObjectId(test_master_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_executor(self, executor_id: str, include_deleted: bool = False) -> List[dict]:
        """Find all executions by an executor"""
        query = {"executedBy": ObjectId(executor_id)}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_by_status(self, status: str, include_deleted: bool = False) -> List[dict]:
        """Find all executions by status"""
        query = {"status": status}
        if not include_deleted:
            query["isDelete"] = False
        docs, _ = await super().find_all(query, objectid_fields=self.OBJECTID_FIELDS)
        return docs

    async def find_all(
        self,
        query: dict = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        sort_field: str = "createdAt",
        sort_order: int = -1
    ) -> tuple[List[dict], int]:
        """Find all test executions with pagination"""
        return await super().find_all(query, page, page_size, sort_field, sort_order, self.OBJECTID_FIELDS)

    async def update(self, id: str, update_data: dict) -> Optional[dict]:
        """Update a test execution"""
        return await super().update(id, update_data, self.OBJECTID_FIELDS)

    async def get_all_active(self) -> List[dict]:
        """Get all non-deleted test executions"""
        docs, _ = await self.find_all({"isDelete": False})
        return docs

    async def get_stats_by_status(self, match_query: dict = None) -> Dict[str, int]:
        """Get execution counts grouped by status"""
        pipeline = []
        if match_query:
            pipeline.append({"$match": match_query})
        pipeline.append({
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }
        })

        results = await self.aggregate(pipeline)
        return {r["_id"]: r["count"] for r in results}

    async def get_stats_by_result(self, match_query: dict = None) -> Dict[str, int]:
        """Get execution counts grouped by result (pass/fail)"""
        pipeline = []
        if match_query:
            pipeline.append({"$match": match_query})
        pipeline.append({
            "$group": {
                "_id": "$result",
                "count": {"$sum": 1}
            }
        })

        results = await self.aggregate(pipeline)
        return {r["_id"]: r["count"] for r in results}

    async def get_latest_execution(self, test_master_id: str) -> Optional[dict]:
        """Get the latest execution for a test master"""
        query = {"testMasterId": ObjectId(test_master_id), "isDelete": False}
        docs, _ = await super().find_all(
            query,
            page=1,
            page_size=1,
            sort_field="createdAt",
            sort_order=-1,
            objectid_fields=self.OBJECTID_FIELDS
        )
        return docs[0] if docs else None
