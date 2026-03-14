/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { getDownloadUrl } from 'mainFe/fileUploadService';
import ImagePreviewOverlay from 'mainFe/ImagePreviewOverlay';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { levelsService } from '../../services/levels.service';
import type { Level, LevelChildUnit } from '../../types';
import { extractErrorMessage } from '../../utils/error-handler';
import { usePersonnelNames } from '../../hooks/usePersonnelLookup';

const LevelView = () => {
  const navigate = useAppNavigate();
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'levels',
    basePath: '/levels',
  });

  const imageOverlayRef = useRef<any>(null);

  const [data, setData] = useState<Level | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Icon image URL state
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Statistics state
  const [statistics, setStatistics] = useState<{
    totalUnits: number;
    totalPersonnel: number;
    childUnits: number;
    vacantPositions: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Child units state
  const [childUnits, setChildUnits] = useState<LevelChildUnit[]>([]);
  const [childUnitsLoading, setChildUnitsLoading] = useState(false);

  // Set breadcrumb title to show level name instead of UUID
  useBreadcrumbTitle(data?.levelName);

  // Collect personnel IDs for lookup (createdBy, updatedBy)
  const personnelIds = [data?.createdBy, data?.updatedBy];
  const { getName: getPersonnelName } = usePersonnelNames(personnelIds);

  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await levelsService.getById(id);
        setData(res);

        // Fetch icon URL if icon exists
        if (res.levelIcon) {
          const iconId = res.levelIcon;
          const downloadApiUrl = getDownloadUrl(iconId);
          const token = localStorage.getItem('accessToken');

          try {
            const response = await fetch(downloadApiUrl, {
              method: 'GET',
              headers: { Authorization: `Bearer ${token}` },
            });
            const iconData = await response.json();
            if (iconData?.success && iconData?.data?.url) {
              setIconUrl(iconData.data.url);
            } else {
              setIconUrl(downloadApiUrl);
            }
          } catch (err) {
            console.error('Failed to fetch icon URL:', err);
            setIconUrl(downloadApiUrl);
          }
        } else {
          setIconUrl(null);
        }

        // Load statistics
        setStatsLoading(true);
        try {
          const stats = await levelsService.getStatistics(id);
          setStatistics(stats);
        } catch (statsErr) {
          console.warn('Failed to load statistics:', statsErr);
          // Use fallback from level data if available
          setStatistics({
            totalUnits: res.unitCount ?? 0,
            totalPersonnel: res.totalPersonnel ?? 0,
            childUnits: res.childLevelCount ?? 0,
            vacantPositions: res.vacantPositions ?? 0,
          });
        } finally {
          setStatsLoading(false);
        }

        // Load child units
        setChildUnitsLoading(true);
        try {
          const unitsRes = await levelsService.getChildUnits(id, { page: 1, page_size: 10 });
          setChildUnits(unitsRes.data || []);
        } catch (unitsErr) {
          console.warn('Failed to load child units:', unitsErr);
        } finally {
          setChildUnitsLoading(false);
        }
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch level'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, id]);

  const handleEdit = () => {
    if (id) navigateToEdit(id);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      await levelsService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete level'));
      setDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="py-8 px-6">
        <div className="flex justify-center items-center min-h-[400px]">
          <ProgressSpinner style={{ width: '50px', height: '50px' }} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-8 px-6">
        <Message severity="error" text={error || 'Level not found'} className="mb-4 w-full" />
        <Button
          label="Back to Levels"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  // Dialog footer for delete confirmation
  const deleteDialogFooter = (
    <div className="flex justify-end gap-2">
      <Button
        label="Cancel"
        severity="secondary"
        outlined
        onClick={handleDeleteCancel}
      />
      <Button
        label="Delete"
        severity="danger"
        onClick={handleDeleteConfirm}
      />
    </div>
  );

  return (
    <>
      <ImagePreviewOverlay ref={imageOverlayRef} src={previewImageUrl || ''} />

      <div className="py-8 px-6" data-testid="SCR-Level-View">
        {/* Header Section */}
        <div className="mb-6">
          <Button
            label="Back to Levels"
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            onClick={() => navigateToList()}
            className="mb-4"
          />

          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">Level Details</h1>
              <p className="text-gray-600 dark:text-gray-400">View complete information for this hierarchy level</p>
            </div>

            <div className="flex gap-2">
              <Button
                label="Edit"
                icon="pi pi-pencil"
                severity="secondary"
                outlined
                onClick={handleEdit}
              />
              <Button
                label="Delete"
                icon="pi pi-trash"
                severity="danger"
                outlined
                onClick={handleDeleteClick}
              />
            </div>
          </div>
        </div>

        {/* Level Header with Icon */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="w-16 h-16 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt={`${data.levelName} icon`}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={(e) => {
                    setPreviewImageUrl(iconUrl);
                    imageOverlayRef.current?.show(e, e.currentTarget);
                  }}
                />
              ) : (
                <i className="pi pi-sitemap text-2xl text-gray-400" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{data.levelName}</h2>
                {data.isDelete ? (
                  <Tag value="Deleted" severity="danger" />
                ) : data.isActive === false ? (
                  <Tag value="Inactive" severity="warning" />
                ) : (
                  <Tag value="Active" severity="success" />
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Level {data.levelNumber} &bull; Code: {data.levelCode}
              </p>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Units</div>
            {statsLoading ? (
              <ProgressSpinner style={{ width: '24px', height: '24px' }} />
            ) : (
              <div className="text-2xl font-bold text-blue-600">{statistics?.totalUnits ?? '-'}</div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Personnel</div>
            {statsLoading ? (
              <ProgressSpinner style={{ width: '24px', height: '24px' }} />
            ) : (
              <div className="text-2xl font-bold text-green-600">{statistics?.totalPersonnel ?? '-'}</div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Child Units</div>
            {statsLoading ? (
              <ProgressSpinner style={{ width: '24px', height: '24px' }} />
            ) : (
              <div className="text-2xl font-bold text-purple-600">{statistics?.childUnits ?? '-'}</div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Vacant Positions</div>
            {statsLoading ? (
              <ProgressSpinner style={{ width: '24px', height: '24px' }} />
            ) : (
              <div className="text-2xl font-bold text-red-600">{statistics?.vacantPositions ?? '-'}</div>
            )}
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Level Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Level Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{data.levelName || '-'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Code</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">{data.levelCode || '-'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Level Order</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {data.levelNumber !== undefined && data.levelNumber !== null ? data.levelNumber : '-'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Can Have Children</label>
                <p className="text-sm text-gray-900 dark:text-white mt-1">
                  {data.canHaveChildren ? (
                    <span className="text-green-600 font-medium">Yes</span>
                  ) : (
                    <span className="text-gray-500">No</span>
                  )}
                </p>
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
              <>
                <Divider />
                <Message severity="warn" text="This record is soft-deleted." className="w-full mb-4" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Deleted At</label>
                    <p className="text-sm text-gray-900 dark:text-white mt-1">-</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Deleted By</label>
                    <p className="text-sm text-gray-900 dark:text-white mt-1">-</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Child Units Section */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Units at this Level {childUnits.length > 0 && `(${childUnits.length})`}
            </h2>

            {childUnitsLoading ? (
              <div className="flex justify-center py-8">
                <ProgressSpinner style={{ width: '40px', height: '40px' }} />
              </div>
            ) : childUnits.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm py-4">No units found at this level.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Unit Name</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Reference ID</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Personnel</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Vacancies</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childUnits.map((unit) => (
                      <tr
                        key={unit._id}
                        className="border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="py-2 px-3 text-gray-900 dark:text-white font-medium">
                          {unit.name}
                        </td>
                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                          {unit.policeReferenceId || '-'}
                        </td>
                        <td className="py-2 px-3 text-center text-gray-900 dark:text-white">
                          {unit.personnelCount ?? '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {unit.vacancies !== undefined && unit.vacancies !== null ? (
                            <span className={unit.vacancies > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
                              {unit.vacancies}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => navigate(`/units/${unit._id}`)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog
          visible={deleteDialogOpen}
          onHide={handleDeleteCancel}
          header="Confirm Delete"
          footer={deleteDialogFooter}
          style={{ width: '450px' }}
          data-testid="LevelView.Dialog.Delete"
        >
          <p className="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete this level? This action will mark it as deleted.
          </p>
        </Dialog>
      </div>
    </>
  );
};

export default LevelView;
