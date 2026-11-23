import { POST as titlePost } from '@/app/api/titles/route';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    return titlePost(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ ...body, action: `guide_${body.action}`, remarks: body.remarks || body.rejectionReason }) }));
  } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
}
