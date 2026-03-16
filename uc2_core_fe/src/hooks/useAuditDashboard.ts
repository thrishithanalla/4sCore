import { useQuery } from '@tanstack/react-query';
import { logTransactionService } from '../services/log-transaction.service';
import type { AuditDashboardFilters } from '../types/log-transaction.types';

export const useAuditDashboard = (filters: AuditDashboardFilters) => {
  return useQuery({
    queryKey: ['audit-dashboard', filters],
    queryFn: () => logTransactionService.getDashboard(filters),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
};

export const useAllUsers = () => {
  return useQuery({
    queryKey: ['audit-dashboard-users'],
    queryFn: () => logTransactionService.getAllUsers(),
    staleTime: 5 * 60 * 1000,
  });
};

export const useAllTemplates = () => {
  return useQuery({
    queryKey: ['audit-dashboard-templates'],
    queryFn: () => logTransactionService.getAllTemplates(),
    staleTime: 5 * 60 * 1000,
  });
};
