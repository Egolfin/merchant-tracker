const API_URL = "https://script.google.com/a/macros/ext.doordash.com/s/AKfycbxZoKWK2MLL4xo55FBHEWD_qoxgqD17_H1w1L-kbO46PlxQ3ClFpOsiME14aHZ1fiK-sg/exec";

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
  const leadManagementForm = document.getElementById("leadManagementForm");
  const leadTableContainer = document.getElementById("leadTableContainer");
  const quickActionButtons = document.querySelectorAll(".quick-action-btn");
  const openFollowUpsBtn = document.getElementById("openFollowUpsBtn");
  const openPriorityMerchantsBtn = document.getElementById("openPriorityMerchantsBtn");
  const closeFollowUpModalBtn = document.getElementById("closeFollowUpModalBtn");
  const followUpModalOverlay = document.getElementById("followUpModalOverlay");
  const followUpModalBody = document.getElementById("followUpModalBody");
  const merchantDrawer = document.getElementById("merchantDrawer");

  if (searchInput) {
    searchInput.addEventListener("input", applyFiltersAndSort);
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", applyFiltersAndSort);
  }

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener("click", closeMerchantDrawer);
  }

  if (merchantDrawer) {
    merchantDrawer.addEventListener("click", function (event) {
      if (event.target === merchantDrawer) {
        closeMerchantDrawer();
      }
    });
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

  if (leadManagementForm) {
    leadManagementForm.addEventListener("submit", handleLeadManagementSubmit);
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

  if (followUpModalBody) {
    followUpModalBody.addEventListener("click", function (event) {
      const button = event.target.closest(".merchant-link");
      if (!button) return;

      const storeId = button.dataset.storeId;
      if (!storeId) return;

      openMerchantDrawer(storeId);
      closeFollowUpModal();
    });
  }

  if (openFollowUpsBtn) {
    openFollowUpsBtn.addEventListener("click", function () {
      openFollowUpModal("followups");
    });
  }

  if (openPriorityMerchantsBtn) {
    openPriorityMerchantsBtn.addEventListener("click", function () {
      openFollowUpModal("priority");
    });
  }

  if (closeFollowUpModalBtn) {
    closeFollowUpModalBtn.addEventListener("click", closeFollowUpModal);
  }

  if (followUpModalOverlay) {
    followUpModalOverlay.addEventListener("click", closeFollowUpModal);
  }

  quickActionButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const template = button.dataset.template || "";
      applyQuickTemplate(template);
    });
  });

  loadLeads();
  loadActivities();
});

