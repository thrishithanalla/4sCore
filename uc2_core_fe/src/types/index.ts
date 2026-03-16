/* eslint-disable @typescript-eslint/no-explicit-any */
// Auth Types
export interface LoginRequest {
  phoneNumber: string;
  mpin: number;
}

export interface AuthResponse {
  success: boolean;
  code: number;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: number;
    refreshExpiresIn: number;
  };
  errors: any;
}

export type NotificationActionType = 'navigate' | 'api' | 'dismiss' | 'custom';
export type NotificationActionStyle = 'primary' | 'secondary' | 'danger' | 'text';

export interface NotificationAction {
  actionId: string;
  label: string;
  actionType: NotificationActionType;
  url?: string | null;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | null;
  payload?: Record<string, unknown> | null;
  style: NotificationActionStyle;
  icon?: string | null;
  requiresMemo: boolean;
  confirmMessage?: string | null;
}


export interface User {
  _id: string;
  email: string;
  userId: string;
  title?: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  badgeNo?: string;
  batchYear?: number;
  gender?: string;
  unitId?: string | null;
  departmentId?: string | null;
  rankId?: string | null;
  districtId?: string | null;
  // district object from /auth/me API
  district?: {
    _id: string;
    name: string;
  } | null;
  picture?: string | null;
  dateOfBirth?: string | null;
  mpin?: string | number;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
  isDeleted: boolean;
}

// Personnel Types
export interface Personnel {
  _id: string;
  email: string;
  userId: string;
  title?: string;
  firstName: string;
  lastName: string;
  name:string;
  unitId?: string | null;
  departmentId?: string | null;
  rankId?: string | null;
  picture?: string;
  mobile?: string;
  batchYear?: number;
  badgeNo?: string;
  dateOfBirth?: string;
  gender?: string;
  mpin?: string | number;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDeleted: boolean;
  // Single unit (legacy)
  unit?: {
    _id: string;
    name: string;
    policeReferenceId: string;
  } | null;
  // Multiple units (new structure) - each item contains unitId, designationId, and nested unit/designation objects
  units?: Array<{
    unitId: string;
    designationId?: string | null;
    unit: {
      _id: string;
      name: string;
      policeReferenceId?: string;
    };
    designation?: {
      _id: string;
      name: string;
      designationCd?: string;
    } | null;
  }>;
  // Posts assignments for personnel
  posts?: Array<{
    postId: string;
    unitId: string;
    unitName: string;
    postCode: string;
    postName: string;
    assignmentType: string;
    isPrimary: boolean;
    isUnitHead: boolean;
    startDate: string | null;
    endDate: string | null;
  }>;
  department?: {
    _id: string;
    name: string;
  } | null;
  rank?: {
    _id: string;
    name: string;
  } | null;
}

export interface PersonnelCreateRequest {
  email: string;
  password?: string;
  userId: string;
  name: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  unitId?: string;
  departmentId?: string;
  rankId?: string;
  picture?: string | null;
  mobile?: string;
  batchYear?: number;
  badgeNo?: string;
  dateOfBirth?: string;
  gender?: string;
  mpin?: string | number;
  posts?: Array<{ postId: string }>;
  // Note: createdBy is handled by backend from JWT token
}

// Unit Types
// Note: /list endpoint returns only IDs (no nested objects for performance)
// Use /get/{id} for full nested objects with embedded posts
export interface Unit {
  _id: string;
  policeReferenceId: string;
  name: string;
  unitCode?: string;
  shortCode?: string;
  scope?: string;
  logo?: string;
  address1?: string;
  address2?: string;
  city?: string;
  districtId?: string;  // Changed from district (string) to districtId (ObjectId reference)
  zip?: string;
  email?: string;
  phone?: string[];
  responsiblePostCode?: string;  // Post code of responsible post (from embedded posts)
  responsiblePersonTitle?: string;
  isVirtual: boolean;
  unitTypeId: string;
  departmentId: string;
  levelId?: string;
  proxyUserId?: string | null;
  unitPersonnelList?: string[];
  parentUnitId?: string | null;
  parentUnitPath?: string | null;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
  isDeleted: boolean;
  isDelete?: boolean;  // Soft delete flag (backend uses isDelete)
  isActive?: boolean;  // Active flag
  // Nested objects - only available from /get/{id} endpoint, not from /list
  department?: {
    _id: string;
    name: string;
  };
  unitType?: {
    _id: string;
    name: string;
  };
  parentUnit?: {
    _id: string;
    name: string;
    policeReferenceId: string;
  } | null;
  district?: {
    _id: string;
    name: string;
  } | null;
  level?: {
    _id: string;
    levelName: string;
    levelNumber?: number;
    levelCode?: string;
  } | null;
  responsiblePost?: {
    postCode: string;
    postName: string | null;
  } | null;
  // Derived responsible user (from responsiblePostCode lookup in embedded posts)
  responsibleUserId?: string | null;
  responsibleUserName?: string | null;
  // Responsible post history (changes to responsible post)
  responsiblePostHistory?: Array<{
    postCode: string;
    from: string;
    to: string;
    title?: string;
    reason?: string;
    changedBy?: string;
    changedAt?: string;
  }>;
  // Counts from list endpoint
  postCount?: number;
  personnelCount?: number;
  // Embedded posts with populated references from GET /{id} endpoint
  posts?: Array<{
    postCode: string;
    postName: string;
    isUnitHead: boolean;
    reportsToPost?: {
      unitId?: string | null;
      unitName?: string | null;
      postName?: string | null;
    } | null;
    assignedRoles: Array<{
      _id: string;
      roleName: string;
      roleShortCode?: string;
    }>;
    allowedRanks: Array<{
      _id: string;
      name: string;
      shortCode?: string;
      level?: number;
    }>;
    assignedUser?: {
      _id: string;
      name: string;
      employeeId?: string;
      userId?: string;
    } | null;
    description?: string;
    isActive: boolean;
    isDelete: boolean;
  }>;
}

