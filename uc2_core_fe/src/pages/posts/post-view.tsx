/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Dialog } from 'mainFe/Dialog';
import { Tag } from 'mainFe/Tag';
import { Toast } from 'mainFe/Toast';
import { Button } from 'mainFe/Button';
import { LoadingSpinner } from 'mainFe/LoadingSpinner';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { postsService } from '../../services/posts.service';
import { ranksService } from '../../services/ranks.service';
import type { Post, PostPosition } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { usePersonnelNames, usePersonnelList } from '../../hooks/usePersonnelLookup';
import FormSelect from '../../components/forms/form-select';
import { useCanUpdate } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const PostView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'posts',
    basePath: '/posts',
  });

  const toast = useRef<Toast>(null);
  const queryClient = useQueryClient();
  const canUpdate = useCanUpdate(JOB_NAMES.POST);

  const [data, setData] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Assignment dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<PostPosition | null>(null);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>('');

  // Unassign dialog state
  const [unassignDialogOpen, setUnassignDialogOpen] = useState(false);
  const [positionToUnassign, setPositionToUnassign] = useState<PostPosition | null>(null);

  // Set breadcrumb title
  useBreadcrumbTitle(data?.postName);

  // Collect all personnel IDs for lookup
  const personnelIds = useMemo(() => {
    const ids: (string | null | undefined)[] = [data?.createdBy, data?.updatedBy];
    data?.positions?.forEach((pos) => {
      if (pos.personnelId) ids.push(pos.personnelId);
    });
    return ids;
  }, [data]);

  const { getName: getPersonnelName } = usePersonnelNames(personnelIds);

  // Get personnel list for assignment dropdown
  const { personnel, loading: personnelLoading } = usePersonnelList();

  // Fetch ranks for displaying allowed ranks
  const { data: ranks = [] } = useQuery({
    queryKey: ['ranks', 'dropdown'],
    queryFn: ranksService.getAllForDropdown,
  });

  // Create ranks lookup map
  const ranksMap = useMemo(() => {
    const map = new Map<string, string>();
    ranks.forEach((r: { _id: string; name: string; shortCode?: string }) => {
      map.set(r._id, r.shortCode ? `${r.name} (${r.shortCode})` : r.name);
    });
    return map;
  }, [ranks]);

  // Personnel options for dropdown (filter out already assigned)
  const personnelOptions = useMemo(() => {
    const assignedIds = new Set(
      data?.positions?.filter((p) => p.personnelId).map((p) => p.personnelId) || []
    );
    return personnel
      .filter((p) => !assignedIds.has(p._id))
      .map((p) => ({ value: p._id, label: `${p.name} (${p.userId})` }));
  }, [personnel, data?.positions]);

  // Fetch post data
  const fetchData = useCallback(async () => {
    if (!isReady || !id) return;

    try {
      setLoading(true);
      const res = await postsService.getById(id);
      setData(res);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to fetch post'));
    } finally {
      setLoading(false);
    }
  }, [isReady, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Assign mutation
  const assignMutation = useMutation({
    mutationFn: ({ postId, positionCode, personnelId }: { postId: string; positionCode: string; personnelId: string }) =>
      postsService.assignPersonnel(postId, { positionCode, personnelId }),
    onSuccess: (updatedPost) => {
      setData(updatedPost);
      setAssignDialogOpen(false);
      setSelectedPosition(null);
      setSelectedPersonnelId('');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Personnel assigned successfully',
        life: 3000,
      });
    },
    onError: (err: any) => {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to assign personnel'),
        life: 10000,
      });
    },
  });

  // Unassign mutation
  const unassignMutation = useMutation({
    mutationFn: ({ postId, positionCode }: { postId: string; positionCode: string }) =>
      postsService.unassignPersonnel(postId, { positionCode }),
    onSuccess: (updatedPost) => {
      setData(updatedPost);
      setUnassignDialogOpen(false);
      setPositionToUnassign(null);
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Personnel unassigned successfully',
        life: 3000,
      });
    },
    onError: (err: any) => {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(err, 'Failed to unassign personnel'),
        life: 10000,
      });
    },
  });

  const handleEdit = () => {
    if (id) navigateToEdit(id);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await postsService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete post'));
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  // Assignment handlers
  const handleAssignClick = (position: PostPosition) => {
    setSelectedPosition(position);
    setSelectedPersonnelId('');
    setAssignDialogOpen(true);
  };

  const handleAssignConfirm = () => {
    if (!id || !selectedPosition || !selectedPersonnelId) return;
    assignMutation.mutate({
      postId: id,
      positionCode: selectedPosition.positionCode,
      personnelId: selectedPersonnelId,
    });
  };

  const handleAssignCancel = () => {
    setAssignDialogOpen(false);
    setSelectedPosition(null);
    setSelectedPersonnelId('');
  };

  // Unassignment handlers
  const handleUnassignClick = (position: PostPosition) => {
    setPositionToUnassign(position);
    setUnassignDialogOpen(true);
  };

  const handleUnassignConfirm = () => {
    if (!id || !positionToUnassign) return;
    unassignMutation.mutate({
      postId: id,
      positionCode: positionToUnassign.positionCode,
    });
  };

  const handleUnassignCancel = () => {
    setUnassignDialogOpen(false);
    setPositionToUnassign(null);
  };

  if (loading) {
    return (
      <div className="py-8 px-6">
        <div className="flex justify-center items-center min-h-[400px]">
          <LoadingSpinner size="50px" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-8 px-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error || 'Post not found'}
        </div>
        <Button
          label="Back to Posts"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  // Calculate stats
  const sanctioned = data.sanctioned ?? data.positions?.length ?? 0;
  const filled = data.filled ?? data.positions?.filter((p) => p.personnelId).length ?? 0;
  const vacant = data.vacant ?? sanctioned - filled;

  // Dialog footers
  const deleteDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={handleDeleteCancel} />
      <Button label="Delete" severity="danger" onClick={handleDeleteConfirm} />
    </div>
  );

  const assignDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={handleAssignCancel} disabled={assignMutation.isPending} />
      <Button
        label={assignMutation.isPending ? 'Assigning...' : 'Assign'}
        onClick={handleAssignConfirm}
        disabled={!selectedPersonnelId || assignMutation.isPending}
        icon={assignMutation.isPending ? 'pi pi-spin pi-spinner' : undefined}
      />
    </div>
  );

  const unassignDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={handleUnassignCancel} disabled={unassignMutation.isPending} />
      <Button
        label={unassignMutation.isPending ? 'Unassigning...' : 'Unassign'}
        severity="danger"
        onClick={handleUnassignConfirm}
        disabled={unassignMutation.isPending}
        icon={unassignMutation.isPending ? 'pi pi-spin pi-spinner' : undefined}
      />
    </div>
  );

  return (
    <>
      <Toast ref={toast} position="top-right" />

      <div className="py-8 px-6" data-testid="SCR-Post-View">
        {/* Header Section */}
        <div className="mb-6">
          <Button
            label="Back to Posts"
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            onClick={() => navigateToList()}
            className="mb-4"
          />

          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">Post Details</h1>
              <p className="text-gray-600 dark:text-gray-400">View post information and manage positions</p>
            </div>

            {canUpdate && !data.isDelete && (
              <div className="flex gap-2">
                <Button label="Edit" icon="pi pi-pencil" severity="secondary" outlined onClick={handleEdit} />
                <Button label="Delete" icon="pi pi-trash" severity="danger" outlined onClick={handleDeleteClick} />
              </div>
            )}
          </div>
        </div>

        {/* Post Header */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
              <i className="pi pi-id-card text-2xl text-blue-600 dark:text-blue-400" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{data.postName}</h2>
                {data.isUnitHead && <Tag value="Unit Head" severity="info" />}
                {data.isDelete ? (
                  <Tag value="Deleted" severity="danger" />
                ) : data.isActive === false ? (
                  <Tag value="Inactive" severity="warning" />
                ) : (
                  <Tag value="Active" severity="success" />
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Code: {data.postCode} &bull; Unit: {data.unitName || data.unitId || '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Sanctioned</div>
            <div className="text-2xl font-bold text-blue-600">{sanctioned}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Filled</div>
            <div className="text-2xl font-bold text-green-600">{filled}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Vacant</div>
            <div className={`text-2xl font-bold ${vacant > 0 ? 'text-red-600' : 'text-gray-500'}`}>{vacant}</div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Post Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Post Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Post Name</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{data.postName || '-'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Post Code</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{data.postCode || '-'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Unit</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{data.unitName || data.unitId || '-'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Is Unit Head</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {data.isUnitHead ? (
                    <span className="text-green-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-gray-500">No</span>
                  )}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Reports To</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {data.reportsToPostName || data.reportsToPostId || '-'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Allowed Ranks</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.allowedRanks && data.allowedRanks.length > 0 ? (
                    data.allowedRanks.map((rankId) => (
                      <Tag key={rankId} value={ranksMap.get(rankId) || rankId} className="text-xs" />
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">All ranks</span>
                  )}
                </div>
              </div>
              {data.description && (
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
                  <p className="text-sm text-gray-900 dark:text-white mt-1">{data.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Audit Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Audit Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created At</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {data.createdAt ? new Date(data.createdAt).toLocaleString() : '-'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created By</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{getPersonnelName(data.createdBy)}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated At</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : '-'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated By</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{getPersonnelName(data.updatedBy)}</p>
              </div>
            </div>

            {data.isDelete && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded text-sm">
                  This record is soft-deleted.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Positions Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Positions ({data.positions?.length || 0})
            </h2>
          </div>

          {!data.positions || data.positions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm py-4">No positions defined for this post.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Position Code</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Position Name</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Assigned Personnel</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Rank</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                    {canUpdate && !data.isDelete && (
                      <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.positions.map((position) => (
                    <tr
                      key={position.positionCode}
                      className="border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <td className="py-2 px-3 text-gray-900 dark:text-white font-mono font-medium">
                        {position.positionCode}
                      </td>
                      <td className="py-2 px-3 text-gray-900 dark:text-white">{position.positionName || '-'}</td>
                      <td className="py-2 px-3">
                        {position.personnelId ? (
                          <span className="text-gray-900 dark:text-white">
                            {position.personnelName || getPersonnelName(position.personnelId)}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Vacant</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{position.personnelRank || '-'}</td>
                      <td className="py-2 px-3 text-center">
                        {position.personnelId ? (
                          <Tag value="Filled" severity="success" className="text-xs" />
                        ) : (
                          <Tag value="Vacant" severity="warning" className="text-xs" />
                        )}
                      </td>
                      {canUpdate && !data.isDelete && (
                        <td className="py-2 px-3 text-center">
                          {position.personnelId ? (
                            <button
                              onClick={() => handleUnassignClick(position)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                              data-testid={`PostView.Action.Unassign.${position.positionCode}`}
                            >
                              Unassign
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAssignClick(position)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              data-testid={`PostView.Action.Assign.${position.positionCode}`}
                            >
                              Assign
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog
          visible={deleteDialogOpen}
          onHide={handleDeleteCancel}
          header="Confirm Delete"
          footer={deleteDialogFooter}
          style={{ width: '450px' }}
          data-testid="PostView.Dialog.Delete"
        >
          <p className="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete this post? This action will mark it as deleted.
          </p>
        </Dialog>

        {/* Assign Personnel Dialog */}
        <Dialog
          visible={assignDialogOpen}
          onHide={handleAssignCancel}
          header="Assign Personnel"
          footer={assignDialogFooter}
          style={{ width: '500px' }}
          data-testid="PostView.Dialog.Assign"
        >
          <div className="space-y-4">
            {/* Position Info Card */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center flex-shrink-0">
                  <i className="pi pi-id-card text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Assigning to Position</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-white">
                    {selectedPosition?.positionName || selectedPosition?.positionCode}
                  </p>
                </div>
              </div>
            </div>

            {/* Personnel Selection */}
            <div>
              <FormSelect
                name="personnelId"
                label="Select Personnel"
                value={selectedPersonnelId}
                onChange={(e) => setSelectedPersonnelId(e.target.value)}
                options={personnelOptions}
                placeholder="Search and select personnel..."
                filter
                filterPlaceholder="Type to search..."
                required
                loading={personnelLoading}
              />
              {personnelOptions.length === 0 && !personnelLoading && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  No available personnel to assign. All personnel may already be assigned to positions.
                </p>
              )}
            </div>
          </div>
        </Dialog>

        {/* Unassign Personnel Dialog */}
        <Dialog
          visible={unassignDialogOpen}
          onHide={handleUnassignCancel}
          header="Confirm Unassignment"
          footer={unassignDialogFooter}
          style={{ width: '500px' }}
          data-testid="PostView.Dialog.Unassign"
        >
          <div className="space-y-4">
            {/* Warning Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <i className="pi pi-exclamation-triangle text-2xl text-red-600 dark:text-red-400" />
              </div>
            </div>

            {/* Message */}
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-3">
                Are you sure you want to unassign this personnel?
              </p>

              {/* Details Card */}
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-left">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Personnel</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {positionToUnassign?.personnelName || getPersonnelName(positionToUnassign?.personnelId)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Position</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {positionToUnassign?.positionName || positionToUnassign?.positionCode}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Dialog>
      </div>
    </>
  );
};

export default PostView;
