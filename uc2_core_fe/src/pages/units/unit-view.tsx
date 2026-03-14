/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { unitsService } from '../../services/units.service';
import { api } from '../../services/api';
import type { Unit } from '../../types';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { extractErrorMessage } from '../../utils/error-handler';
import { usePersonnelNames } from '../../hooks/usePersonnelLookup';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const FILE_UPLOAD_API = import.meta.env.VITE_FILE_UPLOAD_API || 'https://devapi.ai4andhrapolice.com/core-fileupload/api/v1';

/* ---------------------------------------------------------------------- */
/* Main UnitView Component */
/* ---------------------------------------------------------------------- */
const UnitView: React.FC = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'units',
    basePath: '/units',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.UNITS);
  const canDelete = useCanDelete(JOB_NAMES.UNITS);

  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [logoLoading, setLogoLoading] = useState<boolean>(false);

  // Set breadcrumb title to show unit name instead of UUID
  useBreadcrumbTitle(unit?.name);

  // Collect all personnel IDs for lookup
  const personnelIds = React.useMemo(() => {
    if (!unit) return [];
    const unitAny = unit as any;
    const ids: (string | null | undefined)[] = [
      unit.responsibleUserId,
      unit.proxyUserId,
      unit.createdBy,
      unit.updatedBy,
      ...(unit.unitPersonnelList || []),
      ...(unitAny.responsibleUserHistory?.map((h: any) => h.userId) || []),
      ...(unitAny.responsibleUserHistory?.map((h: any) => h.changedBy) || []),
      // Include assigned users from embedded posts (if they are IDs, not populated objects)
      ...(unit.posts || [])
        .filter((p: any) => p.assignedUser && typeof p.assignedUser === 'string')
        .map((p: any) => p.assignedUser),
    ];
    return ids;
  }, [unit]);

  // Use cached personnel lookup for names
  const { getName: getPersonnelName } = usePersonnelNames(personnelIds);

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  // Fetch logo URL from file service
  const fetchLogoUrl = async (logoId: string): Promise<string | null> => {
    try {
      setLogoLoading(true);
      const response = await api.get(`${FILE_UPLOAD_API}/files/download/${logoId}?inline=true`);
      if (response.data?.success && response.data?.data?.url) {
        return response.data.data.url;
      }
      return null;
    } catch (err) {
      console.error('Failed to fetch logo URL:', err);
      return null;
    } finally {
      setLogoLoading(false);
    }
  };

  // Fetch unit details
  // Only fetch when isReady is true (decryption complete)
  useEffect(() => {
    if (!isReady || !id) {
      // ID is still decrypting or not available - wait
      return;
    }

    let mounted = true;

    const loadUnit = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await unitsService.getById(id);
        if (mounted) {
          setUnit(data);
          // Fetch logo URL if logo exists
          if (data.logo) {
            const url = await fetchLogoUrl(data.logo);
            if (mounted && url) {
              setLogoUrl(url);
            }
          }
        }
      } catch (err: any) {
        if (mounted) {
          setError(extractErrorMessage(err, 'Failed to fetch unit details'));
          setUnit(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadUnit();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, id]);

  // Handlers
  const handleEdit = () => id && navigateToEdit(id);
  const handleDeleteClick = () => setDeleteDialogOpen(true);

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await unitsService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete unit'));
    }
  };

  const handleRestoreConfirm = async () => {
    if (!id) return;
    try {
      await unitsService.restore(id);
      const data = await unitsService.getById(id);
      setUnit(data);
      setRestoreDialogOpen(false);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to restore unit'));
    }
  };

  const handleLogoClick = () => {
    if (logoUrl) {
      setImagePreviewOpen(true);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <ProgressSpinner style={{ width: '40px', height: '40px' }} />
      </div>
    );
  }

  // Error state
  if (error || !unit) {
    return (
      <div className="p-4">
        <Message severity="error" text={error || 'Unit not found'} className="mb-4 w-full" />
        <Button
          label="Back to Units"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  const deleteDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={() => setDeleteDialogOpen(false)} />
      <Button label="Delete" severity="danger" onClick={handleDeleteConfirm} />
    </div>
  );

  const restoreDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined onClick={() => setRestoreDialogOpen(false)} />
      <Button label="Restore" severity="success" onClick={handleRestoreConfirm} />
    </div>
  );

  return (
    <div className="p-3" data-testid="SCR-Unit-View">
      {/* Header Section */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1.5">
          <Button
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            rounded
            onClick={() => navigateToList()}
            className="p-0"
            style={{ width: '28px', height: '28px' }}
          />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Unit Details</h1>
        </div>
      </div>

      {/* Unit Header with Logo */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Logo */}
          {logoLoading ? (
            <div className="w-12 h-12 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <ProgressSpinner style={{ width: '20px', height: '20px' }} />
            </div>
          ) : logoUrl ? (
            <div
              className="w-12 h-12 rounded border border-gray-200 dark:border-gray-600 overflow-hidden bg-white cursor-pointer flex-shrink-0"
              onClick={handleLogoClick}
            >
              <img src={logoUrl} alt={unit.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-semibold text-gray-400">{unit.name?.charAt(0) || '?'}</span>
            </div>
          )}

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{unit.name}</h2>
              {unit.unitCode && (
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                  {unit.unitCode}
                </span>
              )}
              {unit.isDeleted ? (
                <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
              ) : (
                <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
              )}
              {unit.isVirtual && <Tag value="Virtual" severity="info" className="text-xs px-1.5 py-0.5" />}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {unit.policeReferenceId} &bull; {unit.unitType?.name || '-'}
            </p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with unit name row */}
        {!((unit as any).isDelete || unit.isDeleted) && (
          <div className="flex gap-1.5 sm:self-center">
            {canUpdate && (
              <Button
                label="Edit"
                icon="pi pi-pencil"
                onClick={handleEdit}
                size="small"
              />
            )}
            {canDelete && (
              <Button
                label="Delete"
                icon="pi pi-trash"
                severity="danger"
                onClick={handleDeleteClick}
                size="small"
              />
            )}
          </div>
        )}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Basic Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Reference ID(CCTNS Code)</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.policeReferenceId || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Unit Name</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.name || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Unit Code</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.unitCode || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Short Code</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.shortCode || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Scope</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.scope || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Department</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.department?.name || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Unit Type</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.unitType?.name || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Parent Unit</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.parentUnit?.name || 'None'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Virtual Unit</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.isVirtual ? 'Yes' : 'No'}</p>
              </div>
              {unit.responsiblePostCode && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Responsible Post</label>
                  <p className="text-sm text-gray-900 dark:text-white font-mono">{unit.responsiblePostCode}</p>
                </div>
              )}
            </div>
          </div>

          {/* Address Information */}
          <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Address & Contact</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Address</label>
                <p className="text-sm text-gray-900 dark:text-white">
                  {[unit.address1, unit.address2, unit.city].filter(Boolean).join(', ') || '-'}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">District</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.district?.name || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">ZIP Code</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.zip || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Email</label>
                <p className="text-sm text-gray-900 dark:text-white">{unit.email || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-0.5">Phone</label>
                <p className="text-sm text-gray-900 dark:text-white">
                  {unit.phone && unit.phone.length > 0 ? unit.phone.join(', ') : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Responsible Personnel - Commented out per request */}
          {/* <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Responsible Personnel</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Responsible User</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{getPersonnelName(unit.responsibleUserId)}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Designation</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{unit.responsiblePersonTitle || '-'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Proxy User</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{getPersonnelName(unit.proxyUserId)}</p>
              </div>
            </div>
          </div> */}

          {/* Embedded Posts Section */}
          {unit.posts && unit.posts.length > 0 && (
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Posts ({unit.posts.filter((p: any) => !p.isDelete).length})
                </h2>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-gray-600 dark:text-gray-400">
                      {unit.posts.filter((p: any) => !p.isDelete && p.assignedUser).length} Assigned
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                    <span className="text-gray-600 dark:text-gray-400">
                      {unit.posts.filter((p: any) => !p.isDelete && !p.assignedUser).length} Vacant
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                      <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Post</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Personnel</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Roles</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Reports To</th>
                      <th className="text-center py-1.5 px-2 font-medium text-gray-600 dark:text-gray-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unit.posts
                      .filter((post: any) => !post.isDelete)
                      .map((post: any) => (
                        <tr key={post.postCode} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="py-2 px-2">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-gray-900 dark:text-white">{post.postName}</span>
                                {post.isUnitHead && (
                                  <i className="pi pi-star-fill text-[9px] text-blue-600 dark:text-blue-400" title="Unit Head" />
                                )}
                                {unit.responsiblePostCode === post.postCode && (
                                  <i className="pi pi-check-circle text-[9px] text-green-600 dark:text-green-400" title="Responsible Post" />
                                )}
                              </div>
                              <span className="text-gray-500 dark:text-gray-400 font-mono">{post.postCode}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            {post.assignedUser ? (
                              <span
                                onClick={() => {
                                  const userId = typeof post.assignedUser === 'string'
                                    ? post.assignedUser
                                    : post.assignedUser._id;
                                  navigate(`/personnel/${userId}`);
                                }}
                                className="inline-flex items-center gap-1.5 text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                              >
                                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0">
                                  {typeof post.assignedUser === 'string'
                                    ? getPersonnelName(post.assignedUser)?.charAt(0) || '?'
                                    : (post.assignedUser.name || post.assignedUser.firstName || '?').charAt(0)}
                                </div>
                                <span className="font-medium">
                                  {typeof post.assignedUser === 'string'
                                    ? getPersonnelName(post.assignedUser)
                                    : (post.assignedUser.name || `${post.assignedUser.firstName} ${post.assignedUser.lastName}`)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500 italic">Vacant</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            {post.assignedRoles && post.assignedRoles.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {post.assignedRoles.map((role: any, idx: number) => {
                                  const displayName = typeof role === 'string'
                                    ? role
                                    : (role.roleName || role.name || role._id);
                                  const roleKey = typeof role === 'string' ? role : role._id;
                                  return (
                                    <span
                                      key={roleKey || idx}
                                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                    >
                                      {displayName}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            {post.reportsToPost && (post.reportsToPost.postName || post.reportsToPost.unitName) ? (
                              <div className="flex flex-col">
                                <span className="text-gray-900 dark:text-white">{post.reportsToPost.postName || 'N/A'}</span>
                                {post.reportsToPost.unitName && post.reportsToPost.unitId !== unit._id && (
                                  <span className="text-gray-500 dark:text-gray-400 text-[10px]">({post.reportsToPost.unitName})</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="inline-flex items-center gap-1">
                              <div className={`w-1.5 h-1.5 rounded-full ${post.assignedUser ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                              <span className={post.assignedUser ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-400'}>
                                {post.assignedUser ? 'Assigned' : 'Vacant'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unit Hierarchy */}
          {unit.parentUnitPath && (
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Unit Hierarchy</h2>
              <div className="text-xs">
                {String(unit.parentUnitPath)
                  ?.split('\\')
                  ?.filter(Boolean)
                  ?.reverse()
                  ?.map((unitName: string, index: number, array: string[]) => (
                    <div key={index} className="flex items-center py-1" style={{ paddingLeft: `${index * 16}px` }}>
                      <span className="text-gray-400 mr-2">{index === array.length - 1 ? '└' : '├'}</span>
                      <span
                        className={
                          index === array.length - 1
                            ? 'font-medium text-gray-900 dark:text-white'
                            : 'text-gray-500 dark:text-gray-400'
                        }
                      >
                        {unitName}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        {/* Audit Information */}
          {/* <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Audit Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created At</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{formatDateTime(unit.createdAt)}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Created By</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{getPersonnelName(unit.createdBy)}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated At</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{formatDateTime(unit.updatedAt)}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Updated By</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{getPersonnelName(unit.updatedBy)}</p>
              </div>
            </div>
          </div> */}

          {/* Unit Personnel List - Commented out per request */}
          {/* {unit.unitPersonnelList && unit.unitPersonnelList.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                Unit Personnel ({unit.unitPersonnelList.length})
              </h2>
              <div className="flex flex-wrap gap-2">
                {unit.unitPersonnelList.map((userId: string) => (
                  <span
                    key={userId}
                    onClick={() => navigate(`/personnel/${userId}`)}
                    className="inline-flex items-center px-3 py-1.5 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <i className="pi pi-user mr-2 text-xs" />
                    {getPersonnelName(userId)}
                  </span>
                ))}
              </div>
            </div>
          )} */}
         

          {/* Responsible Post History */}
          {unit.responsiblePostHistory && unit.responsiblePostHistory.length > 0 && (
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Responsible Post History
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Post Code</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Title</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Period</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Reason</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-500 dark:text-gray-400">Changed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unit.responsiblePostHistory?.map((history: any, index: number) => (
                      <tr
                        key={index}
                        className="border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                      >
                        <td className="py-1.5 px-2 text-gray-900 dark:text-white">
                          <span className="font-mono">{history.postCode || '-'}</span>
                          {index === (unit.responsiblePostHistory?.length ?? 0) - 1 && (
                            <Tag value="Previous" severity="warning" className="ml-1.5 text-xs px-1.5 py-0.5" />
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400">{history.title || '-'}</td>
                        <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400">
                          {formatDate(history.from)} - {formatDate(history.to)}
                        </td>
                        <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400">{history.reason || '-'}</td>
                        <td className="py-1.5 px-2 text-gray-600 dark:text-gray-400">
                          {getPersonnelName(history.changedBy)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </div>

      {/* Delete Dialog */}
      <Dialog
        visible={deleteDialogOpen}
        onHide={() => setDeleteDialogOpen(false)}
        header="Delete Unit"
        footer={deleteDialogFooter}
        style={{ width: '400px' }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to delete <strong>{unit.name}</strong>? This action will mark the unit as deleted.
        </p>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog
        visible={restoreDialogOpen}
        onHide={() => setRestoreDialogOpen(false)}
        header="Restore Unit"
        footer={restoreDialogFooter}
        style={{ width: '400px' }}
      >
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Are you sure you want to restore <strong>{unit.name}</strong>? This will make the unit active again.
        </p>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog
        visible={imagePreviewOpen}
        onHide={() => setImagePreviewOpen(false)}
        header={unit.name}
        style={{ width: 'auto', maxWidth: '90vw' }}
        dismissableMask
        className="image-preview-dialog"
      >
        {logoUrl && (
          <div className="flex justify-center">
            <img
              src={logoUrl}
              alt={unit.name}
              className="max-w-full max-h-[70vh] object-contain"
            />
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default UnitView;
