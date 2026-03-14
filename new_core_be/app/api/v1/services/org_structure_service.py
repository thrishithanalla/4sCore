"""
Organizational Structure Service
Business logic for fetching and building AP Police organizational hierarchy
Uses existing unit_master collection with parentUnitId and unitPath
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId
from fastapi import HTTPException, status

from app.core.database import get_database
from app.constants.collections import Collections


def convert_objectid_to_str(value: Any) -> Any:
    """Recursively convert ObjectId and datetime to string"""
    if isinstance(value, ObjectId):
        return str(value)
    elif isinstance(value, datetime):
        return value.isoformat()
    elif isinstance(value, dict):
        return {k: convert_objectid_to_str(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [convert_objectid_to_str(item) for item in value]
    return value


class OrgStructureService:
    """Service for organizational structure operations"""

    @staticmethod
    async def get_org_structure(
        format: str = "tree",
        level: Optional[str] = None,
        unit_id: Optional[str] = None,
        district_id: Optional[str] = None,
        unit_type_id: Optional[str] = None,
        include_inactive: bool = False
    ) -> Dict[str, Any]:
        """
        Get organizational structure in tree or flat format.

        Args:
            format: Response format - "tree" (nested) or "flat" (array with parent refs)
            level: Filter by hierarchy level (L1, L2, etc.)
            unit_id: Get subtree starting from specific unit
            district_id: Filter by district
            unit_type_id: Filter by unit type
            include_inactive: Include inactive units

        Returns:
            Dict with 'data' (list of units) and 'totalUnits' (int)
        """
        db = get_database()

        # Build query
        query = {"isDelete": False}
        if not include_inactive:
            query["isActive"] = True

        if level:
            # Assuming hierarchyLevel field exists or can be derived from unitPath length
            # For now, filter will be added when we have the field
            pass

        if district_id:
            try:
                query["districtId"] = ObjectId(district_id)
            except:
                query["districtId"] = district_id

        if unit_type_id:
            try:
                query["unitTypeId"] = ObjectId(unit_type_id)
            except:
                query["unitTypeId"] = unit_type_id

        # If unit_id provided, get that unit and all its descendants
        if unit_id:
            try:
                unit_obj_id = ObjectId(unit_id)
            except:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid unit ID format"
                )

            # Get the specific unit
            root_unit = await db[Collections.UNIT].find_one({"_id": unit_obj_id, **query})
            if not root_unit:
                # Try to get unit name even if not matching query (for better error message)
                unit_info = await db[Collections.UNIT].find_one({"_id": unit_obj_id}, {"name": 1})
                unit_name = unit_info.get("name") if unit_info else None

                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Unit '{unit_name}' not found" if unit_name else f"Unit not found: {unit_id}"
                )

            # Get all descendants by checking if unit_id is in their parentUnitId chain
            # This uses the fact that descendants will have this unit in their hierarchy
            descendants_query = {
                **query,
                "parentUnitId": {"$exists": True}
            }

            all_descendants = []
            cursor = db[Collections.UNIT].find(descendants_query)
            async for unit in cursor:
                # Check if this unit's ancestry includes our target unit
                if await OrgStructureService._is_descendant_of(db, unit, unit_obj_id):
                    all_descendants.append(unit)

            # Combine root with descendants
            units = [root_unit] + all_descendants
        else:
            # Get all units matching query
            cursor = db[Collections.UNIT].find(query).sort("name", 1)
            units = await cursor.to_list(length=None)

        # Enrich units with related data
        enriched_units = await OrgStructureService._enrich_units(db, units)

        # Build response based on format
        if format == "tree":
            tree_data = await OrgStructureService._build_tree(enriched_units, unit_id)
            return {
                "data": tree_data,
                "totalUnits": len(units)
            }
        else:  # flat format
            flat_data = await OrgStructureService._build_flat(enriched_units)
            return {
                "data": flat_data,
                "totalUnits": len(units)
            }

    @staticmethod
    async def _is_descendant_of(db, unit: Dict, ancestor_id: ObjectId) -> bool:
        """Check if a unit is a descendant of the given ancestor"""
        current_parent_id = unit.get("parentUnitId")

        # Traverse up the tree until we find the ancestor or reach root
        visited = set()  # Prevent infinite loops
        while current_parent_id:
            current_parent_id_obj = current_parent_id if isinstance(current_parent_id, ObjectId) else ObjectId(current_parent_id)

            if current_parent_id_obj in visited:
                break  # Circular reference detected
            visited.add(current_parent_id_obj)

            if current_parent_id_obj == ancestor_id:
                return True

            # Get parent unit
            parent = await db[Collections.UNIT].find_one({"_id": current_parent_id_obj})
            if not parent:
                break

            current_parent_id = parent.get("parentUnitId")

        return False

    @staticmethod
    async def _enrich_units(db, units: List[Dict]) -> List[Dict]:
        """
        Enrich units with personnel, jurisdiction, and related data using parallel queries.
        """
        import asyncio

        enriched = []
        unit_ids = [u["_id"] for u in units]

        # Collect IDs for batch fetching
        personnel_ids = []
        district_ids = []
        unit_type_ids = []

        for unit in units:
            if unit.get("responsibleUserId"):
                try:
                    personnel_ids.append(ObjectId(unit["responsibleUserId"]) if not isinstance(unit["responsibleUserId"], ObjectId) else unit["responsibleUserId"])
                except:
                    pass
            if unit.get("districtId"):
                try:
                    district_ids.append(ObjectId(unit["districtId"]) if not isinstance(unit["districtId"], ObjectId) else unit["districtId"])
                except:
                    pass
            if unit.get("unitTypeId"):
                try:
                    unit_type_ids.append(ObjectId(unit["unitTypeId"]) if not isinstance(unit["unitTypeId"], ObjectId) else unit["unitTypeId"])
                except:
                    pass

        # Fetch all data in parallel using asyncio.gather
        async def fetch_personnel():
            personnel_map = {}
            if personnel_ids:
                cursor = db[Collections.PERSONNEL_MASTER].find(
                    {"_id": {"$in": personnel_ids}, "isDelete": False},
                    {"name": 1, "badge": 1, "rankId": 1, "phone": 1, "email": 1}
                )
                async for person in cursor:
                    personnel_map[str(person["_id"])] = person
            return personnel_map

        async def fetch_districts():
            district_map = {}
            if district_ids:
                cursor = db[Collections.DISTRICT].find(
                    {"_id": {"$in": district_ids}, "isDelete": False},
                    {"name": 1, "cctnsDistrictCd": 1}
                )
                async for district in cursor:
                    district_map[str(district["_id"])] = district
            return district_map

        async def fetch_unit_types():
            unit_type_map = {}
            if unit_type_ids:
                cursor = db[Collections.UNIT_TYPE].find(
                    {"_id": {"$in": unit_type_ids}, "isDelete": False},
                    {"name": 1}
                )
                async for unit_type in cursor:
                    unit_type_map[str(unit_type["_id"])] = unit_type
            return unit_type_map

        async def fetch_personnel_counts():
            personnel_count_map = {}
            if unit_ids:
                pipeline = [
                    {"$match": {"units.unitId": {"$in": unit_ids}, "isDelete": False}},
                    {"$unwind": "$units"},
                    {"$match": {"units.unitId": {"$in": unit_ids}}},
                    {"$group": {"_id": "$units.unitId", "count": {"$sum": 1}}}
                ]
                async for result in db[Collections.PERSONNEL_MASTER].aggregate(pipeline):
                    personnel_count_map[str(result["_id"])] = result["count"]
            return personnel_count_map

        async def fetch_ranks():
            # Fetch all ranks at once
            rank_map = {}
            cursor = db[Collections.RANK_MASTER].find(
                {"isDelete": False},
                {"name": 1}
            )
            async for rank in cursor:
                rank_map[str(rank["_id"])] = rank.get("name")
            return rank_map

        # Execute all fetches in parallel
        personnel_map, district_map, unit_type_map, personnel_count_map, rank_map = await asyncio.gather(
            fetch_personnel(),
            fetch_districts(),
            fetch_unit_types(),
            fetch_personnel_counts(),
            fetch_ranks()
        )

        # Enrich each unit
        for unit in units:
            unit_id_str = str(unit["_id"])
            personnel_count = personnel_count_map.get(unit_id_str, 0)

            # Convert datetime fields to ISO format strings
            created_at = unit.get("createdAt")
            updated_at = unit.get("updatedAt")

            # Get district info
            district_id_str = str(unit.get("districtId")) if unit.get("districtId") else None
            district_info = district_map.get(district_id_str) if district_id_str else None

            enriched_unit = {
                "unitId": unit_id_str,
                "unitName": unit.get("name", ""),
                "unitCd": unit.get("unitCd"),
                "unitType": None,
                "hierarchyLevel": OrgStructureService._derive_hierarchy_level(unit),
                "rank": None,  # Will be derived from incharge personnel rank
                "parentUnitId": str(unit["parentUnitId"]) if unit.get("parentUnitId") else None,
                "unitPath": unit.get("unitPath", []),
                "incharge": None,
                "jurisdiction": OrgStructureService._build_jurisdiction_simple(district_info),
                "personnelCount": personnel_count,
                "districtName": district_info.get("name") if district_info else None,
                "city": unit.get("city"),
                "address": OrgStructureService._build_address(unit),
                "phone": unit.get("phone", []),
                "email": unit.get("email"),
                "isActive": unit.get("isActive", True),
                "createdAt": created_at.isoformat() if isinstance(created_at, datetime) else created_at,
                "updatedAt": updated_at.isoformat() if isinstance(updated_at, datetime) else updated_at,
                "totalChildUnits": 0,  # Will be calculated in tree building
                "totalPersonnel": personnel_count  # Will be summed in tree
            }

            # Add unit type name
            unit_type_id_str = str(unit.get("unitTypeId")) if unit.get("unitTypeId") else None
            if unit_type_id_str and unit_type_id_str in unit_type_map:
                enriched_unit["unitType"] = unit_type_map[unit_type_id_str].get("name")

            # Add incharge personnel
            responsible_user_id_str = str(unit.get("responsibleUserId")) if unit.get("responsibleUserId") else None
            if responsible_user_id_str and responsible_user_id_str in personnel_map:
                person = personnel_map[responsible_user_id_str]
                rank_id_str = str(person.get("rankId")) if person.get("rankId") else None
                rank_name = rank_map.get(rank_id_str) if rank_id_str else None

                enriched_unit["incharge"] = {
                    "_id": str(person["_id"]),
                    "name": person.get("name"),
                    "badge": person.get("badge"),
                    "rank": rank_name,
                    "phone": person.get("phone"),
                    "email": person.get("email"),
                    "department": None
                }
                # Set unit's rank from incharge
                if rank_name:
                    enriched_unit["rank"] = rank_name

            enriched.append(enriched_unit)

        return enriched

    @staticmethod
    def _derive_hierarchy_level(unit: Dict) -> Optional[str]:
        """Derive hierarchy level from unitPath length or unit type"""
        # Option 1: Use unitPath length
        unit_path = unit.get("unitPath", [])
        if unit_path:
            level_num = len(unit_path)
            return f"L{level_num}"

        # Option 2: Derive from unit type (if standardized)
        unit_type = unit.get("unitType", "").lower()
        level_map = {
            "state": "L1",
            "zone": "L2",
            "range": "L3",
            "commissionerate": "L3",
            "district": "L4",
            "subdivision": "L5",
            "circle": "L6",
            "police station": "L7",
            "beat": "L8"
        }
        return level_map.get(unit_type)

    @staticmethod
    def _build_address(unit: Dict) -> Optional[str]:
        """Build full address from address fields"""
        parts = []
        if unit.get("address1"):
            parts.append(str(unit["address1"]))
        if unit.get("address2"):
            parts.append(str(unit["address2"]))
        if unit.get("city"):
            parts.append(str(unit["city"]))
        if unit.get("zip"):
            parts.append(str(unit["zip"]))

        return ", ".join(parts) if parts else None

    @staticmethod
    def _build_jurisdiction_simple(district_info: Optional[Dict]) -> List[Dict]:
        """Build simplified jurisdiction list with just district (for performance)"""
        jurisdictions = []

        if district_info:
            jurisdictions.append({
                "type": "District",
                "refId": str(district_info.get("_id", "")),
                "name": district_info.get("name", ""),
                "code": district_info.get("cctnsDistrictCd")
            })

        return jurisdictions

    @staticmethod
    async def _build_tree(units: List[Dict], root_unit_id: Optional[str] = None) -> List[Dict]:
        """Build nested tree structure from flat unit list"""
        # Create lookup maps
        units_by_id = {u["unitId"]: u for u in units}
        units_by_parent = {}

        for unit in units:
            parent_id = unit.get("parentUnitId")
            if parent_id not in units_by_parent:
                units_by_parent[parent_id] = []
            units_by_parent[parent_id].append(unit)

        def build_node(unit: Dict) -> Dict:
            """Recursively build tree node with children"""
            node = unit.copy()
            unit_id = node["unitId"]

            # Get children
            children = units_by_parent.get(unit_id, [])
            node["children"] = [build_node(child) for child in children]

            # Calculate cumulative stats
            total_units = len(children)
            total_personnel = node["personnelCount"]

            for child in node["children"]:
                total_units += child.get("totalChildUnits", 0)
                total_personnel += child.get("totalPersonnel", 0)

            node["totalChildUnits"] = total_units
            node["totalPersonnel"] = total_personnel

            return convert_objectid_to_str(node)

        # Find root nodes
        if root_unit_id:
            # Start from specific unit
            if root_unit_id in units_by_id:
                return [build_node(units_by_id[root_unit_id])]
            else:
                return []
        else:
            # Find all roots (units with no parent or parent not in dataset)
            roots = [u for u in units if not u.get("parentUnitId") or u.get("parentUnitId") not in units_by_id]
            return [build_node(root) for root in roots]

    @staticmethod
    async def _build_flat(units: List[Dict]) -> List[Dict]:
        """Return flat list with parent references"""
        return [convert_objectid_to_str(unit) for unit in units]
