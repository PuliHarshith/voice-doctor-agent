import pytest

from language import detect_language


@pytest.mark.parametrize("text, stt, current, expected", [
    ("I want to book an appointment", "eng", "en", "en"),
    ("मुझे अपॉइंटमेंट चाहिए", "hin", "en", "hi"),
    ("నాకు అపాయింట్‌మెంట్ కావాలి", "tel", "en", "te"),
    ("నాకు అపాయింట్‌మెంట్ కావాలి", None, "en", "te"),   # no STT code: decided by script
    ("मुझे अपॉइंटमेंट चाहिए", None, "te", "hi"),
    ("97030 65715", "eng", "te", "te"),                 # digits only: keep the caller's language
    ("९७०३० ६५७१५", None, "hi", "hi"),
    ("Vanakkam, enakku appointment venum", "tam", "en", "other"),  # unsupported -> English fallback
    ("Actually, English please", "eng", "hi", "en"),    # switching back
    ("నా number 98345", "hi", "en", "te"),              # wrong STT code: Telugu script wins
    ("mujhe appointment chahiye", "hi", "en", "hi"),    # romanised Hindi: only the STT code can tell
])
def test_detect_language(text, stt, current, expected):
    assert detect_language(text, stt, current) == expected
