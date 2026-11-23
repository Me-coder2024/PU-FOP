import type { SubmissionStatus } from '@/lib/supabase/types';
export function nextTitleAction(status: SubmissionStatus): string {
  const messages: Record<SubmissionStatus,string> = {
    submitted: 'Your title is awaiting guide review. No action is needed yet.',
    revision_requested: 'Read the reviewer remarks, revise your title form, and resubmit it to your guide.',
    guide_accepted: 'Your guide accepted the title. It is awaiting HOD review.',
    guide_rejected: 'Your guide rejected this title. Read the reason and consult your guide before submitting a new title.',
    hod_accepted: 'The HOD accepted the title. It is awaiting PG Director or Dean finalization.',
    hod_rejected: 'The HOD rejected this title. Read the reason and consult your department before submitting a new title.',
    finalized: 'Your title is finalized. Continue with the research milestones enabled below.',
  };
  return messages[status];
}
