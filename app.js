/* Kyushu family autumn PWA · November 2026 · v1.11.10 D1 taxi + map-link cleanup */

const FIREBASE_CONFIG = window.KYUSHU_FIREBASE_CONFIG || {};
const DATABASE_URL = FIREBASE_CONFIG.databaseURL || "https://kyushu2026-9b6b9-default-rtdb.asia-southeast1.firebasedatabase.app";
const APP_NAMESPACE = "kyushu-nov-2026";
const APP_VERSION = "1.11.10";
const ROOT = window.KYUSHU_PRIVATE_PATH || "trips/kyushu-nov-2026";
const OFFICIAL_TRIP_START = "2026-11-21";
const OFFICIAL_TRIP_END = "2026-11-29";
const PRIVATE_CONTENT_CACHE_KEY = `${APP_NAMESPACE}:content-cache`;
const PRIVATE_AUTH_CACHE_KEY = `${APP_NAMESPACE}:auth-cache`;
let TRIP = null;
let state = null;
let currentAuthUser = null;
let appBound = false;

let lastError = "";
const pollers = new Set();
let cloudReconnectInFlight = false;
const GUIDE_DEVICE_ID_KEY = `${APP_NAMESPACE}:guide-device-id`;
const OFFLINE_PACK_CACHE = "kyushu-nov-offline-pack-v1";
const OFFLINE_PACK_META_KEY = `${APP_NAMESPACE}:offline-pack-meta`;
const OFFLINE_PACK_APPROX_MB = 48;
const OFFLINE_PACK_ASSETS = [
  ...Array.from({length:9},(_,i)=>`./day-scene-zh-v17-${String(i+1).padStart(2,"0")}.webp?v=170`),
  ...Array.from({length:9},(_,i)=>`./day-scene-v52-${String(i+1).padStart(2,"0")}.webp?v=550`),
  ...Array.from({length:9},(_,i)=>`./day-scene-full-zh-${String(i+1).padStart(2,"0")}.png?v=11110`),
  "./nov_decision_d4_ropeway.webp?v=160","./nov_decision_d4_chill.webp?v=160",
  "./nov_decision_d5_autumn.webp?v=160","./nov_decision_d5_chill.webp?v=160",
  "./nov_decision_d7_crater_open.webp?v=160","./nov_decision_d7_museum.webp?v=160",
  "./nov_weather_sunny.webp?v=160","./nov_weather_cloudy.webp?v=160","./nov_weather_rainy.webp?v=160","./nov_weather_storm.webp?v=160","./nov_weather_snow.webp?v=160",
  "./autumn-status-unknown.webp?v=160","./autumn-status-coloring.webp?v=160","./autumn-status-peak.webp?v=160","./autumn-status-past.webp?v=160","./autumn-status-skip.webp?v=160",
  "./nov_empty_autumnwatch.webp?v=160","./nov_empty_expense.webp?v=160","./nov_empty_notes.webp?v=160","./nov_empty_shopping.webp?v=160"
];
let offlinePackBusy = false;

// PDF attachments are intentionally stored in IndexedDB on this device.
// Ticket / hotel PDFs often contain private reservation details, so they are never
// committed to GitHub or Realtime Database. They remain available offline in the PWA.
const PDF_DB_NAME = `${APP_NAMESPACE}-pdf-attachments-v1`;
const PDF_STORE_NAME = "pdfs";
const PDF_MAX_BYTES = 30 * 1024 * 1024;
let pdfAttachmentIndex = new Map();
let pdfDbPromise = null;

function openPdfDb(){
  if(pdfDbPromise)return pdfDbPromise;
  pdfDbPromise=new Promise((resolve,reject)=>{
    if(!window.indexedDB){reject(new Error("此瀏覽器不支援本機 PDF 附件"));return;}
    const req=indexedDB.open(PDF_DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(PDF_STORE_NAME))db.createObjectStore(PDF_STORE_NAME,{keyPath:"key"});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("無法開啟 PDF 儲存空間"));
  });
  return pdfDbPromise;
}
function pdfSizeText(bytes=0){
  const n=Number(bytes)||0;
  if(n<1024)return `${n} B`;
  if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1024/1024).toFixed(1)} MB`;
}
function bookingPdfKey(task){return `booking:${task?.attachmentKey||task?.id||"unknown"}`}
function hotelPdfKey(hotel){
  const basis=`${cleanHotelTitle(hotel?.title||"")}|${hotel?.nav||""}`;
  return `hotel:${guideHash(basis)}`;
}
async function loadPdfAttachmentIndex(){
  try{
    const db=await openPdfDb();
    const rows=await new Promise((resolve,reject)=>{
      const tx=db.transaction(PDF_STORE_NAME,"readonly");
      const req=tx.objectStore(PDF_STORE_NAME).getAll();
      req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
    });
    pdfAttachmentIndex=new Map(rows.map(r=>[r.key,{name:r.name,size:r.size,updatedAt:r.updatedAt}]));
  }catch(err){console.warn("PDF attachment index unavailable",err);pdfAttachmentIndex=new Map();}
}
async function getPdfAttachment(key){
  const db=await openPdfDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(PDF_STORE_NAME,"readonly");
    const req=tx.objectStore(PDF_STORE_NAME).get(key);
    req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
  });
}
async function savePdfAttachment(key,file,label="PDF附件"){
  if(!file)return;
  const isPdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name||"");
  if(!isPdf)throw new Error("只能附加 PDF 檔案");
  if(file.size>PDF_MAX_BYTES)throw new Error("PDF 太大，單一附件上限 30 MB");
  const db=await openPdfDb();
  const record={key,name:file.name||`${label}.pdf`,type:"application/pdf",size:file.size,updatedAt:Date.now(),blob:file};
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(PDF_STORE_NAME,"readwrite");
    tx.objectStore(PDF_STORE_NAME).put(record);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  pdfAttachmentIndex.set(key,{name:record.name,size:record.size,updatedAt:record.updatedAt});
  try{await navigator.storage?.persist?.()}catch{}
}
async function removePdfAttachment(key){
  const db=await openPdfDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(PDF_STORE_NAME,"readwrite");
    tx.objectStore(PDF_STORE_NAME).delete(key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  pdfAttachmentIndex.delete(key);
}
function choosePdfFile(){
  return new Promise(resolve=>{
    const input=document.createElement("input");
    input.type="file";input.accept="application/pdf,.pdf";input.style.display="none";
    const cleanup=()=>{try{input.remove()}catch{}};
    input.addEventListener("change",()=>{const file=input.files?.[0]||null;cleanup();resolve(file)},{once:true});
    document.body.appendChild(input);input.click();
  });
}
async function attachPdf(key,label){
  try{
    const file=await choosePdfFile();if(!file)return;
    await savePdfAttachment(key,file,label);
    renderBookings();renderHotelReturnCard();
    toast(`已附加 PDF：${file.name}`);
  }catch(err){toast(err?.message||"PDF 附件儲存失敗");}
}
async function openPdfAttachment(key){
  // Open a blank window during the user gesture so Android Chrome/PWA will not block it.
  let viewer=null;try{viewer=window.open("","_blank")}catch{}
  try{
    const record=await getPdfAttachment(key);
    if(!record?.blob)throw new Error("找不到這份 PDF，可能已被系統清除");
    const url=URL.createObjectURL(record.blob);
    if(viewer){viewer.location.href=url;viewer.document.title=record.name||"PDF附件";}
    else{
      const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";document.body.appendChild(a);a.click();a.remove();
    }
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }catch(err){try{viewer?.close()}catch{};toast(err?.message||"PDF 開啟失敗");}
}
async function deletePdfAttachment(key){
  if(!confirm("要移除這份 PDF 附件嗎？"))return;
  try{await removePdfAttachment(key);renderBookings();renderHotelReturnCard();toast("PDF 附件已移除");}
  catch(err){toast(err?.message||"移除失敗");}
}
function pdfAttachmentControls(key,label){
  const info=pdfAttachmentIndex.get(key);
  if(!info)return `<button class="mini-btn pdf-attach-btn" type="button" data-pdf-attach="${esc(key)}" data-pdf-label="${esc(label)}">📎 附件 PDF</button>`;
  return `<span class="pdf-file-note" title="${esc(info.name)}">📄 ${esc(info.name)} · ${esc(pdfSizeText(info.size))}</span><button class="mini-action-link" type="button" data-pdf-open="${esc(key)}">開啟 PDF</button><button class="mini-btn" type="button" data-pdf-attach="${esc(key)}" data-pdf-label="${esc(label)}">更換</button><button class="mini-btn pdf-remove-btn" type="button" data-pdf-delete="${esc(key)}">移除</button>`;
}

function pathFor(key){
  return `${ROOT}/${key}`;
}
function endpoint(path){
  return `${DATABASE_URL}/${path}.json`;
}
async function authToken(forceRefresh=false){
  if(!window.firebase?.auth) return null;
  const user=firebase.auth().currentUser;
  if(!user) return null;
  return user.getIdToken(forceRefresh);
}
async function request(path, options = {}){
  const token=await authToken();
  if(!token) throw new Error("尚未登入");
  const url=new URL(endpoint(path));
  url.searchParams.set("auth",token);
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: {"Content-Type":"application/json"},
    ...options
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if(!res.ok){
    const msg = body?.error || body || `${res.status} ${res.statusText}`;
    lastError = String(msg);
    throw new Error(lastError);
  }
  lastError = "";
  return body;
}

function getLastFirebaseError(){
  return lastError;
}

async function initFirebase(){
  try{
    // A real read probe. "Connected" is shown only if Database actually accepts the request.
    await request(`${ROOT}/content/id`, {method:"GET"});
    return true;
  }catch(e){
    console.error("Realtime Database probe failed:", e);
    return false;
  }
}

function subscribe(key, callback){
  let active = true;
  let previous = Symbol("initial");
  const poll = async()=>{
    if(!active) return;
    try{
      const value = await request(pathFor(key), {method:"GET"});
      const signature = JSON.stringify(value);
      if(previous !== signature){
        previous = signature;
        callback(value);
      }
    }catch(e){
      console.error(`Realtime Database read failed (${key}):`, e);
    }
  };
  poll();
  const id = setInterval(poll, 4000);
  const stop = ()=>{ active=false; clearInterval(id); pollers.delete(stop); };
  pollers.add(stop);
  return stop;
}

async function setCloud(key, value){
  return request(pathFor(key), {method:"PUT", body:JSON.stringify(value)});
}

async function addCloud(key, value){
  return request(pathFor(key), {method:"POST", body:JSON.stringify(value)});
}

async function updateCloud(key, id, value){
  return request(`${pathFor(key)}/${id}`, {method:"PATCH", body:JSON.stringify(value)});
}

async function removeCloud(key, id){
  return request(`${pathFor(key)}/${id}`, {method:"DELETE"});
}





const $=(s)=>document.querySelector(s);
const $$=(s)=>[...document.querySelectorAll(s)];
const storeKey=k=>`${TRIP?.id||"private-trip"}:${k}`;
function createState(){
  return {
    dayIndex:0, view:"schedule", tool:"booking", shoppingMember:"全部",
    foods:loadLocal("foods",[]), shopping:loadLocal("shopping",[]), expenses:loadLocal("expenses",[]), mapPlaces:loadLocal("mapPlaces",[]), bookingItems:loadLocal("bookingItems",[]),
    taskStatus:loadLocal("taskStatus",{}), decisions:loadLocal("decisions",{}), decisionDrafts:{},
    autumnStatus:loadLocal("autumnStatus",{}),
    notes:loadLocal("notes",""),
    guideNotes:normalizeGuideNotesMap(loadLocal("guideNotes",{})),
    guideNotePending:loadLocal("guideNotePending",{}),
    guideNoteTimer:null, guideNoteSyncing:false,
    cloud:false, noteTimer:null
  };
}
function loadLocal(key,fallback){try{const v=localStorage.getItem(storeKey(key));return v===null?fallback:JSON.parse(v)}catch{return fallback}}
function saveLocal(key,value){localStorage.setItem(storeKey(key),JSON.stringify(value))}
function guideDeviceId(){
  try{
    let id=localStorage.getItem(GUIDE_DEVICE_ID_KEY);
    if(!id){id=`dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;localStorage.setItem(GUIDE_DEVICE_ID_KEY,id)}
    return id;
  }catch{return "device"}
}
function normalizeGuideNoteRecord(value){
  if(typeof value==="string")return {text:value,updatedAt:0,deviceId:"legacy",deleted:false};
  if(!value||typeof value!=="object")return null;
  return {
    text:typeof value.text==="string"?value.text:"",
    updatedAt:Number(value.updatedAt||0),
    deviceId:String(value.deviceId||"legacy"),
    deleted:!!value.deleted
  };
}
function normalizeGuideNotesMap(raw){
  const out={};
  if(!raw||typeof raw!=="object")return out;
  for(const [key,value] of Object.entries(raw)){
    const rec=normalizeGuideNoteRecord(value);
    if(rec)out[key]=rec;
  }
  return out;
}
function uid(){return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`}
const FAMILY_MEMBER_LABELS=["父","母","兄","弟"];
const LEGACY_MEMBER_MAP={"長輩A":"父","長輩B":"母","35歲":"兄","31歲":"弟"};
function normalizeMemberLabel(value){return LEGACY_MEMBER_MAP[value]||value}
function normalizeFamilyCollections(){
  if(!state)return;
  state.shopping=(state.shopping||[]).map(x=>({...x,owner:normalizeMemberLabel(x.owner)}));
  state.expenses=(state.expenses||[]).map(x=>({...x,payer:normalizeMemberLabel(x.payer),participants:(x.participants||[]).map(normalizeMemberLabel)}));
  if(state.shoppingMember&&state.shoppingMember!=="全部")state.shoppingMember=normalizeMemberLabel(state.shoppingMember);
  saveLocal("shopping",state.shopping);saveLocal("expenses",state.expenses);
}
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function mapSearch(q){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`}
function googleSearch(q){return `https://www.google.com/search?q=${encodeURIComponent(q)}`}
function mapNav(q,mode="driving"){return mapSearch(q)}
function japanToday(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:TRIP?.timezone||"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const o=Object.fromEntries(parts.filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
function initialDay(){
  const today=japanToday();
  const idx=TRIP.days.findIndex(d=>d.date===today);
  return idx>=0?idx:0;
}

function toast(message){
  const t=$("#toast"); if(!t)return;
  t.textContent=String(message||"");
  t.classList.remove("show");
  void t.offsetWidth;
  t.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer=setTimeout(()=>t.classList.remove("show"),1800);
}

function offlinePackMeta(){
  try{return JSON.parse(localStorage.getItem(OFFLINE_PACK_META_KEY)||"null")}catch{return null}
}
function saveOfflinePackMeta(value){
  try{value?localStorage.setItem(OFFLINE_PACK_META_KEY,JSON.stringify(value)):localStorage.removeItem(OFFLINE_PACK_META_KEY)}catch{}
}
function formatOfflinePackTime(ts){
  if(!ts)return "";
  try{return new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(ts))}catch{return ""}
}
function setOfflinePackProgress(done,total){
  const bar=$("#offlinePackProgressBar"),label=$("#offlinePackProgressText");
  const pct=total?Math.round(done/total*100):0;
  if(bar)bar.style.width=`${pct}%`;
  if(label)label.textContent=offlinePackBusy?`${done} / ${total}`:"";
}
async function offlinePackCachedCount(){
  if(!("caches" in window))return 0;
  const cache=await caches.open(OFFLINE_PACK_CACHE);
  let count=0;
  for(const asset of OFFLINE_PACK_ASSETS){
    if(await cache.match(asset))count++;
  }
  return count;
}
async function refreshOfflinePackStatus(){
  const status=$("#offlinePackStatus"),download=$("#offlinePackDownloadBtn"),remove=$("#offlinePackRemoveBtn");
  if(!status||!download)return;
  if(!("caches" in window)){
    status.textContent="這個瀏覽器不支援離線旅行包。";
    download.disabled=true;if(remove)remove.hidden=true;return;
  }
  const count=await offlinePackCachedCount();
  const total=OFFLINE_PACK_ASSETS.length;
  const meta=offlinePackMeta();
  if(offlinePackBusy)return;
  setOfflinePackProgress(count,total);
  if(count===total){
    const when=formatOfflinePackTime(meta?.updatedAt);
    status.textContent=`已下載 ${total} 項 · 約 ${OFFLINE_PACK_APPROX_MB} MB${when?` · ${when} 更新`:""}`;
    download.textContent="更新離線包";
    if(remove)remove.hidden=false;
  }else if(count>0){
    status.textContent=`部分下載 ${count} / ${total} · 點一下可補齊`;
    download.textContent="繼續下載";
    if(remove)remove.hidden=false;
  }else{
    status.textContent=`尚未下載 · 約 ${OFFLINE_PACK_APPROX_MB} MB`;
    download.textContent="下載完整離線包";
    if(remove)remove.hidden=true;
  }
}
async function cacheOfflineAsset(cache,asset){
  const req=new Request(new URL(asset,location.href),{cache:"reload",credentials:"same-origin"});
  const res=await fetch(req);
  if(!res.ok)throw new Error(`${res.status} ${new URL(asset,location.href).pathname.split("/").pop()}`);
  await cache.put(req,res.clone());
}
async function downloadOfflinePack(){
  if(offlinePackBusy||!("caches" in window))return;
  offlinePackBusy=true;
  const download=$("#offlinePackDownloadBtn"),remove=$("#offlinePackRemoveBtn"),status=$("#offlinePackStatus");
  if(download){download.disabled=true;download.textContent="下載中…"}if(remove)remove.disabled=true;
  if(status)status.textContent="正在下載旅行圖片與備案素材…";
  setOfflinePackProgress(0,OFFLINE_PACK_ASSETS.length);
  // Keep the latest authorized itinerary JSON on-device as part of the offline experience.
  if(TRIP)cacheAuthorizedTrip(TRIP,currentAuthUser||{email:""});
  const cache=await caches.open(OFFLINE_PACK_CACHE);
  let done=0;const failures=[];let cursor=0;
  const worker=async()=>{
    while(cursor<OFFLINE_PACK_ASSETS.length){
      const index=cursor++;
      const asset=OFFLINE_PACK_ASSETS[index];
      try{await cacheOfflineAsset(cache,asset)}catch(err){failures.push({asset,error:String(err?.message||err)})}
      done++;setOfflinePackProgress(done,OFFLINE_PACK_ASSETS.length);
      if(status)status.textContent=`正在下載 ${done} / ${OFFLINE_PACK_ASSETS.length}${failures.length?` · ${failures.length} 項待重試`:""}`;
    }
  };
  try{
    await Promise.all(Array.from({length:4},worker));
    const wanted=new Set(OFFLINE_PACK_ASSETS.map(a=>new URL(a,location.href).href));
    for(const req of await cache.keys())if(!wanted.has(req.url))await cache.delete(req);
    const count=await offlinePackCachedCount();
    if(count===OFFLINE_PACK_ASSETS.length){
      saveOfflinePackMeta({version:APP_VERSION,updatedAt:Date.now(),count});
      try{await navigator.storage?.persist?.()}catch{}
      toast("離線旅行包下載完成");
    }else{
      saveOfflinePackMeta({version:APP_VERSION,updatedAt:Date.now(),count,partial:true});
      toast(`離線包尚有 ${OFFLINE_PACK_ASSETS.length-count} 項未完成`);
    }
  }finally{
    offlinePackBusy=false;
    if(download)download.disabled=false;if(remove)remove.disabled=false;
    await refreshOfflinePackStatus();
  }
}
async function removeOfflinePack(){
  if(offlinePackBusy||!("caches" in window))return;
  offlinePackBusy=true;
  const status=$("#offlinePackStatus"),download=$("#offlinePackDownloadBtn"),remove=$("#offlinePackRemoveBtn");
  if(download)download.disabled=true;if(remove)remove.disabled=true;
  if(status)status.textContent="正在移除離線圖片…";
  try{
    await caches.delete(OFFLINE_PACK_CACHE);
    saveOfflinePackMeta(null);
    toast("已移除離線旅行包");
  }finally{
    offlinePackBusy=false;if(download)download.disabled=false;if(remove)remove.disabled=false;
    await refreshOfflinePackStatus();
  }
}

