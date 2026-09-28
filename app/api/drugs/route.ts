import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

interface ComprehensiveDrug {
  name: string;
  category?: string;
  dosageForms?: string[];
  therapeutic?: string;
}

let cachedComprehensiveDrugs: ComprehensiveDrug[] | null = null;

async function getComprehensiveDrugs(): Promise<ComprehensiveDrug[]> {
  if (cachedComprehensiveDrugs && cachedComprehensiveDrugs.length > 0) {
    return cachedComprehensiveDrugs;
  }
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'comprehensive_drugs.json');
    const fileContent = await readFile(filePath, 'utf-8');
    cachedComprehensiveDrugs = JSON.parse(fileContent);
    return cachedComprehensiveDrugs || [];
  } catch (err) {
    console.error('Failed to read comprehensive_drugs.json:', err);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 2500);

    const supabase = createServiceClient();

    let dbDrugs: any[] = [];
    try {
      let query = supabase
        .from('drugs')
        .select('id, name, category, dosage_forms, therapeutic')
        .order('name', { ascending: true })
        .limit(limit);

      if (search) {
        query = query.ilike('name', `%${search}%`);
      }

      const { data, error } = await query;
      if (!error && data) {
        dbDrugs = data;
      } else if (error) {
        console.error('Drugs query error from Supabase:', error);
      }
    } catch (dbErr) {
      console.error('Supabase query exception in drugs route:', dbErr);
    }

    const uniqueDrugsMap = new Map<string, any>();
    const seenIds = new Set<string>();

    function addDrug(drug: { id?: string; name: string; category?: string; dosage_forms?: string[]; therapeutic?: string }) {
      if (!drug.name || !drug.name.trim()) return;
      const normalizedKey = drug.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (uniqueDrugsMap.has(normalizedKey)) return;

      let cleanId = drug.id || `comp-${drug.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      if (seenIds.has(cleanId)) {
        cleanId = `${cleanId}-${uniqueDrugsMap.size}`;
      }
      seenIds.add(cleanId);

      uniqueDrugsMap.set(normalizedKey, {
        ...drug,
        id: cleanId,
      });
    }

    // 1. Add database drugs
    for (const d of dbDrugs) {
      addDrug(d);
    }

    // 2. Merge matching drugs from comprehensive_drugs.json
    const compDrugs = await getComprehensiveDrugs();
    if (search) {
      const searchLower = search.toLowerCase();
      compDrugs
        .filter((d) => d.name.toLowerCase().includes(searchLower))
        .forEach((d) => {
          if (uniqueDrugsMap.size < limit) {
            addDrug({
              id: `comp-${d.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
              name: d.name,
              category: d.category || 'General',
              dosage_forms: d.dosageForms || [],
              therapeutic: d.therapeutic || '',
            });
          }
        });
    } else if (limit > 500) {
      for (const d of compDrugs) {
        if (uniqueDrugsMap.size >= limit) break;
        addDrug({
          id: `comp-${d.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: d.name,
          category: d.category || 'General',
          dosage_forms: d.dosageForms || [],
          therapeutic: d.therapeutic || '',
        });
      }
    }

    // Default dosage forms including Emulgel, Scaffold formulation, Nano structured Lipid carriers, NLC-loaded biodegradable polymeric scaffold
    const DEFAULT_DOSAGE_FORMS = [
      'Tablet', 'Capsule', 'Liquid', 'Topical', 'Injectable', 'NDDS',
      'Emulgel', 'Scaffold formulation', 'Suppository', 'Inhaler',
      'Transdermal Patch', 'Film', 'Microspheres', 'Nanoparticles',
      'Gel', 'Ointment', 'Cream', 'Suspension', 'Emulsion', 'Elixir',
      'Syrup', 'Lozenge', 'Implants', 'Spray',
      'Nano structured Lipid carriers',
      'NLC-loaded biodegradable polymeric scaffold (nanocomposite/medicated sponge dressing)',
      'Other'
    ];
    const allDosageForms = new Set<string>(DEFAULT_DOSAGE_FORMS);

    // Collect dosage forms from drugs table
    try {
      const { data: allDrugs, error: formsError } = await supabase
        .from('drugs')
        .select('dosage_forms')
        .limit(1000);

      if (!formsError && allDrugs) {
        allDrugs.forEach((drug) => {
          if (Array.isArray(drug.dosage_forms)) {
            drug.dosage_forms.forEach((form: string) => {
              if (form) allDosageForms.add(form);
            });
          }
        });
      }
    } catch {
      // Fall back to default dosage forms
    }

    // Collect approved drug & dosage form requests dynamically from drug_requests table
    try {
      const { data: approvedRequests } = await supabase
        .from('drug_requests')
        .select('id, drug_name, dosage_form, category, therapeutic')
        .in('status', ['approved', 'dean_approved', 'pg_approved']);

      if (approvedRequests) {
        approvedRequests.forEach((req) => {
          if (req.category === 'DOSAGE_FORM_REQUEST') {
            if (req.drug_name) {
              allDosageForms.add(req.drug_name);
            }
          } else {
            if (req.dosage_form) {
              allDosageForms.add(req.dosage_form);
            }
            if (req.drug_name && (!search || req.drug_name.toLowerCase().includes(search.toLowerCase()))) {
              addDrug({
                id: req.id,
                name: req.drug_name,
                category: req.category || 'Requested Drug',
                dosage_forms: req.dosage_form ? [req.dosage_form] : [],
                therapeutic: req.therapeutic || 'N/A',
              });
            }
          }
        });
      }
    } catch {
      // Fall through
    }

    const drugsList = Array.from(uniqueDrugsMap.values());

    return NextResponse.json({
      drugs: drugsList,
      dosageForms: Array.from(allDosageForms).sort(),
      total: drugsList.length,
    });
  } catch (err) {
    console.error('Drugs API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
