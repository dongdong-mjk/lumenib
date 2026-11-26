// 로그인 + 노트 서버 보관 (Supabase)
// - 노트 목록(제목·날짜·본문 등)은 DB 표 notes 에, 손글씨는 노트마다 압축 파일 하나로 저장소 'ink' 에 올려요.
// - 기기에 먼저 저장하고(오프라인에서도 써짐), 고친 지 3초 뒤에 서버로 올려요. 두 기기에서 같은 노트를 고치면 나중에 고친 쪽이 남아요.
// - config.js 에 주소·키가 없으면 아무것도 하지 않아요.
import { SUPABASE_URL, SUPABASE_KEY, LOGIN, CONSENT, EMAIL_MODE } from './config.js';
import * as S from './store.js';

export const enabled = !!(SUPABASE_URL && SUPABASE_KEY);
export const loginOptions = LOGIN;
export const emailMode = EMAIL_MODE;
export const consentInfo = CONSENT;
const PENDING_CONSENT = 'lumenib.consentPending';
const BUCKET = 'ink';

let sb = null;
let user = null;
let status = 'off'; // off · syncing · ok · offline · error · quota
let lastSync = 0;
const subs = new Set();
const emit = (what) => subs.forEach((f) => { try { f(what); } catch (e) { console.error(e); } });
export const on = (f) => { subs.add(f); return () => subs.delete(f); };
export const currentUser = () => user;
export const syncStatus = () => ({ status, lastSync, pending: user ? S.ownedBy(user.id).filter((n) => n._dirty).length : 0 });

// 앱 쪽(app.js)이 채우는 화면 도우미: 동의 창, 알림
export const ui = { askConsent: async () => false, toast: () => {} };

// 아이패드 앱(Capacitor) 안인지, 홈 화면에 추가한 웹앱인지
export const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.();
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function loadLib() {
  if (window.supabase?.createClient) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = new URL('./vendor/supabase.js', import.meta.url).href;
    s.onload = ok; s.onerror = () => fail(new Error('supabase load'));
    document.head.appendChild(s);
  });
}

const setStatus = (s) => { status = s; emit('status'); };
const redirectURL = () => location.origin + location.pathname;

// ---------- 시작 ----------
// 홈을 그리기 전에, 지난번 로그인한 계정의 노트를 바로 보여요 (11/25: 로그인 확인·동의 조회가 서버를 거쳐 끝날 때까지
// 내 노트가 숨겨져 홈 최근 노트가 늦게 떴어요). 서버 확인이 끝나면 그 결과로 다시 맞춰요
export function restoreOwnerFast() {
  if (!enabled) return;
  try {
    const raw = JSON.parse(localStorage.getItem('lumenib.auth') || 'null');
    const uid = raw?.user?.id || raw?.currentSession?.user?.id;
    if (uid) S.setOwner(uid);
  } catch {}
}
const CONSENT_OK = (uid) => 'lumenib.consentOk.' + uid;

export async function init() {
  if (!enabled) return;
  // 로그인에서 돌아온 주소의 오류 표시 (?error_description=…)
  const q = new URLSearchParams(location.search + '&' + location.hash.slice(1));
  const err = q.get('error_description');
  try { await loadLib(); } catch { setStatus('offline'); return; }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'lumenib.auth' },
  });
  const { data } = await sb.auth.getSession();
  if (q.has('code') || q.has('error') || location.hash.includes('access_token')) history.replaceState(null, '', location.pathname);
  if (err) ui.toast('로그인하지 못했어요: ' + err, 4000);
  sb.auth.onAuthStateChange((ev, session) => {
    // 이 안에서 바로 서버를 부르면 멈출 수 있어서 한 박자 뒤에 처리해요
    setTimeout(() => {
      if (ev === 'SIGNED_OUT') { if (user) S.dropOwner(user.id); user = null; S.setOwner(null); setStatus('off'); emit('user'); }
      else if (session?.user && (!user || user.id !== session.user.id)) afterLogin(session.user);
    }, 0);
  });
  if (data.session?.user) await afterLogin(data.session.user);
  else { S.setOwner(null); emit('user'); } // 미리 보여 준 계정이 실제로는 로그아웃돼 있었으면 되돌려요

  S.hooks.changed = () => schedulePush();
  S.bibleHooks.changed = () => { bibleDirty = true; schedulePush(); }; // 읽기 기록·북마크도 계정에
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushNow(); });
  window.addEventListener('online', () => { if (user) sync(); });
}

