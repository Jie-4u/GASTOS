# Gastos setup guide

## Run locally

1. Create and activate a Python virtual environment.
2. Install dependencies with `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env`.
4. Generate a unique `SECRET_KEY` (PowerShell: `python -c "import secrets; print(secrets.token_urlsafe(48))"`) and put it in `.env`.
5. Keep `APP_BASE_URL=http://127.0.0.1:5000` for local-only use. For remote invitations, use the permanent HTTPS URL of the deployed app.
6. Run `python app.py` and open `http://127.0.0.1:5000`.
7. Run regression tests with `python -m unittest discover -s tests`.

The `.env` file is ignored by Git. Do not commit real keys or passwords. Existing local development databases are under `instance/` and are ignored.

## Invitation email

Invitations already work as shareable links without an email provider. With no SMTP settings, Gastos displays the link and returns `delivery=manual_share`.

To send invite emails through Brevo, configure these values in `.env`:

- `SMTP_HOST=smtp-relay.brevo.com`
- `SMTP_PORT=587`
- `SMTP_USERNAME`: the SMTP login shown in Brevo's SMTP settings (it may differ from your Brevo sign-in email).
- `SMTP_PASSWORD`: an SMTP key from Brevo, **not** a Brevo API key.
- `SMTP_FROM`: an address configured and verified as a sender in Brevo.
- `SMTP_FROM_NAME`: optional display name (defaults to `Gastos`).

