const ExcelJS = require('exceljs');
const path = require('path');

async function generateExcelTracker() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Screen API Tracker', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }]
  });

  // Define columns
  worksheet.columns = [
    { header: 'Module', key: 'module', width: 22 },
    { header: 'Screen Name', key: 'screenName', width: 28 },
    { header: 'Screen Description', key: 'screenDescription', width: 45 },
    { header: 'Final Screen UX Design', key: 'uxDesign', width: 12 },
    { header: 'Flow Order', key: 'flowOrder', width: 8 },
    { header: 'API Endpoint', key: 'apiEndpoint', width: 45 },
    { header: 'API Method', key: 'apiMethod', width: 10 },
    { header: 'API Purpose', key: 'apiPurpose', width: 40 },
    { header: 'AI/Non-AI', key: 'aiNonAi', width: 10 },
    { header: 'API Development Status', key: 'devStatus', width: 14 },
    { header: 'Integration Status', key: 'intStatus', width: 14 },
    { header: 'Total APIs', key: 'totalApis', width: 10 },
    { header: 'Developed (Count)', key: 'devCount', width: 12 },
    { header: 'In Progress (Count)', key: 'inProgressCount', width: 12 },
    { header: 'Integrated (Count)', key: 'intCount', width: 12 },
    { header: 'Not Integrated (Count)', key: 'notIntCount', width: 12 },
    { header: 'Developed %', key: 'devPercent', width: 11 },
    { header: 'Integrated %', key: 'intPercent', width: 11 },
    { header: 'Remarks', key: 'remarks', width: 30 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 35;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1F4E79' }
    };
    cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: '000000' } },
      left: { style: 'thin', color: { argb: '000000' } },
      bottom: { style: 'thin', color: { argb: '000000' } },
      right: { style: 'thin', color: { argb: '000000' } }
    };
  });

  // Data for all modules
  const modulesData = [
    {
      module: 'UNITS MANAGEMENT',
      screens: [
        {
          screenName: 'Units List',
          screenDescription: 'Shows all units with search/filter capabilities',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/units/list', method: 'GET', purpose: 'Get all units with pagination and filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/units/list-minimal', method: 'GET', purpose: 'Get lightweight unit list for dropdowns', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Dropdown data source' },
            { endpoint: '/api/v1/units/delete/{id}', method: 'DELETE', purpose: 'Soft delete unit', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete with confirmation' },
            { endpoint: '/api/v1/units/restore/{id}', method: 'PATCH', purpose: 'Restore deleted unit', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Unit Create/Edit',
          screenDescription: 'Create or edit unit with validation',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/units/create', method: 'POST', purpose: 'Create new unit', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/units/update/{id}', method: 'PUT', purpose: 'Update existing unit', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/units/get/{id}', method: 'GET', purpose: 'Get unit by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
            { endpoint: '/api/v1/districts/list', method: 'GET', purpose: 'Get districts for dropdown', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Dropdown dependency' },
          ]
        },
        {
          screenName: 'Unit View',
          screenDescription: 'View unit details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/units/get/{id}', method: 'GET', purpose: 'Get unit by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'PERSONNEL MANAGEMENT',
      screens: [
        {
          screenName: 'Personnel List',
          screenDescription: 'Lists personnel with filters (batch year, search, soft-delete)',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/personnel-master/list', method: 'GET', purpose: 'Get all personnel records', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/personnel-master/delete/{id}', method: 'DELETE', purpose: 'Delete personnel record', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
          ]
        },
        {
          screenName: 'Personnel Create/Edit',
          screenDescription: 'Create or edit personnel',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/personnel-master/create', method: 'POST', purpose: 'Create new personnel record', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/personnel-master/update/{id}', method: 'PATCH', purpose: 'Update personnel record', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/personnel-master/{id}', method: 'GET', purpose: 'Get personnel by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Personnel View',
          screenDescription: 'View personnel details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/personnel-master/{id}', method: 'GET', purpose: 'Get personnel by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'UNIT VILLAGES',
      screens: [
        {
          screenName: 'Unit Villages List',
          screenDescription: 'Lists unit-village mappings',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/unit-villages/list', method: 'GET', purpose: 'Get all unit villages with pagination', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/unit-villages/delete/{id}', method: 'DELETE', purpose: 'Delete unit village (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/unit-villages/restore/{id}', method: 'PATCH', purpose: 'Restore deleted unit village', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Unit Village Create/Edit',
          screenDescription: 'Create or edit unit-village mapping',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/unit-villages/create', method: 'POST', purpose: 'Create new unit village', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/unit-villages/update/{id}', method: 'PUT', purpose: 'Update unit village', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/unit-villages/get/{id}', method: 'GET', purpose: 'Get unit village by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Unit Village View',
          screenDescription: 'View unit-village mapping details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/unit-villages/get/{id}', method: 'GET', purpose: 'Get unit village by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'VALUE SETS',
      screens: [
        {
          screenName: 'Value Sets List',
          screenDescription: 'Lists all value sets with filtering',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/value-sets/list', method: 'GET', purpose: 'Get all value sets with pagination and filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/value-sets/delete/{key}', method: 'DELETE', purpose: 'Delete/archive value set', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/value-sets/{key}/activate', method: 'PATCH', purpose: 'Activate archived value set', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
            { endpoint: '/api/v1/value-sets/cache/refresh', method: 'POST', purpose: 'Refresh cache for all value sets', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Cache management' },
          ]
        },
        {
          screenName: 'Value Set Create/Edit',
          screenDescription: 'Create or edit value set',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/value-sets/create', method: 'POST', purpose: 'Create new value set', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/value-sets/update/{key}', method: 'PUT', purpose: 'Update value set by key', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/value-sets/get/{key}', method: 'GET', purpose: 'Get value set by key for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
            { endpoint: '/api/v1/value-sets/validate', method: 'POST', purpose: 'Validate if code exists in value set', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Form validation' },
          ]
        },
        {
          screenName: 'Value Set View',
          screenDescription: 'View value set details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/value-sets/get/{key}', method: 'GET', purpose: 'Get value set by key', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
            { endpoint: '/api/v1/value-sets/get/{key}/items', method: 'GET', purpose: 'Get all items for specific value set', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Items listing' },
          ]
        },
      ]
    },
    {
      module: 'PROMPTS (AI)',
      screens: [
        {
          screenName: 'Prompts List',
          screenDescription: 'Lists all AI prompts',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/prompts/list', method: 'GET', purpose: 'List all prompts with pagination', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/prompts/search', method: 'GET', purpose: 'Search prompts with filters', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Search functionality' },
            { endpoint: '/api/v1/prompts/delete/{promptId}', method: 'DELETE', purpose: 'Soft delete prompt', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
          ]
        },
        {
          screenName: 'Prompt Create/Edit',
          screenDescription: 'Create or edit AI prompt',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/prompts/create', method: 'POST', purpose: 'Create new prompt', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/prompts/update/{promptId}', method: 'PUT', purpose: 'Update prompt', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/prompts/get/{promptId}', method: 'GET', purpose: 'Get prompt by ID for editing', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Prompt View',
          screenDescription: 'View AI prompt details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/prompts/get/{promptId}', method: 'GET', purpose: 'Get prompt by ID', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'ROLES MANAGEMENT',
      screens: [
        {
          screenName: 'Roles List',
          screenDescription: 'Lists all roles with hierarchical permissions',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/roles/list', method: 'GET', purpose: 'Fetch all roles', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/roles/delete/{id}', method: 'DELETE', purpose: 'Delete role', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/module-hierarchy/get', method: 'GET', purpose: 'Fetch module hierarchy for display', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Permission tree display' },
          ]
        },
        {
          screenName: 'Role Create/Edit',
          screenDescription: 'Create or edit role with permission mapping',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/roles/create', method: 'POST', purpose: 'Create new role', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/roles/update/{id}', method: 'PUT', purpose: 'Update role', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/roles/get/{id}', method: 'GET', purpose: 'Get role by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
            { endpoint: '/api/v1/module-hierarchy/get', method: 'GET', purpose: 'Fetch module hierarchy for permission UI', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Permission tree selection' },
          ]
        },
        {
          screenName: 'Role View',
          screenDescription: 'View role details with permissions',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/roles/get/{id}', method: 'GET', purpose: 'Get role by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
            { endpoint: '/api/v1/module-hierarchy/get', method: 'GET', purpose: 'Fetch module hierarchy for display', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Permission tree display' },
          ]
        },
      ]
    },
    {
      module: 'DISTRICTS',
      screens: [
        {
          screenName: 'Districts List',
          screenDescription: 'Lists all districts',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/districts/list', method: 'GET', purpose: 'Get all districts with optional filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/districts/delete/{id}', method: 'DELETE', purpose: 'Delete district (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/districts/restore/{id}', method: 'PATCH', purpose: 'Restore deleted district', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'District Create/Edit',
          screenDescription: 'Create or edit district',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/districts/create', method: 'POST', purpose: 'Create new district', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/districts/update/{id}', method: 'PUT', purpose: 'Update district', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/districts/get/{id}', method: 'GET', purpose: 'Get district by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'District View',
          screenDescription: 'View district details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/districts/get/{id}', method: 'GET', purpose: 'Get district by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'MANDALS',
      screens: [
        {
          screenName: 'Mandals List',
          screenDescription: 'Lists all mandals',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/mandals/list', method: 'GET', purpose: 'Get all mandals with optional filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/mandals/delete/{id}', method: 'DELETE', purpose: 'Delete mandal (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/mandals/restore/{id}', method: 'PATCH', purpose: 'Restore deleted mandal', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Mandal Create/Edit',
          screenDescription: 'Create or edit mandal',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/mandals/create', method: 'POST', purpose: 'Create new mandal', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/mandals/update/{id}', method: 'PUT', purpose: 'Update mandal', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/mandals/get/{id}', method: 'GET', purpose: 'Get mandal by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
            { endpoint: '/api/v1/districts/list', method: 'GET', purpose: 'Get districts for dropdown', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Dropdown dependency' },
          ]
        },
        {
          screenName: 'Mandal View',
          screenDescription: 'View mandal details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/mandals/get/{id}', method: 'GET', purpose: 'Get mandal by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'UNIT TYPES',
      screens: [
        {
          screenName: 'Unit Types List',
          screenDescription: 'Lists all unit types',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/unit-types/list', method: 'GET', purpose: 'Get all unit types with optional filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/unit-types/delete/{id}', method: 'DELETE', purpose: 'Delete unit type (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/unit-types/restore/{id}', method: 'PATCH', purpose: 'Restore deleted unit type', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Unit Type Create/Edit',
          screenDescription: 'Create or edit unit type',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/unit-types/create', method: 'POST', purpose: 'Create new unit type', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/unit-types/update/{id}', method: 'PUT', purpose: 'Update unit type', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/unit-types/get/{id}', method: 'GET', purpose: 'Get unit type by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Unit Type View',
          screenDescription: 'View unit type details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/unit-types/get/{id}', method: 'GET', purpose: 'Get unit type by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'DEPARTMENTS',
      screens: [
        {
          screenName: 'Departments List',
          screenDescription: 'Lists all departments',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/departments/list', method: 'GET', purpose: 'Get all departments with optional filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/departments/delete/{id}', method: 'DELETE', purpose: 'Delete department (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/departments/restore/{id}', method: 'PATCH', purpose: 'Restore deleted department', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Department Create/Edit',
          screenDescription: 'Create or edit department',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/departments/create', method: 'POST', purpose: 'Create new department', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/departments/update/{id}', method: 'PUT', purpose: 'Update department', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/departments/get/{id}', method: 'GET', purpose: 'Get department by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Department View',
          screenDescription: 'View department details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/departments/get/{id}', method: 'GET', purpose: 'Get department by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'RANKS',
      screens: [
        {
          screenName: 'Ranks List',
          screenDescription: 'Lists all ranks',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/ranks/list', method: 'GET', purpose: 'Get all ranks with optional filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/ranks/delete/{id}', method: 'DELETE', purpose: 'Delete rank (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/ranks/restore/{id}', method: 'PATCH', purpose: 'Restore deleted rank', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Rank Create/Edit',
          screenDescription: 'Create or edit rank',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/ranks/create', method: 'POST', purpose: 'Create new rank', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/ranks/update/{id}', method: 'PUT', purpose: 'Update rank', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/ranks/get/{id}', method: 'GET', purpose: 'Get rank by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Rank View',
          screenDescription: 'View rank details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/ranks/get/{id}', method: 'GET', purpose: 'Get rank by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'MODULES',
      screens: [
        {
          screenName: 'Modules List',
          screenDescription: 'Lists all modules',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/modules/list', method: 'GET', purpose: 'Get all modules with optional filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/modules/delete/{id}', method: 'DELETE', purpose: 'Delete module (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/modules/restore/{id}', method: 'PATCH', purpose: 'Restore deleted module', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Module Create/Edit',
          screenDescription: 'Create or edit module',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/modules/create', method: 'POST', purpose: 'Create new module', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/modules/update/{id}', method: 'PUT', purpose: 'Update module', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/modules/get/{id}', method: 'GET', purpose: 'Get module by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Module View',
          screenDescription: 'View module details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/modules/get/{id}', method: 'GET', purpose: 'Get module by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'JOBS',
      screens: [
        {
          screenName: 'Jobs List',
          screenDescription: 'Lists all jobs',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/jobs/list', method: 'GET', purpose: 'Get all jobs with pagination', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/jobs/delete/{id}', method: 'DELETE', purpose: 'Delete job (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/jobs/restore/{id}', method: 'PATCH', purpose: 'Restore deleted job', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
            { endpoint: '/api/v1/jobs/active/{id}', method: 'PATCH', purpose: 'Toggle active status of job', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Status toggle' },
          ]
        },
        {
          screenName: 'Job Create/Edit',
          screenDescription: 'Create or edit job',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/jobs/create', method: 'POST', purpose: 'Create new job', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/jobs/bulk-create', method: 'POST', purpose: 'Bulk create multiple jobs', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Bulk operations' },
            { endpoint: '/api/v1/jobs/update/{id}', method: 'PATCH', purpose: 'Update job', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/jobs/get/{id}', method: 'GET', purpose: 'Get job by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Job View',
          screenDescription: 'View job details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/jobs/get/{id}', method: 'GET', purpose: 'Get job by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'PERMISSIONS',
      screens: [
        {
          screenName: 'Permissions List',
          screenDescription: 'Lists all permissions',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/permissions/list', method: 'GET', purpose: 'Get all permissions with pagination', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/permissions/delete/{id}', method: 'DELETE', purpose: 'Delete permission (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/permissions/restore/{id}', method: 'PATCH', purpose: 'Restore deleted permission', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Permission Create/Edit',
          screenDescription: 'Create or edit permission',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/permissions/create', method: 'POST', purpose: 'Create new permission', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/permissions/update/{id}', method: 'PUT', purpose: 'Update permission', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/permissions/get/{id}', method: 'GET', purpose: 'Get permission by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Permission View',
          screenDescription: 'View permission details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/permissions/get/{id}', method: 'GET', purpose: 'Get permission by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'LOG MASTER',
      screens: [
        {
          screenName: 'Log Master List',
          screenDescription: 'Lists log definitions',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/log-master/list', method: 'GET', purpose: 'Get all log masters with filters and pagination', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/log-master/delete', method: 'DELETE', purpose: 'Delete log master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
          ]
        },
        {
          screenName: 'Log Master Create/Edit',
          screenDescription: 'Create or edit log definition',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/log-master/create', method: 'POST', purpose: 'Create new log master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/log-master/bulk-create', method: 'POST', purpose: 'Bulk create log masters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Bulk operations' },
            { endpoint: '/api/v1/log-master/update', method: 'PUT', purpose: 'Update log master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/log-master/get', method: 'GET', purpose: 'Get log master by ID for editing', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Log Master View',
          screenDescription: 'View log definition details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/log-master/get', method: 'GET', purpose: 'Get log master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'USER ROLE MAPPINGS',
      screens: [
        {
          screenName: 'User Role Mapping List',
          screenDescription: 'Lists user-role mappings',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/user-role-permissions/list', method: 'GET', purpose: 'Fetch all user role mappings', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/user-role-permissions/delete', method: 'DELETE', purpose: 'Delete user role mapping', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
          ]
        },
        {
          screenName: 'User Role Mapping Create/Edit',
          screenDescription: 'Create or edit user-role mapping',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/user-role-permissions/create', method: 'POST', purpose: 'Create new user role mapping', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/user-role-permissions/update/{id}', method: 'PUT', purpose: 'Update user role mapping', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/user-role-permissions/get/{id}', method: 'GET', purpose: 'Get user role mapping by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'User Role Mapping View',
          screenDescription: 'View user-role mapping details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/user-role-permissions/get/{id}', method: 'GET', purpose: 'Get user role mapping by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'PERMISSION MAPPINGS',
      screens: [
        {
          screenName: 'Permission Mapping List',
          screenDescription: 'Lists module-job-permission mappings',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/permissions-mapping/list', method: 'GET', purpose: 'Fetch all permission mappings', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/permissions-mapping/delete/{id}', method: 'DELETE', purpose: 'Delete permission mapping (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/permissions-mapping/restore/{id}', method: 'PATCH', purpose: 'Restore deleted permission mapping', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Permission Mapping Create/Edit',
          screenDescription: 'Create or edit permission mapping',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/permissions-mapping/create', method: 'POST', purpose: 'Create single permission mapping', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/permissions-mapping/bulk-create', method: 'POST', purpose: 'Bulk create multiple permission mappings', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Bulk operations' },
            { endpoint: '/api/v1/permissions-mapping/update/{id}', method: 'PUT', purpose: 'Update permission mapping', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/permissions-mapping/get/{id}', method: 'GET', purpose: 'Get permission mapping by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Permission Mapping View',
          screenDescription: 'View permission mapping details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/permissions-mapping/get/{id}', method: 'GET', purpose: 'Get permission mapping by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'FEEDBACK MASTER',
      screens: [
        {
          screenName: 'Feedback Master List',
          screenDescription: 'Lists all feedback',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/feedback-master/list', method: 'GET', purpose: 'Get all feedback masters with optional filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/feedback-master/delete/{id}', method: 'DELETE', purpose: 'Delete feedback master (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/feedback-master/restore/{id}', method: 'PATCH', purpose: 'Restore deleted feedback master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
            { endpoint: '/api/v1/modules/list', method: 'GET', purpose: 'Get modules for filter dropdown', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Dropdown dependency' },
          ]
        },
        {
          screenName: 'Feedback Master Create/Edit',
          screenDescription: 'Create or edit feedback',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/feedback-master/create', method: 'POST', purpose: 'Create new feedback master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/feedback-master/update/{id}', method: 'PATCH', purpose: 'Update feedback master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/feedback-master/get/{id}', method: 'GET', purpose: 'Get feedback master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
            { endpoint: '/api/v1/modules/list', method: 'GET', purpose: 'Get modules for dropdown', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Dropdown dependency' },
          ]
        },
        {
          screenName: 'Feedback Master View',
          screenDescription: 'View feedback details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/feedback-master/get/{id}', method: 'GET', purpose: 'Get feedback master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'DESIGNATION MASTER',
      screens: [
        {
          screenName: 'Designation Master List',
          screenDescription: 'Lists all designations',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/designation-master/list', method: 'GET', purpose: 'Get all designation masters with optional filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/designation-master/delete/{id}', method: 'DELETE', purpose: 'Delete designation master (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/designation-master/restore/{id}', method: 'PATCH', purpose: 'Restore deleted designation master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
            { endpoint: '/api/v1/designation-master/active/{id}', method: 'PATCH', purpose: 'Toggle active status', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Status toggle' },
          ]
        },
        {
          screenName: 'Designation Master Create/Edit',
          screenDescription: 'Create or edit designation',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/designation-master/create', method: 'POST', purpose: 'Create new designation master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/designation-master/update/{id}', method: 'PATCH', purpose: 'Update designation master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/designation-master/{id}', method: 'GET', purpose: 'Get designation master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Designation Master View',
          screenDescription: 'View designation details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/designation-master/{id}', method: 'GET', purpose: 'Get designation master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'APPROVAL FLOW MASTER',
      screens: [
        {
          screenName: 'Approval Flow Master List',
          screenDescription: 'Lists all approval flows',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/approval-flow-master/list', method: 'GET', purpose: 'Get all approval flow masters with optional filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/approval-flow-master/delete/{id}', method: 'DELETE', purpose: 'Delete approval flow master (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/approval-flow-master/restore/{id}', method: 'PATCH', purpose: 'Restore deleted approval flow master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Approval Flow Master Create/Edit',
          screenDescription: 'Create or edit approval flow',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/approval-flow-master/create', method: 'POST', purpose: 'Create new approval flow master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/approval-flow-master/update/{id}', method: 'PATCH', purpose: 'Update approval flow master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/approval-flow-master/get/{id}', method: 'GET', purpose: 'Get approval flow master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
            { endpoint: '/api/v1/approval-flow-master/get/by-module/{moduleId}', method: 'GET', purpose: 'Get approval flow by module ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Module-specific flows' },
          ]
        },
        {
          screenName: 'Approval Flow Master View',
          screenDescription: 'View approval flow details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/approval-flow-master/get/{id}', method: 'GET', purpose: 'Get approval flow master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'ERROR MASTER',
      screens: [
        {
          screenName: 'Error Master List',
          screenDescription: 'Lists all error codes',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/error-master/list', method: 'GET', purpose: 'Get all error masters with pagination and filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/error-master/delete/{id}', method: 'DELETE', purpose: 'Delete error master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
          ]
        },
        {
          screenName: 'Error Master Create/Edit',
          screenDescription: 'Create or edit error code',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/error-master/create', method: 'POST', purpose: 'Create new error master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create functionality' },
            { endpoint: '/api/v1/error-master/update/{id}', method: 'PATCH', purpose: 'Update error master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/api/v1/error-master/get/{id}', method: 'GET', purpose: 'Get error master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
            { endpoint: '/api/v1/error-master/by-code/{errorCode}', method: 'GET', purpose: 'Get error master by error code', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Code lookup' },
          ]
        },
        {
          screenName: 'Error Master View',
          screenDescription: 'View error code details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/error-master/get/{id}', method: 'GET', purpose: 'Get error master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'NOTIFICATION MASTER',
      screens: [
        {
          screenName: 'Notification Master List',
          screenDescription: 'Lists notification templates',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/notification-masters/list', method: 'GET', purpose: 'List all notification masters (External: core-notifications)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing (External API)' },
            { endpoint: '/notification-masters/delete/{id}', method: 'DELETE', purpose: 'Delete notification master (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
          ]
        },
        {
          screenName: 'Notification Master Create/Edit',
          screenDescription: 'Create or edit notification template',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/notification-masters/create', method: 'POST', purpose: 'Create notification master (External: core-notifications)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core create (External API)' },
            { endpoint: '/notification-masters/update/{id}', method: 'PUT', purpose: 'Update notification master', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core update functionality' },
            { endpoint: '/notification-masters/{id}', method: 'GET', purpose: 'Get notification master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Pre-populate form data' },
          ]
        },
        {
          screenName: 'Notification Master View',
          screenDescription: 'View notification template details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/notification-masters/{id}', method: 'GET', purpose: 'Get notification master by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Detail view data' },
          ]
        },
      ]
    },
    {
      module: 'ERROR LOGS',
      screens: [
        {
          screenName: 'Error Logs List',
          screenDescription: 'Error logs viewer with filtering',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/error-logs/list', method: 'GET', purpose: 'Search error logs with filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/error-logs/export', method: 'GET', purpose: 'Export error logs as CSV', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Export functionality' },
            { endpoint: '/api/v1/error-logs/dashboard', method: 'GET', purpose: 'Get dashboard data with time range', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Dashboard statistics' },
          ]
        },
        {
          screenName: 'Error Logs Monitor',
          screenDescription: 'Error monitoring dashboard',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/error-logs/list', method: 'GET', purpose: 'Search error logs with filters', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/error-logs/dashboard', method: 'GET', purpose: 'Get dashboard statistics', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Dashboard statistics' },
          ]
        },
      ]
    },
    {
      module: 'LOG TRANSACTION (AUDIT)',
      screens: [
        {
          screenName: 'Log Transaction List',
          screenDescription: 'Audit log viewer with filtering',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/log-transactions/list', method: 'GET', purpose: 'Search log transactions (External: core-auditlog)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing (External API)' },
            { endpoint: '/api/v1/log-transactions/analytics', method: 'GET', purpose: 'Get analytics for log level counts', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Analytics dashboard' },
            { endpoint: '/api/v1/log-transactions/export', method: 'GET', purpose: 'Export log transactions as CSV', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Export functionality' },
          ]
        },
      ]
    },
    {
      module: 'FILE UPLOAD',
      screens: [
        {
          screenName: 'File Upload List',
          screenDescription: 'File upload management',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/files/list', method: 'GET', purpose: 'List files with pagination (External: core-fileupload)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing (External API)' },
            { endpoint: '/api/v1/files/get/{id}', method: 'GET', purpose: 'Get file by ID', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'File details' },
            { endpoint: '/api/v1/files/delete/{id}', method: 'DELETE', purpose: 'Delete file (soft delete)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/files/download/{id}', method: 'GET', purpose: 'Get download URL for file', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Download functionality' },
            { endpoint: '/api/v1/files/stream/{id}', method: 'GET', purpose: 'Stream file (for encrypted files)', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Streaming functionality' },
            { endpoint: '/api/v1/files/upload', method: 'POST', purpose: 'Upload file with metadata', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Upload functionality' },
          ]
        },
      ]
    },
    {
      module: 'PROMPT EXECUTIONS (AI)',
      screens: [
        {
          screenName: 'Prompt Executions List',
          screenDescription: 'AI prompt execution monitoring',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/prompt-executions/list', method: 'GET', purpose: 'List prompt executions with pagination', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Core listing functionality' },
            { endpoint: '/api/v1/prompt-executions/dashboard', method: 'GET', purpose: 'Get dashboard statistics', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'AI dashboard statistics' },
            { endpoint: '/api/v1/prompt-executions/recent-calls', method: 'GET', purpose: 'Get recent calls with pagination', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Recent AI calls' },
            { endpoint: '/api/v1/prompt-executions/delete/{executionId}', method: 'DELETE', purpose: 'Soft delete prompt execution', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Soft delete functionality' },
            { endpoint: '/api/v1/prompt-executions/restore/{executionId}', method: 'PATCH', purpose: 'Restore soft-deleted execution', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Restore functionality' },
          ]
        },
        {
          screenName: 'Prompt Execution View',
          screenDescription: 'View prompt execution details',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/prompt-executions/get/{executionId}', method: 'GET', purpose: 'Get single prompt execution by ID', ai: 'AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'AI execution detail view' },
          ]
        },
      ]
    },
    {
      module: 'MODULE HIERARCHY',
      screens: [
        {
          screenName: 'Module Hierarchy View',
          screenDescription: 'Displays module-job-permission hierarchy',
          uxDesign: 'Done',
          apis: [
            { endpoint: '/api/v1/module-hierarchy/get', method: 'GET', purpose: 'Fetch module hierarchy with jobs and permissions', ai: 'Non-AI', devStatus: 'Developed', intStatus: 'Integrated', remarks: 'Permission hierarchy view' },
          ]
        },
      ]
    },
  ];

  // Module colors (alternating for visual distinction)
  const moduleColors = [
    'E2EFDA', // Light green
    'DDEBF7', // Light blue
    'FCE4D6', // Light orange
    'E2F0D9', // Pale green
    'D6DCE4', // Light gray-blue
    'FFF2CC', // Light yellow
    'F8CBAD', // Light salmon
    'BDD7EE', // Sky blue
    'C6EFCE', // Mint green
    'FFEB9C', // Light gold
  ];

  let currentRow = 2;
  let moduleIndex = 0;

  // Process each module
  for (const moduleData of modulesData) {
    const moduleStartRow = currentRow;
    const moduleColor = moduleColors[moduleIndex % moduleColors.length];
    let flowOrder = 1;

    // Calculate totals for this module
    let totalApis = 0;
    moduleData.screens.forEach(screen => {
      totalApis += screen.apis.length;
    });

    // Process each screen in the module
    for (let screenIdx = 0; screenIdx < moduleData.screens.length; screenIdx++) {
      const screen = moduleData.screens[screenIdx];
      const screenStartRow = currentRow;
      const screenApiCount = screen.apis.length;
      const devCount = screen.apis.filter(a => a.devStatus === 'Developed').length;
      const intCount = screen.apis.filter(a => a.intStatus === 'Integrated').length;
      const inProgressCount = screen.apis.filter(a => a.devStatus === 'In Progress').length;
      const notIntCount = screenApiCount - intCount;
      const devPercent = screenApiCount > 0 ? Math.round((devCount / screenApiCount) * 100) : 100;
      const intPercent = screenApiCount > 0 ? Math.round((intCount / screenApiCount) * 100) : 100;

      // Add each API as a row
      for (let apiIdx = 0; apiIdx < screen.apis.length; apiIdx++) {
        const api = screen.apis[apiIdx];
        const row = worksheet.addRow({
          module: apiIdx === 0 ? moduleData.module : '',
          screenName: apiIdx === 0 ? screen.screenName : '',
          screenDescription: apiIdx === 0 ? screen.screenDescription : '',
          uxDesign: apiIdx === 0 ? screen.uxDesign : '',
          flowOrder: flowOrder,
          apiEndpoint: api.endpoint,
          apiMethod: api.method,
          apiPurpose: api.purpose,
          aiNonAi: api.ai,
          devStatus: api.devStatus,
          intStatus: api.intStatus,
          totalApis: apiIdx === 0 ? screenApiCount : '',
          devCount: apiIdx === 0 ? devCount : '',
          inProgressCount: apiIdx === 0 ? inProgressCount : '',
          intCount: apiIdx === 0 ? intCount : '',
          notIntCount: apiIdx === 0 ? notIntCount : '',
          devPercent: apiIdx === 0 ? `${devPercent}%` : '',
          intPercent: apiIdx === 0 ? `${intPercent}%` : '',
          remarks: api.remarks,
        });

        flowOrder++;

        // Style the row
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'D9D9D9' } },
            left: { style: 'thin', color: { argb: 'D9D9D9' } },
            bottom: { style: 'thin', color: { argb: 'D9D9D9' } },
            right: { style: 'thin', color: { argb: 'D9D9D9' } }
          };
          cell.alignment = { vertical: 'middle', wrapText: true };
          cell.font = { size: 9 };

          // Module column styling
          if (colNumber === 1) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: '2E75B6' }
            };
            cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 9 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          }

          // Screen name column
          if (colNumber === 2) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: moduleColor }
            };
            cell.font = { bold: true, size: 9 };
          }

          // Screen description column
          if (colNumber === 3) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: moduleColor }
            };
          }

          // UX Design status
          if (colNumber === 4) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (cell.value === 'Done') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '92D050' } };
              cell.font = { bold: true, size: 9 };
            }
          }

          // Flow order
          if (colNumber === 5) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }

          // API Method styling
          if (colNumber === 7) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (cell.value === 'GET') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6EFCE' } };
              cell.font = { bold: true, color: { argb: '006100' }, size: 9 };
            } else if (cell.value === 'POST') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'BDD7EE' } };
              cell.font = { bold: true, color: { argb: '1F4E79' }, size: 9 };
            } else if (cell.value === 'PUT' || cell.value === 'PATCH') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE699' } };
              cell.font = { bold: true, color: { argb: '806000' }, size: 9 };
            } else if (cell.value === 'DELETE') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8CBAD' } };
              cell.font = { bold: true, color: { argb: 'C00000' }, size: 9 };
            }
          }

          // AI/Non-AI styling
          if (colNumber === 9) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (cell.value === 'AI') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2EFDA' } };
              cell.font = { bold: true, color: { argb: '375623' }, size: 9 };
            }
          }

          // Dev status styling
          if (colNumber === 10) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (cell.value === 'Developed') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '92D050' } };
              cell.font = { color: { argb: '000000' }, size: 9 };
            } else if (cell.value === 'In Progress') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } };
              cell.font = { color: { argb: '000000' }, size: 9 };
            }
          }

          // Integration status styling
          if (colNumber === 11) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (cell.value === 'Integrated') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '92D050' } };
              cell.font = { color: { argb: '000000' }, size: 9 };
            } else if (cell.value === 'Not Integrated') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } };
              cell.font = { color: { argb: '9C0006' }, size: 9 };
            }
          }

          // Percentage columns
          if (colNumber === 17 || colNumber === 18) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            const percentValue = parseInt(String(cell.value).replace('%', ''));
            if (percentValue === 100) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '92D050' } };
            } else if (percentValue >= 75) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6EFCE' } };
            } else if (percentValue >= 50) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } };
            } else if (percentValue > 0) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC7CE' } };
            }
          }

          // Count columns alignment
          if (colNumber >= 12 && colNumber <= 16) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        });

        currentRow++;
      }

      // Merge cells for screen (columns B, C, D, L-R)
      if (screen.apis.length > 1) {
        const mergeColumns = [2, 3, 4, 12, 13, 14, 15, 16, 17, 18];
        mergeColumns.forEach(col => {
          worksheet.mergeCells(screenStartRow, col, currentRow - 1, col);
        });
      }
    }

    // Merge Module column for all rows of this module
    if (currentRow - 1 > moduleStartRow) {
      worksheet.mergeCells(moduleStartRow, 1, currentRow - 1, 1);
    }

    // Add empty row after each module for visual separation
    const separatorRow = worksheet.addRow({});
    separatorRow.height = 5;
    currentRow++;

    moduleIndex++;
  }

  // Set print options
  worksheet.pageSetup.orientation = 'landscape';
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;

  // Save the workbook
  const outputPath = path.join(__dirname, 'Screen_API_Tracker.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Excel file generated successfully at: ${outputPath}`);
}

generateExcelTracker().catch(console.error);
