def iter_paragraphs(parent):
    """Iterates through paragraphs in the Word document"""
    if isinstance(parent, _Document):
        parent_elm = parent.element.body
    else:
        raise ValueError(f"Unsupported element: {type(parent)}")
    for child in parent_elm.iterchildren():
        if child.tag.endswith("p"):
            yield Paragraph(child, parent)