function loadLeads() {
  return new Promise((resolve) => {
    const callbackName = "handleLeadsResponse_" + Date.now();
    const script = document.createElement("script");

    window[callbackName] = function (response) {
      try {
        if (!response.success) {
          console.error("Lead load failed:", response.message);
          renderLeadError(response.message);
          setConnectionStatus(false);
          resolve([]);
          return;
        }

        allLeads = Array.isArray(response.data) ? response.data : [];
        filteredLeads = allLeads.slice();

        console.log("Leads loaded:", allLeads);
        setConnectionStatus(true);
        updateMetrics();
        applyFiltersAndSort();
        renderFollowUpCommandCenter();

        if (currentStoreId) {
          const refreshedLead = allLeads.find(function (item) {
            return String(getStoreId(item)) === String(currentStoreId);
          });

          if (refreshedLead) {
            currentLead = refreshedLead;
            renderCurrentMerchantView(currentLead);
          }
        }

        resolve(allLeads);
      } finally {
        delete window[callbackName];
        script.remove();
      }
    };

    script.src = `${API_URL}?action=getLeads&callback=${callbackName}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
}

function loadActivities() {
  return new Promise((resolve) => {
    const callbackName = "handleActivitiesResponse_" + Date.now();
    const script = document.createElement("script");

    window[callbackName] = function (response) {
      try {
        if (!response.success) {
          console.error("Activity load failed:", response.message);
          renderActivityError(response.message);
          resolve([]);
          return;
        }

        allActivities = Array.isArray(response.data) ? response.data : [];
        console.log("Activities loaded:", allActivities);
        renderActivities(allActivities);

        if (currentLead) {
          renderMerchantTimeline(currentLead);
        }

        updateMetrics();
        resolve(allActivities);
      } finally {
        delete window[callbackName];
        script.remove();
      }
    };

    script.src = `${API_URL}?action=getActivities&callback=${callbackName}&_=${Date.now()}`;
    document.body.appendChild(script);
  });
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
    ]
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm);
  });

  results.sort(function (a, b) {
    return compareLeads(a, b, sortValue);
  });

  filteredLeads = results;
  renderLeads(filteredLeads);
}

function compareLeads(a, b, sortValue) {
  if (sortValue === "gmv") {
    return parseNumeric(getField(b, ["GMV"])) - parseNumeric(getField(a, ["GMV"]));
  }

  if (sortValue === "priority") {
    return getMerchantPriorityScore(b) - getMerchantPriorityScore(a);
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
      const priorityScore = getMerchantPriorityScore(lead);

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

function openFollowUpModal(mode) {
  const modal = document.getElementById("followUpModal");
  const title = document.getElementById("followUpModalTitle");
  const subtitle = document.getElementById("followUpModalSubtitle");
  const body = document.getElementById("followUpModalBody");

  if (!modal || !title || !subtitle || !body) return;

  let items = [];
  let modalTitle = "";
  let modalSubtitle = "";

  if (mode === "followups") {
    modalTitle = "Today's Follow-Ups";
    modalSubtitle = "Oldest follow-up first";
    items = getFollowUpQueueItems();
  } else {
    modalTitle = "Top Merchants To Contact";
    modalSubtitle = "Ranked by urgency and opportunity";
    items = getTopMerchantItems();
  }

  title.textContent = modalTitle;
  subtitle.textContent = modalSubtitle;

  if (!items.length) {
    body.innerHTML = `<div class="followup-modal-empty">No records found.</div>`;
  } else {
    body.innerHTML = `
      <div class="followup-modal-list">
        ${items.map(function (lead) {
          return renderFollowUpModalItem(lead, mode);
        }).join("")}
      </div>
    `;
  }

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeFollowUpModal() {
  const modal = document.getElementById("followUpModal");
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function getFollowUpQueueItems() {
  const today = getTodayDateString();

  return allLeads
    .map(function (lead) {
      const dueDate = getDateComparableValue(getField(lead, ["Next Follow-Up"]));
      const storeId = getStoreId(lead);

      return Object.assign({}, lead, {
        __storeId: storeId,
        __dueDate: dueDate,
        __statusLabel: dueDate && dueDate < today ? "OVERDUE" : "DUE TODAY"
      });
    })
    .filter(function (lead) {
      return lead.__dueDate && lead.__dueDate <= today;
    })
    .sort(function (a, b) {
      return a.__dueDate.localeCompare(b.__dueDate);
    });
}

function getTopMerchantItems() {
  return allLeads
    .map(function (lead) {
      return Object.assign({}, lead, {
        __storeId: getStoreId(lead),
        __priority: getMerchantPriorityScore(lead),
        __gmv: parseNumeric(getField(lead, ["GMV"]))
      });
    })
    .sort(function (a, b) {
      if (b.__priority !== a.__priority) return b.__priority - a.__priority;
      if (b.__gmv !== a.__gmv) return b.__gmv - a.__gmv;

      const aName = String(getField(a, ["Business Name"]) || "").toLowerCase();
      const bName = String(getField(b, ["Business Name"]) || "").toLowerCase();
      return aName.localeCompare(bName);
    })
    .slice(0, 10);
}

function renderFollowUpModalItem(lead, mode) {
  const storeId = lead.__storeId || getStoreId(lead);
  const businessName = getField(lead, ["Business Name"]);
  const owner = getField(lead, ["Owner"]);
  const nextFollowUp = formatDisplayDate(getField(lead, ["Next Follow-Up"]));
  const leadStatus = getField(lead, ["Lead Status"]);
  const priority = getMerchantPriorityScore(lead);
  const lastActivity = getLatestActivityForStoreId(storeId);
  const badgeText = mode === "followups"
    ? (lead.__statusLabel || "DUE")
    : `PRIORITY ${String(priority)}`;

  return `
    <div class="followup-modal-item">
      <button type="button" class="merchant-link" data-store-id="${escapeHtml(storeId)}">
        ${escapeHtml(businessName)}
      </button>

      <div class="item-meta">Store ID: ${escapeHtml(storeId)} | Owner: ${escapeHtml(owner)}</div>
      <div class="item-meta">Next Follow-Up: ${escapeHtml(nextFollowUp)}</div>
      <div class="item-meta">Last Activity: ${escapeHtml(lastActivity)}</div>
      <div class="item-meta">Lead Status: ${escapeHtml(leadStatus)}</div>
      <span class="item-badge">${escapeHtml(badgeText)}</span>
    </div>
  `;
}

function renderCurrentMerchantView(lead) {
  const drawerTitle = document.getElementById("drawerTitle");
  const drawerSubtitle = document.getElementById("drawerSubtitle");
  const merchantOverview = document.getElementById("merchantOverview");
  const activityMerchantContext = document.getElementById("activityMerchantContext");

  if (drawerTitle) {
    drawerTitle.textContent = getField(lead, ["Business Name"]) || "Merchant 360";
  }

  if (drawerSubtitle) {
    drawerSubtitle.textContent = `Store ID: ${getStoreId(lead)}`;
  }

  if (merchantOverview) {
    merchantOverview.innerHTML = buildMerchantOverviewHtml(lead);
  }

  if (activityMerchantContext) {
    activityMerchantContext.innerHTML = buildActivityContextHtml(lead);
  }

  renderMerchantTimeline(lead);
  syncLeadManagementFormWithLead(lead);
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

  console.log("Opening drawer for:", storeId);

  renderCurrentMerchantView(lead);
  syncLeadManagementFormWithLead(lead);
  syncActivityFormWithLead(lead);

  const drawer = document.getElementById("merchantDrawer");
  if (drawer) {
    drawer.classList.add("open");
    drawer.style.display = "";
  }

  loadMerchantActivities(storeId);
}

function syncActivityFormWithLead(lead) {
  const activityForm = document.getElementById("activityForm");
  const activityOwner = document.getElementById("activityOwner");
  const activityTimestamp = document.getElementById("activityTimestamp");
  const activityStatus = document.getElementById("activityStatusMessage");

  if (activityForm) {
    activityForm.reset();
  }

  if (activityOwner) {
    activityOwner.value = getField(lead, ["Owner"]) || "Esteban Golfin";
  }

  if (activityTimestamp) {
    activityTimestamp.value = getCurrentLocalDateTimeValue();
  }

  if (activityStatus) {
    activityStatus.textContent = "Ready to log an activity for this merchant.";
    activityStatus.classList.remove("error");
  }
}

function syncLeadManagementFormWithLead(lead) {
  const leadStatus = document.getElementById("leadStatus");
  const leadOwner = document.getElementById("leadOwner");
  const leadNextFollowUp = document.getElementById("leadNextFollowUp");
  const leadPriorityScore = document.getElementById("leadPriorityScore");
  const leadPipelineStage = document.getElementById("leadPipelineStage");
  const leadUpdateStatusMessage = document.getElementById("leadUpdateStatusMessage");

  if (leadStatus) {
    leadStatus.value = getField(lead, ["Lead Status"]) || "";
  }

  if (leadOwner) {
    leadOwner.value = getField(lead, ["Owner"]) || "Esteban Golfin";
  }

  if (leadNextFollowUp) {
    leadNextFollowUp.value = toDateInputValue(getField(lead, ["Next Follow-Up"]));
  }

  if (leadPriorityScore) {
    leadPriorityScore.value = getField(lead, ["Priority Score"]) || "";
  }

  if (leadPipelineStage) {
    leadPipelineStage.value = getField(lead, ["Pipeline Stage"]) || "";
  }

  if (leadUpdateStatusMessage) {
    leadUpdateStatusMessage.textContent = "";
    leadUpdateStatusMessage.classList.remove("error");
  }
}

function applyQuickTemplate(template) {
  const activityType = document.getElementById("activityType");
  const activityOutcome = document.getElementById("activityOutcome");
  const activityNotes = document.getElementById("activityNotes");
  const activityTimestamp = document.getElementById("activityTimestamp");
  const activityOwner = document.getElementById("activityOwner");

  if (activityTimestamp) {
    activityTimestamp.value = getCurrentLocalDateTimeValue();
  }

  if (activityOwner && (!activityOwner.value || !activityOwner.value.trim())) {
    activityOwner.value = "Esteban Golfin";
  }

  if (template === "quick-note") {
    if (activityType) activityType.value = "Follow-Up";
    if (activityOutcome) activityOutcome.value = "Follow Up";
    if (activityNotes) {
      activityNotes.focus();
      activityNotes.placeholder = "Write a quick note for this merchant...";
    }
    setActivityStatus("Quick Note template loaded.");
    return;
  }

  if (template === "call") {
    if (activityType) activityType.value = "Call";
    if (activityOutcome) activityOutcome.value = "Follow Up";
    if (activityNotes) {
      activityNotes.focus();
      activityNotes.placeholder = "Summarize the call, objections, and next step...";
    }
    setActivityStatus("Call template loaded.");
    return;
  }

  if (template === "email") {
    if (activityType) activityType.value = "Email";
    if (activityOutcome) activityOutcome.value = "Follow Up";
    if (activityNotes) {
      activityNotes.focus();
      activityNotes.placeholder = "Summarize the email sent and next step...";
    }
    setActivityStatus("Email template loaded.");
    return;
  }
}

function renderMerchantTimeline(lead, activitiesOverride) {
  const container = document.getElementById("merchantTimeline");
  if (!container) return;

  if (!lead) {
    container.innerHTML = `<div class="timeline-empty">Select a merchant to view the timeline.</div>`;
    return;
  }

  const storeId = getStoreId(lead);

  const merchantActivities = Array.isArray(activitiesOverride)
    ? activitiesOverride.slice()
    : allActivities.filter(function (activity) {
        return String(getField(activity, ["Store ID", "Store Id"])) === String(storeId);
      });

  merchantActivities.sort(function (a, b) {
    const aDate = parseFlexibleDateTime(getField(a, ["Timestamp"])) || new Date(0);
    const bDate = parseFlexibleDateTime(getField(b, ["Timestamp"])) || new Date(0);
    return bDate.getTime() - aDate.getTime();
  });

  const entries = [
    buildMerchantSnapshotTimelineEntry(lead, merchantActivities.length)
  ];

  merchantActivities.forEach(function (activity) {
    entries.push(buildMerchantActivityTimelineEntry(activity));
  });

  container.innerHTML = `
    <div class="merchant-timeline">
      ${entries.map(function (entry) {
        return renderMerchantTimelineEntry(entry);
      }).join("")}
    </div>
  `;
}

function buildMerchantSnapshotTimelineEntry(lead, activityCount) {
  const storeId = getStoreId(lead);
  const lastActivity = getLatestActivityForStoreId(storeId);
  const leadStatus = getField(lead, ["Lead Status"]);
  const pipelineStage = getField(lead, ["Pipeline Stage"]);
  const owner = getField(lead, ["Owner"]);
  const nextFollowUp = formatDisplayDate(getField(lead, ["Next Follow-Up"]));
  const priorityScore = getMerchantPriorityScore(lead);
  const openCaseCount = getField(lead, ["Open Case Count"]);
  const photoCoverage = formatCoverage(getField(lead, ["Photo Coverage"]));
  const descCoverage = formatCoverage(getField(lead, ["Description Coverage"]));
  const uptime = formatCoverage(getField(lead, ["Uptime"]));
  const gmv = getField(lead, ["GMV"]);
  const businessId = getField(lead, ["Business Id", "Business ID"]);
  const rxName = getField(lead, ["Rx Name"]);
  const lastContacted = getField(lead, ["Last Contacted"]);

  return {
    kind: "snapshot",
    title: "Merchant Snapshot",
    badge: "LIVE RECORD",
    meta: `${activityCount} logged activity${activityCount === 1 ? "" : "ies"}`,
    submeta: `Last activity: ${lastActivity}`,
    details: [
      { label: "Business Name", value: getField(lead, ["Business Name"]) },
      { label: "Store ID", value: storeId },
      { label: "Business ID", value: businessId },
      { label: "Rx Name", value: rxName },
      { label: "Lead Status", value: leadStatus },
      { label: "Pipeline Stage", value: pipelineStage },
      { label: "Owner", value: owner },
      { label: "Next Follow-Up", value: nextFollowUp },
      { label: "Priority Score", value: String(priorityScore) },
      { label: "Open Case Count", value: openCaseCount },
      { label: "GMV", value: gmv },
      { label: "Last Contacted", value: lastContacted },
      { label: "Photo Coverage", value: photoCoverage },
      { label: "Description Coverage", value: descCoverage },
      { label: "Uptime", value: uptime }
    ]
  };
}

function buildMerchantActivityTimelineEntry(activity) {
  const activityType = getField(activity, ["Activity Type"]) || "Activity";
  const outcome = getField(activity, ["Outcome"]);
  const owner = getField(activity, ["Owner"]);
  const timestamp = formatDateTimeDisplay(getField(activity, ["Timestamp"]));
  const notes = getField(activity, ["Notes"]);
  const nextFollowUp = formatDisplayDate(getField(activity, ["Next Follow-Up"]));
  const businessName = getField(activity, ["Business Name"]);
  const storeId = getField(activity, ["Store ID", "Store Id"]);

  return {
    kind: "activity",
    title: activityType,
    badge: outcome || "Logged",
    meta: timestamp,
    submeta: `Owner: ${owner} • Store ID: ${storeId}`,
    details: [
      { label: "Business Name", value: businessName },
      { label: "Owner", value: owner },
      { label: "Outcome", value: outcome },
      { label: "Next Follow-Up", value: nextFollowUp }
    ],
    notes: notes
  };
}

function renderMerchantTimelineEntry(entry) {
  const typeClass = entry.kind === "snapshot" ? "timeline-snapshot" : "timeline-activity";

  const detailsHtml = Array.isArray(entry.details)
    ? entry.details
        .map(function (item) {
          return `
            <div class="timeline-detail">
              <strong>${escapeHtml(item.label)}</strong>
              <span>${escapeHtml(item.value)}</span>
            </div>
          `;
        })
        .join("")
    : "";

  return `
    <article class="timeline-entry ${typeClass}">
      <div class="timeline-marker"></div>

      <div class="timeline-card">
        <div class="timeline-header">
          <div>
            <span class="timeline-kicker">${escapeHtml(entry.kind === "snapshot" ? "Current record" : "Activity event")}</span>
            <h4 class="timeline-title">${escapeHtml(entry.title)}</h4>
          </div>
          <span class="timeline-badge">${escapeHtml(entry.badge)}</span>
        </div>

        <div class="timeline-meta">${escapeHtml(entry.meta || "")}${entry.submeta ? ` • ${escapeHtml(entry.submeta)}` : ""}</div>

        <div class="timeline-details">
          ${detailsHtml}
        </div>

        ${entry.notes ? `<div class="timeline-notes">${escapeHtml(entry.notes)}</div>` : ""}
      </div>
    </article>
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
  const activityTimestampInput = document.getElementById("activityTimestamp");
  const activityOwner = activityOwnerInput?.value.trim() || getField(currentLead, ["Owner"]) || "Esteban Golfin";
  const activityTimestamp = activityTimestampInput?.value || getCurrentLocalDateTimeValue();
  const storeId = getStoreId(currentLead);

  if (!activityType || !activityOutcome || !activityNotes) {
    setActivityStatus("Please complete Activity Type, Outcome, and Notes.", true);
    return;
  }

  const saveButton = document.getElementById("activitySaveBtn");
  if (saveButton) {
    saveButton.disabled = true;
  }

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

  try {
    await postActivity(payload);
    await refreshAfterActivitySave(storeId);

    const form = document.getElementById("activityForm");
    if (form) {
      form.reset();
    }

    if (activityOwnerInput) {
      activityOwnerInput.value = activityOwner;
    }

    if (activityTimestampInput) {
      activityTimestampInput.value = getCurrentLocalDateTimeValue();
    }

    syncActivityFormWithLead(currentLead);
    setActivityStatus("Activity saved successfully.");
  } catch (error) {
    console.error("Save activity error:", error);
    setActivityStatus("Activity submitted, but refresh failed. Please check the Activity Log.", true);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

async function handleLeadManagementSubmit(event) {
  event.preventDefault();

  if (!currentLead) {
    setLeadUpdateStatus("Select a merchant before saving lead updates.", true);
    return;
  }

  const storeId = getStoreId(currentLead);

  const updates = {
    "Lead Status": document.getElementById("leadStatus")?.value || "",
    "Owner": document.getElementById("leadOwner")?.value.trim() || "",
    "Next Follow-Up": document.getElementById("leadNextFollowUp")?.value || "",
    "Priority Score": document.getElementById("leadPriorityScore")?.value || "",
    "Pipeline Stage": document.getElementById("leadPipelineStage")?.value || ""
  };

  const saveButton = document.getElementById("leadSaveBtn");
  if (saveButton) {
    saveButton.disabled = true;
  }

  setLeadUpdateStatus("Saving lead updates...");

  try {
    await postLeadUpdate(storeId, updates);
    await loadLeads();

    const refreshedLead = allLeads.find(function (item) {
      return String(getStoreId(item)) === String(storeId);
    });

    if (refreshedLead) {
      currentLead = refreshedLead;
      renderCurrentMerchantView(refreshedLead);
      syncLeadManagementFormWithLead(refreshedLead);
    }

    setLeadUpdateStatus("Lead updated successfully.");
  } catch (error) {
    console.error("Lead update error:", error);
    setLeadUpdateStatus("Lead update failed. Please try again.", true);
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
    }
  }
}

async function refreshAfterActivitySave(storeId) {
  if (!storeId) return;

  await loadMerchantActivities(storeId);
  await loadActivities();

  if (currentLead) {
    const merchantOverview = document.getElementById("merchantOverview");
    if (merchantOverview) {
      merchantOverview.innerHTML = buildMerchantOverviewHtml(currentLead);
    }

    renderMerchantTimeline(currentLead);
  }

  updateMetrics();
}

function postActivity(payload) {
  return new Promise((resolve, reject) => {
    const callbackName = "handleSaveActivity_" + Date.now();
    const script = document.createElement("script");
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      cleanup();
      reject(new Error("Save activity request timed out."));
    }, 20000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = function (response) {
      try {
        if (timedOut) return;

        if (!response || !response.success) {
          reject(new Error((response && response.message) || "Failed to save activity."));
          return;
        }

        resolve(response);
      } finally {
        cleanup();
      }
    };

    const params = new URLSearchParams();
    params.set("action", "saveActivity");
    params.set("data", JSON.stringify(payload));
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));

    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function postLeadUpdate(storeId, updates) {
  return new Promise((resolve, reject) => {
    const callbackName = "handleUpdateLead_" + Date.now();
    const script = document.createElement("script");
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      cleanup();
      reject(new Error("Lead update request timed out."));
    }, 20000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[callbackName] = function (response) {
      try {
        if (timedOut) return;

        if (!response || !response.success) {
          reject(new Error((response && response.message) || "Failed to update lead."));
          return;
        }

        resolve(response);
      } finally {
        cleanup();
      }
    };

    const params = new URLSearchParams();
    params.set("action", "updateLead");
    params.set("storeId", storeId);
    params.set("callback", callbackName);
    params.set("_", String(Date.now()));

    Object.keys(updates || {}).forEach(function (key) {
      params.set(key, updates[key]);
    });

    script.src = `${API_URL}?${params.toString()}`;
    document.body.appendChild(script);
  });
}

function setActivityStatus(message, isError = false) {
  const status = document.getElementById("activityStatusMessage");
  if (!status) return;

  status.textContent = message;
  status.classList.toggle("error", Boolean(isError));
}

function setLeadUpdateStatus(message, isError = false) {
  const status = document.getElementById("leadUpdateStatusMessage");
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
          if (currentLead) {
            renderMerchantTimeline(currentLead, activities);
          }
          resolve(activities);
          return;
        }

        if (activities.length === 0) {
          merchantActivity.innerHTML = `<div class="empty-state">No merchant-specific activities found.</div>`;
          if (currentLead) {
            renderMerchantTimeline(currentLead, activities);
          }
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

        if (currentLead) {
          renderMerchantTimeline(currentLead, activities);
        }

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
  const owner = getField(lead, ["Owner"]);
  const lastContacted = getField(lead, ["Last Contacted"]);
  const nextFollowUp = getField(lead, ["Next Follow-Up"]);
  const openCaseCount = getField(lead, ["Open Case Count"]);
  const pipelineStage = getField(lead, ["Pipeline Stage"]);
  const priorityScore = getMerchantPriorityScore(lead);

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
      <div><strong>Next Follow-Up:</strong> ${escapeHtml(formatDisplayDate(nextFollowUp))}</div>
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

  const today = getTodayDateString();

  const followUpsToday = leads.filter(function (lead) {
    return getDateComparableValue(getField(lead, ["Next Follow-Up"])) === today;
  }).length;

  const overdueFollowUps = leads.filter(function (lead) {
    const due = getDateComparableValue(getField(lead, ["Next Follow-Up"]));
    return due && due < today;
  }).length;

  const priorityValues = leads
    .map(function (lead) {
      return getMerchantPriorityScore(lead);
    })
    .filter(function (value) {
      return Number.isFinite(value);
    });

  const averagePriorityScore = priorityValues.length
    ? (priorityValues.reduce(function (sum, value) {
        return sum + value;
      }, 0) / priorityValues.length).toFixed(1)
    : "0.0";

  setText("totalLeads", totalLeads);
  setText("followUpsToday", followUpsToday);
  setText("overdueFollowUps", overdueFollowUps);
  setText("averagePriorityScore", averagePriorityScore);
}

function renderFollowUpCommandCenter() {
  updateMetrics();
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
  const photo = normalizePercentValue(getField(lead, ["Photo Coverage"]));
  const desc = normalizePercentValue(getField(lead, ["Description Coverage"]));
  return (photo + desc) / 2;
}

function getMerchantPriorityScore(lead) {
  const stored = parseNumeric(getField(lead, ["Priority Score"]));
  let heuristic = 0;

  const gmv = parseNumeric(getField(lead, ["GMV"]));
  heuristic += Math.min(gmv / 5000, 20);

  if (isTruthyOpp(getField(lead, ["Promo Opp"]))) {
    heuristic += 10;
  }

  if (isTruthyOpp(getField(lead, ["SI Opp"]))) {
    heuristic += 10;
  }

  const nextFollowUp = getDateComparableValue(getField(lead, ["Next Follow-Up"]));
  const today = getTodayDateString();

  if (nextFollowUp && nextFollowUp < today) {
    heuristic += 15;
  } else if (nextFollowUp && nextFollowUp === today) {
    heuristic += 10;
  }

  const lastActivityDate = getLatestActivityDateForStoreId(getStoreId(lead));
  if (lastActivityDate) {
    const daysSinceActivity = daysBetween(lastActivityDate, new Date());
    if (daysSinceActivity >= 30) {
      heuristic += 20;
    } else if (daysSinceActivity >= 14) {
      heuristic += 10;
    }
  } else {
    heuristic += 10;
  }

  if (getCoverageScore(lead) < 80) {
    heuristic += 10;
  }

  const pipelineStage = String(getField(lead, ["Pipeline Stage"])).trim();
  if (
    pipelineStage &&
    pipelineStage.toLowerCase() !== "closed won" &&
    pipelineStage.toLowerCase() !== "closed lost"
  ) {
    heuristic += 5;
  }

  return Math.max(Math.round(heuristic), stored || 0);
}

function isTruthyOpp(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  return parseNumeric(normalized) > 0;
}

function normalizePercentValue(value) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(String(value).replace(/[%\s,]/g, ""));
  if (!Number.isFinite(num)) return 0;
  return num <= 1 ? num * 100 : num;
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

function toDateInputValue(value) {
  const date = parseFlexibleDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
  if (!value) return "";
  const date = parseFlexibleDate(value);
  if (!date) return String(value);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatDateTimeDisplay(value) {
  if (!value) return "";
  const date = parseFlexibleDateTime(value);
  if (!date) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getDateComparableValue(value) {
  const date = parseFlexibleDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseFlexibleDate(value) {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const str = String(value).trim();
  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const date = new Date(str + "T00:00:00");
    return isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  const parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) {
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    const year = Number(parts[3]);
    const parsed = new Date(year, month, day);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function parseFlexibleDateTime(value) {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getTime());
  }

  const str = String(value).trim();
  if (!str) return null;

  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }

  const dateOnly = parseFlexibleDate(str);
  if (dateOnly) {
    return dateOnly;
  }

  return null;
}

function daysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getLatestActivityForStoreId(storeId) {
  const latest = getLatestActivityObjectForStoreId(storeId);
  if (!latest) return "No activity yet";

  const type = getField(latest, ["Activity Type"]) || "Activity";
  const timestamp = formatDisplayDate(getField(latest, ["Timestamp"])) || "Unknown date";
  return `${type} • ${timestamp}`;
}

function getLatestActivityDateForStoreId(storeId) {
  const latest = getLatestActivityObjectForStoreId(storeId);
  if (!latest) return null;
  return parseFlexibleDate(getField(latest, ["Timestamp"]));
}

function getLatestActivityObjectForStoreId(storeId) {
  const matches = allActivities
    .filter(function (activity) {
      return String(getField(activity, ["Store ID", "Store Id"])) === String(storeId);
    })
    .slice()
    .sort(function (a, b) {
      const aDate = parseFlexibleDate(getField(a, ["Timestamp"])) || new Date(0);
      const bDate = parseFlexibleDate(getField(b, ["Timestamp"])) || new Date(0);
      return bDate.getTime() - aDate.getTime();
    });

  return matches.length ? matches[0] : null;
}

function getCurrentLocalDateTimeValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const local = new Date(now.getTime() - offset);
  return local.toISOString().slice(0, 16);
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

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
