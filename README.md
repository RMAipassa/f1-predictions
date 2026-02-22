F1 predictions (self-hosted on Windows) with:
- Local accounts (nickname + password)
- Private leagues via invite code
- Season predictions (WDC/WCC + 5 manual "random" predictions)
- Race predictions (pole + podium) with automatic result sync (Ergast-compatible API)
- Optional Cloudflare Tunnel (`cloudflared`) for `https://f1.rubyruben.nl`

## Getting Started

### 1) Run locally (dev)
- Copy `.env.example` to `.env.local`
- Run:

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3210](http://localhost:3210) with your browser to see the result.

Note: this repo uses port 3210 by default.

### 2) Load season data + results
- In the app:
  - Create a league
  - Open `league/<CODE>/admin`
  - Click:
    - "Sync season data" (loads races/drivers/constructors)
    - "Sync completed race results" (fills pole + podium)

Optional (automation):
- Set `CRON_SECRET` in `.env.local`
- POST ` /api/cron/sync-season?season=YYYY ` with header `x-cron-secret: <CRON_SECRET>`
- POST ` /api/cron/sync-results?season=YYYY ` with header `x-cron-secret: <CRON_SECRET>`

Key paths:
- `src/app/league/[code]/season/page.tsx` (WDC/WCC/random)
- `src/app/league/[code]/races/[round]/page.tsx` (pole + podium)
- `src/app/api/cron/sync-*/route.ts` (sync jobs)

### Windows installer (.exe)
- Build an installer:
  - `npm run dist`
- Output ends up in `dist/`.
- On first run, register the host account, then set the Cloudflare Tunnel token at `/settings`.

Data source:
- Default: `https://api.jolpi.ca/ergast` (Ergast-compatible)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