// Minimal unit response for dropdowns (from /list-minimal endpoint)
export interface UnitMinimal {
  id: string;
  name: string;
}

export interface ResponsibleUserHistory {
  userId: string;
  from: string;
  to: string;
  title: string;
  reason: string;
  changedBy: string;
  changedAt: string;
}

// Embedded post for unit create request
export interface EmbeddedPostForCreate {
  postCode: string;
  postName: string;
  isUnitHead?: boolean;
  reportsToPost?: {
    unitId?: string | null;
    postCode?: string | null;
    postName?: string | null;
  } | null;
  assignedRoles?: string[];      // Array of system role ObjectIds (FK: rank_roles._id)
  assignedUser?: string | null;  // Single personnel ObjectId
  allowedRanks?: string[];       // Array of Rank ObjectIds (FK: ranks._id)
  description?: string;
  // Assignment fields (when assigning user to post)
  assignmentType?: string;       // Primary Assignment, Incharge, Deputation
  startDate?: string;            // Assignment start date (ISO format)
  endDate?: string;              // Assignment end date (ISO format)
}

export interface UnitCreateRequest {
  // Required fields (per backend UnitBaseSchema)
  policeReferenceId: string;
  name: string;
  email: string;
  districtId: string;
  // Embedded posts - REQUIRED (at least one post)
  posts: EmbeddedPostForCreate[];
  // Optional fields
  responsiblePostCode?: string;  // Post code for responsible post (must exist in posts array)
  unitCode?: string;
  logo?: string;
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  phone?: string[];
  responsiblePersonTitle?: string;
  isVirtual?: boolean;
  unitTypeId?: string;
  departmentId?: string;
  proxyUserId?: string;
  parentUnitId?: string | null;
  parentUnitPath?: string;
  unitPersonnelList?: string[];
  responsiblePostHistory?: ResponsibleUserHistory[];
  // Note: createdBy and createdIp are handled by backend from JWT token
}

// Unit Village Types
export interface UnitVillage {
  _id: string;
  unitId: string;
  mandalId: string;
  villageName: string;
  villageCode?: string;
  village?: string;
  createdBy?: string;
  createdAt?: string;
  createdIp?: string | null;
  updatedBy?: string;
  updatedAt?: string;
  updatedIp?: string | null;
  isDelete?: boolean;
  isActive?: boolean;
  isDeleted?: boolean;
  // Populated nested objects from API
  unit?: {
    _id: string;
    name: string;
    policeReferenceId: string;
  };
  mandal?: {
    _id: string;
    mandalName: string;
    districtId?: string;
  };
}

export interface UnitVillageCreateRequest {
  unitId: string;
  village: string;
  villageCode?: string;
  mandal: string;
  district: string;
  // Note: createdBy and createdIp are handled by backend from JWT token
}

// Common Types
export interface ApiError {
  detail: string;
}


export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T[];
  pagination: PaginationInfo;
}

// Dropdown/Master Data Types
// Extended Department interface with full CRUD fields
// Note: deletedBy and deletedAt are NOT included (only isDeleted is checked)
export interface Department {
  _id: string;
  name: string;
  cctnsDepartmentCd?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDeleted?: boolean; // Only soft delete flag, no deletedBy/deletedAt
  shortCode?: string;
}

export interface DepartmentCreateRequest {
  name: string;
  cctnsDepartmentCd: string;
  shortCode?: string;
  // Note: createdBy and updatedBy are NOT passed from frontend
}

export interface DepartmentUpdateRequest {
  name?: string;
  cctnsDepartmentCd?: string;
  shortCode?: string;
  // Note: updatedBy is NOT passed from frontend
}

// Extended Rank interface with full CRUD fields
// Note: createdBy is handled by backend from JWT token
export interface Rank {
  _id: string;
  name: string;
  cctnsRankCd?: number;
  level: number;
  shortCode?: string;
  isActive?: boolean;
  isDelete?: boolean;
  createdBy?: string;
  createdAt?: string;
  createdIp?: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
  updatedIp?: string | null;
}

