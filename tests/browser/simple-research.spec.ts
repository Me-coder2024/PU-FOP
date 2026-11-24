import {test,expect} from '@playwright/test';
const student={id:'student',name:'Test Student',universityId:'ST-01'};
const record={assignment:{id:'assignment',student_id:'student',request_id:'request',state:'pending'},request:{id:'request',name:'Literature review',stage:'other',instructions:'Read two papers',questions:['Submit your work'],deadline:'2030-12-01T00:00:00Z'},studentName:student.name,isOwner:true,responses:[],history:[]};
test('director sends work without milestones or title prerequisites',async({page})=>{
 const sent:Record<string,unknown>[]=[];
 await page.route('**/api/research/students',route=>{if(route.request().method()==='POST'){sent.push(route.request().postDataJSON());return route.fulfill({json:{id:'request'}});}return route.fulfill({json:{role:'pg_director',students:[student],records:[]}});});
 await page.goto('/?simple');
 await page.getByRole('button',{name:'Create assignment',exact:true}).click();
 await page.getByLabel('Assignment title').fill('Literature review');
 await page.getByLabel('Deadline').fill('2030-12-01T12:00');
 await page.getByLabel('Instructions',{exact:true}).fill('Read two papers');
 await page.getByRole('button',{name:'Send assignment to 1 students'}).click();
 await expect.poll(()=>sent.length).toBe(1);
 expect(sent[0]).toMatchObject({action:'publish',studentIds:['student'],name:'Literature review',stage:'other'});
 await expect(page.getByText('Research stage',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Workflow builder',{exact:true})).toHaveCount(0);
});
test('student submits document link and accepted assignment counts toward progress',async({page})=>{
 const data={role:'student',students:[],records:[structuredClone(record)]};
 await page.route('**/api/research/students',route=>{
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();
   if(body.action==='save')expect(body.answers['0']).toBe('https://example.com/my-review.pdf');
   if(body.action==='submit')data.records[0].assignment.state='submitted';
   return route.fulfill({json:{id:'response'}});
  }
  return route.fulfill({json:data});
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto('/?simple');
 await page.getByLabel('1. Submit your work').fill('https://example.com/my-review.pdf');
 await page.getByRole('button',{name:'Submit assignment',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Literature review — Awaiting review'})).toBeVisible();
 data.records[0].assignment.state='accepted';
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(page.getByText('1 of 1 completed',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create assignment',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/simple-student.png',fullPage:true});
});
test('failed assignment fetch exposes retry and recovers',async({page})=>{
 let failed=true;
 await page.route('**/api/research/students',route=>failed?route.fulfill({status:503,json:{error:'Temporarily unavailable'}}):route.fulfill({json:{role:'student',students:[],records:[]}}));
 await page.goto('/?simple');
 await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
 failed=false;
 await page.getByRole('button',{name:'Reload',exact:true}).click();
 await expect(page.getByText('0 of 0 completed',{exact:true})).toBeVisible();
});
test('Dean sees the faculty-wide student roster without assignment-creation controls',async({page})=>{
 await page.route('**/api/research/students',route=>route.fulfill({json:{role:'dean',facultyAccess:true,students:[student,{id:'other',name:'Other Institute Student',universityId:'ST-02'}],records:[]}}));
 await page.goto('/?simple');
 await expect(page.getByText('Dean · All institutes',{exact:true})).toBeVisible();
 await expect(page.getByRole('row').filter({hasText:'Other Institute Student'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Students (2)',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Assign work',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Other Institute Student',exact:true}).click();
 await expect(page.getByRole('button',{name:'Assign work to this student',exact:true})).toHaveCount(0);
});
