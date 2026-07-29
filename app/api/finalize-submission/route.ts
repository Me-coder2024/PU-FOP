import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const { submissionId, userId } = await request.json();

    if (!submissionId) {
      return NextResponse.json({ error: 'Submission ID is required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. Fetch submission details
    const { data: sub, error: subError } = await supabase
      .from('submissions')
      .select('title, student_id, guide_id')
      .eq('id', submissionId)
      .single();

    if (subError || !sub) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // 2. Update status to finalized
    const { error: updateError } = await supabase
      .from('submissions')
      .update({
        status: 'finalized',
        edit_unlocked: false,
      })
      .eq('id', submissionId);

    if (updateError) {
      throw updateError;
    }

    // 3. Append to pharmaceutics_titles.json
    try {
      const filePath = path.join(process.cwd(), 'public', 'data', 'pharmaceutics_titles.json');
      const fileContent = await readFile(filePath, 'utf-8');
      const titles = JSON.parse(fileContent);

      const normalizedTitle = sub.title.toLowerCase().trim();
      const exists = titles.some((t: { title: string }) => t.title.toLowerCase().trim() === normalizedTitle);

      if (!exists) {
        titles.push({
          title: sub.title.trim(),
          year: new Date().getFullYear(),
        });
        await writeFile(filePath, JSON.stringify(titles, null, 2), 'utf-8');
      }
    } catch (fileErr) {
      console.error('Failed to append to pharmaceutics_titles.json:', fileErr);
    }

    // 4. Send notification to student
    await supabase.from('notifications').insert({
      user_id: sub.student_id,
      title: 'Title Finalized!',
      message: `Your dissertation title "${sub.title}" has been finalized. Congratulations!`,
      type: 'success',
      link: '/dashboard',
    });

    // 5. Send notification to guide
    if (sub.guide_id) {
      await supabase.from('notifications').insert({
        user_id: sub.guide_id,
        title: 'Title Finalized',
        message: `The dissertation title "${sub.title}" has been finalized.`,
        type: 'success',
        link: '/guide',
      });
    }

    // 6. Insert audit log
    if (userId) {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'finalize_title',
        table_name: 'submissions',
        record_id: submissionId,
        new_data: { status: 'finalized' },
      });
    }

    // 7. Send Resend workflow emails to Student & Guide
    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      await fetch(`${origin}/api/notify-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dean_finalize', submissionId }),
      });
    } catch (e) {
      console.error('Error triggering notify-workflow on finalize:', e);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to finalize submission';
    console.error('Error finalizing submission:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
