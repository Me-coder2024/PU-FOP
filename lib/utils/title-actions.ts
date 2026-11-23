export async function titleAction(body: Record<string, unknown>) {
  const response = await fetch('/api/titles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to save title action.');
  return data;
}
