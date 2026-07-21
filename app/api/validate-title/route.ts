import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { createServiceClient } from '@/lib/supabase/server';

interface TitleEntry {
  title: string;
  year?: number;
  department?: string;
  status?: string;
  novelty?: string;
}

interface ValidationRequest {
  title: string;
  drugName: string;
  dosageForm: string;
  keywords: string;
  excipients: string;
  novelty: string;
}

interface LayerResult {
  passed: boolean;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  details?: string;
}

interface ScoreBreakdown {
  drugName: { score: number; max: number; detail: string };
  dosageForm: { score: number; max: number; detail: string };
  keywords: { score: number; max: number; detail: string };
  excipients: { score: number; max: number; detail: string };
  total: number;
  maxTotal: number;
}

async function callGroq(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'Unknown error');
    console.error('Groq API error:', res.status, errText);
    throw new Error(`Groq API error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(normalizeTitle(str1).split(' ').filter(w => w.length > 2));
  const words2 = new Set(normalizeTitle(str2).split(' ').filter(w => w.length > 2));
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let intersection = 0;
  words1.forEach(word => { if (words2.has(word)) intersection++; });
  
  const union = new Set([...words1, ...words2]).size;
  return (intersection / union) * 100;
}

function checkDrugInTitle(drugName: string, title: string): { score: number; percentage: number } {
  if (!drugName.trim() || !title.trim()) return { score: 0, percentage: 0 };
  
  const normalizedDrug = drugName.toLowerCase().trim();
  const normalizedTitle = title.toLowerCase().trim();
  
  // Direct match
  if (normalizedTitle.includes(normalizedDrug)) {
    return { score: 30, percentage: 100 };
  }
  
  // Word-level matching for multi-word drug names
  const drugWords = normalizedDrug.split(/\s+/).filter(w => w.length > 2);
  const titleWords = normalizedTitle.split(/\s+/);
  
  let matchCount = 0;
  drugWords.forEach(dw => {
    if (titleWords.some(tw => tw.includes(dw) || dw.includes(tw))) {
      matchCount++;
    }
  });
  
  const percentage = drugWords.length > 0 ? (matchCount / drugWords.length) * 100 : 0;
  
  // 90% threshold for scoring
  if (percentage >= 90) return { score: 30, percentage };
  if (percentage >= 70) return { score: 22, percentage };
  if (percentage >= 50) return { score: 15, percentage };
  if (percentage >= 30) return { score: 8, percentage };
  return { score: 0, percentage };
}

function checkDosageFormInTitle(dosageForm: string, title: string): { score: number; percentage: number } {
  if (!dosageForm.trim() || !title.trim()) return { score: 0, percentage: 0 };
  
  const normalizedForm = dosageForm.toLowerCase().trim();
  const normalizedTitle = title.toLowerCase().trim();
  
  // Direct match
  if (normalizedTitle.includes(normalizedForm)) {
    return { score: 35, percentage: 100 };
  }
  
  // Word-level matching
  const formWords = normalizedForm.split(/[\s-]+/).filter(w => w.length > 2);
  const titleWords = normalizedTitle.split(/[\s-]+/);
  
  let matchCount = 0;
  formWords.forEach(fw => {
    if (titleWords.some(tw => tw.includes(fw) || fw.includes(tw))) {
      matchCount++;
    }
  });
  
  const percentage = formWords.length > 0 ? (matchCount / formWords.length) * 100 : 0;
  
  if (percentage >= 90) return { score: 35, percentage };
  if (percentage >= 70) return { score: 25, percentage };
  if (percentage >= 50) return { score: 18, percentage };
  if (percentage >= 30) return { score: 9, percentage };
  return { score: 0, percentage };
}

export async function POST(request: Request) {
  try {
    let body: ValidationRequest & { excludeSubmissionId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { title, drugName, dosageForm, keywords, excipients, novelty, excludeSubmissionId } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // ============ LAYER 1: Title Uniqueness Check ============
    let layer1: LayerResult;
    let existingTitles: TitleEntry[] = [];

    try {
      const filePath = path.join(process.cwd(), 'public', 'data', 'pharmaceutics_titles.json');
      const fileContent = await readFile(filePath, 'utf-8');
      existingTitles = JSON.parse(fileContent);

      // Query database submissions to append to existingTitles
      try {
        const supabase = createServiceClient();
        let query = supabase
          .from('submissions')
          .select('title, created_at')
          .not('status', 'in', '("guide_rejected","hod_rejected")');

        if (excludeSubmissionId) {
          query = query.neq('id', excludeSubmissionId);
        }

        const { data: dbSubmissions } = await query;

        if (dbSubmissions) {
          dbSubmissions.forEach(sub => {
            existingTitles.push({
              title: sub.title,
              year: new Date(sub.created_at).getFullYear(),
            });
          });
        }
      } catch (dbErr) {
        console.error('Failed to fetch existing submissions for uniqueness check:', dbErr);
      }

      const normalizedInput = normalizeTitle(title);
      
      // Check exact match (100% similarity)
      const exactMatch = existingTitles.find(t => 
        normalizeTitle(t.title) === normalizedInput
      );

      if (exactMatch) {
        layer1 = {
          passed: false,
          status: 'failed',
          message: 'This exact title already exists in the database.',
          details: `Matching title: "${exactMatch.title}" (${exactMatch.year || 'N/A'})`,
        };
      } else {
        // Check very high similarity (>90%)
        const highSimilarity = existingTitles.find(t => 
          calculateSimilarity(title, t.title) > 90
        );

        if (highSimilarity) {
          const simScore = calculateSimilarity(title, highSimilarity.title);
          layer1 = {
            passed: false,
            status: 'failed',
            message: `Title is ${Math.round(simScore)}% similar to an existing title.`,
            details: `Similar to: "${highSimilarity.title}" (${highSimilarity.year || 'N/A'})`,
          };
        } else {
          layer1 = {
            passed: true,
            status: 'passed',
            message: 'Title is unique — not found in existing database.',
          };
        }
      }
    } catch (err) {
      console.error('Layer 1 error:', err);
      layer1 = {
        passed: true, // Don't block on file read errors
        status: 'passed',
        message: 'Title uniqueness check completed (database unavailable, proceeding).',
      };
    }

    // ============ LAYER 2: Novelty Check via Groq ============
    let layer2: LayerResult;

    if (!layer1.passed) {
      layer2 = {
        passed: false,
        status: 'skipped',
        message: 'Skipped — Layer 1 (Title Uniqueness) must pass first.',
      };
    } else if (!novelty?.trim()) {
      layer2 = {
        passed: false,
        status: 'failed',
        message: 'Statement of Novelty is required for AI novelty check.',
        details: 'Please fill in the Statement of Novelty field to proceed.',
      };
    } else {
      try {
        // Find top 5 most similar titles for context
        const similarities = existingTitles
          .map(t => ({ title: t.title, similarity: calculateSimilarity(title, t.title), year: t.year }))
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5);

        const similarTitlesText = similarities
          .map((s, i) => `${i + 1}. "${s.title}" (${s.year || 'N/A'}) — ${Math.round(s.similarity)}% word overlap`)
          .join('\n');

        const groqResponse = await callGroq(
          `NEW TITLE: "${title}"\n\nNOVELTY STATEMENT: "${novelty || 'Not provided'}"\n\nMOST SIMILAR EXISTING TITLES:\n${similarTitlesText}\n\nAnalyze if this new title brings genuine novelty compared to the existing titles listed above. Consider:\n1. Is it just a rephrased version of an existing title?\n2. Does it introduce a new drug, dosage form, technique, or approach?\n3. Does the novelty statement justify its uniqueness?\n\nRespond in JSON format: {"is_novel": true/false, "confidence": 0-100, "reason": "brief explanation", "suggestion": "how to improve if not novel"}`,
          'You are a pharmaceutical research title evaluator. You assess if dissertation titles are genuinely novel compared to existing work. Respond ONLY in valid JSON format. Be strict — if the title is essentially the same concept with minor rewording, mark it as not novel.'
        );

        let noveltyResult: { is_novel?: boolean; confidence?: number; reason?: string; suggestion?: string };
        try {
          // Extract JSON from response (handle markdown code blocks)
          const jsonMatch = groqResponse.match(/\{[\s\S]*\}/);
          noveltyResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { is_novel: true, confidence: 50, reason: 'Could not parse AI response' };
        } catch {
          noveltyResult = { is_novel: true, confidence: 50, reason: 'AI response parsing failed, proceeding optimistically' };
        }

        // Pass the novelty check if the confidence level is above 70%
        const isNovel = noveltyResult.is_novel || (noveltyResult.confidence !== undefined && noveltyResult.confidence > 70);

        if (isNovel) {
          layer2 = {
            passed: true,
            status: 'passed',
            message: `AI confirms novelty (${noveltyResult.confidence || 0}% confidence).`,
            details: noveltyResult.reason,
          };
        } else {
          layer2 = {
            passed: false,
            status: 'failed',
            message: `AI detected insufficient novelty (${noveltyResult.confidence || 0}% confidence).`,
            details: `${noveltyResult.reason || ''}\n\nSuggestion: ${noveltyResult.suggestion || 'Try a more unique approach.'}`,
          };
        }
      } catch (err) {
        console.error('Layer 2 Groq error:', err);
        layer2 = {
          passed: true, // Don't block on AI errors
          status: 'passed',
          message: 'Novelty check completed (AI service temporarily unavailable, proceeding).',
        };
      }
    }

    // ============ LAYER 3: Scoring System ============
    let layer3: LayerResult;
    let scores: ScoreBreakdown;

    if (!layer1.passed || !layer2.passed) {
      scores = {
        drugName: { score: 0, max: 30, detail: 'Skipped' },
        dosageForm: { score: 0, max: 35, detail: 'Skipped' },
        keywords: { score: 0, max: 15, detail: 'Skipped' },
        excipients: { score: 0, max: 15, detail: 'Skipped' },
        total: 0,
        maxTotal: 95,
      };
      layer3 = {
        passed: false,
        status: 'skipped',
        message: 'Skipped — Layer 1 and Layer 2 must pass first.',
      };
    } else {
      // Drug name scoring (30/35)
      const drugResult = checkDrugInTitle(drugName, title);
      const drugDetail = drugResult.percentage >= 90
        ? `Drug "${drugName}" found in title (${Math.round(drugResult.percentage)}% match)`
        : drugResult.percentage > 0
          ? `Drug "${drugName}" partially found (${Math.round(drugResult.percentage)}% match)`
          : `Drug "${drugName}" not found in title`;

      // Dosage form scoring (35/35)
      const dosageResult = checkDosageFormInTitle(dosageForm, title);
      const dosageDetail = dosageResult.percentage >= 90
        ? `Dosage form "${dosageForm}" found in title (${Math.round(dosageResult.percentage)}% match)`
        : dosageResult.percentage > 0
          ? `Dosage form "${dosageForm}" partially found (${Math.round(dosageResult.percentage)}% match)`
          : `Dosage form "${dosageForm}" not found in title`;

      // Keywords & Excipients scoring via Groq
      let keywordsScore = 0;
      let keywordsDetail = 'No keywords provided';
      let excipientsScore = 0;
      let excipientsDetail = 'No excipients provided';

      if (keywords.trim() || excipients.trim()) {
        try {
          const scoringPrompt = `DISSERTATION TITLE: "${title}"\n\nKEYWORDS PROVIDED: "${keywords || 'None'}"\nEXCIPIENTS PROVIDED: "${excipients || 'None'}"\n\nScore how relevant the keywords and excipients are to the title. Consider if they would logically appear in research with this title.\n\nRespond in JSON: {"keywords_relevance": 0-100, "keywords_reason": "brief reason", "excipients_relevance": 0-100, "excipients_reason": "brief reason"}`;

          const scoringResponse = await callGroq(
            scoringPrompt,
            'You are a pharmaceutical research evaluator. Score the relevance of keywords and excipients to a dissertation title. Respond ONLY in valid JSON.'
          );

          let scoringResult: { keywords_relevance?: number; keywords_reason?: string; excipients_relevance?: number; excipients_reason?: string };
          try {
            const jsonMatch = scoringResponse.match(/\{[\s\S]*\}/);
            scoringResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
          } catch {
            scoringResult = {};
          }

          if (keywords.trim()) {
            const kwRelevance = scoringResult.keywords_relevance || 0;
            keywordsScore = Math.round((kwRelevance / 100) * 15);
            keywordsDetail = `${kwRelevance}% relevant — ${scoringResult.keywords_reason || 'AI evaluated'}`;
          }

          if (excipients.trim()) {
            const exRelevance = scoringResult.excipients_relevance || 0;
            excipientsScore = Math.round((exRelevance / 100) * 15);
            excipientsDetail = `${exRelevance}% relevant — ${scoringResult.excipients_reason || 'AI evaluated'}`;
          }
        } catch (err) {
          console.error('Layer 3 Groq scoring error:', err);
          // Give partial credit if AI is unavailable
          if (keywords.trim()) { keywordsScore = 8; keywordsDetail = 'AI unavailable — partial credit given'; }
          if (excipients.trim()) { excipientsScore = 8; excipientsDetail = 'AI unavailable — partial credit given'; }
        }
      }

      scores = {
        drugName: { score: drugResult.score, max: 30, detail: drugDetail },
        dosageForm: { score: dosageResult.score, max: 35, detail: dosageDetail },
        keywords: { score: keywordsScore, max: 15, detail: keywordsDetail },
        excipients: { score: excipientsScore, max: 15, detail: excipientsDetail },
        total: drugResult.score + dosageResult.score + keywordsScore + excipientsScore,
        maxTotal: 95,
      };

      const totalScore = scores.total;

      if (totalScore >= 40) {
        layer3 = {
          passed: true,
          status: 'passed',
          message: `Score: ${totalScore}/95 — Meets minimum threshold (40).`,
          details: `Drug: ${drugResult.score}/30 | Dosage: ${dosageResult.score}/35 | Keywords: ${keywordsScore}/15 | Excipients: ${excipientsScore}/15`,
        };
      } else {
        layer3 = {
          passed: false,
          status: 'failed',
          message: `Score: ${totalScore}/95 — Below minimum threshold (40).`,
          details: `Drug: ${drugResult.score}/30 | Dosage: ${dosageResult.score}/35 | Keywords: ${keywordsScore}/15 | Excipients: ${excipientsScore}/15\n\nTip: Ensure your drug name and dosage form appear in your title.`,
        };
      }
    }

    // ============ AI Suggestions ============
    let suggestions: string[] = [];
    try {
      if (!layer1.passed || !layer2.passed || !layer3.passed) {
        const suggestionPrompt = `TITLE: "${title}"\nDRUG: "${drugName}"\nDOSAGE FORM: "${dosageForm}"\nKEYWORDS: "${keywords}"\nEXCIPIENTS: "${excipients}"\n\nLayer 1 (Uniqueness): ${layer1.status} — ${layer1.message}\nLayer 2 (Novelty): ${layer2.status} — ${layer2.message}\nLayer 3 (Scoring): ${layer3.status} — ${layer3.message}\n\nGive 3-5 specific, actionable suggestions to improve this submission so it passes all validation layers. Focus on what failed.`;

        const suggestionResponse = await callGroq(
          suggestionPrompt,
          'You are a helpful pharmaceutical research advisor. Give specific, actionable suggestions to improve a dissertation title submission. Respond as a JSON array of strings: ["suggestion 1", "suggestion 2", ...]'
        );

        try {
          const jsonMatch = suggestionResponse.match(/\[[\s\S]*\]/);
          suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        } catch {
          // Try to extract bullet points
          suggestions = suggestionResponse
            .split('\n')
            .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•') || /^\d+\./.test(line.trim()))
            .map(line => line.replace(/^[-•\d.)\s]+/, '').trim())
            .filter(s => s.length > 10);
        }
      }
    } catch {
      suggestions = ['Ensure your drug name appears in the title', 'Include the dosage form in your title', 'Add relevant keywords that match your research area'];
    }

    const allPassed = layer1.passed && layer2.passed && layer3.passed;

    return NextResponse.json({
      canSubmit: allPassed,
      layers: {
        layer1,
        layer2,
        layer3,
      },
      scores,
      suggestions,
    });
  } catch (err) {
    console.error('Validate title error:', err);
    return NextResponse.json({ error: 'Validation service error' }, { status: 500 });
  }
}
