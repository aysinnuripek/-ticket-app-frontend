import datetime
import os
import sys

# Add backend directory to Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models import User, Venue, Event, TicketType


def seed_db():
    db = SessionLocal()
    try:
        # 1. Clear existing data
        print("Cleaning up old database seed data...")
        db.query(TicketType).delete()
        db.query(Event).delete()
        db.query(Venue).delete()
        db.query(User).delete()
        db.commit()

        # 2. Seed Users
        print("Seeding Users...")
        organizer = User(
            cognito_sub="mock-sub-organizer",
            email="organizer@example.com",
            full_name="Organizer Demo",
            role="organizer",
        )
        customer = User(
            cognito_sub="mock-sub-e2e",
            email="e2e@example.com",
            full_name="E2E Tester",
            role="customer",
        )
        db.add(organizer)
        db.add(customer)
        db.commit()

        # 3. Seed Venues
        print("Seeding Venues...")
        venue_istanbul = Venue(
            name="Istanbul Jazz Club",
            city="Istanbul",
            address="Karakoy, Istanbul",
            capacity=120,
        )
        venue_ankara = Venue(
            name="Ankara Grand Theatre",
            city="Ankara",
            address="Cankaya, Ankara",
            capacity=180,
        )
        venue_izmir = Venue(
            name="Izmir Arena",
            city="Izmir",
            address="Bayrakli, Izmir",
            capacity=250,
        )
        db.add(venue_istanbul)
        db.add(venue_ankara)
        db.add(venue_izmir)
        db.commit()

        # 4. Seed Events and Ticket Types
        print("Seeding Events and Ticket Types...")

        # Istanbul Jazz Night (Concert)
        event1 = Event(
            id="11111111-1111-1111-1111-111111111111",  # Clean UUID for Event 1
            title="Istanbul Jazz Night",
            description="A live jazz concert with local and international artists.",
            category="Concert",
            image_url="https://images.unsplash.com/photo-1501386761578-eac5c94b800a",
            venue_id=venue_istanbul.id,
            organizer_id=organizer.id,
            starts_at=datetime.datetime(2026, 6, 12, 20, 0),
            ends_at=datetime.datetime(2026, 6, 12, 23, 0),
            status="published",
        )
        db.add(event1)
        db.commit()

        tt1_gen = TicketType(
            event_id=event1.id,
            name="General Admission",
            price_cents=75000,
            currency="try",
            total_quantity=100,
            sold_quantity=0,
        )
        tt1_vip = TicketType(
            event_id=event1.id,
            name="VIP Ticket",
            price_cents=150000,
            currency="try",
            total_quantity=20,
            sold_quantity=0,
        )
        db.add(tt1_gen)
        db.add(tt1_vip)

        # Ankara Theatre Festival (Theatre)
        event2 = Event(
            id="22222222-2222-2222-2222-222222222222",  # Clean UUID for Event 2
            title="Ankara Theatre Festival",
            description="A theatre festival featuring modern and classical plays.",
            category="Theatre",
            image_url="https://images.unsplash.com/photo-1503095396549-807759245b35",
            venue_id=venue_ankara.id,
            organizer_id=organizer.id,
            starts_at=datetime.datetime(2026, 6, 20, 19, 0),
            ends_at=datetime.datetime(2026, 6, 20, 22, 0),
            status="published",
        )
        db.add(event2)
        db.commit()

        tt2_gen = TicketType(
            event_id=event2.id,
            name="General Admission",
            price_cents=42000,
            currency="try",
            total_quantity=150,
            sold_quantity=0,
        )
        tt2_vip = TicketType(
            event_id=event2.id,
            name="VIP Ticket",
            price_cents=84000,
            currency="try",
            total_quantity=30,
            sold_quantity=0,
        )
        db.add(tt2_gen)
        db.add(tt2_vip)

        # Izmir Summer Fest (Festival)
        event3 = Event(
            id="33333333-3333-3333-3333-333333333333",  # Clean UUID for Event 3
            title="Izmir Summer Fest",
            description="Outdoor summer festival with food, music, and entertainment.",
            category="Festival",
            image_url="https://images.unsplash.com/photo-1492684223066-81342ee5ff30",
            venue_id=venue_izmir.id,
            organizer_id=organizer.id,
            starts_at=datetime.datetime(2026, 7, 5, 16, 0),
            ends_at=datetime.datetime(2026, 7, 5, 23, 30),
            status="published",
        )
        db.add(event3)
        db.commit()

        tt3_gen = TicketType(
            event_id=event3.id,
            name="General Admission",
            price_cents=98000,
            currency="try",
            total_quantity=200,
            sold_quantity=0,
        )
        tt3_vip = TicketType(
            event_id=event3.id,
            name="VIP Ticket",
            price_cents=196000,
            currency="try",
            total_quantity=50,
            sold_quantity=0,
        )
        db.add(tt3_gen)
        db.add(tt3_vip)

        db.commit()
        print("Database successfully seeded!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_db()
