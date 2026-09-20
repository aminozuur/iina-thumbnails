const { core, mpv, menu, utils, overlay, input, event, file, console, preferences } = iina;

const DEFAULT_COUNT=20;
function columnsForCount(n){
  // Choose the column count that makes the 4:3 thumbnails as large as possible
  // while still fitting every row inside the available panel.
  const frame=core.window.frame;
  const W=Number(frame.width)||0, H=Number(frame.height)||0;
  const panelW=W*.94, panelH=H-48-56-38, gap=8;
  if(!W||!H||panelW<=0||panelH<=0) return n<=20?5:n<=30?6:7;
  let bestCols=5, bestCellW=0;
  for(let cols=3;cols<=16;cols++){
    const rows=Math.ceil(n/cols);
    const maxW=(panelW-gap*(cols-1))/cols;
    const maxH=(panelH-gap*(rows-1))/rows;
    const cellW=Math.min(maxW,maxH*4/3);
    if(cellW>bestCellW){bestCellW=cellW;bestCols=cols;}
  }
  return bestCols;
}
let count=DEFAULT_COUNT;
let visible=false, overlayReady=false, thumbs=[], mouseHandlerInstalled=false, pollTimer=null, resizeWatchTimer=null, lastResizeW=0, lastResizeH=0, blurEnabled=true;

function getCount(){
  const n=Number(preferences.get("thumbnail_count"));
  return [10,15,20,30,40,60,100].includes(n) ? n : DEFAULT_COUNT;
}
function refreshCount(){
  count=getCount();
  const storedBlur=preferences.get("background_blur");
  blurEnabled = storedBlur === undefined || storedBlur === null ? true : Boolean(storedBlur);
}
const READER="#!/usr/bin/env python3\nimport base64, json, os, struct, sys\nvideo, cache, duration_s, count_s = sys.argv[1:5]\nduration=float(duration_s); count=int(count_s)\ndef fail(msg):\n print(json.dumps({'ok':False,'error':msg},separators=(',',':'))); raise SystemExit\ntry: vst=os.stat(video)\nexcept Exception as e: fail(f'video stat failed: {e}')\ntry:\n with open(cache,'rb') as f: data=f.read()\nexcept Exception as e: fail(f'cannot read IINA cache: {e}')\nif len(data)<17: fail(f'IINA cache is too small ({len(data)} bytes)')\nif data[0]!=2: fail(f'unsupported IINA thumbnail cache version: {data[0]}')\nif struct.unpack_from('<Q',data,1)[0]!=vst.st_size or struct.unpack_from('<q',data,9)[0]!=int(vst.st_mtime): fail('IINA cache belongs to an older version of this video')\npos=17; items=[]\nwhile pos<len(data):\n if pos+16>len(data): fail('truncated thumbnail block header')\n block=struct.unpack_from('<q',data,pos)[0]; ts=struct.unpack_from('<d',data,pos+8)[0]; pos+=16\n n=block-8\n if block<8 or pos+n>len(data): fail('invalid thumbnail block length')\n jpeg=data[pos:pos+n]; pos+=n\n if jpeg[:2]==b'\\xff\\xd8': items.append((ts,jpeg))\nif not items: fail('IINA cache contains no JPEG thumbnails')\nselected=[]\nfor i in range(count):\n target=duration*(i+0.5)/count; ts,jpeg=min(items,key=lambda x:abs(x[0]-target))\n selected.append({'time':ts,'image':'data:image/jpeg;base64,'+base64.b64encode(jpeg).decode('ascii')})\nprint(json.dumps({'ok':True,'count':len(items),'thumbs':selected},separators=(',',':')))\n";

