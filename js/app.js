// lumenib 1차 테스트 앱: 화면 흐름
// T1 홈 → T2·T3 본문 고르기 → T4 노트 쓰기 (T5 인용 · T6 이 장 노트 · T7 예전 노트 탭) → 완료 → 홈
import { icon, esc, toast, todayISO, fmtFull, fmtShort, fmtMD, fmtHomeTitle } from './util.js';
import * as B from './bible.js';
import * as S from './store.js';
import { Paper, tool, snapForNative, SIZE_RANGE, SIZE_DEFAULT, PEN_STYLES, PEN_OPT_DEFAULT, PEN_OPT_FOR, penSamplePath, PEN_COLORS, HL_COLORS, PEN_SIZES, HL_SIZES, ERASER_SIZES, PEN_PALETTE, HL_PALETTE } from './ink.js';
import { BiblePanel } from './biblepanel.js';
import { screen as trackScreen, track, isTracking } from './analytics.js';
import * as C from './cloud.js';

const app = document.getElementById('app');
const overlay = document.getElementById('overlay-root');
let cleanup = () => {};
let reading = [];
let lastLocation = null; // 본문 고르기에서 마지막으로 본 곳
let curScreen = null;

const PAPERS = [['lined', '줄 종이'], ['blank', '빈 종이'], ['grid', '모눈 종이'], ['dot', '점 종이']];
const OUT_OF_SCOPE = '1차 테스트에서는 아직 열 수 없어요';

// ---------- 공통 ----------
function applyTheme() {
  document.documentElement.dataset.theme = S.settings.theme;
  document.querySelector('meta[name="theme-color"]').content = S.settings.theme === 'dark' ? '#000000' : '#f7f7f7';
  // iPad 앱이면 앱 바탕색도 같이 (다음에 켤 때 처음 보이는 색)
  window.webkit?.messageHandlers?.lumenibNative?.postMessage({ action: 'theme', value: S.settings.theme });
}
const otherNotesFor = (passages, exceptId) =>
  S.allNotes().filter((n) => n.id !== exceptId && n.passages.some((p) => passages.some((q) => B.overlaps(p, q))));
const refList = (n, short = true) => (n.passages.length ? n.passages.map((p) => B.refText(p, short)).join(', ') : '본문 없음');

async function withText(p) {
  if (p.text) return p;
  return { ...p, text: await B.getVerses(p.book, p.ch, p.from, p.to) };
}
async function fillTexts(note) {
  note.passages = await Promise.all(note.passages.map(withText));
  note.citations = await Promise.all(note.citations.map(async (c) => ({ ...c, ...(await withText(c)) })));
}

function modal(html, bind) {
  const d = document.createElement('div');
  d.className = 'dim';
  d.innerHTML = html;
  overlay.appendChild(d);
  const close = () => d.remove();
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  bind(d, close);
  return close;
}

// iPad 앱 표시 (앱에서만 필요한 화면 조정용)
document.documentElement.classList.toggle('ios-app', !!window.webkit?.messageHandlers?.lumenibNative);

// 슬라이더 채워진 부분 표시 (CSS --p)
const fillRange = (r) => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min || 1)) * 100 + '%');
document.addEventListener('input', (e) => { if (e.target.matches?.('input[type=range]')) fillRange(e.target); });
new MutationObserver(() => document.querySelectorAll('input[type=range]').forEach(fillRange)).observe(document.body, { childList: true, subtree: true });

// 필요할 때만 외부 도구를 불러와요 (PDF 만들기)
const _scripts = {};
function loadScript(src) {
  return (_scripts[src] ||= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => { delete _scripts[src]; fail(new Error('load ' + src)); };
    document.head.appendChild(s);
  }));
}

function go(screen, arg) {
  // 떠 있던 토스트(예: "노트가 저장됐어요")는 다른 화면으로 가면 그 자리에서 사라져요
  const t = document.getElementById('toast');
  if (t?.classList.contains('show')) {
    t.classList.add('leave'); t.classList.remove('show');
    setTimeout(() => t.classList.remove('leave'), 200);
  }
  cleanup();
  cleanup = () => {};
  overlay.innerHTML = '';
  document.body.classList.toggle('noting', screen === 'note');
  curScreen = screen;
  if (screen === 'home' && C.currentUser() && Date.now() - C.syncStatus().lastSync > 30000) C.sync();
  trackScreen(screen === 'note' && arg?.noteId ? 'note_view' : screen);
  ({ home: Home, pick: Pick, note: NoteScreen })[screen](arg);
}

// =========================================================
// T1 홈
// =========================================================
function Home({ highlight } = {}) {
  const notes = S.allNotes();
  const recent = notes.slice(0, 4);
  const thisYear = String(new Date().getFullYear());
  const mixedYears = recent.some((n) => !n.date.startsWith(thisYear));
  const total = reading.length, read = reading.reduce((a, b) => a + b, 0);
  const pct = Math.round((read / total) * 100);
  const fullBooks = (() => {
    let i = 0, count = 0;
    for (const b of B.books()) { const n = b.verses.length; if (reading.slice(i, i + n).every(Boolean)) count++; i += n; }
    return count;
  })();
  const oldN = B.books().filter((b) => b.testament === 'old').reduce((a, b) => a + b.verses.length, 0);
  const dots = (arr) => arr.map((r) => `<i class="${r ? 'r' : ''}"></i>`).join('');
  const R = 57.6, C = 2 * Math.PI * R;
  const chev = (n) => icon.chevRight.replace('width="24" height="24"', `width="${n}" height="${n}"`);

  app.innerHTML = `<div class="home"><div class="home-inner">
    <nav class="home-nav">
      <div class="home-tabs">
        <button class="home-tab on">${icon.home}홈</button>
        <button class="home-tab" data-oos>${icon.book}성경</button>
        <button class="home-tab" data-oos>${icon.note}노트</button>
        <button class="home-tab" data-oos>${icon.bookmark}북마크</button>
      </div>
      <button class="icon-btn gear" data-act="settings" aria-label="설정">${icon.settings}</button>
    </nav>
    <h1>${fmtHomeTitle()}</h1>
    <div class="home-row1">
      <div class="rc-wrap"><button class="record-card" data-act="record">
        <span class="rc-lines" aria-hidden="true"><i style="top:97px"></i><i style="top:128px"></i><i style="top:159px;left:117px"></i><i style="top:190px"></i><b></b></span>
        <span class="rc-flap" aria-hidden="true"></span>
        <h2>오늘 설교 기록하기</h2>
        <p>말씀 본문을 고르고 바로 필기를 시작해요</p>
        <span class="rc-btn">본문 고르기 →</span>
      </button></div>
      <button class="continue-card" data-oos>
        <h2>이어서 읽기 <small>창세기 8장 1절<i class="dot3"></i>어제</small></h2>${icon.chevRight}
        <p class="gen81">…</p>
        <div class="bm-row">북마크 <span class="chip">롬 8:28</span><span class="chip">시 23:1</span><span class="chip">사 41:10</span></div>
      </button>
    </div>
    <section class="home-sec read-sec">
      <div class="sec-head"><h3>성경 읽기 현황</h3><div class="legend"><span><i style="background:var(--accent-mid)"></i>읽은 장</span><span><i style="background:var(--chart-dot-empty)"></i>안 읽은 장</span></div></div>
      <div class="reading">
        <div class="hero">
          <div class="donut"><svg width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--chart-track)" stroke-width="12.8"/><circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--accent-mid)" stroke-width="12.8" stroke-dasharray="${(C * read) / total} ${C}" transform="rotate(-90 64 64)" stroke-linecap="round"/></svg><b>${pct}%</b></div>
          <div class="read-num"><small>읽은 장</small><div class="big">${read}<span>/${total.toLocaleString()}</span></div><a data-oos>66권 중 ${fullBooks}권 다 읽음 ${chev(12)}</a></div>
        </div>
        <div class="matrix">
          <div class="matrix-row"><span>구약</span><div class="dots">${dots(reading.slice(0, oldN))}</div></div>
          <div class="matrix-row"><span>신약</span><div class="dots">${dots(reading.slice(oldN))}</div></div>
        </div>
      </div>
    </section>
    <section class="home-sec recent-sec">
      <div class="sec-head tall"><h3>최근 노트</h3><button class="more-link" data-oos>전체보기 ${chev(12)}</button></div>
      <div class="recent-grid">${recent.map((n) => {
        const same = otherNotesFor(n.passages, n.id).length;
        return `<button class="recent-card ${n.id === highlight ? 'new' : ''}" data-note="${n.id}">
          <span class="ref">${esc(refList(n))}</span>
          <span class="ttl">${esc(n.title || '제목 없음')}</span>
          <span class="meta num">${mixedYears ? fmtShort(n.date) : fmtMD(n.date)}${same ? `<i class="dot4"></i><em>같은 본문 ${same}</em>` : ''}</span></button>`;
      }).join('')}</div>
    </section>
  </div></div>`;
  fitHome();
  setTimeout(fitHome, 300); // 앱에서는 상태 표시줄 높이(safe-area)가 조금 늦게 잡혀서 한 번 더
  window.addEventListener('resize', fitHome);
  const offResize = () => window.removeEventListener('resize', fitHome);

  B.getVerses(1, 8, 1, 1).then(([v]) => { const el = app.querySelector('.gen81'); if (el) el.textContent = v.t; });
  app.querySelectorAll('[data-oos]').forEach((b) => b.addEventListener('click', () => { track('out_of_scope'); toast(OUT_OF_SCOPE); }));
  app.querySelector('[data-act="record"]').addEventListener('click', () => go('pick'));
  app.querySelector('[data-act="settings"]').addEventListener('click', openSettings);
  app.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', () => go('note', { noteId: b.dataset.note, from: 'home' })));
  if (highlight) {
    toast('노트가 저장됐어요');
    const t = setTimeout(() => app.querySelector('.recent-card.new')?.classList.remove('new'), 4000);
    cleanup = () => { clearTimeout(t); offResize(); };
  } else cleanup = offResize;
}

