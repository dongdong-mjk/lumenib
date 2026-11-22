// 회귀 점검 (민정님 요청: 무엇을 고치든 그동안 요청한 기능이 다 되는지 확인)
// 사용: 브라우저에서 사이트를 열고(예전 파일이 남아 있지 않게 js·css를 fetch(..., {cache:'reload'})로 한 번 새로 받은 뒤 새로고침) 콘솔에서
//   const m = await import('./tools/regression.js?' + Date.now()); console.table(await m.run());
// 웹에서 확인할 수 있는 것만 자동으로 봐요. 애플펜슬·네이티브 동작은 메모리의 수동 목록으로 확인해요.
// 점검용 노트를 새로 만들고, 끝나면 지워요.

const wait = (t) => new Promise((r) => setTimeout(r, t));
// 툴바는 손을 뗀 뒤 다음 화면 갱신 때 다시 그려져요. 창이 숨겨져 있으면 갱신이 느려서 넉넉히 기다려요
const settle = () => wait(700);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function pixels(canvas) {
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  return n;
}
const base = (i = 0) => $$('.page')[i]?.querySelector('canvas:not(.bg):not(.ink):not(.live):not(.hllive):not(.hlfade):not(.carryhl)');
const ink = (i = 0) => $$('.page')[i]?.querySelector('canvas.ink');
function pe(target, type, x, y, id = 900) {
  target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType: 'mouse', pointerId: id, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5 }));
}
function stroke(pts, page = 0) {
  const c = base(page), r = c.getBoundingClientRect();
  const [x0, y0] = pts[0];
  pe(c, 'pointerdown', r.left + x0, r.top + y0);
  for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
  const [xn, yn] = pts[pts.length - 1];
  pe(c, 'pointerup', r.left + xn, r.top + yn);
}
const line = (x0, y0, x1, y1, n = 30) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
const box = (x0, y0, x1, y1) => [...line(x0, y0, x1, y0, 8), ...line(x1, y0, x1, y1, 8), ...line(x1, y1, x0, y1, 8), ...line(x0, y1, x0, y0, 8)];
function tool(name) { $(`[data-tool="${name}"]`)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }
// 되돌리기 버튼은 툴바가 다시 그려져야 켜져서, 점검에선 종이에 바로 시켜요
const undo = () => window.__lumenibPaper?.undo();
const redo = () => window.__lumenibPaper?.redo();
const scroller = () => $('.paper-scroll');
function pinch(scaleOut) {
  const se = scroller(), tgt = se.querySelector('.page'), r = tgt.getBoundingClientRect();
  const T = (id, x, y) => new Touch({ identifier: id, target: tgt, clientX: x, clientY: y, touchType: 'direct' });
  const fire = (type, a, b) => { const ts = a ? [T(1, ...a), T(2, ...b)] : []; tgt.dispatchEvent(new TouchEvent(type, { touches: ts, targetTouches: ts, changedTouches: ts.length ? ts : [T(1, 0, 0), T(2, 0, 0)], bubbles: true, cancelable: true })); };
  const cx = r.left + 250, cy = r.top + 250;
  return (async () => {
    const d0 = scaleOut ? 150 : 50;
    fire('touchstart', [cx - d0, cy], [cx + d0, cy]);
    for (let i = 1; i <= 10; i++) { const d = scaleOut ? d0 - i * 10 : d0 + i * 10; fire('touchmove', [cx - d, cy], [cx + d, cy]); await wait(16); }
    fire('touchend', null, null);
    await wait(400);
  })();
}

