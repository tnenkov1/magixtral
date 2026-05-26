Python script for converting .docx files into .jsonl dataset for Instruction Fine-tuning (IFT-work).

-The .docx file must contain headings, normal text and marked text with "//, -, *" is optional.
-The .docx files must be placed into the folder "docx_files".

-In the .jsonl file:
For each heading from the .docx file, 2 examples + 2 additional(optional) ones will be created. The examples are bidirectional.
Logic:
Example 1: 
{"instruction": "Heading", "input": "Normal text", "output": "Marked text"}
Example 2: 
{"instruction": "Heading", "input": "Marked text", "output": "Normal text"}
Example 3: 
{"instruction": "Normal text", "input": "Marked text", "output": "Heading"}
Example 4:
{"instruction": "Marked text", "input": "Normal text", "output": "Heading"}

-If there is no text under a heading, additional examples will not be generated.

(a = Instruction; b = Input; c = Output) 
(a = Heading; b = Normal text; c = Marked text)
1. a, b, c
2. a, c, b 
3. b, c, a
4. c, b, a

-If the heading starts with 1.; 1.1.; or 1.1.1., the numbers will be removed. Only the text is extracted.
-If the text starts with "//", "-" or "*", the symbols will be removed. Only the text is extracted.

-The .jsonl files will be saved into a folder in the folder "jsonl_files".

Marked text:
"//" = comments for the normal text
"-" = additional information for the normal text
"*" = definitions for words in the normal text