// 홈은 스크롤 없이 한 화면에 맞춰요.
// 요소 크기는 시안(1194×834) 그대로 두고, 화면이 더 길면 간격을 넓히고, 짧으면 간격부터 줄인 뒤 그래도 모자라면 전체를 살짝 줄여요.
const HOME_MIN_W = 1122; // 왼쪽 숫자 320 + 간격 24 + 점 지도 730 + 좌우 여백 48
// S = 맨 위 여백. 시안의 32는 아이패드 상태바라서 그대로 두지 않고, 상태바가 없으면 16, 있으면 상태바 높이만큼 비워요.
const GAP_NAT = { S: 16, B: 4, C: 24, D: 36, E: 36, F: 24 };
const GAP_MIN = { S: 8, B: 0, C: 16, D: 24, E: 24, F: 16 };
const GAP_GROW = { S: 0, B: 0, C: 1, D: 1.5, E: 1.5, F: 1 };
function fitHome() {
  const home = app.querySelector('.home'), inner = home?.querySelector('.home-inner');
  if (!inner) return;
  // 13인치(가로 1300 이상)는 큰 화면 시안(1376×1032)으로: 카드 · 점 지도가 더 커요
  home.classList.toggle('lg', home.clientWidth >= 1300);
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;width:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const sb = probe.offsetWidth;
  probe.remove();
  // 위쪽 상태 표시줄 자리는 CSS(.home padding-top = safe-area)가 잡아요. iPad 앱에서 32로 피그마 상태 표시줄(32)과 같아서
  // 내비게이션을 바로 그 아래에 붙여요 (iPad 화면을 찍어서 피그마 위치와 맞춤, 11/21). 상태 표시줄이 없으면(사파리) 16.
  const pt = parseFloat(getComputedStyle(home).paddingTop) || 0;
  const nat = { ...GAP_NAT, S: pt ? 0 : GAP_NAT.S, F: Math.max(GAP_NAT.F, sb + 12) };
  const min = { ...GAP_MIN, S: pt ? 0 : GAP_MIN.S, F: Math.max(GAP_MIN.F, sb + 8) };
  const fixed = [...inner.children].reduce((a, el) => a + el.offsetHeight, 0);
  const W = home.clientWidth;
  // 너비가 시안보다 좁으면(아이패드 미니 등) 먼저 전체를 그 폭에 맞게 줄여요
  const portrait = matchMedia('(orientation: portrait)').matches;
  const zW = portrait ? 1 : Math.min(1, W / HOME_MIN_W);
  const H = (home.clientHeight - pt) / zW;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  let g = {}, z = 1;
  if (H >= fixed + sum(nat)) {
    const extra = H - fixed - sum(nat), w = sum(GAP_GROW);
    for (const k in nat) g[k] = nat[k] + (extra * GAP_GROW[k]) / w;
  } else if (H >= fixed + sum(min)) {
    const t = (H - fixed - sum(min)) / (sum(nat) - sum(min));
    for (const k in nat) g[k] = min[k] + t * (nat[k] - min[k]);
  } else {
    g = min;
    z = Math.max(0.6, H / (fixed + sum(min)));
  }
  z *= zW;
  for (const k in g) inner.style.setProperty('--g' + k, g[k].toFixed(2) + 'px');
  inner.style.width = z === 1 ? '' : W / z + 'px';
  inner.style.transform = z === 1 ? '' : `scale(${z})`;
}

function accountHTML() {
  if (!C.enabled || !Object.values(C.loginOptions).some(Boolean)) return '';
  const u = C.currentUser();
  if (!u) {
    return `<button class="toggle-row" data-act="login"><span>로그인하고 노트 보관하기<small class="toggle-sub">기기를 바꾸거나 테스트가 끝나도 내가 쓴 노트가 남아요</small></span>${icon.chevRight}</button>`;
  }
  const st = C.syncStatus();
  const ago = st.lastSync ? relTime(st.lastSync) : '';
  const line = {
    syncing: '서버에 올리는 중…',
    ok: st.pending ? `올릴 노트 ${st.pending}편 대기 중` : `서버에 보관됨${ago ? ' · ' + ago : ''}`,
    offline: '인터넷 연결이 없어요. 이 기기에 저장해 두고 연결되면 올려요',
    error: '서버에 올리지 못했어요. 이 기기에는 저장돼 있어요',
    quota: '보관 용량(500MB)이 다 찼어요. 이 기기에만 저장돼요',
    off: '',
  }[st.status];
  return `<div class="toggle-row acct"><span>${esc(C.displayName())}<small class="toggle-sub">${C.providerName() ? C.providerName() + ' 로그인 · ' : ''}<span data-sync>${line}</span></small></span>
      <button class="btn btn-outline" data-act="sync">지금 맞추기</button></div>
    <button class="toggle-row" data-act="logout">로그아웃<small class="toggle-sub">이 기기에서만 노트가 빠지고, 서버에는 그대로 남아요</small></button>
    <button class="toggle-row" data-act="delacct" style="color:var(--accent-mid)">계정과 보관한 노트 모두 지우기</button>`;
}
function relTime(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60); return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}

function openSettings() {
  const loggedIn = !!C.currentUser();
  const close0 = modal(`<div class="modal sheet">
    <h3>설정</h3>
    ${accountHTML()}
    <div class="toggle-row">화면 모드 <div class="seg2"><button data-th="dark" class="${S.settings.theme === 'dark' ? 'on' : ''}">다크</button><button data-th="light" class="${S.settings.theme === 'light' ? 'on' : ''}">라이트</button></div></div>
    <button class="toggle-row" data-act="finger"><span>손가락으로도 필기하기<small class="toggle-sub">애플펜슬이 없을 때 켜요. 켜면 두 손가락으로 스크롤해요.</small></span> <span class="switch ${S.settings.fingerDraw ? 'on' : ''}"></span></button>
    ${loggedIn ? '' : `<button class="toggle-row" data-act="reset" style="color:var(--accent-mid)">테스트 기록 지우기</button>`}
    <div class="about"><div class="logo"></div>1차 사용성 테스트 버전 · 성경 본문: 개역한글 (대한성서공회)<br>사용 기록(Clarity): ${isTracking() ? '켜짐' : '꺼짐'}</div>
    <div class="modal-actions"><button class="btn btn-primary" data-act="close">닫기</button></div>
  </div>`, (d, close) => {
    const off = C.on((what) => {
      if (!d.isConnected) { off(); return; }
      if (what === 'user') { close(); openSettings(); }
      else if (what === 'status') { // 보관 상태 글자만 바꿔요
        const fresh = document.createElement('div'); fresh.innerHTML = accountHTML();
        const n = fresh.querySelector('[data-sync]'), o = d.querySelector('[data-sync]');
        if (n && o) o.textContent = n.textContent;
      }
    });
    d.querySelector('[data-act="login"]')?.addEventListener('click', () => { close(); openLogin(); });
    d.querySelector('[data-act="sync"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true; await C.sync(); btn.disabled = false;
    });
    d.querySelector('[data-act="logout"]')?.addEventListener('click', async () => {
      close();
      if (await C.signOut()) { go('home'); toast('로그아웃했어요'); return; }
      modal(`<div class="modal"><h3>아직 서버에 못 올린 노트가 있어요</h3><p class="desc">지금 로그아웃하면 그 노트의 마지막 내용이 사라질 수 있어요. 인터넷 연결을 확인하고 다시 해 주세요.</p>
        <div class="modal-actions"><button class="btn btn-outline" data-a="force">그래도 로그아웃</button><button class="btn btn-primary" data-a="no">취소</button></div></div>`, (d2, close2) => {
        d2.querySelector('[data-a="no"]').addEventListener('click', close2);
        d2.querySelector('[data-a="force"]').addEventListener('click', async () => { close2(); await C.signOut({ force: true }); go('home'); toast('로그아웃했어요'); });
      });
    });
    d.querySelector('[data-act="delacct"]')?.addEventListener('click', () => {
      close();
      modal(`<div class="modal"><h3>계정과 노트를 모두 지울까요?</h3><p class="desc">서버에 보관한 노트와 로그인 정보가 모두 지워지고, 이 기기에서도 빠져요. 되돌릴 수 없어요. 필요한 노트는 먼저 PDF로 내보내 주세요.</p>
        <div class="modal-actions"><button class="btn btn-outline" data-a="no">취소</button><button class="btn btn-primary" data-a="yes">모두 지우기</button></div></div>`, (d2, close2) => {
        d2.querySelector('[data-a="no"]').addEventListener('click', close2);
        d2.querySelector('[data-a="yes"]').addEventListener('click', async (e) => {
          e.currentTarget.disabled = true;
          try { await C.deleteAccount(); close2(); go('home'); toast('계정과 노트를 모두 지웠어요'); }
          catch (err) { console.warn(err); close2(); toast('지우지 못했어요. 인터넷 연결을 확인해 주세요', 3000); }
        });
      });
    });
    d.querySelectorAll('[data-th]').forEach((b) => b.addEventListener('click', () => {
      S.settings.theme = b.dataset.th; S.saveSettings(); applyTheme();
      d.querySelectorAll('[data-th]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    d.querySelector('[data-act="finger"]').addEventListener('click', (e) => {
      S.settings.fingerDraw = !S.settings.fingerDraw; S.saveSettings();
      e.currentTarget.querySelector('.switch').classList.toggle('on', S.settings.fingerDraw);
    });
    d.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
      close();
      modal(`<div class="modal"><h3>테스트 기록을 지울까요?</h3><p class="desc">이 기기에서 쓴 노트가 모두 지워지고, 미리 넣어 둔 예시 노트만 남아요.</p>
        <div class="modal-actions"><button class="btn btn-outline" data-a="no">취소</button><button class="btn btn-primary" data-a="yes">지우기</button></div></div>`, (d2, close2) => {
        d2.querySelector('[data-a="no"]').addEventListener('click', close2);
        d2.querySelector('[data-a="yes"]').addEventListener('click', () => { S.resetAll(); lastLocation = null; close2(); go('home'); toast('테스트 기록을 지웠어요'); });
      });
    });
    d.querySelector('[data-act="close"]').addEventListener('click', close);
  });
  return close0;
}

// ---------- 로그인 · 보관 안내 ----------
// 보관 안내 문구 (로그인 전 창과 로그인 뒤 확인 창이 같이 써요)
function consentHTML(localCount) {
  return `<ul class="consent">
    <li>이 앱에서 쓴 노트(손글씨, 제목, 설교자, 본문, 날짜)를 서버에 보관해요.</li>
    <li>보관 기간은 ${esc(C.consentInfo.KEEP_UNTIL)}</li>
    <li>노트는 내 계정으로만 열려요. 운영자는 노트 수와 용량만 확인해요.</li>
    <li>설정에서 언제든 모두 지울 수 있어요.</li>
    <li>로그인에는 이메일과 이름만 써요.</li>
    ${localCount ? `<li>이 기기에서 이미 쓴 노트 ${localCount}편도 함께 보관돼요.</li>` : ''}
  </ul>`;
}

function askConsentAfterLogin({ localCount }) {
  return new Promise((resolve) => {
    modal(`<div class="modal"><h3>노트 보관 안내</h3><p class="sub">계속 쓰려면 아래 내용에 동의해 주세요</p>${consentHTML(localCount)}
      <div class="modal-col"><button class="btn btn-l btn-primary" data-a="yes">동의하고 보관</button><button class="btn btn-l btn-text" data-a="no">동의 안 함</button></div></div>`, (d, close) => {
      d.addEventListener('click', (e) => { if (e.target === d) resolve(false); });
      d.querySelector('[data-a="no"]').addEventListener('click', () => { close(); resolve(false); });
      d.querySelector('[data-a="yes"]').addEventListener('click', () => { close(); resolve(true); });
    });
  });
}

