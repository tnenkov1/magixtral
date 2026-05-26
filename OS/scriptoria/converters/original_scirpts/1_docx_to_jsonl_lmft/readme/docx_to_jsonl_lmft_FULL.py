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
    """Removes numbering (e.g., 1.1) and extra whitespace."""
    return re.sub(r"^\s*[\d\.]+\s*", "", text).strip()

def get_marked_content(text: str):
    """Checks for markers (//, *, -, •, —) and extracts clean text."""
    cleaned = text.strip()
    match = re.match(r"^(\/\/|\*|\-|•|—)\s*(.*)", cleaned)
    if match:
        return True, match.group(2).strip()
    return False, cleaned

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

def iter_paragraphs(parent):
    """Iterates through paragraphs in the document body."""
    if isinstance(parent, _Document):
        parent_elm = parent.element.body
    else:
        raise ValueError(f"Unsupported element type: {type(parent)}")
    for child in parent_elm.iterchildren():
        if child.tag.endswith('p'):
            yield Paragraph(child, parent)

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

def main(input_dir, output_base_dir):
    if not os.path.exists(input_dir):
        os.makedirs(input_dir)
        print(f"📁 Directory created: {input_dir}. Please add DOCX files.")
        return

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_dir = os.path.join(output_base_dir, timestamp)
    docx_files = [f for f in os.listdir(input_dir) if f.lower().endswith(".docx")]

    if not docx_files:
        print("⚠️ No DOCX files found for processing.")
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
            tqdm.write(f"⚠️ Error in {filename}: {e}")

    print("-" * 30)
    print(f"📝 Total processed examples: {total_examples}")
    print(f"📏 Max words count in a single example: {global_max_words}")
    print(f"📂 Results saved in folder: jsonl_files")
    print("-" * 30)
    print("👋 Byee!")

if __name__ == "__main__":
    main(INPUT_DIR, OUTPUT_BASE_DIR)