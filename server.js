/* ============================================================
   HCF 獨立後台 server.js
   零依賴（Node 18+ 直接跑）：node server.js
   環境變數：
     ADMIN_PASSWORD  後台密碼（必改！預設 hcf-change-me）
     PORT            埠號（預設 8088）
     DATA_DIR        檔案儲存目錄（預設 ./data）
     DATABASE_URL    （選用）Postgres 連線字串；設了就改用雲端資料庫
     SITE_ORIGIN     （選用）限制 CORS 來源，預設 * 
   ============================================================ */
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),{URL}=require('url');

const PORT=process.env.PORT||8088;
const PASSWORD=process.env.ADMIN_PASSWORD||'hcf-change-me';
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'data');
const ORIGIN=process.env.SITE_ORIGIN||'*';
const SECRET=crypto.createHash('sha256').update('hcf-salt::'+PASSWORD).digest();

/* ---------------- 儲存層（檔案 / Postgres 雙模式） ---------------- */
let store;
if(process.env.DATABASE_URL){
  const {Pool}=require('pg'); // 雲端模式才需要 npm i pg
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  const init=pool.query(`CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v JSONB);
    CREATE TABLE IF NOT EXISTS events(id BIGSERIAL PRIMARY KEY,ts BIGINT,name TEXT,params JSONB);
    CREATE INDEX IF NOT EXISTS ev_ts ON events(ts);`);
  store={
    mode:'postgres',
    async get(k){await init;const r=await pool.query('SELECT v FROM kv WHERE k=$1',[k]);return r.rows[0]?r.rows[0].v:null;},
    async set(k,v){await init;await pool.query('INSERT INTO kv(k,v) VALUES($1,$2) ON CONFLICT(k) DO UPDATE SET v=$2',[k,JSON.stringify(v)]);},
    async addEvent(e){await init;await pool.query('INSERT INTO events(ts,name,params) VALUES($1,$2,$3)',[e.ts,e.name,JSON.stringify(e.params||{})]);},
    async events(since){await init;const r=await pool.query('SELECT ts,name,params FROM events WHERE ts>=$1 ORDER BY ts',[since]);return r.rows;}
  };
}else{
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const KV=path.join(DATA_DIR,'kv.json'),EV=path.join(DATA_DIR,'events.ndjson');
  const readKV=()=>{try{return JSON.parse(fs.readFileSync(KV,'utf8'))}catch(e){return{}}};
  const writeKV=o=>{const tmp=KV+'.tmp';fs.writeFileSync(tmp,JSON.stringify(o));fs.renameSync(tmp,KV);};
  store={
    mode:'file',
    async get(k){return readKV()[k]??null;},
    async set(k,v){const o=readKV();o[k]=v;writeKV(o);},
    async addEvent(e){fs.appendFileSync(EV,JSON.stringify(e)+'\n');},
    async events(since){
      let out=[];try{
        for(const line of fs.readFileSync(EV,'utf8').split('\n')){
          if(!line)continue;try{const e=JSON.parse(line);if(e.ts>=since)out.push(e);}catch(_){}
        }
      }catch(_){ }
      return out;
    }
  };
  /* 每日快照備份（保留 7 份） */
  setInterval(()=>{try{
    const d=new Date().toISOString().slice(0,10),bdir=path.join(DATA_DIR,'backups');
    fs.mkdirSync(bdir,{recursive:true});
    const dst=path.join(bdir,'kv-'+d+'.json');
    if(!fs.existsSync(dst)&&fs.existsSync(KV))fs.copyFileSync(KV,dst);
    const keep=fs.readdirSync(bdir).sort().slice(0,-7);
    keep.forEach(f=>fs.unlinkSync(path.join(bdir,f)));
  }catch(_){}},6*3600*1000);
}

