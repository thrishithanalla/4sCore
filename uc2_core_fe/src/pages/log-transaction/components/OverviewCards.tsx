import { StatCard } from 'mainFe/StatCard';
import type { AuditOverview, LevelBreakdown } from '../../../types/log-transaction.types';

interface OverviewCardsProps {
  overview: AuditOverview;
  byLevel: LevelBreakdown;
}

const OverviewCards = ({ overview, byLevel }: OverviewCardsProps) => {
  const total = byLevel.info + byLevel.warning + byLevel.error;
  const pct = (val: number) => total > 0 ? ((val / total) * 100).toFixed(1) : '0';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem', marginBottom: '0.5rem' }}>
      <StatCard
        title="Total Logs"
        value={overview.totalLogs.toLocaleString()}
        subtitle="All log entries"
        variant="blue"
        icon={<i className="pi pi-chart-line" />}
        // @ts-ignore
        horizontal
      />
      <StatCard
        title="Info"
        value={byLevel.info.toLocaleString()}
        subtitle={`${pct(byLevel.info)}% of total`}
        variant="green"
        icon={<i className="pi pi-info-circle" />}
        // @ts-ignore
        horizontal
      />
      <StatCard
        title="Warnings"
        value={byLevel.warning.toLocaleString()}
        subtitle={`${pct(byLevel.warning)}% of total`}
        variant="orange"
        icon={<i className="pi pi-exclamation-triangle" />}
        // @ts-ignore
        horizontal
      />
      <StatCard
        title="Errors"
        value={byLevel.error.toLocaleString()}
        subtitle={`${pct(byLevel.error)}% of total`}
        variant="red"
        icon={<i className="pi pi-times-circle" />}
        // @ts-ignore
        horizontal
      />
    </div>
  );
};

export default OverviewCards;
