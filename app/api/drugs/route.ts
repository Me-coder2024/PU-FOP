import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

    const supabase = createServiceClient();

    let query = supabase
      .from('drugs')
      .select('id, name, category, dosage_forms, therapeutic')
      .order('name', { ascending: true })
      .limit(limit);

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data: dbDrugs, error } = await query;

    if (error) {
      console.error('Drugs query error:', error);
      return NextResponse.json({ error: 'Failed to fetch drugs' }, { status: 500 });
    }

    const drugsList = [...(dbDrugs || [])];

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
    const { data: allDrugs, error: formsError } = await supabase
      .from('drugs')
      .select('dosage_forms');

    if (!formsError && allDrugs) {
      allDrugs.forEach((drug) => {
        if (Array.isArray(drug.dosage_forms)) {
          drug.dosage_forms.forEach((form: string) => {
            if (form) allDosageForms.add(form);
          });
        }
      });
    }

    // Collect approved drug & dosage form requests dynamically from drug_requests table
    const { data: approvedRequests } = await supabase
      .from('drug_requests')
      .select('id, drug_name, dosage_form, category, therapeutic')
      .in('status', ['approved', 'dean_approved', 'pg_approved']);

    if (approvedRequests) {
      const existingDrugNames = new Set(drugsList.map(d => d.name.toLowerCase()));

      approvedRequests.forEach((req) => {
        if (req.category === 'DOSAGE_FORM_REQUEST') {
          // If it's a dosage form request, add the dosage form name to allDosageForms
          if (req.drug_name) {
            allDosageForms.add(req.drug_name);
          }
        } else {
          // It's a drug request
          if (req.dosage_form) {
            allDosageForms.add(req.dosage_form);
          }
          // If the approved drug isn't in the main drugs list, add it to drugsList
          if (req.drug_name && !existingDrugNames.has(req.drug_name.toLowerCase())) {
            existingDrugNames.add(req.drug_name.toLowerCase());
            if (!search || req.drug_name.toLowerCase().includes(search.toLowerCase())) {
              drugsList.push({
                id: req.id,
                name: req.drug_name,
                category: req.category || 'Requested Drug',
                dosage_forms: req.dosage_form ? [req.dosage_form] : [],
                therapeutic: req.therapeutic || 'N/A',
              });
            }
          }
        }
      });
    }

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
