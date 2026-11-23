/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file){const m={exports:{}};const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(require,m,m.exports);return m.exports;}
const {validateWorkflow,validateAnswers,grade,csvCell,visibleQuestion,validateQuestionBank}=load('lib/rpms/model.ts');const {starterWorkflow}=load('lib/rpms/template.ts');
test('illustrative workflow totals 100 without imposing university policy',()=>{const w=starterWorkflow();assert.equal(w.tasks.reduce((n,t)=>n+t.weight,0),100);assert.doesNotThrow(()=>validateWorkflow(w));assert.equal(w.tasks.at(-1).kind,'final_review');});
test('workflow rejects cycles, missing prerequisites, duplicate keys and invalid weights',()=>{
 for(const mutate of [w=>w.tasks[0].dependencies.push(w.tasks[1].key),w=>w.tasks[0].dependencies.push('unknown'),w=>w.tasks[1].key=w.tasks[0].key,w=>w.tasks[0].weight=-1,w=>w.tasks.pop()]){const w=starterWorkflow();mutate(w);assert.throws(()=>validateWorkflow(w));}
});
test('conditional required answers and typed fields are enforced before submission',()=>{
 const qs=[{id:'started',label:'Started?',type:'yes_no',required:true},{id:'reason',label:'Reason?',type:'long',required:true,when:{question:'started',equals:'No'}},{id:'papers',label:'Papers',type:'number',required:true,min:0,max:100}];
 assert.equal(visibleQuestion(qs[1],{started:'Yes'}),false);assert.doesNotThrow(()=>validateAnswers(qs,{started:'Yes',papers:3},true));assert.throws(()=>validateAnswers(qs,{started:'No',papers:3},true));assert.throws(()=>validateAnswers(qs,{started:'Yes',papers:-1},true));assert.throws(()=>validateAnswers(qs,{started:'Yes',papers:3,foreign:'injection'},true));
});
test('multi-select exact matching, omissions and penalties use explicit scoring',()=>{
 const qs=[{id:'a',type:'multiple',label:'Select',options:['A','B','C'],correct:['A','B'],marks:2,penalty:1,required:true},{id:'b',type:'single',label:'Select',options:['D','E'],correct:['D'],marks:2,penalty:1,required:true}];
 assert.doesNotThrow(()=>validateQuestionBank(qs));assert.equal(grade(qs,{a:['B','A'],b:'D'}),100);assert.equal(grade(qs,{a:['A'],b:'D'}),25);assert.equal(grade(qs,{a:['A','B','C'],b:'E'}),0);assert.equal(grade(qs,{}),0);assert.throws(()=>grade(qs,{a:['A','A']}));
});
test('question bank rejects invalid answer keys and publication counts',()=>{const w=starterWorkflow(),exam=w.tasks.find(t=>t.kind==='assessment');exam.questions[0].correct=['not an option'];assert.throws(()=>validateWorkflow(w));const fresh=starterWorkflow();fresh.tasks[1].questionCount=500;assert.throws(()=>validateWorkflow(fresh));});
test('CSV neutralizes spreadsheet formulas and escapes separators',()=>{assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');assert.equal(csvCell(' +SUM(1,2)'),'"\' +SUM(1,2)"');assert.equal(csvCell('Research, "A"'),'"Research, ""A"""');});
