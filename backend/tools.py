"""LLM tools (Pipecat direct functions). Pipecat builds each tool's schema from its signature + docstring.

Phone rule enforced in code: book/cancel only use a number stored by confirm_phone_number, and that
tool only stores it if the agent's last message read the digits back and the caller then said yes.
"""

import re
from dataclasses import dataclass
from datetime import date as Date, datetime

from pipecat.processors.aggregators.llm_context import standard_message_text
from pipecat.services.llm_service import FunctionCallParams

import db
from phone import normalise, spoken_to_digits

YES = {"yes", "yeah", "yep", "yup", "ya", "yah", "correct", "right", "exactly", "sure", "haan", "han",
       "ha", "ok", "okay", "absolutely", "confirmed", "perfect", "affirmative"}
NO = {"no", "nope", "nah", "not", "wrong", "incorrect", "wait"}
MAX_TIMES = 8  # keep spoken lists short


@dataclass
class Session:
    """Per-call state. One is created for each browser connection."""
    phone: str | None = None


def is_yes(text: str) -> bool:
    words = set(re.findall(r"[a-z]+", text.lower()))
    return bool(words & YES) and not words & NO


def last_readback_and_reply(messages: list) -> tuple[str, str]:
    """(agent's spoken message just before the caller's latest message, that latest message).
    Agent text after the caller's message is ignored: it's the reply that triggered this tool call."""
    user_text = None
    for m in reversed(messages):
        role, text = m.get("role"), standard_message_text(m).strip()
        if not text:
            continue  # tool calls / tool results have no spoken text
        if user_text is None:
            if role == "user":
                user_text = text
        elif role == "assistant":
            return text, user_text
    return "", user_text or ""


def parse_date(value: str) -> str | None:
    try:
        return Date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        return None


def parse_time(value: str) -> str | None:
    """'14:30', '2:30 PM', '2 pm' -> '14:30'."""
    v = value.strip().upper().replace(".", "")
    for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p", "%I %p", "%I%p"):
        try:
            return datetime.strptime(v, fmt).strftime("%H:%M")
        except ValueError:
            pass
    return None


def speak_time(hhmm: str) -> str:
    return datetime.strptime(hhmm, "%H:%M").strftime("%I:%M %p").lstrip("0")


def day_name(iso: str) -> str:
    return Date.fromisoformat(iso).strftime("%A")


def resolve_doctor(conn, doctor: str):
    """(doctor_row, None) or (None, error message)."""
    matches = db.find_doctors(conn, doctor)
    if not matches:
        names = ", ".join(f"{d['name']} ({d['specialty']})" for d in db.all_doctors(conn))
        return None, f"No doctor matches '{doctor}'. Our doctors are: {names}."
    if len(matches) > 1:
        names = ", ".join(f"{d['name']} ({d['specialty']})" for d in matches)
        return None, f"'{doctor}' matches more than one doctor: {names}. Ask which one."
    return matches[0], None


def check_date(value: str) -> tuple[str | None, str | None]:
    iso = parse_date(value)
    if iso is None:
        return None, f"'{value}' is not a valid date. Use YYYY-MM-DD."
    if iso < Date.today().isoformat():
        return None, f"{iso} is in the past."
    return iso, None


