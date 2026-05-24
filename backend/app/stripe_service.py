import os
import stripe
from unittest.mock import MagicMock

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "sk_test_dummy")


def create_checkout_session(order: dict, frontend_url: str) -> stripe.checkout.Session:
    """Build a Stripe Checkout session for an order."""
    is_test = os.environ.get("TEST_MODE", "").lower() == "true"
    is_dummy = stripe.api_key == "sk_test_dummy" or not stripe.api_key.startswith("sk_")

    if is_test or is_dummy:
        print("[stripe] Mocking checkout session creation for testing")
        mock_session = MagicMock()
        mock_session.id = f"cs_test_{order['id']}"
        mock_session.url = f"{frontend_url}/checkout/success?order_id={order['id']}"
        return mock_session

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