/* ---------------- 工具 ---------------- */
const hmac=s=>crypto.createHmac('sha256',SECRET).update(s).digest('hex');
const makeToken=()=>{const exp=Date.now()+7*864e5;return exp+'.'+hmac(String(exp));};
const checkToken=t=>{if(!t)return false;const[exp,sig]=t.split('.');return sig===hmac(exp)&&+exp>Date.now();};
const cookieToken=req=>((req.headers.cookie||'').match(/hcf_admin=([^;]+)/)||[])[1];
const json=(res,code,obj,extra)=>{res.writeHead(code,Object.assign({'Content-Type':'application/json; charset=utf-8'},extra||{}));res.end(JSON.stringify(obj));};
const body=req=>new Promise(r=>{let b='';req.on('data',c=>{b+=c;if(b.length>3e6)req.destroy();});req.on('end',()=>r(b));});
const parse=s=>{try{return JSON.parse(s)}catch(e){return null}};
const cors={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
const loginFail={}; // 簡易暴力破解防護：IP → {n,until}

const CONTENT_KEYS=['announcement','schedule','news','pricing'];
const EVENT_WHITELIST=new Set(['page_view','cta_booking','cta_line','cta_phone','social_click','survey_tab_click','survey_submit','nav_survey','nav_schedule','nav_group','nav_private','nav_goals','ai_open','ai_question','scroll_50','scroll_90']);

/* ---------------- 統計聚合 ---------------- */
async function stats(days){
  const since=Date.now()-days*864e5;
  const evs=await store.events(since);
  const byDay={},totals={},pages={},questions={},goals={};
  for(const e of evs){
    const d=new Date(e.ts).toISOString().slice(0,10);
    byDay[d]=byDay[d]||{};
    byDay[d][e.name]=(byDay[d][e.name]||0)+1;
    totals[e.name]=(totals[e.name]||0)+1;
    const p=e.params||{};
    if(e.name==='page_view'&&p.page)pages[p.page]=(pages[p.page]||0)+1;
    if(e.name==='ai_question'&&p.q)questions[p.q]=(questions[p.q]||0)+1;
    if(e.name==='nav_goals'&&p.goal)goals[p.goal]=(goals[p.goal]||0)+1;
  }
  const top=(o,n)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n);
  return{days,byDay,totals,topPages:top(pages,10),topQuestions:top(questions,10),goals,
    funnel:{pv:totals.page_view||0,
      interest:(totals.nav_goals||0)+(totals.nav_group||0)+(totals.nav_private||0)+(totals.nav_schedule||0),
      intent:(totals.cta_booking||0)+(totals.cta_line||0)+(totals.cta_phone||0),
      lead:totals.survey_submit||0}};
}

