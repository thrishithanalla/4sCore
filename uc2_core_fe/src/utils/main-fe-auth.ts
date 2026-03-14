/**
 * Main FE Authentication Utilities
 *
 * This file provides types and utilities for consuming authentication
 * from main_fe via Module Federation
 */

// Selected assignment type
export interface SelectedAssignment {
  assignmentId: string;
  unitId: string;
  unitName: string;
  postCode: string;
  postName: string;
  districtId?: string;
  districtName?: string;
}

// Auth types matching main_fe structure
export interface User {
  _id: string;
  email: string;
  userId: string;
  title: string;
  firstName: string;
  lastName: string;
  unitId: string | null;
  departmentId: string | null;
  rankId: string | null;
  picture: string | null;
  mobile: string;
  batchYear: number;
  badgeNo: string;
  dateOfBirth: string;
  gender: string;
  createdBy: string;
  createdAt: string;
  isDeleted: boolean;
}

export interface AuthTokens {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  loading: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: any;
  selectedAssignment?: SelectedAssignment | null;
}

export interface RootState {
  auth: AuthState;
}
