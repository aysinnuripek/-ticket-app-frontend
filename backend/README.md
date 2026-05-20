# Backend — Local Setup Guide

Minimal FastAPI app + async worker that mirrors the production AWS pipeline
(SQS → Lambda → S3 + SES) using **LocalStack**. In-memory dict stands in for
the database until Member B's schema lands.

> **Whose code is this?**
> Member D owns the Stripe integration, the SQS worker, and the email
> templates. Member B will swap the in-memory `ORDERS` dict for SQLAlchemy
> and own the API routes long-term.

## What you'll have running

| Process                            | Port  | Purpose                                  |
| ---------------------------------- | ----- | ---------------------------------------- |
| LocalStack (Docker)                | 4566  | Fake AWS: SQS, S3, SES                   |
| `uvicorn` (FastAPI)                | 8000  | API + Stripe webhook                     |
| `stripe listen` (Stripe CLI)       | —     | Forwards real Stripe events to uvicorn   |
| `worker.run_local` (Python)        | —     | Polls SQS, builds PDFs, sends emails     |
| `vite dev` (in `../frontend/`)     | 5173  | The UI                                   |

Five terminals total during dev (one per process, plus a free one for commands).

---

## One-time setup

### 1. Install prerequisites

```bash
brew install docker awscli
brew install stripe/stripe-cli/stripe
```

Plus Python 3.11+ (3.14 tested). Verify with `python3 --version`.

Launch Docker Desktop (`open -a Docker`) and wait for the menu-bar whale to
stop animating. Verify:

```bash
docker ps          # should print empty table, no error
```

### 2. Get a Stripe test account

Sign up at https://dashboard.stripe.com, leave **Test mode** ON (top-right
toggle). Grab from Developers → API keys:

- Secret key (`sk_test_...`) — keep private
- Publishable key (`pk_test_...`) — safe; frontend uses this

### 3. Authenticate the Stripe CLI

```bash
stripe login
```

Browser opens → "Allow access" → done.

### 4. Bootstrap LocalStack

From the repo root:

```bash
cd ..                       # repo root
docker compose up -d        # start LocalStack
./scripts/init-local-aws.sh # create SQS queue + DLQ, S3 bucket, verify SES sender
```

The script prints env vars to copy into `backend/.env` (next step).

### 5. Create `backend/.env`

```bash
cd backend
cp .env.example .env
```

Then open `backend/.env` and set:

```
STRIPE_SECRET_KEY=sk_test_your_real_key_here
STRIPE_WEBHOOK_SECRET=          # filled in step 8
FRONTEND_URL=http://localhost:5173

AWS_ENDPOINT_URL=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=eu-central-1
SQS_QUEUE_URL=http://localhost:4566/000000000000/payment-success
TICKETS_BUCKET=ticket-app-tickets
SES_FROM_ADDRESS=tickets@ticketapp.local
SES_DEMO_TO_ADDRESS=your.email@example.com
```

> The AWS keys are literally the string `test` — LocalStack ignores their
> value but boto3 refuses to run without them.

