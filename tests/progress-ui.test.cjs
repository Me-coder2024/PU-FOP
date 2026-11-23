/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'..');
const cache=new Map();
function load(input){
 const file=['', '.ts','.tsx'].map(ext=>path.resolve(root,input+ext)).find(p=>fs.existsSync(p) && fs.statSync(p).isFile());
 if(!file)throw new Error(`Missing local module ${input}`);
 if(cache.has(file))return cache.get(file);
 const loadedModule={exports:{}};cache.set(file,loadedModule.exports);
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const localRequire=name=>name.startsWith('@/')?load(name.slice(2)):name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),name))):require(name);
 vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`,{filename:file})(localRequire,loadedModule,loadedModule.exports);
 return loadedModule.exports;
}
const {requestState}=load('lib/progress/request-state');
const WrittenUpdate=load('components/progress/WrittenUpdate').default;
const RequestComposer=load('components/progress/RequestComposer').default;
const now=Date.parse('2026-11-21T10:00:00Z');
const definition={id:'definition',name:'Progress report',target_submission_id:'title',questions:['What did you complete?','What is next?'],instructions:'Include your findings.',deadline:'2026-11-22T10:00:00Z',response_kind:'text',allow_revision:true,allow_late:false,reviewer_roles:['pg_director'],test_only:false};
const record={submission:{id:'title',title:'Synthetic pharmacy dissertation',status:'finalized'},studentName:'Synthetic Student',universityId:'TEST-001',definitions:[definition],milestones:[{id:'milestone',definition_id:'definition',state:'pending'}],updates:[],events:[],requestEvents:[],files:[],isOwner:true,reviewerRole:'student'};
const props={record,definition,now,busy:false,canManage:false,run:async()=>{},action:async()=>({})};
test('overdue classification does not mark already submitted or accepted work overdue',()=>{
 const expired={...definition,deadline:'2026-11-20T10:00:00Z'};
 assert.equal(requestState(record,expired,now),'overdue');
 for(const state of ['submitted','accepted']) assert.equal(requestState({...record,milestones:[{...record.milestones[0],state}]},expired,now),state);
});
test('student sees questions, separate save/submit actions and private-draft guidance',()=>{
 const html=renderToStaticMarkup(React.createElement(WrittenUpdate,props));
 assert.match(html,/What did you complete/);assert.match(html,/Save draft/);assert.match(html,/Submit update/);assert.match(html,/private until you submit/);
 assert.doesNotMatch(html,/Accept update|Publish request/);
});
test('overdue students retain draft visibility but cannot save or submit',()=>{
 const html=renderToStaticMarkup(React.createElement(WrittenUpdate,{...props,definition:{...definition,deadline:'2026-11-20T10:00:00Z'}}));
 assert.match(html,/deadline has passed/);assert.match(html,/PG Director for an extension/);assert.doesNotMatch(html,/>Save draft<|>Submit update</);
});
test('PG Director reviews submitted versions and can extend the deadline',()=>{
 const update={id:'update',milestone_id:'milestone',version:1,state:'submitted',answers:{'0':'Protocol completed','1':'Pilot next'},submitted_at:'2026-11-21T09:00:00Z',deadline_at_submission:definition.deadline};
 const html=renderToStaticMarkup(React.createElement(WrittenUpdate,{...props,canManage:true,record:{...record,isOwner:false,reviewerRole:'pg_director',milestones:[{...record.milestones[0],state:'submitted'}],updates:[update]}}));
 assert.match(html,/Version 1/);assert.match(html,/Protocol completed/);assert.match(html,/Accept update/);assert.match(html,/Request revision/);assert.match(html,/Extend this deadline/);assert.doesNotMatch(html,/>Submit update</);
});
test('request composer offers only finalized titles with clear response options',()=>{
 const html=renderToStaticMarkup(React.createElement(RequestComposer,{records:[record,{...record,submission:{id:'unapproved',title:'Unapproved title',status:'submitted'}}],onSaved:async()=>{}}));
 assert.match(html,/Synthetic Student/);assert.match(html,/Written answers/);assert.match(html,/PowerPoint presentation/);assert.match(html,/Publish request/);assert.doesNotMatch(html,/Unapproved title/);
});
const {StudentResearchComposer,StudentResearchCard}=load('components/progress/StudentResearchTracker');
const {studentResearchStatus}=load('lib/progress/student-types');
const studentRecord={assignment:{id:'assignment',student_id:'new-student',request_id:'request',state:'pending'},request:{id:'request',name:'Planning update',stage:'planning',instructions:'Discuss your interests',questions:['What research interests you?'],deadline:'2026-11-22T10:00:00Z'},studentName:'New student without a title',isOwner:true,responses:[],history:[]};
test('student composer includes registered students without requiring titles',()=>{
 const html=renderToStaticMarkup(React.createElement(StudentResearchComposer,{students:[{id:'new-student',name:'New student without a title',universityId:'NEW-1'}],onSaved:async()=>{}}));
 assert.match(html,/New student without a title/);assert.match(html,/All 1 currently registered students/);assert.match(html,/No research title or title approval is required/);assert.match(html,/Research planning/);
});
test('student-first tracker supports early answers and guide review',()=>{
 const props={record:studentRecord,role:'student',refresh:async()=>{},now};
 const html=renderToStaticMarkup(React.createElement(StudentResearchCard,props));
 assert.match(html,/What research interests you/);assert.match(html,/Save private draft/);assert.match(html,/Submit answers/);
 const submitted={...studentRecord,isOwner:false,assignment:{...studentRecord.assignment,state:'submitted'},responses:[{id:'response',version:1,answers:{'0':'Drug delivery'},submitted_at:'2026-11-21T09:00:00Z'}]};
 const review=renderToStaticMarkup(React.createElement(StudentResearchCard,{...props,record:submitted,role:'guide'}));
 assert.match(review,/Drug delivery/);assert.match(review,/Accept update/);assert.match(review,/Request revision/);assert.doesNotMatch(review,/Extend for all recipients/);
});
test('early research status locks overdue work while preserving completed states',()=>{
 const expired={...studentRecord,request:{...studentRecord.request,deadline:'2026-11-20T10:00:00Z'}};
 assert.equal(studentResearchStatus(expired,now),'overdue');
 for(const state of ['submitted','accepted'])assert.equal(studentResearchStatus({...expired,assignment:{...expired.assignment,state}},now),state);
 const html=renderToStaticMarkup(React.createElement(StudentResearchCard,{record:expired,role:'student',refresh:async()=>{},now}));
 assert.match(html,/An update is overdue/);assert.doesNotMatch(html,/>Submit answers</);
});
const {StudentResearchRoster}=load('components/progress/StudentResearchTracker');
test('director roster displays registered students even when no requests exist',()=>{
 const html=renderToStaticMarkup(React.createElement(StudentResearchRoster,{students:[{id:'new-student',name:'New student without a title',universityId:'NEW-1'}],records:[],query:'',now,onSelect:()=>{},onRequest:()=>{}}));
 assert.match(html,/Student roster/);assert.match(html,/New student without a title/);assert.match(html,/NEW-1/);assert.match(html,/Not started · no requests/);assert.match(html,/Send questions/);assert.match(html,/View progress/);
});
test('director roster searches the student register independently of assigned requests',()=>{
 const props={students:[{id:'new-student',name:'New student without a title',universityId:'NEW-1'}],records:[],query:'NEW-1',now,onSelect:()=>{},onRequest:()=>{}};
 assert.match(renderToStaticMarkup(React.createElement(StudentResearchRoster,props)),/New student without a title/);
 assert.match(renderToStaticMarkup(React.createElement(StudentResearchRoster,{...props,query:'missing'})),/No students match this search/);
});
test('director can open a question form with the selected student preselected',()=>{
 const html=renderToStaticMarkup(React.createElement(StudentResearchComposer,{students:[{id:'new-student',name:'Selected student',universityId:'NEW-1'}],initialTarget:'new-student',onSaved:async()=>{}}));
 assert.match(html,/<details open=""/);assert.match(html,/<option value="new-student" selected=""/);
});
const {Answers}=load('components/rpms/TaskWorkspace');
const {TaskViews}=load('components/rpms/ResearchWorkspace');
test('unified typed questionnaire hides conditional questions and provides correct controls',()=>{
 const questions=[{id:'started',label:'Started research?',type:'yes_no',required:true},{id:'reason',label:'Why not yet?',type:'long',required:true,when:{question:'started',equals:'No'}},{id:'count',label:'Papers reviewed',type:'number',required:true,min:0}];
 const html=renderToStaticMarkup(React.createElement(Answers,{questions,answers:{started:'Yes'},onChange:()=>{}}));
 assert.match(html,/Started research/);assert.match(html,/type="number"/);assert.doesNotMatch(html,/Why not yet/);
 const conditional=renderToStaticMarkup(React.createElement(Answers,{questions,answers:{started:'No'},onChange:()=>{}}));assert.match(conditional,/Why not yet/);
});
test('unified task views render actual state, deadlines and selectable project work',()=>{
 const tasks=[{id:'t',name:'Literature evidence',state:'submitted',kind:'document',starts_at:'2026-11-01T00:00:00Z',deadline:'2026-12-01T00:00:00Z',blocked:false,config:{reviewer:'guide',priority:'high'}}];
 for(const view of ['table','kanban','calendar','timeline','gantt']){const html=renderToStaticMarkup(React.createElement(TaskViews,{tasks,view,onOpen:()=>{}}));assert.match(html,/Literature evidence/);}
});
