Python script for converting .docx files into .jsonl dataset for LM Fine-tuning.

-The .docx file must contain headings and normal text.
-The .docx files must be placed into the folder "docx_files".

-In the .jsonl file:
headings = prompt
normal text = completion

-If the heading starts with 1.; 1.1.; or 1.1.1., the numbers will be removed. Only the text is extracted.
-If the text starts with "//", "-" or "*", the symbols will be removed. Only the text is extracted.
-If there is no text under a heading, all the connected subheadings under the heading become completion.

-The .jsonl files will be saved into a folder in the folder "jsonl_files".