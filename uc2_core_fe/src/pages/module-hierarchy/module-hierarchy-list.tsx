/**
 * Module Hierarchy List Page
 * Displays all modules, their jobs, and permissions in a hierarchical tree view
 */

import { useState, useEffect, useRef } from 'react';
import { InputText } from 'primereact/inputtext';
import { Toast } from 'primereact/toast';
import { Skeleton } from 'primereact/skeleton';
import { Tag } from 'primereact/tag';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'mainFe/Button';
import { fetchModuleHierarchy, type ModuleHierarchy } from '../../services/roles.service';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { JOB_NAMES } from '../../constants/jobNames';

const ModuleHierarchyList = () => {
  const toast = useRef<Toast>(null);
  const [loading, setLoading] = useState(true);
  const [moduleHierarchy, setModuleHierarchy] = useState<ModuleHierarchy[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadModuleHierarchy();
  }, []);

  const loadModuleHierarchy = async () => {
    try {
      setLoading(true);
      const data = await fetchModuleHierarchy();
      setModuleHierarchy(data || []);
      // Expand all modules by default
      const allModuleIds = new Set((data || []).map((m) => m.moduleId));
      setExpandedModules(allModuleIds);
    } catch (err) {
      console.error('Failed to load module hierarchy:', err);
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load module hierarchy',
        life: 10000,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleModuleExpand = (moduleId: string) => {
    setExpandedModules((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(moduleId)) {
        newSet.delete(moduleId);
      } else {
        newSet.add(moduleId);
      }
      return newSet;
    });
  };

  const toggleJobExpand = (jobKey: string) => {
    setExpandedJobs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(jobKey)) {
        newSet.delete(jobKey);
      } else {
        newSet.add(jobKey);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    const allModuleIds = new Set(moduleHierarchy.map((m) => m.moduleId));
    const allJobKeys = new Set<string>();
    moduleHierarchy.forEach((module) => {
      module.jobs.forEach((job) => {
        allJobKeys.add(`${module.moduleId}-${job.name}`);
      });
    });
    setExpandedModules(allModuleIds);
    setExpandedJobs(allJobKeys);
  };

  const collapseAll = () => {
    setExpandedModules(new Set());
    setExpandedJobs(new Set());
  };

  // Helper to get permission name (handles both string and object formats)
  const getPermissionName = (perm: string | { permissionId: string; name: string }): string => {
    return typeof perm === 'string' ? perm : perm.name;
  };

  // Filter modules based on search term
  const filteredModules = moduleHierarchy.filter((module) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();

    // Check module name
    if (module.moduleName.toLowerCase().includes(searchLower)) return true;

    // Check job names
    if (module.jobs.some((job) => job.name.toLowerCase().includes(searchLower))) return true;

    // Check permission names (handles both string and object formats)
    if (
      module.jobs.some((job) =>
        job.permissions.some((perm) => perm.name.toLowerCase().includes(searchLower))
      )
    )
      return true;

    return false;
  });

  // Calculate stats
  const stats = {
    totalModules: moduleHierarchy.length,
    totalJobs: moduleHierarchy.reduce((acc, m) => acc + m.jobs.length, 0),
    totalPermissions: moduleHierarchy.reduce(
      (acc, m) => acc + m.jobs.reduce((jAcc, j) => jAcc + j.permissions.length, 0),
      0
    ),
  };

  if (loading) {
    return (
      <div className="py-6 px-4 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between mb-3">
          <div>
            <Skeleton width="200px" height="32px" className="mb-2" />
            <Skeleton width="300px" height="20px" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-3">
          <Skeleton height="80px" />
          <Skeleton height="80px" />
          <Skeleton height="80px" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <Skeleton height="400px" />
        </div>
      </div>
    );
  }

  return (
    <PermissionGuard jobName={JOB_NAMES.MODULE_HIERARCHY}>
      <Toast ref={toast} position="top-right" />
      <div
        className="py-6 px-4 bg-gray-50 dark:bg-gray-900"
        data-testid="SCR-ModuleHierarchy-List"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Module Hierarchy
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              View all modules, jobs, and their permissions
            </p>
          </div>
          <Button
            icon="pi pi-refresh"
            label="Refresh"
            severity="secondary"
            outlined
            onClick={loadModuleHierarchy}
            testId="ModuleHierarchy.Button.Refresh"
          />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <i className="pi pi-folder text-blue-600 dark:text-blue-400 text-xl" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {stats.totalModules}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Modules</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                <i className="pi pi-briefcase text-green-600 dark:text-green-400 text-xl" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {stats.totalJobs}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Jobs</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <i className="pi pi-lock text-purple-600 dark:text-purple-400 text-xl" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {stats.totalPermissions}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Permissions</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <InputText
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search modules, jobs, or permissions..."
                className="w-full"
                data-testid="ModuleHierarchy.Input.Search"
              />
            </div>
            <Button
              icon="pi pi-plus"
              label="Expand All"
              severity="secondary"
              outlined
              size="small"
              onClick={expandAll}
              testId="ModuleHierarchy.Button.ExpandAll"
            />
            <Button
              icon="pi pi-minus"
              label="Collapse All"
              severity="secondary"
              outlined
              size="small"
              onClick={collapseAll}
              testId="ModuleHierarchy.Button.CollapseAll"
            />
          </div>
        </div>

        {/* Hierarchy Tree */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          {filteredModules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <i className="pi pi-inbox text-4xl text-gray-400 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                {searchTerm ? 'No matching results found' : 'No modules available'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredModules.map((module) => {
                const isModuleExpanded = expandedModules.has(module.moduleId);

                return (
                  <div key={module.moduleId} className="overflow-hidden">
                    {/* Module Header */}
                    <div
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      onClick={() => toggleModuleExpand(module.moduleId)}
                    >
                      <i
                        className={`pi ${isModuleExpanded ? 'pi-chevron-down' : 'pi-chevron-right'} text-gray-400`}
                        style={{ fontSize: '0.75rem' }}
                      />
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                        <i className="pi pi-folder text-blue-600 dark:text-blue-400" />
                      </div>
                      <span className="text-base font-medium text-gray-800 dark:text-white flex-1">
                        {module.moduleName}
                      </span>
                      <Tag
                        value={`${module.jobs.length} jobs`}
                        severity="info"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '12px' }}
                      />
                    </div>

                    {/* Jobs List */}
                    {isModuleExpanded && module.jobs.length > 0 && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                        {module.jobs.map((job) => {
                          const jobKey = `${module.moduleId}-${job.name}`;
                          const isJobExpanded = expandedJobs.has(jobKey);

                          return (
                            <div key={jobKey} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                              {/* Job Header */}
                              <div
                                className="flex items-center gap-3 px-4 py-2.5 ml-8 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                onClick={() => toggleJobExpand(jobKey)}
                              >
                                <i
                                  className={`pi ${isJobExpanded ? 'pi-chevron-down' : 'pi-chevron-right'} text-gray-400`}
                                  style={{ fontSize: '0.65rem' }}
                                />
                                <div className="p-1.5 bg-green-100 dark:bg-green-900/50 rounded">
                                  <i className="pi pi-briefcase text-green-600 dark:text-green-400 text-sm" />
                                </div>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                                  {job.name}
                                </span>
                                <Tag
                                  value={`${job.permissions.length} permissions`}
                                  severity="success"
                                  style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '10px' }}
                                />
                              </div>

                              {/* Permissions List */}
                              {isJobExpanded && job.permissions.length > 0 && (
                                <div className="ml-16 py-2 px-4 bg-white dark:bg-gray-800">
                                  <div className="flex flex-wrap gap-2">
                                    {job.permissions.map((permission) => (
                                      <Tag
                                        key={permission.permissionId}
                                        value={permission.name}
                                        style={{
                                          backgroundColor: getPermissionColor(permission.name).bg,
                                          color: getPermissionColor(permission.name).text,
                                          padding: '4px 10px',
                                          fontSize: '0.75rem',
                                          borderRadius: '6px',
                                          fontWeight: '500',
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Empty Jobs Message */}
                    {isModuleExpanded && module.jobs.length === 0 && (
                      <div className="px-3 py-2 ml-8 text-sm text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-900/50">
                        No jobs defined for this module
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PermissionGuard>
  );
};

// Helper function to get permission color based on type
const getPermissionColor = (permission: string): { bg: string; text: string } => {
  const permLower = permission.toLowerCase();

  if (permLower.includes('create') || permLower.includes('add')) {
    return { bg: '#dcfce7', text: '#166534' }; // green
  }
  if (permLower.includes('read') || permLower.includes('view') || permLower.includes('list')) {
    return { bg: '#dbeafe', text: '#1e40af' }; // blue
  }
  if (permLower.includes('update') || permLower.includes('edit')) {
    return { bg: '#fef3c7', text: '#92400e' }; // yellow/amber
  }
  if (permLower.includes('delete') || permLower.includes('remove')) {
    return { bg: '#fee2e2', text: '#991b1b' }; // red
  }
  if (permLower.includes('export') || permLower.includes('download')) {
    return { bg: '#e0e7ff', text: '#3730a3' }; // indigo
  }
  if (permLower.includes('import') || permLower.includes('upload')) {
    return { bg: '#f3e8ff', text: '#7c3aed' }; // purple
  }
  if (permLower.includes('approve') || permLower.includes('reject')) {
    return { bg: '#ccfbf1', text: '#0f766e' }; // teal
  }

  // Default
  return { bg: '#f3f4f6', text: '#374151' }; // gray
};

export default ModuleHierarchyList;
