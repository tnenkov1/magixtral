import os
import glob
from tqdm import tqdm

# List of files to execute
FILES_TO_EXECUTE = [
     "1_imports.py",
     "2_config.py",
     "3_clean_headings.py",
     "4_clean_prefixes.py",
     "5_convert_docx_to_jsonl.py",
     "6_main.py"
]

def execute_py_files_in_memory(root_folder):
    """Combines all files into a single code block and executes it at once"""
    all_py_files = {os.path.basename(f): f for f in glob.glob(os.path.join(root_folder, "*.py"))}

    missing_files = []
    combined_code = ""

    # Read all files and collect them into a single string
    for fname in FILES_TO_EXECUTE:
        if fname in all_py_files:
            with open(all_py_files[fname], "r", encoding="utf-8") as f:
                code = f.read()
                combined_code += f"\n# ----- {fname} -----\n"  # debug marker
                combined_code += code + "\n"
        else:
            missing_files.append(fname)

    if missing_files:
        print("\n⚠️  The following files were not found:")
        for f in missing_files:
            print(f"   - {f}")

    if not combined_code:
        print("\n❌ No files available for execution.")
        return

    # Single global namespace for all executed code
    global_namespace = {
        "__name__": "__main__",
        "__file__": os.path.join(root_folder, "__loader__.py"),
        "root_folder": root_folder
    }

    print("\n" + "-" * 30)
    print("📌 Executing all modules in RAM...")
    print("-" * 30)

    # Progress bar based on the total size of the combined code
    total_size = len(combined_code.encode("utf-8"))
    with tqdm(total=total_size, unit="B", unit_scale=True, desc="🚀 Running") as pbar:
        try:
            exec(combined_code, global_namespace)
            pbar.update(total_size)
        except Exception as e:
            print(f"\n💥 Execution failed: {e}")
            return None

    print("-" * 30)
    return global_namespace


if __name__ == "__main__":
    root_folder = os.path.dirname(os.path.abspath(__file__))
    ns = execute_py_files_in_memory(root_folder)