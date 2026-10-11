'use strict';
// 公式の公開API（認証不要・CORS許可）。キーワード検索のみ。投稿者指定検索は意図的に非対応。
const ENDPOINTS = ['https://api.bsky.app', 'https://public.api.bsky.app'];
const $ = s => document.querySelector(s);
const st = { q: '', sort: 'latest', cursor: null, until: null, seen: new Set(), loading: false, done: false, gen: 0 };
const fmt = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

// author: / from: / mentions: などの人物指定演算子は除去する
function sanitize(q) {
  return q.replace(/(^|\s)(from|author|mentions|to|did):\S*/gi, ' ').replace(/(^|\s)@\S+/g, ' ').trim();
}

async function fetchPage(q, sort, cursor, until) {
  const p = new URLSearchParams({ q, sort, limit: '25' });
  if (cursor) p.set('cursor', cursor);
  if (until) p.set('until', until);
  let err;
  for (const base of ENDPOINTS) {
    try {
      const r = await fetch(`${base}/xrpc/app.bsky.feed.searchPosts?${p}`);
      if (r.ok) return await r.json();
      err = new Error('HTTP ' + r.status);
    } catch (e) { err = e; }
  }
  throw err;
}

function postUrl(post) {
  const rkey = post.uri.split('/').pop();
  return `https://bsky.app/profile/${encodeURIComponent(post.author.handle || post.author.did)}/post/${encodeURIComponent(rkey)}`;
}

function render(post) {
  const li = document.createElement('li');
  const meta = document.createElement('div'); meta.className = 'meta';
  const name = document.createElement('span'); name.className = 'name';
  name.textContent = post.author.displayName || post.author.handle;
  const time = document.createElement('time');
  const d = new Date(post.record?.createdAt || post.indexedAt);
  time.dateTime = d.toISOString(); time.textContent = fmt.format(d) + ' JST';
  meta.append(name, time);
  const text = document.createElement('div'); text.className = 'text';
  text.textContent = post.record?.text || '';
  const foot = document.createElement('div'); foot.className = 'foot';
  foot.innerHTML = '<span>♥ <b></b></span><span>🔁 <b></b></span><a target="_blank" rel="noopener">Blueskyで開く</a>';
  const b = foot.querySelectorAll('b');
  b[0].textContent = post.likeCount ?? 0; b[1].textContent = post.repostCount ?? 0;
  foot.querySelector('a').href = postUrl(post);
  li.append(meta, text, foot);
  return li;
}

async function loadMore() {
  if (st.loading || st.done || !st.q) return;
  st.loading = true; const gen = st.gen;
  $('#status').textContent = '読み込み中…';
  try {
    let data;
    try { data = await fetchPage(st.q, st.sort, st.cursor, null); }
    catch (e) {
      // 未認証だとcursorでの2ページ目が403になることがある。新着順はuntil（日時）で続きを取得
      if (!st.cursor || st.sort !== 'latest' || !st.until) throw e;
      data = await fetchPage(st.q, st.sort, null, st.until);
      st.cursor = null;
    }
    if (gen !== st.gen) return;
    const posts = (data.posts || []).filter(p => !st.seen.has(p.uri));
    posts.forEach(p => { st.seen.add(p.uri); $('#results').append(render(p)); });
    if (posts.length) st.until = posts[posts.length - 1].indexedAt;
    st.cursor = data.cursor || null;
    st.done = posts.length === 0 || (!st.cursor && st.sort !== 'latest');
    const n = $('#results').children.length;
    $('#status').textContent = n === 0 ? '見つかりませんでした。' : st.done ? `${n}件・これ以上ありません` : '';
  } catch (e) {
    if (gen === st.gen && $('#results').children.length && st.cursor) { st.done = true; $('#status').textContent = 'これ以上は読み込めません（APIの制限）'; return; }
    if (gen === st.gen) $('#status').textContent = '検索に失敗しました（' + e.message + '）';
  } finally { if (gen === st.gen) st.loading = false; }
}

function start() {
  const q = sanitize($('#q').value);
  if (!q) { $('#status').textContent = 'キーワードを入力してください（人物指定の検索には対応していません）。'; return; }
  st.q = q; st.sort = document.querySelector('input[name=sort]:checked').value;
  st.cursor = null; st.until = null; st.seen = new Set(); st.done = false; st.loading = false; st.gen++;
  $('#results').replaceChildren();
  history.replaceState(null, '', '?q=' + encodeURIComponent(q) + '&sort=' + st.sort);
  loadMore();
}

$('#f').addEventListener('submit', e => { e.preventDefault(); $('#q').blur(); start(); });
document.querySelectorAll('input[name=sort]').forEach(r => r.addEventListener('change', () => st.q && start()));
new IntersectionObserver(es => es[0].isIntersecting && loadMore(), { rootMargin: '600px' }).observe($('#sentinel'));

const u = new URLSearchParams(location.search);
if (u.get('sort') === 'top') document.querySelector('input[value=top]').checked = true;
if (u.get('q')) { $('#q').value = u.get('q'); start(); }

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (typeof module !== 'undefined') module.exports = { sanitize, postUrl };
