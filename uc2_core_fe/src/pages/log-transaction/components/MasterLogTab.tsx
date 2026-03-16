import { useState, useEffect, useCallback, useMemo } from 'react';
import { Tag } from 'mainFe/Tag';
import { Tooltip } from 'mainFe/Tooltip';
import { DataTable } from 'mainFe/DataTable';
import type { DataTableColumn } from 'mainFe/DataTable';
import { Input } from 'mainFe/Input';
import { Dropdown } from 'mainFe/Dropdown';
import { ExportButton } from 'mainFe/ExportButton';
import { logMasterService } from '../../../services/log-master.service';
import { useDebounce } from '../../../hooks/useDebounce';
import MasterDetailDrawer from './MasterDetailDrawer';
import type { LogMaster, LogMasterQueryParams } from '../../../types';

const LAYER_OPTIONS = [
  { label: 'All Layers', value: '' },
  { label: 'API', value: 'API' },
  { label: 'Screen', value: 'screen' },
  { label: 'Server', value: 'Server' },
  { label: 'DB', value: 'db' },
  { label: 'Function', value: 'function' },
];

const getLevelSeverity = (level: string): 'info' | 'warning' | 'danger' | 'secondary' => {
  switch (level?.toUpperCase()) {
    case 'INFO': return 'info';
    case 'WARNING': case 'WARN': return 'warning';
    case 'ERROR': return 'danger';
    default: return 'secondary';
  }
};

const MasterLogTab = () => {
  const [selectedMaster, setSelectedMaster] = useState<LogMaster | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [data, setData] = useState<(LogMaster & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLayer, setSelectedLayer] = useState('');
  const [searchText, setSearchText] = useState('');
  const [first, setFirst] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  const debouncedSearch = useDebounce(searchText, 500);

  const fetchData = useCallback(async (page: number = 1, size: number = pageSize) => {
    try {
      setLoading(true);
      const response = await logMasterService.getAllPaginated({
        page,
        page_size: size,
        layer: selectedLayer || undefined,
        eventCode: debouncedSearch || undefined,
      });
      setData((response.items || []).map((item) => ({ ...item, id: item._id })));
      setTotalRecords(response.total || 0);
    } catch (err) {
      console.error('Failed to fetch log masters:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedLayer, debouncedSearch, pageSize]);

  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setPageSize(event.rows);
    fetchData(newPage, event.rows);
  };

  useEffect(() => {
    setFirst(0);
    fetchData(1, pageSize);
  }, [selectedLayer, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportColumns = useMemo(() => [
    { field: 'eventCode', header: 'Event Code' },
    { field: 'logObject', header: 'Log Object' },
    { field: 'action', header: 'Action' },
    { field: 'description', header: 'Description' },
    { field: 'layer', header: 'Layer' },
    { field: 'logLevel', header: 'Log Level' },
    { field: 'keyFields', header: 'Key Fields' },
  ], []);

  const fetchExportData = useCallback(async (): Promise<LogMaster[]> => {
    const params: Omit<LogMasterQueryParams, 'page' | 'page_size'> = {};
    if (selectedLayer) params.layer = selectedLayer;
    if (debouncedSearch?.trim()) params.eventCode = debouncedSearch.trim();
    return logMasterService.getAllForExport(params, pageSize);
  }, [selectedLayer, debouncedSearch, pageSize]);

  const columns: DataTableColumn<LogMaster & { id: string }>[] = useMemo(() => [
    {
      field: 'eventCode',
      header: 'Event Code',
      style: { minWidth: '280px' },
      body: (rowData: LogMaster) => (
        <div>
          <span className="font-mono text-xs text-gray-900 dark:text-white break-all">
            {rowData.eventCode || '-'}
          </span>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {rowData.logObject || '-'}
          </div>
        </div>
      ),
    },
    {
      field: 'action',
      header: 'Action',
      style: { width: '100px' },
      body: (rowData: LogMaster) => (
        <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">
          {rowData.action || '-'}
        </span>
      ),
    },
    {
      field: 'description',
      header: 'Description',
      sortable: false,
      style: { minWidth: '250px' },
      body: (rowData: LogMaster) => (
        <span
          className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1"
          data-pr-tooltip={rowData.description || undefined}
        >
          {rowData.description || '-'}
        </span>
      ),
    },
    {
      field: 'layer',
      header: 'Layer',
      style: { width: '80px' },
      body: (rowData: LogMaster) => (
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {rowData.layer || '-'}
        </span>
      ),
    },
    {
      field: 'logLevel',
      header: 'Level',
      style: { width: '90px' },
      body: (rowData: LogMaster) => (
        <Tag value={rowData.logLevel || 'INFO'} severity={getLevelSeverity(rowData.logLevel)} className="text-xs" />
      ),
    },
    {
      field: 'keyFields',
      header: 'Key Fields',
      style: { width: '120px' },
      body: (rowData: LogMaster) => (
        <span className="text-xs text-gray-700 dark:text-gray-300 font-mono">
          {rowData.keyFields || '-'}
        </span>
      ),
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      body: (rowData: LogMaster & { id: string }) => (
        <div className="flex justify-center">
          <button
            onClick={() => { setSelectedMaster(rowData); setDrawerOpen(true); }}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-medium"
          >
            View Details
          </button>
        </div>
      ),
      style: { width: '100px' },
    },
  ], []);

  return (
    <>
      <Tooltip target="[data-pr-tooltip]" />
      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 mb-2" style={{ padding: '0.625rem 0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Input
              name="search"
              placeholder="Search by event code..."
              value={searchText}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)}
              testId="MasterLogTab.Search"
              style={{ minWidth: '200px', width: '200px' }}
              clearable
            />
            <Dropdown
              value={selectedLayer}
              options={LAYER_OPTIONS}
              onChange={(e: { value: string }) => setSelectedLayer(e.value || '')}
              placeholder="All Layers"
              style={{ width: '160px' }}
              data-testid="MasterLogTab.Filter.Layer"
              resetFilterOnHide={true}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="text-xs text-gray-500">{totalRecords} {totalRecords === 1 ? 'record' : 'records'}</span>
            <ExportButton
              fetchData={fetchExportData}
              columns={exportColumns}
              filename="log-masters"
              testId="MasterLogTab.Button.Export"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700">
        <DataTable
          data={data}
          columns={columns}
          loading={loading}
          emptyMessage="No log masters found"
          dataKey="id"
          paginator
          lazy
          first={first}
          rows={pageSize}
          totalRecords={totalRecords}
          onPage={handlePageChange}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </div>

      <MasterDetailDrawer
        open={drawerOpen}
        master={selectedMaster}
        onClose={() => { setDrawerOpen(false); setSelectedMaster(null); }}
      />
    </>
  );
};

export default MasterLogTab;
