"""Tool handlers against a temp SQLite DB, with a fake Pipecat params object."""

import asyncio
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
    assert result[0]["available_times"][0] == "9:00 AM"


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


# --- cancelling ---

def test_cancel_single_and_frees_slot(tools):
    confirmed(tools)
    call(tools.book, doctor="Iyer", date=TOMORROW, time="2:00 PM")
    r = call(tools.cancel)
    assert r["cancelled"] and r["doctor"] == "Dr. Priya Iyer"
    assert "2:00 PM" in call(tools.check, doctor="Iyer", date=TOMORROW)["availability"][0]["available_times"]
    assert "No upcoming" in call(tools.cancel)["error"]


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
    assert "No upcoming" in call(other, appointment_id=appt)["error"]
