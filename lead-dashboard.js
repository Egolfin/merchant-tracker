const API_URL = "https://script.google.com/a/macros/ext.doordash.com/s/AKfycbxZoKWK2MLL4xo55FBHEWD_qoxgqD17_H1w1L-kbO46PlxQ3ClFpOsiME14aHZ1fiK-sg/exec";

let allLeads = [];
let allActivities = [];
let allOpenCases = [];
let allAssets = [];
let filteredLeads = [];
let currentLead = null;
let currentStoreId = "";
let currentOpenCases = [];
let currentAssets = [];
let currentOpenCasesStoreId = "";

const OPEN_CASE_STATUSES = ["Open", "Resolved", "Closed", "Closed Unresolved"];

function getEl(id) {
  return document.getElementById(id);
}

function getField(obj, candidates) {
  if (!obj || !Array.isArray(candidates)) return "";
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
  }
  return "";
}

function getStoreId(lead) {
  return String(getField(lead, ["Store Id", "Store ID"])).trim();
}

function getMerchantOwnerName(lead) {
  const dmName = String(getField(lead, ["DM Name", "DM name"])).trim();
  if (dmName && dmName !== "[Unknown]" && !dmName.includes("[Unknown]")) return dmName;
  const owner = String(getField(lead, ["Owner"])).trim();
  return owner || "Unassigned";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseNumeric(value) {
  const n = Number(String(value ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizePercentValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(String(value).replace(/[%\s,]/g, ""));
  if (!Number.isFinite(num)) return 0;
  return num <= 1 ? num * 100 : num;
}

function formatCoverage(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num <= 1 ? `${(num * 100).toFixed(1)}%` : `${num.toFixed(1)}%`;
}

function parseFlexibleDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) {
    const d2 = new Date(Number(parts[3]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(d2.getTime()) ? null : d2;
  }
  return null;
}

function parseFlexibleDateTime(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return new Date(value.getTime());
  const str = String(value).trim();
  if (!str) return null;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return parseFlexibleDate(str);
}

function formatDisplayDate(value) {
  if (!value) return "";
  const d = parseFlexibleDate(value);
  if (!d) return String(value);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTimeDisplay(value) {
  if (!value) return "";
  const d = parseFlexibleDateTime(value);
  if (!d) return String(value);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function toDateInputValue(value) {
  const d = parseFlexibleDate(value);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateComparableValue(value) {
  const d = parseFlexibleDate(value);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayDateString() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function daysBetween(startDate, endDate) {
  const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const e = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.floor((e.getTime() - s.getTime()) / 86400000);
}

function getLatestActivityObjectForStoreId(storeId) {
  const matches = allActivities
    .filter(a => String(getField(a, ["Store ID", "Store Id"])) === String(storeId))
    .slice()
    .sort((a, b) => {
      const ad = parseFlexibleDateTime(getField(a, ["Timestamp"])) || new Date(0);
      const bd = parseFlexibleDateTime(getField(b, ["Timestamp"])) || new Date(0);
      return bd.getTime() - ad.getTime();
    });
  return matches[0] || null;
}

function getLatestActivityForStoreId(storeId) {
  const latest = getLatestActivityObjectForStoreId(storeId);
  if (!latest) return "No activity yet";
  const type = getField(latest, ["Activity Type"]) || "Activity";
  const ts = formatDisplayDate(getField(latest, ["Timestamp"])) || "Unknown date";
  return `${type} • ${ts}`;
}

function getLatestActivityDateForStoreId(storeId) {
  const latest = getLatestActivityObjectForStoreId(storeId);
  return latest ? parseFlexibleDate(getField(latest, ["Timestamp"])) : null;
}

function getCoverageScore(lead) {
  const photo = normalizePercentValue(getField(lead, ["Photo Coverage"]));
  const desc = normalizePercentValue(getField(lead, ["Description Coverage"]));
  return (photo + desc) / 2;
}

function isTruthyOpp(value) {
  const n = String(value || "").trim().toLowerCase();
  return ["yes", "y", "true", "1"].includes(n) || parseNumeric(n) > 0;
}

function getMerchantPriorityScore(lead) {
  const stored = parseNumeric(getField(lead, ["Priority Score"]));
  let heuristic = 0;
  const gmv = parseNumeric(getField(lead, ["GMV"]));
  heuristic += Math.min(gmv / 5000, 20);
  if (isTruthyOpp(getField(lead, ["Promo Opp"]))) heuristic += 10;
  if (isTruthyOpp(getField(lead, ["SI Opp"]))) heuristic += 10;
  const nextFollowUp = getDateComparableValue(getField(lead, ["Next Follow-Up"]));
  const today = getTodayDateString();
  if (nextFollowUp && nextFollowUp < today) heuristic += 15;
  else if (nextFollowUp && nextFollowUp === today) heuristic += 10;
  const lastActivityDate = getLatestActivityDateForStoreId(getStoreId(lead));
  if (lastActivityDate) {
    const daysSinceActivity = daysBetween(lastActivityDate, new Date());
    if (daysSinceActivity >= 30) heuristic += 20;
    else if (daysSinceActivity >= 14) heuristic += 10;
  } else {
    heuristic += 10;
  }
  if (getCoverageScore(lead) < 80) heuristic += 10;
  const pipelineStage = String(getField(lead, ["Pipeline Stage"])).trim().toLowerCase();
  if (pipelineStage && pipelineStage !== "closed won" && pipelineStage !== "closed lost") heuristic += 5;
  return Math.max(Math.round(heuristic), stored || 0);
}

function setText(id, value) {
  const el = getEl(id);
  if (el) el.textContent = value;
}

function setConnectionStatus(isConnected) {
  const status = getEl("sheetStatus");
  if (!status) return;
  status.textContent = isConnected ? "Connected" : "Not Connected";
  status.classList.remove("status-offline", "status-online");
  status.classList.add(isConnected ? "status-online" : "status-offline");
}

function renderLeadError(message) {
  const c = getEl("leadTableContainer");
  if (c) c.innerHTML = `<div class="error-state">Lead load failed: ${escapeHtml(message)}</div>`;
}

function renderActivityError(message) {
  const c = getEl("activityContainer");
  if (c) c.innerHTML = `<div class="error-state">Activity load failed: ${escapeHtml(message)}</div>`;
}

function updateMetrics(leads = allLeads) {
  const totalLeads = leads.length;
  const today = getTodayDateString();
  const followUpsToday = leads.filter(l => getDateComparableValue(getField(l, ["Next Follow-Up"])) === today).length;
  const overdueFollowUps = leads.filter(l => {
    const due = getDateComparableValue(getField(l, ["Next Follow-Up"]));
    return due && due < today;
  }).length;
  const priorityValues = leads.map(getMerchantPriorityScore).filter(Number.isFinite);
  const averagePriorityScore = priorityValues.length ? (priorityValues.reduce((s, v) => s + v, 0) / priorityValues.length).toFixed(1) : "0.0";
  setText("totalLeads", totalLeads);
  setText("followUpsToday", followUpsToday);
  setText("overdueFollowUps", overdueFollowUps);
  setText("averagePriorityScore", averagePriorityScore);
}

function rowsToObjects(values) {
  if (!values || values.length === 0) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[String(h).trim()] = row[i]; });
    return obj;
  });
}

function findHeaderIndex_(headers, candidates) {
  if (!Array.isArray(headers) || !Array.isArray(candidates)) return -1;
  const normalizedHeaders = headers.map(h => normalizeHeader_(h));
  for (const candidate of candidates) {
    const idx = normalizedHeaders.indexOf(normalizeHeader_(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function rowToObject_(headers, row) {
  const obj = {};
  headers.forEach((header, index) => { obj[String(header).trim()] = row[index]; });
  return obj;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getCurrentLocalDateTimeValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const local = new Date(now.getTime() - offset);
  return local.toISOString().slice(0, 16);
}

function setActivityStatus(message, isError = false) {
  const s = getEl("activityStatusMessage");
  if (!s) return;
  s.textContent = message;
  s.classList.toggle("error", Boolean(isError));
}

function setLeadUpdateStatus(message, isError = false) {
  const s = getEl("leadUpdateStatusMessage");
  if (!s) return;
  s.textContent = message;
  s.classList.toggle("error", Boolean(isError));
}

function getMerchantCasesContainer() {
  return getEl("merchantCases");
}

function getMerchantAssetsContainer() {
  return getEl("merchantAssets");
}

function buildMerchantSnapshotTimelineEntry(lead, eventCount) {
  const storeId = getStoreId(lead);
  const lastActivity = getLatestActivityForStoreId(storeId);
  const owner = getMerchantOwnerName(lead);
  return {
    kind: "snapshot",
    title: "Merchant Snapshot",
    badge: "LIVE RECORD",
    meta: `${eventCount} timeline event${eventCount === 1 ? "" : "s"}`,
    submeta: `Last activity: ${lastActivity}`,
    details: [
      { label: "Business Name", value: getField(lead, ["Business Name"]) },
      { label: "Store ID", value: storeId },
      { label: "Business ID", value: getField(lead, ["Business Id", "Business ID"]) },
      { label: "Rx Name", value: getField(lead, ["Rx Name"]) },
      { label: "Lead Status", value: getField(lead, ["Lead Status"]) },
      { label: "Pipeline Stage", value: getField(lead, ["Pipeline Stage"]) },
      { label: "Owner", value: owner },
      { label: "Next Follow-Up", value: formatDisplayDate(getField(lead, ["Next Follow-Up"])) },
      { label: "Priority Score", value: String(getMerchantPriorityScore(lead)) },
      { label: "Open Case Count", value: String(currentOpenCases.length || getField(lead, ["Open Case Count"]) || 0) },
      { label: "GMV", value: getField(lead, ["GMV"]) },
      { label: "Last Contacted", value: getField(lead, ["Last Contacted"]) },
      { label: "Photo Coverage", value: formatCoverage(getField(lead, ["Photo Coverage"])) },
      { label: "Description Coverage", value: formatCoverage(getField(lead, ["Description Coverage"])) },
      { label: "Uptime", value: formatCoverage(getField(lead, ["Uptime"])) }
    ]
  };
}

function buildMerchantActivityTimelineEntry(activity) {
  const sortDate = parseFlexibleDateTime(getField(activity, ["Timestamp"])) || new Date(0);
  return {
    kind: "activity",
    title: getField(activity, ["Activity Type"]) || "Activity",
    badge: getField(activity, ["Outcome"]) || "Logged",
    meta: formatDateTimeDisplay(getField(activity, ["Timestamp"])),
    submeta: `Owner: ${getField(activity, ["Owner"])} • Store ID: ${getField(activity, ["Store ID", "Store Id"])}`,
    details: [
      { label: "Business Name", value: getField(activity, ["Business Name"]) },
      { label: "Owner", value: getField(activity, ["Owner"]) },
      { label: "Outcome", value: getField(activity, ["Outcome"]) },
      { label: "Next Follow-Up", value: formatDisplayDate(getField(activity, ["Next Follow-Up"])) }
    ],
    notes: getField(activity, ["Notes"]),
    sortDate
  };
}

function buildMerchantCaseTimelineEntry(caseItem) {
  const sortDate = parseFlexibleDateTime(getField(caseItem, ["Last Updated"])) || parseFlexibleDateTime(getField(caseItem, ["Created Date"])) || new Date(0);
  return {
    kind: "case",
    title: getField(caseItem, ["Case Type"]) || "Open Case",
    badge: getField(caseItem, ["Status"]) || "Open",
    meta: formatDisplayDate(getField(caseItem, ["Last Updated"])) || formatDisplayDate(getField(caseItem, ["Created Date"])) || "Open case",
    submeta: `Case ID: ${getField(caseItem, ["Case ID", "Case Id"]) } • Priority: ${getField(caseItem, ["Priority"])} • Store ID: ${getField(caseItem, ["Store ID", "Store Id"])}`,
    details: [
      { label: "Business Name", value: getField(caseItem, ["Business Name"]) },
      { label: "Owner", value: getField(caseItem, ["Owner"]) },
      { label: "Created Date", value: formatDisplayDate(getField(caseItem, ["Created Date"])) },
      { label: "Last Updated", value: formatDisplayDate(getField(caseItem, ["Last Updated"])) },
      { label: "Priority", value: getField(caseItem, ["Priority"]) }
    ],
    notes: getField(caseItem, ["Notes"]),
    sortDate
  };
}

function renderMerchantTimelineEntry(entry) {
  const typeClass = entry.kind === "snapshot" ? "timeline-snapshot" : entry.kind === "case" ? "timeline-case" : "timeline-activity";
  const detailsHtml = Array.isArray(entry.details)
    ? entry.details.map(item => `<div class="timeline-detail"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></div>`).join("")
    : "";
  return `
    <article class="timeline-entry ${typeClass}">
      <div class="timeline-marker"></div>
      <div class="timeline-card">
        <div class="timeline-header">
          <div>
            <span class="timeline-kicker">${escapeHtml(entry.kind === "snapshot" ? "Current record" : entry.kind === "case" ? "Open case" : "Activity event")}</span>
            <h4 class="timeline-title">${escapeHtml(entry.title)}</h4>
          </div>
          <span class="timeline-badge">${escapeHtml(entry.badge)}</span>
        </div>
        <div class="timeline-meta">${escapeHtml(entry.meta || "")}${entry.submeta ? ` • ${escapeHtml(entry.submeta)}` : ""}</div>
        <div class="timeline-details">${detailsHtml}</div>
        ${entry.notes ? `<div class="timeline-notes">${escapeHtml(entry.notes)}</div>` : ""}
      </div>
    </article>
  `;
}

function renderMerchantTimeline(lead, activitiesOverride, openCasesOverride) {
  const c = getEl("merchantTimeline");
  if (!c) return;
  if (!lead) {
    c.innerHTML = `<div class="timeline-empty">Select a merchant to view the timeline.</div>`;
    return;
  }
  const storeId = getStoreId(lead);
  const merchantActivities = Array.isArray(activitiesOverride)
    ? activitiesOverride.slice()
    : allActivities.filter(a => String(getField(a, ["Store ID", "Store Id"])) === String(storeId));
  const merchantCases = Array.isArray(openCasesOverride)
    ? openCasesOverride.slice()
    : (String(currentOpenCasesStoreId) === String(storeId) ? currentOpenCases.slice() : []);
  merchantActivities.sort((a, b) => (parseFlexibleDateTime(getField(b, ["Timestamp"])) || new Date(0)) - (parseFlexibleDateTime(getField(a, ["Timestamp"])) || new Date(0)));
  merchantCases.sort((a, b) => (parseFlexibleDateTime(getField(b, ["Last Updated"])) || parseFlexibleDateTime(getField(b, ["Created Date"])) || new Date(0)) - (parseFlexibleDateTime(getField(a, ["Last Updated"])) || parseFlexibleDateTime(getField(a, ["Created Date"])) || new Date(0)));
  const entries = [buildMerchantSnapshotTimelineEntry(lead, merchantActivities.length + merchantCases.length)];
  merchantActivities.forEach(a => entries.push(buildMerchantActivityTimelineEntry(a)));
  merchantCases.forEach(cs => entries.push(buildMerchantCaseTimelineEntry(cs)));
  entries.sort((a, b) => (b.sortDate ? b.sortDate.getTime() : 0) - (a.sortDate ? a.sortDate.getTime() : 0));
  c.innerHTML = `<div class="merchant-timeline">${entries.map(renderMerchantTimelineEntry).join("")}</div>`;
}

function buildMerchantOverviewHtml(lead) {
  return `
    <div class="overview-grid">
      <div><strong>Business Name:</strong> ${escapeHtml(getField(lead, ["Business Name"]))}</div>
      <div><strong>Store ID:</strong> ${escapeHtml(getField(lead, ["Store Id", "Store ID"]))}</div>
      <div><strong>Business ID:</strong> ${escapeHtml(getField(lead, ["Business Id", "Business ID"]))}</div>
      <div><strong>Rx Name:</strong> ${escapeHtml(getField(lead, ["Rx Name"]))}</div>
      <div><strong>GMV:</strong> ${escapeHtml(getField(lead, ["GMV"]))}</div>
      <div><strong>Photo Coverage:</strong> ${escapeHtml(formatCoverage(getField(lead, ["Photo Coverage"])))}</div>
      <div><strong>Description Coverage:</strong> ${escapeHtml(formatCoverage(getField(lead, ["Description Coverage"])))}</div>
      <div><strong>Uptime:</strong> ${escapeHtml(formatCoverage(getField(lead, ["Uptime"])))}</div>
      <div><strong>Promo Opp:</strong> ${escapeHtml(getField(lead, ["Promo Opp"]))}</div>
      <div><strong>SI Opp:</strong> ${escapeHtml(getField(lead, ["SI Opp"]))}</div>
      <div><strong>Lead Status:</strong> ${escapeHtml(getField(lead, ["Lead Status"]))}</div>
      <div><strong>Priority Score:</strong> ${escapeHtml(String(getMerchantPriorityScore(lead)))}</div>
      <div><strong>Owner:</strong> ${escapeHtml(getMerchantOwnerName(lead))}</div>
      <div><strong>Last Contacted:</strong> ${escapeHtml(getField(lead, ["Last Contacted"]))}</div>
      <div><strong>Next Follow-Up:</strong> ${escapeHtml(formatDisplayDate(getField(lead, ["Next Follow-Up"])))}</div>
      <div><strong>Open Case Count:</strong> ${escapeHtml(String(currentOpenCases.length || getField(lead, ["Open Case Count"]) || 0))}</div>
      <div><strong>Pipeline Stage:</strong> ${escapeHtml(getField(lead, ["Pipeline Stage"]))}</div>
    </div>
  `;
}

function buildActivityContextHtml(lead) {
  return `
    <div class="overview-grid">
      <div><strong>Business Name:</strong> ${escapeHtml(getField(lead, ["Business Name"]))}</div>
      <div><strong>Store ID:</strong> ${escapeHtml(getField(lead, ["Store Id", "Store ID"]))}</div>
      <div><strong>Business ID:</strong> ${escapeHtml(getField(lead, ["Business Id", "Business ID"]))}</div>
      <div><strong>Rx Name:</strong> ${escapeHtml(getField(lead, ["Rx Name"]))}</div>
      <div><strong>DM Name:</strong> ${escapeHtml(getMerchantOwnerName(lead))}</div>
      <div><strong>Lead Status:</strong> ${escapeHtml(getField(lead, ["Lead Status"]))}</div>
      <div><strong>Priority Score:</strong> ${escapeHtml(String(getMerchantPriorityScore(lead)))}</div>
    </div>
  `;
}

function buildOpenCasesHtml(lead, openCases, isLoading) {
  const cases = Array.isArray(openCases) ? openCases : [];
  if (isLoading) return `<div class="empty-state">Loading open cases...</div>`;
  if (!cases.length) return `<div class="empty-state">No open cases found for this merchant.</div>`;
  return `<div class="open-cases-list">${cases.map(renderOpenCaseCard).join("")}</div>`;
}

function renderOpenCaseCard(caseItem) {
  return `
    <div class="drawer-card merchant-open-case-item" style="margin-top:12px;">
      <strong>${escapeHtml(getField(caseItem, ["Case ID", "Case Id"]) || "Case")}</strong><br>
      <span class="subtext">${escapeHtml(getField(caseItem, ["Case Type"]))} • ${escapeHtml(getField(caseItem, ["Status"]))} • ${escapeHtml(getField(caseItem, ["Priority"]))}</span>
      <div style="margin-top:8px;">
        <div><strong>Created:</strong> ${escapeHtml(formatDisplayDate(getField(caseItem, ["Created Date"])))}</div>
        <div><strong>Last Updated:</strong> ${escapeHtml(formatDisplayDate(getField(caseItem, ["Last Updated"])))}</div>
        <div><strong>Owner:</strong> ${escapeHtml(getField(caseItem, ["Owner"]))}</div>
      </div>
      <div style="margin-top:8px; white-space:pre-wrap;">${escapeHtml(getField(caseItem, ["Notes"]))}</div>
    </div>
  `;
}

function buildMerchantCasesHtml(cases, isLoading) {
  const caseList = Array.isArray(cases) ? cases : [];
  if (isLoading) return `<div class="empty-state">Loading cases...</div>`;
  const count = caseList.length;
  return `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:2px 0 6px 0;">
      <div>
        <div style="font-size:14px; font-weight:600; color:#f3f4f6;">Cases for this merchant</div>
        <div class="subtext" style="color:rgba(243,244,246,0.68); font-size:12px; margin-top:4px;">${count} case${count === 1 ? "" : "s"} available</div>
      </div>
      <a href="#" onclick="openMerchantCaseCenter(); return false;" style="display:inline-flex; align-items:center; gap:8px; color:#60a5fa; text-decoration:underline; font-weight:600; font-size:13px;">
        Open Case Center ↗
      </a>
    </div>
    ${count ? `<div class="empty-state" style="margin-top:12px; text-align:left; padding:14px 16px;">Use the Case Center to view, edit, create, or delete cases.</div>` : `<div class="empty-state" style="margin-top:12px; text-align:left; padding:14px 16px;">No cases selected.</div>`}
  `;
}

function renderMerchantCases(lead, casesOverride) {
  const c = getEl("merchantCases");
  if (!c) return;
  if (!lead) {
    c.innerHTML = buildMerchantCasesHtml([], false);
    return;
  }
  const storeId = getStoreId(lead);
  const merchantCases = Array.isArray(casesOverride) ? casesOverride.slice() : (String(currentOpenCasesStoreId) === String(storeId) ? currentOpenCases.slice() : []);
  merchantCases.sort((a, b) => (parseFlexibleDateTime(getField(b, ["Last Updated"])) || parseFlexibleDateTime(getField(b, ["Created Date"])) || new Date(0)) - (parseFlexibleDateTime(getField(a, ["Last Updated"])) || parseFlexibleDateTime(getField(a, ["Created Date"])) || new Date(0)));
  c.innerHTML = buildMerchantCasesHtml(merchantCases, false);
}

function ensureMerchantCaseCenterStyles() {
  if (document.getElementById("merchantCaseCenterStyles")) return;
  const style = document.createElement("style");
  style.id = "merchantCaseCenterStyles";
  style.textContent = `
    .case-center-overlay {
      position: fixed;
      inset: 0;
      background: rgba(3, 7, 18, 0.84);
      backdrop-filter: blur(10px);
      z-index: 99999;
      display: none;
      align-items: stretch;
      justify-content: flex-end;
      padding: 18px;
    }
    .case-center-window {
      width: min(1120px, 96vw);
      height: calc(100vh - 36px);
      background: #111827;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      box-shadow: -30px 0 80px rgba(0,0,0,0.55);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      margin-left: auto;
    }
    .case-center-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 22px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
      flex: 0 0 auto;
    }
    .case-center-title { margin: 0; font-size: 20px; color: #f3f4f6; }
    .case-center-subtitle { margin-top: 6px; color: rgba(243,244,246,0.68); font-size: 13px; }
    .case-center-body {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 18px;
      padding: 18px;
      overflow: hidden;
      flex: 1;
      min-height: 0;
      background: #111827;
    }
    .case-center-panel {
      background: #1e222b;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 16px;
      overflow: auto;
      min-height: 0;
    }
    .case-center-list { display: flex; flex-direction: column; gap: 12px; }
    .case-center-form label, .case-center-panel label { color: rgba(243,244,246,0.68); }
    .case-center-form input, .case-center-form select, .case-center-form textarea,
    .case-center-case select, .case-center-case textarea {
      width: 100%;
      background: #111827 !important;
      color: #f3f4f6 !important;
      border: 1px solid #2d3139 !important;
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 14px;
      outline: none;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
    }
    .case-center-form textarea, .case-center-case textarea { min-height: 110px; resize: vertical; line-height: 1.45; }
    .case-center-case {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 16px;
    }
    .case-center-case h4 { margin: 0 0 6px 0; color: #f3f4f6; }
    .case-center-case .meta { color: rgba(243,244,246,0.68); font-size: 12px; }
    .case-center-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 14px; }
    .case-center-link { cursor: pointer; }
    .case-delete-btn { background: rgba(239,68,68,0.15) !important; color: #fca5a5 !important; border: 1px solid rgba(239,68,68,0.25) !important; }
    .case-center-form input::placeholder,
    .case-center-form textarea::placeholder,
    .case-center-case textarea::placeholder { color: rgba(243,244,246,0.38); }
    .case-center-form input:focus,
    .case-center-form select:focus,
    .case-center-form textarea:focus,
    .case-center-case select:focus,
    .case-center-case textarea:focus {
      border-color: rgba(96,165,250,0.85) !important;
      box-shadow: 0 0 0 3px rgba(96,165,250,0.14);
    }
  `;
  document.head.appendChild(style);
}

function ensureMerchantCaseCenterModal() {
  ensureMerchantCaseCenterStyles();
  if (document.getElementById("merchantCaseCenterOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "merchantCaseCenterOverlay";
  overlay.className = "case-center-overlay";
  overlay.innerHTML = `
    <div class="case-center-window" role="dialog" aria-modal="true" aria-labelledby="caseCenterTitle">
      <div class="case-center-header">
        <div>
          <h2 id="caseCenterTitle" class="case-center-title">Case Center</h2>
          <div id="caseCenterSubtitle" class="case-center-subtitle">Select a merchant to manage cases.</div>
        </div>
        <button type="button" class="btn btn-secondary" onclick="closeMerchantCaseCenter()">Close</button>
      </div>
      <div class="case-center-body">
        <div class="case-center-panel">
          <h3 style="margin:0 0 12px 0; color:#f3f4f6;">Create New Case</h3>
          <form id="caseCenterCreateForm" class="case-center-form">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div>
                <label style="display:block; font-size:10px; text-transform:uppercase; margin-bottom:6px;">Case Number</label>
                <input id="caseCenterNewNumber" type="text" placeholder="718445321">
              </div>
              <div>
                <label style="display:block; font-size:10px; text-transform:uppercase; margin-bottom:6px;">Priority</label>
                <select id="caseCenterNewPriority">
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High" selected>High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
              <div>
                <label style="display:block; font-size:10px; text-transform:uppercase; margin-bottom:6px;">Case Subject</label>
                <input id="caseCenterNewSubject" type="text" placeholder="Tablet not receiving orders">
              </div>
              <div>
                <label style="display:block; font-size:10px; text-transform:uppercase; margin-bottom:6px;">Case Category</label>
                <select id="caseCenterNewCategory">
                  <option value="">Select category</option>
                  <option value="Tablet Issue">Tablet Issue</option>
                  <option value="Photo Issue">Photo Issue</option>
                  <option value="Video Issue">Video Issue</option>
                  <option value="Menu Issue">Menu Issue</option>
                  <option value="Support Request">Support Request</option>
                  <option value="Billing">Billing</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Operations">Operations</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div style="margin-top:12px;">
              <label style="display:block; font-size:10px; text-transform:uppercase; margin-bottom:6px;">Initial Note</label>
              <textarea id="caseCenterNewNotes" rows="4" placeholder="Write the case details here..."></textarea>
            </div>
            <div class="case-center-actions">
              <button type="button" class="btn btn-secondary" onclick="closeMerchantCaseCenter()">Cancel</button>
              <button type="button" class="btn btn-primary" onclick="createCaseFromCaseCenter()">Create Case</button>
            </div>
          </form>
        </div>
        <div class="case-center-panel">
          <h3 style="margin:0 0 12px 0; color:#f3f4f6;">Merchant Cases</h3>
          <div id="caseCenterCaseList" class="case-center-list"></div>
        </div>
      </div>
    </div>
  `;
  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeMerchantCaseCenter();
  });
  document.body.appendChild(overlay);
}

function openMerchantCaseCenter() {
  if (!currentLead) {
    alert("Select a merchant first.");
    return;
  }
  ensureMerchantCaseCenterModal();
  const overlay = document.getElementById("merchantCaseCenterOverlay");
  if (!overlay) return;
  overlay.style.display = "flex";
  renderMerchantCaseCenter(currentLead);
}

function closeMerchantCaseCenter() {
  const overlay = document.getElementById("merchantCaseCenterOverlay");
  if (!overlay) return;
  overlay.style.display = "none";
}

function renderMerchantCaseCenter(lead) {
  const title = getEl("caseCenterTitle");
  const subtitle = getEl("caseCenterSubtitle");
  const list = getEl("caseCenterCaseList");
  if (!title || !subtitle || !list || !lead) return;
  title.textContent = `${getField(lead, ["Business Name"]) || "Merchant"} Case Center`;
  subtitle.textContent = `Store ID: ${getStoreId(lead)} • Business ID: ${getField(lead, ["Business Id", "Business ID"])}`;
  const merchantCases = (String(currentOpenCasesStoreId) === String(getStoreId(lead)) ? currentOpenCases.slice() : []).sort((a, b) => (parseFlexibleDateTime(getField(b, ["Last Updated"])) || parseFlexibleDateTime(getField(b, ["Created Date"])) || new Date(0)) - (parseFlexibleDateTime(getField(a, ["Last Updated"])) || parseFlexibleDateTime(getField(a, ["Created Date"])) || new Date(0)));
  if (!merchantCases.length) {
    list.innerHTML = `<div class="empty-state">No cases found for this merchant.</div>`;
    return;
  }
  list.innerHTML = merchantCases.map(renderMerchantCaseCenterCard).join("");
}

function renderMerchantCaseCenterCard(caseItem) {
  const caseNumber = getField(caseItem, ["Case Number", "Case ID", "Case Id"]);
  const caseSubject = getField(caseItem, ["Case Subject", "Subject"]) || getField(caseItem, ["Case Type"]) || "Open Case";
  const caseCategory = getField(caseItem, ["Case Category", "Case Type"]) || "Other";
  const status = getField(caseItem, ["Status"]) || "Open";
  const priority = getField(caseItem, ["Priority"]);
  const owner = getField(caseItem, ["Owner"]);
  const notes = getField(caseItem, ["Notes"]);
  const createdDateValue = getField(caseItem, ["Created Date"]);
  const lastUpdatedValue = getField(caseItem, ["Last Updated"]);
  const statusOptions = OPEN_CASE_STATUSES.map(option => `<option value="${escapeHtml(option)}" ${String(option).toLowerCase() === String(status).trim().toLowerCase() ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
  return `
    <div class="case-center-case">
      <h4>${escapeHtml(caseSubject)}</h4>
      <div class="meta">Case Number: ${escapeHtml(caseNumber)} • Category: ${escapeHtml(caseCategory)} • Priority: ${escapeHtml(priority)}</div>
      <div style="margin-top:12px; display:grid; grid-template-columns:1fr 220px; gap:12px; align-items:start;">
        <div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 14px; margin-bottom:10px; font-size:13px; color:#f3f4f6;">
            <div><strong>Owner:</strong> ${escapeHtml(owner)}</div>
            <div><strong>Created:</strong> ${escapeHtml(formatDisplayDate(createdDateValue))}</div>
            <div><strong>Updated:</strong> ${escapeHtml(formatDisplayDate(lastUpdatedValue))}</div>
            <div><strong>Status:</strong> ${escapeHtml(status)}</div>
          </div>
          <div style="white-space:pre-wrap; padding:12px 14px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.02); line-height:1.5;">${escapeHtml(notes || "No notes yet.")}</div>
          <div style="margin-top:10px;">
            <label style="display:block; font-size:10px; text-transform:uppercase; margin-bottom:6px; color:rgba(243,244,246,0.68);">Add Note</label>
            <textarea class="case-center-note" data-case-number="${escapeHtml(caseNumber)}" rows="3" placeholder="Add a note for this case..."></textarea>
          </div>
        </div>
        <div>
          <label style="display:block; font-size:10px; text-transform:uppercase; margin-bottom:6px; color:rgba(243,244,246,0.68);">Status</label>
          <select class="case-center-status" data-case-number="${escapeHtml(caseNumber)}">
            ${statusOptions}
          </select>
          <div class="case-center-actions" style="justify-content:stretch; margin-top:12px;">
            <button type="button" class="btn btn-secondary" style="width:100%;" onclick="saveCaseStatusFromCenter('${escapeJs(caseNumber)}')">Save Status</button>
            <button type="button" class="btn btn-primary" style="width:100%;" onclick="addCaseNoteFromCenter('${escapeJs(caseNumber)}')">Add Note</button>
            <button type="button" class="btn case-delete-btn" style="width:100%;" onclick="deleteCaseFromCenter('${escapeJs(caseNumber)}')">Delete Case</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function postDeleteOpenCase(caseNumber) {
  return new Promise((resolve, reject) => {
    const callbackName = "handleDeleteOpenCase_" + Date.now();
    const script = document.createElement("script");
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Case delete request timed out.")); }, 20000);
    function cleanup() { clearTimeout(timeout); delete window[callbackName]; if (script.parentNode) script.parentNode.removeChild(script); }
    window[callbackName] = response => { try { if (!response || !response.success) { reject(new Error((response && response.message) || "Failed to delete case.")); return; } resolve(response); } finally { cleanup(); } };
    const params = new URLSearchParams();
    params.set("action", "deleteOpenCase");
    params.set("caseId", caseNumber);
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));
    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function saveCaseStatusFromCenter(caseNumber) {
  const select = document.querySelector(`.case-center-status[data-case-number="${CSS.escape(String(caseNumber))}"]`);
  if (!select) return alert("Could not find the case status field.");
  const status = String(select.value || "").trim();
  if (!status) return alert("Please select a case status.");
  select.disabled = true;
  postOpenCaseUpdate(caseNumber, { Status: status })
    .then(() => loadMerchantOpenCases(currentStoreId))
    .then(() => renderMerchantCaseCenter(currentLead))
    .catch(error => { console.error("Case update error:", error); alert(error.message || "Could not save the case status."); })
    .finally(() => { select.disabled = false; });
}

function addCaseNoteFromCenter(caseNumber) {
  const noteInput = document.querySelector(`.case-center-note[data-case-number="${CSS.escape(String(caseNumber))}"]`);
  if (!noteInput) return alert("Could not find the case note field.");
  const note = String(noteInput.value || "").trim();
  if (!note) return alert("Please enter a note before saving.");
  noteInput.disabled = true;
  postOpenCaseNote(caseNumber, note, getMerchantOwnerName(currentLead))
    .then(() => { noteInput.value = ""; return loadMerchantOpenCases(currentStoreId); })
    .then(() => renderMerchantCaseCenter(currentLead))
    .catch(error => { console.error("Case note error:", error); alert(error.message || "Could not add the case note."); })
    .finally(() => { noteInput.disabled = false; });
}

function deleteCaseFromCenter(caseNumber) {
  if (!confirm(`Delete case ${caseNumber}? This cannot be undone.`)) return;
  postDeleteOpenCase(caseNumber)
    .then(() => loadMerchantOpenCases(currentStoreId))
    .then(() => renderMerchantCaseCenter(currentLead))
    .then(() => loadLeads())
    .catch(error => {
      console.error("Delete case error:", error);
      alert(error.message || "Could not delete the case.");
    });
}


function renderMerchantCases(lead, casesOverride) {
  const c = getEl("merchantCases");
  if (!c) return;
  if (!lead) {
    c.innerHTML = buildMerchantCasesHtml([], false);
    return;
  }
  const storeId = getStoreId(lead);
  const merchantCases = Array.isArray(casesOverride) ? casesOverride.slice() : (String(currentOpenCasesStoreId) === String(storeId) ? currentOpenCases.slice() : []);
  merchantCases.sort((a, b) => (parseFlexibleDateTime(getField(b, ["Last Updated"])) || parseFlexibleDateTime(getField(b, ["Created Date"])) || new Date(0)) - (parseFlexibleDateTime(getField(a, ["Last Updated"])) || parseFlexibleDateTime(getField(a, ["Created Date"])) || new Date(0)));
  c.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
      <div class="subtext" style="color:rgba(243,244,246,0.7);">Open cases for this merchant</div>
      <button type="button" class="btn btn-primary" onclick="openCaseCreateForm()" style="min-width:140px;">Create Case</button>
    </div>
    <div id="caseCreatePanel" style="display:none; margin-bottom:16px;"></div>
    ${buildMerchantCasesHtml(merchantCases, false)}
  `;
}

function renderMerchantCasesAfterLoad() {
  if (!currentLead) return;
  renderMerchantCases(currentLead, currentOpenCases);
}

function openCaseCreateForm() {
  const panel = getEl("caseCreatePanel");
  if (!panel) return;
  const isVisible = panel.style.display === "block";
  if (isVisible) {
    panel.style.display = "none";
    panel.innerHTML = "";
    return;
  }

  const lead = currentLead;
  if (!lead) {
    alert("Select a merchant first.");
    return;
  }

  panel.style.display = "block";
  panel.innerHTML = `
    <div class="drawer-card" style="padding:16px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.02); border-radius:14px; margin-bottom:12px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="font-size:10px; text-transform:uppercase; color:rgba(243,244,246,0.68); display:block; margin-bottom:6px;">Case Number</label>
          <input id="newCaseNumber" type="text" placeholder="718445321" style="width:100%; background:#1e222b; color:#f3f4f6; border:1px solid #2d3139; border-radius:10px; padding:12px 14px;">
        </div>
        <div>
          <label style="font-size:10px; text-transform:uppercase; color:rgba(243,244,246,0.68); display:block; margin-bottom:6px;">Priority</label>
          <select id="newCasePriority" style="width:100%; background:#1e222b; color:#f3f4f6; border:1px solid #2d3139; border-radius:10px; padding:12px 14px;">
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High" selected>High</option>
            <option value="Urgent">Urgent</option>
          </select>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
        <div>
          <label style="font-size:10px; text-transform:uppercase; color:rgba(243,244,246,0.68); display:block; margin-bottom:6px;">Case Subject</label>
          <input id="newCaseSubject" type="text" placeholder="Tablet not receiving orders" style="width:100%; background:#1e222b; color:#f3f4f6; border:1px solid #2d3139; border-radius:10px; padding:12px 14px;">
        </div>
        <div>
          <label style="font-size:10px; text-transform:uppercase; color:rgba(243,244,246,0.68); display:block; margin-bottom:6px;">Case Category</label>
          <select id="newCaseCategory" style="width:100%; background:#1e222b; color:#f3f4f6; border:1px solid #2d3139; border-radius:10px; padding:12px 14px;">
            <option value="">Select category</option>
            <option value="Tablet Issue">Tablet Issue</option>
            <option value="Photo Issue">Photo Issue</option>
            <option value="Video Issue">Video Issue</option>
            <option value="Menu Issue">Menu Issue</option>
            <option value="Support Request">Support Request</option>
            <option value="Billing">Billing</option>
            <option value="Marketing">Marketing</option>
            <option value="Operations">Operations</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div style="margin-top:12px;">
        <label style="font-size:10px; text-transform:uppercase; color:rgba(243,244,246,0.68); display:block; margin-bottom:6px;">Initial Note</label>
        <textarea id="newCaseNotes" rows="4" placeholder="Write the case details here..." style="width:100%; resize:vertical; min-height:110px; background:#1e222b; color:#f3f4f6; border:1px solid #2d3139; border-radius:10px; padding:12px 14px;"></textarea>
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:12px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" onclick="closeCaseCreateForm()" style="min-width:120px;">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="createCaseForCurrentMerchant()" style="min-width:140px;">Save Case</button>
      </div>
    </div>
  `;
}

function closeCaseCreateForm() {
  const panel = getEl("caseCreatePanel");
  if (!panel) return;
  panel.style.display = "none";
  panel.innerHTML = "";
}

function createCaseForCurrentMerchant() {
  if (!currentLead) {
    alert("Select a merchant first.");
    return;
  }

  const numberEl = getEl("newCaseNumber");
  const subjectEl = getEl("newCaseSubject");
  const categoryEl = getEl("newCaseCategory");
  const priorityEl = getEl("newCasePriority");
  const notesEl = getEl("newCaseNotes");

  const caseNumber = String(numberEl?.value || "").trim();
  const caseSubject = String(subjectEl?.value || "").trim();
  const caseCategory = String(categoryEl?.value || "").trim();
  const priority = String(priorityEl?.value || "High").trim() || "High";
  const notes = String(notesEl?.value || "").trim();

  if (!caseNumber) {
    alert("Please enter a case number.");
    return;
  }

  if (!caseSubject) {
    alert("Please enter a case subject.");
    return;
  }

  if (!caseCategory) {
    alert("Please select a case category.");
    return;
  }

  const payload = {
    storeId: getStoreId(currentLead),
    businessId: getField(currentLead, ["Business Id", "Business ID"]),
    businessName: getField(currentLead, ["Business Name"]),
    caseNumber,
    caseSubject,
    caseCategory,
    priority,
    notes,
    owner: getMerchantOwnerName(currentLead) || "Esteban Golfin"
  };

  const btn = document.querySelector("#caseCreatePanel .btn-primary");
  if (btn) btn.disabled = true;

  postCreateOpenCase(payload)
    .then(() => loadMerchantOpenCases(currentStoreId))
    .then(() => {
      closeCaseCreateForm();
      renderMerchantCases(currentLead, currentOpenCases);
      loadLeads();
    })
    .catch(error => {
      console.error("Create case error:", error);
      alert(error.message || "Could not create the case.");
    })
    .finally(() => {
      if (btn) btn.disabled = false;
    });
}

function renderMerchantCaseCard(caseItem) {
  const caseId = getField(caseItem, ["Case ID", "Case Id", "Case Number", "Case number"]);
  const caseSubject = getField(caseItem, ["Case Subject", "Subject"]) || getField(caseItem, ["Case Type"]) || "Open Case";
  const caseCategory = getField(caseItem, ["Case Category", "Case Type"]) || "Other";
  const status = getField(caseItem, ["Status"]) || "Open";
  const priority = getField(caseItem, ["Priority"]);
  const createdDateValue = getField(caseItem, ["Created Date"]);
  const lastUpdatedValue = getField(caseItem, ["Last Updated"]);
  const owner = getField(caseItem, ["Owner"]);
  const notes = getField(caseItem, ["Notes"]);
  const businessName = getField(caseItem, ["Business Name"]);
  const storeId = getField(caseItem, ["Store ID", "Store Id"]);
  const statusOptions = OPEN_CASE_STATUSES.map(option => `<option value="${escapeHtml(option)}" ${String(option).toLowerCase() === String(status).trim().toLowerCase() ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");

  return `
    <div class="drawer-card merchant-case-card" data-case-id="${escapeHtml(caseId)}" style="margin-top:12px; padding:18px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.02); border-radius:14px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; margin-bottom:14px;">
        <div>
          <strong style="font-size:16px; display:block; margin-bottom:4px;">${escapeHtml(caseSubject)}</strong>
          <span class="subtext" style="color:rgba(243,244,246,0.72); font-size:12px;">Case Number: ${escapeHtml(caseId)} • Category: ${escapeHtml(caseCategory)} • Priority: ${escapeHtml(priority)} • Store ID: ${escapeHtml(storeId)}</span>
        </div>
        <div style="min-width:220px; flex:0 0 220px;">
          <label style="font-size:10px; text-transform:uppercase; display:block; margin-bottom:6px; color:rgba(243,244,246,0.68); letter-spacing:0.06em;">Status</label>
          <select class="case-status-select" data-case-id="${escapeHtml(caseId)}" style="width:100%; appearance:none; background:#1e222b; color:#f3f4f6; border:1px solid #2d3139; border-radius:10px; padding:12px 14px; font-size:14px; line-height:1.2; box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);">
            ${statusOptions}
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px 18px; margin-top:4px;">
        <div><strong>Business Name:</strong> ${escapeHtml(businessName)}</div>
        <div><strong>Owner:</strong> ${escapeHtml(owner)}</div>
        <div><strong>Created Date:</strong> ${escapeHtml(formatDisplayDate(createdDateValue))}</div>
        <div><strong>Last Updated:</strong> ${escapeHtml(formatDisplayDate(lastUpdatedValue))}</div>
      </div>

      <div style="margin-top:14px;">
        <strong style="display:block; margin-bottom:8px;">Notes</strong>
        <div style="white-space:pre-wrap; padding:12px 14px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#f3f4f6; line-height:1.5;">${escapeHtml(notes || "No notes yet.")}</div>
      </div>

      <div style="margin-top:14px;">
        <label style="font-size:10px; text-transform:uppercase; display:block; margin-bottom:6px; color:rgba(243,244,246,0.68); letter-spacing:0.06em;">Add Note</label>
        <textarea
          class="case-new-note"
          data-case-id="${escapeHtml(caseId)}"
          rows="4"
          placeholder="Add a note for this case..."
          style="width:100%; resize:vertical; min-height:110px; background:#1e222b; color:#f3f4f6; border:1px solid #2d3139; border-radius:10px; padding:12px 14px; font-size:14px; line-height:1.45; box-shadow:inset 0 1px 0 rgba(255,255,255,0.03); outline:none;"
        ></textarea>
      </div>

      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" onclick="saveCaseStatus('${escapeJs(caseId)}')" style="min-width:120px;">Save Status</button>
        <button type="button" class="btn btn-primary" onclick="addCaseNote('${escapeJs(caseId)}')" style="min-width:120px;">Add Note</button>
      </div>
    </div>
  `;
}

function renderMerchantCases(lead, casesOverride) {
  const c = getEl("merchantCases");
  if (!c) return;
  if (!lead) {
    c.innerHTML = buildMerchantCasesHtml([], false);
    return;
  }
  const storeId = getStoreId(lead);
  const merchantCases = Array.isArray(casesOverride) ? casesOverride.slice() : (String(currentOpenCasesStoreId) === String(storeId) ? currentOpenCases.slice() : []);
  merchantCases.sort((a, b) => (parseFlexibleDateTime(getField(b, ["Last Updated"])) || parseFlexibleDateTime(getField(b, ["Created Date"])) || new Date(0)) - (parseFlexibleDateTime(getField(a, ["Last Updated"])) || parseFlexibleDateTime(getField(a, ["Created Date"])) || new Date(0)));
  c.innerHTML = buildMerchantCasesHtml(merchantCases, false);
}

function renderMerchantCaseCard(caseItem) {
  const caseId = getField(caseItem, ["Case ID", "Case Id"]);
  const caseType = getField(caseItem, ["Case Type"]) || "Open Case";
  const status = getField(caseItem, ["Status"]) || "Open";
  const priority = getField(caseItem, ["Priority"]);
  const createdDateValue = getField(caseItem, ["Created Date"]);
  const lastUpdatedValue = getField(caseItem, ["Last Updated"]);
  const owner = getField(caseItem, ["Owner"]);
  const notes = getField(caseItem, ["Notes"]);
  const businessName = getField(caseItem, ["Business Name"]);
  const storeId = getField(caseItem, ["Store ID", "Store Id"]);
  const statusOptions = OPEN_CASE_STATUSES.map(option => `<option value="${escapeHtml(option)}" ${String(option).toLowerCase() === String(status).trim().toLowerCase() ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");

  return `
    <div class="drawer-card merchant-case-card" data-case-id="${escapeHtml(caseId)}" style="margin-top:12px; padding:18px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.02); border-radius:14px;">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; margin-bottom:14px;">
        <div>
          <strong style="font-size:16px; display:block; margin-bottom:4px;">${escapeHtml(caseType)}</strong>
          <span class="subtext" style="color:rgba(243,244,246,0.72); font-size:12px;">Case ID: ${escapeHtml(caseId)} • Priority: ${escapeHtml(priority)} • Store ID: ${escapeHtml(storeId)}</span>
        </div>
        <div style="min-width:220px; flex:0 0 220px;">
          <label style="font-size:10px; text-transform:uppercase; display:block; margin-bottom:6px; color:rgba(243,244,246,0.68); letter-spacing:0.06em;">Status</label>
          <select class="case-status-select" data-case-id="${escapeHtml(caseId)}" style="width:100%; appearance:none; background:#1e222b; color:#f3f4f6; border:1px solid #2d3139; border-radius:10px; padding:12px 14px; font-size:14px; line-height:1.2; box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);">
            ${statusOptions}
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px 18px; margin-top:4px;">
        <div><strong>Business Name:</strong> ${escapeHtml(businessName)}</div>
        <div><strong>Owner:</strong> ${escapeHtml(owner)}</div>
        <div><strong>Created Date:</strong> ${escapeHtml(formatDisplayDate(createdDateValue))}</div>
        <div><strong>Last Updated:</strong> ${escapeHtml(formatDisplayDate(lastUpdatedValue))}</div>
      </div>

      <div style="margin-top:14px;">
        <strong style="display:block; margin-bottom:8px;">Notes</strong>
        <div style="white-space:pre-wrap; padding:12px 14px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); border-radius:10px; color:#f3f4f6; line-height:1.5;">${escapeHtml(notes || "No notes yet.")}</div>
      </div>

      <div style="margin-top:14px;">
        <label style="font-size:10px; text-transform:uppercase; display:block; margin-bottom:6px; color:rgba(243,244,246,0.68); letter-spacing:0.06em;">Add Note</label>
        <textarea
          class="case-new-note"
          data-case-id="${escapeHtml(caseId)}"
          rows="4"
          placeholder="Add a note for this case..."
          style="width:100%; resize:vertical; min-height:110px; background:#1e222b; color:#f3f4f6; border:1px solid #2d3139; border-radius:10px; padding:12px 14px; font-size:14px; line-height:1.45; box-shadow:inset 0 1px 0 rgba(255,255,255,0.03); outline:none;"
        ></textarea>
      </div>

      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" onclick="saveCaseStatus('${escapeJs(caseId)}')" style="min-width:120px;">Save Status</button>
        <button type="button" class="btn btn-primary" onclick="addCaseNote('${escapeJs(caseId)}')" style="min-width:120px;">Add Note</button>
      </div>
    </div>
  `;
}

function buildMerchantAssetsHtml(assets, isLoading) {
  const assetList = Array.isArray(assets) ? assets : [];
  if (isLoading) return `<div class="empty-state">Loading assets...</div>`;
  if (!assetList.length) return `<div class="empty-state">No assets selected.</div>`;
  return `<div class="merchant-assets-list">${assetList.map(renderMerchantAssetCard).join("")}</div>`;
}

function renderMerchantAssets(lead, assetsOverride) {
  const c = getEl("merchantAssets");
  if (!c) return;
  if (!lead) {
    c.innerHTML = buildMerchantAssetsHtml([], false);
    return;
  }
  const storeId = getStoreId(lead);
  const merchantAssets = Array.isArray(assetsOverride) ? assetsOverride.slice() : currentAssets.filter(a => String(getField(a, ["Store ID", "Store Id"])) === String(storeId));
  merchantAssets.sort((a, b) => (parseFlexibleDateTime(getField(b, ["Last Updated"])) || parseFlexibleDateTime(getField(b, ["Created Date"])) || new Date(0)) - (parseFlexibleDateTime(getField(a, ["Last Updated"])) || parseFlexibleDateTime(getField(a, ["Created Date"])) || new Date(0)));
  c.innerHTML = buildMerchantAssetsHtml(merchantAssets, false);
}

function renderMerchantAssetCard(asset) {
  return `
    <div class="drawer-card merchant-asset-card" style="margin-top:12px;">
      <strong>${escapeHtml(getField(asset, ["Asset Type"]) || "Asset")}</strong><br>
      <span class="subtext">${escapeHtml(getField(asset, ["Asset Name"]))} • ${escapeHtml(getField(asset, ["Status"]))}</span>
      <div style="margin-top:8px;">
        <div><strong>Business Name:</strong> ${escapeHtml(getField(asset, ["Business Name"]))}</div>
        <div><strong>Owner:</strong> ${escapeHtml(getField(asset, ["Owner"]))}</div>
        <div><strong>Created Date:</strong> ${escapeHtml(formatDisplayDate(getField(asset, ["Created Date"])))}</div>
        <div><strong>Last Updated:</strong> ${escapeHtml(formatDisplayDate(getField(asset, ["Last Updated"])))}</div>
      </div>
      <div style="margin-top:8px; white-space:pre-wrap;">${escapeHtml(getField(asset, ["Notes"]))}</div>
    </div>
  `;
}

function syncActivityFormWithLead(lead) {
  const form = getEl("activityForm");
  const owner = getEl("activityOwner");
  const ts = getEl("activityTimestamp");
  if (form) form.reset();
  if (owner) owner.value = getMerchantOwnerName(lead) || "Esteban Golfin";
  if (ts) ts.value = getCurrentLocalDateTimeValue();
  setActivityStatus("Ready to log an activity for this merchant.");
}

function syncLeadManagementFormWithLead(lead) {
  const leadStatus = getEl("leadStatus");
  const leadOwner = getEl("leadOwner");
  const leadNextFollowUp = getEl("leadNextFollowUp");
  const leadPriorityScore = getEl("leadPriorityScore");
  const leadPipelineStage = getEl("leadPipelineStage");
  if (leadStatus) leadStatus.value = getField(lead, ["Lead Status"]) || "";
  if (leadOwner) leadOwner.value = getMerchantOwnerName(lead) || "Esteban Golfin";
  if (leadNextFollowUp) leadNextFollowUp.value = toDateInputValue(getField(lead, ["Next Follow-Up"]));
  if (leadPriorityScore) leadPriorityScore.value = getField(lead, ["Priority Score"]) || "";
  if (leadPipelineStage) leadPipelineStage.value = getField(lead, ["Pipeline Stage"]) || "";
  setLeadUpdateStatus("");
}

function applyQuickTemplate(template) {
  const activityType = getEl("activityType");
  const activityOutcome = getEl("activityOutcome");
  const activityNotes = getEl("activityNotes");
  const activityTimestamp = getEl("activityTimestamp");
  const activityOwner = getEl("activityOwner");
  if (activityTimestamp) activityTimestamp.value = getCurrentLocalDateTimeValue();
  if (activityOwner && (!activityOwner.value || !activityOwner.value.trim())) activityOwner.value = getMerchantOwnerName(currentLead) || "Esteban Golfin";
  if (template === "quick-note") { if (activityType) activityType.value = "Follow-Up"; if (activityOutcome) activityOutcome.value = "Follow Up"; if (activityNotes) activityNotes.focus(); setActivityStatus("Quick Note template loaded."); return; }
  if (template === "call") { if (activityType) activityType.value = "Call"; if (activityOutcome) activityOutcome.value = "Follow Up"; if (activityNotes) activityNotes.focus(); setActivityStatus("Call template loaded."); return; }
  if (template === "email") { if (activityType) activityType.value = "Email"; if (activityOutcome) activityOutcome.value = "Follow Up"; if (activityNotes) activityNotes.focus(); setActivityStatus("Email template loaded."); return; }
}

function renderCurrentMerchantView(lead) {
  const drawerTitle = getEl("drawerTitle");
  const drawerSubtitle = getEl("drawerSubtitle");
  const merchantOverview = getEl("merchantOverview");
  const activityMerchantContext = getEl("activityMerchantContext");
  if (drawerTitle) drawerTitle.textContent = getField(lead, ["Business Name"]) || "Merchant 360";
  if (drawerSubtitle) drawerSubtitle.textContent = `Store ID: ${getStoreId(lead)}`;
  if (merchantOverview) merchantOverview.innerHTML = buildMerchantOverviewHtml(lead);
  if (activityMerchantContext) activityMerchantContext.innerHTML = buildActivityContextHtml(lead);
  const merchantCases = getMerchantCasesContainer();
  if (merchantCases) merchantCases.innerHTML = buildMerchantCasesHtml([], true);
  const merchantAssets = getMerchantAssetsContainer();
  if (merchantAssets) merchantAssets.innerHTML = buildMerchantAssetsHtml([], true);
  renderMerchantTimeline(lead);
  syncLeadManagementFormWithLead(lead);
  const storeId = getStoreId(lead);
  if (storeId) {
    loadMerchantOpenCases(storeId);
    loadMerchantAssets(storeId);
  }
}

function openMerchantDrawer(storeId) {
  if (!storeId) return;
  const lead = allLeads.find(item => String(getStoreId(item)) === String(storeId));
  if (!lead) { console.error("Lead not found for storeId:", storeId); return; }
  currentLead = lead;
  currentStoreId = String(storeId).trim();
  currentOpenCases = [];
  currentAssets = [];
  currentOpenCasesStoreId = currentStoreId;
  renderCurrentMerchantView(lead);
  syncActivityFormWithLead(lead);
  const drawer = getEl("merchantDrawer");
  if (drawer) { drawer.classList.add("open"); drawer.style.display = ""; }
  loadMerchantActivities(storeId);
}

function closeMerchantDrawer() {
  const drawer = getEl("merchantDrawer");
  if (drawer) { drawer.classList.remove("open"); drawer.style.display = ""; }
}

function renderLeads(leads) {
  const c = getEl("leadTableContainer");
  if (!c) return;
  if (!Array.isArray(leads) || leads.length === 0) { c.innerHTML = `<div class="empty-state">No leads found.</div>`; return; }
  const rows = leads.map(lead => {
    const storeId = getStoreId(lead);
    return `
      <tr class="lead-row" data-store-id="${escapeHtml(storeId)}">
        <td><button type="button" class="merchant-link" data-store-id="${escapeHtml(storeId)}">${escapeHtml(getField(lead, ["Business Name"]))}</button></td>
        <td>${escapeHtml(storeId)}</td>
        <td>${escapeHtml(getField(lead, ["Business Id", "Business ID"]))}</td>
        <td>${escapeHtml(getField(lead, ["Rx Name"]))}</td>
        <td>${escapeHtml(getField(lead, ["GMV"]))}</td>
        <td>${escapeHtml(formatCoverage(getField(lead, ["Photo Coverage"])))}</td>
        <td>${escapeHtml(formatCoverage(getField(lead, ["Description Coverage"])))}</td>
        <td>${escapeHtml(formatCoverage(getField(lead, ["Uptime"])))}</td>
        <td>${escapeHtml(getField(lead, ["Promo Opp"]))}</td>
        <td>${escapeHtml(getField(lead, ["SI Opp"]))}</td>
        <td>${escapeHtml(getField(lead, ["Lead Status"]))}</td>
        <td>${escapeHtml(String(getMerchantPriorityScore(lead)))}</td>
      </tr>
    `;
  }).join("");
  c.innerHTML = `
    <table class="lead-table">
      <thead>
        <tr>
          <th>Business Name</th><th>Store ID</th><th>Business ID</th><th>Rx Name</th><th>GMV</th><th>Photo Coverage</th><th>Description Coverage</th><th>Uptime</th><th>Promo Opp</th><th>SI Opp</th><th>Lead Status</th><th>Priority Score</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderActivities(activities) {
  const c = getEl("activityContainer");
  if (!c) return;
  if (!Array.isArray(activities) || activities.length === 0) { c.innerHTML = `<div class="empty-state">No activities found yet.</div>`; return; }
  const latest = activities.slice().reverse().slice(0, 5);
  const rows = latest.map(a => `
    <tr>
      <td>${escapeHtml(getField(a, ["Timestamp"]))}</td>
      <td>${escapeHtml(getField(a, ["Store ID", "Store Id"]))}</td>
      <td>${escapeHtml(getField(a, ["Business Name"]))}</td>
      <td>${escapeHtml(getField(a, ["Activity Type"]))}</td>
      <td>${escapeHtml(getField(a, ["Notes"]))}</td>
      <td>${escapeHtml(getField(a, ["Outcome"]))}</td>
      <td>${escapeHtml(getField(a, ["Owner"]))}</td>
      <td>${escapeHtml(getField(a, ["Next Follow-Up"]))}</td>
    </tr>
  `).join("");
  c.innerHTML = `
    <table class="activity-table">
      <thead><tr><th>Timestamp</th><th>Store ID</th><th>Business Name</th><th>Activity Type</th><th>Notes</th><th>Outcome</th><th>Owner</th><th>Next Follow-Up</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function openFollowUpModal(mode) {
  const modal = getEl("followUpModal");
  const title = getEl("followUpModalTitle");
  const subtitle = getEl("followUpModalSubtitle");
  const body = getEl("followUpModalBody");
  if (!modal || !title || !subtitle || !body) return;
  let items = [];
  if (mode === "followups") { title.textContent = "Today's Follow-Ups"; subtitle.textContent = "Oldest follow-up first"; items = getFollowUpQueueItems(); }
  else { title.textContent = "Top Merchants To Contact"; subtitle.textContent = "Ranked by urgency and opportunity"; items = getTopMerchantItems(); }
  body.innerHTML = items.length ? `<div class="followup-modal-list">${items.map(lead => renderFollowUpModalItem(lead, mode)).join("")}</div>` : `<div class="followup-modal-empty">No records found.</div>`;
  modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
}

function closeFollowUpModal() {
  const modal = getEl("followUpModal");
  if (!modal) return;
  modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
}

function getFollowUpQueueItems() {
  const today = getTodayDateString();
  return allLeads.map(lead => {
    const dueDate = getDateComparableValue(getField(lead, ["Next Follow-Up"]));
    return Object.assign({}, lead, { __storeId: getStoreId(lead), __dueDate: dueDate, __statusLabel: dueDate && dueDate < today ? "OVERDUE" : "DUE TODAY" });
  }).filter(lead => lead.__dueDate && lead.__dueDate <= today).sort((a, b) => a.__dueDate.localeCompare(b.__dueDate));
}

function getTopMerchantItems() {
  return allLeads.map(lead => Object.assign({}, lead, { __storeId: getStoreId(lead), __priority: getMerchantPriorityScore(lead), __gmv: parseNumeric(getField(lead, ["GMV"])) }))
    .sort((a, b) => b.__priority - a.__priority || b.__gmv - a.__gmv || String(getField(a, ["Business Name"])).toLowerCase().localeCompare(String(getField(b, ["Business Name"])).toLowerCase()))
    .slice(0, 10);
}

function renderFollowUpModalItem(lead, mode) {
  const storeId = lead.__storeId || getStoreId(lead);
  const priority = getMerchantPriorityScore(lead);
  const badgeText = mode === "followups" ? (lead.__statusLabel || "DUE") : `PRIORITY ${String(priority)}`;
  return `
    <div class="followup-modal-item">
      <button type="button" class="merchant-link" data-store-id="${escapeHtml(storeId)}">${escapeHtml(getField(lead, ["Business Name"]))}</button>
      <div class="item-meta">Store ID: ${escapeHtml(storeId)} | Owner: ${escapeHtml(getMerchantOwnerName(lead))}</div>
      <div class="item-meta">Next Follow-Up: ${escapeHtml(formatDisplayDate(getField(lead, ["Next Follow-Up"])))}</div>
      <div class="item-meta">Last Activity: ${escapeHtml(getLatestActivityForStoreId(storeId))}</div>
      <div class="item-meta">Lead Status: ${escapeHtml(getField(lead, ["Lead Status"]))}</div>
      <span class="item-badge">${escapeHtml(badgeText)}</span>
    </div>
  `;
}

function renderOpenCaseCardInTimeline(caseItem) {
  return buildMerchantCaseTimelineEntry(caseItem);
}

function applyFiltersAndSort() {
  const searchInput = getEl("merchantSearch");
  const sortSelect = getEl("sortSelect");
  const searchTerm = (searchInput?.value || "").trim().toLowerCase();
  const sortValue = sortSelect?.value || "businessName";
  let results = allLeads.filter(lead => {
    const text = [
      getField(lead, ["Business Name"]),
      getField(lead, ["Store Id", "Store ID"]),
      getField(lead, ["Business Id", "Business ID"]),
      getField(lead, ["Rx Name"]),
      getField(lead, ["Ultimate Parent Name"])
    ].join(" ").toLowerCase();
    return text.includes(searchTerm);
  });
  results.sort((a, b) => {
    if (sortValue === "gmv") return parseNumeric(getField(b, ["GMV"])) - parseNumeric(getField(a, ["GMV"]));
    if (sortValue === "priority") return getMerchantPriorityScore(b) - getMerchantPriorityScore(a);
    if (sortValue === "coverage") return getCoverageScore(b) - getCoverageScore(a);
    return String(getField(a, ["Business Name"]) || "").toLowerCase().localeCompare(String(getField(b, ["Business Name"]) || "").toLowerCase());
  });
  filteredLeads = results;
  renderLeads(filteredLeads);
}

function loadLeads() {
  return new Promise(resolve => {
    const callbackName = "handleLeadsResponse_" + Date.now();
    const script = document.createElement("script");
    window[callbackName] = response => {
      try {
        if (!response.success) { renderLeadError(response.message); setConnectionStatus(false); resolve([]); return; }
        allLeads = Array.isArray(response.data) ? response.data : [];
        filteredLeads = allLeads.slice();
        setConnectionStatus(true);
        updateMetrics();
        applyFiltersAndSort();
        renderFollowUpCommandCenter();
        if (currentStoreId) {
          const refreshedLead = allLeads.find(item => String(getStoreId(item)) === String(currentStoreId));
          if (refreshedLead) { currentLead = refreshedLead; renderCurrentMerchantView(currentLead); }
        }
        resolve(allLeads);
      } finally { delete window[callbackName]; script.remove(); }
    };
    script.src = `${API_URL}?action=getLeads&callback=${callbackName}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function loadActivities() {
  return new Promise(resolve => {
    const callbackName = "handleActivitiesResponse_" + Date.now();
    const script = document.createElement("script");
    window[callbackName] = response => {
      try {
        if (!response.success) { renderActivityError(response.message); resolve([]); return; }
        allActivities = Array.isArray(response.data) ? response.data : [];
        renderActivities(allActivities);
        if (currentLead) renderMerchantTimeline(currentLead);
        updateMetrics();
        resolve(allActivities);
      } finally { delete window[callbackName]; script.remove(); }
    };
    script.src = `${API_URL}?action=getActivities&callback=${callbackName}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function loadMerchantActivities(storeId) {
  return new Promise(resolve => {
    const callbackName = "handleMerchantActivities_" + Date.now();
    const script = document.createElement("script");
    window[callbackName] = response => {
      try {
        const merchantActivity = getEl("merchantActivity");
        if (!response.success) { if (merchantActivity) merchantActivity.innerHTML = `<div class="error-state">Unable to load merchant activity.</div>`; resolve([]); return; }
        const activities = Array.isArray(response.data) ? response.data : [];
        if (merchantActivity) {
          if (!activities.length) merchantActivity.innerHTML = `<div class="empty-state">No merchant-specific activities found.</div>`;
          else merchantActivity.innerHTML = activities.slice().reverse().map(activity => `
            <div class="drawer-card merchant-activity-item" style="margin-top:12px;">
              <strong>${escapeHtml(getField(activity, ["Activity Type"]))}</strong><br>
              <span class="subtext">${escapeHtml(getField(activity, ["Timestamp"]))}</span><br>
              <div style="margin-top:8px;">${escapeHtml(getField(activity, ["Notes"]))}</div>
              <div style="margin-top:8px;" class="subtext">Outcome: ${escapeHtml(getField(activity, ["Outcome"]))} | Owner: ${escapeHtml(getField(activity, ["Owner"]))}</div>
            </div>
          `).join("");
        }
        if (currentLead) renderMerchantTimeline(currentLead, activities, currentOpenCases);
        resolve(activities);
      } finally { delete window[callbackName]; script.remove(); }
    };
    script.src = `${API_URL}?action=getActivitiesByStoreId&storeId=${encodeURIComponent(storeId)}&callback=${callbackName}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function loadMerchantOpenCases(storeId) {
  return new Promise(resolve => {
    if (!storeId) { currentOpenCases = []; currentOpenCasesStoreId = ""; renderMerchantCases(null, []); resolve([]); return; }
    const requestedStoreId = String(storeId).trim();
    const callbackName = "handleMerchantOpenCases_" + Date.now();
    const script = document.createElement("script");
    window[callbackName] = response => {
      try {
        const merchantOverview = getEl("merchantOverview");
        const merchantCases = getMerchantCasesContainer();
        if (!response.success) {
          console.error("Open cases load failed:", response.message);
          currentOpenCases = [];
          currentOpenCasesStoreId = requestedStoreId;
          if (merchantOverview && currentLead && String(getStoreId(currentLead)) === requestedStoreId) merchantOverview.innerHTML = buildMerchantOverviewHtml(currentLead) + buildOpenCasesHtml(currentLead, [], false);
          if (merchantCases && currentLead && String(getStoreId(currentLead)) === requestedStoreId) merchantCases.innerHTML = buildMerchantCasesHtml([], false);
          if (currentLead && String(getStoreId(currentLead)) === requestedStoreId) renderMerchantTimeline(currentLead);
          resolve([]);
          return;
        }
        const cases = Array.isArray(response.data) ? response.data : [];
        allOpenCases = cases.slice();
        currentOpenCases = cases.slice();
        currentOpenCasesStoreId = requestedStoreId;
        if (merchantOverview && currentLead && String(getStoreId(currentLead)) === requestedStoreId) merchantOverview.innerHTML = buildMerchantOverviewHtml(currentLead) + buildOpenCasesHtml(currentLead, currentOpenCases, false);
        if (merchantCases && currentLead && String(getStoreId(currentLead)) === requestedStoreId) merchantCases.innerHTML = buildMerchantCasesHtml(currentOpenCases, false);
        if (currentLead && String(getStoreId(currentLead)) === requestedStoreId) renderMerchantTimeline(currentLead);
        resolve(cases);
      } finally { delete window[callbackName]; script.remove(); }
    };
    const params = new URLSearchParams();
    params.set("action", "getOpenCasesByStoreId");
    params.set("storeId", requestedStoreId);
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));
    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function loadMerchantAssets(storeId) {
  return new Promise(resolve => {
    if (!storeId) { currentAssets = []; renderMerchantAssets(null, []); resolve([]); return; }
    const requestedStoreId = String(storeId).trim();
    const callbackName = "handleMerchantAssets_" + Date.now();
    const script = document.createElement("script");
    window[callbackName] = response => {
      try {
        const merchantAssets = getMerchantAssetsContainer();
        if (!response.success) { currentAssets = []; if (merchantAssets) merchantAssets.innerHTML = buildMerchantAssetsHtml([], false); resolve([]); return; }
        const assets = Array.isArray(response.data) ? response.data : [];
        allAssets = assets.slice();
        currentAssets = assets.filter(a => String(getField(a, ["Store ID", "Store Id"])) === requestedStoreId);
        if (merchantAssets && currentLead && String(getStoreId(currentLead)) === requestedStoreId) merchantAssets.innerHTML = buildMerchantAssetsHtml(currentAssets, false);
        resolve(currentAssets);
      } finally { delete window[callbackName]; script.remove(); }
    };
    const params = new URLSearchParams();
    params.set("action", "getAssetsByStoreId");
    params.set("storeId", requestedStoreId);
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));
    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function postUpdateLead(storeId, updates) {
  return new Promise((resolve, reject) => {
    const callbackName = "handleUpdateLead_" + Date.now();
    const script = document.createElement("script");
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Lead update request timed out.")); }, 20000);
    function cleanup() { clearTimeout(timeout); delete window[callbackName]; if (script.parentNode) script.parentNode.removeChild(script); }
    window[callbackName] = response => { try { if (!response || !response.success) { reject(new Error((response && response.message) || "Failed to update lead.")); return; } resolve(response); } finally { cleanup(); } };
    const params = new URLSearchParams();
    params.set("action", "updateLead");
    params.set("storeId", storeId);
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));
    Object.keys(updates || {}).forEach(key => params.set(key, updates[key]));
    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function postActivity(payload) {
  return new Promise((resolve, reject) => {
    const callbackName = "handleSaveActivity_" + Date.now();
    const script = document.createElement("script");
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Save activity request timed out.")); }, 20000);
    function cleanup() { clearTimeout(timeout); delete window[callbackName]; if (script.parentNode) script.parentNode.removeChild(script); }
    window[callbackName] = response => { try { if (!response || !response.success) { reject(new Error((response && response.message) || "Failed to save activity.")); return; } resolve(response); } finally { cleanup(); } };
    const params = new URLSearchParams();
    params.set("action", "saveActivity");
    params.set("data", JSON.stringify(payload));
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));
    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function postOpenCaseUpdate(caseId, updates) {
  return new Promise((resolve, reject) => {
    const callbackName = "handleUpdateOpenCase_" + Date.now();
    const script = document.createElement("script");
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Case update request timed out.")); }, 20000);
    function cleanup() { clearTimeout(timeout); delete window[callbackName]; if (script.parentNode) script.parentNode.removeChild(script); }
    window[callbackName] = response => { try { if (!response || !response.success) { reject(new Error((response && response.message) || "Failed to update case.")); return; } resolve(response); } finally { cleanup(); } };
    const params = new URLSearchParams();
    params.set("action", "updateOpenCase");
    params.set("caseId", caseId);
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));
    Object.keys(updates || {}).forEach(key => params.set(key, updates[key]));
    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function postOpenCaseNote(caseId, note, owner) {
  return new Promise((resolve, reject) => {
    const callbackName = "handleAddOpenCaseNote_" + Date.now();
    const script = document.createElement("script");
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Case note request timed out.")); }, 20000);
    function cleanup() { clearTimeout(timeout); delete window[callbackName]; if (script.parentNode) script.parentNode.removeChild(script); }
    window[callbackName] = response => { try { if (!response || !response.success) { reject(new Error((response && response.message) || "Failed to add case note.")); return; } resolve(response); } finally { cleanup(); } };
    const params = new URLSearchParams();
    params.set("action", "addOpenCaseNote");
    params.set("caseId", caseId);
    params.set("note", note);
    params.set("owner", owner || "");
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));
    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function postCreateOpenCase(payload) {
  return new Promise((resolve, reject) => {
    const callbackName = "handleCreateOpenCase_" + Date.now();
    const script = document.createElement("script");
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Case create request timed out.")); }, 20000);
    function cleanup() { clearTimeout(timeout); delete window[callbackName]; if (script.parentNode) script.parentNode.removeChild(script); }
    window[callbackName] = response => { try { if (!response || !response.success) { reject(new Error((response && response.message) || "Failed to create case.")); return; } resolve(response); } finally { cleanup(); } };
    const params = new URLSearchParams();
    params.set("action", "createOpenCase");
    params.set("data", JSON.stringify(payload));
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));
    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function saveCaseStatus(caseId) {
  const caseIdStr = String(caseId).trim();
  const select = Array.from(document.querySelectorAll(".case-status-select")).find(el => String(el.dataset.caseId).trim() === caseIdStr);
  if (!select) return alert("Could not find the case status field.");
  const status = String(select.value || "").trim();
  if (!status) return alert("Please select a case status.");
  select.disabled = true;
  postOpenCaseUpdate(caseIdStr, { Status: status })
    .then(() => loadMerchantOpenCases(currentStoreId))
    .catch(error => { console.error("Case update error:", error); alert(error.message || "Could not save the case status."); })
    .finally(() => { select.disabled = false; });
}

function addCaseNote(caseId) {
  const caseIdStr = String(caseId).trim();
  const noteInput = Array.from(document.querySelectorAll(".case-new-note")).find(el => String(el.dataset.caseId).trim() === caseIdStr);
  if (!noteInput) return alert("Could not find the case note field.");
  const note = String(noteInput.value || "").trim();
  if (!note) return alert("Please enter a note before saving.");
  noteInput.disabled = true;
  postOpenCaseNote(caseIdStr, note, getMerchantOwnerName(currentLead))
    .then(() => { noteInput.value = ""; return loadMerchantOpenCases(currentStoreId); })
    .catch(error => { console.error("Case note error:", error); alert(error.message || "Could not add the case note."); })
    .finally(() => { noteInput.disabled = false; });
}

function handleActivitySubmit(event) {
  event.preventDefault();
  if (!currentLead) return setActivityStatus("Select a merchant before saving an activity.", true);
  const activityType = getEl("activityType")?.value.trim() || "";
  const activityOutcome = getEl("activityOutcome")?.value.trim() || "";
  const activityNextFollowUp = getEl("activityNextFollowUp")?.value || "";
  const activityNotes = getEl("activityNotes")?.value.trim() || "";
  const activityOwnerInput = getEl("activityOwner");
  const activityTimestampInput = getEl("activityTimestamp");
  const activityOwner = activityOwnerInput?.value.trim() || getMerchantOwnerName(currentLead) || "Esteban Golfin";
  const activityTimestamp = activityTimestampInput?.value || getCurrentLocalDateTimeValue();
  const storeId = getStoreId(currentLead);
  if (!activityType || !activityOutcome || !activityNotes) return setActivityStatus("Please complete Activity Type, Outcome, and Notes.", true);
  const saveButton = getEl("activitySaveBtn");
  if (saveButton) saveButton.disabled = true;
  const payload = {
    "Timestamp": activityTimestamp,
    "Store ID": storeId,
    "Business ID": getField(currentLead, ["Business Id", "Business ID"]),
    "Business Name": getField(currentLead, ["Business Name"]),
    "Activity Type": activityType,
    "Notes": activityNotes,
    "Outcome": activityOutcome,
    "Owner": activityOwner,
    "Next Follow-Up": activityNextFollowUp
  };
  setActivityStatus("Saving activity...");
  postActivity(payload)
    .then(() => refreshAfterActivitySave(storeId))
    .then(() => {
      const form = getEl("activityForm"); if (form) form.reset();
      if (activityOwnerInput) activityOwnerInput.value = activityOwner;
      if (activityTimestampInput) activityTimestampInput.value = getCurrentLocalDateTimeValue();
      syncActivityFormWithLead(currentLead);
      setActivityStatus("Activity saved successfully.");
    })
    .catch(error => { console.error("Save activity error:", error); setActivityStatus("Activity submitted, but refresh failed. Please check the Activity Log.", true); })
    .finally(() => { if (saveButton) saveButton.disabled = false; });
}

function handleLeadManagementSubmit(event) {
  event.preventDefault();
  if (!currentLead) return setLeadUpdateStatus("Select a merchant before saving lead updates.", true);
  const storeId = getStoreId(currentLead);
  const updates = {
    "Lead Status": getEl("leadStatus")?.value || "",
    "Owner": getEl("leadOwner")?.value.trim() || "",
    "Next Follow-Up": getEl("leadNextFollowUp")?.value || "",
    "Priority Score": getEl("leadPriorityScore")?.value || "",
    "Pipeline Stage": getEl("leadPipelineStage")?.value || ""
  };
  const saveButton = getEl("leadSaveBtn");
  if (saveButton) saveButton.disabled = true;
  setLeadUpdateStatus("Saving lead updates...");
  postUpdateLead(storeId, updates)
    .then(() => loadLeads())
    .then(() => {
      const refreshedLead = allLeads.find(item => String(getStoreId(item)) === String(storeId));
      if (refreshedLead) { currentLead = refreshedLead; renderCurrentMerchantView(refreshedLead); syncLeadManagementFormWithLead(refreshedLead); }
      setLeadUpdateStatus("Lead updated successfully.");
    })
    .catch(error => { console.error("Lead update error:", error); setLeadUpdateStatus("Lead update failed. Please try again.", true); })
    .finally(() => { if (saveButton) saveButton.disabled = false; });
}

function refreshAfterActivitySave(storeId) {
  return loadMerchantActivities(storeId)
    .then(() => loadActivities())
    .then(() => loadMerchantOpenCases(storeId))
    .then(() => loadMerchantAssets(storeId))
    .then(() => {
      if (currentLead) {
        const merchantOverview = getEl("merchantOverview");
        if (merchantOverview) merchantOverview.innerHTML = buildMerchantOverviewHtml(currentLead);
        renderMerchantTimeline(currentLead);
        renderMerchantCases(currentLead);
        renderMerchantAssets(currentLead);
      }
      updateMetrics();
    });
}

function renderFollowUpCommandCenter() {
  updateMetrics();
}

function syncDashboardClickHandlers() {
  const leadTableContainer = getEl("leadTableContainer");
  if (leadTableContainer && !leadTableContainer.dataset.bound) {
    leadTableContainer.dataset.bound = "1";
    leadTableContainer.addEventListener("click", event => {
      const button = event.target.closest(".merchant-link");
      if (!button) return;
      const storeId = button.dataset.storeId;
      if (!storeId) return;
      console.log("Merchant clicked:", storeId);
      openMerchantDrawer(storeId);
    });
  }
  const followUpModalBody = getEl("followUpModalBody");
  if (followUpModalBody && !followUpModalBody.dataset.bound) {
    followUpModalBody.dataset.bound = "1";
    followUpModalBody.addEventListener("click", event => {
      const button = event.target.closest(".merchant-link");
      if (!button) return;
      const storeId = button.dataset.storeId;
      if (!storeId) return;
      openMerchantDrawer(storeId);
      closeFollowUpModal();
    });
  }
  const merchantDrawer = getEl("merchantDrawer");
  if (merchantDrawer && !merchantDrawer.dataset.bound) {
    merchantDrawer.dataset.bound = "1";
    merchantDrawer.addEventListener("click", e => { if (e.target === merchantDrawer) closeMerchantDrawer(); });
  }
}

function initializeDashboard() {
  const searchInput = getEl("merchantSearch");
  const sortSelect = getEl("sortSelect");
  const closeDrawerBtn = getEl("closeDrawerBtn");
  const connectSheetBtn = getEl("connectSheetBtn");
  const activityForm = getEl("activityForm");
  const leadManagementForm = getEl("leadManagementForm");
  const openFollowUpsBtn = getEl("openFollowUpsBtn");
  const openPriorityMerchantsBtn = getEl("openPriorityMerchantsBtn");
  const closeFollowUpModalBtn = getEl("closeFollowUpModalBtn");
  const followUpModalOverlay = getEl("followUpModalOverlay");
  if (searchInput) searchInput.addEventListener("input", applyFiltersAndSort);
  if (sortSelect) sortSelect.addEventListener("change", applyFiltersAndSort);
  if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", closeMerchantDrawer);
  if (connectSheetBtn) connectSheetBtn.addEventListener("click", () => { loadLeads(); loadActivities(); });
  if (activityForm) activityForm.addEventListener("submit", handleActivitySubmit);
  if (leadManagementForm) leadManagementForm.addEventListener("submit", handleLeadManagementSubmit);
  if (openFollowUpsBtn) openFollowUpsBtn.addEventListener("click", () => openFollowUpModal("followups"));
  if (openPriorityMerchantsBtn) openPriorityMerchantsBtn.addEventListener("click", () => openFollowUpModal("priority"));
  if (closeFollowUpModalBtn) closeFollowUpModalBtn.addEventListener("click", closeFollowUpModal);
  if (followUpModalOverlay) followUpModalOverlay.addEventListener("click", closeFollowUpModal);
  document.querySelectorAll(".quick-action-btn").forEach(btn => btn.addEventListener("click", () => applyQuickTemplate(btn.dataset.template || "")));
  syncDashboardClickHandlers();
  loadLeads();
  loadActivities();
}

document.addEventListener("DOMContentLoaded", initializeDashboard);
window.addEventListener("load", () => { /* no-op */ });
