/* Private travel PWA · Firebase Auth gated content · v5.3.3 Guide Notes Reliability */

const FIREBASE_CONFIG = window.KYUSHU_FIREBASE_CONFIG || {};
const DATABASE_URL = FIREBASE_CONFIG.databaseURL || "https://kyushu2026-9b6b9-default-rtdb.asia-southeast1.firebasedatabase.app";
const ROOT = window.KYUSHU_PRIVATE_PATH || "trips/kyushu-oct-2026";
const OFFICIAL_TRIP_START = "2026-10-09";
const OFFICIAL_TRIP_END = "2026-10-18";
const PRIVATE_CONTENT_CACHE_KEY = "kyushu-private:content-cache";
const PRIVATE_AUTH_CACHE_KEY = "kyushu-private:auth-cache";
let TRIP = null;
let state = null;
let currentAuthUser = null;
let appBound = false;

let lastError = "";
const pollers = new Set();
let cloudReconnectInFlight = false;
const GUIDE_DEVICE_ID_KEY = "kyushu-private:guide-device-id";

const BUDDY_FAST_ASSETS=[
  "./day-scene-v52-01.webp?v=520","./day-scene-v52-02.webp?v=520","./day-scene-v52-03.webp?v=520","./day-scene-v52-04.webp?v=520","./day-scene-v52-05.webp?v=520",
  "./day-scene-v52-06.webp?v=520","./day-scene-v52-07.webp?v=520","./day-scene-v52-08.webp?v=520","./day-scene-v52-09.webp?v=520","./day-scene-v52-10.webp?v=520",
  "./weather-rain-usagi-v47.webp?v=470","./booking-check-purin.webp?v=460","./booking-dash-usagi.webp?v=460","./hotel-return-duo.webp?v=460",
  "./ui-cloud.webp?v=440","./ui-coffee.webp?v=440","./ui-suitcase.webp?v=440","./ui-purin-tip.webp?v=440"
];
const buddyFastImageCache=[];
function preloadBuddyFastAssets(){
  if(preloadBuddyFastAssets.started)return;
  preloadBuddyFastAssets.started=true;
  const load=(src,priority="auto")=>{
    const img=new Image(); img.decoding="async";
    try{img.fetchPriority=priority}catch{}
    img.src=src; buddyFastImageCache.push(img);
    if(img.decode) img.decode().catch(()=>{});
  };
  BUDDY_FAST_ASSETS.slice(0,2).forEach(src=>load(src,"high"));
  const rest=()=>BUDDY_FAST_ASSETS.slice(2).forEach(src=>load(src,"low"));
  if("requestIdleCallback" in window) requestIdleCallback(rest,{timeout:1200});
  else setTimeout(rest,450);
}
preloadBuddyFastAssets();

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
    foods:loadLocal("foods",[]), shopping:loadLocal("shopping",[]), expenses:loadLocal("expenses",[]),
    taskStatus:loadLocal("taskStatus",{}), decisions:loadLocal("decisions",{}),
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
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function mapSearch(q){return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`}
function mapNav(q,mode="driving"){return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}&travelmode=${mode}`}
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

const BUDDY_DIALOG={
  purin:[
    "慢慢走也很好 ♡","先吃飽再出發！","今天也要舒服旅行～","不急不急，慢慢來。",
    "休息一下也沒關係 ♡","今天一定會很好玩～","拍張照片再走吧！","要不要先找個地方坐一下？",
    "好喜歡今天的行程 ♡","旅行就是要開開心心～"
  ],
  usagi:[
    "出發！！","往這邊！","好耶！繼續走！","蛤？","衝啊啊啊！",
    "嗚拉","呀哈！","嗚拉呀哈呀哈嗚拉～","哼～？","噗嚕"
  ],
  duo:[
    "今天也一起走 ♡","一起出發！","九州探險中！","今天也要玩得開心！","下一站去哪裡？",
    "兩個人一起就好玩 ♡","今天又收集到一個回憶！","旅程繼續——！","今天的進度很順利！",
    "再拍一張再走！","我們是鴨寶幫！"
  ],
  weather:{
    sunny:["今天適合出去玩！","天氣很好耶 ♡","拍照日！","今天可以放心跑行程～"],
    rain:["雨雨雨——！！","傘帶了嗎！","下雨也要玩！","雨衣裝備完成！","小心不要淋濕！","雨小一點再衝！！"],
    cloudy:["陰天也很好拍～","今天慢慢走就好。"]
  },
  food:{
    purin:["這個看起來好好吃 ♡","先吃再說～","甜點也算正餐吧？","再吃一間嘛。","今天要吃好吃的！","吃飽才有力氣旅行～","這間我可以！","留一點肚子吃甜點 ♡"],
    usagi:["吃這間！！","下一間！","找吃的！出發！","我還吃得下！！"],
    complete:["收進美食清單！","今天又吃到一間 ♡","美食成就＋1！"]
  },
  booking:{
    reminder:["這個記得要預約！","還有一個任務沒完成。","先確認一下時間～","清單確認中 ✓"],
    urgent:["準備開搶！！","時間到了！！","衝啊啊啊啊！！","手指準備好了嗎！","不可以忘記！！","剩最後一步！"],
    complete:["搶到了！！","完成一項！","任務完成 ✓","太好了，搞定！"],
    all:["全部搞定！！","搶票任務全部完成！","可以安心去玩了 ♡"]
  },
  shop:{
    general:["這間也要逛！","再一家就好！","先進去看一下！","有沒有特殊色！","戰利品搜尋中～","今天是購物日！"],
    complete:["買到啦！！","戰利品＋1！","這個帶回家 ♡","購物任務完成！"],
    purin:["買完去喝咖啡吧～","提袋變多了耶…","這個好可愛 ♡"]
  },
  money:[
    "這筆記下來！","記帳完成 ✓","今天花多少了？","旅費紀錄＋1","欸……又買了？",
    "旅行就是要花一點嘛 ♡","先記下來，回去再算！","分帳交給我！","錢包還好嗎……","有記就不怕忘記！"
  ],
  note:[
    "先記下來 ♡","等一下不要忘記！","旅行備忘＋1","想到什麼就寫下來～",
    "這個之後會用到！","今天的回憶也記一下。","收藏今天的小事情 ♡","筆記完成 ✓"
  ],
  hotel:{
    normal:["回飯店囉～","今天辛苦了 ♡","回去躺平！","今天走好多！！","洗澡睡覺！","終於可以休息了～","泡完澡就睡覺吧。","明天再繼續玩 ♡"],
    late:["已經很晚了耶～","今天到這裡就好。","快回去休息！","晚安，明天見 ♡"]
  },
  day:[
    ["九州，我們來啦！！","旅行正式開始 ♡","第一站：福岡！"],
    ["今天火力全開逛街！","購物袋準備好了嗎？","天神 → 大名 → Canal City，出發！"],
    ["海豹在哪裡！！","今天要看海、拍夕陽 ♡","記得留體力拍夜景！"],
    ["今天慢慢散步就好～","甜點、散步、泡湯 ♡","由布院 CHILL DAY！"],
    ["今天來兜風！","山路慢慢開，風景慢慢看。","星空看得到嗎 ♡"],
    ["阿蘇大冒險繼續！","牛奶、赤牛、出發高千穗！","今天也要一路吃一路玩～"],
    ["划船成功！！！","今天是高千穗大冒險！","牛排也不能錯過！"],
    ["火山今天有開嗎？","草千里拍完，前進熊本！","今天移動很多，慢慢來～"],
    ["鋼彈朝聖日！！","今天要把最後想買的買齊！","夕陽＋鋼彈，拍爆！"],
    ["最後一天了 QAQ","再逛一下再回家嘛。","九州，下次再見 ♡"]
  ],
  egg:[
    "找到隱藏彩蛋 ♡","旅伴集合！！","布丁狗 × 烏薩奇：一起出發！","被你發現了！",
    "布丁狗散步中～","咻————！！","還沒睡嗎……？","還可以再玩！！",
    "該睡覺了啦～","任務全部完成，無敵！","不想回家！！","九州旅程 START！"
  ],
  time:{
    morning:["早安～今天去哪裡？","新的一天出發！","早餐先吃好 ♡"],
    afternoon:["下午也繼續玩！","要不要喝杯咖啡？","還有好多地方可以去！"],
    evening:["今天玩得開心嗎？","夜晚也很好拍 ♡","差不多準備回飯店囉～"],
    late:["今天已經走很多了。","明天再繼續！","晚安 ♡"]
  }
};
const USAGI_VOICE_LINES=[
  "蛤？","嗚拉","呀哈！","嗚拉呀哈呀哈嗚拉～","哼～？","噗嚕"
];
const USAGI_VOICE_ART={
  "蛤？":"./usagi_think.png?v=430",
  "嗚拉":"./usagi_excited.png?v=430",
  "呀哈！":"./usagi_success.png?v=430",
  "嗚拉呀哈呀哈嗚拉～":"./usagi_dash.png?v=430",
  "哼～？":"./usagi_think.png?v=430",
  "噗嚕":"./usagi_sticker.png?v=430"
};
const usagiVoiceState={tapCount:0};
const usagiVoiceImageState=new WeakMap();