def make_tools(session: Session) -> list:
    async def confirm_phone_number(params: FunctionCallParams, phone_number: str):
        """Save the caller's phone number for this call. Call it ONLY after you read the number back
        digit by digit and the caller explicitly said yes. Booking and cancelling need this first.

        Args:
            phone_number: The 10-digit number exactly as you read it back, e.g. "9876543210".
        """
        phone = normalise(phone_number)
        bot_text, user_text = last_readback_and_reply(params.context.get_messages())
        if phone is None:
            result = {"error": f"'{phone_number}' is not a valid 10-digit phone number. Ask the caller again."}
        elif phone not in spoken_to_digits(bot_text):
            result = {"error": "You have not read this exact number back yet. Read it digit by digit "
                               "and ask the caller to confirm."}
        elif not is_yes(user_text):
            result = {"error": "The caller has not clearly said yes to the read-back. Ask them to confirm."}
        else:
            session.phone = phone
            result = {"confirmed_phone": phone}
        await params.result_callback(result)

    async def check_doctor_availability(params: FunctionCallParams, doctor: str | None = None,
                                        date: str | None = None):
        """List open appointment slots. Give a doctor, a date, or both.

        Args:
            doctor: Doctor name or specialty, e.g. "Dr. Rao" or "dermatologist". Omit for all doctors.
            date: Date as YYYY-MM-DD. Omit for the next available days.
        """
        conn = db.connect()
        try:
            iso = None
            if date:
                iso, err = check_date(date)
                if err:
                    return await params.result_callback({"error": err})
            if doctor:
                doctors = db.find_doctors(conn, doctor)
                if not doctors:
                    _, err = resolve_doctor(conn, doctor)
                    return await params.result_callback({"error": err})
            else:
                doctors = db.all_doctors(conn)
            out = []
            for d in doctors:
                slots = db.free_slots(conn, d["id"], iso)
                if not iso and slots:  # no date asked: show the first day that has openings
                    slots = [s for s in slots if s["date"] == slots[0]["date"]]
                out.append({
                    "doctor": d["name"], "specialty": d["specialty"],
                    "date": slots[0]["date"] if slots else iso,
                    "day": day_name(slots[0]["date"]) if slots else None,
                    "available_times": [speak_time(s["time"]) for s in slots[:MAX_TIMES]],
                })
            await params.result_callback({"availability": out})
        finally:
            conn.close()

    async def book_appointment(params: FunctionCallParams, doctor: str, date: str, time: str):
        """Book a slot for the caller under their confirmed phone number.
        Only call after confirm_phone_number succeeded and the caller agreed to this exact slot.

        Args:
            doctor: Doctor name or specialty, e.g. "Dr. Ananya Sharma".
            date: Date as YYYY-MM-DD.
            time: Time like "10:30 AM" or "14:30".
        """
        if not session.phone:
            return await params.result_callback({"error": "Phone number not confirmed yet. Ask for it, read it "
                                                          "back digit by digit, get a yes, call confirm_phone_number."})
        conn = db.connect()
        try:
            d, err = resolve_doctor(conn, doctor)
            iso, err = (None, err) if err else check_date(date)
            hhmm = parse_time(time)
            if not err and hhmm is None:
                err = f"'{time}' is not a valid time."
            if err:
                return await params.result_callback({"error": err})
            appt_id = db.book(conn, session.phone, d["id"], iso, hhmm)
            if appt_id is None:
                free = [speak_time(s["time"]) for s in db.free_slots(conn, d["id"], iso)[:MAX_TIMES]]
                return await params.result_callback({
                    "error": f"{d['name']} has no open slot at {speak_time(hhmm)} on {iso}.",
                    "other_times_that_day": free,
                })
            await params.result_callback({
                "booked": True, "appointment_id": appt_id, "doctor": d["name"], "date": iso,
                "day": day_name(iso), "time": speak_time(hhmm), "phone": session.phone,
            })
        finally:
            conn.close()

    async def cancel_appointment(params: FunctionCallParams, appointment_id: int | None = None):
        """Cancel the caller's upcoming appointment, found by their confirmed phone number.
        If they have several, this returns the list; ask which one, then call again with its id.

        Args:
            appointment_id: Which appointment to cancel. Omit if the caller has only one.
        """
        if not session.phone:
            return await params.result_callback({"error": "Phone number not confirmed yet. Ask for it, read it "
                                                          "back digit by digit, get a yes, call confirm_phone_number."})
        conn = db.connect()
        try:
            upcoming = db.upcoming_appointments(conn, session.phone)
            listed = [{"appointment_id": a["id"], "doctor": a["doctor"], "date": a["date"],
                       "day": day_name(a["date"]), "time": speak_time(a["time"])} for a in upcoming]
            if not upcoming:
                return await params.result_callback({"error": "No upcoming appointments for this phone number."})
            if appointment_id is None:
                if len(upcoming) > 1:
                    return await params.result_callback({"error": "Several appointments found. Ask which one.",
                                                         "appointments": listed})
                appointment_id = upcoming[0]["id"]
            match = next((a for a in listed if a["appointment_id"] == appointment_id), None)
            if match is None or not db.cancel(conn, appointment_id, session.phone):
                return await params.result_callback({"error": f"No upcoming appointment {appointment_id} for this "
                                                              "phone number.", "appointments": listed})
            await params.result_callback({"cancelled": True, **match})
        finally:
            conn.close()

    return [confirm_phone_number, check_doctor_availability, book_appointment, cancel_appointment]
