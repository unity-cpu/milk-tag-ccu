# milk tag ccu

Live **Milk Tag** Discord census bot.  
Stats are reported by the in-game C# script → stored on **Vercel + Upstash Redis** → read by the Discord bot.

```
Unity game  ──POST──►  Vercel /api/stats  (Upstash Redis)
                              │
                              ▼
                       Discord bot reads it
                              │
                              ▼
                    /census  →  green embed + graph
```

## Folder structure

```
milk-tag-ccu/
├── bot.py                     ← Discord bot (reads from Vercel)
├── MilkTagReporter.cs         ← Unity script (POSTs to Vercel)
├── requirements.txt
├── .env.example
├── README.md
└── vercel/                    ← Deploy this folder to Vercel
    ├── api/stats.js
    ├── package.json
    └── vercel.json
```

---

## 1. Deploy the API to Vercel (5 minutes)

### A. Create free Upstash Redis
1. Go to https://upstash.com → sign up / log in
2. Create a new **Redis** database (any region, free tier is fine)
3. Copy the **REST URL** and **REST TOKEN**

### B. Deploy to Vercel
```bash
cd milk-tag-ccu/vercel
npm install
npx vercel
```
(or just drag the `vercel` folder onto https://vercel.com/new)

### C. Set environment variables in Vercel
In your Vercel project → Settings → Environment Variables:

| Name                        | Value                                      |
|-----------------------------|--------------------------------------------|
| `UPSTASH_REDIS_REST_URL`    | (from Upstash)                             |
| `UPSTASH_REDIS_REST_TOKEN`  | (from Upstash)                             |
| `API_KEY`                   | `milk-secret-key-change-me` (or your own)  |

Redeploy after adding the vars.

Your API will be live at:
```
https://YOUR-PROJECT.vercel.app/api/stats
```

Test it:
```bash
curl -X GET "https://YOUR-PROJECT.vercel.app/api/stats" \
  -H "X-Api-Key: milk-secret-key-change-me"
```

---

## 2. Discord bot

The bot **only works in one server**.  
Enable Developer Mode in Discord → right-click your server → **Copy Server ID** → put it in `.env` as `ALLOWED_GUILD_ID`.

```bash
cd milk-tag-ccu
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env:
#   DISCORD_TOKEN=...
#   API_KEY=milk-secret-key-change-me
#   VERCEL_API_URL=https://YOUR-PROJECT.vercel.app/api/stats
#   ALLOWED_GUILD_ID=your_server_id

python bot.py
```

Invite the bot with scopes `bot` + `applications.commands`.

Commands:
- `/census`
- `/milk`
- `!census`

---

## 3. Unity C# script

1. Copy `MilkTagReporter.cs` into your Unity project.
2. Attach it to a persistent GameObject.
3. In the Inspector the interval is already set (30 s default).
4. Encode your real URL + key:
   - Open the script, put the real values in the `#if UNITY_EDITOR` method at the bottom.
   - In the Inspector right-click the component → **Encode URL + Key**.
   - Paste the printed Base64 strings into the two `static readonly byte[]` fields.
5. Implement the three methods at the bottom for your networking (Photon / Mirror / etc.).  
   Demo random numbers are already there so you can test immediately.

---

## Data the game sends (POST)

```json
{
  "sessions": 41,
  "in_rooms": 19,
  "live_rooms": 9,
  "new_joins": 3
}
```

- `sessions` → current online players  
- `in_rooms` → players inside rooms  
- `live_rooms` → active rooms  
- `new_joins` → players that joined **since last report** (used for “Joined Last 10m”)

---

## Notes

- Everything is stored in Upstash Redis → survives cold starts and redeploys.
- History is automatically trimmed to ~24 h.
- Peaks & All-Time High are tracked server-side.
- Change `API_KEY` to something secret before going public.
- The Discord bot can run anywhere (your PC, Railway, etc.) – it only needs to be able to reach the Vercel URL.

Drink milk. Become strong. 🥛
