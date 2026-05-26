def clean_prefix(text: str) -> str:
    if text.startswith("//"):
        return text[2:].strip()
    elif text.startswith(("-", "*")):
        return text[1:].strip()
    return text