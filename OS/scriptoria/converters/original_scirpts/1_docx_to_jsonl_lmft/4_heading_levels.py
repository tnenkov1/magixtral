def get_heading_level(paragraph) -> int:
    """Returns the numeric heading level (1-9). Defaults to 9."""
    try:
        style_name = paragraph.style.name.lower()
        match = re.search(r'\d+', style_name)
        if match:
            return int(match.group())
        level = paragraph.paragraph_format.outline_level
        if level is not None and level < 9:
            return level + 1
    except:
        pass
    return 9

def is_heading(paragraph) -> bool:
    """Identifies if a paragraph is a heading based on style or outline level."""
    if not paragraph.text.strip() or not paragraph.style:
        return False
    style_name = paragraph.style.name.lower()
    if re.search(r"(heading|заглавие|title|загл|h|header)\s*\d*", style_name):
        return True
    try:
        level = paragraph.paragraph_format.outline_level
        if level is not None and level < 9:
            return True
    except:
        pass
    return False