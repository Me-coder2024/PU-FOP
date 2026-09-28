'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Dropdown from '@/components/ui/Dropdown';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Icon } from '@iconify/react';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Zap,
  Search,
  Info,
  Lightbulb,
  Brain,
  Loader2,
} from 'lucide-react';

interface TitleSuggestion {
  title: string;
  year: number;
  similarity: number;
}

interface TitleMessage {
  type: 'success' | 'warning' | 'error' | 'info';
  text: string;
}

interface SubmitTitleFormProps {
  department: string;
  data: any;
  onChange: (name: string, value: any) => void;
  titleSuggestions?: TitleSuggestion[];
  titleMessage?: TitleMessage | null;
  noveltyMessage?: TitleMessage | null;
  aiSuggestions?: string[];
  aiLoading?: boolean;
  drugSuggestion?: { original: string; suggested: string; confidence: number } | null;
  dosageSuggestion?: { original: string; suggested: string; confidence: number } | null;
  disabled?: boolean;
}

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'dropdown' | 'checkbox_group' | 'radio' | 'file' | 'drug_multiselect';
  options?: string[];
  required?: boolean;
  condition?: (data: any) => boolean;
  placeholder?: string;
}

export interface SectionDef {
  title: string;
  fields: FieldDef[];
}

const COMMON_DELIVERABLES = [
  'Publication',
  'Patent',
  'Prototype',
  'Database',
  'Technology Transfer',
  'Monograph',
];

/** QA-specific deliverables (from spec — includes additional items) */
const QA_DELIVERABLES = [
  'Publication',
  'Patent',
  'SOP',
  'Method Transfer',
  'Prototype',
  'Database',
  'Technology Transfer',
  'Monograph',
];

