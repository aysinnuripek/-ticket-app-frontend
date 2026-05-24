import os
import redis
from sqlalchemy.orm import Session

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

redis_client = redis.from_url(REDIS_URL, decode_responses=True)


def initialize_ticket_count(ticket_type_id: str, total_available: int) -> None:
    counter_key = f"available:{ticket_type_id}"
    redis_client.set(counter_key, max(0, total_available))


def reserve_tickets(db: Session, ticket_type_id: str, quantity: int, order_id: str) -> bool:
    """Acquires lock in Redis for the ticket selection.

    Uses atomic DECRBY and SET NX to prevent double sales.
    Returns True if reservation was successful, False otherwise.
    """
    lock_key = f"lock:ticket_type:{ticket_type_id}:{order_id}"

    # 1. Acquire order lock (10 minutes TTL) to record that this order is holding reservations
    # NX=True ensures we don't overwrite if it exists
    if not redis_client.set(lock_key, quantity, nx=True, ex=600):
        return False

    # 2. Ensure availability counter exists in Redis
    counter_key = f"available:{ticket_type_id}"
    if not redis_client.exists(counter_key):
        from app.models import TicketType
        tt = db.query(TicketType).filter(TicketType.id == ticket_type_id).first()
        if not tt:
            redis_client.delete(lock_key)
            return False
        available = tt.total_quantity - tt.sold_quantity
        initialize_ticket_count(ticket_type_id, available)

    # 3. Decrement availability counter atomically
    new_val = redis_client.decrby(counter_key, quantity)
    if new_val < 0:
        # Revert decrement since stock went negative
        redis_client.incrby(counter_key, quantity)
        # Release order lock
        redis_client.delete(lock_key)
        return False

    return True


def release_tickets(ticket_type_id: str, quantity: int, order_id: str) -> None:
    """Reverts reservations in Redis (e.g. if payment fails or checkout is cancelled)."""
    lock_key = f"lock:ticket_type:{ticket_type_id}:{order_id}"

    # Only release if the lock actually exists (so it hasn't expired already)
    if redis_client.exists(lock_key):
        redis_client.delete(lock_key)
        counter_key = f"available:{ticket_type_id}"
        if redis_client.exists(counter_key):
            redis_client.incrby(counter_key, quantity)
