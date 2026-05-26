import os
import json
import re
import docx

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DOCX_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "docx_files"))
OUTPUT_JSONL_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "jsonl_files"))

os.makedirs(INPUT_DOCX_DIR, exist_ok=True)
os.makedirs(OUTPUT_JSONL_DIR, exist_ok=True)


def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'[\u200b\u200c\u200d\ufeff]', '', text)
    return " ".join(text.strip().split())


def process_docx_to_lmft(docx_path):
    doc = docx.Document(docx_path)
    dataset = []
    
    current_instruction = ""
    current_input = []
    current_output = []
    
    for para in doc.paragraphs:
        style_name = para.style.name.lower()
        text = clean_text(para.text)
        
        if not text:
            continue
            
        if "heading" in style_name or "title" in style_name:
            if current_instruction or current_input or current_output:
                prompt_content = current_instruction
                if current_input:
                    prompt_content += " " + " ".join(current_input)
                
                dataset.append({
                    "prompt": clean_text(prompt_content),
                    "completion": clean_text("\n".join(current_output))
                })
            
            current_instruction = text
            current_input = []
            current_output = []
            
        elif text.startswith("//") or text.startswith("*") or text.startswith("-"):
            cleaned_in = re.sub(r'^(\/\/|\*|-)\s*', '', text)
            if cleaned_in:
                current_input.append(cleaned_in)
                
        else:
            current_output.append(text)
            
    if current_instruction or current_input or current_output:
        prompt_content = current_instruction
        if current_input:
            prompt_content += " " + " ".join(current_input)
            
        dataset.append({
            "prompt": clean_text(prompt_content),
            "completion": clean_text("\n".join(current_output))
        })
        
    return dataset


def main():
    print("Starting conversion to LMFT format...")
    
    if not os.path.exists(INPUT_DOCX_DIR):
        raise FileNotFoundError(f"Input directory does not exist: {INPUT_DOCX_DIR}")

    docx_files = [f for f in os.listdir(INPUT_DOCX_DIR) if f.endswith('.docx')]
    
    if not docx_files:
        raise FileNotFoundError(f"No .docx files found in: {INPUT_DOCX_DIR}")

    for filename in docx_files:
        input_path = os.path.join(INPUT_DOCX_DIR, filename)
        
        base_name = os.path.splitext(filename)[0]
        output_filename = f"{base_name}_LMFT.jsonl"
        output_path = os.path.join(OUTPUT_JSONL_DIR, output_filename)
        
        print(f"Processing: {filename} -> {output_filename}")
        
        try:
            converted_data = process_docx_to_lmft(input_path)
            
            with open(output_path, "w", encoding="utf-8") as f:
                for row in converted_data:
                    f.write(json.dumps(row, ensure_ascii=False) + "\n")
                    
            print(f"Successfully generated: {output_filename} ({len(converted_data)} rows)")
            
        except Exception as e:
            raise RuntimeError(f"Error processing file {filename}: {str(e)}")

    print("All files processed successfully.")


if __name__ == "__main__":
    main()