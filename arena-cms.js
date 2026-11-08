'use strict';
const crypto=require('node:crypto');
const defaults=require('./arena-default.json');
const clone=v=>JSON.parse(JSON.stringify(v));
const categories=new Set(['training','competition','liqing','ringside']);
class ContentError extends Error {constructor(message,status=400){super(message);this.status=status}}
function text(value,max,label,heading=false){
 if(typeof value!=='string'||!value.trim()||value.length>max||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))throw new ContentError(label+'格式不正確');
 const clean=value.trim();
 if(heading&&/[\p{P}\p{S}]/u.test(clean))throw new ContentError(label+'請使用不含標點符號的文字');
 return clean;
}
function media(value,video=false){
 if(typeof value!=='string'||value.length>800||/[\s<>"'\\]/u.test(value))throw new ContentError('影像網址格式不正確');
 let url;try{url=new URL(value,'https://www.hsinchucombat.com')}catch{throw new ContentError('影像網址格式不正確')}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||value.startsWith('//')||(!value.startsWith('/')&&!value.startsWith('https://')))throw new ContentError('影像請使用官網路徑或 HTTPS 網址');
 if(!(video?/\.(mp4|webm|m4v)$/i:/\.(webp|avif|jpg|jpeg|png)$/i).test(url.pathname))throw new ContentError(video?'影片請使用 MP4 或 WebM 檔案':'照片請使用 WebP JPG PNG 或 AVIF 檔案');
 return value;
}
function validate(value){
 if(!value||value.version!==1||!Array.isArray(value.moments)||value.moments.length>100)throw new ContentError('內容格式或影像數量不正確');
 const ids=new Set();
 const moments=value.moments.map(m=>{
  if(!m||typeof m.id!=='string'||! /^[a-z0-9-]{1,48}$/.test(m.id)||ids.has(m.id)||!categories.has(m.section))throw new ContentError('影像編號不可重複 並需選擇正確分類');
  ids.add(m.id);
  if(typeof m.visible!=='boolean'||typeof m.portrait!=='boolean')throw new ContentError('影像顯示設定不正確');
  return {id:m.id,section:m.section,title:text(m.title,60,'影像標題',true),description:text(m.description,240,'影像說明'),image:media(m.image),video:m.video?media(m.video,true):null,alt:text(m.alt,160,'照片描述'),portrait:m.portrait,visible:m.visible};
 });
 if(!Array.isArray(value.featured)||value.featured.length>3||new Set(value.featured).size!==value.featured.length||value.featured.some(id=>!moments.some(m=>m.id===id&&m.visible)))throw new ContentError('精選最多三筆 且需選擇顯示中的影像');
 return {version:1,headline:text(value.headline,40,'封面標題',true),intro:text(value.intro,180,'介紹文字'),heroImage:media(value.heroImage),heroAlt:text(value.heroAlt,160,'封面描述'),featured:[...value.featured],moments};
}
const initial=()=>({revision:'initial',published:clone(defaults),draft:clone(defaults),publishedAt:null,history:[]});
function publicValue(state){const c=clone(state?.published||defaults);c.moments=c.moments.filter(m=>m.visible);return {content:c,revision:state?.revision||'initial',publishedAt:state?.publishedAt||null}}
function validateState(raw){
 if(!raw||!Array.isArray(raw.history)||raw.history.length>8)throw new ContentError('選手頁備份格式不正確');
 return {revision:crypto.randomUUID(),published:validate(raw.published),draft:validate(raw.draft),publishedAt:raw.publishedAt||null,history:raw.history.map(h=>({id:text(h.id,80,'版本編號'),at:text(h.at,40,'版本時間'),content:validate(h.content)}))};
}
function createArenaCMS(store){
 let queue=Promise.resolve();
 const read=async()=>await store.get('arena_cms')||initial();
 return {
  read,
  public:async()=>publicValue(await read()),
  update(data){
   const job=queue.then(async()=>{
    const state=await read();
    if(!data||data.revision!==state.revision)throw new ContentError('內容已被更新 請重新載入後再編輯',409);
    const next=clone(state);
    if(data.action==='save')next.draft=validate(data.content);
    else if(data.action==='publish'){
     const content=validate(data.content);
     next.history=[{id:state.revision,at:state.publishedAt||new Date().toISOString(),content:state.published},...state.history].slice(0,8);
     next.published=content;next.draft=content;next.publishedAt=new Date().toISOString();
    }else if(data.action==='rollback'){
     const old=state.history.find(h=>h.id===data.target);
     if(!old)throw new ContentError('找不到這個發布版本');
     next.history=[{id:state.revision,at:state.publishedAt||new Date().toISOString(),content:state.published},...state.history.filter(h=>h.id!==data.target)].slice(0,8);
     next.published=validate(old.content);next.draft=clone(next.published);next.publishedAt=new Date().toISOString();
    }else throw new ContentError('不支援的操作');
    next.revision=crypto.randomUUID();
    await store.set('arena_cms',next);return next;
   });
   queue=job.catch(()=>{});return job;
  }
 };
}
module.exports={createArenaCMS,validate,validateState,publicValue,ContentError};