export interface RankCreateRequest {
  name: string;
  cctnsRankCd: number;
  level: number;
  shortCode?: string;
  // Note: createdBy is handled by backend from JWT token
}

export interface RankUpdateRequest {
  name?: string;
  cctnsRankCd?: number;
  level?: number;
  shortCode?: string;
  // Note: updatedBy is handled by backend from JWT token
}

// Designation interface
export interface Designation {
  _id: string;
  name: string;
  shortCode?: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDelete?: boolean;
  isActive?: boolean;
}

// Embedded Job within Module
export interface EmbeddedJob {
  name: string;
  shortCode: string;
  description?: string;
  displayName: string;
  route: string;
  menuEligibility: boolean;
  displayOrder: number;
  allowedPermissions: string[];  // e.g., ['CREATE', 'READ', 'UPDATE', 'DELETE']
}

// Extended Module interface with full CRUD fields and embedded jobs
// Note: createdBy is NOT passed from frontend (handled by backend)
// Note: Field is isDelete (without 'd') not isDeleted
export interface Module {
  _id: string;
  name: string;
  shortCode?: string;
  description?: string;
  displayOrder?: number;
  jobs?: EmbeddedJob[];        // Embedded jobs array
  jobCount?: number;           // Job count (from list response)
  isActive?: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDelete?: boolean;
  isDeleted?: boolean;
}

// Job create request (for adding job to module)
export interface EmbeddedJobCreate {
  name: string;
  shortCode: string;
  description?: string;
  displayName: string;
  route: string;
  menuEligibility?: boolean;
  displayOrder?: number;
  allowedPermissions?: string[];
}

// Job update request (route cannot be updated)
export interface EmbeddedJobUpdate {
  name?: string;
  shortCode?: string;
  description?: string;
  displayName?: string;
  menuEligibility?: boolean;
  displayOrder?: number;
  allowedPermissions?: string[];
}

export interface ModuleCreateRequest {
  name: string;
  shortCode: string;
  description: string;
  displayOrder: number;
  jobs?: EmbeddedJobCreate[];
  // Note: createdBy is NOT passed from frontend
}

export interface ModuleUpdateRequest {
  name?: string;
  shortCode?: string;
  description?: string;
  displayOrder?: number;
  // Note: updatedBy is NOT passed from frontend
}

// Job Types
export interface Job {
  _id: string;
  name: string;
  shortCode?: string;
  description?: string;
  menuEligible?: boolean;     // Whether job is eligible to appear in menu (default: true). If false, isMenu in roles/user-mappings will be forced to false.
  displayOrder?: number;      // Display order (auto: 1 if menuEligible=true, 0 if menuEligible=false)
  displayName?: string;       // PascalCase name (auto-generated)
  route?: string;             // Lowercase-hyphenated-plural (auto-generated)
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDelete?: boolean;
  isDeleted?: boolean;
}

export interface JobCreateRequest {
  name: string;
  shortCode: string;
  displayName: string;        // Required: PascalCase name
  route: string;              // Required: Lowercase-hyphenated
  description?: string;
  menuEligible?: boolean;     // Whether job is eligible to appear in menu (default: true)
  displayOrder?: number;      // Optional: Display order (auto-set if not provided)
  // Note: createdBy is NOT passed from frontend
}

export interface JobUpdateRequest {
  name?: string;
  shortCode?: string;
  displayName?: string;       // Optional: PascalCase name
  route?: string;             // Optional: Lowercase-hyphenated
  description?: string;
  menuEligible?: boolean;     // Whether job is eligible to appear in menu - auto-updates displayOrder based on this
  displayOrder?: number;      // Optional: Display order
  // Note: updatedBy is NOT passed from frontend
}

// Permission Types
export interface Permission {
  _id: string;
  name: string;
  shortCode?: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDelete?: boolean;
}

export interface PermissionCreateRequest {
  name: string;
  shortCode: string;
  description?: string;
  // Note: createdBy is NOT passed from frontend
}

export interface PermissionUpdateRequest {
  name: string;
  shortCode: string;
  description?: string;
  // Note: updatedBy is NOT passed from frontend
}

export interface UnitType {
  _id: string;
  id?: string;
  name: string;
  shortCode?: string;
  scope?: string;
  departmentId: string;
  level?: number; // Optional since it might not exist in older records
  department?: {
    _id: string;
    name: string;
  };
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  deletedBy?: string;
  deletedAt?: string;
}

export interface UnitTypeCreateRequest {
  name: string;
  shortCode?: string;
  scope?: string;
  departmentId: string;
  level?: number; // Optional for backward compatibility
}

export interface UnitTypeUpdateRequest {
  name?: string;
  shortCode?: string;
  scope?: string;
  departmentId?: string;
  level?: number;
}

