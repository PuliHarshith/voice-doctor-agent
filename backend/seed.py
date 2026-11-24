"""Mock doctors and slots. `python seed.py` resets the demo data (doctors, a week of slots and a realistic
spread of bookings); the bot calls ensure_seeded() at startup."""

import random
from datetime import date, timedelta

from loguru import logger

import db

# (name, specialty, shift times)
MORNING = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]
EVENING = ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"]
DOCTORS = [
    ("Dr. Ananya Sharma", "General Physician", MORNING + EVENING),
    ("Dr. Rohan Mehta", "Cardiologist", MORNING),
    ("Dr. Priya Iyer", "Dermatologist", EVENING),
    ("Dr. Vikram Rao", "Orthopedic Surgeon", MORNING),
    ("Dr. Sneha Kapoor", "Pediatrician", MORNING + EVENING),
    ("Dr. Arjun Nair", "ENT Specialist", EVENING),
]
DAYS = 7  # every day: 9:00-12:30 and/or 2:00-5:30 per doctor, lunch 1-2 PM

# Demo bookings: a clinic week is busiest in the next couple of days and thins out after. Each upcoming
# slot is booked with this probability, by days from today; fixed seed, so every reset is the same week.
DEMO_SEED = 7
DEMO_FILL = [0.45, 0.38, 0.3, 0.24, 0.18, 0.14, 0.1]
DEMO_CANCEL = 0.06  # share of demo bookings that were later cancelled
DEMO_CALLER = "9876543210"  # the number used in the demo video: never pre-booked


def demo_phone(rng: random.Random) -> str:
    """A plausible Indian mobile: starts 6-9, ten digits."""
    while True:
        phone = rng.choice("6789") + "".join(rng.choice("0123456789") for _ in range(9))
        if phone != DEMO_CALLER:
            return phone


def add_upcoming_slots(conn) -> None:
    """Make sure every doctor has slots for the next DAYS days. Existing slots (and bookings) are kept."""
    shifts = {name: times for name, _, times in DOCTORS}
    with conn:
        for d in db.all_doctors(conn):
            for offset in range(DAYS):
                day = (date.today() + timedelta(days=offset)).isoformat()
                conn.executemany(
                    "INSERT OR IGNORE INTO slots (doctor_id, date, time) VALUES (?, ?, ?)",
                    [(d["id"], day, t) for t in shifts.get(d["name"], MORNING)],
                )


def seed(conn) -> None:
    with conn:
        conn.executescript("DELETE FROM appointments; DELETE FROM slots; DELETE FROM doctors;")
        conn.executemany("INSERT INTO doctors (name, specialty) VALUES (?, ?)",
                         [(name, specialty) for name, specialty, _ in DOCTORS])
    add_upcoming_slots(conn)


def add_demo_bookings(conn) -> int:
    """Book a realistic share of upcoming slots (and cancel a few). Returns how many stay booked."""
    rng = random.Random(DEMO_SEED)
    booked = 0
    for d in db.all_doctors(conn):
        for s in db.free_slots(conn, d["id"]):  # upcoming only, so demo bookings are never in the past
            offset = (date.fromisoformat(s["date"]) - date.today()).days
            if rng.random() >= DEMO_FILL[min(offset, len(DEMO_FILL) - 1)]:
                continue
            phone = demo_phone(rng)
            appt = db.book(conn, phone, d["id"], s["date"], s["time"])
            if appt and rng.random() < DEMO_CANCEL:
                db.cancel(conn, appt, phone)
            elif appt:
                booked += 1
    return booked


def reset_demo(conn) -> int:
    seed(conn)
    return add_demo_bookings(conn)


def ensure_seeded(conn) -> None:
    """Startup check: create + seed an empty DB, and top up slots so a DB seeded days ago still has a week."""
    if not db.all_doctors(conn):
        reset_demo(conn)
    else:
        add_upcoming_slots(conn)
    doctors = len(db.all_doctors(conn))
    free = sum(len(db.free_slots(conn, d["id"])) for d in db.all_doctors(conn))
    if doctors == 0 or free == 0:
        raise RuntimeError(f"Database {db.DB_PATH} has {doctors} doctors and {free} free slots")
    logger.info(f"DB ready: {db.DB_PATH} ({doctors} doctors, {free} free upcoming slots)")


if __name__ == "__main__":
    n = reset_demo(db.connect())
    print(f"Demo data reset: {len(DOCTORS)} doctors, {DAYS} days of slots, {n} bookings, in {db.DB_PATH}")
