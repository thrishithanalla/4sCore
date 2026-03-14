/**
 * OrganizationalTree Component
 *
 * Reusable tree component for displaying hierarchical organizational structures.
 * Built with PrimeReact Tree component with custom styling and features.
 *
 * Features:
 * - Collapsible/Expandable nodes
 * - Search/Filter capability
 * - Node icons based on unit type
 * - Personnel count badges
 * - Click handlers for node selection
 * - Loading state
 * - Refresh capability
 *
 * Usage:
 * ```tsx
 * <OrganizationalTree
 *   data={orgData}
 *   loading={isLoading}
 *   onNodeClick={(node) => console.log(node)}
 *   onRefresh={() => refetch()}
 * />
 * ```
 */

import { useState, useMemo } from 'react';
import { Tree, TreeNodeDoubleClickEvent, TreeSelectionEvent } from 'primereact/tree';
import { TreeNode } from 'primereact/treenode';
import { InputText } from 'primereact/inputtext';
import { Card } from 'primereact/card';
import { Badge } from 'primereact/badge';
import { Skeleton } from 'primereact/skeleton';
import { Button } from 'primereact/button';

export interface OrgUnit {
  unitId: string;
  unitName: string;
  unitCd?: string;
  unitType?: string;
  hierarchyLevel?: string;
  rank?: string;
  parentUnitId?: string;
  incharge?: {
    _id: string;
    name: string;
    badge?: string;
    rank?: string;
    phone?: string;
    email?: string;
  };
  jurisdiction?: Array<{
    type: string;
    refId?: string;
    name: string;
    code?: string;
  }>;
  personnelCount: number;
  totalChildUnits: number;
  totalPersonnel: number;
  districtName?: string;
  city?: string;
  address?: string;
  phone?: string[];
  email?: string;
  isActive: boolean;
  children?: OrgUnit[];
}

export interface OrganizationalTreeProps {
  /** Tree data in hierarchical format */
  data: OrgUnit[];
  /** Loading state */
  loading?: boolean;
  /** Callback when node is clicked */
  onNodeClick?: (unit: OrgUnit) => void;
  /** Callback when node is double-clicked */
  onNodeDoubleClick?: (unit: OrgUnit) => void;
  /** Callback for refresh action */
  onRefresh?: () => void;
  /** Show search/filter box */
  showSearch?: boolean;
  /** Show refresh button */
  showRefreshButton?: boolean;
  /** Custom CSS class */
  className?: string;
  /** Test ID for testing */
  testId?: string;
  /** Selection mode */
  selectionMode?: 'single' | 'multiple' | 'checkbox';
  /** Initial expanded nodes */
  expandedKeys?: Record<string, boolean>;
}

/**
 * Get icon for unit based on unit type
 */
const getUnitIcon = (unitType?: string): string => {
  const type = unitType?.toLowerCase() || '';

  if (type.includes('state') || type.includes('dgp')) return 'pi pi-flag';
  if (type.includes('zone')) return 'pi pi-map';
  if (type.includes('range') || type.includes('commissionerate')) return 'pi pi-building';
  if (type.includes('district')) return 'pi pi-map-marker';
  if (type.includes('subdivision') || type.includes('division')) return 'pi pi-sitemap';
  if (type.includes('circle')) return 'pi pi-circle';
  if (type.includes('police station') || type.includes('ps')) return 'pi pi-shield';
  if (type.includes('beat')) return 'pi pi-compass';

  return 'pi pi-sitemap'; // Default icon
};

/**
 * Convert OrgUnit to PrimeReact TreeNode format
 */
const convertToTreeNode = (unit: OrgUnit): TreeNode => {
  return {
    key: unit.unitId,
    label: unit.unitName,
    data: unit,
    icon: getUnitIcon(unit.unitType),
    children: unit.children ? unit.children.map(convertToTreeNode) : undefined,
  };
};

/**
 * Custom node template with badges and info
 */
