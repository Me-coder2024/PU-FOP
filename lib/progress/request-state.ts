import type { MilestoneDefinition, ResearchSnapshot } from './types';
export type RequestState = 'pending' | 'overdue' | 'submitted' | 'revision_requested' | 'accepted';
export function requestState(record: ResearchSnapshot, definition: MilestoneDefinition, now: number): RequestState {
  const state = record.milestones.find(m => m.definition_id === definition.id)?.state || 'pending';
  if (state === 'accepted' || state === 'submitted') return state;
  if (definition.deadline && Date.parse(definition.deadline) < now) return 'overdue';
  return state;
}
export const requestLabels: Record<RequestState,string> = {
  pending:'Awaiting student update', overdue:'Overdue', submitted:'Awaiting review',
  revision_requested:'Revision requested', accepted:'Reviewed and accepted',
};
