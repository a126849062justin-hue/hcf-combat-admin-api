const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {validate}=require('../arena-cms'),defaults=require('../arena-default.json');
test('CMS rejects script URLs duplicate ids invalid featured and punctuation in headings',()=>{
 assert.equal(validate(defaults).moments.length,37);
 for(const change of [x=>x.heroImage='javascript:alert(1)',x=>x.moments[0].video='https://evil.example/a.html',x=>x.moments[1].id=x.moments[0].id,x=>x.featured=['missing'],x=>x.headline='測試！',x=>x.moments[0].title='<img>',x=>x.moments[0].image='//evil.example/a.png',x=>x.moments[0].visible='true']){const v=structuredClone(defaults);change(v);assert.throws(()=>validate(v))}
 const good=structuredClone(defaults);good.intro='第一行\n第二行';assert.equal(validate(good).intro,good.intro);
});
test('authenticated drafts publish rollback revisions export and restart preserve unrelated data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hcf-arena-cms-')),password=crypto.randomBytes(24).toString('hex');let server;
 async function start(){server=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'0',DATA_DIR:dir,ADMIN_PASSWORD:password,DATABASE_URL:'',LINE_TOKEN:'',LINE_SECRET:''},stdio:['ignore','pipe','pipe']});return await new Promise((resolve,reject)=>{server.stdout.once('data',d=>resolve('http://127.0.0.1:'+d.toString().match(/localhost:(\d+)/)[1]));server.once('error',reject)})}
 async function stop(){server.kill();await new Promise(r=>server.once('close',r))}
 try{
  let base=await start();const get=p=>fetch(base+p),post=(p,data,cookie,origin)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:JSON.stringify(data)});
  assert.equal((await get('/api/admin/arena')).status,401);assert.equal((await post('/api/admin/arena',{})).status,401);
  const initial=await (await get('/api/public/arena')).json();assert.equal(initial.content.moments.length,37);assert(!('draft' in initial));
  const login=await post('/api/login',{password}),cookie=login.headers.get('set-cookie').split(';')[0];
  let state=await (await fetch(base+'/api/admin/arena',{headers:{cookie}})).json();
  await post('/api/admin/content/news',{value:[{title:'PRESERVE'}]},cookie);
  const draft=structuredClone(state.draft);draft.headline='草稿測試';
  assert.equal((await post('/api/admin/arena',{action:'save',revision:state.revision,content:draft},cookie,'https://evil.example')).status,403);
  const saved=await post('/api/admin/arena',{action:'save',revision:state.revision,content:draft},cookie);assert.equal(saved.status,200);const oldRevision=state.revision;state=await saved.json();
  assert.equal((await (await get('/api/public/arena')).json()).content.headline,defaults.headline);
  assert.equal((await post('/api/admin/arena',{action:'publish',revision:oldRevision,content:draft},cookie)).status,409);
  const invalid=structuredClone(draft);invalid.heroImage='javascript:alert(1)';assert.equal((await post('/api/admin/arena',{action:'publish',revision:state.revision,content:invalid},cookie)).status,400);
  draft.moments[0].visible=false;draft.moments.reverse();draft.headline='正式測試';
  const published=await post('/api/admin/arena',{action:'publish',revision:state.revision,content:draft},cookie);assert.equal(published.status,200);state=await published.json();
  const publicData=await (await get('/api/public/arena')).json();assert.equal(publicData.content.headline,'正式測試');assert.equal(publicData.content.moments.length,36);assert.equal(publicData.content.moments[0].id,draft.moments[0].id);assert(!publicData.draft);assert(!publicData.history);
  const backup=await (await fetch(base+'/api/admin/export',{headers:{cookie}})).json();assert.equal(backup.arena_cms.published.headline,'正式測試');
  const rollback=await post('/api/admin/arena',{action:'rollback',revision:state.revision,target:state.history[0].id},cookie);assert.equal(rollback.status,200);state=await rollback.json();assert.deepEqual((await (await get('/api/public/arena')).json()).content,defaults);
  const race=await Promise.all([post('/api/admin/arena',{action:'save',revision:state.revision,content:draft},cookie),post('/api/admin/arena',{action:'save',revision:state.revision,content:defaults},cookie)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  assert.equal((await post('/api/admin/import',{arena_cms:{history:[],published:invalid,draft}},cookie)).status,400);
  assert.deepEqual((await (await get('/api/public/content')).json()).news,[{title:'PRESERVE'}]);
  await stop();base=await start();assert.deepEqual((await (await get('/api/public/arena')).json()).content,defaults);
  assert.equal((await get('/arena-admin.js')).status,200);assert.equal((await get('/arena-admin.css')).status,200);
 }finally{if(server&&!server.killed)await stop();fs.rmSync(dir,{recursive:true,force:true})}
});
