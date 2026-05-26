
//   Copyright (c) 2026 Teodor Nenkov

//   Licensed under the PolyForm Noncommercial License 1.0.0.
//   Commercial use requires a separate license.

//   See LICENSE for details.

//   Europe, Bulgaria

let datasetRows = [];
let docxFiles = []; 
let jsonlFiles = [];

let currentPage = 1;
const rowsPerPage = 50; 

let isTyping = false;
let typingTimer;

// Generates a unique identifier string based on the current timestamp and a random number
function generateId() {
    return 'row_' + Date.now() + Math.floor(Math.random() * 1000);
}

// Creates and returns a debounced version of a function that delays its execution by a specified timeout
function debounce(func, timeout = 1000) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

document.addEventListener("input", (e) => {
    if (e.target.tagName === 'TEXTAREA') {
        isTyping = true;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => { isTyping = false; }, 2000);
    }
});

// API INTEGRATION (Concrete Auto-save - 2 seconds)
let datasetSaveTimer = null;
let notesSaveTimer = null;

// Asynchronously saves the current dataset rows to the server via an API call
window.saveDataset = async function() {
    console.log("Saving dataset...");
    try {
        const response = await fetch('/api/dataset/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: datasetRows })
        });
        if (response.ok) {
            console.log("Dataset saved successfully!");
        } else {
            console.error("The server returned an error while writing the Dataset.");
        }
    } catch (err) { console.error("Network error while writing Dataset:", err); }
};

// Retrieves the notes editor textarea in order to save the notes data
window.saveNotes = async function() {
    let notesEditor = document.getElementById('notes-editor');
    if (!notesEditor) {
        notesEditor = document.querySelector('textarea[placeholder*="notes here"]');
    }
    
    if (!notesEditor) {
        console.error("Error: Notes field not found in HTML structure.");
        return;
    }
    
    console.log("Send notes for recording...");
    try {
        const response = await fetch('/api/notes/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: notesEditor.value })
        });
        if (response.ok) {
            console.log("Notes saved successfully to notes.json!");
        } else {
            console.error("The server returned an error while writing to Notes.");
        }
    } catch (err) { console.error("Network error while writing Notes:", err); }
};

// Triggers the dataset saving process with a 2-second delay acting as an auto-save mechanism
window.triggerDatasetSave = function() {
    clearTimeout(datasetSaveTimer); 
    datasetSaveTimer = setTimeout(() => {
        window.saveDataset(); 
    }, 2000);
};

// Triggers the notes saving process with a 2-second delay acting as an auto-save mechanism
window.triggerNotesSave = function() {
    clearTimeout(notesSaveTimer); 
    notesSaveTimer = setTimeout(() => {
        window.saveNotes(); 
    }, 2000);
};

// Updates a specific field of a dataset row with the textarea's value, resizes the textarea, and triggers an auto-save
window.updateRowContent = function(id, field, textarea) {
    const row = datasetRows.find(r => r.id === id);
    if (row) {
        row[field] = textarea.value;
        window.triggerDatasetSave(); 
    }
    autoResize(textarea);
};

// INITIALIZATION
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const dsRes = await fetch('/api/dataset/load');
        if (dsRes.ok) datasetRows = (await dsRes.json()).rows || [];
    } catch (e) { console.error("Error loading dataset:", e); }

    try {
        const notesRes = await fetch('/api/notes/load');
        const notesEditor = document.getElementById('notes-editor');
        
        if (notesEditor) {
            if (notesRes.ok) {
                notesEditor.value = (await notesRes.json()).content || "";
            }
            
            notesEditor.addEventListener('input', window.triggerNotesSave); 
            notesEditor.addEventListener('blur', window.saveNotes);    
        }
    } catch (e) { console.error("Error loading notes:", e); }

    renderDatasetGrid();
    await loadFileList();
});

