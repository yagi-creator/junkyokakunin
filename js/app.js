(() => {
  let rawDB = null;
  let records = [];

  const state = {
    keyword: '',
    prefecture: ''
  };

  document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    await loadDB();
  });

  function bindEvents() {
    const keywordInput = document.getElementById('keywordInput');
    const prefectureFilter = document.getElementById('prefectureFilter');

    if (keywordInput) {
      keywordInput.addEventListener('input', (e) => {
        state.keyword = e.target.value.trim();
        render();
      });
    }

    if (prefectureFilter) {
      prefectureFilter.addEventListener('change', (e) => {
        state.prefecture = e.target.value;
        render();
      });
    }
  }

  async function loadDB() {
    setStatus('データを読み込み中です...');

    try {
      const response = await fetch('./data/db.json', { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`db.json の読み込みに失敗しました (${response.status})`);
      }

      rawDB = await response.json();

      // 既存コードとの互換用
      window.DB = rawDB;

      // 表示用に配列へ正規化
      records = normalizeDB(rawDB);

      populatePrefectureFilter(records);
      render();

      setStatus(`データを読み込みました（${records.length}件）`);
      console.log('DB loaded:', rawDB);
      console.log('Normalized records:', records);

      // 既存処理を後でつなぎたい場合のフック
      if (typeof window.onDBReady === 'function') {
        window.onDBReady({
          rawDB,
          records
        });
      }
    } catch (error) {
      console.error(error);
      setStatus('データの読み込みに失敗しました。', true);
      showError(error.message);
    }
  }

  function normalizeDB(data) {
    // 1) すでに配列ならそのまま整える
    if (Array.isArray(data)) {
      return data.map((item, index) => normalizeRecord(item, index));
    }

    // 2) オブジェクト形式なら { "市町村名": {...} } を配列化
    if (data && typeof data === 'object') {
      return Object.entries(data).map(([municipalityName, item], index) => {
        return normalizeRecord(
          {
            municipality: municipalityName,
            ...item
          },
          index
        );
      });
    }

    return [];
  }

  function normalizeRecord(item, index) {
    const elementary = item.elementary || item.es || item.小学校 || item.小 || {};
    const junior = item.junior || item.js || item.中学校 || item.中 || {};

    return {
      id: item.id || `row_${index + 1}`,
      prefecture: item.prefecture || item.pref || item.都道府県 || '',
      municipality: item.municipality || item.city || item.市町村 || '',
      schoolType: item.schoolType || item.school_type || item.校種 || item.publicType || '公立',
      elementary,
      junior,
      original: item
    };
  }

  function populatePrefectureFilter(data) {
    const select = document.getElementById('prefectureFilter');
    if (!select) return;

    const prefectures = [...new Set(
      data
        .map(item => item.prefecture)
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'ja'));

    select.innerHTML = `
      <option value="">都道府県を選択</option>
      ${prefectures.map(pref => `<option value="${escapeHtml(pref)}">${escapeHtml(pref)}</option>`).join('')}
    `;
  }

  function render() {
    const result = document.getElementById('result');
    if (!result) return;

    const filtered = records.filter(item => {
      const matchPrefecture = !state.prefecture || item.prefecture === state.prefecture;

      const keyword = state.keyword.toLowerCase();
      const targetText = [
        item.prefecture,
        item.municipality,
        item.schoolType
      ].join(' ').toLowerCase();

      const matchKeyword = !keyword || targetText.includes(keyword);

      return matchPrefecture && matchKeyword;
    });

    if (!filtered.length) {
      result.innerHTML = `<div class="empty">該当データがありません。</div>`;
      return;
    }

    result.innerHTML = filtered.map(item => {
      return `
        <section class="card">
          <h2>${escapeHtml(item.prefecture)} ${escapeHtml(item.municipality)}</h2>
          <div class="meta">
            ID: ${escapeHtml(item.id)} / 校種: ${escapeHtml(item.schoolType)}
          </div>

          <details>
            <summary>小学校</summary>
            ${renderSubjects(item.elementary)}
          </details>

          <details>
            <summary>中学校</summary>
            ${renderSubjects(item.junior)}
          </details>
        </section>
      `;
    }).join('');
  }

  function renderSubjects(subjects) {
    const entries = Object.entries(subjects || {});
    if (!entries.length) {
      return `<div class="empty">データなし</div>`;
    }

    return `
      <div class="subjects">
        ${entries.map(([subject, publisher]) => `
          <div><strong>${escapeHtml(subject)}</strong>: ${escapeHtml(String(publisher ?? ''))}</div>
        `).join('')}
      </div>
    `;
  }

  function showError(message) {
    const result = document.getElementById('result');
    if (!result) return;
    result.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
  }

  function setStatus(message, isError = false) {
    const el = document.getElementById('status');
    if (!el) return;

    el.textContent = message;
    el.classList.toggle('error', isError);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
})();
