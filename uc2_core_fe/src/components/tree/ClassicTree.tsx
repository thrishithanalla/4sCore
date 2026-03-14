/**
 * ClassicTree Component
 * A hierarchical tree view with classic styling and expand/collapse functionality
 */

import React, { useState, useEffect } from 'react';
import type { TreeNode, NodeType } from '../../types/tree.types';
import styles from './ClassicTree.module.css';

interface ClassicTreeProps {
  data: TreeNode[];
  onNodeClick?: (node: TreeNode) => void;
  /** Set of node IDs that should be expanded (controlled expansion) */
  expandedIds?: Set<string>;
  /** ID of the node to highlight */
  highlightedId?: string | null;
}

// Level-based icon mapping for hierarchical depth
const getLevelIcon = (depth: number, hasChildren?: boolean): string => {
  if (!hasChildren) {
    return 'pi pi-map-marker'; // Leaf nodes (smallest units/locations)
  }

  // Different icons for different hierarchy levels
  switch (depth) {
    case 0:
      return 'pi pi-building-columns'; // Top level (HQ/State)
    case 1:
      return 'pi pi-building'; // Major divisions
    case 2:
      return 'pi pi-sitemap'; // Regional/District level
    case 3:
      return 'pi pi-home'; // Local stations/units
    default:
      return 'pi pi-circle'; // Deeper levels
  }
};

interface TreeNodeComponentProps {
  node: TreeNode;
  onNodeClick?: (node: TreeNode) => void;
  /** Set of node IDs that should be expanded (controlled expansion) */
  expandedIds?: Set<string>;
  /** ID of the node to highlight */
  highlightedId?: string | null;
  /** Depth level in the tree (0 = root) */
  depth?: number;
}

const TreeNodeComponent: React.FC<TreeNodeComponentProps> = ({
  node,
  onNodeClick,
  expandedIds,
  highlightedId,
  depth = 0
}) => {
  // Local state for manual expand/collapse
  const [localExpanded, setLocalExpanded] = useState(expandedIds?.has(node.id) ?? false);

  // When expandedIds changes (expand all / collapse all / unit selection), sync local state
  useEffect(() => {
    if (expandedIds !== undefined) {
      setLocalExpanded(expandedIds.has(node.id));
    }
  }, [expandedIds, node.id]);

  const hasChildren = node.children && node.children.length > 0;
  const isHighlighted = highlightedId === node.id;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalExpanded(prev => !prev);
  };

  const handleLabelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeClick?.(node);
  };

  // Show children based on local expanded state
  const showChildren = localExpanded;

  // Determine depth-based class for icon styling
  const getDepthClass = () => {
    if (!hasChildren) return 'leaf';
    if (depth === 0) return 'depth0';
    if (depth === 1) return 'depth1';
    if (depth === 2) return 'depth2';
    if (depth === 3) return 'depth3';
    return 'depthDeep';
  };

  return (
    <div className={styles.node}>
      <div
        className={`${styles.item} ${node.type === 'user' ? styles.userItem : ''} ${isHighlighted ? styles.highlighted : ''}`}
        style={node.type === 'user' ? { height: '40px' } : undefined}
        id={isHighlighted ? 'highlighted-node' : undefined}
      >
        {/* Expand/Collapse Button - separate, only handles tree expand/collapse */}
        <button
          className={`${styles.expand} ${showChildren ? styles.expanded : ''} ${!hasChildren ? styles.empty : ''}`}
          onClick={handleToggle}
          type="button"
          aria-label={showChildren ? 'Collapse' : 'Expand'}
        >
          <i className={`pi ${showChildren ? 'pi-minus' : 'pi-plus'}`} style={{ fontSize: '9px' }} />
        </button>

        {/* Clickable container for icon + label - opens popup on click anywhere */}
        <div className={styles.clickableContent} onClick={handleLabelClick}>
          {/* Icon */}
          <div className={`${styles.icon} ${styles[getDepthClass()]}`}>
            <i className={getLevelIcon(depth, hasChildren)} style={{ fontSize: '14px' }} />
          </div>

          {/* Label */}
          <span className={styles.label}>{node.label}</span>

          {/* Count Badge */}
          {node.count !== undefined && node.count > 0 && (
            <span className={styles.count}>{node.count}</span>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && showChildren && (
        <div className={styles.children}>
          {node.children!.map((child) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              onNodeClick={onNodeClick}
              expandedIds={expandedIds}
              highlightedId={highlightedId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const ClassicTree: React.FC<ClassicTreeProps> = ({
  data,
  onNodeClick,
  expandedIds,
  highlightedId
}) => {
  // Scroll to highlighted node when it changes
  useEffect(() => {
    if (highlightedId) {
      // Small delay to ensure DOM is updated
      const timer = setTimeout(() => {
        const element = document.getElementById('highlighted-node');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [highlightedId]);

  if (!data || data.length === 0) {
    return (
      <div className={styles.empty}>
        <i className="pi pi-sitemap" style={{ fontSize: '2rem', color: '#9ca3af' }} />
        <p>No hierarchy data available</p>
      </div>
    );
  }

  return (
    <div className={styles.tree}>
      {data.map((node) => (
        <TreeNodeComponent
          key={node.id}
          node={node}
          onNodeClick={onNodeClick}
          expandedIds={expandedIds}
          highlightedId={highlightedId}
          depth={0}
        />
      ))}
    </div>
  );
};

export default ClassicTree;
