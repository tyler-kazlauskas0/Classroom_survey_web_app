# Deployment (Cloudflare Workers static assets)

The app is a static single-page app, deployed with **Workers Builds** using
[`wrangler.jsonc`](../wrangler.jsonc).

| Setting (Workers → your worker → Settings → Build) | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

`wrangler.jsonc` serves `dist/` and sets
`"not_found_handling": "single-page-application"`, so deep links such as
`/dashboard` and `/s/<code>` load the app. Do **not** add a `public/_redirects` file
with `/* /index.html 200`: Workers rejects it as an infinite loop (error 100324).

## Environment variables: set them as *build* variables

Vite bakes `VITE_*` values into the JavaScript **at build time**, so add them under
**Settings → Build → Variables and secrets** (not the runtime *Variables* section):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon or `sb_publishable_…` key (public) |
| `VITE_PUBLIC_SITE_URL` | your site URL, e.g. `https://classroom-survey-web-app.<subdomain>.workers.dev` |

Never add the database password, the service_role key or an `sb_secret_…` key. If the
Supabase variables are missing, the site shows a *Configuration error* page.
Redeploy after changing variables.

## After the first successful deploy

1. Supabase → **Authentication → URL Configuration → Site URL**: set your site URL.
2. Open the site, log in, activate a test survey, and scan the QR code with a phone.
   It should point at the site URL, with no localhost warning.
3. Submit from the phone and check Results.

## Test the production setup locally

```bash
npm run build
```

```bash
npx wrangler dev
```

Then open <http://localhost:8787/dashboard>; it should load the app, not a 404.
