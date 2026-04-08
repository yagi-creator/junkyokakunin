(function () {
  'use strict';

  let rawDB = [];
  let allRecords = [];
  let filteredRecords = [];

  const state = {
    keyword: '',
    prefecture: '',
    schoolType: 'all'
  };

  const ELEM_ORDER = [
    '英語', '算数', '国語', '理科', '社会',
    '書写', '地図', '生活', '音楽', '図工', '家庭', '保健', '道徳'
  ];

  const JHS_ORDER = [
    '英語', '数学', '国語', '理科', '地理', '歴史', '公民',
    '書写', '社会', '地図', '音楽', '器楽', '美術',
    '保体', '保健体育', '技術', '家庭', '技家', '道徳'
  ];

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }

  function startApp() {
    bindEvents();
    loadDB();
  }

  function bindEvents() {
    const searchInput = document.getElementById('searchInput');
    const prefSelect = document.getElementById('prefSelect');
    const filterButtons = document.querySelectorAll('.filter-btn');

    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        state.keyword = normalizeText(e.target.value).toLowerCase();
        applyFilters();
      });
    }

    if (prefSelect) {
      prefSelect.addEventListener('change', function (e) {
        state.prefecture = normalizeText(e.target.value);
        applyFilters();
      });
    }

    filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        filterButtons.forEach(function (btn) {
          btn.classList.remove('active');
        });
        button.classList.add('active');
        state.schoolType = button.dataset.filter || 'all';
        applyFilters();
      });
    });
  }

  async function loadDB() {
    setResultInfo('データを読み込み中...');

    try {
      const response = await fetch('./data/db.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('db.json の読み込みに失敗しました（' + response.status + '）');
      }

      rawDB = await response.json();
      window.DB = rawDB;

      allRecords = normalizeDB(rawDB);
      filteredRecords = [];

      applyFilters();
    } catch (error) {
      console.error(error);
      showError('データの読み込みに失敗しました: ' + (error && error.message ? error.message : '不明なエラー'));
    }
  }

  function normalizeDB(data) {
    let records = [];

    if (Array.isArray(data)) {
      records = data.map(function (item, index) {
        return normalizeRecord(item, index, '');
      });
    } else if (isPlainObject(data)) {
      records = Object.keys(data).map(function (key, index) {
        const item = data[key];
        if (isPlainObject(item)) {
          return normalizeRecord(item, index, key);
        }
        return normalizeRecord({}, index, key);
      });
    }

    return records.sort(compareRecords);
  }

  function normalizeRecord(item, index, sourceKey) {
    const prefecture = normalizeText(item.prefecture);
    const location = normalizeText(item.location);
    const schoolName = normalizeText(item.schoolName);
    const schoolType = normalizeSchoolType(item.schoolType);

    const elementaryRaw = isPlainObject(item.elementary) ? item.elementary : {};
    const juniorRaw = isPlainObject(item.junior) ? item.junior : {};

    const displayName = schoolName || location || '名称未設定';

    return {
      id: normalizeText(item.id) || normalizeText(sourceKey) || ('row_' + (index + 1)),
      prefectureCode: toNumber(item.prefectureCode, 9999),
      prefecture: prefecture,
      adoptionAreaCode: toNumber(item.adoptionAreaCode, 9999),
      location: location,
      schoolName: schoolName,
      displayOrder: toNumber(item.displayOrder, 9999),
      schoolType: schoolType,
      elementaryRaw: elementaryRaw,
      juniorRaw: juniorRaw,
      elementary: normalizeSubjects(elementaryRaw),
      junior: normalizeSubjects(juniorRaw),
      displayName: displayName
    };
  }

  function compareRecords(a, b) {
    if (a.prefectureCode !== b.prefectureCode) {
      return a.prefectureCode - b.prefectureCode;
    }
    if (a.adoptionAreaCode !== b.adoptionAreaCode) {
      return a.adoptionAreaCode - b.adoptionAreaCode;
    }

    const aLoc = a.location || '';
    const bLoc = b.location || '';
    if (aLoc !== bLoc) {
      return aLoc.localeCompare(bLoc, 'ja');
    }

    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }

    const aSchool = a.schoolName || '';
    const bSchool = b.schoolName || '';
    return aSchool.localeCompare(bSchool, 'ja');
  }

  function normalizeSubjects(subjects) {
    if (!isPlainObject(subjects)) return {};

    const result = {};

    Object.keys(subjects).forEach(function (subjectName) {
      if (isHiddenSupplementSubjectKey(subjectName)) return;

      const normalizedName = normalizeSubjectName(subjectName);
      if (!normalizedName) return;

      const normalizedValue = normalizeSubjectValue(subjects[subjectName]);

      if (!result[normalizedName]) {
        result[normalizedName] = normalizedValue;
      } else {
        result[normalizedName] = mergeSubjectValue(result[normalizedName], normalizedValue);
      }
    });

    return result;
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
      const publisher = normalizeText(
        value.publisher ||
        value.pub ||
        value.text ||
        value.name ||
        value.label ||
        value.value ||
        ''
      );

      const note = normalizeText(
        value.note ||
        value.memo ||
        value.remark ||
        value.備考 ||
        value.注記 ||
        value.chu3Note ||
        ''
      );

      return {
        publisher: publisher,
        note: note,
        hasChu3: Boolean(note)
      };
    }

    return {
      publisher: normalizeText(value),
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

    const chu3Match = trimmed.match(/^(.*?)([（(].*(中3|中３|3年|３年).*[)）])$/);
    if (chu3Match) {
      return {
        publisher: normalizeText(chu3Match[1]),
        note: normalizeText(chu3Match[2]),
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
    if (!hasActiveSearchCondition()) {
      filteredRecords = [];
      updateResultInfo(true);
      renderResults(true);
      return;
    }

    filteredRecords = allRecords.filter(function (record) {
      return matchPrefecture(record) && matchSchoolType(record) && matchKeyword(record);
    });

    updateResultInfo(false);
    renderResults(false);
  }

  function hasActiveSearchCondition() {
    return Boolean(
      state.keyword ||
      state.prefecture ||
      (state.schoolType && state.schoolType !== 'all')
    );
  }

  function matchPrefecture(record) {
    if (!state.prefecture) return true;
    return record.prefecture === state.prefecture;
  }

  function matchSchoolType(record) {
    if (state.schoolType === 'all') return true;
    return record.schoolType === state.schoolType;
  }

  function matchKeyword(record) {
    if (!state.keyword) return true;
    return buildSearchText(record).includes(state.keyword);
  }

  function buildSearchText(record) {
    const elementaryText = Object.keys(record.elementary).map(function (subject) {
      const val = record.elementary[subject];
      return [subject, val.publisher, val.note].join(' ');
    }).join(' ');

    const juniorText = Object.keys(record.junior).map(function (subject) {
      const val = record.junior[subject];
      return [subject, val.publisher, val.note].join(' ');
    }).join(' ');

    const chu3English = getChu3EnglishPublisher(record);

    return [
      record.prefecture,
      record.location,
      record.schoolName,
      record.displayName,
      record.schoolType,
      elementaryText,
      juniorText,
      chu3English
    ].join(' ').toLowerCase();
  }

  function renderResults(isInitialState) {
    const resultsEl = document.getElementById('results');
    if (!resultsEl) return;

    if (isInitialState) {
      resultsEl.innerHTML = `
        <div class="no-results">
          <span>🔎</span>
          市区町村名・学校名で検索、または都道府県・種別を指定すると表示されます
        </div>
      `;
      return;
    }

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

  function renderCard(record) {
    const typeClass = record.schoolType === '公立' ? 'tag-public' : 'tag-private';
    const chu3English = getChu3EnglishPublisher(record);
    const locationNote = buildLocationNote(record);

    return `
      <div class="card">
        <div class="card-header">
          <div class="card-title">${escapeHtml(record.displayName)}</div>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
            <span class="tag ${typeClass}">${escapeHtml(record.schoolType)}</span>
            ${record.prefecture ? `<span class="pref-tag">${escapeHtml(record.prefecture)}</span>` : ''}
          </div>
        </div>
        <div class="card-body">
          ${renderSchoolSection('🏫 小学校', 'elem', record.elementary, false, '')}
          ${renderSchoolSection('📖 中学校', 'jhs', record.junior, true, chu3English)}
          ${locationNote ? `<p class="location-note">📍 ${escapeHtml(locationNote)}</p>` : ''}
        </div>
      </div>
    `;
  }

  function renderSchoolSection(label, className, subjects, isJhs, chu3English) {
    const entries = Object.keys(subjects).map(function (key) {
      return [key, subjects[key]];
    });

    const sortedEntries = sortSubjectEntries(entries, isJhs);

    const bodyHtml = sortedEntries.length
      ? sortedEntries.map(function (entry) {
          return renderSubject(entry[0], entry[1], isJhs, chu3English);
        }).join('')
      : `
        <div class="subject">
          <span class="subject-name">-</span>
          <span class="subject-pub">データなし</span>
        </div>
      `;

    const footnote = (isJhs && chu3English)
      ? `<p style="font-size:0.68rem;color:#e74c3c;margin-top:4px;">※英語：青=中1・2、赤=中3（旧採択）</p>`
      : '';

    return `
      <div class="school-section">
        <span class="section-label ${className}">${escapeHtml(label)}</span>
        <div class="subjects ${isJhs ? 'jhs' : ''}">
          ${bodyHtml}
        </div>
        ${footnote}
      </div>
    `;
  }

  function renderSubject(subjectName, value, isJhs, chu3English) {
    const data = normalizeSubjectValue(value);
    const normalizedName = normalizeSubjectName(subjectName);
    const displaySubjectName = formatSubjectLabel(normalizedName);

    if (isJhs && normalizedName === '英語' && chu3English) {
      return `
        <div class="subject">
          <span class="subject-name">${escapeHtml(displaySubjectName)}</span>
          <span class="subject-pub has-chu3">${escapeHtml(data.publisher || '—')}</span>
          <span class="chu3-note">中3:${escapeHtml(chu3English)}</span>
        </div>
      `;
    }

    return `
      <div class="subject">
        <span class="subject-name">${escapeHtml(displaySubjectName)}</span>
        <span class="subject-pub ${data.hasChu3 ? 'has-chu3' : ''}">
          ${escapeHtml(data.publisher || '—')}
        </span>
        ${data.note ? `<span class="chu3-note">${escapeHtml(data.note)}</span>` : ''}
      </div>
    `;
  }

  function sortSubjectEntries(entries, isJhs) {
    const order = isJhs ? JHS_ORDER : ELEM_ORDER;

    return entries.slice().sort(function (a, b) {
      const aName = normalizeSubjectName(a[0]);
      const bName = normalizeSubjectName(b[0]);

      const aIndex = order.indexOf(aName);
      const bIndex = order.indexOf(bName);

      if (aIndex === -1 && bIndex === -1) {
        return String(aName).localeCompare(String(bName), 'ja');
      }
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  function getChu3EnglishPublisher(record) {
    const direct = firstNonEmpty(
      record.chu3English,
      record.englishChu3,
      record.juniorChu3English,
      record.middleEnglishChu3
    );
    if (direct) return direct;

    const rawJunior = isPlainObject(record.juniorRaw) ? record.juniorRaw : {};

    const specialKeys = [
      '英語中3',
      '中3英語',
      '英語_中3',
      '英語-中3',
      '英語（中3）',
      '英語(中3)',
      '英語旧採択',
      '英語_旧採択',
      '英語-旧採択',
      '旧採択英語'
    ];

    for (const key of specialKeys) {
      const val = normalizeText(rawJunior[key]);
      if (val) return val;
    }

    const rawEnglishValue = findEnglishSubjectRaw(rawJunior);
    const fromRawEnglish = extractChu3FromValue(rawEnglishValue);
    if (fromRawEnglish) return fromRawEnglish;

    const normalizedEnglish = record.junior && record.junior['英語'] ? record.junior['英語'] : null;
    const fromNormalized = extractChu3FromValue(normalizedEnglish);
    if (fromNormalized) return fromNormalized;

    return '';
  }

  function findEnglishSubjectRaw(subjects) {
    if (!isPlainObject(subjects)) return null;

    const keys = Object.keys(subjects);
    for (const key of keys) {
      if (normalizeSubjectName(key) === '英語') {
        return subjects[key];
      }
    }

    return null;
  }

  function extractChu3FromValue(value) {
    if (value == null) return '';

    if (typeof value === 'string' || typeof value === 'number') {
      return extractChu3FromText(String(value));
    }

    if (isPlainObject(value)) {
      const direct = firstNonEmpty(
        value.chu3Publisher,
        value.middle3Publisher,
        value.oldPublisher,
        value.中3,
        value.中３,
        value['中3出版社'],
        value['中３出版社']
      );
      if (direct) return direct;

      return firstNonEmpty(
        extractChu3FromText(value.note),
        extractChu3FromText(value.memo),
        extractChu3FromText(value.remark),
        extractChu3FromText(value.備考),
        extractChu3FromText(value.注記),
        extractChu3FromText(value.text),
        extractChu3FromText(value.publisher),
        extractChu3FromText(value.value)
      );
    }

    return '';
  }

  function extractChu3FromText(text) {
    const t = normalizeText(text);
    if (!t) return '';

    const match = t.match(/中[3３]\s*[:：]\s*([^\n\r※（）()]+)/);
    if (match) return normalizeText(match[1]);

    const matchParen = t.match(/[（(]\s*中[3３]\s*[:：]\s*([^)）]+)[)）]/);
    if (matchParen) return normalizeText(matchParen[1]);

    return '';
  }

  function buildLocationNote(record) {
    const parts = [];

    if (record.prefecture) parts.push(record.prefecture);
    if (record.location) parts.push(record.location);

    return parts.join(' / ');
  }

  function updateResultInfo(isInitialState) {
    if (!allRecords.length) {
      setResultInfo('データがありません');
      return;
    }

    if (isInitialState) {
      setResultInfo(
        '全' + allRecords.length.toLocaleString() + '件のデータを読み込み済み / 0件表示'
      );
      return;
    }

    setResultInfo(
      '全' + allRecords.length.toLocaleString() + '件中 ' +
      filteredRecords.length.toLocaleString() + '件を表示'
    );
  }

  function setResultInfo(text) {
    const el = document.getElementById('resultInfo');
    if (el) el.textContent = text;
  }

  function showError(message) {
    setResultInfo(message);

    const resultsEl = document.getElementById('results');
    if (resultsEl) {
      resultsEl.innerHTML = `
        <div class="no-results">
          <span>⚠️</span>
          ${escapeHtml(message)}
        </div>
      `;
    }
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

  function normalizeSubjectName(subjectName) {
    const name = normalizeText(subjectName);

    if (!name) return '';

    if (
      name === '英語' ||
      name === '外国語' ||
      name === '外国語科' ||
      name === '外国語活動' ||
      name === '英'
    ) {
      return '英語';
    }

    if (name === '算') return '算数';
    if (name === '数') return '数学';
    if (name === '国') return '国語';
    if (name === '理') return '理科';
    if (name === '社') return '社会';
    if (name === '地') return '地理';
    if (name === '歴') return '歴史';
    if (name === '公') return '公民';
    if (name === '保健') return '保健体育';

    return name;
  }

  function formatSubjectLabel(subjectName) {
    const name = normalizeSubjectName(subjectName);
    if (name === '保健体育') return '保体';
    return name;
  }

  function isHiddenSupplementSubjectKey(subjectName) {
    const name = normalizeText(subjectName);

    return [
      '英語中3',
      '中3英語',
      '英語_中3',
      '英語-中3',
      '英語（中3）',
      '英語(中3)',
      '英語旧採択',
      '英語_旧採択',
      '英語-旧採択',
      '旧採択英語'
    ].includes(name);
  }

  function mergeSubjectValue(baseValue, newValue) {
    return {
      publisher: baseValue.publisher || newValue.publisher || '',
      note: baseValue.note || newValue.note || '',
      hasChu3: Boolean(baseValue.hasChu3 || newValue.hasChu3)
    };
  }

  function firstNonEmpty() {
    for (let i = 0; i < arguments.length; i++) {
      const text = normalizeText(arguments[i]);
      if (text) return text;
    }
    return '';
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
