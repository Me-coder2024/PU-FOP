export type StudentResearchState = 'pending' | 'submitted' | 'revision_requested' | 'accepted';
export type StudentResearchRecord = {
 assignment: { id: string; student_id: string; request_id: string; state: StudentResearchState };
 request: { id: string; name: string; stage: string; instructions: string; questions: string[]; deadline: string; created_at: string };
 studentName: string | null; universityId: string | null; isOwner: boolean;
 responses: { id: string; version: number; answers: Record<string,string>; submitted_at: string | null; deadline_at_submission: string | null; updated_at: string }[];
 history: { id: string; actor_id: string; action: string; response_id: string | null; remarks: string | null; old_deadline: string | null; new_deadline: string | null; created_at: string }[];
};
export type AssignmentRecipient = {id:string;name:string|null;universityId:string|null;roles:string[]};
export type StudentResearchSnapshot = { recipients?:AssignmentRecipient[]; needsInstitute?: boolean; facultyAccess?: boolean; role: string | null; students: { id: string; name: string | null; universityId: string | null }[]; records: StudentResearchRecord[] };
export function studentResearchStatus(record: StudentResearchRecord, now: number) {
 return ['pending','revision_requested'].includes(record.assignment.state) && Date.parse(record.request.deadline)<now ? 'overdue' : record.assignment.state;
}
