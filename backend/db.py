"""SQLite storage: doctors, their slots, and appointments. All SQL lives here."""

import os
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent / "clinic.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    date TEXT NOT NULL,          -- YYYY-MM-DD
    time TEXT NOT NULL,          -- HH:MM, 24h
    is_booked INTEGER NOT NULL DEFAULT 0,
    UNIQUE (doctor_id, date, time)
);
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY,
    phone TEXT NOT NULL,
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('booked', 'cancelled')),
    created_at TEXT NOT NULL
);
"""


def connect(path: str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def _now() -> tuple[str, str]:
    now = datetime.now()
    return now.strftime("%Y-%m-%d"), now.strftime("%H:%M")


def all_doctors(conn) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM doctors ORDER BY id").fetchall()


def find_doctors(conn, query: str) -> list[sqlite3.Row]:
    """Doctors whose name or specialty contains the query ("Dr. Rao", "cardio")."""
    q = query.lower().replace("doctor", "").replace("dr.", "").replace("dr ", "").strip()
    if not q:
        return []
    return [d for d in all_doctors(conn) if q in d["name"].lower() or q in d["specialty"].lower()]


def doctors_with_slots(conn) -> list[dict]:
    """Every doctor with all upcoming slots, booked or free (for the dashboard)."""
    today, now = _now()
    doctors = {d["id"]: {**dict(d), "slots": []} for d in all_doctors(conn)}
    for s in conn.execute(
        """SELECT doctor_id, date, time, is_booked FROM slots
           WHERE date > ? OR (date = ? AND time > ?) ORDER BY date, time""",
        (today, today, now),
    ):
        doctors[s["doctor_id"]]["slots"].append(
            {"date": s["date"], "time": s["time"], "is_booked": bool(s["is_booked"])}
        )
    return list(doctors.values())


def all_appointments(conn) -> list[dict]:
    rows = conn.execute(
        """SELECT a.id, a.phone, a.doctor_id, d.name AS doctor, d.specialty, a.date, a.time,
                  a.status, a.created_at
           FROM appointments a JOIN doctors d ON d.id = a.doctor_id
           ORDER BY a.created_at DESC, a.id DESC"""
    )
    return [dict(r) for r in rows]


def get_appointment(conn, appointment_id: int) -> dict | None:
    rows = [a for a in all_appointments(conn) if a["id"] == appointment_id]
    return rows[0] if rows else None


def free_slots(conn, doctor_id: int, date: str | None = None) -> list[sqlite3.Row]:
    """Unbooked future slots, optionally for one date."""
    today, now = _now()
    sql = """SELECT date, time FROM slots
             WHERE doctor_id = ? AND is_booked = 0 AND (date > ? OR (date = ? AND time > ?))"""
    args = [doctor_id, today, today, now]
    if date:
        sql += " AND date = ?"
        args.append(date)
    return conn.execute(sql + " ORDER BY date, time", args).fetchall()


def book(conn, phone: str, doctor_id: int, date: str, time: str) -> int | None:
    """Book atomically. Returns the appointment id, or None if the slot isn't free."""
    with conn:
        cur = conn.execute(
            "UPDATE slots SET is_booked = 1 WHERE doctor_id = ? AND date = ? AND time = ? AND is_booked = 0",
            (doctor_id, date, time),
        )
        if cur.rowcount == 0:
            return None
        cur = conn.execute(
            "INSERT INTO appointments (phone, doctor_id, date, time, status, created_at) "
            "VALUES (?, ?, ?, ?, 'booked', ?)",
            (phone, doctor_id, date, time, datetime.now().isoformat(timespec="seconds")),
        )
        return cur.lastrowid


def upcoming_appointments(conn, phone: str) -> list[sqlite3.Row]:
    today, now = _now()
    return conn.execute(
        """SELECT a.id, a.date, a.time, d.name AS doctor, d.specialty
           FROM appointments a JOIN doctors d ON d.id = a.doctor_id
           WHERE a.phone = ? AND a.status = 'booked' AND (a.date > ? OR (a.date = ? AND a.time > ?))
           ORDER BY a.date, a.time""",
        (phone, today, today, now),
    ).fetchall()


def cancel(conn, appointment_id: int, phone: str) -> bool:
    """Cancel one of this phone's booked appointments and free its slot."""
    with conn:
        row = conn.execute(
            "SELECT doctor_id, date, time FROM appointments WHERE id = ? AND phone = ? AND status = 'booked'",
            (appointment_id, phone),
        ).fetchone()
        if row is None:
            return False
        conn.execute("UPDATE appointments SET status = 'cancelled' WHERE id = ?", (appointment_id,))
        conn.execute(
            "UPDATE slots SET is_booked = 0 WHERE doctor_id = ? AND date = ? AND time = ?",
            (row["doctor_id"], row["date"], row["time"]),
        )
        return True
