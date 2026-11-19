// 성경 본문 데이터 (바꿔 끼울 수 있는 별도 파일)
// data/bible/<번역본>/books.json + 01.json … 66.json
// 다른 번역본을 쓰려면 같은 형식의 폴더를 만들고 TRANSLATION만 바꾸면 돼요.

export const TRANSLATION = 'krv'; // 개역한글
const base = `data/bible/${TRANSLATION}/`;

let index = null;
const cache = new Map();

export async function loadIndex() {
  if (!index) index = await (await fetch(base + 'books.json')).json();
  return index;
}
export const books = () => index.books;
export const book = (id) => index.books[id - 1];
export const verseCount = (b, c) => index.books[b - 1].verses[c - 1];
export const chapterCount = (b) => index.books[b - 1].verses.length;

export async function loadBook(id) {
  if (!cache.has(id)) cache.set(id, fetch(base + String(id).padStart(2, '0') + '.json').then((r) => r.json()));
  return cache.get(id);
}
export async function getVerses(b, c, from = 1, to) {
  const data = await loadBook(b);
  const ch = data.chapters[c - 1] || [];
  const end = to || ch.length;
  return ch.slice(from - 1, end).map((t, i) => ({ n: from + i, t }));
}

// 표기: 로마서 8:35-37 / 롬 8:35-37
export function refText(p, short = false) {
  if (!p) return '';
  const b = book(p.book);
  const name = short ? b.abbr : b.name;
  if (!p.from) return `${name} ${p.ch}장`;
  return `${name} ${p.ch}:${p.from}${p.to && p.to !== p.from ? '-' + p.to : ''}`;
}

export function overlaps(a, b) {
  if (a.book !== b.book || a.ch !== b.ch) return false;
  const af = a.from || 1, at = a.to || a.from || 999;
  const bf = b.from || 1, bt = b.to || b.from || 999;
  return af <= bt && bf <= at;
}
