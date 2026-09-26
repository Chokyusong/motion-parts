/* 부품 도감 화면.
 * catalog.json을 읽어 분류별 카드를 그리고, 담은 부품(순서)을 아래 막대에 모은다.
 * "새 영상 만들기" → 서버(/api/new-video)가 projects/<이름>/index.html을 만들고 → 편집기로 연다.
 * 담은 목록은 이 브라우저에 기억해 둔다(다시 열어도 그대로).
 *
 * 공개 사이트(웹) 모드: window.MOTION_STATIC = true면 서버 없이 돈다(kit/editor/build_site.py가 만든 사이트).
 * 영상 만들기 대신 "이어서 보기"로 고른 효과의 미리보기를 차례로 재생한다.
 */
"use strict";

const $ = s => document.querySelector(s);
const STATIC = window.MOTION_STATIC === true;
const OUT = STATIC ? "clips/" : "/kit/parts/out/";
const CATALOG = STATIC ? "catalog.json" : "/kit/parts/catalog.json";
const KEY = "motion-catalog-picked";
const S = { cats: [], parts: [], byId: {}, tab: "all", q: "", picked: [] };

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
let toastTimer;
function toast(msg, bad = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (bad ? " bad" : "");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}
const catName = id => (S.cats.find(c => c.id === id) || {}).name || id;
const chipClass = p => "chip" + (p.transition ? " transition" : p.cat === "3d" ? " d3" : "");
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S.picked)); } catch (e) { /* 기억 못 해도 괜찮다 */ } };

// ── 거르기 ──────────────────────────────────────────────────
function matches(p) {
  if (S.tab !== "all" && p.cat !== S.tab) return false;
  if (!S.q) return true;
  const q = S.q.toLowerCase();
  return [p.name, p.desc, p.when, p.id, catName(p.cat)].some(s => String(s).toLowerCase().includes(q));
}
function renderTabs() {
  const tabs = $("#tabs");
  tabs.innerHTML = "";
  const all = [{ id: "all", name: "전체" }, ...S.cats];
  for (const c of all) {
    const n = c.id === "all" ? S.parts.length : S.parts.filter(p => p.cat === c.id).length;
    tabs.append(h("button", { role: "tab", "aria-selected": String(S.tab === c.id), onclick: () => { S.tab = c.id; renderTabs(); renderGrid(); } },
      c.name, h("span", {}, n)));
  }
}

// ── 카드 ────────────────────────────────────────────────────
function card(p) {
  const count = S.picked.filter(id => id === p.id).length;
  const orders = S.picked.map((id, i) => id === p.id ? i + 1 : 0).filter(Boolean);
  const img = h("img", { src: OUT + p.id + ".jpg", alt: "", loading: "lazy" });
  const none = h("div", { class: "none", hidden: true }, "미리보기 준비 중");
  img.onerror = () => { img.remove(); none.hidden = false; };
  const video = h("video", { muted: true, loop: true, playsinline: true, preload: "none" });
  const media = h("div", { class: "media", title: "크게 보기", onclick: () => openModal(p) }, img, video, none,
    h("span", { class: "play" }, "▶ 올려 보기"), count ? h("span", { class: "badge" }, orders.join("·")) : null);
  const el = h("article", { class: "card" + (count ? " is-picked" : ""), "data-id": p.id },
    media,
    h("div", { class: "body" },
      h("div", { class: "name" }, h("h4", {}, p.name), h("span", { class: chipClass(p) }, p.transition ? "전환" : catName(p.cat))),
      h("p", { class: "desc" }, p.desc),
      h("p", { class: "when" }, h("b", {}, "이럴 때"), p.when),
      h("div", { class: "foot" },
        h("span", { class: "len" }, p.transition ? "장면 사이에 들어감" : `약 ${p.dur}초`),
        h("button", { class: "pick", onclick: () => add(p.id) }, count ? (p.transition ? "+ 한 번 더" : "+ 하나 더 담기") : "+ 담기"))));
  // 마우스를 올리면 그때 영상을 불러 재생(처음부터 전부 불러오면 무겁다)
  el.addEventListener("mouseenter", () => {
    if (!video.src) {
      video.src = OUT + p.id + ".mp4";
      video.addEventListener("canplay", () => video.classList.add("ready"), { once: true });
    }
    video.currentTime = 0;
    video.play().catch(() => {});
  });
  el.addEventListener("mouseleave", () => video.pause());
  return el;
}
function renderGrid() {
  const grid = $("#grid");
  grid.innerHTML = "";
  const list = S.parts.filter(matches);
  if (!list.length) { grid.append(h("div", { class: "empty" }, "찾는 효과가 없습니다. 다른 말로 찾아보세요.")); return; }
  const cats = S.tab === "all" ? S.cats : S.cats.filter(c => c.id === S.tab);
  for (const c of cats) {
    const items = list.filter(p => p.cat === c.id);
    if (!items.length) continue;
    grid.append(h("div", { class: "section-title" }, h("h3", {}, c.name), h("p", {}, c.desc)));
    items.forEach(p => grid.append(card(p)));
  }
}

