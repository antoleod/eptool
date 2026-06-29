/*
Usage guide
1. Open an authorized EP Directory page in your browser.
2. Open DevTools once, paste this entire file, and press Enter.
3. A floating "Oryxen Web Console" panel will appear on the right side.
4. Paste one username or item per line, choose fields, set wait time, and click Run.
5. Use Export CSV or Copy JSON when the run finishes.
*/

(() => {
  "use strict";

  // Core constants and persisted keys used by the standalone panel.
  const PANEL_ID = "oryxen-web-console-panel";
  const STYLE_ID = "oryxen-web-console-style";
  const STORAGE_RESULTS_KEY = "oryxen_web_console_results";
  const STORAGE_CONFIG_KEY = "oryxen_web_console_config";
  const DEFAULT_FIELDS = ["Username", "Name", "Position", "Unit"];
  const FIELD_OPTIONS = [
    "Username",
    "Name",
    "Position",
    "Unit",
    "Office",
    "Phone",
    "Email",
    "Department",
    "Location",
  ];
  const RESULT_SELECTORS = [
    ".person-card",
    ".search-result",
    ".best-results",
    ".result",
  ];

  const state = {
    running: false,
    stopRequested: false,
    results: loadJson(STORAGE_RESULTS_KEY, []),
    config: {
      waitTime: 2500,
      customSelector: "",
      selectedFields: DEFAULT_FIELDS.slice(),
      itemsText: "",
      minimized: false,
      width: 460,
      height: 640,
      ...loadJson(STORAGE_CONFIG_KEY, {}),
    },
    elements: {},
  };

  // Local storage helpers keep config and results between runs.
  function loadJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveConfig() {
    try {
      window.localStorage.setItem(
        STORAGE_CONFIG_KEY,
        JSON.stringify({
          ...state.config,
          width: state.elements.panel ? state.elements.panel.offsetWidth : state.config.width,
          height: state.elements.panel ? state.elements.panel.offsetHeight : state.config.height,
        })
      );
    } catch (error) {
      log("warning", `Could not save config: ${error.message}`);
    }
  }

  function saveResults() {
    try {
      window.localStorage.setItem(STORAGE_RESULTS_KEY, JSON.stringify(state.results));
    } catch (error) {
      log("warning", `Could not save results: ${error.message}`);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function timestamp() {
    return new Date().toLocaleTimeString("en-GB", { hour12: false });
  }

  function log(type, message) {
    const logs = state.elements.logs;
    const line = document.createElement("div");
    line.className = `oryxen-log oryxen-log-${type}`;
    line.textContent = `[${timestamp()}] ${message}`;

    if (logs) {
      logs.appendChild(line);
      logs.scrollTop = logs.scrollHeight;
    }

    const consoleMethod =
      type === "error" ? "error" : type === "warning" ? "warn" : "log";
    console[consoleMethod](`[Oryxen Web Console] ${message}`);
  }

  // UI state readers keep extraction settings aligned with the panel.
  function getSelectedFields() {
    const checkboxes = Array.from(
      state.elements.fields?.querySelectorAll('input[type="checkbox"]') || []
    );
    const selected = checkboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);
    return selected.length ? selected : DEFAULT_FIELDS.slice();
  }

  function applySelectedFields(result) {
    const selectedFields = getSelectedFields();
    const filtered = {};

    selectedFields.forEach((field) => {
      filtered[field] = result[field] ?? "";
    });

    filtered.Status = result.Status ?? "OK";
    return filtered;
  }

  function parseItems() {
    const raw = state.elements.itemsInput?.value || "";
    return raw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function updateConfigFromUi() {
    const waitTime = Number.parseInt(state.elements.waitInput?.value || "2500", 10);
    state.config.waitTime = Number.isFinite(waitTime) && waitTime >= 0 ? waitTime : 2500;
    state.config.customSelector = (state.elements.selectorInput?.value || "").trim();
    state.config.itemsText = state.elements.itemsInput?.value || "";
    state.config.selectedFields = getSelectedFields();
    state.config.minimized = state.elements.panel?.classList.contains("oryxen-minimized") || false;
    saveConfig();
  }

  function updateProgress(current, total) {
    if (state.elements.progress) {
      state.elements.progress.textContent = total ? `Progress ${current}/${total}` : "Idle";
    }
  }

  function renderResultsTable() {
    const container = state.elements.results;
    if (!container) return;

    const selectedFields = getSelectedFields();
    const columns = [...selectedFields, "Status"];
    container.innerHTML = "";

    if (!state.results.length) {
      const empty = document.createElement("div");
      empty.className = "oryxen-empty";
      empty.textContent = "No results yet.";
      container.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.className = "oryxen-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((column) => {
      const th = document.createElement("th");
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    state.results.forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((column) => {
        const td = document.createElement("td");
        td.textContent = row[column] ?? "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.appendChild(table);
  }

  // Export helpers keep all output local to the current browser session.
  function toCsv(rows) {
    if (!rows.length) return "";

    const columns = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set())
    );

    const escapeCell = (value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const lines = [
      columns.join(","),
      ...rows.map((row) => columns.map((column) => escapeCell(row[column])).join(",")),
    ];

    return lines.join("\n");
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text) {
    if (typeof window.copy === "function") {
      window.copy(text);
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    throw new Error("Clipboard copy is not available on this page.");
  }

  // DOM extraction helpers only read visible content already available on the page.
  function extractTextByLabel(scope, labels) {
    const text = scope.innerText || "";
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      for (const label of labels) {
        const regex = new RegExp(`^${label}\\s*:?\\s*(.+)$`, "i");
        const match = line.match(regex);
        if (match) {
          return match[1].trim();
        }
      }
    }

    return "";
  }

  function extractEmail(scope) {
    const href = scope.querySelector('a[href^="mailto:"]')?.getAttribute("href");
    if (href) return href.replace(/^mailto:/i, "").trim();

    const match = (scope.innerText || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0] : "";
  }

  function extractPhone(scope) {
    const href = scope.querySelector('a[href^="tel:"]')?.getAttribute("href");
    if (href) return href.replace(/^tel:/i, "").trim();

    const match = (scope.innerText || "").match(/(\+?\d[\d\s().-]{5,}\d)/);
    return match ? match[1].trim() : "";
  }

  function findResultCard(customSelector) {
    if (customSelector) {
      const customResult = document.querySelector(customSelector);
      if (customResult) return customResult;
    }

    for (const selector of RESULT_SELECTORS) {
      const node = document.querySelector(selector);
      if (node) return node;
    }

    return null;
  }

  function getVisibleResultData(resultCard, username) {
    const text = resultCard?.innerText || document.body.innerText || "";
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const nameCandidate =
      resultCard?.querySelector("h1, h2, h3, .name, .person-name, strong")?.textContent?.trim() ||
      lines[0] ||
      "";
    const positionCandidate =
      resultCard?.querySelector("span.job, .job, .position, .title")?.textContent?.trim() ||
      lines[1] ||
      "";
    const unitCandidate =
      extractTextByLabel(resultCard || document.body, ["Unit", "Service", "Team"]) ||
      lines[2] ||
      "";

    return {
      Username: username,
      Name: nameCandidate,
      Position: positionCandidate,
      Unit: unitCandidate,
      Office: extractTextByLabel(resultCard || document.body, ["Office"]),
      Phone: extractPhone(resultCard || document.body),
      Email: extractEmail(resultCard || document.body),
      Department: extractTextByLabel(resultCard || document.body, ["Department", "Directorate"]),
      Location: extractTextByLabel(resultCard || document.body, ["Location", "Address", "City"]),
      Status: "OK",
    };
  }

  // EP Directory adapter drives the visible search UI and returns selected data.
  async function runEpDirectoryAdapter(username) {
    const searchInput = document.querySelector("#search-epdirresults");
    if (!searchInput) {
      throw new Error('Required search input "#search-epdirresults" was not found.');
    }

    searchInput.focus();
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.value = username;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.dispatchEvent(new Event("change", { bubbles: true }));

    if (typeof window.search_suggest_timeout === "function") {
      window.search_suggest_timeout("search-epdirresults", "sr_suggestions");
    } else {
      log("warning", "search_suggest_timeout is not available. Continuing without it.");
    }

    await sleep(state.config.waitTime);

    const resultCard = findResultCard(state.config.customSelector);
    if (!resultCard) {
      throw new Error("No visible result card was found after waiting.");
    }

    return getVisibleResultData(resultCard, username);
  }

  async function processItem(item, index, total) {
    log("info", `Searching ${index + 1}/${total}: ${item}`);

    try {
      const rawResult = await runEpDirectoryAdapter(item);
      const filteredResult = applySelectedFields(rawResult);
      state.results.push(filteredResult);
      saveResults();
      renderResultsTable();
      log("success", `Found: ${filteredResult.Name || filteredResult.Username || item}`);
    } catch (error) {
      const failedResult = applySelectedFields({
        Username: item,
        Status: `ERROR: ${error.message}`,
      });
      state.results.push(failedResult);
      saveResults();
      renderResultsTable();
      log("error", `Failed ${item}: ${error.message}`);
    }
  }

  async function run() {
    if (state.running) {
      log("warning", "A run is already in progress.");
      return state.results;
    }

    const searchInput = document.querySelector("#search-epdirresults");
    if (!searchInput) {
      log("error", 'Required search input "#search-epdirresults" was not found.');
      return state.results;
    }

    updateConfigFromUi();
    const items = parseItems();
    const selectedFields = getSelectedFields();

    if (!items.length) {
      log("warning", "No items provided.");
      return state.results;
    }

    if (!selectedFields.length) {
      state.config.selectedFields = DEFAULT_FIELDS.slice();
    }

    state.running = true;
    state.stopRequested = false;
    state.results = [];
    saveResults();
    renderResultsTable();
    updateProgress(0, items.length);
    setRunningUi(true);
    log("info", `Run started with ${items.length} item(s).`);

    for (let index = 0; index < items.length; index += 1) {
      if (state.stopRequested) {
        log("warning", `Run stopped at ${index}/${items.length}.`);
        break;
      }

      updateProgress(index + 1, items.length);
      await processItem(items[index], index, items.length);
    }

    state.running = false;
    state.stopRequested = false;
    setRunningUi(false);
    updateProgress(state.results.length, items.length);
    log("success", "Export ready.");
    return state.results;
  }

  function stop() {
    if (!state.running) {
      log("warning", "Nothing is running.");
      return;
    }

    state.stopRequested = true;
    log("warning", "Stop requested. Waiting for the current item to finish.");
  }

  function clearLogs() {
    if (state.elements.logs) {
      state.elements.logs.innerHTML = "";
    }
  }

  function exportCsv() {
    if (!state.results.length) {
      log("warning", "No results available for CSV export.");
      return;
    }

    downloadFile("oryxen-web-console-results.csv", toCsv(state.results), "text/csv;charset=utf-8");
    log("success", "CSV exported.");
  }

  async function copyJson() {
    if (!state.results.length) {
      log("warning", "No results available to copy.");
      return;
    }

    try {
      await copyText(JSON.stringify(state.results, null, 2));
      log("success", "JSON copied to clipboard.");
    } catch (error) {
      log("error", `Copy failed: ${error.message}`);
    }
  }

  function setRunningUi(running) {
    if (state.elements.runButton) state.elements.runButton.disabled = running;
    if (state.elements.stopButton) state.elements.stopButton.disabled = !running;
  }

  function toggleMinimize(force) {
    const panel = state.elements.panel;
    if (!panel) return;

    const shouldMinimize =
      typeof force === "boolean" ? force : !panel.classList.contains("oryxen-minimized");

    panel.classList.toggle("oryxen-minimized", shouldMinimize);
    state.config.minimized = shouldMinimize;
    if (state.elements.minimizeButton) {
      state.elements.minimizeButton.textContent = shouldMinimize ? "Expand" : "Minimize";
    }
    saveConfig();
  }

  function closePanel() {
    state.stopRequested = true;
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    log("info", "Panel closed.");
  }

  function createButton(label, onClick, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `oryxen-btn ${className || ""}`.trim();
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function createCheckbox(label, checked) {
    const wrapper = document.createElement("label");
    wrapper.className = "oryxen-checkbox";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = label;
    input.checked = checked;
    input.addEventListener("change", () => {
      updateConfigFromUi();
      renderResultsTable();
    });

    const text = document.createElement("span");
    text.textContent = label;

    wrapper.append(input, text);
    return wrapper;
  }

  function injectStyles() {
    document.getElementById(STYLE_ID)?.remove();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        top: 20px;
        right: 20px;
        width: ${state.config.width || 460}px;
        height: ${state.config.height || 640}px;
        min-width: 360px;
        min-height: 260px;
        resize: both;
        overflow: hidden;
        z-index: 2147483647;
        background: linear-gradient(180deg, #16181d 0%, #0e1014 100%);
        color: #eef2f7;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${PANEL_ID}.oryxen-minimized {
        height: 56px !important;
        min-height: 56px;
        resize: horizontal;
      }
      #${PANEL_ID}.oryxen-minimized .oryxen-body {
        display: none;
      }
      #${PANEL_ID} *, #${PANEL_ID} *::before, #${PANEL_ID} *::after {
        box-sizing: border-box;
      }
      #${PANEL_ID} .oryxen-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
      }
      #${PANEL_ID} .oryxen-title {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      #${PANEL_ID} .oryxen-progress {
        font-size: 11px;
        color: #a4adba;
      }
      #${PANEL_ID} .oryxen-body {
        display: grid;
        grid-template-rows: auto auto auto minmax(90px, 1fr) minmax(140px, 1.2fr);
        gap: 10px;
        height: calc(100% - 56px);
        padding: 12px;
      }
      #${PANEL_ID} .oryxen-actions,
      #${PANEL_ID} .oryxen-fields {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      #${PANEL_ID} .oryxen-btn {
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: #1c212a;
        color: #eef2f7;
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        font-weight: 600;
      }
      #${PANEL_ID} .oryxen-btn:hover {
        background: #262d39;
      }
      #${PANEL_ID} .oryxen-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      #${PANEL_ID} .oryxen-btn-primary {
        background: linear-gradient(180deg, #1b8f5a 0%, #126744 100%);
      }
      #${PANEL_ID} .oryxen-btn-danger {
        background: linear-gradient(180deg, #a33b4d 0%, #7c2132 100%);
      }
      #${PANEL_ID} textarea,
      #${PANEL_ID} input[type="number"],
      #${PANEL_ID} input[type="text"] {
        width: 100%;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        background: #10141b;
        color: #eef2f7;
        padding: 10px 12px;
      }
      #${PANEL_ID} textarea {
        min-height: 110px;
        resize: vertical;
      }
      #${PANEL_ID} .oryxen-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      #${PANEL_ID} .oryxen-field,
      #${PANEL_ID} .oryxen-section {
        display: grid;
        gap: 6px;
      }
      #${PANEL_ID} .oryxen-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #a4adba;
      }
      #${PANEL_ID} .oryxen-checkbox {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.04);
      }
      #${PANEL_ID} .oryxen-logs,
      #${PANEL_ID} .oryxen-results {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background: #0b0e13;
        overflow: auto;
      }
      #${PANEL_ID} .oryxen-logs {
        padding: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      #${PANEL_ID} .oryxen-log {
        margin-bottom: 6px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      #${PANEL_ID} .oryxen-log-info { color: #d3d9e3; }
      #${PANEL_ID} .oryxen-log-success { color: #8ce6ae; }
      #${PANEL_ID} .oryxen-log-warning { color: #f5ca72; }
      #${PANEL_ID} .oryxen-log-error { color: #ff9ba8; }
      #${PANEL_ID} .oryxen-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      #${PANEL_ID} .oryxen-table th,
      #${PANEL_ID} .oryxen-table td {
        padding: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        text-align: left;
        vertical-align: top;
      }
      #${PANEL_ID} .oryxen-table th {
        position: sticky;
        top: 0;
        background: #121720;
      }
      #${PANEL_ID} .oryxen-empty {
        padding: 14px;
        color: #a4adba;
      }
      @media (max-width: 768px) {
        #${PANEL_ID} {
          top: auto;
          right: 12px;
          left: 12px;
          bottom: 12px;
          width: auto;
          height: 70vh;
          min-width: 0;
        }
        #${PANEL_ID} .oryxen-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // Panel builder injects UI, wires actions, and restores persisted state.
  function buildPanel() {
    document.getElementById(PANEL_ID)?.remove();
    injectStyles();

    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    const header = document.createElement("div");
    header.className = "oryxen-header";

    const titleBlock = document.createElement("div");
    const title = document.createElement("div");
    title.className = "oryxen-title";
    title.textContent = "Oryxen Web Console";
    const progress = document.createElement("div");
    progress.className = "oryxen-progress";
    progress.textContent = "Idle";
    titleBlock.append(title, progress);

    const headerButtons = document.createElement("div");
    headerButtons.className = "oryxen-actions";

    const minimizeButton = createButton("Minimize", () => toggleMinimize());
    const closeButton = createButton("Close", () => closePanel(), "oryxen-btn-danger");
    headerButtons.append(minimizeButton, closeButton);
    header.append(titleBlock, headerButtons);

    const body = document.createElement("div");
    body.className = "oryxen-body";

    const actions = document.createElement("div");
    actions.className = "oryxen-actions";

    const runButton = createButton("Run", () => {
      run().catch((error) => log("error", error.message));
    }, "oryxen-btn-primary");
    const stopButton = createButton("Stop", () => stop(), "oryxen-btn-danger");
    const clearButton = createButton("Clear Logs", () => clearLogs());
    const exportButton = createButton("Export CSV", () => exportCsv());
    const copyButton = createButton("Copy JSON", () => {
      copyJson().catch((error) => log("error", error.message));
    });

    actions.append(runButton, stopButton, clearButton, exportButton, copyButton);

    const itemsSection = document.createElement("div");
    itemsSection.className = "oryxen-section";
    const itemsLabel = document.createElement("div");
    itemsLabel.className = "oryxen-label";
    itemsLabel.textContent = "Usernames or items";
    const itemsInput = document.createElement("textarea");
    itemsInput.placeholder = "One item per line";
    itemsInput.value = state.config.itemsText || "";
    itemsInput.addEventListener("input", updateConfigFromUi);
    itemsSection.append(itemsLabel, itemsInput);

    const settingsGrid = document.createElement("div");
    settingsGrid.className = "oryxen-grid";

    const waitSection = document.createElement("div");
    waitSection.className = "oryxen-field";
    const waitLabel = document.createElement("div");
    waitLabel.className = "oryxen-label";
    waitLabel.textContent = "Wait time (ms)";
    const waitInput = document.createElement("input");
    waitInput.type = "number";
    waitInput.min = "0";
    waitInput.step = "100";
    waitInput.value = String(state.config.waitTime || 2500);
    waitInput.addEventListener("input", updateConfigFromUi);
    waitSection.append(waitLabel, waitInput);

    const selectorSection = document.createElement("div");
    selectorSection.className = "oryxen-field";
    const selectorLabel = document.createElement("div");
    selectorLabel.className = "oryxen-label";
    selectorLabel.textContent = "Custom selector";
    const selectorInput = document.createElement("input");
    selectorInput.type = "text";
    selectorInput.placeholder = ".result-card";
    selectorInput.value = state.config.customSelector || "";
    selectorInput.addEventListener("input", updateConfigFromUi);
    selectorSection.append(selectorLabel, selectorInput);

    settingsGrid.append(waitSection, selectorSection);

    const fieldsSection = document.createElement("div");
    fieldsSection.className = "oryxen-section";
    const fieldsLabel = document.createElement("div");
    fieldsLabel.className = "oryxen-label";
    fieldsLabel.textContent = "Fields to extract";
    const fields = document.createElement("div");
    fields.className = "oryxen-fields";

    FIELD_OPTIONS.forEach((field) => {
      const checked = (state.config.selectedFields || DEFAULT_FIELDS).includes(field);
      fields.appendChild(createCheckbox(field, checked));
    });
    fieldsSection.append(fieldsLabel, fields);

    const logsSection = document.createElement("div");
    logsSection.className = "oryxen-section";
    const logsLabel = document.createElement("div");
    logsLabel.className = "oryxen-label";
    logsLabel.textContent = "Console";
    const logs = document.createElement("div");
    logs.className = "oryxen-logs";
    logsSection.append(logsLabel, logs);

    const resultsSection = document.createElement("div");
    resultsSection.className = "oryxen-section";
    const resultsLabel = document.createElement("div");
    resultsLabel.className = "oryxen-label";
    resultsLabel.textContent = "Results";
    const results = document.createElement("div");
    results.className = "oryxen-results";
    resultsSection.append(resultsLabel, results);

    body.append(actions, itemsSection, settingsGrid, fieldsSection, logsSection, resultsSection);
    panel.append(header, body);
    document.body.appendChild(panel);

    state.elements = {
      panel,
      progress,
      runButton,
      stopButton,
      minimizeButton,
      itemsInput,
      waitInput,
      selectorInput,
      fields,
      logs,
      results,
    };

    panel.addEventListener("mouseup", saveConfig);
    panel.addEventListener("mouseleave", saveConfig);

    setRunningUi(false);
    renderResultsTable();

    if (state.config.minimized) {
      toggleMinimize(true);
    }

    log("info", "Panel ready.");
    log("info", "This tool only automates actions already visible to the authorized user.");
  }

  buildPanel();
})();
