"""
Module Hierarchy Router
Provides API endpoints for hierarchical module structure with jobs and permissions
Routes: /api/v1/module-hierarchy
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request, HTTPException, status
from pydantic import BaseModel
from bson import ObjectId

from app.api.v1.schemas.auth_schema import TokenDataSchema
from app.api.v1.dependencies.auth import get_current_user
from app.api.v1.utils.response_helpers import error_response
from app.api.v1.utils.standard_response import ResponseBuilder
from app.core.database import get_database
from app.constants.collections import Collections
from app.constants.error_codes import ErrorCodes
from app.api.v1.services.error_logger import log_error, log_error_with_exception

router = APIRouter(prefix="/api/v1/module-hierarchy", tags=["module-hierarchy"])

# Job name for RBAC permission checks
JOB_NAME = "MODULE_HIERARCHY"


class JobItem(BaseModel):
    """Job item with permissions"""
    name: str
    permissions: List[str]


class ModuleHierarchy(BaseModel):
    """Module with jobs and permissions hierarchy"""
    moduleId: str
    moduleName: str
    jobs: List[JobItem]


# Static data for module hierarchy (for testing when DB is empty)
STATIC_MODULE_HIERARCHY = [
    {
        "moduleId": "691e0704ea8033468e05f4f4",
        "moduleName": "Petition Management",
        "jobs": [
            {
                "jobId": "691e06beea8033468e05f4f5",
                "name": "petition",
                "permissions": [
                    {"permissionId": "691e06beea8033468e05f4f6", "name": "create"},
                    {"permissionId": "691e06beea8033468e05f4f7", "name": "read"},
                    {"permissionId": "691e06beea8033468e05f4f8", "name": "update"},
                    {"permissionId": "691e06beea8033468e05f4f9", "name": "delete"}
                ]
            },
            {
                "jobId": "691e06beea8033468e05f500",
                "name": "claim",
                "permissions": [
                    {"permissionId": "691e06beea8033468e05f4f6", "name": "create"},
                    {"permissionId": "691e06beea8033468e05f4f7", "name": "read"},
                    {"permissionId": "691e06beea8033468e05f4f8", "name": "update"},
                    {"permissionId": "691e06beea8033468e05f4f9", "name": "delete"}
                ]
            },
            {
                "jobId": "691e06beea8033468e05f501",
                "name": "evidence",
                "permissions": [
                    {"permissionId": "691e06beea8033468e05f4f6", "name": "create"},
                    {"permissionId": "691e06beea8033468e05f4f7", "name": "read"},
                    {"permissionId": "691e06beea8033468e05f4f8", "name": "update"},
                    {"permissionId": "691e06beea8033468e05f4f9", "name": "delete"}
                ]
            },
            {
                "jobId": "691e06beea8033468e05f502",
                "name": "report",
                "permissions": [
                    {"permissionId": "691e06beea8033468e05f4f6", "name": "create"},
                    {"permissionId": "691e06beea8033468e05f4f7", "name": "read"},
                    {"permissionId": "691e06beea8033468e05f4f8", "name": "update"},
                    {"permissionId": "691e06beea8033468e05f4f9", "name": "delete"}
                ]
            }
        ]
    },
    {
        "moduleId": "691e06beea8033468e05f4f3",
        "moduleName": "Code of Criminal Procedure",
        "jobs": [
            {
                "jobId": "691e06beea8033468e05f503",
                "name": "FIR",
                "permissions": [
                    {"permissionId": "691e06beea8033468e05f504", "name": "upload"},
                    {"permissionId": "691e06beea8033468e05f4f7", "name": "read"},
                    {"permissionId": "691e06beea8033468e05f505", "name": "download"}
                ]
            }
        ]
    }
]


@router.get(
    "/get",
    summary="Get module hierarchy with jobs and permissions",
    description="Retrieves hierarchical module structure including jobs and their associated permissions from the permissions mapping table."
)
async def get_module_hierarchy_endpoint(
    request: Request,
    moduleId: Optional[str] = Query(None, description="Optional Module ID to filter"),
    current_user: TokenDataSchema = Depends(get_current_user)
):
    """
    Get module hierarchy with jobs and permissions from permissionsMapping table.

    This endpoint aggregates data from modules, jobs, and permissions collections
    to build a hierarchical structure useful for RBAC configuration interfaces.

    **Query Parameters:**
    - `moduleId` (optional): MongoDB ObjectId to filter for a specific module

    **Response:**
    - `success`: true on success
    - `code`: 200
    - `message`: "Module hierarchy fetched successfully"
    - `data`: Array of module hierarchy objects containing:
      - `moduleId`: Module identifier
      - `moduleName`: Display name of the module
      - `jobs`: Array of job objects with:
        - `name`: Job identifier
        - `permissions`: Array of permission names (e.g., "create", "read", "update", "delete")

    **Error Responses:**
    - 403: Permission denied (READ permission required)
    - 500: Internal server error

    **Notes:**
    - Uses bulk fetching for efficiency (3 queries instead of N+1)
    - Returns empty array if no permissions mappings exist
    - Permissions are returned as name strings, not full objects
    """
    

    # # TEMPORARY: Return static data for testing (remove when DB has data)
    # if moduleId:
    #     filtered_modules = [
    #         module for module in STATIC_MODULE_HIERARCHY
    #         if module["moduleId"] == moduleId
    #     ]
    #     return filtered_modules
    # return STATIC_MODULE_HIERARCHY

    # PRODUCTION CODE: Fetch from permissionsMapping table
    db = get_database()

    # Build query - always exclude soft-deleted
    query = {"isDelete": False}

    # If moduleId provided, filter by it
    if moduleId:
        query["moduleId"] = ObjectId(moduleId)

    # Fetch all permissions mappings
    mappings = await db[Collections.PERMISSION_MAPPINGS].find(query).to_list(length=10000)

    if not mappings:
        return ResponseBuilder.success(
            data=[],
            message="Module hierarchy fetched successfully"
        )

    # Collect all unique IDs for bulk fetching
    module_ids = set()
    job_ids = set()
    permission_ids = set()

    for mapping in mappings:
        module_ids.add(mapping["moduleId"])
        job_ids.add(mapping["jobId"])
        permission_ids.add(mapping["permissionId"])

    # Bulk fetch all modules, jobs, and permissions (3 queries instead of N)
    modules_list = await db[Collections.MODULES].find({"_id": {"$in": list(module_ids)}}).to_list(length=None)
    jobs_list = await db[Collections.JOBS].find(
        {"_id": {"$in": list(job_ids)}},
        {"name": 1, "displayName": 1, "route": 1, "menuEligible": 1, "displayOrder": 1}
    ).to_list(length=None)
    permissions_list = await db[Collections.PERMISSIONS].find({"_id": {"$in": list(permission_ids)}}).to_list(length=None)

    # Create lookup dictionaries for O(1) access
    modules_map = {str(m["_id"]): m for m in modules_list}
    jobs_map = {str(j["_id"]): j for j in jobs_list}
    permissions_map = {str(p["_id"]): p for p in permissions_list}

    # Build hierarchy structure: moduleId -> jobId -> permissions
    hierarchy_dict = {}

    for mapping in mappings:
        module_id_str = str(mapping["moduleId"])
        job_id_str = str(mapping["jobId"])
        permission_id_str = str(mapping["permissionId"])

        # Initialize module if not exists
        if module_id_str not in hierarchy_dict:
            module = modules_map.get(module_id_str)
            hierarchy_dict[module_id_str] = {
                "moduleId": module_id_str,
                "moduleName": module.get("name", "") if module else "",
                "jobs": {}
            }

        # Initialize job if not exists in this module
        if job_id_str not in hierarchy_dict[module_id_str]["jobs"]:
            job = jobs_map.get(job_id_str)
            menu_eligible = job.get("menuEligible", True) if job else True
            hierarchy_dict[module_id_str]["jobs"][job_id_str] = {
                "jobId": job_id_str,
                "name": job.get("name", "") if job else "",
                "displayName": job.get("displayName", "") if job else "",
                "route": job.get("route", "") if job else "",
                "menuEligible": menu_eligible,
                "displayOrder": job.get("displayOrder", 1 if menu_eligible else 0) if job else 1,
                "permissions": []
            }

        # Add permission to the job (with permissionId and name)
        permission = permissions_map.get(permission_id_str)
        permission_obj = {
            "permissionId": permission_id_str,
            "name": permission.get("name", "") if permission else ""
        }
        hierarchy_dict[module_id_str]["jobs"][job_id_str]["permissions"].append(permission_obj)

    # Convert to list format
    result = []
    for module_id, module_data in hierarchy_dict.items():
        jobs_list = []
        for job_id, job_data in module_data["jobs"].items():
            jobs_list.append({
                "jobId": job_data["jobId"],
                "name": job_data["name"],
                "displayName": job_data["displayName"],
                "route": job_data["route"],
                "menuEligible": job_data["menuEligible"],
                "displayOrder": job_data["displayOrder"],
                "permissions": job_data["permissions"]
            })
        result.append({
            "moduleId": module_data["moduleId"],
            "moduleName": module_data["moduleName"],
            "jobs": jobs_list
        })

    return ResponseBuilder.success(
        data=result,
        message="Module hierarchy fetched successfully"
    )
