import { ProgressSpinner } from 'primereact/progressspinner';

export const LoadingSpinner = ({ className }: { className?: string }) => (
  <div className={`flex justify-center items-center p-8 ${className || ''}`}>
    <ProgressSpinner style={{ width: '50px', height: '50px' }} />
  </div>
);

export default LoadingSpinner;
