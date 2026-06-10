const API_URL = "PASTE_YOUR_WEB_APP_URL_HERE"; // Replace with your deployed Apps Script Web App URL

let allLeads = [];
let allActivities = [];
let filteredLeads = [];
let currentLead = null;
let currentStoreId = "";

document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("merchantSearch");
  const sortSelect = document.getElementById("sortSelect");
  const closeDrawerBtn = document.getElementById("closeDrawerBtn");
  const connectSheetBtn = document.getElementById("connectSheetBtn");
  const activityForm = document.getElementById("activityForm");
  const leadTableContainer = document.getElementById("leadTableContainer");

  if (searchInput) {
    searchInput.addEventListener("input", applyFiltersAndSort);
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", applyFiltersAndSort);
  }

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener("click", closeMerchantDrawer);
  }

  if (connectSheetBtn) {
    connectSheetBtn.addEventListener("click", function () {
      loadLeads();
      loadActivities();
    });
  }

  if (activityForm) {
    activityForm.addEventListener("submit", handleActivitySubmit);
  }

  if (leadTableContainer) {
    leadTableContainer.addEventListener("click", function (event) {
      const button = event.target.closest(".merchant-link");
      if (!button) return;

      const storeId = button.dataset.storeId;
      if (!storeId) return;

      console.log("Merchant clicked:", storeId);
      openMerchantDrawer(storeId);
    });
  }

  loadLeads();
  loadActivities();
});

function loadLeads() {
  const callbackName = "handleLeadsResponse_" + Date.now();

  window[callbackName] = function (response) {
    try {
      if (!response.success) {
        console.error("Lead load failed:", response.message);
        renderLeadError(response.message);
        setConnectionStatus(false);
        return;
      }

      allLeads = Array.isArray(response.data) ? response.data : [];
      filteredLeads = allLeads.slice();

      console.log("Leads loaded:", allLeads);
      setConnectionStatus(true);
      updateMetrics();
      applyFiltersAndSort();
    } finally {
      delete window[callbackName];
      script.remove();
    }
  };

  const script = document.createElement("script");
  script.src = `${API_URL}?action=getLeads&callback=${callbackName}&_=${Date.now()}`;
  document.body.appendChild(script);
}

function loadActivities() {
  const callbackName = "handleActivitiesResponse_" + Date.now();

  window[callbackName] = function (response) {
    try {
      if (!response.success) {
        console.error("Activity load failed:", response.message);
        renderActivityError(response.message);
        return;
      }

      allActivities = Array.isArray(response.data) ? response.data : [];
      console.log("Activities loaded:", allActivities);
      renderActivities(allActivities);
    } finally {
      delete window[callbackName];
      script.remove();
    }
  };

  const script = document.createElement("script");
  script.src = `${API_URL}?action=getActivities&callback=${callbackName}&_=${Date.now()}`;
  document.body.appendChild(script);
}

function applyFiltersAndSort() {
  const searchInput = document.getElementById("merchantSearch");
  const sortSelect = document.getElementById("sortSelect");

  const searchTerm = (searchInput?.value || "").trim().toLowerCase();
  const sortValue = sortSelect?.value || "businessName";

  let results = allLeads.filter(function (lead) {
    const businessName = getField(lead, ["Business Name"]);
    const storeId = getField(lead, ["Store Id", "Store ID"]);
    const businessId = getField(lead, ["Business Id", "Business ID"]);
    const rxName = getField(lead, ["Rx Name"]);
    const parentName = getField(lead, ["Ultimate Parent Name"]);

    const searchableText = [
      businessName,
      storeId,
      businessId,
      rxName,
      parentName
    ].join(" ").toLowerCase();

    return searchableText.includes(searchTerm);
  });

  results.sort(function (a, b) {
    return compareLeads(a, b, sortValue);
  });

  filteredLeads = results;
  renderLeads(filteredLeads);
  updateMetrics(filteredLeads);
}

function compareLeads(a, b, sortValue) {
  if (sortValue === "gmv") {
    return parseNumeric(getField(b, ["GMV"])) - parseNumeric(getField(a, ["GMV"]));
  }

  if (sortValue === "priority") {
    return parseNumeric(getField(b, ["Priority Score"])) - parseNumeric(getField(a, ["Priority Score"]));
  }

  if (sortValue === "coverage") {
    return getCoverageScore(b) - getCoverageScore(a);
  }

  const aName = String(getField(a, ["Business Name"]) || "").toLowerCase();
  const bName = String(getField(b, ["Business Name"]) || "").toLowerCase();
  return aName.localeCompare(bName);
}

