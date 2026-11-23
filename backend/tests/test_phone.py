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
