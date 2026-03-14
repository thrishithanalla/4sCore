import { Button } from 'primereact/button';

interface RefreshButtonProps {
  onClick: () => void;
  loading?: boolean;
  testId?: string;
  className?: string;
}

export const RefreshButton = ({ onClick, loading = false, testId, className }: RefreshButtonProps) => (
  <Button
    icon={`pi pi-refresh ${loading ? 'pi-spin' : ''}`}
    rounded
    text
    severity="info"
    onClick={onClick}
    disabled={loading}
    data-testid={testId}
    className={className}
    tooltip="Refresh"
    tooltipOptions={{ position: 'top' }}
  />
);

export default RefreshButton;
