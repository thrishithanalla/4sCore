/**
 * PostsManager Component
 * Manages embedded posts within a unit.
 * Can be used in unit create/edit forms or as a standalone component.
 *
 * In edit mode (when unitId is provided), uses dedicated unit-post APIs.
 * In create mode (no unitId), manages posts in local state.
 */

import { useState, useRef, useMemo, useImperativeHandle, forwardRef } from 'react';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Button } from 'mainFe/Button';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { Dialog } from 'mainFe/Dialog';
import { Toast } from 'mainFe/Toast';
import PostFormModal from './PostFormModal';
import { unitsService } from '../../services/units.service';
import type { EmbeddedPostForCreate } from '../../types';

// Simplified post type for display
interface DisplayPost extends EmbeddedPostForCreate {
  roleNames?: string[];
  assignedUserName?: string | null;
}

interface PostsManagerProps {
  posts: EmbeddedPostForCreate[];
  onChange: (posts: EmbeddedPostForCreate[]) => void;
  /** Role lookup map: roleId -> roleName */
  roleNamesMap?: Map<string, string>;
  /** User lookup map: userId -> userName */
  userNamesMap?: Map<string, string>;
  /** Read-only mode */
  readonly?: boolean;
  /** Show header */
  showHeader?: boolean;
  /** Title */
  title?: string;
  /** Unit ID - when provided, uses dedicated unit-post APIs for CRUD operations */
  unitId?: string;
  /** Callback when unit data is refreshed from API (edit mode only) */
  onUnitRefresh?: () => void;
  /** Callback to fetch posts for a selected unit */
  onFetchUnitPosts?: (unitId: string) => Promise<{ postCode: string; postName: string }[]>;
  /** Hide internal add button (use ref.triggerAdd() to open modal externally) */
  hideAddButton?: boolean;
  /** Unit name for display in post modal */
  unitName?: string;
  /** Unit short code for display in post modal */
  unitShortCode?: string;
  /** Parent unit ID for unit head reporting */
  parentUnitId?: string;
  /** Parent unit name for unit head reporting */
  parentUnitName?: string;
}

/** Ref handle for PostsManager */
export interface PostsManagerRef {
  triggerAdd: () => void;
}

