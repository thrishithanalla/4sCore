import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Toast } from 'mainFe/Toast';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { RefreshButton } from 'mainFe/RefreshButton';
import { DataTable } from 'mainFe/DataTable';
import { unitsService } from '../../services/units.service';
import { masterService } from '../../services/master.service';
import { useDebounce } from '../../hooks/useDebounce';
import { extractErrorMessage } from '../../utils/error-handler';
import styles from './posts-by-units.module.css';

// Post type from unit response
interface UnitPost {
  postCode: string;
  postName: string;
  isUnitHead: boolean;
  reportsToPost?: {
    unitId?: string | null;
    postName?: string | null;
    unitName?: string | null;
  } | null;
  assignedRoles: Array<{
    _id: string;
    roleName: string;
    roleShortCode?: string;
  }>;
  assignedUser?: {
    _id: string;
    name: string;
    employeeId?: string | null;
  } | null;
  description?: string | null;
  isActive: boolean;
  isDelete: boolean;
}

const PostsByUnits = () => {
  const toast = useRef<Toast>(null);

  // State
  const [posts, setPosts] = useState<UnitPost[]>([]);
  const [selectedUnitName, setSelectedUnitName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  // Units dropdown options - fetched when component mounts (tab is opened)
  const [unitsDropdownOptions, setUnitsDropdownOptions] = useState<{ _id: string; name: string }[]>([]);
  const [unitsDropdownLoading, setUnitsDropdownLoading] = useState(false);

  // Fetch units for dropdown when component mounts
  useEffect(() => {
    const fetchUnitsDropdown = async () => {
      try {
        setUnitsDropdownLoading(true);
        const unitsData = await masterService.getUnitsForDropdown();
        setUnitsDropdownOptions(unitsData);
      } catch (error) {
        console.error('Failed to fetch units for dropdown:', error);
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load units dropdown',
          life: 5000,
        });
      } finally {
        setUnitsDropdownLoading(false);
      }
    };
    fetchUnitsDropdown();
  }, []);

  // View mode: 'list' or 'card'
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  const debouncedSearchText = useDebounce(searchText, 500);

  // Fetch posts for selected unit
  const fetchUnitPosts = useCallback(async (unitId: string) => {
    if (!unitId) {
      setPosts([]);
      setSelectedUnitName('');
      return;
    }

    try {
      setLoading(true);
      const unit = await unitsService.getUnitHierarchy(unitId);

      // Extract posts from unit, filter out deleted posts
      const unitPosts = (unit.posts || []).filter((p: any) => !p.isDelete) as UnitPost[];
      setPosts(unitPosts);
      setSelectedUnitName(unit.name || '');
    } catch (error: any) {
      console.error('Failed to fetch unit posts:', error);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: extractErrorMessage(error, 'Failed to load unit posts. Please try again.'),
        life: 10000,
      });
      setPosts([]);
      setSelectedUnitName('');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle unit selection change
  const handleUnitChange = (e: any) => {
    const unitId = e.value || '';
    setSelectedUnitId(unitId);
    if (unitId) {
      fetchUnitPosts(unitId);
    } else {
      setPosts([]);
      setSelectedUnitName('');
    }
  };

  // Filter posts based on search text
  const filteredData = useMemo(() => {
    if (!debouncedSearchText?.trim()) return posts;
    const searchLower = debouncedSearchText.toLowerCase();
    return posts.filter(post =>
      post.postCode?.toLowerCase().includes(searchLower) ||
      post.postName?.toLowerCase().includes(searchLower) ||
      post.assignedUser?.name?.toLowerCase().includes(searchLower) ||
      post.assignedRoles?.some(r => r.roleName?.toLowerCase().includes(searchLower))
    );
  }, [posts, debouncedSearchText]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredData.length;
    const assigned = filteredData.filter(p => p.assignedUser).length;
    const vacant = total - assigned;
    const unitHeads = filteredData.filter(p => p.isUnitHead).length;
    return { total, assigned, vacant, unitHeads };
  }, [filteredData]);

  // Table columns for list view
  const columns = useMemo(() => [
    {
      field: 'postName',
      header: 'Post Name',
      sortable: true,
      body: (rowData: UnitPost) => (
        <div className={styles.tablePostName}>
          <span>{rowData.postName}</span>
          {rowData.isUnitHead && (
            <span className={styles.tableUnitHeadBadge}>
              <i className="pi pi-star-fill" />
              Unit Head
            </span>
          )}
        </div>
      ),
    },
    {
      field: 'assignedRoles',
      header: 'Role',
      sortable: false,
      body: (rowData: UnitPost) => (
        rowData.assignedRoles?.length > 0
          ? rowData.assignedRoles.map(r => r.roleName).join(', ')
          : '-'
      ),
    },
    {
      field: 'assignedUser',
      header: 'Assigned User',
      sortable: false,
      body: (rowData: UnitPost) => (
        rowData.assignedUser ? (
          <div className={styles.tableAssignedUser}>
            <div className={styles.tableUserAvatar}>
              <i className="pi pi-user" />
            </div>
            <div className={styles.tableUserInfo}>
              <span className={styles.tableUserName}>{rowData.assignedUser.name}</span>
              {rowData.assignedUser.employeeId && (
                <span className={styles.tableUserEmpId}>{rowData.assignedUser.employeeId}</span>
              )}
            </div>
          </div>
        ) : (
          <span className={styles.tableVacant}>
            <i className="pi pi-user-minus" />
            Vacant
          </span>
        )
      ),
    },
    {
      field: 'reportsToPost',
      header: 'Reports To',
      sortable: false,
      body: (rowData: UnitPost) => rowData.reportsToPost?.postName || '-',
    },
    {
      field: 'isActive',
      header: 'Status',
      sortable: true,
      style: { width: '100px', minWidth: '100px', maxWidth: '100px' },
      body: (rowData: UnitPost) => (
        <span style={{ color: rowData.isActive ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
          {rowData.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ], []);

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <div className={styles.tabContent}>
        {/* Filter / Control Bar */}
        <div className={styles.filterBar}>
          <div className={styles.filterBarContent}>
            {/* Left side - Filters */}
            <div className={styles.filterGroup}>
              <Dropdown
                value={selectedUnitId || null}
                options={unitsDropdownOptions.map(u => ({ label: u.name, value: u._id }))}
                onChange={handleUnitChange}
                placeholder={unitsDropdownLoading ? "Loading units..." : "Select Unit"}
                showClear
                filter
                filterPlaceholder="Search units..."
                style={{ minWidth: '280px', width: '280px' }}
                scrollHeight="250px"
                disabled={unitsDropdownLoading}
                data-testid="PostsByUnits.Filter.Unit"
              />

              {selectedUnitId && (
                <Input
                  name="unitSearch"
                  placeholder="Search By Post Name..."
                  value={searchText}
                  onChange={(value: any) => setSearchText(value)}
                  testId="PostsByUnits.Search"
                  style={{ minWidth: '200px', width: '200px' }}
                  clearable
                />
              )}
            </div>

            {/* Right side - View Toggle & Refresh */}
            <div className={styles.filterActions}>
              {selectedUnitId && (
                <>
                  {/* View Mode Toggle */}
                  <div className={styles.viewToggle}>
                    <button
                      className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
                      onClick={() => setViewMode('list')}
                      data-testid="PostsByUnits.ViewMode.List"
                      title="List View"
                    >
                      <i className="pi pi-list" />
                    </button>
                    <button
                      className={`${styles.viewToggleBtn} ${viewMode === 'card' ? styles.viewToggleActive : ''}`}
                      onClick={() => setViewMode('card')}
                      data-testid="PostsByUnits.ViewMode.Card"
                      title="Card View"
                    >
                      <i className="pi pi-th-large" />
                    </button>
                  </div>

                  <RefreshButton
                    onClick={() => fetchUnitPosts(selectedUnitId)}
                    loading={loading}
                    testId="PostsByUnits.Button.Refresh"
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        {!selectedUnitId ? (
          /* Empty State */
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>
              <i className="pi pi-building" />
            </div>
            <h3 className={styles.emptyStateTitle}>Select a Unit</h3>
            <p className={styles.emptyStateText}>
              Choose a unit from the dropdown above to view its posts and personnel assignments.
            </p>
          </div>
        ) : loading ? (
          /* Loading State */
          <div className={styles.loadingState}>
            <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem', color: '#3b82f6' }} />
            <span>Loading posts...</span>
          </div>
        ) : (
          /* Posts Content */
          <div className={styles.postsContent}>
            {/* Unit Header with Stats */}
            <div className={styles.unitHeader}>
              <div className={styles.unitInfo}>
                <div className={styles.unitIcon}>
                  <i className="pi pi-building" />
                </div>
                <div>
                  <h2 className={styles.unitName}>{selectedUnitName}</h2>
                  <span className={styles.unitSubtitle}>{stats.total} {stats.total === 1 ? 'Post' : 'Posts'}</span>
                </div>
              </div>

              {/* Stats Cards */}
              <div className={styles.statsContainer}>
                <div className={`${styles.statCard} ${styles.statTotal}`}>
                  <div className={styles.statIcon}>
                    <i className="pi pi-id-card" />
                  </div>
                  <div className={styles.statInfo}>
                    <span className={styles.statValue}>{stats.total}</span>
                    <span className={styles.statLabel}>Total</span>
                  </div>
                </div>

                <div className={`${styles.statCard} ${styles.statAssigned}`}>
                  <div className={styles.statIcon}>
                    <i className="pi pi-user-plus" />
                  </div>
                  <div className={styles.statInfo}>
                    <span className={styles.statValue}>{stats.assigned}</span>
                    <span className={styles.statLabel}>Assigned</span>
                  </div>
                </div>

                <div className={`${styles.statCard} ${styles.statVacant}`}>
                  <div className={styles.statIcon}>
                    <i className="pi pi-user-minus" />
                  </div>
                  <div className={styles.statInfo}>
                    <span className={styles.statValue}>{stats.vacant}</span>
                    <span className={styles.statLabel}>Vacant</span>
                  </div>
                </div>

                {stats.unitHeads > 0 && (
                  <div className={`${styles.statCard} ${styles.statHead}`}>
                    <div className={styles.statIcon}>
                      <i className="pi pi-star" />
                    </div>
                    <div className={styles.statInfo}>
                      <span className={styles.statValue}>{stats.unitHeads}</span>
                      <span className={styles.statLabel}>Unit Head</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Posts Content - List or Card View */}
            {filteredData.length === 0 ? (
              <div className={styles.noResults}>
                <i className="pi pi-search" />
                <span>No posts found matching your search.</span>
              </div>
            ) : viewMode === 'list' ? (
              /* List View - DataTable */
              <div className={styles.tableContainer}>
                <DataTable
                  data={filteredData}
                  columns={columns}
                  loading={false}
                  emptyMessage="No posts found"
                  dataKey="postCode"
                  paginator={filteredData.length > 10}
                  rows={10}
                  rowsPerPageOptions={[5, 10, 25, 50]}
                  rowClassName={(data: UnitPost) => {
                    if (data.isUnitHead) return styles.tableRowHead;
                    if (!data.assignedUser) return styles.tableRowVacant;
                    return '';
                  }}
                />
              </div>
            ) : (
              /* Card View - Grid */
              <div className={styles.postsGrid}>
                {filteredData.map((post, index) => (
                  <div
                    key={post.postCode || index}
                    className={`${styles.postCard} ${post.isUnitHead ? styles.postCardHead : ''} ${!post.assignedUser ? styles.postCardVacant : ''}`}
                  >
                    {/* Card Header */}
                    <div className={styles.postCardHeader}>
                      <div className={styles.postCardTitle}>
                        <h3 className={styles.postName}>{post.postName}</h3>
                        {post.isUnitHead && (
                          <span className={styles.unitHeadBadge}>
                            <i className="pi pi-star-fill" />
                            Unit Head
                          </span>
                        )}
                      </div>
                      <span className={`${styles.statusBadge} ${post.isActive ? styles.statusActive : styles.statusInactive}`}>
                        {post.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Rank/Role */}
                    {post.assignedRoles?.length > 0 && (
                      <div className={styles.postRole}>
                        <i className="pi pi-briefcase" />
                        <span>{post.assignedRoles.map(r => r.roleName).join(', ')}</span>
                      </div>
                    )}

                    {/* Assigned User or Vacant */}
                    <div className={styles.postAssignment}>
                      {post.assignedUser ? (
                        <div className={styles.assignedUser}>
                          <div className={styles.userAvatar}>
                            <i className="pi pi-user" />
                          </div>
                          <div className={styles.userInfo}>
                            <span className={styles.userName}>{post.assignedUser.name}</span>
                            {post.assignedUser.employeeId && (
                              <span className={styles.userEmpId}>{post.assignedUser.employeeId}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={styles.vacantPost}>
                          <div className={styles.vacantIcon}>
                            <i className="pi pi-user-minus" />
                          </div>
                          <span className={styles.vacantText}>Vacant Position</span>
                        </div>
                      )}
                    </div>

                    {/* Reports To */}
                    {post.reportsToPost?.postName && (
                      <div className={styles.reportsTo}>
                        <i className="pi pi-arrow-up" />
                        <span>Reports to: <strong>{post.reportsToPost.postName}</strong></span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default PostsByUnits;
