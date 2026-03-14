/**
 * UnitPostSelector Component
 *
 * Allows selecting a unit and then a post within that unit.
 * Shows only vacant posts (where assignedUser is null).
 * If all posts are filled, shows option to create a new post.
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from 'mainFe/Dialog';
import { Button } from 'mainFe/Button';
import { Dropdown } from 'mainFe/Dropdown';
import { unitsService } from '../../services/units.service';
import { fetchSystemRolesForDropdown } from '../../services/system-roles.service';
import PostFormModal from '../posts/PostFormModal';
import type { EmbeddedPostForCreate } from '../../types';
import type { SystemRole } from '../../types/system-role.types';

interface UnitPostSelectorProps {
  value: {
    unitId: string;
    postCode: string;
  } | null;
  onChange: (value: { unitId: string; postCode: string; unitName: string; postName: string } | null) => void;
  label?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
}

interface PostOption {
  postCode: string;
  postName: string;
  assignedUser: string | { _id: string; name?: string } | null;
  assignedRoles: string[] | { _id: string; roleName?: string; roleShortCode?: string }[];
  isUnitHead: boolean;
  isVacant: boolean;
}

interface UnitWithPosts {
  _id: string;
  name: string;
  posts: PostOption[];
  allPostsFilled: boolean;
}

const UnitPostSelector = ({
  value,
  onChange,
  label = 'Unit & Post Assignment',
  required = false,
  error = false,
  helperText,
  disabled = false,
}: UnitPostSelectorProps) => {
  const [selectedUnitId, setSelectedUnitId] = useState<string>(value?.unitId || '');
  const [selectedPostCode, setSelectedPostCode] = useState<string>(value?.postCode || '');
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [systemRoleNamesMap, setSystemRoleNamesMap] = useState<Map<string, string>>(new Map());

  // Fetch all units
  const { data: units = [], isLoading: isLoadingUnits } = useQuery({
    queryKey: ['units-for-assignment'],
    queryFn: async () => {
      const response = await unitsService.getAll({ include_deleted: false, page_size: 1000 });
      return response.data || [];
    },
  });

  // Fetch system roles for display
  const { data: systemRoles = [] } = useQuery<SystemRole[]>({
    queryKey: ['system-roles-for-assignment'],
    queryFn: fetchSystemRolesForDropdown,
  });

  // Build system role names map
  useEffect(() => {
    const map = new Map<string, string>();
    systemRoles.forEach((role: SystemRole) => {
      map.set(role._id, role.roleName);
    });
    setSystemRoleNamesMap(map);
  }, [systemRoles]);

  // Transform units with posts info
  const unitsWithPosts = useMemo<UnitWithPosts[]>(() => {
    return units.map(unit => {
      const posts = (unit.posts || [])
        .filter(post => !post.isDelete)
        .map(post => ({
          postCode: post.postCode,
          postName: post.postName,
          assignedUser: post.assignedUser || null,
          assignedRoles: post.assignedRoles || [],
          isUnitHead: post.isUnitHead || false,
          isVacant: !post.assignedUser,
        }));

      const allPostsFilled = posts.length > 0 && posts.every(p => !p.isVacant);

      return {
        _id: unit._id,
        name: unit.name,
        posts,
        allPostsFilled,
      };
    });
  }, [units]);

  // Get unit options for dropdown
  const unitOptions = useMemo(() => {
    return unitsWithPosts.map(unit => ({
      value: unit._id,
      label: unit.name,
      hasVacantPosts: unit.posts.some(p => p.isVacant),
    }));
  }, [unitsWithPosts]);

  // Get posts for selected unit
  const selectedUnitPosts = useMemo(() => {
    const unit = unitsWithPosts.find(u => u._id === selectedUnitId);
    return unit?.posts || [];
  }, [unitsWithPosts, selectedUnitId]);

  // Get selected unit data
  const selectedUnit = useMemo(() => {
    return unitsWithPosts.find(u => u._id === selectedUnitId);
  }, [unitsWithPosts, selectedUnitId]);

  // Post options for dropdown - show ALL posts (same pattern as assignment-form)
  const postOptions = useMemo(() => {
    return selectedUnitPosts.map(post => ({
      value: post.postCode,
      label: `${post.postName} (${post.postCode})`,
      disabled: false,
    }));
  }, [selectedUnitPosts]);

  // Sync external value changes
  useEffect(() => {
    if (value) {
      setSelectedUnitId(value.unitId);
      setSelectedPostCode(value.postCode);
    } else {
      setSelectedUnitId('');
      setSelectedPostCode('');
    }
  }, [value]);

  // Handle unit change
  const handleUnitChange = (e: { value: string }) => {
    const newUnitId = e.value;
    setSelectedUnitId(newUnitId);
    setSelectedPostCode(''); // Reset post when unit changes
    onChange(null); // Clear the value until post is selected
  };

  // Handle post change
  const handlePostChange = (e: { value: string }) => {
    const newPostCode = e.value;
    setSelectedPostCode(newPostCode);

    const unit = unitsWithPosts.find(u => u._id === selectedUnitId);
    const post = unit?.posts.find(p => p.postCode === newPostCode);

    if (unit && post) {
      onChange({
        unitId: selectedUnitId,
        postCode: newPostCode,
        unitName: unit.name,
        postName: post.postName,
      });
    }
  };

  // Handle creating new post
  const handleCreatePost = async (postData: EmbeddedPostForCreate) => {
    if (!selectedUnitId) return;

    try {
      await unitsService.addPost(selectedUnitId, postData);
      setShowCreatePostModal(false);
      // Post will appear in the list after query invalidation
    } catch (error) {
      console.error('Error creating post:', error);
    }
  };

  // Get display value for selected post
  const getDisplayValue = () => {
    if (!selectedUnitId || !selectedPostCode) return '';
    const unit = unitsWithPosts.find(u => u._id === selectedUnitId);
    const post = unit?.posts.find(p => p.postCode === selectedPostCode);
    if (unit && post) {
      return `${unit.name} - ${post.postName} (${post.postCode})`;
    }
    return '';
  };

  // Get existing post codes for validation in create modal
  const existingPostCodes = useMemo(() => {
    return selectedUnitPosts.map(p => p.postCode.toUpperCase());
  }, [selectedUnitPosts]);

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Current Selection Display */}
      {value && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <i className="pi pi-check-circle text-green-600 dark:text-green-400" />
          <span className="text-sm text-green-700 dark:text-green-300 font-medium">
            {getDisplayValue()}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setSelectedUnitId('');
              setSelectedPostCode('');
            }}
            className="ml-auto text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            disabled={disabled}
          >
            <i className="pi pi-times" />
          </button>
        </div>
      )}

      {/* Selection Button */}
      {!value && (
        <Button
          type="button"
          label="Select Unit & Post"
          icon="pi pi-building"
          severity="secondary"
          outlined
          onClick={() => setShowPostDialog(true)}
          disabled={disabled || isLoadingUnits}
          className={error ? 'p-invalid' : ''}
        />
      )}

      {helperText && (
        <small className={`${error ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {helperText}
        </small>
      )}

      {/* Selection Dialog */}
      <Dialog
        visible={showPostDialog}
        onHide={() => setShowPostDialog(false)}
        header="Select Unit & Post"
        style={{ width: '700px', minHeight: '500px' }}
        modal
        contentClassName="!overflow-visible"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              label="Cancel"
              severity="secondary"
              outlined
              onClick={() => setShowPostDialog(false)}
            />
            <Button
              type="button"
              label="Confirm"
              disabled={!selectedUnitId || !selectedPostCode}
              onClick={() => {
                const unit = unitsWithPosts.find(u => u._id === selectedUnitId);
                const post = unit?.posts.find(p => p.postCode === selectedPostCode);
                if (unit && post) {
                  onChange({
                    unitId: selectedUnitId,
                    postCode: selectedPostCode,
                    unitName: unit.name,
                    postName: post.postName,
                  });
                }
                setShowPostDialog(false);
              }}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Unit Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Unit
            </label>
            <Dropdown
              value={selectedUnitId}
              options={unitOptions}
              onChange={handleUnitChange}
              placeholder="Select a unit"
              filter
              filterPlaceholder="Search units..."
              className="w-full"
              loading={isLoadingUnits}
              appendTo={document.body}
              panelClassName="z-[10000]"
              itemTemplate={(option: { value: string; label: string; hasVacantPosts: boolean }) => (
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  {option.hasVacantPosts ? (
                    <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                      Has vacancies
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                      All filled
                    </span>
                  )}
                </div>
              )}
            />
          </div>

          {/* Post Selection */}
          {selectedUnitId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Post
                </label>
                {selectedUnit?.allPostsFilled && (
                  <Button
                    type="button"
                    label="Create New Post"
                    icon="pi pi-plus"
                    size="small"
                    severity="info"
                    text
                    onClick={() => setShowCreatePostModal(true)}
                  />
                )}
              </div>

              {selectedUnitPosts.length === 0 ? (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <i className="pi pi-exclamation-triangle" />
                    <span className="font-medium">No posts available in this unit</span>
                  </div>
                  <Button
                    type="button"
                    label="Create First Post"
                    icon="pi pi-plus"
                    size="small"
                    severity="info"
                    className="mt-3"
                    onClick={() => setShowCreatePostModal(true)}
                  />
                </div>
              ) : (
                <Dropdown
                  value={selectedPostCode}
                  options={postOptions}
                  onChange={handlePostChange}
                  placeholder="Select a post"
                  className="w-full"
                  optionDisabled="disabled"
                  appendTo={document.body}
                  panelClassName="z-[10000]"
                />
              )}

              {/* Show existing posts in a nice list */}
              {selectedUnitPosts.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Available posts in this unit:
                  </p>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    {selectedUnitPosts.map(post => (
                      <div
                        key={post.postCode}
                        className={`p-3 border-b last:border-b-0 border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                          selectedPostCode === post.postCode ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        } ${!post.isVacant ? 'opacity-50' : ''}`}
                        onClick={() => {
                          if (post.isVacant) {
                            handlePostChange({ value: post.postCode });
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {post.postName}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                              ({post.postCode})
                            </span>
                            {post.isUnitHead && (
                              <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                Unit Head
                              </span>
                            )}
                          </div>
                          <div>
                            {post.isVacant ? (
                              <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                                Available
                              </span>
                            ) : (
                              <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                                Filled
                              </span>
                            )}
                          </div>
                        </div>
                        {post.assignedRoles.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {post.assignedRoles.map((role, idx) => {
                              const roleId = typeof role === 'string' ? role : role._id;
                              const roleName = typeof role === 'string'
                                ? (systemRoleNamesMap.get(role) || role)
                                : (role.roleName || systemRoleNamesMap.get(role._id) || role._id);
                              return (
                                <span
                                  key={roleId || idx}
                                  className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded"
                                >
                                  {roleName}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>

      {/* Create Post Modal */}
      <PostFormModal
        visible={showCreatePostModal}
        onHide={() => setShowCreatePostModal(false)}
        onSave={handleCreatePost}
        existingPostCodes={existingPostCodes}
        isEditing={false}
      />
    </div>
  );
};

export default UnitPostSelector;