let loggingIn = false;
async function afterLogin(u) {
  if (loggingIn) return;
  loggingIn = true;
  try { const p = localStorage.getItem('lumenib.loginWith'); if (p) { localStorage.setItem('lumenib.provider.' + u.id, p); localStorage.removeItem('lumenib.loginWith'); } } catch {}
  try {
    // 1) 보관 동의 확인 (로그인 전에 동의했으면 그걸 저장, 아니면 지금 물어봄)
    let agreed = false;
    const pending = localStorage.getItem(PENDING_CONSENT);
    if (pending === CONSENT.VERSION) agreed = true;
    else if (localStorage.getItem(CONSENT_OK(u.id)) === CONSENT.VERSION) agreed = true; // 이 기기에서 이미 확인한 동의는 서버에 다시 묻지 않아요
    else {
      const { data } = await sb.from('consents').select('version').eq('user_id', u.id).maybeSingle();
      agreed = data?.version === CONSENT.VERSION;
      if (!agreed) agreed = await ui.askConsent({ afterLogin: true, localCount: S.unownedCount() });
    }
    if (!agreed) { await sb.auth.signOut({ scope: 'local' }); ui.toast('보관에 동의하지 않아 로그아웃했어요'); return; }
    if (localStorage.getItem(CONSENT_OK(u.id)) !== CONSENT.VERSION) {
      const { error } = await sb.from('consents').upsert({ user_id: u.id, version: CONSENT.VERSION, agreed_at: new Date().toISOString() });
      if (!error) { localStorage.removeItem(PENDING_CONSENT); localStorage.setItem(CONSENT_OK(u.id), CONSENT.VERSION); }
    }

    // 2) 이 기기에서 로그인 전에 쓴 노트를 내 계정으로
    user = u;
    S.setOwner(u.id);
    const moved = S.adoptUnowned(u.id);
    emit('user');
    if (moved) ui.toast(`이 기기의 노트 ${moved}편을 내 계정에 보관해요`);
    await sync();
  } finally { loggingIn = false; }
}

// ---------- 로그인 · 로그아웃 ----------
// 로그인 버튼을 누르기 전에 동의 창에서 '동의하고 계속'을 누르면 불러요
export const markConsent = () => localStorage.setItem(PENDING_CONSENT, CONSENT.VERSION);

export async function signInWith(provider) {
  markConsent();
  try { localStorage.setItem('lumenib.loginWith', provider); } catch {} // 이 기기에서 고른 로그인 방법 (같은 이메일로 여러 방법을 쓰면 서버 정보만으론 헷갈려요, 11/26)
  if (provider === 'apple' && hasNativeApple()) return signInWithAppleNative();
  if (hasNativeOAuth() && provider === 'google') return signInWithSystemBrowser(provider); // 카카오는 앱 안에서도 되니 그대로
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirectURL() } });
  if (error) throw error;
}
// 앱 안 구글(·카카오) 로그인 (11/26): 시스템 로그인 창 → lumenib://auth?code=… → 세션
export const hasNativeOAuth = () => !!window.webkit?.messageHandlers?.lumenibOAuth;
async function signInWithSystemBrowser(provider) {
  const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: 'lumenib://auth', skipBrowserRedirect: true } });
  if (error) throw error;
  return new Promise((resolve, reject) => {
    window.lumenibOAuth = async (r) => {
      window.lumenibOAuth = null;
      if (!r || r.error) { if (r?.error === 'cancel') { resolve(false); return; } reject(new Error(r?.error || 'oauth')); return; }
      try {
        const u = new URL(r.url);
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error_description') || u.searchParams.get('error');
        if (err) throw new Error(err);
        const { error: e2 } = await sb.auth.exchangeCodeForSession(code);
        if (e2) throw e2;
        resolve(true);
      } catch (e) { reject(e); }
    };
    window.webkit.messageHandlers.lumenibNative.postMessage({ action: 'oauth', url: data.url, scheme: 'lumenib' });
  });
}
// Apple로 로그인 (11/26): 앱 안에서만. iPad 기본 Apple 창 → identity token → Supabase
export const hasNativeApple = () => !!window.webkit?.messageHandlers?.lumenibApple;
function signInWithAppleNative() {
  return new Promise((resolve, reject) => {
    window.lumenibApple = async (r) => {
      window.lumenibApple = null;
      if (!r || r.error) { if (r?.error === 'cancel') { resolve(false); return; } reject(new Error(r?.error || 'apple')); return; }
      try {
        const { error } = await sb.auth.signInWithIdToken({ provider: 'apple', token: r.token, nonce: r.nonce });
        if (error) throw error;
        // Apple은 이름을 처음 한 번만 알려 줘요. 받으면 계정에 남겨요
        if (r.name) await sb.auth.updateUser({ data: { full_name: r.name } }).catch(() => {});
        resolve(true);
      } catch (e) { reject(e); }
    };
    window.webkit.messageHandlers.lumenibNative.postMessage({ action: 'appleSignIn' });
  });
}
export async function sendEmailCode(email) {
  markConsent();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectURL() } });
  if (error) throw error;
}
export async function verifyEmailCode(email, code) {
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw error;
}

