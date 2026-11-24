import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL, SITE_DESCRIPTION } from '@/lib/site';

export const metadata: Metadata = {
  title: 'PU-FOP | Parul University Pharmacy Research Portal',
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
};
const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {'@type':'WebSite','@id':`${SITE_URL}/#website`,url:SITE_URL,name:'PU-FOP',alternateName:'Parul University Faculty of Pharmacy Research Portal',description:SITE_DESCRIPTION,inLanguage:'en'},
    {'@type':'WebPage','@id':`${SITE_URL}/#webpage`,url:SITE_URL,name:'PU-FOP | Parul University Pharmacy Research Portal',description:SITE_DESCRIPTION,isPartOf:{'@id':`${SITE_URL}/#website`},inLanguage:'en'},
  ],
};
export default function HomePage() {
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replace(/</g,'\\u003c')}} />
    <header className="border-b bg-white"><nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5"><Link href="/" className="text-xl font-bold text-blue-700">PU-FOP</Link><div className="flex items-center gap-6"><Link href="/portal-guide" className="text-sm font-medium">Portal guide</Link><Link href="/login" className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white">Sign in</Link></div></nav></header>
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28"><p className="mb-5 text-sm font-semibold uppercase tracking-widest text-blue-700">Parul University · Faculty of Pharmacy</p><h1 className="max-w-4xl text-4xl font-bold leading-tight sm:text-6xl">Your pharmacy research,<br/>from title to presentation.</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">PU-FOP is the Faculty of Pharmacy’s research title and dissertation management portal. Students submit research titles, follow reviews, complete assigned work and submit their PPT after their title is finalized.</p><div className="mt-9 flex flex-wrap gap-4"><Link href="/login" className="rounded-xl bg-blue-700 px-6 py-4 font-semibold text-white">Open your dashboard</Link><Link href="/portal-guide" className="rounded-xl border border-slate-300 bg-white px-6 py-4 font-semibold">How the portal works</Link></div></section>
    <section aria-labelledby="workflow" className="mx-auto max-w-6xl px-6 pb-20"><h2 id="workflow" className="text-3xl font-bold">One place to follow your research work</h2><div className="mt-8 grid gap-5 md:grid-cols-3">{[
      ['Submit and review titles','Submit your research title and required details. Follow guide, HOD and final-review decisions in your dashboard.'],
      ['Complete assignments','View work assigned by the PG Director, submit responses or document links, and follow deadlines and feedback. Assignments can begin before title finalization.'],
      ['Submit your presentation','Once your title is finalized, open your submitted title to upload a .pptx presentation and send it for review.'],
    ].map(([title,body])=><article key={title} className="rounded-2xl border bg-white p-7"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-4 leading-7 text-slate-600">{body}</p></article>)}</div></section>
    <section className="border-y bg-white"><div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-2"><div><h2 className="text-3xl font-bold">For students and faculty</h2><p className="mt-5 leading-7 text-slate-600">Students, guides, HODs, PG Directors and the Dean use role-based dashboards. The available actions depend on the roles assigned to your account.</p></div><div><h2 className="text-2xl font-bold">Looking for the PU-FOP login?</h2><p className="mt-5 leading-7 text-slate-600">Use the sign-in page to access your account. New students complete their profile before starting their research submission.</p><Link href="/login" className="mt-5 inline-block font-semibold text-blue-700 underline">Go to PU-FOP login →</Link></div></div></section>
    <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-6 py-8 text-sm text-slate-600"><p>PU-FOP · Faculty of Pharmacy, Parul University</p><Link href="/portal-guide" className="underline">Submission and assignment guide</Link></footer>
  </main>;
}