function dailySceneAsset(index,lang=getSceneLanguage()){
  const day=String(index+1).padStart(2,"0");
  return lang==='ja' ? `./day-scene-v52-${day}.webp?v=550` : `./day-scene-zh-v17-${day}.webp?v=170`;
}
function dailySceneFullAsset(index,lang=getSceneLanguage()){
  const day=String(index+1).padStart(2,"0");
  return lang==='ja' ? dailySceneAsset(index,'ja') : `./day-scene-full-zh-${day}.png?v=11110`;
}
function renderDailyScene(){
  const img=$("#daySceneImage"), bar=$("#daySceneProgressBar");
  if(!img)return;
  const src=dailySceneAsset(state.dayIndex,getSceneLanguage());
  if(img.getAttribute("src")!==src) img.src=src;
  img.alt=`D${state.dayIndex+1} 九州家族紅葉旅${getSceneLanguage()==="ja"?"日文":"中文"}主題圖`;
  if(bar) bar.style.width=`${((state.dayIndex+1)/TRIP.days.length)*100}%`;
}
let dayLightboxIndex=0;
let dayImageZoom=1, dayImagePanX=0, dayImagePanY=0;
let dayLandscapeActive=false,dayLandscapeNativeFullscreen=false;
const DAY_IMAGE_ZOOM_MIN=1, DAY_IMAGE_ZOOM_MAX=4;
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function applyDayImageZoom(){
  const stage=$("#dayImageLightbox .day-image-lightbox-stage"),img=$("#dayLightboxImage"),label=$("#dayZoomLabel");
  if(!stage||!img)return;
  if(dayImageZoom<=1.001){dayImageZoom=1;dayImagePanX=0;dayImagePanY=0}
  const rect=stage.getBoundingClientRect();
  const maxX=Math.max(0,rect.width*(dayImageZoom-1)/2);
  const maxY=Math.max(0,rect.height*(dayImageZoom-1)/2);
  dayImagePanX=clamp(dayImagePanX,-maxX,maxX);dayImagePanY=clamp(dayImagePanY,-maxY,maxY);
  img.style.transform=`translate3d(${dayImagePanX}px,${dayImagePanY}px,0) scale(${dayImageZoom})`;
  stage.classList.toggle("is-zoomed",dayImageZoom>1.001);
  if(label)label.textContent=`${Math.round(dayImageZoom*100)}%`;
}
function setDayImageZoom(next){dayImageZoom=clamp(Number(next)||1,DAY_IMAGE_ZOOM_MIN,DAY_IMAGE_ZOOM_MAX);applyDayImageZoom()}
function resetDayLightboxScroll(){const stage=$("#dayImageLightbox .day-image-lightbox-stage");if(stage){stage.scrollTop=0;stage.scrollLeft=0}}
function resetDayImageZoom(){dayImageZoom=1;dayImagePanX=0;dayImagePanY=0;applyDayImageZoom();if(dayLandscapeActive)resetDayLightboxScroll()}
function renderDayLightbox(){
  const wrap=$("#dayImageLightbox"),img=$("#dayLightboxImage");if(!wrap||!img||!TRIP?.days?.length)return;
  dayLightboxIndex=Math.max(0,Math.min(TRIP.days.length-1,dayLightboxIndex));
  const d=TRIP.days[dayLightboxIndex];
  const lang=getSceneLanguage();
  const fallback=dailySceneAsset(dayLightboxIndex,lang);
  img.dataset.fallback="0";
  img.onerror=()=>{if(img.dataset.fallback!=="1"){img.dataset.fallback="1";img.src=fallback;}};
  img.src=dailySceneFullAsset(dayLightboxIndex,lang);
  img.alt=`D${dayLightboxIndex+1} ${d.title||"旅程主題圖"}（${lang==='ja'?'日文':'中文'}高清版）`;
  $("#dayLightboxTitle").textContent=`D${dayLightboxIndex+1}｜${d.title||"旅程"}`;
  $$("[data-day-lang]").forEach(btn=>btn.classList.toggle("active",btn.dataset.dayLang===lang));
  $("#dayLightboxCounter").textContent=`${dayLightboxIndex+1} / ${TRIP.days.length}`;
}
function openDayLightbox(index=state.dayIndex){
  const wrap=$("#dayImageLightbox");if(!wrap)return;
  dayLightboxIndex=index;resetDayImageZoom();renderDayLightbox();wrap.classList.add("show");wrap.setAttribute("aria-hidden","false");document.body.classList.add("modal-open");
  updateDayLandscapeButton();
}
function isDayLandscapeViewport(){return window.matchMedia?.("(orientation: landscape)")?.matches||window.innerWidth>window.innerHeight}
function updateDayLandscapeButton(){
  const btn=$("#dayLandscapeBtn"),label=$("#dayLandscapeLabel");if(!btn)return;
  btn.classList.toggle("active",dayLandscapeActive);
  btn.setAttribute("aria-pressed",dayLandscapeActive?"true":"false");
  btn.setAttribute("aria-label",dayLandscapeActive?"退出橫向全螢幕":"橫向全螢幕");
  btn.title=dayLandscapeActive?"退出橫向全螢幕":"橫向全螢幕";
  if(label)label.textContent=dayLandscapeActive?"退出":"橫向";
}
function syncDayLandscapeFallback(){
  const wrap=$("#dayImageLightbox");if(!wrap||!dayLandscapeActive)return;
  // Orientation lock is not available on every iOS/browser build. When the viewport
  // stays portrait, rotate only this viewer so it still becomes a usable landscape canvas.
  wrap.classList.toggle("force-landscape-fallback",!isDayLandscapeViewport());
  applyDayImageZoom();
}
async function enterDayLandscape(){
  const wrap=$("#dayImageLightbox"),card=wrap?.querySelector(".day-image-lightbox-card");if(!wrap||!card)return;
  dayLandscapeActive=true;dayLandscapeNativeFullscreen=false;resetDayImageZoom();
  wrap.classList.add("landscape-view");document.body.classList.add("day-landscape-open");updateDayLandscapeButton();
  // v1.11.4: do NOT invoke the browser Fullscreen API. Android/Chrome shows a
  // system-owned "how to exit fullscreen" banner which the web app cannot hide.
  // The lightbox itself already covers the PWA viewport; orientation lock is best-effort.
  try{if(screen.orientation?.lock)await screen.orientation.lock("landscape")}catch{}
  window.setTimeout(()=>{syncDayLandscapeFallback();resetDayLightboxScroll()},120);
}
async function exitDayLandscape({exitFullscreen=true}={}){
  const wrap=$("#dayImageLightbox");
  dayLandscapeActive=false;
  if(wrap)wrap.classList.remove("landscape-view","force-landscape-fallback");
  document.body.classList.remove("day-landscape-open");
  try{screen.orientation?.unlock?.()}catch{}
  if(exitFullscreen&&(document.fullscreenElement||document.webkitFullscreenElement)){
    try{if(document.exitFullscreen)await document.exitFullscreen();else if(document.webkitExitFullscreen)document.webkitExitFullscreen()}catch{}
  }
  dayLandscapeNativeFullscreen=false;resetDayImageZoom();updateDayLandscapeButton();
}
function toggleDayLandscape(){return dayLandscapeActive?exitDayLandscape():enterDayLandscape()}
function closeDayLightbox(){const wrap=$("#dayImageLightbox");if(!wrap)return;if(dayLandscapeActive)exitDayLandscape();const changed=state&&state.dayIndex!==dayLightboxIndex;if(changed){state.dayIndex=dayLightboxIndex;state.decisionDrafts={};renderDays();renderSchedule()}wrap.classList.remove("show");wrap.setAttribute("aria-hidden","true");document.body.classList.remove("modal-open")}
function moveDayLightbox(step){if(dayLandscapeActive)return;resetDayImageZoom();dayLightboxIndex=(dayLightboxIndex+step+TRIP.days.length)%TRIP.days.length;renderDayLightbox()}


const SCENE_LANG_STORAGE_KEY=`${APP_NAMESPACE}:scene-lang`;
function getSceneLanguage(){
  try{return localStorage.getItem(SCENE_LANG_STORAGE_KEY)==='ja'?'ja':'zh'}catch{return 'zh'}
}
function applySceneLanguageUI(){
  const lang=getSceneLanguage();
  document.documentElement.dataset.sceneLang=lang;
  $$('[data-day-lang]').forEach(btn=>btn.classList.toggle('active',btn.dataset.dayLang===lang));
}
function setSceneLanguage(lang){
  const next=lang==='ja'?'ja':'zh';
  try{localStorage.setItem(SCENE_LANG_STORAGE_KEY,next)}catch{}
  applySceneLanguageUI();
  renderDailyScene();
  if(document.querySelector('#dayImageLightbox.show'))renderDayLightbox();
}

const WEATHER_PREVIEW_STORAGE_KEY=`${APP_NAMESPACE}:weather-preview-mode`;
const WEATHER_PREVIEW_VARIANTS=[
  {mode:'sunny',icon:'☀️',desc:'晴天預覽',art:'sunny',label:'晴天'},
  {mode:'cloudy',icon:'☁️',desc:'陰天預覽',art:'cloudy',label:'陰天'},
  {mode:'rain',icon:'🌧️',desc:'雨天預覽',art:'rain',label:'雨天'},
  {mode:'storm',icon:'⛈️',desc:'雷雨預覽',art:'storm',label:'雷雨'},
  {mode:'snow',icon:'🌨️',desc:'雪天預覽',art:'snow',label:'雪天'}
];
function getWeatherPreviewMode(){
  try{
    const saved=localStorage.getItem(WEATHER_PREVIEW_STORAGE_KEY);
    return WEATHER_PREVIEW_VARIANTS.some(v=>v.mode===saved)?saved:'sunny';
  }catch{return 'sunny'}
}
function weatherPreviewMeta(mode=getWeatherPreviewMode()){
  return WEATHER_PREVIEW_VARIANTS.find(v=>v.mode===mode)||WEATHER_PREVIEW_VARIANTS[0];
}
function cycleWeatherPreviewMode(){
  const current=getWeatherPreviewMode();
  const idx=WEATHER_PREVIEW_VARIANTS.findIndex(v=>v.mode===current);
  const next=WEATHER_PREVIEW_VARIANTS[(idx+1)%WEATHER_PREVIEW_VARIANTS.length];
  try{localStorage.setItem(WEATHER_PREVIEW_STORAGE_KEY,next.mode)}catch{}
  return next;
}
function setWeatherModeHint(text='',preview=false){
  const el=$('#weatherModeHint'); if(!el)return;
  el.textContent=text;
  el.hidden=!text;
  el.classList.toggle('preview',!!preview);
}
function handleWeatherPreviewTap(){
  const card=$('#weatherCard');
  if(!card||card.dataset.preview!=='1')return;
  const next=cycleWeatherPreviewMode();
  if(TRIP?.days?.[state?.dayIndex??0]) renderWeather(TRIP.days[state.dayIndex]);
  toast(`預覽天氣：${next.label}`,'day');
}
function normalizeCloud(val){
  if(!val)return[];
  return Array.isArray(val)?val:Object.entries(val).map(([id,v])=>({...v,id}));
}
function weatherMode(event){
  const t=(event.transport||"")+" "+(event.category||"");
  if(t.includes("🚶")) return "walking";
  if(t.includes("🚆")||t.includes("🚇")||t.includes("🚋")||t.includes("🚌")) return "transit";
  return "driving";
}