export interface District {
  _id: string;
  name: string;
  cctnsDistrictCd?: string;
  shortCode?: string;
  stateName?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

export interface DistrictCreateRequest {
  name: string;
  cctnsDistrictCd: string;
  stateName?: string;
}

export interface DistrictUpdateRequest {
  name?: string;
  cctnsDistrictCd?: string;
  stateName?: string;
}

// Mandal Types
export interface Mandal {
  _id: string;
  districtId: string;
  mandalName: string;
  district?: {
    _id: string;
    name: string;
  };
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDeleted?: boolean;
}

export interface MandalCreateRequest {
  districtId: string;
  mandalName: string;
}

export interface MandalUpdateRequest {
  districtId?: string;
  mandalName?: string;
}

// Form Data Types
export interface UnitFormData {
  policeReferenceId: string;
  name: string;
  logo: string | File | null;
  address1: string;
  address2: string;
  city: string;
  districtId: string;  // Changed from district to districtId
  zip: string;
  email: string;
  phone: string;
  responsiblePostId: string;
  responsiblePersonTitle: string;
  isVirtual: boolean;
  unitTypeId: string;
  departmentId: string;
  levelId: string;
  parentUnitId: string;
}

export interface PersonnelFormData {
  email: string;
  password: string;
  userId: string;
  title: string;
  firstName: string;
  lastName: string;
  unitId: string;
  departmentId: string;
  rankId: string;
  picture: string | File | null;
  mobile: string;
  batchYear: string;
  badgeNo: string;
  dateOfBirth: string;
  gender: string;
}

export interface UnitVillageFormData {
  unitId: string;
  village: string;
  mandal: string;
  district: string;
}

// Value Set Types
// Full item structure with multilingual labels (used for create/update)
// Labels can have any language code as key (en, hi, te, ta, etc.)
export interface ValueSetItem {
  code: string;
  labels: {
    [languageCode: string]: string; // Dynamic language keys
  };
}

// Localized item structure (returned when lang param is used)
export interface ValueSetItemLocalized {
  code: string;
  label: string;
}

// Value Set response from GET /{key}?lang=en (localized)
export interface ValueSetLocalized {
  _id: string;
  key: string;
  status: 'active' | 'archived';
  module: string;
  description: string;
  items: ValueSetItemLocalized[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// Value Set response from list endpoint (full labels object)
export interface ValueSet {
  _id: string;
  key: string;
  status: 'active' | 'archived';
  module: string;
  description: string;
  items: ValueSetItem[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ValueSetCreateRequest {
  key: string;
  status: 'active' | 'archived';
  module: string;
  description: string;
  items: ValueSetItem[];
  // Note: createdBy is handled by backend from JWT token
}

export interface ValueSetFormData {
  key: string;
  status: 'active' | 'archived';
  module: string;
  description: string;
  items: ValueSetItem[];
}

// Bootstrap response - Returns all active value sets with localized labels
export interface ValueSetBootstrapResponse {
  [key: string]: Array<{
    code: string;
    label: string;
  }>;
}

// Single value set item with localized label
export interface ValueSetItemLocalized {
  code: string;
  label: string;
}

// Validate enum code request/response
export interface ValidateEnumRequest {
  key: string;
  code: string;
}

export interface ValidateEnumResponse {
  valid: boolean;
  key: string;
  code: string;
}

// Get label for code response
export interface GetLabelResponse {
  key: string;
  code: string;
  label: string;
  lang: string;
}

// Cache refresh responses
export interface CacheRefreshResponse {
  message: string;
  refreshedCount: number;
}

export interface PreloadResponse {
  message: string;
  loadedCount: number;
  keys: string[];
}

export type NotificationChannel = 'inApp' | 'webPush' | 'push' | 'email' | 'sms' | 'whatsapp';
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type NotificationCategory = 'TRANSACTIONAL' | 'PROMOTIONAL' | 'SYSTEM' | 'ALERT';
export type NotificationParameterType = 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
export type NotificationStatus =
  | 'Pending'
  | 'Queued'
  | 'Sent'
  | 'Delivered'
  | 'Read'
  | 'Failed'
  | 'Canceled';

export interface NotificationTemplate {
  title: string;
  body: string;
}

// Channel-specific template structures
export interface EmailTemplate {
  subject: string;
  body: string;
  htmlBody?: string;
}

export interface PushTemplate {
  title: string;
  body: string;
  image?: string;
  icon?: string;
}

export interface SmsTemplate {
  body: string;  // Max 160 chars
}

export interface WhatsAppComponent {
  type: 'header' | 'body' | 'button';
  parameters: string[];
}

export interface WhatsAppTemplate {
  templateName: string;
  templateLanguage: string;
  components?: WhatsAppComponent[];
}

export interface InAppTemplate {
  title: string;
  body: string;
  icon?: string;
  color?: string;
}

export interface NotificationParameter {
  name: string;
  type: NotificationParameterType;
  required: boolean;
  default?: string | number | boolean | null;
  description?: string;
}

export interface NotificationBatchTemplate {
  title: string;
  body: string;
}

// Base channel configuration
export interface BaseChannelConfig {
  enabled: boolean;
  priority?: NotificationPriority;
}

// Channel-specific configurations with their respective template types
export interface InAppChannelConfig extends BaseChannelConfig {
  template?: InAppTemplate;
}

export interface EmailChannelConfig extends BaseChannelConfig {
  template?: EmailTemplate;
}

export interface PushChannelConfig extends BaseChannelConfig {
  template?: PushTemplate;
}

export interface WebPushChannelConfig extends BaseChannelConfig {
  template?: PushTemplate;
}

export interface SmsChannelConfig extends BaseChannelConfig {
  template?: SmsTemplate;
}

export interface WhatsAppChannelConfig extends BaseChannelConfig {
  template?: WhatsAppTemplate;
}

// Generic channel config for backward compatibility
export interface ChannelConfig {
  enabled: boolean;
  priority?: NotificationPriority;
  template?: NotificationTemplate | EmailTemplate | PushTemplate | SmsTemplate | WhatsAppTemplate | InAppTemplate;
}

// Channels object with per-channel config
export interface NotificationChannelsConfig {
  inApp?: InAppChannelConfig;
  webPush?: WebPushChannelConfig;
  push?: PushChannelConfig;
  email?: EmailChannelConfig;
  sms?: SmsChannelConfig;
  whatsapp?: WhatsAppChannelConfig;
}

// Throttle configuration
export interface ThrottleConfig {
  enabled: boolean;
  maxPerHour?: number;
  maxPerDay?: number;
}

// Settings configuration
export interface NotificationSettings {
  allowUserOptOut?: boolean;
  retryOnFailure?: boolean;
  maxRetries?: number;
  retryDelayMinutes?: number;
  expiresAfterMinutes?: number;
  throttle?: ThrottleConfig;
}

export interface NotificationMaster {
  id: string;          // used by DataGrid
  _id?: string;        // API returns this, map to id in frontend
  notificationType: string;  // API uses camelCase
  notification_type?: string;  // Keep for backward compatibility
  name: string;
  description?: string;
  category?: NotificationCategory;
  moduleId?: string | null;  // Module reference
  module?: { _id: string; name?: string } | null;  // Populated module object from API
  defaultChannels: NotificationChannel[];  // API uses camelCase
  default_channels?: NotificationChannel[];  // Keep for backward compatibility
  channels?: NotificationChannelsConfig | null;  // Per-channel configuration
  notificationTemplate?: NotificationTemplate | null;
  notification_template?: NotificationTemplate | null;  // Keep for backward compatibility
  notificationParameters?: NotificationParameter[];
  notification_parameters?: NotificationParameter[];  // Keep for backward compatibility
  priority: NotificationPriority;
  notificationActions?: NotificationAction[];
  notification_actions?: NotificationAction[];  // Keep for backward compatibility
  settings?: NotificationSettings | null;
  active: boolean;

  // Batching fields
  canBeBatched?: boolean;
  batchWindowMinutes?: number | null;
  batchTemplate?: NotificationBatchTemplate | null;

  // audit/soft delete
  createdBy?: string;
  created_by?: string;
  createdAt?: string;
  created_at?: string;
  updatedBy?: string | null;
  updated_by?: string | null;
  updatedAt?: string;
  updated_at?: string;
  isDeleted?: boolean;
  is_deleted?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface NotificationMasterCreateRequest {
  notificationType: string;
  name: string;
  description?: string;
  category?: NotificationCategory;
  moduleId?: string | null;
  defaultChannels: NotificationChannel[];
  channels?: NotificationChannelsConfig;
  notificationTemplate?: NotificationTemplate;
  notificationParameters?: NotificationParameter[];
  priority?: NotificationPriority;
  notificationActions?: NotificationAction[];
  settings?: NotificationSettings;
  canBeBatched?: boolean;
  batchWindowMinutes?: number;
  batchTemplate?: NotificationBatchTemplate;
  active?: boolean;
}

export type NotificationMasterUpdateRequest = Partial<NotificationMasterCreateRequest>;

export interface NotificationMasterQueryParams {
  search?: string;        // Search in name, type, description
  q?: string;             // Keep for backward compatibility
  category?: NotificationCategory;  // Filter by category
  moduleId?: string;      // Filter by module
  active?: boolean;       // Filter by active status
  page?: number;          // default 1
  pageSize?: number;      // default 20, max 100
  limit?: number;         // Keep for backward compatibility
}

export interface NotificationMasterActionResponse {
  message: string;
  data: NotificationMaster;
}

export interface DeleteResponse {
  success: boolean;
  message: string;
}



export type DeliveryChannel = 'inApp' | 'sms' | 'whatsapp';


export interface NotificationMasterLite {
id: string;
notificationType: string;
defaultChannels: DeliveryChannel[];
priority: NotificationPriority;
description?: string;
}


export type PersonnelOption = { value: string; label: string };

// Error Master Types
export interface ErrorMaster {
  id: string;
  errorCode: string;
  errorTitle: string;
  errorDescription: string;
  errorCategory: string;
  errorType?: string;
  errorSeverity: string;
  businessArea?: string;
  technicalArea?: string;
  tool?: string;
  partnerSystem?: string;
  thirdParty?: string;
  log?: boolean;
  messages?: Array<{ language: string; template: string }>;
  devMessage?: string;
  helpLink?: string;
  videoLink?: string;
  httpStatusCode?: number;
  severity: string;
  troubleshootingSteps?: string[];
  relatedErrorCodes?: string[];
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  isDeleted: boolean;
}

export interface ErrorMasterCreateRequest {
  errorCode: string;
  errorTitle: string;
  errorDescription: string;
  errorCategory: string;
  httpStatusCode?: number;
  severity: string;
  troubleshootingSteps?: string[];
  relatedErrorCodes?: string[];
  isActive?: boolean;
  // Note: createdBy is handled by backend from JWT token
}

export interface ErrorMasterUpdateRequest {
  errorCode?: string;
  errorTitle?: string;
  errorDescription?: string;
  errorCategory?: string;
  httpStatusCode?: number;
  severity?: string;
  troubleshootingSteps?: string[];
  relatedErrorCodes?: string[];
  isActive?: boolean;
  // Note: updatedBy is handled by backend from JWT token
}

export interface ErrorMasterSearchParams {
  q?: string;
  moduleId?: string;
  errorCode?: string;
  errorCategory?: string;
  errorSeverity?: string;
  severity?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface ErrorMasterSearchResponse {
  data: ErrorMaster[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ErrorMasterFormData {
  errorCode: string;
  errorTitle: string;
  errorDescription: string;
  errorCategory: string;
  httpStatusCode: string;
  severity: string;
  troubleshootingSteps: string[];
  relatedErrorCodes: string[];
  isActive: boolean;
}

// Error Log Types
export interface ErrorLogParameter {
  name: string;
  value: string;
}

export interface ErrorLog {
  _id?: string;
  id: string;
  errorCode: string;
  errorSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  eventDateTime: string;
  actorUserId?: string | null;
  sourceType: string;
  sourceName: string;
  ip?: string | null;
  userAgent?: string | null;
  environment: string;
  resolvedMessage: string;
  parameters: ErrorLogParameter[];
  parametersJson?: Record<string, any>;
  stack?: string;
  stackTrace?: string;
  message?: string;
}

export interface ErrorLogCreateRequest {
  errorCode: string;
  parametersJson?: Record<string, any>;
  language?: string;
  actorUserId?: string;
  sourceType: string;
  sourceName: string;
  ip?: string;
  userAgent?: string;
  environment: string;
  stack?: string;
  traceId?: string;
}

export interface ErrorLogSearchParams {
  q?: string;
  errorCode?: string;
  errorSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  sourceType?: string;
  sourceName?: string;
  actorUserId?: string;
  environment?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  page_size?: number;
  includeArchive?: boolean;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface ErrorLogSearchResponse {
  data: ErrorLog[];
  total: number;
  page_size: number;
}

// Error Logs Dashboard Types
export interface ErrorLogSummary {
  totalErrors: number;
  totalUniqueErrors: number;
  totalAffectedUsers: number;
}

export interface ErrorLogTypeStats {
  count: number;
  unique: number;
  affectedUsers: number;
}

export interface ErrorLogSeverityStats {
  count: number;
  affectedUsers: number;
}

export interface ErrorLogTrend {
  hour: number;
  API: number;
  UI: number;
  SCREEN: number;
  THIRDPARTY?: number;
  FUNCTION?: number;
}

export interface ErrorGroup {
  errorCode: string;
  sourceType: string;
  severity: string;
  occurrences: number;
  affectedUsers: number;
  firstSeen: string;
  lastSeen: string;
  sourceName: string;
  resolvedMessage: string | null;
  message?: string;
}

export interface ErrorLogImpactBySeverity {
  count: number;
  affectedUsers: number;
  totalErrors: number;
}

export interface ErrorLogImpact {
  critical: number | null;
  high: number | null;
  totalAffectedUsers: number;
  criticalErrorRate: number;
  highErrorRate: number;
  bySeverity?: Record<string, ErrorLogImpactBySeverity>;
}

export interface ErrorLogDashboardStats {
  summary: ErrorLogSummary;
  byType: Record<string, ErrorLogTypeStats>;
  bySeverity: Record<string, ErrorLogSeverityStats>;
  trends: ErrorLogTrend[];
  errorGroups: ErrorGroup[];
  totalErrorGroups?: number;
  patterns: any[];
  impact: ErrorLogImpact;
}

export interface ErrorLogDashboardResponse {
  success: boolean;
  code: number;
  message: string;
  data: ErrorLogDashboardStats;
  error: null;
}

// Prompt Types
export interface Prompt {
  _id: string;
  type: string;
  name: string;
  aiRole: string;
  systemRole: string;
  objective: string;
  moduleId?: string | null;
  iconPath?: string | null;
  tech?: string | null;
  taskInstructions?: string | null;
  taskInput?: string | null;
  taskOutputFormat?: string | null;
  taskExample?: Record<string, any> | null;
  llm?: string | null;
  settingsJson?: Record<string, any> | null;
  createdBy: string;
  createdAt: string;
  updatedBy?: string | null;
  updatedAt?: string | null;
  isDeleted: boolean;
}

export interface PromptWithId extends Prompt {
  id: string; // For DataGrid
}

export interface PromptCreateRequest {
  type: string;
  name: string;
  aiRole: string;
  systemRole: string;
  objective: string;
  iconPath?: string | null;
  tech?: string | null;
  taskInstructions?: string | null;
  taskInput?: string | null;
  taskOutputFormat?: string | null;
  taskExample?: Record<string, any> | null;
  llm?: string | null;
  settingsJson?: Record<string, any> | null;
}

export interface PromptUpdateRequest {
  type: string;
  name: string;
  aiRole: string;
  systemRole: string;
  objective: string;
  iconPath?: string | null;
  tech?: string | null;
  taskInstructions?: string | null;
  taskInput?: string | null;
  taskOutputFormat?: string | null;
  taskExample?: Record<string, any> | null;
  llm?: string | null;
  settingsJson?: Record<string, any> | null;
}

export interface PromptSearchParams {
  name?: string;
  type?: string;
  aiRole?: string;
  llm?: string;
  page?: number;
  pageSize?: number;
}

export interface PromptListParams {
  page?: number;
  pageSize?: number;
  include_deleted?: boolean;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedPromptResponse {
  data: Prompt[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PromptFormData {
  type: string;
  name: string;
  aiRole: string;
  systemRole: string;
  objective: string;
  iconPath: string;
  tech: string;
  taskInstructions: string;
  taskInput: string;
  taskOutputFormat: string;
  taskExample: string; // JSON string for form
  llm: string;
  settingsJson: string; // JSON string for form
}

// Log Master Types
export interface LogMaster {
  _id: string;
  eventCode: string;
  logObject: string;
  action: string;
  keyFields: string;
  parameters?: string[];
  retentionPeriod: number;
  messageTemplate: string;
  templateParameters?: Record<string, any>;
  isActive?: boolean;
  layer: string;
  isUsageTrackable: boolean;
  isSensitive: boolean;
  description: string;
  logLevel: string;
  logtype: string;
  createdBy?: string;
  createdAt?: string;
  createdIp?: string;
  updatedBy?: string;
  updatedAt?: string;
  updatedIp?: string;
  isDelete?: boolean;
}

export interface LogMasterCreateRequest {
  eventCode: string;
  logObject: string;
  action: string;
  keyFields: string;
  parameters?: string[];
  retentionPeriod: number;
  messageTemplate: string;
  templateParameters?: Record<string, any>;
  isActive?: boolean;
  layer: string;
  isUsageTrackable: boolean;
  isSensitive: boolean;
  description: string;
  logLevel?: string;
  logtype?: string;
}

export interface LogMasterUpdateRequest {
  logObject?: string;
  action?: string;
  keyFields?: string;
  parameters?: string[];
  retentionPeriod?: number;
  messageTemplate?: string;
  templateParameters?: Record<string, any>;
  isActive?: boolean;
  layer?: string;
  isUsageTrackable?: boolean;
  isSensitive?: boolean;
  eventCode?: string;
  description?: string;
  logLevel?: string;
  logtype?: string;
}

export interface LogMasterQueryParams {
  eventCode?: string;
  layer?: string;
  action?: string;
  logObject?: string;
  logtype?: string;
  include_deleted?: boolean;
  page?: number;
  page_size?: number;
}

export interface LogMasterFormData {
  eventCode: string;
  logObject: string;
  action: string;
  keyFields: string;
  description: string;
  messageTemplate: string;
  templateParameters: string; // JSON string for form editing
  layer: string;
  logLevel: string;
  logtype: string;
  retentionPeriod: string;
  isSensitive: boolean;
  isUsageTrackable: boolean;
}

// Level (Hierarchy Level) Types
export interface Level {
  _id: string;
  levelNumber: number;
  levelName: string;
  levelCode: string;
  description?: string;
  levelIcon?: string | null;
  canHaveChildren: boolean;
  // Statistics - populated from API
  unitCount?: number;
  childLevelCount?: number;
  totalPersonnel?: number;
  vacantPositions?: number;
  createdBy?: string;
  createdAt?: string;
  createdIp?: string;
  updatedBy?: string;
  updatedAt?: string;
  updatedIp?: string;
  isDelete?: boolean;
  isActive?: boolean;
}

export interface LevelCreateRequest {
  levelNumber: number;
  levelName: string;
  levelCode: string;
  description?: string;
  levelIcon?: string | null;
  canHaveChildren?: boolean;
}

export interface LevelUpdateRequest {
  levelNumber?: number;
  levelName?: string;
  levelCode?: string;
  description?: string;
  levelIcon?: string | null;
  canHaveChildren?: boolean;
}

export interface LevelQueryParams {
  include_deleted?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

// Level Statistics for view page
export interface LevelStatistics {
  totalUnits: number;
  totalPersonnel: number;
  childUnits: number;
  vacantPositions: number;
}

// Child Unit for level view
export interface LevelChildUnit {
  _id: string;
  name: string;
  policeReferenceId?: string;
  personnelCount?: number;
  vacancies?: number;
}

// ============================================================
// EMBEDDED POST TYPES (Posts embedded within Unit)
// ============================================================

// ReportsToPost reference - which post this post reports to
export interface ReportsToPost {
  unitId?: string | null;    // Unit ID where superior post exists (null = same unit or no superior)
  postCode?: string | null;  // Post code of the superior post
  postName?: string | null;  // Post name of the superior post (null for highest ranking posts)
}

// ReportsToPost with populated unit name (for display)
export interface ReportsToPostPopulated {
  unitId?: string | null;
  unitName?: string | null;  // Populated unit name
  postName?: string | null;
}

// Embedded Post - base structure for create/update
export interface EmbeddedPost {
  postCode: string;
  postName: string;
  isUnitHead: boolean;
  reportsToPost?: ReportsToPost | null;
  assignedRoles: string[];           // Array of system role ObjectIds (FK: rank_roles._id)
  assignedUser?: string | null;      // Single personnel ObjectId (NOT array)
  description?: string;
  isActive?: boolean;
  isDelete?: boolean;
}

// Embedded Post Create Request
export interface EmbeddedPostCreateRequest {
  postCode: string;
  postName: string;
  isUnitHead?: boolean;
  reportsToPost?: ReportsToPost | null;
  assignedRoles?: string[];
  assignedUser?: string | null;
  description?: string;
}

// Embedded Post Update Request
export interface EmbeddedPostUpdateRequest {
  postCode?: string;
  postName?: string;
  isUnitHead?: boolean;
  reportsToPost?: ReportsToPost | null;
  assignedRoles?: string[];
  assignedUser?: string | null;
  description?: string;
  isActive?: boolean;
}

// Populated System Role object (from GET /units/{id})
export interface PopulatedSystemRole {
  _id: string;
  roleName: string;
  roleShortCode?: string;
}

// Populated Personnel object (from GET /units/{id})
export interface PopulatedPersonnel {
  _id: string;
  name: string;
  employeeId?: string;
  userId?: string;
  picture?: string | null;
}

// Embedded Post with populated references (from GET /units/{id})
export interface EmbeddedPostPopulated {
  postCode: string;
  postName: string;
  isUnitHead: boolean;
  reportsToPost?: ReportsToPostPopulated | null;
  assignedRoles: PopulatedSystemRole[];  // Populated system role objects
  assignedUser?: PopulatedPersonnel | null;  // Populated personnel object
  description?: string;
  isActive: boolean;
  isDelete: boolean;
}

// Post assign user request
export interface PostAssignUserRequest {
  userId: string;
}

// Post roles request
export interface PostRolesRequest {
  roleIds: string[];
}

// ============================================================
// LEGACY POST TYPES (For backward compatibility with post_master)
// ============================================================

// Post (Position Management) Types - Legacy
export interface PostPosition {
  positionCode: string;
  positionName: string;
  personnelId?: string | null;
  // Resolved fields from API
  personnelName?: string;
  personnelRank?: string;
}

export interface Post {
  _id: string;
  postCode: string;
  postName: string;
  unitId: string;
  isUnitHead: boolean;
  allowedRanks: string[];
  reportsToPostId?: string | null;
  positions: PostPosition[];
  description?: string;
  isActive?: boolean;
  isDelete?: boolean;
  // Computed stats
  sanctioned?: number;
  filled?: number;
  vacant?: number;
  // Resolved fields
  unitName?: string;
  reportsToPostName?: string;
  allowedRankNames?: string[];
  // Audit fields
  createdBy?: string;
  createdAt?: string;
  createdIp?: string;
  updatedBy?: string;
  updatedAt?: string;
  updatedIp?: string;
}

export interface PostWithStats extends Post {
  sanctioned: number;
  filled: number;
  vacant: number;
}

export interface PostCreateRequest {
  postCode: string;
  postName: string;
  unitId: string;
  isUnitHead?: boolean;
  allowedRanks?: string[];
  sanctionedCount: number;
  reportsToPostId?: string | null;
  description?: string;
}

export interface PostUpdateRequest {
  postCode?: string;
  postName?: string;
  isUnitHead?: boolean;
  allowedRanks?: string[];
  sanctionedCount?: number;
  reportsToPostId?: string | null;
  description?: string;
}

export interface PostQueryParams {
  unit_id?: string;
  include_deleted?: boolean;
  is_active?: boolean;
  search?: string;
  sort_field?: string;
  sort_order?: number;
  page?: number;
  page_size?: number;
}

export interface PostAssignRequest {
  positionCode: string;
  personnelId: string;
}

export interface PostUnassignRequest {
  positionCode: string;
}

// Export role types
export * from './role.types';

// Export log transaction types
export * from './log-transaction.types';

// Export prompt execution types
export * from './prompt-execution.types';