// Asynchronously fetches the list of available DOCX files from the server's file system
async function loadFileList() {
    try {
        const response = await fetch('/api/fs/list?path=scriptoria/converters/docx_files');
        if (response.ok) {
            const data = await response.json();
            docxFiles = (data || []).map(f => f.name).filter(n => n.endsWith('.docx'));
        }
    } catch(e) { 
        console.error("Error loading DOCX list:", e); 
    }

    try {
        const resJsonl = await fetch('/api/jsonl/list-all');
        if (resJsonl.ok) {
            const filesObj = await resJsonl.json();
            jsonlFiles = (filesObj || []).map(f => f.name);
        }
    } catch(e) { 
        console.error("Error loading JSONL list:", e); 
    }

    renderLists();
}

// Adds a new empty row to the dataset at a specified index or at the end, then re-renders the grid and saves the data
window.addRow = function(insertIndex = null) {
    const newRow = { id: generateId(), instruction: "", input: "", output: "" };
    if (insertIndex !== null) {
        datasetRows.splice(insertIndex, 0, newRow);
    } else {
        datasetRows.push(newRow);
    }
    renderDatasetGrid();
    window.saveDataset();
};

// Deletes a specific row from the dataset by its ID and ensures at least one empty row remains if the dataset becomes empty
window.deleteRow = function(id) {
    const globalIndex = datasetRows.findIndex(row => row.id === id);
    datasetRows = datasetRows.filter(row => row.id !== id);
    if (datasetRows.length === 0) {
        datasetRows.push({ id: generateId(), instruction: "", input: "", output: "" });
    }
    
    const maxPage = Math.ceil(datasetRows.length / rowsPerPage);
    if (currentPage > maxPage) currentPage = maxPage || 1;

    renderDatasetGrid();
    window.saveDataset();
};

// Clears all dataset rows or specific targeted fields after user confirmation, and updates the server if all data is cleared
window.clearData = async function(target) {
    if (target === 'all') {
        if (confirm("Are you sure you want to clear ALL data?")) {
            datasetRows = [{ id: generateId(), instruction: "", input: "", output: "" }];
            currentPage = 1;
            await fetch('/api/dataset/clear', { method: 'POST' });
        }
    } else {
        if (confirm(`Are you sure you want to clear all ${target} data?`)) {
            datasetRows.forEach(row => row[target] = "");
        }
    }
    const clearMenu = document.getElementById('clearMenu');
    if (clearMenu) clearMenu.classList.add('hidden');
    
    renderDatasetGrid();
    window.saveDataset();
};

// Automatically adjusts the height of a textarea element to fit its scrollable content
function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

// Handles dataset pagination by navigating to the next or previous page and scrolling the container to the top
window.changePage = function(direction) {
    const maxPage = Math.ceil(datasetRows.length / rowsPerPage);
    if (direction === 'next' && currentPage < maxPage) {
        currentPage++;
    } else if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    }
    renderDatasetGrid();
    const scrollContainer = document.getElementById('editor-scroll-container');
    if (scrollContainer) scrollContainer.scrollTop = 0;
};