function openLogin() {
  const L = C.loginOptions;
  const native = C.isNativeApp();
  const google = L.google && !native; // 구글은 앱 안 화면(WebView)에서 로그인을 막아요
  const linkMode = C.emailMode !== 'code';
  // 링크 방식은 메일 링크가 Safari로 열려서, 아이패드 앱·홈 화면 앱 안에서는 로그인이 이어지지 않아요
  const email = L.email && !(linkMode && (native || C.isStandalone()));
  modal(`<div class="modal login">
    <h3>내 노트를 보관할까요?</h3>
    <p class="sub">로그인하면 기기를 바꾸거나 테스트가 끝나도 노트가 남아요</p>
    ${consentHTML(S.unownedCount())}
    <label class="agree"><input type="checkbox" class="cbx" data-a="agree"><span>위 내용을 확인했고 동의해요</span></label>
    <div class="login-btns">
      ${google ? `<button class="btn btn-l btn-outline" data-p="google" disabled><span class="lg lg-google" aria-hidden="true"></span>구글로 계속하기</button>` : ''}
      ${L.kakao ? `<button class="btn btn-l btn-outline" data-p="kakao" disabled><span class="lg lg-kakao" aria-hidden="true"></span>카카오로 계속하기</button>` : ''}
      ${email ? `<button class="btn btn-l btn-outline" data-a="email" disabled>${linkMode ? '이메일로 로그인 링크 받기' : '이메일로 코드 받기'}</button>
      <div class="email-box" hidden>
        <div class="field"><label>이메일</label><input type="email" inputmode="email" autocomplete="email" placeholder="name@example.com" data-f="email"></div>
        <div class="field" hidden><label>메일로 받은 숫자</label><input inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6자리 숫자" data-f="code"></div>
        <p class="login-note" data-f="sent" hidden></p>
        <button class="btn btn-l btn-primary" data-a="send">${linkMode ? '링크 보내기' : '코드 보내기'}</button>
      </div>` : ''}
      <button class="btn btn-l btn-text" data-a="close">나중에</button>
    </div>
    ${L.google && !google ? '<p class="login-note">구글 로그인은 Safari에서 주소를 열었을 때만 돼요.</p>' : ''}
  </div>`, (d, close) => {
    const off = C.on((w) => { if (w === 'user' && C.currentUser()) { off(); close(); go('home'); } });
    const agree = d.querySelector('[data-a="agree"]');
    agree.addEventListener('change', () => d.querySelectorAll('[data-p], [data-a="email"]').forEach((b) => { b.disabled = !agree.checked; }));
    d.querySelector('[data-a="close"]').addEventListener('click', close);
    d.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', async () => {
      track('login_' + b.dataset.p);
      b.disabled = true;
      try { await C.signInWith(b.dataset.p); } // 로그인 화면으로 넘어가요
      catch (e) { console.warn(e); b.disabled = false; toast('로그인 창을 열지 못했어요', 2600); }
    }));
    const box = d.querySelector('.email-box');
    d.querySelector('[data-a="email"]')?.addEventListener('click', (e) => { e.currentTarget.hidden = true; box.hidden = false; box.querySelector('[data-f="email"]').focus(); });
    let sentTo = null;
    d.querySelector('[data-a="send"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const email = box.querySelector('[data-f="email"]').value.trim();
      const codeF = box.querySelector('[data-f="code"]');
      btn.disabled = true;
      try {
        if (!sentTo) {
          if (!/^\S+@\S+\.\S+$/.test(email)) { toast('이메일 주소를 확인해 주세요'); return; }
          await C.sendEmailCode(email);
          sentTo = email;
          if (linkMode) {
            const note = box.querySelector('[data-f="sent"]');
            note.hidden = false;
            note.textContent = `${email}로 메일을 보냈어요. 이 기기의 메일 앱에서 "Sign in" 링크를 누르면 로그인돼요. 메일이 안 보이면 스팸함도 확인해 주세요.`;
            btn.hidden = true;
            return;
          }
          codeF.parentElement.hidden = false; codeF.focus();
          btn.textContent = '로그인';
          toast('메일로 숫자를 보냈어요. 메일함을 확인해 주세요', 3000);
        } else {
          const code = codeF.value.replace(/\D/g, '');
          if (code.length < 6) { toast('메일로 받은 숫자를 넣어 주세요'); return; }
          await C.verifyEmailCode(sentTo, code);
          close();
        }
      } catch (err) {
        console.warn(err);
        const m = String(err?.message || '');
        toast(/rate|limit|seconds/i.test(m) ? '잠시 뒤에 다시 보내 주세요' : sentTo ? '숫자가 맞지 않거나 시간이 지났어요' : '메일을 보내지 못했어요', 3000);
      } finally { btn.disabled = false; }
    });
  });
}

// =========================================================
// T2 · T3 본문 고르기
// =========================================================
function Pick() {
  const st = { info: { date: todayISO(), title: '', preacher: '' }, infoOpen: true, passages: [], paper: PAPERS.some((p) => p[0] === S.settings.lastPaper) ? S.settings.lastPaper : 'lined' }; // 마지막에 고른 종이로 시작
  app.innerHTML = `<div class="screen">
    <header class="topbar"><div class="left"><button class="pill-back" data-act="home">${icon.arrowLeft.replace('width="24" height="24"', 'width="18" height="18"')} 홈</button></div>
      <div class="title">오늘 설교 기록하기</div><div class="right"></div></header>
    <div class="workspace">
      <section class="panel bible-panel"></section>
      <section class="panel right-panel dashed"></section>
    </div></div>`;
  const right = app.querySelector('.right-panel');
  const bp = new BiblePanel(app.querySelector('.bible-panel'), {
    mode: 'pick',
    start: null,
    marks: () => ({
      today: [...st.passages],
      noteVerses: (() => {
        const set = new Set();
        S.allNotes().forEach((n) => n.passages.forEach((p) => { if (p.book === bp.book && p.ch === bp.ch) for (let v = p.from; v <= p.to; v++) set.add(v); }));
        return set;
      })(),
      chapterHasNotes: (b, c) => S.allNotes().some((n) => n.passages.some((p) => p.book === b && p.ch === c)),
    }),
    onChange: () => { lastLocation = { book: bp.book, ch: bp.ch }; renderRight(); },
  });
  app.querySelector('[data-act="home"]').addEventListener('click', () => go('home'));

  const current = () => [...st.passages, ...(bp.selection ? [bp.selection] : [])];

  // 예전 노트 탭 (T7): 첫 탭은 고르던 화면 그대로, 노트는 '노트 쓰기'를 눌러야 만들어져요
  const pt = { tabs: [], active: null, paper: null, infoOpen: false };
  function tabsHTML() {
    if (!pt.tabs.length) return '';
    const ps = current();
    const mine = `${fmtShort(st.info.date)}  ${ps.length ? ps.map((p) => B.refText(p, true)).join(', ') : '새 노트'}`;
    return `<div class="tabs"><button class="tab ${pt.active ? '' : 'on'}" data-tab=""><span class="tl">${esc(mine)}</span></button>${pt.tabs.map((id) => {
      const n = S.getNote(id);
      return `<button class="tab ${id === pt.active ? 'on' : ''}" data-tab="${id}"><span class="tl">${esc(`${fmtShort(n.date)}  ${refList(n)}`)}</span><span class="tx" data-close="${id}" aria-label="탭 닫기">×</span></button>`;
    }).join('')}</div>`;
  }
  function bindTabs() {
    right.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) { pt.tabs = pt.tabs.filter((t) => t !== c.dataset.close); if (pt.active === c.dataset.close) pt.active = null; renderRight(); return; }
      pt.active = b.dataset.tab || null; pt.infoOpen = false; renderRight();
    }));
  }
  function openOldTab(id) {
    if (!pt.tabs.includes(id)) pt.tabs.push(id);
    track('task4_open_old_note_tab');
    pt.active = id; pt.infoOpen = false; renderRight();
  }
  async function renderOld() {
    const n = S.getNote(pt.active);
    await fillTexts(n);
    if (pt.paper) { pt.paper.destroy(); pt.paper = null; }
    right.className = 'panel right-panel note';
    right.innerHTML = `${tabsHTML()}<div class="info-slot">${infoHTML(n, pt.infoOpen, true)}<div class="ro-summary">🔒 읽기 모드 · 수정은 노트 목록에서 가능해요</div></div><div class="paper-scroll"></div>`;
    bindTabs();
    bindInfo(right.querySelector('.info-slot'), n, () => {}, (open) => { pt.infoOpen = open; renderOld(); });
    pt.paper = new Paper(right.querySelector('.paper-scroll'), n, { readonly: true, fingerDraw: S.settings.fingerDraw, onChange: () => {}, onHistory: () => {} });
    await pt.paper.render();
  }

  async function renderRight() {
    if (pt.active) return renderOld();
    if (pt.paper) { pt.paper.destroy(); pt.paper = null; }
    right.className = 'panel right-panel dashed';
    const ps = current();
    const others = ps.length ? otherNotesFor(ps) : [];
    const texts = await Promise.all(ps.map(withText));
    right.innerHTML = `${tabsHTML()}${infoHTML(st.info, st.infoOpen)}
      ${!ps.length ? `<div class="pick-empty">← 왼쪽에서 오늘 본문을 골라주세요</div>
        <button class="link-more" data-act="nopassage">본문 없이 먼저 쓰기 ${icon.arrowRight.replace('width="24" height="24"', 'width="18" height="18"')}</button>` : `
      <div class="pick-body">
        ${texts.map((p, i) => `<div class="pick-ref">${esc(B.refText(p))} <button class="x-btn" data-rm="${i}" aria-label="빼기">${icon.x.replace('width="24" height="24"', 'width="14" height="14"')}</button></div>
          <div class="pick-verses">${p.text.map((v) => `<div><span class="vn">${v.n}</span>${esc(v.t)}</div>`).join('')}</div>`).join('<div style="height:16px"></div>')}
        ${bp.selection ? `<div style="margin-top:16px"><button class="btn btn-outline" data-act="addmore" style="height:36px;font-size:14px">${icon.plus.replace('width="24" height="24"', 'width="16" height="16"')} 본문 추가</button></div>` : ''}
        ${others.length ? `<div class="pick-sub">이 본문이 포함된 노트 ${others.length}개</div>
          <div class="note-cards">${others.map((n) => `<button class="note-card" data-old="${n.id}"><div class="meta num">${fmtShort(n.date)} · ${esc(refList(n))} · ${esc(n.preacher || '')}</div><div class="ttl">${esc(n.title || '제목 없음')} →</div></button>`).join('')}</div>` : ''}
      </div>
      <div class="pick-foot">
        <button class="paper-select" data-act="paper"><span class="paper-thumb ${st.paper}"></span>${PAPERS.find((p) => p[0] === st.paper)[1]} <svg width="12" height="16" viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m3 6 3-3 3 3M3 10l3 3 3-3"/></svg></button>
        <button class="btn btn-primary btn-l" data-act="start">이 본문으로 노트 쓰기</button>
      </div>`}`;
    bindTabs();
    bindInfo(right, st.info, () => { if (pt.tabs.length) { const t = right.querySelector('.tab.on .tl'); if (t) t.textContent = `${fmtShort(st.info.date)}  ${ps.length ? ps.map((p) => B.refText(p, true)).join(', ') : '새 노트'}`; } }, (open) => { st.infoOpen = open; renderRight(); });
    right.querySelector('[data-act="nopassage"]')?.addEventListener('click', () => start([]));
    right.querySelector('[data-act="addmore"]')?.addEventListener('click', () => { st.passages.push(bp.selection); bp.clearSel(); toast('왼쪽에서 다음 본문을 골라주세요'); });
    right.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.rm;
      if (i < st.passages.length) { st.passages.splice(i, 1); renderRight(); bp.render({ keepScroll: true }); } else bp.clearSel();
    }));
    right.querySelector('[data-act="start"]')?.addEventListener('click', () => start(current()));
    right.querySelectorAll('[data-old]').forEach((b) => b.addEventListener('click', () => openOldTab(b.dataset.old)));
    right.querySelector('[data-act="paper"]')?.addEventListener('click', (e) => paperMenu(e.currentTarget, st.paper, (v) => { st.paper = v; S.settings.lastPaper = v; S.saveSettings(); renderRight(); }));
  }

  async function start(passages) {
    track(passages.length ? 'task1_start_with_passage' : 'task5_start_without_passage');
    const withTexts = await Promise.all(passages.map(withText));
    const note = S.newNote({ ...st.info, passages: withTexts, paper: st.paper });
    const loc = passages[0] ? { book: passages[0].book, ch: passages[0].ch, verse: passages[0].from } : lastLocation || { book: bp.book, ch: bp.ch };
    go('note', { noteId: note.id, start: loc, from: 'pick' });
  }
  renderRight();
}