function intensityText(value){
  if(typeof value==="number"){
    const n=Math.max(0,Math.min(5,Math.round(value)));
    return `${"★".repeat(n)}${"☆".repeat(5-n)}`;
  }
  return value?String(value):"";
}
function japanClockMinutes(){
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:TRIP?.timezone||"Asia/Tokyo",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(new Date());
  const o=Object.fromEntries(parts.filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  return Number(o.hour)*60+Number(o.minute);
}
function eventTimeMinutes(value){
  const m=String(value||"").match(/^(\d{1,2}):(\d{2})/);
  if(!m)return null;
  return Number(m[1])*60+Number(m[2]);
}
function formatCountdown(mins){
  if(mins<=0)return "現在";
  if(mins<60)return `${mins} 分後`;
  const h=Math.floor(mins/60),m=mins%60;
  return m?`${h} 小時 ${m} 分後`:`${h} 小時後`;
}
function renderNowNext(day){
  const box=$("#nowNextCard"); if(!box)return;
  if(!day||day.date!==japanToday()){
    box.hidden=true;box.innerHTML="";return;
  }
  const events=(day.events||[]).filter(eventVisible)
    .map(e=>({...e,_mins:eventTimeMinutes(e.time)}))
    .filter(e=>Number.isFinite(e._mins))
    .sort((a,b)=>a._mins-b._mins);
  if(!events.length){box.hidden=true;box.innerHTML="";return}
  const now=japanClockMinutes();
  const next=events.find(e=>e._mins>=now);
  box.hidden=false;
  if(!next){
    box.innerHTML=`<div class="now-next-kicker">TODAY</div><div class="now-next-finished"><b>今天主要行程完成</b><span>接下來就照家人的體力慢慢收尾。</span></div>`;
    return;
  }
  const mins=Math.max(0,next._mins-now);
  box.innerHTML=`<div class="now-next-head"><div><span class="eyebrow">NEXT UP</span><b>下一站</b></div><em>${esc(formatCountdown(mins))}</em></div>
    <div class="now-next-main"><strong>${esc(next.time)}</strong><div><b>${esc(next.title)}</b>${next.travel?`<small>${esc(next.transport||"→")} ${esc(next.travel)}</small>`:""}</div></div>`;
}
function renderFamilyMeta(day){
  const box=$("#familyMetaCard"); if(!box)return;
  const m=day.familyMeta||{};
  const rows=[
    m.drive?{icon:"🚗",label:"今日駕駛",value:m.drive}:null,
    m.intensity?{icon:"👟",label:"行程強度",value:intensityText(m.intensity)}:null,
    m.shopping?{icon:"🛒",label:"今日採買",value:m.shopping}:null,
    m.dinner?{icon:"🍳",label:"今晚",value:m.dinner}:null,
    m.elderNote?{icon:"👨‍👩‍👦",label:"家族提醒",value:m.elderNote,wide:true}:null
  ].filter(Boolean);
  box.hidden=!rows.length;
  box.innerHTML=rows.length?`<div class="family-meta-head"><span class="eyebrow">FAMILY DAY</span><b>今天怎麼走</b></div><div class="family-meta-grid">${rows.map(r=>`<div class="family-meta-item ${r.wide?"wide":""}"><span>${r.icon}</span><div><small>${esc(r.label)}</small><b>${esc(r.value)}</b></div></div>`).join("")}</div>`:"";
}
function renderDrivingCard(day){
  const box=$("#drivingCard");if(!box)return;
  const drive=String(day?.familyMeta?.drive||"").trim();
  const legs=(day?.events||[]).filter(e=>eventVisible(e)&&["🚗","🚐"].includes(e.transport));
  const useful=drive&&drive!=="0"&&legs.length;
  box.hidden=!useful;if(!useful){box.innerHTML="";return}
  const mode=legs.some(e=>e.transport==="🚐")?"包車 / 乘車":"自駕";
  const route=[];for(const e of legs){if(!route.includes(e.title))route.push(e.title)}
  const now=day.date===japanToday()?japanClockMinutes():-1;
  const next=legs.find(e=>{const m=eventTimeMinutes(e.time);return now<0||!Number.isFinite(m)||m>=now})||legs[0];
  box.innerHTML=`<div class="driving-head"><div><span class="eyebrow">DRIVE</span><b>${esc(mode)}安排</b></div><em>${esc(drive)}</em></div><div class="driving-route">${route.slice(0,6).map((x,i)=>`<span>${i?"→ ":""}${esc(x)}</span>`).join("")}</div>${next?`<a class="driving-nav" target="_blank" rel="noopener" href="${mapSearch(next.nav||next.title)}">下一個駕車點：${esc(next.title)}　↗</a>`:""}`;
}
const AUTUMN_STATUS_ORDER=["unknown","coloring","peak","past","skip"];
const AUTUMN_STATUS_META={
  unknown:{label:"未確認",icon:"?",image:"./autumn-status-unknown.webp?v=160",verdict:"待確認"},
  coloring:{label:"色づき始め",icon:"🍂",image:"./autumn-status-coloring.webp?v=160",verdict:"持續追蹤"},
  peak:{label:"見頃",icon:"🍁",image:"./autumn-status-peak.webp?v=160",verdict:"優先保留"},
  past:{label:"見頃過ぎ",icon:"🍂",image:"./autumn-status-past.webp?v=160",verdict:"可降級"},
  skip:{label:"不追",icon:"—",image:"./autumn-status-skip.webp?v=160",verdict:"不追蹤"}
};
const AUTUMN_PRIORITY={
  "akizuki-autumn":"S","kamado-autumn":"S","kumamoto-ginkgo":"S",
  "takachiho-autumn":"A","hitome-hakkei":"A","keisekien":"A","taibaru-ginkgo":"A",
  "yufuin-autumn":"B+","chojabaru":"B+","maizuru-ginkgo":"B"
};
const AUTUMN_SOURCE_META={
  "taibaru-ginkgo":{
    official:"https://www.crossroadfukuoka.jp/spot/11584",
    officialLabel:"福岡縣觀光官方・太原銀杏",
    baseline:"D2 A/B 第一判斷核心。7成黃以上直接走A；5～6成黃但晴天且官方／近期照片已漂亮可考慮；大量綠色就切B。2026實際觀覽期間與色況以官方最新公告為準。"
  },
  "maizuru-ginkgo":{
    official:"https://www.midorimachi.jp/maiduru/",
    officialLabel:"舞鶴公園官方",
    baseline:"只在D2市區Chill B方案使用。7成黃以上正常去、黃綠各半短停、明顯偏綠直接跳過。"
  },
  "yufuin-autumn":{
    official:"https://yufuin.gr.jp/",
    officialLabel:"YUFUINFO 官方",
    baseline:"D3–D4 不押滿紅；以Villa、晨霧、由布岳與深秋街景為主，不需要為紅葉硬追。"
  },
  "hitome-hakkei":{
    official:"https://nakatsuyaba.com/",
    officialLabel:"中津耶馬溪官方",
    baseline:"D5 A/B 第一判斷核心；一目八景達見頃才值得早出發，仍以當季官方更新為準。"
  },
  "keisekien":{
    official:"https://nakatsuyaba.com/",
    officialLabel:"中津耶馬溪官方",
    baseline:"D5 第二判斷；只有官方即時狀況也漂亮才加入，否則直接跳過。"
  },
  "chojabaru":{
    official:"https://www.town.kokonoe.oita.jp/docs/2025032700023/",
    officialLabel:"九重町官方",
    baseline:"長者原以金色草原、芒草與九重連山為主，不只看楓紅。"
  },
  "takachiho-autumn":{
    official:"https://www.takachiho-kanko.info/",
    officialLabel:"高千穗觀光協會",
    baseline:"官方 FAQ 的一般紅葉期為 11 月中旬～下旬；D6 正落在主要觀測窗口。"
  },
  "kumamoto-ginkgo":{
    official:"https://www.pref.kumamoto.jp/soshiki/10/215705.html",
    officialLabel:"熊本縣官方",
    baseline:"D7 S級重點；還車處理完成後四人一起看，並確認當年黃葉程度與點燈公告。"
  },
  "akizuki-autumn":{
    official:"https://www.city.asakura.lg.jp/site/kanko/2930.html",
    officialLabel:"朝倉市紅葉情報",
    baseline:"官方一般見頃為 11 月下旬～12 月上旬；2025 年 11/28 記錄為見頃。"
  },
  "kamado-autumn":{
    official:"https://kamadojinja.or.jp/information/",
    officialLabel:"竈門神社官方",
    baseline:"官方說明例年 11 月中旬開始色づき，下旬～12 月初進入主要見頃。"
  }
};
const OFFICIAL_STATUS_BY_DAY={
  1:[
    {id:"taibaru-ginkgo-live",icon:"🟡",title:"太原銀杏森林",label:"福岡縣觀光官方・觀覽／色況資訊",url:"https://www.crossroadfukuoka.jp/spot/11584",hint:"D2 A/B第一判斷：先看2026觀覽公告與近期色況；漂亮才包車走太原→大濠。",decisionId:"d2-ginkgo-route"},
    {id:"maizuru-ginkgo-live",icon:"🟡",title:"舞鶴公園 銀杏",label:"旬の情報・園內公告",url:"https://www.midorimachi.jp/maiduru/",hint:"只有D2市區Chill B方案才看；7成黃以上正常去、黃綠各半短停、偏綠直接跳過。",decisionId:"d2-maizuru-ginkgo"}
  ],
  2:[
    {id:"jr-kyushu-status",icon:"🚆",title:"JR 九州運行情報",label:"由布院之森・久大本線",url:"https://www.jrkyushu.co.jp/trains/info/",hint:"D3 出發前先確認延誤、停駛與臨時公告。"},
    {id:"yufuin-no-mori",icon:"🌲",title:"由布院之森",label:"官方時刻・運行日",url:"https://www.jrkyushu.co.jp/english/train/yufuin_no_mori.html",hint:"確認11/23由布院之森3號是否有運行；3號無班次／未搶到就回1號。"}
  ],
  3:[
    {id:"beppu-ropeway",icon:"🚡",title:"別府纜車・鶴見岳",label:"本日運行・天氣・視界",url:"https://www.beppu-ropeway.co.jp/en/",hint:"D4 是否上鶴見岳，先看官方本日運行與視界；天候不佳就直接不上山。",decisionId:"d4-beppu-weather",phone:"0977-22-2278"},
    {id:"african-safari",icon:"🦒",title:"九州自然動物公園 Safari",label:"官方營業與公告",url:"https://africansafari.co.jp/",hint:"自駕 Safari Zone 前確認當日營業、臨時公告與園區資訊。",phone:"0978-48-2331"},
    {id:"umi-jigoku",icon:"♨️",title:"別府 海地獄",label:"官方營業資訊",url:"https://www.umijigoku.co.jp/",hint:"查看海地獄官方營業與臨時活動資訊。",phone:"0977-66-0121"}
  ],
  4:[
    {id:"yabakei-autumn-live",icon:"🍁",title:"一目八景・溪石園",label:"中津耶馬溪紅葉實況",url:"https://nakatsuyaba.com/",hint:"11/24 晚先看一目八景是否見頃；溪石園作第二判斷，再決定 D5 A／B。",decisionId:"d5-autumn-route"},
    {id:"kokonoe-bridge",icon:"🌉",title:"九重夢大吊橋",label:"營業・惡天候限制",url:"https://www.yumeooturihashi.com/info.html",hint:"只在 D5 Chill 路線使用；強風或惡天候時官方可能限制入場。"}
  ],
  5:[
    {id:"takachiho-amaterasu",icon:"🚃",title:"高千穗天照鐵道",label:"當日運行資訊",url:"https://amaterasu-railway.jp/",hint:"官方最新運行資訊；雨、強風或設備狀況可能造成停駛。",phone:"0982-72-3216"},
    {id:"takachiho-gorge",icon:"🏞️",title:"高千穗峽・遊步道",label:"通行・交通最新公告",url:"https://www.takachiho-kanko.info/news/",hint:"出發前確認遊步道、道路、接駁與地震／天候相關公告。",phone:"0982-73-1213"}
  ],
  6:[
    {id:"aso-crater",icon:"🌋",title:"阿蘇中岳火口",label:"即時火口規制",url:"https://www.aso-volcano.jp/",hint:"D7 是否進火口只看官方即時規制；若關閉直接走博物館備案。",decisionId:"d7-crater"},
    {id:"kumamoto-castle",icon:"🏯",title:"熊本城",label:"開園・最新公告",url:"https://castle.kumamoto-guide.jp/news/",hint:"確認開園、設施限制與當日最新公告。",phone:"096-223-5011"},
    {id:"kumamoto-ginkgo-live",icon:"🟡",title:"熊本縣廳銀杏大道",label:"官方紅葉・點燈資訊",url:"https://www.pref.kumamoto.jp/soshiki/10/215705.html",hint:"D7 四人一起看；出發前確認黃葉程度與2026是否有點燈。"}
  ],
  7:[
    {id:"akizuki-autumn-live",icon:"🍁",title:"秋月紅葉",label:"朝倉市紅葉情報",url:"https://www.city.asakura.lg.jp/site/kanko/2930.html",hint:"D8 S級主場；確認秋月當週色況後決定停留節奏。"},
    {id:"dazaifu",icon:"⛩️",title:"太宰府天滿宮",label:"參拜時間・重要公告",url:"https://www.dazaifutenmangu.or.jp/",hint:"D8 抵達前確認參拜時間、工程與臨時公告。"},
    {id:"kamado",icon:"🍁",title:"竈門神社",label:"紅葉・夜間點燈公告",url:"https://kamadojinja.or.jp/information/",hint:"D8 S級重點；確認當年色づき、點燈期間與最新公告。",phone:"092-922-4106"}
  ],
  8:[
    {id:"fukuoka-airport",icon:"✈️",title:"福岡機場 國際線",label:"當日出發航班",url:"https://www.fukuoka-airport.jp/pcfs/en/flight/index.php?type=ID",hint:"D9 出發前確認航班時間、登機門與即時狀態。"}
  ]
};let autumnWatchScope="day";
let autumnSortMode=(()=>{try{return localStorage.getItem("kyushu-nov-2026:autumn-sort")||"priority"}catch{return "priority"}})();
let activeAutumnId="";
let autumnDraftStatus="unknown";
function autumnSpotById(id){return (TRIP.autumnSpots||[]).find(x=>x.id===id)}
function autumnDaysForSpot(id){
  const out=[];
  for(let i=0;i<(TRIP.days||[]).length;i++)if((TRIP.days[i]?.autumnIds||[]).includes(id))out.push(i+1);
  return out;
}
function autumnStatusRecord(id){
  const raw=state.autumnStatus?.[id];
  if(typeof raw==="string")return {status:raw,updatedAt:0,note:""};
  if(raw&&typeof raw==="object")return {status:raw.status||"unknown",updatedAt:Number(raw.updatedAt||0),note:String(raw.note||"")};
  return {status:"unknown",updatedAt:0,note:""};
}
function autumnStatusFor(id){return autumnStatusRecord(id).status}
function autumnUpdatedText(ts){
  if(!ts)return "尚未確認";
  try{return new Intl.DateTimeFormat("zh-TW",{timeZone:TRIP?.timezone||"Asia/Tokyo",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(ts))}catch{return "已更新"}
}
function autumnPriorityRank(id){return ({S:0,A:1,"B+":2,B:3}[AUTUMN_PRIORITY[id]]??9)}
function autumnStatusRank(id){return ({peak:0,coloring:1,unknown:2,past:3,skip:4}[autumnStatusFor(id)]??9)}
function autumnSortSpots(spots){
  const arr=[...spots];
  if(autumnSortMode==="date")return arr.sort((a,b)=>(autumnDaysForSpot(a.id)[0]||99)-(autumnDaysForSpot(b.id)[0]||99)||autumnPriorityRank(a.id)-autumnPriorityRank(b.id));
  if(autumnSortMode==="status")return arr.sort((a,b)=>autumnStatusRank(a.id)-autumnStatusRank(b.id)||autumnPriorityRank(a.id)-autumnPriorityRank(b.id));
  if(autumnSortMode==="stale")return arr.sort((a,b)=>(autumnStatusRecord(a.id).updatedAt||0)-(autumnStatusRecord(b.id).updatedAt||0)||autumnPriorityRank(a.id)-autumnPriorityRank(b.id));
  return arr.sort((a,b)=>autumnPriorityRank(a.id)-autumnPriorityRank(b.id)||(autumnDaysForSpot(a.id)[0]||99)-(autumnDaysForSpot(b.id)[0]||99));
}
function autumnSortLabel(){return ({priority:"優先級",date:"旅程日期",status:"目前狀態",stale:"最久未確認"}[autumnSortMode]||"優先級")}
function autumnSpotVerdict(id){
  const status=autumnStatusFor(id),meta=AUTUMN_STATUS_META[status]||AUTUMN_STATUS_META.unknown;
  if(status==="unknown"&&["S","A"].includes(AUTUMN_PRIORITY[id]))return "優先查情報";
  return meta.verdict;
}
function autumnSourceLinks(spot,{compact=false}={}){
  const src=AUTUMN_SOURCE_META[spot.id]||{};
  const links=[];
  if(src.official)links.push(`<a target="_blank" rel="noopener" href="${esc(src.official)}">官方情報 ↗</a>`);
  links.push(`<a target="_blank" rel="noopener" href="${googleSearch(`${spot.label} 紅葉 2026`) }">近期情報 ↗</a>`);
  if(!compact)links.push(`<a target="_blank" rel="noopener" href="${mapSearch(spot.label)}">地圖 / 照片 ↗</a>`);
  return links.join("");
}
function autumnSummary(spots){
  const counts={peak:0,coloring:0,unknown:0,past:0,skip:0};
  spots.forEach(s=>{const st=autumnStatusFor(s.id);counts[st]=(counts[st]||0)+1});
  const bits=[];
  if(counts.peak)bits.push(`見頃 ${counts.peak}`);
  if(counts.coloring)bits.push(`色づき ${counts.coloring}`);
  if(counts.unknown)bits.push(`未確認 ${counts.unknown}`);
  if(!bits.length)bits.push(`${spots.length} 個景點已整理`);
  return bits.join("・");
}
function renderAutumnWatch(day){
  const box=$("#autumnWatch"); if(!box)return;
  const dayIds=day.autumnIds||[];
  let spots=(autumnWatchScope==="all"?(TRIP.autumnSpots||[]):dayIds.map(autumnSpotById)).filter(Boolean);
  if(autumnWatchScope==="all")spots=autumnSortSpots(spots);
  const canOpenAll=(TRIP.autumnSpots||[]).length>0;
  box.hidden=!spots.length&&!canOpenAll;
  if(!spots.length&&!canOpenAll){box.innerHTML="";return}
  const allUnknown=spots.length&&spots.every(s=>autumnStatusFor(s.id)==="unknown");
  const scopeText=autumnWatchScope==="all"?"全旅程":"今天";
  box.innerHTML=`<div class="autumn-watch-head"><div><span class="eyebrow">AUTUMN WATCH</span><b>紅葉・銀杏觀測</b><small>${esc(scopeText)}・${esc(autumnSummary(spots))}${autumnWatchScope==="all"?`・依${esc(autumnSortLabel())}`:""}</small></div><div class="autumn-scope-toggle"><button type="button" class="${autumnWatchScope==="day"?"active":""}" data-autumn-scope="day">今天</button><button type="button" class="${autumnWatchScope==="all"?"active":""}" data-autumn-scope="all">全旅程</button></div></div>${autumnWatchScope==="all"?`<div class="autumn-sort-row"><span>總覽排序</span><div class="autumn-sort-control"><button type="button" class="${autumnSortMode==="priority"?"active":""}" data-autumn-sort="priority">優先級</button><button type="button" class="${autumnSortMode==="date"?"active":""}" data-autumn-sort="date">日期</button><button type="button" class="${autumnSortMode==="status"?"active":""}" data-autumn-sort="status">狀態</button><button type="button" class="${autumnSortMode==="stale"?"active":""}" data-autumn-sort="stale">待更新</button></div></div>`:""}${allUnknown&&autumnWatchScope==="day"?`<div class="autumn-first-use-art"><img src="./nov_empty_autumnwatch.webp?v=160" alt="尚未設定紅葉狀態"></div>`:""}${spots.length?`<div class="autumn-watch-list">${spots.map(s=>{
    const rec=autumnStatusRecord(s.id),status=rec.status,meta=AUTUMN_STATUS_META[status]||AUTUMN_STATUS_META.unknown;
    const priority=AUTUMN_PRIORITY[s.id]||"—",days=autumnDaysForSpot(s.id).map(n=>`D${n}`).join("・");
    return `<div class="autumn-watch-item"><button type="button" class="autumn-watch-row status-${esc(status)}" data-autumn-open="${esc(s.id)}"><span class="autumn-state-thumb"><img src="${esc(meta.image)}" alt="${esc(meta.label)}"></span><span class="autumn-copy"><span class="autumn-title-line"><b>${esc(s.label)}</b><i class="priority-${esc(priority.replace('+','p'))}">${esc(priority)}</i>${days?`<i class="autumn-day-badge">${esc(days)}</i>`:""}</span>${s.note?`<small>${esc(s.note)}</small>`:""}${rec.note?`<small class="autumn-personal-note">備註：${esc(rec.note)}</small>`:""}<small class="autumn-updated">最後確認：${esc(autumnUpdatedText(rec.updatedAt))}・${esc(autumnSpotVerdict(s.id))}</small></span><em>${meta.icon} ${esc(meta.label)}</em></button><div class="autumn-source-row">${autumnSourceLinks(s,{compact:true})}<button type="button" data-autumn-open="${esc(s.id)}">更新狀態</button></div></div>`;
  }).join("")}</div>`:`<div class="autumn-no-day"><b>今天沒有紅葉觀測點</b><button type="button" data-autumn-scope="all">查看全旅程紅葉雷達</button></div>`}`;
}
function openAutumnEditor(id){
  const spot=autumnSpotById(id),modal=$("#autumnModal");if(!spot||!modal)return;
  activeAutumnId=id;
  const rec=autumnStatusRecord(id);autumnDraftStatus=rec.status;
  const src=AUTUMN_SOURCE_META[id]||{};
  $("#autumnModalTitle").textContent=spot.label;
  $("#autumnModalMeta").textContent=`${AUTUMN_PRIORITY[id]||"—"} 級・${autumnDaysForSpot(id).map(n=>`D${n}`).join(" / ")||"旅程觀測"}`;
  $("#autumnModalNote").value=rec.note||"";
  $("#autumnModalUpdated").textContent=`最後確認：${autumnUpdatedText(rec.updatedAt)}`;
  $("#autumnModalBaseline").textContent=src.baseline||spot.note||"以現場與當季官方情報為準。";
  $("#autumnModalSources").innerHTML=`${src.official?`<a target="_blank" rel="noopener" href="${esc(src.official)}">↗ ${esc(src.officialLabel||"官方情報")}</a>`:""}<a target="_blank" rel="noopener" href="${googleSearch(`${spot.label} 紅葉 2026`)}">↗ 搜尋 2026 最新情報</a><a target="_blank" rel="noopener" href="${mapSearch(spot.label)}">↗ Google Maps / 最近照片</a>`;
  $$("#autumnModal [data-autumn-status-choice]").forEach(btn=>btn.classList.toggle("active",btn.dataset.autumnStatusChoice===autumnDraftStatus));
  modal.showModal();
}
function closeAutumnEditor(){const modal=$("#autumnModal");if(modal?.open)modal.close();activeAutumnId=""}
async function saveAutumnEditor(){
  if(!activeAutumnId)return;
  const note=String($("#autumnModalNote")?.value||"").trim();
  const record={status:autumnDraftStatus||"unknown",note,updatedAt:Date.now()};
  state.autumnStatus={...(state.autumnStatus||{}),[activeAutumnId]:record};
  saveLocal("autumnStatus",state.autumnStatus);
  renderAutumnWatch(TRIP.days[state.dayIndex]);
  if(state.cloud){try{await updateCloud("autumnStatus",activeAutumnId,record)}catch{toast("已存本機，雲端稍後同步")}}
  closeAutumnEditor();toast("紅葉狀態已更新");
}
function renderOfficialStatus(day){
  const box=$("#officialStatusArea");if(!box)return;
  const items=OFFICIAL_STATUS_BY_DAY[state.dayIndex]||[];
  box.hidden=!items.length;if(!items.length){box.innerHTML="";return}
  box.innerHTML=`<div class="official-status-head"><div><span class="eyebrow">OFFICIAL LIVE</span><b>官方即時狀態</b></div><small>需網路・以官方頁面為準</small></div><div class="official-status-list">${items.map(x=>{
    const selected=x.decisionId?selectedDecision(x.decisionId):"";
    const decision=x.decisionId?TRIP.decisions.find(d=>d.id===x.decisionId):null;
    const selectedLabel=decision?.options?.find(o=>o.id===selected)?.label||selected;
    const decisionText=selected?`目前行程已選：${selectedLabel}`:"尚未做行程選擇";
    return `<article class="official-status-item"><span class="official-status-icon">${esc(x.icon)}</span><div class="official-status-copy"><b>${esc(x.title)}</b><span>${esc(x.label)}</span><small>${esc(x.hint)}</small>${x.decisionId?`<em>${esc(decisionText)}</em>`:""}</div><div class="official-status-actions"><a rel="noopener" href="${esc(x.url)}">查看官方 ↗</a>${x.phone?`<a class="secondary" href="tel:${esc(x.phone)}">☎ 電話確認</a>`:""}</div></article>`;
  }).join("")}</div>`;
}

function renderDayBrief(day){
  const box=$("#dayBrief");
  if(!box) return;
  const alertHtml=day.alert?`<div class="day-alert">${esc(day.alert)}</div>`:"";
  const items=(day.brief||[]).map(x=>`<li>${esc(x)}</li>`).join("");
  const rainHtml=day.rainPlan?`<div class="rain-plan"><b>☔ 雨天備案</b><span>${esc(day.rainPlan)}</span></div>`:"";
  const hasContent=!!(day.alert||items||day.rainPlan);
  box.innerHTML=hasContent
    ? `<div class="day-brief-head-v44"><div class="brief-title">今日提醒</div></div>${alertHtml}${items?`<ul>${items}</ul>`:""}${rainHtml}`
    : "";
  box.classList.toggle("empty-brief",!hasContent);
}
function renderEventExtras(e){
  const chips=[
    e.status?`<span class="info-chip">${esc(e.status)}</span>`:"",
    e.duration?`<span class="info-chip soft">⏱ ${esc(e.duration)}</span>`:""
  ].filter(Boolean).join("");
  const tips=(e.tips||[]).map(t=>`<li>${esc(t)}</li>`).join("");
  const links=(e.links||[]).map(l=>`<a class="mini-action-link" target="_blank" rel="noopener" href="${esc(l.url)}">↗ ${esc(l.label)}</a>`).join("");
  return `${chips?`<div class="event-info-row">${chips}</div>`:""}${tips?`<div class="event-tips"><b>提醒</b><ul>${tips}</ul></div>`:""}${e.backup?`<div class="backup-box"><b>備案</b><span>${esc(e.backup)}</span></div>`:""}${links?`<div class="event-link-row">${links}</div>`:""}`;
}


function selectedDecision(id){
  return state.decisions[id] || "";
}
function draftDecision(id){return state.decisionDrafts?.[id]||""}
function renderDecisionArea(){
  const d=TRIP.days[state.dayIndex];
  const area=$("#decisionArea");if(area)area.innerHTML=renderDecisionCards(d);
}
function stageDecision(id,option){
  state.decisionDrafts=state.decisionDrafts||{};
  if(state.decisionDrafts[id]===option)delete state.decisionDrafts[id];
  else state.decisionDrafts[id]=option;
  renderDecisionArea();
}
async function chooseDecision(id, option){
  if(!option)return;
  state.decisions[id]=option;
  if(state.decisionDrafts)delete state.decisionDrafts[id];
  saveLocal("decisions",state.decisions);
  if(state.cloud){try{await setCloud("decisions",state.decisions)}catch{}}
  renderSchedule();
  toast("行程選擇已更新");
}
async function confirmDecision(id){
  const draft=draftDecision(id);if(!draft){toast("先點一個選項，再按確認");return}
  await chooseDecision(id,draft);
}
async function clearDecision(id){
  const had=!!state.decisions[id]||!!draftDecision(id);
  delete state.decisions[id];if(state.decisionDrafts)delete state.decisionDrafts[id];
  saveLocal("decisions",state.decisions);
  if(state.cloud){try{await setCloud("decisions",state.decisions)}catch{}}
  renderSchedule();
  if(had)toast("已清除選擇，可以晚點再決定");
}
const DECISION_ART={
  "d4-beppu-weather":{
    ropeway:"./nov_decision_d4_ropeway.webp?v=160",
    chill:"./nov_decision_d4_chill.webp?v=160"
  },
  "d5-autumn-route":{
    autumn:"./nov_decision_d5_autumn.webp?v=160",
    chill:"./nov_decision_d5_chill.webp?v=160"
  },
  "d7-crater":{
    open:"./nov_decision_d7_crater_open.webp?v=160",
    closed:"./nov_decision_d7_museum.webp?v=160"
  }
};
function decisionArt(decisionId,optionId){return DECISION_ART[decisionId]?.[optionId]||""}
function decisionVisible(d){
  if(!d?.parentDecisionId)return true;
  return selectedDecision(d.parentDecisionId)===d.parentOptionId;
}
function renderDecisionCards(day){
  const ids=day.decisionIds||[];
  if(!ids.length)return "";
  return `<div class="decision-stack">${ids.map(id=>{
    const d=TRIP.decisions.find(x=>x.id===id); if(!d||!decisionVisible(d))return "";
    const selected=selectedDecision(id), draft=draftDecision(id);
    const selectedLabel=d.options.find(o=>o.id===selected)?.label||"";
    const draftLabel=d.options.find(o=>o.id===draft)?.label||"";
    const checklist=(d.checklist||[]).length?`<div class="decision-checks">${d.checklist.map(x=>`<div>□ ${esc(x)}</div>`).join("")}</div>`:"";
    return `<section class="decision-card">
      <div class="decision-kicker">行程選擇</div>
      <h3>${esc(d.title)}</h3>
      <p>${esc(d.hint||"")}</p>
      ${checklist}
      <div class="decision-options">${d.options.map(o=>{
        const isDraft=draft===o.id,isConfirmed=selected===o.id&&!draft;
        const art=decisionArt(d.id,o.id);
        return `<button class="decision-option ${art?"has-art":""} ${isDraft?"draft":isConfirmed?"selected":""}" data-decision-id="${esc(d.id)}" data-decision-option="${esc(o.id)}">
          ${art?`<span class="decision-option-art"><img src="${esc(art)}" alt="${esc(o.label)}" loading="lazy"></span>`:""}
          <span class="decision-option-copy"><span class="decision-icon">${esc(o.icon||"→")}</span><span class="decision-option-text"><b>${esc(o.label)}</b><small>${esc(o.detail||"")}</small></span><em>${isDraft?"暫選":isConfirmed?"已確認":"選擇"}</em></span>
        </button>`}).join("")}
      </div>
      <div class="decision-confirm-row">
        <button type="button" class="decision-confirm-btn" data-decision-confirm="${esc(d.id)}" ${draft?"":"disabled"}>確認${draftLabel?`「${esc(draftLabel)}」`:"選擇"}</button>
        <button type="button" class="decision-clear-btn" data-decision-clear="${esc(d.id)}">${selected||draft?"先不決定／清除":"先不決定"}</button>
      </div>
      <div class="decision-state-text">${draft?`目前只是暫選「${esc(draftLabel)}」，尚未套用到行程。`:selected?`目前已確認「${esc(selectedLabel)}」，仍可清除或改選。`:"點選選項只會暫選；按下確認後才會套用行程。"}</div>
    </section>`;
  }).join("")}</div>`;
}
function eventVisible(e){
  if(e.parentDecisionId&&selectedDecision(e.parentDecisionId)!==e.parentOptionId)return false;
  if(!e.decisionId)return true;
  const selected=selectedDecision(e.decisionId);
  return selected ? selected===e.optionId : false;
}

function renderDays(){
  $("#dayStrip").innerHTML=TRIP.days.map((d,i)=>`
    <button class="day-btn ${i===state.dayIndex?"active":""}" data-day="${i}">
      <span class="weekday">週${"日一二三四五六"[new Date(d.date+"T00:00:00+09:00").getDay()]}</span><span class="date">${d.shortDate.slice(3)}</span><span class="d">D${i+1}</span>
    </button>`).join("");
  const active=$("#dayStrip .active"); if(active) active.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
}
function mapDirections(q){return mapSearch(q)}
function hotelForDay(index){
  const explicit=TRIP.days?.[index]?.hotel;
  if(explicit?.name && (explicit.nav||explicit.name))return {title:explicit.name,nav:explicit.nav||explicit.name};
  let latest=null;
  for(let i=0;i<=index;i++){
    for(const e of (TRIP.days?.[i]?.events||[])){
      const title=String(e.title||""), category=String(e.category||"");
      if(category.includes("住宿") && e.nav && !/退房|Check[- ]?out|起床|整理/i.test(title)){
        latest={title,nav:e.nav};
      }
    }
  }
  return latest;
}
function cleanHotelTitle(title){
  return String(title||"飯店").replace(/\s*(Check[- ]?in|check[- ]?in|入住|放行李).*$/i,"").trim()||"飯店";
}
function renderHotelReturnCard(){
  const box=$("#hotelReturnCard"); if(!box)return;
  const hotel=hotelForDay(state.dayIndex);
  if(!hotel){box.hidden=true;box.innerHTML="";return;}
  const lastDay=state.dayIndex===TRIP.days.length-1;
  const label=lastDay?"返台前據點":"今晚住這裡";
  const help=lastDay?"取行李或需要回住宿時，從這裡直接導航。":"一天走完要回飯店時，不用再往上找地址。";
  box.hidden=false;
  const pdfKey=hotelPdfKey(hotel);
  box.innerHTML=`<div class="hotel-return-copy"><span class="eyebrow">${label}</span><h3>${esc(cleanHotelTitle(hotel.title))}</h3><p>${help}</p><div class="hotel-return-actions"><a class="hotel-nav-btn" target="_blank" rel="noopener" href="${mapDirections(hotel.nav||hotel.title)}">↗ Google Maps 查看飯店</a>${pdfAttachmentControls(pdfKey,cleanHotelTitle(hotel.title))}</div><small class="local-pdf-hint">PDF 附件保存在這台裝置，可離線開啟，不會上傳到公開 GitHub。</small></div>`;
}


let activeGuideContext=null;

function guideHash(text=""){
  let h=2166136261;
  for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  return (h>>>0).toString(36);
}
function guideKeyFor(kind,title,dayIndex=state?.dayIndex||0){
  return `${kind}:d${dayIndex+1}:${guideHash(title||kind)}`;
}
function guideEntries(){
  const raw=TRIP?.guides;
  if(Array.isArray(raw))return raw.filter(Boolean).map((g,i)=>({...g,_guideId:g?._guideId||g?.id||g?.key||`guide-${i}`}));
  if(raw&&typeof raw==="object")return Object.entries(raw).filter(([,g])=>!!g).map(([id,g])=>({...g,_guideId:g?._guideId||g?.id||id}));
  return [];
}
function guideMatchScore(entry,dayIndex,text){
  if(Number(entry?.day||0) && Number(entry.day)!==dayIndex+1)return -1;
  const hay=String(text||"").toLowerCase();
  const terms=(Array.isArray(entry?.match)?entry.match:[entry?.match]).filter(Boolean).map(x=>String(x).toLowerCase());
  const excludes=(Array.isArray(entry?.exclude)?entry.exclude:[entry?.exclude]).filter(Boolean).map(x=>String(x).toLowerCase());
  if(excludes.some(t=>hay.includes(t)))return -1;
  if(!terms.length)return Number(entry?.priority||0);
  const hits=terms.filter(t=>hay.includes(t));
  if(!hits.length)return -1;
  const specificity=Math.max(...hits.map(t=>t.length));
  return Number(entry?.priority||0)*1000 + specificity*10 + hits.length;
}
function privateGuideForEvent(e){
  const text=[e?.title,e?.nav,e?.category,e?.note,e?.status].filter(Boolean).join(" ");
  return guideEntries()
    .filter(g=>g.type!=="day")
    .map(g=>({g,score:guideMatchScore(g,state.dayIndex,text)}))
    .filter(x=>x.score>=0)
    .sort((a,b)=>b.score-a.score)[0]?.g||null;
}
function privateGuideForDay(){
  return guideEntries().find(g=>g.type==="day"&&Number(g.day)===state.dayIndex+1)||null;
}
function normalizeGuideSections(sections=[]){
  return (Array.isArray(sections)?sections:[]).map(s=>({
    label:String(s?.label||"小提醒"),
    items:(Array.isArray(s?.items)?s.items:[s?.items]).filter(Boolean).map(String)
  })).filter(s=>s.items.length);
}
function fallbackEventSections(e){
  const sections=[];
  const summary=[e?.time,e?.category,e?.status,e?.duration].filter(Boolean).join(" · ");
  if(summary)sections.push({label:"這一站",items:[summary]});
  if(e?.note)sections.push({label:"備忘",items:[e.note]});
  if(Array.isArray(e?.tips)&&e.tips.length)sections.push({label:"注意事項",items:e.tips});
  if(e?.backup)sections.push({label:"Plan B",items:[e.backup]});
  return sections;
}
function buildEventGuide(e){
  const saved=privateGuideForEvent(e);
  const sections=[...normalizeGuideSections(saved?.sections),...fallbackEventSections(e)];
  const unique=[]; const seen=new Set();
  for(const s of sections){
    const key=`${s.label}:${s.items.join("|")}`;
    if(!seen.has(key)){seen.add(key);unique.push(s)}
  }
  const legacyKey=guideKeyFor("event",e?.title||"行程");
  const stableKey=saved?._guideId||saved?.id||legacyKey;
  return {
    kind:"event",
    key:stableKey,
    legacyKey:stableKey===legacyKey?"":legacyKey,
    title:saved?.title||e?.title||"行程攻略",
    meta:`D${state.dayIndex+1} · ${e?.time||TRIP.days[state.dayIndex]?.shortDate||""}`,
    sections:unique.length?unique:[{label:"這一站",items:["目前沒有額外攻略；你可以先把自己的備忘存進下方。"]}],
    map:saved?.map||e?.nav||e?.title||"",
    searches:Array.isArray(saved?.searches)?saved.searches:[],
    links:[...(Array.isArray(saved?.links)?saved.links:[]),...(Array.isArray(e?.links)?e.links:[])]
      .filter((x,i,a)=>x?.url&&a.findIndex(y=>y?.url===x.url)===i)
  };
}
function buildDayGuide(){
  const d=TRIP.days[state.dayIndex];
  const saved=privateGuideForDay();
  const sections=[...normalizeGuideSections(saved?.sections)];
  if(d?.alert)sections.push({label:"今天先注意",items:[d.alert]});
  if(Array.isArray(d?.brief)&&d.brief.length)sections.push({label:"今日提醒",items:d.brief});
  if(d?.rainPlan)sections.push({label:"雨天備案",items:[d.rainPlan]});
  if(!sections.length)sections.push({label:"今日總覽",items:[d?.subtitle||d?.title||"今天慢慢玩就好。"]});
  const legacyKey=guideKeyFor("day",d?.title||`D${state.dayIndex+1}`);
  const stableKey=saved?._guideId||saved?.id||legacyKey;
  return {
    kind:"day",key:stableKey,legacyKey:stableKey===legacyKey?"":legacyKey,
    title:saved?.title||`D${state.dayIndex+1} ${d?.title||"今日攻略"}`,
    meta:`${d?.shortDate||""} · 今日總攻略`,
    sections,map:saved?.map||"",searches:Array.isArray(saved?.searches)?saved.searches:[],
    links:Array.isArray(saved?.links)?saved.links:[]
  };
}
function renderGuideSections(sections){
  return sections.map(s=>`<section class="guide-section"><h4>${esc(s.label)}</h4><ul>${s.items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>`).join("");
}
function setGuideSaveStatus(text,status="idle"){
  const el=$("#guideSaveStatus");if(!el)return;
  el.textContent=text;el.dataset.state=status;
}
function guideNoteRecord(key){return normalizeGuideNoteRecord(state?.guideNotes?.[key])}
function guideNoteText(key){const rec=guideNoteRecord(key);return rec&&!rec.deleted?rec.text:""}
function persistGuideNotesLocal(){
  saveLocal("guideNotes",state.guideNotes||{});
  saveLocal("guideNotePending",state.guideNotePending||{});
}
function migrateLegacyGuideNote(data){
  if(!data?.key||!data?.legacyKey||state.guideNotes?.[data.key])return;
  const legacy=guideNoteRecord(data.legacyKey);if(!legacy||legacy.deleted||!legacy.text)return;
  state.guideNotes[data.key]={...legacy};
  state.guideNotePending=data?._cloudStableExists?state.guideNotePending:{...(state.guideNotePending||{}),[data.key]:legacy.updatedAt||1};
  persistGuideNotesLocal();
}
function markGuideNoteLocal(key,text){
  if(!key)return null;
  const now=Date.now();
  const record={text:String(text||""),updatedAt:now,deviceId:guideDeviceId(),deleted:!String(text||"").trim()};
  state.guideNotes=state.guideNotes||{};
  state.guideNotePending=state.guideNotePending||{};
  state.guideNotes[key]=record;
  state.guideNotePending[key]=now;
  persistGuideNotesLocal();
  return record;
}
function activeGuideMatches(key){return !!activeGuideContext&&activeGuideContext.key===key}
async function syncGuideNoteByKey(key,{showStatus=true}={}){
  if(!key||!state?.guideNotes?.[key])return false;
  const record=normalizeGuideNoteRecord(state.guideNotes[key]);if(!record)return false;
  if(!state.cloud||!navigator.onLine){
    if(showStatus&&activeGuideMatches(key))setGuideSaveStatus("已存本機・等待網路同步","pending");
    return false;
  }
  const expectedAt=record.updatedAt;
  try{
    await updateCloud("guideNotes",key,record);
    const current=normalizeGuideNoteRecord(state.guideNotes[key]);
    if(current&&current.updatedAt===expectedAt){
      delete state.guideNotePending[key];persistGuideNotesLocal();
      if(showStatus&&activeGuideMatches(key))setGuideSaveStatus("✓ 雲端同步完成","synced");
    }else if(showStatus&&activeGuideMatches(key)){
      setGuideSaveStatus("有較新的修改・同步中…","pending");
      queueGuideNoteSync(key,160);
    }
    return true;
  }catch(err){
    state.cloud=false;
    $("#syncPill")?.classList.remove("cloud");
    if($("#syncText"))$("#syncText").textContent="同步暫停・稍後重試";
    if(showStatus&&activeGuideMatches(key))setGuideSaveStatus("已存本機・等待重新同步","pending");
    if(navigator.onLine)setTimeout(()=>resumeCloudAfterOnline(),1800);
    return false;
  }
}
function queueGuideNoteSync(key,delay=800){
  clearTimeout(state.guideNoteTimer);
  state.guideNoteTimer=setTimeout(()=>syncGuideNoteByKey(key),delay);
}
async function flushGuideNoteEditor({sync=true}={}){
  if(!activeGuideContext)return;
  const area=$("#guideNoteArea");if(!area)return;
  const key=activeGuideContext.key;
  const current=guideNoteText(key);
  if(area.value!==current)markGuideNoteLocal(key,area.value);
  if(sync)await syncGuideNoteByKey(key);
}
function mergeGuideNotesFromCloud(raw,{syncPending=true}={}){
  const remote=normalizeGuideNotesMap(raw);
  const local=state.guideNotes||{};
  const pending=state.guideNotePending||{};
  const keys=new Set([...Object.keys(local),...Object.keys(remote)]);
  for(const key of keys){
    const l=normalizeGuideNoteRecord(local[key]);
    const r=normalizeGuideNoteRecord(remote[key]);
    if(pending[key]){
      if(r&&r.updatedAt>Number(l?.updatedAt||0)){
        local[key]=r;delete pending[key];
      }else if(r&&l&&r.updatedAt===l.updatedAt&&r.deviceId===l.deviceId){
        local[key]=r;delete pending[key];
      }
      continue;
    }
    if(r&&(!l||r.updatedAt>=l.updatedAt))local[key]=r;
    else if(l&&!r&&l.updatedAt>0)pending[key]=l.updatedAt;
    else if(l&&r&&l.updatedAt>r.updatedAt)pending[key]=l.updatedAt;
  }
  state.guideNotes=local;state.guideNotePending=pending;persistGuideNotesLocal();
  if(activeGuideContext&&document.activeElement!==$("#guideNoteArea")){
    const area=$("#guideNoteArea");if(area)area.value=guideNoteText(activeGuideContext.key);
  }
  if(activeGuideContext){
    const key=activeGuideContext.key;
    if(pending[key])setGuideSaveStatus("已存本機・等待同步","pending");
    else setGuideSaveStatus(guideNoteText(key)?"✓ 雲端同步完成":"已開啟自動儲存","synced");
  }
  if(syncPending)syncPendingGuideNotes();
}
async function syncPendingGuideNotes(){
  if(!state||state.guideNoteSyncing||!state.cloud||!navigator.onLine)return;
  state.guideNoteSyncing=true;
  try{
    for(const key of Object.keys(state.guideNotePending||{})){
      if(!state.cloud||!navigator.onLine)break;
      await syncGuideNoteByKey(key,{showStatus:activeGuideMatches(key)});
    }
  }finally{state.guideNoteSyncing=false}
}
function openGuide(data){
  const modal=$("#guideModal"); if(!modal||!data)return;
  activeGuideContext=data;
  migrateLegacyGuideNote(data);
  $("#guideTitle").textContent=data.title;
  $("#guideMeta").textContent=data.meta||"";
  $("#guideSections").innerHTML=renderGuideSections(data.sections||[]);
  const note=guideNoteText(data.key);
  $("#guideNoteArea").value=note;
  if(state.guideNotePending?.[data.key])setGuideSaveStatus("已存本機・等待同步","pending");
  else if(note)setGuideSaveStatus(state.cloud?"✓ 雲端同步完成":"本機已有備忘","synced");
  else setGuideSaveStatus("已開啟自動儲存",state.cloud?"synced":"idle");
  const acts=[];
  if(data.map)acts.push(`<a class="guide-action primary" target="_blank" rel="noopener" href="${mapSearch(data.map)}">Google Maps 搜尋 ↗</a>`);
  for(const s of data.searches||[])if(s?.query)acts.push(`<a class="guide-action" target="_blank" rel="noopener" href="${mapSearch(s.query)}">${esc(s.label||"搜尋")} ↗</a>`);
  for(const l of data.links||[])if(l?.url)acts.push(`<a class="guide-action" target="_blank" rel="noopener" href="${esc(l.url)}">${esc(l.label||"開啟連結")} ↗</a>`);
  $("#guideActions").innerHTML=acts.join("");
  modal.showModal();
}
async function closeGuide(){
  await flushGuideNoteEditor({sync:true});
  const m=$("#guideModal");if(m?.open)m.close();activeGuideContext=null;
}
async function saveGuideNote(){
  if(!activeGuideContext)return;
  const area=$("#guideNoteArea");if(!area)return;
  markGuideNoteLocal(activeGuideContext.key,area.value);
  setGuideSaveStatus(state.cloud?"同步中…":"已存本機・等待網路同步",state.cloud?"saving":"pending");
  await syncGuideNoteByKey(activeGuideContext.key);
}
function bindSafeHold(el,handler,{ms=750,move=10,allowInteractiveRoot=false}={}){
  if(!el||el.dataset.safeHoldBound==="1")return;
  el.dataset.safeHoldBound="1";el.classList.add("guide-hold-target");
  let timer=null,startX=0,startY=0,startScroll=0,pointerId=null,ready=false,cancelled=false,suppressClick=false;
  const clear=()=>{clearTimeout(timer);timer=null;ready=false;cancelled=true;el.classList.remove("guide-pressing","guide-ready")};
  el.addEventListener("pointerdown",e=>{
    if(e.button!==undefined&&e.button!==0)return;
    const interactive=e.target.closest?.("a,button,input,textarea,select,label,[data-no-guide-hold]");
    if(interactive&&!(allowInteractiveRoot&&interactive===el))return;
    startX=e.clientX;startY=e.clientY;startScroll=window.scrollY;pointerId=e.pointerId;ready=false;cancelled=false;suppressClick=false;
    el.classList.add("guide-pressing");
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(cancelled||Math.abs(window.scrollY-startScroll)>6)return clear();
      ready=true;el.classList.remove("guide-pressing");el.classList.add("guide-ready");
      try{navigator.vibrate?.(12)}catch{}
    },ms);
  },{passive:true});
  el.addEventListener("pointermove",e=>{
    if(pointerId!==e.pointerId||cancelled)return;
    const dist=Math.hypot(e.clientX-startX,e.clientY-startY);
    if(dist>move||Math.abs(window.scrollY-startScroll)>6)clear();
  },{passive:true});
  el.addEventListener("pointerup",e=>{
    if(pointerId!==e.pointerId)return;
    clearTimeout(timer);timer=null;
    const ok=ready&&!cancelled&&Math.hypot(e.clientX-startX,e.clientY-startY)<=move&&Math.abs(window.scrollY-startScroll)<=6;
    el.classList.remove("guide-pressing","guide-ready");ready=false;cancelled=true;pointerId=null;
    if(ok){suppressClick=true;handler(e);setTimeout(()=>suppressClick=false,350)}
  },{passive:true});
  ["pointercancel","pointerleave"].forEach(ev=>el.addEventListener(ev,clear,{passive:true}));
  el.addEventListener("click",e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false}},true);
  // iOS Safari otherwise highlights itinerary text blue or opens the callout while holding.
  el.addEventListener("contextmenu",e=>e.preventDefault());
  el.addEventListener("selectstart",e=>e.preventDefault());
  el.addEventListener("dragstart",e=>e.preventDefault());
}