const nodeTemplate = (node: TreeNode) => {
  const unit = node.data as OrgUnit;

  return (
    <div className="flex items-center gap-3 py-1">
      {/* Unit Name and Type */}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-800">{unit.unitName}</span>
          {unit.unitType && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {unit.unitType}
            </span>
          )}
          {!unit.isActive && (
            <Badge value="Inactive" severity="danger" />
          )}
        </div>

        {/* Incharge Info */}
        {unit.incharge && (
          <div className="text-sm text-gray-600 mt-1">
            <i className="pi pi-user text-xs mr-1"></i>
            <span className="font-medium">{unit.incharge.name}</span>
            {unit.incharge.rank && (
              <span className="text-gray-500"> ({unit.incharge.rank})</span>
            )}
          </div>
        )}

        {/* District */}
        {unit.districtName && (
          <div className="text-xs text-gray-500 mt-0.5">
            <i className="pi pi-map-marker text-xs mr-1"></i>
            {unit.districtName}
          </div>
        )}
      </div>

      {/* Personnel Count Badges */}
      <div className="flex gap-2">
        <div className="flex flex-col items-center bg-blue-50 px-3 py-1 rounded">
          <span className="text-xs text-gray-600">Direct</span>
          <span className="text-sm font-bold text-blue-600">{unit.personnelCount}</span>
        </div>
        {unit.totalChildUnits > 0 && (
          <div className="flex flex-col items-center bg-green-50 px-3 py-1 rounded">
            <span className="text-xs text-gray-600">Total</span>
            <span className="text-sm font-bold text-green-600">{unit.totalPersonnel}</span>
          </div>
        )}
        {unit.totalChildUnits > 0 && (
          <div className="flex flex-col items-center bg-purple-50 px-3 py-1 rounded">
            <span className="text-xs text-gray-600">Units</span>
            <span className="text-sm font-bold text-purple-600">{unit.totalChildUnits}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const OrganizationalTree: React.FC<OrganizationalTreeProps> = ({
  data,
  loading = false,
  onNodeClick,
  onNodeDoubleClick,
  onRefresh,
  showSearch = true,
  showRefreshButton = true,
  className = '',
  testId = 'org-tree',
  selectionMode,
  expandedKeys: initialExpandedKeys,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>(
    initialExpandedKeys || {}
  );

  // Convert data to tree nodes
  const treeNodes = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(convertToTreeNode);
  }, [data]);

  // Filter tree based on search
  const filteredNodes = useMemo(() => {
    if (!searchTerm) return treeNodes;

    const filterNode = (node: TreeNode): TreeNode | null => {
      const unit = node.data as OrgUnit;
      const matchesSearch =
        unit.unitName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        unit.unitType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        unit.incharge?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        unit.districtName?.toLowerCase().includes(searchTerm.toLowerCase());

      const filteredChildren = node.children
        ?.map(filterNode)
        .filter((child): child is TreeNode => child !== null) || [];

      if (matchesSearch || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
        };
      }

      return null;
    };

    return treeNodes
      .map(filterNode)
      .filter((node): node is TreeNode => node !== null);
  }, [treeNodes, searchTerm]);

  // Handle node selection
  const handleSelectionChange = (e: TreeSelectionEvent) => {
    const key = typeof e.value === 'string' ? e.value : Object.keys(e.value)[0];
    setSelectedKey(key);

    if (onNodeClick) {
      const findUnitByKey = (nodes: TreeNode[], targetKey: string): OrgUnit | null => {
        for (const node of nodes) {
          if (node.key === targetKey) return node.data as OrgUnit;
          if (node.children) {
            const found = findUnitByKey(node.children, targetKey);
            if (found) return found;
          }
        }
        return null;
      };

      const unit = findUnitByKey(treeNodes, key);
      if (unit) onNodeClick(unit);
    }
  };

  // Handle double click
  const handleDoubleClick = (e: TreeNodeDoubleClickEvent) => {
    if (onNodeDoubleClick) {
      const unit = e.node.data as OrgUnit;
      onNodeDoubleClick(unit);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <Card className={className} data-testid={`${testId}-loading`}>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton width="2rem" height="2rem" />
              <Skeleton width="70%" height="2rem" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <Card className={className} data-testid={`${testId}-empty`}>
        <div className="text-center py-8">
          <i className="pi pi-sitemap text-gray-400 text-6xl mb-4"></i>
          <p className="text-gray-500 text-lg">No organizational units found</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={className} data-testid={testId}>
      {/* Header with Search and Actions */}
      {(showSearch || showRefreshButton) && (
        <div className="mb-4 flex gap-3 items-center">
          {showSearch && (
            <span className="p-input-icon-left flex-1">
              <i className="pi pi-search" />
              <InputText
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search units, officers, districts..."
                className="w-full"
                data-testid={`${testId}-search`}
              />
            </span>
          )}

          {showRefreshButton && onRefresh && (
            <Button
              icon="pi pi-refresh"
              onClick={onRefresh}
              tooltip="Refresh"
              tooltipOptions={{ position: 'top' }}
              data-testid={`${testId}-refresh`}
              severity="secondary"
              outlined
            />
          )}
        </div>
      )}

      {/* Tree */}
      <Tree
        value={filteredNodes}
        selectionMode={selectionMode || 'single'}
        selectionKeys={selectedKey ? { [selectedKey]: true } : undefined}
        onSelectionChange={handleSelectionChange}
        onNodeDoubleClick={handleDoubleClick}
        expandedKeys={expandedKeys}
        onToggle={(e) => setExpandedKeys(e.value)}
        nodeTemplate={nodeTemplate}
        className="w-full"
        data-testid={`${testId}-tree`}
        filter={false} // We handle filtering manually
      />

      {/* No Results */}
      {searchTerm && filteredNodes.length === 0 && (
        <div className="text-center py-8">
          <i className="pi pi-search text-gray-400 text-4xl mb-3"></i>
          <p className="text-gray-500">No units found matching "{searchTerm}"</p>
          <Button
            label="Clear Search"
            onClick={() => setSearchTerm('')}
            text
            className="mt-2"
          />
        </div>
      )}
    </Card>
  );
};

export default OrganizationalTree;
