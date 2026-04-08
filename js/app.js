(() => {
  function setStatus(message, isError = false) {
    const el = document.getElementById('status');
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
    const result = document.getElementById('result');
    if (!result) return;

    if (!records.length) {
      result.innerHTML = '<div class="empty">データは読み込めましたが 0 件です。</div>';
      return;
    }

    // 最初は重くしないため20件だけ表示
    const preview = records.slice(0, 20);

    result.innerHTML = preview.map(item => `
      <section class="card">
        <h2>${escapeHtml(item.prefecture)} ${escapeHtml(item.municipality)}</h2>
        <div class="meta">ID: ${escapeHtml(item.id)} / 校種: ${escapeHtml(item.schoolType)}</div>
        <div>小学校教科数: ${Object.keys(item.elementary || {}).length}</div>
        <div>中学校教科数: ${Object.keys(item.junior || {}).length}</div>
      </section>
    `).join('');
  }

  async function start() {
    try {
      setStatus('1/5 app.js を起動しました');

      const url = './data/db.json?ts=' + Date.now();
      setStatus('2/5 db.json を取得しています');

      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) {
        throw new Error(`db.json の読み込みに失敗しました (${response.status})`);
      }

      setStatus('3/5 db.json を受信しました');

      const text = await response.text();
      setStatus(`4/5 受信完了（${text.length}文字）JSON解析中...`);

      const rawDB = JSON.parse(text);
      window.DB = rawDB;

      const records = normalizeDB(rawDB);
      window.DB_RECORDS = records;

      render(records);

      setStatus(`5/5 読み込み完了（${records.length}件）`);
      console.log('rawDB:', rawDB);
      console.log('records:', records);
    } catch (error) {
      console.error(error);
      setStatus(`エラー: ${error.message}`, true);

      const result = document.getElementById('result');
      if (result) {
        result.innerHTML = `
          <div class="empty">
            読み込み中にエラーが発生しました。<br>
            詳細はブラウザのコンソールを確認してください。
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
