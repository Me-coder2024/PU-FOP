import {createRoot} from 'react-dom/client';
import ResearchWorkspace from '../../components/rpms/ResearchWorkspace';
import '../../app/globals.css';
createRoot(document.getElementById('root')!).render(<main className="min-h-screen bg-slate-50 p-5 md:p-8"><ResearchWorkspace/></main>);
