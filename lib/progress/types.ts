import type { SubmissionRow, AppRole } from '@/lib/supabase/types';
export type MilestoneDefinition = {
 target_submission_id: string | null; instructions: string; questions: string[];
 response_kind: 'text' | 'pptx'; created_by: string | null; created_at: string; request_key: string | null;
 id: string; name: string; institute_id: string | null; department_id: string | null;
 position: number; deadline: string | null; unlock_after: string | null;
 require_finalized_title: boolean; reviewer_roles: AppRole[]; allow_revision: boolean;
 allow_late: boolean; enabled: boolean; test_only: boolean; max_bytes: number;
};
export type Milestone = { id: string; submission_id: string; definition_id: string; state: 'pending' | 'submitted' | 'revision_requested' | 'accepted' };
export type ResearchFile = { id: string; milestone_id: string; uploaded_by: string; filename: string; size_bytes: number; object_path: string; sealed_path: string | null; state: 'uploading' | 'draft' | 'submitted'; created_at: string; submitted_at: string | null };
export type ResearchEvent = { id: string; milestone_id: string; file_id: string | null; update_id: string | null; actor_id: string; action: string; remarks: string | null; created_at: string };
export type ResearchUpdate = { id: string; milestone_id: string; student_id: string; version: number; answers: Record<string,string>; state: 'draft' | 'submitted'; created_at: string; updated_at: string; submitted_at: string | null; deadline_at_submission: string | null };
export type ResearchRequestEvent = { id: string; definition_id: string; actor_id: string; action: string; old_deadline: string | null; new_deadline: string | null; remarks: string | null; created_at: string };
export type ResearchSnapshot = { studentName: string | null; universityId: string | null; updates: ResearchUpdate[]; requestEvents: ResearchRequestEvent[]; submission: SubmissionRow; definitions: MilestoneDefinition[]; milestones: Milestone[]; files: Omit<ResearchFile, 'object_path' | 'sealed_path'>[]; events: ResearchEvent[]; isOwner: boolean; reviewerRole: AppRole };
