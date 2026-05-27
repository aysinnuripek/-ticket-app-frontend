import datetime
import io
import json
import os
import uuid
from typing import Literal

import boto3
import qrcode
import stripe
from dotenv import load_dotenv
from reportlab.lib.pagesizes import A5
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

load_dotenv()

from app import email_templates  # noqa: E402
from app.auth import get_current_user, require_role  # noqa: E402
from app.database import get_db  # noqa: E402
from app.models import (  # noqa: E402
    Event,
    Order,
    OrderItem,
    ProcessedStripeEvent,
    Ticket,
    TicketType,
    User,
    Venue,
)
from app.redis_client import (  # noqa: E402
    redis_client,
    release_tickets,
    reserve_tickets,
)
from app.stripe_service import create_checkout_session  # noqa: E402

AWS_ENDPOINT_URL = os.environ.get("AWS_ENDPOINT_URL") or None
AWS_REGION = os.environ.get("AWS_DEFAULT_REGION", "eu-central-1")
SQS_QUEUE_URL = os.environ.get("SQS_QUEUE_URL")
SES_FROM = os.environ.get("SES_FROM_ADDRESS")
SES_DEMO_TO = os.environ.get("SES_DEMO_TO_ADDRESS")

sqs_client = (
    boto3.client("sqs", endpoint_url=AWS_ENDPOINT_URL, region_name=AWS_REGION)
    if SQS_QUEUE_URL
    else None
)

ses_client = (
    boto3.client("ses", endpoint_url=AWS_ENDPOINT_URL, region_name=AWS_REGION)
    if SES_FROM
    else None
)

s3_client = boto3.client(
    "s3", endpoint_url=AWS_ENDPOINT_URL, region_name=AWS_REGION
)


def _send_order_confirmation(order_dict: dict) -> None:
    if not (ses_client and SES_FROM and SES_DEMO_TO):
        return
    subject, html, text = email_templates.order_confirmation(order_dict)
    email_templates.send_via_ses(
        ses_client, SES_FROM, SES_DEMO_TO, subject, html, text
    )
    print(f"[ses] order_confirmation sent for {order_dict['id']}")


def _build_pdf(ticket_id: str, order_dict: dict) -> bytes:
    qr_img = qrcode.make(ticket_id)
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)

    pdf_buf = io.BytesIO()
    c = canvas.Canvas(pdf_buf, pagesize=A5)
    width, height = A5

    c.setFont("Helvetica-Bold", 22)
    c.drawString(2 * cm, height - 3 * cm, "TicketApp")
    c.setFont("Helvetica", 11)
    c.drawString(2 * cm, height - 4 * cm, f"Ticket {ticket_id}")
    c.drawString(2 * cm, height - 5 * cm, f"Order {order_dict['id']}")
    c.drawString(2 * cm, height - 6 * cm, f"Total: {order_dict['total_cents'] / 100:.2f} TRY")

    y = height - 8 * cm
    c.setFont("Helvetica-Bold", 13)
    c.drawString(2 * cm, y, "Items:")
    c.setFont("Helvetica", 11)
    for item in order_dict.get("items", []):
        y -= 0.7 * cm
        c.drawString(2 * cm, y, f"  {item['quantity']} × {item['name']} — {item['unit_price_cents'] / 100:.2f} TRY")

    c.drawImage(ImageReader(qr_buf), width - 7 * cm, 2 * cm, width=5 * cm, height=5 * cm, preserveAspectRatio=True)
    c.showPage()
    c.save()
    return pdf_buf.getvalue()


def _complete_order(order: Order, db: Session) -> None:
    """Idempotent post-payment work: mark paid, generate PDFs, upload to S3, send email."""
    if order.status == "paid":
        return

    order.status = "paid"
    db.commit()
    print(f"[order] {order.id} marked paid in DB")

    # Format order dict for PDF and email
    order_dict = {
        "id": str(order.id),
        "status": order.status,
        "total_cents": order.total_cents,
        "items": [
            {
                "name": item.ticket_type.name,
                "unit_price_cents": item.unit_price_cents,
                "quantity": item.quantity,
            }
            for item in order.items
        ],
    }

    # Generate tickets in DB and build PDFs directly
    bucket = os.environ.get("TICKETS_BUCKET")
    db_tickets = []
    for item in order.items:
        item.ticket_type.sold_quantity += item.quantity
        for _ in range(item.quantity):
            ticket_id = str(uuid.uuid4())
            s3_key = f"tickets/{ticket_id}.pdf"

            # Upload PDF to S3 if bucket is configured
            if bucket:
                try:
                    pdf_bytes = _build_pdf(ticket_id, order_dict)
                    s3_client.put_object(
                        Bucket=bucket, Key=s3_key, Body=pdf_bytes, ContentType="application/pdf"
                    )
                    print(f"[pdf] uploaded {s3_key}")
                except Exception as e:
                    print(f"[pdf] upload FAILED for {ticket_id}: {e}")

            t = Ticket(
                id=uuid.UUID(ticket_id),
                order_id=order.id,
                ticket_type_id=item.ticket_type_id,
                qr_code_url=s3_key,
                used=False,
            )
            db.add(t)
            db_tickets.append(t)

    db.commit()

    try:
        _send_order_confirmation(order_dict)
    except Exception as e:
        print(f"[ses] order_confirmation FAILED: {e}")


