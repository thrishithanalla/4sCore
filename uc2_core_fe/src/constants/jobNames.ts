/**
 * Job Names Constants
 *
 * These constants are used for permission checks across the application.
 * They map to the job names defined in the permission system received from main_fe.
 *
 * Usage:
 *   import { JOB_NAMES } from '../../constants/jobNames';
 *   const canCreate = useCanCreate(JOB_NAMES.PERSONNEL);
 */

export const JOB_NAMES = {
  // Master Data Jobs
  DEPARTMENTS: 'DEPARTMENTS',
  DESIGNATION_MASTER: 'DESIGNATION_MASTER',
  DISTRICTS: 'DISTRICT',
  MANDALS: 'MANDALS',
  RANK: 'RANK',
  UNIT_TYPE: 'UNIT_TYPE',
  LEVEL: 'LEVELS',

  // Core Jobs
  PERSONNEL: 'PERSONNEL',
  UNITS: 'UNITS',
  UNIT_VILLAGES: 'UNIT_VILLAGES',
  POST: 'POST',
  ASSIGNMENTS: 'ASSIGNMENT',

  // Auth & RBAC Jobs
  ROLES: 'ROLES',
  SYSTEM_ROLES: 'SYSTEM_ROLES',
  POST_ROLE_MAPPINGS: 'POST_ROLE_MAPPINGS',
  PERMISSIONS: 'PERMISSIONS',
  PERMISSION_MAPPINGS: 'PERMISSION_MAPPINGS',
  USER_ROLE_PERMISSIONS: 'USER_ROLE_PERMISSIONS',
  JOBS: 'JOBS',

  // Module Jobs
  MODULES: 'MODULES',
  MODULE_HIERARCHY: 'MODULE_HIERARCHY',
  MODULE_JOB_MAPPINGS: 'MODULE_JOB_MAPPINGS',

  // Approval Jobs
  APPROVAL_FLOW_MASTER: 'APPROVAL_FLOW_MASTER',
  APPROVAL_CHAIN: 'APPROVAL_CHAIN',

  // Prompt Jobs
  PROMPT_MASTER: 'PROMPT_TABLE',
  PROMPT_EXECUTIONS: 'PROMPT_EXECUTIONS',

  // Logging Jobs
  ERROR_MASTER: 'ERROR_MASTER',
  ERROR_LOGS: 'ERROR_LOGS',
  LOG_MASTER: 'LOG_MASTER',
  LOG_TRANSACTION: 'LOG_TRANSACTION',

  // Value Sets
  VALUE_SETS: 'VALUE_SETS',

  // Feedback Jobs
  FEEDBACK_MASTER: 'FEEDBACK_MASTER',
  FEEDBACKS: 'FEEDBACKS',

  // User Management
  USER_ONBOARDING: 'USER_ONBOARDING',

  // Notification Jobs
  NOTIFICATION_MASTER: 'NOTIFICATION_MASTER',
} as const;

// Type for job names
export type JobName = typeof JOB_NAMES[keyof typeof JOB_NAMES];
