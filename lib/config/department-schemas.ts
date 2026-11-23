export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'dropdown' | 'checkbox_group' | 'radio' | 'file' | 'drug_multiselect';
  options?: string[];
  required?: boolean;
  condition?: (data: Record<string, unknown>) => boolean;
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

export const GENERIC_SCHEMA: SectionDef[] = [
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


export function validateDepartmentFields(key: string, data: Record<string, unknown>): string[] {
  return (DEPARTMENT_SCHEMAS[key] || []).flatMap(section => section.fields).filter(field => !field.condition || field.condition(data)).flatMap(field => {
    const value = data[field.name];
    const empty = value == null || value === "" || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length);
    if (field.required && empty) return [`${field.label} is required.`];
    if (empty) return [];
    if (field.options && (Array.isArray(value) ? value.some(v => !field.options!.includes(String(v))) : !field.options.includes(String(value)))) return [`Invalid ${field.label}.`];
    return [];
  });
}