In Brevo, open **Settings → SMTP & API**, create an SMTP key, and confirm transactional email sending is enabled. Authenticate the sending domain you control and use a sender at that domain for production delivery. Brevo notes that free email domains such as Gmail cannot be authenticated; domain verification may take up to 48 hours. See [Brevo SMTP setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), [SMTP keys](https://help.brevo.com/hc/en-us/articles/7959631848850-Create-and-manage-your-SMTP-keys), and [domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC).

Restart Gastos after changing `.env`. The invite response reports `sent`, `manual_share`, or `failed`; failed delivery does not remove the saved invitation, so the owner can still copy and share its link. Do not use your Brevo account password or an API key as the SMTP password.

The same SMTP sender is used for password-reset messages. Reset links are signed, stored as hashes, expire after 15 minutes, and can be used once. Requests return the same message whether or not the email exists to avoid account enumeration. A real mail delivery still depends on Brevo accepting the sender and SMTP credentials.

### Test invitations against your local app

For local end-to-end testing, set `APP_BASE_URL=http://127.0.0.1:5000` and restart Gastos. Create an invitation for an inbox you can open on the **same computer**. Brevo can deliver the message, and the link opens your local app in that computer's browser. The link is not reachable from another person's device because `127.0.0.1` always means "this device." For another device or remote tester, use a running HTTPS tunnel or a staging deployment and set `APP_BASE_URL` to that reachable HTTPS address for the entire test. Restart Gastos after switching the URL and resend invitations created under the previous URL.

Invitees who create an account from the invitation are added to the family as **Members** during signup and signed in automatically. If that browser is currently signed in as a different user (common when testing locally), the invitation screen asks the tester to sign in or create an account using the invited email before accepting. Members can view shared family dashboards, reports, transactions, bills, budgets, and goals; add and edit their own transactions; and contribute to savings goals. Only the owner can change other members' transactions, manage bills/budgets/goals, invite/remove members, or manage the subscription. These rules are enforced by the API as well as reflected in the interface.

The app generates links at `APP_BASE_URL/?invite=...`. Localhost links only work on the computer running Gastos. For a temporary remote demo, ngrok can expose port 5000, but its agent must stay online and its address can change. A link to an offline ngrok endpoint cannot be repaired by Brevo; the invitation has to be resent after the permanent address is available. For real users, deploy Gastos and use a stable HTTPS hosting URL or a custom domain. Gastos and its API are served from the same origin, so that single URL serves both.

## Deploy on Render (recommended starting path)

This repository includes `render.yaml` and a `Procfile` for a production Gunicorn web service. Render hosts the Python app; PostgreSQL stores accounts, invitations, and finances; Brevo sends the email. The database and web service are separate resources. Use a paid/persistent production database and check the provider's current prices and backup/retention terms before creating it. Do not use the app's default SQLite database for deployment: local instance files may be ephemeral and are not shared across instances.

1. Push this project to a private GitHub repository. Confirm `.env` is ignored and do not commit secrets.
2. In Render, create a PostgreSQL database. Copy its **internal** connection string for a service in the same Render region.
3. In Render, create a Blueprint from the repository and review the resources before applying. The Blueprint defines the Gastos web service and prompts for `APP_BASE_URL`, `DATABASE_URL`, and Brevo credentials. If you create the web service first, its `onrender.com` URL appears in the dashboard; set that exact HTTPS origin as `APP_BASE_URL` and set `DATABASE_URL` to the PostgreSQL internal connection string.
4. Set `SMTP_USERNAME` to the SMTP login from Brevo, `SMTP_PASSWORD` to the SMTP key, and `SMTP_FROM` to a verified sender address on a domain you control. Keep SMTP port 587. Do not use a Brevo API key or account password as the SMTP password.
5. Deploy, then open `https://<your-app-host>/health`. It should return `{"status":"ok"}`. Confirm the app's public URL is the same value configured in `APP_BASE_URL`.
6. Sign in as the family owner and create an invitation for an email account you can access. Confirm the delivery status is **sent**, the email arrives, and its button opens the deployed app. Sign in or register using the exact invited email to accept it.
7. Test **Resend** and **Cancel invitation**. Resend rotates the token, so an earlier link must stop working. If the public app URL changes, update `APP_BASE_URL`, redeploy/restart, then resend each still-needed invitation.

Render's Flask guide uses Gunicorn for production and its Blueprint supports health checks and secret environment variables. See [Deploy a Flask App on Render](https://render.com/docs/deploy-flask), [Blueprint specification](https://render.com/docs/blueprint-spec), and [Render environment variables](https://render.com/docs/configure-environment-variables).

Other suitable options are Railway, Fly.io, or a VPS. Each needs a persistent PostgreSQL database, HTTPS, a production WSGI server, and the same environment variables below. A VPS is more hands-on (you manage TLS, OS updates, process restarts, firewall, and backups). Ngrok is a development tunnel, not a reliable deployment address.

## Production settings

- Set `SECRET_KEY` to a unique random secret and keep it in the host's secret manager.
- Set `APP_ENV=production`; startup refuses to use the development fallback key in this mode.
- Set `APP_BASE_URL` to the canonical HTTPS origin (for example `https://gastos.example.com`). Production startup rejects a missing/non-HTTPS URL, URL path, or SQLite database. Invitation links are not built from request headers.
- Set `DATABASE_URL` to the production PostgreSQL connection string. Back up existing data before deployment. The web service's health check at `/health` checks database connectivity.
- Configure SMTP values if invitations should be delivered by email.
- Serve the app behind HTTPS and use a production WSGI server. Direct `python app.py` startup enables debug mode only when `FLASK_DEBUG=1`.

The repository currently applies additive schema changes at app startup. The included Gunicorn command uses one worker because startup schema changes are not safe to race across multiple worker processes. Before scaling to multiple instances or running broader production workloads, replace startup DDL with versioned migrations run once before workers start.

## Premium payments: account setup still required

You can start with PayMongo test mode while Gastos is still a prototype; test keys are available before full live business verification. For live service, PayMongo's current Subscriptions API supports recurring Visa/Mastercard and Maya payments. Your account needs the underlying method activated, and PayMongo must separately enable Subscriptions. Card subscriptions also require Card Vaulting. Account activation and method eligibility depend on identity/business verification and the payment method requested. See [PayMongo account creation](https://docs.paymongo.com/docs/get-started-create-your-account), [Subscriptions](https://docs.paymongo.com/docs/payment-acceptance-subscriptions), [account capabilities](https://docs.paymongo.com/docs/account-settings-account-capabilities), and [Card Vaulting](https://docs.paymongo.com/docs/payment-acceptance-card-vaulting).

Do not submit invented or provisional business details as final information. You can create the account and explore test mode, then complete the correct business profile and supporting documents when the venture's legal form and customer-facing details are settled. PayMongo's published website requirements for live onboarding include a public, working website or accepted business page, PHP pricing, a Philippine business address, Terms, Privacy, Refund policy, and contact details; a work-in-progress site is not accepted. See [PayMongo website guidelines](https://docs.paymongo.com/docs/account-settings-website-guidelines).

Test-mode setup checklist for the account owner:

1. Create/verify the PayMongo merchant account and complete the business/identity checks they require.
2. In the dashboard, activate an eligible recurring method (card or Maya).
3. Ask PayMongo support to enable Subscriptions for that account/method.
4. Ask PayMongo to enable Subscriptions (and Card Vaulting if you will offer cards). Test mode in the dashboard by itself does not enable those capabilities.
5. Create separate test plans for Gastos Family Premium: PHP 99 with a monthly interval, and PHP 999 with a yearly interval. Save the returned plan IDs.
6. Set `PAYMENT_PROVIDER=paymongo`, `PAYMENT_PROVIDER_SECRET` to the test secret key, `PAYMENT_PUBLIC_KEY` to the matching test public key, `PAYMONGO_PLAN_MONTHLY_ID`, and `PAYMONGO_PLAN_ANNUAL_ID` in `.env`.
7. Set `PAYMONGO_WEBHOOK_SECRET` to the signing secret shown when creating the PayMongo webhook. Configure the webhook URL as `https://<current-ngrok-host>/webhooks/paymongo` and subscribe to `subscription.activated`, `subscription.past_due`, `subscription.unpaid`, `subscription.updated`, `subscription.invoice.paid`, and `subscription.invoice.payment_failed`.
8. Restart Gastos after changing `.env`. Verify a successful initial payment, a failed payment, cancellation, duplicate webhook delivery, and renewal while using test keys only.
9. Keep live keys and plans separate. For live service, complete the correct merchant business/identity profile and PayMongo review before switching credentials.

The adapter checks that each configured plan has the expected PHP amount and monthly/yearly interval. Checkout creates the subscription and first payment intent server-side; the browser sends the payment method directly to PayMongo using the public key. Gastos activates Premium only after a correctly signed PayMongo event or a server-side status check confirms `active`. It verifies webhook mode and signatures and ignores duplicate event IDs.

**Current external blocker:** this account's subscriptions plan request previously returned HTTP 403. If PayMongo has not enabled Subscriptions for the test account, checkout will report that provider access needs to be enabled. Keys alone do not grant that capability. Test mode does not require you to invent unfinished business details; complete accurate merchant information when PayMongo requires it for live onboarding. See [PayMongo Subscriptions](https://docs.paymongo.com/docs/payment-acceptance-subscriptions), [Plan Resource](https://docs.paymongo.com/reference/plan-resource), and [account capabilities](https://docs.paymongo.com/docs/account-settings-account-capabilities).

PayMongo's newer hosted checkout supports Philippine payment channels, but a one-time checkout is not a recurring subscription. It cannot be used as proof that a recurring plan is active. See [Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout).
