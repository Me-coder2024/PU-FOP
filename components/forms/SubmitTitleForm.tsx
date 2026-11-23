'use client';

import { resolveDepartment } from '@/lib/config/departments';
import { DEPARTMENT_SCHEMAS, GENERIC_SCHEMA, type SectionDef, type FieldDef } from '@/lib/config/department-schemas';
export { DEPARTMENT_SCHEMAS } from '@/lib/config/department-schemas';
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

function resolveDepartmentSchema(department: string): SectionDef[] {
  return DEPARTMENT_SCHEMAS[resolveDepartment(department) || ''] || GENERIC_SCHEMA;
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