// ── 담기 ────────────────────────────────────────────────────
function add(id) {
  S.picked.push(id);
  save();
  renderTray();
  refreshCard(id);
  const p = S.byId[id];
  toast(p.transition ? `"${p.name}" 전환을 담았어요 — 앞뒤 장면 사이에 들어갑니다` : `"${p.name}"을(를) ${S.picked.length}번째로 담았어요`);
}
function removeAt(i) {
  const [id] = S.picked.splice(i, 1);
  save();
  renderTray();
  refreshCard(id);
  S.picked.forEach(refreshCard);
}
function refreshCard(id) {
  const old = document.querySelector(`.card[data-id="${id}"]`);
  if (old) old.replaceWith(card(S.byId[id]));
}
let dragFrom = null;
function renderTray() {
  const ol = $("#picked");
  ol.innerHTML = "";
  const scenes = S.picked.filter(id => !S.byId[id].transition);
  const secs = scenes.reduce((a, id) => a + S.byId[id].dur, 0);
  $("#trayInfo").innerHTML = S.picked.length
    ? `장면 ${scenes.length}개 · 전환 ${S.picked.length - scenes.length}개 · 약 <em>${Math.round(secs)}초</em> — 끌어서 순서를 바꿀 수 있어요`
    : "아직 없음 — 카드의 <em>담기</em>를 눌러 보세요";
  S.picked.forEach((id, i) => {
    const p = S.byId[id];
    if (i) ol.append(h("span", { class: "arrow" }, "›"));
    const li = h("li", { class: p.transition ? "transition" : "", draggable: "true", title: p.desc },
      h("span", { class: "n" }, i + 1), p.name,
      h("button", { title: "빼기", "aria-label": `${p.name} 빼기`, onclick: () => removeAt(i) }, "×"));
    li.addEventListener("dragstart", () => { dragFrom = i; });
    li.addEventListener("dragover", e => e.preventDefault());
    li.addEventListener("drop", e => {
      e.preventDefault();
      if (dragFrom == null || dragFrom === i) return;
      const [moved] = S.picked.splice(dragFrom, 1);
      S.picked.splice(i, 0, moved);
      dragFrom = null;
      save();
      renderTray();
      new Set(S.picked).forEach(refreshCard);
    });
    ol.append(li);
  });
  $("#makeBtn").disabled = !scenes.length;
  $("#clearBtn").disabled = !S.picked.length;
}

// ── 새 영상 만들기 ──────────────────────────────────────────
async function make() {
  const name = $("#videoName").value.trim() || "새 영상";
  $("#makeBtn").disabled = true;
  $("#makeBtn").textContent = "만드는 중…";
  try {
    const res = await fetch("/api/new-video", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parts: S.picked }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "만들지 못했습니다");
    location.href = "index.html#page=" + encodeURIComponent(data.page);
  } catch (e) {
    toast(e.message, true);
    $("#makeBtn").disabled = false;
    $("#makeBtn").textContent = "새 영상 만들기";
  }
}