// Renders the dataset grid interface inside the designated editor container
window.renderDatasetGrid = function() {
    const container = document.getElementById('editor-grid');
    if (!container) return;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedRows = datasetRows.slice(startIndex, endIndex);
    const maxPage = Math.ceil(datasetRows.length / rowsPerPage) || 1;

    let htmlContent = `
        <div class="col-span-3 h-6 flex justify-center items-center opacity-0 hover:opacity-100 transition-all duration-300 cursor-pointer group/add z-0" onclick="addRow(${startIndex})">
            <div class="w-full h-full border border-dashed border-[#D4A373]/40 bg-[#D4A373]/5 rounded flex items-center justify-center shadow-[0_0_10px_rgba(212,163,115,0.05)] group-hover/add:border-[#D4A373]/80 group-hover/add:bg-[#D4A373]/15 transition-all">
                <span class="text-[12px] font-mono font-bold text-[#D4A373] uppercase tracking-widest "><i class="fa-solid fa-plus mr-2"></i> Add Row</span>
            </div>
        </div>
    `;

    htmlContent += paginatedRows.map((row, localIndex) => {
        const globalIndex = startIndex + localIndex;
        return `
        <div class="col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-x-8 mb-2 relative group px-6" data-id="${row.id}">
            
            <div class="absolute -left-6 md:-left-7 w-8 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                <span class="text-[11px] font-mono font-bold text-[#FAD5A5] drop-shadow-sm">${globalIndex + 1}</span>
                <button onclick="deleteRow('${row.id}')" class="text-[#BCA59A] hover:text-[#ff5555] transition-colors drop-shadow-md flex items-center justify-center" title="Delete Row">
                    <i class="fa-solid fa-trash text-[12px]"></i>
                </button>
            </div>

            <div class="editable-cell bg-panel/40 border border-[#D4A373]/20 rounded-lg shadow-[0_0_15px_rgba(212,163,115,0.08)] flex">
                <textarea spellcheck="false" class="w-full p-2 bg-transparent outline-none resize-none font-mono text-[12px] leading-relaxed text-[#FFFFFF] placeholder-[#D4A373]/30 h-full min-h-[42px]" oninput="updateRowContent('${row.id}', 'instruction', this)" onblur="window.saveDataset()" placeholder="Instruction...">${row.instruction}</textarea>
            </div>

            <div class="editable-cell bg-panel/40 border border-[#D4A373]/20 rounded-lg shadow-[0_0_15px_rgba(212,163,115,0.08)] flex">
                <textarea spellcheck="false" class="w-full p-2 bg-transparent outline-none resize-none font-mono text-[12px] leading-relaxed text-[#FFFFFF] placeholder-[#D4A373]/30 h-full min-h-[42px]" oninput="updateRowContent('${row.id}', 'input', this)" onblur="window.saveDataset()" placeholder="Input...">${row.input}</textarea>
            </div>

            <div class="editable-cell bg-panel/40 border border-[#D4A373]/20 rounded-lg shadow-[0_0_15px_rgba(212,163,115,0.08)] flex">
                <textarea spellcheck="false" class="w-full p-2 bg-transparent outline-none resize-none font-mono text-[12px] leading-relaxed text-[#FFFFFF] placeholder-[#D4A373]/30 h-full min-h-[42px]" oninput="updateRowContent('${row.id}', 'output', this)" onblur="window.saveDataset()" placeholder="Output...">${row.output}</textarea>
            </div>
        </div>

        <div class="col-span-3 h-2 flex justify-center items-center opacity-0 hover:opacity-100 transition-all duration-300 cursor-pointer group/add z-0" onclick="addRow(${globalIndex + 1})">
            <div class="w-full h-full border border-dashed border-[#D4A373]/40 bg-[#D4A373]/5 rounded flex items-center justify-center shadow-[0_0_10px_rgba(212,163,115,0.05)] group-hover/add:border-[#D4A373]/80 group-hover/add:bg-[#D4A373]/15 transition-all">
                <span class="text-[11px] font-mono font-bold text-[#D4A373] uppercase tracking-widest"><i class="fa-solid fa-plus mr-2"></i> Add Row</span>
            </div>
        </div>
        `;
    }).join('');

    htmlContent += `
        <div class="col-span-3 flex items-center justify-center gap-6 mt-4 p-2 bg-panel/30 border border-[#D4A373]/10 rounded-md font-mono text-xs">
            <button class="btn-secondary !py-1 !px-3" onclick="changePage('prev')" ${currentPage === 1 ? 'disabled style="opacity: 0.3; cursor: default;"' : ''}>
                <i class="fa-solid fa-chevron-left mr-1"></i> Prev
            </button>
            
            <div class="flex items-center gap-2 text-gold tracking-widest">
                PAGE 
                <input type="number" min="1" max="${maxPage}" value="${currentPage}" 
                       onkeydown="if(event.key === 'Enter') jumpToPage(this.value, ${maxPage})" 
                       class="w-12 h-6 text-center bg-transparent border border-[#D4A373]/30 hover:border-[#D4A373]/70 focus:border-[#D4A373] outline-none rounded text-bright-glow hide-arrows"> 
                / ${maxPage} 
                <span class="opacity-50 ml-2">(${datasetRows.length} Total Rows)</span>
            </div>

            <button class="btn-secondary !py-1 !px-3" onclick="changePage('next')" ${currentPage === maxPage ? 'disabled style="opacity: 0.3; cursor: default;"' : ''}>
                Next <i class="fa-solid fa-chevron-right ml-1"></i>
            </button>
        </div>
    `;

    container.innerHTML = htmlContent;
    container.querySelectorAll('textarea').forEach(autoResize);
};

