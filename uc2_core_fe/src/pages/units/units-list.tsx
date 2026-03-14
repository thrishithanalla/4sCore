import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Dialog } from 'mainFe/Dialog';
import { Toast } from 'mainFe/Toast';
import { Tag } from 'mainFe/Tag';
import { TabView, TabPanel } from 'primereact/tabview';
import { InputSwitch } from 'primereact/inputswitch';
import { Menu } from 'primereact/menu';
import styles from './units-list.module.css';
import type { MenuItem } from 'primereact/menuitem';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { Button } from 'mainFe/Button';
import { RefreshButton } from 'mainFe/RefreshButton';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { unitsService, type UnitQueryParams } from '../../services/units.service';
import { districtsService } from '../../services/districts.service';
import { fileUploadService } from '../../services/file-upload.service';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import type { Unit, District } from '../../types';
import PostsByUnits from './posts-by-units';
import HierarchyLayout from '../hierarchy-layout/hierarchy-layout';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

// Type for selected unit in kebab menu
interface SelectedUnitForMenu {
  _id: string;
  name: string;
  departmentId?: string;
  districtId?: string;
}

const UnitsList = () => {
  const navigate = useAppNavigate();
  const { navigateToView, navigateToEdit } = useSecureNavigation({
    entity: 'units',
    basePath: '/units',
  });
  const toast = useRef<Toast>(null);
  const menuRef = useRef<Menu>(null);
  const canCreate = useCanCreate(JOB_NAMES.UNITS);
  const canUpdate = useCanUpdate(JOB_NAMES.UNITS);
  const canDelete = useCanDelete(JOB_NAMES.UNITS);

  // Tab state
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitForMenu, setSelectedUnitForMenu] = useState<SelectedUnitForMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);
  const [searchText, setSearchText] = useState('');
  const [unitCodeSearch, setUnitCodeSearch] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Pagination states for server-side pagination
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Sorting states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);

  // Debug: Log sort state changes
  useEffect(() => {
    console.log('[Units Sorting] State changed - sortField:', sortField, 'sortOrder:', sortOrder);
  }, [sortField, sortOrder]);

  // Debounce search text (500ms delay)
  const debouncedSearchText = useDebounce(searchText, 500);
  const debouncedUnitCodeSearch = useDebounce(unitCodeSearch, 500);

  // Districts for lookups
  const [districts, setDistricts] = useState<District[]>([]);


  // Unit Head data map: unitId -> unit head assigned user name
  const [unitHeadMap, setUnitHeadMap] = useState<Map<string, string>>(new Map());
  const [unitHeadLoading, setUnitHeadLoading] = useState<Set<string>>(new Set());

  // Unit Details Dialog state
  const [unitDialogVisible, setUnitDialogVisible] = useState(false);
  const [unitDialogDetails, setUnitDialogDetails] = useState<Unit | null>(null);
  const [unitDialogLoading, setUnitDialogLoading] = useState(false);
  const [profilePictures, setProfilePictures] = useState<Map<string, string>>(new Map());

  // Hover preview state for profile pictures
  const [hoverPreview, setHoverPreview] = useState<{
    visible: boolean;
    imageUrl: string;
    userName: string;
    x: number;
    y: number;
  } | null>(null);

  // Fetch districts for dropdown (no pagination)
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const districtsData = await districtsService.getAllForDropdown();
        setDistricts(districtsData);
      } catch (error) {
        console.error('Failed to fetch dropdown data:', error);
      }
    };
    fetchDropdownData();
  }, []);

  const fetchUnits = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);

      // Build query parameters for server-side pagination
      const params: UnitQueryParams = {
        page,
        page_size: size,
      };

      // Only add include_deleted if it's true
      if (includeDeleted) {
        params.include_deleted = true;
      }

      // Use districtId from selected district
      if (selectedDistrict?._id) {
        params.districtId = selectedDistrict._id;
      }

      // Add search parameter for server-side search (using debounced value)
      if (debouncedSearchText?.trim()) {
        params.search = debouncedSearchText.trim();
      }

      // Add unit code search parameter
      if (debouncedUnitCodeSearch?.trim()) {
        params.unitCode = debouncedUnitCodeSearch.trim();
      }

      // Add sort parameters for server-side sorting
      if (sortField) {
        params.sort_by = sortField;
        params.sort_order = sortOrder === 1 ? 'asc' : 'desc';
      }

      console.log('Fetching units with params:', params);
      const response = await unitsService.getAll(params);
      console.log('Received units:', response.data?.length, 'Pagination:', response.pagination);

      // Map _id to id for DataGrid compatibility
      const mappedData = (response.data || []).map(unit => ({ ...unit, id: unit._id }));

      setUnits(mappedData);
      // Handle both totalItems and total for backward compatibility
      const total = response.pagination?.totalItems ?? (response.pagination as any)?.total ?? 0;
      setTotalRecords(total);
    } catch (error: any) {
      console.error('Failed to fetch units:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(error, 'Failed to load units. Please try again.'),
        life: 10000,
      });
    } finally {
      setLoading(false);
    }
  }, [includeDeleted, selectedDistrict, debouncedSearchText, debouncedUnitCodeSearch, pageSize, sortField, sortOrder]);

  // Handle DataTable pagination changes
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchUnits(newPage, event.rows);
  };

  // Handle sort event - triggers server-side sorting
  const handleSort = (event: any) => {
    console.log('[Units Sorting] handleSort called with event:', event);
    console.log('[Units Sorting] sortField:', event.sortField, 'sortOrder:', event.sortOrder);
    setSortField(event.sortField);
    setSortOrder(event.sortOrder);
  };

  // Reset to first page and fetch when filters or sort change
  useEffect(() => {
    setFirst(0);
    fetchUnits(1, pageSize);
  }, [includeDeleted, selectedDistrict, debouncedSearchText, debouncedUnitCodeSearch, sortField, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch unit head data for each unit in the list
  useEffect(() => {
    const fetchUnitHeads = async () => {
      if (units.length === 0) return;

      // Get unit IDs that are not already in the map or loading
      const unitIdsToFetch = units
        .filter(unit => !unitHeadMap.has(unit._id) && !unitHeadLoading.has(unit._id))
        .map(unit => unit._id);

      if (unitIdsToFetch.length === 0) return;

      // Mark as loading
      setUnitHeadLoading(prev => {
        const newSet = new Set(prev);
        unitIdsToFetch.forEach(id => newSet.add(id));
        return newSet;
      });

      // Fetch unit details for each unit
      const results = await Promise.allSettled(
        unitIdsToFetch.map(id => unitsService.getById(id))
      );

      // Process results
      const newHeadMap = new Map(unitHeadMap);
      results.forEach((result, index) => {
        const unitId = unitIdsToFetch[index];
        if (result.status === 'fulfilled') {
          const unitDetails = result.value;
          // Find post where isUnitHead is true
          const unitHeadPost = unitDetails.posts?.find((post: any) => post.isUnitHead && !post.isDelete);
          if (unitHeadPost?.assignedUser) {
            const userName = typeof unitHeadPost.assignedUser === 'object'
              ? unitHeadPost.assignedUser.name
              : unitHeadPost.assignedUser;
            newHeadMap.set(unitId, userName || '-');
          } else {
            newHeadMap.set(unitId, '-');
          }
        } else {
          newHeadMap.set(unitId, '-');
        }
      });

      setUnitHeadMap(newHeadMap);

      // Remove from loading
      setUnitHeadLoading(prev => {
        const newSet = new Set(prev);
        unitIdsToFetch.forEach(id => newSet.delete(id));
        return newSet;
      });
    };

    fetchUnitHeads();
  }, [units]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleView = (id: string | number) => {
    navigateToView(String(id));
  };

  const handleEdit = (id: string | number) => {
    navigateToEdit(String(id));
  };

  const handleDeleteClick = (id: string | number) => {
    setSelectedUnitId(id as string);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUnitId) return;

    try {
      setDeleteLoading(true);
      await unitsService.delete(selectedUnitId);
      setDeleteDialogOpen(false);
      setSelectedUnitId(null);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Unit deleted successfully',
        life: 3000,
      });
      fetchUnits();
    } catch (error: any) {
      console.error('Failed to delete unit:', error);
      setDeleteDialogOpen(false);
      setSelectedUnitId(null);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(error, 'Failed to delete unit'),
        life: 10000,
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSelectedUnitId(null);
  };

  const handleIncludeDeletedToggle = (e: any) => {
    setIncludeDeleted(e.value);
  };

  // Kebab menu handlers
  const handleAddChildUnit = (unit: SelectedUnitForMenu) => {
    const params = new URLSearchParams({
      parentUnitId: unit?._id,
      parentUnitName: unit?.name,
    });
    if (unit?.departmentId) params.append('departmentId', unit?.departmentId);
    if (unit?.districtId) params.append('districtId', unit?.districtId);
    navigate(`/units/create?${params.toString()}`);
  };

  // Handle unit name click - open details dialog
  const handleUnitNameClick = async (unitId: string) => {
    setUnitDialogVisible(true);
    setUnitDialogLoading(true);
    try {
      const unitDetails = await unitsService.getById(unitId);
      setUnitDialogDetails(unitDetails);
    } catch (err) {
      console.error('Failed to fetch unit details:', err);
      setUnitDialogDetails(null);
    } finally {
      setUnitDialogLoading(false);
    }
  };

  // Close unit details dialog
  const handleUnitDialogClose = () => {
    setUnitDialogVisible(false);
    setUnitDialogDetails(null);
    // Clean up profile picture blob URLs
    profilePictures.forEach((url) => URL.revokeObjectURL(url));
    setProfilePictures(new Map());
  };

  // Fetch profile pictures for assigned users when dialog opens
  useEffect(() => {
    if (!unitDialogDetails?.posts) return;

    const fetchPictures = async () => {
      const newPictures = new Map<string, string>();
      const posts = unitDialogDetails.posts?.filter((post: any) => !post.isDelete && post.assignedUser?.picture) || [];

      await Promise.all(
        posts.map(async (post: any) => {
          const userId = post.assignedUser?._id;
          const pictureId = post.assignedUser?.picture;
          if (userId && pictureId) {
            try {
              const blobUrl = await fileUploadService.getFileUrl(pictureId);
              newPictures.set(userId, blobUrl);
            } catch (err) {
              console.error(`Failed to fetch picture for user ${userId}:`, err);
            }
          }
        })
      );

      setProfilePictures(newPictures);
    };

    fetchPictures();

    // Cleanup on unmount or when dialog details change
    return () => {
      profilePictures.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [unitDialogDetails]);

  // Build menu items based on RBAC permissions - shows all actions when > 3
  const getMenuItems = (): MenuItem[] => {
    if (!selectedUnitForMenu) return [];

    const items: MenuItem[] = [
      {
        label: 'View',
        icon: 'pi pi-eye',
        className: 'action-menu-view',
        command: () => handleView(selectedUnitForMenu._id),
      },
    ];

    if (canUpdate) {
      items.push({
        label: 'Edit',
        icon: 'pi pi-pencil',
        className: 'action-menu-edit',
        command: () => handleEdit(selectedUnitForMenu._id),
      });
    }

    if (canDelete) {
      items.push({
        label: 'Delete',
        icon: 'pi pi-trash',
        className: 'action-menu-delete',
        command: () => handleDeleteClick(selectedUnitForMenu._id),
      });
    }

    if (canCreate) {
      items.push({
        label: 'Add Child Unit',
        icon: 'pi pi-plus-circle',
        className: 'action-menu-add',
        command: () => handleAddChildUnit(selectedUnitForMenu),
      });
    }

    return items;
  };

  // Server-side search is now handled in fetchUnits, no client-side filtering needed

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => unitsService.export(), []);

  // Memoize columns for DataTable from core
  const columns: DataTableColumn<Unit>[] = useMemo(() => {
    const baseColumns: DataTableColumn<Unit>[] = [
      {
        field: 'name',
        header: 'Name',
        sortable: true,
        body: (rowData: Unit) => (
            <span
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer font-medium"
              onClick={() => handleUnitNameClick(rowData._id)}
            >
              {rowData.name}
            </span>
        ),
      },
      {
        field: 'email',
        header: 'Email',
        sortable: true,
        body: (rowData: Unit) => rowData.email || '-',
      },
      {
        field: 'phone',
        header: 'Phone',
        sortable: false,
        body: (rowData: Unit) => rowData.phone?.join(', ') || '-',
      },
      {
        field: 'responsibleUser',
        header: 'Responsible User',
        sortable: false,
        body: (rowData: Unit) => {
          if (unitHeadLoading.has(rowData._id)) {
            return <i className="pi pi-spin pi-spinner text-gray-400" style={{ fontSize: '0.875rem' }} />;
          }
          return unitHeadMap.get(rowData._id) || '-';
        },
      },
      {
        field: 'parentUnit.name',
        header: 'Parent Unit',
        sortable: true,
        body: (rowData: Unit) => rowData.parentUnit?.name || '-',
      },
      {
        field: 'status',
        header: 'Status',
        sortable: false,
        body: (rowData: Unit) => (
          (rowData as any).isDelete || rowData.isDeleted ? (
            <Tag value="Deleted" severity="danger" />
          ) : (
            <Tag value="Active" severity="success" />
          )
        ),
      },
    ];

    // Always add actions column at the end
    baseColumns.push({
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      body: (rowData: Unit) => {
        const isDeleted = (rowData as any).isDelete || rowData.isDeleted;

        // Count available actions
        let actionCount = 1; // View is always available
        if (!isDeleted) {
          if (canUpdate) actionCount++;
          if (canDelete) actionCount++;
          if (canCreate) actionCount++; // Add Child Unit
        }

        // Build menu items for dropdown
        const getRowMenuItems = (): MenuItem[] => {
          const items: MenuItem[] = [
            {
              label: 'View',
              icon: 'pi pi-eye',
              className: 'text-green-600',
              command: () => handleView(rowData._id),
            },
          ];

          if (!isDeleted) {
            if (canUpdate) {
              items.push({
                label: 'Edit',
                icon: 'pi pi-pencil',
                className: 'text-blue-600',
                command: () => handleEdit(rowData._id),
              });
            }
            if (canDelete) {
              items.push({
                label: 'Delete',
                icon: 'pi pi-trash',
                className: 'text-red-600',
                command: () => handleDeleteClick(rowData._id),
              });
            }
            if (canCreate) {
              items.push({
                label: 'Add Child Unit',
                icon: 'pi pi-plus-circle',
                command: () => handleAddChildUnit({
                  _id: rowData?._id,
                  name: rowData?.name,
                  departmentId: rowData?.departmentId,
                  districtId: rowData?.districtId,
                }),
              });
            }
          }
          return items;
        };

        // If more than 3 actions, show all in menu
        if (actionCount > 3) {
          return (
            <div className="flex justify-center">
              <button
                className="p-2 cursor-pointer"
                style={{ background: 'none', border: 'none', outline: 'none' }}
                onClick={(e) => {
                  setSelectedUnitForMenu({
                    _id: rowData._id,
                    name: rowData.name,
                    departmentId: rowData?.departmentId,
                    districtId: rowData?.districtId,
                  });
                  menuRef.current?.toggle(e);
                }}
                data-testid="UnitsList.Action.Menu"
                data-pr-tooltip="Actions"
              >
                <i className="pi pi-ellipsis-v text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" style={{ fontSize: '1.125rem' }} />
              </button>
              <Tooltip target="[data-pr-tooltip]" />
            </div>
          );
        }

        // Show up to 3 icons directly
        return (
          <div className="flex gap-1 justify-center">
            <button
              className="p-2 cursor-pointer"
              style={{ background: 'none', border: 'none', outline: 'none' }}
              onClick={() => handleView(rowData._id)}
              data-testid="UnitsList.Action.View"
              data-pr-tooltip="View"
            >
              <i className="pi pi-eye text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200" style={{ fontSize: '1.125rem' }} />
            </button>
            <Tooltip target="[data-pr-tooltip]" />

            {!isDeleted && canUpdate && (
              <button
                className="p-2 cursor-pointer"
                style={{ background: 'none', border: 'none', outline: 'none' }}
                onClick={() => handleEdit(rowData._id)}
                data-testid="UnitsList.Action.Edit"
                data-pr-tooltip="Edit"
              >
                <i className="pi pi-pencil text-blue-600 hover:text-blue-800" style={{ fontSize: '1.125rem' }} />
              </button>
            )}

            {!isDeleted && canDelete && (
              <button
                className="p-2 cursor-pointer"
                style={{ background: 'none', border: 'none', outline: 'none' }}
                onClick={() => handleDeleteClick(rowData._id)}
                data-testid="UnitsList.Action.Delete"
                data-pr-tooltip="Delete"
              >
                <i className="pi pi-trash text-red-600 hover:text-red-800" style={{ fontSize: '1.125rem' }} />
              </button>
            )}

            {/* Show Add Child Unit as icon if it's the 3rd action (when no edit or delete permission) */}
            {!isDeleted && canCreate && actionCount <= 3 && (
              <button
                className="p-2 cursor-pointer"
                style={{ background: 'none', border: 'none', outline: 'none' }}
                onClick={() => handleAddChildUnit({
                  _id: rowData._id,
                  name: rowData.name,
                  departmentId: rowData?.departmentId,
                  districtId: rowData?.districtId,
                })}
                data-testid="UnitsList.Action.AddChild"
                data-pr-tooltip="Add Child Unit"
              >
                <i className="pi pi-plus-circle text-purple-600 hover:text-purple-800" style={{ fontSize: '1.125rem' }} />
              </button>
            )}
          </div>
        );
      },
    });

    return baseColumns;
  }, [canUpdate, canDelete, canCreate, includeDeleted, unitHeadMap, unitHeadLoading]);

  return (
    <PermissionGuard jobName={JOB_NAMES.UNITS}>
      <Toast ref={toast} position="top-right" />
      <div className={styles.container} data-testid="SCR-Units-List">
        {/* Page Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <i className="pi pi-building" />
            </div>
            <h1 className={styles.title}>Units Management</h1>
          </div>
          <p className={styles.subtitle}>
            Manage police units, hierarchies, and organizational structure
          </p>
        </div>

        {/* Main Card with Tabs */}
        <div className={styles.card}>
          <div className={styles.cardContent}>
            <TabView
              activeIndex={activeTabIndex}
              onTabChange={(e: any) => setActiveTabIndex(e.index)}
              data-testid="UnitsList.TabView"
            >
              {/* Units Tab */}
              <TabPanel header="Units">
                <div className={styles.tabContent}>
                  {/* Filter / Control Bar */}
                  <div className={styles.filterBar}>
                    <div className={styles.filterBarContent}>
                      {/* Left side - All filters grouped together */}
                      <div className={styles.filterGroup}>
                        <Input
                          name="search"
                          placeholder="Unit Name..."
                          value={searchText}
                          onChange={(value:any) => setSearchText(value)}
                          testId="UnitsList.Search"
                          style={{ minWidth: '150px', width: '150px' }}
                          clearable
                        />

                        <Input
                          name="unitCode"
                          placeholder="Unit Code..."
                          value={unitCodeSearch}
                          onChange={(value:any) => setUnitCodeSearch(value)}
                          testId="UnitsList.SearchUnitCode"
                          style={{ minWidth: '150px', width: '150px' }}
                          clearable
                        />

                        <Dropdown
                          value={selectedDistrict?._id || null}
                          options={districts.map(d => ({ label: d.name, value: d._id }))}
                          onChange={(e:any) => {
                            const district = districts.find(d => d._id === e.value);
                            setSelectedDistrict(district || null);
                          }}
                          placeholder="District"
                          showClear
                          style={{ minWidth: '150px', width: '150px' }}
                          data-testid="UnitsList.Filter.District"
                          resetFilterOnHide={true}
                        />

                        {canDelete && (
                          <div className={styles.toggleGroup}>
                            <InputSwitch
                              checked={includeDeleted}
                              onChange={handleIncludeDeletedToggle}
                              data-testid="UnitsList.Toggle.IncludeDeleted"
                            />
                            <label className={styles.toggleLabel}>Show Deleted</label>
                          </div>
                        )}
                      </div>

                      {/* Right side - Record count, Export & Refresh */}
                      <div className={styles.filterActions}>
                        <span className={styles.recordCount}>
                          {totalRecords} {totalRecords === 1 ? 'record' : 'records'}
                        </span>
                        <ExportDataButton
                          fetchBlob={fetchExportBlob}
                          filename="units-export.xlsx"
                          testId="UnitsList.Button.Export"
                        />
                        <RefreshButton
                          onClick={() => fetchUnits(Math.floor(first / pageSize) + 1, pageSize)}
                          loading={loading}
                          testId="UnitsList.Button.Refresh"
                        />
                        {canCreate && (
                          <Button
                            label="Create Unit"
                            icon="pi pi-plus"
                            onClick={() => navigate('/units/create')}
                            testId="UnitsList.Button.Create"
                            size="small"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* DataTable from Core */}
                  <DataTable
                    data={units}
                    columns={columns}
                    loading={loading}
                    emptyMessage="No units found"
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
                </div>
              </TabPanel>

              {/* Posts by Units Tab */}
              <TabPanel header="Posts by Units">
                <PostsByUnits />
              </TabPanel>

              {/* Organizational Hierarchy Tab */}
              <TabPanel header="Organisation Hierarchy">
                <HierarchyLayout embedded />
              </TabPanel>
            </TabView>
          </div>
        </div>

        {/* Kebab Menu for additional actions */}
        <Menu
          ref={menuRef}
          model={getMenuItems()}
          popup
          popupAlignment="right"
        />

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmDialog
          visible={deleteDialogOpen}
          onCancel={handleDeleteCancel}
          onDelete={handleDeleteConfirm}
          message="Are you sure you want to delete this unit? This action will mark the unit as deleted."
          testId="UnitsList.Dialog.Delete"
          loading={deleteLoading}
        />

        {/* Unit Details Dialog */}
        <Dialog
          visible={unitDialogVisible}
          onHide={handleUnitDialogClose}
          header={
            <div className="flex items-center justify-between w-full pr-8">
              {/* Left - Title */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                  <i className="pi pi-building text-white" style={{ fontSize: '1.25rem' }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {unitDialogDetails?.name || 'Unit Details'}
                  </h2>
                  {(unitDialogDetails as any)?.hierarchyLevel && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {typeof (unitDialogDetails as any).hierarchyLevel === 'object'
                        ? (unitDialogDetails as any).hierarchyLevel.name
                        : (unitDialogDetails as any).hierarchyLevel}
                    </span>
                  )}
                </div>
              </div>
              {/* Right - Stats */}
              {unitDialogDetails && (() => {
                const activePosts = unitDialogDetails.posts?.filter((post: any) => !post.isDelete) || [];
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
          style={{ width: '95vw', maxWidth: '1600px' }}
          modal
          className="unit-details-dialog"
          contentStyle={{ padding: '1.5rem', maxHeight: '85vh', overflow: 'auto' }}
        >
          {unitDialogLoading ? (
            <div className="flex items-center justify-center py-12">
              <i className="pi pi-spin pi-spinner text-2xl text-blue-500" />
            </div>
          ) : unitDialogDetails ? (
            <div>
              {/* Main Content - Posts and Hierarchy */}
              <div className="flex gap-0">
                {/* Left Side - Posts */}
                <div className="flex-1 pr-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                    <i className="pi pi-id-card text-blue-500" />
                    Posts List
                  </h3>
                  {unitDialogDetails?.posts && unitDialogDetails?.posts?.length > 0 ? (
                    <div className="space-y-1.5 max-h-[65vh] overflow-y-auto pr-2">
                      {unitDialogDetails?.posts
                        ?.filter((post: any) => !post?.isDelete)
                        ?.map((post: any, index: number) => {
                          // Extract user info at row level for hover functionality
                          const userId = typeof post?.assignedUser === 'object' ? post?.assignedUser?._id : null;
                          const userName = typeof post?.assignedUser === 'object' ? post?.assignedUser?.name : 'Assigned';
                          const pictureUrl = userId ? profilePictures.get(userId) : null;
                          const initial = userName?.charAt(0)?.toUpperCase() || 'U';

                          return (
                            <div
                              key={post?.postCode || index}
                              className="p-2 rounded-lg transition-all cursor-pointer"
                              style={{
                                border: '1.5px solid transparent',
                                backgroundImage: post.assignedUser
                                  ? 'linear-gradient(white, white), linear-gradient(135deg, #22c55e, #059669, #10b981)'
                                  : 'linear-gradient(white, white), linear-gradient(135deg, #f97316, #ea580c, #fb923c)',
                                backgroundOrigin: 'border-box',
                                backgroundClip: 'padding-box, border-box',
                              }}
                              onMouseEnter={(e) => {
                                if (pictureUrl) {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoverPreview({
                                    visible: true,
                                    imageUrl: pictureUrl,
                                    userName: userName,
                                    x: rect.right + 10,
                                    y: rect.top + rect.height / 2,
                                  });
                                }
                              }}
                              onMouseLeave={() => setHoverPreview(null)}
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
                                  {pictureUrl ? (
                                    <img
                                      src={pictureUrl}
                                      alt={userName}
                                      className="w-5 h-5 rounded-full object-cover border border-green-300"
                                    />
                                  ) : (
                                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center border border-green-300">
                                      <span className="text-green-700 font-semibold" style={{ fontSize: '10px' }}>{initial}</span>
                                    </div>
                                  )}
                                  <span className="text-green-700 dark:text-green-400 font-medium">
                                    {userName}
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
                          );
                        })}
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
                    // Build hierarchy path from parentUnit chain
                    const buildHierarchyPath = (unit: Unit): { id: string; name: string; level?: string }[] => {
                      const path: { id: string; name: string; level?: string }[] = [];
                      let current: any = unit;

                      // Traverse up the parent chain
                      while (current) {
                        path.unshift({
                          id: current._id,
                          name: current.name,
                          level: typeof current.hierarchyLevel === 'object'
                            ? current.hierarchyLevel?.name
                            : current.hierarchyLevel,
                        });
                        current = current.parentUnit;
                      }

                      return path;
                    };

                    const hierarchyPath = buildHierarchyPath(unitDialogDetails);

                    return hierarchyPath.length > 0 ? (
                      <div className="space-y-1 max-h-[450px] overflow-y-auto pr-2">
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
                                node.id === unitDialogDetails._id
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

        {/* Hover Preview Popup for Profile Pictures */}
        {hoverPreview?.visible && (
          <div
            style={{
              position: 'fixed',
              left: hoverPreview.x,
              top: hoverPreview.y,
              transform: 'translateY(-50%)',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 p-2">
              <img
                src={hoverPreview.imageUrl}
                alt={hoverPreview.userName}
                className="w-28 h-28 rounded-lg object-cover"
              />
              <p className="text-xs text-center mt-1.5 font-medium text-gray-700 dark:text-gray-300 max-w-28 truncate">
                {hoverPreview.userName}
              </p>
            </div>
          </div>
        )}

      </div>
    </PermissionGuard>
  );
};

export default UnitsList;
