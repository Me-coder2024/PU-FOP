import type {WorkflowDefinition,TaskDefinition,Question} from './model';
const text=(id:string,label:string):Question=>({id,label,type:'long',required:true});
export function starterWorkflow():WorkflowDefinition {
 const stages:[string,string,TaskDefinition['kind'],number,number][]=[
 ['initiation','Research initiation','questionnaire',5,7],['orientation','Research fundamentals assessment','assessment',5,14],
 ['literature','Literature review','questionnaire',10,28],['gap','Research gap and objectives','questionnaire',5,35],
 ['title','Title submission and academic approval','title',10,45],['methodology','Methodology and research planning','document',10,60],
 ['synopsis','Synopsis and initial presentation','pptx',10,75],['execution','Research execution and evidence','questionnaire',20,150],
 ['analysis','Data analysis','document',10,180],['writing','Dissertation draft','document',5,210],
 ['final_presentation','Final dissertation presentation','pptx',5,225],['final_approval','Final research approval','final_review',5,240]];
 return {warningDays:3,reviewDays:7,escalateDays:7,tasks:stages.map(([key,name,kind,weight,dueDay],i)=>({
 key,name,kind,weight,dueDay,mandatory:true,reviewer:kind==='final_review'?'dean':'guide',priority:'normal',startDay:0,dependencies:i?[stages[i-1][0]]:[],instructions:'Illustrative starter requirement. The PG Director must review and adapt this to approved university policy before publishing.',maxBytes:26214400,
 attempts:2,durationMinutes:20,passPercent:60,release:'after_close',
 questions:key==='initiation'?[
 {id:'started',label:'Have you initiated your research?',type:'single',required:true,options:['Yes','Partially initiated','Not yet initiated']},
 text('interest','What research area interests you?'),text('guide','What have you discussed with your research guide?'),
 {id:'papers',label:'How many relevant papers have you reviewed?',type:'number',min:0,required:true},
 {...text('blockers','Why have you not started, and what support do you need?'),when:{question:'started',equals:'Not yet initiated'}},
 {id:'expected',label:'When do you expect to start?',type:'date',required:true,when:{question:'started',equals:'Not yet initiated'}},text('next','What will you do next?')]
 :kind==='assessment'?[{id:'review',label:'What is the primary purpose of a literature review?',type:'single',required:true,options:['Copy existing research','Understand existing knowledge and identify gaps','Finalize results'],correct:['Understand existing knowledge and identify gaps'],marks:1,penalty:0,explanation:'Literature review establishes the evidence base and identifies unanswered questions.'},{id:'ethics',label:'When should required ethics approval be obtained?',type:'single',required:true,options:['Before activities requiring approval','After dissertation submission','Only when requested by students'],correct:['Before activities requiring approval'],marks:1,penalty:0,explanation:'Obtain applicable approvals before the regulated activity.'}]
 :kind==='questionnaire'?[text('completed','What work have you completed and what evidence supports it?'),{id:'reference',label:'Key reference URL',type:'url',required:false},text('findings','What findings or research gaps have you identified?'),text('next','What are your next steps and support requirements?')]:[]
 }))};
}
