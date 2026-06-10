const API_URL = "https://script.google.com/a/macros/ext.doordash.com/s/AKfycbxZoKWK2MLL4xo55FBHEWD_qoxgqD17_H1w1L-kbO46PlxQ3ClFpOsiME14aHZ1fiK-sg/exec";

document.addEventListener("DOMContentLoaded", function () {
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
        return;
      }

      console.log("Leads loaded:", response.data);
      renderLeads(response.data);
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

      console.log("Activities loaded:", response.data);
      renderActivities(response.data);
    } finally {
      delete window[callbackName];
      script.remove();
    }
  };

  const script = document.createElement("script");
  script.src = `${API_URL}?action=getActivities&callback=${callbackName}&_=${Date.now()}`;
  document.body.appendChild(script);
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
      return `
        <tr>
          <td>${escapeHtml(lead["Business Name"] || "")}</td>
          <td>${escapeHtml(lead["Store Id"] || "")}</td>
          <td>${escapeHtml(lead["Business Id"] || "")}</td>
          <td>${escapeHtml(lead["Rx Name"] || "")}</td>
          <td>${escapeHtml(lead["GMV"] || "")}</td>
          <td>${escapeHtml(lead["Photo Coverage"] || "")}</td>
          <td>${escapeHtml(lead["Description Coverage"] || "")}</td>
          <td>${escapeHtml(lead["Uptime"] || "")}</td>
          <td>${escapeHtml(lead["Promo Opp"] || "")}</td>
          <td>${escapeHtml(lead["SI Opp"] || "")}</td>
          <td>${escapeHtml(lead["Lead Status"] || "")}</td>
          <td>${escapeHtml(lead["Priority Score"] || "")}</td>
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

  const rows = activities
    .slice()
    .reverse()
    .map(function (activity) {
      return `
        <tr>
          <td>${escapeHtml(activity["Timestamp"] || "")}</td>
          <td>${escapeHtml(activity["Store ID"] || "")}</td>
          <td>${escapeHtml(activity["Business Name"] || "")}</td>
          <td>${escapeHtml(activity["Activity Type"] || "")}</td>
          <td>${escapeHtml(activity["Notes"] || "")}</td>
          <td>${escapeHtml(activity["Outcome"] || "")}</td>
          <td>${escapeHtml(activity["Owner"] || "")}</td>
          <td>${escapeHtml(activity["Next Follow-Up"] || "")}</td>
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
