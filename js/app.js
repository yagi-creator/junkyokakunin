(function () {
  'use strict';

  var rawDB = null;
  var allRecords = [];
  var filteredRecords = [];

  var state = {
    keyword: '',
    prefecture: '',
    schoolType: 'all'
  };

  var ELEM_ORDER = [
    '国語', '書写', '社会', '地図', '算数', '理科', '生活',
    '音楽', '図工', '家庭', '保健', '英語', '道徳'
  ];

  var JHS_ORDER = [
    '国語', '書写', '社会', '地図', '数学', '理科',
    '音楽', '器楽', '美術', '保体', '保健体育',
    '技術', '家庭', '技家', '英語', '道徳'
  ];

  window.addEventListener('error', function (event) {
    showFatalError('JavaScriptエラー: ' + (event.message || '不明なエラー'));
    console.error(event.error || event.message || event);
  });

  window.addEventListener('unhandledrejection', function (event) {
    var message = event && event.reason && event.reason.message
      ? event.reason.message
      : String(event.reason || '不明なPromiseエラー');
    showFatalError('Promiseエラー: ' + message);
    console.error(event.reason || event);
  });

  bootStatus('app.js を読み込みました');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }

  function startApp() {
    try {
      bootStatus('初期化を開始します');
      bindEvents();
      loadDB();
    } catch (err) {
      showFatalError('初期化に失敗しました: ' + (err && err.message ? err.message : err));
      console.error(err);
    }
  }

  function bindEvents() {
    var searchInput = document.getElementById('searchInput');
    var prefSelect = document.getElementById('prefSelect');
    var filterButtons = document.querySelectorAll('.filter-btn');

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

    for (var i = 0; i < filterButtons.length; i++) {
      filterButtons[i].addEventListener('click', function () {
        var buttons = document.querySelectorAll('.filter-btn');
        for (var j = 0; j < buttons.length; j++) {
          buttons[j].classList.remove('active');
        }
        this.classList.add('active');
        state.schoolType = this.getAttribute('data-filter') || 'all';
        applyFilters();
      });
    }

    bootStatus('イベントを登録しました');
  }

  function loadDB() {
    setResultInfo('データを読み込み中...');
    bootStatus('db.json を取得しています');

    fetch('./data/db.json?v=debug1', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('db.json の読み込みに失敗しました（' + response.status + '）');
        }
        return response.json();
      })
      .then(function (data) {
        rawDB = data;
        window.DB = rawDB;

        bootStatus('db.json の読み込み成功');

        allRecords = normalizeDB(rawDB);
        filteredRecords = allRecords.slice();

        bootStatus('正規化完了: ' + allRecords.length + '件');

        applyFilters();
      })
      .catch(function (error) {
        console.error(error);
        showFatalError('データ読み込みに失敗しました: ' + (error && error.message ? error.message : error));
      });
  }

  function normalizeDB(data) {
    if (Array.isArray(data)) {
      return data.map(function (item, index) {
        return normalizeRecord(item, index, '');
      });
    }

    if (isPlainObject(data)) {
      return Object.keys(data).map(function (sourceKey, index) {
        var item = data[sourceKey];
        if (isPlainObject(item)) {
          return normalizeRecord(item, index, sourceKey);
        }
        return normalizeRecord({ value: item }, index, sourceKey);
      });
    }

    return [];
  }

  function normalizeRecord(item, index, sourceKey) {
    var safeSourceKey = isMeaningfulDisplayText(sourceKey) ? sourceKey : '';

    var prefecture = firstNonEmpty(
      item.prefecture,
      item.pref,
      item.都道府県,
      item.県名
    );

    var schoolTypeRaw = firstNonEmpty(
      item.schoolType,
      item.school_type,
      item.kind,
      item.type,
      item.校種,
      item.種別,
      item.設置区分,
      '公立'
    );

    var schoolType = normalizeSchoolType(schoolTypeRaw);

    var displayName = firstMeaningfulDisplayText(
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

    var municipality = firstMeaningfulDisplayText(
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

    var elementary = normalizeSubjects(
      item.elementary ||
      item.es ||
      item.elem ||
      item.primary ||
      item.小学校 ||
      item.小 ||
      {}
    );

    var junior = normalizeSubjects(
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
      ) || ('row_' + (index + 1)),
      displayName: displayName,
      municipality: municipality,
      prefecture: prefecture,
      schoolType: schoolType,
      elementary: elementary,
      junior: junior
    };
  }

  function normalizeSubjects(value) {
    if (!value) return {};

    if (Array.isArray(value)) {
      var arrayResult = {};
      value.forEach(function (row, index) {
        if (isPlainObject(row)) {
          var subjectName = firstNonEmpty(
            row.subject,
            row.name,
            row.label,
            row.教科,
            row.科目,
            '項目' + (index + 1)
          );
          arrayResult[subjectName] = normalizeSubjectValue(
            row.publisher != null ? row.publisher :
            row.pub != null ? row.pub :
            row.text != null ? row.text :
            row.出版社 != null ? row.出版社 :
            row.value != null ? row.value :
            ''
          );
        }
      });
      return arrayResult;
    }

    if (isPlainObject(value)) {
      var objectResult = {};
      Object.keys(value).forEach(function (subjectName) {
        objectResult[subjectName] = normalizeSubjectValue(value[subjectName]);
      });
      return objectResult;
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
      var publisher = firstNonEmpty(
        value.publisher,
        value.pub,
        value.text,
        value.name,
        value.label,
        value.出版社,
        value.教科書会社,
        value.value
      );

      var note = firstNonEmpty(
        value.note,
        value.memo,
        value.remark,
        value.備考,
        value.注記,
        value.chu3Note,
        value.中3,
        value.中３
      );

      var hasChu3 = !!(
        note ||
        value.hasChu3 ||
        value.chu3 ||
        value.中3 ||
        value.中３
      );

      return {
        publisher: publisher || '',
        note: note || '',
        hasChu3: hasChu3
      };
    }

    return {
      publisher: String(value),
      note: '',
      hasChu3: false
    };
  }

  function splitPublisherAndNote(text) {
    var trimmed = normalizeText(text);
    if (!trimmed) {
      return {
        publisher: '',
        note: '',
        hasChu3: false
      };
    }

    var noteMatch = trimmed.match(/^(.*?)(※.+)$/);
    if (noteMatch) {
      return {
        publisher: normalizeText(noteMatch[1]),
        note: normalizeText(noteMatch[2]),
        hasChu3: true
      };
    }

    var chu3ParenMatch = trimmed.match(/^(.*?)([（(].*(中3|中３|3年|３年).*[)）])$/);
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
    filteredRecords = allRecords.filter(function (item) {
      var prefectureMatched = !state.prefecture || item.prefecture === state.prefecture;
      var schoolTypeMatched = state.schoolType === 'all' || item.schoolType === state.schoolType;
      var keywordMatched = !state.keyword || buildSearchText(item).indexOf(state.keyword) !== -1;
      return prefectureMatched && schoolTypeMatched && keywordMatched;
    });

    updateResultInfo();
    renderResults();
  }

  function buildSearchText(item) {
    var elemText = Object.keys(item.elementary || {}).map(function (subject) {
      var v = normalizeSubjectValue(item.elementary[subject]);
      return subject + ' ' + v.publisher + ' ' + v.note;
    }).join(' ');

    var jhsText = Object.keys(item.junior || {}).map(function (subject) {
      var v = normalizeSubjectValue(item.junior[subject]);
      return subject + ' ' + v.publisher + ' ' + v.note;
    }).join(' ');

    return [
      item.displayName,
      item.municipality,
      item.prefecture,
      item.schoolType,
      elemText,
      jhsText
    ].join(' ').toLowerCase();
  }

  function renderResults() {
    var resultsEl = document.getElementById('results');
    if (!resultsEl) return;

    if (!filteredRecords.length) {
      resultsEl.innerHTML =
        '<div class="no-results">' +
          '<span>🔍</span>' +
          '該当するデータがありません' +
        '</div>';
      return;
    }

    resultsEl.innerHTML = filteredRecords.map(renderCard).join('');
  }

  function renderCard(item) {
    var typeClass = item.schoolType === '公立' ? 'tag-public' : 'tag-private';
    var locationText = buildLocationText(item);

    return (
      '<div class="card">' +
        '<div class="card-header">' +
          '<div class="card-title">' + escapeHtml(item.displayName) + '</div>' +
          '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">' +
            '<span class="tag ' + typeClass + '">' + escapeHtml(item.schoolType) + '</span>' +
            (item.prefecture ? '<span class="pref-tag">' + escapeHtml(item.prefecture) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          renderSchoolSection('小学校', 'elem', item.elementary, false) +
          renderSchoolSection('中学校', 'jhs', item.junior, true) +
          (locationText ? '<div class="location-note">' + escapeHtml(locationText) + '</div>' : '') +
        '</div>' +
      '</div>'
    );
  }

  function renderSchoolSection(label, className, subjects, isJhs) {
    var entries = Object.keys(subjects || {}).map(function (key) {
      return [key, subjects[key]];
    });

    var sortedEntries = sortSubjectEntries(entries, isJhs);

    var bodyHtml = '';
    if (sortedEntries.length) {
      bodyHtml = sortedEntries.map(function (entry) {
        return renderSubject(entry[0], entry[1]);
      }).join('');
    } else {
      bodyHtml =
        '<div class="subject">' +
          '<span class="subject-name">-</span>' +
          '<span class="subject-pub">データなし</span>' +
        '</div>';
    }

    return (
      '<div class="school-section">' +
        '<div class="section-label ' + className + '">' + escapeHtml(label) + '</div>' +
        '<div class="subjects ' + (isJhs ? 'jhs' : '') + '">' +
          bodyHtml +
        '</div>' +
      '</div>'
    );
  }

  function renderSubject(subjectName, value) {
    var normalized = normalizeSubjectValue(value);

    return (
      '<div class="subject">' +
        '<span class="subject-name">' + escapeHtml(subjectName) + '</span>' +
        '<span class="subject-pub ' + (normalized.hasChu3 ? 'has-chu3' : '') + '">' +
          escapeHtml(normalized.publisher || '—') +
        '</span>' +
        (normalized.note ? '<span class="chu3-note">' + escapeHtml(normalized.note) + '</span>' : '') +
      '</div>'
    );
  }

  function sortSubjectEntries(entries, isJhs) {
    var order = isJhs ? JHS_ORDER : ELEM_ORDER;

    return entries.slice().sort(function (a, b) {
      var aIndex = order.indexOf(a[0]);
      var bIndex = order.indexOf(b[0]);

      if (aIndex === -1 && bIndex === -1) {
        return String(a[0]).localeCompare(String(b[0]), 'ja');
      }
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }

  function buildLocationText(item) {
    var parts = [];
    if (item.prefecture) parts.push(item.prefecture);
    if (item.municipality && item.municipality !== item.prefecture) {
      parts.push(item.municipality);
    }
    return parts.join(' / ');
  }

  function updateResultInfo() {
    if (!allRecords.length) {
      setResultInfo('データがありません');
      return;
    }

    setResultInfo('全' + allRecords.length.toLocaleString() + '件中 ' + filteredRecords.length.toLocaleString() + '件を表示');
  }

  function setResultInfo(text) {
    var el = document.getElementById('resultInfo');
    if (el) el.textContent = text;
  }

  function bootStatus(text) {
    var el = document.getElementById('resultInfo');
    if (el) {
      el.textContent = text;
    }
    console.log('[app.js]', text);
  }

  function showFatalError(message) {
    setResultInfo(message);

    var resultsEl = document.getElementById('results');
    if (resultsEl) {
      resultsEl.innerHTML =
        '<div class="no-results">' +
          '<span>⚠️</span>' +
          escapeHtml(message) +
        '</div>';
    }
  }

  function normalizeSchoolType(value) {
    var text = normalizeText(value);
    if (!text) return '公立';

    if (
      text.indexOf('国私') !== -1 ||
      text.indexOf('私立') !== -1 ||
      text.indexOf('国立') !== -1 ||
      text.indexOf('私学') !== -1
    ) {
      return '国私立';
    }

    return '公立';
  }

  function firstNonEmpty() {
    for (var i = 0; i < arguments.length; i++) {
      var text = normalizeText(arguments[i]);
      if (text) return text;
    }
    return '';
  }

  function firstMeaningfulDisplayText() {
    for (var i = 0; i < arguments.length; i++) {
      var text = normalizeText(arguments[i]);
      if (!text) continue;
      if (!isMeaningfulDisplayText(text)) continue;
      return text;
    }
    return '';
  }

  function isMeaningfulDisplayText(text) {
    var v = normalizeText(text);
    if (!v) return false;
    if (looksLikeMachineId(v)) return false;
    return true;
  }

  function looksLikeMachineId(text) {
    var v = normalizeText(text);

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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
