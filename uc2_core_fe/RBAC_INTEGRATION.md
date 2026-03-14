# RBAC Integration Guide for UC2 Core Service

This document explains how Role-Based Access Control (RBAC) has been integrated into the UC2 Core Service module and how to apply it to other pages.

## Overview

UC2 now has full RBAC integration with the following features:
- **Menu-level access control**: Side menu only shows items user has access to
- **Page-level access control**: Pages check if user has job access before rendering
- **Action-level access control**: CRUD buttons (Create, Update, Delete) only show if user has the respective permissions

## Architecture

### 1. Permission Hook (`src/hooks/usePermissions.ts`)

Custom hook that wraps main_fe's permission system for UC2:

```typescript
import { usePermissions, useCanCreate, useCanRead, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';

const MyComponent = () => {
  const canCreate = useCanCreate('jobs'); // Check if user can create jobs
  const canUpdate = useCanUpdate('jobs'); // Check if user can update jobs
  const canDelete = useCanDelete('jobs'); // Check if user can delete jobs

  return (
    <>
      {canCreate && <Button onClick={handleCreate}>Create</Button>}
      {canUpdate && <Button onClick={handleEdit}>Edit</Button>}
      {canDelete && <Button onClick={handleDelete}>Delete</Button>}
    </>
  );
};
```

### 2. PermissionGuard Component (`src/components/guards/PermissionGuard.tsx`)

Component that wraps pages to check job access:

```typescript
import PermissionGuard from '../../components/guards/PermissionGuard';

const MyPage = () => {
  return (
    <PermissionGuard jobName="jobs">
      {/* Page content here */}
    </PermissionGuard>
  );
};
```

## How to Apply RBAC to a Page

### Step 1: Import Required Hooks and Components

```typescript
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
```

### Step 2: Add Permission Checks in Component

```typescript
const MyListPage = () => {
  const canCreate = useCanCreate('myjob');
  const canUpdate = useCanUpdate('myjob');
  const canDelete = useCanDelete('myjob');

  // Rest of component code...
};
```

### Step 3: Wrap Page Content with PermissionGuard

```typescript
return (
  <PermissionGuard jobName="myjob">
    <div>
      {/* Your page content */}
    </div>
  </PermissionGuard>
);
```

### Step 4: Conditionally Render Action Buttons

```typescript
// In your render/return:
{canCreate && (
  <Button onClick={handleCreate}>Add New</Button>
)}

// In data table actions column:
{canUpdate && (
  <button onClick={() => handleEdit(id)}>
    <i className="pi pi-pencil" />
  </button>
)}

{canDelete && (
  <button onClick={() => handleDelete(id)}>
    <i className="pi pi-trash" />
  </button>
)}
```

## Complete Example: Applying RBAC to a List Page

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Button } from 'mainFe/Button';
import { DataTable } from 'mainFe/DataTable';
import PermissionGuard from '../../components/guards/PermissionGuard';
import { useCanCreate, useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { fetchItems, deleteItem } from '../../services/my.service';

const MyListPage = () => {
  const canCreate = useCanCreate('myjob');
  const canUpdate = useCanUpdate('myjob');
  const canDelete = useCanDelete('myjob');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // ... load data logic

  const columns = useMemo(
    () => [
      { field: 'name', header: 'Name', sortable: true },
      {
        field: 'actions',
        header: 'Actions',
        body: (row) => (
          <div className="flex gap-2">
            <button onClick={() => handleView(row.id)}>
              <i className="pi pi-eye" />
            </button>
            {canUpdate && (
              <button onClick={() => handleEdit(row.id)}>
                <i className="pi pi-pencil" />
              </button>
            )}
            {canDelete && (
              <button onClick={() => handleDelete(row.id)}>
                <i className="pi pi-trash" />
              </button>
            )}
          </div>
        ),
      },
    ],
    [canUpdate, canDelete]
  );

  return (
    <PermissionGuard jobName="myjob">
      <div className="py-8 px-6">
        <div className="flex justify-between mb-4">
          <h1>My Items</h1>
          {canCreate && (
            <Button
              label="Add New"
              icon="pi pi-plus"
              onClick={() => navigate('/myjob/create')}
            />
          )}
        </div>

        <DataTable data={items} columns={columns} loading={loading} />
      </div>
    </PermissionGuard>
  );
};

export default MyListPage;
```

## Complete Example: Applying RBAC to a Form Page (Create/Edit)

```typescript
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Message } from 'primereact/message';
import { Button } from 'mainFe/Button';
import { useCanCreate, useCanUpdate } from '../../hooks/usePermissions';
import { getItemById, createItem, updateItem } from '../../services/my.service';

