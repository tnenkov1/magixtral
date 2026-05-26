def clean_heading(text: str) -> str:
    """Cleans numbering (e.g., 1.1) and extra spaces from the heading."""
    return re.sub(r"^\s*[\d\.]+\s*", "", text).strip()

def is_heading(paragraph) -> bool:
    """Detects headings levels 1-9 via styles and structure."""
    text = paragraph.text.strip()
    if not text:
        return False
    
    style = paragraph.style
    if not style:
        return False
        
    style_name = style.name.lower()
    
    # 1. Check for keywords in style name
    if re.search(r"(heading|заглавие|title|загл|h|header)\s*\d*", style_name):
        return True
        
    # 2. Check Outline Level
    try:
        level = paragraph.paragraph_format.outline_level
        if level is not None and level < 9:
            return True
    except:
        pass
        
    return False