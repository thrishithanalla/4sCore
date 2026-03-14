/**
 * Tree Data Types
 * Types and interfaces for hierarchical tree components
 */

export type NodeType = 'unit' | 'department' | 'section' | 'user' | 'team';

export interface TreeNode {
  id: string;
  label: string;
  type: NodeType;
  meta?: string;
  count?: number;
  children?: TreeNode[];
}
