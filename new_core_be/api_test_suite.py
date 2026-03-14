"""
UC2 Core API - Comprehensive Test Suite
========================================
This script tests ALL API endpoints with complete CRUD operations,
edge cases, validation testing, and generates a detailed HTML report.

Usage:
    python api_test_suite.py

Requirements:
    pip install requests
"""

import requests
import json
import time
import random
import string
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum


# ============================================================================
# CONFIGURATION
# ============================================================================

BASE_URL = "http://127.0.0.1:8000/core"
TEST_USER_ID = "66554433"
TEST_PASSWORD = "Password@123"

# Generate unique test identifier for this run
TEST_RUN_ID = f"{int(time.time())}"


# ============================================================================
# DATA CLASSES
# ============================================================================

class TestStatus(Enum):
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"
    WARNING = "warning"


class TestCategory(Enum):
    LIST = "list"
    GET = "get"
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    RESTORE = "restore"
    VALIDATION = "validation"
    EDGE_CASE = "edge_case"
    AUTH = "auth"
    ERROR_HANDLING = "error_handling"


@dataclass
class TestResult:
    endpoint: str
    method: str
    status: TestStatus
    status_code: int
    response_time: float
    category: TestCategory
    description: str = ""
    request_data: Optional[Dict] = None
    response_data: Optional[Dict] = None
    error: Optional[str] = None
    expected_status: int = 200


@dataclass
class RouterTestResults:
    router_name: str
    base_path: str
    results: List[TestResult] = field(default_factory=list)

    @property
    def total_tests(self) -> int:
        return len(self.results)

    @property
    def passed_tests(self) -> int:
        return len([r for r in self.results if r.status == TestStatus.PASSED])

    @property
    def failed_tests(self) -> int:
        return len([r for r in self.results if r.status == TestStatus.FAILED])

    @property
    def warning_tests(self) -> int:
        return len([r for r in self.results if r.status == TestStatus.WARNING])

    @property
    def skipped_tests(self) -> int:
        return len([r for r in self.results if r.status == TestStatus.SKIPPED])

    @property
    def pass_rate(self) -> float:
        if self.total_tests == 0:
            return 0
        return (self.passed_tests / self.total_tests) * 100

    def get_by_category(self, category: TestCategory) -> List[TestResult]:
        return [r for r in self.results if r.category == category]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_unique_name(prefix: str = "APITest") -> str:
    """Generate a unique name for test data"""
    return f"{prefix} {TEST_RUN_ID} {random.randint(1000, 9999)}"


def generate_unique_code(prefix: str = "AT") -> str:
    """Generate a unique code for test data"""
    return f"{prefix}{TEST_RUN_ID[-4:]}{random.randint(100, 999)}"


# ============================================================================
# API TEST CLASS
# ============================================================================

