def convert_docx_to_jsonl(input_path, output_path):
    """Main function to process a DOCX file and return counts."""
    doc = Document(input_path)
    data = []
    blocks = []
    current_block = None
    max_words = 0
    
    # --- 1. PARSE DOCUMENT ---
    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
            
        if is_heading(p):
            current_block = {
                "heading": clean_heading(text),
                "unmarked": [],
                "marked": []
            }
            blocks.append(current_block)
        elif current_block is not None:
            is_marked, clean_text = get_marked_content(text)
            if is_marked:
                current_block["marked"].append(clean_text)
            else:
                current_block["unmarked"].append(clean_text)

    # --- 2. GENERATE EXAMPLES ---
    for b_block in blocks:
        a = b_block["heading"]
        c = " ".join(b_block["unmarked"]).strip()
        b = " ".join(b_block["marked"]).strip()

        temp_entries = []
        if c and b:
            temp_entries.extend([
                {"instruction": a, "input": c, "output": b},
                {"instruction": a, "input": b, "output": c},
                {"instruction": b, "input": c, "output": a},
                {"instruction": c, "input": b, "output": a}
            ])
        elif c and not b:
            temp_entries.append({"instruction": a, "input": "", "output": c})
        elif b and not c:
            temp_entries.append({"instruction": a, "input": "", "output": b})

        for entry in temp_entries:
            data.append(entry)
            # Calculate max words in this block
            words = len(str(entry.values()).split())
            if words > max_words:
                max_words = words

    # --- 3. SAVE FILE ---
    if data:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            for entry in data:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    
    return len(data), max_words