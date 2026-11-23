import {test,expect,type Page} from '@playwright/test';
import type {Snapshot,Project,Task,WorkflowDefinition} from '../../lib/rpms/model';
const student='10000000-0000-4000-8000-000000000001',projectId='20000000-0000-4000-8000-000000000001',taskId='30000000-0000-4000-8000-000000000001';
const project:Project={id:projectId,student_id:student,cycle:'initial',batch:'2026',semester:'1',interest:'',initiation_date:null,expected_completion:null,created_at:'2026-11-21T00:00:00Z',workflow_id:null,on_hold:false,hold_reason:null,name:'Synthetic Pre-title Student',enrollment:'TEST-001',institute:'Synthetic Pharmacy Institute',department:'Pharmacy Practice',guide:'Synthetic Guide',progress:null,health:'not_initiated',health_reasons:[],completed:false,self_reported_progress:null,self_initiated:null,planned_progress:null,submitted_progress:null};
const task:Task={id:taskId,project_id:projectId,key:'initial',name:'Initial research questions',kind:'questionnaire',state:'not_started',active:true,starts_at:'2026-01-01T00:00:00Z',deadline:'2030-01-01T00:00:00Z',submitted_at:null,approved_at:null,blocked:false,blocker:null,dependencies:[],locked:false,lock_reason:null,attempts:[],responses:[],files:[],config:{key:'initial',name:'Initial research questions',instructions:'Describe your first research steps.',kind:'questionnaire',weight:5,mandatory:true,reviewer:'guide',priority:'normal',dependencies:[],startDay:0,dueDay:7,questions:[{id:'started',label:'Have you started?',type:'yes_no',required:true},{id:'reason',label:'What support do you need?',type:'long',required:true,when:{question:'started',equals:'No'}}]}};
function initial(role='pg_director'):Snapshot{return {role,canManage:role==='pg_director',projects:[structuredClone(project)],tasks:[],events:[],workflows:[],banks:[],legacy:{titles:[],requests:[],presentations:[]}};}
async function mock(page:Page,data:Snapshot,onPost?:(body:Record<string,unknown>)=>unknown){
 // Every RPMS request is intercepted. No Supabase or production connection is used.
 await page.route('**/api/rpms',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:data});
  const body=route.request().postDataJSON();const result=onPost?.(body)||{id:taskId};return route.fulfill({json:result});
 });
 await page.route('**/*.supabase.co/**',route=>route.abort());
 await page.goto('/');
}
test('director sees a pre-title project and publishes and assigns a workflow',async({page})=>{
 const data=initial();let definition:WorkflowDefinition|undefined;
 await mock(page,data,body=>{if(body.action==='publish'){definition=body.definition as WorkflowDefinition;data.workflows=[{id:'40000000-0000-4000-8000-000000000001',name:String(body.name),version:1,definition,created_at:'2026-11-21T00:00:00Z'}];}if(body.action==='assign'){expect(body.students).toEqual([student]);data.projects[0].workflow_id=data.workflows[0].id;data.projects[0].progress=0;data.tasks=[structuredClone(task)];}return {id:taskId};});
 await expect(page.getByRole('row').filter({hasText:'Synthetic Pre-title Student'})).toBeVisible();
 await expect(page.getByText('Not configured',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Workflow builder',exact:true}).click();
 await page.getByRole('button',{name:'Load illustrative 12-stage starter'}).click();
 await page.getByRole('button',{name:'Publish immutable version'}).click();
 await expect.poll(()=>definition?.tasks.length).toBe(12);
 await page.getByRole('button',{name:'Projects',exact:true}).click();
 await page.getByRole('combobox',{name:'Published workflow'}).selectOption('40000000-0000-4000-8000-000000000001');
 await page.getByRole('checkbox',{name:'Select Synthetic Pre-title Student'}).check();
 await page.getByRole('button',{name:'Assign to 1 students'}).click();
 await expect(page.getByText('0% verified',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open project',exact:true}).click();
 await expect(page.getByRole('button',{name:'Initial research questions',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/rpms-director-project.png',fullPage:true});
});
test('student answers conditional questions, saves privately and submits for review',async({page})=>{
 const data=initial('student');data.projects[0].workflow_id='40000000-0000-4000-8000-000000000001';data.tasks=[structuredClone(task)];const actions:string[]=[];
 await mock(page,data,body=>{actions.push(String(body.action));if(body.action==='save'){data.tasks[0].responses=[{id:'50000000-0000-4000-8000-000000000001',version:1,answers:body.answers as Record<string,unknown>,submitted_at:null,created_at:'2026-11-21T00:00:00Z'}];data.tasks[0].state='in_progress';return {id:'50000000-0000-4000-8000-000000000001'};}if(body.action==='submit'){data.tasks[0].responses[0].submitted_at='2026-11-21T10:00:00Z';data.tasks[0].submitted_at='2026-11-21T10:00:00Z';data.tasks[0].state='submitted';}return {id:taskId};});
 await page.getByRole('button',{name:'Initial research questions',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'What support do you need?'})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Have you started?'}).selectOption('No');
 await page.getByRole('textbox',{name:'What support do you need?'}).fill('I need help choosing relevant literature.');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect.poll(()=>actions.includes('save')).toBe(true);
 await page.getByRole('button',{name:'Submit for review',exact:true}).click();
 await expect.poll(()=>actions.includes('submit')).toBe(true);
 await expect(page.getByRole('button',{name:'Submit for review',exact:true})).toHaveCount(0);
 await page.getByText('Submitted response history (1)',{exact:true}).click();
 await expect(page.locator('p').filter({hasText:'I need help choosing relevant literature.'})).toBeVisible();
 await page.screenshot({path:'test-results/rpms-student-submission.png',fullPage:true});
});
test('mobile roster and task views remain usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});const data=initial();data.tasks=[structuredClone(task)];await mock(page,data);
 await expect(page.getByRole('heading',{name:'Research command center'})).toBeVisible();
 await page.getByRole('button',{name:'Open project',exact:true}).click();
 for(const name of ['Kanban','Calendar','Timeline','Gantt']){await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('button',{name:/Initial research questions/}).first()).toBeVisible();}
 await page.screenshot({path:'test-results/rpms-mobile.png',fullPage:true});
});
