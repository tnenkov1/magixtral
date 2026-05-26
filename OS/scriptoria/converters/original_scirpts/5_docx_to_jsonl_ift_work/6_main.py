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