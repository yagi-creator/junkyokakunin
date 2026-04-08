(() => {
  'use strict';

  let rawDB = null;
  let allRecords = [];
  let filteredRecords = [];

  const state = {
    keyword: '',
    prefecture: '',
    schoolType: 'all'
  };

  const ELEM_ORDER = [
    '国語', '書写', '社会', '地図', '算数', '理科', '生活',
    '音楽', '図工', '家庭', '保健', '英語', '道徳'
  ];

  const JHS_ORDER = [
    '国語', '書写', '社会', '地図', '数学', '理科',
    '音楽', '器楽', '美術', '保体', '保健体育',
    '技術', '家庭', '技家', '英語', '道徳'
  ];

  document.addEventListener('DOMContentLoaded', initApp);

  async function initApp() {
    bindEvents();
    await loadDB();
    applyFilters();
  }

  function bindEvents() {
    const searchInput = document.getElementById('searchInput');
    const prefSelect = document.getElementById('prefSelect');
    const filterButtons = document.querySelectorAll('.filter-btn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.keyword = normalizeText(e.target.value).toLowerCase();
        applyFilters();
      });
    }

    if (prefSelect) {
      prefSelect.addEventListener('change', (e) => {
        state.prefecture = normalizeText(e.target.value);
        applyFilters();
      });
    }

    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.schoolType = btn.dataset.filter || 'all';
        applyFilters();
      });
    });
  }

  async function loadDB() {
    setResultInfo('データを読み込み中...');
    const resultsEl = document.getElementById('results');

    try {
      const response = await fetch('./data/db.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`db.json の読み込みに失敗しました（${response.status}）`);
      }

      rawDB = await response.json();
      window.DB = rawDB;

      allRecords = normalizeDB(rawDB);
      filteredRecords = [...allRecords];

      setResultInfo(`全${allRecords.length.toLocaleString()}件を読み込みました`);
    } catch (error) {
      console.error(error);
      if (resultsEl) {
        resultsEl.innerHTML = `
          <div class="no-results">
            <span>⚠️</span>
            データの読み込みに失敗しました<br>
            <small>${escapeHtml(error.message || '')}</small>
          </div>
        `;
      }
      setResultInfo('データの読み込みに失敗しました');
    }
  }

  function normalizeDB(data) {
    if (Array.isArray(data)) {
      return data.map((item, index) => normalizeRecord(item, index, ''));
    }

    if (isPlainObject(data)) {
      return Object.entries(data).map(([sourceKey, item], index) => {
        if (isPlainObject(item)) {
          return normalizeRecord(item, index, sourceKey);
        }
        return normalizeRecord({ value: item }, index, sourceKey);
      });
    }

    return [];
  }

  function normalizeRecord(item, index, sourceKey) {
    const safeSourceKey = isMeaningfulDisplayText(sourceKey) ? sourceKey : '';

    const prefecture = firstNonEmpty(
      item.prefecture,
      item.pref,
      item.都道府県,
      item.県名
    );

    const schoolTypeRaw = firstNonEmpty(
      item.schoolType,
      item.school_type,
      item.kind,
      item.type,
      item.校種,
      item.種別,
      item.設置区分,
      '公立'
    );
    const schoolType = normalizeSchoolType(schoolTypeRaw);

    const displayName = firstMeaningfulDisplayText(
      item.name,
      item.title,
      item.schoolName,
      item.school,
      item.学校名,
      item.municipality,
      item.city,
      item.市町村,
      item.regionName,
      item.areaName,
      item.locationName,
      item.地区名,
      item.地域名,
      safeSourceKey
    ) || '名称未設定';

    const municipality = firstMeaningfulDisplayText(
      item.municipality,
      item.city,
      item.市町村,
      item.regionName,
      item.areaName,
      item.locationName,
      item.地区名,
      item.地域名,
      safeSourceKey,
      item.name,
      item.title
    ) || displayName;

    const elementary = normalizeSubjects(
      item.elementary ||
      item.es ||
      item.elem ||
      item.primary ||
      item.小学校 ||
      item.小 ||
      {}
    );

    const junior = normalizeSubjects(
      item.junior ||
      item.jhs ||
      item.js ||
      item.middle ||
      item.中学校 ||
      item.中 ||
      {}
    );

    return {
      id: firstNonEmpty(
        item.id,
        item.code,
        item.dataId,
        item.no,
        item._id,
        sourceKey
      ) || `row_${index + 1}`,
      displayName,
      municipality,
      prefecture,
      schoolType,
      elementary,
      junior
    };
  }

  function normalizeSubjects(value) {
    if (!value) return {};

    if (Array.isArray(value)) {
      const result = {};
      value.forEach((row, index) => {
        if (isPlainObject(row)) {
          const subjectName = firstNonEmpty(
            row.subject,
            row.name,
            row.label,
            row.教科,
            row.科目,
            `項目${index + 1}`
          );
          result[subjectName] = normalizeSubjectValue(
            row.publisher ??
            row.pub ??
            row.text ??
            row.出版社 ??
            row.value ??
            ''
          );
        }
      });
      return result;
    }

    if (isPlainObject(value)) {
      const result = {};
      Object.entries(value).forEach(([subjectName, subjectValue]) => {
        result[subjectName] = normalizeSubjectValue(subjectValue);
      });
      return result;
    }

    return {};
  }

  function normalizeSubjectValue(value) {
    if (value == null) {
      return {
        publisher: '',
        note: '',
        hasChu3: false
      };
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return splitPublisherAndNote(String(value));
    }

    if (isPlainObject(value)) {
      const publisher = firstNonEmpty(
        value.publisher,
        value.pub,
        value.text,
        value.name,
        value.label,
        value.出版社,
        value.教科書会社,
        value.value
      );

      const note = firstNonEmpty(
        value.note,
        value.memo,
        value.remark,
        value.備考,
        value.注記,
        value.chu3Note,
        value.中3,
        value.中３
      );

      const hasChu3 = Boolean(
        note ||
        value.hasChu3 ||
        value.chu3 ||
        value.中3 ||
        value.中３
      );

      return {
        publisher: publisher || '',
        note: note || '',
        hasChu3
      };
    }

    return {
      publisher: String(value),
      note: '',
      hasChu3: false
    };
  }

  function splitPublisherAndNote(text) {
    const trimmed = normalizeText(text);
    if (!trimmed) {
      return {
        publisher: '',
        note: '',
        hasChu3: false
      };
    }

    const noteMatch = trimmed.match(/^(.*?)(※.+)$/);
    if (noteMatch) {
      return {
        publisher: normalizeText(noteMatch[1]),
        note: normalizeText(noteMatch[2]),
        hasChu3: true
      };
    }

    const chu3ParenMatch = trimmed.match(/^(.*?)([（(].*(中3|中３|3年|３年).*[)）])$/);
    if (chu3ParenMatch) {
      return {
        publisher: normalizeText(chu3ParenMatch[1]),
        note: normalizeText(chu3ParenMatch[2]),
        hasChu3: true
      };
    }

    return {
      publisher: trimmed,
      note: '',
      hasChu3: false
    };
  }

  function applyFilters() {
    filteredRecords = allRecords.filter((item) => {
      const prefectureMatched =
        !state.prefecture || item.prefecture === state.prefecture;

      const schoolTypeMatched =
        state.schoolType === 'all' || item.schoolType === state.schoolType;

      const keywordMatched =
        !state.keyword || buildSearchText(item).includes(state.keyword);

      return prefectureMatched && schoolTypeMatched && keywordMatched;
    });

    updateResultInfo();
    renderResults();
  }

  function buildSearchText(item) {
    const elemText = Object.entries(item.elementary || {})
      .map(([subject, val]) => {
        const v = normalizeSubjectValue(val);
        return `${subject} ${v.publisher} ${v.note}`;
      })
      .join(' ');

    const jhsText = Object.entries(item.junior || {})
      .map(([subject, val]) => {
        const v = normalizeSubjectValue(val);
        return `${subject} ${v.publisher} ${v.note}`;
      })
      .join(' ');

    return [
      item.displayName,
      item.municipality,
      item.prefecture,
      item.schoolType,
      elemText,
      jhsText
    ]
      .join(' ')
      .toLowerCase();
  }

  function renderResults() {
    const resultsEl = document.getElementById('results');
    if (!resultsEl) return;

    if (!filteredRecords.length) {
      resultsEl.innerHTML = `
        <div class="no-results">
          <span>🔍</span>
          該当するデータがありません
        </div>
      `;
      return;
    }

    resultsEl.innerHTML = filteredRecords.map(renderCard).join('');
  }

  function renderCard(item) {
    const typeClass = item.schoolType === '公立' ? 'tag-public' : 'tag-private';
    const locationText = buildLocationText(item);

    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">${escapeHtml(item.displayName)}</div>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
            <span class="tag ${typeClass}">${escapeHtml(item.schoolType)}</span>
            ${item.prefecture ? `<span class="pref-tag">${escapeHtml(item.prefecture)}</span>` : ''}
          </div>
        </div>
        <div class="card-body">
          ${renderSchoolSection('小学校', 'elem', item.elementary, false)}
          ${renderSchoolSection('中学校', 'jhs', item.junior, true)}
          ${locationText ? `<div class="location-note">${escapeHtml(locationText)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function renderSchoolSection(label, className, subjects, isJhs) {
    const entries = Object.entries(subjects || {});
    const sortedEntries = sortSubjectEntries(entries, isJhs);

    return `
      <div class="school-section">
        <div class="section-label ${className}">${escapeHtml(label)}</div>
        <div class="subjects ${isJhs ? 'jhs' : ''}">
          ${
            sortedEntries.length
              ? sortedEntries.map(([subject, value]) => renderSubject(subject, value)).join('')
              : `
                <div class="subject">
                  <span class="subject-name">-</span>
                  <span class="subject-pub">データなし</span>
                </div>
              `
          }
        </div>
      </div>
    `;
  }

  function renderSubject(subjectName, value) {
    const normalized = normalizeSubjectValue(value);

    return `
      <div class="subject">
        <span class="subject-name">${escapeHtml(subjectName)}</span>
        <span class="subject-pub ${normalized.hasChu3 ? 'has-chu3' : ''}">
          ${escapeHtml(normalized.publisher || '—')}
        </span>
        ${normalized.note ? `<span class="chu3-note">${escapeHtml(normalized.note)}</span>` : ''}
      </div>
    `;
  }

  function sortSubjectEntries(entries, isJhs) {
    const order = isJhs ? JHS_ORDER : ELEM_ORDER;

    return [...entries].sort((a, b) => {
      const aIndex = order.indexOf(a[0]);
      const bIndex = order.indexOf(b[0]);

      if (aIndex === -1 && bIndex === -1) {
        return a[0].localeCompare(b[0], 'ja');
      }
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  function buildLocationText(item) {
    const parts = [];

    if (item.prefecture) parts.push(item.prefecture);
    if (item.municipality && item.municipality !== item.prefecture) {
      parts.push(item.municipality);
    }

    const joined = parts.join(' / ');
    return joined || '';
  }

  function updateResultInfo() {
    if (!allRecords.length) {
      setResultInfo('データがありません');
      return;
    }

    setResultInfo(
      `全${allRecords.length.toLocaleString()}件中 ${filteredRecords.length.toLocaleString()}件を表示`
    );
  }

  function setResultInfo(text) {
    const el = document.getElementById('resultInfo');
    if (el) el.textContent = text;
  }

  function normalizeSchoolType(value) {
    const text = normalizeText(value);
    if (!text) return '公立';

    if (
      text.includes('国私') ||
      text.includes('私立') ||
      text.includes('国立') ||
      text.includes('私学')
    ) {
      return '国私立';
    }

    return '公立';
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      const text = normalizeText(value);
      if (text) return text;
    }
    return '';
  }

  function firstMeaningfulDisplayText(...values) {
    for (const value of values) {
      const text = normalizeText(value);
      if (!text) continue;
      if (!isMeaningfulDisplayText(text)) continue;
      return text;
    }
    return '';
  }

  function isMeaningfulDisplayText(text) {
    const v = normalizeText(text);
    if (!v) return false;
    if (looksLikeMachineId(v)) return false;
    return true;
  }

  function looksLikeMachineId(text) {
    const v = normalizeText(text);

    if (!v) return true;
    if (/^\d+$/.test(v)) return true;
    if (/^(row|data|id|key|item)[\-_]?\d+$/i.test(v)) return true;
    if (/^[\d\-_]+$/.test(v)) return true;

    return false;
  }

  function normalizeText(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
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