export const DEPARTMENT_SCHEMAS: Record<string, SectionDef[]> = {
  'PHARMACEUTICAL CHEMISTRY': [
    {
      title: 'Fundamental Information',
      fields: [
        {
          name: 'title',
          label: 'Dissertation Title',
          type: 'text',
          required: true,
          placeholder: 'Enter proposed research title',
        },
      ],
    },
    {
      title: 'Target Compound Info',
      fields: [
        {
          name: 'compoundName',
          label: 'Compound / Lead Molecule Name',
          type: 'text',
          required: true,
          placeholder: 'e.g., Novel Pyrazole Derivatives',
        },
        {
          name: 'category',
          label: 'Category',
          type: 'dropdown',
          required: true,
          options: [
            'Synthetic',
            'Natural Product',
            'Semi-synthetic',
            'Peptide',
            'Heterocyclic',
            'Metal Complex',
          ],
        },
      ],
    },
    {
      title: 'Research Mode',
      fields: [
        {
          name: 'workType',
          label: 'Work Type',
          type: 'dropdown',
          required: true,
          options: ['Dry Lab', 'Wet Lab', 'Hybrid'],
        },
        {
          name: 'dryLabComponents',
          label: 'Dry Lab Components',
          type: 'checkbox_group',
          options: [
            'Molecular Docking',
            'QSAR',
            'ADMET',
            'Pharmacophore',
            'MD Simulation',
            'Virtual Screening',
          ],
          condition: (d) => d.workType === 'Dry Lab' || d.workType === 'Hybrid',
        },
        {
          name: 'wetLabComponents',
          label: 'Wet Lab Components',
          type: 'checkbox_group',
          options: [
            'Synthesis',
            'Extraction',
            'Purification',
            'Characterization',
            'Method Development',
            'Bioassay',
          ],
          condition: (d) => d.workType === 'Wet Lab' || d.workType === 'Hybrid',
        },
      ],
    },
    {
      title: 'Therapeutic Area',
      fields: [
        {
          name: 'therapeuticArea',
          label: 'Intended Use',
          type: 'checkbox_group',
          options: [
            'Anticancer',
            'Antimicrobial',
            'Antidiabetic',
            'CNS',
            'CVS',
            'Anti-inflammatory',
            'Antiviral',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Chemical Design',
      fields: [
        {
          name: 'coreScaffold',
          label: 'Core Scaffold / Nucleus',
          type: 'text',
          placeholder: 'e.g., Thiazolidinedione',
        },
        {
          name: 'numberOfCompounds',
          label: 'Number of Proposed Compounds',
          type: 'text',
          placeholder: 'e.g., 10',
        },
      ],
    },
    {
      title: 'Synthesis Details',
      fields: [
        {
          name: 'syntheticRoute',
          label: 'Synthetic Route',
          type: 'textarea',
          placeholder: 'Detail the anticipated reaction sequence...',
        },
        {
          name: 'syntheticRouteUpload',
          label: 'Upload Scheme (optional)',
          type: 'file',
        },
        {
          name: 'reactionType',
          label: 'Reaction Type',
          type: 'dropdown',
          options: [
            'Condensation',
            'Cyclization',
            'Substitution',
            'Reduction',
            'Oxidation',
            'Coupling',
            'Multistep',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Characterization',
      fields: [
        {
          name: 'tests',
          label: 'Required Tests',
          type: 'checkbox_group',
          options: ['TLC', 'IR', 'NMR', 'Mass', 'HPLC', 'Elemental Analysis', 'XRD', 'DSC', 'SEM'],
        },
      ],
    },
    {
      title: 'Novelty & Expected Outcomes',
      fields: [
        {
          name: 'noveltyStatement',
          label: 'Statement of Novelty',
          type: 'textarea',
          placeholder: 'Describe the unique chemical or pharmacological aspect of this research.',
        },
        {
          name: 'literatureGap',
          label: 'Identified Literature Gap',
          type: 'textarea',
          placeholder: 'Specify the scientific gap this research addresses.',
        },
        { name: 'deliverables', label: 'Expected Deliverables', type: 'checkbox_group', options: COMMON_DELIVERABLES },
      ],
    },
  ],
  'PHARMACEUTICS': [
    // NOTE: This schema is also used by INDUSTRIAL PHARMACY and TECHNO PHARMACY (see aliases below)
    {
      title: 'Dissertation',
      fields: [{ name: 'title', label: 'Proposed Title', type: 'text', required: true }],
    },
    {
      title: 'Drug Info',
      fields: [
        { name: 'drugName', label: 'Drug Name', type: 'text', required: true },
        {
          name: 'category',
          label: 'Category',
          type: 'dropdown',
          options: ['Synthetic', 'Herbal', 'Biologic'],
          required: true,
        },
      ],
    },
    {
      title: 'Formulation Info',
      fields: [
        {
          name: 'dosageForm',
          label: 'Dosage Form',
          type: 'dropdown',
          options: ['Tablet', 'Capsule', 'Liquid', 'Topical', 'Injectable', 'NDDS', 'Emulgel', 'Scaffold formulation', 'Nano structured Lipid carriers', 'NLC-loaded biodegradable polymeric scaffold (nanocomposite/medicated sponge dressing)', 'Other'],
          required: true,
        },
        {
          name: 'route',
          label: 'Route of Administration',
          type: 'dropdown',
          options: ['Oral', 'Topical', 'Parenteral', 'Nasal', 'Ocular', 'Other'],
          required: true,
        },
      ],
    },
    {
      title: 'Project Details',
      fields: [
        {
          name: 'studyType',
          label: 'Study Type',
          type: 'dropdown',
          options: ['Development', 'Optimization', 'Comparative', 'Stability', 'Validation'],
          required: true,
        },
      ],
    },
    {
      title: 'Excipient Info',
      fields: [
        { name: 'excipient', label: 'Key Polymer / Excipient', type: 'text', required: true },
        {
          name: 'functionalRole',
          label: 'Functional Role',
          type: 'dropdown',
          options: ['Binder', 'Polymer', 'Surfactant', 'Preservative', 'Other'],
          required: true,
        },
      ],
    },
    {
      title: 'Biological Evaluation',
      fields: [
        {
          name: 'studyModel',
          label: 'Study Model',
          type: 'checkbox_group',
          options: ['In vitro', 'Ex vivo', 'In vivo'],
          required: true,
        },
        {
          name: 'inVitroDetails',
          label: 'In vitro Details',
          type: 'dropdown',
          options: ['Release Study', 'Cell Line', 'Cytotoxicity', 'Permeation'],
          condition: (d) => Array.isArray(d.studyModel) && d.studyModel.includes('In vitro'),
          required: true,
        },
        {
          name: 'exVivoDetails',
          label: 'Ex vivo Details',
          type: 'dropdown',
          options: ['Skin', 'Buccal Mucosa', 'Intestinal Sac', 'Cornea'],
          condition: (d) => Array.isArray(d.studyModel) && d.studyModel.includes('Ex vivo'),
          required: true,
        },
        {
          name: 'inVivoDetails',
          label: 'In vivo Details',
          type: 'dropdown',
          options: ['PK Study', 'PD Study', 'Efficacy', 'Irritation', 'Biodistribution'],
          condition: (d) => Array.isArray(d.studyModel) && d.studyModel.includes('In vivo'),
          required: true,
        },
      ],
    },
    {
      title: 'Ethics Approval',
      fields: [
        { name: 'iaecApproval', label: 'IAEC Approval Required', type: 'radio', options: ['Yes', 'No'] },
        { name: 'iecApproval', label: 'IEC Approval Required', type: 'radio', options: ['Yes', 'No'] },
      ],
    },
    {
      title: 'Novelty & Justification',
      fields: [{ name: 'novelty', label: 'Novelty Statement', type: 'textarea', required: true }],
    },
    {
      title: 'Execution',
      fields: [
        {
          name: 'workLocation',
          label: 'Work Location',
          type: 'dropdown',
          options: ['College', 'Industry', 'CRO', 'Hybrid'],
          required: true,
        },
      ],
    },
    {
      title: 'Keywords',
      fields: [
        {
          name: 'keywords',
          label: 'Research Keywords',
          type: 'text',
          placeholder: 'e.g., nanoparticle, sustained release, bioavailability enhancement',
          required: true,
        },
      ],
    },
    {
      title: 'Expected Outcome',
      fields: [
        {
          name: 'deliverables',
          label: 'Deliverables',
          type: 'checkbox_group',
          options: ['Publication', 'Patent', 'Prototype', 'Technology Transfer', 'Product'],
          required: true,
        },
      ],
    },
  ],
  // Industrial Pharmacy and Techno Pharmacy share the same form schema as Pharmaceutics
  'INDUSTRIAL PHARMACY': [], // populated below via alias
  'TECHNO PHARMACY': [],     // populated below via alias
  'QUALITY ASSURANCE': [
    {
      title: 'Product Info',
      fields: [
        { name: 'title', label: 'Dissertation Title', type: 'text', required: true },
        {
          name: 'drugName',
          label: 'Drug Name(s)',
          type: 'drug_multiselect',
          required: true,
          placeholder: 'Search and select drugs from database...',
        },
        {
          name: 'drugCategoryType',
          label: 'Drug Classification',
          type: 'dropdown',
          required: true,
          options: ['Single Drug', 'Combination', 'Herbal Marker', 'Impurity'],
        },
        { name: 'productName', label: 'Product Name', type: 'text' },
        {
          name: 'dosageForm',
          label: 'Dosage Form',
          type: 'dropdown',
          options: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'API', 'Herbal Product', 'Other'],
        },
      ],
    },
    {
      title: 'Project Details',
      fields: [
        {
          name: 'qaDomain',
          label: 'Project Domain',
          type: 'dropdown',
          required: true,
          options: [
            'Analytical QA',
            'Formulation QA',
            'Manufacturing QA',
            'Stability QA',
            'Regulatory QA',
            'Synthesis QA',
            'Risk Analysis',
          ],
        },
        {
          name: 'studyType',
          label: 'Study Type',
          type: 'dropdown',
          required: true,
          options: [
            'Method Development + Validation',
            'Comparative Study',
            'Stability Study',
            'Optimization',
            'Troubleshooting',
            'Audit Support',
          ],
        },
      ],
    },
    {
      title: 'Method / Technique',
      fields: [
        {
          name: 'analyticalTool',
          label: 'Main Tool Used',
          type: 'dropdown',
          required: true,
          options: [
            'HPLC',
            'HPTLC',
            'HTLC',
            'UV',
            'GC',
            'LC-MS',
            'Dissolution',
            'GC-MS',
            'FTIR',
            'Titration',
            'ICP-MS',
            'Other',
          ],
        },
        {
          name: 'otherAnalyticalTool',
          label: 'Specify Other Instrument / Tool',
          type: 'text',
          required: true,
          condition: (d) => d.analyticalTool === 'Other',
          placeholder: 'e.g., Enter instrument type...',
        },
        {
          name: 'validationType',
          label: 'Validation Type',
          type: 'checkbox_group',
          options: [
            'Analytical Method',
            'Process',
            'Cleaning',
            'Equipment',
            'Computer System',
            'Formulation Validation',
          ],
        },
      ],
    },
    {
      title: 'Execution Mode',
      fields: [
        {
          name: 'workLocation',
          label: 'Work Location',
          type: 'dropdown',
          required: true,
          options: ['College', 'Industry', 'Hybrid'],
        },
      ],
    },
    {
      title: 'Part A – College Work',
      fields: [
        {
          name: 'collegeActivities',
          label: 'Activities',
          type: 'checkbox_group',
          options: [
            'Literature Review',
            'Method Development',
            'Validation',
            'Data Analysis',
            'Trial Work',
          ],
          condition: (d) => d.workLocation === 'College' || d.workLocation === 'Hybrid',
        },
      ],
    },
    {
      title: 'Part B – Industry Work',
      fields: [
        {
          name: 'industryActivities',
          label: 'Activities',
          type: 'checkbox_group',
          options: [
            'Pilot Batch',
            'Process Validation',
            'Stability Chamber',
            'Commercial Product Study',
            'Advanced Instrumentation',
          ],
          condition: (d) => d.workLocation === 'Industry' || d.workLocation === 'Hybrid',
        },
      ],
    },
    {
      title: 'Industry Details',
      fields: [
        {
          name: 'industryName',
          label: 'Industry Name',
          type: 'text',
          condition: (d) => d.workLocation === 'Industry' || d.workLocation === 'Hybrid',
        },
        {
          name: 'permissionLetter',
          label: 'Permission Letter',
          type: 'file',
          condition: (d) => d.workLocation === 'Industry' || d.workLocation === 'Hybrid',
        },
      ],
    },
    {
      title: 'Facilities Required',
      fields: [
        {
          name: 'facilities',
          label: 'Instruments / Labs',
          type: 'checkbox_group',
          options: [
            'HPLC',
            'Dissolution',
            'FTIR',
            'GC',
            'Stability Chamber',
            'Manufacturing Unit',
            'Microbiology Lab',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Novelty & Justification',
      fields: [
        { name: 'novelty', label: 'Novelty Statement', type: 'textarea', required: true },
        { name: 'literatureGap', label: 'Literature Gap / Rationale', type: 'textarea' },
      ],
    },
    {
      title: 'Expected Deliverables',
      fields: [
        { name: 'deliverables', label: 'Expected Deliverables', type: 'checkbox_group', options: QA_DELIVERABLES },
      ],
    },
  ],
  'REGULATORY AFFAIRS': [
    {
      title: 'Product Info',
      fields: [
        { name: 'title', label: 'Dissertation Title', type: 'text', required: true },
        { name: 'productName', label: 'Product / Drug Name', type: 'text', required: true },
        {
          name: 'category',
          label: 'Category',
          type: 'dropdown',
          required: true,
          options: [
            'API',
            'Tablet',
            'Capsule',
            'Injection',
            'Biologic',
            'Herbal',
            'Medical Device',
            'Cosmetic',
            'Other',
          ],
        },
        {
          name: 'marketType',
          label: 'Market Type',
          type: 'dropdown',
          options: ['Domestic', 'Export', 'Global', 'Other'],
        },
      ],
    },
    {
      title: 'Regulatory Scope',
      fields: [
        {
          name: 'regulatoryDomain',
          label: 'Project Domain',
          type: 'dropdown',
          required: true,
          options: [
            'Dossier Preparation',
            'ANDA',
            'CTD',
            'eCTD',
            'DMF',
            'Regulatory Strategy',
            'Labeling',
            'Pharmacovigilance',
            'GMP Compliance',
            'Audit',
            'Medical Device Regulation',
            'Other',
          ],
        },
        {
          name: 'studyType',
          label: 'Study Type',
          type: 'dropdown',
          required: true,
          options: [
            'Gap Analysis',
            'Comparative Study',
            'Submission Review',
            'Compliance Assessment',
            'Strategy Development',
            'Case Study',
            'Lifecycle Management',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Target Market',
      fields: [
        {
          name: 'targetCountry',
          label: 'Primary Country / Region',
          type: 'dropdown',
          required: true,
          options: [
            'India',
            'USA',
            'EU',
            'UK',
            'Canada',
            'Australia',
            'Japan',
            'WHO',
            'ASEAN',
            'GCC',
            'Global',
            'Other',
          ],
        },
        {
          name: 'secondaryCountries',
          label: 'Secondary Country / Region',
          type: 'checkbox_group',
          options: [
            'India',
            'USA',
            'EU',
            'UK',
            'Canada',
            'Australia',
            'Japan',
            'WHO',
            'ASEAN',
            'GCC',
            'Global',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Reference Guidelines',
      fields: [
        {
          name: 'guidelines',
          label: 'Main Standards Used',
          type: 'checkbox_group',
          options: [
            'CDSCO',
            'ICH',
            'USFDA',
            'EMA',
            'MHRA',
            'WHO',
            'Schedule M',
            'PIC/S',
            'ISO',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Technical Components',
      fields: [
        {
          name: 'workModules',
          label: 'Work Modules',
          type: 'checkbox_group',
          options: [
            'CMC Review',
            'Stability Data',
            'Validation Review',
            'BE-BA Documentation',
            'Risk Assessment',
            'Change Control',
            'Labeling Review',
            'Artwork Compliance',
            'Variation Filing',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Data Source',
      fields: [
        {
          name: 'dataSource',
          label: 'Research Mode',
          type: 'dropdown',
          options: [
            'Literature Based',
            'Company Data',
            'Simulated Dossier',
            'Public Database',
            'Hybrid',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Novelty & Expected Outcomes',
      fields: [
        { name: 'novelty', label: 'Statement of Novelty', type: 'textarea' },
        { name: 'literatureGap', label: 'Identified Literature Gap', type: 'textarea' },
        { name: 'deliverables', label: 'Expected Deliverables', type: 'checkbox_group', options: COMMON_DELIVERABLES },
      ],
    },
  ],
  'PHARMACEUTICAL ANALYSIS': [
    {
      title: 'Fundamental Information',
      fields: [
        { name: 'title', label: 'Dissertation Title', type: 'text', required: true },
        { name: 'drugName', label: 'Active Pharmaceutical Ingredient (API)', type: 'text' },
        {
          name: 'productType',
          label: 'Target Product Type',
          type: 'dropdown',
          options: ['API', 'Formulation', 'Biological Sample', 'Plant Extract'],
        },
        {
          name: 'dosageForm',
          label: 'Target Dosage Form',
          type: 'dropdown',
          options: ['Solid', 'Liquid', 'Semi-solid', 'Parenteral', 'Aerosol'],
        },
      ],
    },
    {
      title: 'Analytical Methodology Details',
      fields: [
        {
          name: 'projectDomain',
          label: 'Core Project Domain',
          type: 'dropdown',
          options: ['Method Development', 'Method Validation', 'Impurity Profiling', 'Degradation Study', 'Bioanalysis'],
        },
        {
          name: 'studyType',
          label: 'Nature of Study',
          type: 'dropdown',
          options: ['Quantitative', 'Qualitative', 'Stability Indicating'],
        },
        {
          name: 'primaryInstrument',
          label: 'Primary Analytical Instrument',
          type: 'dropdown',
          options: ['HPLC', 'HPTLC', 'UV-Visible', 'LC-MS', 'GC'],
        },
        {
          name: 'secondaryInstrument',
          label: 'Secondary Analytical Instruments',
          type: 'checkbox_group',
          options: ['Fluorimetry', 'FTIR', 'NMR', 'Electrophoresis'],
        },
        {
          name: 'validationTests',
          label: 'Proposed Validation Parameters',
          type: 'checkbox_group',
          options: ['Linearity', 'Precision', 'Accuracy', 'LOD/LOQ', 'Robustness', 'Specificity'],
        },
      ],
    },
    {
      title: 'Sample Specifications & Stability Conditions',
      fields: [
        {
          name: 'sampleType',
          label: 'Nature of Sample',
          type: 'dropdown',
          options: ['Pure Drug', 'Marketed Formulation', 'Plasma', 'Urine'],
        },
        {
          name: 'stabilityConditions',
          label: 'Proposed Stability Conditions',
          type: 'checkbox_group',
          options: ['Acid', 'Base', 'Oxidation', 'Thermal', 'Photolytic'],
        },
        { name: 'tools', label: 'Additional Analytical Tools', type: 'text' },
        {
          name: 'workLocation',
          label: 'Primary Work Location',
          type: 'dropdown',
          options: ['Internal', 'External Industry'],
        },
      ],
    },
    {
      title: 'Novelty & Expected Outcomes',
      fields: [
        { name: 'novelty', label: 'Statement of Novelty', type: 'textarea' },
        { name: 'literatureGap', label: 'Identified Literature Gap', type: 'textarea' },
        { name: 'deliverables', label: 'Expected Deliverables', type: 'checkbox_group', options: COMMON_DELIVERABLES },
      ],
    },
  ],
  'PHARMACOGNOSY': [
    {
      title: 'Fundamental Information',
      fields: [
        { name: 'title', label: 'Dissertation Title', type: 'text', required: true },
        { name: 'sourceName', label: 'Common/Vernacular Name of Source', type: 'text' },
        { name: 'botanicalName', label: 'Botanical/Scientific Name', type: 'text' },
      ],
    },
    {
      title: 'Source Material Specifications',
      fields: [
        {
          name: 'sourceCategory',
          label: 'Primary Source Category',
          type: 'dropdown',
          options: ['Plant', 'Animal', 'Marine', 'Microbial'],
        },
        {
          name: 'partUsed',
          label: 'Plant/Source Part to be Used',
          type: 'dropdown',
          options: ['Leaf', 'Stem', 'Root', 'Bark', 'Flower', 'Fruit', 'Seed', 'Whole Plant'],
        },
        {
          name: 'materialType',
          label: 'Condition of Material',
          type: 'dropdown',
          options: ['Fresh', 'Dried', 'Powder', 'Extract'],
        },
      ],
    },
    {
      title: 'Extraction & Analytical Methodology',
      fields: [
        {
          name: 'projectDomain',
          label: 'Core Project Domain',
          type: 'dropdown',
          options: ['Extraction & Isolation', 'Standardization', 'Pharmacological Evaluation', 'Formulation'],
        },
        {
          name: 'studyType',
          label: 'Nature of Study',
          type: 'dropdown',
          options: ['In vitro', 'In vivo', 'Analytical'],
        },
        {
          name: 'extractionMethod',
          label: 'Proposed Extraction Method',
          type: 'dropdown',
          options: ['Maceration', 'Soxhlet', 'Ultrasound Assisted', 'Microwave Assisted', 'Supercritical Fluid'],
        },
        { name: 'targetConstituents', label: 'Target Phytoconstituents', type: 'text' },
        {
          name: 'techniques',
          label: 'Isolation & Characterization Techniques',
          type: 'checkbox_group',
          options: ['Chromatography', 'Spectroscopy', 'Microscopy', 'Biological Assays'],
        },
      ],
    },
    {
      title: 'Evaluation Parameters & Ethics',
      fields: [
        {
          name: 'studyModel',
          label: 'Biological Study Model',
          type: 'checkbox_group',
          options: ['Cell Line', 'Animal Model', 'Microbial Strain'],
        },
        {
          name: 'iaecApproval',
          label: 'IAEC Approval Required',
          type: 'radio',
          options: ['Yes', 'No', 'Not Applicable'],
        },
        {
          name: 'referenceStandard',
          label: 'Availability of Reference Standard',
          type: 'dropdown',
          options: ['Available', 'Not Available', 'To be Isolated'],
        },
      ],
    },
    {
      title: 'Novelty & Expected Outcomes',
      fields: [
        {
          name: 'workLocation',
          label: 'Primary Work Location',
          type: 'dropdown',
          options: ['Internal', 'External Research Institute'],
        },
        { name: 'novelty', label: 'Statement of Novelty', type: 'textarea' },
        { name: 'literatureGap', label: 'Identified Literature Gap', type: 'textarea' },
        { name: 'deliverables', label: 'Expected Deliverables', type: 'checkbox_group', options: COMMON_DELIVERABLES },
      ],
    },
  ],
  'PHARMACOLOGY': [
    {
      title: 'Fundamental Information',
      fields: [
        { name: 'title', label: 'Dissertation Title', type: 'text', required: true },
      ],
    },
    {
      title: 'Drug / Test Material Info',
      fields: [
        {
          name: 'drugName',
          label: 'Drug / Extract / Compound Name',
          type: 'text',
          required: true,
        },
        {
          name: 'category',
          label: 'Category',
          type: 'dropdown',
          required: true,
          options: ['Synthetic', 'Herbal', 'Biologic', 'Nanoformulation', 'Combination'],
        },
      ],
    },
    {
      title: 'Study Details',
      fields: [
        {
          name: 'therapeuticArea',
          label: 'Therapeutic Area',
          type: 'checkbox_group',
          options: [
            'Antidiabetic',
            'Anti-inflammatory',
            'Anticancer',
            'CNS',
            'CVS',
            'Respiratory',
            'Hepatoprotective',
            'Antimicrobial',
            'Nephroprotective',
            'Other',
          ],
        },
        {
          name: 'studyType',
          label: 'Study Type',
          type: 'dropdown',
          required: true,
          options: [
            'Screening',
            'Mechanism Study',
            'Toxicity Study',
            'Comparative Study',
            'PK-PD Study',
            'Formulation Evaluation',
            'Efficacy Study',
          ],
        },
      ],
    },
    {
      title: 'Research Model',
      fields: [
        {
          name: 'workType',
          label: 'Work Type',
          type: 'dropdown',
          required: true,
          options: ['In vitro', 'In vivo', 'Ex vivo', 'In silico'],
        },
      ],
    },
    {
      title: 'Experimental Model',
      fields: [
        {
          name: 'experimentalModel',
          label: 'Disease / Screening Model',
          type: 'text',
          placeholder: 'e.g., STZ-induced diabetes',
        },
        {
          name: 'species',
          label: 'Species / Cell Line',
          type: 'dropdown',
          required: true,
          options: ['Rat', 'Mouse', 'Rabbit', 'Guinea Pig', 'Zebrafish', 'Cell Line', 'Other'],
        },
      ],
    },
    {
      title: 'Dose Details',
      fields: [
        {
          name: 'dose',
          label: 'Dose Level(s)',
          type: 'text',
          placeholder: 'e.g., 50, 100, 200 mg/kg',
        },
        {
          name: 'route',
          label: 'Route of Administration',
          type: 'dropdown',
          required: true,
          options: ['Oral', 'IP', 'IV', 'SC', 'Topical', 'Inhalation', 'Other'],
        },
      ],
    },
    {
      title: 'Methodology',
      fields: [
        {
          name: 'techniques',
          label: 'Main Technique',
          type: 'dropdown',
          required: true,
          options: [
            'Behavioral Test',
            'Biochemical Assay',
            'Histopathology',
            'ELISA',
            'PCR',
            'Imaging',
            'Hematology',
            'Organ Bath',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Evaluation',
      fields: [
        {
          name: 'parameters',
          label: 'Required Parameters',
          type: 'checkbox_group',
          options: [
            'Body Weight',
            'Blood Glucose',
            'BP',
            'HR',
            'Behavioral Score',
            'Biomarkers',
            'Organ Weight',
            'Histology',
            'Enzyme Levels',
            'Survival',
            'Toxicity Signs',
            'Hematology',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Ethics Approval',
      fields: [
        {
          name: 'iaecApproval',
          label: 'IAEC Approval Required',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
      ],
    },
    {
      title: 'Novelty & Expected Outcomes',
      fields: [
        { name: 'novelty', label: 'Statement of Novelty', type: 'textarea' },
        { name: 'literatureGap', label: 'Identified Literature Gap', type: 'textarea' },
        { name: 'deliverables', label: 'Expected Deliverables', type: 'checkbox_group', options: COMMON_DELIVERABLES },
      ],
    },
  ],
  'PHARMACY PRACTICE': [
    {
      title: 'Fundamental Information',
      fields: [{ name: 'title', label: 'Dissertation Title', type: 'text', required: true }],
    },
    {
      title: 'Study Design & Setting',
      fields: [
        {
          name: 'studySetting',
          label: 'Primary Study Setting',
          type: 'dropdown',
          options: ['Hospital', 'Community Pharmacy', 'Primary Health Center', 'Online'],
        },
        { name: 'institutionName', label: 'Collaborating Hospital/Institution Name', type: 'text' },
        {
          name: 'targetPopulation',
          label: 'Target Patient Population',
          type: 'dropdown',
          options: ['Pediatric', 'Adult', 'Geriatric', 'Pregnant Women', 'General'],
        },
        { name: 'sampleSize', label: 'Estimated Sample Size', type: 'number' },
      ],
    },
    {
      title: 'Methodology & Data Collection',
      fields: [
        {
          name: 'projectDomain',
          label: 'Core Project Domain',
          type: 'dropdown',
          options: [
            'Clinical Pharmacy',
            'Pharmacovigilance',
            'Pharmacoepidemiology',
            'Pharmacoeconomics',
            'Patient Counseling',
          ],
        },
        {
          name: 'studyType',
          label: 'Nature of Study',
          type: 'dropdown',
          options: ['Observational', 'Interventional', 'Retrospective', 'Prospective', 'Cross-sectional'],
        },
        {
          name: 'diseaseArea',
          label: 'Target Disease/Therapeutic Area',
          type: 'dropdown',
          options: [
            'Cardiovascular',
            'Endocrine',
            'Infectious',
            'Respiratory',
            'Neurological',
            'Oncology',
            'Psychiatric',
          ],
        },
        {
          name: 'dataCollectionTools',
          label: 'Proposed Data Collection Tools',
          type: 'checkbox_group',
          options: ['Questionnaire', 'Case Record Form', 'EHR', 'Interviews', 'Scales'],
        },
        {
          name: 'outcomeMeasures',
          label: 'Primary Outcome Measures',
          type: 'checkbox_group',
          options: ['Clinical Outcome', 'Economic Outcome', 'Humanistic Outcome', 'Adverse Events'],
        },
      ],
    },
    {
      title: 'Ethics & Expected Outcomes',
      fields: [
        {
          name: 'iecApproval',
          label: 'Institutional Ethics Committee (IEC) Approval Required',
          type: 'radio',
          options: ['Yes', 'No', 'Applied'],
        },
        {
          name: 'consent',
          label: 'Type of Informed Consent Required',
          type: 'radio',
          options: ['Written', 'Verbal', 'Waiver'],
        },
        { name: 'tools', label: 'Proposed Statistical Tools', type: 'text' },
        { name: 'workLocation', label: 'Primary Work Location', type: 'dropdown', options: ['Hospital', 'University'] },
        { name: 'novelty', label: 'Statement of Novelty', type: 'textarea' },
        { name: 'literatureGap', label: 'Identified Literature Gap', type: 'textarea' },
        { name: 'deliverables', label: 'Expected Deliverables', type: 'checkbox_group', options: COMMON_DELIVERABLES },
      ],
    },
  ],
};

const GENERIC_SCHEMA: SectionDef[] = [
  {
    title: 'Fundamental Information',
    fields: [
      { name: 'title', label: 'Dissertation Title', type: 'text', required: true, placeholder: 'e.g., Enter dissertation title...' },
      { name: 'drugName', label: 'Drug Name', type: 'text', required: true, placeholder: 'e.g., Enter drug name...' },
      {
        name: 'dosageForm',
        label: 'Dosage Form',
        type: 'dropdown',
        options: ['Tablet', 'Capsule', 'Liquid', 'Topical', 'Injectable', 'NDDS', 'Emulgel', 'Scaffold formulation', 'Nano structured Lipid carriers', 'NLC-loaded biodegradable polymeric scaffold (nanocomposite/medicated sponge dressing)', 'Other'],
        required: true,
      },
      { name: 'primarySubject', label: 'Primary Subject / Target Active Ingredient', type: 'text', required: true, placeholder: 'e.g., Enter active ingredient...' },
      {
        name: 'projectDomain',
        label: 'Core Project Domain',
        type: 'dropdown',
        options: ['Analytical', 'Formulation', 'Clinical', 'Synthesis', 'Regulatory', 'Other'],
        required: true,
      },
    ],
  },
  {
    title: 'Methodology Specifications',
    fields: [
      { name: 'methodPreparation', label: 'Methodology Details & Protocol', type: 'textarea', required: true, placeholder: 'e.g., Describe your methodology...' },
      { name: 'tools', label: 'Required Tools & Instruments', type: 'text', required: true, placeholder: 'e.g., FTIR, DSC, XRD...' },
      {
        name: 'workLocation',
        label: 'Primary Work Location',
        type: 'dropdown',
        options: ['Internal', 'External Industry', 'External Research Institute'],
        required: true,
      },
    ],
  },
  {
    title: 'Novelty & Expected Outcomes',
    fields: [
      { name: 'novelty', label: 'Statement of Novelty', type: 'textarea', required: true },
      { name: 'deliverables', label: 'Expected Deliverables', type: 'checkbox_group', options: COMMON_DELIVERABLES },
    ],
  },
];

// Alias: Industrial Pharmacy and Techno Pharmacy use the same schema as Pharmaceutics
DEPARTMENT_SCHEMAS['INDUSTRIAL PHARMACY'] = DEPARTMENT_SCHEMAS['PHARMACEUTICS'];
DEPARTMENT_SCHEMAS['TECHNO PHARMACY'] = DEPARTMENT_SCHEMAS['PHARMACEUTICS'];

// Alias: Quality Assurance and Pharmaceutical Analysis share the exact same schema
DEPARTMENT_SCHEMAS['PHARMACEUTICAL ANALYSIS'] = DEPARTMENT_SCHEMAS['QUALITY ASSURANCE'];
DEPARTMENT_SCHEMAS['QA'] = DEPARTMENT_SCHEMAS['QUALITY ASSURANCE'];
DEPARTMENT_SCHEMAS['PA'] = DEPARTMENT_SCHEMAS['QUALITY ASSURANCE'];

/**
 * Map of department-name substrings to schema keys.
 * Checked in order — first match wins. Put more specific patterns first.
 */
const DEPARTMENT_ALIAS_MAP: [string, string][] = [
  ['PHARMACEUTICAL CHEMISTRY', 'PHARMACEUTICAL CHEMISTRY'],
  ['CHEMISTRY', 'PHARMACEUTICAL CHEMISTRY'],
  ['PHARMACEUTICAL ANALYSIS', 'QUALITY ASSURANCE'],
  ['ANALYSIS', 'QUALITY ASSURANCE'],
  ['QUALITY ASSURANCE', 'QUALITY ASSURANCE'],
  ['QA', 'QUALITY ASSURANCE'],
  ['PA', 'QUALITY ASSURANCE'],
  ['REGULATORY AFFAIRS', 'REGULATORY AFFAIRS'],
  ['PHARMACOLOGY', 'PHARMACOLOGY'],
  ['INDUSTRIAL PHARMACY', 'INDUSTRIAL PHARMACY'],
  ['TECHNO PHARMACY', 'TECHNO PHARMACY'],
  ['TECHNO', 'TECHNO PHARMACY'],              // shorthand
  ['INDUSTRIAL', 'INDUSTRIAL PHARMACY'],       // shorthand
  ['PHARMACEUTICS', 'PHARMACEUTICS'],
  ['PHARMACOGNOSY', 'PHARMACOGNOSY'],
  ['PHARMACY PRACTICE', 'PHARMACY PRACTICE'],
];

function resolveDepartmentSchema(department: string): SectionDef[] {
  const deptUpper = (department || '').toUpperCase().trim();
  if (!deptUpper) return GENERIC_SCHEMA;

  // Exact match first
  if (DEPARTMENT_SCHEMAS[deptUpper]) return DEPARTMENT_SCHEMAS[deptUpper];

  // Alias / substring match
  for (const [pattern, key] of DEPARTMENT_ALIAS_MAP) {
    if (deptUpper.includes(pattern)) return DEPARTMENT_SCHEMAS[key];
  }

  return GENERIC_SCHEMA;
}

export default function SubmitTitleForm({
  department,
  data,
  onChange,
  titleSuggestions,
  titleMessage,
  noveltyMessage,
  aiSuggestions,
  aiLoading,
  drugSuggestion,
  dosageSuggestion,
  disabled = false,
}: SubmitTitleFormProps) {
  const schema = resolveDepartmentSchema(department);

  const [suggestions, setSuggestions] = useState<Record<string, string>>({});

  // Drug multi-select state
  const [drugsList, setDrugsList] = useState<{ id: string; name: string; category?: string; therapeutic?: string }[]>([]);
  const [drugSearchQuery, setDrugSearchQuery] = useState('');
  const [isDrugDropdownOpen, setIsDrugDropdownOpen] = useState(false);
  const [isSearchingDrugs, setIsSearchingDrugs] = useState(false);
  const drugDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const query = drugSearchQuery.trim();

    const fetchDrugs = async () => {
      try {
        setIsSearchingDrugs(true);
        const url = query
          ? `/api/drugs?search=${encodeURIComponent(query)}&limit=100`
          : `/api/drugs?limit=2500`;
        const res = await fetch(url);
        if (res.ok && active) {
          const json = await res.json();
          if (Array.isArray(json.drugs)) {
            setDrugsList((prev) => {
              const map = new Map<string, { id: string; name: string; category?: string; therapeutic?: string }>();
              // New results first
              json.drugs.forEach((d: any) => map.set(d.name.toLowerCase(), d));
              // Retain any already selected/existing drugs in memory
              prev.forEach((d) => {
                if (!map.has(d.name.toLowerCase())) {
                  map.set(d.name.toLowerCase(), d);
                }
              });
              return Array.from(map.values());
            });
          }
        }
      } catch (err) {
        console.error('Failed to load drugs in SubmitTitleForm:', err);
      } finally {
        if (active) setIsSearchingDrugs(false);
      }
    };

    const delay = query ? 200 : 0;
    const timer = setTimeout(fetchDrugs, delay);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [drugSearchQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (drugDropdownRef.current && !drugDropdownRef.current.contains(e.target as Node)) {
        setIsDrugDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLiveAutocorrect = useCallback(
    async (name: string, text: string) => {
      if (!text.trim() || text.length < 5) {
        if (suggestions[name]) setSuggestions((prev) => ({ ...prev, [name]: '' }));
        return;
      }

      try {
        const res = await fetch('/api/similarity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'autocorrect', text }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result && result.corrected && result.corrected.toLowerCase() !== text.toLowerCase()) {
            setSuggestions((prev) => ({ ...prev, [name]: result.corrected }));
          } else {
            setSuggestions((prev) => ({ ...prev, [name]: '' }));
          }
        }
      } catch (err) {
        // Silently ignore live service errors
      }
    },
    [suggestions]
  );

  const handleAutocorrect = async (name: string, text: string) => {
    if (!text.trim()) return;
    try {
      const res = await fetch('/api/similarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'autocorrect', text }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result && result.corrected && result.corrected !== text) {
          onChange(name, result.corrected);
        }
      }
    } catch (err) {
      console.warn('Autocorrect service unreachable');
    }
  };

  const renderField = (field: FieldDef) => {
    if (field.condition && !field.condition(data)) {
      return null;
    }

    const value = data[field.name] || '';

    switch (field.type) {
      case 'text':
        return (
          <div key={field.name} className="col-span-1 md:col-span-2 group">
            <Input
              label={`${field.label} ${field.required ? '*' : ''}`}
              type="text"
              value={value}
              onChange={(e) => {
                onChange(field.name, e.target.value);
                handleLiveAutocorrect(field.name, e.target.value);
              }}
              onBlur={(e) => handleAutocorrect(field.name, e.target.value)}
              placeholder={field.placeholder || `e.g., Enter ${field.label.toLowerCase()}...`}
              disabled={disabled}
              className="bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-primary-500"
            />
            {suggestions[field.name] && (
              <div
                onClick={() => {
                  onChange(field.name, suggestions[field.name]);
                  setSuggestions((prev) => ({ ...prev, [field.name]: '' }));
                }}
                className="mt-2 text-[10px] bg-primary-50 border border-primary-200 text-primary-600 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 cursor-pointer hover:bg-primary-100 transition-all w-fit"
              >
                <Sparkles size={12} />
                Did you mean:{' '}
                <span className="underline decoration-primary-500/50">{suggestions[field.name]}</span>?
              </div>
            )}

            {(field.name === 'drugName' || field.name === 'compoundName' || field.name === 'sourceName') &&
              drugSuggestion && (
                <div
                  onClick={() => onChange(field.name, drugSuggestion.suggested)}
                  className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 cursor-pointer hover:bg-amber-100 transition-all"
                >
                  <Search size={14} className="text-amber-600 shrink-0" />
                  <span>
                    Did you mean:{' '}
                    <span className="font-bold underline decoration-amber-600">{drugSuggestion.suggested}</span>
                    ?
                  </span>
                  <span className="ml-auto text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                    {Math.round(drugSuggestion.confidence * 100)}% Match
                  </span>
                </div>
              )}

            {field.name === 'title' && titleMessage && (
              <div
                className={`mt-3 p-3.5 rounded-xl border flex items-start gap-2.5 transition-all ${
                  titleMessage.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : titleMessage.type === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : titleMessage.type === 'info'
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {titleMessage.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  ) : titleMessage.type === 'warning' ? (
                    <Zap className="w-4 h-4 text-amber-600" />
                  ) : titleMessage.type === 'info' ? (
                    <Info className="w-4 h-4 text-blue-600" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <p className="text-xs leading-relaxed font-semibold">{titleMessage.text}</p>
              </div>
            )}

            {field.name === 'title' && titleSuggestions && titleSuggestions.length > 0 && (
              <div className="mt-3 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Similar System Titles
                  </span>
                  <span className="ml-auto text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                    {titleSuggestions.length} Found
                  </span>
                </div>
                <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                  {titleSuggestions.map((match, idx) => (
                    <div
                      key={idx}
                      className="px-4 py-2.5 hover:bg-slate-50 transition-all flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate">{match.title}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5 font-medium">Year: {match.year}</p>
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          match.similarity >= 70
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : match.similarity >= 40
                            ? 'bg-amber-50 text-amber-600 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        }`}
                      >
                        {match.similarity}% Similarity
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'number':
        return (
          <div key={field.name} className="col-span-1 group">
            <Input
              label={`${field.label} ${field.required ? '*' : ''}`}
              type="number"
              value={value}
              onChange={(e) => onChange(field.name, e.target.value)}
              placeholder={field.placeholder || `e.g., Enter ${field.label.toLowerCase()}...`}
              disabled={disabled}
              className="bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-primary-500"
            />
          </div>
        );
      case 'textarea':
        return (
          <div key={field.name} className="col-span-1 md:col-span-2 group">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={value}
              onChange={(e) => {
                onChange(field.name, e.target.value);
                handleLiveAutocorrect(field.name, e.target.value);
              }}
              onBlur={(e) => handleAutocorrect(field.name, e.target.value)}
              rows={4}
              placeholder={field.placeholder || `Describe your ${field.label.toLowerCase()} in detail...`}
              disabled={disabled}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none transition-all resize-none"
            />
            {suggestions[field.name] && (
              <div
                onClick={() => {
                  onChange(field.name, suggestions[field.name]);
                  setSuggestions((prev) => ({ ...prev, [field.name]: '' }));
                }}
                className="mt-2 text-[10px] bg-primary-50 border border-primary-200 text-primary-600 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 cursor-pointer hover:bg-primary-100 transition-all w-fit"
              >
                <Sparkles size={12} />
                Did you mean:{' '}
                <span className="underline decoration-primary-400/50">{suggestions[field.name]}</span>?
              </div>
            )}
          </div>
        );
      case 'dropdown':
        return (
          <div key={field.name} className="col-span-1 group">
            <Dropdown
              label={`${field.label} ${field.required ? '*' : ''}`}
              options={field.options || []}
              value={value}
              onChange={(val) => onChange(field.name, val)}
              placeholder={`Select ${field.label}...`}
              disabled={disabled}
            />
          </div>
        );
      case 'checkbox_group':
        const selected = Array.isArray(value) ? value : [];
        return (
          <div key={field.name} className="col-span-1 md:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(field.options || []).map((opt) => {
                const isChecked = selected.includes(opt);
                return (
                  <label
                    key={opt}
                    className={`flex items-center space-x-3 p-4 rounded-xl cursor-pointer transition-all border ${
                      isChecked
                        ? 'bg-primary-50 border-primary-300 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                        isChecked ? 'bg-primary-500 border-primary-500' : 'bg-white border-slate-300'
                      }`}
                    >
                      {isChecked && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={isChecked}
                      disabled={disabled}
                      onChange={(e) => {
                        if (e.target.checked) onChange(field.name, [...selected, opt]);
                        else onChange(field.name, selected.filter((v: string) => v !== opt));
                      }}
                    />
                    <span className="text-sm font-semibold leading-none">{opt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      case 'radio':
        return (
          <div key={field.name} className="col-span-1 md:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <div className="flex flex-wrap gap-4">
              {(field.options || []).map((opt) => {
                const isChecked = value === opt;
                return (
                  <label
                    key={opt}
                    className={`flex items-center space-x-3 px-6 py-4 rounded-xl cursor-pointer transition-all border ${
                      isChecked
                        ? 'bg-primary-50 border-primary-300 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                        isChecked ? 'border-primary-500' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isChecked && <div className="w-2.5 h-2.5 bg-primary-500 rounded-full" />}
                    </div>
                    <input
                      type="radio"
                      className="hidden"
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => onChange(field.name, opt)}
                    />
                    <span className="text-sm font-semibold leading-none">{opt}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      case 'file':
        return (
          <div key={field.name} className="col-span-1 md:col-span-2 group">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
              <input
                type="file"
                disabled={disabled}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onChange(field.name, e.target.files[0].name);
                  }
                }}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none transition-all cursor-pointer file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-600 hover:file:bg-primary-100"
              />
            </div>
          </div>
        );
      case 'drug_multiselect': {
        const selectedDrugs: string[] = Array.isArray(value)
          ? value
          : typeof value === 'string' && value.trim()
          ? value.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

        const filteredDrugs = drugsList.filter((d) => {
          const matchesSearch = !drugSearchQuery.trim() || d.name.toLowerCase().includes(drugSearchQuery.toLowerCase());
          const notAlreadySelected = !selectedDrugs.some((sel) => sel.toLowerCase() === d.name.toLowerCase());
          return matchesSearch && notAlreadySelected;
        });

        const handleAddDrug = (drugName: string) => {
          if (!selectedDrugs.some((sel) => sel.toLowerCase() === drugName.toLowerCase())) {
            const next = [...selectedDrugs, drugName];
            onChange(field.name, next);
          }
          setDrugSearchQuery('');
          setIsDrugDropdownOpen(false);
        };

        const handleRemoveDrug = (drugName: string) => {
          const next = selectedDrugs.filter((d) => d.toLowerCase() !== drugName.toLowerCase());
          onChange(field.name, next);
        };

        return (
          <div key={field.name} className="col-span-1 md:col-span-2 group" ref={drugDropdownRef}>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {field.label} {field.required && <span className="text-red-500">*</span>}
              <span className="text-slate-400 font-normal normal-case ml-1">
                (Search & select drugs from database — duplicates prevented)
              </span>
            </label>

            {/* Selected Drug Badges */}
            {selectedDrugs.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2.5">
                {selectedDrugs.map((d, idx) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#4361EE]/10 text-[#4361EE] border border-[#4361EE]/30 transition-all shadow-sm"
                  >
                    <Icon icon="solar:pill-bold-duotone" className="w-3.5 h-3.5" />
                    <span>{d}</span>
                    {idx === 0 && (
                      <span className="text-[8px] bg-[#4361EE] text-white px-1.5 py-0.5 rounded-full font-black uppercase">
                        Primary
                      </span>
                    )}
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDrug(d)}
                        className="ml-0.5 text-[#4361EE]/70 hover:text-red-500 transition-colors p-0.5 rounded-full"
                        title={`Remove ${d}`}
                      >
                        <Icon icon="solar:close-circle-bold" className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Icon
                icon="solar:pill-bold-duotone"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4361EE]"
              />
              <input
                type="text"
                value={drugSearchQuery}
                onChange={(e) => {
                  setDrugSearchQuery(e.target.value);
                  setIsDrugDropdownOpen(true);
                }}
                onFocus={() => setIsDrugDropdownOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filteredDrugs.length > 0) {
                      handleAddDrug(filteredDrugs[0].name);
                    }
                  }
                }}
                disabled={disabled}
                placeholder={
                  selectedDrugs.length > 0
                    ? 'Search to add another drug (e.g., Praziquantel)...'
                    : field.placeholder || 'Search and select drug name (e.g., Praziquantel)...'
                }
                className="w-full pl-10 pr-24 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {isSearchingDrugs && (
                  <Icon icon="solar:refresh-circle-bold" className="w-4 h-4 text-[#4361EE] animate-spin" />
                )}
                {selectedDrugs.length > 0 && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {selectedDrugs.length} selected
                  </span>
                )}
              </div>
            </div>

            {/* Dropdown Options List */}
            {isDrugDropdownOpen && !disabled && (
              <div className="relative">
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {filteredDrugs.length > 0 ? (
                    filteredDrugs.map((drug, idx) => (
                      <button
                        key={`${drug.id || drug.name}-${idx}`}
                        type="button"
                        onClick={() => handleAddDrug(drug.name)}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#4361EE]/5 transition-colors flex items-center justify-between group/item"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900 group-hover/item:text-[#4361EE]">
                            {drug.name}
                          </p>
                          {(drug.category || drug.therapeutic) && (
                            <p className="text-[10px] text-slate-400">
                              {[drug.category, drug.therapeutic].filter(Boolean).join(' • ')}
                            </p>
                          )}
                        </div>
                        <Icon icon="solar:add-circle-linear" className="w-4 h-4 text-slate-400 group-hover/item:text-[#4361EE]" />
                      </button>
                    ))
                  ) : isSearchingDrugs ? (
                    <div className="px-4 py-3 text-xs text-slate-400 text-center flex items-center justify-center gap-2">
                      <Icon icon="solar:refresh-circle-bold" className="w-4 h-4 text-[#4361EE] animate-spin" />
                      <span>Searching database for &quot;{drugSearchQuery}&quot;...</span>
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-xs text-slate-400 text-center">
                      {drugSearchQuery.trim()
                        ? `No matching drugs found for "${drugSearchQuery}"`
                        : 'All available drugs already selected'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  const noveltyFieldNames = ['noveltyStatement', 'novelty'];
  const titleFieldName = 'title';

  let titleField: FieldDef | null = null;
  let noveltyField: FieldDef | null = null;
  const remainingFields: FieldDef[] = [];

  for (const section of schema) {
    for (const field of section.fields) {
      if (field.name === titleFieldName && !titleField) {
        titleField = field;
      } else if (noveltyFieldNames.includes(field.name) && !noveltyField) {
        noveltyField = field;
      } else {
        remainingFields.push(field);
      }
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
      {/* Title & Novelty Sections (rendered at the top together) */}
      <div className="space-y-6 border-b border-slate-200 pb-6">
        {titleField && renderField(titleField)}
        {noveltyField && (
          <div key={noveltyField.name} className="col-span-1 md:col-span-2 group">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {noveltyField.label} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={data[noveltyField.name] || ''}
              onChange={(e) => {
                onChange(noveltyField!.name, e.target.value);
                handleLiveAutocorrect(noveltyField!.name, e.target.value);
              }}
              onBlur={(e) => handleAutocorrect(noveltyField!.name, e.target.value)}
              rows={3}
              placeholder={
                noveltyField.placeholder ||
                'Describe what makes your research novel and how it differs from existing work...'
              }
              disabled={disabled}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none transition-all resize-none"
            />
            {suggestions[noveltyField.name] && (
              <div
                onClick={() => {
                  onChange(noveltyField!.name, suggestions[noveltyField!.name]);
                  setSuggestions((prev) => ({ ...prev, [noveltyField!.name]: '' }));
                }}
                className="mt-2 text-[10px] bg-primary-50 border border-primary-200 text-primary-600 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 cursor-pointer hover:bg-primary-100 transition-all w-fit"
              >
                <Sparkles size={12} />
                Did you mean:{' '}
                <span className="underline decoration-primary-400/50">{suggestions[noveltyField.name]}</span>?
              </div>
            )}

            {/* Novelty message */}
            {noveltyMessage && (
              <div
                className={`mt-3 p-4 rounded-xl border flex items-start gap-3 transition-all duration-300 ${
                  noveltyMessage.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : noveltyMessage.type === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : noveltyMessage.type === 'info'
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {noveltyMessage.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  ) : noveltyMessage.type === 'warning' ? (
                    <Zap className="w-4 h-4 text-amber-600" />
                  ) : noveltyMessage.type === 'info' ? (
                    <Info className="w-4 h-4 text-blue-600" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <p className="text-xs leading-relaxed font-semibold">{noveltyMessage.text}</p>
              </div>
            )}

            {/* AI suggestions */}
            {aiLoading && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="text-xs font-bold text-blue-700">AI is evaluating abstract novelty...</span>
              </div>
            )}

            {!aiLoading && aiSuggestions && aiSuggestions.length > 0 && (
              <div className="mt-3 bg-white border border-blue-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-blue-600" />
                  <h4 className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                    AI Literature Context
                  </h4>
                  <span className="ml-auto text-[9px] font-medium text-slate-400">Groq LLM Engine</span>
                </div>
                <div className="p-4 space-y-2">
                  {aiSuggestions.map((suggestion, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-600">
                      <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="leading-relaxed font-medium">{suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remaining Form Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {remainingFields.map(renderField)}
      </div>
    </div>
  );
}
