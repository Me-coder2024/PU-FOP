import { resolveDepartment, isPilotDepartment, pilotDepartmentsEnabled } from './departments';
/**
 * Scoring Criteria Configuration
 *
 * 3-Level scoring system for dissertation proposal evaluation.
 * - Level 1 & Level 2: Same across ALL departments
 * - Level 3: Different PER department
 *
 * NOTE: Actual rubric content is pending input from the university.
 * Placeholder criteria are provided below.
 */

export interface ScoringCriterion {
  id: string;
  label: string;
  description: string;
  maxScore: number;
}

export interface ScoringLevel {
  name: string;
  description: string;
  criteria: ScoringCriterion[];
}

export const SCORING_CRITERIA = {
  /**
   * Level 1: Title Uniqueness — same for ALL departments.
   * Currently handled by the validate-title API (Layer 1).
   */
  level1: {
    name: 'Title Uniqueness',
    description: 'Checks whether the proposed title is sufficiently unique compared to the existing dissertation register.',
    criteria: [
      {
        id: 'l1_exact_match',
        label: 'Exact Title Match',
        description: 'Title must not be an exact duplicate of any existing dissertation.',
        maxScore: 0, // pass/fail
      },
      {
        id: 'l1_similarity',
        label: 'Similarity Threshold',
        description: 'Title word overlap with existing titles must be below 90%.',
        maxScore: 0, // pass/fail
      },
    ],
  } as ScoringLevel,

  /**
   * Level 2: AI Novelty Assessment — same for ALL departments.
   * Currently handled by the validate-title API (Layer 2) via Groq LLM.
   */
  level2: {
    name: 'AI Novelty Assessment',
    description: 'AI-powered evaluation of whether the research proposal brings genuine novelty compared to existing work.',
    criteria: [
      {
        id: 'l2_novelty',
        label: 'Research Novelty',
        description: 'AI evaluates if the title introduces a new drug, dosage form, technique, or approach vs. existing titles.',
        maxScore: 100, // confidence percentage
      },
      {
        id: 'l2_justification',
        label: 'Novelty Justification',
        description: 'The statement of novelty must adequately justify the uniqueness of the proposed research.',
        maxScore: 100,
      },
    ],
  } as ScoringLevel,

  /**
   * Level 3: Department-specific scoring criteria.
   *
   * For Pharmaceutics / Industrial Pharmacy / Techno Pharmacy,
   * the OLD alignment score (drug name + dosage form + keywords + excipients) is used.
   *
   * For other departments, department-specific criteria will be applied once
   * the university provides the rubric content.
   */
  level3_by_department: {
    /** Old-style alignment score — used by Pharmaceutics, Industrial, Techno */
    'PHARMACEUTICS': [
      { id: 'l3_drug_name', label: 'Drug Name in Title', description: 'Drug name appears in the dissertation title.', maxScore: 30 },
      { id: 'l3_dosage_form', label: 'Dosage Form in Title', description: 'Dosage form appears in the dissertation title.', maxScore: 35 },
      { id: 'l3_keywords', label: 'Keyword Relevance', description: 'Keywords are relevant to the title (AI verified).', maxScore: 15 },
      { id: 'l3_excipients', label: 'Excipient Relevance', description: 'Excipients are relevant to the title (AI verified).', maxScore: 15 },
    ] as ScoringCriterion[],

    /** Placeholder — awaiting rubric from university */
    'PHARMACEUTICAL CHEMISTRY': [
      { id: 'l3_compound_relevance', label: 'Compound Relevance', description: 'Target compound is relevant to the proposed therapeutic area.', maxScore: 25 },
      { id: 'l3_synthetic_feasibility', label: 'Synthetic Feasibility', description: 'Proposed synthetic route is feasible and well-described.', maxScore: 25 },
      { id: 'l3_characterization', label: 'Characterization Plan', description: 'Analytical characterization plan is complete.', maxScore: 25 },
      { id: 'l3_novelty_scaffold', label: 'Scaffold Novelty', description: 'Core scaffold / nucleus shows novelty.', maxScore: 20 },
    ] as ScoringCriterion[],

    /** Placeholder — awaiting rubric from university */
    'PHARMACOLOGY': [
      { id: 'l3_model_relevance', label: 'Model Relevance', description: 'Disease/screening model is appropriate for the therapeutic area.', maxScore: 25 },
      { id: 'l3_study_design', label: 'Study Design', description: 'Study design (dose, route, species) is scientifically sound.', maxScore: 25 },
      { id: 'l3_evaluation_params', label: 'Evaluation Parameters', description: 'Evaluation parameters are comprehensive and measurable.', maxScore: 25 },
      { id: 'l3_ethics', label: 'Ethics Preparedness', description: 'IAEC/IEC approval status is addressed.', maxScore: 20 },
    ] as ScoringCriterion[],

    /** Quality Assurance / Pharmaceutical Analysis scoring criteria */
    'QUALITY ASSURANCE': [
      {
        id: 'l3_qa_drug_match',
        label: 'Drug Name Presence in Title',
        description: 'Selected drug name(s) must appear in the dissertation title with at least 60% similarity match to allow submission.',
        maxScore: 100,
      },
      {
        id: 'l3_method_clarity',
        label: 'Method Development & Validation Scope',
        description: 'Analytical tool and validation parameters are clearly defined and appropriate for the drug analyte.',
        maxScore: 50,
      },
    ] as ScoringCriterion[],

    /** Placeholder — awaiting rubric from university */
    'REGULATORY AFFAIRS': [
      { id: 'l3_regulatory_scope', label: 'Regulatory Scope', description: 'Project domain and study type are well-defined.', maxScore: 25 },
      { id: 'l3_market_analysis', label: 'Market Analysis', description: 'Target market and regulatory guidelines are clearly identified.', maxScore: 25 },
      { id: 'l3_technical_modules', label: 'Technical Modules', description: 'Work modules and technical components are comprehensive.', maxScore: 25 },
      { id: 'l3_data_source', label: 'Data Source Clarity', description: 'Data source and research mode are specified.', maxScore: 20 },
    ] as ScoringCriterion[],

    /** Placeholder — awaiting rubric from university */
    'PHARMACEUTICAL ANALYSIS': [
      { id: 'l3_instrument_choice', label: 'Instrument Choice', description: 'Primary instrument selection is appropriate.', maxScore: 25 },
      { id: 'l3_validation_params', label: 'Validation Parameters', description: 'Proposed validation parameters are complete.', maxScore: 25 },
      { id: 'l3_sample_specs', label: 'Sample Specifications', description: 'Sample type and stability conditions are defined.', maxScore: 25 },
      { id: 'l3_novelty', label: 'Analytical Novelty', description: 'Method brings analytical novelty.', maxScore: 20 },
    ] as ScoringCriterion[],

    /** Placeholder — awaiting rubric from university */
    'PHARMACOGNOSY': [
      { id: 'l3_source_identification', label: 'Source Identification', description: 'Botanical/scientific name and part used are specified.', maxScore: 25 },
      { id: 'l3_extraction_method', label: 'Extraction Methodology', description: 'Extraction method is appropriate for the target constituents.', maxScore: 25 },
      { id: 'l3_evaluation', label: 'Evaluation Plan', description: 'Biological evaluation model is appropriate.', maxScore: 25 },
      { id: 'l3_ethics', label: 'Ethics & Standards', description: 'IAEC approval and reference standards are addressed.', maxScore: 20 },
    ] as ScoringCriterion[],

    /** Placeholder — awaiting rubric from university */
    'PHARMACY PRACTICE': [
      { id: 'l3_study_setting', label: 'Study Setting', description: 'Study setting and target population are well-defined.', maxScore: 25 },
      { id: 'l3_methodology', label: 'Research Methodology', description: 'Study design, data collection tools, and outcome measures are appropriate.', maxScore: 25 },
      { id: 'l3_ethics', label: 'Ethics & Consent', description: 'IEC approval and informed consent requirements are addressed.', maxScore: 25 },
      { id: 'l3_outcomes', label: 'Expected Outcomes', description: 'Deliverables and statistical tools are clearly stated.', maxScore: 20 },
    ] as ScoringCriterion[],
  } as Record<string, ScoringCriterion[]>,
};