function paperMenu(anchor, cur, onPick) {
  const r = anchor.getBoundingClientRect();
  modal(`<div class="tb-menu" style="position:fixed;left:${r.left}px;bottom:${innerHeight - r.top + 8}px;right:auto">
    <h6>종이 종류</h6><div class="row">${PAPERS.map(([k, l]) => `<button class="paper-opt ${k === cur ? 'on' : ''}" data-p="${k}"><span class="paper-thumb ${k}"></span>${l.replace(' 종이', '')}</button>`).join('')}</div></div>`,
  (d, close) => { d.style.background = 'transparent'; d.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { close(); onPick(b.dataset.p); })); });
}

// 설교 정보 (날짜 · 제목 · 설교자)
function infoHTML(info, open, readonly = false) {
  const summary = info.title || info.preacher
    ? `${esc(info.title || '제목 없음')}${info.preacher ? `<span class="sub">${esc(info.preacher)}</span>` : ''}`
    : '<span class="muted">설교 정보 (선택)</span>';
  return `<div class="info">
    <button class="info-head" data-act="info">${open ? '설교 정보' : summary}${open ? icon.chevUp : icon.chevDown}</button>
    ${open ? `<div class="info-fields">
      <div class="field"><label>날짜</label><div class="date-show"><span class="num">${fmtFull(info.date)}</span>${icon.calendar.replace('width="24" height="24"', 'width="20" height="20"')}</div>${readonly ? '' : `<input type="date" value="${info.date}" data-f="date">`}</div>
      <div class="field"><label>설교 제목</label><input data-f="title" placeholder="설교 제목(선택)" value="${esc(info.title)}" ${readonly ? 'readonly' : ''}></div>
      <div class="field"><label>설교자</label><input data-f="preacher" placeholder="설교자(선택)" value="${esc(info.preacher)}" ${readonly ? 'readonly' : ''}></div>
    </div>` : ''}</div>`;
}
function bindInfo(root, info, onEdit, onToggle) {
  root.querySelector('[data-act="info"]').addEventListener('click', () => onToggle(!root.querySelector('.info-fields')));
  root.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener(inp.type === 'date' ? 'change' : 'input', () => {
    if (inp.type === 'date' && !inp.value) return;
    info[inp.dataset.f] = inp.value;
    if (inp.type === 'date') inp.parentElement.querySelector('.num').textContent = fmtFull(inp.value);
    onEdit();
  }));
}

