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

    const { data: drugs, error } = await query;

    if (error) {
      console.error('Drugs query error:', error);
      return NextResponse.json({ error: 'Failed to fetch drugs' }, { status: 500 });
    }

    // Default dosage forms including Emulgel and Scaffold formulation
    const DEFAULT_DOSAGE_FORMS = [
      'Tablet', 'Capsule', 'Liquid', 'Topical', 'Injectable', 'NDDS',
      'Emulgel', 'Scaffold formulation', 'Suppository', 'Inhaler',
      'Transdermal Patch', 'Film', 'Microspheres', 'Nanoparticles',
      'Gel', 'Ointment', 'Cream', 'Suspension', 'Emulsion', 'Elixir',
      'Syrup', 'Lozenge', 'Implants', 'Spray'
    ];
    const allDosageForms = new Set<string>(DEFAULT_DOSAGE_FORMS);
    const { data: allDrugs, error: formsError } = await supabase
      .from('drugs')
      .select('dosage_forms');

    if (!formsError && allDrugs) {
      allDrugs.forEach((drug) => {
        if (Array.isArray(drug.dosage_forms)) {
          drug.dosage_forms.forEach((form: string) => allDosageForms.add(form));
        }
      });
    }

    return NextResponse.json({
      drugs: drugs || [],
      dosageForms: Array.from(allDosageForms).sort(),
      total: drugs?.length || 0,
    });
  } catch (err) {
    console.error('Drugs API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
