/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { Tag } from 'mainFe/Tag';
import { Skeleton } from 'mainFe/Skeleton';
import { Button } from 'mainFe/Button';
import { Message } from 'mainFe/Message';
import { useBreadcrumbTitle } from 'mainFe/BreadcrumbContext';
import { useSecureNavigation } from '../../hooks/useSecureNavigation';
import { feedbackMasterService, type FeedbackMaster } from '../../services/feedback-master.service';
import { extractErrorMessage } from '../../utils/error-handler';
import { useAuditNames } from '../../hooks/usePersonnelLookup';
import DeleteConfirmDialog from '../../components/dialogs/delete-confirm-dialog';
import styles from './FeedbackMasterView.module.css';
import { useCanUpdate, useCanDelete } from '../../hooks/usePermissions';
import { JOB_NAMES } from '../../constants/jobNames';

const FeedbackMasterView = () => {
  const { id, isReady, navigateToEdit, navigateToList } = useSecureNavigation({
    entity: 'feedback-master',
    basePath: '/feedback-master',
  });

  const canUpdate = useCanUpdate(JOB_NAMES.FEEDBACK_MASTER);
  const canDelete = useCanDelete(JOB_NAMES.FEEDBACK_MASTER);

  const [data, setData] = useState<FeedbackMaster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Set breadcrumb title to show feedback type instead of UUID
  useBreadcrumbTitle(data?.name);

  // Use cached personnel lookup for audit names
  const { createdByName, updatedByName } = useAuditNames(data?.createdBy, data?.updatedBy);

  useEffect(() => {
    // Wait for ID decryption to complete
    if (!isReady || !id) {
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await feedbackMasterService.getById(id);
        setData(res);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to fetch feedback master'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, id]);

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleEdit = () => {
    if (id) navigateToEdit(id);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    try {
      setDeleteLoading(true);
      await feedbackMasterService.delete(id);
      setDeleteDialogOpen(false);
      navigateToList();
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to delete feedback master'));
      setDeleteDialogOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  const getComponentTypeTag = (type: string) => {
    const typeConfig: Record<string, { severity: 'info' | 'success' | 'warning' | 'secondary' }> = {
      prompt: { severity: 'info' },
      api: { severity: 'success' },
      function: { severity: 'warning' },
      screen: { severity: 'secondary' },
    };
    const config = typeConfig[type] || { severity: 'info' };
    return <Tag value={type} severity={config.severity} className={styles.statusTag} />;
  };

  if (loading) {
    return (
      <div className={styles.container} data-testid="SCR-FeedbackMaster-View">
        <div className={styles.header}>
          <Skeleton width="150px" height="32px" className={styles.backButton} />
          <div className={styles.headerContent}>
            <div className={styles.headerText}>
              <Skeleton width="250px" height="28px" />
              <Skeleton width="200px" height="16px" style={{ marginTop: '0.5rem' }} />
            </div>
          </div>
        </div>
        <div className={styles.masterHeader}>
          <Skeleton width="64px" height="64px" borderRadius="8px" />
          <div style={{ flex: 1 }}>
            <Skeleton width="200px" height="24px" />
            <Skeleton width="150px" height="16px" style={{ marginTop: '0.5rem' }} />
          </div>
        </div>
        <div className={styles.contentGrid}>
          <div className={styles.card}>
            <Skeleton width="150px" height="20px" />
            <Skeleton width="100%" height="80px" style={{ marginTop: '1rem' }} />
          </div>
          <div className={styles.card}>
            <Skeleton width="150px" height="20px" />
            <Skeleton width="100%" height="80px" style={{ marginTop: '1rem' }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.errorContainer}>
        <Message severity="error" text={error || 'Feedback master not found'} className={styles.errorMessage} />
        <Button
          label="Back to Feedback Masters"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          onClick={() => navigateToList()}
        />
      </div>
    );
  }

  // Get liked and disliked options from the data
  const likedOptions = data.options?.likedOptions || [];
  const dislikedOptions = data.options?.dislikedOptions || [];

  return (
    <div className="p-3" data-testid="SCR-FeedbackMaster-View">
      {/* Header Section */}
      <div className="mb-2">
        <div className="flex items-center gap-2 mb-1.5">
          <Button
            icon="pi pi-arrow-left"
            severity="secondary"
            text
            rounded
            onClick={() => navigateToList()}
            className="p-0"
            style={{ width: '28px', height: '28px' }}
          />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Feedback Master Details</h1>
        </div>
      </div>

      {/* Master Header with Profile and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="w-12 h-12 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
            <i className="pi pi-comments text-xl text-purple-600 dark:text-purple-400" />
          </div>

          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{data.name}</h2>
              {(data as any).isDelete ? (
                <Tag value="Deleted" severity="danger" className="text-xs px-1.5 py-0.5" />
              ) : (
                <Tag value="Active" severity="success" className="text-xs px-1.5 py-0.5" />
              )}
              {getComponentTypeTag(data.componentType)}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{data.module?.name || 'No module'}</p>
          </div>
        </div>

        {/* Edit/Delete buttons aligned with profile row */}
        {!(data as any).isDelete && (
          <div className="flex gap-1.5 sm:self-center">
            {canUpdate && (
              <Button
                label="Edit"
                icon="pi pi-pencil"
                onClick={handleEdit}
                size="small"
              />
            )}
            {canDelete && (
              <Button
                label="Delete"
                icon="pi pi-trash"
                severity="danger"
                onClick={handleDeleteClick}
                size="small"
              />
            )}
          </div>
        )}
      </div>

      {/* Content Grid */}
      <div className={styles.contentGrid}>
        {/* Basic Information */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>
            <i className="pi pi-info-circle" />
            Basic Information
          </h3>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Name</span>
              <p className={styles.infoValue}>{data.name || '-'}</p>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Component Type</span>
              <p className={styles.infoValue}>{getComponentTypeTag(data.componentType)}</p>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Module</span>
              <p className={styles.infoValue}>{data.module?.name || '-'}</p>
            </div>
          </div>
        </div>

        {/* Feedback Options */}
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>
            <i className="pi pi-list" />
            Feedback Options
          </h3>
          <div className={styles.optionsContainer}>
            {/* Liked Options */}
            <div className={`${styles.optionsSection} ${styles.optionsSectionSuccess}`}>
              <h4 className={`${styles.optionsSectionTitle} ${styles.optionsSectionTitleSuccess}`}>
                <i className="pi pi-thumbs-up" />
                Liked Options ({likedOptions.length})
              </h4>
              {likedOptions.length > 0 ? (
                <div className={styles.optionsList}>
                  {likedOptions.map((option: string, index: number) => (
                    <Tag key={index} value={option} severity="success" />
                  ))}
                </div>
              ) : (
                <p className={styles.optionsEmpty}>No liked options configured</p>
              )}
            </div>

            {/* Disliked Options */}
            <div className={`${styles.optionsSection} ${styles.optionsSectionDanger}`}>
              <h4 className={`${styles.optionsSectionTitle} ${styles.optionsSectionTitleDanger}`}>
                <i className="pi pi-thumbs-down" />
                Disliked Options ({dislikedOptions.length})
              </h4>
              {dislikedOptions.length > 0 ? (
                <div className={styles.optionsList}>
                  {dislikedOptions.map((option: string, index: number) => (
                    <Tag key={index} value={option} severity="danger" />
                  ))}
                </div>
              ) : (
                <p className={styles.optionsEmpty}>No disliked options configured</p>
              )}
            </div>
          </div>
        </div>

        {/* Audit Information */}
        {/* <div className={`${styles.card} ${styles.cardFull}`}>
          <h3 className={styles.cardTitle}>
            <i className="pi pi-clock" />
            Audit Information
          </h3>
          <div className={`${styles.infoGrid} ${styles.infoGridFour}`}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Created At</span>
              <p className={styles.infoValue}>{formatDateTime(data.createdAt)}</p>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Created By</span>
              <p className={styles.infoValue}>{createdByName}</p>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Updated At</span>
              <p className={styles.infoValue}>{formatDateTime(data.updatedAt)}</p>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Updated By</span>
              <p className={styles.infoValue}>{updatedByName}</p>
            </div>
          </div>
        </div> */}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        visible={deleteDialogOpen}
        onCancel={handleDeleteCancel}
        onDelete={handleDeleteConfirm}
        message="Are you sure you want to delete this feedback master? This action will mark it as deleted."
        testId="FeedbackMasterView.Dialog.Delete"
        loading={deleteLoading}
      />
    </div>
  );
};

export default FeedbackMasterView;
