"""Mock doctors and slots. `python seed.py` resets everything; the bot calls ensure_seeded() at startup."""

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
DAYS = 7


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


def ensure_seeded(conn) -> None:
    """Startup check: create + seed an empty DB, and top up slots so a DB seeded days ago still has a week."""
    if not db.all_doctors(conn):
        seed(conn)
    else:
        add_upcoming_slots(conn)
    doctors = len(db.all_doctors(conn))
    free = sum(len(db.free_slots(conn, d["id"])) for d in db.all_doctors(conn))
    if doctors == 0 or free == 0:
        raise RuntimeError(f"Database {db.DB_PATH} has {doctors} doctors and {free} free slots")
    logger.info(f"DB ready: {db.DB_PATH} ({doctors} doctors, {free} free upcoming slots)")


if __name__ == "__main__":
    seed(db.connect())
    print(f"Seeded {len(DOCTORS)} doctors with {DAYS} days of slots into {db.DB_PATH}")
