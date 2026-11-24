import type { Metadata } from 'next';
import Link from 'next/link';
export const metadata: Metadata = {
 title:'Research Title, Assignment & PPT Guide | PU-FOP',
 description:'Learn how to sign in to PU-FOP, submit a pharmacy research title, follow guide and HOD reviews, complete assignments and upload a PPT after finalization.',
 alternates:{canonical:'/portal-guide'},
};
export default function PortalGuide(){return <main className="mx-auto max-w-3xl px-6 py-12 text-slate-900"><nav aria-label="Breadcrumb" className="mb-10 text-sm"><Link href="/" className="text-blue-700 underline">PU-FOP home</Link><span> / Portal guide</span></nav><h1 className="text-4xl font-bold">PU-FOP research portal guide</h1><p className="mt-5 text-lg leading-8 text-slate-600">A guide to research title submissions, assignments and presentations for Parul University’s Faculty of Pharmacy.</p><div className="mt-10 space-y-10">{[
 ['How do I sign in to PU-FOP?','Open the login page and use Google sign-in with your authorized account. New students complete their profile with their university ID, institute, department and guide. If your assigned role is missing, contact your department or portal administrator.'],
 ['How do I submit a research title?','Open Submit Topic in the student dashboard. Enter the title and the required department-specific information, complete the validation steps and submit. Submission availability depends on the configured submission window.'],
 ['What happens after title submission?','The title goes through guide review, HOD review and final review. Check your dashboard for its current status and remarks. If a revision is requested, update the submission as instructed and submit it again.'],
 ['Do assignments require an approved title?','No. Assignments are separate from title approval. The PG Director can assign work before a title is finalized. Open My Assignments to read instructions, see deadlines and submit your work.'],
 ['How do I submit an assignment?','Write your answers or paste a document link into the assignment response fields. Ensure the reviewer can open any linked document. Save your draft, then submit it for review. Follow the reviewer’s feedback if a revision is requested.'],
 ['Who can receive assignments?','The PG Director can choose all students, all guides, all HODs, everyone registered in the portal, or multiple selected students. Recipients receive their own response and review history.'],
 ['When can I upload my PPT?','PPT submission opens after your research title is finalized. Open your submitted title, upload a .pptx file within the displayed size limit, and submit the verified draft for review.'],
 ['How is assignment progress counted?','The assignments view shows completed work and work awaiting action or review. An accepted assignment counts as completed. Title-review status is tracked separately.'],
 ['How do I switch roles?','If your account has multiple assigned roles, select the required role from the dashboard’s role switcher. The portal confirms the change before opening the selected dashboard. You can only switch to a role assigned to your account.'],
 ['Are student submissions public?','Research submissions, assignment responses and faculty dashboards require sign-in and are limited by account permissions. This public guide does not publish student research or personal records.'],
].map(([question,answer])=><section key={question}><h2 className="text-xl font-semibold">{question}</h2><p className="mt-3 leading-7 text-slate-600">{answer}</p></section>)}</div><Link href="/login" className="mt-12 inline-block rounded-xl bg-blue-700 px-6 py-4 font-semibold text-white">Sign in to PU-FOP</Link></main>}
