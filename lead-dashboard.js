const API_URL = "PASTE_YOUR_WEB_APP_URL_HERE";

function loadLeads() {
  const callbackName = "handleLeadsResponse_" + Date.now();

  window[callbackName] = function(response) {
    try {
      if (!response.success) {
        console.error("Lead load failed:", response.message);
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

  window[callbackName] = function(response) {
    try {
      if (!response.success) {
        console.error("Activity load failed:", response.message);
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
