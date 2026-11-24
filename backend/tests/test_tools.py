"""Tool handlers against a temp SQLite DB, with a fake Pipecat params object."""

import asyncio
import sqlite3
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

import db
import seed
from tools import Session, is_yes, make_tools

TOMORROW = (date.today() + timedelta(days=1)).isoformat()
PHONE = "9876543210"
READBACK = [
    {"role": "assistant", "content": "That's 9 8 7 6 5, 4 3 2 1 0. Is that right?"},
    {"role": "user", "content": "Yes, that's right."},
]


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    seed.seed(db.connect())


def call(tool, messages=(), **kwargs):
    out = {}

    async def result_callback(result, **_):
        out["result"] = result

    params = SimpleNamespace(result_callback=result_callback,
                             context=SimpleNamespace(get_messages=lambda: list(messages)))
    asyncio.run(tool(params, **kwargs))
    return out["result"]


@pytest.fixture
def tools():
    session = Session()
    confirm, check, book, cancel = make_tools(session)
    return SimpleNamespace(session=session, confirm=confirm, check=check, book=book, cancel=cancel)


def confirmed(t):
    assert call(t.confirm, READBACK, phone_number=PHONE) == {"confirmed_phone": PHONE}
    return t


# --- confirmation is enforced in code ---

def test_book_and_cancel_refuse_without_confirmed_phone(tools):
    assert "not confirmed" in call(tools.book, doctor="Sharma", date=TOMORROW, time="09:00")["error"]
    assert "not confirmed" in call(tools.cancel)["error"]


def test_confirm_requires_readback(tools):
    msgs = [{"role": "assistant", "content": "What's your number?"}, {"role": "user", "content": "yes"}]
    assert "read this exact number back" in call(tools.confirm, msgs, phone_number=PHONE)["error"]
    assert tools.session.phone is None


def test_confirm_requires_yes(tools):
    msgs = [READBACK[0], {"role": "user", "content": "No, the last digit is one"}]
    assert "not clearly said yes" in call(tools.confirm, msgs, phone_number=PHONE)["error"]
    assert tools.session.phone is None


def test_confirm_rejects_number_different_from_readback(tools):
    assert "error" in call(tools.confirm, READBACK, phone_number="9876543211")


def test_confirm_ignores_agent_text_after_the_yes(tools):
    msgs = READBACK + [{"role": "assistant", "content": "Great, saving that now."}]
    assert call(tools.confirm, msgs, phone_number=PHONE) == {"confirmed_phone": PHONE}


def test_confirm_rejects_invalid_number(tools):
    assert "not a valid" in call(tools.confirm, READBACK, phone_number="12345")["error"]


@pytest.mark.parametrize("text, expected", [
    ("yes", True), ("Yeah that's correct", True), ("haan", True),
    ("no", False), ("not quite", False), ("hmm", False), ("yes, wait, no", False),
])
def test_is_yes(text, expected):
    assert is_yes(text) is expected


# --- availability ---

def test_availability_by_specialty_and_date(tools):
    result = call(tools.check, doctor="cardiologist", date=TOMORROW)["availability"]
    assert len(result) == 1 and result[0]["doctor"] == "Dr. Rohan Mehta"
    assert result[0]["available_times"][0] == "9 AM"


def test_availability_bad_inputs(tools):
    assert "No doctor matches" in call(tools.check, doctor="Dr. Who")["error"]
    assert "not a valid date" in call(tools.check, date="next friday")["error"]
    assert "past" in call(tools.check, date="2000-01-01")["error"]


# --- booking ---

def test_book_then_slot_is_gone(tools):
    confirmed(tools)
    r = call(tools.book, doctor="Dr. Ananya Sharma", date=TOMORROW, time="10:30 AM")
    assert r["booked"] and r["time"] == "10:30 AM" and r["phone"] == PHONE
    times = call(tools.check, doctor="Sharma", date=TOMORROW)["availability"][0]["available_times"]
    assert "10:30 AM" not in times
    again = call(tools.book, doctor="Sharma", date=TOMORROW, time="10:30")
    assert "no open slot" in again["error"] and again["other_times_that_day"]


def test_book_validation(tools):
    confirmed(tools)
    assert "more than one" in call(tools.book, doctor="dr", date=TOMORROW, time="9:00")["error"]
    assert "not a valid time" in call(tools.book, doctor="Sharma", date=TOMORROW, time="half past")["error"]
    assert "no open slot" in call(tools.book, doctor="Mehta", date=TOMORROW, time="3 PM")["error"]  # morning only


