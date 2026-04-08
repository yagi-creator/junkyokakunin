(() => {
  function getStatusEl() {
    return document.getElementById('status');
  }

  function getResultEl() {
    return document.getElementById('result');
  }

  function setStatus(message, isError = false) {
    const el = getStatusEl();
    console.log('[STATUS]', message);

    if (!el) return;

    el.textContent = message;
    el.className = isError ? 'status error' : 'status';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function normalizeDB(data) {
    if (Array.isArray(data)) {
      return data.map((item, index) => ({
        id: item.id || `row_${index + 1}`,
        prefecture: item.prefecture || item.pref || item.都道府県 || '',
        municipality: item.municipality || item.city || item.市町村 || '',
        schoolType: item.schoolType || item.school_type || item.校種 || '公立',
        elementary: item.elementary || item.es || item.小学校 || item.小 || {},
        junior: item.junior || item.js || item.中学校 || item.中 || {},
        original: item
      }));
    }

    if (data && typeof data === 'object') {
      return Object.entries(data).map(([municipalityName, item], index) => ({
        id: item.id || `row_${index + 1}`,
        prefecture: item.prefecture || item.pref || item.都道府県 || '',
        municipality: item.municipality || item.city || item.市町村 || municipalityName || '',
        schoolType: item.schoolType || item.school_type || item.校種 || '公立',
        elementary: item.elementary || item.es || item.小学校 || item.小 || {},
        junior: item.junior || item.js || item.中学校 || item.中 || {},
        original: item
      }));
    }

    return [];
  }

  function render(records) {
    const result = getResultEl();
    if (!result) return;

    if (!records.length) {
      result.innerHTML = '<div class="empty">データは読み込めましたが 0 件です。</div>';
      return;
    }

    const preview = records.slice(0, 20);

    result.innerHTML = `
      <pre>先頭 ${preview.length} 件を表示中 / 全 ${records.length} 件</pre>
      ${preview.map(item => `
        <section class="card">
          <h2>${escapeHtml(item.prefecture)} ${escapeHtml(item.municipality)}</h2>
          <div class="meta">ID: ${escapeHtml(item.id)} / 校種: ${escapeHtml(item.schoolType)}</div>
          <div>小学校: ${Object.keys(item.elementary || {}).length} 教科</div>
          <div>中学校: ${Object.keys(item.junior || {}).length} 教科</div>
        </section>
      `).join('')}
    `;
  }

  async function start() {
    try {
      setStatus('1/4 app.js 起動');

      const response = await fetch('./data/db.json?ts=' + Date.now(), {
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`db.json の読み込みに失敗しました (${response.status})`);
      }

      setStatus('2/4 db.json 取得成功');

      const rawDB = await response.json();
      window.DB = rawDB;

      setStatus('3/4 JSON解析成功');

      const records = normalizeDB(rawDB);
      window.DB_RECORDS = records;

      render(records);

      setStatus(`4/4 表示完了（${records.length}件）`);

      console.log('DB loaded:', rawDB);
      console.log('Normalized records:', records);
    } catch (error) {
      console.error(error);
      setStatus(`エラー: ${error.message}`, true);

      const result = getResultEl();
      if (result) {
        result.innerHTML = `
          <div class="empty">
            読み込みまたは表示でエラーが発生しました。<br>
            コンソールを確認してください。
          </div>
        `;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