### 6. Create the Python virtualenv

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r worker/requirements.txt
```

### 7. Start the API

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Smoke-test in another terminal:

```bash
curl localhost:8000/health
# -> {"status":"ok"}
```

### 8. Start `stripe listen` (in a new terminal)

```bash
stripe listen --forward-to localhost:8000/webhooks/stripe
```

It prints something like `Your webhook signing secret is whsec_...`.

**Copy that value into `backend/.env`** as `STRIPE_WEBHOOK_SECRET=...`, then
**restart uvicorn** (Ctrl-C → re-run the command from step 7) — uvicorn
doesn't auto-reload `.env`.

### 9. Start the worker (in a new terminal)

```bash
cd backend
source .venv/bin/activate
python -m worker.run_local
# -> [worker] polling http://localhost:4566/000000000000/payment-success
```

### 10. Start the frontend (in a new terminal)

```bash
cd ../frontend
npm install            # first time only
npm run dev
# -> http://localhost:5173
```

---

## Run a test payment

1. Open http://localhost:5173.
2. Pick an event → "Select ticket" → log in (any email/password — fake auth
   for now) → "Continue to payment".
3. On Stripe's hosted page, pay with:
   - Card: `4242 4242 4242 4242`
   - Expiry: any future date (e.g. `12 / 30`)
   - CVC: any 3 digits
4. You land back on `/checkout/success?order_id=...`. Within ~2 s the page
   flips from "Confirming..." to "Payment successful".

Watch the four terminals:

- **uvicorn:** `[stripe] order ... marked paid` + `[ses] order_confirmation
  sent` + `[stripe] enqueued order ... on SQS`
- **stripe listen:** `checkout.session.completed [200]`
- **worker:** `[worker] processing order ...` + `→ ticket ... → s3://...`
- **frontend:** success page transitions

---

## Inspecting captured artifacts

### Captured emails (LocalStack doesn't actually send)

```bash
curl -s http://localhost:4566/_aws/ses | python3 -m json.tool | head -60
```

### Generated PDF tickets

```bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=eu-central-1

aws --endpoint-url=http://localhost:4566 s3 ls s3://ticket-app-tickets/tickets/

aws --endpoint-url=http://localhost:4566 s3 cp \
  s3://ticket-app-tickets/tickets/<ticket-id>.pdf ~/Downloads/ticket.pdf
open ~/Downloads/ticket.pdf
```

Tip: add the three `AWS_*` exports to your shell's rc file (e.g. `~/.zshrc`)
so you don't have to re-export per terminal. Safe — the values are `test`.

### Email previews (no payment needed)

```bash
cd backend && source .venv/bin/activate
python -m scripts.preview_email order_confirmation
python -m scripts.preview_email ticket_delivery
```

Each opens the rendered HTML in your default browser.

---

## Common issues

| Symptom                                                 | Fix                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ModuleNotFoundError` when running `python -m worker.*` | venv not active → `source .venv/bin/activate`                                      |
| Webhook returns 400 "Invalid signature"                 | `STRIPE_WEBHOOK_SECRET` mismatch → copy fresh value from `stripe listen` + restart uvicorn |
| `Unable to locate credentials` from `aws` CLI           | Run the three `export AWS_*=test` lines for the current shell                      |
| Worker says "Order not found"                           | uvicorn was restarted; the in-memory `ORDERS` dict was wiped. Make a new test payment. |
| `docker compose up` fails                               | Docker Desktop not running. `open -a Docker`, wait for the whale icon to settle.   |
| CORS error in browser                                   | `FRONTEND_URL` in `backend/.env` must exactly match the URL you're hitting (`http://localhost:5173`) |

---

## File map

```
backend/
├── app/
│   ├── main.py              # FastAPI routes: /health, /orders, /webhooks/stripe
│   ├── stripe_service.py    # Stripe Checkout session builder
│   └── email_templates.py   # order_confirmation + ticket_delivery (HTML+text)
├── worker/
│   ├── run_local.py         # SQS long-poller (mimics Lambda event-source mapping)
│   ├── handler.py           # Lambda-shaped entrypoint: QR PDF + S3 upload + SES send
│   └── requirements.txt
├── scripts/
│   └── preview_email.py     # Render templates to /tmp and open in browser
├── requirements.txt
├── .env.example
└── README.md
```

---

## Switching to real AWS later

When Member A's Terraform stack is up, all you do is **unset
`AWS_ENDPOINT_URL`** in `backend/.env` (and the worker's environment). boto3
then talks to real AWS. Stripe and the FastAPI app don't change.

Caveat: real SES starts in sandbox mode — you must verify the sender domain
and (during the demo) each recipient address. File the SES production-access
request early; AWS takes ~24 h to approve.