// Creates a hidden file input element to allow the user to import JSONL or DOCX files
window.triggerMainImport = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jsonl, .docx';
    
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const res = await fetch('/api/dataset/import-file', { 
                method: 'POST', 
                body: formData 
            });
            
            const data = res.ok ? await res.json() : null;
            
            if (data && data.status === 'success' && data.rows && data.rows.length > 0) {
                currentPage = 1; 
                
                datasetRows = data.rows.map(r => ({
                    id: generateId(),
                    instruction: r.instruction || "",
                    input: r.input || "",
                    output: r.output || ""
                }));
                
                renderDatasetGrid();
                await loadFileList(); 
                
                console.log("File imported and dataset updated successfully.");
            } else {
                alert("Import failed: No rows data received.");
            }
        } catch(err) { 
            console.error("Import error:", err);
            alert("An error occurred while importing the file.");
        }
    };
    input.click();
};

// Retrieves the HTML containers to render the lists of uploaded DOCX and JSONL files
window.renderLists = function() {
    const docxContainer = document.getElementById('docx-list');
    const jsonlContainer = document.getElementById('jsonl-list');
    
    if(docxContainer) docxContainer.innerHTML = docxFiles.map((f, i) => createListItemHTML(f, i, 'docx')).join('');
    if(jsonlContainer) jsonlContainer.innerHTML = jsonlFiles.map((f, i) => createListItemHTML(f, i, 'jsonl')).join('');
};

// Generates and returns the HTML structure for a file list item, including download or delete buttons based on the file type
function createListItemHTML(filename, index, type) {
    const isJsonl = type === 'jsonl';
    return `
        <div class="flex items-center justify-between px-3 py-2 hover:bg-[#D4A373]/15 border border-transparent hover:border-[#D4A373]/40 rounded-md transition-all group">
            <span class="text-[10px] font-mono text-[#D4A373] opacity-80 w-6">${index + 1}.</span>
            <span class="flex-1 text-xs font-mono text-bright-glow truncate">${filename}</span>
            <div class="flex gap-2">
                ${isJsonl ? `
                    <button class="btn-secondary !p-1 !text-[12px]" onclick="downloadFile('${filename}')" title="Download">
                        <i class="fa-solid fa-download"></i>
                    </button>
                ` : ''}
                <button class="btn-danger !p-1 !text-[12px] opacity-0 group-hover:opacity-100 transition-all" onclick="deleteFile('${type}', '${filename}')">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
    `;
}

// Opens a file selection dialog to allow the user to upload multiple DOCX or JSONL files
window.uploadDocx = async function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.docx, .jsonl';
    
    input.onchange = async e => {
        const files = e.target.files;
        if (files.length === 0) return;

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        try {
            const res = await fetch('/api/docx/upload', { 
                method: 'POST', 
                body: formData 
            });
            
            if (res.ok) {
                await loadFileList(); 
                renderLists();
            }
        } catch (err) {
            console.error("Error uploading files:", err);
            alert("Upload error.");
        }
    };
    input.click();
};

