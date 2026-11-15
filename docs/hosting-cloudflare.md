# Hosting Lodgy Co-op on Cloudflare

The game runs on Cloudflare as one Worker (the page and the front door) plus one Durable Object per room (the simulation). It stays online without your computer. Rooms live in memory and end when everyone leaves, when Cloudflare restarts the room's object, or when you deploy a new version.

## What you need

- A Cloudflare account (you have one).
- The **Workers Paid** plan ($5 per month) is recommended. Durable Objects also work on the Free plan, but its daily quota (about 100,000 requests a day) is used up after roughly 1.5 hours of one busy 6-player room.
- Node 22.12 or later and a copy of this repository on your own computer.

## First deploy

```bash
git pull
npm install
npx wrangler login
npm run deploy:cf
```

`npx wrangler login` opens a browser so you can authorise your Cloudflare account. `npm run deploy:cf` builds the page, prepares the physics library for Workers, and deploys. When it finishes it prints an address like `https://lodgy-coop.<your-subdomain>.workers.dev`. Open it, create a room, and share the room's address with friends.

The first deploy asks you to choose a free `workers.dev` subdomain if you have none. A custom domain can be added later in the Cloudflare dashboard (Workers, your worker, Settings, Domains).

## Day to day

| What | Command |
|---|---|
| Deploy a new version (ends every running room) | `npm run deploy:cf` |
| Watch live logs | `cd packages/worker && npx wrangler tail` |
| Roll back to the previous version | `cd packages/worker && npx wrangler rollback` |
| Try it locally on the Cloudflare runtime | `npm run dev:worker` then open `http://localhost:8787/` |

## What it costs (numbers read from Cloudflare's documentation, November 2026)

- Durable Object requests: 1 million per month included, then $0.15 per million. Incoming WebSocket messages are billed 20 to 1; outgoing messages are free.
- Duration: $12.50 per million GB-seconds, billed for 128 MB while a room is active; 400,000 GB-seconds per month included.
- A 6-player room at 60 inputs a second costs about **$0.016 per active hour**. A room nobody is in costs nothing, because its object is evicted.
- The Workers Paid plan itself is $5 per month.

Always check Cloudflare's pricing page before relying on these numbers, since they change.

## Protect yourself from surprise bills (do this once)

The server limits connections per room and per address, but it cannot limit one visitor across many rooms. Cloudflare can:

1. **Durable Objects spending limit** (works on the address you get from the first deploy): a monthly cap across your whole account. Once reached, affected operations are refused ("Exceeded the account's spending cap for Durable Objects") until the next billing period; nothing is deleted. Set it by following Cloudflare's page "Durable Objects: Spending limits" (https://developers.cloudflare.com/durable-objects/platform/spend-management/), which has the dashboard steps and the `cf` command.
2. **Rate limiting rule on `/ws`** (only if you later add your own domain): WAF rules apply to a domain you own on Cloudflare, not to a `*.workers.dev` address. With a custom domain, add a rate limiting rule matching the path `/ws` (Dashboard, Security, WAF, Rate limiting rules). The Free plan only allows a 10-second period (for example 5 requests per 10 seconds per IP); paid plans allow longer periods. Until you add a domain, rely on the spending limit above.

## What players see when something restarts

- If Cloudflare restarts a room's object, or you deploy, every player in that room loses the connection. The page shows "Reconnecting...", reconnects, and then reports that the room no longer exists. Everyone returns to the home page and creates a new room.
- A room that is empty for a while is removed by the server, as on the Node server.

## Limits worth knowing

- One room is one Durable Object, which is single-threaded: a 6-player room uses a few percent of its CPU, so rooms do not slow each other down.
- The per-address connection cap is counted per room (12, the same as the room's own limit), so it does not add protection beyond the room cap, and every IPv6 address counts as a separate visitor.
- Anyone can open a connection from any website (there are no accounts or cookies); abuse is handled by the two dashboard settings above.
- Static files are served by Cloudflare, so cache headers and content types differ slightly from the Node server. The game does not depend on them.

## Running it without Cloudflare

`npm start` still runs the whole game on your own computer on one port, and `npm run share` shares it through a quick tunnel. The Node server and the Cloudflare Worker use the same game code and the same page.
