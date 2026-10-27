<img src="assets/icon.svg" width="64" height="64" alt="">

# Tax assessor

UK salary calculators: take-home pay, hourly wage, pro-rata, required salary, comparing two salaries, and comparing tax years. The site is static: all calculations run in the browser.

**Stack:** Astro (static output) · TypeScript · Zod (build-time validation only) · Vitest · nginx:alpine-slim

```sh
pnpm install
pnpm dev     # http://localhost:4321
pnpm test    # engine tests + checks from every tax-year file
pnpm build   # type-check and build to dist/
```

## Adding a new tax year

All the rates live in `src/data/tax-years/`, with one JSON file per year. The code doesn't need to change.

1. Copy the latest file and rename it, e.g. `2026-27.json` → `2027-28.json`.
2. Update `id`, `label`, `startDate` and `endDate`, and replace `sources[0]` with the new year's GOV.UK
   "Rates and thresholds for employers" page.
3. Update the numbers from that page:
   - `incomeTax.bands`: `upTo` is the top of each band in **taxable** income (above the allowance).
     The employer "Rates and thresholds" page lists it this way. `gov.uk/income-tax-rates` shows **total** income
     instead, so don't copy figures from there: they're £12,570 too high. Use `null` for the top band. Each region
     needs bands named `Basic` and `Higher`.
   - `nationalInsurance`, `studentLoans` (leave a plan out if it doesn't collect repayments that year), `pension`.
4. Update `checks` (at least one is required): add a few salaries with their expected tax, NI and take-home. Work them out by hand or with HMRC's
   [estimator](https://www.tax.service.gov.uk/estimate-paye-take-home-pay). `pnpm test` checks them.
5. Run `pnpm test && pnpm build`, then commit and push. Redeploy in Coolify (or set up the auto-deploy webhook; see below).

A file with a mistake (a missing field, bands out of order, an id that doesn't match the file name) fails the build.
The old version stays live. On 6 April (UK time) the site switches its default year to the file whose `startDate` has arrived. Commit the new file
before April. If it isn't deployed by then, the site keeps showing the previous year.

## Deploying on Coolify

Create an application from this repo with the **Dockerfile** build pack and port **80**. The image runs tests, builds,
and serves `dist/` from nginx. Base images are pinned to minor versions. The final image is about 22 MB and uses about 12 MB of RAM, with a health check at `/healthz`.

Live at https://taxaccessor.dufflebear.dev (Coolify project "Tax Assessor"). The repo is connected as a public repo,
so pushes don't deploy on their own. Click **Redeploy** in Coolify, or add a GitHub webhook: Coolify → app → Webhooks
→ GitHub, then add that URL and secret under the repo's Settings → Webhooks.
