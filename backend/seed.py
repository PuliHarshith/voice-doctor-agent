"""Reset the database with mock doctors and 7 days of slots. Run: python seed.py"""

from datetime import date, timedelta

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


def seed(conn) -> None:
    with conn:
        conn.executescript("DELETE FROM appointments; DELETE FROM slots; DELETE FROM doctors;")
        for name, specialty, times in DOCTORS:
            doctor_id = conn.execute(
                "INSERT INTO doctors (name, specialty) VALUES (?, ?)", (name, specialty)
            ).lastrowid
            for offset in range(7):
                day = (date.today() + timedelta(days=offset)).isoformat()
                conn.executemany(
                    "INSERT INTO slots (doctor_id, date, time) VALUES (?, ?, ?)",
                    [(doctor_id, day, t) for t in times],
                )


def seed_if_empty(conn) -> None:
    if not db.all_doctors(conn):
        seed(conn)


if __name__ == "__main__":
    seed(db.connect())
    print(f"Seeded {len(DOCTORS)} doctors with 7 days of slots into {db.DB_PATH}")