export async function signOut({ force = false } = {}) {
  if (!user) return true;
  await pushNow();
  if (!force && syncStatus().pending) return false; // 아직 못 올린 노트가 있으면 앱이 한 번 더 물어봐요
  const id = user.id;
  await sb.auth.signOut({ scope: 'local' });
  S.dropOwner(id);
  user = null; S.setOwner(null); setStatus('off'); emit('user');
  return true;
}

// 내 계정과 서버의 노트를 모두 지워요 (되돌릴 수 없음)
export async function deleteAccount() {
  if (!user) return;
  const id = user.id;
  clearTimeout(pushTimer);
  for (;;) { // 손글씨 파일 먼저
    const { data, error } = await sb.storage.from(BUCKET).list(id, { limit: 1000 });
    if (error) throw error;
    if (!data?.length) break;
    const { error: e2 } = await sb.storage.from(BUCKET).remove(data.map((f) => `${id}/${f.name}`));
    if (e2) throw e2;
    if (data.length < 1000) break;
  }
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
  await sb.auth.signOut({ scope: 'local' }).catch(() => {});
  S.dropOwner(id);
  user = null; S.setOwner(null); setStatus('off'); emit('user');
}

export function displayName() {
  if (!user) return '';
  const m = user.user_metadata || {};
  return m.full_name || m.name || m.nickname || m.preferred_username || user.email || '내 계정';
}
export function providerName() {
  // app_metadata.provider는 계정을 처음 만든 방식이라, 같은 이메일로 다른 방식(구글↔카카오)으로 들어오면 틀려요.
  // 가장 최근에 로그인한 연결(identity)을 써요 (11/26 민정님: 구글로 들어왔는데 카카오라고 나옴)
  const p = currentProvider();
  return { google: 'Google', kakao: '카카오', apple: 'Apple', email: '이메일' }[p] || '';
}
// 로그인한 계정의 프로필 사진 (카카오: avatar_url / picture, 구글: picture). 없으면 '' (11/26)
// 지금 로그인한 방식: 이 기기에서 로그인할 때 누른 버튼 → 없으면 가장 최근에 로그인한 연결 → 처음 가입한 방식
function currentProvider() {
  if (!user) return '';
  let p = null;
  try { p = localStorage.getItem('lumenib.provider.' + user.id); } catch {}
  if (p) return p;
  const ids = (user.identities || []).slice().sort((a, b) => new Date(b.last_sign_in_at || 0) - new Date(a.last_sign_in_at || 0));
  return ids[0]?.provider || user.app_metadata?.provider || '';
}
const currentIdentity = () => (user?.identities || []).find((i) => i.provider === currentProvider());
export function avatarUrl() {
  // 1) 앱에서 직접 바꾼 사진 2) 지금 로그인한 방식의 사진 3) 없으면 '' (기본 아바타)
  if (user?.user_metadata?.lumenib_avatar_url) return user.user_metadata.lumenib_avatar_url;
  const idd = currentIdentity()?.identity_data;
  const m = idd || user?.user_metadata || {};
  const u = m.avatar_url || m.picture || m.profile_image || m.profile_image_url || '';
  return typeof u === 'string' ? u.replace(/^http:\/\//, 'https://') : '';
}

// ---------- 동기화 ----------
const path = (id) => `${user.id}/${id}.json.gz`;

// 읽기 기록 · 북마크: 계정 폴더의 파일 하나 (_bible.json.gz). 받아서 합치고, 기기 쪽이 더 새것이 있으면 올려요
let bibleDirty = false;
async function syncBible() {
  if (!user) return false;
  const file = `${user.id}/_bible.json.gz`;
  let remote = null;
  const { data, error } = await sb.storage.from(BUCKET).download(file);
  if (!error && data) remote = JSON.parse(await gunzip(data));
  const { changedLocal, needUpload } = S.mergeBibleLog(remote);
  if (needUpload || !remote) {
    const body = await gzip(JSON.stringify(S.bibleLogSnapshot()));
    const { error: e2 } = await sb.storage.from(BUCKET).upload(file, body, { upsert: true, contentType: 'application/gzip' });
    if (e2) throw e2;
  }
  bibleDirty = false;
  if (changedLocal) emit('bible');
  return changedLocal;
}

// 서버에 올릴 모양: 기기 전용 표시와 성경 본문 글자(데이터에서 다시 채움)는 빼요
function packNote(n) {
  const { _dirty, owner, ...rest } = n;
  const strip = (p) => { const { text, ...r } = p; return r; };
  return { ...rest, passages: (n.passages || []).map(strip), citations: (n.citations || []).map(strip) };
}
async function gzip(str) {
  const blob = new Blob([str], { type: 'application/json' });
  if (!window.CompressionStream) return blob; // 아주 오래된 브라우저: 압축 없이
  return new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}
async function gunzip(blob) {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return blob.text();
}

async function upload(n) {
  const packed = packNote(n), body = await gzip(JSON.stringify(packed));
  if (!n.deleted) {
    const { error } = await sb.storage.from(BUCKET).upload(path(n.id), body, { upsert: true, contentType: 'application/gzip' });
    if (error) throw error;
  } else {
    await sb.storage.from(BUCKET).remove([path(n.id)]);
  }
  const row = {
    id: n.id, user_id: user.id, title: n.title || '', preacher: n.preacher || '', note_date: n.date || null,
    passages: packed.passages, done: !!n.done, deleted: !!n.deleted,
    file_bytes: n.deleted ? 0 : body.size, updated_ms: Number(n.updatedAt) || Date.now(),
  };
  const { error } = await sb.from('notes').upsert(row);
  if (error) {
    if (String(error.message).includes('quota_exceeded')) { await sb.storage.from(BUCKET).remove([path(n.id)]); throw Object.assign(new Error('quota'), { quota: true }); }
    throw error;
  }
}

async function download(id) {
  const { data, error } = await sb.storage.from(BUCKET).download(path(id));
  if (error) throw error;
  return JSON.parse(await gunzip(data));
}

let pushTimer = null;
let running = null;
function schedulePush() {
  if (!user) return;
  clearTimeout(pushTimer);
  // 올리기(노트 전체를 글자로 바꾸고 압축)는 무거워서, 화면을 만지는 중이면 손을 뗀 뒤 2초까지 미뤄요 (말씀 목록 스크롤·선택이 가끔 늦던 것)
  const later = () => { const q = S.quietMs(); if (q < 2000) pushTimer = setTimeout(later, 2000 - q); else pushNow(); };
  pushTimer = setTimeout(later, 3000);
  emit('status');
}
export async function pushNow() {
  clearTimeout(pushTimer);
  if (!user) return;
  if (running) { await running; }
  const dirty = S.ownedBy(user.id).filter((n) => n._dirty);
  if (!dirty.length) { if (bibleDirty) await syncBible().catch((e) => console.warn('[cloud] bible', e)); return; }
  running = (async () => {
    setStatus('syncing');
    try {
      for (const n of dirty) {
        const stamp = n.updatedAt;
        await upload(n);
        if (n.updatedAt === stamp) delete n._dirty; // 올리는 사이에 또 고쳤으면 다음에 다시 올려요
        if (n.deleted && !n._dirty) S.removeLocal(user.id, n.id);
      }
      S.saveNotes();
      if (bibleDirty) await syncBible();
      lastSync = Date.now();
      setStatus('ok');
    } catch (e) {
      console.warn('[cloud] push', e);
      setStatus(e.quota ? 'quota' : navigator.onLine === false ? 'offline' : 'error');
      if (e.quota) ui.toast('보관 용량(500MB)이 다 찼어요. 이 기기에는 계속 저장돼요', 4000);
    } finally { running = null; }
  })();
  return running;
}

// 서버 → 기기, 그다음 기기 → 서버
// skipId: 지금 열려 있는 노트는 바꾸지 않아요 (쓰는 중에 내용이 바뀌면 안 되니까)
export async function sync({ skipId } = {}) {
  if (!user) return 0;
  if (running) await running;
  setStatus('syncing');
  let changed = 0;
  try {
    const { data: rows, error } = await sb.from('notes').select('id, updated_ms, deleted');
    if (error) throw error;
    const local = new Map(S.ownedBy(user.id).map((n) => [n.id, n]));
    for (const r of rows) {
      if (r.id === skipId) continue;
      const l = local.get(r.id);
      const lMs = l ? Number(l.updatedAt) || 0 : -1;
      if (r.updated_ms <= lMs) continue; // 기기 쪽이 같거나 더 새것
      if (r.deleted) { if (l) { S.removeLocal(user.id, r.id); changed++; } continue; }
      const note = await download(r.id);
      note.updatedAt = String(r.updated_ms);
      S.putRemote(user.id, note);
      changed++;
    }
    // 서버에 없는 노트는 올릴 목록에
    const remote = new Set(rows.map((r) => r.id));
    S.ownedBy(user.id).forEach((n) => { if (!remote.has(n.id) && !n.deleted) n._dirty = 1; });
    S.saveNotes(true);
    try { await syncBible(); } catch (e) { console.warn('[cloud] bible', e); } // 읽기 기록·북마크
    lastSync = Date.now();
    setStatus('ok');
  } catch (e) {
    console.warn('[cloud] pull', e);
    setStatus(navigator.onLine === false ? 'offline' : 'error');
  }
  await pushNow();
  if (changed) emit('notes');
  return changed;
}

// ---------- 프로필 사진 바꾸기 (11/26) ----------
// 내 폴더(ink/<계정>/)에 _avatar_<시각>.jpg 로 올리고, 1년짜리 서명 주소를 계정 정보에 남겨요. 예전 사진은 지워요
export const hasCustomAvatar = () => !!user?.user_metadata?.lumenib_avatar_url;
async function removeAvatarFiles(keep) {
  const { data } = await sb.storage.from(BUCKET).list(user.id, { search: '_avatar_' });
  const old = (data || []).map((f) => `${user.id}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await sb.storage.from(BUCKET).remove(old);
}
export async function setAvatar(blob) {
  if (!user) throw new Error('login');
  const path = `${user.id}/_avatar_${Date.now()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data, error: e2 } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  if (e2) throw e2;
  const { data: u, error: e3 } = await sb.auth.updateUser({ data: { lumenib_avatar_url: data.signedUrl, lumenib_avatar_path: path } });
  if (e3) throw e3;
  user = u.user; emit('user');
  removeAvatarFiles(path).catch(() => {});
}
export async function clearAvatar() {
  if (!user) return;
  const { data: u, error } = await sb.auth.updateUser({ data: { lumenib_avatar_url: null, lumenib_avatar_path: null } });
  if (error) throw error;
  user = u.user; emit('user');
  removeAvatarFiles(null).catch(() => {});
}
