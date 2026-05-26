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