// ── 크게 보기 ───────────────────────────────────────────────
let modalId = null;
function openModal(p) {
  modalId = p.id;
  const v = $("#mVideo");
  v.src = OUT + p.id + ".mp4";
  v.poster = OUT + p.id + ".jpg";
  v.play().catch(() => {});
  $("#mName").textContent = p.name;
  $("#mCat").textContent = p.transition ? "전환" : catName(p.cat);
  $("#mCat").className = chipClass(p);
  $("#mDesc").textContent = p.desc;
  $("#mWhen").textContent = p.when;
  $("#mDur").textContent = p.transition ? "앞뒤 장면 사이에 들어갑니다" : `약 ${p.dur}초 · 부품 이름 ${p.id}`;
  $("#modal").hidden = false;
}
// ── 이어서 보기(웹 모드) ────────────────────────────────────
let playlist = null;
function playAll() {
  if (!S.picked.length) return;
  playlist = { i: 0 };
  const v = $("#mVideo");
  v.loop = false;
  const step = () => {
    if (!playlist) return;
    if (playlist.i >= S.picked.length) playlist.i = 0;          // 끝나면 처음부터 다시
    const p = S.byId[S.picked[playlist.i]];
    v.src = OUT + p.id + ".mp4";
    v.poster = OUT + p.id + ".jpg";
    v.play().catch(() => {});
    $("#mName").textContent = `${playlist.i + 1} / ${S.picked.length} · ${p.name}`;
    $("#mCat").textContent = p.transition ? "전환" : catName(p.cat);
    $("#mCat").className = chipClass(p);
    $("#mDesc").textContent = p.desc;
    $("#mWhen").textContent = p.when;
    $("#mDur").textContent = "고른 순서대로 이어서 재생 중";
  };
  v.onended = () => { if (playlist) { playlist.i++; step(); } };
  $("#mPick").hidden = true;
  $("#modal").hidden = false;
  step();
}
function closeModal() {
  playlist = null;
  $("#mPick").hidden = false;
  const v = $("#mVideo");
  v.onended = null;
  v.loop = true;
  v.pause();
  v.removeAttribute("src");
  v.load();
  $("#modal").hidden = true;
}

function staticMode() {
  // 서버가 없으니 영상 만들기 대신 "이어서 보기", 편집기 링크·이름 칸은 뺀다
  document.querySelectorAll('.modes a[href="index.html"]').forEach(a => a.remove());
  $("#videoName").hidden = true;
  $("#makeBtn").textContent = "▶ 이어서 보기";
  const intro = $(".hero p");
  if (intro) intro.innerHTML = "카드 위에 마우스를 올리거나(휴대폰은 눌러서) 움직이는 모습을 보세요. 마음에 드는 효과를 <b>담기</b>로 모은 뒤 " +
    "<b>이어서 보기</b>를 누르면 고른 순서대로 이어서 재생됩니다. 모든 효과는 코드(HTML·three.js)와 Blender로 만든 모션그래픽 부품입니다.";
}

async function main() {
  if (STATIC) staticMode();
  const data = await (await fetch(CATALOG)).json();
  S.cats = data.categories;
  S.parts = data.parts;
  S.byId = Object.fromEntries(S.parts.map(p => [p.id, p]));
  try { S.picked = (JSON.parse(localStorage.getItem(KEY)) || []).filter(id => S.byId[id]); } catch (e) { S.picked = []; }
  renderTabs();
  renderGrid();
  renderTray();
  $("#q").addEventListener("input", e => { S.q = e.target.value.trim(); renderGrid(); });
  $("#makeBtn").addEventListener("click", STATIC ? playAll : make);
  $("#clearBtn").addEventListener("click", () => { const ids = new Set(S.picked); S.picked = []; save(); renderTray(); ids.forEach(refreshCard); });
  $("#mClose").addEventListener("click", closeModal);
  $("#mPick").addEventListener("click", () => { if (modalId) add(modalId); closeModal(); });
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
}
main();