class APITestSuite:
    def __init__(self):
        self.base_url = BASE_URL
        self.login_token = None
        self.auth_token = None
        self.headers = {}
        self.router_results: List[RouterTestResults] = []
        self.created_ids: Dict[str, List[str]] = {}  # Track created records for cleanup
        self.reference_ids: Dict[str, str] = {}  # Store IDs from existing data
        self.test_start_time = None

    def authenticate(self) -> bool:
        """Login and get authentication tokens"""
        print("\n" + "="*60)
        print("AUTHENTICATING...")
        print("="*60)

        try:
            response = requests.post(
                f"{self.base_url}/api/v1/auth/login",
                json={"userId": TEST_USER_ID, "password": TEST_PASSWORD},
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                self.login_token = data["data"]["accessToken"]
                print(f"[OK] Login successful")

                units = self._decode_token_units(self.login_token)
                if units:
                    unit_id = units[0].get("unitId")
                    role_id = units[0].get("roles", [{}])[0].get("roleId")

                    response2 = requests.post(
                        f"{self.base_url}/api/v1/auth/get-auth-token",
                        params={"unitId": unit_id, "roleId": role_id},
                        headers={"Authorization": f"Bearer {self.login_token}"},
                        timeout=30
                    )

                    if response2.status_code == 200:
                        self.auth_token = response2.json()["data"]["accessToken"]
                        self.headers = {"Authorization": f"Bearer {self.auth_token}"}
                        print(f"[OK] Auth token obtained")
                        return True

            print(f"[FAIL] Authentication failed: {response.text}")
            return False

        except Exception as e:
            print(f"[FAIL] Authentication error: {str(e)}")
            return False

    def _decode_token_units(self, token: str) -> List[Dict]:
        """Decode JWT to get units"""
        try:
            import base64
            parts = token.split(".")
            if len(parts) >= 2:
                payload = parts[1]
                payload += "=" * (4 - len(payload) % 4)
                decoded = base64.urlsafe_b64decode(payload)
                data = json.loads(decoded)
                return data.get("units", [])
        except:
            pass
        return []

    def _make_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make HTTP request with timing"""
        url = f"{self.base_url}{endpoint}"
        kwargs.setdefault("headers", self.headers)
        kwargs.setdefault("timeout", 30)

        start_time = time.time()
        response = getattr(requests, method.lower())(url, **kwargs)
        response.elapsed_time = time.time() - start_time

        return response

    def _test_endpoint(self, method: str, endpoint: str,
                       expected_status: int = 200,
                       data: Dict = None,
                       params: Dict = None,
                       category: TestCategory = TestCategory.LIST,
                       description: str = "",
                       headers: Dict = None) -> TestResult:
        """Test a single endpoint"""
        try:
            kwargs = {}
            if data:
                kwargs["json"] = data
            if params:
                kwargs["params"] = params
            if headers:
                kwargs["headers"] = headers

            response = self._make_request(method, endpoint, **kwargs)

            try:
                response_data = response.json()
            except:
                response_data = {"raw": response.text[:500]}

            # Determine test status
            if response.status_code == expected_status:
                status = TestStatus.PASSED
            elif response.status_code == 403:
                status = TestStatus.WARNING
            else:
                status = TestStatus.FAILED

            return TestResult(
                endpoint=endpoint,
                method=method.upper(),
                status=status,
                status_code=response.status_code,
                response_time=response.elapsed_time,
                category=category,
                description=description,
                request_data=data,
                response_data=response_data,
                expected_status=expected_status
            )

        except Exception as e:
            return TestResult(
                endpoint=endpoint,
                method=method.upper(),
                status=TestStatus.FAILED,
                status_code=0,
                response_time=0,
                category=category,
                description=description,
                error=str(e),
                expected_status=expected_status
            )

    def _add_result(self, results: RouterTestResults, result: TestResult):
        """Add result and print status"""
        results.results.append(result)
        status_str = "PASS" if result.status == TestStatus.PASSED else ("WARN" if result.status == TestStatus.WARNING else "FAIL")
        print(f"  [{status_str}] {result.method} {result.endpoint.split('?')[0][:50]} - {result.description}")

    def _fetch_reference_ids(self):
        """Fetch existing IDs to use in tests"""
        print("\nFetching reference data...")

        endpoints = [
            ("districtId", "/api/v1/districts/list?page=1&page_size=1"),
            ("departmentId", "/api/v1/departments/list?page=1&page_size=1"),
            ("rankId", "/api/v1/ranks/list?page=1&page_size=1"),
            ("unitId", "/api/v1/units/list?page=1&page_size=1"),
            ("moduleId", "/api/v1/modules/list?page=1&page_size=1"),
            ("personnelId", "/api/v1/personnel-master/list?page=1&page_size=1"),
            ("roleId", "/api/v1/roles/list?page=1&page_size=1"),
            ("jobId", "/api/v1/jobs/list?page=1&page_size=1"),
            ("permissionId", "/api/v1/permissions/list?page=1&page_size=1"),
            ("valueSetId", "/api/v1/value-sets/list?page=1&page_size=1"),
            ("promptId", "/api/v1/prompts/list?page=1&page_size=1"),
            ("mandalId", "/api/v1/mandals/list?page=1&page_size=1"),
            ("designationId", "/api/v1/designation-master/list?page=1&page_size=1"),
            ("unitTypeId", "/api/v1/unit-types/list?page=1&page_size=1"),
        ]

        for key, endpoint in endpoints:
            try:
                resp = self._make_request("get", endpoint)
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    if data and isinstance(data, list) and len(data) > 0:
                        self.reference_ids[key] = data[0].get("_id") or data[0].get("id")
                        print(f"  - {key}: {self.reference_ids[key]}")
            except:
                pass

    def _cleanup_created_records(self):
        """Clean up test records created during testing"""
        print("\n" + "="*60)
        print("CLEANUP: Removing test records...")
        print("="*60)

        cleanup_endpoints = {
            "department": "/api/v1/departments/delete",
            "district": "/api/v1/districts/delete",
            "mandal": "/api/v1/mandals/delete",
            "rank": "/api/v1/ranks/delete",
            "designation": "/api/v1/designation-master/delete",
            "unitType": "/api/v1/unit-types/delete",
            "role": "/api/v1/roles/delete",
            "permission": "/api/v1/permissions/delete",
            "job": "/api/v1/jobs/delete",
            "module": "/api/v1/modules/delete",
            "valueSet": "/api/v1/value-sets/delete",
            "prompt": "/api/v1/prompts/delete",
        }

        for entity_type, ids in self.created_ids.items():
            if entity_type in cleanup_endpoints:
                for record_id in ids:
                    try:
                        self._make_request("delete", f"{cleanup_endpoints[entity_type]}/{record_id}")
                        print(f"  [OK] Deleted {entity_type}: {record_id}")
                    except:
                        print(f"  [WARN] Failed to delete {entity_type}: {record_id}")

    def _track_created_id(self, entity_type: str, record_id: str):
        """Track a created record ID for cleanup"""
        if entity_type not in self.created_ids:
            self.created_ids[entity_type] = []
        self.created_ids[entity_type].append(record_id)

    # ========================================================================
    # AUTHENTICATION ROUTER TESTS
    # ========================================================================

    def test_auth_router(self) -> RouterTestResults:
        """Test Authentication Router - All scenarios"""
        results = RouterTestResults("Authentication Router", "/api/v1/auth")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        # === LOGIN TESTS ===

        # 1. Valid login
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": TEST_USER_ID, "password": TEST_PASSWORD},
            category=TestCategory.AUTH,
            description="Login with valid credentials")
        self._add_result(results, result)

        # 2. Empty userId
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": "", "password": TEST_PASSWORD},
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Login with empty userId")
        self._add_result(results, result)

        # 3. Empty password
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": TEST_USER_ID, "password": ""},
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Login with empty password")
        self._add_result(results, result)

        # 4. Both empty
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": "", "password": ""},
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Login with both empty")
        self._add_result(results, result)

        # 5. Wrong password
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": TEST_USER_ID, "password": "WrongPassword@123"},
            expected_status=401,
            category=TestCategory.AUTH,
            description="Login with wrong password")
        self._add_result(results, result)

        # 6. Non-existent user
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": "99999999", "password": "Password@123"},
            expected_status=401,
            category=TestCategory.AUTH,
            description="Login with non-existent user")
        self._add_result(results, result)

        # 7. Short password (less than minimum)
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": TEST_USER_ID, "password": "short"},
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Login with password too short")
        self._add_result(results, result)

        # 8. Special characters in userId
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": "<script>alert('xss')</script>", "password": "Password@123"},
            expected_status=400,
            category=TestCategory.EDGE_CASE,
            description="Login with XSS in userId")
        self._add_result(results, result)

        # 9. SQL injection attempt
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": "' OR '1'='1", "password": "Password@123"},
            expected_status=400,
            category=TestCategory.EDGE_CASE,
            description="Login with SQL injection attempt")
        self._add_result(results, result)

        # 10. Very long userId
        result = self._test_endpoint("post", "/api/v1/auth/login",
            data={"userId": "a" * 1000, "password": "Password@123"},
            expected_status=400,
            category=TestCategory.EDGE_CASE,
            description="Login with very long userId")
        self._add_result(results, result)

        # === GET /me TESTS ===

        # 11. Get current user with valid token
        result = self._test_endpoint("get", "/api/v1/auth/me",
            category=TestCategory.GET,
            description="Get current user info")
        self._add_result(results, result)

        # 12. Get /me without token
        result = self._test_endpoint("get", "/api/v1/auth/me",
            expected_status=403,
            category=TestCategory.AUTH,
            description="Get /me without token",
            headers={})
        self._add_result(results, result)

        # 13. Get /me with invalid token
        result = self._test_endpoint("get", "/api/v1/auth/me",
            expected_status=403,
            category=TestCategory.AUTH,
            description="Get /me with invalid token",
            headers={"Authorization": "Bearer invalidtoken123"})
        self._add_result(results, result)

        # 14. Get /me with malformed token
        result = self._test_endpoint("get", "/api/v1/auth/me",
            expected_status=403,
            category=TestCategory.EDGE_CASE,
            description="Get /me with malformed token",
            headers={"Authorization": "Bearer"})
        self._add_result(results, result)

        # === TOKEN DECODE TESTS ===

        # 15. Decode valid token
        result = self._test_endpoint("get", f"/api/v1/auth/decode-token?token={self.auth_token}",
            category=TestCategory.GET,
            description="Decode valid token")
        self._add_result(results, result)

        # 16. Decode invalid token
        result = self._test_endpoint("get", "/api/v1/auth/decode-token?token=invalidtoken",
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Decode invalid token")
        self._add_result(results, result)

        # 17. Decode empty token
        result = self._test_endpoint("get", "/api/v1/auth/decode-token?token=",
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Decode empty token")
        self._add_result(results, result)

        # 18. Decode without token param
        result = self._test_endpoint("get", "/api/v1/auth/decode-token",
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Decode without token param")
        self._add_result(results, result)

        # === GET PERMISSIONS TESTS ===

        # 19. Get permissions with valid token
        result = self._test_endpoint("get", "/api/v1/auth/get-permissions",
            category=TestCategory.GET,
            description="Get user permissions")
        self._add_result(results, result)

        # 20. Get permissions without token
        result = self._test_endpoint("get", "/api/v1/auth/get-permissions",
            expected_status=403,
            category=TestCategory.AUTH,
            description="Get permissions without token",
            headers={})
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # DEPARTMENT ROUTER TESTS (FULL CRUD)
    # ========================================================================

    def test_department_router(self) -> RouterTestResults:
        """Test Department Router - Full CRUD with all edge cases"""
        results = RouterTestResults("Department Router", "/api/v1/departments")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        created_id = None

        # === LIST TESTS ===

        # 1. List all departments
        result = self._test_endpoint("get", "/api/v1/departments/list",
            category=TestCategory.LIST,
            description="List all departments")
        self._add_result(results, result)

        # 2. List with pagination
        result = self._test_endpoint("get", "/api/v1/departments/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination (page 1, size 5)")
        self._add_result(results, result)

        # 3. List with page 2
        result = self._test_endpoint("get", "/api/v1/departments/list",
            params={"page": 2, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination (page 2)")
        self._add_result(results, result)

        # 4. List with large page size
        result = self._test_endpoint("get", "/api/v1/departments/list",
            params={"page": 1, "page_size": 100},
            category=TestCategory.LIST,
            description="List with large page size")
        self._add_result(results, result)

        # 5. List with invalid page (negative)
        result = self._test_endpoint("get", "/api/v1/departments/list",
            params={"page": -1, "page_size": 10},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="List with negative page number")
        self._add_result(results, result)

        # 6. List with zero page size
        result = self._test_endpoint("get", "/api/v1/departments/list",
            params={"page": 1, "page_size": 0},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="List with zero page size")
        self._add_result(results, result)

        # 7. List with search
        result = self._test_endpoint("get", "/api/v1/departments/list",
            params={"search": "Technical"},
            category=TestCategory.LIST,
            description="List with search filter")
        self._add_result(results, result)

        # === GET BY ID TESTS ===

        # 8. Get by valid ID
        if self.reference_ids.get("departmentId"):
            result = self._test_endpoint("get", f"/api/v1/departments/get/{self.reference_ids['departmentId']}",
                category=TestCategory.GET,
                description="Get department by valid ID")
            self._add_result(results, result)

        # 9. Get by invalid ID format
        result = self._test_endpoint("get", "/api/v1/departments/get/invalidid",
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Get by invalid ID format")
        self._add_result(results, result)

        # 10. Get by non-existent ID
        result = self._test_endpoint("get", "/api/v1/departments/get/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Get by non-existent ID")
        self._add_result(results, result)

        # 11. Get with special characters in ID
        result = self._test_endpoint("get", "/api/v1/departments/get/<script>alert(1)</script>",
            expected_status=400,
            category=TestCategory.EDGE_CASE,
            description="Get with XSS in ID")
        self._add_result(results, result)

        # === CREATE TESTS ===

        # 12. Create with valid data
        test_name = generate_unique_name("Test Dept")
        test_code = generate_unique_code("TD")
        test_data = {
            "name": test_name,
            "cctnsDepartmentCd": test_code
        }
        result = self._test_endpoint("post", "/api/v1/departments/create",
            data=test_data,
            expected_status=201,
            category=TestCategory.CREATE,
            description="Create department with valid data")
        self._add_result(results, result)

        if result.status == TestStatus.PASSED and result.response_data:
            created_id = result.response_data.get("data", {}).get("_id")
            if created_id:
                self._track_created_id("department", created_id)

        # 13. Create with empty name
        result = self._test_endpoint("post", "/api/v1/departments/create",
            data={"name": "", "cctnsDepartmentCd": "EMPTY001"},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        # 14. Create with missing name field
        result = self._test_endpoint("post", "/api/v1/departments/create",
            data={"cctnsDepartmentCd": "NONAME001"},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with missing name field")
        self._add_result(results, result)

        # 15. Create with duplicate name
        if self.reference_ids.get("departmentId"):
            # First get an existing name
            existing = self._make_request("get", f"/api/v1/departments/get/{self.reference_ids['departmentId']}")
            if existing.status_code == 200:
                existing_name = existing.json().get("data", {}).get("name", "Technical Services")
                result = self._test_endpoint("post", "/api/v1/departments/create",
                    data={"name": existing_name, "cctnsDepartmentCd": generate_unique_code("DUP")},
                    expected_status=409,
                    category=TestCategory.VALIDATION,
                    description="Create with duplicate name")
                self._add_result(results, result)

        # 16. Create with very long name
        result = self._test_endpoint("post", "/api/v1/departments/create",
            data={"name": "A" * 500, "cctnsDepartmentCd": "LONG001"},
            expected_status=422,
            category=TestCategory.EDGE_CASE,
            description="Create with very long name")
        self._add_result(results, result)

        # 17. Create with special characters
        result = self._test_endpoint("post", "/api/v1/departments/create",
            data={"name": "Test <script>alert('xss')</script>", "cctnsDepartmentCd": "XSS001"},
            expected_status=422,
            category=TestCategory.EDGE_CASE,
            description="Create with XSS in name")
        self._add_result(results, result)

        # 18. Create with whitespace only
        result = self._test_endpoint("post", "/api/v1/departments/create",
            data={"name": "   ", "cctnsDepartmentCd": "SPACE001"},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with whitespace-only name")
        self._add_result(results, result)

        # === UPDATE TESTS ===

        if created_id:
            # 19. Update with valid data
            updated_name = generate_unique_name("Updated Dept")
            result = self._test_endpoint("put", f"/api/v1/departments/update/{created_id}",
                data={"name": updated_name},
                category=TestCategory.UPDATE,
                description="Update department with valid data")
            self._add_result(results, result)

            # 20. Update with empty name
            result = self._test_endpoint("put", f"/api/v1/departments/update/{created_id}",
                data={"name": ""},
                expected_status=422,
                category=TestCategory.VALIDATION,
                description="Update with empty name")
            self._add_result(results, result)

        # 21. Update non-existent ID
        result = self._test_endpoint("put", "/api/v1/departments/update/000000000000000000000000",
            data={"name": "Test Update"},
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Update non-existent department")
        self._add_result(results, result)

        # 22. Update with invalid ID format
        result = self._test_endpoint("put", "/api/v1/departments/update/invalidid",
            data={"name": "Test Update"},
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Update with invalid ID format")
        self._add_result(results, result)

        # === DELETE TESTS ===

        if created_id:
            # 23. Soft delete department
            result = self._test_endpoint("delete", f"/api/v1/departments/delete/{created_id}",
                category=TestCategory.DELETE,
                description="Soft delete department")
            self._add_result(results, result)

            # 24. Try to get deleted department
            result = self._test_endpoint("get", f"/api/v1/departments/get/{created_id}",
                expected_status=404,
                category=TestCategory.DELETE,
                description="Get soft-deleted department")
            self._add_result(results, result)

            # 25. Restore department
            result = self._test_endpoint("patch", f"/api/v1/departments/restore/{created_id}",
                category=TestCategory.RESTORE,
                description="Restore deleted department")
            self._add_result(results, result)

            # 26. Get restored department
            result = self._test_endpoint("get", f"/api/v1/departments/get/{created_id}",
                category=TestCategory.GET,
                description="Get restored department")
            self._add_result(results, result)

            # 27. Delete again for final cleanup
            result = self._test_endpoint("delete", f"/api/v1/departments/delete/{created_id}",
                category=TestCategory.DELETE,
                description="Final delete for cleanup")
            self._add_result(results, result)

        # 28. Delete non-existent ID
        result = self._test_endpoint("delete", "/api/v1/departments/delete/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Delete non-existent department")
        self._add_result(results, result)

        # 29. Delete with invalid ID format
        result = self._test_endpoint("delete", "/api/v1/departments/delete/invalidid",
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Delete with invalid ID format")
        self._add_result(results, result)

        # 30. Restore non-existent ID
        result = self._test_endpoint("patch", "/api/v1/departments/restore/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Restore non-existent department")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # DISTRICT ROUTER TESTS (FULL CRUD)
    # ========================================================================

    def test_district_router(self) -> RouterTestResults:
        """Test District Router - Full CRUD with all edge cases"""
        results = RouterTestResults("District Router", "/api/v1/districts")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        created_id = None

        # === LIST TESTS ===
        result = self._test_endpoint("get", "/api/v1/districts/list",
            category=TestCategory.LIST,
            description="List all districts")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/districts/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/districts/list",
            params={"search": "Chittoor"},
            category=TestCategory.LIST,
            description="List with search")
        self._add_result(results, result)

        # === GET BY ID TESTS ===
        if self.reference_ids.get("districtId"):
            result = self._test_endpoint("get", f"/api/v1/districts/get/{self.reference_ids['districtId']}",
                category=TestCategory.GET,
                description="Get district by valid ID")
            self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/districts/get/invalidid",
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Get by invalid ID format")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/districts/get/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Get by non-existent ID")
        self._add_result(results, result)

        # === CREATE TESTS ===
        test_name = generate_unique_name("Test District")
        test_code = str(random.randint(8000, 9999))
        test_data = {
            "name": test_name,
            "cctnsDistrictCd": test_code,
            "stateName": "Andhra Pradesh"
        }
        result = self._test_endpoint("post", "/api/v1/districts/create",
            data=test_data,
            expected_status=201,
            category=TestCategory.CREATE,
            description="Create district with valid data")
        self._add_result(results, result)

        if result.status == TestStatus.PASSED and result.response_data:
            created_id = result.response_data.get("data", {}).get("_id")
            if created_id:
                self._track_created_id("district", created_id)

        # Create validation tests
        result = self._test_endpoint("post", "/api/v1/districts/create",
            data={"name": "", "cctnsDistrictCd": "1234", "stateName": "Test"},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        result = self._test_endpoint("post", "/api/v1/districts/create",
            data={"cctnsDistrictCd": "1234", "stateName": "Test"},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with missing name")
        self._add_result(results, result)

        result = self._test_endpoint("post", "/api/v1/districts/create",
            data={"name": "Test District", "stateName": "Test"},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with missing CCTNS code")
        self._add_result(results, result)

        # === UPDATE TESTS ===
        if created_id:
            result = self._test_endpoint("put", f"/api/v1/districts/update/{created_id}",
                data={"name": generate_unique_name("Updated District")},
                category=TestCategory.UPDATE,
                description="Update district with valid data")
            self._add_result(results, result)

            result = self._test_endpoint("put", f"/api/v1/districts/update/{created_id}",
                data={"name": ""},
                expected_status=422,
                category=TestCategory.VALIDATION,
                description="Update with empty name")
            self._add_result(results, result)

        result = self._test_endpoint("put", "/api/v1/districts/update/000000000000000000000000",
            data={"name": "Test"},
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Update non-existent district")
        self._add_result(results, result)

        # === DELETE/RESTORE TESTS ===
        if created_id:
            result = self._test_endpoint("delete", f"/api/v1/districts/delete/{created_id}",
                category=TestCategory.DELETE,
                description="Soft delete district")
            self._add_result(results, result)

            result = self._test_endpoint("patch", f"/api/v1/districts/restore/{created_id}",
                category=TestCategory.RESTORE,
                description="Restore district")
            self._add_result(results, result)

            # Final cleanup
            self._make_request("delete", f"/api/v1/districts/delete/{created_id}")

        result = self._test_endpoint("delete", "/api/v1/districts/delete/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Delete non-existent district")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # RANK ROUTER TESTS (FULL CRUD)
    # ========================================================================

    def test_rank_router(self) -> RouterTestResults:
        """Test Rank Router - Full CRUD with all edge cases"""
        results = RouterTestResults("Rank Router", "/api/v1/ranks")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        created_id = None

        # === LIST TESTS ===
        result = self._test_endpoint("get", "/api/v1/ranks/list",
            category=TestCategory.LIST,
            description="List all ranks")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/ranks/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/ranks/list",
            params={"page": 1, "page_size": 5, "search": "Inspector"},
            category=TestCategory.LIST,
            description="List with search")
        self._add_result(results, result)

        # === GET BY ID TESTS ===
        if self.reference_ids.get("rankId"):
            result = self._test_endpoint("get", f"/api/v1/ranks/get/{self.reference_ids['rankId']}",
                category=TestCategory.GET,
                description="Get rank by valid ID")
            self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/ranks/get/invalidid",
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Get by invalid ID format")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/ranks/get/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Get by non-existent ID")
        self._add_result(results, result)

        # === CREATE TESTS ===
        test_name = generate_unique_name("Test Rank")
        test_data = {
            "name": test_name,
            "shortCode": generate_unique_code("TR"),
            "cctnsRankCd": random.randint(90000, 99999)
        }
        result = self._test_endpoint("post", "/api/v1/ranks/create",
            data=test_data,
            expected_status=201,
            category=TestCategory.CREATE,
            description="Create rank with valid data")
        self._add_result(results, result)

        if result.status == TestStatus.PASSED and result.response_data:
            created_id = result.response_data.get("data", {}).get("_id")
            if created_id:
                self._track_created_id("rank", created_id)

        result = self._test_endpoint("post", "/api/v1/ranks/create",
            data={"name": "", "shortCode": "TST", "cctnsRankCd": 99998},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        result = self._test_endpoint("post", "/api/v1/ranks/create",
            data={"shortCode": "TST", "cctnsRankCd": 99998},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with missing name")
        self._add_result(results, result)

        # === UPDATE TESTS ===
        if created_id:
            result = self._test_endpoint("put", f"/api/v1/ranks/update/{created_id}",
                data={"name": generate_unique_name("Updated Rank")},
                category=TestCategory.UPDATE,
                description="Update rank with valid data")
            self._add_result(results, result)

            result = self._test_endpoint("put", f"/api/v1/ranks/update/{created_id}",
                data={"name": ""},
                expected_status=422,
                category=TestCategory.VALIDATION,
                description="Update with empty name")
            self._add_result(results, result)

        result = self._test_endpoint("put", "/api/v1/ranks/update/000000000000000000000000",
            data={"name": "Test"},
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Update non-existent rank")
        self._add_result(results, result)

        # === DELETE/RESTORE TESTS ===
        if created_id:
            result = self._test_endpoint("delete", f"/api/v1/ranks/delete/{created_id}",
                category=TestCategory.DELETE,
                description="Soft delete rank")
            self._add_result(results, result)

            result = self._test_endpoint("patch", f"/api/v1/ranks/restore/{created_id}",
                category=TestCategory.RESTORE,
                description="Restore rank")
            self._add_result(results, result)

            # Final cleanup
            self._make_request("delete", f"/api/v1/ranks/delete/{created_id}")

        self.router_results.append(results)
        return results

    # ========================================================================
    # PERSONNEL ROUTER TESTS
    # ========================================================================

    def test_personnel_router(self) -> RouterTestResults:
        """Test Personnel Master Router"""
        results = RouterTestResults("Personnel Master Router", "/api/v1/personnel-master")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        # === LIST TESTS ===
        result = self._test_endpoint("get", "/api/v1/personnel-master/list",
            category=TestCategory.LIST,
            description="List all personnel")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/personnel-master/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/personnel-master/list",
            params={"page": 1, "page_size": 10, "search": "admin"},
            category=TestCategory.LIST,
            description="List with search")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/personnel-master/list",
            params={"page": -1, "page_size": 5},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="List with invalid page")
        self._add_result(results, result)

        # === GET BY ID TESTS ===
        if self.reference_ids.get("personnelId"):
            result = self._test_endpoint("get", f"/api/v1/personnel-master/{self.reference_ids['personnelId']}",
                category=TestCategory.GET,
                description="Get personnel by valid ID")
            self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/personnel-master/invalidid",
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Get by invalid ID format")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/personnel-master/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Get by non-existent ID")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # UNIT ROUTER TESTS
    # ========================================================================

    def test_unit_router(self) -> RouterTestResults:
        """Test Unit Router"""
        results = RouterTestResults("Unit Router", "/api/v1/units")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        # === LIST TESTS ===
        result = self._test_endpoint("get", "/api/v1/units/list",
            category=TestCategory.LIST,
            description="List all units")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/units/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/units/list-minimal",
            category=TestCategory.LIST,
            description="List minimal units")
        self._add_result(results, result)

        # === GET BY ID TESTS ===
        if self.reference_ids.get("unitId"):
            result = self._test_endpoint("get", f"/api/v1/units/get/{self.reference_ids['unitId']}",
                category=TestCategory.GET,
                description="Get unit by valid ID")
            self._add_result(results, result)

            result = self._test_endpoint("get", f"/api/v1/units/unit-hierarchy/{self.reference_ids['unitId']}",
                category=TestCategory.GET,
                description="Get unit hierarchy")
            self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/units/get/invalidid",
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Get by invalid ID format")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/units/get/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Get by non-existent ID")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # MANDAL ROUTER TESTS
    # ========================================================================

    def test_mandal_router(self) -> RouterTestResults:
        """Test Mandal Router"""
        results = RouterTestResults("Mandal Router", "/api/v1/mandals")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        created_id = None

        result = self._test_endpoint("get", "/api/v1/mandals/list",
            category=TestCategory.LIST,
            description="List all mandals")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/mandals/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        # Create mandal
        if self.reference_ids.get("districtId"):
            test_data = {
                "mandalName": generate_unique_name("Test Mandal"),
                "districtId": self.reference_ids["districtId"]
            }
            result = self._test_endpoint("post", "/api/v1/mandals/create",
                data=test_data,
                expected_status=201,
                category=TestCategory.CREATE,
                description="Create mandal with valid data")
            self._add_result(results, result)

            if result.status == TestStatus.PASSED and result.response_data:
                created_id = result.response_data.get("data", {}).get("_id")
                if created_id:
                    self._track_created_id("mandal", created_id)

        result = self._test_endpoint("post", "/api/v1/mandals/create",
            data={"mandalName": ""},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        if created_id:
            result = self._test_endpoint("delete", f"/api/v1/mandals/delete/{created_id}",
                category=TestCategory.DELETE,
                description="Delete mandal")
            self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # DESIGNATION ROUTER TESTS
    # ========================================================================

    def test_designation_router(self) -> RouterTestResults:
        """Test Designation Router"""
        results = RouterTestResults("Designation Router", "/api/v1/designation-master")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        created_id = None

        result = self._test_endpoint("get", "/api/v1/designation-master/list",
            category=TestCategory.LIST,
            description="List all designations")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/designation-master/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        # Create designation
        test_data = {
            "name": generate_unique_name("Test Designation"),
            "designationCd": generate_unique_code("TD")
        }
        result = self._test_endpoint("post", "/api/v1/designation-master/create",
            data=test_data,
            expected_status=201,
            category=TestCategory.CREATE,
            description="Create designation")
        self._add_result(results, result)

        if result.status == TestStatus.PASSED and result.response_data:
            created_id = result.response_data.get("data", {}).get("_id")
            if created_id:
                self._track_created_id("designation", created_id)

        result = self._test_endpoint("post", "/api/v1/designation-master/create",
            data={"name": ""},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        if created_id:
            result = self._test_endpoint("delete", f"/api/v1/designation-master/delete/{created_id}",
                category=TestCategory.DELETE,
                description="Delete designation")
            self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # UNIT TYPE ROUTER TESTS
    # ========================================================================

    def test_unit_type_router(self) -> RouterTestResults:
        """Test Unit Type Router"""
        results = RouterTestResults("Unit Type Router", "/api/v1/unit-types")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        created_id = None

        result = self._test_endpoint("get", "/api/v1/unit-types/list",
            category=TestCategory.LIST,
            description="List all unit types")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/unit-types/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        # Create unit type
        if self.reference_ids.get("departmentId"):
            test_data = {
                "name": generate_unique_name("Test Unit Type"),
                "departmentId": self.reference_ids["departmentId"],
                "level": random.randint(90, 99)
            }
            result = self._test_endpoint("post", "/api/v1/unit-types/create",
                data=test_data,
                expected_status=201,
                category=TestCategory.CREATE,
                description="Create unit type")
            self._add_result(results, result)

            if result.status == TestStatus.PASSED and result.response_data:
                created_id = result.response_data.get("data", {}).get("_id")
                if created_id:
                    self._track_created_id("unitType", created_id)

        result = self._test_endpoint("post", "/api/v1/unit-types/create",
            data={"name": ""},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        if created_id:
            result = self._test_endpoint("delete", f"/api/v1/unit-types/delete/{created_id}",
                category=TestCategory.DELETE,
                description="Delete unit type")
            self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # UNIT VILLAGES ROUTER TESTS
    # ========================================================================

    def test_unit_villages_router(self) -> RouterTestResults:
        """Test Unit Villages Router"""
        results = RouterTestResults("Unit Villages Router", "/api/v1/unit-villages")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/unit-villages/list",
            category=TestCategory.LIST,
            description="List all unit villages")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/unit-villages/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # ROLE ROUTER TESTS
    # ========================================================================

    def test_role_router(self) -> RouterTestResults:
        """Test Role Router"""
        results = RouterTestResults("Role Router", "/api/v1/roles")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        created_id = None

        result = self._test_endpoint("get", "/api/v1/roles/list",
            category=TestCategory.LIST,
            description="List all roles")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/roles/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        if self.reference_ids.get("roleId"):
            result = self._test_endpoint("get", f"/api/v1/roles/get/{self.reference_ids['roleId']}",
                category=TestCategory.GET,
                description="Get role by ID")
            self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/roles/get/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Get non-existent role")
        self._add_result(results, result)

        # Create role - requires permissions list
        if self.reference_ids.get("permissionId"):
            test_data = {
                "name": generate_unique_name("Test Role"),
                "shortCode": generate_unique_code("TR"),
                "description": "API Test Role",
                "permissions": [self.reference_ids["permissionId"]]
            }
            result = self._test_endpoint("post", "/api/v1/roles/create",
                data=test_data,
                expected_status=201,
                category=TestCategory.CREATE,
                description="Create role with permissions")
            self._add_result(results, result)

            if result.status == TestStatus.PASSED and result.response_data:
                created_id = result.response_data.get("data", {}).get("_id")
                if created_id:
                    self._track_created_id("role", created_id)

        # Validation tests
        result = self._test_endpoint("post", "/api/v1/roles/create",
            data={"name": "", "permissions": []},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        result = self._test_endpoint("post", "/api/v1/roles/create",
            data={"name": "Test Role", "permissions": []},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty permissions")
        self._add_result(results, result)

        if created_id:
            result = self._test_endpoint("delete", f"/api/v1/roles/delete/{created_id}",
                category=TestCategory.DELETE,
                description="Delete role")
            self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # PERMISSION ROUTER TESTS
    # ========================================================================

    def test_permission_router(self) -> RouterTestResults:
        """Test Permission Router"""
        results = RouterTestResults("Permission Router", "/api/v1/permissions")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/permissions/list",
            category=TestCategory.LIST,
            description="List all permissions")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/permissions/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        # Create permission (may have schema issues)
        test_data = {
            "name": generate_unique_name("Test Permission"),
            "shortCode": generate_unique_code("TP"),
            "description": "API Test Permission"
        }
        result = self._test_endpoint("post", "/api/v1/permissions/create",
            data=test_data,
            expected_status=201,
            category=TestCategory.CREATE,
            description="Create permission")
        self._add_result(results, result)

        result = self._test_endpoint("post", "/api/v1/permissions/create",
            data={"name": ""},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # JOB ROUTER TESTS
    # ========================================================================

    def test_job_router(self) -> RouterTestResults:
        """Test Job Router"""
        results = RouterTestResults("Job Router", "/api/v1/jobs")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/jobs/list",
            category=TestCategory.LIST,
            description="List all jobs")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/jobs/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        if self.reference_ids.get("jobId"):
            result = self._test_endpoint("get", f"/api/v1/jobs/get/{self.reference_ids['jobId']}",
                category=TestCategory.GET,
                description="Get job by ID")
            self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/jobs/get/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Get non-existent job")
        self._add_result(results, result)

        # Create job (may have schema issues)
        test_data = {
            "name": f"API_TEST_JOB_{TEST_RUN_ID}",
            "shortCode": generate_unique_code("TJ"),
            "description": "API Test Job",
            "displayName": f"ApiTestJob{TEST_RUN_ID}",
            "route": f"api-test-jobs-{TEST_RUN_ID}",
            "menuEligible": True,
            "displayOrder": 999
        }
        result = self._test_endpoint("post", "/api/v1/jobs/create",
            data=test_data,
            expected_status=201,
            category=TestCategory.CREATE,
            description="Create job")
        self._add_result(results, result)

        result = self._test_endpoint("post", "/api/v1/jobs/create",
            data={"name": ""},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # USER ROLE PERMISSIONS ROUTER TESTS
    # ========================================================================

    def test_user_role_permissions_router(self) -> RouterTestResults:
        """Test User Role Permissions Router"""
        results = RouterTestResults("User Role Permissions Router", "/api/v1/user-role-permissions")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/user-role-permissions/list",
            category=TestCategory.LIST,
            description="List all user role permissions")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/user-role-permissions/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # MODULE ROUTER TESTS
    # ========================================================================

    def test_module_router(self) -> RouterTestResults:
        """Test Module Router"""
        results = RouterTestResults("Module Router", "/api/v1/modules")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/modules/list",
            category=TestCategory.LIST,
            description="List all modules")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/modules/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        if self.reference_ids.get("moduleId"):
            result = self._test_endpoint("get", f"/api/v1/modules/get/{self.reference_ids['moduleId']}",
                category=TestCategory.GET,
                description="Get module by ID")
            self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/modules/get/000000000000000000000000",
            expected_status=404,
            category=TestCategory.ERROR_HANDLING,
            description="Get non-existent module")
        self._add_result(results, result)

        # Create module
        test_data = {
            "name": generate_unique_name("Test Module"),
            "shortCode": generate_unique_code("TM"),
            "description": "API Test Module"
        }
        result = self._test_endpoint("post", "/api/v1/modules/create",
            data=test_data,
            expected_status=201,
            category=TestCategory.CREATE,
            description="Create module")
        self._add_result(results, result)

        result = self._test_endpoint("post", "/api/v1/modules/create",
            data={"name": ""},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty name")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # VALUE SET ROUTER TESTS
    # ========================================================================

    def test_value_set_router(self) -> RouterTestResults:
        """Test Value Set Router"""
        results = RouterTestResults("Value Set Router", "/api/v1/value-sets")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/value-sets/list",
            category=TestCategory.LIST,
            description="List all value sets")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/value-sets/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        # Create value set
        test_data = {
            "key": f"apiTestKey{TEST_RUN_ID}",
            "module": "Core",
            "description": "API Test Value Set",
            "items": [
                {"code": "TEST1", "labels": {"en": "Test One"}},
                {"code": "TEST2", "labels": {"en": "Test Two"}}
            ]
        }
        result = self._test_endpoint("post", "/api/v1/value-sets/create",
            data=test_data,
            expected_status=201,
            category=TestCategory.CREATE,
            description="Create value set")
        self._add_result(results, result)

        result = self._test_endpoint("post", "/api/v1/value-sets/create",
            data={"key": ""},
            expected_status=422,
            category=TestCategory.VALIDATION,
            description="Create with empty key")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # ERROR MASTER ROUTER TESTS
    # ========================================================================

    def test_error_master_router(self) -> RouterTestResults:
        """Test Error Master Router"""
        results = RouterTestResults("Error Master Router", "/api/v1/error-master")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/error-master/list",
            category=TestCategory.LIST,
            description="List all error masters")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/error-master/list",
            params={"page": 1, "pageSize": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # ERROR LOGS ROUTER TESTS
    # ========================================================================

    def test_error_logs_router(self) -> RouterTestResults:
        """Test Error Logs Router"""
        results = RouterTestResults("Error Logs Router", "/api/v1/error-logs")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/error-logs/list",
            category=TestCategory.LIST,
            description="List all error logs")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/error-logs/list",
            params={"page": 1, "pageSize": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # PROMPTS ROUTER TESTS
    # ========================================================================

    def test_prompts_router(self) -> RouterTestResults:
        """Test Prompts Router"""
        results = RouterTestResults("Prompts Router", "/api/v1/prompts")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/prompts/list",
            category=TestCategory.LIST,
            description="List all prompts")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/prompts/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        if self.reference_ids.get("promptId"):
            result = self._test_endpoint("get", f"/api/v1/prompts/get/{self.reference_ids['promptId']}",
                category=TestCategory.GET,
                description="Get prompt by ID")
            self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # APPROVAL FLOW MASTER ROUTER TESTS
    # ========================================================================

    def test_approval_flow_master_router(self) -> RouterTestResults:
        """Test Approval Flow Master Router"""
        results = RouterTestResults("Approval Flow Master Router", "/api/v1/approval-flow-master")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/approval-flow-master/list",
            category=TestCategory.LIST,
            description="List all approval flow masters")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/approval-flow-master/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # APPROVAL CHAIN ROUTER TESTS
    # ========================================================================

    def test_approval_chain_router(self) -> RouterTestResults:
        """Test Approval Chain Router"""
        results = RouterTestResults("Approval Chain Router", "/api/v1/approval-chain")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/approval-chain/list",
            category=TestCategory.LIST,
            description="List all approval chains")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/approval-chain/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # MODULE HIERARCHY ROUTER TESTS
    # ========================================================================

    def test_module_hierarchy_router(self) -> RouterTestResults:
        """Test Module Hierarchy Router"""
        results = RouterTestResults("Module Hierarchy Router", "/api/v1/module-hierarchy")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/module-hierarchy/get",
            category=TestCategory.GET,
            description="Get module hierarchy")
        self._add_result(results, result)

        if self.reference_ids.get("moduleId"):
            result = self._test_endpoint("get", "/api/v1/module-hierarchy/get",
                params={"moduleId": self.reference_ids["moduleId"]},
                category=TestCategory.GET,
                description="Get hierarchy with moduleId filter")
            self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/module-hierarchy/get",
            params={"moduleId": "invalidid"},
            expected_status=400,
            category=TestCategory.VALIDATION,
            description="Get with invalid moduleId")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # PERMISSIONS MAPPING ROUTER TESTS
    # ========================================================================

    def test_permissions_mapping_router(self) -> RouterTestResults:
        """Test Permissions Mapping Router"""
        results = RouterTestResults("Permissions Mapping Router", "/api/v1/permissions-mapping")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/permissions-mapping/list",
            category=TestCategory.LIST,
            description="List all permissions mappings")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/permissions-mapping/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # FEEDBACK ROUTER TESTS
    # ========================================================================

    def test_feedback_router(self) -> RouterTestResults:
        """Test Feedback Router"""
        results = RouterTestResults("Feedback Router", "/api/v1/feedbacks")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/feedbacks/list",
            category=TestCategory.LIST,
            description="List all feedbacks")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/feedbacks/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # FEEDBACK MASTER ROUTER TESTS
    # ========================================================================

    def test_feedback_master_router(self) -> RouterTestResults:
        """Test Feedback Master Router"""
        results = RouterTestResults("Feedback Master Router", "/api/v1/feedback-master")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/feedback-master/list",
            category=TestCategory.LIST,
            description="List all feedback masters")
        self._add_result(results, result)

        result = self._test_endpoint("get", "/api/v1/feedback-master/list",
            params={"page": 1, "page_size": 5},
            category=TestCategory.LIST,
            description="List with pagination")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # TEST MASTER ROUTER TESTS
    # ========================================================================

    def test_test_master_router(self) -> RouterTestResults:
        """Test Test Master Router"""
        results = RouterTestResults("Test Master Router", "/api/v1/test-master")
        print(f"\n{'='*60}")
        print(f"Testing: {results.router_name}")
        print(f"{'='*60}")

        result = self._test_endpoint("get", "/api/v1/test-master/list",
            category=TestCategory.LIST,
            description="List all test masters")
        self._add_result(results, result)

        self.router_results.append(results)
        return results

    # ========================================================================
    # RUN ALL TESTS
    # ========================================================================

    def run_all_tests(self):
        """Run all router tests"""
        self.test_start_time = datetime.now()

        print("\n" + "="*60)
        print("UC2 CORE API - COMPREHENSIVE TEST SUITE")
        print("="*60)
        print(f"Base URL: {self.base_url}")
        print(f"Test User: {TEST_USER_ID}")
        print(f"Test Run ID: {TEST_RUN_ID}")
        print(f"Started: {self.test_start_time.strftime('%Y-%m-%d %H:%M:%S')}")

        # Authenticate
        if not self.authenticate():
            print("\n[FATAL] Authentication failed. Cannot proceed with tests.")
            return

        # Fetch reference IDs
        self._fetch_reference_ids()

        # Run all router tests
        self.test_auth_router()
        self.test_personnel_router()
        self.test_unit_router()
        self.test_department_router()
        self.test_district_router()
        self.test_rank_router()
        self.test_mandal_router()
        self.test_designation_router()
        self.test_unit_type_router()
        self.test_unit_villages_router()
        self.test_role_router()
        self.test_permission_router()
        self.test_job_router()
        self.test_user_role_permissions_router()
        self.test_module_router()
        self.test_value_set_router()
        self.test_error_master_router()
        self.test_error_logs_router()
        self.test_prompts_router()
        self.test_approval_flow_master_router()
        self.test_approval_chain_router()
        self.test_module_hierarchy_router()
        self.test_permissions_mapping_router()
        self.test_feedback_router()
        self.test_feedback_master_router()
        self.test_test_master_router()

        # Cleanup created records
        self._cleanup_created_records()

        # Generate report
        self.generate_report()

    # ========================================================================
    # REPORT GENERATION
    # ========================================================================

    def generate_report(self):
        """Generate HTML test report"""
        total_tests = sum(r.total_tests for r in self.router_results)
        total_passed = sum(r.passed_tests for r in self.router_results)
        total_failed = sum(r.failed_tests for r in self.router_results)
        total_warnings = sum(r.warning_tests for r in self.router_results)
        pass_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0

        # Calculate test duration
        duration = datetime.now() - self.test_start_time
        duration_str = f"{duration.seconds // 60}m {duration.seconds % 60}s"

        # Category breakdown
        category_stats = {}
        for router in self.router_results:
            for result in router.results:
                cat = result.category.value
                if cat not in category_stats:
                    category_stats[cat] = {"passed": 0, "failed": 0, "total": 0}
                category_stats[cat]["total"] += 1
                if result.status == TestStatus.PASSED:
                    category_stats[cat]["passed"] += 1
                elif result.status == TestStatus.FAILED:
                    category_stats[cat]["failed"] += 1

        # Print summary to console
        print("\n" + "="*60)
        print("TEST SUMMARY")
        print("="*60)
        print(f"Duration: {duration_str}")
        print(f"Total Routers: {len(self.router_results)}")
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {total_passed}")
        print(f"Failed: {total_failed}")
        print(f"Warnings: {total_warnings}")
        print(f"Pass Rate: {pass_rate:.1f}%")
        print("\nBy Category:")
        for cat, stats in category_stats.items():
            print(f"  {cat}: {stats['passed']}/{stats['total']} passed")

        # Generate HTML report
        html_content = self._generate_html_report(
            total_tests, total_passed, total_failed, total_warnings, pass_rate, duration_str, category_stats
        )

        # Write to file
        report_path = "api_test_report.html"
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        print(f"\nHTML Report generated: {report_path}")

    def _generate_html_report(self, total_tests, total_passed, total_failed, total_warnings, pass_rate, duration_str, category_stats):
        """Generate comprehensive HTML report"""

        # Generate router cards
        router_cards = ""
        for router in self.router_results:
            badge_class = "pass" if router.failed_tests == 0 else ("partial" if router.failed_tests < router.total_tests / 2 else "fail")
            badge_text = "PASS" if router.failed_tests == 0 else f"{router.passed_tests}/{router.total_tests}"

            endpoints_html = ""
            for result in router.results:
                status_icon = "&#9989;" if result.status == TestStatus.PASSED else ("&#9888;" if result.status == TestStatus.WARNING else "&#10060;")
                method_class = result.method.lower()
                category_badge = f'<span class="category-badge {result.category.value}">{result.category.value}</span>'
                endpoints_html += f'''
                <div class="endpoint">
                    <span class="endpoint-method {method_class}">{result.method}</span>
                    <span class="endpoint-path" title="{result.endpoint}">{result.endpoint[:60]}{'...' if len(result.endpoint) > 60 else ''}</span>
                    {category_badge}
                    <span class="endpoint-status">{status_icon}</span>
                </div>'''

            router_cards += f'''
            <div class="router-card">
                <div class="router-header">
                    <div>
                        <div class="router-name">{router.router_name}</div>
                        <div class="router-path">{router.base_path}</div>
                    </div>
                    <span class="router-badge {badge_class}">{badge_text}</span>
                </div>
                <div class="router-stats">
                    <div class="stat"><div class="stat-icon pass">&#10003;</div><span>{router.passed_tests} Passed</span></div>
                    <div class="stat"><div class="stat-icon fail">&#10007;</div><span>{router.failed_tests} Failed</span></div>
                    <div class="stat"><div class="stat-icon warn">!</div><span>{router.warning_tests} Warnings</span></div>
                </div>
                <div class="router-endpoints">{endpoints_html}</div>
            </div>'''

        # Generate failed tests section
        failed_tests_html = ""
        for router in self.router_results:
            for result in router.results:
                if result.status == TestStatus.FAILED:
                    error_details = json.dumps(result.response_data, indent=2) if result.response_data else result.error or "No details"
                    failed_tests_html += f'''
                    <div class="issue-item">
                        <div class="issue-header">
                            <span class="issue-title">{result.method} {result.endpoint[:80]}</span>
                            <span class="issue-category">{result.category.value}</span>
                        </div>
                        <div class="issue-desc">Expected: {result.expected_status} | Got: {result.status_code} | {result.description}</div>
                        <div class="issue-code">{error_details[:800]}</div>
                    </div>'''

        if not failed_tests_html:
            failed_tests_html = '<div class="issue-item success"><div class="issue-title">All tests passed!</div></div>'

        # Generate category breakdown
        category_html = ""
        for cat, stats in category_stats.items():
            pct = (stats['passed'] / stats['total'] * 100) if stats['total'] > 0 else 0
            category_html += f'''
            <div class="category-stat">
                <span class="cat-name">{cat}</span>
                <span class="cat-bar"><span class="cat-fill" style="width: {pct}%"></span></span>
                <span class="cat-count">{stats['passed']}/{stats['total']}</span>
            </div>'''

        html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UC2 Core API - Comprehensive Test Report</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%); min-height: 100vh; color: #fff; padding: 20px; }}
        .container {{ max-width: 1600px; margin: 0 auto; }}
        .header {{ text-align: center; padding: 40px 20px; background: rgba(255,255,255,0.03); border-radius: 20px; margin-bottom: 30px; border: 1px solid rgba(255,255,255,0.1); }}
        .header h1 {{ font-size: 2.5rem; margin-bottom: 10px; background: linear-gradient(90deg, #00d4ff, #7c3aed, #f97316); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }}
        .header .subtitle {{ color: #888; font-size: 1.1rem; margin-bottom: 20px; }}
        .header .test-info {{ display: flex; justify-content: center; gap: 30px; flex-wrap: wrap; }}
        .header .test-info span {{ color: #aaa; font-size: 0.9rem; padding: 5px 15px; background: rgba(255,255,255,0.05); border-radius: 20px; }}
        .summary-cards {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; margin-bottom: 30px; }}
        @media (max-width: 1200px) {{ .summary-cards {{ grid-template-columns: repeat(3, 1fr); }} }}
        @media (max-width: 768px) {{ .summary-cards {{ grid-template-columns: repeat(2, 1fr); }} }}
        .summary-card {{ background: rgba(255,255,255,0.03); border-radius: 15px; padding: 20px; text-align: center; border: 1px solid rgba(255,255,255,0.1); }}
        .summary-card.total {{ border-left: 4px solid #00d4ff; }}
        .summary-card.passed {{ border-left: 4px solid #10b981; }}
        .summary-card.failed {{ border-left: 4px solid #ef4444; }}
        .summary-card.warnings {{ border-left: 4px solid #f59e0b; }}
        .summary-card.duration {{ border-left: 4px solid #8b5cf6; }}
        .summary-card .number {{ font-size: 2.5rem; font-weight: bold; margin-bottom: 5px; }}
        .summary-card.total .number {{ color: #00d4ff; }}
        .summary-card.passed .number {{ color: #10b981; }}
        .summary-card.failed .number {{ color: #ef4444; }}
        .summary-card.warnings .number {{ color: #f59e0b; }}
        .summary-card.duration .number {{ color: #8b5cf6; font-size: 1.8rem; }}
        .summary-card .label {{ color: #888; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; }}
        .progress-bar {{ background: rgba(255,255,255,0.1); border-radius: 10px; height: 24px; margin: 20px 0; overflow: hidden; }}
        .progress-fill {{ height: 100%; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 10px; width: {pass_rate}%; transition: width 0.5s; }}
        .progress-label {{ text-align: center; margin-top: 10px; color: #10b981; font-size: 1.3rem; font-weight: bold; }}
        .category-breakdown {{ background: rgba(255,255,255,0.03); border-radius: 15px; padding: 25px; margin-bottom: 30px; border: 1px solid rgba(255,255,255,0.1); }}
        .category-breakdown h3 {{ margin-bottom: 20px; color: #00d4ff; }}
        .category-stat {{ display: flex; align-items: center; margin-bottom: 12px; }}
        .cat-name {{ width: 120px; color: #aaa; font-size: 0.9rem; text-transform: capitalize; }}
        .cat-bar {{ flex: 1; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; margin: 0 15px; overflow: hidden; }}
        .cat-fill {{ height: 100%; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 4px; }}
        .cat-count {{ width: 60px; text-align: right; color: #888; font-size: 0.85rem; }}
        .section-title {{ font-size: 1.4rem; margin: 30px 0 20px; padding-bottom: 10px; border-bottom: 2px solid rgba(255,255,255,0.1); color: #fff; }}
        .router-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-bottom: 30px; }}
        .router-card {{ background: rgba(255,255,255,0.03); border-radius: 15px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }}
        .router-header {{ padding: 18px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); }}
        .router-name {{ font-size: 1.05rem; font-weight: 600; }}
        .router-path {{ font-size: 0.75rem; color: #888; margin-top: 4px; font-family: monospace; }}
        .router-badge {{ padding: 5px 15px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }}
        .router-badge.pass {{ background: rgba(16, 185, 129, 0.2); color: #10b981; }}
        .router-badge.fail {{ background: rgba(239, 68, 68, 0.2); color: #ef4444; }}
        .router-badge.partial {{ background: rgba(245, 158, 11, 0.2); color: #f59e0b; }}
        .router-stats {{ display: flex; padding: 12px 20px; gap: 20px; background: rgba(0,0,0,0.15); }}
        .stat {{ display: flex; align-items: center; gap: 6px; font-size: 0.85rem; }}
        .stat-icon {{ width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; }}
        .stat-icon.pass {{ background: #10b981; }}
        .stat-icon.fail {{ background: #ef4444; }}
        .stat-icon.warn {{ background: #f59e0b; }}
        .router-endpoints {{ padding: 12px 20px; max-height: 300px; overflow-y: auto; }}
        .endpoint {{ display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.03); gap: 8px; }}
        .endpoint:last-child {{ border-bottom: none; }}
        .endpoint-method {{ padding: 2px 6px; border-radius: 3px; font-size: 0.65rem; font-weight: 600; min-width: 45px; text-align: center; }}
        .endpoint-method.get {{ background: #3b82f6; }}
        .endpoint-method.post {{ background: #10b981; }}
        .endpoint-method.put {{ background: #f59e0b; }}
        .endpoint-method.patch {{ background: #8b5cf6; }}
        .endpoint-method.delete {{ background: #ef4444; }}
        .endpoint-path {{ flex: 1; font-family: monospace; font-size: 0.75rem; color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
        .category-badge {{ padding: 2px 6px; border-radius: 3px; font-size: 0.6rem; background: rgba(255,255,255,0.1); color: #888; text-transform: uppercase; }}
        .category-badge.list {{ background: rgba(59, 130, 246, 0.2); color: #3b82f6; }}
        .category-badge.get {{ background: rgba(16, 185, 129, 0.2); color: #10b981; }}
        .category-badge.create {{ background: rgba(139, 92, 246, 0.2); color: #8b5cf6; }}
        .category-badge.update {{ background: rgba(245, 158, 11, 0.2); color: #f59e0b; }}
        .category-badge.delete {{ background: rgba(239, 68, 68, 0.2); color: #ef4444; }}
        .category-badge.validation {{ background: rgba(236, 72, 153, 0.2); color: #ec4899; }}
        .category-badge.edge_case {{ background: rgba(249, 115, 22, 0.2); color: #f97316; }}
        .category-badge.auth {{ background: rgba(34, 211, 238, 0.2); color: #22d3ee; }}
        .endpoint-status {{ font-size: 1rem; }}
        .issues-section {{ background: rgba(239, 68, 68, 0.08); border-radius: 15px; padding: 25px; margin-bottom: 30px; border: 1px solid rgba(239, 68, 68, 0.2); }}
        .issues-section h3 {{ color: #ef4444; margin-bottom: 20px; }}
        .issue-item {{ background: rgba(0,0,0,0.2); border-radius: 10px; padding: 15px; margin-bottom: 12px; border-left: 3px solid #ef4444; }}
        .issue-item.success {{ border-left-color: #10b981; }}
        .issue-item:last-child {{ margin-bottom: 0; }}
        .issue-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }}
        .issue-title {{ font-weight: 600; color: #fff; font-size: 0.9rem; font-family: monospace; }}
        .issue-category {{ padding: 2px 8px; border-radius: 10px; font-size: 0.7rem; background: rgba(239, 68, 68, 0.2); color: #ef4444; text-transform: uppercase; }}
        .issue-desc {{ color: #aaa; font-size: 0.85rem; margin-bottom: 8px; }}
        .issue-code {{ background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; font-family: monospace; font-size: 0.75rem; color: #f59e0b; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 150px; overflow-y: auto; }}
        .footer {{ text-align: center; padding: 30px; color: #555; font-size: 0.85rem; }}
        ::-webkit-scrollbar {{ width: 6px; height: 6px; }}
        ::-webkit-scrollbar-track {{ background: rgba(255,255,255,0.05); border-radius: 3px; }}
        ::-webkit-scrollbar-thumb {{ background: rgba(255,255,255,0.2); border-radius: 3px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>UC2 Core API Test Report</h1>
            <p class="subtitle">Comprehensive API Endpoint Testing Results with Full CRUD & Edge Cases</p>
            <div class="test-info">
                <span><strong>Date:</strong> {datetime.now().strftime('%B %d, %Y %H:%M:%S')}</span>
                <span><strong>Base URL:</strong> {self.base_url}</span>
                <span><strong>User:</strong> {TEST_USER_ID}</span>
                <span><strong>Test Run:</strong> #{TEST_RUN_ID}</span>
            </div>
        </div>

        <div class="summary-cards">
            <div class="summary-card total">
                <div class="number">{total_tests}</div>
                <div class="label">Total Tests</div>
            </div>
            <div class="summary-card passed">
                <div class="number">{total_passed}</div>
                <div class="label">Passed</div>
            </div>
            <div class="summary-card failed">
                <div class="number">{total_failed}</div>
                <div class="label">Failed</div>
            </div>
            <div class="summary-card warnings">
                <div class="number">{total_warnings}</div>
                <div class="label">Warnings</div>
            </div>
            <div class="summary-card duration">
                <div class="number">{duration_str}</div>
                <div class="label">Duration</div>
            </div>
        </div>

        <div class="progress-bar">
            <div class="progress-fill"></div>
        </div>
        <div class="progress-label">{pass_rate:.1f}% Tests Passing</div>

        <div class="category-breakdown">
            <h3>Tests by Category</h3>
            {category_html}
        </div>

        <div class="issues-section">
            <h3>Failed Tests Details ({total_failed} failures)</h3>
            {failed_tests_html}
        </div>

        <h2 class="section-title">Router Test Results ({len(self.router_results)} Routers)</h2>

        <div class="router-grid">
            {router_cards}
        </div>

        <div class="footer">
            <p>Generated by UC2 Core API Comprehensive Test Suite</p>
            <p>Test Run ID: {TEST_RUN_ID} | Report Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        </div>
    </div>
</body>
</html>'''

        return html


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    test_suite = APITestSuite()
    test_suite.run_all_tests()
