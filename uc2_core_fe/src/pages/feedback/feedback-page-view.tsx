/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dropdown } from 'mainFe/Dropdown';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { StatCard } from 'mainFe/StatCard';
import { Tag } from 'mainFe/Tag';
import { Calendar } from 'mainFe/Calendar';
import { Button } from 'mainFe/Button';
import { Toast } from 'mainFe/Toast';
import { Tooltip } from 'mainFe/Tooltip';
import { ExportDataButton } from 'mainFe/ExportDataButton';
import { formatTimestamp } from 'mainFe/dateUtils';
import { Sidebar } from 'primereact/sidebar';
import { Skeleton } from 'primereact/skeleton';
import { feedbackDashboardService } from '../../services/feedback-dashboard.service';
import { personnelLookupService } from '../../services/personnel-lookup.service';
import { valueSetsService } from '../../services/value-sets.service';
import { modulesService } from '../../services/modules.service';
import styles from './FeedbackPageView.module.css';


const FeedbackPageView = () => {
  // Date range state - default to current date
  const today = useMemo(() => new Date(), []);

  // Max date is today (disable future dates), no min date restriction
  const maxDate = today;

  // Maximum range allowed is 15 days
  const MAX_RANGE_DAYS = 15;

  // Default date range: current date (today)
  const [dateRange, setDateRange] = useState<Date[] | null>([new Date(), new Date()]);
  // Committed date range - only updates when both dates are selected
  const [committedDateRange, setCommittedDateRange] = useState<Date[] | null>([new Date(), new Date()]);
  // Calendar ref for programmatic control
  const calendarRef = useRef<any>(null);
  // Toast ref for notifications
  const toast = useRef<any>(null);

  // State for filters
  const [personnelId, setPersonnelId] = useState('');
  const [module, setModule] = useState('');
  const [sentiment, setSentiment] = useState('');
  const [isLive, setIsLive] = useState(false);

  // Pagination state
  const [first, setFirst] = useState(0);
  const [rows, setRows] = useState(5);

  // Sorting state for server-side sorting
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);

  // Drawer state for feedback details
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);

  // Format date to YYYY-MM-DD for API
  const formatDateForApi = (date: Date | null) => {
    if (!date) return undefined;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Check if committed date range is complete (both start and end dates selected)
  // This ensures API is only called when user has selected both dates
  const isDateRangeComplete = Boolean(committedDateRange && committedDateRange[0] && committedDateRange[1]);

  // Get start and end dates from committed date range - only when both dates are selected
  const startDate = isDateRangeComplete && committedDateRange ? formatDateForApi(committedDateRange[0]) : undefined;
  const endDate = isDateRangeComplete && committedDateRange ? formatDateForApi(committedDateRange[1]) : undefined;

  // Handle date range change - only commit when both dates are selected
  const handleDateRangeChange = (e: any) => {
    const newRange = e.value;

    // Only commit and close calendar when both dates are selected
    if (newRange && newRange[0] && newRange[1]) {
      const startDate = newRange[0] as Date;
      const endDate = newRange[1] as Date;

      // Calculate the difference in days
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // If range exceeds MAX_RANGE_DAYS, adjust the end date and show toast
      if (diffDays > MAX_RANGE_DAYS) {
        const adjustedEndDate = new Date(startDate);
        adjustedEndDate.setDate(startDate.getDate() + MAX_RANGE_DAYS);
        const adjustedRange = [startDate, adjustedEndDate];
        setDateRange(adjustedRange);
        setCommittedDateRange(adjustedRange);
        // Show warning toast for 2 seconds
        toast.current?.show({
          severity: 'warn',
          summary: 'Date Range Limited',
          detail: `Maximum date range is ${MAX_RANGE_DAYS} days. Range adjusted automatically.`,
          life: 2000,
        });
      } else {
        setDateRange(newRange);
        setCommittedDateRange(newRange);
      }

      // Close the calendar popup - try multiple methods for compatibility
      if (calendarRef.current) {
        if (typeof calendarRef.current.hide === 'function') {
          calendarRef.current.hide();
        } else if (typeof calendarRef.current.hideOverlay === 'function') {
          calendarRef.current.hideOverlay();
        } else if (calendarRef.current.overlayVisible !== undefined) {
          calendarRef.current.overlayVisible = false;
        }
      }
    } else {
      // First date selected, just update display state
      setDateRange(newRange);
    }
  };

  // Clear all filters and reset to default values
  const handleClearFilters = () => {
    const defaultDateRange: Date[] = [new Date(), new Date()];
    setDateRange(defaultDateRange);
    setCommittedDateRange(defaultDateRange);
    setPersonnelId('');
    setModule('');
    setSentiment('');
    setFirst(0);
  };

  // Fetch personnel list for dropdown
  const { data: personnelList = [] } = useQuery({
    queryKey: ['personnel-list'],
    queryFn: () => personnelLookupService.getAll(),
  });

  // Create personnel options for dropdown
  const personnelOptions = useMemo(() => {
    const options = [{ label: 'ALL', value: '' }];
    personnelList.forEach((person) => {
      options.push({
        label: person.name || person.userId,
        value: person._id,
      });
    });
    return options;
  }, [personnelList]);

  // Fetch component types for Sentiment dropdown
  const { data: componentTypeValueSet } = useQuery({
    queryKey: ['value-set', 'componentType'],
    queryFn: () => valueSetsService.getByKey('componentType', 'en'),
  });

  // Create sentiment options from value set
  const sentimentOptions = useMemo(() => {
    const options = [{ label: 'All', value: '' }];
    if (componentTypeValueSet?.items) {
      componentTypeValueSet.items.forEach((item: any) => {
        options.push({
          label: item.label || item.code,
          value: item.code,
        });
      });
    }
    return options;
  }, [componentTypeValueSet]);

  // Fetch modules for dropdown
  const { data: modulesList = [] } = useQuery({
    queryKey: ['modules-list'],
    queryFn: () => modulesService.getAllForDropdown(),
  });

  // Create module options from API response
  const moduleOptions = useMemo(() => {
    const options = [{ label: 'All Modules', value: '' }];
    modulesList.forEach((mod: any) => {
      options.push({
        label: mod.name || mod.moduleId,
        value: mod._id || mod.moduleId,
      });
    });
    return options;
  }, [modulesList]);

  // Fetch feedback dashboard data from API (auto-refresh every 30s when isLive is true)
  const {
    data: dashboardResponse,
    isLoading: dashboardLoading,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ['feedback-dashboard', startDate, endDate, personnelId, module, sentiment, first, rows, sortField, sortOrder],
    queryFn: () => feedbackDashboardService.getDashboardData({
      startDate,
      endDate,
      personnelId: personnelId || undefined,
      moduleId: module || undefined,
      componentType: sentiment?.toLowerCase() || undefined,
      page: Math.floor(first / rows) + 1,
      pageSize: rows,
      sort_by: sortField || undefined,
      sort_order: sortField ? (sortOrder === 1 ? 'asc' : 'desc') : undefined,
    }),
    enabled: isDateRangeComplete, // Only fetch when both start and end dates are selected
    refetchInterval: isLive ? 30000 : false, // Refresh every 30 seconds when live
  });

  // Extract stats from API response - check various paths
  const getStatsFromResponse = (response: any) => {
    if (!response) return null;

    // Path 1: response.data.stats
    if (response?.data?.stats) {
      return response.data.stats;
    }

    // Path 2: response.stats
    if (response?.stats) {
      return response.stats;
    }

    // Path 3: response.data.summary
    if (response?.data?.summary) {
      return response.data.summary;
    }

    // Path 4: response.summary
    if (response?.summary) {
      return response.summary;
    }

    // Path 5: response.data itself has count fields
    if (response?.data && typeof response.data === 'object') {
      return response.data;
    }

    return null;
  };

  // Get stats object from API response
  const stats = getStatsFromResponse(dashboardResponse);

  // Log for debugging
  console.log('API Response:', dashboardResponse);
  console.log('Extracted stats:', stats);

  // Helper function to format camelCase key to Title Case (first letter uppercase)
  const formatTitle = (key: string) => {
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
  };

  // Stats cards config array - custom layout with percentages inside count cards
  const statsCards = stats
    ? [
        // Total Feedback
        stats.totalFeedback > 0 && {
          title: 'Total Feedback',
          value: stats.totalFeedback?.toLocaleString() || '0',
          subtitle: undefined,
          variant: 'blue' as const,
          icon: <i className="pi pi-comments" />,
        },
        // Liked Count with Like Percentage inside
        stats.likedCount > 0 && {
          title: 'Liked Count',
          value: stats.likedCount?.toLocaleString() || '0',
          subtitle: stats.likePercentage ? `${stats.likePercentage.toFixed(1)}%` : undefined,
          variant: 'green' as const,
          icon: <i className="pi pi-thumbs-up" />,
        },
        // Disliked Count with Dislike Percentage inside
        stats.dislikedCount > 0 && {
          title: 'Disliked Count',
          value: stats.dislikedCount?.toLocaleString() || '0',
          subtitle: stats.dislikePercentage ? `${stats.dislikePercentage.toFixed(1)}%` : undefined,
          variant: 'red' as const,
          icon: <i className="pi pi-thumbs-down" />,
        },
        // Neutral Count
        stats.neutralCount > 0 && {
          title: 'Neutral Count',
          value: stats.neutralCount?.toLocaleString() || '0',
          subtitle: undefined,
          variant: 'orange' as const,
          icon: <i className="pi pi-minus-circle" />,
        },
        // Average Rating
        stats.averageRating > 0 && {
          title: 'Average Rating',
          value: stats.averageRating?.toFixed(2) || '0.00',
          subtitle: undefined,
          variant: 'purple' as const,
          icon: <i className="pi pi-star-fill" />,
        },
      ].filter(Boolean) as Array<{
        title: string;
        value: string;
        subtitle: string | undefined;
        variant: 'blue' | 'green' | 'red' | 'orange' | 'purple';
        icon: JSX.Element;
      }>
    : [];

  // Get statsByComponent from API response
  const getStatsByComponent = (response: any) => {
    if (!response) return [];
    return response?.data?.statsByComponent
      || response?.statsByComponent
      || [];
  };

  const statsByComponent = getStatsByComponent(dashboardResponse);

  // Find prompt and screen stats from statsByComponent (case-insensitive)
  const promptStats = statsByComponent.find((item: any) =>
    item.componentType?.toLowerCase() === 'prompt'
  ) || null;
  const screenStats = statsByComponent.find((item: any) =>
    item.componentType?.toLowerCase() === 'screen'
  ) || null;

  // Get trend data from API response (last 15 days)
  const getTrendFromResponse = (response: any): any[] => {
    if (!response) return [];
    const trend = response?.data?.trend || response?.trend || [];
    // Return only last 15 days of data
    return trend.slice(-15);
  };

  const trendData = getTrendFromResponse(dashboardResponse);

  // Get statsByModule from API response
  const getStatsByModuleFromResponse = (response: any): any[] => {
    if (!response) return [];
    return response?.data?.statsByModule
      || response?.statsByModule
      || [];
  };

  const statsByModule = getStatsByModuleFromResponse(dashboardResponse);

  // Get recentFeedback from API response
  const getRecentFeedbackFromResponse = (response: any): any[] => {
    if (!response) return [];
    return response?.data?.recentFeedback
      || response?.recentFeedback
      || [];
  };

  const recentFeedback = getRecentFeedbackFromResponse(dashboardResponse);

  // Get pagination info from API response
  const getPaginationFromResponse = (response: any) => {
    if (!response) return { totalItems: 0, totalPages: 0 };
    return response?.data?.pagination
      || response?.pagination
      || { totalItems: 0, totalPages: 0 };
  };

  const pagination = getPaginationFromResponse(dashboardResponse);

  // Calculate max trend value for chart scaling (use max of individual counts for better visualization)
  const maxTrendValue = trendData.length > 0
    ? Math.max(
        ...trendData.map((d: any) => Math.max(d.likedCount || 0, d.neutralCount || 0, d.dislikedCount || 0))
      )
    : 0;

  // Calculate total counts for legend display
  const totalLikedCount = trendData.reduce((sum: number, d: any) => sum + (d.likedCount || 0), 0);
  const totalNeutralCount = trendData.reduce((sum: number, d: any) => sum + (d.neutralCount || 0), 0);
  const totalDislikedCount = trendData.reduce((sum: number, d: any) => sum + (d.dislikedCount || 0), 0);

  // Format time from API response
  const formatTime = (dateString: string) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return dateString;
    }
  };

  // Get status severity for Tag component
  const getStatusSeverity = (status: string): 'success' | 'info' | 'warning' | 'danger' | 'secondary' => {
    const statusUpper = status?.toUpperCase() || '';
    switch (statusUpper) {
      case 'SUCCESS':
      case 'RESOLVED':
        return 'success';
      case 'IN PROGRESS':
      case 'PROCESSING':
        return 'info';
      case 'PENDING':
      case 'PLANNED':
        return 'warning';
      case 'FAILED':
      case 'ERROR':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  // DataTable columns - updated for API response structure with Tailwind styling
  const columns: DataTableColumn<any>[] = useMemo(
    () => [
      {
        field: 'createdAt',
        header: 'Timestamp',
        sortable: true,
        style: { width: '160px' },
        body: (rowData: any) => (
          <div className="py-3 pr-4">
            <span className="font-mono text-xs text-gray-900 dark:text-white">
              {rowData.createdAt ? formatTimestamp(rowData.createdAt) : formatTime(rowData.time)}
            </span>
          </div>
        ),
      },
      {
        field: 'personnel',
        header: 'User',
        sortable: true,
        style: { width: '180px' },
        body: (rowData: any) => {
          const personnel = rowData.personnel || {};
          return (
            <div className="flex flex-col py-3 pr-4">
              <span className="text-gray-900 dark:text-white text-xs font-medium">
                {personnel.name || personnel.userName || '-'}
              </span>
              <span className="text-gray-500 dark:text-gray-400 text-xs">
                {personnel.designation || personnel.department || ''}
              </span>
            </div>
          );
        },
      },
      {
        field: 'moduleName',
        header: 'Module',
        sortable: true,
        style: { width: '150px', textAlign: 'center' },
        headerStyle: { textAlign: 'center' },
        body: (rowData: any) => (
          <div className="py-3 text-center">
            <span className="text-gray-900 dark:text-white text-xs">
              {rowData.moduleName || rowData.module || '-'}
            </span>
          </div>
        ),
      },
      {
        field: 'isLiked',
        header: 'Rating',
        sortable: true,
        style: { width: '100px', textAlign: 'center' },
        headerStyle: { textAlign: 'center' },
        body: (rowData: any) => (
          <div className="py-3 text-center">
            <i
              className={`pi ${rowData.isLiked ? 'pi-thumbs-up text-green-600' : 'pi-thumbs-down text-red-500'}`}
              style={{ fontSize: '1rem' }}
            />
          </div>
        ),
      },
      {
        field: 'state',
        header: 'Status',
        sortable: true,
        style: { width: '130px' },
        body: (rowData: any) => {
          const status = rowData.state || rowData.status || 'PENDING';
          return (
            <div className="py-3 pr-4">
              <Tag
                value={status.toUpperCase()}
                severity={getStatusSeverity(status)}
              />
            </div>
          );
        },
      },
      {
        field: 'actions',
        header: 'Actions',
      headerStyle: { textAlign: 'center' },
        sortable: false,
        style: { width: '100px' },
        body: (rowData: any) => (
          <div className="py-3 flex justify-center">
            <button
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
              onClick={() => {
                setSelectedFeedback(rowData);
                setDrawerOpen(true);
              }}
            >
              <i className="pi pi-eye" style={{ fontSize: '1rem' }} />
            </button>
          </div>
        ),
      },
    ],
    [setSelectedFeedback, setDrawerOpen]
  );

  // Fetch blob for export
  const fetchExportBlob = useCallback(() => feedbackDashboardService.export(), []);

  // Handle page change
  const handlePageChange = (event: any) => {
    setFirst(event.first);
    setRows(event.rows);
  };

  // Handle sort change - server-side sorting
  const handleSort = (event: any) => {
    setSortField(event.sortField);
    setSortOrder(event.sortOrder as 1 | -1 | null);
    setFirst(0);
  };

  return (
    <div className={styles.container} data-testid="SCR-Feedback-Monitor">
      {/* Toast for notifications */}
      <Toast ref={toast} position="top-right" />

      {/* Header Section */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.titleRow}>
            <div className={styles.titleIcon}>
              <i className="pi pi-comments" />
            </div>
            <h1 className={styles.title}>Feedback Monitor</h1>
          </div>
          <p className={styles.subtitle}>
            User feedback, AI performance, and feature requests across all modules
          </p>
        </div>
        <div className={styles.headerRight}>
          <button
            onClick={() => setIsLive(!isLive)}
            className={`${styles.liveButton} ${isLive ? styles.liveButtonActive : styles.liveButtonInactive}`}
          >
            <i className={`pi pi-refresh ${isLive ? 'pi-spin' : ''}`} />
            Live
          </button>
        </div>
      </div>

      {/* Stats Cards Row - Horizontal Layout */}
      <div className={styles.statsGrid}>
        {dashboardLoading ? (
          // Shimmer loading state for stat cards - matching StatCard height
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                style={{ padding: '0.75rem 1rem', minHeight: '64px' }}
              >
                <div className="flex items-center gap-3 h-full">
                  <Skeleton shape="circle" size="2.5rem" />
                  <div className="flex-1 flex flex-col justify-center gap-2">
                    <Skeleton width="70%" height="0.75rem" />
                    <Skeleton width="50%" height="1.25rem" />
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          statsCards.map((card, index) => (
            <StatCard
              key={index}
              title={card.title}
              value={card.value}
              subtitle={card.subtitle}
              variant={card.variant}
              icon={card.icon}
              // @ts-ignore - horizontal prop added to StatCard
              horizontal
            />
          ))
        )}
      </div>

      {/* Category Cards Row - 2 cards from statsByComponent */}
      <div className={styles.categoryGrid}>
        {dashboardLoading ? (
          // Shimmer loading state for category cards - matching categoryCard styling
          <>
            {[1, 2].map((i) => (
              <div
                key={i}
                className={styles.categoryCard}
                style={{ minHeight: '98px' }}
              >
                <div className={styles.categoryLeft}>
                  <Skeleton shape="circle" size="3rem" className="flex-shrink-0" />
                  <div className={styles.categoryInfo}>
                    <Skeleton width="60px" height="0.8125rem" className="mb-1" />
                    <Skeleton width="50px" height="1.75rem" />
                  </div>
                </div>
                <div className={styles.categoryDivider} />
                <div className={styles.categoryStats}>
                  <div className={styles.categoryStat}>
                    <Skeleton width="80px" height="0.8125rem" />
                    <Skeleton width="30px" height="0.875rem" />
                  </div>
                  <div className={styles.categoryStat}>
                    <Skeleton width="90px" height="0.8125rem" />
                    <Skeleton width="30px" height="0.875rem" />
                  </div>
                  <div className={styles.categoryStat}>
                    <Skeleton width="85px" height="0.8125rem" />
                    <Skeleton width="40px" height="0.875rem" />
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            {/* Prompts */}
            <div className={`${styles.categoryCard} ${styles.categoryCardPurple}`}>
              <div className={styles.categoryLeft}>
                <div className={`${styles.categoryIcon} ${styles.categoryIconPurple}`}>
                  <i className="pi pi-bolt" />
                </div>
                <div className={styles.categoryInfo}>
                  <p className={styles.categoryLabel}>
                    {promptStats?.componentType ? formatTitle(promptStats.componentType) : 'Prompt'}
                  </p>
                  <p className={styles.categoryValue}>{promptStats?.totalFeedback ?? 0}</p>
                </div>
              </div>
              <div className={styles.categoryDivider} />
              <div className={styles.categoryStats}>
                <div className={styles.categoryStat}>
                  <span className={styles.categoryStatLabel}>Liked Count:</span>
                  <span className={styles.categoryStatValueGreen}>{promptStats?.likedCount ?? 0}</span>
                </div>
                <div className={styles.categoryStat}>
                  <span className={styles.categoryStatLabel}>Disliked Count:</span>
                  <span className={styles.categoryStatValueOrange}>{promptStats?.dislikedCount ?? 0}</span>
                </div>
                <div className={styles.categoryStat}>
                  <span className={styles.categoryStatLabel}>Average Rating:</span>
                  <span className={styles.categoryStatValueBlue}>{promptStats?.averageRating?.toFixed(2) ?? '0.00'}</span>
                </div>
              </div>
            </div>

            {/* Screen */}
            <div className={`${styles.categoryCard} ${styles.categoryCardBlue}`}>
              <div className={styles.categoryLeft}>
                <div className={`${styles.categoryIcon} ${styles.categoryIconBlue}`}>
                  <i className="pi pi-desktop" />
                </div>
                <div className={styles.categoryInfo}>
                  <p className={styles.categoryLabel}>
                    {screenStats?.componentType ? formatTitle(screenStats.componentType) : 'Screen'}
                  </p>
                  <p className={styles.categoryValue}>{screenStats?.totalFeedback ?? 0}</p>
                </div>
              </div>
              <div className={styles.categoryDivider} />
              <div className={styles.categoryStats}>
                <div className={styles.categoryStat}>
                  <span className={styles.categoryStatLabel}>Liked Count:</span>
                  <span className={styles.categoryStatValueGreen}>{screenStats?.likedCount ?? 0}</span>
                </div>
                <div className={styles.categoryStat}>
                  <span className={styles.categoryStatLabel}>Disliked Count:</span>
                  <span className={styles.categoryStatValueOrange}>{screenStats?.dislikedCount ?? 0}</span>
                </div>
                <div className={styles.categoryStat}>
                  <span className={styles.categoryStatLabel}>Average Rating:</span>
                  <span className={styles.categoryStatValueBlue}>{screenStats?.averageRating?.toFixed(2) ?? '0.00'}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filters Section */}
      <Tooltip target="[data-pr-tooltip]" />
      <div className={styles.filtersCard}>
        <div className={styles.filtersGrid}>
          <div className={styles.filterField}>
            <label className={styles.filterLabel}>Date Range</label>
            <Calendar
              ref={calendarRef}
              value={dateRange}
              onChange={handleDateRangeChange}
              selectionMode="range"
              maxDate={maxDate}
              readOnlyInput
              showIcon
              dateFormat="dd/mm/yy"
              placeholder="Select Date Range"
              hideOnRangeSelection
              data-testid="Feedback.Filter.DateRange"
            />
          </div>

          <div className={styles.filterField}>
            <label className={styles.filterLabel}>Personnel ID</label>
            <Dropdown
              value={personnelId}
              options={personnelOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e: { value: string }) => setPersonnelId(e.value)}
              placeholder="ALL"
              filter
              filterPlaceholder="Search personnel..."
              data-testid="Feedback.Filter.PersonnelId"
              resetFilterOnHide={true}
            />
          </div>

          <div className={styles.filterField}>
            <label className={styles.filterLabel}>Module</label>
            <Dropdown
              value={module}
              options={moduleOptions}
              optionLabel="label"
              optionValue="value"
              onChange={(e: { value: string }) => setModule(e.value)}
              placeholder="All Modules"
              data-testid="Feedback.Filter.Module"
              resetFilterOnHide={true}
            />
          </div>

          <div className={styles.filterField}>
            <label className={styles.filterLabel}>Component Type</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Dropdown
                value={sentiment}
                options={sentimentOptions}
                optionLabel="label"
                optionValue="value"
                onChange={(e: { value: string }) => setSentiment(e.value)}
                placeholder="All"
                data-testid="Feedback.Filter.ComponentType"
                resetFilterOnHide={true}
              />
              <button
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={handleClearFilters}
                data-testid="Feedback.Button.ClearFilters"
                data-pr-tooltip="Clear Filters"
              >
                <i className="pi pi-filter-slash text-gray-600 dark:text-gray-400" style={{ fontSize: '1.125rem' }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className={styles.chartsGrid}>
        {/* Feedback Trend Chart */}
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Feedback Trend</h3>
          {dashboardLoading ? (
            // Shimmer loading for trend chart
            <>
              <div className={styles.trendChart}>
                {[...Array(15)].map((_, idx) => (
                  <div key={idx} className={styles.trendBar}>
                    <Skeleton width="100%" height={`${Math.random() * 60 + 20}px`} />
                  </div>
                ))}
              </div>
              <div className={styles.trendLegend}>
                <div className={styles.legendItem}>
                  <Skeleton shape="circle" size="8px" />
                  <Skeleton width="60px" height="0.6875rem" />
                </div>
                <div className={styles.legendItem}>
                  <Skeleton shape="circle" size="8px" />
                  <Skeleton width="70px" height="0.6875rem" />
                </div>
                <div className={styles.legendItem}>
                  <Skeleton shape="circle" size="8px" />
                  <Skeleton width="65px" height="0.6875rem" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.trendChart}>
                {trendData.length > 0 ? (
                  trendData.map((point: any, idx: number) => {
                    const minBarHeight = 10;
                    const maxBarHeight = 120;
                    const likedCount = point.likedCount || 0;
                    const neutralCount = point.neutralCount || 0;
                    const dislikedCount = point.dislikedCount || 0;
                    const totalFeedback = likedCount + neutralCount + dislikedCount;
                    const hasData = totalFeedback > 0;

                    // Calculate bar heights - scale to max 120px
                    const likedHeight = maxTrendValue > 0 && likedCount > 0
                      ? Math.min(Math.max(minBarHeight, (likedCount / maxTrendValue) * maxBarHeight), maxBarHeight)
                      : 0;
                    const neutralHeight = maxTrendValue > 0 && neutralCount > 0
                      ? Math.min(Math.max(minBarHeight, (neutralCount / maxTrendValue) * maxBarHeight), maxBarHeight)
                      : 0;
                    const dislikedHeight = maxTrendValue > 0 && dislikedCount > 0
                      ? Math.min(Math.max(minBarHeight, (dislikedCount / maxTrendValue) * maxBarHeight), maxBarHeight)
                      : 0;

                    // Format date for display (day of month)
                    const dateLabel = point.date ? new Date(point.date).getDate().toString() : '';

                    return (
                      <div
                        key={idx}
                        className={styles.trendBar}
                      >
                        {/* Bars container */}
                        <div className={styles.trendBarsGroup}>
                          {hasData ? (
                            <>
                              <div className={styles.trendBarWrapper}>
                                {likedCount > 0 && <span className={styles.barCount}>{likedCount}</span>}
                                <div
                                  className={styles.trendBarPositive}
                                  style={{ height: `${likedHeight}px` }}
                                  title={`${point.date} | Liked: ${likedCount}`}
                                />
                              </div>
                              <div className={styles.trendBarWrapper}>
                                {neutralCount > 0 && <span className={styles.barCount}>{neutralCount}</span>}
                                <div
                                  className={styles.trendBarNeutral}
                                  style={{ height: `${neutralHeight}px` }}
                                  title={`${point.date} | Neutral: ${neutralCount}`}
                                />
                              </div>
                              <div className={styles.trendBarWrapper}>
                                {dislikedCount > 0 && <span className={styles.barCount}>{dislikedCount}</span>}
                                <div
                                  className={styles.trendBarNegative}
                                  style={{ height: `${dislikedHeight}px` }}
                                  title={`${point.date} | Disliked: ${dislikedCount}`}
                                />
                              </div>
                            </>
                          ) : (
                            <div
                              className={styles.trendBarEmpty}
                              title={`${point.date} | No activity`}
                            />
                          )}
                        </div>
                        {/* Date label */}
                        <span className={styles.trendDateLabel}>{dateLabel}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.noData}>No trend data available</div>
                )}
              </div>
              <div className={styles.trendLegend}>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendDotGreen}`} />
                  <span>Liked: {totalLikedCount}</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendDotYellow}`} />
                  <span>Neutral: {totalNeutralCount}</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendDotRed}`} />
                  <span>Disliked: {totalDislikedCount}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Feedback by Module */}
        <div className={styles.chartCard}>
          <h3 className={styles.chartTitle}>Feedback by Module</h3>
          {dashboardLoading ? (
            // Shimmer loading for module stats
            <div className={styles.moduleStats}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.moduleItem}>
                  <div className={styles.moduleHeader}>
                    <Skeleton width="120px" height="0.75rem" />
                    <Skeleton width="70px" height="0.75rem" />
                  </div>
                  <div className={styles.moduleBar}>
                    <Skeleton width={`${Math.random() * 50 + 30}%`} height="6px" borderRadius="3px" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.moduleStats}>
              {statsByModule.length > 0 ? (
                statsByModule.map((mod: any, idx: number) => {
                  const maxCount = Math.max(...statsByModule.map((m: any) => m.totalFeedback || 0));
                  const widthPercent = maxCount > 0 ? ((mod.totalFeedback || 0) / maxCount) * 100 : 0;
                  return (
                    <div key={idx} className={styles.moduleItem}>
                      <div className={styles.moduleHeader}>
                        <span className={styles.moduleName}>{mod.moduleName || mod.moduleId}</span>
                        <span className={styles.moduleCount}>{mod.totalFeedback || 0} feedback</span>
                      </div>
                      <div className={styles.moduleBar}>
                        <div
                          className={styles.moduleBarFill}
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={styles.noData}>No module data available</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent Feedback Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>Recent Feedback</h3>
          <div className="flex items-center gap-2">
            <div className={styles.liveIndicator}>
              <span className={styles.liveDot} />
              <span>Live updates</span>
            </div>
            <ExportDataButton
              fetchBlob={fetchExportBlob}
              filename="feedback-data-export.xlsx"
              testId="Feedback.Button.Export"
            />
          </div>
        </div>
        <DataTable
          data={recentFeedback}
          columns={columns}
          loading={dashboardLoading}
          dataKey="id"
          emptyMessage="No feedback found"
          paginator
          first={first}
          rows={rows}
          totalRecords={pagination.totalItems || recentFeedback.length}
          onPage={handlePageChange}
          rowsPerPageOptions={[5, 10, 25, 50]}
          lazy
          sortField={sortField || undefined}
          sortOrder={sortOrder || undefined}
          onSort={handleSort}
          removableSort
        />
        <div className={styles.tableFooter}>
          Showing {first + 1} to {Math.min(first + rows, pagination.totalItems || recentFeedback.length)} of {(pagination.totalItems || recentFeedback.length).toLocaleString()} feedback items
        </div>
      </div>

      {/* Feedback Detail Sidebar */}
      <Sidebar
        visible={drawerOpen}
        onHide={() => {
          setDrawerOpen(false);
          setSelectedFeedback(null);
        }}
        position="right"
        style={{ width: '500px' }}
        header={
          <div className="flex items-center gap-3 px-4 py-3">
            <i className="pi pi-comments text-blue-600" style={{ fontSize: '1.25rem' }} />
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              Feedback Details
            </span>
          </div>
        }
      >
        {selectedFeedback && (
          <div className="flex flex-col h-full p-6" style={{ fontSize: '14px' }}>
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Rating */}
              <div className="bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg p-5">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${selectedFeedback.isLiked ? 'bg-green-100' : 'bg-red-100'}`}>
                    <i
                      className={`pi ${selectedFeedback.isLiked ? 'pi-thumbs-up text-green-600' : 'pi-thumbs-down text-red-500'}`}
                      style={{ fontSize: '1.25rem' }}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Rating</p>
                    <p className={`text-base font-semibold ${selectedFeedback.isLiked ? 'text-green-600' : 'text-red-500'}`}>
                      {selectedFeedback.isLiked ? 'Liked' : 'Disliked'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Basic Info */}
              <div className="bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-4 flex items-center gap-2">
                  <i className="pi pi-info-circle text-blue-600" style={{ fontSize: '1rem' }} />
                  Basic Information
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-blue-100 dark:border-gray-700">
                    <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">ID</span>
                    <span className="text-sm font-mono text-gray-900 dark:text-white">{selectedFeedback._id || selectedFeedback.id || '-'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-blue-100 dark:border-gray-700">
                    <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Created At</span>
                    <span className="text-sm text-gray-900 dark:text-white font-mono">
                      {selectedFeedback.createdAt ? formatTimestamp(selectedFeedback.createdAt) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-blue-100 dark:border-gray-700">
                    <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Module</span>
                    <span className="text-sm text-teal-700 dark:text-teal-400 font-medium">{selectedFeedback.moduleName || selectedFeedback.module || '-'}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-blue-100 dark:border-gray-700">
                    <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Component Type</span>
                    <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">{selectedFeedback.componentType || '-'}</span>
                  </div>
                  <div className="flex justify-between py-2 items-center">
                    <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Status</span>
                    <Tag
                      value={(selectedFeedback.state || selectedFeedback.status || 'PENDING').toUpperCase()}
                      severity={getStatusSeverity(selectedFeedback.state || selectedFeedback.status || 'PENDING')}
                    />
                  </div>
                </div>
              </div>

              {/* Personnel Info */}
              {selectedFeedback.personnel && (
                <div className="bg-purple-50 dark:bg-gray-800 border border-purple-200 dark:border-gray-700 rounded-lg p-5">
                  <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-4 flex items-center gap-2">
                    <i className="pi pi-user text-purple-600" style={{ fontSize: '1rem' }} />
                    User Information
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-purple-100 dark:border-gray-700">
                      <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Name</span>
                      <span className="text-sm text-gray-900 dark:text-white font-medium">
                        {selectedFeedback.personnel.name || selectedFeedback.personnel.userName || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-purple-100 dark:border-gray-700">
                      <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">User ID</span>
                      <span className="text-sm font-mono text-blue-600 dark:text-blue-400">
                        {selectedFeedback.personnel.userId || selectedFeedback.personnel._id || '-'}
                      </span>
                    </div>
                    {selectedFeedback.personnel.designation && (
                      <div className="flex justify-between py-2 border-b border-purple-100 dark:border-gray-700">
                        <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Designation</span>
                        <span className="text-sm text-gray-900 dark:text-white">{selectedFeedback.personnel.designation}</span>
                      </div>
                    )}
                    {selectedFeedback.personnel.department && (
                      <div className="flex justify-between py-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Department</span>
                        <span className="text-sm text-gray-900 dark:text-white">{selectedFeedback.personnel.department}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Comment */}
              {selectedFeedback.comment && (
                <div className="bg-amber-50 dark:bg-gray-800 border border-amber-200 dark:border-gray-700 rounded-lg p-5">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
                    <i className="pi pi-comment text-amber-600" style={{ fontSize: '1rem' }} />
                    Comment
                  </h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 p-4 rounded-lg border border-amber-100 dark:border-gray-600 leading-relaxed">
                    {selectedFeedback.comment}
                  </p>
                </div>
              )}

              {/* Raw Data */}
              <div className="bg-slate-100 dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <i className="pi pi-code text-indigo-600" style={{ fontSize: '1rem' }} />
                  Raw Data
                </h4>
                <div className="bg-gray-900 text-emerald-400 p-4 rounded-lg font-mono text-xs overflow-x-auto max-h-64">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(selectedFeedback, null, 2)}</pre>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-5 mt-5 flex gap-3">
              <Button
                label="Close"
                severity="secondary"
                outlined
                onClick={() => {
                  setDrawerOpen(false);
                  setSelectedFeedback(null);
                }}
                testId="FeedbackDetail.Button.Close"
              />
            </div>
          </div>
        )}
      </Sidebar>
    </div>
  );
};

export default FeedbackPageView;
