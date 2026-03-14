"""
Hierarchy Access Service
Provides unit-based access control for filtering data based on user's hierarchy level.

This service determines which units a user can access based on their assigned unit
in the JWT token. The access rules are:
- If user's unit has NO parent (top-level): Return None (no filtering - access ALL data)
- If user's unit has parent: Access own unit + ALL descendants only

Usage:
    from app.api.v1.services.hierarchy_access_service import HierarchyAccessService

    accessible_ids = await HierarchyAccessService.get_accessible_unit_ids(
        user_unit_id="68ef60077a5b70d25ce211ae",
        district_id="691ccee65437863afda5a3d3"
    )
    # Returns None if top-level (no filtering needed)
    # Returns List[ObjectId] if has parent (filter by these IDs)
"""
from typing import List, Optional, Set, Union
from bson import ObjectId
from app.core.database import get_database
from app.constants.collections import Collections


class HierarchyAccessService:
    """
    Service class for unit hierarchy-based access control.

    Provides methods to determine which units and their data (personnel, villages, etc.)
    a user can access based on their position in the organizational hierarchy.
    """

    @staticmethod
    async def get_accessible_unit_ids(
        user_unit_id: str,
        district_id: Optional[str] = None,
        include_deleted: bool = False
    ) -> Optional[List[ObjectId]]:
        """
        Get list of unit ObjectIds that a user can access based on their unit hierarchy.

        This method implements the following access rules:
        1. If user's unit has NO parent (top-level): Return None (no filtering - ALL data accessible)
        2. If user's unit has parent: Return own unit + all descendant units

        Args:
            user_unit_id: The ObjectId string of the user's assigned unit from JWT.
            district_id: Optional district ID to filter units (from JWT districtId).
            include_deleted: Whether to include soft-deleted units (default: False).

        Returns:
            Optional[List[ObjectId]]:
                - None: If user's unit has no parent (top-level) - no filtering should be applied
                - List[ObjectId]: List of accessible unit IDs if user's unit has a parent

        Example:
            >>> ids = await HierarchyAccessService.get_accessible_unit_ids(
            ...     user_unit_id="68ef60077a5b70d25ce211ae",
            ...     district_id="691ccee65437863afda5a3d3"
            ... )
            >>> if ids is None:
            ...     # No filtering - user can see all data
            ... else:
            ...     # Filter by ids
        """
        db = get_database()

        # Validate user_unit_id
        if not user_unit_id or not ObjectId.is_valid(user_unit_id):
            return []

        user_unit_oid = ObjectId(user_unit_id)

        # Step 1: Fetch user's unit to get its name and hierarchy info
        user_unit = await db[Collections.UNIT].find_one(
            {"_id": user_unit_oid},
            {"_id": 1, "name": 1, "parentUnitId": 1, "parentUnitPath": 1, "districtId": 1}
        )

        if not user_unit:
            return []

        # Step 2: Check if user's unit has a parent
        # If NO parent (top-level unit), return None to indicate NO filtering needed
        parent_unit_id = user_unit.get("parentUnitId")
        if not parent_unit_id:
            # Top-level unit - user can see ALL active, non-deleted data
            # Return None to signal that no hierarchy filtering should be applied
            return None

        user_unit_name = user_unit.get("name", "")

        # Step 3: Build query to find all descendant units
        # Descendants are units whose parentUnitPath contains the user's unit name
        # parentUnitPath format: \parentName\grandparentName\...
        # A unit is a descendant if user's unit name appears in its parentUnitPath

        # Build the base query for descendants
        descendant_query: dict = {
            "$or": [
                {"_id": user_unit_oid},  # Include user's own unit
                {
                    "parentUnitPath": {
                        "$regex": f"\\\\{user_unit_name}(\\\\|$)",
                        "$options": "i"
                    }
                }
            ]
        }

        # Add soft-delete filter
        if not include_deleted:
            descendant_query["isDelete"] = False

        # Add district filter if provided
        if district_id and ObjectId.is_valid(district_id):
            descendant_query["districtId"] = ObjectId(district_id)

        # Step 4: Execute query to get all accessible unit IDs
        # Use projection to fetch only _id for performance
        cursor = db[Collections.UNIT].find(
            descendant_query,
            {"_id": 1}
        )

        accessible_units = await cursor.to_list(length=None)
        accessible_ids = [unit["_id"] for unit in accessible_units]

        return accessible_ids

    @staticmethod
    async def get_accessible_unit_ids_optimized(
        user_unit_id: str,
        district_id: Optional[str] = None,
        include_deleted: bool = False
    ) -> List[ObjectId]:
        """
        Optimized version using aggregation pipeline with index hints.

        This method is optimized for large datasets by:
        1. Using aggregation pipeline for better query planning
        2. Fetching only required fields
        3. Using regex pattern that can utilize indexes

        Args:
            user_unit_id: The ObjectId string of the user's assigned unit from JWT
            district_id: Optional district ID to filter units
            include_deleted: Whether to include soft-deleted units

        Returns:
            List[ObjectId]: List of unit ObjectIds the user can access
        """
        db = get_database()

        if not user_unit_id or not ObjectId.is_valid(user_unit_id):
            return []

        user_unit_oid = ObjectId(user_unit_id)

        # Fetch user's unit name first
        user_unit = await db[Collections.UNIT].find_one(
            {"_id": user_unit_oid},
            {"name": 1}
        )

        if not user_unit:
            return []

        user_unit_name = user_unit.get("name", "")

        # Build match stage
        match_conditions: List[dict] = []

        # Condition 1: Own unit
        match_conditions.append({"_id": user_unit_oid})

        # Condition 2: Descendants (parentUnitPath contains user's unit name)
        descendant_condition: dict = {
            "parentUnitPath": {
                "$regex": f"\\\\{user_unit_name}(\\\\|$)",
                "$options": "i"
            }
        }

        if district_id and ObjectId.is_valid(district_id):
            descendant_condition["districtId"] = ObjectId(district_id)

        if not include_deleted:
            descendant_condition["isDelete"] = False

        match_conditions.append(descendant_condition)

        # Aggregation pipeline
        pipeline = [
            {
                "$match": {
                    "$or": match_conditions
                }
            },
            {
                "$project": {"_id": 1}
            }
        ]

        cursor = db[Collections.UNIT].aggregate(pipeline)
        result = await cursor.to_list(length=None)

        return [doc["_id"] for doc in result]

    @staticmethod
    async def check_unit_access(
        user_unit_id: str,
        target_unit_id: str,
        district_id: Optional[str] = None
    ) -> bool:
        """
        Check if user has access to a specific target unit.

        This is a lightweight check that doesn't fetch all accessible units,
        useful for single-unit access validation.

        Args:
            user_unit_id: The ObjectId string of the user's assigned unit
            target_unit_id: The ObjectId string of the unit to check access for
            district_id: Optional district ID filter

        Returns:
            bool: True if user has access to target unit, False otherwise

        Example:
            >>> has_access = await HierarchyAccessService.check_unit_access(
            ...     user_unit_id="68ef60077a5b70d25ce211ae",
            ...     target_unit_id="691ccee65437863afda5a3d4"
            ... )
        """
        db = get_database()

        if not user_unit_id or not ObjectId.is_valid(user_unit_id):
            return False
        if not target_unit_id or not ObjectId.is_valid(target_unit_id):
            return False

        user_unit_oid = ObjectId(user_unit_id)
        target_unit_oid = ObjectId(target_unit_id)

        # Same unit - always accessible
        if user_unit_oid == target_unit_oid:
            return True

        # Fetch user's unit name
        user_unit = await db[Collections.UNIT].find_one(
            {"_id": user_unit_oid},
            {"name": 1}
        )

        if not user_unit:
            return False

        user_unit_name = user_unit.get("name", "")

        # Check if target unit's parentUnitPath contains user's unit name
        target_query: dict = {
            "_id": target_unit_oid,
            "parentUnitPath": {
                "$regex": f"\\\\{user_unit_name}(\\\\|$)",
                "$options": "i"
            },
            "isDelete": False
        }

        if district_id and ObjectId.is_valid(district_id):
            target_query["districtId"] = ObjectId(district_id)

        target_unit = await db[Collections.UNIT].find_one(target_query, {"_id": 1})

        return target_unit is not None

    @staticmethod
    async def get_hierarchy_filter(
        user_unit_id: str,
        district_id: Optional[str] = None,
        include_deleted: bool = False
    ) -> dict:
        """
        Get MongoDB query filter for hierarchy-based access control.

        Returns a filter dict that can be merged with existing queries to
        restrict results to accessible units only.

        Args:
            user_unit_id: The ObjectId string of the user's assigned unit
            district_id: Optional district ID filter
            include_deleted: Whether to include soft-deleted units

        Returns:
            dict: MongoDB query filter with $in clause for unit filtering

        Example:
            >>> filter = await HierarchyAccessService.get_hierarchy_filter(
            ...     user_unit_id="68ef60077a5b70d25ce211ae"
            ... )
            >>> # Returns {"_id": {"$in": [ObjectId(...), ...]}}
            >>> # Merge with your query: {**your_query, **filter}
        """
        accessible_ids = await HierarchyAccessService.get_accessible_unit_ids(
            user_unit_id=user_unit_id,
            district_id=district_id,
            include_deleted=include_deleted
        )

        if not accessible_ids:
            # Return a filter that matches nothing
            return {"_id": {"$in": []}}

        return {"_id": {"$in": accessible_ids}}

    @staticmethod
    async def get_personnel_hierarchy_filter(
        user_unit_id: str,
        district_id: Optional[str] = None,
        include_deleted: bool = False
    ) -> dict:
        """
        Get MongoDB query filter for personnel based on unit hierarchy.

        Personnel are filtered by their assigned units (units.unitId array).
        This returns a filter that matches personnel in any accessible unit.

        Args:
            user_unit_id: The ObjectId string of the user's assigned unit
            district_id: Optional district ID filter
            include_deleted: Whether to include soft-deleted units

        Returns:
            dict: MongoDB query filter for personnel collection

        Example:
            >>> filter = await HierarchyAccessService.get_personnel_hierarchy_filter(
            ...     user_unit_id="68ef60077a5b70d25ce211ae"
            ... )
            >>> # Returns {"units.unitId": {"$in": [ObjectId(...), ...]}}
        """
        accessible_ids = await HierarchyAccessService.get_accessible_unit_ids(
            user_unit_id=user_unit_id,
            district_id=district_id,
            include_deleted=include_deleted
        )

        if not accessible_ids:
            return {"units.unitId": {"$in": []}}

        return {"units.unitId": {"$in": accessible_ids}}

    @staticmethod
    async def get_unit_villages_hierarchy_filter(
        user_unit_id: str,
        district_id: Optional[str] = None,
        include_deleted: bool = False
    ) -> dict:
        """
        Get MongoDB query filter for unit_villages based on unit hierarchy.

        Unit villages are filtered by their unitId field.

        Args:
            user_unit_id: The ObjectId string of the user's assigned unit
            district_id: Optional district ID filter
            include_deleted: Whether to include soft-deleted units

        Returns:
            dict: MongoDB query filter for unit_villages collection

        Example:
            >>> filter = await HierarchyAccessService.get_unit_villages_hierarchy_filter(
            ...     user_unit_id="68ef60077a5b70d25ce211ae"
            ... )
            >>> # Returns {"unitId": {"$in": [ObjectId(...), ...]}}
        """
        accessible_ids = await HierarchyAccessService.get_accessible_unit_ids(
            user_unit_id=user_unit_id,
            district_id=district_id,
            include_deleted=include_deleted
        )

        if not accessible_ids:
            return {"unitId": {"$in": []}}

        return {"unitId": {"$in": accessible_ids}}
