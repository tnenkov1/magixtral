import os
import json
import re
import glob
from datetime import datetime
from tqdm import tqdm

INPUT_FOLDER = "jsonl_files"
OUTPUT_FOLDER = "jsonl_merged_files"
MODEL_NAME = "cognitive_package"

PATTERN = ['L','U','W','U','W','L','W','U','L']


def json_load(line):

    line = line.replace("\u0000","").strip()

    if "'" in line and '"' not in line:
        line = re.sub(r"'",'"',line)

    if line and not line.endswith("}"):
        line += "}"

    try:
        return json.loads(line)
    except:
        return None


def ift_record(data):

    instruction = data.get("instruction","")
    input_text = data.get("input","")
    output = data.get("output","")

    if not instruction and "prompt" in data:
        instruction = data["prompt"]

    if not output and "completion" in data:
        output = data["completion"]

    instruction = str(instruction).strip()
    input_text = str(input_text).strip()
    output = str(output).strip()

    if not instruction and not input_text and not output:
        return None

    return {
        "instruction":instruction,
        "input":input_text,
        "output":output
    }


def load_records(files):

    records = []

    for file in files:

        with open(file,"r",encoding="utf-8") as f:

            for line in f:

                line=line.strip()

                if not line:
                    continue

                try:
                    data=json.loads(line)
                except:
                    data=json_load(line)

                if not data:
                    continue

                rec=ift_record(data)

                if rec:
                    records.append(rec)

    return records


def process():

    base=os.path.dirname(os.path.abspath(__file__))

    root=os.path.join(base,INPUT_FOLDER)
    out=os.path.join(base,OUTPUT_FOLDER)

    os.makedirs(out,exist_ok=True)

    # Дефинираме пътищата до трите папки
    l_dir = os.path.join(root, "L")
    u_dir = os.path.join(root, "U")
    w_dir = os.path.join(root, "W")

    # Търсим jsonl файлове директно във всяка папка
    L_files = glob.glob(os.path.join(l_dir, "**/*.jsonl"), recursive=True)
    U_files = glob.glob(os.path.join(u_dir, "**/*.jsonl"), recursive=True)
    W_files = glob.glob(os.path.join(w_dir, "**/*.jsonl"), recursive=True)

    if not (L_files or U_files or W_files):
        print("No jsonl files found in L, U, or W folders")
        return

    print("Files found:")
    print("L:",len(L_files))
    print("U:",len(U_files))
    print("W:",len(W_files))

    print("Loading datasets...")

    L_records=load_records(L_files)
    U_records=load_records(U_files)
    W_records=load_records(W_files)

    print("Records:")
    print("L:",len(L_records))
    print("U:",len(U_records))
    print("W:",len(W_records))

    datasets={
        "L":L_records,
        "U":U_records,
        "W":W_records
    }

    timestamp=datetime.now().strftime("%Y_%m_%d_%H_%M_%S")

    output_path=os.path.join(
        out,
        f"{MODEL_NAME}_{timestamp}_merged.jsonl"
    )

    first=True
    written=0

    total = sum(len(datasets[p]) for p in PATTERN)

    with open(output_path,"w",encoding="utf-8") as outfile:

        with tqdm(total=total,desc="Writing",unit="records") as pbar:

            for step in PATTERN:

                dataset=datasets[step]

                for rec in dataset:

                    line=json.dumps(rec,ensure_ascii=False)

                    if first:
                        outfile.write(line)
                        first=False
                    else:
                        outfile.write("\n"+line)

                    written+=1
                    pbar.update(1)

    print("\n"+"="*40)
    print("FINAL STATS")
    print("Written:",written)
    print("="*40)


if __name__=="__main__":

    if os.name=="nt":
        os.system("color 0B")

    process()