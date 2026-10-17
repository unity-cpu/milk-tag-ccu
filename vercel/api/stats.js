import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();
const CURRENT_KEY = "milk-tag:current";
const HISTORY_KEY = "milk-tag:history";

export default async function handler(req, res) {
  const expected = process.env.API_KEY;
  if (!expected || req.headers["x-api-key"] !== expected) return res.status(401).json({ error: "Unauthorized" });
  if (req.method === "GET") {
    const data = await redis.get(CURRENT_KEY);
    return res.status(200).json(data || { sessions: 0, in_rooms: 0, live_rooms: 0, new_joins: 0 });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const data = {
    sessions: Math.max(0, Number(body.sessions) || 0),
    in_rooms: Math.max(0, Number(body.in_rooms) || 0),
    live_rooms: Math.max(0, Number(body.live_rooms) || 0),
    new_joins: Math.max(0, Number(body.new_joins) || 0),
    updated_at: new Date().toISOString()
  };
  await redis.set(CURRENT_KEY, data);
  await redis.lpush(HISTORY_KEY, JSON.stringify(data));
  await redis.ltrim(HISTORY_KEY, 0, 2879);
  return res.status(200).json({ ok: true });
}
