/**
 * Cozy Studio OAuth proxy for Cloudflare Workers.
 * GitHub App user-to-server OAuth: selected-repository installation, Contents read/write.
 * No access tokens, OAuth secrets, or session keys are shipped to GitHub Pages.
 */
const TTL=3*60*60*1000;
const utf8=new TextEncoder(),decoder=new TextDecoder();
function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}})}
function error(message,status=400,headers={}){return json({error:message},status,headers)}
function b64u(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64u(value){const normalized=value.replace(/-/g,'+').replace(/_/g,'/');const raw=atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
function random(){return b64u(crypto.getRandomValues(new Uint8Array(30)))}
async function sessionKey(secret){const hash=await crypto.subtle.digest('SHA-256',utf8.encode(secret));return crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt'])}
async function seal(data,secret){const key=await sessionKey(secret),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,utf8.encode(JSON.stringify(data))));return b64u(iv)+'.'+b64u(cipher)}
async function unseal(value,secret){const parts=value.split('.');if(parts.length!==2)throw Error('bad session');const key=await sessionKey(secret),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(parts[0])},key,unb64u(parts[1]));return JSON.parse(decoder.decode(plain))}
function safeOrigin(value){try{return new URL(value).origin}catch{return ''}}
function allowedOrigin(env){return safeOrigin(env.SITE_URL||'https://chatgbtowlrar-source.github.io/cozy-atelier/admin/')}
function cors(env,origin){if(origin!==allowedOrigin(env))return {};return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET,PUT,POST,OPTIONS','Access-Control-Max-Age':'600','Vary':'Origin'}}
function name(env){return String(env.GH_OWNER||'chatgbtowlrar-source')+'/'+String(env.GH_REPO||'cozy-atelier')}
function configuration(env){return !!(env.GH_CLIENT_ID&&env.GH_CLIENT_SECRET&&env.SESSION_SECRET&&String(env.SESSION_SECRET).length>=32)}
function ghUrl(env,path){return 'https://api.github.com/repos/'+name(env)+'/'+path}
async function github(url,token,method='GET',body=null){const response=await fetch(url,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Cozy-Studio'},body:body===null?undefined:JSON.stringify(body)});let data={};try{data=await response.json()}catch{}if(!response.ok){const err=new Error(response.status===409?'Файл изменён в GitHub. Обнови страницу и попробуй снова.':response.status===403?'Недостаточно прав GitHub: нужны Contents read/write.':data.message||'GitHub API: HTTP '+response.status);err.status=response.status;throw err}return data}
function decodeContent(base64){const raw=atob(base64.replace(/\s/g,'')),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return decoder.decode(bytes)}
function encodeContent(text){const bytes=utf8.encode(text);let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result)}
function okSite(site){return site&&typeof site==='object'&&Array.isArray(site.portfolio)&&site.portfolio.length<=200&&Array.isArray(site.prices)&&site.prices.length<=40&&typeof site.accepting==='boolean'&&site.prices.every(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name.length<=100&&Number.isFinite(+p.price)&&+p.price>=0&&+p.price<=1000000&&(!p.image||(typeof p.image==='string'&&/^assets\\/portfolio\\/[A-Za-z0-9_.-]+\\.webp$/.test(p.image))))&&site.portfolio.every(p=>p&&typeof p.title==='string'&&p.title.length<=150&&typeof p.image==='string'&&(/^assets\/[\w./-]+\.(png|jpg|jpeg|webp)$/i.test(p.image))&&!p.image.includes('..')&&String(p.description||'').length<=1500&&['art','sticker','character'].includes(p.category))}
function callbackPage(message,site,session='',nonce=''){const text=JSON.stringify({type:'cozy:oauth',...(session?{session}:{error:message})}).replace(/</g,'\\u003c');const target=JSON.stringify(safeOrigin(site));return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cozy Studio — GitHub</title></head><body style="background:#173629;color:#f5e5ce;font:16px system-ui;text-align:center;padding:65px 20px"><h1>Cozy Studio</h1><p>${session?'Вход выполнен. Можешь закрыть это окно.':'Не удалось завершить авторизацию. Повтори вход.'}</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage(${text},${target});setTimeout(()=>window.close(),850)}</script></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`}})}
async function readBody(request,max=400000){const len=Number(request.headers.get('content-length')||'0');if(len>max)throw Object.assign(Error('Слишком большой запрос'),{status:413});const text=await request.text();if(text.length>max)throw Object.assign(Error('Слишком большой запрос'),{status:413});try{return JSON.parse(text)}catch{throw Error('Ошибка чтения JSON')}}
async function authorized(request,env){const header=request.headers.get('authorization')||'';if(!header.startsWith('Bearer '))throw Object.assign(Error('Нужна авторизация'),{status:401});let info;try{info=await unseal(header.slice(7),env.SESSION_SECRET)}catch{throw Object.assign(Error('Сеанс входа недействителен'),{status:401})}if(!info||!info.exp||info.exp<Date.now()||info.login?.toLowerCase()!==String(env.GH_OWNER).toLowerCase()||!info.token)throw Object.assign(Error('Срок входа истёк. Авторизуйся снова.'),{status:401});return info}
export default {async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('origin')||'',corsHeaders=cors(env,origin);
 if(url.pathname==='/health')return json({status:'ok',configured:configuration(env),repository:name(env)});
 if(request.method==='OPTIONS'&&url.pathname.startsWith('/api/'))return new Response(null,{status:204,headers:corsHeaders});
 if(!configuration(env))return error('Сервер авторизации не настроен. Добавь GH_CLIENT_ID, GH_CLIENT_SECRET и SESSION_SECRET в Cloudflare Secrets.',503,corsHeaders);
 if(url.pathname==='/login'&&request.method==='GET'){
  const state=random(),redirect=new URL('/callback',url.origin).toString();const endpoint=new URL('https://github.com/login/oauth/authorize');endpoint.searchParams.set('client_id',env.GH_CLIENT_ID);endpoint.searchParams.set('redirect_uri',redirect);endpoint.searchParams.set('state',state);endpoint.searchParams.set('allow_signup','false');
  return new Response(null,{status:302,headers:{Location:endpoint.toString(),'Set-Cookie':`__Host-cozy-auth=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
 }
 if(url.pathname==='/callback'&&request.method==='GET'){
  const nonce=random(),state=url.searchParams.get('state')||'',cookie=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-cozy-auth='))?.split('=')[1]||'';
  if(!state||!cookie||state!==cookie||url.searchParams.has('error'))return callbackPage('Проверка OAuth не пройдена',env.SITE_URL,'',nonce);
  const code=url.searchParams.get('code');if(!code)return callbackPage('GitHub не вернул код авторизации',env.SITE_URL,'',nonce);
  try{
   const exchange=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','User-Agent':'Cozy-Studio'},body:JSON.stringify({client_id:env.GH_CLIENT_ID,client_secret:env.GH_CLIENT_SECRET,code,redirect_uri:new URL('/callback',url.origin).toString()})});const credentials=await exchange.json();if(!exchange.ok||!credentials.access_token)throw Error('token exchange failed');const token=credentials.access_token;
   const user=await github('https://api.github.com/user',token);
   if(String(user.login).toLowerCase()!==String(env.GH_OWNER).toLowerCase())throw Error('not the expected GitHub account');
   const repo=await github('https://api.github.com/repos/'+name(env),token);
   if(!repo.permissions?.push)throw Error('GitHub App has no repository write permission');
   const ticket=await seal({login:user.login,token,exp:Date.now()+TTL},env.SESSION_SECRET);
   return callbackPage('',env.SITE_URL,ticket,nonce)
  }catch(err){console.log('Cozy Studio OAuth failure:',err.message);return callbackPage('Ошибка авторизации GitHub',env.SITE_URL,'',nonce)}
 }
 if(!url.pathname.startsWith('/api/'))return error('Неизвестный адрес',404);
 if(origin!==allowedOrigin(env))return error('Неверный Origin запроса',403);
 try{
  const info=await authorized(request,env),token=info.token;
  if(url.pathname==='/api/whoami'&&request.method==='GET')return json({login:info.login},200,corsHeaders);
  if(url.pathname==='/api/site'&&request.method==='GET'){
   const file=await github(ghUrl(env,'contents/data/site.json?ref=main'),token);return json({site:JSON.parse(decodeContent(file.content)),sha:file.sha},200,corsHeaders)
  }
  if(url.pathname==='/api/site'&&request.method==='PUT'){
   const {site,sha}=await readBody(request);if(!okSite(site)||!(/^[a-f0-9]{40}$/.test(String(sha))))return error('Ошибка формата данных или версии файла',422,corsHeaders);
   const payload={message:'Cozy Studio: обновить портфолио, прайс и настройки',content:encodeContent(JSON.stringify(site,null,2)+'\n'),sha,branch:'main'};
   const result=await github(ghUrl(env,'contents/data/site.json'),token,'PUT',payload);return json({sha:result.content?.sha,commit:result.commit?.sha},200,corsHeaders)
  }
  if(url.pathname==='/api/image'&&request.method==='POST'){
   const body=await readBody(request,3000000);if(body.mime!=='image/webp'||typeof body.content!=='string'||!/^[A-Za-z0-9+/=]+$/.test(body.content)||body.content.length>2500000||body.content.length<50)return error('Нужен файл WebP до 1.8 МБ',422,corsHeaders);
   const bytes=unb64u(body.content.replace(/\+/g,'-').replace(/\//g,'_'));if(bytes.length<12||decoder.decode(bytes.subarray(0,4))!=='RIFF'||decoder.decode(bytes.subarray(8,12))!=='WEBP')return error('Неверный формат файла WebP',422,corsHeaders);
   const path='assets/portfolio/'+Date.now()+'-'+random().slice(0,13)+'.webp';await github(ghUrl(env,'contents/'+path),token,'PUT',{message:'Cozy Studio: загрузить изображение',content:body.content,branch:'main'});return json({path},200,corsHeaders)
  }
  return error('Неизвестная операция',404,corsHeaders)
 }catch(err){return error(err.message||'Ошибка',err.status||500,corsHeaders)}
 }};