function formatTime(seconds) { seconds=Math.max(0,Math.round(seconds)); const h=Math.floor(seconds/3600), m=Math.floor((seconds%3600)/60), s=seconds%60; return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`; }
function setupOverlay() { if(overlayReady)return; overlay.simpleMode(); overlay.setStyle(`:root{color-scheme:dark}html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif}.shade{position:absolute;inset:0;background:rgba(0,0,0,.10);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);pointer-events:none}.shade.noBlur{backdrop-filter:none;-webkit-backdrop-filter:none}.panel{box-sizing:border-box;position:absolute;left:3%;right:3%;top:48px;bottom:56px;padding:0;background:transparent;border:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;overflow:hidden}.grid{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));grid-template-rows:none;gap:8px;width:100%;height:100%}.thumb{position:relative;min-width:0;min-height:0;overflow:hidden;border-radius:7px;border:1px solid rgba(255,255,255,.16);background:#111;box-shadow:0 2px 8px rgba(0,0,0,.28);cursor:pointer;transition:box-shadow .12s ease,filter .12s ease}.thumb.empty{background:transparent;border-color:transparent;box-shadow:none}.thumb.empty:hover{box-shadow:none;filter:none}.thumb:hover{box-shadow:0 2px 8px rgba(0,0,0,.28);filter:brightness(1.08)}.thumb:hover::after{content:"";position:absolute;inset:0;border:2px solid rgba(255,255,255,.82);border-radius:7px;box-sizing:border-box;pointer-events:none}.thumb img{width:100%;height:100%;display:block;object-fit:cover}.scrollHint{position:absolute;left:50%;bottom:-1px;transform:translateX(-50%);padding:4px 8px;border-radius:6px;color:rgba(255,255,255,.68);background:rgba(0,0,0,.52);font-size:11px;font-variant-numeric:tabular-nums;pointer-events:none}.time{position:absolute;left:6px;bottom:5px;padding:2px 5px;border-radius:4px;color:white;background:rgba(0,0,0,.72);font-size:10px;font-variant-numeric:tabular-nums}.status{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:9px;padding:9px 13px;border-radius:9px;color:rgba(255,255,255,.86);background:rgba(0,0,0,.62);font-size:13px;white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,.25)}.countControl{position:absolute;left:50%;right:auto;top:0px;transform:translateX(-50%);display:flex;align-items:center;gap:9px;padding:6px 10px;border-radius:9px;color:rgba(255,255,255,.9);background:rgba(0,0,0,.52);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font-size:12px;box-shadow:0 4px 18px rgba(0,0,0,.22)}.countControl > input[type="range"]{width:120px;height:16px;margin:0;accent-color:#fff;cursor:pointer}.countValue{min-width:22px;text-align:right;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.82)}.blurToggle{display:flex;align-items:center;gap:5px;margin-left:6px;width:105px;height:28px;box-sizing:border-box;white-space:nowrap;color:rgba(255,255,255,.82);cursor:pointer}.blurToggle input{width:14px;height:14px;margin:0;accent-color:#fff;cursor:pointer}.spinner{width:13px;height:13px;border:2px solid rgba(255,255,255,.28);border-top-color:rgba(255,255,255,.9);border-radius:50%;animation:spin .75s linear infinite;flex:none}@keyframes spin{to{transform:rotate(360deg)}}`); overlay.onMessage('thumbnail-count',(value)=>{const n=Number(value);if(![10,15,20,30,40,60,100].includes(n))return;preferences.set('thumbnail_count',n);preferences.sync();count=n;thumbs=[];render('Loading thumbnails…',true);loadNativeCache();}); overlay.onMessage('background-blur',(value)=>{blurEnabled=Boolean(value);preferences.set('background_blur',blurEnabled);preferences.sync();render(thumbs.length?'':'Loading thumbnails…',!thumbs.length);}); overlayReady=true; }
function gridGeometry() {
  const frame=core.window.frame;
  const W=Number(frame.width)||0, H=Number(frame.height)||0;
  const panelW=W*.94, panelH=H-48-56-38, gap=8, cols=columnsForCount(count), rows=Math.ceil(count/cols);
  if(!W||!H||panelW<=0||panelH<=0) return {rows,panelW,panelH,gap,left:0,top:0,width:panelW,height:panelH,cellW:0,cellH:0};
  const maxCellW=(panelW-gap*(cols-1))/cols;
  const maxCellH=(panelH-gap*(rows-1))/rows;
  const cellW=Math.min(maxCellW,maxCellH*4/3);
  const cellH=cellW*3/4;
  const width=cellW*cols+gap*(cols-1);
  const height=cellH*rows+gap*(rows-1);
  return {rows,cols,panelW,panelH,gap,left:(panelW-width)/2,top:38+(panelH-height)/2,width,height,cellW,cellH};
}
function render(statusText='',loading=false) {
  setupOverlay();
  const g=gridGeometry();
  let grid='';
  for(let i=0;i<count;i++){
    const t=thumbs[i];
    grid += t ? `<div class="thumb"><img src="${t.image}" draggable="false"><div class="time">${formatTime(t.time)}</div></div>` : `<div class="thumb empty"></div>`;
  }
  const gridStyle=`--cols:${g.cols};position:absolute;left:${g.left.toFixed(2)}px;top:${g.top.toFixed(2)}px;width:${g.width.toFixed(2)}px;height:${g.height.toFixed(2)}px;grid-template-rows:repeat(${g.rows},minmax(0,1fr));`;
  const blurClass=blurEnabled?'':' noBlur';
  overlay.setContent(`<div class="shade${blurClass}"></div><div class="panel"><div class="countControl"><span>Thumbnails</span><input data-clickable type="range" min="0" max="6" step="1" value="${[10,15,20,30,40,60,100].indexOf(count)}" aria-label="Thumbnail count" oninput="this.nextElementSibling.textContent=[10,15,20,30,40,60,100][this.value]" onchange="iina.postMessage('thumbnail-count', [10,15,20,30,40,60,100][this.value])"><span class="countValue">${count}</span><div class="blurToggle" role="checkbox" aria-checked="${blurEnabled}"><input type="checkbox" tabindex="-1" ${blurEnabled?'checked':''} style="pointer-events:none"><span>Background blur</span></div></div><div class="grid" style="${gridStyle}">${grid}</div>${statusText?`<div class="status">${loading?'<span class="spinner"></span>':''}<span>${statusText}</span></div>`:''}</div>`);
}
function stopResizeWatch(){ if(resizeWatchTimer){clearInterval(resizeWatchTimer);resizeWatchTimer=null;} lastResizeW=0; lastResizeH=0; }
function startResizeWatch(){
  stopResizeWatch();
  if(!visible)return;
  const f=core.window.frame;
  lastResizeW=Number(f.width)||0; lastResizeH=Number(f.height)||0;
  // IINA's window-resized event may arrive only after the native resize gesture ends.
  // Poll the live window frame while the viewer is open so the grid follows the drag.
  resizeWatchTimer=setInterval(()=>{
    if(!visible){stopResizeWatch();return;}
    const frame=core.window.frame;
    const w=Number(frame.width)||0, h=Number(frame.height)||0;
    if(w===lastResizeW && h===lastResizeH)return;
    lastResizeW=w; lastResizeH=h;
    render(thumbs.length?'':'Loading thumbnails…',!thumbs.length);
  },33);
}
function closeOverlay() { visible=false; if(overlayReady){overlay.hide();overlay.setClickable(false);} if(pollTimer){clearInterval(pollTimer);pollTimer=null;} stopResizeWatch(); }
function installMouseHandler() {
  if(mouseHandlerInstalled)return;
  input.onMouseUp(input.MOUSE,({x,y})=>{
    if(!visible)return false;
    const frame=core.window.frame,W=Number(frame.width),H=Number(frame.height);
    if(!W||!H)return false;
    const topY=H-Number(y);
    const panelX=W*.03,panelY=48,panelW=W*.94,panelH=H-48-56;

    // Handle the blur toggle natively. The overlay WebView can receive the
    // checkbox click, but the HIGH-priority input handler otherwise treats
    // the label area as a click outside the thumbnail grid and closes the view.
    // Keep the slider/WebView interaction unchanged.
    // The control bar is fixed at the horizontal center of the video,
    // independent of the thumbnail grid width/count.
    const controlCenter=W/2;
    const blurLeft=controlCenter+65;
    const blurRight=controlCenter+205;
    const blurTop=panelY;
    const blurBottom=blurTop+40;
    if(x>=blurLeft&&x<=blurRight&&topY>=blurTop&&topY<=blurBottom){
      blurEnabled=!blurEnabled;
      preferences.set('background_blur',blurEnabled);
      preferences.sync();
      render(thumbs.length?'':'Loading thumbnails…',!thumbs.length);
      return true;
    }
    const g=gridGeometry();
    const gridX=panelX+g.left,gridY=panelY+g.top,gridW=g.width,gridH=g.height,gap=g.gap,cellW=g.cellW,cellH=g.cellH,rows=g.rows,cols=g.cols;
    if(x<panelX||x>panelX+panelW||topY<panelY||topY>panelY+panelH){closeOverlay();return true;}
    if(x<gridX||x>gridX+gridW||topY<gridY||topY>gridY+gridH){closeOverlay();return true;}
    const col=Math.floor((x-gridX)/(cellW+gap)),row=Math.floor((topY-gridY)/(cellH+gap));
    if(col<0||col>=cols||row<0||row>=rows)return true;
    const lx=(x-gridX)-col*(cellW+gap),ly=(topY-gridY)-row*(cellH+gap);
    if(lx>cellW||ly>cellH){closeOverlay();return true;}
    const t=thumbs[row*cols+col];
    if(t&&Number.isFinite(Number(t.time))){core.seekTo(Number(t.time));closeOverlay();}
    return true;
  },input.PRIORITY_HIGH);
  mouseHandlerInstalled=true;
}
function pythonPath(){for(const p of ['/opt/homebrew/bin/python3','/usr/local/bin/python3','/usr/bin/python3','python3'])if(utils.fileInPath(p))return p;return null;}
function u64le(a,o){let n=0,m=1;for(let i=0;i<8;i++){n+=a[o+i]*m;m*=256;}return n;}
function i64le(a,o){const u=u64le(a,o);return u>=0x8000000000000000?u-0x10000000000000000:u;}
function f64le(a,o){return new DataView(a.buffer,a.byteOffset,a.byteLength).getFloat64(o,true);}
function base64(a){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='',i=0;for(;i+2<a.length;i+=3){const n=a[i]*65536+a[i+1]*256+a[i+2];out+=chars[(n>>18)&63]+chars[(n>>12)&63]+chars[(n>>6)&63]+chars[n&63];}const r=a.length-i;if(r===1){const n=a[i]*65536;out+=chars[(n>>18)&63]+chars[(n>>12)&63]+'==';}else if(r===2){const n=a[i]*65536+a[i+1]*256;out+=chars[(n>>18)&63]+chars[(n>>12)&63]+chars[(n>>6)&63]+'=';}return out;}
function parseNativeCache(bytes,duration){
  if(bytes.length<17) throw new Error(`IINA cache is too small (${bytes.length} bytes).`);
  if(bytes[0]!==2) throw new Error(`Unsupported IINA cache version: ${bytes[0]}.`);
  const items=[];let pos=17;
  while(pos<bytes.length){
    if(pos+16>bytes.length) throw new Error('IINA cache has a truncated thumbnail header.');
    const block=i64le(bytes,pos),ts=f64le(bytes,pos+8);pos+=16;
    const jpegLen=block-8;
    if(jpegLen<2||pos+jpegLen>bytes.length) throw new Error('IINA cache contains an invalid thumbnail block.');
    const jpeg=bytes.slice(pos,pos+jpegLen);pos+=jpegLen;
    if(jpeg[0]===0xff&&jpeg[1]===0xd8) items.push({time:ts,image:'data:image/jpeg;base64,'+base64(jpeg)});
  }
  if(!items.length) throw new Error('IINA cache contains no JPEG thumbnails.');
  const selected=[];
  for(let i=0;i<count;i++){const target=duration*(i+0.5)/count;let best=items[0],bd=Math.abs(items[0].time-target);for(let j=1;j<items.length;j++){const d=Math.abs(items[j].time-target);if(d<bd){best=items[j];bd=d;}}selected.push(best);}
  return selected;
}
function localFilePath(url){
  let s=String(url||'');
  if(s.startsWith('file://')){
    s=s.slice(7);
    try{s=decodeURIComponent(s);}catch(_){}
    if(s.startsWith('localhost/')) s=s.slice('localhost'.length);
  }
  return s;
}
async function videoMetadata(url){
  const path=localFilePath(url);
  if(!path || path.startsWith('http://') || path.startsWith('https://')) throw new Error('Current media is not a local file.');
  const r=await utils.exec('/usr/bin/stat',['-f','%z %m',path]);
  if(r.status!==0) throw new Error((r.stderr||'Could not read video file metadata.').trim());
  const parts=r.stdout.trim().split(/\s+/);if(parts.length<2)throw new Error('Could not parse video file metadata.');
  return {size:Number(parts[0]),mtime:Number(parts[1]),path};
}
async function readHeader(path){
  const h=file.handle(path,'read');try{return h.read(17);}finally{h.close();}}
async function readNativeCache(){
  const url=core.status.url,duration=Number(core.status.duration);
  if(!url||!duration||duration<=0||core.status.isNetworkResource)return {ok:false,error:'No local video is ready.'};
  const path=localFilePath(url);
  const dir=utils.resolvePath('~/Library/Caches/com.colliderli.iina/thumb_cache');
  if(!file.exists(dir))return {ok:false,error:'IINA thumbnail-cache directory does not exist yet.'};
  // IINA names its cache file with MD5(URL.path), not with a hash of the file contents.
  // This is the same calculation used by Utility.mpvWatchLaterMd5() for local files.
  let hashResult;
  try{hashResult=await utils.exec('/sbin/md5',['-qs',path]);}catch(e){return {ok:false,error:'Could not calculate IINA cache name: '+String(e.message||e)}}
  if(hashResult.status!==0)return {ok:false,error:(hashResult.stderr||'Could not calculate IINA cache name.').trim()};
  const cacheName=String(hashResult.stdout||'').trim().toLowerCase();
  if(!/^[0-9a-f]{32}$/.test(cacheName))return {ok:false,error:'Unexpected IINA cache name: '+cacheName};
  const cachePath=dir.replace(/\/$/,'')+'/'+cacheName;
  if(!file.exists(cachePath))return {ok:false,error:`IINA has not generated the native thumbnail cache for this video yet. Expected cache: ${cacheName}`};
  try{
    const h=file.handle(cachePath,'read');const bytes=h.readToEnd();h.close();
    return {ok:true,thumbs:parseNativeCache(bytes,duration),cache:cachePath};
  }catch(e){return {ok:false,error:'Could not read IINA thumbnail cache: '+String(e.message||e)}
  }
}
async function loadNativeCache() { refreshCount(); const r=await readNativeCache(); if(r.ok){thumbs=r.thumbs;render();return true;} thumbs=[]; const waiting=!r.error || r.error.includes('has not generated') || r.error.includes('directory does not exist') || r.error.includes('not ready'); render(waiting?'Loading thumbnails…':r.error,waiting); return false; }
function watchCache() { if(pollTimer)clearInterval(pollTimer); let tries=0; pollTimer=setInterval(async()=>{tries++; if(!visible){clearInterval(pollTimer);pollTimer=null;return;} if(await loadNativeCache()||tries>=60){clearInterval(pollTimer);pollTimer=null;}},1000); }
async function toggle() { if(visible){closeOverlay();return;} refreshCount(); visible=true;setupOverlay();installMouseHandler();overlay.setClickable(true);overlay.show(); startResizeWatch(); if(!(await loadNativeCache()))watchCache(); }
event.on('iina.file-loaded',()=>{thumbs=[];scrollStart=0; if(visible)render('Loading thumbnails…',true);});
event.on('iina.thumbnails-ready',()=>{if(visible)loadNativeCache();});
event.on('iina.window-resized',()=>{
  if(!visible)return;
  const frame=core.window.frame;
  lastResizeW=Number(frame.width)||lastResizeW;
  lastResizeH=Number(frame.height)||lastResizeH;
  render(thumbs.length?'':'Loading thumbnails…',!thumbs.length);
});
menu.addItem(menu.item('Show Thumbnails',toggle,{keyBinding:'0'}));
input.onKeyDown('0',({isRepeat})=>{if(isRepeat)return true;toggle();return true;},input.PRIORITY_HIGH);
