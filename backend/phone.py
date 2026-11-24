"""Turn a spoken phone number into 10 digits, in English, Hindi or Telugu.

"nine eight double seven...", "+91 98765 43210", "नौ आठ सात...", "తొమ్మిది ఎనిమిది...", "९८७६...", "౯౮౭౬...".
"""

import re
import unicodedata

_DIGIT_WORDS = {
    "0": "zero oh o nought  शून्य  shunya shoonya sunya  సున్నా సున్న  sunna",
    "1": "one  एक ek  ఒకటి okati",
    "2": "two  दो  రెండు rendu",
    "3": "three  तीन teen  మూడు moodu mudu",
    "4": "four  चार chaar char  నాలుగు naalugu nalugu",
    "5": "five  पांच पाँच paanch panch  ఐదు అయిదు aidu aidhu",
    "6": "six  छह छः छे chhah chhe chheh  ఆరు aaru",
    "7": "seven  सात saat  ఏడు yedu edu",
    "8": "eight  आठ aath  ఎనిమిది enimidi",
    "9": "nine  नौ nau  తొమ్మిది tommidi thommidi",
}
# Latin spellings that are also everyday English words are left out on purpose ("do" = 2, "no" = 9,
# "sat" = 7, "tin" = 3), as is Telugu "ఒక" ("a"): they would put digits into ordinary sentences.
WORD_DIGITS = {w: d for d, words in _DIGIT_WORDS.items() for w in words.split()}
REPEAT = {"double": 2, "triple": 3, "डबल": 2, "ट्रिपल": 3, "డబుల్": 2, "ట్రిపుల్": 3}

# A run of digits (any script: 9 / ९ / ౯), or a run of anything that isn't space, digit or punctuation.
# Not \w: it splits Devanagari/Telugu words at every vowel sign ("शून्य" -> "श", "न", "य").
TOKEN = re.compile(r"\d+|[^\s\d.,!?;:'\"()\[\]/+\-–—।॥]+")


def spoken_to_digits(text: str) -> str:
    """Every digit mentioned in the text, in order, as ASCII. Other words are ignored."""
    out, repeat = [], 1
    for tok in TOKEN.findall(text.lower()):
        if tok in REPEAT:
            repeat = REPEAT[tok]
            continue
        if tok[0].isdigit():
            digits = "".join(str(unicodedata.digit(c)) for c in tok)  # ९ / ౯ -> 9
        else:
            digits = WORD_DIGITS.get(tok)
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


NUMBER_WORDS = ("number", "नंबर", "नम्बर", "నంబర్", "నెంబర్")


def mentions_phone_number(text: str) -> bool:
    """Bot line asks for or reads back a phone number, so the caller's next turn will be digits."""
    t = text.lower()
    return any(w in t for w in NUMBER_WORDS) or len(spoken_to_digits(t)) >= 7
