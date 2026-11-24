"""Turn a spoken phone number ("nine eight double seven...", "+91 98765 43210") into 10 digits."""

import re

WORD_DIGITS = {
    "zero": "0", "oh": "0", "o": "0", "nought": "0",
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9",
}
REPEAT = {"double": 2, "triple": 3}


def spoken_to_digits(text: str) -> str:
    """Every digit mentioned in the text, in order. Other words are ignored."""
    out, repeat = [], 1
    for tok in re.findall(r"[a-z]+|\d+", text.lower()):
        if tok in REPEAT:
            repeat = REPEAT[tok]
            continue
        digits = tok if tok.isdigit() else WORD_DIGITS.get(tok)
        if digits is None:
            continue  # filler like "my number is"; a pending double/triple carries over
        out.append(digits[0] * repeat + digits[1:])
        repeat = 1
    return "".join(out)


def normalise(text: str) -> str | None:
    """10-digit Indian number, or None if the text doesn't contain exactly one."""
    digits = spoken_to_digits(text)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if len(digits) == 10 else None




def mentions_phone_number(text: str) -> bool:
    """Bot line asks for or reads back a phone number, so the caller's next turn will be digits."""
    t = text.lower()
    return "number" in t or len(spoken_to_digits(t)) >= 7
