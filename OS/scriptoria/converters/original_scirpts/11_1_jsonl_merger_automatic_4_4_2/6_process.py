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