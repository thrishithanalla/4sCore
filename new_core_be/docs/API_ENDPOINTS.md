# UC2 Core Service - API Endpoints Documentation

**Version:** 2.0
**Base URL:** `/core`

---

## Table of Contents

| # | Module | Base Path | Endpoints |
|---|--------|-----------|-----------|
| 1 | [Authentication](#1-authentication) | `/api/v1/auth` | 12 |
| 2 | [Onboarding](#2-onboarding) | `/api/v1/onboarding` | 2 |
| 3 | [Personnel Master](#3-personnel-master) | `/api/v1/personnel-master` | 9 |
| 4 | [Units](#4-units) | `/api/v1/units` | 10 |
| 5 | [Unit Types](#5-unit-types) | `/api/v1/unit-types` | 6 |
| 6 | [Unit Villages](#6-unit-villages) | `/api/v1/unit-villages` | 6 |
| 7 | [Units Enhance](#7-units-enhance) | `/api/v1/units-enhance` | 7 |
| 8 | [Departments](#8-departments) | `/api/v1/departments` | 7 |
| 9 | [Districts](#9-districts) | `/api/v1/districts` | 6 |
| 10 | [Mandals](#10-mandals) | `/api/v1/mandals` | 6 |
| 11 | [Ranks](#11-ranks) | `/api/v1/ranks` | 6 |
| 12 | [Designations](#12-designations) | `/api/v1/designation-master` | 8 |
| 13 | [Roles](#13-roles) | `/api/v1/roles` | 7 |
| 14 | [Permissions](#14-permissions) | `/api/v1/permissions` | 8 |
| 15 | [User Role Permissions](#15-user-role-permissions) | `/api/v1/user-role-permissions` | 6 |
| 16 | [Modules](#16-modules) | `/api/v1/modules` | 8 |
| 17 | [Module Hierarchy](#17-module-hierarchy) | `/api/v1/module-hierarchy` | 1 |
| 18 | [Module Job Mapping](#18-module-job-mapping) | `/api/v1/module-job-mapping` | 9 |
| 19 | [Jobs](#19-jobs) | `/api/v1/jobs` | 8 |
| 20 | [Permissions Mapping](#20-permissions-mapping) | `/api/v1/permissions-mapping` | 7 |
| 21 | [Value Sets](#21-value-sets) | `/api/v1/value-sets` | 13 |
| 22 | [Approval Flow Master](#22-approval-flow-master) | `/api/v1/approval-flow-master` | 7 |
| 23 | [Approval Chain](#23-approval-chain) | `/api/v1/approval-chain` | 8 |
| 24 | [Prompts](#24-prompts) | `/api/v1/prompts` | 7 |
| 25 | [Prompt Executions](#25-prompt-executions) | `/api/v1/prompt-executions` | 7 |
| 26 | [Feedback Master](#26-feedback-master) | `/api/v1/feedback-master` | 7 |
| 27 | [Feedbacks](#27-feedbacks) | `/api/v1/feedbacks` | 4 |
| 28 | [Test Master](#28-test-master) | `/api/v1/test-master` | 6 |
| 29 | [Test Execution](#29-test-execution) | `/api/v1/test-execution` | 4 |
| 30 | [Error Master](#30-error-master) | `/api/v1/error-master` | 9 |
| 31 | [Error Logs](#31-error-logs) | `/api/v1/error-logs` | 4 |

**Total Endpoints: 195**

| Section | Description |
|---------|-------------|
| [MongoDB Collections](#mongodb-collections) | 34 collections listed |

---

## 1. Authentication

**Base Path:** `/api/v1/auth`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/login` | Login with userId/phoneNumber + MPIN |
| `GET` | `/api/v1/auth/me` | Get current user profile |
| `POST` | `/api/v1/auth/get-auth-token` | Get authentication token |
| `GET` | `/api/v1/auth/decode-token` | Decode and validate token |
| `GET` | `/api/v1/auth/get-permissions` | Get current user permissions |
| `POST` | `/api/v1/auth/verify-otp` | Verify OTP code |
| `POST` | `/api/v1/auth/update-mpin` | Update user MPIN |
| `POST` | `/api/v1/auth/refresh-token` | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Logout current session |
| `POST` | `/api/v1/auth/logout-all` | Logout all sessions |
| `GET` | `/api/v1/auth/sessions` | Get active sessions |
| `DELETE` | `/api/v1/auth/sessions/{session_id}` | Revoke specific session |

---

## 2. Onboarding

**Base Path:** `/api/v1/onboarding`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/onboarding/create` | Onboard new user (personnel + role mappings) |
| `PATCH` | `/api/v1/onboarding/update/{personnel_id}` | Update user (personnel + role mappings) |

---

## 3. Personnel Master

**Base Path:** `/api/v1/personnel-master`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/personnel-master/create` | Create new personnel |
| `POST` | `/api/v1/personnel-master/bulk-create` | Bulk create personnel |
| `GET` | `/api/v1/personnel-master/list` | List personnel with pagination |
| `GET` | `/api/v1/personnel-master/by-unit/{unit_id}` | Get personnel by unit |
| `GET` | `/api/v1/personnel-master/{personnel_id}` | Get personnel by ID |
| `PATCH` | `/api/v1/personnel-master/update/{personnel_id}` | Update personnel |
| `DELETE` | `/api/v1/personnel-master/delete/{personnel_id}` | Soft delete personnel |
| `PATCH` | `/api/v1/personnel-master/restore/{personnel_id}` | Restore deleted personnel |
| `POST` | `/api/v1/personnel-master/by-units-and-role` | Get personnel by units and role |

---

## 4. Units

**Base Path:** `/api/v1/units`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/units/list-minimal` | Get minimal unit list (dropdowns) |
| `POST` | `/api/v1/units/create` | Create new unit |
| `POST` | `/api/v1/units/bulk-create` | Bulk create units |
| `GET` | `/api/v1/units/list` | List units with pagination |
| `GET` | `/api/v1/units/get/{unit_id}` | Get unit by ID |
| `PUT` | `/api/v1/units/update/{unit_id}` | Update unit |
| `DELETE` | `/api/v1/units/delete/{unit_id}` | Soft delete unit |
| `PATCH` | `/api/v1/units/restore/{unit_id}` | Restore deleted unit |
| `GET` | `/api/v1/units/unit-hierarchy/{unit_id}` | Get unit hierarchy tree |
| `GET` | `/api/v1/units/personnel-by-rank/{unit_id}/{rank_id}` | Get personnel by rank |

---

## 5. Unit Types

**Base Path:** `/api/v1/unit-types`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/unit-types/create` | Create new unit type |
| `GET` | `/api/v1/unit-types/list` | List unit types |
| `GET` | `/api/v1/unit-types/get/{unit_type_id}` | Get unit type by ID |
| `PUT` | `/api/v1/unit-types/update/{unit_type_id}` | Update unit type |
| `DELETE` | `/api/v1/unit-types/delete/{unit_type_id}` | Soft delete unit type |
| `PATCH` | `/api/v1/unit-types/restore/{unit_type_id}` | Restore deleted unit type |

---

## 6. Unit Villages

**Base Path:** `/api/v1/unit-villages`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/unit-villages/create` | Create unit-village mapping |
| `GET` | `/api/v1/unit-villages/list` | List unit-village mappings |
| `GET` | `/api/v1/unit-villages/get/{mapping_id}` | Get mapping by ID |
| `PUT` | `/api/v1/unit-villages/update/{mapping_id}` | Update mapping |
| `DELETE` | `/api/v1/unit-villages/delete/{mapping_id}` | Soft delete mapping |
| `PATCH` | `/api/v1/unit-villages/restore/{mapping_id}` | Restore deleted mapping |

---

## 7. Units Enhance

**Base Path:** `/api/v1/units-enhance`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/units-enhance/create` | Create unit enhancement |
| `GET` | `/api/v1/units-enhance/list` | List unit enhancements |
| `GET` | `/api/v1/units-enhance/list-minimal` | Get minimal list |
| `GET` | `/api/v1/units-enhance/get/{unit_id}` | Get enhancement by unit ID |
| `PATCH` | `/api/v1/units-enhance/update/{unit_id}` | Update enhancement |
| `DELETE` | `/api/v1/units-enhance/delete/{unit_id}` | Delete enhancement |
| `POST` | `/api/v1/units-enhance/restore/{unit_id}` | Restore enhancement |

---

## 8. Departments

**Base Path:** `/api/v1/departments`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/departments/create` | Create new department |
| `POST` | `/api/v1/departments/bulk-create` | Bulk create departments |
| `GET` | `/api/v1/departments/list` | List departments |
| `GET` | `/api/v1/departments/get/{department_id}` | Get department by ID |
| `PUT` | `/api/v1/departments/update/{department_id}` | Update department |
| `DELETE` | `/api/v1/departments/delete/{department_id}` | Soft delete department |
| `PATCH` | `/api/v1/departments/restore/{department_id}` | Restore deleted department |

---

## 9. Districts

**Base Path:** `/api/v1/districts`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/districts/create` | Create new district |
| `GET` | `/api/v1/districts/list` | List districts |
| `GET` | `/api/v1/districts/get/{district_id}` | Get district by ID |
| `PUT` | `/api/v1/districts/update/{district_id}` | Update district |
| `DELETE` | `/api/v1/districts/delete/{district_id}` | Soft delete district |
| `PATCH` | `/api/v1/districts/restore/{district_id}` | Restore deleted district |

---

## 10. Mandals

**Base Path:** `/api/v1/mandals`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/mandals/create` | Create new mandal |
| `GET` | `/api/v1/mandals/list` | List mandals |
| `GET` | `/api/v1/mandals/get/{mandal_id}` | Get mandal by ID |
| `PUT` | `/api/v1/mandals/update/{mandal_id}` | Update mandal |
| `DELETE` | `/api/v1/mandals/delete/{mandal_id}` | Soft delete mandal |
| `PATCH` | `/api/v1/mandals/restore/{mandal_id}` | Restore deleted mandal |

---

## 11. Ranks

**Base Path:** `/api/v1/ranks`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/ranks/create` | Create new rank |
| `GET` | `/api/v1/ranks/list` | List ranks |
| `GET` | `/api/v1/ranks/get/{rank_id}` | Get rank by ID |
| `PUT` | `/api/v1/ranks/update/{rank_id}` | Update rank |
| `DELETE` | `/api/v1/ranks/delete/{rank_id}` | Soft delete rank |
| `PATCH` | `/api/v1/ranks/restore/{rank_id}` | Restore deleted rank |

---

## 12. Designations

**Base Path:** `/api/v1/designation-master`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/designation-master/create` | Create new designation |
| `POST` | `/api/v1/designation-master/bulk-create` | Bulk create designations |
| `PATCH` | `/api/v1/designation-master/update/{id}` | Update designation |
| `DELETE` | `/api/v1/designation-master/delete/{id}` | Soft delete designation |
| `PATCH` | `/api/v1/designation-master/restore/{id}` | Restore deleted designation |
| `PATCH` | `/api/v1/designation-master/active/{id}` | Toggle active status |
| `GET` | `/api/v1/designation-master/list` | List designations |
| `GET` | `/api/v1/designation-master/{id}` | Get designation by ID |

---

## 13. Roles

**Base Path:** `/api/v1/roles`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/roles/create` | Create new role |
| `POST` | `/api/v1/roles/bulk-create` | Bulk create roles |
| `PUT` | `/api/v1/roles/update/{role_id}` | Update role |
| `DELETE` | `/api/v1/roles/delete/{role_id}` | Soft delete role |
| `PATCH` | `/api/v1/roles/restore/{role_id}` | Restore deleted role |
| `GET` | `/api/v1/roles/get/{role_id}` | Get role by ID |
| `GET` | `/api/v1/roles/list` | List roles |

---

## 14. Permissions

**Base Path:** `/api/v1/permissions`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/permissions/create` | Create new permission |
| `POST` | `/api/v1/permissions/bulk-create` | Bulk create permissions |
| `PUT` | `/api/v1/permissions/update/{permission_id}` | Update permission |
| `DELETE` | `/api/v1/permissions/delete/{permission_id}` | Soft delete permission |
| `PATCH` | `/api/v1/permissions/restore/{permission_id}` | Restore deleted permission |
| `PATCH` | `/api/v1/permissions/active/{permission_id}` | Toggle active status |
| `GET` | `/api/v1/permissions/get/{permission_id}` | Get permission by ID |
| `GET` | `/api/v1/permissions/list` | List permissions |

---

## 15. User Role Permissions

**Base Path:** `/api/v1/user-role-permissions`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/user-role-permissions/create` | Create user-role-permission mapping |
| `PUT` | `/api/v1/user-role-permissions/update/{mapping_id}` | Update mapping |
| `DELETE` | `/api/v1/user-role-permissions/delete/{mapping_id}` | Soft delete mapping |
| `PATCH` | `/api/v1/user-role-permissions/restore/{mapping_id}` | Restore deleted mapping |
| `GET` | `/api/v1/user-role-permissions/get/{mapping_id}` | Get mapping by ID |
| `GET` | `/api/v1/user-role-permissions/list` | List user role permissions |

---

## 16. Modules

**Base Path:** `/api/v1/modules`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/modules/create` | Create new module |
| `POST` | `/api/v1/modules/bulk-create` | Bulk create modules |
| `PUT` | `/api/v1/modules/update/{module_id}` | Update module |
| `DELETE` | `/api/v1/modules/delete/{module_id}` | Soft delete module |
| `PATCH` | `/api/v1/modules/restore/{module_id}` | Restore deleted module |
| `PATCH` | `/api/v1/modules/active/{module_id}` | Toggle active status |
| `GET` | `/api/v1/modules/get/{module_id}` | Get module by ID |
| `GET` | `/api/v1/modules/list` | List modules |

---

## 17. Module Hierarchy

**Base Path:** `/api/v1/module-hierarchy`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/module-hierarchy/get` | Get module hierarchy tree |

---

## 18. Module Job Mapping

**Base Path:** `/api/v1/module-job-mapping`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/module-job-mapping/create` | Create module-job mapping |
| `POST` | `/api/v1/module-job-mapping/bulk-create` | Bulk create mappings |
| `PUT` | `/api/v1/module-job-mapping/update/{mapping_id}` | Update mapping |
| `DELETE` | `/api/v1/module-job-mapping/delete/{mapping_id}` | Soft delete mapping |
| `PATCH` | `/api/v1/module-job-mapping/restore/{mapping_id}` | Restore deleted mapping |
| `GET` | `/api/v1/module-job-mapping/get/{mapping_id}` | Get mapping by ID |
| `GET` | `/api/v1/module-job-mapping/list` | List module-job mappings |
| `GET` | `/api/v1/module-job-mapping/jobs-by-module/{module_id}` | Get jobs for a module |
| `GET` | `/api/v1/module-job-mapping/modules-by-job/{job_id}` | Get modules for a job |

---

## 19. Jobs

**Base Path:** `/api/v1/jobs`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/jobs/create` | Create new job |
| `POST` | `/api/v1/jobs/bulk-create` | Bulk create jobs |
| `PATCH` | `/api/v1/jobs/update/{job_id}` | Update job |
| `DELETE` | `/api/v1/jobs/delete/{job_id}` | Soft delete job |
| `PATCH` | `/api/v1/jobs/restore/{job_id}` | Restore deleted job |
| `PATCH` | `/api/v1/jobs/active/{job_id}` | Toggle active status |
| `GET` | `/api/v1/jobs/get/{job_id}` | Get job by ID |
| `GET` | `/api/v1/jobs/list` | List jobs |

---

## 20. Permissions Mapping

**Base Path:** `/api/v1/permissions-mapping`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/permissions-mapping/create` | Create permission mapping |
| `POST` | `/api/v1/permissions-mapping/bulk-create` | Bulk create mappings |
| `PUT` | `/api/v1/permissions-mapping/update/{mapping_id}` | Update mapping |
| `DELETE` | `/api/v1/permissions-mapping/delete/{mapping_id}` | Soft delete mapping |
| `PATCH` | `/api/v1/permissions-mapping/restore/{mapping_id}` | Restore deleted mapping |
| `GET` | `/api/v1/permissions-mapping/get/{mapping_id}` | Get mapping by ID |
| `GET` | `/api/v1/permissions-mapping/list` | List permission mappings |

---

## 21. Value Sets

**Base Path:** `/api/v1/value-sets`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/value-sets/create` | Create new valueset |
| `GET` | `/api/v1/value-sets/list` | List valuesets |
| `GET` | `/api/v1/value-sets/get/{key}` | Get valueset by key |
| `PUT` | `/api/v1/value-sets/update/{key}` | Update valueset |
| `DELETE` | `/api/v1/value-sets/delete/{key}` | Soft delete valueset |
| `PATCH` | `/api/v1/value-sets/restore/{key}` | Restore deleted valueset |
| `GET` | `/api/v1/value-sets/get/{key}/items` | Get items for valueset |
| `POST` | `/api/v1/value-sets/validate` | Validate valueset items |
| `GET` | `/api/v1/value-sets/get/{key}/label/{code}` | Get label for item code |
| `GET` | `/api/v1/value-sets/bootstrap` | Bootstrap default valuesets |
| `POST` | `/api/v1/value-sets/cache/refresh` | Refresh all cache |
| `POST` | `/api/v1/value-sets/get/{key}/cache/refresh` | Refresh specific cache |
| `POST` | `/api/v1/value-sets/preload` | Preload valuesets to cache |

---

## 22. Approval Flow Master

**Base Path:** `/api/v1/approval-flow-master`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/approval-flow-master/create` | Create approval flow |
| `GET` | `/api/v1/approval-flow-master/list` | List approval flows |
| `GET` | `/api/v1/approval-flow-master/get/{flow_id}` | Get flow by ID |
| `PATCH` | `/api/v1/approval-flow-master/update/{flow_id}` | Update flow |
| `DELETE` | `/api/v1/approval-flow-master/delete/{flow_id}` | Soft delete flow |
| `PATCH` | `/api/v1/approval-flow-master/restore/{flow_id}` | Restore deleted flow |
| `GET` | `/api/v1/approval-flow-master/get/by-module/{module_id}` | Get flows for module |

---

## 23. Approval Chain

**Base Path:** `/api/v1/approval-chain`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/approval-chain/create` | Create approval chain |
| `GET` | `/api/v1/approval-chain/list` | List approval chains |
| `GET` | `/api/v1/approval-chain/get/{chain_id}` | Get chain by ID |
| `PATCH` | `/api/v1/approval-chain/update/{chain_id}` | Update chain |
| `DELETE` | `/api/v1/approval-chain/delete/{chain_id}` | Soft delete chain |
| `PATCH` | `/api/v1/approval-chain/restore/{chain_id}` | Restore deleted chain |
| `GET` | `/api/v1/approval-chain/get/pending/by-module/{module_id}` | Get pending by module |
| `GET` | `/api/v1/approval-chain/get/pending/by-user-module-district/{module_id}` | Get pending by user/module/district |

---

## 24. Prompts

**Base Path:** `/api/v1/prompts`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/prompts/create` | Create new prompt |
| `POST` | `/api/v1/prompts/bulk-create` | Bulk create prompts |
| `PUT` | `/api/v1/prompts/update/{prompt_id}` | Update prompt |
| `DELETE` | `/api/v1/prompts/delete/{prompt_id}` | Soft delete prompt |
| `PATCH` | `/api/v1/prompts/restore/{prompt_id}` | Restore deleted prompt |
| `GET` | `/api/v1/prompts/get/{prompt_id}` | Get prompt by ID |
| `GET` | `/api/v1/prompts/list` | List prompts |

---

## 25. Prompt Executions

**Base Path:** `/api/v1/prompt-executions`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/prompt-executions/create` | Execute a prompt |
| `DELETE` | `/api/v1/prompt-executions/delete/{execution_id}` | Delete execution |
| `PATCH` | `/api/v1/prompt-executions/restore/{execution_id}` | Restore deleted execution |
| `GET` | `/api/v1/prompt-executions/get/{execution_id}` | Get execution by ID |
| `GET` | `/api/v1/prompt-executions/list` | List executions |
| `GET` | `/api/v1/prompt-executions/dashboard` | Get dashboard stats |
| `GET` | `/api/v1/prompt-executions/recent-calls` | Get recent executions |

---

## 26. Feedback Master

**Base Path:** `/api/v1/feedback-master`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/feedback-master/create` | Create feedback type |
| `GET` | `/api/v1/feedback-master/list` | List feedback types |
| `GET` | `/api/v1/feedback-master/get/{id}` | Get feedback type by ID |
| `GET` | `/api/v1/feedback-master/get-by-name/{name}` | Get feedback type by name |
| `PATCH` | `/api/v1/feedback-master/update/{id}` | Update feedback type |
| `DELETE` | `/api/v1/feedback-master/delete/{id}` | Soft delete feedback type |
| `PATCH` | `/api/v1/feedback-master/restore/{id}` | Restore deleted feedback type |

---

## 27. Feedbacks

**Base Path:** `/api/v1/feedbacks`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/feedbacks/create` | Submit feedback |
| `GET` | `/api/v1/feedbacks/list` | List feedbacks |
| `GET` | `/api/v1/feedbacks/get/{id}` | Get feedback by ID |
| `DELETE` | `/api/v1/feedbacks/delete/{id}` | Delete feedback |

---

## 28. Test Master

**Base Path:** `/api/v1/test-master`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/test-master/create` | Create test case |
| `GET` | `/api/v1/test-master/list` | List test cases |
| `GET` | `/api/v1/test-master/get/{id}` | Get test case by ID |
| `PATCH` | `/api/v1/test-master/update/{id}` | Update test case |
| `DELETE` | `/api/v1/test-master/delete/{id}` | Soft delete test case |
| `POST` | `/api/v1/test-master/restore/{id}` | Restore deleted test case |

---

## 29. Test Execution

**Base Path:** `/api/v1/test-execution`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/test-execution/create` | Create test execution |
| `GET` | `/api/v1/test-execution/list` | List test executions |
| `GET` | `/api/v1/test-execution/get/{id}` | Get execution by ID |
| `DELETE` | `/api/v1/test-execution/delete/{id}` | Delete execution |

---

## 30. Error Master

**Base Path:** `/api/v1/error-master`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/error-master/create` | Create error definition |
| `POST` | `/api/v1/error-master/bulk-create` | Bulk create error definitions |
| `GET` | `/api/v1/error-master/all` | Get all errors (no pagination) |
| `GET` | `/api/v1/error-master/list` | List errors with pagination |
| `GET` | `/api/v1/error-master/get/{id}` | Get error by ID |
| `GET` | `/api/v1/error-master/get/by-code/{error_code}` | Get error by code |
| `PATCH` | `/api/v1/error-master/update/{id}` | Update error definition |
| `DELETE` | `/api/v1/error-master/delete/{id}` | Soft delete error |
| `PATCH` | `/api/v1/error-master/restore/{id}` | Restore deleted error |

---

## 31. Error Logs

**Base Path:** `/api/v1/error-logs`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/error-logs/create` | Log an error |
| `GET` | `/api/v1/error-logs/list` | List error logs |
| `GET` | `/api/v1/error-logs/export` | Export error logs |
| `POST` | `/api/v1/error-logs/dashboard` | Get error dashboard stats |

---

## MongoDB Collections

### Master Data Collections

| # | Collection Name | Description |
|---|-----------------|-------------|
| 1 | `department_master` | Department information |
| 2 | `designation_master` | Designation/position definitions |
| 3 | `district_master` | District geographical data |
| 4 | `mandal_master` | Mandal geographical data |
| 5 | `rank_master` | Rank hierarchy definitions |
| 6 | `title_master` | Title definitions |
| 7 | `unit_type_master` | Unit type classifications |

### Core Collections

| # | Collection Name | Description |
|---|-----------------|-------------|
| 8 | `personnel_master` | User/personnel records |
| 9 | `unit_master` | Organizational unit data |
| 10 | `unit_villages_master` | Unit-village mappings |

### Auth & RBAC Collections

| # | Collection Name | Description |
|---|-----------------|-------------|
| 11 | `roles_master` | Role definitions |
| 12 | `permissions_master` | Permission definitions |
| 13 | `permissions_mapping_master` | Role-permission mappings |
| 14 | `user_mapping` | Legacy user mappings |
| 15 | `user_role_permissions_master` | User-role-unit permission mappings |
| 16 | `jobs_master` | Job/feature definitions for RBAC |

### Module Collections

| # | Collection Name | Description |
|---|-----------------|-------------|
| 17 | `modules_master` | Application module definitions |
| 18 | `moduleHierarchy` | Module parent-child relationships |
| 19 | `module_job_mapping_master` | Module-job associations |

### Approval Collections

| # | Collection Name | Description |
|---|-----------------|-------------|
| 20 | `approval_flow_master` | Approval workflow definitions |
| 21 | `approval_chain` | Approval chain instances |

### Prompt Collections

| # | Collection Name | Description |
|---|-----------------|-------------|
| 22 | `prompt_master` | AI prompt templates |
| 23 | `prompt_execution` | Prompt execution history |

### Logging Collections

| # | Collection Name | Description |
|---|-----------------|-------------|
| 24 | `error_master` | Error code definitions |
| 25 | `error_logs` | Error log entries |
| 26 | `log_master` | Log code definitions |
| 27 | `logs` | Transaction log entries |

### Other Collections

| # | Collection Name | Description |
|---|-----------------|-------------|
| 28 | `value_sets_master` | Configurable value sets/lookups |
| 29 | `feedback_master` | Feedback type definitions |
| 30 | `feedback` | User feedback submissions |
| 31 | `test_master` | Test case definitions |
| 32 | `test_execution` | Test execution records |
| 33 | `otp_verification` | OTP verification records |
| 34 | `refresh_tokens` | JWT refresh token storage |

**Total Collections: 34**

---

## Appendix

### A. Standard Response Format

**Success Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "Operation successful",
  "data": { }
}
```

**Error Response:**
```json
{
  "success": false,
  "code": 400,
  "message": "Error message",
  "data": null,
  "errors": {
    "errorCode": "ERR.CORE.MODULE.OPERATION.REASON",
    "details": "Detailed error description"
  }
}
```

### B. Pagination Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int | 10 | Items per page (max 100) |
| `search` | string | - | Search term |
| `sort_field` | string | createdAt | Field to sort by |
| `sort_order` | int | -1 | -1 = desc, 1 = asc |
| `include_deleted` | bool | false | Include soft-deleted |

### C. Authentication Header

```
Authorization: Bearer <access_token>
```

### D. HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request |
| `401` | Unauthorized |
| `403` | Forbidden |
| `404` | Not Found |
| `409` | Conflict |
| `422` | Validation Error |
| `500` | Server Error |

---

*Generated for UC2 Core Main BE v2.0*
