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