def test_book_past_date_and_unknown_doctor(tools):
    confirmed(tools)
    assert "in the past" in call(tools.book, doctor="Sharma", date="2000-01-01", time="09:00")["error"]
    assert "Our doctors are" in call(tools.book, doctor="Dr. Who", date=TOMORROW, time="09:00")["error"]
    assert "not a valid date" in call(tools.book, doctor="Sharma", date="25/11", time="09:00")["error"]


# --- cancelling ---

def test_cancel_twice_and_with_no_booking(tools):
    confirmed(tools)
    assert "no upcoming appointments" in call(tools.cancel)["error"]
    a = call(tools.book, doctor="Iyer", date=TOMORROW, time="2 PM")["appointment_id"]
    assert call(tools.cancel, appointment_id=a)["cancelled"]
    assert "no upcoming appointments" in call(tools.cancel, appointment_id=a)["error"]

def test_cancel_single_and_frees_slot(tools):
    confirmed(tools)
    a = call(tools.book, doctor="Iyer", date=TOMORROW, time="2:00 PM")["appointment_id"]
    r = call(tools.cancel)  # without an id it only lists: the caller confirms which one first
    assert "cancelled" not in r and [x["appointment_id"] for x in r["appointments"]] == [a]
    r = call(tools.cancel, appointment_id=a)
    assert r["cancelled"] and r["doctor"] == "Dr. Priya Iyer"
    assert "2 PM" in call(tools.check, doctor="Iyer", date=TOMORROW)["availability"][0]["available_times"]
    assert "no upcoming appointments" in call(tools.cancel)["error"]


def test_cancel_with_several_asks_which(tools):
    confirmed(tools)
    a = call(tools.book, doctor="Iyer", date=TOMORROW, time="2:00 PM")["appointment_id"]
    call(tools.book, doctor="Nair", date=TOMORROW, time="3:00 PM")
    r = call(tools.cancel)
    assert len(r["appointments"]) == 2
    assert call(tools.cancel, appointment_id=a)["cancelled"]
    assert "No upcoming appointment 999" in call(tools.cancel, appointment_id=999)["error"]


def test_cannot_cancel_someone_elses_appointment(tools):
    confirmed(tools)
    appt = call(tools.book, doctor="Iyer", date=TOMORROW, time="2:00 PM")["appointment_id"]
    other = make_tools(Session(phone="9000000000"))[3]
    assert "no upcoming appointments" in call(other, appointment_id=appt)["error"]


# --- events ---

def test_confirm_publishes_the_digits(tools):
    from events import bus
    with bus.subscribe() as q:
        q.get_nowait()  # current call status
        confirmed(tools)
        assert q.get_nowait() | {"ts": 0} == {"type": "phone_confirmed", "phone": PHONE, "ts": 0}
        assert q.empty()


def test_cancel_keeps_the_row_as_cancelled(tools):
    import db
    confirmed(tools)
    appt = call(tools.book, doctor="Iyer", date=TOMORROW, time="2 PM")["appointment_id"]
    call(tools.cancel, appointment_id=appt)
    with db.connect() as conn:
        assert db.get_appointment(conn, appt)["status"] == "cancelled"


def test_book_and_cancel_publish_events_after_the_write(tools):
    from events import bus
    confirmed(tools)
    with bus.subscribe() as q:
        assert q.get_nowait()["type"] == "call_status"  # current status comes first
        appt = call(tools.book, doctor="Iyer", date=TOMORROW, time="2:00 PM")["appointment_id"]
        booked, slots = q.get_nowait(), q.get_nowait()
        assert booked["type"] == "appointment_booked" and booked["appointment"]["id"] == appt
        assert booked["appointment"]["status"] == "booked"  # row already exists in the DB
        assert slots["type"] == "slots_changed" and slots["date"] == TOMORROW
        call(tools.cancel)  # listing only: no events
        assert q.empty()
        call(tools.cancel, appointment_id=appt)
        assert q.get_nowait()["appointment"]["status"] == "cancelled"
        assert q.get_nowait()["type"] == "slots_changed"
        call(tools.book, doctor="Iyer", date=TOMORROW, time="3 AM")  # failed booking: no events
        assert q.empty()


# --- regressions from the live call ---

def test_confirm_works_with_real_gemini_context():
    """Live bug: Gemini puts LLMSpecificMessage objects (not dicts) in the context -> AttributeError."""
    from pipecat.processors.aggregators.llm_context import LLMContext, LLMSpecificMessage
    session = Session()
    confirm = make_tools(session)[0]
    ctx = LLMContext(messages=[
        {"role": "assistant", "content": "That's 9 7 0 3 0 6 5 7 1 5. Is that right?"},
        LLMSpecificMessage(llm="google", message={"role": "model", "parts": [{"thought_signature": b"x"}]}),
        {"role": "user", "content": "Yes."},
        LLMSpecificMessage(llm="google", message={"role": "model", "parts": [{"thought_signature": b"y"}]}),
    ])
    out = {}

    async def cb(result, **_):
        out["r"] = result

    asyncio.run(confirm(SimpleNamespace(context=ctx, result_callback=cb), phone_number="9703065715"))
    assert out["r"] == {"confirmed_phone": "9703065715"} and session.phone == "9703065715"