// Aliases for Level 3 criteria
SCORING_CRITERIA.level3_by_department['INDUSTRIAL PHARMACY'] = SCORING_CRITERIA.level3_by_department['PHARMACEUTICS'];
SCORING_CRITERIA.level3_by_department['INDUSTRIAL PHARMACEUTICS'] = SCORING_CRITERIA.level3_by_department['PHARMACEUTICS'];
SCORING_CRITERIA.level3_by_department['TECHNO PHARMACY'] = SCORING_CRITERIA.level3_by_department['PHARMACEUTICS'];
SCORING_CRITERIA.level3_by_department['TECHNO - TECHNOLOGY'] = SCORING_CRITERIA.level3_by_department['PHARMACEUTICS'];
SCORING_CRITERIA.level3_by_department['PHARMACEUTICAL TECHNOLOGY'] = SCORING_CRITERIA.level3_by_department['PHARMACEUTICS'];
SCORING_CRITERIA.level3_by_department['CHEMISTRY'] = SCORING_CRITERIA.level3_by_department['PHARMACEUTICAL CHEMISTRY'];
SCORING_CRITERIA.level3_by_department['PHARMACEUTICAL ANALYSIS'] = SCORING_CRITERIA.level3_by_department['QUALITY ASSURANCE'];

/**
 * Category A: Departments that use the OLD flat form + OLD alignment scoring.
 * Pharmaceutics, Industry Pharmaceutics, Techno
 */