// =========================================================
// T4 노트 쓰기 (+ T5 인용 · T6 이 장 노트 · T7 예전 노트 탭)
// =========================================================
async function NoteScreen({ noteId, start, openOld, from }) {
  const main = S.getNote(noteId);
  const mainReadonly = !!main.seed;
  const ns = {
    tabs: [main.id], active: main.id, leftOpen: true, infoOpen: false,
    paper: null, viewLog: {}, lastSel: {}, undo: {},
  };
  await fillTexts(main);
  const startLoc = start || (main.passages[0] ? { book: main.passages[0].book, ch: main.passages[0].ch, verse: main.passages[0].from } : lastLocation || { book: 1, ch: 1 });

  app.innerHTML = `<div class="screen">
    <header class="topbar">
      <div class="left"><button class="icon-btn" data-act="back" aria-label="뒤로">${icon.back}</button><button class="icon-btn" data-act="side" aria-label="성경 패널 접기">${icon.sidebar}</button></div>
      <div class="mid"><div class="tb-slot"></div><div class="title">${mainReadonly ? esc(main.title) : from === 'home' ? '노트' : '오늘 설교 기록하기'}</div></div>
      <div class="right">${mainReadonly ? '' : '<span class="saved-label">자동 저장됨</span>'}<button class="btn btn-primary" data-act="done">${mainReadonly ? '닫기' : '완료'}</button></div>
    </header>
    <div class="workspace">
      <section class="panel bible-panel"></section>
      <section class="panel right-panel note"><div class="tabs-slot"></div><div class="info-slot"></div><div class="paper-scroll"></div></section>
    </div></div>`;
  const right = app.querySelector('.right-panel');
  const scrollEl = right.querySelector('.paper-scroll');
  const leftEl = app.querySelector('.bible-panel');

  const activeNote = () => S.getNote(ns.active);
  const isReadonly = () => ns.active !== main.id || mainReadonly;

  // ----- 왼쪽 성경 -----
  const bp = new BiblePanel(leftEl, {
    mode: 'note',
    start: startLoc,
    marks: () => {
      const chNotes = S.allNotes().filter((n) => n.id !== main.id && n.passages.some((p) => p.book === bp.book && p.ch === bp.ch));
      const noteVerses = new Set();
      chNotes.forEach((n) => n.passages.forEach((p) => { if (p.book === bp.book && p.ch === bp.ch) for (let v = p.from; v <= p.to; v++) noteVerses.add(v); }));
      return {
        today: main.passages, chNotes, noteVerses, fmt: fmtShort,
        chapterHasNotes: (b, c) => S.allNotes().some((n) => n.passages.some((p) => p.book === b && p.ch === c)),
      };
    },
    onChange: () => { lastLocation = { book: bp.book, ch: bp.ch }; if (bp.sel) ns.lastSel[`${bp.book}:${bp.ch}`] = { ...bp.sel }; },
    onOpenNote: (id) => openTab(id),
    actions: (sel) => {
      if (mainReadonly) return [];
      const ref = B.refText(sel, true);
      if (!main.passages.length) return [
        { label: '인용으로 넣기', kind: 'outline', onClick: (s) => insertCite(s) },
        { label: `${ref} 본문으로 넣기`, onClick: (s) => setPassage(s) },
      ];
      return [{ label: `${ref} 노트에 넣기`, onClick: (s) => insertCite(s) }];
    },
    backPill: (b, c) => {
      const p = main.passages[0];
      if (!p || (p.book === b && p.ch === c)) return null;
      return { label: `오늘 본문 ${B.refText(p, true)}`, onClick: () => bp.setLocation(p.book, p.ch, null, p.from) };
    },
    onDrag: mainReadonly ? null : dragHandlers(),
  });

  // 오래 본 곳 기록 (완료할 때 본문 후보로 써요)
  const timer = setInterval(() => {
    if (bp.view === 'verses' && ns.leftOpen && !document.hidden) {
      const k = `${bp.book}:${bp.ch}`;
      ns.viewLog[k] = (ns.viewLog[k] || 0) + 2;
    }
  }, 2000);

  // ----- 오른쪽 -----
  function renderTabs() {
    const slot = right.querySelector('.tabs-slot');
    if (ns.tabs.length < 2) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="tabs">${ns.tabs.map((id) => {
      const n = S.getNote(id);
      const label = `${fmtShort(n.date)}  ${refList(n)}`;
      return `<button class="tab ${id === ns.active ? 'on' : ''}" data-tab="${id}"><span class="tl">${esc(label)}</span>${id !== main.id ? `<span class="tx" data-close="${id}" aria-label="탭 닫기">×</span>` : ''}</button>`;
    }).join('')}</div>`;
    slot.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) { closeTab(c.dataset.close); return; }
      switchTab(b.dataset.tab);
    }));
  }

  function renderInfo() {
    const slot = right.querySelector('.info-slot');
    const n = activeNote();
    slot.innerHTML = infoHTML(n, ns.infoOpen, isReadonly()) + (isReadonly() ? '<div class="ro-summary">🔒 읽기 모드 · 수정은 노트 목록에서 가능해요</div>' : '');
    bindInfo(slot, n, () => { S.touch(n); flashSaved(); }, (open) => { ns.infoOpen = open; renderInfo(); });
  }

  let toolbarEl = null;
  // 노트 영역이 툴바보다 좁으면(아이패드 미니 등) 툴바를 그 폭에 맞게 살짝 줄여요
  // 툴바는 맨 위 제목줄 가운데 (굿노트처럼). 양옆 버튼과 겹치지 않게 넓이가 모자라면 살짝 줄여요
  function fitToolbar() {
    if (!toolbarEl) return;
    const bar = app.querySelector('.topbar');
    const side = Math.max(bar.querySelector('.left').offsetWidth, bar.querySelector('.right').offsetWidth);
    const room = bar.clientWidth - 32 - side * 2 - 24;
    const z = Math.min(1, room / toolbarEl.offsetWidth);
    app.querySelector('.screen').style.setProperty('--tb-z', z.toFixed(3));
  }
  const tbRO = new ResizeObserver(() => fitToolbar());
  tbRO.observe(right);
  tbRO.observe(app.querySelector('.topbar'));
  function renderToolbar() {
    // 툴바를 누르고 있는 동안에는 툴바를 다시 만들지 않고, 손을 뗀 뒤에 만들어요.
    // 누른 버튼이 손가락·펜 아래에서 사라지면 iPad가 다음 펜슬 획을 스크롤로 착각했어요.
    if (tbPressing) { tbPending = true; sendInkConfig(); return; }
    const slot = app.querySelector('.topbar .tb-slot');
    if (isReadonly()) { slot.innerHTML = ''; return; }
    const t = tool.type;
    const tb = (k, ic, label) => `<button class="tb-btn ${t === k ? 'on' : ''}" data-tool="${k}" aria-label="${label}">${ic}</button>`;
    let opts = '';
    if (t === 'pen' || t === 'hl') {
      const colors = t === 'pen' ? PEN_COLORS : HL_COLORS, sizes = t === 'pen' ? PEN_SIZES : HL_SIZES;
      const ci = t === 'pen' ? tool.penColor : tool.hlColor, si = t === 'pen' ? tool.penSize : tool.hlSize;
      opts = colors.map((c, i) => `<button class="swatch ${i === ci ? 'on' : ''}" data-color="${i}"><i style="background:${c}"></i></button>`).join('')
        + '<span class="tb-sep"></span>'
        + sizes.map((w, i) => { const [lo, hi] = SIZE_RANGE[t], d = Math.round(3 + ((w - lo) / (hi - lo)) * 11); return `<button class="size-dot ${i === si ? 'on' : ''}" data-size="${i}"><i style="width:${d}px;height:${d}px"></i></button>`; }).join('');
    } else if (t === 'eraser') {
      opts = `<div class="mode2"><button data-em="stroke" class="${tool.eraserMode === 'stroke' ? 'on' : ''}">획 전체</button><button data-em="partial" class="${tool.eraserMode === 'partial' ? 'on' : ''}">부분</button></div><span class="tb-sep"></span>` + ERASER_SIZES.map((w, i) => { const [lo, hi] = SIZE_RANGE.eraser, d = Math.round(5 + ((w - lo) / (hi - lo)) * 11); return `<button class="size-dot ${i === tool.eraserSize ? 'on' : ''}" data-size="${i}"><i style="width:${d}px;height:${d}px;background:none;border:1.5px solid #111"></i></button>`; }).join('');
    } else opts = '<span class="tb-hint">옮기거나 지울 글씨를 둘러 그려요</span>';
    const p = ns.paper;
    slot.innerHTML = `<div class="toolbar">
      ${tb('pen', icon.pen, '펜')}${tb('hl', icon.highlighter, '형광펜')}${tb('eraser', icon.eraser, '지우개')}${tb('lasso', icon.lasso, '올가미')}
      <span class="tb-sep"></span><div class="tb-opts">${opts}</div><span class="tb-sep"></span>
      <button class="tb-btn" data-act="undo" ${p?.undoStack.length ? '' : 'disabled'} aria-label="되돌리기">${icon.undo}</button>
      <button class="tb-btn" data-act="redo" ${p?.redoStack.length ? '' : 'disabled'} aria-label="다시 하기">${icon.redo}</button>
      <span class="tb-sep"></span><button class="tb-btn" data-act="more" aria-label="더 보기">${icon.more}</button></div>`;
    toolbarEl = slot.firstElementChild;
    fitToolbar();
    slot.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('pointerdown', () => { if (b.dataset.tool === 'pen' && tool.type === 'pen') return openPenStyles(); slot.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); /* 누르는 순간 표시부터 바꿔요 (툴바 전체는 손을 뗀 뒤 다시 그려요) */ setTool(b.dataset.tool); track('task2_tool_' + b.dataset.tool); }));
    slot.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('pointerdown', () => {
      const key = t === 'pen' ? 'penColor' : 'hlColor';
      const i = +b.dataset.color;
      if (tool[key] === i) return openPalette(i); // 고른 색을 한 번 더 누르면 색 바꾸기
      tool[key] = i; renderToolbar();
    }));
    slot.querySelectorAll('[data-em]').forEach((b) => b.addEventListener('pointerdown', () => { tool.eraserMode = b.dataset.em; renderToolbar(); }));
    slot.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('pointerdown', () => {
      const key = t === 'pen' ? 'penSize' : t === 'hl' ? 'hlSize' : 'eraserSize';
      if (tool[key] === +b.dataset.size) return openSizeSlider(t, +b.dataset.size); // 고른 굵기를 한 번 더 누르면 세밀하게 (펜 · 형광펜 · 지우개)
      tool[key] = +b.dataset.size; renderToolbar(); showSizePreview(t);
    }));
    slot.querySelector('[data-act="undo"]').addEventListener('click', () => ns.paper.undo());
    slot.querySelector('[data-act="redo"]').addEventListener('click', () => ns.paper.redo());
    slot.querySelector('[data-act="more"]').addEventListener('click', toggleMore);
  }

  // 굵기를 고르면 종이 위 실제 크기를 잠깐 보여 줘요
  let prevT;
  const sizeArr = (t) => (t === 'pen' ? PEN_SIZES : t === 'hl' ? HL_SIZES : ERASER_SIZES);

  let tbPressing = false, tbPending = false;
  const tbSlot = app.querySelector('.topbar .tb-slot');
  tbSlot.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tb-menu')) return; // 펼친 창 안(슬라이더 등)은 그대로
    tbPressing = true;
    // 손을 뗀 신호가 가끔 안 와서(누른 버튼이 다시 그려져 사라진 경우 등) 툴바가 계속 '누르는 중'으로 멈춰
    // 다시 그려지지 않았어요(선택이 안 되는 것처럼 보임). 잠시 뒤엔 무조건 풀어요
    clearTimeout(tbTimer); tbTimer = setTimeout(tbRelease, 700);
    if (e.target.closest('[data-tool], [data-color], [data-size], [data-em]')) e.preventDefault();
  }, true);
  let tbTimer = 0;
  const tbRelease = () => {
    clearTimeout(tbTimer);
    if (!tbPressing) return;
    tbPressing = false;
    if (tbPending) { tbPending = false; requestAnimationFrame(renderToolbar); }
  };
  // 툴바 밖을 새로 누르면 툴바 누름은 끝난 거예요
  const tbOutside = (e) => { if (tbPressing && !tbSlot.contains(e.target)) tbRelease(); };
  document.addEventListener('pointerdown', tbOutside, true);
  window.addEventListener('pointerup', tbRelease, true);
  window.addEventListener('pointercancel', tbRelease, true);

  // 툴바에서 연 창(펜 설정 · 색 · 굵기 · 더 보기)은 바깥을 누르면 닫혀요
  const closeMenusOutside = (e) => {
    const m = toolbarEl?.querySelector('.tb-menu');
    if (!m || m.contains(e.target)) return;
    // 같은 창을 여닫는 툴바 버튼은 그 버튼이 알아서 처리해요
    if (toolbarEl.contains(e.target) && e.target.closest('[data-tool], [data-color], [data-size], [data-act="more"]')) return;
    m.remove();
  };
  document.addEventListener('pointerdown', closeMenusOutside, true);

  // 굵기 슬라이더 (굿노트처럼): 고른 칸의 굵기를 바꾸고, 종이 위에 실제 크기를 보여 줘요
  function openSizeSlider(t, idx) {
    if (nativeInk) {
      const b = toolbarEl.querySelector(`[data-size="${idx}"]`).getBoundingClientRect();
      const [lo, hi] = SIZE_RANGE[t];
      nativeInk.postMessage({ action: 'sizeSlider', tool: t, idx, value: sizeArr(t)[idx], min: lo, max: hi,
        def: SIZE_DEFAULT[t][idx], anchor: [b.left, b.top, b.width, b.height] });
      return;
    }
    const ex = toolbarEl.querySelector('.tb-menu');
    if (ex) { const same = ex.classList.contains('size-menu'); ex.remove(); if (same) return; }
    const arr = sizeArr(t), [lo, hi] = SIZE_RANGE[t];
    const def = SIZE_DEFAULT[t][idx];
    const step = t === 'pen' ? 0.1 : 1;
    const m = document.createElement('div');
    m.className = 'tb-menu size-menu';
    const fmt = (v) => (t === 'pen' ? v.toFixed(1) : String(Math.round(v)));
    m.innerHTML = `<div class="pal-head"><b>${t === 'pen' ? '펜 굵기' : t === 'hl' ? '형광펜 굵기' : '지우개 크기'}</b><button class="pal-x" data-act="close" aria-label="닫기">${icon.x}</button></div>
      <div class="sz-row"><input type="range" min="${lo}" max="${hi}" step="${step}" value="${arr[idx]}" aria-label="굵기"><span class="sz-v">${fmt(arr[idx])}</span></div>
      <button class="ps-reset" data-act="reset">기본값으로</button>`;
    toolbarEl.appendChild(m);
    const r = m.querySelector('input'), v = m.querySelector('.sz-v');
    const set = (val) => { arr[idx] = Math.round(val / step) * step; v.textContent = fmt(arr[idx]); showSizePreview(t); };
    r.addEventListener('input', () => set(+r.value));
    r.addEventListener('change', () => { S.saveSettings(); track('size_custom_' + t); renderToolbarKeepMenu(); });
    m.querySelector('[data-act="reset"]').addEventListener('click', () => { r.value = def; set(def); S.saveSettings(); renderToolbarKeepMenu(); });
    m.querySelector('[data-act="close"]').addEventListener('click', () => m.remove());
    // 툴바 점 크기만 다시 (메뉴는 그대로 둬요)
    function renderToolbarKeepMenu() {
      const dot = toolbarEl.querySelector(`[data-size="${idx}"] i`);
      const d = Math.round((t === 'eraser' ? 5 : 3) + ((arr[idx] - lo) / (hi - lo)) * 11);
      if (dot) { dot.style.width = d + 'px'; dot.style.height = d + 'px'; }
      sendInkConfig();
    }
  }

  function showSizePreview(t) {
    const host = ns.paper?.scrollEl?.parentElement;
    if (!host) return;
    let el = host.querySelector('.size-preview');
    if (!el) { el = document.createElement('div'); el.className = 'size-preview'; el.innerHTML = '<i></i><span></span>'; host.appendChild(el); }
    const k = ns.paper.scale || 1;
    const d = t === 'eraser' ? ERASER_SIZES[tool.eraserSize] * 2 * k : t === 'hl' ? HL_SIZES[tool.hlSize] * k : PEN_SIZES[tool.penSize] * 2.2 * k;
    const i = el.querySelector('i');
    i.className = t;
    i.style.width = t === 'hl' ? '72px' : Math.max(3, d) + 'px';
    i.style.height = Math.max(3, d) + 'px';
    i.style.background = t === 'eraser' ? '' : t === 'hl' ? HL_COLORS[tool.hlColor] : PEN_COLORS[tool.penColor];
    i.style.opacity = t === 'hl' ? S.settings.hlAlpha : '';
    el.querySelector('span').textContent = t === 'eraser' ? '지우개 크기' : t === 'hl' ? '형광펜 굵기' : '펜 굵기';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(prevT);
    prevT = setTimeout(() => el.classList.remove('show'), 1100);
  }

  // 펜 색 팔레트: 기본 색(피그마 pen 12색) + 내 색(직접 만든 색, 최대 6개). 고른 색이 툴바의 그 칸에 들어가요.
  function openPalette(slotIdx) {
    toolbarEl.querySelector('.tb-menu')?.remove();
    ns.paper?.scrollEl?.parentElement?.querySelector('.size-preview')?.classList.remove('show');
    const isPen = tool.type === 'pen';
    const arr = isPen ? PEN_COLORS : HL_COLORS;
    const base = isPen ? PEN_PALETTE : HL_PALETTE;
    const myKey = isPen ? 'myPen' : 'myHl';
    if (!S.settings[myKey]) S.settings[myKey] = [];
    const mine = S.settings[myKey];
    const m = document.createElement('div');
    m.className = 'tb-menu palette';
    toolbarEl.appendChild(m);
    const cur = () => arr[slotIdx].toLowerCase();
    const sw = (c, extra = '') => `<button class="pal ${c.toLowerCase() === cur() ? 'on' : ''}" data-c="${c}" aria-label="${c}" ${extra}><i style="background:${c}"></i></button>`;
    const set = (c) => { arr[slotIdx] = c; S.saveSettings(); m.remove(); renderToolbar(); };

    const showList = () => {
      m.innerHTML = `<div class="pal-head"><b>${isPen ? '펜' : '형광펜'} 색</b><button class="pal-x" data-act="close" aria-label="닫기">${icon.x}</button></div>
        <h6>기본 색</h6><div class="pal-grid">${base.map((c) => sw(c)).join('')}</div>
        <h6>내 색</h6><div class="pal-grid">${mine.map((c) => sw(c, 'data-mine')).join('')}${mine.length < 6 ? `<button class="pal pal-add" data-act="add" aria-label="색 만들기"><i>${icon.plus}</i></button>` : ''}</div>
        ${mine.length ? '<p class="pal-tip">내 색을 길게 누르면 지울 수 있어요</p>' : ''}
        ${isPen ? '' : `<h6>투명도</h6><div class="pal-alpha"><span class="pa-sample"><span>형광펜</span><i></i></span>
          <input type="range" min="20" max="80" step="5" value="${Math.round(S.settings.hlAlpha * 100)}" aria-label="형광펜 투명도"></div>
          <div class="pa-ends"><span>투명하게</span><span>진하게</span></div>`}`;
      const ar = m.querySelector('.pal-alpha input');
      if (ar) {
        const paint = () => { const i = m.querySelector('.pa-sample i'); i.style.background = cur(); i.style.opacity = ar.value / 100; };
        ar.addEventListener('input', () => { S.settings.hlAlpha = ar.value / 100; paint(); });
        ar.addEventListener('change', () => { S.saveSettings(); track('hl_alpha_changed'); sendInkConfig(); });
        paint();
        nativeRange(ar);
      }
      m.querySelector('[data-act="close"]').addEventListener('click', () => m.remove());
      m.querySelectorAll('[data-c]').forEach((b) => {
        let lp;
        b.addEventListener('click', () => { if (b.dataset.lp) return; set(b.dataset.c); });
        if (b.hasAttribute('data-mine')) {
          b.addEventListener('pointerdown', () => { lp = setTimeout(() => { b.dataset.lp = 1; mine.splice(mine.indexOf(b.dataset.c), 1); S.saveSettings(); showList(); }, 550); });
          ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => clearTimeout(lp)));
        }
      });
      m.querySelector('[data-act="add"]')?.addEventListener('click', showPicker);
    };

    // 직접 만들기: 채도·밝기 판 + 색상 막대
    const showPicker = () => {
      let [h, sat, val] = hexToHsv(arr[slotIdx]);
      m.innerHTML = `<div class="pal-head"><button class="pal-x" data-act="back" aria-label="뒤로">${icon.arrowLeft}</button><b>색 만들기</b><span style="width:32px"></span></div>
        <div class="pk-sv"><div class="pk-knob"></div></div>
        <div class="pk-hue"><div class="pk-knob"></div></div>
        <div class="pk-foot"><span class="pk-prev"></span><span class="pk-hex"></span><button class="btn btn-primary pk-ok" data-act="ok">추가하고 쓰기</button></div>`;
      const svEl = m.querySelector('.pk-sv'), hueEl = m.querySelector('.pk-hue');
      const upd = () => {
        const hex = hsvToHex(h, sat, val);
        svEl.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h} 100% 50%))`;
        svEl.firstChild.style.cssText = `left:${sat * 100}%;top:${(1 - val) * 100}%;background:${hex}`;
        hueEl.firstChild.style.cssText = `left:${h / 360 * 100}%;background:hsl(${h} 100% 50%)`;
        m.querySelector('.pk-prev').style.background = hex;
        m.querySelector('.pk-hex').textContent = hex.toUpperCase();
      };
      const drag = (el, fn) => el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        const mv = (ev) => { const r = el.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); upd(); };
        mv(e);
        el.onpointermove = mv;
        el.onpointerup = el.onpointercancel = () => { el.onpointermove = null; };
      });
      drag(svEl, (x, y) => { sat = x; val = 1 - y; });
      drag(hueEl, (x) => { h = Math.round(x * 360); });
      m.querySelector('[data-act="back"]').addEventListener('click', showList);
      m.querySelector('[data-act="ok"]').addEventListener('click', () => {
        const hex = hsvToHex(h, sat, val);
        if (!mine.includes(hex)) { mine.push(hex); if (mine.length > 6) mine.shift(); }
        set(hex);
      });
      upd();
    };
    showList();
  }

  // 펜 설정 (굿노트처럼 고른 펜을 한 번 더 누르면 열려요): 펜 종류 + 팁 선명도 · 필압 민감도 · 평평함 · 손떨림 보정
  const OPT_LABEL = {
    sharp: ['팁 선명도', '획의 시작과 끝이 둥글게 ↔ 뾰족하게'],
    flat: ['평평함', '펜촉이 둥글게 ↔ 납작하게 (긋는 방향에 따라 굵기가 달라져요)'],
    pressure: ['필압 민감도', '누르는 힘에 따라 굵기가 덜 ↔ 많이 바뀜'],
    stab: ['손떨림 보정', '손 떨림을 덜 ↔ 많이 다듬어 줌'],
  };
  function openPenStyles() {
    // iPad 앱에서는 진짜 iPad 창(네이티브 슬라이더)으로 열어요
    if (nativeInk) {
      const b = toolbarEl.querySelector('[data-tool="pen"]').getBoundingClientRect();
      nativeInk.postMessage({ action: 'penSettings', style: S.settings.penStyle, opts: S.settings.penOpts, color: PEN_COLORS[tool.penColor], anchor: [b.left, b.top, b.width, b.height] });
      return;
    }
    const ex = toolbarEl.querySelector('.tb-menu');
    if (ex) { const same = ex.classList.contains('pen-styles'); ex.remove(); if (same) return; }
    const m = document.createElement('div');
    m.className = 'tb-menu pen-styles';
    const color = () => PEN_COLORS[tool.penColor];
    const preview = () => {
      const st = S.settings.penStyle;
      m.querySelector('.ps-preview path').setAttribute('d', penSamplePath(st, 240, 44, S.settings.penOpts[st]));
    };
    const draw = () => {
      const st = S.settings.penStyle, po = S.settings.penOpts[st];
      const info = PEN_STYLES.find((p) => p.id === st);
      m.innerHTML = `<div class="pal-head"><b>펜 설정</b><button class="pal-x" data-act="close" aria-label="닫기">${icon.x}</button></div>
        <div class="ps-preview" style="color:${color()}"><svg width="240" height="44" viewBox="0 0 240 44" aria-hidden="true"><path fill="currentColor"/></svg></div>
        <div class="ps-types">${PEN_STYLES.map((p) => `<button class="ps-type ${st === p.id ? 'on' : ''}" data-ps="${p.id}">
            <svg width="64" height="20" viewBox="0 0 64 20" aria-hidden="true"><path d="${penSamplePath(p.id, 64, 20, S.settings.penOpts[p.id])}" fill="currentColor"/></svg><span>${p.name}</span></button>`).join('')}</div>
        <p class="ps-desc">${info.desc}</p>
        ${PEN_OPT_FOR[st].map((k) => `<div class="ps-opt"><div class="ps-opt-head"><b>${OPT_LABEL[k][0]}</b><span data-v="${k}">${po[k]}%</span></div>
          <input type="range" min="0" max="100" step="5" value="${po[k]}" data-opt="${k}" aria-label="${OPT_LABEL[k][0]}">
          <small>${OPT_LABEL[k][1]}</small></div>`).join('')}
        <button class="ps-reset" data-act="reset">기본값으로</button>`;
      preview();
      m.querySelector('[data-act="close"]').addEventListener('click', () => m.remove());
      m.querySelectorAll('[data-ps]').forEach((b) => b.addEventListener('click', () => {
        S.settings.penStyle = b.dataset.ps; S.saveSettings(); track('pen_style_' + b.dataset.ps); draw();
      }));
      m.querySelectorAll('[data-opt]').forEach((r) => {
        r.addEventListener('input', () => { po[r.dataset.opt] = +r.value; m.querySelector(`[data-v="${r.dataset.opt}"]`).textContent = r.value + '%'; preview(); });
        r.addEventListener('change', () => { S.saveSettings(); track('pen_opt_' + r.dataset.opt); draw(); });
      });
      m.querySelector('[data-act="reset"]').addEventListener('click', () => { Object.assign(po, PEN_OPT_DEFAULT); S.saveSettings(); draw(); });
    };
    draw();
    toolbarEl.appendChild(m);
  }

  function toggleMore() {
    const ex = toolbarEl.querySelector('.tb-menu');
    if (ex) { ex.remove(); return; }
    const m = document.createElement('div');
    m.className = 'tb-menu';
    m.innerHTML = `<h6>종이 종류</h6><div class="row">${PAPERS.map(([k, l]) => `<button class="paper-opt ${k === main.paper ? 'on' : ''}" data-p="${k}"><span class="paper-thumb ${k}"></span>${l.replace(' 종이', '')}</button>`).join('')}</div>
      <button class="menu-item" data-act="pdf">${icon.download || ''}<span>PDF로 내보내기</span></button>
      ${window.webkit?.messageHandlers?.lumenibNative ? '<button class="menu-item" data-act="native-ink"><span>네이티브 필기 비교</span></button>' : ''}`;
    toolbarEl.appendChild(m);
    m.querySelector('[data-act="native-ink"]')?.addEventListener('click', () => { m.remove(); track('native_ink_open'); window.webkit.messageHandlers.lumenibNative.postMessage({ action: 'openInk' }); });
    m.querySelector('[data-act="pdf"]').addEventListener('click', () => { m.remove(); exportPdf(); });
    m.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { main.paper = b.dataset.p; S.settings.lastPaper = main.paper; S.saveSettings(); if (ns.paper.note === main) ns.paper.setPaper(main.paper); else ns.paper.render(); S.touch(main); m.remove(); }));
  }

  // ---------- iPad 앱: 필기만 네이티브 엔진으로 ----------
  // 펜·형광펜을 고르면 애플펜슬 획은 네이티브(ios/App/App/LumenInk.swift)가 바로 그리고, 펜을 떼면 점들을 넘겨줘요(addExternalStroke).
  // 툴바·메뉴·지우개·올가미·스크롤은 모두 지금 웹 그대로. 네이티브가 알아야 할 것(도구·색·굵기·펜 설정·배율·종이 영역)을 보내요.
  const nativeInk = window.webkit?.messageHandlers?.lumenibNative;
  window.__nativeInk = !!nativeInk;
  function sendInkConfig() {
    if (!nativeInk) return;
    const p = ns.paper;
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
    const blocked = !!document.querySelector('#overlay-root .dim'); // 툴바 창이 열려 있어도 종이에 바로 쓸 수 있어요 (창 영역만 빼고, 쓰기 시작하면 창은 닫혀요)
    const on = !!p && !p.readonly && p.scrollEl?.isConnected && !blocked;
    const pen = tool.type === 'pen';
    // 펜·형광펜은 네이티브가 그리고, 지우개·올가미는 네이티브가 펜슬을 받아 웹에 그대로 넘겨요(lumenibPointer)
    const btns = [...(p?.scrollEl?.querySelectorAll('.cite-ui button, .cite-rs, .lasso-menu, .passage-block button') || [])].map(rect);
    nativeInk.postMessage({
      action: 'inkConfig', enabled: on,
      tool: tool.type,
      color: pen ? PEN_COLORS[tool.penColor] : HL_COLORS[tool.hlColor],
      width: pen ? PEN_SIZES[tool.penSize] : HL_SIZES[tool.hlSize],
      style: S.settings.penStyle, opts: S.settings.penOpts[S.settings.penStyle] || {},
      hlAlpha: S.settings.hlAlpha, scale: p?.scale || 1,
      pages: [...(p?.scrollEl?.querySelectorAll('.page') || [])].map(rect), // 종이 한 장씩의 자리: 네이티브 임시 선을 종이 안으로 잘라요
      area: rect(p?.scrollEl), exclude: [rect(toolbarEl), rect(toolbarEl?.querySelector('.tb-menu')), rect(p?.lassoMenu), ...btns].filter(Boolean),
    });
  }
  // 스크롤하면 종이·버튼 자리가 바뀌니 네이티브에 다시 알려요 (한 프레임에 한 번)
  if (nativeInk) { let q = 0; scrollEl.addEventListener('scroll', () => { if (q) return; q = requestAnimationFrame(() => { q = 0; sendInkConfig(); }); }, { passive: true }); }
  // 앱이 본 펜슬 탭(종이 밖). 웹킷이 펜슬 탭을 가끔 늦게 주거나 안 줘서 툴바가 느리거나 안 눌렸어요.
  //  - 툴바 도구·색·굵기·지우개 방식: 닿는 순간(down) 앱 신호로 바로 눌러요. 웹킷이 따로 주는 펜슬 누름은 무시해요(두 번 눌림 방지)
  //  - 그 밖의 버튼: 뗄 때(up) 웹이 그 탭을 못 받았으면 대신 눌러요
  const TB_CTRL = '[data-tool], [data-color], [data-size], [data-em]';
  let lastPenDown = 0, lastClick = 0, nativeDownAt = 0, tapStart = 0;
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'pen' && e.pointerId !== 78) lastPenDown = performance.now(); }, true);
  document.addEventListener('click', () => { lastClick = performance.now(); }, true);
  // 앱 신호로 이미 누른 툴바 버튼을 웹킷이 늦게 또 누르면 막아요 (펜이 한 번에 두 번 눌려 펜 설정까지 열리던 것)
  if (nativeInk) tbSlot.addEventListener('pointerdown', (e) => {
    if (e.pointerId === 78 || !e.target.closest?.(TB_CTRL)) return;
    if (e.pointerType === 'pen' || performance.now() - nativeDownAt < 800) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  window.lumenibTap = (x, y, phase = 'up') => {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest('.topbar')) return; // 맨 위 제목줄만
    const o = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 78, isPrimary: true, button: 0 };
    const ctrl = el.closest(TB_CTRL);
    if (phase === 'down') {
      tapStart = performance.now();
      if (ctrl && tbSlot.contains(ctrl)) { nativeDownAt = performance.now(); ctrl.dispatchEvent(new PointerEvent('pointerdown', { ...o, buttons: 1 })); }
      return;
    }
    if (ctrl && tbSlot.contains(ctrl)) { window.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 })); return; }
    // 그 밖의 제목줄 버튼(되돌리기·더보기·뒤로·완료): 잠깐 기다려 웹이 그 탭을 받았는지 보고, 못 받았을 때만 대신 눌러요
    const t0 = tapStart;
    setTimeout(() => {
      if (lastPenDown >= t0 - 50 || lastClick >= t0 - 50) return;
      el.dispatchEvent(new PointerEvent('pointerdown', { ...o, buttons: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
    }, 250);
  };
  // 펜슬로 종이에 쓰기 시작하면 열려 있던 툴바 창을 닫아요 (굿노트처럼 바로 써지게)
  window.lumenibCloseMenus = () => { toolbarEl?.querySelector('.tb-menu')?.remove(); };
  // 지우개 · 올가미: 네이티브가 받은 펜슬 움직임을 종이에 포인터 이벤트로 그대로 전해요
  let relayTarget = null, relayLast = [0, 0];
  window.lumenibPointer = (type, pts) => {
    const p = ns.paper;
    if (!p) return false;
    // 끝 신호가 점 없이 오거나(취소) 앞 동작이 안 끝난 채 새로 시작하면, 앞 동작을 꼭 끝내 줘요.
    // 안 그러면 올가미·지우개가 '하는 중'으로 남아 화면이 멈추거나 확대가 안 됐어요
    const end = (t) => { if (!relayTarget) return; relayTarget.dispatchEvent(new PointerEvent(t, { clientX: relayLast[0], clientY: relayLast[1], pointerType: 'pen', pointerId: 77, isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: 0 })); relayTarget = null; };
    if (!pts.length) { if (type === 'up' || type === 'cancel') end(type === 'up' ? 'pointerup' : 'pointercancel'); return true; }
    if (type === 'down') end('pointercancel');
    for (const [x, y, pr] of pts) {
      relayLast = [x, y];
      if (type === 'down') {
        const pageEl = document.elementFromPoint(x, y)?.closest('.page');
        relayTarget = p.pages.find((q) => q?.el === pageEl)?.base || null;
      }
      if (!relayTarget) return false;
      relayTarget.dispatchEvent(new PointerEvent(type === 'down' ? 'pointerdown' : type === 'up' ? 'pointerup' : type === 'cancel' ? 'pointercancel' : 'pointermove',
        { clientX: x, clientY: y, pressure: pr, pointerType: 'pen', pointerId: 77, isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: type === 'up' ? 0 : 1 }));
      if (type === 'up' || type === 'cancel') { relayTarget = null; break; }
    }
    return true;
  };
  // iPad 앱: 웹 창 안의 슬라이더 자리에 진짜 iOS 슬라이더를 겹쳐 놓아요. 값이 바뀌면 웹 슬라이더에 input/change를 보내요
  function nativeRange(input) {
    if (!nativeInk) return;
    const id = 'r' + Date.now();
    input.style.visibility = 'hidden';
    const send = () => {
      const b = input.getBoundingClientRect();
      nativeInk.postMessage({ action: 'slider', id, min: +input.min, max: +input.max, step: +input.step || 1, value: +input.value, anchor: [b.left, b.top, b.width, b.height] });
    };
    requestAnimationFrame(send);
    window.lumenibSlider = (sid, v, done) => {
      if (sid !== id || !input.isConnected) return;
      input.value = v;
      input.dispatchEvent(new Event(done ? 'change' : 'input', { bubbles: true }));
    };
    const watch = setInterval(() => {
      if (!input.isConnected) { clearInterval(watch); nativeInk.postMessage({ action: 'sliderRemove' }); }
    }, 150);
  }
  // 네이티브 펜 설정 · 굵기 창에서 바꾼 값을 받아요
  window.lumenibSetPen = (style, opts) => {
    S.settings.penStyle = style;
    // 네이티브는 이 펜 종류의 값만 보내요. 그 종류 칸에 넣어야 다시 열 때 남아 있어요 (전에는 바깥에 섞여 저장돼 사라졌어요)
    S.settings.penOpts[style] = Object.assign({}, S.settings.penOpts[style], opts);
    S.saveSettings(); track('pen_style_' + style);
    renderToolbar(); sendInkConfig();
  };
  window.lumenibSetSize = (t, idx, v, done) => {
    sizeArr(t)[idx] = v;
    if (done) { S.saveSettings(); track('size_custom_' + t); renderToolbar(); } else showSizePreview(t);
    sendInkConfig();
  };
  // 네이티브 펜: 그리고 멈추면 도형으로 (굿노트처럼)
  window.lumenibSnap = (flat, scale) => snapForNative(flat, scale);
  window.lumenibInk = (pts, extra) => {
    const post = () => nativeInk?.postMessage({ action: 'inkDrawn' });
    const hl = tool.type === 'hl';
    // 형광펜: 웹 획이 서서히 나타나기 시작할 때 네이티브도 서서히 지워요 (겹쳐 진해지거나 비어 깜빡이지 않게)
    const ok = !!ns.paper?.addExternalStroke(pts, { ...(hl ? { fadeIn: post } : {}), shape: !!extra?.shape });
    if (ok) track('native_ink_stroke');
    // 펜: 웹이 새 획을 실제로 화면에 그린 다음(두 프레임 뒤)에 네이티브가 임시 선을 지워요. 바로 지우면 한 번 깜빡였어요
    if (ok && !hl) requestAnimationFrame(() => requestAnimationFrame(post));
    return ok;
  };
  if (nativeInk) {
    const mo = new MutationObserver(() => sendInkConfig());
    mo.observe(document.getElementById('overlay-root'), { childList: true });
    mo.observe(right, { childList: true, subtree: true, attributes: false });
    mo.observe(app.querySelector('.topbar'), { childList: true, subtree: true }); // 툴바(제목줄)에서 창이 열리고 닫히는 것
    window.addEventListener('resize', sendInkConfig);
    // 스크롤하면 인용 손잡이 같은 버튼 위치가 바뀌니 다시 알려 줘요
    let sRaf = 0;
    scrollEl.addEventListener('scroll', () => { cancelAnimationFrame(sRaf); sRaf = requestAnimationFrame(sendInkConfig); }, { passive: true });
    ns.offInk = () => { mo.disconnect(); window.removeEventListener('resize', sendInkConfig); nativeInk.postMessage({ action: 'inkConfig', enabled: false }); };
  }

  // ---------- PDF 내보내기 ----------
  // 지금 열린 노트를 쪽마다 그림으로 찍어(본문 · 인용 · 손글씨 그대로) A4 PDF로 만들어요. 기기 밖으로 보내지 않고 기기 안에서 만들어요.
  let pdfBusy = false;
  async function exportPdf() {
    const p = ns.paper;
    if (!p || pdfBusy) return;
    pdfBusy = true;
    track('note_pdf_export');
    toast('PDF 만드는 중…', 60000);
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      p.clearSelection();
      p.flushPages(true); // 아직 안 그린 장까지 다 그린 뒤 내보내요
      const n = p.note;
      const used = (i) => i === 0 || n.pages[i]?.strokes.length || n.citations.some((c) => c.page === i);
      const pages = p.pages.filter((pg) => pg && used(pg.i));
      const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      for (let i = 0; i < pages.length; i++) {
        const el = pages[i].el;
        const shot = await window.html2canvas(el, {
          scale: Math.min(3, 1400 / el.offsetWidth), backgroundColor: '#ffffff', logging: false,
          ignoreElements: (x) => x.classList && (x.classList.contains('page-ui') || x.classList.contains('live') || x.classList.contains('lasso-menu')),
        });
        if (i) doc.addPage();
        doc.addImage(shot.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H);
      }
      const name = `${n.date || todayISO()} ${(n.title || (n.passages.length ? refList(n) : '설교 노트')).replace(/[\\/:*?"<>|]/g, ' ')}.pdf`;
      const file = new File([doc.output('blob')], name, { type: 'application/pdf' });
      toast('PDF가 준비됐어요', 1500);
      modal(`<div class="modal"><h3>PDF가 준비됐어요</h3><p class="desc">${esc(name)} · ${pages.length}쪽</p>
        <div class="modal-actions"><button class="btn btn-outline" data-a="no">닫기</button><button class="btn btn-primary" data-a="save">저장 · 공유</button></div></div>`, (d, close) => {
        d.querySelector('[data-a="no"]').addEventListener('click', close);
        d.querySelector('[data-a="save"]').addEventListener('click', async () => {
          // iPad는 공유 시트(파일에 저장 · 메일 · 카카오톡 등), 안 되면 내려받기
          if (navigator.canShare?.({ files: [file] })) {
            try { await navigator.share({ files: [file], title: name }); close(); return; } catch (e) { if (e.name === 'AbortError') return; }
          }
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          close();
        });
      });
    } catch (e) {
      console.error(e);
      toast('PDF를 만들지 못했어요. 인터넷 연결을 확인해 주세요');
    } finally {
      pdfBusy = false;
    }
  }

  let savedT;
  function flashSaved() {
    const el = app.querySelector('.saved-label');
    if (!el) return;
    el.textContent = '저장 중…';
    clearTimeout(savedT);
    savedT = setTimeout(() => (el.textContent = '자동 저장됨'), 600);
  }

  async function mountPaper() {
    if (ns.paper) { ns.undo[ns.paper.note.id] = [ns.paper.undoStack, ns.paper.redoStack]; ns.paper.destroy(); }
    const n = activeNote();
    await fillTexts(n);
    const p = new Paper(scrollEl, n, {
      readonly: isReadonly(),
      fingerDraw: S.settings.fingerDraw,
      // 글씨만 바뀐 경우엔 성경 패널을 다시 그리지 않아요 (가볍게). 노트 구조가 바뀐 경우만
      onChange: (info) => { S.touch(n); flashSaved(); if (n === main && info?.structure) bp.render({ keepScroll: true }); },
      onHistory: () => renderToolbar(),
      onLayout: () => sendInkConfig(),
    });
    if (ns.undo[n.id]) [p.undoStack, p.redoStack] = ns.undo[n.id];
    ns.paper = p;
    window.__lumenibPaper = p; // 회귀 점검(tools/regression.js)에서 씀
    await p.render();
    scrollEl.scrollTop = 0;
    renderToolbar();
  }

  // 도구 바꾸기 (펜슬 더블탭 '이전 도구로'를 위해 바로 전 도구를 기억해요)
  let prevTool = tool.type === 'pen' ? 'eraser' : 'pen';
  function setTool(t) {
    if (t !== tool.type) { prevTool = tool.type; tool.type = t; }
    ns.paper?.clearSelection();
    toolbarEl?.querySelector('.tb-menu')?.remove();
    renderToolbar();
  }

  // 아이패드 앱(Capacitor)에서 애플펜슬 더블탭·스퀴즈가 오면, iPad 설정 > Apple Pencil 에서 고른 동작을 따라가요
  // (ios/App/App/SceneDelegate.swift 가 action 을 넘겨줘요. action 없이 오면 예전 앱이라 되돌리기)
  const TOOL_NAME = { pen: '펜', hl: '형광펜', eraser: '지우개', lasso: '올가미' };
  window.lumenibPencil = (kind, action = 'undo') => {
    const p = ns.paper;
    if (!p || p.readonly || !p.scrollEl?.isConnected) return false;
    track('pencil_' + kind + '_' + action);
    if (action === 'switchEraser') {
      setTool(tool.type === 'eraser' ? (prevTool !== 'eraser' ? prevTool : 'pen') : 'eraser');
      toast(TOOL_NAME[tool.type], 900);
    } else if (action === 'switchPrevious') {
      setTool(prevTool);
      toast(TOOL_NAME[tool.type], 900);
    } else if (action === 'showColorPalette') {
      if (tool.type === 'pen' || tool.type === 'hl') openPalette(tool.type === 'pen' ? tool.penColor : tool.hlColor);
    } else if (action === 'showInkAttributes' || action === 'showContextualPalette') {
      if (tool.type === 'pen') openPenStyles();
    } else if (action === 'undo') {
      if (p.undoStack.length) { p.undo(); toast('되돌렸어요'); } else toast('되돌릴 게 없어요');
    }
    return true;
  };

  function openTab(id) {
    if (id === main.id) return switchTab(id);
    if (!ns.tabs.includes(id)) ns.tabs.push(id);
    track('task4_open_old_note_tab');
    switchTab(id);
  }
  function closeTab(id) {
    ns.tabs = ns.tabs.filter((t) => t !== id);
    if (ns.active === id) switchTab(main.id); else renderTabs();
  }
  async function switchTab(id) {
    ns.active = id;
    ns.infoOpen = false;
    renderTabs(); renderInfo();
    await mountPaper();
  }

  // ----- 본문 · 인용 넣기 -----
  async function ensureMainTab() { if (ns.active !== main.id) await switchTab(main.id); }
  async function setPassage(sel, silent) {
    await ensureMainTab();
    const p = await withText(sel);
    ns.paper.setPassage(p);
    track('passage_set_in_note');
    bp.sel = null; bp.render({ keepScroll: true });
    if (!silent) toast(`${B.refText(p, true)}을 오늘 본문으로 넣었어요`);
  }
  async function insertCite(sel, at) {
    await ensureMainTab();
    const c = await withText(sel);
    ns.paper.insertCitation({ book: c.book, ch: c.ch, from: c.from, to: c.to, text: c.text }, at);
    track(at ? 'task3_cite_drag' : 'task3_cite_button');
    bp.sel = null; bp.render({ keepScroll: true });
  }

  function dragHandlers() {
    let ghost = null, line = null;
    const clearMarks = () => { line?.remove(); line = null; scrollEl.querySelectorAll('.drop-on').forEach((e) => e.classList.remove('drop-on')); };
    return {
      start: async (sel) => {
        const v = await B.getVerses(sel.book, sel.ch, sel.from, sel.from);
        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = `<small>${esc(B.refText(sel, true))}</small><span>${esc(v[0]?.t || '')}</span>`;
        document.body.appendChild(ghost);
      },
      move: (x, y) => {
        if (ghost) { ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; }
        clearMarks();
        if (isReadonly() && ns.active !== main.id) return;
        const hit = ns.paper?.hitTest(x, y);
        if (!hit) return;
        if (hit.onPlaceholder) { scrollEl.querySelector('.passage-placeholder')?.classList.add('drop-on'); return; }
        line = document.createElement('div');
        line.className = 'drop-line';
        line.style.top = hit.y * ns.paper.scale + 'px';
        hit.el.appendChild(line);
      },
      drop: async (x, y, sel) => {
        ghost?.remove(); ghost = null; clearMarks();
        if (x == null) return;
        if (ns.active !== main.id) { toast('예전 노트에는 넣을 수 없어요'); return; }
        const hit = ns.paper?.hitTest(x, y);
        if (!hit) return;
        if (hit.onPlaceholder && !main.passages.length) return setPassage(sel);
        insertCite(sel, { page: hit.page, y: hit.y - 10 });
      },
    };
  }

  // ----- 위쪽 버튼 -----
  app.querySelector('[data-act="side"]').addEventListener('click', () => {
    ns.leftOpen = !ns.leftOpen;
    const p = ns.paper;
    p?.beginResizeAnim();
    leftEl.classList.toggle('closed', !ns.leftOpen);
    clearTimeout(ns.sideT);
    ns.sideT = setTimeout(() => p?.endResizeAnim(), 300); // 패널 애니메이션(.25초)이 끝나면 종이를 한 번 다시 그려요
  });
  // 왼쪽 위 뒤로 (피그마 Top Bar 화면=노트 쓰기, 11/21): 오른쪽 위 완료와 같은 방식으로 나가요 (저장 · 본문 확인)
  app.querySelector('[data-act="back"]').addEventListener('click', () => { track('note_back'); app.querySelector('[data-act="done"]').click(); });
  app.querySelector('[data-act="done"]').addEventListener('click', () => {
    if (mainReadonly) return go('home');
    if (!main.passages.length) return askPassage();
    finish();
  });

  function finish() {
    track('task_done_note_saved');
    main.done = true;
    S.touch(main);
    S.saveNotes(true);
    go('home', { highlight: main.id });
  }

  // 본문 없이 완료하려 할 때: 본문 후보 제안
  async function askPassage() {
    track('task5_ask_passage_on_done');
    const cands = [];
    const top = Object.entries(ns.viewLog).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [b, c] = top[0].split(':').map(Number);
      const s = ns.lastSel[top[0]];
      cands.push({ p: s ? { book: b, ch: c, ...s } : { book: b, ch: c, from: 1, to: B.verseCount(b, c) }, why: '오늘 가장 오래 본 곳' });
    }
    if (!cands.length && bp.view === 'verses') {
      const s = bp.sel || ns.lastSel[`${bp.book}:${bp.ch}`];
      cands.push({ p: s ? { book: bp.book, ch: bp.ch, ...s } : { book: bp.book, ch: bp.ch, from: 1, to: B.verseCount(bp.book, bp.ch) }, why: '지금 보고 있는 곳' });
    }
    main.citations.forEach((c) => {
      const p = { book: c.book, ch: c.ch, from: c.from, to: c.to };
      if (!cands.some((x) => B.refText(x.p) === B.refText(p))) cands.push({ p, why: '노트에 인용한 구절' });
    });
    let pick = cands.length ? 0 : -1;
    modal(`<div class="modal">
      <h3>오늘 본문을 정하고 마칠까요?</h3>
      <p class="desc">본문을 정해 두면 나중에 같은 본문 노트를 찾을 수 있어요.</p>
      <div class="opts">${cands.slice(0, 3).map((c, i) => `<button class="opt ${i === pick ? 'on' : ''}" data-i="${i}"><span class="radio"></span><span><b>${esc(B.refText(c.p))}</b><small>${c.why}</small></span></button>`).join('')}</div>
      <button class="link" data-a="manual">다른 구절 직접 고르기</button>
      <div class="modal-actions"><button class="btn btn-outline" data-a="skip">본문 없이 저장</button><button class="btn btn-primary" data-a="ok" ${pick < 0 ? 'disabled' : ''}>이 본문으로 저장</button></div>
    </div>`, (d, close) => {
      d.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
        pick = +b.dataset.i;
        d.querySelectorAll('[data-i]').forEach((x) => x.classList.toggle('on', x === b));
        d.querySelector('[data-a="ok"]').disabled = false;
      }));
      d.querySelector('[data-a="manual"]').addEventListener('click', () => {
        close();
        if (!ns.leftOpen) app.querySelector('[data-act="side"]').click();
        toast('왼쪽에서 구절을 고른 뒤 "본문으로 넣기"를 눌러 주세요', 3200);
      });
      d.querySelector('[data-a="skip"]').addEventListener('click', () => { close(); finish(); });
      d.querySelector('[data-a="ok"]').addEventListener('click', async () => { close(); await setPassage(cands[pick].p, true); finish(); });
    });
  }

  cleanup = () => { clearInterval(timer); ns.paper?.destroy(); clearTimeout(savedT); tbRO.disconnect(); ns.offInk?.(); document.removeEventListener('pointerdown', closeMenusOutside, true); window.removeEventListener('pointerup', tbRelease, true); window.removeEventListener('pointercancel', tbRelease, true); document.removeEventListener('pointerdown', tbOutside, true); clearTimeout(tbTimer); };

  renderTabs();
  renderInfo();
  await mountPaper();
  if (openOld) openTab(openOld);
}

// =========================================================
// 시작
// =========================================================
async function main() {
  applyTheme();
  const t0 = Date.now();
  await B.loadIndex();
  reading = S.readingSeed(B.books().map((b) => b.verses.length));
  C.ui.toast = toast;
  C.ui.askConsent = askConsentAfterLogin;
  C.on((what) => { if ((what === 'notes' || what === 'user') && curScreen === 'home' && !overlay.querySelector('.dim')) go('home'); });
  go('home');
  C.init().catch((e) => console.warn('[cloud] init', e)); // 로그인돼 있으면 서버 노트를 받아 와요 (홈은 먼저 보여 줘요)
  if (window.__trackMsg) setTimeout(() => toast(window.__trackMsg), 600);
  const wait = Math.max(0, 900 - (Date.now() - t0));
  setTimeout(() => document.getElementById('splash').classList.add('hide'), wait);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
main();

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((h * 60 + 360) % 360), mx ? d / mx : 0, mx];
}
function hsvToHex(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
