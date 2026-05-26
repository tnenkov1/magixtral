import os
import json
import re
from datetime import datetime
from docx import Document
from docx.document import Document as _Document
from docx.text.paragraph import Paragraph
from tqdm import tqdm

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(BASE_DIR, "docx_files")
OUTPUT_BASE_DIR = os.path.join(BASE_DIR, "jsonl_files")

def clean_heading(text: str) -> str:
    return re.sub(r"^\s*\d+(\.\d+)*\.\s*", "", text).strip()

def clean_prefix(text: str) -> str:
    if text.startswith("//"):
        return text[2:].strip()
    elif text.startswith(("-", "*")):
        return text[1:].strip()
    return text

def iter_paragraphs(parent):
    if isinstance(parent, _Document):
        parent_elm = parent.element.body
    else:
        raise ValueError(f"Unsupported element type: {type(parent)}")
    for child in parent_elm.iterchildren():
        if child.tag.endswith("p"):
            yield Paragraph(child, parent)

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

def main():
    if not os.path.exists(INPUT_DIR):
        os.makedirs(INPUT_DIR)
        print(f"📁 Directory created: {INPUT_DIR}. Please place your DOCX files there.")
        return

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_dir = os.path.join(OUTPUT_BASE_DIR, timestamp)
    
    files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(".docx")]
    
    if not files:
        print("❌ No DOCX files found for processing.")
        return

    total_examples = 0
    global_max_words = 0

    print("\n" + "-" * 30)

    for filename in tqdm(files, desc="🚀 Processing files", unit="file"):
        in_p = os.path.join(INPUT_DIR, filename)
        out_p = os.path.join(output_dir, filename.replace(".docx", ".jsonl"))
        
        try:
            count, file_max = convert_docx_to_jsonl(in_p, out_p)
            total_examples += count
            if file_max > global_max_words:
                global_max_words = file_max
        except Exception as e:
            tqdm.write(f"⚠️ Error processing {filename}: {str(e)}")

    print("-" * 30)
    print(f"📝 Total processed examples: {total_examples}")
    print(f"📏 Max words count in a single example: {global_max_words}")
    print(f"📂 Results saved in folder: jsonl_files")
    print("-" * 30)
    print("👋 Byee!")

if __name__ == "__main__":
    os.system('color 0B')
    main()

