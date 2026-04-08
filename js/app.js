(() => {
  const ELEM_SUBJECTS = ['英語', '算数', '国語', '理科', '社会'];
  const JHS_SUBJECTS  = ['英語', '数学', '国語', '理科', '地理', '歴史', '公民'];

  let currentFilter = 'all';
  let currentPref = '';
  let currentQuery = '';
  let rawDB = null;
  let records = [];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  function cleanText(value) {
    if (value == null) return '';
    const s = String(value).trim();
    if (!s || s === 'null' || s === 'undefined') return '';
    return s;
  }

  function normalizeLocationText(value) {
    let s = cleanText(value);
    if (!s) return '';
    s = s.replace(/[【】]/g, '');
    s = s.replace(/　/g, ' ');
    s = s.replace(/\s+/g, ' ');
    return s.trim();
  }

  function normalizedChu3(jhs) {
    const current = cleanText(jhs?.['英語']);
    const rawChu3 = cleanText(jhs?.['英語_中3']);
    if (!rawChu3) return '';
    return rawChu3 === current ? '' : rawChu3;
  }

  function normalizeRecord(item, index, fallbackKey = '') {
    if (!item || typeof item !== 'object') return null;

    const municipality =
      cleanText(item.municipality) ||
      cleanText(item.市町村名) ||
      normalizeLocationText(item.location || item.住所始まり || fallbackKey);

    const location =
      cleanText(item.location) ||
      cleanText(item.住所始まり) ||
      cleanText(fallbackKey);

    return {
      id: cleanText(item.id) || `row_${index + 1}`,
      name: cleanText(item.schoolName || item.学校名) || municipality || normalizeLocationText(location) || '名称未設定',
      municipality,
      prefecture: cleanText(item.prefecture || item.都道府県),
      location,
      schoolName: cleanText(item.schoolName || item.学校名),
      schoolType: cleanText(item.schoolType || item.種別),
      elementary: item.elementary || item.小学校 || {},
      junior: item.junior || item.中学校 || {}
    };
  }

  function normalizeDB(raw) {
    if (Array.isArray(raw)) {
      return raw.map((item, index) => normalizeRecord(item, index)).filter(Boolean);
    }

    if (raw && typeof raw === 'object') {
      return Object.entries(raw)
        .map(([key, value], index) => normalizeRecord(value, index, key))
        .filter(Boolean);
    }

    throw new Error('db.json は配列またはオブジェクトである必要があります');
  }

  function buildLegacyDB(records) {
    const obj = {};
    records.forEach((rec) => {
      obj[rec.name] = {
        '都道府県': rec.prefecture,
        '種別': rec.schoolType,
        '所在地': rec.location,
        '小学校': rec.elementary,
        '中学校': rec.junior
      };
    });
    return obj;
  }

  function renderCard(name, v) {
    const kind = v['種別'] || '';
    const pref = v['都道府県'] || '';
    const loc  = v['所在地'] || '';
    const elem = v['小学校'] || null;
    const jhs  = v['中学校'] || null;
    const chu3 = normalizedChu3(jhs);

    const tagHtml = kind === '公立'
      ? '<span class="tag tag-public">公立</span>'
      : '<span class="tag tag-private">国私立</span>';

    let bodyHtml = '';

    if (elem && Object.keys(elem).length) {
      const subs = ELEM_SUBJECTS.map(s => `
        <div class="subject">
          <span class="subject-name">${escapeHtml(s)}</span>
          <span class="subject-pub">${escapeHtml(elem[s] || '-')}</span>
        </div>`).join('');
      bodyHtml += `<div class="school-section">
        <span class="section-label elem">🏫 小学校</span>
        <div class="subjects">${subs}</div>
      </div>`;
    }

    if (jhs && Object.keys(jhs).length) {
      const subs = JHS_SUBJECTS.map(s => {
        const pub = jhs[s] || '-';
        if (s === '英語' && chu3) {
          return `<div class="subject">
            <span class="subject-name">${escapeHtml(s)}</span>
            <span class="subject-pub has-chu3">${escapeHtml(pub)}</span>
            <span class="chu3-note">中3:${escapeHtml(chu3)}</span>
          </div>`;
        }
        return `<div class="subject">
          <span class="subject-name">${escapeHtml(s)}</span>
          <span class="subject-pub">${escapeHtml(pub)}</span>
        </div>`;
      }).join('');
      bodyHtml += `<div class="school-section">
        <span class="section-label jhs">📖 中学校</span>
        <div class="subjects jhs">${subs}</div>
        ${chu3 ? '<p style="font-size:0.68rem;color:#e74c3c;margin-top:4px;">※英語：青=中1・2、赤=中3（旧採択）</p>' : ''}
      </div>`;
    }

    if (loc) {
      bodyHtml += `<p class="location-note">📍 ${escapeHtml(normalizeLocationText(loc))}</p>`;
    }

    return `<div class="card">
      <div class="card-header">
        <span class="card-title">${escapeHtml(name)}</span>
        ${tagHtml}
        <span class="pref-tag">${escapeHtml(pref)}</span>
      </div>
      <div class="card-body">${bodyHtml}</div>
    </div>`;
  }

  function getFilteredEntries() {
    let entries = records.map(rec => [
      rec.name,
      {
        '都道府県': rec.prefecture,
        '種別': rec.schoolType,
        '所在地': rec.location,
        '小学校': rec.elementary,
        '中学校': rec.junior,
        '__record': rec
      }
    ]);

    if (currentPref) {
      entries = entries.filter(([, v]) => v['都道府県'] === currentPref);
    }

    if (currentFilter !== 'all') {
      entries = entries.filter(([, v]) => v['種別'] === currentFilter);
    }

    if (currentQuery.trim()) {
      const q = currentQuery.trim().toLowerCase();
      entries = entries.filter(([name, v]) => {
        const rec = v.__record || {};
        const text = [
          name,
          rec.municipality,
          rec.schoolName,
          v['所在地'],
          v['都道府県'],
          ...Object.entries(v['小学校'] || {}).flat(),
          ...Object.entries(v['中学校'] || {}).flat()
        ].join(' ').toLowerCase();

        return text.includes(q);
      });
    }

    return entries;
  }

  function doSearch() {
    const entries = getFilteredEntries();
    const info = document.getElementById('resultInfo');
    const container = document.getElementById('results');
    const total = records.length;

    info.textContent = `${entries.length}件 表示中（全${total.toLocaleString('ja-JP')}件）`;

    if (entries.length === 0) {
      const label = currentQuery || currentPref || currentFilter;
      container.innerHTML =
        '<div class="no-results"><span>🔍</span>「' +
        escapeHtml(label || '条件') +
        '」の結果が見つかりませんでした</div>';
      return;
    }

    const show = entries.slice(0, 300);
    container.innerHTML = show.map(([name, v]) => renderCard(name, v)).join('');

    if (entries.length > 300) {
      container.innerHTML += `<div class="no-results"><span></span>結果が多いため上位300件を表示。検索を絞り込んでください。</div>`;
    }
  }

  function initDisplay() {
    const info = document.getElementById('resultInfo');
    const total = records.length || 0;
    info.textContent = `都道府県を選択するか、市区町村名・学校名を入力してください（全${total.toLocaleString('ja-JP')}件収録）`;
    document.getElementById('results').innerHTML = '';
  }

  function updateHeaderMeta() {
    const el = document.getElementById('headerMeta');
    if (!el) return;
    el.textContent = `47都道府県 ${records.length.toLocaleString('ja-JP')}件のデータを収録`;
  }

  async function loadDB() {
    const info = document.getElementById('resultInfo');
    info.textContent = 'db.json を読み込み中...';

    const response = await fetch('./data/db.json?v=20260408-4', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`db.json の読み込みに失敗しました (${response.status})`);
    }

    rawDB = await response.json();
    records = normalizeDB(rawDB);

    window.DB = buildLegacyDB(records);

    updateHeaderMeta();
    initDisplay();
  }

  let timer;

  function bindEvents() {
    document.getElementById('searchInput').addEventListener('input', e => {
      currentQuery = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (currentQuery.length >= 1 || currentPref || currentFilter !== 'all') doSearch();
        else initDisplay();
      }, 200);
    });

    document.getElementById('prefSelect').addEventListener('change', e => {
      currentPref = e.target.value;
      if (currentPref || currentQuery || currentFilter !== 'all') doSearch();
      else initDisplay();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        if (currentPref || currentQuery || currentFilter !== 'all') doSearch();
        else initDisplay();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();

    try {
      await loadDB();
    } catch (error) {
      console.error(error);
      const info = document.getElementById('resultInfo');
      if (info) info.textContent = error.message || 'データの読み込みに失敗しました';
      const container = document.getElementById('results');
      if (container) {
        container.innerHTML = '<div class="no-results"><span>⚠️</span>データを表示できませんでした</div>';
      }
    }
  });
})();