// Asynchronously deletes a specific DOCX or JSONL file from the server after user confirmation and updates the client-side file list
window.deleteFile = async function(type, filename) {
    if (confirm(`Are you sure you want to delete ${filename}?`)) {
        try {
            if (type === 'docx') {
                await fetch(`/api/docx/delete/${filename}`, { method: 'DELETE' });
                docxFiles = docxFiles.filter(f => f !== filename);
            } 
            else if (type === 'jsonl') {
                const res = await fetch(`/api/jsonl/delete/${filename}`, { method: 'DELETE' });
                if (res.ok) {
                    jsonlFiles = jsonlFiles.filter(f => f !== filename);
                    console.log(`File ${filename} removed successfully.`);
                } else {
                    const errData = await res.json();
                    alert(`Error: ${errData.detail}`);
                }
            }
            
            await loadFileList();
            
        } catch (error) {
            console.error("Error deleting file:", error);
            alert("Failed to connect to the server for deletion.");
        }
    }
};

// Initiates the download of a specific JSONL file from the server and handles potential missing file or connection errors
window.downloadFile = async function(filename) {
    try {
        const response = await fetch(`/api/jsonl/download/${filename}`);
        if (response.status === 404) {
            alert("Error: File not found or has been deleted.");
        } else if (response.ok) {
            window.location.href = `/api/jsonl/download/${filename}`;
        } else {
            alert("Error while trying to download.");
        }
    } catch (error) {
        console.error("Connection error:", error);
        alert("There was a problem connecting to the server.");
    }
};

// Initiates the download of an archive containing all converted JSONL files from the server
window.downloadAll = async function() {
    try {
        const response = await fetch('/api/jsonl/download-all');
        if (response.status === 404) {
            alert("No converted files available for download.");
        } else if (response.ok) {
            window.location.href = '/api/jsonl/download-all';
        } else {
            alert("Error downloading archive.");
        }
    } catch (error) {
        console.error("Connection error:", error);
        alert("There was a problem connecting to the server.");
    }
};

// Toggles the visibility of a specified dropdown menu element by its ID
window.toggleDropdown = function(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m.id !== menuId) m.classList.add('hidden');
    });
    
    menu.classList.toggle('hidden');
    
    const anyMenuOpen = !menu.classList.contains('hidden');
    const gridContainer = document.getElementById('editor-grid');
    
    if (gridContainer) {
        if (anyMenuOpen) {
            gridContainer.classList.add('menu-active');
        } else {
            gridContainer.classList.remove('menu-active');
        }
    }
};

// Prepares the export of the dataset into a selected target format based on a predefined format mapping
window.exportData = function(format) {
    const formatMap = {
        'LMFT': 'LMFT',
        'IFT': 'IFT',
        '4-4-2 IFT': '4-4-2 IFT',
        '4-L': '4-L',
        '4-U': '4-U',
        '2-W': '2-W'
    };
    
    const param = formatMap[format];
    if (param) {
        window.location.href = `/api/dataset/export/${encodeURIComponent(param)}`;
    }
    
    document.getElementById('exportMenu').classList.add('hidden');
};

