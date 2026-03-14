"""
Log Transaction Service
Business logic layer for log transaction operations.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi import HTTPException, status

from app.core.database import get_database
from app.core.constants import Collections
from app.api.v1.repositories.log_transaction_repository import LogTransactionRepository
from app.api.v1.repositories.log_master_repository import LogMasterRepository
from app.utils.response_helpers import error_response
from app.utils.time_utils import get_ist_now


class LogTransactionService:
    """Service class for log transaction business logic"""

    def __init__(self):
        self.repository = LogTransactionRepository()
        self.log_master_repository = LogMasterRepository()
        self.db = get_database()

    @staticmethod
    def generate_message_from_template(template: str, json_values: dict) -> str:
        """
        Generate message by replacing placeholders in template with json values.

        Args:
            template: Template string with placeholders
            json_values: Dict with values to replace placeholders

        Returns:
            Generated message with placeholders replaced
        """
        try:
            return template.format(**json_values)
        except KeyError:
            result = template
            for key, value in json_values.items():
                result = result.replace(f"{{{key}}}", str(value))
            return result

    async def validate_log_code(self, log_code: str) -> dict:
        """
        Validate that log code exists in log master.

        Args:
            log_code: Log code (log master name)

        Returns:
            Log master document

        Raises:
            HTTPException: If log code not found
        """
        if not log_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    message="logCode is required",
                    status_code=400,
                    error_code="ERR.CORE.VALIDATION.REQUIRED"
                )
            )

        template_doc = await self.log_master_repository.find_by_name(log_code)

        if not template_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    message=f"logCode '{log_code}' not found in logMaster",
                    status_code=404,
                    error_code="ERR.CORE.LOG_CODE.NOT_FOUND"
                )
            )

        return template_doc

    async def create(
        self,
        log_data: Dict[str, Any],
        actor_id: str,
        created_ip: str
    ) -> dict:
        """
        Create a new log transaction.

        Args:
            log_data: Log transaction data
            actor_id: User ID creating the log
            created_ip: Client IP address

        Returns:
            Created log transaction document
        """
        log_code = log_data.get("logCode")

        # Validate log code and get template
        template_doc = await self.validate_log_code(log_code)

        # Generate message from template
        template_string = template_doc.get("template", "")
        json_values = log_data.get("json", {})
        generated_message = self.generate_message_from_template(template_string, json_values)

        # Prepare document
        log_data["message"] = generated_message
        log_data["createdAt"] = get_ist_now()
        log_data["createdIp"] = created_ip
        log_data["actorId"] = ObjectId(actor_id)
        log_data["templateId"] = ObjectId(template_doc["_id"])

        # Remove logCode (we store templateId instead)
        if "logCode" in log_data:
            del log_data["logCode"]

        created = await self.repository.create(log_data)

        # Add logCode back for response
        return self.repository.convert_objectid_to_str(created, log_code=log_code)

    async def get_by_id(self, id: str) -> dict:
        """
        Get a log transaction by ID.

        Args:
            id: Log transaction ID

        Returns:
            Log transaction document

        Raises:
            HTTPException: If not found
        """
        if not ObjectId.is_valid(id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_response(
                    message="Invalid id format",
                    status_code=400,
                    error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
                )
            )

        log = await self.repository.find_by_id(id)

        if not log:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_response(
                    message="Log not found",
                    status_code=404,
                    error_code="ERR.CORE.LOG.NOT_FOUND"
                )
            )

        return log

    async def get_list(
        self,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        level: Optional[str] = None,
        layer: Optional[str] = None,
        actor_id: Optional[str] = None,
        log_code: Optional[str] = None,
        module_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get list of log transactions with filters and pagination.

        Returns:
            Paginated response dict
        """
        query = {}

        if level:
            query["level"] = level

        if layer:
            query["layer"] = layer

        if actor_id:
            if not ObjectId.is_valid(actor_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=error_response(
                        message="Invalid actorId format",
                        status_code=400,
                        error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
                    )
                )
            query["actorId"] = ObjectId(actor_id)

        if log_code:
            template_id = await self.repository.get_template_id_by_log_code(log_code)
            if template_id:
                query["templateId"] = template_id
            else:
                query["templateId"] = ObjectId("000000000000000000000000")

        if module_id:
            if not ObjectId.is_valid(module_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=error_response(
                        message="Invalid moduleId format",
                        status_code=400,
                        error_code="ERR.CORE.VALIDATION.INVALID_OBJECTID"
                    )
                )
            template_ids = await self.repository.get_template_ids_by_module_id(module_id)
            if template_ids:
                if "templateId" in query:
                    if query["templateId"] in template_ids:
                        pass
                    else:
                        query["templateId"] = ObjectId("000000000000000000000000")
                else:
                    query["templateId"] = {"$in": template_ids}
            else:
                query["templateId"] = ObjectId("000000000000000000000000")

        if endpoint:
            query["endpoint"] = {"$regex": endpoint, "$options": "i"}

        if search:
            query["message"] = {"$regex": search, "$options": "i"}

        if from_date or to_date:
            date_query = {}
            if from_date:
                date_query["$gte"] = from_date
            if to_date:
                date_query["$lte"] = to_date
            query["createdAt"] = date_query

        items, total = await self.repository.find_all(
            query=query,
            page=page,
            page_size=page_size
        )

        actual_page_size = page_size or total or 1
        total_pages = (total + actual_page_size - 1) // actual_page_size if actual_page_size > 0 else 1

        return {
            "items": items,
            "total": total,
            "page": page or 1,
            "page_size": actual_page_size,
            "total_pages": total_pages
        }

    async def get_analytics(
        self,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None
    ) -> Dict[str, int]:
        """
        Get log level analytics (counts by level).

        Args:
            from_date: Filter logs from this date
            to_date: Filter logs until this date

        Returns:
            Dict with infoCount, warningCount, errorCount, total
        """
        match_query = {}

        if from_date or to_date:
            date_query = {}
            if from_date:
                date_query["$gte"] = from_date
            if to_date:
                date_query["$lte"] = to_date
            match_query["createdAt"] = date_query

        return await self.repository.get_level_counts(match_query)

    async def cleanup_old_logs(self) -> Dict[str, int]:
        """
        Delete old logs based on retention period defined in LogMaster.

        Returns:
            Dict with deleted_count and processed_templates
        """
        total_deleted = 0

        # Get all log masters
        log_masters = await self.log_master_repository.get_all_active()

        for template in log_masters:
            template_id = ObjectId(template["_id"])
            retention_days = template.get("retentionPeriod", 365)

            cutoff_date = get_ist_now() - timedelta(days=retention_days)

            deleted = await self.repository.delete_by_template_and_date(
                template_id,
                cutoff_date
            )
            total_deleted += deleted

        return {
            "deleted_count": total_deleted,
            "processed_templates": len(log_masters)
        }
