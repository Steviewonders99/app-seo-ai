# Set up the SEO AI Keyword Connector in Claude

This adds **Google Ads Keyword Planner** research directly inside Claude.
Use it to plan keywords for new articles.

You need two things from Steven:

1. **The shared access token** — a long random string. Treat it like a password.
2. **(Web only)** the connector URL: `https://connector-theta-ten.vercel.app/api/mcp`

You only set this up **once**.

---

## Claude Desktop (recommended — one click)

1. Open this link in your browser to download the installer:
   👉 `https://connector-theta-ten.vercel.app/seo-ai-keywords.dxt`

2. **Double-click the downloaded `seo-ai-keywords.dxt` file.** Claude Desktop opens an install dialog.

3. Paste the **shared access token** into the field labeled "Shared access token."

4. Click **Install**.

5. Open a new conversation. You're done — try:

   > *Research keywords for an article about [your topic].*

**To update the token later:** Claude Desktop → Settings → Extensions →
**SEO AI — Keyword Research** → Configuration → paste the new token.

---

## Claude.ai (web)

1. Go to **Settings → Connectors → Add custom connector**.

2. **Server URL**: `https://connector-theta-ten.vercel.app/api/mcp`

3. **Authentication**: **Bearer token** — paste the shared access token Steven sent.

4. Save and toggle the connector **on**.

5. Open a new conversation and try the same prompt as above.

---

## What you can ask Claude

The tools are most useful for article-research workflows. Some prompts that work well:

- *"Research keywords for an article about engine leasing for charter operators."*
- *"What's the search volume for 'aircraft engine lease' in the UK?"*
- *"Give me 30 long-tail keyword ideas around 'asset management for engine portfolios'."*
- *"For each of these 5 keywords, fetch monthly searches and competition: …"*
- *"Forecast historical metrics for: …"*

Claude will pick the right tool automatically. If it doesn't, mention "use the SEO AI connector" explicitly.

---

## Troubleshooting

| What you see                                        | What to do                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `401 Unauthorized` or "wrong token"                 | Double-check you pasted the token correctly. Ping Steven.        |
| `429 Too Many Requests`                             | You hit the hourly limit (60 calls). Wait a bit or ask Steven.   |
| Claude Desktop won't install the `.dxt`             | Try the **Claude.ai (web)** flow instead — it works the same.    |
| "Can't add custom connector" (web)                  | Confirm the URL ends in `/api/mcp` (not just the domain).        |
| Claude doesn't seem to use the connector            | Mention "use the SEO AI connector" explicitly in your prompt.    |
| `health_check` reports `missingEnvVars`             | Server-side config issue. Ping Steven.                           |

---

## What this does NOT do

- It does not browse competitor sites or fetch SERPs — only Google Ads Keyword Planner.
- It does not write or save anything. All it does is read keyword data.
- It does not share your prompts with anyone outside the Google Ads API call.
