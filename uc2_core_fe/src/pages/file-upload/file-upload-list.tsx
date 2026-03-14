/**
 * File Upload List Page
 * Displays all uploaded files with search, filter, and management capabilities
 */

import { useState, useRef, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { InputText } from 'primereact/inputtext';
import { Toast } from 'primereact/toast';
import { Skeleton } from 'primereact/skeleton';
import { Tag } from 'primereact/tag';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Dialog } from 'primereact/dialog';
import { Calendar } from 'primereact/calendar';
import { Button } from 'mainFe/Button';
import { Dropdown } from 'mainFe/Dropdown';
import { DataTable } from 'mainFe/DataTable';
import { fileUploadService } from '../../services/file-upload.service';
import { districtsService } from '../../services/districts.service';
import type { FileUpload, FileUploadSearchParams, FileStatus } from '../../types/file-upload.types';
import type { District } from '../../types';

const FileUploadList = () => {
  const toast = useRef<Toast>(null);
  const [filters, setFilters] = useState<FileUploadSearchParams>({
    page: 1,
    page_size: 5,
  });
  const [first, setFirst] = useState(0);
  const [selectedFile, setSelectedFile] = useState<FileUpload | null>(null);
  const [previewDialogVisible, setPreviewDialogVisible] = useState(false);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(true);

  // Fetch districts on mount
  useEffect(() => {
    const fetchDistricts = async () => {
      try {
        setLoadingDistricts(true);
        const data = await districtsService.getAllForDropdown();
        setDistricts(data || []);
        // Set default district if available
        if (data && data.length > 0 && !filters.district) {
          setFilters((prev) => ({
            ...prev,
            district: data[0]._id,
          }));
        }
      } catch (err) {
        console.error('Failed to fetch districts:', err);
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load districts',
          life: 10000,
        });
      } finally {
        setLoadingDistricts(false);
      }
    };
    fetchDistricts();
  }, []);

  // Fetch files - only when district is selected
  const {
    data: filesResponse,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['files', filters],
    queryFn: () => {
      // API expects district ID
      return fileUploadService.search(filters);
    },
    enabled: !!filters.district && districts.length > 0, // Only fetch when district is selected and districts are loaded
  });

  // District options for dropdown
  const districtOptions = useMemo(() => {
    return districts.map((d) => ({
      label: d.name,
      value: d._id,
    }));
  }, [districts]);

  // Filter options
  const categoryOptions = [
    { label: 'All Categories', value: '' },
    { label: 'Document', value: 'document' },
    { label: 'Image', value: 'image' },
    { label: 'Video', value: 'video' },
    { label: 'Audio', value: 'audio' },
    { label: 'Other', value: 'other' },
  ];

  const statusOptions = [
    { label: 'All Status', value: '' },
    { label: 'Pending', value: 'pending' },
    { label: 'Processing', value: 'processing' },
    { label: 'Completed', value: 'completed' },
    { label: 'Failed', value: 'failed' },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleFilterChange = (key: keyof FileUploadSearchParams, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      page: 1,
    }));
    setFirst(0);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePageChange = (event: any) => {
    const newPage = Math.floor(event.first / event.rows) + 1;
    setFirst(event.first);
    setFilters((prev) => ({
      ...prev,
      page: newPage,
      page_size: event.rows,
    }));
  };

  const handlePreview = (file: FileUpload) => {
    setSelectedFile(file);
    setPreviewDialogVisible(true);
  };

  const handleDownload = async (file: FileUpload) => {
    try {
      const blob = await fileUploadService.download(file._id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'File downloaded successfully',
        life: 3000,
      });
    } catch (err) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to download file',
        life: 10000,
      });
    }
  };

  const handleDelete = (file: FileUpload) => {
    confirmDialog({
      message: `Are you sure you want to delete "${file.originalName}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await fileUploadService.delete(file._id);
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'File deleted successfully',
            life: 3000,
          });
          refetch();
        } catch (err) {
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete file',
            life: 10000,
          });
        }
      },
    });
  };

  // Table data
  const tableData = useMemo(() => {
    return (filesResponse?.data?.items || []).map((file) => ({
      ...file,
      id: file._id,
    }));
  }, [filesResponse]);

  // Table columns
  const columns = [
    {
      field: 'originalName',
      header: 'File Name',
      sortable: true,
      style: { width: '25%' },
      body: (rowData: FileUpload) => (
        <div className="flex items-center gap-2">
          <i
            className={`${fileUploadService.getFileIcon(rowData.mimeType)} text-lg`}
            style={{ color: fileUploadService.getCategoryColor(rowData.category).text }}
          />
          <div className="flex flex-col">
            <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
              {rowData.originalName}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {rowData.mimeType}
            </span>
          </div>
        </div>
      ),
    },
    {
      field: 'size',
      header: 'Size',
      sortable: true,
      style: { width: '10%' },
      body: (rowData: FileUpload) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {fileUploadService.formatFileSize(rowData.size)}
        </span>
      ),
    },
    {
      field: 'category',
      header: 'Category',
      sortable: true,
      style: { width: '10%' },
      body: (rowData: FileUpload) => {
        const colors = fileUploadService.getCategoryColor(rowData.category);
        return (
          <Tag
            value={rowData.category}
            style={{
              backgroundColor: colors.bg,
              color: colors.text,
              textTransform: 'capitalize',
            }}
          />
        );
      },
    },
    {
      field: 'district',
      header: 'District',
      sortable: true,
      style: { width: '12%' },
      body: (rowData: FileUpload) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {rowData.district || '-'}
        </span>
      ),
    },
    {
      field: 'status',
      header: 'Status',
      sortable: true,
      style: { width: '10%' },
      body: (rowData: FileUpload) => {
        const statusColors: Record<FileStatus, string> = {
          pending: 'warning',
          processing: 'info',
          completed: 'success',
          failed: 'danger',
        };
        return (
          <Tag
            value={rowData.status}
            severity={statusColors[rowData.status] as any}
            style={{ textTransform: 'capitalize' }}
          />
        );
      },
    },
    {
      field: 'uploadedByName',
      header: 'Uploaded By',
      sortable: true,
      style: { width: '12%' },
      body: (rowData: FileUpload) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {rowData.uploadedByName || rowData.uploadedBy || '-'}
        </span>
      ),
    },
    {
      field: 'createdAt',
      header: 'Uploaded At',
      sortable: true,
      style: { width: '12%' },
      body: (rowData: FileUpload) => (
        <span className="text-gray-600 dark:text-gray-400 text-sm">
          {new Date(rowData.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      field: 'actions',
      header: 'Actions',
      headerStyle: { textAlign: 'center' },
      sortable: false,
      style: { width: '9%' },
      body: (rowData: FileUpload) => (
        <div className="flex items-center gap-1 justify-center">
          {rowData.category === 'image' && (
            <Button
              icon="pi pi-eye"
              rounded
              text
              size="small"
              severity="info"
              onClick={() => handlePreview(rowData)}
              tooltip="Preview"
              tooltipOptions={{ position: 'top' }}
              testId={`FileUpload.Button.Preview.${rowData._id}`}
            />
          )}
          <Button
            icon="pi pi-download"
            rounded
            text
            size="small"
            severity="success"
            onClick={() => handleDownload(rowData)}
            tooltip="Download"
            tooltipOptions={{ position: 'top' }}
            testId={`FileUpload.Button.Download.${rowData._id}`}
          />
          <Button
            icon="pi pi-trash"
            rounded
            text
            size="small"
            severity="danger"
            onClick={() => handleDelete(rowData)}
            tooltip="Delete"
            tooltipOptions={{ position: 'top' }}
            testId={`FileUpload.Button.Delete.${rowData._id}`}
          />
        </div>
      ),
    },
  ];

  if (loadingDistricts) {
    return (
      <div className="py-6 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-3">
          <div>
            <Skeleton width="200px" height="32px" className="mb-2" />
            <Skeleton width="300px" height="20px" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
          <Skeleton height="100px" />
          <Skeleton height="100px" />
          <Skeleton height="100px" />
          <Skeleton height="100px" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <Skeleton height="400px" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast ref={toast} position="top-right" />
      <ConfirmDialog />
      <div
        className="py-6 px-4 bg-gray-50 dark:bg-gray-900"
        data-testid="SCR-FileUpload-List"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              File Upload
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage uploaded files across all districts
            </p>
          </div>
          <Button
            icon="pi pi-refresh"
            label="Refresh"
            severity="secondary"
            outlined
            onClick={() => refetch()}
            testId="FileUpload.Button.Refresh"
          />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <i className="pi pi-file text-blue-600 dark:text-blue-400 text-xl" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {filesResponse?.data?.total || 0}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Files</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                <i className="pi pi-check-circle text-green-600 dark:text-green-400 text-xl" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {tableData.filter((f) => f.status === 'completed').length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Completed</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <i className="pi pi-spin pi-spinner text-purple-600 dark:text-purple-400 text-xl" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {tableData.filter((f) => f.status === 'processing' || f.status === 'pending').length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Processing</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-red-500">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 dark:bg-red-900 rounded-lg">
                <i className="pi pi-times-circle text-red-600 dark:text-red-400 text-xl" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {tableData.filter((f) => f.status === 'failed').length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Failed</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700 mb-3">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                District <span className="text-red-500">*</span>
              </label>
              <Dropdown
                value={filters.district ?? ''}
                options={districtOptions}
                onChange={(e: { value: string }) => handleFilterChange('district', e.value)}
                placeholder="Select District"
                className="w-full"
                data-testid="FileUpload.Filter.District"
                filter
                showClear={false}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Search
              </label>
              <InputText
                value={filters.search || ''}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Search files..."
                className="w-full"
                data-testid="FileUpload.Input.Search"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <Dropdown
                value={filters.category ?? ''}
                options={categoryOptions}
                onChange={(e: { value: string }) => handleFilterChange('category', e.value)}
                placeholder="All Categories"
                className="w-full"
                data-testid="FileUpload.Filter.Category"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <Dropdown
                value={filters.status ?? ''}
                options={statusOptions}
                onChange={(e: { value: string }) => handleFilterChange('status', e.value)}
                placeholder="All Status"
                className="w-full"
                data-testid="FileUpload.Filter.Status"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Date
              </label>
              <Calendar
                value={filters.fromDate ? new Date(filters.fromDate) : null}
                onChange={(e) =>
                  handleFilterChange('fromDate', e.value ? (e.value as Date).toISOString().split('T')[0] : '')
                }
                placeholder="From Date"
                dateFormat="dd/mm/yy"
                className="w-full"
                showIcon
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                To Date
              </label>
              <Calendar
                value={filters.toDate ? new Date(filters.toDate) : null}
                onChange={(e) =>
                  handleFilterChange('toDate', e.value ? (e.value as Date).toISOString().split('T')[0] : '')
                }
                placeholder="To Date"
                dateFormat="dd/mm/yy"
                className="w-full"
                showIcon
              />
            </div>

            <div className="flex items-end">
              <Button
                label="Clear Filters"
                severity="secondary"
                outlined
                onClick={() => {
                  const defaultDistrict = districts.length > 0 ? districts[0]._id : undefined;
                  setFilters({ page: 1, page_size: 5, district: defaultDistrict });
                  setFirst(0);
                }}
                testId="FileUpload.Button.ClearFilters"
              />
            </div>
          </div>
        </div>

        {/* Files Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          {!filters.district ? (
            <div className="flex flex-col items-center justify-center py-12">
              <i className="pi pi-info-circle text-4xl text-blue-400 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                Please select a district to view files
              </p>
            </div>
          ) : (
            <DataTable
              data={tableData}
              columns={columns}
              loading={isLoading}
              dataKey="id"
              emptyMessage="No files found"
              paginator
              lazy
              first={first}
              rows={filters.page_size || 5}
              totalRecords={filesResponse?.data?.total || 0}
              onPage={handlePageChange}
              rowsPerPageOptions={[5, 10, 25, 50, 100]}
            />
          )}
        </div>

        {/* Image Preview Dialog */}
        <Dialog
          visible={previewDialogVisible}
          onHide={() => setPreviewDialogVisible(false)}
          header={selectedFile?.originalName || 'File Preview'}
          style={{ width: '60vw' }}
          maximizable
        >
          {selectedFile && selectedFile.category === 'image' && (
            <div className="flex justify-center">
              <img
                src={fileUploadService.getPreviewUrl(selectedFile._id)}
                alt={selectedFile.originalName}
                className="max-w-full max-h-[60vh] object-contain"
              />
            </div>
          )}
        </Dialog>
      </div>
    </>
  );
};

export default FileUploadList;
