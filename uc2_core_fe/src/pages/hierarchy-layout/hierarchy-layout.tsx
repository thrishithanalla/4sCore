/**
 * Hierarchy Layout Page
 *
 * Displays unit hierarchical data using ClassicTree component.
 * Fetches flat data from /api/v1/units/list-all and transforms to tree structure.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dropdown } from 'mainFe/Dropdown';
import { Dialog } from 'primereact/dialog';
import ClassicTree from '../../components/tree/ClassicTree';
import type { TreeNode } from '../../types/tree.types';
import { unitsService } from '../../services/units.service';
import type { Unit } from '../../types';
import { RefreshButton } from 'mainFe/RefreshButton';
import { Button } from 'mainFe/Button';

// Interface for flat unit data from API (/units/list-all)
interface UnitApiItem {
  _id: string;
  name: string;
  parentUnit?: { _id?: string; name?: string } | string | null;
  parentUnitId?: string | null; // Fallback field
  unitType?: { name?: string; _id?: string } | string;
  hierarchyLevel?: { name?: string; levelCode?: string; _id?: string } | string;
  department?: { name?: string; _id?: string } | string;
  isActive?: boolean;
  isDelete?: boolean;
  childCount?: number;
  posts?: any[];
  [key: string]: any;
}

// Interface for tree node structure (internal)
interface UnitTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  unitType: string;
  level: string;
  department: string;
  isActive: boolean;
  childCount: number;
  children: UnitTreeNode[];
}

// Helper to extract parent unit ID from various formats
const getParentUnitId = (item: UnitApiItem): string | null => {
  // Check parentUnit object first (from /units/list-all)
  if (item.parentUnit) {
    if (typeof item.parentUnit === 'object' && item.parentUnit._id) {
      return item.parentUnit._id;
    }
    if (typeof item.parentUnit === 'string') {
      return item.parentUnit;
    }
  }
  // Fallback to parentUnitId field
  return item.parentUnitId || null;
};

// Build tree from flat list using _id and parentUnit/parentUnitId
const buildTreeFromFlat = (flatList: UnitApiItem[]): UnitTreeNode[] => {
  // Create a map for quick lookup
  const nodeMap = new Map<string, UnitTreeNode>();
  const rootNodes: UnitTreeNode[] = [];

  // First pass: create all nodes
  flatList.forEach((item) => {
    const unitType = typeof item.unitType === 'object' ? item.unitType?.name : item.unitType;
    const level = typeof item.hierarchyLevel === 'object'
      ? item.hierarchyLevel?.name || item.hierarchyLevel?.levelCode
      : item.hierarchyLevel;
    const department = typeof item.department === 'object' ? item.department?.name : item.department;
    const parentId = getParentUnitId(item);

    nodeMap.set(item._id, {
      id: item._id,
      name: item.name || 'Unknown',
      parentId: parentId,
      unitType: unitType || '',
      level: level || '',
      department: department || 'L&O',
      isActive: item.isActive !== false,
      childCount: 0,
      children: [],
    });
  });

  // Second pass: build parent-child relationships
  flatList.forEach((item) => {
    const node = nodeMap.get(item._id);
    if (!node) return;

    const parentId = getParentUnitId(item);
    if (parentId && nodeMap?.has(parentId)) {
      // Has a valid parent - add as child
      const parent = nodeMap?.get(parentId)!;
      parent.children.push(node);
      parent.childCount = parent.children.length;
    } else {
      // No parent or parent not found - this is a root node
      rootNodes.push(node);
    }
  });

  return rootNodes;
};

// Flatten tree for dropdown options
const flattenTreeNodes = (nodes: UnitTreeNode[]): { id: string; name: string; department: string }[] => {
  let result: { id: string; name: string; department: string }[] = [];
  nodes.forEach((node) => {
    result.push({ id: node.id, name: node.name, department: node.department });
    if (node.children.length > 0) {
      result = [...result, ...flattenTreeNodes(node.children)];
    }
  });
  return result;
};

// Find a node in the tree
const findTreeNode = (nodes: UnitTreeNode[], id: string): UnitTreeNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children.length > 0) {
      const found = findTreeNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
};

// Get all ancestor node IDs for a given node (for expanding the path to the node)
const getAncestorIds = (nodes: UnitTreeNode[], targetId: string): string[] => {
  const ancestors: string[] = [];

  const findPath = (nodeList: UnitTreeNode[], target: string, currentPath: string[]): boolean => {
    for (const node of nodeList) {
      if (node.id === target) {
        ancestors.push(...currentPath);
        return true;
      }
      if (node.children.length > 0) {
        if (findPath(node.children, target, [...currentPath, node.id])) {
          return true;
        }
      }
    }
    return false;
  };

  findPath(nodes, targetId, []);
  return ancestors;
};

// Get all node IDs from the tree (for expand all functionality)
const getAllNodeIds = (nodes: UnitTreeNode[]): string[] => {
  let ids: string[] = [];
  nodes.forEach((node) => {
    ids.push(node.id);
    if (node.children.length > 0) {
      ids = [...ids, ...getAllNodeIds(node.children)];
    }
  });
  return ids;
};

// Map internal tree to ClassicTree TreeNode format
const mapToTreeNode = (nodes: UnitTreeNode[]): TreeNode[] => {
  return nodes.map((node) => ({
    id: node.id,
    label: node.level ? `${node.name} (${node.level})` : node.name,
    type: node.children.length > 0 ? 'unit' : 'user',
    count: node.childCount || node.children.length,
    children: node.children.length > 0 ? mapToTreeNode(node.children) : [],
  }));
};

interface HierarchyLayoutProps {
  embedded?: boolean; // When true, hides page header for use inside tabs
}

const HierarchyLayout = ({ embedded = false }: HierarchyLayoutProps) => {
  const [rawData, setRawData] = useState<UnitApiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  // 'expanded' = expand all, 'collapsed' = collapse all, null = manual/default
  const [expandMode, setExpandMode] = useState<{ mode: 'expanded' | 'collapsed' } | null>(null);
  console.log('expandMo==', expandMode);

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [selectedUnitDetails, setSelectedUnitDetails] = useState<Unit | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  // Fetch unit data
  const fetchTreeData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await unitsService.getUnitTree();
      console.log('API Response:', data);
      setRawData(data as unknown as UnitApiItem[]);
    } catch (err: any) {
      console.error('Failed to fetch unit tree:', err);
      setError(err.message || 'Failed to load hierarchy data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchTreeData();
  }, [fetchTreeData]);

  // Build tree from flat data
  const treeStructure = useMemo(() => buildTreeFromFlat(rawData), [rawData]);

  // Flatten for dropdown
  const allUnits = useMemo(() => flattenTreeNodes(treeStructure), [treeStructure]);

  // Convert full tree to ClassicTree TreeNode format (always show entire hierarchy)
  const treeData = useMemo(() => mapToTreeNode(treeStructure), [treeStructure]);

  // Calculate which nodes should be expanded to reveal the selected unit
  const expandedIds = useMemo(() => {
    // If expand all is active, return all node IDs
    if (expandMode?.mode === 'expanded') {
      const allIds = getAllNodeIds(treeStructure);
      return new Set(allIds);
    }
    // If collapse all is active, return empty set to collapse everything
    if (expandMode?.mode === 'collapsed') {
      return new Set<string>();
    }
    // If a unit is selected, expand its ancestor path
    if (selectedUnitId) {
      const ancestors = getAncestorIds(treeStructure, selectedUnitId);
      return new Set(ancestors);
    }
    // No controlled expansion - let user expand manually
    return undefined;
  }, [treeStructure, selectedUnitId, expandMode]);

  // Handle node click - open dialog for any node (parent or child)
  const handleNodeClick = async (node: TreeNode) => {
    console.log('Node clicked:', node);
    setDialogVisible(true);
    setDialogLoading(true);
    try {
      const unitDetails = await unitsService.getById(node.id);
      setSelectedUnitDetails(unitDetails);
    } catch (err) {
      console.error('Failed to fetch unit details:', err);
      setSelectedUnitDetails(null);
    } finally {
      setDialogLoading(false);
    }
  };

  // Get hierarchy path for selected unit
  const getHierarchyPath = (unitId: string): UnitTreeNode[] => {
    const path: UnitTreeNode[] = [];
    const findPath = (nodes: UnitTreeNode[], targetId: string, currentPath: UnitTreeNode[]): boolean => {
      for (const node of nodes) {
        const newPath = [...currentPath, node];
        if (node.id === targetId) {
          path.push(...newPath);
          return true;
        }
        if (node.children.length > 0 && findPath(node.children, targetId, newPath)) {
          return true;
        }
      }
      return false;
    };
    findPath(treeStructure, unitId, []);
    return path;
  };

  // Close dialog
  const handleDialogClose = () => {
    setDialogVisible(false);
    setSelectedUnitDetails(null);
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchTreeData();
  };

  // Dropdown options - memoized to prevent recreation on every render
  const unitOptions = useMemo(() => [
    { label: 'All Units', value: null },
    ...allUnits.map((unit) => ({
      label: `${unit.department} - ${unit.name}`,
      value: unit.id,
    })),
  ], [allUnits]);

  return (
    <div className={embedded ? 'p-4 flex flex-col flex-1 min-h-0 overflow-auto' : 'py-4 px-6'} style={embedded ? { scrollBehavior: 'smooth' } : undefined}>
      {/* Page Header - only show when not embedded */}
      {!embedded && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <i className="pi pi-sitemap text-white" style={{ fontSize: '1.25rem' }} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Hierarchy Layout</h1>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 ml-13">
            View organizational hierarchy structure
          </p>
        </div>
      )}

      {/* Main Content Card */}
      <div className={embedded ? '' : 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700'}>
        {/* Toolbar */}
        <div className={embedded ? 'py-4' : 'px-6 py-4 border-b border-gray-200 dark:border-gray-700'}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Dropdown
                value={selectedUnitId}
                options={unitOptions}
                onChange={(e: { value: string | null }) => setSelectedUnitId(e.value ?? null)}
                placeholder="Select a unit to filter"
                className="w-full md:w-80"
                filter
                showClear
                filterPlaceholder="Search units..."
                scrollHeight="250px"
              />
              <Button
                label="Expand All"
                icon="pi pi-plus-circle"
                onClick={() => setExpandMode({ mode: 'expanded' })}
                size="small"
                severity="secondary"
                outlined
                testId="HierarchyLayout.Button.ExpandAll"
              />
              <Button
                label="Collapse All"
                icon="pi pi-minus-circle"
                onClick={() => setExpandMode({ mode: 'collapsed' })}
                size="small"
                severity="secondary"
                outlined
                testId="HierarchyLayout.Button.CollapseAll"
              />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Total Units: <strong>{rawData.length}</strong>
              </span>
              <RefreshButton onClick={handleRefresh} loading={loading} testId="HierarchyLayout.Button.Refresh" />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className={embedded ? 'pt-4' : 'p-6'}>
          {/* Error State */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 text-red-800 dark:text-red-400">
                <i className="pi pi-exclamation-circle"></i>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Tree Component */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <i className="pi pi-spin pi-spinner text-3xl text-blue-500" />
            </div>
          ) : (
            <div className={embedded ? '' : 'max-h-[500px] overflow-auto'}>
              <ClassicTree
                data={treeData}
                onNodeClick={handleNodeClick}
                expandedIds={expandedIds}
                highlightedId={selectedUnitId}
              />
            </div>
          )}
        </div>
      </div>

      {/* Unit Details Dialog */}
      <Dialog
        visible={dialogVisible}
        onHide={handleDialogClose}
        header={
          <div className="flex items-center justify-between w-full pr-8">
            {/* Left - Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <i className="pi pi-building text-white" style={{ fontSize: '1.25rem' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedUnitDetails?.name || 'Unit Details'}
                </h2>
                {(selectedUnitDetails as any)?.hierarchyLevel && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {typeof (selectedUnitDetails as any).hierarchyLevel === 'object'
                      ? (selectedUnitDetails as any).hierarchyLevel.name
                      : (selectedUnitDetails as any).hierarchyLevel}
                  </span>
                )}
              </div>
            </div>
            {/* Right - Stats */}
            {selectedUnitDetails && (() => {
              const activePosts = selectedUnitDetails.posts?.filter((post: any) => !post.isDelete) || [];
              const totalPosts = activePosts.length;
              const assignedPosts = activePosts.filter((post: any) => post.assignedUser).length;
              const vacantPosts = totalPosts - assignedPosts;
              return (
                <div className="flex items-center gap-5">
                  <div className="flex items-center gap-1.5">
                    <i className="pi pi-id-card text-blue-300 dark:text-blue-200" style={{ fontSize: '12px' }} />
                    <span className="text-blue-600 dark:text-blue-200" style={{ fontSize: '12px' }}>{totalPosts}</span>
                    <span className="text-gray-600 dark:text-gray-200" style={{ fontSize: '12px' }}>Posts</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <i className="pi pi-user-plus text-green-300 dark:text-green-200" style={{ fontSize: '12px' }} />
                    <span className="text-green-600 dark:text-green-200" style={{ fontSize: '12px' }}>{assignedPosts}</span>
                    <span className="text-gray-600 dark:text-gray-400" style={{ fontSize: '12px' }}>Assigned</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <i className="pi pi-user-minus text-orange-300 dark:text-orange-200" style={{ fontSize: '12px' }} />
                    <span className="font-semibold text-orange-300 dark:text-orange-200" style={{ fontSize: '12px' }}>{vacantPosts}</span>
                    <span className="text-gray-600 dark:text-gray-200" style={{ fontSize: '12px' }}>Vacant</span>
                  </div>
                </div>
              );
            })()}
          </div>
        }
        style={{ width: '90vw', maxWidth: '1200px' }}
        modal
        className="unit-details-dialog"
        contentStyle={{ padding: '1.5rem', maxHeight: '70vh', overflow: 'auto' }}
      >
        {dialogLoading ? (
          <div className="flex items-center justify-center py-12">
            <i className="pi pi-spin pi-spinner text-2xl text-blue-500" />
          </div>
        ) : selectedUnitDetails ? (
          <div>
            {/* Main Content */}
            <div className="flex gap-0">
              {/* Left Side - Posts */}
              <div className="flex-1 pr-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <i className="pi pi-id-card text-blue-500" />
                  Posts List
                </h3>
                {selectedUnitDetails.posts && selectedUnitDetails.posts.length > 0 ? (
                  <div className="space-y-1.5 max-h-[450px] overflow-y-auto pr-2 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {selectedUnitDetails.posts
                      .filter((post: any) => !post.isDelete)
                      .map((post: any, index: number) => (
                        <div
                          key={post.postCode || index}
                          className="p-2 rounded-lg transition-all"
                          style={{
                            border: '1.5px solid transparent',
                            backgroundImage: post.assignedUser
                              ? 'linear-gradient(white, white), linear-gradient(135deg, #22c55e, #059669, #10b981)'
                              : 'linear-gradient(white, white), linear-gradient(135deg, #f97316, #ea580c, #fb923c)',
                            backgroundOrigin: 'border-box',
                            backgroundClip: 'padding-box, border-box',
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-800 dark:text-gray-200" style={{ fontSize: '12px' }}>
                              {post.postName}
                            </span>
                            {post.isUnitHead && (
                              <span className="bg-blue-600 text-white px-2 py-0.5 rounded font-medium" style={{ fontSize: '12px' }}>
                                Unit Head
                              </span>
                            )}
                          </div>
                          {post.assignedUser && (
                            <div className="mt-1 flex items-center gap-2" style={{ fontSize: '12px' }}>
                              <i className="pi pi-user text-green-600" />
                              <span className="text-green-700 dark:text-green-400 font-medium">
                                {typeof post.assignedUser === 'object' ? post.assignedUser.name : 'Assigned'}
                              </span>
                            </div>
                          )}
                          {!post.assignedUser && (
                            <div className="mt-1 flex items-center gap-2" style={{ fontSize: '12px' }}>
                              <i className="pi pi-user-minus text-orange-600" />
                              <span className="text-orange-700 dark:text-orange-400 font-medium">Vacant</span>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <i className="pi pi-inbox text-3xl mb-2 block text-gray-300 dark:text-gray-600" />
                    No posts defined
                  </div>
                )}
            </div>

            {/* Center Divider */}
            <div className="w-px bg-gray-300 dark:bg-gray-600 mx-4" />

            {/* Right Side - Hierarchy Path */}
            <div className="flex-1 pl-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                <i className="pi pi-sitemap text-purple-500" />
                Hierarchy Path
              </h3>
              {(() => {
                const hierarchyPath = getHierarchyPath(selectedUnitDetails._id);
                return hierarchyPath.length > 0 ? (
                  <div className="space-y-1 max-h-[450px] overflow-y-auto pr-2 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {hierarchyPath.map((node, index) => (
                      <div key={node.id} className="flex items-center">
                        {/* Indentation */}
                        <div style={{ width: `${index * 16}px` }} />
                        {/* Connector line */}
                        {index > 0 && (
                          <div className="flex items-center mr-2">
                            <div className="w-3 h-px bg-gray-300 dark:bg-gray-600" />
                          </div>
                        )}
                        {/* Node */}
                        <div
                          className={`flex items-center gap-2 px-3 py-2 rounded-md ${
                            node.id === selectedUnitDetails._id
                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium'
                              : index === 0
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium'
                              : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}
                          style={{ fontSize: '12px' }}
                        >
                          <i className={`pi ${index === hierarchyPath.length - 1 ? 'pi-map-marker' : 'pi-building'}`} style={{ fontSize: '12px' }} />
                          <span>{node.name}</span>
                          {node.level && (
                            <span className="text-gray-500 dark:text-gray-400" style={{ fontSize: '12px' }}>
                              ({node.level})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                    No hierarchy data
                  </div>
                );
              })()}
            </div>
          </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Failed to load unit details
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default HierarchyLayout;
