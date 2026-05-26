Python script for converting .docx files into .jsonl dataset for Instruction Fine-tuning (IFT-learn).

-The .docx file must contain headings, normal text and marked text with "//, -, *" is optional.
-The .docx files must be placed into the folder "docx_files".

-In the .jsonl file:
For each heading from the .docx file, 4 examples + additional ones will be created. The examples are bidirectional.
Logic:
Example 1: 
{"instruction": "Heading", "input": "Normal text", "output": ""}
Example 2:
{"instruction": "Normal text", "input": "Heading", "output": ""}
Example 3: 
{"instruction": "Heading", "input": "Marked text (//, -, *)", "output": ""}
Example 4: 
{"instruction": "Marked text (//, -, *)", "input": "Heading", "output": ""}

Additional examples:If there is no text under a heading:
Example: {"instruction": "Heading", "input": "All connected subheadings", "output": ""}
Example: {"instruction": "All connected subheadings", "input": "Heading", "output": ""}
Output will be empty.

-If the heading starts with 1.; 1.1.; or 1.1.1., the numbers will be removed. Only the text is extracted.
-If the text starts with "//", "-" or "*", the symbols will be removed. Only the text is extracted.

-The .jsonl files will be saved into a folder in the folder "jsonl_files".

Marked text:
"//" = comments for the normal text
"-" = additional information for the normal text
"*" = definitions for words in the normal text