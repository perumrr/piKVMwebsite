const cards = document.querySelector("#cards");
const message = document.querySelector("#message");

const labels = {
  in_use: "In use",
  target_on: "Powered on",
  target_off: "Powered off",
  no_target: "No system connected",
  online: "Online",
  offline: "Offline",
  unknown: "Unknown"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function card(p) {
  const state = labels[p.state] || labels.unknown;
  const statusClass = p.state;

  return `
    <article class="card">
      <div class="card-head">
        <div>
          <h3>${escapeHtml(p.name)}</h3>
          <div class="sub">${escapeHtml(p.id)}</div>
        </div>
        <span class="status ${statusClass}">
          <span class="dot"></span>${escapeHtml(state)}
        </span>
      </div>

      <dl>
        <div>
          <dt>PiKVM</dt>
          <dd>${p.reachable ? "Reachable" : "Offline"}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>${
            p.targetConnected === false
              ? "Not detected"
              : p.targetPower === "on"
                ? "Powered on"
                : p.targetPower === "off"
                  ? "Powered off"
                  : "Unknown"
          }</dd>
        </div>
        <div>
          <dt>Users</dt>
          <dd>${p.inUse ? "Active connection" : "None detected"}</dd>
        </div>
      </dl>

      ${
        p.reachable
          ? `<a class="button" href="${escapeHtml(p.url)}">Open PiKVM</a>`
          : `<button class="button disabled" disabled>Unavailable</button>`
      }

      ${p.error ? `<p class="error">${escapeHtml(p.error)}</p>` : ""}
    </article>
  `;
}

async function refresh() {
  try {
    const response = await fetch("/api/pikvms", {
      cache: "no-store",
      credentials: "same-origin"
    });

    if (response.status === 401 || response.status === 403) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      throw new Error(`Dashboard request failed (${response.status})`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Invalid dashboard response");
    }

    cards.innerHTML = data.map(card).join("");
    message.textContent = data.length
      ? `Last updated ${new Date().toLocaleTimeString()}`
      : "No PiKVMs configured.";
  } catch (error) {
    message.textContent = error.message;
  }
}

refresh();
setInterval(refresh, 10000);