function bindGuideTargets(visibleEvents=[]){
  $$("#timeline .event-card").forEach((card,i)=>bindSafeHold(card,()=>openGuide(buildEventGuide(visibleEvents[i]))));
  const dayScene=$("#daySceneCard");if(dayScene)bindSafeHold(dayScene,()=>openGuide(buildDayGuide()),{allowInteractiveRoot:true});
}

function renderSchedule(){
  const d=TRIP.days[state.dayIndex];
  $("#dayNumber").textContent=`D${state.dayIndex+1}`;
  $("#dayTitle").textContent=d.title;
  $("#daySubtitle").textContent=d.subtitle;
  const meta=$("#dayTitleMeta");
  if(meta) meta.innerHTML=`<span class="day-meta-pill">D${state.dayIndex+1}</span><span class="day-meta-text">${d.shortDate}</span><span class="day-meta-text">今日主圖</span>`;
  renderDayBrief(d);
  renderNowNext(d);
  renderFamilyMeta(d);
  renderDrivingCard(d);
  renderOfficialStatus(d);
  renderAutumnWatch(d);
  renderDailyScene();
  $("#decisionArea").innerHTML=renderDecisionCards(d);
  const visibleEvents=d.events.filter(eventVisible);
  $("#timeline").innerHTML=visibleEvents.map((e,i)=>`
    <article class="event">
      <span class="event-dot"></span>
      ${i>0 && e.travel?`<div class="travel">${esc(e.transport||"→")} ${esc(e.travel)}</div>`:""}
      <div class="event-card" data-guide-enabled="1">
        <div class="event-top"><h3 class="event-title">${esc(e.title)}</h3><span class="tag">${esc(e.category||"行程")}</span></div>
        <div class="event-time">${esc(e.time)}</div>
        ${renderEventExtras(e)}
        ${e.note?`<div class="event-note">${esc(e.note)}</div>`:""}
        ${e.noNav?"":`<div class="event-footer"><a class="nav-link" target="_blank" rel="noopener" href="${mapNav(e.nav||e.title,weatherMode(e))}">↗ Google Maps 查看</a></div>`}
      </div>
    </article>`).join("");
  renderHotelReturnCard();
  renderWeather(d);
  requestAnimationFrame(()=>bindGuideTargets(visibleEvents));
}
const WEATHER_CACHE_KEY=`${APP_NAMESPACE}:weather-cache`;
const WEATHER_CACHE_TTL=30*60*1000;
const WA_WEATHER_ART={
  sunny:"./nov_weather_sunny.webp?v=160",
  cloudy:"./nov_weather_cloudy.webp?v=160",
  rain:"./nov_weather_rainy.webp?v=160",
  storm:"./nov_weather_storm.webp?v=160",
  snow:"./nov_weather_snow.webp?v=160"
};
function renderWeatherVisual(icon,artKey,alt=""){
  const el=$("#weatherIcon"); if(!el)return;
  const isWa=document.documentElement.dataset.theme==="wa";
  if(isWa&&artKey&&WA_WEATHER_ART[artKey]){
    el.classList.add("has-wa-weather-art");
    el.innerHTML=`<img class="wa-weather-art" src="${WA_WEATHER_ART[artKey]}" alt="${esc(alt||"天氣插畫")}">`;
  }else{
    el.classList.remove("has-wa-weather-art");
    el.textContent=icon||"☁️";
  }
}

