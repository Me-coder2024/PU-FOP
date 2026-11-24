import { requireRole } from '@/lib/utils/require-role';
import { NextResponse } from 'next/server';
import { createLegacyServiceClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const access=await requireRole(req,['super_admin']);
    if(access.response)return access.response;
    const supabase = createLegacyServiceClient();
    const { studentId, title, department, formData } = await req.json();

    if (!studentId || !title || !department) {
      return NextResponse.json({ message: 'Student ID, title, and department are required fields.' }, { status: 400 });
    }

    // 1. Verify that student hasn't already submitted a topic
    const { data: existingTopic, error: checkError } = await supabase
      .from('topics')
      .select('id')
      .eq('student_id', studentId)
      .maybeSingle();

    if (checkError) throw checkError;
    if (existingTopic) {
      return NextResponse.json({ message: 'Submission limit reached. Students are restricted to one active dissertation topic proposal.' }, { status: 400 });
    }

    // Extract common fields for indexing — handle all department schemas
    const drugName = formData?.drugName || formData?.compoundName || formData?.sourceName || '';
    const dosageForm = formData?.dosageForm || formData?.category || '';
    const routeOfAdmin = formData?.route || formData?.routeOfAdmin || '';
    const excipients = formData?.excipient || formData?.excipients || formData?.coreScaffold || '';
    const novelty = formData?.novelty || formData?.noveltyStatement || '';
    const keywords = formData?.keywords || formData?.deliverables?.join(', ') || '';
    const methodPreparation = formData?.methodPreparation || formData?.syntheticRoute || '';

    // 2. Insert the topic record
    const { data: createdTopic, error: insertError } = await supabase
      .from('topics')
      .insert({
        student_id: studentId,
        title,
        drug_name: drugName,
        dosage_form: dosageForm,
        route_of_admin: routeOfAdmin,
        excipients,
        method_preparation: methodPreparation,
        novelty,
        keywords,
        form_data: formData,
        is_locked: true,
      })
      .select()
      .single();

    if (insertError || !createdTopic) throw insertError || new Error('Failed to create topic registry row.');

    // 3. Create corresponding approvals checklist
    const { error: approvalsError } = await supabase
      .from('approvals')
      .insert({
        topic_id: createdTopic.id,
        guide_status: 'PENDING',
        hoi_status: 'PENDING',
        pg_director_status: 'PENDING',
        dean_status: 'PENDING',
        remarks: '',
      });

    if (approvalsError) throw approvalsError;

    // 4. Create progress registry entry
    const { error: progressError } = await supabase
      .from('progress')
      .insert({
        topic_id: createdTopic.id,
        stage: 'ITD',
        status: 'SUBMITTED',
      });

    if (progressError) throw progressError;

    // 5. Update user status in Supabase
    await supabase
      .from('users')
      .update({ status: 'FILED' })
      .eq('id', studentId);

    return NextResponse.json({
      message: 'Proposal submitted successfully.',
      data: createdTopic,
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || 'Server error during proposal submission.' }, { status: 500 });
  }
}
