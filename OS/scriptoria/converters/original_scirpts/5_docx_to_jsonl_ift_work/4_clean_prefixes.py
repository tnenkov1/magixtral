def get_marked_content(text: str):
    """Checks for markers (//, *, -, •, —) and removes them."""
    cleaned = text.strip()
    match = re.match(r"^(\/\/|\*|\-|•|—)\s*(.*)", cleaned)
    if match:
        return True, match.group(2).strip()
    return False, cleaned