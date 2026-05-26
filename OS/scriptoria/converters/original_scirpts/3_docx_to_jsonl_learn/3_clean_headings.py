def clean_heading(text: str) -> str:
    """Cleans numbering (e.g., 1.1) and extra spaces from the heading."""
    return re.sub(r"^\s*[\d\.]+\s*", "", text).strip()