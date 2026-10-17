import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CURRENT_KEY = 'milk-tag:current';

export default async function handler(req, res) {
  const expectedKey = process.env.API_KEY;
  if (!expectedKey || req.headers['x-api-key'] !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const { sessions, in_rooms, live_rooms, new_joins } = req.body;
    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();

    // Load existing data (or create a blank slate if empty)
    let state = await redis.get(CURRENT_KEY) || {
      sessions: 0, in_rooms: 0, live_rooms: 0,
      history: [], join_history: [],
      peak_24h: 0, peak_24h_time: null,
      all_time_high: 0, all_time_high_time: null,
    };

    // 1. Update 24h History Chart
    let history = state.history || [];
    history.push({ t: nowIso, c: sessions });
    const cutoff24h = nowMs - 24 * 60 * 60 * 1000;
    history = history.filter(h => new Date(h.t).getTime() > cutoff24h);

    // 2. Calculate 24h Peak
    let peak_24h = 0;
    let peak_24h_time = null;
    for (const point of history) {
      if (point.c > peak_24h) {
        peak_24h = point.c;
        peak_24h_time = point.t;
      }
    }

    // 3. Calculate All-Time High
    let all_time_high = state.all_time_high || 0;
    let all_time_high_time = state.all_time_high_time || null;
    if (sessions > all_time_high) {
      all_time_high = sessions;
      all_time_high_time = nowIso;
    }

    // 4. Calculate Joined Last 10m
    let join_history = state.join_history || [];
    if (new_joins > 0) {
      join_history.push({ t: nowIso, n: new_joins });
    }
    const cutoff10m = nowMs - 10 * 60 * 1000;
    join_history = join_history.filter(j => new Date(j.t).getTime() > cutoff10m);
    const joined_last_10m = join_history.reduce((sum, j) => sum + j.n, 0);

    // 5. Save everything back to Upstash
    const newState = {
      sessions, in_rooms, live_rooms, last_update: nowIso,
      history, join_history,
      peak_24h, peak_24h_time,
      all_time_high, all_time_high_time,
      joined_last_10m,
    };

    await redis.set(CURRENT_KEY, newState);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const state = await redis.get(CURRENT_KEY);
    if (!state) {
      return res.status(200).json({
        sessions: 0, in_rooms: 0, live_rooms: 0, last_update: null,
        history: [], peak_24h: 0, peak_24h_time: null, all_time_high: 0, all_time_high_time: null, joined_last_10m: 0
      });
    }
    return res.status(200).json(state);
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}