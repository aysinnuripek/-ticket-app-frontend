# Member D — Personal Guideline

**Role:** Async Services, Payments & Testing Lead.
**You own:** SQS→Lambda→SES pipeline, Stripe (frontend redirect + backend webhook + backend session creation), Playwright E2E, k6 load tests, security pass.

This document is your personal playbook. It is ordered by **earliest blocker first** so you never sit idle waiting for A/B/C. Each task tells you:

- **Goal** — what "done" looks like
- **Depends on** — who must hand you something first (and what to do if they're late)
- **Steps** — exact commands / file paths
- **Deliverable** — what you commit / demo
- **Acceptance** — how you and the team verify it

---

## 0. Pre-flight (Day 1, ~1 hour)

Before touching code, get accounts and credentials ready. Doing this first removes hours of friction later.

1. **Stripe account** — sign up at https://dashboard.stripe.com, stay in **test mode**. Grab:
   - Publishable key (`pk_test_…`) — give to Member C
   - Secret key (`sk_test_…`) — keep private, will go into AWS Secrets Manager
   - Webhook signing secret — generated when you create the webhook (Task D3)
2. **AWS access** — confirm Member A added you to the project AWS account with permissions to create Lambda, SES identities, SQS queues, IAM roles, Secrets Manager entries.
3. **Local tools** — install once:
   ```bash
   brew install stripe/stripe-cli/stripe k6 awscli
   pip install boto3 qrcode reportlab python-jose pytest
   npm i -D @playwright/test
   npx playwright install
   ```
4. **Sandbox SES** — verify your own email as both sender and recipient so you can demo without leaving the SES sandbox:
   - SES Console → Verified identities → Create identity → Email address → use *your* address.
   - Verify a teammate's address too so the demo email lands in two inboxes.

---

## Task D3 — Stripe integration (do this FIRST)

> Why first: the whole purchase flow is blocked on this. Member B's `POST /orders` is empty until you write the Stripe portion, and Member C's checkout button has nowhere to redirect. SES and Lambda can only be tested once a real payment fires.

### D3.1 — Stripe Checkout session creation (in B's FastAPI repo)

**Depends on:** B's `Order` model + `POST /orders` skeleton. If B is late: write the function as a standalone module and PR it; B plugs it in when ready.

Inside the backend repo (separate from this one), add `app/services/stripe_service.py`:

```python
import os
import stripe
from app.models import Order

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]  # injected from Secrets Manager

def create_checkout_session(order: Order, frontend_url: str) -> str:
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {
                "price_data": {
                    "currency": "try",
                    "unit_amount": item.unit_price_cents,
                    "product_data": {"name": item.ticket_type.name},
                },
                "quantity": item.quantity,
            }
            for item in order.items
        ],
        success_url=f"{frontend_url}/checkout/success?order_id={order.id}",
        cancel_url=f"{frontend_url}/checkout?canceled=1",
        client_reference_id=str(order.id),
        metadata={"order_id": str(order.id)},
    )
    return session.url
```

In `POST /orders` (B writes the route, you contribute the Stripe call): after the Order row is inserted with `status="pending"` and Redis locks are acquired, call `create_checkout_session(order, frontend_url)`, save `session.id` to `order.stripe_session_id`, and return `{"order_id": order.id, "checkout_url": session.url}`.

**Acceptance:** `curl -X POST localhost:8000/orders -H 'Authorization: Bearer <jwt>' -d '{...}'` returns a `checkout.stripe.com/...` URL.

### D3.2 — Stripe webhook handler

In the same backend, add `POST /webhooks/stripe`:

```python
@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig, os.environ["STRIPE_WEBHOOK_SECRET"]
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")

    if event["type"] == "checkout.session.completed":
        order_id = event["data"]["object"]["metadata"]["order_id"]
        # mark paid in DB, then enqueue SQS message (Task D-handoff to B4)
        mark_order_paid(order_id)
        sqs_client.send_message(
            QueueUrl=os.environ["SQS_QUEUE_URL"],
            MessageBody=json.dumps({"order_id": order_id}),
        )
    return {"received": True}
```

**Local test:**

```bash
stripe listen --forward-to localhost:8000/webhooks/stripe
# in another shell:
stripe trigger checkout.session.completed
```

You should see the order flip to `paid` and an SQS message appear (`aws sqs receive-message --queue-url ...`).

**Acceptance:**
- Signature verification rejects a forged payload (return 400).
- A real `checkout.session.completed` event marks the order paid exactly once (idempotency: re-delivery of the same event must NOT enqueue a second SQS message — store processed event IDs).

### D3.3 — Frontend hookup (small PR into this repo)

Member C's `src/pages/Checkout.tsx:51` is fake. Replace `handlePay` with:

```ts
import { createOrder } from "../api/orders"

async function handlePay() {
  if (total === 0) return
  try {
    const { checkout_url } = await createOrder({
      ticket_type_id: event.id,  // C/B will refine real ticket_type IDs
      quantity: generalQuantity + vipQuantity,
    })
    window.location.href = checkout_url
  } catch (err) {
    setError("Could not start payment. Try again.")
  }
}
```

And in `src/pages/CheckoutSuccess.tsx`, poll until paid:

```ts
const orderId = new URLSearchParams(location.search).get("order_id")
useEffect(() => {
  if (!orderId) return
  const id = setInterval(async () => {
    const o = await apiClient.get(`/orders/${orderId}`).then(r => r.data)
    if (o.status === "paid") { clearInterval(id); setReady(true) }
  }, 2000)
  return () => clearInterval(id)
}, [orderId])
```

**Acceptance:** clicking "Continue to payment" redirects to Stripe; using card `4242 4242 4242 4242` (any future expiry, any CVC) lands on `/checkout/success?order_id=…` and the page eventually shows "Ticket sent to your email!".

---

## Task D1 — Lambda consumer for SQS

**Depends on:**
- A: queue ARN + Lambda execution role + S3 tickets bucket
- B: `Order`, `Ticket` tables populated by the webhook

Until A is ready, develop locally with `moto` (mock AWS) or LocalStack — do not block.

### D1.1 — Project layout

Create a new repo or sibling folder `lambda/process_payment/`:

```
lambda/process_payment/
├── handler.py
├── requirements.txt        # boto3, qrcode[pil], reportlab, psycopg2-binary
├── layer/                  # built into a Lambda Layer (reportlab+Pillow are too big to inline)
└── tests/test_handler.py
```

### D1.2 — handler.py

```python
import io, json, os, boto3, qrcode, psycopg2
from reportlab.pdfgen import canvas

s3 = boto3.client("s3")
ses = boto3.client("ses")
BUCKET = os.environ["TICKETS_BUCKET"]
SENDER = os.environ["SES_FROM_ADDRESS"]

def handler(event, _ctx):
    for record in event["Records"]:
        order_id = json.loads(record["body"])["order_id"]
        order = fetch_order_with_tickets(order_id)
        pdf_keys = [build_and_upload_ticket(t) for t in order.tickets]
        send_email(order.user_email, order, pdf_keys)

def build_and_upload_ticket(ticket):
    qr = qrcode.make(str(ticket.id))
    pdf_buf = io.BytesIO()
    c = canvas.Canvas(pdf_buf)
    c.drawString(100, 800, f"Ticket {ticket.id}")
    qr_buf = io.BytesIO(); qr.save(qr_buf, format="PNG"); qr_buf.seek(0)
    c.drawImage(qr_buf, 100, 600, width=200, height=200)
    c.showPage(); c.save()
    key = f"tickets/{ticket.id}.pdf"
    s3.put_object(Bucket=BUCKET, Key=key, Body=pdf_buf.getvalue(),
                  ContentType="application/pdf")
    return key
```

### D1.3 — Lambda Layer for reportlab + Pillow

```bash
mkdir -p layer/python
pip install --platform manylinux2014_x86_64 --only-binary=:all: \
    --target layer/python reportlab pillow qrcode
cd layer && zip -r ../reportlab-layer.zip python && cd ..
aws lambda publish-layer-version --layer-name reportlab-pillow \
    --zip-file fileb://reportlab-layer.zip --compatible-runtimes python3.11
```

### D1.4 — IAM role (give the requirements to A; A wires it in Terraform)

Least-privilege policy attached to the Lambda role:
- `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` on **only** `payment-success` queue
- `s3:PutObject`, `s3:GetObject` on **only** `arn:aws:s3:::ticket-app-tickets/*`
- `ses:SendEmail`, `ses:SendRawEmail` (sender = your verified address)
- VPC config: same private subnets as ECS so the Lambda can reach RDS

### D1.5 — Local test

```bash
python -c "from handler import handler; handler({'Records':[{'body':'{\"order_id\":\"<known-id>\"}'}]}, None)"
ls /tmp/ # verify pdf was produced if you stub s3
```

**Acceptance:**
- Send a fake message to the real queue (`aws sqs send-message --queue-url ... --message-body '{"order_id":"<known-id>"}'`). Within 30 s: PDF in S3 + email in inbox.
- Failed processing → message goes to a Dead Letter Queue (configure with A: maxReceiveCount=3).

---

## Task D2 — SES templates

**Depends on:** SES sender identity verified (Pre-flight step 4).

1. In SES Console → Email templates → Create. Make three:
   - `order_confirmation` — subject "Your order #{{order_id}}", body lists ticket types & total.
   - `ticket_delivery` — subject "Your tickets for {{event_title}} are ready", body has a "Download" link to the signed S3 URL.
   - `password_reset` — **skip** unless you want to customize Cognito's default. Default is fine for the demo.
2. From Lambda, send with `ses.send_templated_email(...)` instead of building HTML inline — keeps the Lambda small and the team can edit copy without redeploying.
3. Use **signed S3 URLs** (15-minute expiry) for ticket PDFs, never public links:
   ```python
   url = s3.generate_presigned_url("get_object",
       Params={"Bucket": BUCKET, "Key": key}, ExpiresIn=900)
   ```
4. Render-test in Gmail, Outlook web, Apple Mail. Inline-CSS only (no `<style>` blocks — many clients strip them). Tools: https://putsmail.com or the SES "Send test email" button.

**Acceptance:** email arrives within 30 s of payment, renders correctly in all three clients, the "Download" link returns a valid PDF, and the link expires after 15 minutes (verify by waiting and retrying).

---

## Task D4 — Playwright E2E

**Depends on:** a deployed staging URL from A (frontend on CloudFront + backend on ALB). Run against staging, not localhost.

Inside this frontend repo:

```bash
npx playwright install --with-deps
mkdir -p e2e
```

Create `e2e/happy-path.spec.ts`:

```ts
import { test, expect } from "@playwright/test"

const BASE = process.env.E2E_BASE_URL ?? "https://staging.ticketapp.example.com"
const TEST_EMAIL = `e2e+${Date.now()}@example.com`

test("browse → buy → see ticket", async ({ page }) => {
  await page.goto(BASE)
  await page.getByRole("link", { name: /istanbul jazz/i }).click()
  await page.getByRole("link", { name: /select ticket/i }).click()
  // Auth wall
  await page.getByRole("link", { name: /sign up/i }).click()
  await page.getByPlaceholder("Full name").fill("E2E Tester")
  await page.getByPlaceholder("Email").fill(TEST_EMAIL)
  await page.getByPlaceholder("Password").fill("Test1234!")
  await page.getByRole("button", { name: /create account/i }).click()
  // Confirmation code: bypass via Cognito admin API in test setup,
  // OR use a dedicated pre-confirmed test user.
  await page.getByRole("button", { name: /continue to payment/i }).click()
  // Stripe hosted page
  await page.getByPlaceholder("Card number").fill("4242 4242 4242 4242")
  await page.getByPlaceholder("MM / YY").fill("12 / 30")
  await page.getByPlaceholder("CVC").fill("123")
  await page.getByRole("button", { name: /pay/i }).click()
  await expect(page).toHaveURL(/checkout\/success/, { timeout: 30_000 })
  await page.getByRole("link", { name: /view my tickets/i }).click()
  await expect(page.getByText(/E2E Tester|TICKET-/)).toBeVisible()
})
```

Add three smaller tests:
- `/my-tickets` while signed out → redirects to `/login`.
- Wrong password → red error appears.
- Quantity selector floor at 0 (cannot go negative on the `-` button in Checkout).

**CI integration:** ask A to add a PR-time GitHub Actions job that runs `npx playwright test` against the staging URL after deploy succeeds. Job fails red → PR cannot merge.

**Acceptance:** all four tests green in CI on a fresh PR.

---

## Task D5 — Load testing

**Depends on:** D4 working (so you know the system actually works before stressing it). Run against staging, never prod-prod.

Create `loadtest/browse.js`:

```js
import http from "k6/http"
import { check, sleep } from "k6"
export const options = {
  stages: [
    { duration: "30s", target: 100 },
    { duration: "1m",  target: 500 },
    { duration: "1m",  target: 500 },
    { duration: "30s", target: 0 },
  ],
}
export default function () {
  const r1 = http.get(`${__ENV.API}/events`)
  check(r1, { "events 200": (r) => r.status === 200 })
  const events = r1.json()
  const id = events[Math.floor(Math.random() * events.length)].id
  const r2 = http.get(`${__ENV.API}/events/${id}`)
  check(r2, { "detail 200": (r) => r.status === 200 })
  sleep(1)
}
```

Run: `API=https://api.staging.example.com k6 run loadtest/browse.js`

Write `loadtest/checkout.js` similarly, but only 50 VUs (don't melt Stripe sandbox). Each VU: login with a pool of pre-created test users → create order → exit before Stripe redirect (we're loading our API, not Stripe).

**Capture for the report:**
- k6 summary: p50 / p95 / p99 response times, error rate.
- CloudWatch screenshots over the same time window: ECS task count rising from 2 → 6, ALB request count, RDS CPU.

**Acceptance:** under 500 VUs on `/events`, p95 < 800 ms and error rate < 1%. If not, file an issue, share the trace with B (likely a DB index missing) and A (maybe Fargate ramp is too slow).

---

## Task D6 — Security pass

Run this **once** in Week 7. Walk down the list and check each box.

1. **Secrets**
   - `grep -ri "sk_test_\|sk_live_\|AKIA" .` in every repo → must return nothing.
   - All secrets are in AWS Secrets Manager (`/ticket-app/prod/stripe_secret`, `/ticket-app/prod/db_password`, etc.). ECS task definition reads them via `secrets:` block, not env vars in plain text.
2. **IAM**
   - Every role has no `*:*`. Lambda role narrowed per D1.4. ECS task role can only read its own secrets and write its own log group.
3. **S3**
   - `aws s3api get-bucket-policy --bucket ticket-app-tickets` → no public read.
   - `aws s3api get-bucket-policy --bucket ticket-app-frontend` → only `cloudfront.amazonaws.com` (via OAC) can read; not the open internet.
4. **Network**
   - RDS security group only allows 5432 from ECS SG (run `aws ec2 describe-security-groups`).
   - Redis SG only allows 6379 from ECS SG.
5. **Dependencies**
   - `cd lambda/process_payment && pip-audit` — no HIGH/CRITICAL.
   - In this repo: `npm audit --omit=dev` — no HIGH/CRITICAL.
6. **GuardDuty** — enable for the demo week (free trial). Take a screenshot of the dashboard for the report.

**Deliverable:** a `security-checklist.md` in the infra repo with each box checked and `aws ...` command output as evidence.

---

## Hand-offs you must coordinate

| When | To/From | What |
|---|---|---|
| Week 2 end | A → you | SQS queue ARN, S3 tickets bucket name, Lambda role ARN |
| Week 3 mid | You → B | Stripe service module + webhook code (PR) |
| Week 3 end | You → C | Publishable Stripe key, Stripe redirect snippet (this doc) |
| Week 4 start | A ↔ you | Lambda event-source mapping wired in Terraform |
| Week 6 start | A → you | Deployed staging URL for Playwright + k6 |
| Week 7 end | You → team | Load-test graphs + security checklist (report material) |

---

## Suggested calendar

| Week | Member D focus |
|---|---|
| 1 | Pre-flight; read backend + frontend code; align on data shapes with B and C |
| 2 | D3.1 + D3.2 (Stripe session + webhook) locally with `stripe listen` and a local FastAPI |
| 3 | D1 Lambda locally (moto); D3.3 frontend PR into this repo |
| 4 | Wire Lambda into deployed AWS; D2 SES templates; verify end-to-end on staging |
| 5 | Polish edge cases (idempotency, DLQ); start writing D4 Playwright |
| 6 | D4 in CI; begin D5 |
| 7 | D5 capture; D6 security pass |
| 8 | Report sections (your areas: payments, async pipeline, testing, security); demo rehearsal |

---

## Things that will bite you (lessons learned, in advance)

- **Stripe webhook idempotency.** Stripe will retry the same event. If you process `checkout.session.completed` twice without dedup, you'll send two emails and double-decrement inventory. Store the `event.id` in a `processed_stripe_events` table with a unique constraint and bail early on conflict.
- **SES sandbox.** Until your account is taken out of the sandbox (requires a support ticket, takes ~24 h), you can only send to **verified** addresses. Plan ahead: file the request in Week 2, not Week 7.
- **Lambda cold starts in VPC.** A VPC-attached Lambda has a multi-second cold start. Keep the package small (use a Layer for reportlab) and set provisioned concurrency = 1 the week of the demo.
- **Stripe + Playwright.** Stripe's hosted page is on `checkout.stripe.com`. Playwright handles cross-origin fine; the gotcha is that some selectors live inside iframes — use `frameLocator()`.
- **Cognito confirmation codes in tests.** Don't try to read the email. Use a dedicated test user that Member B pre-confirms via `cognito-idp admin-confirm-sign-up` in a Playwright global setup.
