(() => {
  const ELEM_SUBJECTS = ['英語', '算数', '国語', '理科', '社会'];
  const JHS_SUBJECTS  = ['英語', '数学', '国語', '理科', '地理', '歴史', '公民'];

  let DB = [];
  let currentFilter = 'all';
  let currentPref = '';
  let currentQuery = '';
  let timer = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[ch]);
  }

  function normalizedChu3(jhs) {
    const current = String((jhs && jhs['英語']) || '').trim();
    const rawChu3 = String((jhs && jhs['英語_中3']) || '').trim();
    if (!rawChu3) return '';
    return rawChu3 === current ? '' : rawChu3;
  }

  function normalizeDbData(raw) {
    if (Array.isArray(raw)) {
      return raw.map((item, index) => {
        const name =
          item['市町村名'] ||
          item['市区町村名'] ||
          item['municipality'] ||
          item['name'] ||
          `row_${index + 1}`;

        return [
          name,
          {
            '都道府県': item['都道府県'] || item['prefecture'] || '',
            '種別': item['種別'] || item['schoolType'] || item['kind'] || '公立',
            '所在地': item['所在地'] || item['location'] || '',
            '小学校': item['小学校'] || item['elementary'] || null,
            '中学校': item['中学校'] || item['junior'] || null
          }
        ];
      });
    }

    if (raw && typeof raw === 'object') {
      return Object.entries(raw);
    }

    return [];
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

    if (elem) {
      const subs = ELEM_SUBJECTS.map(s => `
        <div class="subject">
          <span class="subject-name">${escapeHtml(s)}</span>
          <span class="subject-pub">${escapeHtml(elem[s] || '-')}</span>
        </div>
      `).join('');

      bodyHtml += `
        <div class="school-section">
          <span class="section-label elem">🏫 小学校</span>
          <div class="subjects">${subs}</div>
        </div>
      `;
    }

    if (jhs) {
      const subs = JHS_SUBJECTS.map(s => {
        const pub = jhs[s] || '-';

        if (s === '英語' && chu3) {
          return `
            <div class="subject">
              <span class="subject-name">${escapeHtml(s)}</span>
              <span class="subject-pub has-chu3">${escapeHtml(pub)}</span>
              <span class="chu3-note">中3:${escapeHtml(chu3)}</span>
            </div>
          `;
        }

        return `
          <div class="subject">
            <span class="subject-name">${escapeHtml(s)}</span>
            <span class="subject-pub">${escapeHtml(pub)}</span>
          </div>
        `;
      }).join('');

      bodyHtml += `
        <div class="school-section">
          <span class="section-label jhs">📖 中学校</span>
          <div class="subjects jhs">${subs}</div>
          ${chu3 ? '<p style="font-size:0.68rem;color:#e74c3c;margin-top:4px;">※英語：青=中1・2、赤=中3（旧採択）</p>' : ''}
        </div>
      `;
    }

    if (loc) {
      bodyHtml += `<p class="location-note">📍 ${escapeHtml(loc)}</p>`;
    }

    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${escapeHtml(name)}</span>
          ${tagHtml}
          <span class="pref-tag">${escapeHtml(pref)}</span>
        </div>
        <div class="card-body">${bodyHtml}</div>
      </div>
    `;
  }

  function buildSearchText(name, v) {
    const parts = [
      name,
      v['都道府県'] || '',
      v['所在地'] || '',
      v['種別'] || ''
    ];

    const elem = v['小学校'] || {};
    const jhs = v['中学校'] || {};

    Object.values(elem).forEach(value => parts.push(String(value || '')));
    Object.values(jhs).forEach(value => parts.push(String(value || '')));

    return parts.join(' ').toLowerCase();
  }

  function stateHasCondition() {
    return currentQuery.trim().length >= 1 || currentPref || currentFilter !== 'all';
  }

  function doSearch() {
    const query = currentQuery.trim().toLowerCase();
    const pref = currentPref;
    const filter = currentFilter;

    let entries = [...DB];

    if (pref) {
      entries = entries.filter(([, v]) => (v['都道府県'] || '') === pref);
    }

    if (filter !== 'all') {
      entries = entries.filter(([, v]) => (v['種別'] || '') === filter);
    }

    if (query) {
      entries = entries.filter(([name, v]) => buildSearchText(name, v).includes(query));
    }

    const info = document.getElementById('resultInfo');
    const container = document.getElementById('results');

    info.textContent = `${entries.length}件 表示中（全${DB.length}件）`;

    if (entries.length === 0) {
      const label = currentQuery || currentPref || currentFilter;
      container.innerHTML =
        `<div class="no-results"><span>🔍</span>「${escapeHtml(label)}」の結果が見つかりませんでした</div>`;
      return;
    }

    const show = entries.slice(0, 300);
    container.innerHTML = show.map(([name, v]) => renderCard(name, v)).join('');

    if (entries.length > 300) {
      container.innerHTML +=
        '<div class="no-results">結果が多いため上位300件を表示しています。検索を絞り込んでください。</div>';
    }
  }

  function initDisplay() {
    const info = document.getElementById('resultInfo');
    const container = document.getElementById('results');

    info.textContent = `都道府県を選択するか、市区町村名・学校名を入力してください（全${DB.length}件収録）`;
    container.innerHTML = '';
  }

  function bindEvents() {
    const searchInput = document.getElementById('searchInput');
    const prefSelect = document.getElementById('prefSelect');
    const buttons = document.querySelectorAll('.filter-btn');

    searchInput.addEventListener('input', e => {
      currentQuery = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (stateHasCondition()) doSearch();
        else initDisplay();
      }, 200);
    });

    prefSelect.addEventListener('change', e => {
      currentPref = e.target.value;
      if (stateHasCondition()) doSearch();
      else initDisplay();
    });

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;

        if (stateHasCondition()) doSearch();
        else initDisplay();
      });
    });
  }

  async function loadDB() {
    const info = document.getElementById('resultInfo');
    const headerMeta = document.getElementById('headerMeta');

    info.textContent = 'データを読み込み中...';

    try {
      const response = await fetch('./data/db.json?ts=' + Date.now(), {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`db.json の読み込みに失敗しました (${response.status})`);
      }

      const raw = await response.json();
      window.DB_RAW = raw;

      DB = normalizeDbData(raw);
      window.DB = DB;

      if (headerMeta) {
        headerMeta.textContent = `47都道府県 ${DB.length}件のデータを収録`;
      }

      initDisplay();
      console.log('DB loaded:', raw);
      console.log('Normalized entries:', DB);
    } catch (error) {
      console.error(error);
      info.textContent = 'データの読み込みに失敗しました';
      document.getElementById('results').innerHTML =
        `<div class="no-results"><span>⚠️</span>${escapeHtml(error.message)}</div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    await loadDB();
  });
})();
