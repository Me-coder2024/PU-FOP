
'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import StudentResearchTracker from './StudentResearchTracker';
const EarlierAssignments = dynamic(() => import('./EarlierAssignments'));
export default function SimpleResearch() {
  const [earlier, setEarlier] = useState(false);
  return <div className="space-y-5">
    <><StudentResearchTracker/><details className="rounded-xl border bg-white p-4" onToggle={e=>setEarlier(e.currentTarget.open)}><summary className="cursor-pointer text-sm text-slate-600">Previously assigned work</summary>{earlier&&<div className="mt-4"><EarlierAssignments/></div>}</details></>
  </div>;
}
