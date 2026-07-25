'use client';

import React, { useState, useCallback } from 'react';
import Dropdown from '@/components/ui/Dropdown';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
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
  type: 'text' | 'textarea' | 'number' | 'dropdown' | 'checkbox_group' | 'radio' | 'file';
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
      title: 'Compound Information',
      fields: [
        {
          name: 'compoundName',
          label: 'Target Compound Name(s)',
          type: 'text',
          placeholder: 'e.g., Novel Pyrazole Derivatives',
        },
        {
          name: 'category',
          label: 'Compound Category',
          type: 'dropdown',
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
      title: 'Research Methodology Mode',
      fields: [
        {
          name: 'workType',
          label: 'Primary Work Type',
          type: 'dropdown',
          options: ['Dry Lab', 'Wet Lab', 'Hybrid'],
        },
        {
          name: 'dryLabComponents',
          label: 'In Silico (Dry Lab) Components',
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
          label: 'Experimental (Wet Lab) Components',
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
      title: 'Project Specifications',
      fields: [
        {
          name: 'therapeuticArea',
          label: 'Target Therapeutic Area',
          type: 'dropdown',
          options: ['Oncology', 'Neurology', 'Cardiology', 'Infectious Diseases', 'Immunology', 'Other'],
        },
        {
          name: 'coreScaffold',
          label: 'Core Chemical Scaffold',
          type: 'text',
          placeholder: 'e.g., Thiazolidinedione',
        },
        {
          name: 'numberOfCompounds',
          label: 'Proposed Number of Compounds',
          type: 'number',
          placeholder: 'e.g., 10',
        },
      ],
    },
    {
      title: 'Synthetic Strategy',
      fields: [
        {
          name: 'syntheticRoute',
          label: 'Proposed Synthetic Route',
          type: 'textarea',
          placeholder: 'Detail the anticipated reaction sequence...',
        },
        {
          name: 'reactionType',
          label: 'Primary Reaction Type',
          type: 'dropdown',
          options: [
            'Substitution',
            'Addition',
            'Elimination',
            'Rearrangement',
            'Oxidation-Reduction',
            'Other',
          ],
        },
      ],
    },
    {
      title: 'Characterization & Biological Evaluation',
      fields: [
        {
          name: 'tests',
          label: 'Analytical Tests for Characterization',
          type: 'checkbox_group',
          options: ['TLC', 'IR', 'NMR', 'Mass', 'HPLC', 'Elemental Analysis'],
        },
        {
          name: 'studyModel',
          label: 'Biological Study Model',
          type: 'checkbox_group',
          options: ['In vitro', 'In vivo', 'Not Applicable'],
        },
      ],
    },
    {
      title: 'Ethics, Novelty & Expected Outcomes',
      fields: [
        { name: 'iaecApproval', label: 'IAEC Approval Required', type: 'radio', options: ['Yes', 'No'] },
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
        {
          name: 'workLocation',
          label: 'Primary Work Location',
          type: 'dropdown',
          options: ['Internal', 'External Industry', 'External Research Institute'],
        },
        { name: 'deliverables', label: 'Expected Deliverables', type: 'checkbox_group', options: COMMON_DELIVERABLES },
      ],
    },
  ],
  'PHARMACEUTICS': [
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
  'QUALITY ASSURANCE': [
    {
      title: 'Fundamental Information',
      fields: [
        { name: 'title', label: 'Dissertation Title', type: 'text', required: true },
        { name: 'drugName', label: 'Active Pharmaceutical Ingredient (API)', type: 'text' },
        { name: 'productName', label: 'Marketed Product Name (if applicable)', type: 'text' },
        {
          name: 'dosageForm',
          label: 'Target Dosage Form',
          type: 'dropdown',
          options: ['Tablet', 'Capsule', 'Liquid', 'Injectable', 'Topical', 'NDDS', 'Emulgel', 'Scaffold formulation', 'Nano structured Lipid carriers', 'NLC-loaded biodegradable polymeric scaffold (nanocomposite/medicated sponge dressing)'],
        },
      ],
    },
    {
      title: 'Project Domain & Methodological Approach',
      fields: [
        {
          name: 'qaDomain',
          label: 'Primary QA Domain',
          type: 'dropdown',
          options: ['Analytical Method Development', 'Validation', 'Quality Control', 'Documentation', 'Audit'],
        },
        {
          name: 'studyType',
          label: 'Nature of Study',
          type: 'dropdown',
          options: ['Routine Analysis', 'Stability Indicating', 'Impurity Profiling', 'Bioanalytical'],
        },
        {
          name: 'analyticalTool',
          label: 'Primary Analytical Tool',
          type: 'dropdown',
          options: ['HPLC', 'UV-Vis', 'HPTLC', 'LC-MS', 'GC'],
        },
        {
          name: 'validationType',
          label: 'Validation Guidelines Followed',
          type: 'dropdown',
          options: ['ICH', 'USP', 'FDA', 'EMA'],
        },
      ],
    },
    {
      title: 'Execution Strategy & Facilities',
      fields: [
        {
          name: 'workLocation',
          label: 'Primary Work Location',
          type: 'dropdown',
          options: ['Internal', 'External Industry'],
        },
        {
          name: 'facilities',
          label: 'Required Facility Standards',
          type: 'checkbox_group',
          options: ['GLP Lab', 'GMP Facility', 'Clean Room'],
        },
        {
          name: 'industryName',
          label: 'Collaborating Industry Name',
          type: 'text',
          condition: (d) => d.workLocation === 'External Industry',
        },
        {
          name: 'permissionLetter',
          label: 'Industry Permission Letter (Upload)',
          type: 'file',
          condition: (d) => d.workLocation === 'External Industry',
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
  'REGULATORY AFFAIRS': [
    {
      title: 'Fundamental Information',
      fields: [
        { name: 'title', label: 'Dissertation Title', type: 'text', required: true },
        { name: 'productName', label: 'Product Name', type: 'text' },
        {
          name: 'category',
          label: 'Product Category',
          type: 'dropdown',
          options: ['Pharmaceuticals', 'Medical Devices', 'Nutraceuticals', 'Biologics', 'Cosmetics'],
        },
      ],
    },
    {
      title: 'Market Scope & Regulatory Domain',
      fields: [
        {
          name: 'marketType',
          label: 'Target Market Classification',
          type: 'dropdown',
          options: ['Regulated', 'Semi-regulated', 'Emerging', 'ROW'],
        },
        {
          name: 'regulatoryDomain',
          label: 'Core Regulatory Domain',
          type: 'dropdown',
          options: [
            'Dossier Preparation',
            'Post-Approval Changes',
            'Clinical Trial Application',
            'Compliance',
          ],
        },
        {
          name: 'studyType',
          label: 'Nature of Study',
          type: 'dropdown',
          options: ['Comparative Study', 'Filing Strategy', 'Query Response'],
        },
        {
          name: 'targetCountry',
          label: 'Primary Target Country',
          type: 'dropdown',
          options: ['USA', 'EU', 'UK', 'Australia', 'Japan', 'Canada', 'India'],
        },
        {
          name: 'secondaryCountries',
          label: 'Secondary Target Countries',
          type: 'checkbox_group',
          options: ['USA', 'EU', 'UK', 'Australia', 'Japan', 'Canada', 'India', 'Brazil', 'South Africa'],
        },
      ],
    },
    {
      title: 'Execution Parameters & Guidelines',
      fields: [
        {
          name: 'guidelines',
          label: 'Applicable Regulatory Guidelines',
          type: 'checkbox_group',
          options: ['ICH', 'FDA', 'EMA', 'TGA', 'CDSCO', 'WHO'],
        },
        {
          name: 'workModules',
          label: 'CTD/eCTD Modules to be Compiled',
          type: 'checkbox_group',
          options: ['Module 1', 'Module 2', 'Module 3', 'Module 4', 'Module 5'],
        },
        {
          name: 'dataSource',
          label: 'Primary Data Source',
          type: 'dropdown',
          options: ['Literature', 'Database', 'Company Data'],
        },
        { name: 'tools', label: 'Regulatory Intelligence Tools', type: 'text' },
        { name: 'ndaRequired', label: 'NDA/ANDA Submission Simulation Required', type: 'radio', options: ['Yes', 'No'] },
      ],
    },
    {
      title: 'Novelty & Expected Outcomes',
      fields: [
        {
          name: 'workLocation',
          label: 'Primary Work Location',
          type: 'dropdown',
          options: ['Internal', 'External Industry'],
        },
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
        { name: 'drugName', label: 'Active Pharmaceutical Ingredient (API)', type: 'text' },
        {
          name: 'category',
          label: 'API Source Category',
          type: 'dropdown',
          options: ['Synthetic', 'Plant Extract', 'Biologic', 'Repurposed Drug'],
        },
      ],
    },
    {
      title: 'Study Scope & Therapeutic Target',
      fields: [
        {
          name: 'therapeuticArea',
          label: 'Target Therapeutic Area',
          type: 'dropdown',
          options: ['CNS', 'CVS', 'Endocrine', 'Gastrointestinal', 'Oncology', 'Inflammation', 'Metabolic'],
        },
        {
          name: 'studyType',
          label: 'Nature of Study',
          type: 'dropdown',
          options: ['Efficacy', 'Toxicity', 'Mechanistic', 'Pharmacokinetic'],
        },
        {
          name: 'workType',
          label: 'Primary Work Type',
          type: 'dropdown',
          options: ['In vivo', 'In vitro', 'In silico', 'Ex vivo'],
        },
      ],
    },
    {
      title: 'Experimental Design & Parameters',
      fields: [
        {
          name: 'experimentalModel',
          label: 'Specific Experimental Model',
          type: 'text',
          placeholder: 'e.g., STZ-induced diabetes',
        },
        {
          name: 'species',
          label: 'Target Animal/Cell Species',
          type: 'dropdown',
          options: ['Rat', 'Mouse', 'Rabbit', 'Zebrafish', 'Cell Lines', 'Human (Clinical)'],
        },
        { name: 'dose', label: 'Proposed Dose/Concentration Range', type: 'text' },
        {
          name: 'route',
          label: 'Proposed Route of Administration',
          type: 'dropdown',
          options: ['Oral', 'IP', 'IV', 'SC', 'Topical'],
        },
        {
          name: 'techniques',
          label: 'Primary Evaluation Techniques',
          type: 'dropdown',
          options: ['Behavioral', 'Biochemical', 'Histopathology', 'Molecular Biology'],
        },
        {
          name: 'parameters',
          label: 'Key Parameters to be Evaluated',
          type: 'checkbox_group',
          options: ['Biomarkers', 'Enzyme Levels', 'Gene Expression', 'Tissue Architecture', 'Behavioral Scores'],
        },
      ],
    },
    {
      title: 'Ethics & Expected Outcomes',
      fields: [
        {
          name: 'iaecApproval',
          label: 'IAEC / IEC Approval Required',
          type: 'radio',
          options: ['Yes', 'No', 'Applied'],
        },
        {
          name: 'workLocation',
          label: 'Primary Work Location',
          type: 'dropdown',
          options: ['Internal', 'External CRO', 'Hospital'],
        },
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
      { name: 'drugName', label: 'Drug Name', type: 'text', required: true, placeholder: 'e.g., Enter dissertation title...' },
      {
        name: 'dosageForm',
        label: 'Dosage Form',
        type: 'dropdown',
        options: ['Tablet', 'Capsule', 'Liquid', 'Topical', 'Injectable', 'NDDS', 'Emulgel', 'Scaffold formulation', 'Nano structured Lipid carriers', 'NLC-loaded biodegradable polymeric scaffold (nanocomposite/medicated sponge dressing)', 'Other'],
        required: true,
      },
      { name: 'primarySubject', label: 'Primary Subject / Target Active Ingredient', type: 'text', required: true, placeholder: 'e.g., Enter dissertation title...' },
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
      { name: 'methodPreparation', label: 'Methodology Details & Protocol', type: 'textarea', required: true, placeholder: 'e.g., Enter dissertation title...' },
      { name: 'tools', label: 'Required Tools & Instruments', type: 'text', required: true, placeholder: 'e.g., Enter dissertation title...' },
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
  const deptUpper = (department || '').toUpperCase();
  let schemaKey = Object.keys(DEPARTMENT_SCHEMAS).find(
    (k) => deptUpper.includes(k) || k.includes(deptUpper.split(' ')[0])
  );

  if (deptUpper.includes('PHARMACOGNOSY')) schemaKey = 'PHARMACOGNOSY';

  const schema = schemaKey ? DEPARTMENT_SCHEMAS[schemaKey] : GENERIC_SCHEMA;

  const [suggestions, setSuggestions] = useState<Record<string, string>>({});

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
