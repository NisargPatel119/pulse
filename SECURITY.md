# Security policy

Pulse handles personal health data, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not put details of a security problem in a public issue**. Instead, use GitHub's private reporting: on the repository's **Security** tab choose **Report a vulnerability**. Include what you found, how to reproduce it, and the impact. You will get a response as soon as the maintainer can, and credit in the fix if you want it.

If that button isn't available, open a public issue titled "Security contact request" with **no details**, and the maintainer will arrange a private channel.

## What is in scope

Pulse is self-hosted: each person runs their own copy with their own password, database and Google credentials. Reports about the code in this repository are in scope, for example:

- a way to read or change data without signing in
- a flaw in the sign-in or session handling
- a way to reach the cron or notification endpoints without the secret
- leaking of tokens, keys or health data in logs, responses or the repository

Problems in your own deployment's configuration (a weak `APP_PASSWORD`, a leaked `.env` file) are not code vulnerabilities, but see the hardening notes below.

## Hardening checklist for self-hosters

- Use a long, unique `APP_PASSWORD`. Anyone with it can see your data.
- Keep `.env` files and your Google client secret out of git and out of screenshots.
- Keep `CRON_SECRET` set so scheduled endpoints can't be called by others.
- Never set `DEMO_MODE=true` on the deployment that holds your real data.
- You can revoke Pulse's access to your Google account any time at <https://myaccount.google.com/permissions>.
- Keep your fork up to date so you get fixes.

## Design notes

- A single user, a single password; the session is a signed, HTTP-only cookie that expires after 30 days.
- All pages and API routes require a session, except `/login`, `/privacy`, the app icons and manifest, and the cron routes (which require `CRON_SECRET`).
- Pulse requests **read-only** Google Health scopes and stores the refresh token in your own database.
- There are no analytics or third-party scripts. Optional services (the AI coach and ntfy notifications) receive only short, numbers-only text.