// Initiates the document conversion process to a target format using a map of specific server scripts
window.convertDoc = async function(targetFormat, btnElement) {
    const scriptMap = {
        'LMFT': '1_docx_to_jsonl_lmft_FULL',
        'IFT': '2_docx_to_jsonl_ift_FULL',
        '4-L': '3_docx_to_jsonl_ift_learn_FULL',
        '4-U': '4_docx_to_jsonl_ift_understand_FULL',
        '2-W': '5_docx_to_jsonl_ift_work_FULL',
        '4-4-2 IFT': '7_run_jsonl_L_U_W_merger'
    };

    const scriptName = scriptMap[targetFormat];
    if (!scriptName) {
        alert("Error: Unknown conversion format!");
        return;
    }

    const originalHTML = btnElement.innerHTML;

    btnElement.disabled = true;
    btnElement.innerHTML = `
        <i class="fa-solid fa-circle-notch fa-spin mr-1.5 icon-convert text-[#fca5a5]"></i>
        <span class="full-txt">CONVERTING...</span>
        <span class="short-txt text-[#fca5a5]">...</span>
    `;

    try {
        const response = await fetch(`/api/convert/${scriptName}`, {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            await loadFileList(); 
            console.log("Conversion complete:", data.message);
            
            btnElement.innerHTML = `<i class="fa-solid fa-check mr-1.5 text-green-400"></i><span class="full-txt text-green-400">DONE</span><span class="short-txt text-green-400">OK</span>`;
            setTimeout(() => {
                btnElement.innerHTML = originalHTML;
                btnElement.disabled = false;
            }, 2000);

        } else {
            alert(`Conversion error: ${data.detail}`);
            btnElement.innerHTML = originalHTML;
            btnElement.disabled = false;
        }
    } catch (error) {
        console.error("Network error during conversion:", error);
        alert("A network error occurred while connecting to the server..");
        btnElement.innerHTML = originalHTML;
        btnElement.disabled = false;
    }
};

// CONVERSION PANEL TOGGLE VISIBILITY
let isConverterCollapsed = false;

// Toggles the visibility and collapsed state of the converter panel section in the user interface
window.toggleConverterPanel = function() {
    const converterSection = document.getElementById('converter-section');
    const contentWrapper = document.getElementById('converter-content-wrapper');
    const toggleIcon = document.getElementById('converter-toggle-icon');
    
    if (!converterSection || !contentWrapper || !toggleIcon) return;

    if (!isConverterCollapsed) {
        contentWrapper.style.opacity = '0';
        contentWrapper.style.pointerEvents = 'none';
        converterSection.style.height = '46px'; 
        toggleIcon.style.transform = 'rotate(180deg)';
        isConverterCollapsed = true;
    } else {
        contentWrapper.style.opacity = '1';
        contentWrapper.style.pointerEvents = 'auto';
        converterSection.style.height = '50vh';
        toggleIcon.style.transform = 'rotate(0deg)';
        isConverterCollapsed = false;
    }
};

// Navigates directly to a specified dataset page number, ensuring the input stays within valid lower and upper bounds
window.jumpToPage = function(pageStr, maxPage) {
    let p = parseInt(pageStr);
    if (isNaN(p)) return;
    if (p < 1) p = 1;
    if (p > maxPage) p = maxPage;
    
    currentPage = p;
    renderDatasetGrid();
    const scrollContainer = document.getElementById('editor-scroll-container');
    if (scrollContainer) scrollContainer.scrollTop = 0;
};

// Unhides the AI prompt generation overlay and sets focus on the instruction input field
window.openGeneratePrompt = function() {
    document.getElementById('generate-prompt-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('generate-instruction-input').focus(), 100);
};

// Hides the AI prompt generation overlay and clears its instruction input field
window.closeGeneratePrompt = function() {
    document.getElementById('generate-prompt-overlay').classList.add('hidden');
    document.getElementById('generate-instruction-input').value = '';
};

// Retrieves the prompt from the input field and executes the AI text generation process
window.executeGenerate = async function() {
    const inputField = document.getElementById('generate-instruction-input');
    const btn = document.getElementById('btn-execute-gen');
    const prompt = inputField.value.trim();
    
    if (!prompt) return;

    inputField.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i>Generating...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/dataset/generate-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success' && data.new_rows && data.new_rows.length > 0) {
                const mappedRows = data.new_rows.map(r => ({
                    id: generateId(),
                    instruction: r.instruction || "",
                    input: r.input || "",
                    output: r.output || ""
                }));
                
                datasetRows.push(...mappedRows);
                
                const maxPage = Math.ceil(datasetRows.length / rowsPerPage);
                currentPage = maxPage || 1;
                
                renderDatasetGrid();
                window.saveDataset();
                closeGeneratePrompt();
            } else {
                alert("The AI did not return a valid dataset structure.");
            }
        }
    } catch (e) {
        console.error("AI Generation Error:", e);
        alert("Error connecting to the AI backend.");
    } finally {
        inputField.disabled = false;
        btn.innerHTML = 'Generate Data';
        btn.disabled = false;
    }
};