function isUsagiVoiceLine(msg){
  return USAGI_VOICE_LINES.includes(msg);
}
function pickUsagiVoice(){
  return pickLine(USAGI_VOICE_LINES,"呀哈！");
}
function shouldUseUsagiVoice(context=""){
  // v4.9: the special Usagi sounds must be discoverable, not buried by context.
  // Every second Usagi tap is guaranteed to use the voice deck.
  usagiVoiceState.tapCount+=1;
  return usagiVoiceState.tapCount%2===0;
}
function flashUsagiVoiceArt(el,msg,context=""){
  if(!el||!isUsagiVoiceLine(msg)||context==="weather")return;
  const img=el.matches?.("img")?el:el.querySelector?.("img");
  if(!img)return;
  const next=USAGI_VOICE_ART[msg];
  if(!next)return;

  const prev=usagiVoiceImageState.get(img);
  if(prev?.timer)clearTimeout(prev.timer);
  const original=prev?.original||img.getAttribute("src");
  usagiVoiceImageState.set(img,{original,timer:null});

  img.classList.add("usagi-voice-face");
  img.src=next;
  const timer=setTimeout(()=>{
    const state=usagiVoiceImageState.get(img);
    if(state?.original)img.src=state.original;
    img.classList.remove("usagi-voice-face");
    usagiVoiceImageState.delete(img);
  },1450);
  usagiVoiceImageState.set(img,{original,timer});
}

