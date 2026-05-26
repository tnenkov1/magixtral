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