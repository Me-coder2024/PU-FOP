import SimpleResearch from '@/components/progress/SimpleResearch';
export default async function ProgressTrackerPage({searchParams}: {searchParams: Promise<{tab?: string}>}) {
  const {tab} = await searchParams;
  return <SimpleResearch initialTab={tab==='presentations'?'presentations':'assignments'}/>;
}
