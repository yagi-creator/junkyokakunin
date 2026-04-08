(() => {
  let allRecords = [];
  let filteredRecords = [];

  const state = {
    keyword: "",
    prefecture: ""
  };

  document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    await loadDB();
  });

  function bindEvents() {
    const searchInput = document.getElementById("searchInput");
    const prefFilter = document.getElementById("prefFilter");

    searchInput?.addEventListener("input", (e) => {
      state.keyword = e.target.value.trim();
      applyFilters();
    });

    prefFilter?.addEventListener("change", (e) => {
      state.prefecture = e.target.value;
      applyFilters();
    });
  }

  async function loadDB() {
    setStatus("データを読み込み中です...");

    try {
      const response = await fetch("./data/db.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`db.json の読み込みに失敗しました (${response.status})`);
      }

      const raw = await response.json();

      // 既存コード互換用
      window.DB = raw;

      allRecords = normalizeDB(raw);
      filteredRecords = [...allRecords];

      populatePrefFilter(allRecords);
      updateSummary();
      renderCards(filteredRecords);

      setStatus("読み込み完了");
    } catch (error) {
      console.error(error);
      setStatus("データの読み込みに失敗しました", true);
      renderError(error.message);
    }
  }

  function normalizeDB(data) {
    if (Array.isArray(data)) {
      return data.map((item, index) => normalizeRecord(item, index));
    }

    if (data && typeof data === "object") {
      return Object.entries(data).map(([sourceKey, item], index) => {
        return normalizeRecord(
          {
            ...item,
            _sourceKey: sourceKey
          },
          index
        );
      });
    }

    return [];
  }

  function normalizeRecord(item, index) {
    const prefecture = firstMeaningfulDisplayText(
      getByPath(item, "prefecture"),
      getByPath(item, "pref"),
      getByPath(item, "都道府県")
    ) || "";

    const displayName = firstMeaningfulDisplayText(
      getByPath(item, "地区名"),
      getByPath(item, "地域名"),
      getByPath(item, "regionName"),
      getByPath(item, "areaName"),
      getByPath(item, "locationName"),
      getByPath(item, "municipality"),
      getByPath(item, "city"),
      getByPath(item, "市町村"),
      getByPath(item, "name"),
      getByPath(item, "title")
    ) || "名称未設定";

    const municipality = firstMeaningfulDisplayText(
      getByPath(item, "municipality"),
      getByPath(item, "city"),
      getByPath(item, "市町村"),
      getByPath(item, "地区名"),
      getByPath(item, "地域名"),
      getByPath(item, "regionName"),
      getByPath(item, "areaName")
    ) || displayName;

    const regionName = firstMeaningfulDisplayText(
      getByPath(item, "地区名"),
      getByPath(item, "地域名"),
      getByPath(item, "regionName"),
      getByPath(item, "area"),
      getByPath(item, "areaName"),
      getByPath(item, "location"),
      municipality,
      displayName
    ) || "地域名未設定";

    const kindRaw = firstMeaningfulDisplayText(
      getByPath(item, "kind"),
      getByPath(item, "schoolType"),
      getByPath(item, "school_type"),
      getByPath(item, "種別"),
      getByPath(item, "校種")
    ) || "公立";

    const kind = normalizeKind(kindRaw);

    return {
      id: firstNonEmpty(
        getByPath(item, "id"),
        getByPath(item, "code"),
        getByPath(item, "dataId"),
        getByPath(item, "_sourceKey")
      ) || `row_${index + 1}`,

      name: displayName,
      municipality,
      prefecture,
      regionName,
      kind,
      elementary: normalizeSubjects(
        getByPath(item, "elementary") ||
        getByPath(item, "es") ||
        getByPath(item, "小学校") ||
        getByPath(item, "小")
      ),
      junior: normalizeSubjects(
        getByPath(item, "junior") ||
        getByPath(item, "js") ||
        getByPath(item, "中学校") ||
        getByPath(item, "中")
      )
    };
  }

  function normalizeSubjects(value) {
    if (!value || typeof value !== "object") return {};
    return value;
  }

  function normalizeKind(value) {
    const text = normalizeText(value);
    if (!text) return "公立";
    if (text.includes("国私")) return "国私立";
    if (text.includes("私")) return "国私立";
    return "公立";
  }

  function getByPath(obj, key) {
    if (!obj || typeof obj !== "object") return undefined;
    return obj[key];
  }

  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      const text = normalizeText(value);
      if (text) return text;
    }
    return "";
  }

  function firstMeaningfulDisplayText(...values) {
    for (const value of values) {
      const text = normalizeText(value);
      if (!text) continue;
      if (looksLikeMachineId(text)) continue;
      return text;
    }
    return "";
  }

  function looksLikeMachineId(text) {
    const value = String(text).trim();

    if (!value) return true;

    // 数字だけ
    if (/^\d+$/.test(value)) return true;

    // row_12 / data_99 / id-100 みたいな機械的ID
    if (/^(row|data|id|key|item)[\-_]?\d+$/i.test(value)) return true;

    // 数字が大半で区切り記号だけ
    if (/^[\d\-_]+$/.test(value)) return true;

    return false;
  }

  function populatePrefFilter(records) {
    const prefFilter = document.getElementById("prefFilter");
    if (!prefFilter) return;

    const prefectures = [...new Set(records.map(r => r.prefecture).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ja"));

    prefFilter.innerHTML = `
      <option value="">都道府県で絞り込み</option>
      ${prefectures.map(pref => `<option value="${escapeHtml(pref)}">${escapeHtml(pref)}</option>`).join("")}
    `;
  }

  function applyFilters() {
    const keyword = state.keyword.toLowerCase();

    filteredRecords = allRecords.filter((item) => {
      const hitPref = !state.prefecture || item.prefecture === state.prefecture;

      const searchTarget = [
        item.name,
        item.municipality,
        item.regionName,
        item.prefecture,
        item.kind,
        ...Object.keys(item.elementary || {}),
        ...Object.values(item.elementary || {}),
        ...Object.keys(item.junior || {}),
        ...Object.values(item.junior || {})
      ]
        .join(" ")
        .toLowerCase();

      const hitKeyword = !keyword || searchTarget.includes(keyword);

      return hitPref && hitKeyword;
    });

    updateSummary();
    renderCards(filteredRecords);
  }

  function updateSummary() {
    const summaryText = document.getElementById("summaryText");
    const resultCount = document.getElementById("resultCount");

    if (summaryText) {
      summaryText.textContent = `全国 ${allRecords.length.toLocaleString()}件のデータを収録 / 現在 ${filteredRecords.length.toLocaleString()}件表示`;
    }

    if (resultCount) {
      resultCount.textContent = `${filteredRecords.length.toLocaleString()}件 表示中（全${allRecords.length.toLocaleString()}件）`;
    }
  }

  function renderCards(records) {
    const cards = document.getElementById("cards");
    if (!cards) return;

    if (!records.length) {
      cards.innerHTML = `<div class="empty-box">該当するデータがありません。</div>`;
      return;
    }

    cards.innerHTML = records.map(renderCard).join("");
  }

  function renderCard(item) {
    return `
      <article class="adoption-card">
        <div class="card-header">
          <div class="card-title-wrap">
            <h2 class="card-title">${escapeHtml(item.regionName || item.name)}</h2>
          </div>
          <div class="badges">
            <span class="badge badge-kind ${item.kind === "公立" ? "public" : "private"}">${escapeHtml(item.kind)}</span>
            <span class="badge badge-pref">${escapeHtml(item.prefecture)}</span>
          </div>
        </div>

        <div class="card-body">
          ${renderSchoolBlock("🏫", "小学校", item.elementary)}
          ${renderSchoolBlock("📘", "中学校", item.junior)}

          <div class="location-row">
            <span>📍</span>
            <span>${escapeHtml(item.regionName)}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderSchoolBlock(icon, label, subjects) {
    const hasData = subjects && Object.keys(subjects).length > 0;

    return `
      <section class="school-block">
        <div class="school-label">
          <span class="icon">${icon}</span>
          <span>${label}</span>
        </div>
        ${
          hasData
            ? `<div class="subject-grid">${renderSubjectChips(subjects)}</div>`
            : `<div class="empty-box" style="padding:12px 14px; border-radius:14px; box-shadow:none;">データなし</div>`
        }
      </section>
    `;
  }

  function renderSubjectChips(subjects) {
    return Object.entries(subjects).map(([subject, publisher]) => {
      return `
        <div class="subject-chip">
          <span class="subject-name">${escapeHtml(subject)}</span>
          <span class="subject-publisher">${escapeHtml(String(publisher ?? ""))}</span>
        </div>
      `;
    }).join("");
  }

  function renderError(message) {
    const cards = document.getElementById("cards");
    if (!cards) return;
    cards.innerHTML = `<div class="empty-box">${escapeHtml(message)}</div>`;
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById("status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
