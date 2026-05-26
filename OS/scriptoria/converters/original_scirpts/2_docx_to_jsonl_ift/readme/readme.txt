Python script for converting .docx files into .jsonl dataset for Instruction Fine-tuning (IFT).

-The .docx file must contain headings and normal text. (Marked text with "//, -, *" is optional).
-The .docx files must be placed into the folder "docx_files".

-In the .jsonl file:
headings = instruction
marked text = input
normal text = output

-If the heading starts with 1.; 1.1.; or 1.1.1., the numbers will be removed. Only the text is extracted.
-If the text starts with "//", "-" or "*", the symbols will be removed. Only the text is extracted.
-If there is no text under a heading, all the connected subheadings under the heading become output.

-The .jsonl files will be saved into a folder in the folder "jsonl_files".

Marked text:
"//" = comments for the normal text
"-" = additional information for the normal text
"*" = definitions for words in the normal text