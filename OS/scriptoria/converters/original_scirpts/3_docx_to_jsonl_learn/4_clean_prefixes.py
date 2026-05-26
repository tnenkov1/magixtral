def clean_prefix(text: str) -> str:
    """Removes leading markers (//, *, -)"""
    if text.startswith("//"):
        return text[2:].strip()
    elif text.startswith(("-", "*")):
        return text[1:].strip()
    return text