export const LEGACY_FORM_DEPARTMENTS = [
  'PHARMACEUTICS',
  'INDUSTRIAL PHARMACY',
  'INDUSTRIAL PHARMACEUTICS',
  'TECHNO PHARMACY',
  'TECHNO',
  'TECHNO - TECHNOLOGY',
  'PHARMACEUTICAL TECHNOLOGY',
];

/**
 * Category B: Departments that use the NEW dynamic schema-driven form.
 * Regulatory Affairs, Pharmacology, Pharmaceutical Chemistry, Quality Assurance, Pharmaceutical Analysis (QA and PA are identical)
 */
export const DYNAMIC_FORM_DEPARTMENTS = [
  'REGULATORY AFFAIRS',
  'PHARMACOLOGY',
  'PHARMACEUTICAL CHEMISTRY',
  'CHEMISTRY',
  'QUALITY ASSURANCE',
  'PHARMACEUTICAL ANALYSIS',
  'QA',
  'PA',
];

/**
 * Check if a department belongs to Category A (Legacy flat form).
 */
export function isLegacyFormDepartment(departmentName: string | null | undefined): boolean {
  return ['PHARMACEUTICS', 'INDUSTRIAL PHARMACY', 'TECHNO PHARMACY'].includes(resolveDepartment(departmentName) || '');
}

/**
 * Check if a department belongs to Category B (Dynamic schema form).
 */
export function isDynamicFormDepartment(departmentName: string | null | undefined): boolean {
  if (isPilotDepartment(departmentName)) return pilotDepartmentsEnabled();
  return ['REGULATORY AFFAIRS', 'PHARMACOLOGY', 'PHARMACEUTICAL CHEMISTRY', 'QUALITY ASSURANCE'].includes(resolveDepartment(departmentName) || '');
}

/**
 * Check if a department belongs to Category C (Coming Soon).
 */
export function isComingSoonDepartment(departmentName: string | null | undefined): boolean {
  if (!departmentName) return false;
  return !isLegacyFormDepartment(departmentName) && !isDynamicFormDepartment(departmentName);
}

/**
 * Get Level 3 criteria for a given department.
 * Unknown and pilot departments have no approved alignment scoring.
 */
export function getLevel3Criteria(departmentName: string): ScoringCriterion[] {
  const key = resolveDepartment(departmentName);
  if (!key || isPilotDepartment(key)) return [];
  return SCORING_CRITERIA.level3_by_department[key] || [];
}
