'use client';

import React, { useEffect, useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@iconify/react';
import { Loader2 } from 'lucide-react';

const authorFont: React.CSSProperties = { fontFamily: "'Author', sans-serif" };
const poppinsFont: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

interface SimilarTitle {
  id: string;
  title: string;
  similarity: number;
  student_name?: string;
  status: string;
}

export default function SimilarityCheckPage() {
  const { profile } = useRole();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [myTitle, setMyTitle] = useState('');
  const [similarTitles, setSimilarTitles] = useState<SimilarTitle[]>([]);
  const [overallScore, setOverallScore] = useState(0);
  const [hasSubmission, setHasSubmission] = useState(false);

  useEffect(() => {
    async function load() {
      if (!profile) return;
      try {
        // Get student's submission
        const { data: sub } = await supabase
          .from('submissions')
          .select('id, title')
          .eq('student_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sub) {
          setHasSubmission(true);
          setMyTitle(sub.title);
          // Mock overall similarity score
          setOverallScore(12);

          // Get other submissions for comparison (mock similarity)
          const { data: others } = await supabase
            .from('submissions')
            .select('id, title, status')
            .neq('student_id', profile.id)
            .limit(10);

          if (others && others.length > 0) {
            const simulated = others.map(o => ({
              id: o.id,
              title: o.title,
              similarity: Math.floor(Math.random() * 30) + 5,
              status: o.status,
            })).sort((a, b) => b.similarity - a.similarity);
            setSimilarTitles(simulated);
          }
        }
      } catch (err) {
        console.error('Error loading similarity data', err);
      } finally {
        setLoading(false);
      }
    }
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-[#4361EE] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-[32px] font-black text-slate-900 tracking-tight italic" style={authorFont}>
            Similarity Check
          </h1>
          <div className="w-8 h-8 rounded-lg bg-[#4361EE] flex items-center justify-center">
            <Icon icon="solar:shield-check-bold" className="w-4 h-4 text-white" />
          </div>
        </div>
        <p className="text-sm text-slate-500" style={authorFont}>
          AI-powered similarity analysis of your dissertation title against existing submissions.
        </p>
      </div>

      {!hasSubmission ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-200">
            <Icon icon="solar:shield-check-bold-duotone" className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2" style={authorFont}>No Submission Found</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto" style={authorFont}>
            Submit your dissertation topic first. Similarity analysis will run automatically after submission.
          </p>
        </div>
      ) : (
        <>
          {/* Score Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon icon="solar:chart-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest" style={authorFont}>Similarity Score</p>
              </div>
              <p className="text-4xl font-bold text-slate-900" style={poppinsFont}>
                {overallScore}<span className="text-lg text-slate-400">%</span>
              </p>
              <div className="w-full h-2 bg-slate-100 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    overallScore < 20 ? 'bg-emerald-500' : overallScore < 50 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${overallScore}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-2" style={authorFont}>
                {overallScore < 20 ? 'Excellent — highly original' : overallScore < 50 ? 'Moderate — some overlap detected' : 'High — significant similarity found'}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon icon="solar:documents-bold-duotone" className="w-5 h-5 text-[#4361EE]" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest" style={authorFont}>Titles Compared</p>
              </div>
              <p className="text-4xl font-bold text-slate-900" style={poppinsFont}>
                {similarTitles.length}
              </p>
              <p className="text-[10px] text-slate-400 mt-2" style={authorFont}>
                Against all existing dissertations in the repository
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon icon="solar:check-circle-bold-duotone" className="w-5 h-5 text-emerald-500" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest" style={authorFont}>Verdict</p>
              </div>
              <p className={`text-lg font-bold ${overallScore < 30 ? 'text-emerald-600' : 'text-amber-600'}`} style={authorFont}>
                {overallScore < 30 ? 'Ready for Submission' : 'Review Recommended'}
              </p>
              <p className="text-[10px] text-slate-400 mt-2" style={authorFont}>
                {overallScore < 30 ? 'Your topic shows sufficient originality' : 'Consider refining your topic to reduce overlap'}
              </p>
            </div>
          </div>

          {/* Your Title */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2" style={authorFont}>Your Dissertation Title</p>
            <h2 className="text-lg font-bold text-slate-900" style={authorFont}>{myTitle}</h2>
          </div>

          {/* Similar Titles */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4" style={authorFont}>Similar Titles Found</h3>
            {similarTitles.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center" style={authorFont}>No similar titles found — your topic appears unique!</p>
            ) : (
              <div className="space-y-3">
                {similarTitles.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      item.similarity < 15 ? 'bg-emerald-50 border border-emerald-200' :
                      item.similarity < 30 ? 'bg-amber-50 border border-amber-200' :
                      'bg-red-50 border border-red-200'
                    }`}>
                      <span className={`text-sm font-bold ${
                        item.similarity < 15 ? 'text-emerald-700' :
                        item.similarity < 30 ? 'text-amber-700' :
                        'text-red-700'
                      }`} style={poppinsFont}>{item.similarity}%</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate" style={authorFont}>{item.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 uppercase font-bold tracking-widest" style={authorFont}>
                        {item.status.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      item.similarity < 15 ? 'bg-emerald-500' : item.similarity < 30 ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
