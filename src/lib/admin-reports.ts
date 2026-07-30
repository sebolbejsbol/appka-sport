import { t } from '@/i18n';
import type { ReportReason } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

export type UserReportStatus = 'pending' | 'reviewed' | 'dismissed';

export type AdminUserReportItem = {
  id: string;
  reporter_id: string;
  reporter_nick: string | null;
  reported_user_id: string;
  reported_nick: string | null;
  reason: ReportReason;
  details: string | null;
  status: UserReportStatus;
  created_at: string;
};

export type UpdateUserReportResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'already_closed'
  | 'invalid_status'
  | 'not_authenticated'
  | 'error';

function mapReportRow(raw: Record<string, unknown>): AdminUserReportItem {
  const reason = raw.reason;
  const validReason =
    reason === 'spam' ||
    reason === 'harassment' ||
    reason === 'inappropriate' ||
    reason === 'other'
      ? reason
      : 'other';

  const status = raw.status;
  const validStatus =
    status === 'pending' || status === 'reviewed' || status === 'dismissed'
      ? status
      : 'pending';

  return {
    id: String(raw.id ?? ''),
    reporter_id: String(raw.reporter_id ?? ''),
    reporter_nick: typeof raw.reporter_nick === 'string' ? raw.reporter_nick : null,
    reported_user_id: String(raw.reported_user_id ?? ''),
    reported_nick: typeof raw.reported_nick === 'string' ? raw.reported_nick : null,
    reason: validReason,
    details: typeof raw.details === 'string' ? raw.details : null,
    status: validStatus,
    created_at: String(raw.created_at ?? ''),
  };
}

export function reportReasonLabel(reason: ReportReason): string {
  switch (reason) {
    case 'spam':
      return t('moderation.reasonSpam');
    case 'harassment':
      return t('moderation.reasonHarassment');
    case 'inappropriate':
      return t('moderation.reasonInappropriate');
    default:
      return t('moderation.reasonOther');
  }
}

export async function getAdminUserReportsQueue(
  status: UserReportStatus = 'pending',
): Promise<{ data: AdminUserReportItem[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('admin_user_reports_queue', {
    p_status: status,
    p_max_rows: 50,
  });

  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapReportRow),
    error: null,
  };
}

export async function updateUserReportStatus(
  reportId: string,
  status: 'reviewed' | 'dismissed',
): Promise<UpdateUserReportResult> {
  const { data, error } = await supabase.rpc('admin_update_user_report', {
    p_report_id: reportId,
    p_status: status,
  });
  if (error) return 'error';
  return (data as UpdateUserReportResult | null) ?? 'error';
}
