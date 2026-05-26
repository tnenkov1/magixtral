def convert_docx_to_jsonl(input_path, output_path):
    doc = Document(input_path)
    all_data = []
    paragraphs = list(iter_paragraphs(doc))
    
    h_indices = [
        i for i, p in enumerate(paragraphs)
        if (p.style.name if p.style else "").lower().startswith("heading")
    ]
    
    max_words_in_file = 0

    for idx, i in enumerate(h_indices):
        raw_heading = paragraphs[i].text.strip()
        if not raw_heading:
            continue
            
        heading = clean_heading(raw_heading)
        style_name = (paragraphs[i].style.name if paragraphs[i].style else "").lower()
        level = int(re.search(r'\d+', style_name).group()) if re.search(r'\d+', style_name) else 1

        next_any_h = h_indices[idx + 1] if idx + 1 < len(h_indices) else len(paragraphs)

        marked_lines = []
        plain_texts = []
        ordered_content = []

        for j in range(i + 1, next_any_h):
            text = paragraphs[j].text.strip()
            if not text:
                continue
            
            if text.startswith(("//", "-", "*")):
                cleaned = clean_prefix(text)
                marked_lines.append(cleaned)
                ordered_content.append(cleaned)
            else:
                plain_texts.append(text)
                ordered_content.append(text)

        subheadings_names = []
        next_same_or_higher = len(paragraphs)
        for next_h_idx in h_indices[idx + 1:]:
            n_style = (paragraphs[next_h_idx].style.name if paragraphs[next_h_idx].style else "").lower()
            n_level = int(re.search(r'\d+', n_style).group()) if re.search(r'\d+', n_style) else 1
            if n_level <= level:
                next_same_or_higher = next_h_idx
                break
        
        for j in range(i + 1, next_same_or_higher):
            p_style = (paragraphs[j].style.name if paragraphs[j].style else "").lower()
            if p_style.startswith("heading"):
                subheadings_names.append(clean_heading(paragraphs[j].text))

        plain_combined = " ".join(plain_texts).strip()
        marked_comma = ", ".join(marked_lines).strip()
        ordered_full = " ".join(ordered_content).strip()
        subs_list = ", ".join(subheadings_names).strip()

        entries = []
        if plain_combined and marked_comma:
            entries.append({"instruction": "", "input": plain_combined, "output": marked_comma})
            entries.append({"instruction": "", "input": marked_comma, "output": plain_combined})

        if heading and ordered_full:
            entries.append({"instruction": "", "input": heading, "output": ordered_full})
            entries.append({"instruction": "", "input": ordered_full, "output": heading})

        if subs_list and not ordered_full:
            entries.append({"instruction": "", "input": heading, "output": subs_list})
            entries.append({"instruction": "", "input": subs_list, "output": heading})

        for entry in entries:
            all_data.append(entry)
            word_count = len(entry["input"].split()) + len(entry["output"].split())
            if word_count > max_words_in_file:
                max_words_in_file = word_count

    if all_data:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            for entry in all_data:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    
    return len(all_data), max_words_in_file