const dialogueDecks=new WeakMap();
function pickLine(list,fallback=""){
  if(!Array.isArray(list)||!list.length)return fallback;
  let deck=dialogueDecks.get(list);
  if(!deck||!deck.length){
    deck=Array.from({length:list.length},(_,i)=>i);
    for(let i=deck.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [deck[i],deck[j]]=[deck[j],deck[i]];
    }
    dialogueDecks.set(list,deck);
  }
  return list[deck.pop()];
}
function japanHour(){
  try{
    return Number(new Intl.DateTimeFormat("en-US",{timeZone:TRIP?.timezone||"Asia/Tokyo",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
  }catch{return new Date().getHours()}
}
function timeDialogue(){
  const h=japanHour();
  if(h<11)return BUDDY_DIALOG.time.morning;
  if(h<17)return BUDDY_DIALOG.time.afternoon;
  if(h<22)return BUDDY_DIALOG.time.evening;
  return BUDDY_DIALOG.time.late;
}
function buddyToneForContext(context){
  return ({weather:"weather",food:"food",booking:"booking",shop:"shop",money:"money",note:"note",hotel:"hotel",day:"day",duo:"duo"})[context]||"";
}
function toast(msg,tone=""){
  const t=$("#toast"); if(!t)return;
  t.textContent=msg;t.dataset.tone=tone||"";
  t.classList.remove("show");void t.offsetWidth;t.classList.add("show");
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>{t.classList.remove("show");setTimeout(()=>{t.dataset.tone=""},220)},1900);
}

function showBuddySpeech(el,msg,tone="duo"){
  const bubble=$("#buddySpeechBubble");
  if(!bubble||!el){toast(msg,tone);return;}
  const rect=el.getBoundingClientRect();
  const vw=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
  const safeHalf=Math.min(112,Math.max(82,(vw-24)/2));
  const center=rect.left+rect.width/2;
  const x=Math.max(12+safeHalf,Math.min(vw-12-safeHalf,center));
  const below=rect.top<118;
  bubble.textContent=msg;
  bubble.dataset.tone=tone||"duo";
  bubble.classList.remove("show","below");
  bubble.style.left=`${x}px`;
  bubble.style.top=`${below?Math.min(rect.bottom+9,window.innerHeight-90):Math.max(rect.top-9,62)}px`;
  if(below)bubble.classList.add("below");
  void bubble.offsetWidth;
  bubble.classList.add("show");
  clearTimeout(showBuddySpeech._t);
  showBuddySpeech._t=setTimeout(()=>{
    bubble.classList.remove("show","below");
    setTimeout(()=>{bubble.dataset.tone="";bubble.textContent=""},180);
  },3000);
}
function buddyMoodFor(kind,msg=""){
  if(kind==="usagi"&&/(蛤|哼～|噗嚕)/.test(msg))return "question";
  if(kind==="usagi"&&/(嗚拉|呀哈|衝|！！|!)/.test(msg))return "chaos";
  if(kind==="purin")return "soft";
  return "pop";
}
function animateBuddyMood(el,kind,msg){
  if(!el)return;
  const mood=buddyMoodFor(kind,msg);
  ["buddy-react-soft","buddy-react-chaos","buddy-react-question","buddy-react-pop"].forEach(c=>el.classList.remove(c));
  void el.offsetWidth;
  el.classList.add(`buddy-react-${mood}`);
  setTimeout(()=>el.classList.remove(`buddy-react-${mood}`),620);
}

function isBuddyTheme(){return document.documentElement.dataset.theme==="buddy"}
function buddySparkBurst(x=50,y=45,tone="duo"){
  if(!isBuddyTheme()) return;
  const layer=$("#buddySparkLayer"); if(!layer)return;
  const glyphs={
    weather:["•","✦","•","·","✦","•","·"],
    food:["♡","✦","♡","♥","✦","♡","♥"],
    booking:["✦","!","★","✦","!","★","✦"],
    shop:["✦","★","✧","✦","★","✧","✦"],
    money:["¥","✦","¥","✧","¥","✦","✧"],
    note:["✎","♡","✦","✎","♡","✧","✦"],
    hotel:["♡","✦","☾","♡","✧","☾","♡"],
    day:["✦","✧","★","♡","✦","★","✧"],
    duo:["✦","✧","★","✦","♡","✧","★"]
  };
  const parts=glyphs[tone]||glyphs.duo;
  layer.dataset.tone=tone;
  layer.innerHTML=parts.map((p,i)=>`<i style="--i:${i};--x:${x+(i-3)*7}%;--y:${y+(i%2?3:-3)}%">${p}</i>`).join("");
  layer.classList.remove("play"); void layer.offsetWidth; layer.classList.add("play");
  setTimeout(()=>{layer.classList.remove("play");layer.innerHTML="";layer.dataset.tone=""},1100);
}
function buddyCelebrate(text="完成！",image="./buddy_success.png?v=430",tone="duo"){
  if(!isBuddyTheme())return;
  const wrap=$("#buddyCelebration"),img=$("#buddyCelebrateImg"),label=$("#buddyCelebrateText"); if(!wrap)return;
  img.src=image; label.textContent=text; wrap.dataset.tone=tone; wrap.classList.remove("show"); void wrap.offsetWidth; wrap.classList.add("show"); buddySparkBurst(50,42,tone);
  clearTimeout(buddyCelebrate._t); buddyCelebrate._t=setTimeout(()=>{wrap.classList.remove("show");wrap.dataset.tone=""},1450);
}
function inferBuddyContext(el){
  if(!el)return "";
  if(el.dataset?.buddyContext)return el.dataset.buddyContext;
  if(el.closest?.("#daySceneCard"))return "day";
  if(el.closest?.("#weatherCard"))return "weather";
  if(el.closest?.("#foodView,#foodNearbyModal"))return "food";
  if(el.closest?.("#bookingPanel,.decision-card"))return "booking";
  if(el.closest?.("#shoppingPanel"))return "shop";
  if(el.closest?.("#expensePanel"))return "money";
  if(el.closest?.("#notePanel"))return "note";
  if(el.closest?.("#hotelReturnCard"))return "hotel";
  return "";
}
function weatherDialogue(){
  const slot=$("#weatherBuddySlot");
  if(slot?.classList.contains("is-rain"))return BUDDY_DIALOG.weather.rain;
  const icon=$("#weatherIcon")?.textContent||"";
  const desc=$("#weatherDesc")?.textContent||"";
  if(/☀|晴|sun/i.test(icon+" "+desc))return BUDDY_DIALOG.weather.sunny;
  return BUDDY_DIALOG.weather.cloudy;
}
function bookingHasUrgent(){
  if(!TRIP?.bookingTasks?.length)return false;
  const now=Date.now();
  return TRIP.bookingTasks.some(t=>{
    if(taskDone(t)||!t.deadline)return false;
    const diff=new Date(t.deadline).getTime()-now;
    return diff>0&&diff<=24*3600000;
  });
}
function buddyDialogueFor(kind,context){
  if(context==="day")return pickLine(BUDDY_DIALOG.day[state?.dayIndex]||BUDDY_DIALOG.duo);
  if(context==="weather")return pickLine(weatherDialogue());
  if(context==="food"){
    if(kind==="purin")return pickLine(BUDDY_DIALOG.food.purin);
    if(kind==="usagi")return pickLine(BUDDY_DIALOG.food.usagi);
    return pickLine([...BUDDY_DIALOG.food.purin,...BUDDY_DIALOG.food.usagi]);
  }
  if(context==="booking"){
    if(kind==="usagi"&&bookingHasUrgent())return pickLine(BUDDY_DIALOG.booking.urgent);
    return pickLine(BUDDY_DIALOG.booking.reminder);
  }
  if(context==="shop"){
    if(kind==="purin")return pickLine([...BUDDY_DIALOG.shop.purin,...BUDDY_DIALOG.shop.general]);
    return pickLine(BUDDY_DIALOG.shop.general);
  }
  if(context==="money")return pickLine(BUDDY_DIALOG.money);
  if(context==="note")return pickLine(BUDDY_DIALOG.note);
  if(context==="hotel"){
    return pickLine(japanHour()>=21?BUDDY_DIALOG.hotel.late:BUDDY_DIALOG.hotel.normal);
  }
  if(kind==="duo")return pickLine(BUDDY_DIALOG.duo);
  // Generic character taps occasionally react to Japan-local time so the app feels alive.
  if(Math.random()<0.28)return pickLine(timeDialogue());
  return pickLine(kind==="purin"?BUDDY_DIALOG.purin:BUDDY_DIALOG.usagi);
}
function buddyReact(kind,el){
  if(!isBuddyTheme())return;
  const context=inferBuddyContext(el);
  const baseTone=buddyToneForContext(context)||"duo";
  const now=Date.now();
  buddyReact.last=buddyReact.last||{kind:"",time:0,context:""};
  const prev=buddyReact.last;

  if(kind==="duo"){
    const msg=buddyDialogueFor("duo",context);
    animateBuddyMood(el,"duo",msg);
    showBuddySpeech(el,msg,baseTone);
    buddySparkBurst(50,44,baseTone);
    buddyReact.last={kind:"",time:0,context:""};
    return;
  }

  if(prev.kind && prev.kind!==kind && now-prev.time<1800){
    const msg=pickLine(BUDDY_DIALOG.duo);
    animateBuddyMood(el,"duo",msg);
    showBuddySpeech(el,msg,"duo");
    buddySparkBurst(50,44,"duo");
    buddyReact.last={kind:"",time:0,context:""};
    return;
  }

  let msg;
  let tone=baseTone;

  if(kind==="usagi" && shouldUseUsagiVoice(context)){
    msg=pickUsagiVoice();
    tone="voice";
  }else{
    msg=buddyDialogueFor(kind,context);
  }

  animateBuddyMood(el,kind,msg);
  if(kind==="usagi")flashUsagiVoiceArt(el,msg,context);
  showBuddySpeech(el,msg,tone);
  if(context||kind==="usagi")buddySparkBurst(50,44,tone);
  buddyReact.last={kind,time:now,context};

  // Timeline companions unlock one explicit duo easter egg after enough taps in a day.
  if(el?.classList?.contains("event-buddy")){
    const key=`buddyTrail:${state.dayIndex}:${localDateKey()}`;
    buddyReact.trail=buddyReact.trail||{};
    const count=(buddyReact.trail[key]||0)+1;
    buddyReact.trail[key]=count;
    if(count===5){
      setTimeout(()=>{
        buddyCelebrate("我們是鴨寶幫！","./buddy_celebrate.png?v=430","duo");
      },520);
    }
  }
}

function buddyPeek(kind="purin"){
  if(!isBuddyTheme())return;
  const layer=$("#buddyPeekLayer"); if(!layer)return;
  const now=Date.now(), cooldown=6000;
  buddyPeek._last=buddyPeek._last||{};
  if(now-(buddyPeek._last[kind]||0)<cooldown)return;
  buddyPeek._last[kind]=now;
  clearTimeout(buddyPeek._timer);
  const src=kind==="purin"?"./purin_peek_edge.png?v=430":"./usagi_peek.png?v=430";
  layer.innerHTML=`<img class="peek-${kind}" src="${src}" alt="">`;
  layer.className=`buddy-peek-layer buddy-only-art ${kind}`;
  requestAnimationFrame(()=>requestAnimationFrame(()=>layer.classList.add("show")));
  buddyPeek._timer=setTimeout(()=>{layer.classList.remove("show");setTimeout(()=>{layer.className="buddy-peek-layer buddy-only-art";layer.innerHTML=""},480)},2400);
}
function dailySceneAsset(index){
  return `./day-scene-v52-${String(index+1).padStart(2,"0")}.webp?v=520`;
}
function renderDailyScene(){
  const img=$("#daySceneImage"), bar=$("#daySceneProgressBar");
  if(!img)return;
  const src=dailySceneAsset(state.dayIndex);
  if(img.getAttribute("src")!==src) img.src=src;
  img.alt=`D${state.dayIndex+1} 布丁狗與烏薩奇旅行主題插畫`;
  if(bar) bar.style.width=`${((state.dayIndex+1)/TRIP.days.length)*100}%`;
}


function updateWeatherBuddy(hasRain=false){
  const el=$("#weatherBuddySlot"); if(!el)return;
  el.classList.toggle("is-rain",!!hasRain);
  el.innerHTML=`<img class="weather-usagi-rain buddy-reactable" data-buddy-react="usagi" data-buddy-context="weather" src="./weather-rain-usagi-v47.webp?v=470" alt="雨衣烏薩奇">`;
}


function localDateKey(){ return japanToday(); }
function maybePurinWalkEgg(){
  if(!isBuddyTheme())return;
  const key=`buddyWalk:${localDateKey()}`;
  try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1")}catch{}
  const el=$("#purinWalkEgg"); if(!el)return;
  const delay=4500+Math.floor(Math.random()*3500);
  setTimeout(()=>{
    if(!isBuddyTheme())return;
    el.classList.remove("play"); void el.offsetWidth; el.classList.add("play");
    toast(BUDDY_DIALOG.egg[4],"duo");
    setTimeout(()=>el.classList.remove("play"),10500);
  },delay);
}
function maybeUrgentBookingEgg(){
  if(!isBuddyTheme()||!TRIP?.bookingTasks?.length)return;
  const now=Date.now();
  const urgent=TRIP.bookingTasks.find(t=>{
    if(taskDone(t)||!t.deadline)return false;
    const diff=new Date(t.deadline).getTime()-now;
    return diff>0&&diff<=24*3600000;
  });
  if(!urgent)return;
  const key=`buddyUrgent:${urgent.id}:${localDateKey()}`;
  try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1")}catch{}
  const el=$("#usagiUrgentEgg"); if(!el)return;
  setTimeout(()=>{
    if(!isBuddyTheme())return;
    el.classList.remove("play"); void el.offsetWidth; el.classList.add("play");
    toast(pickLine(BUDDY_DIALOG.booking.urgent),"booking");
    setTimeout(()=>el.classList.remove("play"),2100);
  },1800);
}

function maybeTripStartEgg(){
  if(!isBuddyTheme()||japanToday()!==OFFICIAL_TRIP_START)return;
  const key=`buddyTripStart:${OFFICIAL_TRIP_START}`;
  try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1")}catch{}
  setTimeout(()=>buddyCelebrate(BUDDY_DIALOG.egg[11],"./buddy_celebrate.png?v=430","day"),900);
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

function renderDayBrief(day){
  const box=$("#dayBrief");
  if(!box) return;
  const alertHtml=day.alert?`<div class="day-alert">${esc(day.alert)}</div>`:"";
  const items=(day.brief||[]).map(x=>`<li>${esc(x)}</li>`).join("");
  const rainHtml=day.rainPlan?`<div class="rain-plan"><b>☔ 雨天備案</b><span>${esc(day.rainPlan)}</span></div>`:"";
  const hasContent=!!(day.alert||items||day.rainPlan);
  box.innerHTML=hasContent
    ? `<div class="day-brief-head-v44"><div class="brief-title">今日提醒</div><img class="brief-tip-art buddy-only-art" src="./ui-purin-tip.webp?v=440" alt=""></div>${alertHtml}${items?`<ul>${items}</ul>`:""}${rainHtml}`
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
async function chooseDecision(id, option){
  state.decisions[id]=option;
  saveLocal("decisions",state.decisions);
  if(state.cloud){try{await setCloud("decisions",state.decisions)}catch{}}
  renderSchedule();
  buddyCelebrate("決定好啦！","./usagi_success.png?v=430");
}
function renderDecisionCards(day){
  const ids=day.decisionIds||[];
  if(!ids.length)return "";
  return `<div class="decision-stack">${ids.map(id=>{
    const d=TRIP.decisions.find(x=>x.id===id); if(!d)return "";
    const selected=selectedDecision(id);
    const checklist=(d.checklist||[]).length?`<div class="decision-checks">${d.checklist.map(x=>`<div>□ ${esc(x)}</div>`).join("")}</div>`:"";
    return `<section class="decision-card">
      <img class="decision-usagi-art buddy-only-art buddy-reactable" data-buddy-react="usagi" data-buddy-context="booking" src="./usagi_think.png?v=430" alt="烏薩奇">
      <div class="decision-kicker">行程選擇</div>
      <h3>${esc(d.title)}</h3>
      <p>${esc(d.hint||"")}</p>
      ${checklist}
      <div class="decision-options">${d.options.map(o=>`
        <button class="decision-option ${selected===o.id?"selected":""}" data-decision-id="${esc(d.id)}" data-decision-option="${esc(o.id)}">
          <span class="decision-icon">${esc(o.icon||"→")}</span>
          <span><b>${esc(o.label)}</b><small>${esc(o.detail||"")}</small></span>
          <em>${selected===o.id?"已選":"選擇"}</em>
        </button>`).join("")}
      </div>
    </section>`;
  }).join("")}</div>`;
}
function eventVisible(e){
  if(!e.decisionId)return true;
  const selected=selectedDecision(e.decisionId);
  return !selected || selected===e.optionId;
}

function renderDays(){
  $("#dayStrip").innerHTML=TRIP.days.map((d,i)=>`
    <button class="day-btn ${i===state.dayIndex?"active":""}" data-day="${i}">
      <span class="weekday">週${"日一二三四五六"[new Date(d.date+"T00:00:00+09:00").getDay()]}</span><span class="date">${d.shortDate.slice(3)}</span><span class="d">D${i+1}</span>
    </button>`).join("");
  const active=$("#dayStrip .active"); if(active) active.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
}
function buddyRole(e){
  const text=`${e.category||""} ${e.title||""} ${e.status||""}`;
  if(/早餐|午餐|晚餐|咖啡|甜點|住宿|Chill|休息|泡湯|Buffet|飯店|Check-in|放空|星空/.test(text)) return "purin";
  if(/搶|預約|決策|時間控制|購物|補貨|GUNDAM|交通決策|排隊|租車|還車|航班|固定|必守/.test(text)) return "usagi";
  return "";
}

function buddyDecorForEvent(e){
  const text=`${e.category||""} ${e.title||""} ${e.status||""}`;
  if(/早餐|午餐|晚餐|咖啡|甜點|住宿|休息|飯店|泡湯|Buffet|放空/.test(text)) return "";
  if(/Marine World|水族館|海豹|海豚/.test(text)) return "🐬";
  if(/夕陽|日落|百道|海/.test(text)) return "☁️";
  if(/搶票|預約|固定|強制|決策|還車|租車|GUNDAM|購物|補貨/.test(text)) return "";
  return "";
}
function renderBuddyDashboard(day, visibleEvents){
  const dash=$("#buddyDashboard");
  if(!dash) return;
  $("#buddyTodayDate").textContent=day.shortDate;
  const todayItems=visibleEvents.slice(0,4).map(e=>`
    <div class="buddy-mini-item">
      <span class="t">${esc(e.time)}</span>
      <div class="c"><b>${esc(e.title)}</b>${buddyDecorForEvent(e)?`<em>${buddyDecorForEvent(e)}</em>`:""}</div>
    </div>`).join("");
  $("#buddyTodayList").innerHTML=todayItems || `<div class="buddy-empty">今天先輕鬆走。</div>`;

  const mustKeep=visibleEvents.filter(e=>/(已訂|✅|預約|固定|強制|必守|新幹線|租車|還車|划船|晚餐|午餐)/.test(`${e.status||""} ${e.title||""} ${e.category||""}`));
  const focusItems=(mustKeep.length?mustKeep.slice(0,3):(day.brief||[]).slice(0,3).map(text=>({title:text, time:"提醒", category:"摘要"})));
  $("#buddyFocusList").innerHTML=focusItems.map(item=>`
    <div class="buddy-focus-item">
      <span>${esc(item.time||item.category||"提醒")}</span>
      <b>${esc(item.title||item)}</b>
    </div>`).join("") || `<div class="buddy-empty">今天沒有特別的硬性任務。</div>`;

  const notes=[...(day.brief||[])];
  if(day.rainPlan) notes.push(`☔ 雨天備案：${day.rainPlan}`);
  $("#buddyReminderList").innerHTML=(notes.slice(0,3).map(x=>`<div class="buddy-reminder-item">${esc(x)}</div>`).join("")) || `<div class="buddy-empty">今天沒有額外提醒。</div>`;
}

function syncBuddyWeather(){
  const mini=$("#buddyWeatherMini"); if(!mini) return;
  const loc=$("#weatherLocation")?.textContent || "天氣";
  const temp=$("#weatherTemp")?.textContent || "—";
  const desc=$("#weatherDesc")?.textContent || "—";
  const icon=$("#weatherIcon")?.textContent || "☁️";
  const rain=$("#rainBox")?.textContent || "";
  mini.innerHTML=`<div class="buddy-weather-top"><span class="icon">${icon}</span><div><b>${loc}</b><span>${temp}</span></div></div><div class="buddy-weather-desc">${desc}</div>${rain?`<div class="buddy-weather-rain">${esc(rain)}</div>`:""}`;
  const m=temp.match(/(\d+)[°]?/);
  $("#buddyTopWeather").textContent=`${loc.split(" · ")[0]} ${m?m[1]+"°":"—"}`;
}


function mapDirections(q){return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`}
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
  box.innerHTML=`<div class="hotel-return-copy"><span class="eyebrow">${label}</span><h3>${esc(cleanHotelTitle(hotel.title))}</h3><p>${help}</p><a class="hotel-nav-btn" target="_blank" rel="noopener" href="${mapDirections(hotel.nav||hotel.title)}">↗ 導航回飯店</a></div><div class="hotel-return-art buddy-only-art buddy-reactable" data-buddy-react="duo" data-buddy-context="hotel"><img src="./hotel-return-duo.webp?v=460" alt="布丁狗與烏薩奇回飯店休息"></div>`;
}


const EVENT_BUDDY_ASSETS={
  purin:["./mini-purin-hero.webp","./mini-purin-clap.webp","./mini-purin-surprise.webp","./mini-purin-lie.webp"],
  usagi:["./mini-usagi-excited.webp","./mini-usagi-point.webp","./mini-usagi-success.webp","./mini-usagi-sticker.webp"]
};
function eventBuddySpec(e,index){
  const text=`${e.category||""} ${e.title||""} ${e.status||""} ${e.note||""}`;
  let kind=index%2===0?"purin":"usagi";
  let context="day";

  if(/早餐|午餐|晚餐|咖啡|甜點|餐廳|Buffet|赤牛|牛排|燒鳥|すき焼き|美食|吃/.test(text)){
    kind="purin";context="food";
  }else if(/購物|補貨|PARCO|天神|大名|Canal|AMU|LaLaport|GUNDAM|店|逛/.test(text)){
    kind="usagi";context="shop";
  }else if(/住宿|飯店|Hotel|Check-in|入住|泡湯|大浴場|休息|放空|星空/.test(text)){
    kind="purin";context="hotel";
  }else if(/預約|搶|新幹線|由布院之森|租車|還車|航班|機場|划船|報到|固定|必守|交通/.test(text)){
    kind="usagi";context="booking";
  }

  const pool=EVENT_BUDDY_ASSETS[kind];
  const img=pool[(state.dayIndex+index)%pool.length];
  return {kind,context,img};
}
function eventBuddyHtml(e,index){
  const b=eventBuddySpec(e,index);
  const who=b.kind==="purin"?"布丁狗":"烏薩奇";
  return `<button type="button" class="event-buddy buddy-only-art buddy-reactable" data-buddy-react="${b.kind}" data-buddy-context="${b.context}" aria-label="和${who}聊聊"><img src="${b.img}" alt="${who}"></button>`;
}


const GUIDE_COACH_KEY="kyushu-guide-coach-v53";
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
function guideMascot(kind="duo"){
  if(kind==="purin")return {src:"./purin_tip.png?v=430",alt:"布丁狗"};
  if(kind==="usagi")return {src:"./usagi_point.png?v=430",alt:"烏薩奇"};
  return {src:"./buddy_hero.png?v=430",alt:"布丁狗與烏薩奇"};
}
function eventGuideMascot(e){
  const text=`${e?.category||""} ${e?.title||""}`;
  if(/餐|咖啡|甜點|吃|飯店|住宿|休息|泡湯/i.test(text))return "purin";
  if(/購物|店|PARCO|Canal|AMU|LaLaport|預約|交通|票|車|機場/i.test(text))return "usagi";
  return "duo";
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
    mascot:saved?.mascot||eventGuideMascot(e),
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
    meta:`${d?.shortDate||""} · 今日總攻略`, mascot:saved?.mascot||"duo",
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
function pendingGuideNoteCount(){return Object.keys(state?.guideNotePending||{}).length}
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
  const art=guideMascot(data.mascot);
  const mascot=$("#guideMascot"); mascot.src=art.src;mascot.alt=art.alt;
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
  try{localStorage.setItem(GUIDE_COACH_KEY,"1")}catch{}
  hideGuideCoach();
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
function hideGuideCoach(){const c=$("#guideCoach");if(c)c.hidden=true}
function maybeShowGuideCoach(){
  let used=false;try{used=localStorage.getItem(GUIDE_COACH_KEY)==="1"}catch{}
  const c=$("#guideCoach");if(!c||used){if(c)c.hidden=true;return}
  c.hidden=false;clearTimeout(maybeShowGuideCoach._t);maybeShowGuideCoach._t=setTimeout(()=>{if(c)c.hidden=true},6500);
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
  el.addEventListener("contextmenu",e=>{if(el.classList.contains("guide-pressing")||el.classList.contains("guide-ready"))e.preventDefault()});
}
function bindGuideTargets(visibleEvents=[]){
  $$("#timeline .event-card").forEach((card,i)=>bindSafeHold(card,()=>openGuide(buildEventGuide(visibleEvents[i]))));
  const dayScene=$("#daySceneCard");if(dayScene)bindSafeHold(dayScene,()=>openGuide(buildDayGuide()),{allowInteractiveRoot:true});
  maybeShowGuideCoach();
}

function renderSchedule(){
  const d=TRIP.days[state.dayIndex];
  renderWeather(d);
  $("#dayNumber").textContent=`D${state.dayIndex+1}`;
  $("#dayTitle").textContent=d.title;
  $("#daySubtitle").textContent=d.subtitle;
  renderDayBrief(d);
  renderDailyScene();
  $("#decisionArea").innerHTML=renderDecisionCards(d);
  const visibleEvents=d.events.filter(eventVisible);
  $("#timeline").innerHTML=visibleEvents.map((e,i)=>`
    <article class="event ${buddyRole(e)?`buddy-${buddyRole(e)}`:""}">
      <span class="event-dot"></span>
      ${i>0 && e.travel?`<div class="travel">${esc(e.transport||"→")} ${esc(e.travel)}</div>`:""}
      <div class="event-card" data-guide-enabled="1">
        <div class="event-top"><h3 class="event-title">${esc(e.title)}</h3><span class="tag">${esc(e.category||"行程")}</span></div>
        <div class="event-time">${esc(e.time)}</div>
        ${renderEventExtras(e)}
        ${e.note?`<div class="event-note">${esc(e.note)}</div>`:""}
        <div class="event-footer ${e.noNav?"buddy-only-footer":""}">
          ${e.noNav?"":`<a class="nav-link" target="_blank" rel="noopener" href="${mapNav(e.nav||e.title,weatherMode(e))}">↗ Google Maps 導航</a>`}
          ${eventBuddyHtml(e,i)}
        </div>
      </div>
    </article>`).join("");
  renderHotelReturnCard();
  renderWeather(d);
  requestAnimationFrame(()=>bindGuideTargets(visibleEvents));
}
async function renderWeather(d){
  const card=$("#weatherCard");card.classList.add("skeleton");
  $("#weatherLocation").textContent=d.location+" · "+d.shortDate;
  $("#weatherTemp").textContent="載入中";
  $("#weatherDesc").textContent="正在取得旅行日期預報";
  $("#weatherIcon").textContent="☁️";$("#rainBox").innerHTML="";
  try{
    const w=await getWeather(d);
    if(w.state!=="forecast"){
      $("#weatherTemp").textContent="—";
      $("#weatherDesc").textContent=w.message;
      $("#rainBox").innerHTML="進入預報範圍後，這裡會顯示高低溫、降雨機率與預計下雨時段。"; updateWeatherBuddy(false);
    }else{
      $("#weatherIcon").textContent=w.icon;
      $("#weatherTemp").textContent=w.current!==null?`${w.current}° · ${w.high}° / ${w.low}°`:`${w.high}° / ${w.low}°`;
      $("#weatherDesc").textContent=`${w.desc} · 全日最高降雨機率 ${w.rainMax}%`;
      if(w.rainGroups.length){
        $("#rainBox").innerHTML=w.rainGroups.slice(0,2).map(g=>`<div class="rain-alert">🌧️ 預計 ${g.start}–${g.end} 有雨 · 最高 ${g.maxProb}%</div>`).join(""); updateWeatherBuddy(true);
      }else { $("#rainBox").innerHTML="☂️ 目前預報沒有明顯連續降雨時段。"; updateWeatherBuddy(false); }
    }
  }catch(e){
    $("#weatherTemp").textContent="—";$("#weatherDesc").textContent="天氣暫時無法更新";
    $("#rainBox").textContent="保留上次行程資料；網路恢復後重新切換日期即可再抓。"; updateWeatherBuddy(false);
  }finally{card.classList.remove("skeleton")}
}

function renderFood(){
  $("#plannedFood").innerHTML=TRIP.plannedFood.map(i=>`
    <article class="planned-food-card buddy-food-card food-plan-card-v46">
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
async function toggleBookingTask(id){
  const task=TRIP.bookingTasks.find(t=>t.id===id); if(!task)return;
  const wasDone=taskDone(task);
  state.taskStatus[id]=!wasDone;
  saveLocal("taskStatus",state.taskStatus);
  if(state.cloud){try{await setCloud("taskStatus",state.taskStatus)}catch{}}
  renderBookings();
  if(!wasDone){
    const allDone=TRIP.bookingTasks.every(taskDone);
    buddyCelebrate(allDone?pickLine(BUDDY_DIALOG.booking.all):pickLine(BUDDY_DIALOG.booking.complete),allDone?"./buddy_celebrate.png?v=430":"./usagi_success.png?v=430","booking");
  }
}
function bookingTaskCard(t){
  const done=taskDone(t);
  return `<div class="task-card ${done?"done":"buddy-task-pending"}">
    <button class="task-check" data-task-id="${esc(t.id)}" aria-label="${done?"標記未完成":"標記完成"}">${done?"✓":"○"}</button>
    <div class="task-body">
      <div class="task-top"><span>${esc(t.type)}</span><b>${esc(t.when||"")}</b></div>
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-detail">${esc(t.detail||"")}</div>
      ${!done?`<div class="task-countdown">${esc(countdownText(t))}</div>`:""}
      ${t.map?`<a class="mini-action-link" target="_blank" rel="noopener" href="${mapSearch(t.map)}">↗ 位置</a>`:""}
    </div>
  </div>`;
}
function renderBookings(){
  const pending=TRIP.bookingTasks.filter(t=>!taskDone(t));
  const done=TRIP.bookingTasks.filter(taskDone);
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
    </div>`).join(""):`<div class="empty">目前沒有購物項目。</div>`;
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
      </div><button class="mini-btn" data-delete-expense="${i.id}">刪</button></div></div>`).join(""):`<div class="empty">還沒有記帳紀錄。</div>`;
}
function renderNotes(){ $("#notesArea").value=state.notes||""; }
function renderTools(){renderBookings();renderShopping();renderExpenses();renderNotes()}
function renderAll(){renderDays();renderSchedule();renderFood();renderTools()}

function switchView(v){
  state.view=v;
  $$(".view").forEach(x=>x.classList.toggle("active",x.id===`${v}View`));
  $$(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  $$(".buddy-top-item").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  window.scrollTo({top:0,behavior:"smooth"});
  if(v==="food") setTimeout(()=>buddyPeek("purin"),450);
  if(v==="tools") setTimeout(()=>buddyPeek("usagi"),450);
}
function switchTool(t){
  state.tool=t;
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
  }else if(type==="shopping"){
    await cloudAdd("shopping",{...base,owner:fd.get("owner"),amount:Number(fd.get("amount")||0),shop:fd.get("shop")?.trim(),day:fd.get("day")?.trim(),checked:false}); renderShopping();
  }else{
    const participants=fd.getAll("participants");
    await cloudAdd("expenses",{...base,amount:Number(fd.get("amount")||0),payer:fd.get("payer"),participants,date:fd.get("date")||japanToday()});renderExpenses();
  }
  $("#formModal").close();e.currentTarget.reset();toast("已儲存");
}


const DISPLAY_THEME_KEY="kyushu-oct-2026:displayTheme";
const FONT_SIZE_KEY="kyushu-oct-2026:fontSize";
const THEME_META={travel:"#A8673F",sea:"#58788C",wa:"#874B43",buddy:"#E0A93A"};

function getDisplaySetting(key,fallback){
  try{return localStorage.getItem(key)||fallback}catch{return fallback}
}
function applyDisplaySettings(){
  const theme=getDisplaySetting(DISPLAY_THEME_KEY,"travel");
  const fontSize=getDisplaySetting(FONT_SIZE_KEY,"standard");
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.fontSize=fontSize;
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
  if(!["travel","sea","wa","buddy"].includes(theme))return;
  try{localStorage.setItem(DISPLAY_THEME_KEY,theme)}catch{}
  applyDisplaySettings();
  if(theme==="buddy"){setTimeout(()=>buddySparkBurst(50,32),120);setTimeout(()=>maybePurinWalkEgg(),900)}
}
function setFontSize(size){
  if(!["standard","large","xlarge"].includes(size))return;
  try{localStorage.setItem(FONT_SIZE_KEY,size)}catch{}
  applyDisplaySettings();
}

function bind(){
  if(appBound)return; appBound=true;
  document.addEventListener("click",async e=>{
    const buddyReaction=e.target.closest("[data-buddy-react]");
    if(buddyReaction){buddyReact(buddyReaction.dataset.buddyReact,buddyReaction);}
    const themeChoice=e.target.closest("[data-theme-choice]");if(themeChoice){setDisplayTheme(themeChoice.dataset.themeChoice);return}
    const fontChoice=e.target.closest("[data-font-choice]");if(fontChoice){setFontSize(fontChoice.dataset.fontChoice);return}
    const d=e.target.closest("[data-day]");if(d){state.dayIndex=Number(d.dataset.day);renderDays();renderSchedule();return}
    const n=e.target.closest("[data-view]");if(n){switchView(n.dataset.view);return}
    const t=e.target.closest("[data-tool]");if(t){switchTool(t.dataset.tool);return}
    const o=e.target.closest("[data-open-modal]");if(o){openModal(o.dataset.openModal);return}
    const m=e.target.closest("[data-member]");if(m){state.shoppingMember=m.dataset.member;renderShopping();return}
    const decision=e.target.closest("[data-decision-id]");if(decision){await chooseDecision(decision.dataset.decisionId,decision.dataset.decisionOption);return}
    const task=e.target.closest("[data-task-id]");if(task){await toggleBookingTask(task.dataset.taskId);return}
    for(const [attr,key,render] of [["data-check-food","foods",renderFood],["data-check-shopping","shopping",renderShopping]]){
      const x=e.target.closest(`[${attr}]`);if(x){const id=x.getAttribute(attr);const before=state[key].find(i=>i.id===id)?.checked;await toggleItem(key,id);render();if(!before)buddyCelebrate(key==="foods"?pickLine(BUDDY_DIALOG.food.complete):pickLine(BUDDY_DIALOG.shop.complete),key==="foods"?"./purin_clap.png?v=430":"./buddy_success.png?v=430",key==="foods"?"food":"shop");return}
    }
    for(const [attr,key,render] of [["data-delete-food","foods",renderFood],["data-delete-shopping","shopping",renderShopping],["data-delete-expense","expenses",renderExpenses]]){
      const x=e.target.closest(`[${attr}]`);if(x){await deleteItem(key,x.getAttribute(attr));render();toast("已刪除");return}
    }
  });
  const heroEgg=$("#buddyHeroEgg");
  if(heroEgg){
    const heroImg=heroEgg.querySelector("img");
    const heroGallery=[
      "./hero-cover-v51.webp?v=510",
      "./buddy_hero.png?v=430",
      "./buddy_celebrate.png?v=430",
      "./buddy_chill.png?v=430",
      "./buddy_eat.png?v=430",
      "./buddy_success.png?v=430"
    ];
    let heroIndex=0,taps=0,tapTimer=null,holdTimer=null,holdTriggered=false;
    heroGallery.slice(1).forEach(src=>{const p=new Image();p.src=src;if(p.decode)p.decode().catch(()=>{})});
    const syncDots=()=>{$$("#buddyHeroDots [data-hero-index]").forEach((d,i)=>d.classList.toggle("active",i===heroIndex))};
    const setHero=(idx,animate=true)=>{
      heroIndex=(idx+heroGallery.length)%heroGallery.length;
      if(heroImg){
        heroImg.classList.remove("swap");
        if(animate)void heroImg.offsetWidth;
        heroImg.src=heroGallery[heroIndex];
        if(animate)heroImg.classList.add("swap");
      }
      syncDots();
    };
    const resetTap=()=>{clearTimeout(tapTimer);tapTimer=setTimeout(()=>taps=0,1200)};
    heroEgg.addEventListener("click",()=>{if(holdTriggered){holdTriggered=false;return;}setHero(heroIndex+1);taps++;resetTap();if(taps>=5){taps=0;buddyCelebrate(BUDDY_DIALOG.egg[1],"./buddy_celebrate.png?v=430","duo")}});
    $$("#buddyHeroDots [data-hero-index]").forEach(dot=>dot.addEventListener("click",()=>setHero(Number(dot.dataset.heroIndex))));
    const heroHoldEggs=[
      {text:"鴨寶幫，九州出發！",image:"./buddy_celebrate.png?v=430",tone:"duo"},
      {text:"我們是鴨寶幫！",image:"./buddy_success.png?v=430",tone:"duo"},
      {text:"嗚拉呀哈呀哈嗚拉～",image:"./usagi_dash.png?v=431",tone:"booking"},
      {text:"先吃飽再出發！",image:"./purin_clap.png?v=430",tone:"food"},
      {text:"旅行正式開始 ♡",image:"./buddy_hero.png?v=430",tone:"duo"}
    ];
    bindSafeHold(heroEgg,()=>{holdTriggered=false;const egg=pickLine(heroHoldEggs);buddyCelebrate(egg.text,egg.image,egg.tone)},{ms:760,move:11,allowInteractiveRoot:true});
    syncDots();
  }
  $("#buddyCelebration")?.addEventListener("click",()=>$("#buddyCelebration").classList.remove("show"));
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
  $("#foodNearbyOpen")?.addEventListener("click",()=>$("#foodNearbyModal")?.showModal());
  $("#foodNearbyClose")?.addEventListener("click",()=>$("#foodNearbyModal")?.close());
  $("#foodNearbyModal")?.addEventListener("click",e=>{if(e.target===$("#foodNearbyModal"))$("#foodNearbyModal").close()});
  $("#settingsBtn").addEventListener("click",()=>{$("#settingsModal").showModal();applyDisplaySettings()});
  $("#settingsClose").addEventListener("click",()=>$("#settingsModal").close());
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
    state.notes=e.target.value;saveLocal("notes",state.notes);$("#noteStatus").textContent="本機已儲存";
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
    ["shopping",v=>{if(v!==null){state.shopping=normalizeCloud(v);saveLocal("shopping",state.shopping);renderShopping()}}],
    ["expenses",v=>{if(v!==null){state.expenses=normalizeCloud(v);saveLocal("expenses",state.expenses);renderExpenses()}}],
    ["taskStatus",v=>{if(v && typeof v==="object"){state.taskStatus=v;saveLocal("taskStatus",v);renderBookings()}}],
    ["decisions",v=>{if(v && typeof v==="object"){state.decisions=v;saveLocal("decisions",v);renderSchedule()}}],
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
  // Authoritative trip range: 2026/10/09–2026/10/18.
  // Do not let stale Firebase metadata override the cover date.
  return "10.09 — 10.18";
}
function applyPrivateTripMeta(){
  const title=$("#heroPrivateTitle"); if(title) title.textContent=TRIP.heroTitle||TRIP.title||"私人旅程";
  const date=$("#heroPrivateDate"); if(date) date.textContent=formatTripDate();
  const route=$("#heroPrivateRoute"); if(route) route.textContent=TRIP.heroRoute||"福岡・由布院・阿蘇・高千穗・熊本";
  const season=$("#heroPrivateSeason"); if(season) season.textContent="2026・秋";
  document.title="私人旅程";
}
async function fetchPrivateTrip(){
  const content=await request(`${ROOT}/content`,{method:"GET"});
  if(!content||!content.days) throw new Error("Firebase 尚未匯入私人行程資料");
  return content;
}
async function bootTrip(content,user,{offline=false}={}){
  TRIP=content;
  currentAuthUser=user||null;
  state=createState();
  state.dayIndex=initialDay();
  applyPrivateTripMeta();
  applyDisplaySettings();
  bind();
  renderAll();
  showPrivateApp();
  setTimeout(()=>{maybePurinWalkEgg();maybeUrgentBookingEgg();maybeTripStartEgg()},650);
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
      const reg = await navigator.serviceWorker.register("./sw.js?v=533",{updateViaCache:"none"});
      await reg.update();
    }catch(e){console.warn("Service Worker update failed",e)}
  });
}