app = FastAPI(title="Ticket App API (Member B Implementation)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


class TicketTypeDto(BaseModel):
    id: str
    name: str
    price_cents: int
    total_quantity: int
    sold_quantity: int


class EventDto(BaseModel):
    id: str
    title: str
    description: str
    category: str
    city: str
    starts_at: str
    image_url: str
    price: float
    ticket_types: list[TicketTypeDto] = []


class CreateEventIn(BaseModel):
    title: str
    description: str
    category: str
    city: str
    imageUrl: str
    date: str
    price: float
    capacity: int
    vipPrice: float = None


@app.get("/health")
def health(db: Session = Depends(get_db)):
    # Verify DB connection
    try:
        db.execute("SELECT 1")
        db_status = "ok"
    except Exception:
        db_status = "error"

    # Verify Redis connection
    try:
        redis_client.ping()
        redis_status = "ok"
    except Exception:
        redis_status = "error"

    return {"status": "ok", "db": db_status, "redis": redis_status}


@app.get("/events", response_model=list[EventDto])
def list_events(city: str = None, category: str = None, db: Session = Depends(get_db)):
    query = db.query(Event).filter(Event.status == "published")
    if city and city != "All":
        # Join venue to filter by city
        query = query.join(Venue).filter(Venue.city.ilike(city.strip()))
    if category and category != "All":
        query = query.filter(Event.category.ilike(category.strip()))

    events = query.all()

    result = []
    for e in events:
        # Find default or minimum price for the event
        min_price = 0.0
        if e.ticket_types:
            min_price = min(tt.price_cents for tt in e.ticket_types) / 100

        result.append(
            EventDto(
                id=str(e.id),
                title=e.title,
                description=e.description,
                category=e.category,
                city=e.venue.city if e.venue else "Unknown",
                starts_at=e.starts_at.date().isoformat(),
                image_url=e.image_url or "",
                price=min_price,
            )
        )
    return result


@app.get("/events/{event_id}", response_model=EventDto)
def get_event(event_id: str, db: Session = Depends(get_db)):
    try:
        event_uuid = uuid.UUID(event_id)
    except ValueError:
        raise HTTPException(400, "Invalid event ID format")

    event = db.query(Event).filter(Event.id == event_uuid).first()
    if not event:
        raise HTTPException(404, "Event not found")

    min_price = 0.0
    ticket_types_dto = []
    for tt in event.ticket_types:
        ticket_types_dto.append(
            TicketTypeDto(
                id=str(tt.id),
                name=tt.name,
                price_cents=tt.price_cents,
                total_quantity=tt.total_quantity,
                sold_quantity=tt.sold_quantity,
            )
        )

    if event.ticket_types:
        min_price = min(tt.price_cents for tt in event.ticket_types) / 100

    return EventDto(
        id=str(event.id),
        title=event.title,
        description=event.description,
        category=event.category,
        city=event.venue.city if event.venue else "Unknown",
        starts_at=event.starts_at.date().isoformat(),
        image_url=event.image_url or "",
        price=min_price,
        ticket_types=ticket_types_dto,
    )


@app.post("/orders")
def create_order(
    payload: CreateOrderIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items_to_process = []
    total_cents = 0

    order_id = str(uuid.uuid4())

    # Map frontend item names (e.g. "Istanbul Jazz Night — General Admission") to seeded ticket types in DB
    for item in payload.items:
        event_title = ""
        ticket_type_name = ""
        if " — " in item.name:
            event_title, ticket_type_name = item.name.split(" — ", 1)
        else:
            event_title = item.name
            ticket_type_name = "General Admission"

        # Normalize name for seeding compatibility
        if "General" in ticket_type_name:
            ticket_type_name = "General Admission"
        elif "VIP" in ticket_type_name:
            ticket_type_name = "VIP Ticket"

        db_event = (
            db.query(Event).filter(Event.title.ilike(event_title.strip())).first()
        )
        if not db_event:
            raise HTTPException(
                404, f"Event matching title '{event_title}' not found"
            )

        db_ticket_type = (
            db.query(TicketType)
            .filter(
                TicketType.event_id == db_event.id,
                TicketType.name.ilike(ticket_type_name.strip()),
            )
            .first()
        )
        if not db_ticket_type:
            raise HTTPException(
                404,
                f"Ticket type '{ticket_type_name}' not found for event '{event_title}'",
            )

        # Acquire lock in Redis
        success = reserve_tickets(
            db, str(db_ticket_type.id), item.quantity, order_id
        )
        if not success:
            # Revert any previously acquired locks for this order
            for prev_tt_id, prev_qty in items_to_process:
                release_tickets(prev_tt_id, prev_qty, order_id)
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Not enough tickets available for '{item.name}'",
            )

        items_to_process.append((str(db_ticket_type.id), item.quantity))
        total_cents += item.unit_price_cents * item.quantity

    # Create Order and OrderItems in DB
    try:
        order = Order(
            id=uuid.UUID(order_id),
            user_id=current_user.id,
            status="pending",
            total_cents=total_cents,
            currency="try",
        )
        db.add(order)
        db.commit()

        for tt_id, qty in items_to_process:
            db_item = OrderItem(
                id=uuid.uuid4(),
                order_id=order.id,
                ticket_type_id=uuid.UUID(tt_id),
                quantity=qty,
                unit_price_cents=db.query(TicketType)
                .filter(TicketType.id == uuid.UUID(tt_id))
                .first()
                .price_cents,
            )
            db.add(db_item)
        db.commit()

        # Format order object for Stripe
        order_stripe_format = {
            "id": order_id,
            "items": [
                {
                    "name": item.name,
                    "unit_price_cents": item.unit_price_cents,
                    "quantity": item.quantity,
                }
                for item in payload.items
            ],
        }

        session = create_checkout_session(
            order_stripe_format,
            os.environ.get("FRONTEND_URL", "http://localhost:5173"),
        )
        order.stripe_session_id = session.id
        db.commit()

        return {"order_id": order_id, "checkout_url": session.url}

    except Exception as e:
        db.rollback()
        # Release Redis locks on DB insertion error
        for tt_id, qty in items_to_process:
            release_tickets(tt_id, qty, order_id)
        raise HTTPException(500, f"Failed to create order: {e}")


@app.get("/orders/me")
def get_my_tickets(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    orders = (
        db.query(Order)
        .filter(Order.user_id == current_user.id, Order.status == "paid")
        .all()
    )

    result = []
    for o in orders:
        general_qty = 0
        vip_qty = 0
        event_title = "Unknown Event"

        for item in o.items:
            event_title = item.ticket_type.event.title
            if "General" in item.ticket_type.name:
                general_qty += item.quantity
            elif "VIP" in item.ticket_type.name:
                vip_qty += item.quantity

        result.append(
            {
                "id": str(o.id),
                "eventTitle": event_title,
                "generalQuantity": general_qty,
                "vipQuantity": vip_qty,
                "total": o.total_cents / 100,
                "purchasedAt": o.created_at.isoformat() + "Z",
            }
        )
    return result


@app.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: str, db: Session = Depends(get_db)):
    try:
        order_uuid = uuid.UUID(order_id)
    except ValueError:
        raise HTTPException(400, "Invalid order ID format")

    order = db.query(Order).filter(Order.id == order_uuid).first()
    if not order:
        raise HTTPException(404, "Order not found")
    return OrderOut(
        id=str(order.id), status=order.status, total_cents=order.total_cents
    )


@app.get("/tickets/{ticket_id}")
def get_ticket_pdf(
    ticket_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generates the PDF ticket on the fly and streams it directly to the browser."""
    try:
        ticket_uuid = uuid.UUID(ticket_id)
    except ValueError:
        raise HTTPException(400, "Invalid ticket ID format")

    ticket = db.query(Ticket).filter(Ticket.id == ticket_uuid).first()
    if not ticket:
        ticket = db.query(Ticket).filter(Ticket.order_id == ticket_uuid).first()
        if not ticket:
            raise HTTPException(404, "Ticket not found")

    if ticket.order.user_id != current_user.id:
        raise HTTPException(403, "Not authorized to download this ticket")

    order = ticket.order
    order_dict = {
        "id": str(order.id),
        "total_cents": order.total_cents,
        "items": [
            {
                "name": item.ticket_type.name,
                "unit_price_cents": item.unit_price_cents,
                "quantity": item.quantity,
            }
            for item in order.items
        ],
    }

    pdf_bytes = _build_pdf(str(ticket.id), order_dict)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ticket-{str(ticket.id)[:8]}.pdf"},
    )


@app.post("/admin/events")
def create_event_admin(
    payload: CreateEventIn,
    current_user: User = Depends(require_role(["organizer", "admin"])),
    db: Session = Depends(get_db),
):
    try:
        # Find or create a default venue in that city
        venue = (
            db.query(Venue)
            .filter(Venue.city.ilike(payload.city.strip()))
            .first()
        )
        if not venue:
            venue = Venue(
                id=uuid.uuid4(),
                name=f"{payload.city} Event Venue",
                city=payload.city,
                address=f"Default Address, {payload.city}",
                capacity=payload.capacity,
            )
            db.add(venue)
            db.commit()

        # Parse date
        event_date = datetime.datetime.strptime(payload.date, "%Y-%m-%d")

        event = Event(
            id=uuid.uuid4(),
            title=payload.title,
            description=payload.description,
            category=payload.category,
            image_url=payload.imageUrl,
            venue_id=venue.id,
            organizer_id=current_user.id,
            starts_at=event_date,
            ends_at=event_date + datetime.timedelta(hours=3),
            status="published",
        )
        db.add(event)
        db.commit()

        # Create general ticket type
        tt_gen = TicketType(
            id=uuid.uuid4(),
            event_id=event.id,
            name="General Admission",
            price_cents=int(payload.price * 100),
            currency="try",
            total_quantity=payload.capacity,
            sold_quantity=0,
        )
        db.add(tt_gen)

        # Create VIP ticket type (double the price or custom vipPrice, 20% of capacity)
        vip_price_val = payload.vipPrice if (payload.vipPrice is not None and payload.vipPrice > 0) else payload.price * 2
        tt_vip = TicketType(
            id=uuid.uuid4(),
            event_id=event.id,
            name="VIP Ticket",
            price_cents=int(vip_price_val * 100),
            currency="try",
            total_quantity=max(1, int(payload.capacity * 0.2)),
            sold_quantity=0,
        )
        db.add(tt_vip)
        db.commit()

        return {"event_id": str(event.id)}
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to create event: {e}")


@app.get("/admin/events/{event_id}/sales")
def get_event_sales_admin(
    event_id: str,
    current_user: User = Depends(require_role(["organizer", "admin"])),
    db: Session = Depends(get_db),
):
    try:
        event_uuid = uuid.UUID(event_id)
    except ValueError:
        raise HTTPException(400, "Invalid event ID format")

    event = db.query(Event).filter(Event.id == event_uuid).first()
    if not event:
        raise HTTPException(404, "Event not found")

    # Calculate tickets sold and revenue
    # Query paid orders containing this event's ticket types
    items = (
        db.query(OrderItem)
        .join(Order)
        .join(TicketType)
        .filter(
            TicketType.event_id == event.id,
            Order.status == "paid",
        )
        .all()
    )

    tickets_sold = sum(item.quantity for item in items)
    revenue = sum(item.quantity * item.unit_price_cents for item in items) / 100

    # Detail breakdown
    breakdown = []
    for tt in event.ticket_types:
        breakdown.append({
            "name": tt.name,
            "total": tt.total_quantity,
            "sold": tt.sold_quantity,
            "price": tt.price_cents / 100,
        })

    return {
        "event_id": event_id,
        "tickets_sold": tickets_sold,
        "revenue": revenue,
        "breakdown": breakdown,
    }


@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig, os.environ["STRIPE_WEBHOOK_SECRET"]
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(400, "Invalid signature")

    # Check if duplicate
    existing_event = (
        db.query(ProcessedStripeEvent)
        .filter(ProcessedStripeEvent.event_id == event["id"])
        .first()
    )
    if existing_event:
        return {"received": True, "duplicate": True}

    # Save to processed events
    processed_event = ProcessedStripeEvent(event_id=event["id"])
    db.add(processed_event)
    db.commit()

    if event["type"] == "checkout.session.completed":
        order_id = event["data"]["object"]["metadata"]["order_id"]
        order = db.query(Order).filter(Order.id == uuid.UUID(order_id)).first()
        if order:
            _complete_order(order, db)

    return {"received": True}


# ---------------------------------------------------------------------------
# Test-only endpoint: synthesize a successful payment without going to Stripe.
# Enabled only when TEST_MODE=true in the environment. Used by Playwright to
# avoid testing Stripe's own checkout UI (which Stripe redesigns frequently).
# ---------------------------------------------------------------------------
if os.environ.get("TEST_MODE", "").lower() == "true":

    @app.post("/test/complete-order/{order_id}")
    def test_complete_order(order_id: str, db: Session = Depends(get_db)):
        try:
            order_uuid = uuid.UUID(order_id)
        except ValueError:
            raise HTTPException(400, "Invalid order ID format")

        order = db.query(Order).filter(Order.id == order_uuid).first()
        if not order:
            raise HTTPException(404, "Order not found")
        _complete_order(order, db)
        return {"order_id": order_id, "status": order.status}

    print("[main] TEST_MODE enabled — /test/complete-order/{id} available")
