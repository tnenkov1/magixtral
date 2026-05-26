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
    """Removes leading numbering (e.g., '1.2. Test' -> 'Test')"""
    return re.sub(r"^\s*\d+(\.\d+)*\.\s*", "", text).strip()

def clean_prefix(text: str) -> str:
    """Removes leading markers (//, *, -)"""
    if text.startswith("//"):
        return text[2:].strip()
    elif text.startswith(("-", "*")):
        return text[1:].strip()
    return text

def iter_paragraphs(parent):
    """Iterates through paragraphs in the Word document"""
    if isinstance(parent, _Document):
        parent_elm = parent.element.body
    else:
        raise ValueError(f"Unsupported element: {type(parent)}")
    for child in parent_elm.iterchildren():
        if child.tag.endswith("p"):
            yield Paragraph(child, parent)

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

def main(input_dir, output_base_dir):
    if not os.path.exists(input_dir):
        os.makedirs(input_dir)
        return

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_dir = os.path.join(output_base_dir, timestamp)
    docx_files = [f for f in os.listdir(input_dir) if f.lower().endswith(".docx")]
    
    if not docx_files:
        return
    
    total_examples = 0
    global_max_words = 0

    print("\n" + "-" * 30)
    for filename in tqdm(docx_files, desc="🚀 Processing files"):
        in_p = os.path.join(input_dir, filename)
        out_p = os.path.join(output_dir, filename.replace(".docx", ".jsonl"))
        try:
            count, f_max = convert_docx_to_jsonl(in_p, out_p)
            total_examples += count
            if f_max > global_max_words:
                global_max_words = f_max
        except Exception as e:
            tqdm.write(f"⚠️ Error: {e}")

    print("-" * 30)
    print(f"📝 Total processed examples: {total_examples}")
    print(f"📏 Max words count in a single example: {global_max_words}")
    print(f"📂 Results saved in folder: jsonl_files")
    print("-" * 30)
    print("👋 Byee!")

if __name__ == "__main__":
    os.system('color 0B') 
    main(INPUT_DIR, OUTPUT_BASE_DIR)