export async function run() {
  const out = [];
  const check = async (name, fn) => {
    try { const r = await fn(); out.push({ 점검: name, 결과: r === true ? '통과' : '실패', 내용: r === true ? '' : String(r) }); }
    catch (e) { out.push({ 점검: name, 결과: '오류', 내용: e.message }); }
  };

  const S = await import('../js/store.js');
  const before = new Set(S.allNotes().map((n) => n.id));
  const lastPaper = S.settings.lastPaper;
  // 0. 점검용 노트 만들기: 홈 → 본문 고르기 → 본문 없이 먼저 쓰기
  location.hash = '';
  const home = $$('button').find((b) => b.textContent.trim() === '홈'); home?.click(); await wait(600);
  await check('본문 고르기 화면: 선택 취소(×) 버튼', async () => {
    $$('button').find((b) => b.textContent.includes('본문 고르기'))?.click(); await wait(800);
    $$('button').find((b) => b.textContent.trim() === '창세기')?.click(); await wait(400);
    $$('button').find((b) => b.textContent.trim() === '1장')?.click(); await wait(600);
    $('.verse[data-n="2"]')?.click(); await wait(300);
    if (!$('.bp-cancel')) return '× 버튼 없음';
    $('.bp-cancel').click(); await wait(300);
    return !$('.verse.sel') || '선택이 안 풀림';
  });
  $$('button').find((b) => b.textContent.includes('본문 없이 먼저'))?.click(); await wait(1500);
  if (!base()) { out.push({ 점검: '노트 열기', 결과: '오류', 내용: '노트 화면을 못 열었어요' }); return out; }
  const se = scroller();

  await check('뒤로 버튼(피그마 꺾쇠 아이콘)', () => ($('[data-act="back"] path')?.getAttribute('d') || '').startsWith('M14.932') || '아이콘 다름');
  await check('툴바 도구 선택(펜·형광펜·지우개·올가미)', async () => {
    const I = await import('../js/ink.js');
    for (const t of ['hl', 'eraser', 'lasso', 'pen']) { tool(t); await settle(); if (I.tool.type !== t) return t + ' 선택 안 됨'; }
    await wait(800); // 툴바 표시도 따라오는지
    return $('[data-tool].on')?.dataset.tool === 'pen' || '툴바 표시가 안 바뀜';
  });
  await check('툴바 가운데 영역 너비 고정(268)', () => Math.round($('.tb-opts').getBoundingClientRect().width) === 268 || $('.tb-opts').getBoundingClientRect().width);

  await check('펜 쓰기 · 되돌리기 · 다시 하기', async () => {
    tool('pen'); await settle();
    const p0 = pixels(ink());
    stroke(line(80, 300, 300, 320)); await settle();
    const p1 = pixels(ink()); if (p1 <= p0) return '펜 선이 안 그려짐';
    await settle(); undo(); await settle(); if (pixels(ink()) > p0 + 10) return '되돌리기 안 됨';
    redo(); await settle(); return Math.abs(pixels(ink()) - p1) < p1 * 0.05 || '다시 하기 안 됨';
  });
  await check('글씨 많은 장: 한 획 쓰기·되돌리기가 가벼움', async () => {
    tool('pen'); await settle();
    for (let i = 0; i < 120; i++) { const y = 560 + (i % 20) * 12, x = 60 + Math.floor(i / 20) * 100; stroke(line(x, y, x + 80, y + 4, 25)); }
    await settle();
    const t0 = performance.now(); stroke(line(60, 820, 300, 830, 25)); const add = performance.now() - t0;
    await settle();
    const t1 = performance.now(); undo(); const un = performance.now() - t1;
    await settle(); redo(); await settle();
    // 쓴 획이 다시 그려도 그대로인지 (기억해 둔 모양이 맞는지)
    const before = pixels(ink());
    window.__lumenibPaper.drawPage($$('.page').length ? window.__lumenibPaper.pages[0] : null);
    const after = pixels(ink());
    for (let i = 0; i < 121; i++) undo();
    await settle();
    if (Math.abs(after - before) > before * 0.01) return '다시 그린 그림이 달라요 ' + [before, after];
    return add < 25 || '한 획 추가가 무거워요 ' + Math.round(add) + 'ms (되돌리기 ' + Math.round(un) + 'ms)';
  });
  await check('형광펜: 글씨 밑 캔버스에 그려짐 · 돼지꼬리 겹침 고르게', async () => {
    tool('hl'); await settle();
    const pts = Array.from({ length: 120 }, (_, i) => { const t = (i / 120) * Math.PI * 4; return [120 + i * 2 + Math.cos(t) * 30, 420 + Math.sin(t) * 30]; });
    stroke(pts); await wait(200);
    const c = base(), ctx = c.getContext('2d'), k = c.width / c.getBoundingClientRect().width;
    // 고리가 겹치는 곳과 안 겹치는 곳의 진하기가 같아야 해요
    const a = ctx.getImageData(Math.round(pts[0][0] * k), Math.round(pts[0][1] * k), 1, 1).data[3];
    if (!a) return '형광펜이 안 그려짐';
    const alphas = new Set();
    for (const [x, y] of pts.filter((_, i) => i % 10 === 5)) alphas.add(ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3]);
    return alphas.size <= 2 || '겹친 곳 진하기가 달라요 ' + [...alphas];
  });

  await check('두 손가락 탭 = 되돌리기 · 펜슬 직후 손바닥 탭은 무시', async () => {
    tool('pen'); await settle();
    stroke(line(80, 500, 300, 510)); await settle();
    const tgt = $$('.page')[0], r = tgt.getBoundingClientRect();
    const T = (id, x, y, type = 'direct') => new Touch({ identifier: id, target: tgt, clientX: x, clientY: y, touchType: type });
    const tap = (withPencil) => {
      const a = T(11, r.left + 200, r.top + 600), b = T(12, r.left + 260, r.top + 600);
      tgt.dispatchEvent(new TouchEvent('touchstart', { touches: [a, b], targetTouches: [a, b], changedTouches: [a, b], bubbles: true, cancelable: true }));
      if (withPencil) { const p = T(13, r.left + 300, r.top + 300, 'stylus'); tgt.dispatchEvent(new TouchEvent('touchstart', { touches: [a, b, p], targetTouches: [a, b, p], changedTouches: [p], bubbles: true, cancelable: true })); }
      tgt.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [a, b], bubbles: true, cancelable: true }));
    };
    const n0 = window.__lumenibPaper.undoStack.length;
    tap(true); await wait(500);
    if (window.__lumenibPaper.undoStack.length !== n0) return '펜슬과 같이 닿은 탭에 되돌려짐';
    await wait(900);
    tap(false); await wait(500);
    if (window.__lumenibPaper.undoStack.length !== n0 - 1) return '두 손가락 탭으로 안 되돌려짐';
    redo(); await settle();
    return true;
  });
  await check('그리고 멈추면 도형 · 누른 채로 움직이면 크기 조절 (펜)', async () => {
    tool('pen'); await settle();
    const c = base(), r = c.getBoundingClientRect();
    const pts = [...line(400, 300, 520, 302, 10), ...line(520, 302, 518, 380, 8), ...line(518, 380, 402, 378, 10), ...line(402, 378, 400, 302, 8)];
    pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
    for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
    await wait(750); // 펜을 떼지 않고 멈춤
    pe(c, 'pointermove', r.left + 420, r.top + 300); // 누른 채로 움직여 크기 조절
    pe(c, 'pointerup', r.left + 420, r.top + 300); await settle();
    const P = window.__lumenibPaper, last = P.note.pages[0].strokes.at(-1);
    if (!last?.sh) return '도형으로 안 바뀜';
    const xs = last.pts.filter((_, i) => i % 3 === 0), ys = last.pts.filter((_, i) => i % 3 === 1);
    const w = Math.max(...xs) - Math.min(...xs);
    undo(); await settle();
    return w > 20 || '도형 크기가 이상해요 ' + w;
  });
  await check('도형: 그린 모양대로 · 대충 그린 네모 인식 · 덜 닫힌 원도 원(매끄럽게) · 꺾은선 끝을 시작점에 대면 붙음', async () => {
    tool('pen'); await settle();
    const c = base(), r = c.getBoundingClientRect(), P = window.__lumenibPaper;
    const drawHold = async (pts, after) => {
      pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
      for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
      await wait(750);
      if (after) pe(c, 'pointermove', r.left + after[0], r.top + after[1]);
      const e = after || pts.at(-1);
      pe(c, 'pointerup', r.left + e[0], r.top + e[1]); await settle();
      return P.note.pages[0].strokes.at(-1);
    };
    // 1) 비뚤어진 세모: 그린 꼭짓점 근처 그대로
    const A = [120, 330], B = [260, 300], C = [150, 200];
    const tri = await drawHold([...line(A[0], A[1], B[0], B[1], 10), ...line(B[0], B[1], C[0], C[1], 10), ...line(C[0], C[1], A[0] + 3, A[1] - 2, 10)]);
    const near = (q) => { let m = 1e9; for (let i = 0; i < tri.pts.length; i += 3) m = Math.min(m, Math.hypot(tri.pts[i] / 1 - q[0] / (r.width / 726), tri.pts[i + 1] - q[1] / (r.width / 726))); return m; };
    undo(); await settle();
    if (!tri?.sh) return '세모가 도형으로 안 바뀜';
    if ([A, B, C].some((q) => near(q) > 12)) return '세모가 그린 모양과 달라요';
    // 1-2) 손으로 대충 그린 네모 (떨림 있음) → 곧은 네 변, 닫힘
    const jit = (pts) => pts.map(([x, y], i) => [x + Math.sin(i * 1.7) * 2, y + Math.cos(i * 1.3) * 2]);
    const sq = await drawHold(jit([...line(560, 420, 680, 424, 14), ...line(680, 424, 676, 530, 14), ...line(676, 530, 562, 526, 14), ...line(562, 526, 562, 428, 14)]));
    undo(); await settle();
    if (!sq?.sh) return '네모가 도형으로 안 바뀜';
    const sqx = sq.pts.filter((_, i) => i % 3 === 0), sqy = sq.pts.filter((_, i) => i % 3 === 1);
    const corners = new Set(sq.pts.length ? [] : []);
    if (Math.hypot(sqx.at(-1) - sqx[0], sqy.at(-1) - sqy[0]) > 0.5) return '네모가 안 닫혀요';
    // 2) 4분의 3쯤만 그린 원 → 원
    const arc = Array.from({ length: 50 }, (_, i) => { const t = (i / 49) * Math.PI * 1.8; return [450 + Math.cos(t) * 60, 260 + Math.sin(t) * 60]; });
    const circ = await drawHold(arc);
    undo(); await settle();
    if (!circ?.sh) return '덜 닫힌 원이 도형으로 안 바뀜';
    if (circ.pts.length / 3 < 100) return '원이 다각형으로 나와요 (' + circ.pts.length / 3 + '점)';
    // 원은 촘촘해야 확대해도 매끄러워요 (점 사이 1 이하)
    let gap = 0; for (let i = 3; i < circ.pts.length; i += 3) gap = Math.max(gap, Math.hypot(circ.pts[i] - circ.pts[i - 3], circ.pts[i + 1] - circ.pts[i - 2]));
    if (gap > 1) return '원 점 사이가 넓어요 ' + gap.toFixed(2);
    // 3) ㄷ 모양 꺾은선 → 멈춘 뒤 끝을 시작점에 대면 붙어서 닫힘
    const S = [150, 450];
    const open = [...line(S[0], S[1], 300, 450, 10), ...line(300, 450, 300, 560, 10), ...line(300, 560, 150, 560, 10)];
    const k = r.width / 726;
    const poly = await drawHold(open, [S[0] + 4, S[1] + 4]);
    undo(); await settle();
    if (!poly?.sh) return '꺾은선이 도형으로 안 바뀜';
    const q = poly.pts, d = Math.hypot(q[q.length - 3] - q[0], q[q.length - 2] - q[1]);
    return d < 0.5 || '끝점이 시작점에 안 붙어요 ' + d.toFixed(1) + ' (배율 ' + k.toFixed(2) + ')';
  });
  await check('펜슬처럼 떨리는 손으로 그은 선도 멈추면 직선 (펜·형광펜)', async () => {
    const c = base(), r = c.getBoundingClientRect(), P = window.__lumenibPaper;
    for (const t of ['pen', 'hl']) {
      tool(t); await settle();
      // 촘촘한 점 + 미세한 떨림, 끝에서 멈춘 채로도 조금씩 흔들림 (아이패드 펜슬처럼)
      const pts = [];
      for (let i = 0; i <= 150; i++) pts.push([120 + i * 2 + Math.sin(i * 2.7) * 1.2, 620 + i * 0.15 + Math.cos(i * 3.1) * 1.2]);
      pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
      for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
      const [ex, ey] = pts.at(-1);
      for (let j = 0; j < 12; j++) { pe(c, 'pointermove', r.left + ex + Math.sin(j) * 1.5, r.top + ey + Math.cos(j) * 1.5); await wait(60); }
      await wait(600);
      pe(c, 'pointerup', r.left + ex, r.top + ey); await settle();
      const last = P.note.pages[0].strokes.at(-1);
      undo(); await settle();
      if (!last?.sh) return t + ': 직선으로 안 바뀜';
    }
    tool('pen'); await settle();
    return true;
  });
  await check('대충 그린 네모(변 중간에서 시작·끝이 지나침·약간 사다리꼴) → 반듯한 네모, 꼬리 없음', async () => {
    tool('pen'); await settle();
    const c = base(), r = c.getBoundingClientRect(), P = window.__lumenibPaper;
    const L = (a, b, n = 14) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n + Math.sin(i * 2.1) * 1.5, a[1] + (b[1] - a[1]) * i / n + Math.cos(i * 1.7) * 1.5]);
    // 윗변 가운데에서 시작 → 오른쪽 위 → 오른쪽 아래(조금 안쪽) → 왼쪽 아래 → 왼쪽 위 → 시작점을 지나쳐서 끝
    const pts = [...L([440, 300], [560, 296]), ...L([560, 296], [552, 400]), ...L([552, 400], [330, 404]), ...L([330, 404], [322, 300]), ...L([322, 300], [470, 302])];
    pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
    for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
    await wait(750);
    pe(c, 'pointerup', r.left + pts.at(-1)[0], r.top + pts.at(-1)[1]); await settle();
    const s = P.note.pages[0].strokes.at(-1);
    undo(); await settle();
    if (!s?.sh) return '도형으로 안 바뀜';
    // 꼭짓점: 방향이 크게 바뀌는 곳 세기
    const q = []; for (let i = 0; i < s.pts.length; i += 3) q.push([s.pts[i], s.pts[i + 1]]);
    let corners = 0; const step = 6;
    for (let i = step; i < q.length - step; i += 1) {
      const a1 = Math.atan2(q[i][1] - q[i - step][1], q[i][0] - q[i - step][0]), a2 = Math.atan2(q[i + step][1] - q[i][1], q[i + step][0] - q[i][0]);
      let d = Math.abs(a1 - a2); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > 1.2) { corners++; i += step * 2; }
    }
    const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    // 반듯한 네모면 변이 수평·수직: 위·아래 변의 y 차이가 거의 없음
    const top = ys.filter((y) => y < Math.min(...ys) + 3).length, ok = corners >= 3 && corners <= 4;
    return ok || '꼭짓점 수가 이상해요 ' + corners;
  });
  await check('멈춘 뒤 펜을 옆으로 움직이면 네모가 가로로만 늘어남 · 반대쪽 꼭짓점 고정 (굿노트처럼)', async () => {
    tool('pen'); await settle();
    const c = base(), r = c.getBoundingClientRect(), P = window.__lumenibPaper;
    const L = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
    const pts = [...L([320, 300], [420, 300]), ...L([420, 300], [420, 380]), ...L([420, 380], [320, 380]), ...L([320, 380], [320, 302])];
    pe(c, 'pointerdown', r.left + 320, r.top + 300);
    for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
    await wait(750);
    pe(c, 'pointermove', r.left + 240, r.top + 302); // 펜(왼쪽 위 모서리)을 왼쪽으로 80
    pe(c, 'pointerup', r.left + 240, r.top + 302); await settle();
    const s = P.note.pages[0].strokes.at(-1);
    undo(); await settle();
    if (!s?.sh) return '도형으로 안 바뀜';
    const xs = s.pts.filter((_, i) => i % 3 === 0), ys = s.pts.filter((_, i) => i % 3 === 1);
    const k = r.width / 726, w = (Math.max(...xs) - Math.min(...xs)) * k, h = (Math.max(...ys) - Math.min(...ys)) * k;
    if (Math.abs(h - 80) > 8) return '세로도 바뀌었어요 ' + Math.round(h);
    const bx = Math.max(...xs) * k, by = Math.max(...ys) * k; // 반대쪽(오른쪽 아래) 꼭짓점은 그대로
    if (Math.abs(bx - 420) > 3 || Math.abs(by - 380) > 3) return '반대쪽 꼭짓점이 움직였어요 ' + Math.round(bx) + ',' + Math.round(by);
    return Math.abs(w - 180) < 10 || '가로가 펜 위치만큼 안 늘었어요 ' + Math.round(w);
  });
  await check('그리고 멈추면 직선 (형광펜)', async () => {
    tool('hl'); await settle();
    const c = base(), r = c.getBoundingClientRect();
    const pts = Array.from({ length: 30 }, (_, i) => [100 + i * 8, 700 + Math.sin(i / 2) * 3]);
    pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
    for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
    await wait(750);
    pe(c, 'pointerup', r.left + pts.at(-1)[0], r.top + pts.at(-1)[1]); await settle();
    const last = window.__lumenibPaper.note.pages[0].strokes.at(-1);
    // 처음과 끝을 이은 선에서 벗어난 정도 (곧은 선이면 거의 0)
    const q = last.pts, ax = q[0], ay = q[1], bx = q[q.length - 3], by = q[q.length - 2], L = Math.hypot(bx - ax, by - ay) || 1;
    let off = 0; for (let i = 0; i < q.length; i += 3) off = Math.max(off, Math.abs((q[i] - ax) * (by - ay) - (q[i + 1] - ay) * (bx - ax)) / L);
    const ys = q.filter((_, i) => i % 3 === 1);
    undo(); await settle(); tool('pen'); await settle();
    if (!last.sh) return '직선으로 안 바뀜';
    if (off >= 0.6) return '곧은 선이 아니에요 ' + off.toFixed(2);
    // 수평에서 조금 기운 선은 딱 수평으로
    return Math.max(...ys) - Math.min(...ys) < 0.01 || '수평으로 안 맞춰짐 ' + (Math.max(...ys) - Math.min(...ys)).toFixed(2);
  });
  await check('올가미: 획 일부만 둘러도 고름 · 선택 해제', async () => {
    tool('lasso'); await settle();
    stroke(box(150, 280, 230, 340)); await settle(); // 펜 선(80~300)의 가운데만
    if (!$('.lasso-menu')) return '선택 안 됨';
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    return !$('.lasso-menu') || '해제 안 됨';
  });
  await check('올가미로 옮기기 · 되돌리기', async () => {
    const before = pixels(ink()); // 고르기 전 (고르면 고른 글씨는 선택 판으로 옮겨 그려져요)
    tool('lasso'); await settle();
    stroke(box(60, 280, 320, 340)); await settle();
    const c = base(), r = c.getBoundingClientRect();
    pe(c, 'pointerdown', r.left + 150, r.top + 310); pe(c, 'pointermove', r.left + 150, r.top + 360); pe(c, 'pointerup', r.left + 150, r.top + 360); await wait(250);
    if (!$('.lasso-menu')) return '옮긴 뒤 선택 유지 안 됨';
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    const moved = ink().getContext('2d').getImageData(0, 0, ink().width, ink().height);
    undo(); await settle();
    return Math.abs(pixels(ink()) - before) < before * 0.05 || '되돌리기 후 그림이 달라요 ' + [before, pixels(ink()), moved.width];
  });

  await check('구절 고르기: 9→10→11 누적', async () => {
    for (const n of [9, 10, 11]) { $(`.verse[data-n="${n}"]`)?.click(); await settle(); }
    const sel = $$('.verse.sel').map((v) => +v.dataset.n);
    return (sel.join() === '9,10,11') || '고른 절: ' + sel.join();
  });
  await check('고른 구절 위: 세로는 목록 스크롤 · 노트 화면 선택 취소(×)', async () => {
    const v = $('.verse.sel'), body = v.closest('.bp-body'), r = v.getBoundingClientRect(), st0 = body.scrollTop;
    const ev = (t, x, y, tg) => (tg || body).dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 901, pointerType: 'touch', bubbles: true, cancelable: true, button: 0, buttons: t === 'pointerup' ? 0 : 1 }));
    ev('pointerdown', r.left + 40, r.top + 10, v);
    for (let i = 1; i <= 8; i++) { ev('pointermove', r.left + 40, r.top + 10 - i * 15); await wait(16); }
    ev('pointerup', r.left + 40, r.top - 110); await wait(500);
    if (body.scrollTop === st0) return '세로 스크롤 안 됨';
    return !!$('.bp-cancel') || '× 버튼 없음';
  });
  await check('인용 넣기', async () => {
    $$('.bp-action button').find((b) => /인용으로|노트에 넣기/.test(b.textContent))?.click(); await wait(800);
    return $$('.cite-block').length === 1 || '인용 개수 ' + $$('.cite-block').length;
  });
  await check('인용 위에 쓴 글씨만 손잡이로 같이 움직임', async () => {
    const cb = $('.cite-block'), pr = $$('.page')[0].getBoundingClientRect(), k = pr.width / 726;
    const top = (cb.getBoundingClientRect().top - pr.top) / 1; // 화면 px
    tool('pen'); await settle();
    stroke(line(100, top + 30, 200, top + 30)); await settle();
    const grip = $('.cite-grip'), g = grip.getBoundingClientRect();
    const inkBefore = pixels(ink());
    pe(grip, 'pointerdown', g.left + 5, g.top + 5, 902); pe(window, 'pointermove', g.left + 5, g.top + 125, 902); pe(window, 'pointerup', g.left + 5, g.top + 125, 902); await wait(400);
    const moved = Math.round((cb.getBoundingClientRect().top - pr.top - top) / k);
    if (Math.abs(moved - 120 / k) > 3) return '인용이 안 움직임 ' + moved;
    if (pixels(ink()) < inkBefore * 0.9) return '글씨가 사라짐';
    // 글씨도 같이 내려갔는지: 원래 자리에 글씨가 없어야 해요
    const c = ink(), kk = c.width / c.getBoundingClientRect().width;
    const old = c.getContext('2d').getImageData(Math.round(150 * kk), Math.round((top + 30) * kk), 1, 1).data[3];
    undo(); await settle();
    return !old || '글씨가 따라오지 않았어요';
  });
  await check('인용을 다음 장으로 옮기기 · 되돌리기 · 자리 유지', async () => {
    const pages = $$('.page'); if (pages.length < 2) return '2쪽이 없음';
    se.scrollTop = 0; await wait(100);
    const grip = $('.cite-grip'), g = grip.getBoundingClientRect();
    pe(grip, 'pointerdown', g.left + 5, g.top + 5, 903);
    pages[1].scrollIntoView(); await wait(150);
    const r2 = pages[1].getBoundingClientRect();
    pe(window, 'pointermove', g.left + 5, r2.top + 120, 903); pe(window, 'pointerup', g.left + 5, r2.top + 120, 903); await wait(400);
    if (!$$('.page')[1].querySelector('.cite-block')) return '2쪽으로 안 넘어감';
    const st = se.scrollTop;
    undo(); await wait(400);
    if (!$$('.page')[0].querySelector('.cite-block')) return '되돌리기 안 됨';
    return Math.abs(se.scrollTop - st) < 2 || '되돌리기 후 스크롤이 튐 ' + [st, se.scrollTop];
  });
  await check('올가미로 인용 고르면 위의 글씨도 같이', async () => {
    se.scrollTop = 0; await wait(100);
    const cb = $('.cite-block'), pr = $$('.page')[0].getBoundingClientRect(), top = cb.getBoundingClientRect().top - pr.top;
    tool('pen'); await settle();
    stroke(line(100, top + 30, 200, top + 30)); await settle();
    tool('lasso'); await settle();
    stroke(box(500, top + 5, 560, top + 25)); await settle();
    const ok = !!$('.lasso-menu');
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    undo(); await settle();
    return ok || '인용이 안 골라짐';
  });

  await check('올가미로 인용 두 개 옮기기 · 되돌리기 (가볍게)', async () => {
    se.scrollTop = 0; await wait(100);
    $('.verse[data-n="20"]')?.click(); await wait(300);
    $$('.bp-action button').find((b) => /인용으로|노트에 넣기/.test(b.textContent))?.click(); await settle();
    const blocks = $$('.page')[0].querySelectorAll('.cite-block');
    if (blocks.length < 2) return '인용이 2개가 아님 ' + blocks.length;
    const [b1, b2] = [...blocks].map((b) => b.getBoundingClientRect());
    if (b1.bottom > b2.top && b2.bottom > b1.top) return '새 인용이 기존 인용과 겹쳐서 들어감';
    const pr = $$('.page')[0].getBoundingClientRect();
    const tops = () => [...$$('.page')[0].querySelectorAll('.cite-block')].map((b) => Math.round(b.getBoundingClientRect().top - pr.top));
    const t0 = tops(), y0 = Math.min(...t0) - 10, y1 = Math.max(...t0) + 40;
    tool('lasso'); await settle();
    stroke(box(480, y0, 560, y1)); await settle();
    if (!$('.lasso-menu')) return '두 인용이 안 골라짐';
    const c = base(), r = c.getBoundingClientRect();
    const t1 = performance.now();
    pe(c, 'pointerdown', r.left + 520, r.top + y0 + 20); pe(c, 'pointermove', r.left + 520, r.top + y0 + 80); pe(c, 'pointerup', r.left + 520, r.top + y0 + 80);
    const cost = performance.now() - t1; await settle();
    const moved = tops();
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    undo(); await settle();
    const back = tops();
    if (moved.join() === t0.join()) return '안 움직임';
    if (back.join() !== t0.join()) return '되돌리기 후 자리 다름 ' + [t0, back];
    return cost < 60 || '손 뗄 때 처리가 무거움 ' + Math.round(cost) + 'ms';
  });
  await check('올가미로 인용·글씨를 다음 장으로 옮기기 · 되돌리기', async () => {
    se.scrollTop = 0; await wait(100);
    const p0 = $$('.page')[0], pr = p0.getBoundingClientRect();
    const cb = p0.querySelector('.cite-block'); if (!cb) return '인용 없음';
    const top = cb.getBoundingClientRect().top - pr.top;
    tool('lasso'); await settle();
    stroke(box(480, top - 10, 560, top + 30)); await settle();
    if (!$('.lasso-menu')) return '안 골라짐';
    const c = base(), r = c.getBoundingClientRect();
    pe(c, 'pointerdown', r.left + 520, r.top + top + 10);
    $$('.page')[1].scrollIntoView(); await wait(200);
    const r2 = $$('.page')[1].getBoundingClientRect();
    pe(c, 'pointermove', r.left + 520, r2.top + 150); pe(c, 'pointerup', r.left + 520, r2.top + 150); await settle();
    if (!$$('.page')[1].querySelector('.cite-block')) return '2쪽으로 안 넘어감';
    undo(); await settle();
    return !!$$('.page')[0].querySelector('.cite-block') && !$$('.page')[1].querySelector('.cite-block') || '되돌리기 안 됨';
  });
  await check('인용 상자 너비 조절 · 가로로도 옮기기 · 되돌리기', async () => {
    se.scrollTop = 0; await wait(100);
    const cb = $('.cite-block'), rs = $('.cite-rs');
    if (!cb || !rs) return '손잡이 없음';
    const w0 = cb.getBoundingClientRect().width, g = rs.getBoundingClientRect();
    pe(rs, 'pointerdown', g.left + 10, g.top + 10, 970); pe(rs, 'pointermove', g.left - 150, g.top + 10, 970); pe(rs, 'pointerup', g.left - 150, g.top + 10, 970); await settle();
    const w1 = cb.getBoundingClientRect().width;
    if (w1 > w0 - 100) return '너비가 안 줄었어요 ' + [w0, w1];
    // 좁힌 상자를 손잡이로 오른쪽 아래로 옮기기 (가로로도 자유롭게)
    const grip = $('.cite-grip'), gg = grip.getBoundingClientRect(), l0 = $('.cite-block').getBoundingClientRect().left;
    pe(grip, 'pointerdown', gg.left + 5, gg.top + 5, 971); pe(window, 'pointermove', gg.left + 105, gg.top + 25, 971); pe(window, 'pointerup', gg.left + 105, gg.top + 25, 971); await settle();
    const l1 = $('.cite-block').getBoundingClientRect().left;
    if (l1 < l0 + 50) return '가로로 안 움직여요 ' + [l0, l1];
    undo(); await settle();
    if (Math.abs($('.cite-block').getBoundingClientRect().left - l0) > 2) return '가로 이동 되돌리기 안 됨';
    undo(); await settle();
    const w2 = $('.cite-block').getBoundingClientRect().width;
    return Math.abs(w2 - w0) < 2 || '되돌리기 안 됨 ' + [w0, w2];
  });
  await check('종이 종류 바꿔도 확대·스크롤 유지 · 마지막 종이 기억', async () => {
    se.scrollTop = 300; await wait(100);
    const st = se.scrollTop;
    $('[data-act="more"]').click(); await wait(200);
    const opt = $$('.paper-opt').find((b) => !b.classList.contains('on'));
    const want = opt.dataset.p; opt.click(); await wait(300);
    if (Math.abs(se.scrollTop - st) > 2) return '스크롤이 튐';
    const saved = JSON.parse(localStorage.getItem('lumenib.v1.settings') || '{}').lastPaper;
    return saved === want || '마지막 종이 저장 안 됨';
  });
  await check('두 손가락 확대 · 축소 후 다시 그리기', async () => {
    const before = pixels(ink());
    await pinch(false);
    if (!se.classList.contains('zoomed')) return '확대 안 됨';
    if (!pixels(ink())) return '확대 후 글씨가 안 보임';
    await pinch(true);
    if (se.classList.contains('zoomed')) return '축소 안 됨';
    return pixels(ink()) > 0 || '축소 후 글씨 안 보임 ' + before;
  });
  await check('사이드바 접기·펴기 후 종이 정상', async () => {
    $('[data-act="side"]').click(); await wait(450);
    $('[data-act="side"]').click(); await wait(450);
    const pe2 = $('.pages');
    return (!pe2.style.transform || pe2.style.transform === 'none') && pixels(ink()) > 0 || '종이 변형이 남음 ' + pe2.style.transform;
  });

  // 정리: 점검용으로 만든 노트를 지우고 처음 화면으로
  S.allNotes().filter((n) => !before.has(n.id)).forEach((n) => S.deleteNote(n.id));
  S.settings.lastPaper = lastPaper; S.saveSettings();
  S.saveNotes(true);
  location.hash = ''; setTimeout(() => location.reload(), 50);
  return out;
}
