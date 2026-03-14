/**
 * Organizational Structure View Page
 *
 * Displays the AP Police organizational hierarchy in a tree format.
 * Users can search, filter, and navigate through the structure.
 */

import { useState } from 'react';
import { Panel } from 'primereact/panel';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { Dialog } from 'primereact/dialog';
import { Divider } from 'primereact/divider';
import OrganizationalTree, { type OrgUnit } from '../../components/ui/organizational-tree';
import { useOrgStructure } from '../../hooks/useOrgStructure';
import { Button } from 'mainFe/Button';

const OrgStructureView = () => {
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<OrgUnit | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  // Fetch organizational structure
  const { data, isLoading, error, refetch } = useOrgStructure({
    format: 'tree',
    level: selectedLevel || undefined,
    includeInactive,
  });

  // Hierarchy level options
  const levelOptions = [
    { label: 'All Levels', value: null },
    { label: 'L1 - State (DGP)', value: 'L1' },
    { label: 'L2 - Zone (IGP)', value: 'L2' },
    { label: 'L3 - Range/Commissionerate (DIG/CP)', value: 'L3' },
    { label: 'L4 - District (SP) / City Zone (DCP)', value: 'L4' },
    { label: 'L5 - Sub-Division (DSP) / Division (ACP)', value: 'L5' },
    { label: 'L6 - Circle (CI)', value: 'L6' },
    { label: 'L7 - Police Station (Inspector)', value: 'L7' },
    { label: 'L8 - Beat (HC/ASI)', value: 'L8' },
  ];

  // Handle node click
  const handleNodeClick = (unit: OrgUnit) => {
    setSelectedUnit(unit);
    setShowDetailsDialog(true);
  };

  // Handle node double click (navigate to unit details page)
  const handleNodeDoubleClick = (unit: OrgUnit) => {
    // Navigate to unit details page
    window.location.href = `/units/${unit.unitId}`;
  };

  // Render unit details in dialog
  const renderUnitDetails = () => {
    if (!selectedUnit) return null;

    return (
      <div className="space-y-4">
        {/* Basic Info */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Basic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600">Unit Name</label>
              <p className="font-medium">{selectedUnit.unitName}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Unit Code</label>
              <p className="font-medium">{selectedUnit.unitCd || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Unit Type</label>
              <p className="font-medium">{selectedUnit.unitType || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Hierarchy Level</label>
              <p className="font-medium">{selectedUnit.hierarchyLevel || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Status</label>
              <p>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    selectedUnit.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {selectedUnit.isActive ? 'Active' : 'Inactive'}
                </span>
              </p>
            </div>
          </div>
        </div>

        <Divider />

        {/* Officer in Charge */}
        {selectedUnit.incharge && (
          <>
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Officer in Charge</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Name</label>
                  <p className="font-medium">{selectedUnit.incharge.name}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Rank</label>
                  <p className="font-medium">{selectedUnit.incharge.rank || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Badge</label>
                  <p className="font-medium">{selectedUnit.incharge.badge || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Phone</label>
                  <p className="font-medium">{selectedUnit.incharge.phone || 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-gray-600">Email</label>
                  <p className="font-medium">{selectedUnit.incharge.email || 'N/A'}</p>
                </div>
              </div>
            </div>
            <Divider />
          </>
        )}

        {/* Personnel Statistics */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Personnel Statistics</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded text-center">
              <p className="text-sm text-gray-600 mb-1">Direct Personnel</p>
              <p className="text-2xl font-bold text-blue-600">{selectedUnit.personnelCount}</p>
            </div>
            <div className="bg-green-50 p-4 rounded text-center">
              <p className="text-sm text-gray-600 mb-1">Total Personnel</p>
              <p className="text-2xl font-bold text-green-600">{selectedUnit.totalPersonnel}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded text-center">
              <p className="text-sm text-gray-600 mb-1">Child Units</p>
              <p className="text-2xl font-bold text-purple-600">{selectedUnit.totalChildUnits}</p>
            </div>
          </div>
        </div>

        <Divider />

        {/* Location */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Location</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600">District</label>
              <p className="font-medium">{selectedUnit.districtName || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-600">City</label>
              <p className="font-medium">{selectedUnit.city || 'N/A'}</p>
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-600">Address</label>
              <p className="font-medium">{selectedUnit.address || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Jurisdiction */}
        {selectedUnit.jurisdiction && selectedUnit.jurisdiction.length > 0 && (
          <>
            <Divider />
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-800">Jurisdiction</h3>
              <div className="space-y-2">
                {selectedUnit.jurisdiction.map((j, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">{j.type}</span>
                      <span className="font-medium">{j.name}</span>
                      {j.code && (
                        <span className="text-xs text-gray-500">({j.code})</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Contact */}
        <Divider />
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-800">Contact Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600">Phone</label>
              <p className="font-medium">
                {selectedUnit.phone && selectedUnit.phone.length > 0
                  ? selectedUnit.phone.join(', ')
                  : 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm text-gray-600">Email</label>
              <p className="font-medium">{selectedUnit.email || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4">
      <Panel header="AP Police Organizational Structure" className="mb-4">
        {/* Filters */}
        <div className="mb-4 flex gap-4 items-center flex-wrap">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium mb-2">Filter by Level</label>
            <Dropdown
              value={selectedLevel}
              options={levelOptions}
              onChange={(e) => setSelectedLevel(e.value)}
              placeholder="Select hierarchy level"
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2 mt-6">
            <Checkbox
              inputId="includeInactive"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.checked || false)}
            />
            <label htmlFor="includeInactive" className="text-sm">
              Include Inactive Units
            </label>
          </div>
        </div>

        {/* Statistics */}
        {data && (
          <div className="bg-blue-50 p-4 rounded mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Units</p>
                <p className="text-2xl font-bold text-blue-600">{data.totalUnits}</p>
              </div>
              <i className="pi pi-sitemap text-blue-300 text-4xl"></i>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
            <div className="flex items-center gap-2 text-red-800">
              <i className="pi pi-exclamation-circle"></i>
              <span>Failed to load organizational structure: {error.message}</span>
            </div>
          </div>
        )}

        {/* Tree Component */}
        <OrganizationalTree
          data={data?.units || []}
          loading={isLoading}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onRefresh={refetch}
          showSearch
          showRefreshButton
          testId="org-structure-tree"
        />
      </Panel>

      {/* Unit Details Dialog */}
      <Dialog
        header={selectedUnit?.unitName || 'Unit Details'}
        visible={showDetailsDialog}
        style={{ width: '50vw' }}
        onHide={() => setShowDetailsDialog(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              label="Close"
              onClick={() => setShowDetailsDialog(false)}
              severity="secondary"
            />
            <Button
              label="View Full Details"
              onClick={() => selectedUnit && (window.location.href = `/units/${selectedUnit.unitId}`)}
              icon="pi pi-external-link"
            />
          </div>
        }
      >
        {renderUnitDetails()}
      </Dialog>
    </div>
  );
};

export default OrgStructureView;