function weatherCodeMeta(code){
  const c=Number(code);
  if(c===0)return {icon:"☀️",desc:"晴",art:"sunny"};
  if([1,2].includes(c))return {icon:"🌤️",desc:c===1?"大致晴朗":"局部多雲",art:"sunny"};
  if(c===3)return {icon:"☁️",desc:"多雲",art:"cloudy"};
  if([45,48].includes(c))return {icon:"🌫️",desc:"霧",art:"cloudy"};
  if([51,53,55,56,57].includes(c))return {icon:"🌦️",desc:"毛毛雨",art:"rain"};
  if([61,63,65,66,67,80,81,82].includes(c))return {icon:"🌧️",desc:"有雨",art:"rain"};
  if([71,73,75,77,85,86].includes(c))return {icon:"🌨️",desc:"有雪",art:"snow"};
  if([95,96,99].includes(c))return {icon:"⛈️",desc:"雷雨",art:"storm"};
  return {icon:"☁️",desc:"天氣變化",art:"cloudy"};
}
function isoDayDiff(a,b){
  const ms=Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms/86400000);
}
function readWeatherCache(key){
  try{const all=JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY)||"{}");return all[key]||null}catch{return null}
}
function writeWeatherCache(key,data){
  try{
    const all=JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY)||"{}");
    all[key]={fetchedAt:Date.now(),data};
    const entries=Object.entries(all).sort((a,b)=>(b[1]?.fetchedAt||0)-(a[1]?.fetchedAt||0)).slice(0,20);
    localStorage.setItem(WEATHER_CACHE_KEY,JSON.stringify(Object.fromEntries(entries)));
  }catch{}
}
function rainGroupsForDate(hourly,date,threshold=30){
  const times=hourly?.time||[], probs=hourly?.precipitation_probability||[];
  const hits=[];
  for(let i=0;i<times.length;i++)if(String(times[i]).startsWith(date)&&Number(probs[i]||0)>=threshold)hits.push({time:String(times[i]).slice(11,16),prob:Number(probs[i]||0),idx:i});
  const groups=[];
  for(const h of hits){
    const prev=groups.at(-1);
    if(prev&&h.idx===prev.lastIdx+1){prev.end=h.time;prev.lastIdx=h.idx;prev.maxProb=Math.max(prev.maxProb,h.prob)}
    else groups.push({start:h.time,end:h.time,lastIdx:h.idx,maxProb:h.prob});
  }
  return groups.map(g=>{
    const [hh,mm]=g.end.split(":").map(Number); const endH=(hh+1)%24;
    return {start:g.start,end:`${String(endH).padStart(2,"0")}:${String(mm).padStart(2,"0")}`,maxProb:g.maxProb};
  });
}
async function getWeather(day){
  const loc=day.weather;
  if(!loc||!Number.isFinite(Number(loc.lat))||!Number.isFinite(Number(loc.lon)))return {state:"not-ready",message:"此日尚未設定天氣座標"};
  const today=japanToday(), diff=isoDayDiff(today,day.date);
  if(diff<0)return {state:"not-ready",message:"此旅行日期已結束"};
  if(diff>15)return {state:"not-ready",message:"尚未進入 16 日預報範圍"};
  const key=`${Number(loc.lat).toFixed(3)},${Number(loc.lon).toFixed(3)}:${day.date}`;
  const cached=readWeatherCache(key);
  if(cached&&Date.now()-Number(cached.fetchedAt||0)<WEATHER_CACHE_TTL)return cached.data;
  const url=new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude",loc.lat);
  url.searchParams.set("longitude",loc.lon);
  url.searchParams.set("current","temperature_2m,weather_code");
  url.searchParams.set("hourly","precipitation_probability,weather_code");
  url.searchParams.set("daily","weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("timezone",TRIP?.timezone||"Asia/Tokyo");
  url.searchParams.set("forecast_days","16");
  try{
    const res=await fetch(url.toString(),{cache:"no-store"});
    if(!res.ok)throw new Error(`Weather ${res.status}`);
    const raw=await res.json();
    const i=(raw.daily?.time||[]).indexOf(day.date);
    if(i<0)return {state:"not-ready",message:"尚未取得這一天的正式預報"};
    const meta=weatherCodeMeta(raw.daily.weather_code?.[i]);
    const data={
      state:"forecast", icon:meta.icon, desc:meta.desc, art:meta.art,
      current:diff===0&&Number.isFinite(Number(raw.current?.temperature_2m))?Math.round(Number(raw.current.temperature_2m)):null,
      high:Math.round(Number(raw.daily.temperature_2m_max?.[i])),
      low:Math.round(Number(raw.daily.temperature_2m_min?.[i])),
      rainMax:Math.round(Number(raw.daily.precipitation_probability_max?.[i]||0)),
      rainGroups:rainGroupsForDate(raw.hourly,day.date),
      location:loc.label||day.location||"天氣"
    };
    writeWeatherCache(key,data);return data;
  }catch(err){
    if(cached?.data)return {...cached.data,stale:true};
    throw err;
  }
}

async function renderWeather(d){
  const card=$("#weatherCard");card.classList.add("skeleton");card.classList.remove("weather-no-forecast");
  card.dataset.preview='0';
  $("#weatherLocation").textContent=(d.weather?.label||d.location)+" · "+d.shortDate;
  $("#weatherTemp").textContent="載入中";
  $("#weatherDesc").textContent="正在取得旅行日期預報";
  renderWeatherVisual("☁️","cloudy","旅行天氣預報等待中");$("#rainBox").innerHTML=""; setWeatherModeHint('');
  if(typeof getWeather!=="function"){
    const preview=weatherPreviewMeta();
    card.classList.add("weather-no-forecast");
    card.dataset.preview='1';
    $("#weatherTemp").textContent="—";
    $("#weatherDesc").textContent="預覽模式 · 尚未進入正式預報";
    renderWeatherVisual(preview.icon,preview.art,`${preview.label}預覽插畫`);
    $("#rainBox").textContent="接近旅行日期後再顯示正式天氣資料。";
    setWeatherModeHint(`非實際預報 · 目前 ${preview.label} · 點卡片切換`,true);
    card.classList.remove("skeleton");
    return;
  }
  try{
    const w=await getWeather(d);
    if(w.state!=="forecast"){
      const preview=weatherPreviewMeta();
      card.classList.add("weather-no-forecast");
      card.dataset.preview='1';
      $("#weatherTemp").textContent="—";
      $("#weatherDesc").textContent=w.message;
      renderWeatherVisual(preview.icon,preview.art,`${preview.label}預覽插畫`);
        $("#rainBox").innerHTML="進入 16 日預報範圍後，圖片會依實際天氣自動切換晴／陰／雨／雷／雪。";
      setWeatherModeHint(`非實際預報 · 目前 ${preview.label} · 點卡片切換`,true);
    }else{
      card.dataset.preview='0';
      renderWeatherVisual(w.icon,w.art,`${w.desc}天氣插畫`);
      $("#weatherTemp").textContent=w.current!==null?`${w.current}° · ${w.high}° / ${w.low}°`:`${w.high}° / ${w.low}°`;
      $("#weatherDesc").textContent=`${w.desc} · 全日最高降雨機率 ${w.rainMax}%${w.stale?" · 離線快取":""}`;
      setWeatherModeHint('已進入正式預報期 · 依實際天氣自動顯示');
      if(w.rainGroups.length){
        $("#rainBox").innerHTML=w.rainGroups.slice(0,2).map(g=>`<div class="rain-alert">🌧️ 預計 ${g.start}–${g.end} 有雨 · 最高 ${g.maxProb}%</div>`).join("");
      }else {
        $("#rainBox").innerHTML="☂️ 目前預報沒有明顯連續降雨時段。";
      }
    }
  }catch(e){
    const preview=weatherPreviewMeta();
    card.classList.add("weather-no-forecast");
    card.dataset.preview='1';
    $("#weatherTemp").textContent="—";$("#weatherDesc").textContent="天氣暫時無法更新";
    renderWeatherVisual(preview.icon,preview.art,`${preview.label}預覽插畫`);
    $("#rainBox").textContent="保留上次行程資料；網路恢復後重新切換日期即可再抓。";
    setWeatherModeHint(`非實際預報 · 先用 ${preview.label}預覽 · 點卡片切換`,true);
  }finally{card.classList.remove("skeleton")}
}

function renderFood(){
  $("#plannedFood").innerHTML=TRIP.plannedFood.map(i=>`
    <article class="planned-food-card food-plan-card-v46">
      <div class="food-plan-meta-row">
        <span class="food-day-chip">${esc(i.day)}</span>
        <span class="food-time-chip">${esc(i.time)}</span>
        <span class="food-status">${esc(i.status)}</span>
      </div>
      <h4>${esc(i.title)}</h4>
      ${i.detail?`<p class="food-plan-detail">${esc(i.detail)}</p>`:""}
      ${(i.maps||[]).length?`<div class="food-map-row">${i.maps.map((m,idx)=>`<a class="mini-btn" target="_blank" rel="noopener" href="${mapSearch(m)}">地圖${i.maps.length>1?` ${idx+1}`:""} ↗</a>`).join("")}</div>`:""}
    </article>`).join("");
  $("#foodQuick").innerHTML=TRIP.foodQuick.map(f=>`<a target="_blank" rel="noopener" class="food-chip" href="${mapSearch(f.query)}"><span>${f.icon}</span>${esc(f.label)} ↗</a>`).join("");
  $("#foodList").innerHTML=state.foods.length?state.foods.map(i=>`
    <div class="list-item ${i.checked?"checked":""}">
      <div class="list-main"><div><div class="list-title">${esc(i.name)}</div><div class="list-meta">${esc(i.location||"地點未指定")}${i.note?` · ${esc(i.note)}`:""}</div></div>
      <div class="list-actions">
        <a class="mini-btn" target="_blank" href="${mapSearch((i.location||"")+" "+i.name)}">地圖</a>
        <button class="mini-btn check-btn ${i.checked?"done":""}" data-check-food="${i.id}">${i.checked?"✓":"○"}</button>
        <button class="mini-btn" data-delete-food="${i.id}">刪</button>
      </div></div>
    </div>`).join(""):`<div class="empty">還沒有額外想吃清單，右上角 ＋ 可以新增。</div>`;
}
function taskDone(task){
  return Object.prototype.hasOwnProperty.call(state.taskStatus,task.id) ? !!state.taskStatus[task.id] : !!task.defaultDone;
}
function countdownText(task){
  if(!task.deadline)return task.when||"待處理";
  const diff=new Date(task.deadline).getTime()-Date.now();
  if(diff<=0)return "已到處理時間";
  const hours=Math.ceil(diff/3600000);
  const days=Math.floor(hours/24);
  const remain=hours%24;
  if(days>=2)return `還有 ${days} 天`;
  if(days>=1)return `還有 ${days} 天 ${remain} 小時`;
  return `還有 ${hours} 小時`;
}
function allBookingTasks(){return [...(TRIP.bookingTasks||[]),...(state.bookingItems||[])];}
async function toggleBookingTask(id){
  const task=allBookingTasks().find(t=>t.id===id); if(!task)return;
  const wasDone=taskDone(task);
  state.taskStatus[id]=!wasDone;
  saveLocal("taskStatus",state.taskStatus);
  if(state.cloud){try{await setCloud("taskStatus",state.taskStatus)}catch{}}
  renderBookings();
  if(!wasDone){
    const allDone=allBookingTasks().every(taskDone);
    toast(allDone?"所有訂位／票券任務都完成了":"已標記完成");
  }
}
function bookingVisualStatus(t,done){
  if(done)return {label:"已完成",cls:"done"};
  if(/現場|小火車/i.test(`${t.title||""} ${t.detail||""}`))return {label:"現場處理",cls:"onsite"};
  if(/預約|訂位|包車|租車|確認/i.test(`${t.title||""} ${t.detail||""}`))return {label:"待確認",cls:"pending"};
  return {label:"待處理",cls:"pending"};
}
function bookingTaskCard(t){
  const done=taskDone(t),vs=bookingVisualStatus(t,done),pdfKey=bookingPdfKey(t);
  return `<div class="task-card ${done?"done":""}">
    <button class="task-check" data-task-id="${esc(t.id)}" aria-label="${done?"標記未完成":"標記完成"}">${done?"✓":"○"}</button>
    <div class="task-body">
      <div class="task-top"><span>${esc(t.type)}</span><b>${esc(t.when||"")}</b><em class="booking-state ${vs.cls}">${vs.label}</em></div>
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-detail">${esc(t.detail||"")}</div>
      ${!done?`<div class="task-countdown">${esc(countdownText(t))}</div>`:""}
      <div class="booking-card-actions">${t.map?`<a class="mini-action-link" target="_blank" rel="noopener" href="${mapSearch(t.map)}">↗ 位置</a>`:""}${pdfAttachmentControls(pdfKey,t.title||"訂位票券")}${t.custom?`<button class="mini-btn" data-delete-booking="${esc(t.id)}" type="button">刪除</button>`:""}</div>
    </div>
  </div>`;
}
function renderBookings(){
  const tasks=allBookingTasks();
  const pending=tasks.filter(t=>!taskDone(t));
  const done=tasks.filter(taskDone);
  $("#bookingList").innerHTML=`
    <section class="task-section">
      <div class="task-section-title"><span>🔥</span><div><b>尚未處理</b><small>${pending.length} 項</small></div></div>
      <div class="task-stack">${pending.length?pending.map(bookingTaskCard).join(""):`<div class="empty">目前沒有待處理任務。</div>`}</div>
    </section>
    <section class="task-section completed-section">
      <div class="task-section-title"><span>✅</span><div><b>已完成／已訂</b><small>${done.length} 項</small></div></div>
      <div class="task-stack">${done.map(bookingTaskCard).join("")}</div>
    </section>`;
}
function renderShopping(){
  const members=["全部",...TRIP.members];
  $("#shoppingSummary").innerHTML=members.map(m=>{
    const list=m==="全部"?state.shopping:state.shopping.filter(i=>i.owner===m);
    const open=list.filter(i=>!i.checked).length;
    return `<button class="member-pill ${state.shoppingMember===m?"active":""}" data-member="${esc(m)}">${esc(m)} · ${open}</button>`;
  }).join("");
  const list=state.shoppingMember==="全部"?state.shopping:state.shopping.filter(i=>i.owner===state.shoppingMember);
  $("#shoppingList").innerHTML=list.length?list.map(i=>`
    <div class="list-item ${i.checked?"checked":""}">
      <div class="list-main">
        <div><div class="list-title">${esc(i.name)}</div>
          <div class="list-meta">${esc(i.owner)}${i.amount?` · ¥${Number(i.amount).toLocaleString()}`:""}${i.shop?` · 📍 ${esc(i.shop)}`:""}${i.day?` · ${esc(i.day)}`:""}</div>
        </div>
        <div class="list-actions">
          ${i.shop?`<a class="mini-btn" target="_blank" href="${mapSearch(i.shop)}">地圖</a>`:""}
          <button class="mini-btn check-btn ${i.checked?"done":""}" data-check-shopping="${i.id}">${i.checked?"✓":"○"}</button>
          <button class="mini-btn" data-delete-shopping="${i.id}">刪</button>
        </div>
      </div>
    </div>`).join(""):`<div class="empty-art-card"><img src="./nov_empty_shopping.webp?v=160" alt="目前還沒有購物清單"></div>`;
}
function computeExpense(){
  const paid=Object.fromEntries(TRIP.members.map(m=>[m,0]));
  const owed=Object.fromEntries(TRIP.members.map(m=>[m,0]));
  let total=0;
  state.expenses.forEach(e=>{
    const amount=Number(e.amount||0); total+=amount;
    if(paid[e.payer]!==undefined) paid[e.payer]+=amount;
    const ps=e.participants?.length?e.participants:TRIP.members;
    ps.forEach(m=>{if(owed[m]!==undefined) owed[m]+=amount/ps.length});
  });
  const net=Object.fromEntries(TRIP.members.map(m=>[m,paid[m]-owed[m]]));
  return {total,paid,owed,net};
}
function settlementText(net){
  if(TRIP.members.length!==2) return "多人結算：依每人淨額顯示，正數代表應收、負數代表應付。";
  const [a,b]=TRIP.members;
  if(Math.abs(net[a])<1) return "目前已大致結清。";
  return net[a]>0?`${b} → ${a} ¥${Math.round(net[a]).toLocaleString()}`:`${a} → ${b} ¥${Math.round(-net[a]).toLocaleString()}`;
}
function renderExpenses(){
  const s=computeExpense();
  $("#expenseSummary").innerHTML=`<div class="eyebrow">旅費總計</div><div class="summary-total">¥${Math.round(s.total).toLocaleString()}</div>
    <div class="list-meta">${TRIP.members.map(m=>`${esc(m)} 已付款 ¥${Math.round(s.paid[m]).toLocaleString()}`).join(" · ")}</div>
    <div class="settlement"><b>目前結算</b><br>${esc(settlementText(s.net))}</div>`;
  $("#expenseList").innerHTML=state.expenses.length?state.expenses.slice().reverse().map(i=>`
    <div class="list-item"><div class="list-main"><div><div class="list-title">${esc(i.name)}</div>
      <div class="list-meta">¥${Number(i.amount).toLocaleString()} · ${esc(i.payer)} 付款 · 分攤：${esc((i.participants||TRIP.members).join("、"))}${i.date?` · ${esc(i.date)}`:""}</div>
      </div><button class="mini-btn" data-delete-expense="${i.id}">刪</button></div></div>`).join(""):`<div class="empty-art-card"><img src="./nov_empty_expense.webp?v=160" alt="目前還沒有花費紀錄"></div>`;
}
const EXCHANGE_RATE_STORAGE_KEY=`${APP_NAMESPACE}:manual-exchange-rate`;
function getManualExchangeRate(){try{const n=Number(localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY)||0);return Number.isFinite(n)&&n>0?n:0}catch{return 0}}
function saveManualExchangeRate(value){const n=Number(value);try{if(Number.isFinite(n)&&n>0)localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY,String(n));else localStorage.removeItem(EXCHANGE_RATE_STORAGE_KEY)}catch{}return Number.isFinite(n)&&n>0?n:0}
function safeArithmetic(raw){
  let s=String(raw||"").trim().replace(/[，,]/g,"").replace(/×/g,"*").replace(/÷/g,"/").replace(/[−–—]/g,"-").replace(/＋/g,"+").replace(/（/g,"(").replace(/）/g,")");
  if(!s)return null;if(s.length>80||!/^[0-9+\-*/().\s]+$/.test(s))return NaN;
  try{const value=Function(`"use strict";return (${s})`)();return typeof value==="number"&&Number.isFinite(value)?value:NaN}catch{return NaN}
}
function money0(n){return Math.round(Number(n)||0).toLocaleString("zh-TW")}
function money2(n){return (Math.round((Number(n)||0)*100)/100).toLocaleString("zh-TW",{minimumFractionDigits:0,maximumFractionDigits:2})}
function formatExchangeRate(n){const v=Number(n);return Number.isFinite(v)?v.toLocaleString("zh-TW",{minimumFractionDigits:0,maximumFractionDigits:6,useGrouping:false}):""}
function renderExchangeTool(){
  const rateInput=$("#exchangeRateInput"),expr=$("#jpyCalcInput"),result=$("#exchangeResult"),twd=$("#twdCalcInput"),reverse=$("#exchangeReverseResult");
  if(!rateInput||!result)return;
  const saved=getManualExchangeRate();if(document.activeElement!==rateInput&&rateInput.value===""&&saved)rateInput.value=String(saved);
  const rate=Number(rateInput.value||saved||0),jpy=safeArithmetic(expr?.value||"");
  if(!rate||rate<=0){result.innerHTML='<small>計算結果</small><strong>先輸入匯率</strong><span>例如：1 JPY = 0.215 TWD</span>';if(reverse)reverse.textContent="—";return}
  if(jpy===null)result.innerHTML=`<small>目前匯率</small><strong>¥100 ≈ NT$${money2(100*rate)}</strong><span>輸入日圓金額或算式即可換算</span>`;
  else if(Number.isNaN(jpy))result.innerHTML='<small>計算結果</small><strong>算式格式不正確</strong><span>只支援數字、+ − × ÷、括號</span>';
  else result.innerHTML=`<small>計算結果</small><strong>¥${money2(jpy)} ≈ NT$${money2(jpy*rate)}</strong><span>1 JPY = ${formatExchangeRate(rate)} TWD</span>`;
  const twdValue=Number(String(twd?.value||"").replace(/,/g,""));if(reverse)reverse.textContent=twd?.value&&Number.isFinite(twdValue)?`≈ ¥${money0(twdValue/rate)}`:"—";
}
function googleMapsUrlFromText(raw){
  const urls=String(raw||"").match(/https?:\/\/[^\s]+/g)||[];
  for(const token of urls){try{const u=new URL(token.replace(/[)>\]，。]+$/g,""));const h=u.hostname.toLowerCase();if(h==="maps.app.goo.gl"||h==="goo.gl"||h.endsWith("google.com")||h.endsWith("google.co.jp"))return u.toString()}catch{}}
  return "";
}
function mapNameFromUrl(url){
  if(!url)return "";try{const u=new URL(url);const m=u.pathname.match(/\/maps\/place\/([^/]+)/i);if(m)return decodeURIComponent(m[1].replace(/\+/g," "));const q=u.searchParams.get("query")||u.searchParams.get("q");return q?decodeURIComponent(q.replace(/\+/g," ")):""}catch{return ""}
}
function parseGoogleMapsShare(raw){
  const text=String(raw||"").trim(),url=googleMapsUrlFromText(text);const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);let name="",address="";
  for(const line of lines){if(/^https?:\/\//i.test(line))continue;if(!name){name=line;continue}if(!address){address=line;break}}
  if(!name)name=mapNameFromUrl(url);return {name:name.slice(0,120),address:address.slice(0,180),url};
}
function previewMapImport(){
  const raw=$("#mapImportRaw"),name=$("#mapImportName"),box=$("#mapImportPreview");if(!raw||!name||!box)return;
  const parsed=parseGoogleMapsShare(raw.value);if(parsed.name&&!name.value.trim())name.value=parsed.name;
  const finalName=name.value.trim()||parsed.name;const url=parsed.url;
  if(!raw.value.trim()){box.innerHTML='<b>貼上後會先解析名稱與 Google Maps 連結。</b><small>支援 Google Maps 分享文字、完整網址與 maps.app.goo.gl 短網址。</small>';return}
  box.innerHTML=`<b>${esc(finalName||"尚未取得地點名稱")}</b><small>${url?"✓ 已辨識 Google Maps 連結":"尚未辨識 Google Maps 連結；仍可用名稱建立搜尋入口"}${parsed.address?`・${esc(parsed.address)}`:""}</small>`;
}
async function saveMapImport(){
  const raw=$("#mapImportRaw"),nameEl=$("#mapImportName");if(!raw||!nameEl)return;const parsed=parseGoogleMapsShare(raw.value);const name=nameEl.value.trim()||parsed.name;if(!name){toast("請補上地點名稱");nameEl.focus();return}
  const obj={id:uid(),name,url:parsed.url||"",address:parsed.address||"",day:$("#mapImportDay")?.value||"",category:$("#mapImportCategory")?.value||"景點",note:$("#mapImportNote")?.value.trim()||"",createdAt:Date.now()};
  await cloudAdd("mapPlaces",obj);renderMapImports();raw.value="";nameEl.value="";if($("#mapImportNote"))$("#mapImportNote").value="";previewMapImport();toast("已加入地點清單");
}
function renderMapImports(){
  const box=$("#mapImportList");if(!box)return;const items=(state.mapPlaces||[]).slice().sort((a,b)=>{const da=Number(String(a.day||"").replace("D",""))||99,db=Number(String(b.day||"").replace("D",""))||99;return da-db||(b.createdAt||0)-(a.createdAt||0)});
  box.innerHTML=items.length?items.map(i=>{const href=i.url||mapSearch([i.name,i.address].filter(Boolean).join(" "));return `<div class="list-item map-place-item"><div class="list-main"><div><div class="list-title">${esc(i.name)}</div><div class="list-meta">${esc([i.day,i.category,i.address,i.note].filter(Boolean).join(" · ")||"未指定")}</div></div><div class="list-actions"><a class="mini-btn" target="_blank" rel="noopener" href="${esc(href)}">地圖</a><button class="mini-btn" data-delete-map-place="${esc(i.id)}">刪</button></div></div></div>`}).join(""):'<div class="empty">還沒有匯入地點。從 Google Maps 按「分享」後，把文字或連結貼到上方即可。</div>';
}
function renderNotes(){
  const area=$("#notesArea"); if(area)area.value=state.notes||"";
  const empty=$("#notesEmptyState"); if(empty)empty.hidden=!!String(state.notes||"").trim();
}
function renderTools(){renderBookings();renderAutumnWatch(TRIP.days[state.dayIndex]);renderExchangeTool();renderMapImports();renderShopping();renderExpenses();renderNotes()}
function renderAll(){applySceneLanguageUI();renderDays();renderSchedule();renderFood();renderTools()}

function switchView(v){
  state.view=v;
  $$(".view").forEach(x=>x.classList.toggle("active",x.id===`${v}View`));
  $$(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  window.scrollTo({top:0,behavior:"smooth"});
}
function switchTool(t){
  state.tool=t;
  if(t==="autumn"){autumnWatchScope="all";renderAutumnWatch(TRIP.days[state.dayIndex]);}
  $$(".tool-card").forEach(x=>x.classList.toggle("active",x.dataset.tool===t));
  $$(".tool-panel").forEach(x=>x.classList.toggle("active",x.id===`${t}Panel`));
}
function localUpsert(key,obj){
  const arr=state[key]; const idx=arr.findIndex(x=>x.id===obj.id);
  if(idx>=0) arr[idx]={...arr[idx],...obj}; else arr.push(obj);
  saveLocal(key,arr);
}
async function cloudAdd(key,obj){
  localUpsert(key,obj);
  if(state.cloud){
    try{
      const {id,...cloudValue}=obj;
      await addCloud(key,cloudValue);
      $("#syncText").textContent="雲端已同步";
    }catch(e){
      $("#syncPill").classList.remove("cloud");
      $("#syncText").textContent="同步失敗";
      toast(`Firebase：${e.message}`);
    }
  }
}
async function toggleItem(key,id){
  const item=state[key].find(x=>x.id===id); if(!item)return;
  item.checked=!item.checked; saveLocal(key,state[key]);
  if(state.cloud){try{await updateCloud(key,id,{checked:item.checked})}catch{}}
}
async function deleteItem(key,id){
  state[key]=state[key].filter(x=>x.id!==id);saveLocal(key,state[key]);
  if(state.cloud){try{await removeCloud(key,id)}catch{}}
}
function openModal(type){
  const modal=$("#formModal"),fields=$("#modalFields"),title=$("#modalTitle");
  modal.dataset.type=type;
  if(type==="food"){
    title.textContent="新增想吃店家";
    fields.innerHTML=field("店名","name","text","例如：咖啡廳") + field("區域","location","text","例如：天神") + field("備註","note","text","想吃什麼");
  }else if(type==="booking"){
    title.textContent="新增訂位／票券";
    fields.innerHTML=selectField("類型","bookingType",["訂位","票券","住宿","交通","現場處理","其他"])+
      field("名稱","name","text","例如：福岡水炊晚餐")+
      field("時間／日期","when","text","例如：D8 18:30")+
      field("處理期限（選填）","deadline","datetime-local","")+
      field("備註","detail","text","例如：出發前再次確認")+
      field("地點（選填）","map","text","例如：博多華味鳥");
  }else if(type==="shopping"){
    title.textContent="新增購物";
    fields.innerHTML=field("商品","name","text","例如：On Cloud 7")+
      selectField("誰的","owner",TRIP.members)+field("預算（JPY）","amount","number","20000")+
      field("店家","shop","text","例如：On Fukuoka")+field("預計哪天","day","text","例如：D2");
  }else{
    title.textContent="新增記帳";
    fields.innerHTML=field("名稱","name","text","例如：晚餐")+field("金額（JPY）","amount","number","4800")+
      selectField("付款人","payer",TRIP.members)+field("日期","date","date","")+
      `<div class="field"><label>分攤成員</label><div class="checks">${TRIP.members.map(m=>`<label class="check-label"><input type="checkbox" name="participants" value="${esc(m)}" checked> ${esc(m)}</label>`).join("")}</div></div>`;
  }
  modal.showModal();
}
function field(label,name,type,placeholder){return `<div class="field"><label>${label}</label><input required name="${name}" type="${type}" placeholder="${placeholder}"></div>`}
function selectField(label,name,opts){return `<div class="field"><label>${label}</label><select name="${name}">${opts.map(o=>`<option>${esc(o)}</option>`).join("")}</select></div>`}
async function handleSubmit(e){
  e.preventDefault(); const type=$("#formModal").dataset.type, fd=new FormData(e.currentTarget);
  const base={id:uid(),name:fd.get("name")?.trim()};
  if(type==="food"){
    await cloudAdd("foods",{...base,location:fd.get("location")?.trim(),note:fd.get("note")?.trim(),checked:false}); renderFood();
  }else if(type==="booking"){
    const deadlineRaw=fd.get("deadline")||"";
    await cloudAdd("bookingItems",{...base,attachmentKey:base.id,type:fd.get("bookingType")||"訂位",title:base.name,when:fd.get("when")?.trim(),deadline:deadlineRaw?new Date(deadlineRaw).toISOString():"",detail:fd.get("detail")?.trim(),map:fd.get("map")?.trim(),defaultDone:false,custom:true});
    renderBookings();
  }else if(type==="shopping"){
    await cloudAdd("shopping",{...base,owner:fd.get("owner"),amount:Number(fd.get("amount")||0),shop:fd.get("shop")?.trim(),day:fd.get("day")?.trim(),checked:false}); renderShopping();
  }else{
    const participants=fd.getAll("participants");
    await cloudAdd("expenses",{...base,amount:Number(fd.get("amount")||0),payer:fd.get("payer"),participants,date:fd.get("date")||japanToday()});renderExpenses();
  }
  $("#formModal").close();e.currentTarget.reset();toast("已儲存");
}


const DISPLAY_THEME_KEY=`${APP_NAMESPACE}:displayTheme`;
const FONT_SIZE_KEY=`${APP_NAMESPACE}:fontSize`;
const THEME_META={travel:"#A8673F",sea:"#58788C",wa:"#8C4A3C"};

function getDisplaySetting(key,fallback){
  try{return localStorage.getItem(key)||fallback}catch{return fallback}
}
function applyDisplaySettings(){
  let theme=getDisplaySetting(DISPLAY_THEME_KEY,"wa");
  if(!["travel","sea","wa"].includes(theme)){theme="wa";try{localStorage.setItem(DISPLAY_THEME_KEY,theme)}catch{}}
  const fontSize=getDisplaySetting(FONT_SIZE_KEY,"standard");
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.fontSize=fontSize;
  document.documentElement.dataset.sceneLang=getSceneLanguage();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",THEME_META[theme]||THEME_META.travel);
  $$("[data-theme-choice]").forEach(b=>{
    const selected=b.dataset.themeChoice===theme;
    b.classList.toggle("selected",selected);
    b.setAttribute("aria-pressed",String(selected));
  });
  $$("[data-font-choice]").forEach(b=>{
    const selected=b.dataset.fontChoice===fontSize;
    b.classList.toggle("selected",selected);
    b.setAttribute("aria-pressed",String(selected));
  });
}
function setDisplayTheme(theme){
  if(!["travel","sea","wa"].includes(theme))return;
  try{localStorage.setItem(DISPLAY_THEME_KEY,theme)}catch{}
  applyDisplaySettings();
  const currentDayIndex=state?.dayIndex??0;
  if(TRIP?.days?.[currentDayIndex]) renderWeather(TRIP.days[currentDayIndex]).catch(()=>{});
}
function setFontSize(size){
  if(!["standard","large","xlarge"].includes(size))return;
  try{localStorage.setItem(FONT_SIZE_KEY,size)}catch{}
  applyDisplaySettings();
}

function bind(){
  if(appBound)return; appBound=true;
  document.addEventListener("click",async e=>{
    const weatherCardTap=e.target.closest("#weatherCard");
    if(weatherCardTap&&weatherCardTap.dataset.preview==='1'&&!e.target.closest('button,a,input,select,textarea,label')){handleWeatherPreviewTap();return;}
    const dayArt=e.target.closest("#daySceneCard");if(dayArt){openDayLightbox(state.dayIndex);return;}
    const themeChoice=e.target.closest("[data-theme-choice]");if(themeChoice){setDisplayTheme(themeChoice.dataset.themeChoice);return}
    const fontChoice=e.target.closest("[data-font-choice]");if(fontChoice){setFontSize(fontChoice.dataset.fontChoice);return}
    const dayLangChoice=e.target.closest("[data-day-lang]");if(dayLangChoice){setSceneLanguage(dayLangChoice.dataset.dayLang);return}
    const d=e.target.closest("[data-day]");if(d){state.dayIndex=Number(d.dataset.day);state.decisionDrafts={};renderDays();renderSchedule();return}
    const n=e.target.closest("[data-view]");if(n){switchView(n.dataset.view);if(n.dataset.tool)switchTool(n.dataset.tool);return}
    const t=e.target.closest("[data-tool]");if(t){switchTool(t.dataset.tool);return}
    const o=e.target.closest("[data-open-modal]");if(o){openModal(o.dataset.openModal);return}
    const m=e.target.closest("[data-member]");if(m){state.shoppingMember=m.dataset.member;renderShopping();return}
    const autumnOpen=e.target.closest("[data-autumn-open]");if(autumnOpen){openAutumnEditor(autumnOpen.dataset.autumnOpen);return}
    const autumnScope=e.target.closest("[data-autumn-scope]");if(autumnScope){autumnWatchScope=autumnScope.dataset.autumnScope==="all"?"all":"day";renderAutumnWatch(TRIP.days[state.dayIndex]);return}
    const autumnSort=e.target.closest("[data-autumn-sort]");if(autumnSort){autumnSortMode=["priority","date","status","stale"].includes(autumnSort.dataset.autumnSort)?autumnSort.dataset.autumnSort:"priority";try{localStorage.setItem("kyushu-nov-2026:autumn-sort",autumnSortMode)}catch{}renderAutumnWatch(TRIP.days[state.dayIndex]);return}
    const autumnChoice=e.target.closest("[data-autumn-status-choice]");if(autumnChoice){autumnDraftStatus=autumnChoice.dataset.autumnStatusChoice;$$("#autumnModal [data-autumn-status-choice]").forEach(btn=>btn.classList.toggle("active",btn===autumnChoice));return}
    const decisionConfirm=e.target.closest("[data-decision-confirm]");if(decisionConfirm){await confirmDecision(decisionConfirm.dataset.decisionConfirm);return}
    const decisionClear=e.target.closest("[data-decision-clear]");if(decisionClear){await clearDecision(decisionClear.dataset.decisionClear);return}
    const decision=e.target.closest("[data-decision-id]");if(decision){stageDecision(decision.dataset.decisionId,decision.dataset.decisionOption);return}
    const pdfAttach=e.target.closest("[data-pdf-attach]");if(pdfAttach){await attachPdf(pdfAttach.dataset.pdfAttach,pdfAttach.dataset.pdfLabel||"PDF附件");return}
    const pdfOpen=e.target.closest("[data-pdf-open]");if(pdfOpen){await openPdfAttachment(pdfOpen.dataset.pdfOpen);return}
    const pdfDelete=e.target.closest("[data-pdf-delete]");if(pdfDelete){await deletePdfAttachment(pdfDelete.dataset.pdfDelete);return}
    const task=e.target.closest("[data-task-id]");if(task){await toggleBookingTask(task.dataset.taskId);return}
    for(const [attr,key,render] of [["data-check-food","foods",renderFood],["data-check-shopping","shopping",renderShopping]]){
      const x=e.target.closest(`[${attr}]`);if(x){const id=x.getAttribute(attr);const before=state[key].find(i=>i.id===id)?.checked;await toggleItem(key,id);render();if(!before)toast("已完成");return}
    }
    for(const [attr,key,render] of [["data-delete-food","foods",renderFood],["data-delete-shopping","shopping",renderShopping],["data-delete-expense","expenses",renderExpenses],["data-delete-map-place","mapPlaces",renderMapImports],["data-delete-booking","bookingItems",renderBookings]]){
      const x=e.target.closest(`[${attr}]`);if(x){await deleteItem(key,x.getAttribute(attr));render();toast("已刪除");return}
    }
  });
  $("#dayLandscapeBtn")?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();toggleDayLandscape()});
  $("#dayLightboxClose")?.addEventListener("click",closeDayLightbox);
  $("#dayLightboxPrev")?.addEventListener("click",()=>moveDayLightbox(-1));
  $("#dayLightboxNext")?.addEventListener("click",()=>moveDayLightbox(1));
  $("#dayImageLightbox")?.addEventListener("click",e=>{if(e.target.closest?.("[data-day-lightbox-close]"))closeDayLightbox()});
  const dayLightboxStage=$("#dayImageLightbox .day-image-lightbox-stage");
  if(dayLightboxStage){
    const pointers=new Map();let swipeStart=null,panStart=null,pinchStart=null,lastTap=0,lastPointerType="mouse";
    const point=e=>({x:e.clientX,y:e.clientY});
    dayLightboxStage.addEventListener("pointerdown",e=>{
      if(e.button!==undefined&&e.button!==0)return;lastPointerType=e.pointerType||"mouse";try{dayLightboxStage.setPointerCapture(e.pointerId)}catch{};pointers.set(e.pointerId,point(e));
      if(pointers.size===1){swipeStart={...point(e),id:e.pointerId};panStart={...point(e),panX:dayImagePanX,panY:dayImagePanY,id:e.pointerId}}
      if(pointers.size===2){const pts=[...pointers.values()];pinchStart={distance:Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),zoom:dayImageZoom};}
    });
    dayLightboxStage.addEventListener("pointermove",e=>{
      if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,point(e));
      if(pointers.size>=2&&pinchStart){e.preventDefault();const pts=[...pointers.values()].slice(0,2),dist=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);setDayImageZoom(pinchStart.zoom*(dist/(pinchStart.distance||1)));return}
      if(dayImageZoom>1&&panStart&&panStart.id===e.pointerId){e.preventDefault();dayImagePanX=panStart.panX+(e.clientX-panStart.x);dayImagePanY=panStart.panY+(e.clientY-panStart.y);applyDayImageZoom()}
    },{passive:false});
    const endPointer=e=>{
      const start=swipeStart&&swipeStart.id===e.pointerId?swipeStart:null,cur=point(e);pointers.delete(e.pointerId);
      if(pointers.size<2)pinchStart=null;
      if(start&&dayImageZoom<=1.001&&!dayLandscapeActive){const dx=cur.x-start.x,dy=cur.y-start.y;if(Math.abs(dx)>44&&Math.abs(dx)>Math.abs(dy)*1.15)moveDayLightbox(dx<0?1:-1)}
      if(!dayLandscapeActive&&(e.pointerType==="touch"||e.pointerType==="pen")&&start){const dx=cur.x-start.x,dy=cur.y-start.y;if(Math.abs(dx)<12&&Math.abs(dy)<12){const now=Date.now();if(now-lastTap<300){e.preventDefault();setDayImageZoom(dayImageZoom>1?1:2.5);lastTap=0}else lastTap=now}}
      if(!pointers.size){swipeStart=null;panStart=null}
    };
    dayLightboxStage.addEventListener("pointerup",endPointer);dayLightboxStage.addEventListener("pointercancel",e=>{pointers.delete(e.pointerId);if(!pointers.size){swipeStart=null;panStart=null;pinchStart=null}});
    dayLightboxStage.addEventListener("dblclick",e=>{if(lastPointerType!=="mouse"||dayLandscapeActive)return;e.preventDefault();setDayImageZoom(dayImageZoom>1?1:2.5)});
  }
  $("#dayZoomOut")?.addEventListener("click",()=>setDayImageZoom(dayImageZoom-.5));
  $("#dayZoomIn")?.addEventListener("click",()=>setDayImageZoom(dayImageZoom+.5));
  $("#dayZoomReset")?.addEventListener("click",resetDayImageZoom);
  window.addEventListener("resize",()=>{if(dayLandscapeActive)syncDayLandscapeFallback();if($("#dayImageLightbox")?.classList.contains("show"))applyDayImageZoom()});
  const handleDayFullscreenExit=()=>{
    const fs=document.fullscreenElement||document.webkitFullscreenElement;
    if(dayLandscapeActive&&dayLandscapeNativeFullscreen&&!fs)exitDayLandscape({exitFullscreen:false});
  };
  document.addEventListener("fullscreenchange",handleDayFullscreenExit);
  document.addEventListener("webkitfullscreenchange",handleDayFullscreenExit);
  $("#guideClose")?.addEventListener("click",()=>closeGuide());
  $("#guideSaveBtn")?.addEventListener("click",saveGuideNote);
  $("#guideNoteArea")?.addEventListener("input",e=>{
    if(!activeGuideContext)return;
    markGuideNoteLocal(activeGuideContext.key,e.target.value);
    if(state.cloud&&navigator.onLine){setGuideSaveStatus("本機已儲存・同步中…","saving");queueGuideNoteSync(activeGuideContext.key,800)}
    else setGuideSaveStatus("已存本機・等待網路同步","pending");
  });
  $("#guideModal")?.addEventListener("click",e=>{if(e.target===$("#guideModal"))closeGuide()});
  $("#guideModal")?.addEventListener("cancel",e=>{e.preventDefault();closeGuide()});
  $("#autumnModalClose")?.addEventListener("click",closeAutumnEditor);
  $("#autumnModalSave")?.addEventListener("click",()=>saveAutumnEditor());
  $("#autumnModal")?.addEventListener("click",e=>{if(e.target===$("#autumnModal"))closeAutumnEditor()});
  $("#autumnModal")?.addEventListener("cancel",e=>{e.preventDefault();closeAutumnEditor()});
  $("#foodNearbyOpen")?.addEventListener("click",()=>$("#foodNearbyModal")?.showModal());
  $("#foodNearbyClose")?.addEventListener("click",()=>$("#foodNearbyModal")?.close());
  $("#foodNearbyModal")?.addEventListener("click",e=>{if(e.target===$("#foodNearbyModal"))$("#foodNearbyModal").close()});

  $("#exchangeRateInput")?.addEventListener("input",e=>{saveManualExchangeRate(e.target.value);renderExchangeTool()});
  $("#jpyCalcInput")?.addEventListener("input",renderExchangeTool);
  $("#twdCalcInput")?.addEventListener("input",renderExchangeTool);
  $("#exchangeClearBtn")?.addEventListener("click",()=>{if($("#jpyCalcInput"))$("#jpyCalcInput").value="";if($("#twdCalcInput"))$("#twdCalcInput").value="";renderExchangeTool()});
  $("#mapImportRaw")?.addEventListener("input",previewMapImport);
  $("#mapImportName")?.addEventListener("input",previewMapImport);
  $("#mapImportSaveBtn")?.addEventListener("click",saveMapImport);
  $("#settingsBtn").addEventListener("click",()=>{$("#settingsModal").showModal();applyDisplaySettings();refreshOfflinePackStatus().catch(()=>{})});
  $("#settingsClose").addEventListener("click",()=>$("#settingsModal").close());
  $("#offlinePackDownloadBtn")?.addEventListener("click",()=>downloadOfflinePack());
  $("#offlinePackRemoveBtn")?.addEventListener("click",()=>removeOfflinePack());
  $("#settingsModal").addEventListener("click",e=>{if(e.target===$("#settingsModal"))$("#settingsModal").close()});
  $("#displayResetBtn").addEventListener("click",()=>{
    try{
      localStorage.removeItem(DISPLAY_THEME_KEY);
      localStorage.removeItem(FONT_SIZE_KEY);
    }catch{}
    applyDisplaySettings();
    toast("已恢復預設顯示");
  });
  $("#modalClose").addEventListener("click",()=>$("#formModal").close());
  $("#modalForm").addEventListener("submit",handleSubmit);
  $("#firebaseTestBtn").addEventListener("click", async()=>{
    $("#noteStatus").textContent="正在測試 Firebase…";
    try{
      const testValue=`Firebase test ${new Date().toISOString()}`;
      await setCloud("_connection_test", testValue);
      state.cloud=true;
      $("#syncPill").classList.add("cloud");
      $("#syncText").textContent="Firebase 已連線";
      $("#noteStatus").textContent="✓ Firebase 讀寫測試成功";
      toast("Firebase 測試成功");
    }catch(err){
      state.cloud=false;
      $("#syncPill").classList.remove("cloud");
      $("#syncText").textContent="同步失敗";
      $("#noteStatus").textContent=`⚠ Firebase 測試失敗：${err.message}`;
      toast(`Firebase：${err.message}`);
    }
  });
  $("#notesArea").addEventListener("input",e=>{
    state.notes=e.target.value;saveLocal("notes",state.notes);const noteEmpty=$("#notesEmptyState");if(noteEmpty)noteEmpty.hidden=!!String(state.notes||"").trim();$("#noteStatus").textContent="本機已儲存";
    clearTimeout(state.noteTimer);
    state.noteTimer=setTimeout(async()=>{
      if(state.cloud){
        try{
          await setCloud("notes",state.notes);
          $("#noteStatus").textContent="✓ 雲端已同步";
          $("#syncPill").classList.add("cloud");
          $("#syncText").textContent="雲端已同步";
        }catch(err){
          $("#noteStatus").textContent=`⚠ 雲端同步失敗：${err.message}`;
          $("#syncPill").classList.remove("cloud");
          $("#syncText").textContent="同步失敗";
        }
      }else{
        const msg=getLastFirebaseError();
        if(msg) $("#noteStatus").textContent=`⚠ Firebase 未連線：${msg}`;
      }
    },650);
  });
  window.addEventListener("pagehide",()=>{if(activeGuideContext)flushGuideNoteEditor({sync:false})},{once:false});
  const logoutBtn=$("#logoutBtn");
  if(logoutBtn) logoutBtn.addEventListener("click", async()=>{
    try{ await firebase.auth().signOut(); }catch{}
    clearPrivateCache();
    location.reload();
  });
}

