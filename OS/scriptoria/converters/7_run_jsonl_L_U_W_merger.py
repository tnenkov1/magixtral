import os
import glob

FILES_TO_EXECUTE = [
    "3_docx_to_jsonl_ift_learn_FULL.py",
    "4_docx_to_jsonl_ift_understand_FULL.py",
    "5_docx_to_jsonl_ift_work_FULL.py",
    "6_jsonl_merger_automatic_4_4_2_FULL.py" 
]

def execute_py_files_in_memory(root_folder):
    """Combines all files into a single code block and executes it at once"""
    all_py_files = {os.path.basename(f): f for f in glob.glob(os.path.join(root_folder, "*.py"))}

    missing_files = []
    combined_code = ""

    for fname in FILES_TO_EXECUTE:
        if fname in all_py_files:
            with open(all_py_files[fname], "r", encoding="utf-8") as f:
                code = f.read()
                combined_code += f"\n# ----- {fname} -----\n" 
                combined_code += code + "\n"
        else:
            missing_files.append(fname)

    if missing_files:
        print("The following files were not found:")
        for f in missing_files:
            print(f"   - {f}")
        raise FileNotFoundError(f"Missing required pipeline files: {', '.join(missing_files)}")

    if not combined_code:
        print("No files available for execution.")
        return None

    global_namespace = {
        "__name__": "__main__",
        "__file__": os.path.join(root_folder, "__loader__.py"),
        "root_folder": root_folder
    }

    print("-" * 30)
    print("Executing all modules in RAM...")
    print("-" * 30)

    try:
        exec(combined_code, global_namespace)
        
    except Exception as e:
        print(f"Execution failed: {e}")
        raise RuntimeError(f"RAM Pipeline execution failed: {str(e)}")

    print("-" * 30)
    print("RAM Pipeline finished successfully.")
    return global_namespace

if __name__ == "__main__":
    root_folder = os.path.dirname(os.path.abspath(__file__))
    ns = execute_py_files_in_memory(root_folder)