def convert_docx_to_jsonl(input_path, output_path):
    doc = Document(input_path)
    all_data = []
    max_words_in_file = 0

    paragraphs = list(iter_paragraphs(doc))
    h_indices = [
        i for i, p in enumerate(paragraphs)
        if (p.style.name if p.style else "").lower().startswith("heading")
    ]

    for idx, i in enumerate(h_indices):
        raw_heading = paragraphs[i].text.strip()
        if not raw_heading: continue

        heading = clean_heading(raw_heading)
        style_name = (paragraphs[i].style.name if paragraphs[i].style else "").lower()
        level = int(re.search(r'\d+', style_name).group()) if re.search(r'\d+', style_name) else 1

        next_any_h = h_indices[idx + 1] if idx + 1 < len(h_indices) else len(paragraphs)

        input_lines = []
        output_lines = []
        
        for j in range(i + 1, next_any_h):
            text = paragraphs[j].text.strip()
            if not text: continue

            if text.startswith(("//", "-", "*")):
                input_lines.append(clean_prefix(text))
            else:
                output_lines.append(text)

        subheadings_names = []
        next_same_level = len(paragraphs)
        for next_h_idx in h_indices[idx + 1:]:
            n_style = (paragraphs[next_h_idx].style.name if paragraphs[next_h_idx].style else "").lower()
            n_level = int(re.search(r'\d+', n_style).group()) if re.search(r'\d+', n_style) else 1
            if n_level <= level:
                next_same_level = next_h_idx
                break
        
        for j in range(i + 1, next_same_level):
            p_style = (paragraphs[j].style.name if paragraphs[j].style else "").lower()
            if p_style.startswith("heading"):
                p_level = int(re.search(r'\d+', p_style).group()) if re.search(r'\d+', p_style) else 1
                if p_level > level:
                    subheadings_names.append(clean_heading(paragraphs[j].text))

        entries_to_add = []
        if output_lines:
            txt = " ".join(output_lines)
            entries_to_add.append({"instruction": heading, "input": txt, "output": ""})
            entries_to_add.append({"instruction": txt, "input": heading, "output": ""})

        if input_lines:
            inp = ", ".join(input_lines)
            entries_to_add.append({"instruction": heading, "input": inp, "output": ""})
            entries_to_add.append({"instruction": inp, "input": heading, "output": ""})

        if subheadings_names and not output_lines and not input_lines:
            subs_text = ", ".join(subheadings_names)
            entries_to_add.append({"instruction": heading, "input": subs_text, "output": ""})
            entries_to_add.append({"instruction": subs_text, "input": heading, "output": ""})

        for entry in entries_to_add:
            all_data.append(entry)
            word_count = len(entry["instruction"].split()) + len(entry["input"].split())
            if word_count > max_words_in_file:
                max_words_in_file = word_count

    if all_data:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            for entry in all_data:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return len(all_data), max_words_in_file