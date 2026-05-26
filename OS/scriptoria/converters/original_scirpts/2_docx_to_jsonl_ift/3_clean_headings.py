def clean_heading(text: str) -> str:
    """Removes numbering (e.g. 1.1) and extra spaces."""
    return re.sub(r"^\s*[\d\.]+\s*", "", text).strip()

def get_marked_content(text: str):
    """Checks for markers (//, *, -, •, —) and extracts clean text."""
    cleaned = text.strip()
    match = re.match(r"^(\/\/|\*|\-|•|—)\s*(.*)", cleaned)
    if match:
        return True, match.group(2).strip()
    return False, cleaned