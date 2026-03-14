const fs = require('fs');
const path = require('path');

const files = [
  'src/components/ui/data-table.tsx',
  'src/features/auth/authSlice.ts',
  'src/pages/units/units-list.tsx',
  'src/pages/personnel/personnel-list.tsx',
  'src/pages/unit-villages/unit-villages-list.tsx',
  'src/services/api.ts',
  'src/services/auth.service.ts',
  'src/services/units.service.ts',
  'src/services/personnel.service.ts',
  'src/services/unit-villages.service.ts',
  'src/store/hooks.ts',
  'src/utils/theme.tsx',
  'src/pages/dashboard.tsx'
];

const replacements = [
  // DataGrid types
  { from: "import {\n  DataGrid,\n  GridColDef,\n  GridRowsProp,", to: "import {\n  DataGrid,\n  type GridColDef,\n  type GridRowsProp," },
  { from: "import { GridColDef }", to: "import type { GridColDef }" },

  // Auth types
  { from: "import { createSlice, createAsyncThunk, PayloadAction }", to: "import { createSlice, createAsyncThunk }" },
  { from: "import { LoginRequest, User }", to: "import type { LoginRequest, User }" },
  { from: "import { LoginRequest, AuthResponse, User }", to: "import type { LoginRequest, AuthResponse, User }" },

  // Unit types
  { from: "import { Unit }", to: "import type { Unit }" },
  { from: "import { Unit, UnitCreateRequest, DeleteResponse }", to: "import type { Unit, UnitCreateRequest, DeleteResponse }" },

  // Personnel types
  { from: "import { Personnel }", to: "import type { Personnel }" },
  { from: "import { Personnel, PersonnelCreateRequest, DeleteResponse }", to: "import type { Personnel, PersonnelCreateRequest, DeleteResponse }" },

  // Unit Village types
  { from: "import { UnitVillage }", to: "import type { UnitVillage }" },
  { from: "import { UnitVillage, UnitVillageCreateRequest, DeleteResponse }", to: "import type { UnitVillage, UnitVillageCreateRequest, DeleteResponse }" },

  // Axios types
  { from: "import axios, { AxiosInstance, InternalAxiosRequestConfig }", to: "import axios, { type AxiosInstance, type InternalAxiosRequestConfig }" },

  // React types
  { from: "import { TypedUseSelectorHook, useDispatch, useSelector }", to: "import { type TypedUseSelectorHook, useDispatch, useSelector }" },
  { from: "import { createContext, useContext, useEffect, useState, ReactNode }", to: "import { createContext, useContext, useEffect, useState, type ReactNode }" },
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    replacements.forEach(({ from, to }) => {
      if (content.includes(from)) {
        content = content.replace(from, to);
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Fixed: ${file}`);
    }
  }
});

console.log('Import fixes completed!');
