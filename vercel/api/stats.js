/**
 * Milk Tag Census – Vercel Serverless API (Node runtime)
 * -------------------------------------------------------
 * POST /api/stats  →  game (C#) reports live numbers
 * GET  /api/stats  →  Discord bot (or anyone with the key) reads snapshot + history
 *
 * Persistence: Upstash Redis
 *
 * Required env vars (Vercel dashboard → Settings → Environment Variables):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *   API_KEY
 */

const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();

const API_KEY = process.env.API_KEY || "milk-secret-key-change-me";
const HISTORY_KEY = "milk:history";
const CURRENT_KEY = "milk:current";
const MAX_HISTORY = 1500; // ~24h at 1 sample / min

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

async function getCurrent() {
  const raw = await redis.get(CURRENT_KEY);
  if (!raw) {
    return {
      in_rooms: 0,
      live_rooms: 0,
      sessions: 0,
      joined_last_10m: 0,
      peak_24h: 0,
      peak_24h_time: null,
      all_time_high: 0,
      all_time_high_time: null,
      last_update: null,
      join_timestamps: [],
    };
  }
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function getHistory() {
  const list = await redis.lrange(HISTORY_KEY, 0, -1);
  return (list || []).map((item) => {
    const parsed = typeof item === "string" ? JSON.parse(item) : item;
    return { t: parsed.t, c: parsed.c };
  });
}

export default async function handler(req, res) {
  // ── Auth ──────────────────────────────────────────────────────────
  const host = req.headers["host"] || "localhost";
  const url = new URL(req.url, `https://${host}`);
  const key = req.headers["x-api-key"] || url.searchParams.get("key");

  if (key !== API_KEY) return send(res, 401, { error: "unauthorized" });

  // ── GET → snapshot + history ──────────────────────────────────────
  if (req.method === "GET") {
    const current = await getCurrent();
    const history = await getHistory();

    const now = Date.now();
    const tenMinAgo = now - 10 * 60 * 1000;
    const recentJoins = (current.join_timestamps || []).filter((ts) => ts > tenMinAgo);

    return send(res, 200, {
      in_rooms: current.in_rooms || 0,
      live_rooms: current.live_rooms || 0,
      sessions: current.sessions || 0,
      joined_last_10m: recentJoins.length,
      peak_24h: current.peak_24h || 0,
      peak_24h_time: current.peak_24h_time,
      all_time_high: current.all_time_high || 0,
      all_time_high_time: current.all_time_high_time,
      last_update: current.last_update,
      history,
    });
  }

  // ── POST → update from game ───────────────────────────────────────
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    if (!body) return send(res, 400, { error: "invalid json" });

    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();

    const current = await getCurrent();

    current.in_rooms = Number(body.in_rooms ?? current.in_rooms) || 0;
    current.live_rooms = Number(body.live_rooms ?? current.live_rooms) || 0;
    current.sessions = Number(body.sessions ?? current.sessions) || 0;
    current.last_update = nowIso;

    const newJoins = Number(body.new_joins) || 0;
    if (!current.join_timestamps) current.join_timestamps = [];
    for (let i = 0; i < newJoins; i++) current.join_timestamps.push(nowMs);

    const tenMinAgo = nowMs - 10 * 60 * 1000;
    current.join_timestamps = current.join_timestamps.filter((ts) => ts > tenMinAgo);
    current.joined_last_10m = current.join_timestamps.length;

    if (current.sessions > (current.peak_24h || 0)) {
      current.peak_24h = current.sessions;
      current.peak_24h_time = nowIso;
    }
    if (current.sessions > (current.all_time_high || 0)) {
      current.all_time_high = current.sessions;
      current.all_time_high_time = nowIso;
    }

    await redis.set(CURRENT_KEY, JSON.stringify(current));

    // history sample (throttle ~1 per minute)
    const history = await getHistory();
    const last = history[history.length - 1];
    const shouldSample = !last || nowMs - new Date(last.t).getTime() >= 50_000;

    if (shouldSample) {
      await redis.rpush(HISTORY_KEY, JSON.stringify({ t: nowIso, c: current.sessions }));
      const len = await redis.llen(HISTORY_KEY);
      if (len > MAX_HISTORY) {
        await redis.ltrim(HISTORY_KEY, len - MAX_HISTORY, -1);
      }
    }

    // occasional safety prune of history older than 25h
    if (Math.random() < 0.05) {
      const cutoff = nowMs - 25 * 60 * 60 * 1000;
      const fresh = (await getHistory()).filter(
        (h) => new Date(h.t).getTime() > cutoff
      );
      if (fresh.length < history.length) {
        await redis.del(HISTORY_KEY);
        if (fresh.length > 0) {
          await redis.rpush(HISTORY_KEY, ...fresh.map((h) => JSON.stringify(h)));
        }
      }
    }

    return send(res, 200, { ok: true, received: body });
  }

  return send(res, 405, { error: "method not allowed" });
}