def test_tool_crash_returns_short_error_and_logs(tools, monkeypatch):
    confirmed(tools)

    def boom(*a, **k):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(db, "book", boom)
    r = call(tools.book, doctor="Iyer", date=TOMORROW, time="2:00 PM")
    assert r == {"error": "Internal error, nothing was saved. Apologise and try once more."}


def test_tool_schema_survives_logging_wrapper():
    from pipecat.processors.aggregators.llm_context import LLMContext
    schemas = {f.name: f for f in LLMContext(tools=make_tools(Session())).tools.standard_tools}
    assert set(schemas) == {"confirm_phone_number", "check_doctor_availability", "book_appointment",
                            "cancel_appointment"}
    assert schemas["book_appointment"].required == ["doctor", "date", "time"]
    assert "confirmed phone number" in schemas["book_appointment"].description


def test_startup_check_seeds_empty_db_and_tops_up_old_slots(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "fresh.db"))
    conn = db.connect()
    seed.ensure_seeded(conn)  # empty -> seeded
    assert len(db.all_doctors(conn)) == 6
    conn.execute("DELETE FROM slots WHERE date > ?", (date.today().isoformat(),))  # simulate a stale DB
    conn.commit()
    seed.ensure_seeded(conn)
    assert db.free_slots(conn, 1, TOMORROW)


def test_demo_bookings_are_future_and_never_the_demo_callers_number():
    conn = db.connect()
    n = seed.add_demo_bookings(conn)
    appts = db.all_appointments(conn)
    assert n == len(seed.DEMO_BOOKINGS) and len(appts) == n + 1
    today, now = db.now_local()
    assert all((a["date"], a["time"]) > (today, now) for a in appts)
    assert PHONE not in {a["phone"] for a in appts}
    assert sum(a["status"] == "cancelled" for a in appts) == 1


def test_db_path_is_absolute():
    import importlib, os
    assert os.path.isabs(importlib.reload(db).DB_PATH)


def test_logging_wrapper_does_not_mutate_shared_params(tools):
    results = []

    async def cb(result, **_):
        results.append(result)

    p = SimpleNamespace(context=SimpleNamespace(get_messages=lambda: READBACK), result_callback=cb)
    asyncio.run(tools.confirm(p, phone_number=PHONE))
    asyncio.run(tools.check(p, doctor="Iyer", date=TOMORROW))
    assert p.result_callback is cb and len(results) == 2


# --- audit regressions ---

def test_cannot_book_a_slot_earlier_today(tools, monkeypatch):
    confirmed(tools)
    today = date.today().isoformat()
    monkeypatch.setattr(db, "now_local", lambda: (today, "23:00"))
    r = call(tools.book, doctor="Sharma", date=today, time="9:00 AM")
    assert "already passed" in r["error"]


def test_readback_with_extra_digit_is_rejected(tools):
    msgs = [{"role": "assistant", "content": "That's 9 8 7 6 5 4 3 2 1 0 5. Right?"}, {"role": "user", "content": "yes"}]
    assert "error" in call(tools.confirm, msgs, phone_number=PHONE)
    assert tools.session.phone is None


def test_rejected_new_number_drops_the_old_one(tools):
    confirmed(tools)
    msgs = [{"role": "assistant", "content": "That's 9 1 1 1 1 1 1 1 1 1. Right?"}, {"role": "user", "content": "no"}]
    call(tools.confirm, msgs, phone_number="9111111111")
    assert tools.session.phone is None
    assert "not confirmed" in call(tools.book, doctor="Iyer", date=TOMORROW, time="2 PM")["error"]


def test_new_call_starts_unconfirmed():
    """Each call builds a fresh Session (bot.py), so nothing carries over from the previous caller."""
    first = Session()
    make_tools(first)
    first.phone = PHONE
    _, _, book, _ = make_tools(Session())
    assert "not confirmed" in call(book, doctor="Iyer", date=TOMORROW, time="2 PM")["error"]


def test_readback_can_share_a_message_with_a_time(tools):
    msgs = [{"role": "assistant", "content": "Dr. Rao at 5 PM on the 26th. Your number is 9 8 7 6 5, 4 3 2 1 0. Right?"},
            {"role": "user", "content": "yes"}]
    assert call(tools.confirm, msgs, phone_number=PHONE) == {"confirmed_phone": PHONE}
