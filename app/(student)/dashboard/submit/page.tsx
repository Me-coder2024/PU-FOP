'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import type { SubmissionRow } from '@/lib/supabase/types';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface Drug {
  id: string;
  name: string;
  category: string;
  dosage_forms: string[];
  therapeutic: string;
}

const DEFAULT_DOSAGE_FORMS = [
  'Tablet', 'Capsule', 'Liquid', 'Topical', 'Injectable', 'NDDS',
  'Emulgel', 'Scaffold formulation', 'Suppository', 'Inhaler',
  'Transdermal Patch', 'Film', 'Microspheres', 'Nanoparticles',
  'Gel', 'Ointment', 'Cream', 'Suspension', 'Emulsion', 'Elixir',
  'Syrup', 'Lozenge', 'Implants', 'Spray', 'Other'
];

interface LayerResult {
  passed: boolean;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  details?: string;
}

interface ScoreBreakdown {
  drugName: { score: number; max: number; detail: string };
  dosageForm: { score: number; max: number; detail: string };
  keywords: { score: number; max: number; detail: string };
  excipients: { score: number; max: number; detail: string };
  total: number;
  maxTotal: number;
}

interface ValidationResult {
  canSubmit: boolean;
  layers: {
    layer1: LayerResult;
    layer2: LayerResult;
    layer3: LayerResult;
  };
  scores: ScoreBreakdown;
  suggestions: string[];
}