function stopCloudPollers(){for(const stop of [...pollers]){try{stop()}catch{}}}
async function connectCloud(){
  stopCloudPollers();
  const ok=await initFirebase();
  if(!ok){
    state.cloud=false;
    $("#syncPill")?.classList.remove("cloud");
    if($("#syncText"))$("#syncText").textContent="Firebase 未連線";
    const msg=getLastFirebaseError();
    if(msg&&$("#noteStatus")) $("#noteStatus").textContent=`⚠ Firebase 未連線：${msg}`;
    if(activeGuideContext)setGuideSaveStatus("已存本機・等待重新同步","pending");
    if(navigator.onLine)setTimeout(()=>resumeCloudAfterOnline(),2500);
    return false;
  }
  state.cloud=true;
  $("#syncPill")?.classList.add("cloud");
  if($("#syncText"))$("#syncText").textContent="Firebase 已連線";

  // Guide notes are merged before polling. Pending offline edits are never blindly overwritten.
  try{
    const remoteGuideNotes=await request(pathFor("guideNotes"),{method:"GET"});
    mergeGuideNotesFromCloud(remoteGuideNotes,{syncPending:false});
  }catch(err){console.warn("Guide notes initial merge failed",err)}
  await syncPendingGuideNotes();

  const mappings=[
    ["foods",v=>{if(v!==null){state.foods=normalizeCloud(v);saveLocal("foods",state.foods);renderFood()}}],
    ["shopping",v=>{if(v!==null){state.shopping=normalizeCloud(v).map(x=>({...x,owner:normalizeMemberLabel(x.owner)}));saveLocal("shopping",state.shopping);renderShopping()}}],
    ["expenses",v=>{if(v!==null){state.expenses=normalizeCloud(v).map(x=>({...x,payer:normalizeMemberLabel(x.payer),participants:(x.participants||[]).map(normalizeMemberLabel)}));saveLocal("expenses",state.expenses);renderExpenses()}}],
    ["mapPlaces",v=>{if(v!==null){state.mapPlaces=normalizeCloud(v);saveLocal("mapPlaces",state.mapPlaces);renderMapImports()}}],
    ["bookingItems",v=>{if(v!==null){state.bookingItems=normalizeCloud(v).map(x=>({...x,custom:true,title:x.title||x.name||"未命名訂位"}));saveLocal("bookingItems",state.bookingItems);renderBookings()}}],
    ["taskStatus",v=>{if(v && typeof v==="object"){state.taskStatus=v;saveLocal("taskStatus",v);renderBookings()}}],
    ["decisions",v=>{if(v && typeof v==="object"){state.decisions=v;saveLocal("decisions",v);renderSchedule()}}],
    ["autumnStatus",v=>{if(v && typeof v==="object"){state.autumnStatus=v;saveLocal("autumnStatus",v);renderAutumnWatch(TRIP.days[state.dayIndex])}}],
    ["guideNotes",v=>mergeGuideNotesFromCloud(v)],
    ["notes",v=>{if(typeof v==="string" && document.activeElement!==$("#notesArea")){state.notes=v;saveLocal("notes",v);renderNotes()}}]
  ];
  mappings.forEach(([k,cb])=>{try{subscribe(k,cb)}catch{}});
  if(activeGuideContext){
    const key=activeGuideContext.key;
    if(state.guideNotePending?.[key])setGuideSaveStatus("已存本機・同步中…","saving");
    else setGuideSaveStatus(guideNoteText(key)?"✓ 雲端同步完成":"已開啟自動儲存","synced");
  }
  return true;
}


