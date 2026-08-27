/* Private travel PWA · Firebase Auth gated content · v5.3.12 Day Buddy Speech Position Fix */

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
  "./weather-rain-usagi-v47.webp?v=470","./weather-sunny-usagi-v536.webp?v=536","./weather-teruteru-usagi-v536.webp?v=536","./weather-cloudy-usagi-v536.webp?v=536","./weather-thunder-usagi-v536.webp?v=536","./weather-snow-usagi-v536.webp?v=536","./booking-check-purin.webp?v=460","./booking-dash-usagi.webp?v=460","./hotel-return-duo.webp?v=460",
  "./egg-sendoff-v539.png?v=539","./egg-cry-v539.png?v=539","./egg-home-sleep-v539.png?v=539",
  "./duck_gang.png?v=5311","./seal_gang.png?v=5311",
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
    taskStatus:loadLocal("taskStatus",{}), decisions:loadLocal("decisions",{}), decisionDrafts:{},
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

const VO=(text)=>({text});
const BUDDY_DIALOG={
  "purin":[
    "一起慢慢走吧～",
    "今天也想跟你一起出去玩♪",
    "先看看四周，再決定下一站～",
    "走累了就坐一下嘛。",
    "我覺得這裡可以多待一會兒～",
    "點心時間是不是快到了？",
    "有舒服的地方就先休息一下♪",
    "今天的步調剛剛好～",
    "先拍一張，再慢慢看～",
    "別急著走嘛，還可以晃一下♪",
    "我想喝點東西了～",
    "今天也有好多小發現耶。",
    "這裡讓人想發呆一下～",
    "要不要找個舒服的位置坐坐？",
    "走慢一點也沒關係呀～",
    "有喜歡的就停下來看看♪",
    "今天的回憶要好好收著～",
    "等等一起吃點好吃的吧。",
    "再散步一下下嘛～",
    "我開始有點睏了……",
    "回去以前再晃一下？",
    "不用把每一站都塞滿喔～",
    "今天也很適合兩個人慢慢玩♪",
    "看到好看的地方就停一下～",
    "先喝一點水，再繼續吧。",
    "我喜歡這種不趕時間的感覺～",
    "照片拍好了嗎？我也想看♪",
    "下一站也一起去吧～",
    "今天有好好享受旅行嗎？",
    "這裡的氣氛好舒服喔～",
    "我想再待五分鐘♪",
    "慢慢來，旅程還在繼續～"
  ],
  "usagi":[
    VO("呀哈！",""),
    VO("呀哈——！",""),
    VO("嗚拉！",""),
    VO("嗚拉拉！",""),
    VO("噗嚕",""),
    VO("噗嚕……",""),
    VO("蛤？",""),
    VO("蛤啊？",""),
    VO("哼～？",""),
    VO("呀哈呀哈！",""),
    VO("嗚拉呀哈！",""),
    VO("嗚拉拉拉——！",""),
    VO("呀哈——呀哈！",""),
    VO("嗚拉！嗚拉！",""),
    VO("噗嚕！",""),
    VO("哼？",""),
    VO("呀哈！嗚拉！",""),
    VO("嗚拉呀哈呀哈～",""),
    VO("呀——哈！",""),
    VO("嗚啦——！",""),
    VO("蛤——？",""),
    VO("噗嚕噗嚕",""),
    VO("呀哈呀哈呀哈！",""),
    VO("嗚拉拉呀哈！","")
  ],
  "duo":[
    "一起去看看吧～　呀哈！",
    "慢慢走也可以喔～　嗚拉！",
    "今天也一起玩吧♪　呀哈——！",
    "先休息一下嘛～　……蛤？",
    "下一站也一起去～　嗚拉！",
    "照片拍好了嗎？　呀哈！",
    "點心時間到了吧～　噗嚕！",
    "今天的步調很好耶～　嗚拉呀哈！",
    "再晃一下下～　呀哈！",
    "累了就休息嘛～　哼～？",
    "一起把今天玩完吧♪　嗚拉！",
    "這裡好舒服喔～　呀哈呀哈！",
    "先看看再決定～　蛤？",
    "今天也多了一個回憶～　嗚拉！",
    "慢慢來就好～　呀哈——！",
    "再拍一張嘛～　噗嚕！",
    "兩個人一起走最好玩～　嗚拉呀哈！",
    "今天也不要太趕喔～　呀哈！",
    "一起回去休息吧～　嗚拉！",
    "鴨寶幫出發～　呀哈！"
  ],
  "weather":{
    "sunny":[
      VO("呀哈！"),
      VO("嗚拉！"),
      VO("呀哈呀哈！"),
      VO("噗嚕♪"),
      VO("嗚拉呀哈！")
    ],
    "rain":[
      VO("噗嚕……"),
      VO("蛤？"),
      VO("嗚拉！"),
      VO("哼～？"),
      VO("呀哈！")
    ],
    "cloudy":[
      VO("蛤？"),
      VO("哼～？"),
      VO("噗嚕……"),
      VO("嗚拉？"),
      VO("呀哈？")
    ],
    "thunder":[
      VO("蛤？！"),
      VO("嗚拉！！"),
      VO("噗嚕……"),
      VO("哼～？"),
      VO("嗚啦——！！")
    ],
    "snow":[
      VO("呀哈！"),
      VO("噗嚕！"),
      VO("嗚拉！"),
      VO("哼～？"),
      VO("呀哈呀哈！")
    ],
    "teruteru":[
      VO("呀哈——！"),
      VO("嗚拉！"),
      VO("噗嚕♪"),
      VO("呀哈呀哈！"),
      VO("嗚拉呀哈！")
    ],
    "unknown":[
      VO("噗嚕……"),
      VO("蛤？"),
      VO("哼～？"),
      VO("呀哈！"),
      VO("嗚拉！")
    ]
  },
  "food":{
    "purin":[
      "聞起來就很好吃耶～",
      "先坐下來慢慢吃吧♪",
      "我想先看看招牌是什麼～",
      "這個拍完照就可以吃了嗎？",
      "留一點肚子給甜點嘛～",
      "吃飽再繼續走，剛剛好。",
      "我覺得這餐可以慢慢吃～",
      "有布丁的話我想看一下♪",
      "旅行就是會一直想吃東西嘛～",
      "先喝一口，再決定下一個要點什麼。",
      "今天也要吃到開心～",
      "這間氣氛感覺很舒服耶。",
      "如果要排太久，我們再想想嘛～",
      "吃完想找地方坐一下～",
      "甜甜的東西會讓旅行更開心♪",
      "先把想吃的都看一遍～",
      "我好像又有點餓了……",
      "這個份量兩個人分剛剛好嗎？",
      "慢慢吃，不要急著趕下一站～",
      "吃飽了就想發呆一下♪"
    ],
    "usagi":[
      VO("呀哈！","先看是否要排隊、是否有最後點餐時間。"),
      VO("嗚拉！","想吃的先決定，熱門品項售完就換第二順位。"),
      VO("噗嚕","先看招牌和限定，再決定要不要加點。"),
      VO("蛤？","排隊時間太長就比較備案，不必硬等。"),
      VO("嗚拉拉！","入店前先確認是否只能現金或需要先買券。"),
      VO("呀哈呀哈！","兩個人想吃不同的可以分著點，多試幾樣。"),
      VO("哼～？","如果後面還有正餐，甜點先不要點太滿。"),
      VO("嗚啦——！","吃完先補水，再開始下一段行程。"),
      VO("噗嚕……","店家快打烊時，先確認最後點餐而不是只看關門時間。"),
      VO("嗚拉呀哈！","看到限定或季節品項再決定要不要改原本選擇。"),
      VO("呀——哈！","排隊前先看 Google Maps 最近評論有沒有臨時異動。"),
      VO("蛤啊？","如果菜單看不懂，先找圖片或日文品名再點。")
    ],
    "duo":[
      "慢慢吃吧～　呀哈！",
      "甜點也想看～　嗚拉！",
      "先坐一下嘛～　噗嚕！",
      "這餐要吃得開心～　呀哈呀哈！",
      "吃完再出發吧♪　嗚拉！",
      "有好吃的就一起分～　呀哈！"
    ],
    "complete":[
      "吃到啦～",
      "美食收集完成♪",
      "這間記住了～",
      "今天又多一個好吃的回憶。",
      "任務完成，開吃！",
      "這餐可以放心收進回憶裡。",
      "吃飽啦～",
      "美食清單少一個。"
    ]
  },
  "booking":{
    "purin":[
      "先把時間再看一次吧～",
      "慢慢確認，不要按錯日期喔。",
      "確認信有收好嗎？",
      "帳號先登入，等等會比較輕鬆～",
      "這個完成就可以放心一點了♪",
      "先把需要的資料放在手邊～",
      "日期和人數再看一眼嘛。",
      "不要急，最後一步再確認一次。",
      "如果還沒開放，就先設好提醒吧～",
      "完成後記得截圖或留確認信。",
      "這項辦完就可以休息一下～",
      "先確認是日本時間還是台灣時間。",
      "頁面先準備好就不用慌～",
      "預約成功之後再把細節記進 App。"
    ],
    "usagi":[
      VO("嗚拉！","先確認日期、時間、人數，再碰最後確認鍵。"),
      VO("呀哈！","帳號和付款方式先準備好，別到最後一步才找。"),
      VO("蛤？","開放時間還沒到就先停，不要一直重複送出。"),
      VO("噗嚕","成功畫面、訂單編號或確認信至少留一份。"),
      VO("哼～？","看到日本時間時，先換算成台灣時間再設提醒。"),
      VO("嗚拉拉！","如果頁面有候補或事前申請，先分清楚和正式預約的差別。"),
      VO("呀哈呀哈！","預約完成後，再回頭檢查日期有沒有跨日或看錯月份。"),
      VO("嗚啦——！","需要登入的網站先把密碼和驗證方式準備好。"),
      VO("噗嚕……","付款失敗時先確認訂單是否已成立，避免重複下單。"),
      VO("嗚拉呀哈！","預約規則會變，出發前再看一次官方資訊。")
    ],
    "usagiUrgent":[
      VO("呀哈——！！","時間到了。先確認頁面已登入，再刷新一次。"),
      VO("嗚拉！！","不要連點送出；先看目前頁面是否已進到下一步。"),
      VO("嗚拉拉拉——！","日期、人數、時間只看關鍵欄位，別被其他資訊拖住。"),
      VO("蛤？！","如果顯示額滿，先看其他時段或官方候補機制。"),
      VO("呀哈呀哈！","成功後先截圖，再慢慢整理確認信。"),
      VO("嗚啦——！","付款頁不要返回上一頁，先等結果。"),
      VO("噗嚕！","卡住時換網路前先確認訂單沒有成立。"),
      VO("嗚拉呀哈！","剩最後一步也要看清楚日期，不要為了快按錯。")
    ],
    "duo":[
      "慢慢確認～　嗚拉！",
      "成功就可以放心啦～　呀哈！",
      "日期再看一次喔～　蛤？",
      "先準備好，再一起按～　嗚拉！"
    ],
    "reminder":[
      "記得完成這項預約。",
      "再確認一次日期與時間。",
      "確認信記得保留。",
      "需要搶票的頁面先準備好。",
      "時區再核對一次。",
      "官方規則出發前再確認。"
    ],
    "urgent":[
      "預約時間接近了。",
      "頁面與帳號先準備好。",
      "最後確認日期、人數與付款方式。",
      "完成後保留確認畫面。"
    ],
    "complete":[
      "完成一項！",
      "預約已完成。",
      "這項可以打勾了。",
      "確認資料收好。",
      "成功，先放心一件事。",
      "完成後記得同步到旅程工具。"
    ],
    "all":[
      "預約任務都完成了！",
      "待辦清空，可以安心一點了。",
      "出發準備又完成一大段。",
      "重要預約都收好了。"
    ]
  },
  "shop":{
    "purin":[
      "先看看，不用急著決定～",
      "這個顏色很好看耶♪",
      "喜歡再試，不喜歡就去下一間～",
      "逛累了就找咖啡坐一下嘛。",
      "先把真的喜歡的放在心裡～",
      "可以再比較一下，不用現在就買。",
      "這件摸起來舒服嗎？",
      "如果只是普通喜歡，就先放回去吧～",
      "看到特別的再停下來就好♪",
      "提袋變多以前先想一下～",
      "這個很適合拍照耶。",
      "兩個人一起看看哪個比較好～",
      "逛店也不用每間都待很久喔。",
      "先記價格，等等再決定～",
      "尺寸合適比勉強買更重要嘛。",
      "如果沒有喜歡的，我們就去喝東西♪",
      "這個要不要先拍照記著？",
      "今天的戰利品不要太重喔～"
    ],
    "usagi":[
      VO("呀哈！","先掃特殊色、限定款和最後尺寸；普通款先不急。"),
      VO("嗚拉！","沒有喜歡的就快速撤退，把時間留給下一間。"),
      VO("蛤？","普通色先記價格，不要因為第一間看到就直接買。"),
      VO("噗嚕","尺寸只剩最後一件時，再判斷是不是本來就想要的。"),
      VO("嗚拉拉！","試穿前先抓兩三件最有機會的，別一次拿太多。"),
      VO("呀哈呀哈！","看到特殊配色先拍型號和尺寸，方便後面比較。"),
      VO("哼～？","價格差不多時，優先考慮真的會常穿的。"),
      VO("嗚啦——！","五分鐘掃店原則：沒看到喜歡的就走。"),
      VO("噗嚕……","退稅、庫存和尺寸可以直接問店員，不用自己一直找。"),
      VO("嗚拉呀哈！","跨店比較時，先留商品照片或完整型號。"),
      VO("呀——哈！","逛到後段開始累時，只看清單上還缺的品項。"),
      VO("蛤啊？","如果只是因為『來都來了』想買，先放回去。")
    ],
    "duo":[
      "先看看再決定～　嗚拉！",
      "喜歡的才帶走♪　呀哈！",
      "普通款可以再比比看～　哼～？",
      "逛累了就休息嘛～　噗嚕！"
    ],
    "complete":[
      "買到啦！",
      "戰利品收下♪",
      "購物清單少一項。",
      "成功入手。",
      "這個真的有喜歡再帶回家。",
      "找到想要的了。",
      "戰利品＋1。",
      "完成一項購物任務。"
    ]
  },
  "money":{
    "purin":[
      "先記一下，回去就不用想了～",
      "這筆是誰付的呀？",
      "旅行花費慢慢記就好。",
      "收據先收著嘛。",
      "記完就可以繼續玩了♪",
      "共同支出要不要一起分？",
      "先把金額留下來，分類晚點再整理。",
      "今天花了多少，晚上再看就好～",
      "有記下來就不怕忘記。",
      "這筆看起來是兩個人的吧？",
      "不要一直算啦，先把資料記好～",
      "日幣金額先照原價輸入就好。",
      "回飯店再一起看今天花費～",
      "記帳完成就去休息一下♪"
    ],
    "usagi":[
      VO("嗚拉！","先記付款人、金額和分攤對象，分類可以晚點補。"),
      VO("呀哈！","共同支出不要只寫總額，記得勾兩個人。"),
      VO("蛤？","現金找零後立刻記，比晚上回想準。"),
      VO("噗嚕","信用卡先記日幣原價，實際台幣之後再對帳。"),
      VO("哼～？","重複記帳前先看同一天有沒有同額紀錄。"),
      VO("嗚拉拉！","收據可以先拍照，避免小票弄丟。"),
      VO("呀哈呀哈！","一人先墊付的項目記清楚，最後結算才不會亂。"),
      VO("噗嚕……","退款或取消的項目不要直接刪，留一筆負數比較好對。")
    ],
    "duo":[
      "先記下來～　嗚拉！",
      "等等再算也可以～　呀哈！",
      "誰付的先記好喔～　蛤？",
      "記完就繼續玩吧♪　嗚拉！"
    ]
  },
  "note":{
    "purin":[
      "想到就先寫一點吧～",
      "不用寫很完整，關鍵字也可以。",
      "店員剛剛說的先記下來嘛。",
      "這個回去可能會用到♪",
      "旅行裡的小事情也值得記～",
      "先寫下來，晚上再整理。",
      "如果怕忘記就先放進這裡～",
      "樓層或位置可以直接記最短版本。",
      "臨時改行程也沒關係，記一下就好。",
      "這段以後看到會想起來耶～",
      "先把重點留住，不用寫作文啦。",
      "回飯店再慢慢補完整。",
      "今天的小發現也收進來♪",
      "備忘寫好了就不用一直記在腦袋裡～"
    ],
    "usagi":[
      VO("嗚拉！","先寫關鍵字：樓層、位置、時間或店員提醒。"),
      VO("呀哈！","臨時資訊先記，晚上再整理成完整句子。"),
      VO("蛤？","看到舊資訊時先標日期，避免之後當成最新規則。"),
      VO("噗嚕","店名容易混淆就把日文原名一起存。"),
      VO("哼～？","有截圖也補一句文字，之後搜尋會比較快。"),
      VO("嗚拉拉！","如果是明天一定要做的事，別只放備忘，也加到待辦。"),
      VO("呀哈呀哈！","地址、樓層、出口編號這種資訊最值得現場記。"),
      VO("噗嚕……","備忘清空前先確認不是還沒同步到雲端。")
    ],
    "duo":[
      "先記一下吧～　嗚拉！",
      "關鍵字就可以喔～　呀哈！",
      "回去再整理嘛～　噗嚕！",
      "不要讓它從腦袋跑掉～　嗚拉！"
    ]
  },
  "hotel":{
    "purin":[
      "回去躺一下吧～",
      "今天走很多了耶。",
      "先洗澡，再慢慢整理照片♪",
      "回房間就可以放空了～",
      "我想把鞋子脫掉了……",
      "今天的戰利品先放好嘛。",
      "手機記得充電喔～",
      "明天的衣服要不要先放出來？",
      "泡完澡一定會更想睡～",
      "今天的照片晚點慢慢看。",
      "回去喝點水再休息吧。",
      "我覺得今天可以早一點睡～",
      "明天的第一站不用現在想太多嘛。",
      "行李先整理一點點就好。",
      "今天也辛苦了～",
      "回到房間就把腳抬高一下♪",
      "我已經開始想睡覺了……",
      "今天到這裡就很好了～"
    ],
    "usagi":[
      VO("嗚拉！","回住宿先充手機、行動電源和相機。"),
      VO("呀哈！","明早要用的票券、錢包和鑰匙先放同一處。"),
      VO("噗嚕","洗澡前先把濕衣物或鞋子處理好。"),
      VO("蛤？","明天如果要早起，鬧鐘現在就設。"),
      VO("哼～？","行李不用全整理，先把明天會用到的拿出來。"),
      VO("嗚拉拉！","需要下載的票券或地圖趁有 Wi‑Fi 先存離線。"),
      VO("呀哈呀哈！","今晚有充電，明天就少一個風險。"),
      VO("噗嚕……","太晚了就不要再臨時加景點。")
    ],
    "duo":[
      "回去休息吧～　嗚拉！",
      "今天辛苦啦～　呀哈！",
      "先洗澡再說～　噗嚕！",
      "明天再繼續玩♪　嗚拉！"
    ],
    "latePurin":[
      "真的很晚了耶……",
      "今天就到這裡吧～",
      "快回去睡覺嘛。",
      "照片明天再看也可以喔～",
      "先充電，然後躺平♪",
      "晚安～明天再一起出去玩。",
      "不要再加行程了啦～",
      "我已經睏到不想動了……"
    ],
    "lateUsagi":[
      VO("噗嚕……","太晚了。先回住宿，不要再加新行程。"),
      VO("蛤？","明早有安排的話，現在先設鬧鐘。"),
      VO("嗚拉","手機和行動電源插上就去睡。"),
      VO("哼～？","剩下的整理明天再做。"),
      VO("噗嚕噗嚕","今天到這裡，先恢復體力。")
    ]
  },
  "day":[
    {
      "purin":[
        "第一天到啦～先把自己安頓好吧。",
        "剛到的晚上不要太趕喔～",
        "行李放好以後再慢慢開始♪",
        "第一天有順利抵達就很棒了。",
        "先吃點東西，讓旅行慢慢開場～",
        "今天的任務就是舒服地進入旅行模式。"
      ],
      "usagi":[
        VO("呀哈！","第一天先確認網路、手機電量、錢包與重要文件。"),
        VO("嗚拉！","如果抵達延誤，直接刪掉最低優先度的備案。"),
        VO("蛤？","先安頓行李，再決定晚上還要做多少。"),
        VO("噗嚕","第一晚不要為了多跑一站壓縮睡眠。"),
        VO("嗚拉呀哈！","晚餐太晚就選不用久等的方案。"),
        VO("哼～？","睡前把明天最重要的一件事確認好。")
      ],
      "duo":[
        "今天也一起走吧～　呀哈！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    },
    {
      "purin":[
        "第二天也照自己的步調走吧～",
        "看到喜歡的就多待一下嘛。",
        "中間記得找地方坐坐♪",
        "不用一早就把體力用完喔。",
        "今天也要留一點發呆時間～",
        "晚上回去再慢慢整理照片。"
      ],
      "usagi":[
        VO("呀哈！","早上先看今天有沒有固定時間，再安排其他彈性項目。"),
        VO("嗚拉！","中段至少留一次坐下來休息的空檔。"),
        VO("蛤？","看到需要比較的東西先記資訊，不急著當場決定。"),
        VO("噗嚕","手機電量掉太快就提早補電。"),
        VO("嗚拉呀哈！","如果進度落後，先砍最低優先度項目。"),
        VO("哼～？","晚上有固定安排時，要提早設定離場時間。")
      ],
      "duo":[
        "今天也一起走吧～　嗚拉！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    },
    {
      "purin":[
        "今天也先看看自己有多少體力～",
        "下午以前記得休息一下嘛。",
        "看到好看的光線就停一下♪",
        "兩個人都要記得入鏡喔。",
        "不用每一段都走得很快～",
        "今天也慢慢收集小回憶。"
      ],
      "usagi":[
        VO("呀哈！","上午和下午體力分配平均，不要前半天用光。"),
        VO("嗚拉！","活動或交通有異動時，以當天官方資訊優先。"),
        VO("蛤？","拍照前先確認電量和儲存空間。"),
        VO("噗嚕","傍晚有安排時，下午就開始倒推時間。"),
        VO("嗚拉呀哈！","累了就直接縮短備案，不要硬撐。"),
        VO("哼～？","回住宿前先確認最後一段交通。")
      ],
      "duo":[
        "今天也一起走吧～　噗嚕！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    },
    {
      "purin":[
        "今天就用舒服的速度走～",
        "喜歡哪裡就多待一下嘛。",
        "甜點和休息都可以算行程♪",
        "走累了就坐著看看四周。",
        "不用追求跑很多地方喔～",
        "慢慢走才看得到小東西嘛。"
      ],
      "usagi":[
        VO("呀哈！","今天的優先順序是舒服，不是完成數量。"),
        VO("嗚拉！","排隊時間太長就比較備案。"),
        VO("蛤？","能休息就真的休息，不要把空白又塞滿。"),
        VO("噗嚕","固定時間要守，其他彈性項目都可以讓位。"),
        VO("嗚拉呀哈！","看到想買的先判斷攜帶和保存方式。"),
        VO("哼～？","前段進度慢時，後段直接減量。")
      ],
      "duo":[
        "今天也一起走吧～　呀哈！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    },
    {
      "purin":[
        "今天也把步調放穩吧～",
        "中間記得喝水和伸伸腿。",
        "安全、舒服最重要喔。",
        "看到喜歡的景色再停一下～",
        "有精神再多玩，累了就休息。",
        "今天也不要把空檔全部塞滿。"
      ],
      "usagi":[
        VO("呀哈！","今天先把安全和體力放在行程數量前面。"),
        VO("嗚拉！","移動前確認電量、網路和下一個休息點。"),
        VO("蛤？","每隔一段時間下來活動一下。"),
        VO("噗嚕","天氣或能見度不好就縮短戶外停留。"),
        VO("嗚拉呀哈！","傍晚前確認下一個落腳點和交通方向。"),
        VO("哼～？","晚上活動依體力決定，不需要硬完成。")
      ],
      "duo":[
        "今天也一起走吧～　嗚拉！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    },
    {
      "purin":[
        "今天一路都不要太趕～",
        "吃飽一點再繼續吧。",
        "下午留一段真的空白也很好。",
        "看到舒服的地方就多坐一下。",
        "今天不用證明自己完成了多少～",
        "慢慢到下一段就好。"
      ],
      "usagi":[
        VO("呀哈！","上午先看體力，再決定今天要不要加備案。"),
        VO("嗚拉！","吃飯、補給和移動都要保留緩衝。"),
        VO("蛤？","下午的空白不要臨時全部塞滿。"),
        VO("噗嚕","跨區移動前確認手機、錢包和重要物品。"),
        VO("嗚拉呀哈！","抵達後先休息，再決定要不要出去。"),
        VO("哼～？","有固定晚間安排時，提早確認交通。")
      ],
      "duo":[
        "今天也一起走吧～　噗嚕！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    },
    {
      "purin":[
        "今天比較有任務感，也要記得休息～",
        "重要的事情完成後就慢慢來。",
        "中午一定要好好吃一餐。",
        "走很多的日子更要記得坐一下。",
        "拍照和散步都不用搶快。",
        "晚上就讓自己好好恢復～"
      ],
      "usagi":[
        VO("呀哈！","早上的固定事項最優先，其他都可以讓位。"),
        VO("嗚拉！","報到類行程把找入口和排隊一起算進時間。"),
        VO("蛤？","上午完成重點後，中午先好好吃飯。"),
        VO("噗嚕","下午如果延誤，優先保留住宿和已預約事項。"),
        VO("嗚拉呀哈！","今天步行量高就提早補水。"),
        VO("哼～？","出發前再查一次現場營運狀態。")
      ],
      "duo":[
        "今天也一起走吧～　呀哈！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    },
    {
      "purin":[
        "今天有變動也沒關係嘛～",
        "照現場狀況決定就好。",
        "移動多的日子更要留緩衝。",
        "下午慢慢把節奏收回來～",
        "有備案就不用擔心臨時改變。",
        "今天只要順順走完就很好了。"
      ],
      "usagi":[
        VO("呀哈！","先看當天狀態再選方案，不預設一定走主案。"),
        VO("嗚拉！","移動任務要留時間給找入口、找月台或停車。"),
        VO("蛤？","天氣普通時，備案往往比硬撐更有效率。"),
        VO("噗嚕","今天只補真正缺少的東西，不重新展開整份清單。"),
        VO("嗚拉呀哈！","跨城或長距離交通先確認班次。"),
        VO("哼～？","今天的成功標準是順利完成下一段交接。")
      ],
      "duo":[
        "今天也一起走吧～　嗚拉！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    },
    {
      "purin":[
        "旅程後段更要留體力喔～",
        "想完成的事情慢慢一個個來。",
        "下午以前記得坐下來休息。",
        "東西變多了要注意行李重量喔。",
        "拍到喜歡的照片就很值得了～",
        "晚上如果還有事，中間一定要休息。"
      ],
      "usagi":[
        VO("呀哈！","上午只處理還沒完成的清單，不重新逛一輪。"),
        VO("嗚拉！","下午要留電量、儲存空間和體力。"),
        VO("蛤？","是否多留一段時間，要用後續移動倒推。"),
        VO("噗嚕","大件物品先想怎麼放進行李。"),
        VO("嗚拉呀哈！","取行李或轉乘前先看交通時間。"),
        VO("哼～？","晚上有移動時，不要拖到最後一班才出發。")
      ],
      "duo":[
        "今天也一起走吧～　噗嚕！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    },
    {
      "purin":[
        "最後一天就慢慢來吧～",
        "不要因為要回家就突然趕好多事。",
        "最後一餐也要好好吃♪",
        "行李和證件比多跑一站重要。",
        "最後再拍幾張旅行照片吧。",
        "回家以前，再好好看看這趟旅行～"
      ],
      "usagi":[
        VO("呀哈！","最後一天先把退房、寄物、取行李和去機場時間鎖好。"),
        VO("嗚拉！","觀光全部放在離境時間之前，不要反過來壓縮。"),
        VO("蛤？","國際線保留足夠提早到場時間。"),
        VO("噗嚕","最後採買以能快速完成的為主。"),
        VO("嗚拉呀哈！","離開住宿前再做一次證件、錢包、手機、行李確認。"),
        VO("哼～？","交通臨時異動時，直接犧牲最後一個彈性項目。")
      ],
      "duo":[
        "今天也一起走吧～　呀哈！",
        "照自己的步調就好～　嗚拉！",
        "累了就休息嘛～　呀哈！",
        "今天也一起把回憶收好♪　嗚拉呀哈！"
      ]
    }
  ],
  "egg":[
    "找到隱藏彩蛋～",
    "旅伴集合！",
    "一起出發吧～　呀哈！",
    "被你發現了。",
    "散步時間～",
    "咻————！",
    "還沒睡嗎……？",
    "呀哈！還可以玩！",
    "真的該睡覺了啦～",
    "今天也完成好多事。",
    "不想這麼快結束～",
    "旅行模式 ON！",
    "鴨寶幫集合！",
    "又被你按到了～",
    "今天也一起玩到底。",
    "先拍一張再走～",
    "噗嚕！",
    "一起慢慢玩吧♪",
    "嗚拉呀哈！",
    "下一個彩蛋在哪裡呢～"
  ],
  "time":{
    "morning":{
      "purin":[
        "早安～先讓自己慢慢醒來。",
        "早餐吃飽再出發吧♪",
        "今天也一起出去玩～",
        "先喝點水，再看看第一站。",
        "早上的步調不要太急嘛。",
        "手機有充飽嗎？",
        "今天的第一張照片要拍什麼？",
        "如果還睏就多坐一下～"
      ],
      "usagi":[
        VO("呀哈！","早上先確認手機、錢包、票券和行動電源。"),
        VO("嗚拉！","第一站有固定時間的話，先倒推離開住宿時間。"),
        VO("噗嚕","早餐不要吃到壓縮後面固定行程。"),
        VO("蛤？","今天如果要早起，先確認沒有睡過頭。"),
        VO("嗚拉呀哈！","出門前看一次天氣和交通異動。"),
        VO("呀哈呀哈！","鞋子、外套和雨具依今天行程一次帶好。")
      ],
      "duo":[
        "早安～　呀哈！",
        "吃飽再出發吧～　嗚拉！",
        "今天也一起玩♪　呀哈！",
        "東西帶齊了嗎～　蛤？"
      ]
    },
    "afternoon":{
      "purin":[
        "下午先坐一下嘛～",
        "要不要喝杯咖啡？",
        "走到一半休息一下很重要喔。",
        "下午的光線開始變漂亮了～",
        "先看看還有多少體力。",
        "如果累了就少一站嘛。",
        "甜點時間差不多到了吧♪",
        "慢慢走，晚上還有時間。"
      ],
      "usagi":[
        VO("嗚拉！","下午先看體力，再決定備案要不要加。"),
        VO("呀哈！","傍晚有拍照或固定安排時，現在就開始倒推。"),
        VO("蛤？","手機電量低於一半就先補電。"),
        VO("噗嚕","咖啡休息可以順便整理下一段交通。"),
        VO("嗚拉拉！","不要把下午所有空檔都塞成新景點。"),
        VO("哼～？","如果已經延誤，就直接砍最低優先度行程。")
      ],
      "duo":[
        "下午也慢慢走～　嗚拉！",
        "先喝點東西嘛～　呀哈！",
        "還有體力嗎～　蛤？",
        "傍晚前先休息一下♪　嗚拉！"
      ]
    },
    "evening":{
      "purin":[
        "今天玩得開心嗎～",
        "晚餐時間快到了耶。",
        "夜晚也可以慢慢拍♪",
        "差不多開始收尾吧～",
        "今天的照片一定很多。",
        "吃飽就不要再走太遠嘛。",
        "回去以前再散步一下？",
        "今晚想早點回房間～"
      ],
      "usagi":[
        VO("呀哈！","晚上先確認最後一段交通和住宿方向。"),
        VO("嗚拉！","有預約晚餐時，不要在前一站拖到最後一刻。"),
        VO("噗嚕","夜間拍照前先看手機與相機剩餘電量。"),
        VO("蛤？","最後一班車或末班交通有風險時，優先提早移動。"),
        VO("哼～？","今天已經超時就不要再加臨時行程。"),
        VO("嗚拉呀哈！","回住宿前把明早一定要做的事確認一次。")
      ],
      "duo":[
        "晚上也慢慢玩～　嗚拉！",
        "晚餐要吃飽喔～　呀哈！",
        "差不多收尾吧～　噗嚕！",
        "回去以前再拍一張♪　嗚拉！"
      ]
    },
    "late":{
      "purin":[
        "真的該睡了啦～",
        "剩下的明天再想嘛。",
        "手機插上就躺平吧。",
        "今天已經玩很多了～",
        "晚安，明天再一起出去玩♪",
        "照片不用今晚全部整理。",
        "先喝水，再去睡覺～",
        "我已經睏了……"
      ],
      "usagi":[
        VO("噗嚕……","現在優先睡眠，不再新增行程。"),
        VO("蛤？","鬧鐘和充電確認完就休息。"),
        VO("嗚拉","明早固定事項先看一眼，其餘明天處理。"),
        VO("哼～？","照片和記帳可以明天補，不要熬夜。"),
        VO("噗嚕噗嚕","手機、行動電源、相機都插上。"),
        VO("嗚拉","門鎖、房卡、錢包放好就睡。")
      ],
      "duo":[
        "晚安～　噗嚕……",
        "明天再繼續玩♪　嗚拉！",
        "真的要睡囉～　蛤？",
        "充電插好就躺平～　噗嚕。"
      ]
    }
  }
};
const USAGI_VOICE_LINES=[
  "蛤？",
  "嗚拉！",
  "呀哈！",
  "嗚拉呀哈呀哈嗚拉～",
  "哼～？",
  "噗嚕",
  "呀哈——！",
  "嗚拉拉！",
  "噗嚕……",
  "呀哈呀哈！",
  "嗚拉呀哈！",
  "蛤啊？"
];
const usagiVoiceImageState=new WeakMap();

function dialogueText(msg){
  if(msg&&typeof msg==="object")return String(msg.text||"");
  return String(msg??"");
}
function dialogueHint(msg){
  if(msg&&typeof msg==="object")return String(msg.hint||"");
  return "";
}
function isUsagiVoiceLine(msg){
  const text=dialogueText(msg);
  return USAGI_VOICE_LINES.includes(text)||/^(?:呀哈|呀——哈|嗚拉|嗚啦|噗嚕|蛤|哼)/.test(text);
}
function usagiVoiceArtFor(msg){
  const text=dialogueText(msg);
  if(/蛤|哼/.test(text))return "./usagi_think.png?v=430";
  if(/噗嚕/.test(text))return "./usagi_sticker.png?v=430";
  if(/嗚拉.*呀哈|呀哈.*嗚拉|嗚啦.*呀哈/.test(text))return "./usagi_dash.png?v=430";
  if(/呀哈|呀——哈/.test(text))return "./usagi_success.png?v=430";
  if(/嗚拉|嗚啦/.test(text))return "./usagi_excited.png?v=430";
  return "";
}
function flashUsagiVoiceArt(el,msg,context=""){
  if(!el||!isUsagiVoiceLine(msg)||context==="weather")return;
  const img=el.matches?.("img")?el:el.querySelector?.("img");
  if(!img)return;
  const next=usagiVoiceArtFor(msg);
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

const HERO_EGG_POOL=[
  {type:"classic",text:"我們是鴨寶幫！",image:"./duck_gang.png?v=5311",tone:"duo"},
  {type:"classic",text:"我們是海豹幫！",image:"./seal_gang.png?v=5311",tone:"duo"},
  {type:"classic",text:"旅行正式開始 ♡",image:"./buddy_hero.png?v=430",tone:"duo"},
  {
    type:"scene",id:"sendoff",image:"./egg-sendoff-v539.png?v=539",tone:"duo",
    captions:["要玩得開心喔～","記得拍很多照片回來！","家裡交給我們～","鴨寶幫九州玩得開心！","海豹幫看家 (･∞･ﾐэ )Э"],
    characters:[
      {id:"quagsire",label:"沼王",lines:["路上小心～","哇～"],hotspot:{left:4,top:28,width:21,height:39}},
      {id:"rowlet",label:"木木梟",lines:["記得帶伴手禮……！","咕！咕！咕——？（歪頭）"],hotspot:{left:1,top:58,width:23,height:29}},
      {id:"ditto",label:"百變怪",lines:["我們會在家等你們～","（ • _ • ）"],hotspot:{left:70,top:45,width:19,height:26}}
    ]
  },
  {
    type:"scene",id:"cry",image:"./egg-cry-v539.png?v=539",tone:"duo",
    captions:["真的不能一起去嗎……","要記得我們喔……","……伴手禮"],
    characters:[
      {id:"quagsire",label:"沼王",lines:["我幫你們看家。","……"],hotspot:{left:4,top:23,width:23,height:33}},
      {id:"rowlet",label:"木木梟",lines:["嗚……我也想去……","真的……不能塞進行李箱嗎？"],hotspot:{left:18,top:38,width:22,height:28}},
      {id:"ditto",label:"百變怪",lines:["那我變小一點也不行嗎……","我可以變成行李耶……"],hotspot:{left:4,top:49,width:19,height:22}}
    ]
  },
  {
    type:"scene",id:"home-sleep",image:"./egg-home-sleep-v539.png?v=539",tone:"hotel",
    captions:["留守組今日任務：睡覺。","今天也很安靜～","等你們回來再叫我……","今天也很安靜～","看家中……Zzz"],
    characters:[
      {id:"quagsire",label:"沼王",lines:["一切正常。","看家中～"],hotspot:{left:17,top:31,width:25,height:32}},
      {id:"rowlet",label:"木木梟",lines:["Zzz……","我沒有睡……Zzz……","等你們回來再叫我……"],hotspot:{left:28,top:53,width:30,height:28}},
      {id:"ditto",label:"百變怪",lines:["今天變成沙發","看家好累……","先躺一下"],hotspot:{left:57,top:54,width:19,height:20}}
    ]
  }
];

const PAGE_SWITCH_DASH_EGG_CHANCE=0.12;
const PAGE_SWITCH_DASH_EGG_COOLDOWN=4*60*1000;

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
function timeDialogue(kind="duo"){
  const h=japanHour();
  const slot=h<11?BUDDY_DIALOG.time.morning:h<17?BUDDY_DIALOG.time.afternoon:h<22?BUDDY_DIALOG.time.evening:BUDDY_DIALOG.time.late;
  return slot?.[kind]||slot?.duo||BUDDY_DIALOG.duo;
}
function buddyToneForContext(context){
  return ({weather:"weather",food:"food",booking:"booking",shop:"shop",money:"money",note:"note",hotel:"hotel",day:"day",duo:"duo"})[context]||"";
}
function toast(msg,tone=""){
  const t=$("#toast"); if(!t)return;
  t.textContent=dialogueText(msg);t.dataset.tone=tone||"";
  t.classList.remove("show");void t.offsetWidth;t.classList.add("show");
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>{t.classList.remove("show");setTimeout(()=>{t.dataset.tone=""},220)},1900);
}

function showBuddySpeech(el,msg,tone="duo"){
  const bubble=$("#buddySpeechBubble");
  if(!bubble||!el){toast(msg,tone);return;}
  const rect=el.getBoundingClientRect();
  const vw=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);
  const vh=Math.max(document.documentElement.clientHeight||0,window.innerHeight||0);
  const main=dialogueText(msg);

  bubble.innerHTML=`<span class="buddy-speech-main">${esc(main)}</span>`;
  bubble.setAttribute("aria-label",main);
  bubble.classList.remove("has-hint","show","below","side-left","side-right");
  bubble.dataset.tone=tone||"duo";
  bubble.style.left='-9999px';
  bubble.style.top='-9999px';
  bubble.style.visibility='hidden';
  bubble.style.opacity='0';
  bubble.classList.add('show');
  const bw=bubble.offsetWidth||190;
  const bh=bubble.offsetHeight||58;

  const isEventBuddy=!!el.classList?.contains('event-buddy');
  if(isEventBuddy){
    const gap=12;
    const spaceLeft=Math.max(0,rect.left-14);
    const spaceRight=Math.max(0,vw-rect.right-14);
    const preferLeft=rect.left>=vw*0.52;
    let side='left';
    if(preferLeft&&spaceLeft>=bw)side='left';
    else if(spaceRight>=bw)side='right';
    else if(spaceLeft>=spaceRight)side='left';
    else side='right';

    const anchorY=Math.max(bh/2+10,Math.min(vh-bh/2-10,rect.top+rect.height/2));
    const anchorX=side==='left' ? Math.max(bw+10,rect.left-gap) : Math.min(vw-bw-10,rect.right+gap);
    bubble.style.left=`${Math.round(anchorX)}px`;
    bubble.style.top=`${Math.round(anchorY)}px`;
    bubble.classList.add(side==='left'?'side-left':'side-right');
  }else{
    const safeHalf=Math.min(124,Math.max(88,(vw-24)/2));
    const center=rect.left+rect.width/2;
    const x=Math.max(12+safeHalf,Math.min(vw-12-safeHalf,center));
    const below=rect.top<132;
    bubble.style.left=`${Math.round(x)}px`;
    if(below){
      bubble.style.top=`${Math.round(Math.max(12,Math.min(vh-bh-12,rect.bottom+9)))}px`;
      bubble.classList.add('below');
    }else{
      bubble.style.top=`${Math.round(Math.max(bh+12,Math.min(vh-12,rect.top-8)))}px`;
    }
  }

  bubble.style.visibility='';
  bubble.style.opacity='';
  bubble.classList.remove('show');
  void bubble.offsetWidth;
  bubble.classList.add('show');
  clearTimeout(showBuddySpeech._t);
  showBuddySpeech._t=setTimeout(()=>{
    bubble.classList.remove('show','below','side-left','side-right');
    setTimeout(()=>{
      bubble.dataset.tone='';
      bubble.textContent='';
      bubble.removeAttribute('aria-label');
    },180);
  },3000);
}

function buddyMoodFor(kind,msg=""){
  const text=dialogueText(msg);
  if(kind==="usagi"&&/(蛤|哼|噗嚕)/.test(text))return "question";
  if(kind==="usagi"&&/(嗚拉|嗚啦|呀哈|！！|!)/.test(text))return "chaos";
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
  // A user-opened home easter egg is modal and persistent. Other buddy celebrations
  // must never replace its image or text while it is open.
  if(wrap.dataset.heroEgg==="1"&&wrap.classList.contains("show"))return;
  img.src=image; label.textContent=dialogueText(text); wrap.dataset.tone=tone; wrap.classList.remove("show"); void wrap.offsetWidth; wrap.classList.add("show"); buddySparkBurst(50,42,tone);
  clearTimeout(buddyCelebrate._t); buddyCelebrate._t=setTimeout(()=>{wrap.classList.remove("show");wrap.dataset.tone=""},1450);
}
function clearHeroEggInteractive(){
  const hotspots=$("#buddyEggHotspots"),speech=$("#buddyEggSpeech");
  if(hotspots)hotspots.innerHTML="";
  if(speech){
    speech.textContent="";
    speech.classList.remove("show","below","is-long","is-xlong");
    speech.style.left="";speech.style.top="";
  }
}
function closeHeroEgg(){
  const wrap=$("#buddyCelebration"); if(!wrap)return;
  clearTimeout(buddyCelebrate._t);
  wrap.classList.remove("show","hero-egg","hero-egg-scene");
  wrap.dataset.heroEgg="";wrap.dataset.scene="";wrap.dataset.tone="";
  clearHeroEggInteractive();
}
function showHeroEggSpeech(scene,charId,button){
  const speech=$("#buddyEggSpeech"),stage=$("#buddyEggStage");
  if(!speech||!stage||!button)return;
  const character=scene.characters?.find(c=>c.id===charId);if(!character)return;
  const line=String(pickLine(character.lines)||"");
  speech.textContent=line;
  speech.classList.remove("show","below","is-long","is-xlong");
  speech.classList.toggle("is-long",line.length>11);
  speech.classList.toggle("is-xlong",line.length>18);
  speech.style.left="6px";speech.style.top="6px";

  // Measure the rendered bubble, then clamp it completely inside the 4:3 scene.
  // Prefer above the tapped character; if there is not enough room, place it below.
  speech.style.visibility="hidden";
  speech.style.opacity="0";
  speech.classList.add("show");
  const br=button.getBoundingClientRect(),sr=stage.getBoundingClientRect();
  const sw=speech.offsetWidth,sh=speech.offsetHeight;
  if(!sr.width||!sr.height||!sw||!sh){speech.style.visibility="";speech.style.opacity="";return}
  const gap=8,pad=7;
  const cx=br.left+br.width/2-sr.left;
  let left=cx-sw/2;
  left=Math.max(pad,Math.min(sr.width-sw-pad,left));
  let top=br.top-sr.top-sh-gap;
  let below=false;
  if(top<pad){top=br.bottom-sr.top+gap;below=true}
  top=Math.max(pad,Math.min(sr.height-sh-pad,top));
  speech.style.left=`${Math.round(left)}px`;
  speech.style.top=`${Math.round(top)}px`;
  speech.classList.toggle("below",below);
  speech.style.visibility="";
  speech.style.opacity="";
  speech.classList.remove("show");void speech.offsetWidth;speech.classList.add("show");
}
function showHeroEgg(scene){
  if(!isBuddyTheme()||!scene)return;
  const wrap=$("#buddyCelebration"),img=$("#buddyCelebrateImg"),label=$("#buddyCelebrateText"),hotspots=$("#buddyEggHotspots");
  if(!wrap||!img||!label)return;
  // Once opened, keep exactly the same easter-egg scene until the backdrop closes it.
  if(wrap.dataset.heroEgg==="1"&&wrap.classList.contains("show"))return;
  clearTimeout(buddyCelebrate._t);
  clearHeroEggInteractive();
  wrap.dataset.heroEgg="1";wrap.dataset.scene=scene.id||"classic";wrap.dataset.tone=scene.tone||"duo";
  wrap.classList.add("hero-egg");
  wrap.classList.toggle("hero-egg-scene",scene.type==="scene");
  img.src=scene.image;
  label.textContent=scene.type==="scene"?pickLine(scene.captions):dialogueText(scene.text);
  if(scene.type==="scene"&&hotspots){
    hotspots.innerHTML=(scene.characters||[]).map(c=>{
      const h=c.hotspot||{};
      return `<button type="button" class="buddy-egg-hotspot" data-egg-character="${esc(c.id)}" aria-label="${esc(c.label)}" style="left:${Number(h.left)||0}%;top:${Number(h.top)||0}%;width:${Number(h.width)||10}%;height:${Number(h.height)||10}%"></button>`;
    }).join("");
    hotspots.querySelectorAll("[data-egg-character]").forEach(btn=>btn.addEventListener("click",e=>{
      e.stopPropagation();showHeroEggSpeech(scene,btn.dataset.eggCharacter,btn);
    }));
  }
  wrap.classList.remove("show");void wrap.offsetWidth;wrap.classList.add("show");
  buddySparkBurst(50,42,scene.tone||"duo");
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
function weatherDialogue(mode){
  const current=mode||$("#weatherBuddySlot")?.dataset.weatherMode||"sunny";
  return BUDDY_DIALOG.weather?.[current]||BUDDY_DIALOG.weather.sunny;
}
function hideGlobalBuddySpeech(){
  const bubble=$("#buddySpeechBubble");
  if(!bubble)return;
  clearTimeout(showBuddySpeech._t);
  bubble.classList.remove("show","below");
}
function showWeatherBuddySpeech(mode){
  const bubble=$("#weatherBuddySpeech");
  if(!bubble)return;
  const msg=pickLine(weatherDialogue(mode));
  const main=dialogueText(msg);
  clearTimeout(showWeatherBuddySpeech._t);
  bubble.textContent=main;
  bubble.setAttribute("aria-label",main);
  bubble.classList.remove("show");
  void bubble.offsetWidth;
  bubble.classList.add("show");
  showWeatherBuddySpeech._t=setTimeout(()=>{
    bubble.classList.remove("show");
    setTimeout(()=>{
      if(!bubble.classList.contains("show")){
        bubble.textContent="";
        bubble.removeAttribute("aria-label");
      }
    },180);
  },1900);
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
  if(context==="day"){
    const day=BUDDY_DIALOG.day[state?.dayIndex]||{};
    return pickLine(day?.[kind]||day?.duo||BUDDY_DIALOG.duo);
  }
  if(context==="weather")return pickLine(weatherDialogue());
  if(context==="food"){
    return pickLine(BUDDY_DIALOG.food?.[kind]||BUDDY_DIALOG.food.duo||BUDDY_DIALOG.food.purin);
  }
  if(context==="booking"){
    if(kind==="usagi")return pickLine(bookingHasUrgent()?BUDDY_DIALOG.booking.usagiUrgent:BUDDY_DIALOG.booking.usagi);
    if(kind==="purin")return pickLine(BUDDY_DIALOG.booking.purin);
    return pickLine(BUDDY_DIALOG.booking.duo);
  }
  if(context==="shop"){
    return pickLine(BUDDY_DIALOG.shop?.[kind]||BUDDY_DIALOG.shop.duo||BUDDY_DIALOG.shop.purin);
  }
  if(context==="money"){
    return pickLine(BUDDY_DIALOG.money?.[kind]||BUDDY_DIALOG.money.duo);
  }
  if(context==="note"){
    return pickLine(BUDDY_DIALOG.note?.[kind]||BUDDY_DIALOG.note.duo);
  }
  if(context==="hotel"){
    if(japanHour()>=21){
      if(kind==="usagi")return pickLine(BUDDY_DIALOG.hotel.lateUsagi);
      if(kind==="purin")return pickLine(BUDDY_DIALOG.hotel.latePurin);
      return pickLine(BUDDY_DIALOG.hotel.duo);
    }
    return pickLine(BUDDY_DIALOG.hotel?.[kind]||BUDDY_DIALOG.hotel.duo);
  }
  if(kind==="duo")return pickLine(BUDDY_DIALOG.duo);
  // Generic taps occasionally react to Japan-local time, but keep each character's own voice.
  if(Math.random()<0.28)return pickLine(timeDialogue(kind));
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

  const msg=buddyDialogueFor(kind,context);
  const tone=kind==="usagi"&&!context?"voice":baseTone;

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


const WEATHER_BUDDY_STORAGE_KEY="kyushu-private:weather-buddy-mode";
const WEATHER_BUDDY_VARIANTS=[
  {mode:"sunny",src:"./weather-sunny-usagi-v536.webp?v=536",alt:"晴天烏薩奇",label:"晴天"},
  {mode:"teruteru",src:"./weather-teruteru-usagi-v536.webp?v=536",alt:"晴天娃娃烏薩奇",label:"晴天娃娃"},
  {mode:"cloudy",src:"./weather-cloudy-usagi-v536.webp?v=536",alt:"陰天烏薩奇",label:"陰天"},
  {mode:"rain",src:"./weather-rain-usagi-v47.webp?v=470",alt:"穿雨衣的烏薩奇",label:"雨天"},
  {mode:"thunder",src:"./weather-thunder-usagi-v536.webp?v=536",alt:"雷雨烏薩奇",label:"雷雨"},
  {mode:"snow",src:"./weather-snow-usagi-v536.webp?v=536",alt:"雪天烏薩奇",label:"雪天"}
];
let weatherBuddyIndex=0;
try{
  const saved=localStorage.getItem(WEATHER_BUDDY_STORAGE_KEY);
  const idx=WEATHER_BUDDY_VARIANTS.findIndex(v=>v.mode===saved);
  if(idx>=0)weatherBuddyIndex=idx;
}catch{}
function updateWeatherBuddy(mode=WEATHER_BUDDY_VARIANTS[weatherBuddyIndex].mode){
  const el=$("#weatherBuddySlot"), card=$("#weatherCard"); if(!el)return;
  let idx=WEATHER_BUDDY_VARIANTS.findIndex(v=>v.mode===mode);
  if(idx<0)idx=0;
  weatherBuddyIndex=idx;
  const spec=WEATHER_BUDDY_VARIANTS[idx];
  el.dataset.weatherMode=spec.mode;
  el.className=`weather-buddy-slot buddy-only-art is-${spec.mode}`;
  card?.classList.add("has-weather-buddy");
  el.hidden=false;
  el.innerHTML=`<button type="button" class="weather-buddy-button weather-usagi-${spec.mode}" data-weather-switch="1" aria-label="切換天氣烏薩奇造型，目前：${spec.label}"><img src="${spec.src}" alt="${spec.alt}"></button>`;
}
function cycleWeatherBuddy(){
  weatherBuddyIndex=(weatherBuddyIndex+1)%WEATHER_BUDDY_VARIANTS.length;
  const spec=WEATHER_BUDDY_VARIANTS[weatherBuddyIndex];
  try{localStorage.setItem(WEATHER_BUDDY_STORAGE_KEY,spec.mode)}catch{}
  updateWeatherBuddy(spec.mode);
  return spec.mode;
}
function handleWeatherBuddyTap(){
  clearTimeout(handleWeatherBuddyTap._speechDelay);
  const bubble=$("#weatherBuddySpeech");
  if(bubble){clearTimeout(showWeatherBuddySpeech._t);bubble.classList.remove("show")}
  hideGlobalBuddySpeech();
  const mode=cycleWeatherBuddy();
  const button=$("#weatherBuddySlot [data-weather-switch]");
  if(button){
    button.classList.remove("weather-buddy-pop");
    void button.offsetWidth;
    button.classList.add("weather-buddy-pop");
    setTimeout(()=>button.classList.remove("weather-buddy-pop"),360);
  }
  handleWeatherBuddyTap._speechDelay=setTimeout(()=>showWeatherBuddySpeech(mode),150);
}
function ensureWeatherBuddy(){updateWeatherBuddy(WEATHER_BUDDY_VARIANTS[weatherBuddyIndex].mode);}

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

function maybePageSwitchDashEgg(source="view"){
  if(!isBuddyTheme())return;
  const el=$("#usagiUrgentEgg"); if(!el||el.classList.contains("play"))return;
  const key="buddyDashEgg:lastAt";
  const now=Date.now();
  let last=0;
  try{last=Number(localStorage.getItem(key)||0)}catch{}
  if(now-last<PAGE_SWITCH_DASH_EGG_COOLDOWN)return;
  const chance=source==="view"?PAGE_SWITCH_DASH_EGG_CHANCE:Math.max(.06,PAGE_SWITCH_DASH_EGG_CHANCE*.72);
  if(Math.random()>chance)return;
  try{localStorage.setItem(key,String(now))}catch{}
  const textEl=el.querySelector(".usagi-urgent-egg-text");
  if(textEl)textEl.textContent="嗚拉呀哈呀哈嗚拉～";
  el.classList.remove("play");
  void el.offsetWidth;
  el.classList.add("play");
  setTimeout(()=>el.classList.remove("play"),2200);
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
  buddyCelebrate("決定好啦！","./usagi_success.png?v=430");
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
function renderDecisionCards(day){
  const ids=day.decisionIds||[];
  if(!ids.length)return "";
  return `<div class="decision-stack">${ids.map(id=>{
    const d=TRIP.decisions.find(x=>x.id===id); if(!d)return "";
    const selected=selectedDecision(id), draft=draftDecision(id);
    const selectedLabel=d.options.find(o=>o.id===selected)?.label||"";
    const draftLabel=d.options.find(o=>o.id===draft)?.label||"";
    const checklist=(d.checklist||[]).length?`<div class="decision-checks">${d.checklist.map(x=>`<div>□ ${esc(x)}</div>`).join("")}</div>`:"";
    return `<section class="decision-card">
      <img class="decision-usagi-art buddy-only-art buddy-reactable" data-buddy-react="usagi" data-buddy-context="booking" src="./usagi_think.png?v=430" alt="烏薩奇">
      <div class="decision-kicker">行程選擇</div>
      <h3>${esc(d.title)}</h3>
      <p>${esc(d.hint||"")}</p>
      ${checklist}
      <div class="decision-options">${d.options.map(o=>{
        const isDraft=draft===o.id,isConfirmed=selected===o.id&&!draft;
        return `<button class="decision-option ${isDraft?"draft":isConfirmed?"selected":""}" data-decision-id="${esc(d.id)}" data-decision-option="${esc(o.id)}">
          <span class="decision-icon">${esc(o.icon||"→")}</span>
          <span><b>${esc(o.label)}</b><small>${esc(o.detail||"")}</small></span>
          <em>${isDraft?"暫選":isConfirmed?"已確認":"選擇"}</em>
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
  if(/搶|預約|決策|時間控制|購物|補貨|交通決策|排隊|租車|還車|航班|固定|必守/.test(text)) return "usagi";
  return "";
}

function buddyDecorForEvent(e){
  const text=`${e.category||""} ${e.title||""} ${e.status||""}`;
  if(/早餐|午餐|晚餐|咖啡|甜點|住宿|休息|飯店|泡湯|Buffet|放空/.test(text)) return "";
  if(/水族館|海豹|海豚|海洋館/.test(text)) return "🐬";
  if(/夕陽|日落|海邊|海岸|海景/.test(text)) return "☁️";
  if(/搶票|預約|固定|強制|決策|還車|租車|購物|補貨/.test(text)) return "";
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
  box.innerHTML=`<div class="hotel-return-copy"><span class="eyebrow">${label}</span><h3>${esc(cleanHotelTitle(hotel.title))}</h3><p>${help}</p><a class="hotel-nav-btn" target="_blank" rel="noopener" href="${mapDirections(hotel.nav||hotel.title)}">↗ Google Maps 查看飯店</a></div><div class="hotel-return-art buddy-only-art buddy-reactable" data-buddy-react="duo" data-buddy-context="hotel"><img src="./hotel-return-duo.webp?v=460" alt="布丁狗與烏薩奇回飯店休息"></div>`;
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
  }else if(/購物|補貨|商場|百貨|服飾|鞋|店|逛/.test(text)){
    kind="usagi";context="shop";
  }else if(/住宿|飯店|Hotel|Check-in|入住|泡湯|大浴場|休息|放空|星空/.test(text)){
    kind="purin";context="hotel";
  }else if(/預約|搶|新幹線|特急|列車|租車|還車|航班|機場|划船|報到|固定|必守|交通/.test(text)){
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
  if(/購物|商場|百貨|服飾|鞋|店|預約|交通|票|車|機場/i.test(text))return "usagi";
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
  // iOS Safari otherwise highlights itinerary text blue or opens the callout while holding.
  el.addEventListener("contextmenu",e=>e.preventDefault());
  el.addEventListener("selectstart",e=>e.preventDefault());
  el.addEventListener("dragstart",e=>e.preventDefault());
}

function bindGuideTargets(visibleEvents=[]){
  $$("#timeline .event-card").forEach((card,i)=>bindSafeHold(card,()=>openGuide(buildEventGuide(visibleEvents[i]))));
  const dayScene=$("#daySceneCard");if(dayScene)bindSafeHold(dayScene,()=>openGuide(buildDayGuide()),{allowInteractiveRoot:true});
  maybeShowGuideCoach();
}

function renderSchedule(){
  const d=TRIP.days[state.dayIndex];
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
          ${e.noNav?"":`<a class="nav-link" target="_blank" rel="noopener" href="${mapNav(e.nav||e.title,weatherMode(e))}">↗ Google Maps 查看</a>`}
          ${eventBuddyHtml(e,i)}
        </div>
      </div>
    </article>`).join("");
  renderHotelReturnCard();
  renderWeather(d);
  requestAnimationFrame(()=>bindGuideTargets(visibleEvents));
}
async function renderWeather(d){
  const card=$("#weatherCard");card.classList.add("skeleton");card.classList.remove("weather-no-forecast");
  $("#weatherLocation").textContent=d.location+" · "+d.shortDate;
  $("#weatherTemp").textContent="載入中";
  $("#weatherDesc").textContent="正在取得旅行日期預報";
  $("#weatherIcon").textContent="☁️";$("#rainBox").innerHTML=""; ensureWeatherBuddy();
  if(typeof getWeather!=="function"){
    card.classList.add("weather-no-forecast");
    $("#weatherTemp").textContent="—";
    $("#weatherDesc").textContent="尚未進入預報範圍";
    $("#rainBox").textContent="接近旅行日期後再顯示正式天氣資料。";
    card.classList.remove("skeleton");
    return;
  }
  try{
    const w=await getWeather(d);
    if(w.state!=="forecast"){
      card.classList.add("weather-no-forecast");
      $("#weatherTemp").textContent="—";
      $("#weatherDesc").textContent=w.message;
      $("#rainBox").innerHTML="進入預報範圍後，這裡會顯示高低溫、降雨機率與預計下雨時段。";
    }else{
      $("#weatherIcon").textContent=w.icon;
      $("#weatherTemp").textContent=w.current!==null?`${w.current}° · ${w.high}° / ${w.low}°`:`${w.high}° / ${w.low}°`;
      $("#weatherDesc").textContent=`${w.desc} · 全日最高降雨機率 ${w.rainMax}%`;
      if(w.rainGroups.length){
        $("#rainBox").innerHTML=w.rainGroups.slice(0,2).map(g=>`<div class="rain-alert">🌧️ 預計 ${g.start}–${g.end} 有雨 · 最高 ${g.maxProb}%</div>`).join("");
      }else {
        $("#rainBox").innerHTML="☂️ 目前預報沒有明顯連續降雨時段。";
      }
    }
  }catch(e){
    $("#weatherTemp").textContent="—";$("#weatherDesc").textContent="天氣暫時無法更新";
    $("#rainBox").textContent="保留上次行程資料；網路恢復後重新切換日期即可再抓。";
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
  const prev=state.view;
  state.view=v;
  $$(".view").forEach(x=>x.classList.toggle("active",x.id===`${v}View`));
  $$(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  $$(".buddy-top-item").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
  window.scrollTo({top:0,behavior:"smooth"});
  if(v==="food") setTimeout(()=>buddyPeek("purin"),450);
  if(v==="tools") setTimeout(()=>buddyPeek("usagi"),450);
  if(prev&&prev!==v)setTimeout(()=>maybePageSwitchDashEgg("view"),240);
}
function switchTool(t){
  const prev=state.tool;
  state.tool=t;
  $$(".tool-card").forEach(x=>x.classList.toggle("active",x.dataset.tool===t));
  $$(".tool-panel").forEach(x=>x.classList.toggle("active",x.id===`${t}Panel`));
  if(prev&&prev!==t)setTimeout(()=>maybePageSwitchDashEgg("tool"),260);
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
    const weatherSwitch=e.target.closest("[data-weather-switch]");
    if(weatherSwitch){handleWeatherBuddyTap();return;}
    const buddyReaction=e.target.closest("[data-buddy-react]");
    if(buddyReaction){buddyReact(buddyReaction.dataset.buddyReact,buddyReaction);}
    const themeChoice=e.target.closest("[data-theme-choice]");if(themeChoice){setDisplayTheme(themeChoice.dataset.themeChoice);return}
    const fontChoice=e.target.closest("[data-font-choice]");if(fontChoice){setFontSize(fontChoice.dataset.fontChoice);return}
    const d=e.target.closest("[data-day]");if(d){state.dayIndex=Number(d.dataset.day);state.decisionDrafts={};renderDays();renderSchedule();return}
    const n=e.target.closest("[data-view]");if(n){switchView(n.dataset.view);return}
    const t=e.target.closest("[data-tool]");if(t){switchTool(t.dataset.tool);return}
    const o=e.target.closest("[data-open-modal]");if(o){openModal(o.dataset.openModal);return}
    const m=e.target.closest("[data-member]");if(m){state.shoppingMember=m.dataset.member;renderShopping();return}
    const decisionConfirm=e.target.closest("[data-decision-confirm]");if(decisionConfirm){await confirmDecision(decisionConfirm.dataset.decisionConfirm);return}
    const decisionClear=e.target.closest("[data-decision-clear]");if(decisionClear){await clearDecision(decisionClear.dataset.decisionClear);return}
    const decision=e.target.closest("[data-decision-id]");if(decision){stageDecision(decision.dataset.decisionId,decision.dataset.decisionOption);return}
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
      "./buddy_eat.png?v=430"
    ];
    let heroIndex=0,swipeIgnoreClick=false;
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
    $$("#buddyHeroDots [data-hero-index]").forEach(dot=>dot.addEventListener("click",()=>setHero(Number(dot.dataset.heroIndex))));

    let sx=0,sy=0,spid=null;
    heroEgg.addEventListener("pointerdown",e=>{if(e.button!==undefined&&e.button!==0)return;sx=e.clientX;sy=e.clientY;spid=e.pointerId;swipeIgnoreClick=false},{passive:true});
    heroEgg.addEventListener("pointerup",e=>{
      if(spid!==e.pointerId)return;
      const dx=e.clientX-sx,dy=e.clientY-sy;spid=null;
      if(Math.abs(dx)>=42&&Math.abs(dx)>Math.abs(dy)*1.15){
        swipeIgnoreClick=true;setHero(heroIndex+(dx<0?1:-1));
        try{navigator.vibrate?.(8)}catch{}
        setTimeout(()=>swipeIgnoreClick=false,380);
      }
    },{passive:true});
    heroEgg.addEventListener("pointercancel",()=>{spid=null;swipeIgnoreClick=false},{passive:true});

    // Hero tap is intentionally inert: swipe changes artwork, long-press opens the easter egg.
    heroEgg.addEventListener("click",()=>{
      if(swipeIgnoreClick)return;
    });
    bindSafeHold(heroEgg,()=>showHeroEgg(pickLine(HERO_EGG_POOL)),{ms:760,move:11,allowInteractiveRoot:true});
    syncDots();
  }
  $("#buddyCelebration")?.addEventListener("click",e=>{
    const wrap=e.currentTarget;
    if(wrap.dataset.heroEgg==="1"){if(e.target===wrap)closeHeroEgg();return}
    wrap.classList.remove("show");
  });
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
  const route=$("#heroPrivateRoute"); if(route) route.textContent=TRIP.heroRoute||"PRIVATE TRIP";
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
      const reg = await navigator.serviceWorker.register("./sw.js?v=5312",{updateViaCache:"none"});
      await reg.update();
    }catch(e){console.warn("Service Worker update failed",e)}
  });
}
