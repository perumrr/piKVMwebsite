import express from "express";
import axios from "axios";
import fs from "node:fs/promises";
import { Agent as HttpsAgent } from "node:https";

const app = express();
const port = Number(process.env.PORT || 3000);
const configPath = process.env.PIKVM_CONFIG || "/app/config/pikvms.json";
const timeout = Number(process.env.STATUS_TIMEOUT_MS || 5000);

app.disable("x-powered-by");
app.use(express.json());

async function loadPikvms() {
  const raw = await fs.readFile(configPath, "utf8");
  const list = JSON.parse(raw);

  if (!Array.isArray(list)) {
    throw new Error("PiKVM config must be an array");
  }

  return list;
}

function apiFor(pikvm) {
  return axios.create({
    baseURL: `https://${pikvm.host}:${pikvm.port ?? 443}`,
    timeout,
    auth: {
      username: pikvm.username,
      password: pikvm.password
    },
    // PiKVM commonly uses a self-signed certificate. TLS is still used,
    // but certificate verification is disabled for the private upstream.
    // If your PiKVMs have trusted certificates, set this to false.
    httpsAgent: new HttpsAgent({ rejectUnauthorized: false }),
    validateStatus: (status) => status >= 200 && status < 300
  });
}

async function getStatus(pikvm) {
  const api = apiFor(pikvm);

  const result = {
    id: pikvm.id,
    name: pikvm.name,
    url: pikvm.url,
    state: "offline",
    reachable: false,
    inUse: false,
    targetPower: "unknown",
    targetConnected: null,
    lastChecked: new Date().toISOString(),
    error: null
  };

  try {
    const [info, streamer, atx, systems] = await Promise.allSettled([
      api.get("/api/info?fields=meta,system"),
      api.get("/api/streamer"),
      api.get("/api/atx"),
      api.get("/api/redfish/v1/Systems")
    ]);

    if (info.status !== "fulfilled") {
      throw new Error(`PiKVM API unavailable: ${info.reason?.message ?? "unknown error"}`);
    }

    result.reachable = true;

    if (streamer.status === "fulfilled") {
      const stream = streamer.value.data?.result?.streamer?.stream;
      const clients = Number(stream?.clients ?? 0);
      const h264Clients = Boolean(
        streamer.value.data?.result?.streamer?.sinks?.h264?.has_clients
      );
      result.inUse = clients > 0 || h264Clients;
    }

    if (atx.status === "fulfilled") {
      const atxResult = atx.value.data?.result;
      if (atxResult?.enabled === true) {
        result.targetPower = atxResult?.leds?.power === true ? "on" : "off";
      }
    }

    if (systems.status === "fulfilled") {
      const members = systems.value.data?.Members;
      if (Array.isArray(members)) {
        result.targetConnected = members.length > 0;
      } else if (Number.isInteger(systems.value.data?.["Members@odata.count"])) {
        result.targetConnected = systems.value.data["Members@odata.count"] > 0;
      }
    }

    if (result.inUse) {
      result.state = "in_use";
    } else if (result.targetConnected === false) {
      result.state = "no_target";
    } else if (result.targetPower === "on") {
      result.state = "target_on";
    } else if (result.targetPower === "off") {
      result.state = "target_off";
    } else {
      result.state = "online";
    }

    return result;
  } catch (error) {
    result.error = error.message;
    return result;
  }
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/pikvms", async (_req, res) => {
  try {
    const pikvms = await loadPikvms();
    const statuses = await Promise.all(pikvms.map(getStatus));
    res.set("Cache-Control", "no-store");
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use(express.static("public", {
  extensions: ["html"]
}));

app.listen(port, "0.0.0.0", () => {
  console.log(`PiKVM dashboard listening on ${port}`);
});