function renderLeads(leads) {
  const container = document.getElementById("leadTableContainer");
  if (!container) return;

  if (!Array.isArray(leads) || leads.length === 0) {
    container.innerHTML = `<div class="empty-state">No leads found.</div>`;
    return;
  }

  const rows = leads
    .map(function (lead) {
      const storeId = getStoreId(lead);
      const businessName = getField(lead, ["Business Name"]);
      const businessId = getField(lead, ["Business Id", "Business ID"]);
      const rxName = getField(lead, ["Rx Name"]);
      const gmv = getField(lead, ["GMV"]);
      const photoCoverage = formatCoverage(getField(lead, ["Photo Coverage"]));
      const descCoverage = formatCoverage(getField(lead, ["Description Coverage"]));
      const uptime = formatCoverage(getField(lead, ["Uptime"]));
      const promoOpp = getField(lead, ["Promo Opp"]);
      const siOpp = getField(lead, ["SI Opp"]);
      const leadStatus = getField(lead, ["Lead Status"]);
      const priorityScore = getField(lead, ["Priority Score"]);

      return `
        <tr class="lead-row" data-store-id="${escapeHtml(storeId)}">
          <td>
            <button
              type="button"
              class="merchant-link"
              data-store-id="${escapeHtml(storeId)}"
            >
              ${escapeHtml(businessName)}
            </button>
          </td>
          <td>${escapeHtml(storeId)}</td>
          <td>${escapeHtml(businessId)}</td>
          <td>${escapeHtml(rxName)}</td>
          <td>${escapeHtml(gmv)}</td>
          <td>${escapeHtml(photoCoverage)}</td>
          <td>${escapeHtml(descCoverage)}</td>
          <td>${escapeHtml(uptime)}</td>
          <td>${escapeHtml(promoOpp)}</td>
          <td>${escapeHtml(siOpp)}</td>
          <td>${escapeHtml(leadStatus)}</td>
          <td>${escapeHtml(priorityScore)}</td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <table class="lead-table">
      <thead>
        <tr>
          <th>Business Name</th>
          <th>Store ID</th>
          <th>Business ID</th>
          <th>Rx Name</th>
          <th>GMV</th>
          <th>Photo Coverage</th>
          <th>Description Coverage</th>
          <th>Uptime</th>
          <th>Promo Opp</th>
          <th>SI Opp</th>
          <th>Lead Status</th>
          <th>Priority Score</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function renderActivities(activities) {
  const container = document.getElementById("activityContainer");
  if (!container) return;

  if (!Array.isArray(activities) || activities.length === 0) {
    container.innerHTML = `<div class="empty-state">No activities found yet.</div>`;
    return;
  }

  const latestActivities = activities.slice().reverse().slice(0, 5);

  const rows = latestActivities
    .map(function (activity) {
      return `
        <tr>
          <td>${escapeHtml(getField(activity, ["Timestamp"]))}</td>
          <td>${escapeHtml(getField(activity, ["Store ID", "Store Id"]))}</td>
          <td>${escapeHtml(getField(activity, ["Business Name"]))}</td>
          <td>${escapeHtml(getField(activity, ["Activity Type"]))}</td>
          <td>${escapeHtml(getField(activity, ["Notes"]))}</td>
          <td>${escapeHtml(getField(activity, ["Outcome"]))}</td>
          <td>${escapeHtml(getField(activity, ["Owner"]))}</td>
          <td>${escapeHtml(getField(activity, ["Next Follow-Up"]))}</td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <table class="activity-table">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Store ID</th>
          <th>Business Name</th>
          <th>Activity Type</th>
          <th>Notes</th>
          <th>Outcome</th>
          <th>Owner</th>
          <th>Next Follow-Up</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function openMerchantDrawer(storeId) {
  if (!storeId) return;

  const lead = allLeads.find(function (item) {
    return String(getStoreId(item)) === String(storeId);
  });

  if (!lead) {
    console.error("Lead not found for storeId:", storeId);
    return;
  }

  currentLead = lead;
  currentStoreId = storeId;

  const drawer = document.getElementById("merchantDrawer");
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerSubtitle = document.getElementById("drawerSubtitle");
  const merchantOverview = document.getElementById("merchantOverview");
  const merchantActivity = document.getElementById("merchantActivity");

  console.log("Opening drawer for:", storeId);

  syncActivityFormWithLead(lead);

  if (drawerTitle) {
    drawerTitle.textContent = getField(lead, ["Business Name"]) || "Merchant 360";
  }

  if (drawerSubtitle) {
    drawerSubtitle.textContent = `Store ID: ${storeId}`;
  }

  if (merchantOverview) {
    merchantOverview.innerHTML = buildMerchantOverviewHtml(lead);
  }

  if (merchantActivity) {
    merchantActivity.innerHTML = `<div class="empty-state">Loading activity history...</div>`;
  }

  if (drawer) {
    drawer.classList.add("open");
    drawer.style.display = "block";
    drawer.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  loadMerchantActivities(storeId);
}

function syncActivityFormWithLead(lead) {
  const context = document.getElementById("activityMerchantContext");
  const activityForm = document.getElementById("activityForm");
  const activityOwner = document.getElementById("activityOwner");
  const activityStatus = document.getElementById("activityStatusMessage");

  if (activityForm) {
    activityForm.reset();
  }

  if (activityOwner) {
    activityOwner.value = getField(lead, ["Owner"]) || "Esteban Golfin";
  }

  if (context) {
    context.innerHTML = buildActivityContextHtml(lead);
  }

  if (activityStatus) {
    activityStatus.textContent = "Ready to log an activity for this merchant.";
    activityStatus.classList.remove("error");
  }
}

function buildActivityContextHtml(lead) {
  return `
    <div class="overview-grid">
      <div><strong>Business Name:</strong> ${escapeHtml(getField(lead, ["Business Name"]))}</div>
      <div><strong>Store ID:</strong> ${escapeHtml(getField(lead, ["Store Id", "Store ID"]))}</div>
      <div><strong>Business ID:</strong> ${escapeHtml(getField(lead, ["Business Id", "Business ID"]))}</div>
      <div><strong>Rx Name:</strong> ${escapeHtml(getField(lead, ["Rx Name"]))}</div>
      <div><strong>Lead Status:</strong> ${escapeHtml(getField(lead, ["Lead Status"]))}</div>
      <div><strong>Priority Score:</strong> ${escapeHtml(getField(lead, ["Priority Score"]))}</div>
    </div>
  `;
}

async function handleActivitySubmit(event) {
  event.preventDefault();

  if (!currentLead) {
    setActivityStatus("Select a merchant before saving an activity.", true);
    return;
  }

  const activityType = document.getElementById("activityType")?.value.trim() || "";
  const activityOutcome = document.getElementById("activityOutcome")?.value.trim() || "";
  const activityNextFollowUp = document.getElementById("activityNextFollowUp")?.value || "";
  const activityNotes = document.getElementById("activityNotes")?.value.trim() || "";
  const activityOwnerInput = document.getElementById("activityOwner");
  const activityOwner = activityOwnerInput?.value.trim() || getField(currentLead, ["Owner"]) || "Esteban Golfin";

  if (!activityType || !activityOutcome || !activityNotes) {
    setActivityStatus("Please complete Activity Type, Outcome, and Notes.", true);
    return;
  }

  const saveButton = document.getElementById("activitySaveBtn");
  if (saveButton) {
    saveButton.disabled = true;
  }

  const payload = {
    "Store ID": getStoreId(currentLead),
    "Business ID": getField(currentLead, ["Business Id", "Business ID"]),
    "Business Name": getField(currentLead, ["Business Name"]),
    "Activity Type": activityType,
    "Notes": activityNotes,
    "Outcome": activityOutcome,
    "Owner": activityOwner,
    "Next Follow-Up": activityNextFollowUp
  };

  setActivityStatus("Saving activity...");

  try {
    await postActivity(payload);
    await delay(900);

    const refreshedActivities = await loadMerchantActivities(getStoreId(currentLead));
    loadActivities();

    const verified = Array.isArray(refreshedActivities) && refreshedActivities.some(function (activity) {
      return String(getField(activity, ["Activity Type"])) === activityType &&
             String(getField(activity, ["Notes"])) === activityNotes &&
             String(getField(activity, ["Outcome"])) === activityOutcome;
    });

    if (verified) {
      setActivityStatus("Activity saved successfully.");
    } else {
      setActivityStatus("Activity submitted. Refreshing activity log...");
    }

    const form = document.getElementById("activityForm");
    if (form) {
      form.reset();
    }

    if (activityOwnerInput) {
      activityOwnerInput.value = activityOwner;
    }

    syncActivityFormWithLead(currentLead);
    await loadMerchantActivities(getStoreId(currentLead));
  } catch (error) {
    console.error("Save activity error:", error);
    setActivityStatus("Activity submitted. Refreshing activity log...", false);
    await delay(900);
    await loadMerchantActivities(getStoreId(currentLead));
    loadActivities();
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

function postActivity(payload) {
  const body = new URLSearchParams();
  body.set("action", "saveActivity");
  body.set("data", JSON.stringify(payload));

  return fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    body: body
  });
}

function setActivityStatus(message, isError = false) {
  const status = document.getElementById("activityStatusMessage");
  if (!status) return;

  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

function loadMerchantActivities(storeId) {
  return new Promise((resolve) => {
    const callbackName = "handleMerchantActivities_" + Date.now();
    const script = document.createElement("script");

    window[callbackName] = function (response) {
      try {
        const merchantActivity = document.getElementById("merchantActivity");

        if (!response.success) {
          if (merchantActivity) {
            merchantActivity.innerHTML = `<div class="error-state">Unable to load merchant activity.</div>`;
          }
          resolve([]);
          return;
        }

        const activities = Array.isArray(response.data) ? response.data : [];

        if (!merchantActivity) {
          resolve(activities);
          return;
        }

        if (activities.length === 0) {
          merchantActivity.innerHTML = `<div class="empty-state">No merchant-specific activities found.</div>`;
          resolve(activities);
          return;
        }

        const html = activities
          .slice()
          .reverse()
          .map(function (activity) {
            return `
              <div class="drawer-card merchant-activity-item">
                <strong>${escapeHtml(getField(activity, ["Activity Type"]))}</strong><br>
                <span class="subtext">${escapeHtml(getField(activity, ["Timestamp"]))}</span><br>
                <div style="margin-top:8px;">${escapeHtml(getField(activity, ["Notes"]))}</div>
                <div style="margin-top:8px;" class="subtext">
                  Outcome: ${escapeHtml(getField(activity, ["Outcome"]))} | Owner: ${escapeHtml(getField(activity, ["Owner"]))}
                </div>
              </div>
            `;
          })
          .join("");

        merchantActivity.innerHTML = html;
        resolve(activities);
      } finally {
        delete window[callbackName];
        script.remove();
      }
    };

    script.src = `${API_URL}?action=getActivitiesByStoreId&storeId=${encodeURIComponent(storeId)}&callback=${callbackName}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function buildMerchantOverviewHtml(lead) {
  const businessName = getField(lead, ["Business Name"]);
  const storeId = getField(lead, ["Store Id", "Store ID"]);
  const businessId = getField(lead, ["Business Id", "Business ID"]);
  const rxName = getField(lead, ["Rx Name"]);
  const gmv = getField(lead, ["GMV"]);
  const photoCoverage = formatCoverage(getField(lead, ["Photo Coverage"]));
  const descCoverage = formatCoverage(getField(lead, ["Description Coverage"]));
  const uptime = formatCoverage(getField(lead, ["Uptime"]));
  const promoOpp = getField(lead, ["Promo Opp"]);
  const siOpp = getField(lead, ["SI Opp"]);
  const leadStatus = getField(lead, ["Lead Status"]);
  const priorityScore = getField(lead, ["Priority Score"]);
  const owner = getField(lead, ["Owner"]);
  const lastContacted = getField(lead, ["Last Contacted"]);
  const nextFollowUp = getField(lead, ["Next Follow-Up"]);
  const openCaseCount = getField(lead, ["Open Case Count"]);
  const pipelineStage = getField(lead, ["Pipeline Stage"]);

  return `
    <div class="overview-grid">
      <div><strong>Business Name:</strong> ${escapeHtml(businessName)}</div>
      <div><strong>Store ID:</strong> ${escapeHtml(storeId)}</div>
      <div><strong>Business ID:</strong> ${escapeHtml(businessId)}</div>
      <div><strong>Rx Name:</strong> ${escapeHtml(rxName)}</div>
      <div><strong>GMV:</strong> ${escapeHtml(gmv)}</div>
      <div><strong>Photo Coverage:</strong> ${escapeHtml(photoCoverage)}</div>
      <div><strong>Description Coverage:</strong> ${escapeHtml(descCoverage)}</div>
      <div><strong>Uptime:</strong> ${escapeHtml(uptime)}</div>
      <div><strong>Promo Opp:</strong> ${escapeHtml(promoOpp)}</div>
      <div><strong>SI Opp:</strong> ${escapeHtml(siOpp)}</div>
      <div><strong>Lead Status:</strong> ${escapeHtml(leadStatus)}</div>
      <div><strong>Priority Score:</strong> ${escapeHtml(priorityScore)}</div>
      <div><strong>Owner:</strong> ${escapeHtml(owner)}</div>
      <div><strong>Last Contacted:</strong> ${escapeHtml(lastContacted)}</div>
      <div><strong>Next Follow-Up:</strong> ${escapeHtml(nextFollowUp)}</div>
      <div><strong>Open Case Count:</strong> ${escapeHtml(openCaseCount)}</div>
      <div><strong>Pipeline Stage:</strong> ${escapeHtml(pipelineStage)}</div>
    </div>
  `;
}

function closeMerchantDrawer() {
  const drawer = document.getElementById("merchantDrawer");
  if (drawer) {
    drawer.classList.remove("open");
    drawer.style.display = "";
  }
}

function updateMetrics(leads = allLeads) {
  const totalLeads = leads.length;

  const followUps = leads.filter(function (lead) {
    const nextFollowUp = getField(lead, ["Next Follow-Up"]);
    const leadStatus = getField(lead, ["Lead Status"]);
    return String(nextFollowUp).trim() !== "" || String(leadStatus).toLowerCase().includes("follow");
  }).length;

  const openCases = leads.filter(function (lead) {
    return parseNumeric(getField(lead, ["Open Case Count"])) > 0;
  }).length;

  const pipelineOpps = leads.filter(function (lead) {
    const promoOpp = parseNumeric(getField(lead, ["Promo Opp"])) > 0;
    const siOpp = parseNumeric(getField(lead, ["SI Opp"])) > 0;
    const pipelineStage = String(getField(lead, ["Pipeline Stage"])).trim() !== "";
    return promoOpp || siOpp || pipelineStage;
  }).length;

  setText("totalLeads", totalLeads);
  setText("followUps", followUps);
  setText("openCases", openCases);
  setText("pipelineOpps", pipelineOpps);
}

function setConnectionStatus(isConnected) {
  const status = document.getElementById("sheetStatus");
  if (!status) return;

  status.textContent = isConnected ? "Connected" : "Not Connected";
  status.classList.remove("status-offline", "status-online");
  status.classList.add(isConnected ? "status-online" : "status-offline");
}

function renderLeadError(message) {
  const container = document.getElementById("leadTableContainer");
  if (container) {
    container.innerHTML = `<div class="error-state">Lead load failed: ${escapeHtml(message)}</div>`;
  }
}

function renderActivityError(message) {
  const container = document.getElementById("activityContainer");
  if (container) {
    container.innerHTML = `<div class="error-state">Activity load failed: ${escapeHtml(message)}</div>`;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getField(obj, candidates) {
  if (!obj || !Array.isArray(candidates)) return "";

  for (const key of candidates) {
    if (
      Object.prototype.hasOwnProperty.call(obj, key) &&
      obj[key] !== undefined &&
      obj[key] !== null &&
      String(obj[key]).trim() !== ""
    ) {
      return obj[key];
    }
  }

  return "";
}

function getStoreId(lead) {
  return String(getField(lead, ["Store Id", "Store ID"])).trim();
}

function getCoverageScore(lead) {
  const photo = parseNumeric(getField(lead, ["Photo Coverage"]));
  const desc = parseNumeric(getField(lead, ["Description Coverage"]));
  return (photo + desc) / 2;
}

function parseNumeric(value) {
  if (value === null || value === undefined) return 0;
  const normalized = String(value).replace(/[$,%\s,]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCoverage(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (Number.isFinite(num)) {
    if (num <= 1) {
      return `${(num * 100).toFixed(1)}%`;
    }
    return `${num.toFixed(1)}%`;
  }
  return String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