/* ---------------- 伺服器 ---------------- */
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://x');
    const p=u.pathname;
    if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end();}

    /* ===== 公開 API（給官網用，CORS 開放） ===== */
    if(p==='/api/track'&&req.method==='POST'){
      const e=parse(await body(req));
      if(e&&EVENT_WHITELIST.has(e.name)){
        await store.addEvent({ts:Date.now(),name:e.name,params:typeof e.params==='object'?e.params:{}});
      }
      return json(res,204===204?200:200,{ok:true},cors);
    }
    if(p==='/api/lead'&&req.method==='POST'){
      const d=parse(await body(req));
      if(d&&(d.name||d.contact)){
        const leads=(await store.get('leads'))||[];
        leads.push({id:Date.now().toString(36),ts:Date.now(),
          name:String(d.name||'').slice(0,50),contact:String(d.contact||'').slice(0,80),
          source:String(d.source||'survey').slice(0,30),status:'new',note:'',
          payload:typeof d.payload==='object'?d.payload:{}});
        await store.set('leads',leads);
        await store.addEvent({ts:Date.now(),name:'survey_submit',params:{via:'lead-api'}});
      }
      return json(res,200,{ok:true},cors);
    }
    if(p==='/api/public/content'&&req.method==='GET'){
      const out={};
      for(const k of CONTENT_KEYS)out[k]=await store.get(k);
      return json(res,200,out,Object.assign({'Cache-Control':'no-store'},cors));
    }

    /* ===== 登入 ===== */
    if(p==='/api/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'?';
      const f=loginFail[ip]||{n:0,until:0};
      if(Date.now()<f.until)return json(res,429,{error:'嘗試太多次，請 10 分鐘後再試'});
      const d=parse(await body(req));
      if(d&&d.password===PASSWORD){
        delete loginFail[ip];
        res.writeHead(200,{'Content-Type':'application/json',
          'Set-Cookie':'hcf_admin='+makeToken()+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800'});
        return res.end(JSON.stringify({ok:true,defaultPw:PASSWORD==='hcf-change-me'}));
      }
      f.n++;if(f.n>=5){f.until=Date.now()+6e5;f.n=0;}
      loginFail[ip]=f;
      return json(res,401,{error:'密碼錯誤'});
    }
    if(p==='/api/logout'){res.writeHead(200,{'Set-Cookie':'hcf_admin=; Path=/; Max-Age=0'});return res.end('{}');}

    /* ===== 管理 API（需登入） ===== */
    if(p.startsWith('/api/admin/')){
      if(!checkToken(cookieToken(req)))return json(res,401,{error:'unauthorized'});
      if(p==='/api/admin/stats')return json(res,200,await stats(Math.min(90,+u.searchParams.get('days')||30)));
      if(p==='/api/admin/leads'&&req.method==='GET')return json(res,200,(await store.get('leads'))||[]);
      if(p==='/api/admin/leads'&&req.method==='POST'){ // 更新單筆 {id,status,note}
        const d=parse(await body(req))||{};
        const leads=(await store.get('leads'))||[];
        const L=leads.find(x=>x.id===d.id);
        if(L){if(d.status)L.status=String(d.status).slice(0,20);if('note'in d)L.note=String(d.note).slice(0,500);await store.set('leads',leads);}
        return json(res,200,{ok:!!L});
      }
      if(p==='/api/admin/leads.csv'){
        const leads=(await store.get('leads'))||[];
        const esc=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
        const rows=[['時間','姓名','聯絡方式','來源','狀態','備註'].join(',')]
          .concat(leads.map(L=>[new Date(L.ts).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),L.name,L.contact,L.source,L.status,L.note].map(esc).join(',')));
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="hcf-leads.csv"'});
        return res.end('\uFEFF'+rows.join('\n'));
      }
      const mC=p.match(/^\/api\/admin\/content\/(\w+)$/);
      if(mC&&CONTENT_KEYS.includes(mC[1])){
        if(req.method==='GET')return json(res,200,{value:await store.get(mC[1])});
        if(req.method==='POST'){const d=parse(await body(req));await store.set(mC[1],d?d.value:null);return json(res,200,{ok:true});}
      }
      if(p==='/api/admin/export'){
        const out={exportedAt:new Date().toISOString(),leads:await store.get('leads')};
        for(const k of CONTENT_KEYS)out[k]=await store.get(k);
        out.events=await store.events(Date.now()-90*864e5);
        res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="hcf-backup.json"'});
        return res.end(JSON.stringify(out));
      }
      if(p==='/api/admin/import'&&req.method==='POST'){
        const d=parse(await body(req));
        if(!d)return json(res,400,{error:'格式錯誤'});
        if(Array.isArray(d.leads))await store.set('leads',d.leads);
        for(const k of CONTENT_KEYS)if(k in d)await store.set(k,d[k]);
        if(Array.isArray(d.events))for(const e of d.events)await store.addEvent(e);
        return json(res,200,{ok:true});
      }
      return json(res,404,{error:'not found'});
    }

    /* ===== 後台頁面 ===== */
    if(p==='/chart.js'){
      res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'public, max-age=86400'});
      return res.end(fs.readFileSync(path.join(__dirname,'chart.umd.js')));
    }
    if(p==='/'||p==='/admin'||p==='/admin.html'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      return res.end(fs.readFileSync(path.join(__dirname,'admin.html')));
    }
    json(res,404,{error:'not found'});
  }catch(err){
    console.error(err);
    json(res,500,{error:'server error'});
  }
});
server.listen(PORT,()=>console.log('HCF 後台啟動 http://localhost:'+PORT+'  儲存模式: '+store.mode+(PASSWORD==='hcf-change-me'?'  ⚠️ 請設定 ADMIN_PASSWORD':'')));
