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
