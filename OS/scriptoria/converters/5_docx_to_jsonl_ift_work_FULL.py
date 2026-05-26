import os
import json
import re
from docx import Document

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "docx_files"))
OUTPUT_BASE_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "jsonl_files", "W"))
os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_BASE_DIR, exist_ok=True)

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
    
    if re.search(r"(heading|заглавие|title|загл|h|header)\s*\d*", style_name):
        return True
        
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
            words = len(str(entry.values()).split())
            if words > max_words:
                max_words = words

    if data:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            for entry in data:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    
    return len(data), max_words

def main(input_dir, output_base_dir):
    print("Starting conversion to Work format...")
    
    if not os.path.exists(input_dir):
        raise FileNotFoundError(f"Input directory does not exist: {input_dir}")

    docx_files = [f for f in os.listdir(input_dir) if f.lower().endswith(".docx")]
    
    if not docx_files:
        raise FileNotFoundError(f"No .docx files found in: {input_dir}")
    
    print(f"Processing {len(docx_files)} files...")
    
    total_examples = 0
    global_max_words = 0

    for filename in docx_files:
        in_p = os.path.join(input_dir, filename)
        
        base_name = os.path.splitext(filename)[0]
        out_p = os.path.join(output_base_dir, f"{base_name}_WORK.jsonl")
        
        print(f"Processing: {filename} -> W/{os.path.basename(out_p)}")
        
        try:
            count, f_max = convert_docx_to_jsonl(in_p, out_p)
            total_examples += count
            if f_max > global_max_words:
                global_max_words = f_max
            print(f"Successfully generated {os.path.basename(out_p)} with {count} rows.")
        except Exception as e:
            raise RuntimeError(f"Error processing file {filename}: {str(e)}")

    print("-" * 30)
    print(f"Total processed examples: {total_examples}")
    print(f"Max words count in a single example: {global_max_words}")
    print("All files processed successfully.")

if __name__ == "__main__":
    main(INPUT_DIR, OUTPUT_BASE_DIR)