async function ensureFirebaseSessionForReconnect(){
  if(!window.KYUSHU_FIREBASE_CONFIG||!window.firebase?.initializeApp)return false;
  try{
    if(!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
    if(firebase.auth().currentUser){currentAuthUser=firebase.auth().currentUser;return true}
    const user=await new Promise(resolve=>{
      let done=false,timer=null,unsub=()=>{};
      const finish=u=>{if(done)return;done=true;clearTimeout(timer);try{unsub()}catch{};resolve(u||null)};
      unsub=firebase.auth().onAuthStateChanged(finish,()=>finish(null));
      timer=setTimeout(()=>finish(firebase.auth().currentUser),5000);
    });
    if(user){currentAuthUser=user;return true}
  }catch(err){console.warn("Firebase reconnect auth failed",err)}
  return false;
}
async function resumeCloudAfterOnline(){
  if(!state||!navigator.onLine||cloudReconnectInFlight)return;
  cloudReconnectInFlight=true;
  try{
    if($("#syncText"))$("#syncText").textContent="正在重新連線…";
    const ready=await ensureFirebaseSessionForReconnect();
    if(!ready){
      state.cloud=false;
      if($("#syncText"))$("#syncText").textContent="需重新登入才能同步";
      if(activeGuideContext)setGuideSaveStatus("本機已儲存・登入後再同步","pending");
      return;
    }
    await connectCloud();
  }finally{cloudReconnectInFlight=false}
}
function enterOfflineMode(){
  if(!state)return;
  state.cloud=false;stopCloudPollers();
  $("#syncPill")?.classList.remove("cloud");
  if($("#syncText"))$("#syncText").textContent="離線模式";
  if(activeGuideContext)setGuideSaveStatus("已存本機・等待網路同步","pending");
}
window.addEventListener("online",()=>resumeCloudAfterOnline());
window.addEventListener("offline",()=>enterOfflineMode());

function setAuthStatus(message,kind=""){
  const el=$("#authStatus");
  if(!el)return;
  el.textContent=message||"";
  el.dataset.kind=kind;
  const art=$("#authLoadingArt");
  const busy=!kind && /正在|載入|確認登入/.test(String(message||""));
  if(art)art.hidden=!busy;
  $("#authGate")?.classList.toggle("is-busy",busy);
}
function showAuthGate(){
  $("#authGate")?.removeAttribute("hidden");
  $("#app")?.setAttribute("hidden","");
}
function showPrivateApp(){
  $("#authGate")?.setAttribute("hidden","");
  $("#app")?.removeAttribute("hidden");
}
function clearPrivateCache(){
  try{
    localStorage.removeItem(PRIVATE_CONTENT_CACHE_KEY);
    localStorage.removeItem(PRIVATE_AUTH_CACHE_KEY);
  }catch{}
}
function cacheAuthorizedTrip(content,user){
  try{
    localStorage.setItem(PRIVATE_CONTENT_CACHE_KEY,JSON.stringify(content));
    localStorage.setItem(PRIVATE_AUTH_CACHE_KEY,JSON.stringify({email:user?.email||"",verifiedAt:Date.now()}));
  }catch{}
}
function cachedTrip(){
  try{
    const content=JSON.parse(localStorage.getItem(PRIVATE_CONTENT_CACHE_KEY)||"null");
    const auth=JSON.parse(localStorage.getItem(PRIVATE_AUTH_CACHE_KEY)||"null");
    return content&&auth?{content,auth}:null;
  }catch{return null}
}
function formatTripDate(){
  const days=TRIP?.days||[];
  const first=days[0]?.date||OFFICIAL_TRIP_START, last=days.at(-1)?.date||OFFICIAL_TRIP_END;
  const short=d=>String(d||"").slice(5).replace("-",".");
  return `${short(first)} — ${short(last)}`;
}
const HERO_ROUTE_MAP={FUKUOKA:'福岡',HAKATA:'博多',YUFUIN:'由布院',YUFUINN:'由布院',ASO:'阿蘇',KUMAMOTO:'熊本',BEPPU:'別府',TAKACHIHO:'高千穗'};
function translateHeroRouteLabel(label=''){
  const raw=String(label||'').trim();
  if(!raw)return '';
  const key=raw.toUpperCase().replace(/\s+/g,'');
  return HERO_ROUTE_MAP[key]||raw;
}
function splitHeroRoute(raw=''){
  return String(raw||'').split(/→|->|→|➝|—|-/).map(x=>x.trim()).filter(Boolean).map(translateHeroRouteLabel);
}
function applyPrivateTripMeta(){
  const title=$("#heroPrivateTitle"); if(title) title.textContent=TRIP.heroTitle||TRIP.title||"九州家族紅葉旅";
  const date=$("#heroPrivateDate"); if(date) date.textContent=formatTripDate();
  const route=$("#heroPrivateRoute"); if(route){
    const raw=TRIP.heroRoute||"FUKUOKA → YUFUIN → ASO → KUMAMOTO → FUKUOKA";
    const places=splitHeroRoute(raw);
    route.innerHTML=places.map((x,i)=>`${i?'<i>→</i>':''}<span>${esc(x)}</span>`).join("");
  }
  const season=$("#heroPrivateSeason"); if(season) season.textContent=String(TRIP.season||"2026・晩秋").replace("・"," · ");
  const duration=$("#heroTripDuration"); if(duration) duration.textContent=TRIP.durationLabel||`${TRIP.days?.length||9}天`;
  document.title=TRIP.appTitle||"九州家族紅葉旅";
}
async function fetchPrivateTrip(){
  const content=await request(`${ROOT}/content`,{method:"GET"});
  if(!content||!content.days) throw new Error("Firebase 尚未匯入私人行程資料");
  return content;
}
async function bootTrip(content,user,{offline=false}={}){
  TRIP={...content,members:FAMILY_MEMBER_LABELS.slice()};
  currentAuthUser=user||null;
  state=createState();
  normalizeFamilyCollections();
  state.dayIndex=initialDay();
  applyPrivateTripMeta();
  applyDisplaySettings();
  await loadPdfAttachmentIndex();
  bind();
  renderAll();
  if(!window.__kyushuNowNextTimer){
    window.__kyushuNowNextTimer=setInterval(()=>{
      if(TRIP&&state)renderNowNext(TRIP.days[state.dayIndex]);
    },60000);
  }
  showPrivateApp();
  refreshOfflinePackStatus().catch(()=>{});
  const email=$("#accountEmail"); if(email) email.textContent=user?.email||"離線已授權裝置";
  if(offline){
    state.cloud=false;
    $("#syncPill")?.classList.remove("cloud");
    if($("#syncText")) $("#syncText").textContent="離線模式";
    if($("#noteStatus")) $("#noteStatus").textContent="離線：變更先保存在這台裝置";
  }else{
    connectCloud();
  }
}
async function handleAuthorizedUser(user){
  currentAuthUser=user;
  setAuthStatus("正在載入私人旅程…");
  try{
    const content=await fetchPrivateTrip();
    cacheAuthorizedTrip(content,user);
    await bootTrip(content,user);
  }catch(err){
    console.error(err);
    if(/Permission denied|PERMISSION_DENIED|401|403|權限/i.test(String(err.message))){
      clearPrivateCache();
      setAuthStatus("這個 Google 帳號沒有此旅程的存取權限。","error");
      try{await firebase.auth().signOut()}catch{}
      showAuthGate();
      return;
    }
    setAuthStatus(`無法載入私人旅程：${err.message}`,"error");
    showAuthGate();
  }
}
async function signInGoogle(){
  if(!window.firebase?.auth){
    setAuthStatus("Firebase 登入元件尚未載入，請確認網路連線。","error");
    return;
  }
  setAuthStatus("正在開啟 Google 登入…");
  try{
    const provider=new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({prompt:"select_account"});
    await firebase.auth().signInWithPopup(provider);
  }catch(err){
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment","auth/cancelled-popup-request"].includes(err.code)){
      try{
        const provider=new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithRedirect(provider);
        return;
      }catch(redirectErr){
        setAuthStatus(`登入失敗：${redirectErr.message}`,"error");
      }
    }else if(err.code!=="auth/popup-closed-by-user"){
      setAuthStatus(`登入失敗：${err.message}`,"error");
    }else{
      setAuthStatus("已取消登入。");
    }
  }
}
async function startPrivateAuth(){
  applyDisplaySettings();
  showAuthGate();
  $("#googleLoginBtn")?.addEventListener("click",signInGoogle);

  const cached=cachedTrip();
  if(!navigator.onLine && cached){
    setAuthStatus("離線模式：使用這台裝置上次已授權的行程快取。");
    await bootTrip(cached.content,{email:cached.auth.email},{offline:true});
    return;
  }
  if(!window.KYUSHU_FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey || /PASTE_/i.test(FIREBASE_CONFIG.apiKey)){
    setAuthStatus("尚未完成 Firebase Auth 設定。請依私人設定包的 README 操作。","error");
    return;
  }
  if(!window.firebase?.initializeApp){
    if(cached && !navigator.onLine){
      await bootTrip(cached.content,{email:cached.auth.email},{offline:true});
      return;
    }
    setAuthStatus("Firebase SDK 載入失敗，請重新整理或確認網路。","error");
    return;
  }
  try{
    if(!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    firebase.auth().onAuthStateChanged(user=>{
      if(user) handleAuthorizedUser(user);
      else { showAuthGate(); setAuthStatus("請使用已授權的 Google 帳號登入。"); }
    });
  }catch(err){
    setAuthStatus(`Firebase 初始化失敗：${err.message}`,"error");
  }
}

startPrivateAuth();

if("serviceWorker" in navigator){
  window.addEventListener("load", async()=>{
    try{
      const reg = await navigator.serviceWorker.register("./sw.js?v=11110",{updateViaCache:"none"});
      await reg.update();
    }catch(e){console.warn("Service Worker update failed",e)}
  });
}
