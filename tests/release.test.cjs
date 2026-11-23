/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const cache = new Map();
function load(file) {
 const full = path.resolve(__dirname,'..',file);
 if(cache.has(full)) return cache.get(full);
 const loadedModule = { exports: {} }; cache.set(full,loadedModule.exports);
 const code = ts.transpileModule(fs.readFileSync(full,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
 const localRequire = name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname,'..'),path.resolve(path.dirname(full),name+'.ts'))) : require(name);
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:full})(localRequire,loadedModule,loadedModule.exports);
 return loadedModule.exports;
}
const { resolveDepartment, pilotDepartmentsEnabled } = load('lib/config/departments.ts');
const { DEPARTMENT_SCHEMAS, validateDepartmentFields } = load('lib/config/department-schemas.ts');
const { nextTitleAction } = load('lib/progress/title-status.ts');
const { verifyPptx } = load('lib/progress/pptx.ts');

test('department aliases are exact, normalized, and QA/PA share a schema', () => {
 assert.equal(resolveDepartment(' PA '),'QUALITY ASSURANCE');
 assert.equal(resolveDepartment('pharmacy   practice'),'PHARMACY PRACTICE');
 for(const name of ['Comparative Pharmacy','PA unrelated','QATAR','P','']) assert.equal(resolveDepartment(name),null);
 assert.equal(DEPARTMENT_SCHEMAS.PA, DEPARTMENT_SCHEMAS['QUALITY ASSURANCE']);
 assert.equal(DEPARTMENT_SCHEMAS['PHARMACEUTICAL ANALYSIS'], DEPARTMENT_SCHEMAS['QUALITY ASSURANCE']);
});
test('production cannot activate pilot department forms', () => {
 const oldEnv=process.env.NEXT_PUBLIC_APP_ENV, oldFlag=process.env.NEXT_PUBLIC_ENABLE_PILOT_DEPARTMENTS;
 process.env.NEXT_PUBLIC_ENABLE_PILOT_DEPARTMENTS='true'; process.env.NEXT_PUBLIC_APP_ENV='production'; assert.equal(pilotDepartmentsEnabled(),false);
 process.env.NEXT_PUBLIC_APP_ENV='staging'; assert.equal(pilotDepartmentsEnabled(),true);
 if(oldEnv===undefined) delete process.env.NEXT_PUBLIC_APP_ENV; else process.env.NEXT_PUBLIC_APP_ENV=oldEnv;
 if(oldFlag===undefined) delete process.env.NEXT_PUBLIC_ENABLE_PILOT_DEPARTMENTS; else process.env.NEXT_PUBLIC_ENABLE_PILOT_DEPARTMENTS=oldFlag;
});
test('both new departments preserve existing required and optional fields', () => {
 for(const key of ['PHARMACOGNOSY','PHARMACY PRACTICE']) {
  assert.ok(validateDepartmentFields(key,{}).some(x=>x.includes('Title')));
  assert.deepEqual(validateDepartmentFields(key,{ title:'A synthetic research title' }),[]);
 }
 assert.ok(validateDepartmentFields('PHARMACOGNOSY',{title:'Example',sourceCategory:'Invalid'}).length);
 assert.ok(validateDepartmentFields('PHARMACY PRACTICE',{title:'Example',studySetting:'Invalid'}).length);
});
test('conditional fields are validated only while visible', () => {
 const fields=DEPARTMENT_SCHEMAS['PHARMACEUTICAL CHEMISTRY'].flatMap(s=>s.fields);
 const conditional=fields.find(f=>f.condition && f.options);
 assert.ok(conditional);
 const hidden={ title:'Test',workType:'none',[conditional.name]:'INVALID' };
 assert.ok(!validateDepartmentFields('PHARMACEUTICAL CHEMISTRY',hidden).some(x=>x===`Invalid ${conditional.label}.`));
});
test('all canonical title states have explicit next steps', () => {
 for(const status of ['submitted','revision_requested','guide_accepted','guide_rejected','hod_accepted','hod_rejected','finalized']) assert.ok(nextTitleAction(status));
 assert.match(nextTitleAction('revision_requested'),/resubmit/);
});
function zip(entries) {
 let offset=0; const local=[], directory=[];
 for(const [name,content] of entries) {
  const n=Buffer.from(name),data=Buffer.from(content),head=Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50); head.writeUInt32LE(data.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(n.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);
  local.push(head,n,data); directory.push(central,n);offset+=head.length+n.length+data.length;
 }
 const d=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(d.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,d,end]);
}
const core=[['[Content_Types].xml','<Types>application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml</Types>'],['ppt/presentation.xml','<p:presentation/>'],['_rels/.rels','<Relationships/>']];
test('valid minimal PPTX passes structural verification',()=>assert.doesNotThrow(()=>verifyPptx(zip(core))));
test('renamed files, truncated ZIPs, macros, unsafe paths and duplicate entries fail',()=>{
 for(const file of [Buffer.from('not a powerpoint'),zip(core).subarray(0,50),zip([['x','x']]),zip([...core,['ppt/vbaProject.bin','macro']]),zip([...core,['../evil','bad']]),zip([...core,core[0]])]) assert.throws(()=>verifyPptx(file));
});
test('XML external entity declarations are rejected',()=>assert.throws(()=>verifyPptx(zip([core[0],['ppt/presentation.xml','<!DOCTYPE x><presentation/>'],core[2]]))));
