(() => {
  const APP_VERSION = '20260408-2';
  const state = {
    rawDB: [],
    records: [],
    filtered: [],
  };

  const ELEM_ORDER = ['国語', '社会', '算数', '理科', '英語'];
  const JHS_ORDER = ['国語', '地理', '歴史', '公民', '数学', '理科', '英語'];

  function $(...ids) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanText(value) {
    if (value == null) return '';
    const s = String(value).trim();
    if (!s || s === 'null' || s === 'undefined') return '';
    return s;
  }

  function setStatus(message, isError = false) {
    const el = $('status', 'resultInfo');
    if (!el) return;
    el.textContent = `[app.js ${APP_VERSION}] ${message}`;
    el.classList.toggle('error', !!isError);
  }

  function normalizeLocationText(value) {
    let s = cleanText(value);
    if (!s) return '';
    s = s.replace(/[【】]/g, '');
    s = s.replace(/　/g, ' ');
    s = s.replace(/\s+/g, ' ');
    return s.trim();
  }

  function deriveMunicipality(item) {
    const explicit = cleanText(item.municipality || item.市町村名 || item.自治体名);
    if (explicit) return explicit;

    const rawLocation = cleanText(
      item.location ||
      item.住所始まり ||
      item.採択地区名 ||
      item.採択地区
    );

    return normalizeLocationText(rawLocation);
  }

  function normalizeRecord(item, index) {
    if (!item || typeof item !== 'object') return null;

    const municipality = deriveMunicipality(item);
    const location = cleanText(
      item.location ||
      item.住所始まり ||
      item.採択地区名 ||
      item.採択地区
    );

    return {
      id: cleanText(item.id) || `row_${index + 1}`,
      prefectureCode: item.prefectureCode ?? item.都道府県コード ?? null,
      prefecture: cleanText(item.prefecture || item.都道府県),
      adoptionAreaCode: item.adoptionAreaCode ?? item.採択地区コード ?? item.採択地区 ?? null,
      municipality,
      location,
      schoolName: cleanText(item.schoolName || item.学校名),
      schoolType: cleanText(item.schoolType || item.種別),
      displayOrder: item.displayOrder ?? item.表示順 ?? null,
      elementary: item.elementary || item.小学校 || {},
      junior: item.junior || item.中学校 || {},
    };
  }

  function normalizeDB(raw) {
    if (Array.isArray(raw)) {
      return raw.map(normalizeRecord).filter(Boolean);
    }

    if (raw && typeof raw === 'object') {
      return Object.entries(raw).map(([key, value], index) => {
        const rec = normalizeRecord(value, index);
        if (!rec) return null;
        if (!rec.municipality) rec.municipality = cleanText(key);
        if (!rec.location) rec.location = cleanText(key);
        return rec;
      }).filter(Boolean);
    }

    throw new Error('db.json は配列またはオブジェクトである必要があります');
  }

  function getDisplayTitle(rec) {
    if (rec.schoolName) return rec.schoolName;
    if (rec.municipality) return rec.municipality;
    if (rec.location) return normalizeLocationText(rec.location);
    return '名称未設定';
  }

  function getMunicipalityLabel(rec) {
    return rec.municipality || normalizeLocationText(rec.location) || '名称未設定';
  }

  function getLocationLabel(rec) {
    return normalizeLocationText(rec.location) || rec.municipality || '';
  }

  function subjectText(subjects, order, isJunior = false) {
    const lines = [];

    for (const key of order) {
      const value = subjects?.[key];
      if (!value) continue;

      if (
        isJunior &&
        key === '英語' &&
        subjects['英語_中3'] &&
        subjects['英語_中3'] !== value
      ) {
        lines.push(
          `<li><span class="label">${escapeHtml(key)}</span><span class="value">${escapeHtml(value)} <span class="note">（中3: ${escapeHtml(subjects['英語_中3'])}）</span></span></li>`
        );
      } else {
        lines.push(
          `<li><span class="label">${escapeHtml(key)}</span><span class="value">${escapeHtml(value)}</span></li>`
        );
      }
    }

    return lines.length
      ? `<ul class="subject-list">${lines.join('')}</ul>`
      : '<p class="empty">データなし</p>';
  }

  function cardMeta(rec) {
    const chips = [];
    if (rec.prefecture) chips.push(`<span class="chip">${escapeHtml(rec.prefecture)}</span>`);
    if (rec.schoolName) chips.push(`<span class="chip">${escapeHtml(getMunicipalityLabel(rec))}</span>`);
    if (rec.schoolType) chips.push(`<span class="chip">${escapeHtml(rec.schoolType)}</span>`);
    if (rec.schoolName) chips.push('<span class="chip">学校別</span>');
    return chips.join('');
  }

  function render(records) {
    const el = $('results', 'result');
    if (!el) return;

    if (!records.length) {
      el.innerHTML = '<div class="empty">該当するデータがありません。</div>';
      updateCount(0);
      return;
    }

    el.innerHTML = records.map((rec) => {
      const title = getDisplayTitle(rec);
      const municipalityLabel = getMunicipalityLabel(rec);
      const locationLabel = getLocationLabel(rec);

      return `
        <article class="card">
          <div class="card-head">
            <h2 class="card-title">${escapeHtml(title)}</h2>
            <div class="meta">${cardMeta(rec)}</div>
          </div>
          ${rec.schoolName && locationLabel ? `<div class="submeta">所在地: ${escapeHtml(locationLabel)}</div>` : ''}
          ${!rec.schoolName && municipalityLabel ? `<div class="submeta">地区名: ${escapeHtml(municipalityLabel)}</div>` : ''}
          <div class="columns">
            <section class="subject-box">
              <h3>小学校</h3>
              ${subjectText(rec.elementary, ELEM_ORDER, false)}
            </section>
            <section class="subject-box">
              <h3>中学校</h3>
              ${subjectText(rec.junior, JHS_ORDER, true)}
            </section>
          </div>
        </article>
      `;
    }).join('');

    updateCount(records.length);
  }

  function updateCount(count) {
    const countEl = $('count');
    if (countEl) {
      countEl.textContent = `${count.toLocaleString('ja-JP')}件表示`;
    }

    const metaEl = $('headerMeta');
    if (metaEl) {
      metaEl.textContent = `全国 ${state.records.length.toLocaleString('ja-JP')}件のデータを収録 / 現在 ${count.toLocaleString('ja-JP')}件表示`;
    }
  }

  function buildSearchText(rec) {
    return [
      rec.prefecture,
      rec.municipality,
      rec.location,
      rec.schoolName,
      rec.schoolType,
      ...Object.entries(rec.elementary || {}).flat(),
      ...Object.entries(rec.junior || {}).flat(),
    ].join(' ');
  }

  function applyFilters() {
    const keyword = cleanText($('keyword', 'searchInput')?.value).toLowerCase();
    const prefecture = cleanText($('prefecture', 'prefectureFilter')?.value);

    state.filtered = state.records.filter((rec) => {
      if (prefecture && rec.prefecture !== prefecture) return false;
      if (keyword) {
        const hay = buildSearchText(rec).toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });

    render(state.filtered);
    setStatus(`読み込み完了：${state.records.length.toLocaleString('ja-JP')}件 / 表示中：${state.filtered.length.toLocaleString('ja-JP')}件`);
  }

  function populatePrefectures(records) {
    const select = $('prefecture', 'prefectureFilter');
    if (!select) return;

    const current = select.value;
    const prefs = [...new Set(records.map(r => r.prefecture).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ja'));

    select.innerHTML =
      '<option value="">すべての都道府県</option>' +
      prefs.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');

    select.value = current;
  }

  function bindEvents() {
    $('keyword', 'searchInput')?.addEventListener('input', applyFilters);
    $('prefecture', 'prefectureFilter')?.addEventListener('change', applyFilters);
  }

  async function loadDB() {
    setStatus('db.json を読み込み中...');
    const url = new URL('./data/db.json?v=20260408-2', window.location.href);
    const response = await fetch(url.href, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`db.json の読み込みに失敗しました (${response.status})`);
    }

    const raw = await response.json();
    state.rawDB = raw;
    state.records = normalizeDB(raw);
    populatePrefectures(state.records);
    applyFilters();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    try {
      await loadDB();
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'データの読み込みに失敗しました', true);
      const el = $('results', 'result');
      if (el) {
        el.innerHTML = '<div class="empty">データを表示できませんでした。</div>';
      }
    }
  });
})();
