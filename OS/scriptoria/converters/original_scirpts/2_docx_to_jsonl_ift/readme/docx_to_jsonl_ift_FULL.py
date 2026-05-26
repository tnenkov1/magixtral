import os
import json
import re
from datetime import datetime
from docx import Document
from tqdm import tqdm

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(BASE_DIR, "docx_files")
OUTPUT_BASE_DIR = os.path.join(BASE_DIR, "jsonl_files")

def clean_heading(text: str) -> str:
    """Removes numbering (e.g. 1.1) and extra spaces."""
    return re.sub(r"^\s*[\d\.]+\s*", "", text).strip()

def get_marked_content(text: str):
    """Checks for markers (//, *, -, •, —) and extracts clean text."""
    cleaned = text.strip()
    match = re.match(r"^(\/\/|\*|\-|•|—)\s*(.*)", cleaned)
    if match:
        return True, match.group(2).strip()
    return False, cleaned
    
def get_heading_level(paragraph) -> int:
    """Returns the heading level (1-9). Defaults to 9 if not a heading."""
    try:
        # Check style name first (e.g., 'Heading 1')
        style_name = paragraph.style.name.lower()
        match = re.search(r'\d+', style_name)
        if match:
            return int(match.group())
        
        # Check outline level as fallback
        level = paragraph.paragraph_format.outline_level
        if level is not None and level < 9:
            return level + 1
    except:
        pass
    return 9

def is_heading(paragraph) -> bool:
    """Detects headings level 1-9."""
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

def main():
    if not os.path.exists(INPUT_DIR):
        os.makedirs(INPUT_DIR)
        print(f"📁 Folder '{INPUT_DIR}' created. Place your DOCX files there.")
        return

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_dir = os.path.join(OUTPUT_BASE_DIR, timestamp)
    
    files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(".docx")]
    
    if not files:
        print("⚠️ No DOCX files found for processing.")
        return

    print("\n" + "-" * 30)
    print(f"🚀 Processing {len(files)} files...")
    
    total_examples = 0
    global_max_words = 0

    for filename in tqdm(files, desc="Converting", unit="file"):
        in_p = os.path.join(INPUT_DIR, filename)
        out_p = os.path.join(output_dir, filename.replace(".docx", ".jsonl"))
        
        try:
            count, file_max = convert_docx_to_jsonl(in_p, out_p)
            total_examples += count
            if file_max > global_max_words:
                global_max_words = file_max
        except Exception as e:
            tqdm.write(f"⚠️ Error in '{filename}': {e}")

    print("-" * 30)
    print(f"📝 Total processed examples: {total_examples}")
    print(f"📏 Max words count in a single example: {global_max_words}")
    print(f"📂 Results saved in folder: jsonl_files")
    print("-" * 30)
    print("👋 Byee!")

if __name__ == "__main__":
    main()