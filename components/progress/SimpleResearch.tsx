
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import StudentResearchTracker from './StudentResearchTracker';
const Presentations = dynamic(() => import('./ResearchProgress'), { loading: () => <p role="status">Loading title and PPT submissions…</p> });
const EarlierAssignments = dynamic(() => import('./EarlierAssignments'));
export default function SimpleResearch({initialTab = 'assignments'}: {initialTab?: string}) {
  const [earlier, setEarlier] = useState(false);
  const [tab, setTab] = useState(initialTab);
  return <div className="space-y-5">
    <nav aria-label="Research work" className="flex gap-3">
      {[['assignments','Assignments & progress'],['presentations','Title & PPT submissions']].map(([key,label]) => <button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${tab===key?'bg-blue-700 text-white':'bg-white text-slate-700'}`}>{label}</button>)}
    </nav>
    {tab==='assignments'?<><StudentResearchTracker/><details className="rounded-xl border bg-white p-4" onToggle={e=>setEarlier(e.currentTarget.open)}><summary className="cursor-pointer text-sm text-slate-600">Previously assigned work</summary>{earlier&&<div className="mt-4"><EarlierAssignments/></div>}</details></>:<Presentations/>}
  </div>;
}
