def convert_docx_to_jsonl(input_path, output_path):
    doc = Document(input_path)
    data = []
    paragraphs = list(iter_paragraphs(doc))
    
    h_indices = [i for i, p in enumerate(paragraphs) if is_heading(p)]
    max_words_in_file = 0

    for idx, i in enumerate(h_indices):
        current_p = paragraphs[i]
        prompt_text = clean_heading(current_p.text)
        current_level = get_heading_level(current_p)
        
        if not prompt_text:
            continue

        boundary_idx = len(paragraphs)
        for next_h_idx in h_indices[idx + 1:]:
            if get_heading_level(paragraphs[next_h_idx]) <= current_level:
                boundary_idx = next_h_idx
                break
        
        next_any_h_idx = h_indices[idx + 1] if idx + 1 < len(h_indices) else len(paragraphs)
        
        content_lines = []
        for p in paragraphs[i+1:next_any_h_idx]:
            is_marked, cleaned_text = get_marked_content(p.text)
            if cleaned_text:
                content_lines.append(cleaned_text)
        
        completion_text = " ".join(content_lines).strip()
        
        if not completion_text:
            subheaders = []
            for next_h_idx in h_indices[idx + 1:]:
                if next_h_idx >= boundary_idx:
                    break
                subheaders.append(clean_heading(paragraphs[next_h_idx].text))
            
            if subheaders:
                completion_text = ", ".join(subheaders)

        if prompt_text and completion_text:
            entry = {
                "prompt": prompt_text,
                "completion": completion_text
            }
            data.append(entry)
            
            word_count = len(prompt_text.split()) + len(completion_text.split())
            if word_count > max_words_in_file:
                max_words_in_file = word_count

    if data:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            for entry in data:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return len(data), max_words_in_file