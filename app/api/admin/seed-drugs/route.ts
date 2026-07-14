import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

interface DrugEntry {
  name: string;
  category: string;
  dosageForms: string[];
  therapeutic: string;
}

export async function POST() {
  try {
    const supabase = createServiceClient();

    // Verify caller is super_admin (check via service client since this is admin-only)
    // In production, you'd verify the session - for seeding, we just use service role

    // Read the comprehensive drugs JSON
    const filePath = path.join(process.cwd(), 'public', 'data', 'comprehensive_drugs.json');
    const fileContent = await readFile(filePath, 'utf-8');
    const drugs: DrugEntry[] = JSON.parse(fileContent);

    // Deduplicate by name (case-insensitive)
    const seen = new Set<string>();
    const uniqueDrugs = drugs.filter((drug) => {
      const key = drug.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Seeding ${uniqueDrugs.length} drugs into database...`);

    // Batch upsert in chunks of 50
    const chunkSize = 50;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < uniqueDrugs.length; i += chunkSize) {
      const chunk = uniqueDrugs.slice(i, i + chunkSize).map((drug) => ({
        name: drug.name,
        category: drug.category,
        dosage_forms: drug.dosageForms,
        therapeutic: drug.therapeutic,
      }));

      const { error } = await supabase
        .from('drugs')
        .upsert(chunk, { onConflict: 'name', ignoreDuplicates: false });

      if (error) {
        console.error(`Chunk ${i / chunkSize + 1} error:`, error);
        errors++;
      } else {
        inserted += chunk.length;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${inserted} drugs. ${errors} batch errors.`,
      total: uniqueDrugs.length,
      inserted,
      errors,
    });
  } catch (err) {
    console.error('Seed drugs error:', err);
    const message = err instanceof Error ? err.message : 'Failed to seed drugs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
