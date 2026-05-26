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

def get_marked_content(text: str):
    """Checks for markers (//, *, -, •, —) and removes them."""
    cleaned = text.strip()
    match = re.match(r"^(\/\/|\*|\-|•|—)\s*(.*)", cleaned)
    if match:
        return True, match.group(2).strip()
    return False, cleaned
 
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

def main(input_dir, output_base_dir):
    if not os.path.exists(input_dir):
        os.makedirs(input_dir)
        print(f"📁 Folder '{input_dir}' created. Please place DOCX files there.")
        return

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_dir = os.path.join(output_base_dir, timestamp)
    docx_files = [f for f in os.listdir(input_dir) if f.lower().endswith(".docx")]
    
    if not docx_files:
        print("❌ No DOCX files found for processing.")
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
            tqdm.write(f"⚠️ Error processing '{filename}': {e}")

    print("-" * 30)
    print(f"📝 Total processed examples: {total_examples}")
    print(f"📏 Max words count in a single example: {global_max_words}")
    print(f"📂 Results saved in folder: jsonl_files")
    print("-" * 30)
    print("👋 Byee!")

if __name__ == "__main__":
    os.system('color 0B') 
    main(INPUT_DIR, OUTPUT_BASE_DIR)