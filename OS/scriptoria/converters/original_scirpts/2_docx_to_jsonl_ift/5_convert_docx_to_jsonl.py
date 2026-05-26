def convert_docx_to_jsonl(input_path, output_path):
    doc = Document(input_path)
    data = []
    blocks = []
    max_words_in_file = 0
    
    # --- 1. PARSING THE DOCUMENT INTO BLOCKS ---
    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
            
        if is_heading(p):
            current_block = {
                "heading": clean_heading(text),
                "level": get_heading_level(p),
                "unmarked": [],
                "marked": []
            }
            blocks.append(current_block)
        elif blocks:
            # Add text to the last detected heading block
            is_marked, clean_text = get_marked_content(text)
            if is_marked:
                blocks[-1]["marked"].append(clean_text)
            else:
                blocks[-1]["unmarked"].append(clean_text)

    # --- 2. GENERATING EXAMPLES ---
    for i, b_block in enumerate(blocks):
        instruction = b_block["heading"]
        input_text = " ".join(b_block["marked"]).strip()
        output_text = " ".join(b_block["unmarked"]).strip()

        if not input_text and not output_text:
            subheaders = []
            current_level = b_block["level"]
            
            # Look at subsequent blocks to find children
            for next_idx in range(i + 1, len(blocks)):
                next_block = blocks[next_idx]
                if next_block["level"] > current_level:
                    subheaders.append(next_block["heading"])
                else:
                    # Found a sibling or parent, stop the branch
                    break
            
            if subheaders:
                output_text = ", ".join(subheaders)

        # Skip empty entries if no content and no subheaders found
        if not output_text and not input_text:
            continue

        entry = {
            "instruction": instruction,
            "input": input_text,
            "output": output_text
        }
        data.append(entry)

        total_words = len(instruction.split()) + len(input_text.split()) + len(output_text.split())
        if total_words > max_words_in_file:
            max_words_in_file = total_words

    # --- 3. WRITING OUTPUT ---
    if data:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            for entry in data:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    
    return len(data), max_words_in_file