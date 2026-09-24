<!--
  This file currently contains ONLY the "Google sign-in setup" section, drafted by Agent G
  (server-side Google sign-in) as part of building POST /auth/google*. The lead will merge this
  into the full project README during integration — please fold the section below into wherever
  the deployment/setup docs land rather than treating this file as the final README.
-->

## Google sign-in setup

Family Vault supports signing in with Google (Google Identity Services' ID-token flow — no OAuth
redirect, no client secret). It's entirely optional: leave the env vars below unset and the
feature is off end-to-end (the client hides the Google button; the server's `/auth/google*`
endpoints respond `501`).

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (or pick
   an existing one).
2. Under **APIs & Services → OAuth consent screen**, configure it: choose **External**, set an
   app name, and provide a support email.
3. Under **APIs & Services → Credentials**, click **Create credentials → OAuth client ID**, and
   choose **Web application** as the application type.
4. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000`
   - `https://<your-vercel-domain>`
5. Copy the generated **Client ID** into:
   - `GOOGLE_CLIENT_ID` on the server (Render)
   - `VITE_GOOGLE_CLIENT_ID` on the client (Vercel)

No client secret is needed for this flow — the server only verifies the ID token Google's client
library hands back (`google-auth-library`'s `OAuth2Client.verifyIdToken`), it never performs a
server-side OAuth exchange.

## Email (Gmail SMTP) setup

Family Vault sends transactional email (password resets, member invites, and admin security
alerts — a new member added/removed/disabled, a sensitive or never-expiring share link, a share
link locked out, documents/folders deleted, repeated failed sign-ins, a sign-in from a new
device, and storage crossing 80%/95%) over Gmail SMTP via `nodemailer`. There is no separate
digest/summary email — the Dashboard and Activity Log already show recent activity on demand.
Email is entirely optional: leave `SMTP_HOST` unset and it's off end-to-end — in development the
server logs the subject + link to the console instead of sending, so the forgot-password/invite
flows still work locally with no setup; in production it silently no-ops (new members fall back
to the existing admin-sets-a-temporary-password flow, and "Forgot password?" quietly does
nothing).

1. Turn on **2-Step Verification** on the Gmail account you want to send from
   (https://myaccount.google.com/security).
2. Go to https://myaccount.google.com/apppasswords and create an app password named
   "Family Vault" (16 characters, no spaces).
3. Set these on Render (server) and in your local `server/.env`:
   - `SMTP_USER` — the Gmail address
   - `MAIL_FROM` — e.g. `"Family Vault <that-same-address@gmail.com>"`
   - `SMTP_PASS` — the 16-character app password from step 2 (never the normal account password)
   - `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE` already default to `smtp.gmail.com`/`465`/`true` in
     `.env.example` — only override these for a non-Gmail SMTP provider.

That's it — no cron job or other scheduled task to set up.

Gmail's free sending limit is roughly **500 emails/day** per account, which is generous for a
single family's admin alerts. All outbound mail is sent *from* the Gmail address you configure —
recipients see that address as the sender, not a Family Vault domain.
