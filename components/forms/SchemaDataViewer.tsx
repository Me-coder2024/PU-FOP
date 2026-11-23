'use client';

import React from 'react';
import { DEPARTMENT_SCHEMAS } from '@/lib/config/department-schemas';
import { resolveDepartment } from '@/lib/config/departments';
import { Icon } from '@iconify/react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface SchemaDataViewerProps {
  /** The department name (e.g., "Pharmaceutical Chemistry") */
  department: string;
  /** The criteria_details JSONB blob from the submission */
  data: Record<string, unknown>;
}

/**
 * Read-only renderer for dynamic form submissions (schema_version >= 2).
 * Looks up the DEPARTMENT_SCHEMAS for the given department and renders
 * all field values with their labels in a clean grid layout.
 *
 * Use this in guide/HOD/PG-Director/Dean review modals to display
 * department-specific form data without duplicating layout logic.
 */
export default function SchemaDataViewer({ department, data }: SchemaDataViewerProps) {
  const schemaKey = resolveDepartment(typeof data.department === 'string' ? data.department : department);
  if (!schemaKey) return null;

  const schema = DEPARTMENT_SCHEMAS[schemaKey];
  if (!schema) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon icon="solar:document-text-bold-duotone" className="w-4 h-4 text-[#4361EE]" />
        <p className="text-xs font-black text-slate-500 uppercase tracking-widest" style={poppinsFont}>
          {department} — Form Details
        </p>
      </div>

      {schema.map((section, sIdx) => {
        // Check if any field in this section has a value
        const hasVisibleFields = section.fields.some((field) => {
          // Skip conditional fields whose condition isn't met
          if (field.condition && !field.condition(data)) return false;
          const val = data[field.name];
          if (val === undefined || val === null || val === '') return false;
          if (Array.isArray(val) && val.length === 0) return false;
          return true;
        });

        if (!hasVisibleFields) return null;

        return (
          <div key={sIdx} className="bg-[#F0F2F8] rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider" style={poppinsFont}>
              {section.title}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {section.fields.map((field) => {
                // Skip conditional fields whose condition isn't met
                if (field.condition && !field.condition(data)) return null;

                const val = data[field.name];
                if (val === undefined || val === null || val === '') return null;
                if (Array.isArray(val) && val.length === 0) return null;

                // Skip title field — it's already displayed separately in the modal header
                if (field.name === 'title') return null;

                return (
                  <div key={field.name}>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5" style={poppinsFont}>
                      {field.label}
                    </p>
                    {renderValue(val, field.type)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderValue(val: unknown, fieldType: string) {
  // Array values (checkbox_group selections)
  if (Array.isArray(val)) {
    return (
      <div className="flex flex-wrap gap-1 mt-0.5">
        {val.map((item, i) => (
          <span
            key={i}
            className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold rounded-full"
            style={poppinsFont}
          >
            {String(item)}
          </span>
        ))}
      </div>
    );
  }

  // Boolean / radio values
  if (typeof val === 'boolean') {
    return (
      <p className="text-sm font-semibold text-slate-900" style={authorFont}>
        {val ? 'Yes' : 'No'}
      </p>
    );
  }

  // Textarea / long text — detect by type or length
  const strVal = String(val);
  if (fieldType === 'textarea' || strVal.length > 100) {
    return (
      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap col-span-full" style={authorFont}>
        {strVal}
      </p>
    );
  }

  // File upload — show filename
  if (fieldType === 'file') {
    return (
      <div className="flex items-center gap-1.5">
        <Icon icon="solar:file-bold-duotone" className="w-3.5 h-3.5 text-blue-500" />
        <p className="text-sm font-semibold text-blue-600 truncate" style={authorFont}>
          {strVal}
        </p>
      </div>
    );
  }

  // Default — text/dropdown/radio
  return (
    <p className="text-sm font-semibold text-slate-900" style={authorFont}>
      {strVal}
    </p>
  );
}
