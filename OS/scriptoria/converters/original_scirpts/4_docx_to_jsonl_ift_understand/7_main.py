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