const MyFormPage = () => {
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const canCreate = useCanCreate('myjob');
  const canUpdate = useCanUpdate('myjob');

  const [formData, setFormData] = useState({ name: '' });
  const [loading, setLoading] = useState(false);

  // Check permissions - only allow if user can create (new) or update (edit)
  const hasRequiredPermission = isEditMode ? canUpdate : canCreate;

  if (!hasRequiredPermission) {
    return (
      <div className="py-6 px-4">
        <Message
          severity="error"
          text={`You don't have permission to ${isEditMode ? 'edit' : 'create'} this item.`}
        />
      </div>
    );
  }

  const handleSubmit = async () => {
    if (isEditMode) {
      await updateItem(id, formData);
    } else {
      await createItem(formData);
    }
  };

  return (
    <div className="py-8 px-6">
      <h1>{isEditMode ? 'Edit' : 'Create'} Item</h1>

      {/* Form fields */}

      <div className="flex gap-2">
        <Button label="Cancel" onClick={() => navigate('/myjob')} />
        <Button
          label={isEditMode ? 'Update' : 'Create'}
          onClick={handleSubmit}
          disabled={loading}
        />
      </div>
    </div>
  );
};

export default MyFormPage;
```

## Job Names Reference

Make sure to use the correct job name (lowercase) when checking permissions:

| Page/Feature | Job Name |
|--------------|----------|
| Roles | `roles` |
| Modules | `modules` |
| Jobs | `jobs` |
| Permissions | `permissions` |
| Units | `units` |
| Personnel | `personnels` |
| Departments | `departments` |
| Districts | `district` |
| Unit Types | `unittype` |
| Value Sets | `valuesets` |

## Permission Types

Available permission types:
- `create` - Can create new records
- `read` / `view` - Can view records
- `update` - Can edit existing records
- `delete` - Can delete records
- `execute` - Can execute special actions

## Testing RBAC

1. **Test with different roles**: Create test users with different role assignments
2. **Verify menu visibility**: Check that side menu only shows accessible items
3. **Test page access**: Try accessing pages directly via URL without permission
4. **Verify button visibility**: Ensure CRUD buttons only show when user has permission
5. **Test form submission**: Ensure forms check permissions before saving

## Common Issues

### Issue: Buttons still showing even without permission
**Solution**: Make sure to add the permission check and include the permission variables in the `useMemo` dependency array for columns.

### Issue: Page shows briefly before redirecting
**Solution**: Add the PermissionGuard wrapper and ensure it's at the top level of your component return.

### Issue: Permission checks not working
**Solution**: Verify the job name is correct (lowercase, matches backend) and that permissions are loaded in Redux store.

## Already Integrated

The following pages have RBAC fully integrated:
- ✅ Roles List (`/roles`)
- ✅ Roles Create/Edit (`/roles/create`, `/roles/:id/edit`)
- ✅ Roles View (`/roles/:id`)

## Next Steps

Apply RBAC to remaining pages following the patterns above:
1. Import hooks and PermissionGuard
2. Add permission checks
3. Wrap with PermissionGuard
4. Conditionally render action buttons
5. Test with different user roles