const PostsManager = forwardRef<PostsManagerRef, PostsManagerProps>(({
  posts,
  onChange,
  roleNamesMap = new Map(),
  userNamesMap = new Map(),
  readonly = false,
  showHeader = true,
  title = 'Posts',
  unitId,
  onUnitRefresh,
  onFetchUnitPosts,
  hideAddButton = false,
  unitName = '',
  unitShortCode = '',
  parentUnitId = '',
  parentUnitName = '',
}, ref) => {
  const toast = useRef<Toast>(null);
  const [postModalVisible, setPostModalVisible] = useState(false);
  const [editingPost, setEditingPost] = useState<EmbeddedPostForCreate | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Check if we're in edit mode (unitId provided means existing unit)
  const isEditMode = Boolean(unitId);

  // Get existing post codes for validation
  const existingPostCodes = useMemo(() => posts.map((p) => p.postCode.toUpperCase()), [posts]);

  // Get existing post names for count calculation (using postName which stores the code from value-set)
  const existingPostNames = useMemo(() => posts.map((p) => p.postName), [posts]);

  // Transform posts for display
  const displayPosts: DisplayPost[] = useMemo(() => {
    return posts.map((post) => ({
      ...post,
      // Handle both string IDs and populated role objects { _id, roleName, roleShortCode }
      roleNames: post.assignedRoles?.map((role: any) => {
        if (typeof role === 'string') {
          return roleNamesMap.get(role) || role;
        }
        // Populated role object from API
        return role.roleName || role.name || role._id;
      }) || [],
      assignedUserName: post.assignedUser ? userNamesMap.get(post.assignedUser) || post.assignedUser : null,
    }));
  }, [posts, roleNamesMap, userNamesMap]);

  // Handle add new post
  const handleAddPost = () => {
    setEditingPost(null);
    setPostModalVisible(true);
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    triggerAdd: handleAddPost,
  }));

  // Handle edit post
  const handleEditPost = (post: EmbeddedPostForCreate) => {
    setEditingPost(post);
    setPostModalVisible(true);
  };

  // Handle save post (from modal)
  const handleSavePost = async (postData: EmbeddedPostForCreate) => {
    console.log('[PostsManager] handleSavePost called with:', {
      postCode: postData.postCode,
      assignedUser: postData.assignedUser,
      assignmentType: postData.assignmentType,
      startDate: postData.startDate,
      endDate: postData.endDate,
      isEditMode,
      editingPost: editingPost?.postCode,
    });

    // Validate: only one unit head
    const otherPosts = editingPost
      ? posts.filter((p) => p.postCode.toUpperCase() !== editingPost.postCode.toUpperCase())
      : posts;
    const totalUnitHeads = otherPosts.filter((p) => p.isUnitHead).length + (postData.isUnitHead ? 1 : 0);

    if (totalUnitHeads > 1) {
      toast.current?.show({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Only one post can be marked as Unit Head',
        life: 5000,
      });
      return;
    }

    // In edit mode with unitId, use APIs
    if (isEditMode && unitId) {
      setIsSaving(true);
      try {
        if (editingPost) {
          // Update existing post via API
          await unitsService.updatePost(unitId, editingPost.postCode, {
            postCode: postData.postCode, // Include postCode in case it changed
            postName: postData.postName,
            isUnitHead: postData.isUnitHead,
            reportsToPost: postData.reportsToPost,
            assignedRoles: postData.assignedRoles,
            allowedRanks: postData.allowedRanks,
            assignedUser: postData.assignedUser,
            description: postData.description,
          });
          // Update local state immediately for instant UI feedback
          const updatedPosts = posts.map((p) =>
            p.postCode.toUpperCase() === editingPost.postCode.toUpperCase() ? postData : p
          );
          console.log('[PostsManager] Updating local state with edited post:', {
            postCode: postData.postCode,
            hasAssignmentData: Boolean(postData.assignmentType && postData.startDate),
          });
          onChange(updatedPosts);
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Post updated successfully',
            life: 3000,
          });
        } else {
          // Add new post via API
          await unitsService.addPost(unitId, postData);
          // Update local state immediately for instant UI feedback
          console.log('[PostsManager] Adding new post to local state:', {
            postCode: postData.postCode,
            hasAssignmentData: Boolean(postData.assignmentType && postData.startDate),
          });
          onChange([...posts, postData]);
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Post added successfully',
            life: 3000,
          });
        }
        // Trigger refresh to get updated data from server (for confirmation)
        onUnitRefresh?.();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Operation failed';
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 5000,
        });
      } finally {
        setIsSaving(false);
      }
    } else {
      // Create mode - manage locally
      if (editingPost) {
        // Update existing post in local state
        const updatedPosts = posts.map((p) =>
          p.postCode.toUpperCase() === editingPost.postCode.toUpperCase() ? postData : p
        );
        onChange(updatedPosts);
      } else {
        // Add new post to local state
        const upperCode = postData.postCode.toUpperCase();
        if (existingPostCodes.includes(upperCode)) {
          toast.current?.show({
            severity: 'error',
            summary: 'Validation Error',
            detail: `Post code "${upperCode}" already exists`,
            life: 5000,
          });
          return;
        }
        onChange([...posts, postData]);
      }
    }

    setPostModalVisible(false);
    setEditingPost(null);
  };

  // Handle delete confirmation
  const handleDeleteClick = (postCode: string) => {
    setPostToDelete(postCode);
    setDeleteConfirmVisible(true);
  };

  // Handle delete post
  const handleDeleteConfirm = async () => {
    if (!postToDelete) {
      setDeleteConfirmVisible(false);
      return;
    }

    // In edit mode with unitId, use API
    if (isEditMode && unitId) {
      setIsDeleting(true);
      try {
        await unitsService.deletePost(unitId, postToDelete);
        // Update local state immediately for instant UI feedback
        const updatedPosts = posts.filter(
          (p) => p.postCode.toUpperCase() !== postToDelete.toUpperCase()
        );
        onChange(updatedPosts);
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Post deleted successfully',
          life: 3000,
        });
        // Trigger refresh to get updated data from server (for confirmation)
        onUnitRefresh?.();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete post';
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 5000,
        });
      } finally {
        setIsDeleting(false);
      }
    } else {
      // Create mode - manage locally
      const updatedPosts = posts.filter(
        (p) => p.postCode.toUpperCase() !== postToDelete.toUpperCase()
      );
      onChange(updatedPosts);
    }

    setDeleteConfirmVisible(false);
    setPostToDelete(null);
  };

  // Column: Post Code
  const postCodeTemplate = (rowData: DisplayPost) => (
    <div className="flex items-center gap-2">
      <span className="font-mono font-semibold">{rowData.postCode}</span>
      {rowData.isUnitHead && (
        <Tag value="Unit Head" severity="info" className="text-xs" />
      )}
    </div>
  );

  // Column: Roles
  const rolesTemplate = (rowData: DisplayPost) => {
    const roleCount = rowData.assignedRoles?.length || 0;
    if (roleCount === 0) {
      return <span className="text-gray-400 text-sm">No roles</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {rowData.roleNames?.slice(0, 2).map((name, idx) => (
          <Tag key={idx} value={name} severity="secondary" className="text-xs" />
        ))}
        {roleCount > 2 && (
          <Tag
            value={`+${roleCount - 2} more`}
            severity="secondary"
            className="text-xs"
            data-pr-tooltip={rowData.roleNames?.slice(2).join(', ')}
          />
        )}
      </div>
    );
  };

  // Column: Assigned User
  const assignedUserTemplate = (rowData: DisplayPost) => {
    if (!rowData.assignedUser) {
      return <span className="text-gray-400 text-sm">Unassigned</span>;
    }

    return (
      <span className="text-sm">{rowData.assignedUserName || rowData.assignedUser}</span>
    );
  };

  // Column: Reports To
  const reportsToTemplate = (rowData: DisplayPost) => {
    if (!rowData.reportsToPost?.postName) {
      return <span className="text-gray-400 text-sm">-</span>;
    }

    return <span className="text-sm">{rowData.reportsToPost.postName}</span>;
  };

  // Column: Actions
  const actionsTemplate = (rowData: DisplayPost) => {
    if (readonly) return null;

    return (
      <div className="flex gap-1 justify-center">
        <button
          type="button"
          className="p-2 cursor-pointer"
          style={{ background: 'none', border: 'none', outline: 'none' }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleEditPost(rowData);
          }}
          data-pr-tooltip="Edit"
        >
          <i className="pi pi-pencil text-blue-600 hover:text-blue-800" style={{ fontSize: '1rem' }} />
        </button>
        <button
          type="button"
          className="p-2 cursor-pointer"
          style={{ background: 'none', border: 'none', outline: 'none' }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDeleteClick(rowData.postCode);
          }}
          data-pr-tooltip="Delete"
        >
          <i className="pi pi-trash text-red-600 hover:text-red-800" style={{ fontSize: '1rem' }} />
        </button>
      </div>
    );
  };

  // Define columns for DataTable
  const columns: DataTableColumn<DisplayPost>[] = useMemo(() => {
    const baseColumns: DataTableColumn<DisplayPost>[] = [
      {
        field: 'postCode',
        header: 'Post Code',
        sortable: true,
        body: postCodeTemplate,
      },
      {
        field: 'postName',
        header: 'Post Name',
        sortable: true,
      },
      {
        field: 'reportsToPost',
        header: 'Reporting Post',
        sortable: false,
        body: reportsToTemplate,
      },
      {
        field: 'assignedRoles',
        header: 'Assigned Role',
        sortable: false,
        body: rolesTemplate,
      },
      {
        field: 'assignedUser',
        header: 'Assigned User',
        sortable: false,
        body: assignedUserTemplate,
      },
    ];

    // Add actions column if not readonly
    if (!readonly) {
      baseColumns.push({
        field: 'actions',
        header: 'Actions',
        headerStyle: { textAlign: 'center' },
        sortable: false,
        body: actionsTemplate,
      });
    }

    return baseColumns;
  }, [readonly]);

  return (
    <div className="posts-manager">
      <Toast ref={toast} position="top-right" />
      <Tooltip target="[data-pr-tooltip]" />

      {/* Header */}
      {showHeader && (
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {!readonly && !hideAddButton && (
            <Button
              type="button"
              label="Add Post"
              icon="pi pi-plus"
              onClick={handleAddPost}
              size="small"
            />
          )}
        </div>
      )}

      {/* Posts Table */}
      {posts.length === 0 ? (
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
          <i className="pi pi-briefcase text-2xl text-gray-400 mb-2 block" />
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">No posts added yet</p>
          {!readonly && !hideAddButton && (
            <Button
              type="button"
              label="Add Post"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              size="small"
              onClick={handleAddPost}
            />
          )}
        </div>
      ) : (
        <div>
          {/* Add Post button above table - right aligned (only if not hidden) */}
          {!showHeader && !readonly && !hideAddButton && (
            <div className="flex justify-end mb-2">
              <Button
                type="button"
                label="Add Post"
                icon="pi pi-plus"
                severity="secondary"
                outlined
                size="small"
                onClick={handleAddPost}
              />
            </div>
          )}
          <DataTable
            data={displayPosts}
            columns={columns}
            emptyMessage="No posts found"
            dataKey="postCode"
          />
        </div>
      )}

      {/* Add/Edit Post Modal */}
      <PostFormModal
        visible={postModalVisible}
        onHide={() => {
          if (!isSaving) {
            setPostModalVisible(false);
            setEditingPost(null);
          }
        }}
        onSave={handleSavePost}
        post={editingPost}
        existingPostCodes={editingPost ? existingPostCodes.filter((c) => c !== editingPost.postCode.toUpperCase()) : existingPostCodes}
        existingPostNames={editingPost ? existingPostNames.filter((n) => n !== editingPost.postName) : existingPostNames}
        isEditing={!!editingPost}
        assignedUserLabel={editingPost?.assignedUser ? userNamesMap.get(editingPost.assignedUser) || null : null}
        isSaving={isSaving}
        onFetchUnitPosts={onFetchUnitPosts}
        unitName={unitName}
        unitShortCode={unitShortCode}
        unitId={unitId}
        parentUnitId={parentUnitId}
        parentUnitName={parentUnitName}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        visible={deleteConfirmVisible}
        onHide={() => {
          if (!isDeleting) {
            setDeleteConfirmVisible(false);
            setPostToDelete(null);
          }
        }}
        header="Confirm Delete"
        style={{ width: '400px' }}
        modal
        closable={!isDeleting}
        closeOnEscape={!isDeleting}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              disabled={isDeleting}
              onClick={() => {
                setDeleteConfirmVisible(false);
                setPostToDelete(null);
              }}
            />
            <Button
              type="button"
              label={isDeleting ? 'Deleting...' : 'Delete'}
              severity="danger"
              icon={isDeleting ? 'pi pi-spin pi-spinner' : 'pi pi-trash'}
              disabled={isDeleting}
              onClick={handleDeleteConfirm}
            />
          </div>
        }
      >
        <p className="text-gray-700 dark:text-gray-300">
          Are you sure you want to delete post <strong>{postToDelete}</strong>?
        </p>
        <p className="text-sm text-gray-500 mt-2">
          This will remove the post and its assignments from this unit.
        </p>
      </Dialog>
    </div>
  );
});

PostsManager.displayName = 'PostsManager';

export default PostsManager;
