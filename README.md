# Milk Tag CCU — no local .env

The Discord bot reads settings from `config.json`; it does not require a local `.env` file.

## Run the bot (Windows)
1. Open `config.json` and fill in the Discord bot token, the same API key used by Vercel, your deployed API URL, and your Discord server ID.
2. In PowerShell in this folder, run:

   `py -m pip install -r requirements.txt`

   `py bot.py`

The bot provides `/census`, `/milk`, and `!census`. Invite it with `bot` and `applications.commands` scopes. Enable Message Content Intent in the Discord Developer Portal if you use `!census`.

## Vercel
Deploy the `vercel` folder as the project root. Keep these server-side environment variables configured in Vercel: `API_KEY`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. Redeploy after changing them. The `API_KEY` in `config.json` must match the Vercel value.

## Unity
Copy `MilkTagReporter.cs` into Unity and set its API URL/key to your deployment. Check its networking count methods and replace any placeholders with real Photon values before using live data.

## Security
`config.json` is ignored by Git. Do not share it or commit it because it contains your Discord token. Vercel environment variables are still required by the backend. A secret embedded in a Unity client can be extracted, even if Base64-encoded.
