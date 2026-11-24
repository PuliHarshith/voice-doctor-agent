import pytest

from phone import normalise, spoken_to_digits


@pytest.mark.parametrize("spoken, expected", [
    ("nine eight seven six five four three two one zero", "9876543210"),
    ("9876543210", "9876543210"),
    ("98765 43210", "9876543210"),
    ("98765-43210", "9876543210"),
    ("my number is nine eight seven six five, four three two one oh", "9876543210"),
    ("double nine eight seven six five four three two one", "9987654321"),
    ("nine triple eight seven six five four three two", "9888765432"),
    ("nine double 8 seven six five four three two one", "9887654321"),
    ("+91 98765 43210", "9876543210"),
    ("plus nine one nine eight seven six five four three two one zero", "9876543210"),
    ("91 9876543210", "9876543210"),
    ("09876543210", "9876543210"),
    ("Nine, eight, seven, six, five, four, three, two, one, O.", "9876543210"),
    ("nine eight 7 6 five 43 two one zero", "9876543210"),
])
def test_normalise_valid(spoken, expected):
    assert normalise(spoken) == expected


@pytest.mark.parametrize("spoken", [
    "",
    "my number is",
    "nine eight seven",                      # too short
    "98765432101234",                        # too long
    "nine eight seven six five four three two one zero one",  # 11 digits, no leading 0
])
def test_normalise_invalid(spoken):
    assert normalise(spoken) is None


def test_spoken_to_digits_ignores_filler_and_keeps_order():
    assert spoken_to_digits("that's 9 8 7, is that right?") == "987"


# Cases requested after the first live call
@pytest.mark.parametrize("spoken, expected", [
    ("double nine eight seven six five four three two one", "9987654321"),
    ("nine eight double nine seven six five four three two", "9899765432"),
    ("nine oh oh one two three four five six seven", "9001234567"),
    ("nine eight oh, seven six five, four three two one", "9807654321"),
    ("triple nine eight seven six five four three two", "9998765432"),
    ("nine eight seven six triple zero one two three", "9876000123"),
    ("9 8 7 6 5 4 3 2 1 0", "9876543210"),
    ("+91 9876543210", "9876543210"),
    ("+919876543210", "9876543210"),
    ("plus 91 98765 43210", "9876543210"),
    ("9703065715.", "9703065715"),            # how Scribe actually returned it
    ("970. 306. 5715", "9703065715"),        # digit groups as separate STT segments
])
def test_normalise_requested_cases(spoken, expected):
    assert normalise(spoken) == expected


def test_spoken_fragment_9876():
    assert spoken_to_digits("9 8 7 6") == "9876"
    assert normalise("9 8 7 6") is None  # only 4 digits: never accepted as a phone number


@pytest.mark.parametrize("spoken, expected", [
    ("nine eight seven six five four three two one zero", "9876543210"),   # zero
    ("nine eight seven six five four three two one oh", "9876543210"),     # oh
    ("98765-43210", "9876543210"),                                         # dash
    ("987-654-3210", "9876543210"),
    ("98 76 54 32 10", "9876543210"),                                      # spaces
    ("+91-98765-43210", "9876543210"),
    ("091 98765 43210", None),                                             # 13 digits
    ("98765 4321", None),                                                  # 9 digits: too few
    ("98765 432100", None),                                                # 11 digits, no 0 prefix: too many
    ("nine eight seven six five four three two one", None),               # 9 spoken digits
])
def test_normalise_audit_cases(spoken, expected):
    assert normalise(spoken) == expected


@pytest.mark.parametrize("bot_line, expected", [
    ("Could you tell me your ten digit phone number?", True),
    ("That's 9 8 7 6 5, 4 3 2 1 0. Is that right?", True),
    ("Dr. Rao has openings at ten AM on Wednesday the 25th.", False),
    ("You are booked with Dr. Iyer at three PM.", False),
])
def test_mentions_phone_number(bot_line, expected):
    from phone import mentions_phone_number
    assert mentions_phone_number(bot_line) is expected
