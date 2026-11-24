"""Mock doctors and slots. `python seed.py` resets the demo data (doctors, a week of slots and a few
bookings); the bot calls ensure_seeded() at startup."""

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

# A few bookings so the timeline looks lived in: (doctor, nth free upcoming slot, phone). Placed relative to
# now, so they are always in the future. None uses the demo caller's number (98765 43210).
DEMO_BOOKINGS = [
    ("Dr. Ananya Sharma", 0, "9840127356"),
    ("Dr. Ananya Sharma", 3, "8197462035"),
    ("Dr. Rohan Mehta", 2, "7019348826"),
    ("Dr. Priya Iyer", 1, "9663051479"),
    ("Dr. Sneha Kapoor", 5, "8861724503"),
    ("Dr. Arjun Nair", 4, "7406395812"),
    ("Dr. Vikram Rao", 9, "9538270164"),
]
DEMO_CANCELLED = ("Dr. Priya Iyer", 6, "6360482917")


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
    """Book DEMO_BOOKINGS (and one cancelled) on upcoming free slots. Returns how many were booked."""
    ids = {d["name"]: d["id"] for d in db.all_doctors(conn)}
    booked = 0
    for name, nth, phone in DEMO_BOOKINGS + [DEMO_CANCELLED]:
        free = db.free_slots(conn, ids[name])
        if nth >= len(free):
            continue  # late in the week: fewer slots left than the plan expects
        s = free[nth]
        appt = db.book(conn, phone, ids[name], s["date"], s["time"])
        if appt and (name, nth, phone) == DEMO_CANCELLED:
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
    print(f"Demo data reset: {len(DOCTORS)} doctors, {DAYS} days of slots, {n} bookings + 1 cancelled, in {db.DB_PATH}")
