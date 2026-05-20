import os
import stripe

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]


def create_checkout_session(order: dict, frontend_url: str) -> stripe.checkout.Session:
    """Build a Stripe Checkout session for an order.

    `order` shape (in-memory stand-in until B's DB lands):
        {
            "id": "<uuid>",
            "items": [
                {"name": "General Admission", "unit_price_cents": 75000, "quantity": 2},
                ...
            ],
        }
    """
    return stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {
                "price_data": {
                    "currency": "try",
                    "unit_amount": item["unit_price_cents"],
                    "product_data": {"name": item["name"]},
                },
                "quantity": item["quantity"],
            }
            for item in order["items"]
        ],
        success_url=f"{frontend_url}/checkout/success?order_id={order['id']}",
        cancel_url=f"{frontend_url}/checkout?canceled=1",
        client_reference_id=order["id"],
        metadata={"order_id": order["id"]},
    )
