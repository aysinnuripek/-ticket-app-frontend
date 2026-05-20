import json
import os
import uuid
from typing import Literal

import boto3
import stripe
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from app.stripe_service import create_checkout_session  # noqa: E402
from app import email_templates  # noqa: E402

AWS_ENDPOINT_URL = os.environ.get("AWS_ENDPOINT_URL") or None
AWS_REGION = os.environ.get("AWS_DEFAULT_REGION", "eu-central-1")
SQS_QUEUE_URL = os.environ.get("SQS_QUEUE_URL")
SES_FROM = os.environ.get("SES_FROM_ADDRESS")
SES_DEMO_TO = os.environ.get("SES_DEMO_TO_ADDRESS")

sqs_client = boto3.client(
    "sqs", endpoint_url=AWS_ENDPOINT_URL, region_name=AWS_REGION
) if SQS_QUEUE_URL else None

ses_client = boto3.client(
    "ses", endpoint_url=AWS_ENDPOINT_URL, region_name=AWS_REGION
) if SES_FROM else None


def _send_order_confirmation(order: dict) -> None:
    if not (ses_client and SES_FROM and SES_DEMO_TO):
        return
    subject, html, text = email_templates.order_confirmation(order)
    email_templates.send_via_ses(ses_client, SES_FROM, SES_DEMO_TO, subject, html, text)
    print(f"[ses] order_confirmation sent for {order['id']}")


def _complete_order(order: dict) -> None:
    """Idempotent post-payment work: mark paid, email confirmation, enqueue SQS.

    Called by the Stripe webhook AND by the /test/complete-order test endpoint.
    """
    if order["status"] == "paid":
        return
    order["status"] = "paid"
    print(f"[order] {order['id']} marked paid")

    try:
        _send_order_confirmation(order)
    except Exception as e:
        print(f"[ses] order_confirmation FAILED: {e}")

    if sqs_client and SQS_QUEUE_URL:
        sqs_client.send_message(
            QueueUrl=SQS_QUEUE_URL,
            MessageBody=json.dumps({"order": order}),
        )
        print(f"[order] enqueued {order['id']} on SQS")
    else:
        print("[order] SQS not configured — skipping enqueue")

app = FastAPI(title="Ticket App API (Member D scaffold)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stand-ins until Member B's DB lands.
ORDERS: dict[str, dict] = {}
PROCESSED_STRIPE_EVENTS: set[str] = set()


class OrderItemIn(BaseModel):
    name: str
    unit_price_cents: int
    quantity: int


class CreateOrderIn(BaseModel):
    items: list[OrderItemIn]


class OrderOut(BaseModel):
    id: str
    status: Literal["pending", "paid", "failed", "cancelled"]
    total_cents: int


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/orders")
def create_order(payload: CreateOrderIn):
    order_id = str(uuid.uuid4())
    items = [item.model_dump() for item in payload.items]
    total_cents = sum(i["unit_price_cents"] * i["quantity"] for i in items)

    order = {
        "id": order_id,
        "status": "pending",
        "items": items,
        "total_cents": total_cents,
        "stripe_session_id": None,
    }
    ORDERS[order_id] = order

    session = create_checkout_session(
        order, os.environ.get("FRONTEND_URL", "http://localhost:5173")
    )
    order["stripe_session_id"] = session.id

    return {"order_id": order_id, "checkout_url": session.url}


@app.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: str):
    order = ORDERS.get(order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    return OrderOut(
        id=order["id"], status=order["status"], total_cents=order["total_cents"]
    )


@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig, os.environ["STRIPE_WEBHOOK_SECRET"]
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(400, "Invalid signature")

    if event["id"] in PROCESSED_STRIPE_EVENTS:
        return {"received": True, "duplicate": True}
    PROCESSED_STRIPE_EVENTS.add(event["id"])

    if event["type"] == "checkout.session.completed":
        order_id = event["data"]["object"]["metadata"]["order_id"]
        order = ORDERS.get(order_id)
        if order:
            _complete_order(order)

    return {"received": True}


# ---------------------------------------------------------------------------
# Test-only endpoint: synthesize a successful payment without going to Stripe.
# Enabled only when TEST_MODE=true in the environment. Used by Playwright to
# avoid testing Stripe's own checkout UI (which Stripe redesigns frequently).
# ---------------------------------------------------------------------------
if os.environ.get("TEST_MODE", "").lower() == "true":
    @app.post("/test/complete-order/{order_id}")
    def test_complete_order(order_id: str):
        order = ORDERS.get(order_id)
        if not order:
            raise HTTPException(404, "Order not found")
        _complete_order(order)
        return {"order_id": order_id, "status": order["status"]}

    print("[main] TEST_MODE enabled — /test/complete-order/{id} available")
