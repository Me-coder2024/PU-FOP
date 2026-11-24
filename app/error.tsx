'use client';
export default function PageError() {
  return <div role="alert" className="mx-auto my-12 max-w-lg rounded-xl border bg-white p-6">
    <h1 className="text-xl font-bold">This page could not load</h1>
    <p className="mt-2 text-slate-600">Please reload to reconnect and try again.</p>
    <button className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-white" onClick={()=>window.location.reload()}>Reload page</button>
  </div>;
}
