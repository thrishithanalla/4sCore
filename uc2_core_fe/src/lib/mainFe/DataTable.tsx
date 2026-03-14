import React from 'react';
import { DataTable as PrimeDataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import type { DataTableProps as PrimeDataTableProps } from 'primereact/datatable';
import type { ColumnProps } from 'primereact/column';

export interface DataTableColumn<T = any> extends Omit<ColumnProps, 'body'> {
  field?: string;
  header?: string;
  sortable?: boolean;
  body?: ((rowData: T, options?: any) => React.ReactNode) | React.ReactNode;
  editor?: (options: any) => React.ReactNode;
  onCellEditComplete?: (e: any) => void;
  style?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
  className?: string;
  frozen?: boolean;
  alignFrozen?: 'left' | 'right';
  exportable?: boolean;
  hidden?: boolean;
}

export interface DataTableComponentProps<T = any> extends Omit<PrimeDataTableProps<T[]>, 'value'> {
  data?: T[];
  columns?: DataTableColumn<T>[];
  testId?: string;
}

export function DataTable<T = any>({
  data,
  columns,
  testId,
  children,
  ...rest
}: DataTableComponentProps<T> & { children?: React.ReactNode }) {
  return (
    <PrimeDataTable
      value={data || (rest as any).value}
      data-testid={testId}
      {...rest}
    >
      {columns?.map((col, index) => (
        <Column key={col.field || index} {...col} />
      ))}
      {children}
    </PrimeDataTable>
  );
}

export default DataTable;
