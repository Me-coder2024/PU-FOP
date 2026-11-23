/** Exact aliases: short names must never match arbitrary substrings. */
const aliases: Record<string, string> = {
  PHARMACEUTICS: 'PHARMACEUTICS',
  'INDUSTRIAL PHARMACY': 'INDUSTRIAL PHARMACY',
  'INDUSTRIAL PHARMACEUTICS': 'INDUSTRIAL PHARMACY',
  INDUSTRIAL: 'INDUSTRIAL PHARMACY',
  TECHNO: 'TECHNO PHARMACY',
  'TECHNO PHARMACY': 'TECHNO PHARMACY',
  'TECHNO - TECHNOLOGY': 'TECHNO PHARMACY',
  'PHARMACEUTICAL TECHNOLOGY': 'TECHNO PHARMACY',
  'REGULATORY AFFAIRS': 'REGULATORY AFFAIRS',
  PHARMACOLOGY: 'PHARMACOLOGY',
  'PHARMACEUTICAL CHEMISTRY': 'PHARMACEUTICAL CHEMISTRY',
  CHEMISTRY: 'PHARMACEUTICAL CHEMISTRY',
  'QUALITY ASSURANCE': 'QUALITY ASSURANCE', QA: 'QUALITY ASSURANCE',
  'PHARMACEUTICAL ANALYSIS': 'QUALITY ASSURANCE', PA: 'QUALITY ASSURANCE', ANALYSIS: 'QUALITY ASSURANCE',
  PHARMACOGNOSY: 'PHARMACOGNOSY', 'PHARMACY PRACTICE': 'PHARMACY PRACTICE',
};
export function resolveDepartment(name?: string | null): string | null {
  return aliases[(name || '').trim().replace(/\s+/g, ' ').toUpperCase()] || null;
}
export function isPilotDepartment(name?: string | null): boolean {
  return ['PHARMACOGNOSY', 'PHARMACY PRACTICE'].includes(resolveDepartment(name) || '');
}
export function pilotDepartmentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_APP_ENV === 'staging' && process.env.NEXT_PUBLIC_ENABLE_PILOT_DEPARTMENTS === 'true';
}