export default function SubmitTitlePage() {
  const { profile } = useRole();
  const router = useRouter();
  const supabase = createClient();
  const { warning } = useToast();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      warning('For better experience open in laptop or desktop', 'Tip');
    }
  }, [warning]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [existingSubmission, setExistingSubmission] = useState<SubmissionRow | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [novelty, setNovelty] = useState('');
  const [drugName, setDrugName] = useState('');
  const [dosageForm, setDosageForm] = useState('');
  const [primarySubject, setPrimarySubject] = useState('');
  const [coreDomain, setCoreDomain] = useState('');
  const [methodology, setMethodology] = useState('');
  const [toolsInstruments, setToolsInstruments] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [excipients, setExcipients] = useState('');
  const [keywords, setKeywords] = useState('');

  const [deliverables, setDeliverables] = useState({
    publication: false,
    patent: false,
    prototype: false,
    dataset: false,
  });

  // Drug dropdown state
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [drugSearch, setDrugSearch] = useState('');
  const [showDrugDropdown, setShowDrugDropdown] = useState(false);
  const [dosageForms, setDosageForms] = useState<string[]>(DEFAULT_DOSAGE_FORMS);
  const [allDosageFormsList, setAllDosageFormsList] = useState<string[]>(DEFAULT_DOSAGE_FORMS);
  const [dosageSearch, setDosageSearch] = useState('');
  const [showDosageDropdown, setShowDosageDropdown] = useState(false);
  const drugRef = useRef<HTMLDivElement>(null);
  const dosageRef = useRef<HTMLDivElement>(null);

  // Validation state
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validationRun, setValidationRun] = useState(false);

  const isEditMode = existingSubmission && (
    existingSubmission.status === 'revision_requested' ||
    existingSubmission.edit_unlocked
  );

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (drugRef.current && !drugRef.current.contains(e.target as Node)) setShowDrugDropdown(false);
      if (dosageRef.current && !dosageRef.current.contains(e.target as Node)) setShowDosageDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch drugs from API
  useEffect(() => {
    async function fetchDrugs() {
      try {
        const res = await fetch(`/api/drugs?search=${encodeURIComponent(drugSearch)}&limit=200`);
        if (res.ok) {
          const data = await res.json();
          setDrugs(data.drugs || []);
          const fetchedForms = Array.from(new Set([...(data.dosageForms || []), ...DEFAULT_DOSAGE_FORMS]));
          setAllDosageFormsList(fetchedForms);
          setDosageForms(fetchedForms);
        }
      } catch (err) {
        console.error('Failed to fetch drugs:', err);
      }
    }
    const timeout = setTimeout(fetchDrugs, 300);
    return () => clearTimeout(timeout);
  }, [drugSearch]);

  useEffect(() => {
    async function loadData() {
      if (!profile) return;
      try {
        const { data: winData } = await supabase.rpc('is_submission_open', {
          p_institute_id: profile.institute_id || undefined,
        });
        setWindowOpen(!!winData);

        const { data: subData } = await supabase
          .from('submissions')
          .select('*')
          .eq('student_id', profile.id)
          .not('status', 'in', '("guide_rejected","hod_rejected")')
          .maybeSingle();

        if (subData) {
          setExistingSubmission(subData as SubmissionRow);
          setTitle(subData.title);
          const details = (subData.criteria_details as Record<string, unknown>) || {};
          setNovelty((details.novelty as string) || '');
          setDrugName((details.drugName as string) || '');
          setDrugSearch((details.drugName as string) || '');
          setDosageForm((details.dosageForm as string) || '');
          setDosageSearch((details.dosageForm as string) || '');
          setPrimarySubject((details.primarySubject as string) || '');
          setCoreDomain((details.coreDomain as string) || '');
          setMethodology((details.methodology as string) || '');
          setToolsInstruments((details.toolsInstruments as string) || '');
          setWorkLocation((details.workLocation as string) || '');
          setExcipients((details.excipients as string) || '');
          setKeywords((details.keywords as string) || '');
          if (details.deliverables && typeof details.deliverables === 'object') {
            setDeliverables(details.deliverables as typeof deliverables);
          }
        }
      } catch (err) {
        console.error('Error loading submit page data', err);
      } finally {
        setLoading(false);
      }
    }
    if (profile) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Run validation
  const runValidation = useCallback(async () => {
    if (!title.trim() || !drugName.trim() || !dosageForm.trim()) return;

    setValidating(true);
    setValidationResult(null);
    setValidationRun(true);

    try {
      const res = await fetch('/api/validate-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          drugName: drugName.trim(),
          dosageForm: dosageForm.trim(),
          keywords: keywords.trim(),
          excipients: excipients.trim(),
          novelty: novelty.trim(),
          excludeSubmissionId: existingSubmission?.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setValidationResult(data);
      } else {
        const errData = await res.json().catch(() => ({ error: 'Validation failed' }));
        setError(errData.error || 'Validation service error');
      }
    } catch (err) {
      console.error('Validation error:', err);
      setError('Failed to validate title. Please try again.');
    } finally {
      setValidating(false);
    }
  }, [title, drugName, dosageForm, keywords, excipients, novelty, existingSubmission]);

  // Live Validation with debounce
  useEffect(() => {
    if (!title.trim() || !drugName.trim() || !dosageForm.trim()) {
      setValidationResult(null);
      setValidationRun(false);
      return;
    }

    if (title.trim().length <= 10) {
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      runValidation();
    }, 1000); // 1000ms delay

    return () => clearTimeout(delayDebounceFn);
  }, [title, drugName, dosageForm, keywords, excipients, novelty, runValidation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) { setError('Dissertation Title is required.'); return; }
    if (!novelty.trim()) { setError('Statement of Novelty is required.'); return; }
    if (!drugName.trim()) { setError('Drug Name is required.'); return; }
    if (!dosageForm.trim()) { setError('Dosage Form is required.'); return; }
    if (!primarySubject.trim()) { setError('Primary Subject / Target Active Ingredient is required.'); return; }
    if (!coreDomain.trim()) { setError('Core Project Domain is required.'); return; }

    // Must have passed all validation layers
    if (!validationResult?.canSubmit) {
      setError('Please run validation and ensure all 3 layers pass before submitting.');
      return;
    }

    if (!profile) return;

    setSubmitting(true);

    // Prevent duplicate title or duplicate novelty submission
    try {
      const { data: dupTitle } = await supabase
        .from('submissions')
        .select('id')
        .ilike('title', title.trim())
        .not('status', 'in', '("guide_rejected","hod_rejected")')
        .maybeSingle();

      if (dupTitle && (!existingSubmission || dupTitle.id !== existingSubmission.id)) {
        setError('This exact title has already been submitted by another student.');
        setSubmitting(false);
        return;
      }

      const { data: dupNovelty } = await supabase
        .from('submissions')
        .select('id')
        .ilike('description', novelty.trim())
        .not('status', 'in', '("guide_rejected","hod_rejected")')
        .maybeSingle();

      if (dupNovelty && (!existingSubmission || dupNovelty.id !== existingSubmission.id)) {
        setError('This Statement of Novelty has already been submitted by another student.');
        setSubmitting(false);
        return;
      }
    } catch (dupCheckErr) {
      console.error('Duplicate submission check error:', dupCheckErr);
    }

    const criteriaDetails = {
      novelty: novelty.trim(),
      drugName: drugName.trim(),
      dosageForm: dosageForm.trim(),
      primarySubject: primarySubject.trim(),
      coreDomain: coreDomain.trim(),
      methodology: methodology.trim(),
      toolsInstruments: toolsInstruments.trim(),
      workLocation: workLocation.trim(),
      excipients: excipients.trim(),
      keywords: keywords.trim(),
      deliverables,
      validationScores: validationResult.scores,
    };

    try {
      if (isEditMode && existingSubmission) {
        const { error: updateError } = await supabase
          .from('submissions')
          .update({
            title: title.trim(),
            description: novelty.trim(),
            criteria_details: criteriaDetails,
            status: 'submitted',
            edit_unlocked: false,
          })
          .eq('id', existingSubmission.id);

        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await supabase
          .from('submissions')
          .insert({
            student_id: profile.id,
            guide_id: profile.guide_id || null,
            title: title.trim(),
            description: novelty.trim(),
            criteria_details: criteriaDetails,
            status: 'submitted',
          });

        if (insertError) {
          if (insertError.message.includes('idx_one_active_submission_per_student')) {
            throw new Error('You already have an active submission. You can only submit one title at a time.');
          }
          throw new Error(insertError.message);
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered dropdowns
  const filteredDrugs = drugs.filter(d =>
    d.name.toLowerCase().includes(drugSearch.toLowerCase())
  );
  const filteredDosageForms = dosageForms.filter(f =>
    f.toLowerCase().includes(dosageSearch.toLowerCase())
  );

  // Can run validation?
  const canValidate = title.trim().length > 10 && drugName.trim() && dosageForm.trim();
  const canSubmit = validationResult?.canSubmit && !submitting && (windowOpen || !!isEditMode);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-[#4361EE] animate-spin" />
      </div>
    );
  }

  if (existingSubmission && !isEditMode && !['guide_rejected', 'hod_rejected'].includes(existingSubmission.status)) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber-200">
          <Icon icon="solar:document-bold-duotone" className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-3" style={authorFont}>Title Already Submitted</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6" style={authorFont}>
          You already have an active submission: <span className="font-bold text-slate-800">&quot;{existingSubmission.title}&quot;</span>. You can only have one active title at a time.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#4361EE] text-white text-sm font-bold rounded-xl hover:bg-[#4361EE]/90 transition-all"
          style={authorFont}
        >
          <Icon icon="solar:arrow-left-linear" className="w-4 h-4" />
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-200">
          <Icon icon="solar:check-circle-bold-duotone" className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-3" style={authorFont}>
          {isEditMode ? 'Title Updated Successfully!' : 'Title Submitted Successfully!'}
        </h2>
        <p className="text-sm text-slate-500" style={authorFont}>
          {isEditMode
            ? 'Your revised title has been resubmitted for guide review.'
            : "Your title has been submitted to your selected guide. You'll receive notifications about the progress."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">

      {/* ===== Mobile Banner ===== */}
      <div className="lg:hidden p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
        <Icon icon="solar:monitor-smartphone-bold-duotone" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-amber-800" style={authorFont}>Better on Desktop</p>
          <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed" style={authorFont}>
            For the best experience, open this page on a <strong>laptop or desktop</strong>. Some features like the AI score panel are hidden on mobile.
          </p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* ===== Main Form Column ===== */}
        <div className="flex-1 space-y-6 max-w-3xl">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-xl sm:text-[32px] font-black text-slate-900 tracking-tight italic" style={authorFont}>
                {isEditMode ? 'Edit Dissertation Topic' : 'Submit New Dissertation Topic'}
              </h1>
              <div className="w-8 h-8 rounded-lg bg-[#4361EE] flex items-center justify-center flex-shrink-0">
                <Icon icon="solar:document-add-bold" className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="text-sm text-slate-500" style={authorFont}>
              Fill in all fields below. The AI validation system will check your title across 3 layers before submission is allowed.
            </p>
          </div>

          {!windowOpen && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <Icon icon="solar:danger-triangle-bold-duotone" className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-800" style={authorFont}>Submission Window Closed</p>
                <p className="text-[11px] text-red-700 mt-0.5" style={authorFont}>The submission window is currently closed.</p>
              </div>
            </div>
          )}

          {isEditMode && existingSubmission?.guide_remarks && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <Icon icon="solar:danger-triangle-bold-duotone" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-800" style={authorFont}>Guide Feedback</p>
                <p className="text-[11px] text-amber-700 mt-0.5" style={authorFont}>{existingSubmission.guide_remarks}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} id="submit-form" className="space-y-6">
            <FormField id="title" label="Dissertation Title" required value={title} onChange={setTitle} placeholder="e.g., Formulation and Evaluation of Curcumin Nanoparticles..." />

            <FormTextArea id="novelty" label="Statement of Novelty" required value={novelty} onChange={setNovelty} placeholder="Describe what makes your research novel and how it differs from existing work..." rows={4} />

            {/* Drug Name Searchable Dropdown */}
            <div ref={drugRef} className="relative">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest block mb-2" style={authorFont}>
                Drug Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Icon icon="solar:pill-bold-duotone" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4361EE]" />
                <input
                  type="text"
                  value={drugSearch}
                  onChange={(e) => {
                    setDrugSearch(e.target.value);
                    setDrugName('');
                    setShowDrugDropdown(true);
                  }}
                  onFocus={() => setShowDrugDropdown(true)}
                  placeholder="Search drugs..."
                  className="w-full pl-10 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all"
                  style={authorFont}
                />
                {drugName && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Selected</span>
                    <button type="button" onClick={() => { setDrugName(''); setDrugSearch(''); setDosageForm(''); setDosageSearch(''); setDosageForms(allDosageFormsList); }} className="text-slate-400 hover:text-red-500">
                      <Icon icon="solar:close-circle-bold" className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {showDrugDropdown && filteredDrugs.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                  {filteredDrugs.map((drug) => (
                    <button
                      key={drug.id}
                      type="button"
                      onClick={() => {
                        setDrugName(drug.name);
                        setDrugSearch(drug.name);
                        setShowDrugDropdown(false);
                        setDosageForm('');
                        setDosageSearch('');
                        const combinedForms = Array.from(new Set([...(drug.dosage_forms || []), ...allDosageFormsList, 'Emulgel', 'Scaffold formulation']));
                        setDosageForms(combinedForms);
                      }}
                      className={`w-full text-left px-4 py-2.5 hover:bg-[#4361EE]/5 transition-colors flex items-center justify-between ${drug.name === drugName ? 'bg-[#4361EE]/10' : ''}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900" style={authorFont}>{drug.name}</p>
                        <p className="text-[10px] text-slate-500" style={authorFont}>{drug.category} • {drug.therapeutic}</p>
                      </div>
                      {drug.name === drugName && <Icon icon="solar:check-circle-bold" className="w-4 h-4 text-[#4361EE]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dosage Form Searchable Dropdown */}
            <div ref={dosageRef} className="relative">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest block mb-2" style={authorFont}>
                Dosage Form <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Icon icon="solar:medical-kit-bold-duotone" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4361EE]" />
                <input
                  type="text"
                  value={dosageSearch}
                  onChange={(e) => {
                    setDosageSearch(e.target.value);
                    setDosageForm('');
                    setShowDosageDropdown(true);
                  }}
                  onFocus={() => setShowDosageDropdown(true)}
                  placeholder={drugName ? `Select dosage form for ${drugName}...` : 'Select a drug first...'}
                  disabled={!drugName}
                  className="w-full pl-10 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={authorFont}
                />
                {dosageForm && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Selected</span>
                    <button type="button" onClick={() => { setDosageForm(''); setDosageSearch(''); }} className="text-slate-400 hover:text-red-500">
                      <Icon icon="solar:close-circle-bold" className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {showDosageDropdown && filteredDosageForms.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {filteredDosageForms.map((form) => (
                    <button
                      key={form}
                      type="button"
                      onClick={() => {
                        setDosageForm(form);
                        setDosageSearch(form);
                        setShowDosageDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 hover:bg-[#4361EE]/5 transition-colors text-sm font-semibold text-slate-900 ${form === dosageForm ? 'bg-[#4361EE]/10' : ''}`}
                      style={authorFont}
                    >
                      {form}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <FormField id="primarySubject" label="Primary Subject / Target Active Ingredient" required value={primarySubject} onChange={setPrimarySubject} placeholder="e.g., Curcumin, Ibuprofen, Metformin..." />

            <FormField id="coreDomain" label="Core Project Domain" required value={coreDomain} onChange={setCoreDomain} placeholder="e.g., Nanotechnology, Drug Delivery, Formulation Development..." />

            <FormField id="excipients" label="Excipients" value={excipients} onChange={setExcipients} placeholder="e.g., HPMC, PVA, Eudragit, Chitosan..." />

            <FormField id="keywords" label="Keywords" value={keywords} onChange={setKeywords} placeholder="e.g., nanoparticles, sustained release, bioavailability..." />

            <FormField id="toolsInstruments" label="Required Tools & Instruments" required value={toolsInstruments} onChange={setToolsInstruments} placeholder="e.g., FTIR, DSC, XRD, SEM, UV Spectrophotometer..." />

            <FormField id="workLocation" label="Primary Work Location" required value={workLocation} onChange={setWorkLocation} placeholder="e.g., Pharmaceutics Lab, Central Instrumentation Lab..." />

            <FormTextArea id="methodology" label="Methodology Details & Protocol" value={methodology} onChange={setMethodology} placeholder="Describe your research methodology..." rows={3} />

            {/* Expected Deliverables */}
            <div>
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest block mb-3" style={authorFont}>
                Expected Deliverables
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'publication', label: 'Publication' },
                  { key: 'patent', label: 'Patent' },
                  { key: 'prototype', label: 'Prototype' },
                  { key: 'dataset', label: 'Dataset' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-[#4361EE]/30 transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={deliverables[item.key as keyof typeof deliverables]}
                      onChange={(e) => setDeliverables(prev => ({ ...prev, [item.key]: e.target.checked }))}
                      className="w-4 h-4 text-[#4361EE] border-slate-300 rounded focus:ring-[#4361EE]/20"
                    />
                    <span className="text-sm font-semibold text-slate-700" style={authorFont}>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <Icon icon="solar:danger-triangle-bold-duotone" className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-red-800" style={authorFont}>{error}</p>
              </div>
            )}
          </form>
        </div>

        {/* ===== Right Sidebar — Research Alignment Score ===== */}
        <div className="hidden xl:block w-[280px] flex-shrink-0">
          <div className="sticky top-24 space-y-4">
            {/* Info icon */}
            <div className="flex justify-end">
              <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center">
                <Icon icon="solar:info-circle-linear" className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* Score Card — Blue header */}
            <div className="rounded-2xl border border-[#4361EE] overflow-hidden bg-[#4361EE]">
              <div className="bg-[#4361EE] px-5 py-4 flex items-center gap-2.5">
                <Icon icon="simple-icons:securityscorecard" className="w-6 h-6 text-white" />
                <h3 className="text-sm font-bold text-white" style={authorFont}>Research Alignment Score</h3>
              </div>

              <div className="bg-[#4361EE] p-4 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <ScoreCard
                    icon="solar:pill-bold-duotone"
                    label="Drug Name"
                    score={validationResult?.scores?.drugName?.score ?? 0}
                    max={30}
                    sub="in title"
                  />
                  <ScoreCard
                    icon="solar:medical-kit-bold-duotone"
                    label="Dosage Form"
                    score={validationResult?.scores?.dosageForm?.score ?? 0}
                    max={35}
                    sub="in title"
                  />
                  <ScoreCard
                    icon="solar:widget-5-bold-duotone"
                    label="Excipients"
                    score={validationResult?.scores?.excipients?.score ?? 0}
                    max={15}
                    sub="AI Verification"
                  />
                  <ScoreCard
                    icon="solar:key-minimalistic-bold-duotone"
                    label="Keywords"
                    score={validationResult?.scores?.keywords?.score ?? 0}
                    max={15}
                    sub="AI Verification"
                  />
                </div>

                {/* Total Score */}
                <div className="mt-3 bg-white/10 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-white/70 uppercase tracking-widest font-bold" style={authorFont}>Total Score</p>
                  <div className="flex items-baseline justify-center gap-1 mt-1">
                    <span className="text-3xl font-black text-white" style={poppinsFont}>
                      {validationResult?.scores?.total ?? 0}
                    </span>
                    <span className="text-sm text-white/50 font-bold" style={poppinsFont}>/95</span>
                  </div>
                  <div className="mt-2 w-full bg-white/20 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        (validationResult?.scores?.total ?? 0) >= 40 ? 'bg-emerald-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${Math.min(100, ((validationResult?.scores?.total ?? 0) / 95) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-white/50 mt-1.5" style={authorFont}>
                    Minimum 40 required to submit
                  </p>
                </div>
              </div>
            </div>
            {/* Validation Layer Details in Sidebar */}
            {validationResult && (
              <div className="mt-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-3">
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-widest" style={authorFont}>
                  Layer Details
                </p>
                
                {/* Layer 1 */}
                <div className="text-[11px]" style={authorFont}>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Icon
                      icon={validationResult.layers.layer1.passed ? "solar:check-circle-bold" : "solar:close-circle-bold"}
                      className={`w-3.5 h-3.5 ${validationResult.layers.layer1.passed ? 'text-emerald-500' : 'text-red-500'}`}
                    />
                    <span>Layer 1: Uniqueness</span>
                  </div>
                  <p className="text-slate-500 ml-5 mt-0.5 leading-tight">{validationResult.layers.layer1.message}</p>
                  {validationResult.layers.layer1.details && (
                    <p className="text-slate-400 ml-5 text-[10px] italic leading-tight mt-0.5">{validationResult.layers.layer1.details}</p>
                  )}
                </div>

                {/* Layer 2 */}
                <div className="text-[11px] border-t border-slate-100 pt-2" style={authorFont}>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Icon
                      icon={validationResult.layers.layer2.passed ? "solar:check-circle-bold" : "solar:close-circle-bold"}
                      className={`w-3.5 h-3.5 ${validationResult.layers.layer2.passed ? 'text-emerald-500' : 'text-red-500'}`}
                    />
                    <span>Layer 2: AI Novelty</span>
                  </div>
                  <p className="text-slate-500 ml-5 mt-0.5 leading-tight">{validationResult.layers.layer2.message}</p>
                  {validationResult.layers.layer2.details && (
                    <p className="text-slate-400 ml-5 text-[10px] italic leading-tight mt-0.5">{validationResult.layers.layer2.details}</p>
                  )}
                </div>

                {/* Layer 3 */}
                <div className="text-[11px] border-t border-slate-100 pt-2" style={authorFont}>
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <Icon
                      icon={validationResult.layers.layer3.passed ? "solar:check-circle-bold" : "solar:close-circle-bold"}
                      className={`w-3.5 h-3.5 ${validationResult.layers.layer3.passed ? 'text-emerald-500' : 'text-red-500'}`}
                    />
                    <span>Layer 3: Alignment Score</span>
                  </div>
                  <p className="text-slate-500 ml-5 mt-0.5 leading-tight">{validationResult.layers.layer3.message}</p>
                  {validationResult.layers.layer3.details && (
                    <p className="text-slate-400 ml-5 text-[10px] italic leading-tight mt-0.5">{validationResult.layers.layer3.details}</p>
                  )}
                </div>
              </div>
            )}

            {/* AI Suggestions in Sidebar */}
            {validationResult && validationResult.suggestions.length > 0 && !validationResult.canSubmit && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl shadow-sm">
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon icon="solar:lightbulb-bolt-bold-duotone" className="w-4.5 h-4.5 text-amber-600" />
                  <p className="text-[11px] font-bold text-amber-800 uppercase tracking-widest" style={authorFont}>AI Suggestions</p>
                </div>
                <ul className="space-y-2">
                  {validationResult.suggestions.map((s, i) => (
                    <li key={i} className="text-[11px] text-amber-700 flex items-start gap-1.5 leading-tight" style={authorFont}>
                      <span className="text-amber-400 mt-0.5">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Fixed Bottom Blue Footer ===== */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-[250px] z-40 bg-[#4361EE] text-white py-3 px-4 md:py-4 md:px-8 border-t border-blue-500 shadow-2xl flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <p className="text-[9px] font-black text-white/70 uppercase tracking-widest hidden sm:block" style={authorFont}>
            Submission Status
          </p>
          <div className="flex items-center gap-2 min-w-0">
            {validating ? (
              <>
                <Loader2 className="w-4 h-4 text-white animate-spin flex-shrink-0" />
                <p className="text-xs text-white/90 font-medium truncate" style={authorFont}>
                  Checking AI validation status...
                </p>
              </>
            ) : validationResult ? (
              <>
                <Icon
                  icon={validationResult.canSubmit ? "solar:check-circle-bold" : "solar:danger-triangle-bold"}
                  className={`w-4 h-4 flex-shrink-0 ${validationResult.canSubmit ? 'text-emerald-300' : 'text-amber-300'}`}
                />
                <p className="text-xs text-white font-medium text-left truncate" style={authorFont}>
                  {!validationResult.layers.layer1.passed ? (
                    `Layer 1 Rejected: ${validationResult.layers.layer1.message}`
                  ) : !validationResult.layers.layer2.passed ? (
                    `Passed Layer 1. Layer 2 Rejected: ${validationResult.layers.layer2.message}`
                  ) : !validationResult.layers.layer3.passed ? (
                    `Score ${validationResult.scores.total}/95 below 40`
                  ) : (
                    `All 3 layers passed! Score: ${validationResult.scores.total}/95`
                  )}
                </p>
              </>
            ) : (
              <>
                <Icon icon="solar:info-circle-bold" className="w-4 h-4 text-white/70 flex-shrink-0" />
                <p className="text-xs text-white/70 font-medium truncate" style={authorFont}>
                  {!title.trim() || !drugName.trim() || !dosageForm.trim()
                    ? 'Fill all required fields'
                    : title.trim().length <= 10
                      ? 'Title too short'
                      : 'Waiting for live check...'}
                </p>
              </>
            )}
          </div>
        </div>

        <button
          type="submit"
          form="submit-form"
          disabled={!canSubmit}
          className={`inline-flex items-center gap-2 py-2.5 px-4 md:px-6 font-bold text-xs md:text-sm rounded-xl transition-all active:scale-[0.98] shadow-md flex-shrink-0 ${
            canSubmit
              ? 'bg-white text-[#4361EE] hover:bg-white/90 shadow-white/10'
              : 'bg-white/20 text-white/50 cursor-not-allowed'
          }`}
          style={authorFont}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Processing...</span>
            </>
          ) : (
            <>
              <Icon icon="solar:play-bold" className="w-4 h-4" />
              <span className="hidden sm:inline">{isEditMode ? 'Resubmit Your Title' : 'Submit Your Title'}</span>
              <span className="sm:hidden">{isEditMode ? 'Resubmit' : 'Submit'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ===== Validation Layer Row ===== */
function ValidationLayerRow({ icon, label, status, message, details }: {
  icon: string; label: string; status: string; message: string; details?: string;
}) {
  const statusConfig = {
    passed: { icon: 'solar:check-circle-bold-duotone', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    failed: { icon: 'solar:close-circle-bold-duotone', color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
    skipped: { icon: 'solar:minus-circle-bold-duotone', color: 'text-slate-400', bg: 'bg-slate-50 border-slate-200' },
    checking: { icon: 'solar:loading-bold-duotone', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
    pending: { icon: 'solar:clock-circle-bold-duotone', color: 'text-slate-300', bg: 'bg-slate-50 border-slate-100' },
  }[status] || { icon: 'solar:info-circle-bold', color: 'text-slate-400', bg: 'bg-slate-50 border-slate-200' };

  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border p-3 ${statusConfig.bg} transition-all`}>
      <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => details && setExpanded(!expanded)}>
        <Icon icon={icon} className={`w-4 h-4 ${statusConfig.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-slate-800" style={authorFont}>{label}</p>
          <p className="text-[10px] text-slate-600 truncate" style={authorFont}>{message}</p>
        </div>
        <Icon icon={statusConfig.icon} className={`w-5 h-5 ${statusConfig.color} flex-shrink-0 ${status === 'checking' ? 'animate-spin' : ''}`} />
        {details && (
          <Icon icon={expanded ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"} className="w-3 h-3 text-slate-400" />
        )}
      </div>
      {expanded && details && (
        <div className="mt-2 pt-2 border-t border-slate-200/50">
          <p className="text-[10px] text-slate-600 whitespace-pre-wrap" style={authorFont}>{details}</p>
        </div>
      )}
    </div>
  );
}

/* ===== Reusable Form Components ===== */

function FormField({ id, label, required, value, onChange, placeholder }: {
  id: string; label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-black text-slate-700 uppercase tracking-widest block mb-2" style={authorFont}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all"
        style={authorFont}
      />
    </div>
  );
}

function FormTextArea({ id, label, required, value, onChange, placeholder, rows }: {
  id: string; label: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder: string; rows: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-black text-slate-700 uppercase tracking-widest block mb-2" style={authorFont}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        rows={rows}
        className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:border-[#4361EE] transition-all resize-none"
        style={authorFont}
      />
    </div>
  );
}

function ScoreCard({ icon, label, score, max, sub }: {
  icon: string; label: string; score: number; max: number; sub: string;
}) {
  return (
    <div className="bg-[#F3F4F6] rounded-xl p-3.5 border border-slate-200">
      <div className="flex items-center gap-1.5 mb-3">
        <Icon icon={icon} className="w-3.5 h-3.5 text-[#4361EE]" />
        <span className="text-[10px] font-bold text-slate-600" style={authorFont}>{label}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold text-slate-900" style={poppinsFont}>{score}</span>
        <span className="text-xs text-slate-400 font-bold" style={poppinsFont}>/{max}</span>
      </div>
      <div className="w-full h-[2px] bg-slate-900 rounded-full mt-2 mb-1.5" />
      <p className="text-[9px] text-slate-400" style={authorFont}>{sub}</p>
    </div>
  );
}
