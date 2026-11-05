# Contributing to Pulse

Thanks for helping make Pulse better. Bug reports, fixes, new insights and doc improvements are all welcome.

## Ground rules

- **Keep it private and free.** Pulse's promise is that your data stays in your own database and everything runs on free tiers. Changes that add tracking, analytics, ads or a paid dependency won't be accepted.
- **Keep the methods transparent.** If you change how a score is computed, update [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) and, where it is based on research, cite the source.
- **No medical claims.** Pulse gives wellness estimates. Don't phrase anything as a diagnosis or treatment.
- **Accessibility matters.** Don't rely on color alone (use patterns, labels or position too), keep tap targets comfortable, and check the UI at the largest display-size setting.

## Getting set up

```bash
git clone https://github.com/NisargPatel119/pulse.git
cd pulse
npm install
npm run demo          # http://localhost:3002 with made-up data, no accounts needed
```

To work against real data you need your own Google Cloud OAuth client and a Postgres database. See [docs/SETUP.md](docs/SETUP.md) and use `.env.local` (git-ignored).

Before opening a pull request:

```bash
npx tsc --noEmit      # type check
npm run build         # production build
```

CI runs the same two commands.

## Where things live

| Area | Files |
|---|---|
| Google Health data fetching and normalizing | `src/lib/health.ts` |
| Scores, insights, analytics | `src/lib/scores.ts`, `src/lib/healthspan.ts`, `src/lib/weekly.ts` |
| Demo data (screenshots and `npm run demo`) | `src/lib/demo.ts` |
| API routes, cron jobs, auth | `src/app/api/`, `src/proxy.ts`, `src/lib/session.ts` |
| UI (plain JavaScript, no build step) | `public/app.js`, `public/charts.js`, `public/style.css` |

## Tips

- **Do not commit secrets or real health data.** `.env*` files are git-ignored. Use demo data for screenshots and fixtures.
- Google Health API response shapes were only partly documented when this was built. If you find a field that is named or shaped differently, fix the tolerant extraction in `src/lib/health.ts` and mention what you saw (without any personal data) in the PR.
- If you add a metric, make it appear in **Settings → Data health** so people can tell whether it is arriving.
- Keep PRs focused. A short description of what changed and why is plenty.

## Reporting bugs and ideas

Use the [issue templates](https://github.com/NisargPatel119/pulse/issues/new/choose). For a data problem, include what **Settings → Data health** shows, but never paste passwords, keys or your database URL. For security issues, see [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
