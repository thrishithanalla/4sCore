/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { fetchRoles, exportRoles, deleteRole, type Role, type RoleQueryParams } from '../../services/roles.service';
import { modulesService } from '../../services/modules.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import DescriptionViewDialog from '../../components/dialogs/description-view-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';
import styles from './roles-list.module.css';

const RolesList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit, navigateToCreate } = useSecureNavigation({
    entity: 'roles',
    basePath: '/roles',
  });
  const toast = useRef<Toast>(null);
  const canCreate = useCanCreate(JOB_NAMES.ROLES);
  const canUpdate = useCanUpdate(JOB_NAMES.ROLES);
  const canDelete = useCanDelete(JOB_NAMES.ROLES);
  const [roles, setRoles] = useState<(Role & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [descriptionDialogOpen, setDescriptionDialogOpen] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState<string | null>(null);

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);

  // Debounce search text and module filter (500ms delay)
  const debouncedSearchText = useDebounce(searchText, 500);
  const debouncedModuleFilter = useDebounce(moduleFilter, 500);

  // Fetch modules for dropdown
  const { data: modules = [] } = useQuery({
    queryKey: ['modules-dropdown'],
    queryFn: () => modulesService.getAllForDropdown(),
  });

  const showError = useCallback((message: string) => {
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: message,
      life: 10000,
    });
  }, []);

  const loadRoles = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const params: RoleQueryParams = {
        page,
        page_size: size,
      };

      if (debouncedSearchText && debouncedSearchText.trim()) {
        params.search = debouncedSearchText.trim();
      }

      if (debouncedModuleFilter) {
        params.module_id = debouncedModuleFilter;
      }

      const response = await fetchRoles(params);
      const mappedData = (response.data || []).map((role) => ({ ...role, id: role._id }));
      setRoles(mappedData);

      // Handle both totalItems and total from API response
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (err: any) {
      console.error('Failed to load roles:', err);
      showError(extractErrorMessage(err, 'Failed to load roles'));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchText, debouncedModuleFilter, pageSize, showError]);

  // Handle page change from DataTable
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    loadRoles(newPage, event.rows);
  };

  // Handle sort event
  const handleSort = (event: any) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  // Apply client-side sorting to current page data
  const sortedRoles = useMemo(() => {
    if (!sortField || !sortOrder) return roles;
    return [...roles].sort((a: any, b: any) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      if (aValue == null) return sortOrder;
      if (bValue == null) return -sortOrder;
      if (typeof aValue === 'string') {
        return sortOrder * aValue.localeCompare(bValue);
      }
      return sortOrder * (aValue - bValue);
    });
  }, [roles, sortField, sortOrder]);

  // Reset to first page when filters change
  useEffect(() => {
    setFirst(0);
    loadRoles(1, pageSize);
  }, [debouncedSearchText, debouncedModuleFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedId(String(id));
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedId) return;
    try {
      setDeleteLoading(true);
      await deleteRole(selectedId);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      loadRoles();
    } catch (err: any) {
      console.error('Failed to delete role:', err);
      setDeleteDialogOpen(false);
      setSelectedId(null);
      showError(extractErrorMessage(err, 'Failed to delete role'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedId(null);
  };

  const handleDescriptionClick = (description: string | null | undefined) => {
    setSelectedDescription(description || null);
    setDescriptionDialogOpen(true);
  };

  const handleDescriptionDialogClose = () => {
    setDescriptionDialogOpen(false);
    setSelectedDescription(null);
  };

  const handleRefresh = () => {
    loadRoles(Math.floor(first / pageSize) + 1, pageSize);
  };

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => exportRoles(), []);

  const moduleOptions = [
    { label: 'All Modules', value: '' },
    ...modules.map((m) => ({ label: m.name, value: m._id })),
  ];

  const columns: DataTableColumn<Role & { id: string }>[] = useMemo(
    () => [
      {
        field: 'name',
        header: 'Role Name',
        sortable: true,
      },
      {
        field: 'shortCode',
        header: 'Short Code',
        sortable: true,
      },
      {
        field: 'description',
        header: 'Description',
        sortable: true,
        body: (rowData: Role) => {
          const description = rowData.description || '';
          const maxLength = 50;

          if (!description) {
            return <span className="text-gray-400 dark:text-gray-500 text-xs italic">No description</span>;
          }

          const isTruncated = description.length > maxLength;
          const displayText = isTruncated ? `${description.substring(0, maxLength)}...` : description;

          return (
            <div
              className={`text-sm ${isTruncated ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors' : ''}`}
              onClick={() => isTruncated && handleDescriptionClick(description)}
              title={isTruncated ? 'Click to view full description' : description}
            >
              {displayText}
            </div>
          );
        },
      },
      {
        field: 'permissions',
        header: 'Modules',
        sortable: false,
        body: (rowData: Role) => (
          <div className="flex gap-1 flex-wrap items-center">
            {rowData.permissions?.slice(0, 2).map((module: any, index: number) => (
              <Tag key={index} value={module.moduleName} severity="info" className="text-xs" />
            ))}
            {rowData.permissions && rowData.permissions.length > 2 && (
              <Tag value={`+${rowData.permissions.length - 2}`} className="text-xs" />
            )}
          </div>
        ),
      },
      {
        field: 'jobsCount',
        header: 'Jobs',
        sortable: false,
        body: (rowData: Role) => {
          // Collect all jobs from all modules
          const allJobs: { name: string; displayName?: string; isMenu: boolean }[] = [];
          rowData.permissions?.forEach((module: any) => {
            module.jobs?.forEach((job: any) => {
              allJobs.push({
                name: job.jobName,
                displayName: job.displayName,
                isMenu: job.isMenu !== false, // Default to true if not specified
              });
            });
          });

          // Show menu jobs first, then non-menu jobs
          const menuJobs = allJobs.filter(j => j.isMenu);
          const hiddenJobs = allJobs.filter(j => !j.isMenu);
          const displayJobs = [...menuJobs, ...hiddenJobs];
          const visibleJobs = displayJobs.slice(0, 3);
          const remaining = displayJobs.length - 3;

          if (displayJobs.length === 0) {
            return <span className="text-gray-400 dark:text-gray-500 text-xs">No jobs</span>;
          }

          return (
            <div className="flex gap-1 flex-wrap items-center">
              {visibleJobs.map((job, idx) => (
                <Tag
                  key={idx}
                  value={job.displayName || job.name}
                  severity={job.isMenu ? 'success' : 'secondary'}
                  className="text-xs"
                  data-pr-tooltip={job.isMenu ? 'Menu visible' : 'Hidden from menu'}
                />
              ))}
              {remaining > 0 && (
                <Tag
                  value={`+${remaining}`}
                  severity="info"
                  className="text-xs"
                  data-pr-tooltip={`${remaining} more job(s)`}
                />
              )}
            </div>
          );
        },
      },
      {
        field: 'createdAt',
        header: 'Created',
        sortable: true,
        body: (rowData: Role) =>
          rowData.createdAt
            ? new Date(rowData.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : '-',
      },
      {
        field: 'actions',
        header: 'Actions',
      headerStyle: { textAlign: 'center' },
        sortable: false,
        body: (rowData: Role) => (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => handleView(rowData._id)}
              data-testid="RolesList.Action.View"
              data-pr-tooltip="View"
            >
              <i
                className="pi pi-eye text-sm text-green-600 dark:text-green-400"
                style={{ fontSize: '1.125rem' }}
              />
            </button>

            {!((rowData as any).isDelete || rowData.isDeleted) && (
              <>
                {canUpdate && (
                  <button
                    className="p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    onClick={() => handleEdit(rowData._id)}
                    data-testid="RolesList.Action.Edit"
                    data-pr-tooltip="Edit"
                  >
                    <i className="pi pi-pencil text-blue-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}

                {canDelete && (
                  <button
                    className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => handleDeleteClick(rowData._id)}
                    data-testid="RolesList.Action.Delete"
                    data-pr-tooltip="Delete"
                  >
                    <i className="pi pi-trash text-red-600" style={{ fontSize: '1.125rem' }} />
                  </button>
                )}
              </>
            )}
          </div>
        ),
      },
    ],
    [canUpdate, canDelete]
  );

  return (
    <PermissionGuard jobName={JOB_NAMES.ROLES}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-Roles-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-users" />
            </div>
            <h1 className={styles.title}>Role Management</h1>
          </div>
          <p className={styles.subtitle}>
            Manage user roles, permissions, and access control
          </p>
        </div>

        {/* Main Card */}
        <div className={styles.card}>
          <div className={styles.cardContent}>
            {/* Filter / Control Bar */}
            <div className={styles.filterBar}>
              <div className={styles.filterBarContent}>
                {/* Left side - All filters grouped together */}
                <div className={styles.filterGroup}>
                  <Input
                    name="search"
                    placeholder="Search roles..."
                    value={searchText}
                    onChange={(value: string) => setSearchText(value)}
                    testId="RolesList.Search"
                    style={{ minWidth: '180px', width: '180px' }}
                    clearable
                  />

                  <Dropdown
                    value={moduleFilter}
                    options={moduleOptions}
                    onChange={(e: { value: string }) => setModuleFilter(e.value || '')}
                    placeholder="All Modules"
                    style={{ width: '160px' }}
                    data-testid="RolesList.Filter.Module"
                    resetFilterOnHide={true}
                  />
                </div>

                {/* Right side - Record count and Actions */}
                <div className={styles.filterActions}>
                  <span className={styles.recordCount}>
                    {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                  </span>
                  <ExportDataButton
                    fetchBlob={fetchExportBlob}
                    filename="roles-export.xlsx"
                    testId="RolesList.Button.Export"
                  />
                  <RefreshButton
                    onClick={handleRefresh}
                    loading={loading}
                    testId="RolesList.Button.Refresh"
                  />
                  {canCreate && (
                    <Button
                      label="Create Role"
                      icon="pi pi-plus"
                      onClick={() => navigateToCreate()}
                      testId="RolesList.Button.Create"
                      size="small"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* DataTable */}
            <DataTable
              data={sortedRoles}
              columns={columns}
              loading={loading}
              emptyMessage="No roles found"
              dataKey="_id"
              paginator
              lazy
              first={first}
              rows={pageSize}
              totalRecords={totalRecords}
              onPage={handlePageChange}
              rowsPerPageOptions={[5, 10, 25, 50]}
              sortField={sortField}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
            <Tooltip target="[data-pr-tooltip]" />
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this role? This action cannot be undone."
          testId="RolesList.Dialog.Delete"
          loading={deleteLoading}
        />

        {/* Description View Dialog */}
        <DescriptionViewDialog
          visible={descriptionDialogOpen}
          onClose={handleDescriptionDialogClose}
          title="Role Description"
          description={selectedDescription}
          testId="RolesList.Dialog.Description"
        />
      </div>
    </PermissionGuard>
  );
};

export default RolesList;
