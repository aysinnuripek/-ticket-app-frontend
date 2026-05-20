# Backend (Member D scaffold)

Minimal FastAPI app to test the Stripe payment flow end-to-end while Member B's
real backend is still being built. In-memory dict stands in for the DB.

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env — paste your real STRIPE_SECRET_KEY

uvicorn app.main:app --reload --port 8000
```

Verify: `curl localhost:8000/health` → `{"status":"ok"}`.

## Test the Stripe flow

In a second terminal:

```bash
stripe listen --forward-to localhost:8000/webhooks/stripe
```

It prints a `whsec_...` value — copy that into `STRIPE_WEBHOOK_SECRET` in `.env`
and restart uvicorn.

Create an order:

```bash
curl -X POST localhost:8000/orders \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"name":"General Admission","unit_price_cents":75000,"quantity":1}]}'
```

Open the returned `checkout_url` in a browser, pay with `4242 4242 4242 4242`,
any future expiry, any CVC. The `stripe listen` terminal should show
`checkout.session.completed`, and the uvicorn log should print
`order ... marked paid`.

Then `curl localhost:8000/orders/<order_id>` returns `"status":"paid"`.
