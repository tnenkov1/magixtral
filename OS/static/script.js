
//   Copyright (c) 2026 Teodor Nenkov

//   Licensed under the PolyForm Noncommercial License 1.0.0.
//   Commercial use requires a separate license.

//   See LICENSE for details.

//   Europe, Bulgaria

let state = {
    mode: 4,       // 1=Fully Passive, 2=Partially Passive, 3=Fully Active, 4=Partially Active
    currentSessionFile: null,
    allSessions: [],
    tabs: [],
    activeTabId: null,
    configType: null,      
    selectedValues: [],
    selectedFiles: [],
    selectedLayers: [],
    combinedSessions: [],  // Linked Context
    webSearchEnabled: false,
    
    insight: false,
    temperature: 0.7,
    agentActive: false,
    lastAiResponse: ""
};

let abortController = null;
let animationFrameId = null; // For smooth resizing
let currentPollTimer = null;
let currentSessionLastModified = null;
let lastPolledFile = null;

//System workmodes:
const MODE_NAMES = { 
    1: "Fully Passive", 
    2: "Partially Passive", 
    3: "Fully Active", 
    4: "Partially Active" 
};

// Initializes the application by fetching options for models, personalities, and system configurations when the DOM loads.
document.addEventListener('DOMContentLoaded', () => {
    fetchOptions('ollama-models', 'sel-model', 'models');
    fetchOptions('config/personalities', 'sel-personality', 'items');
    fetchOptions('config/emotionalities', 'sel-emotion', 'items');
    fetchOptions('config/serper_keys', 'sel-serper', 'items');
    
    loadMultiSelect('config/values', 'values-list', 'items', 'selectedValues', 'values-display', true, 'value');
    loadMultiSelect('files', 'files-list', 'files', 'selectedFiles', 'files-display', true, 'file');
    loadCognitiveLayers();

    loadSessionList(false).then(() => {
        if (state.tabs.length === 0) {
            addNewTab(); 
        }
    });

    initTabSortable();

    updateTempDisplay(state.temperature);
    setStatus("SYSTEM READY");

    if (typeof updateKeyStatus === 'function') updateKeyStatus();
    updateWebSearchUI();

    const browserUrlInput = document.getElementById('browser-url');
    if (browserUrlInput) {
        browserUrlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                if (typeof navigateBrowser === 'function') navigateBrowser();
            }
        });
    }
});

// Activates the sidebar resizing mode when the user presses the mouse button on the resizer handle.
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');
let isResizing = false;

if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        sidebar.classList.remove('transition-all', 'duration-300');
        sidebar.style.transition = 'none';
        
        document.addEventListener('mousemove', resizeSidebar);
        document.addEventListener('mouseup', stopResizeSidebar);
        
        document.body.style.cursor = 'ew-resize';
        resizer.classList.add('bg-[#D4A373]');
        document.body.classList.add('select-none');
        document.getElementById('sidebar-content').style.pointerEvents = 'none'; 
    });
}

// Handles the dynamic resizing of the sidebar UI based on the user's mouse movement.
function resizeSidebar(e) {
    if (!isResizing) return;
    
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    animationFrameId = requestAnimationFrame(() => {
        let newWidth = e.clientX;
        if (newWidth < 250) newWidth = 250;
        if (newWidth > 600) newWidth = 600;
        
        sidebar.style.width = newWidth + 'px';
        sidebar.style.minWidth = '250px'; 
        
        document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        
        if (typeof isMaximized !== 'undefined' && isMaximized) {
            window.updateMaximizedBrowserSize(newWidth, true); 
        }
    });
}

// Stops the sidebar resizing process and cancels any pending animation frames.
function stopResizeSidebar() {
    isResizing = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    document.removeEventListener('mousemove', resizeSidebar);
    document.removeEventListener('mouseup', stopResizeSidebar);
    
    document.body.style.cursor = 'default';
    resizer.classList.remove('bg-[#D4A373]');
    document.body.classList.remove('select-none');
    document.getElementById('sidebar-content').style.pointerEvents = 'auto';

    setTimeout(() => {
        sidebar.style.transition = ''; 
        sidebar.classList.add('transition-all', 'duration-300');
    }, 50);
}

// Toggles the visibility and expanded/collapsed state of the main application sidebar.
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('sidebar-content');
    const branding = document.getElementById('main-branding');
    const status = document.getElementById('status-container');
    const icon = document.getElementById('collapse-icon');
    const win = document.getElementById('browser-window');
    
    const isCollapsed = sidebar.classList.contains('collapsed-mode');
    sidebar.classList.add('transition-all', 'duration-300');

    let targetSidebarWidth = 340; 

    if (!isCollapsed) {
        [content, branding, status].forEach(el => {
            if (el) {
                el.style.transition = 'none'; 
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
            }
        });

        sidebar.classList.add('collapsed-mode');
        sidebar.dataset.oldWidth = sidebar.style.width || '340px';
        targetSidebarWidth = 60;
        
        sidebar.style.minWidth = '60px'; 
        sidebar.style.width = targetSidebarWidth + 'px'; 
        
        document.documentElement.style.setProperty('--sidebar-width', targetSidebarWidth + 'px');
        
        if (icon) icon.classList.replace('fa-angles-left', 'fa-angles-right');

    } else {

        sidebar.classList.remove('collapsed-mode');
        targetSidebarWidth = parseInt(sidebar.dataset.oldWidth) || 340;
        
        sidebar.style.minWidth = '60px'; 
        sidebar.style.width = targetSidebarWidth + 'px';
        
        document.documentElement.style.setProperty('--sidebar-width', targetSidebarWidth + 'px');
        
        if (icon) icon.classList.replace('fa-angles-right', 'fa-angles-left');

        setTimeout(() => {
            if (!sidebar.classList.contains('collapsed-mode')) {
                sidebar.style.minWidth = '250px';
            }
        }, 300);

        setTimeout(() => {
            [content, branding, status].forEach(el => {
                if (el) {
                    el.style.transition = 'opacity 0.2s ease'; 
                    el.style.opacity = '1';
                    el.style.pointerEvents = 'auto';
                }
            });
        }, 200);
    }

    if (typeof isMaximized !== 'undefined' && isMaximized && win && !win.classList.contains('hidden')) {
        
        win.style.transition = 'none';
        
        win.style.right = '0px';
        win.style.width = 'auto';

        const startTime = performance.now();

        function syncBrowser() {
            const currentWidth = sidebar.getBoundingClientRect().width;
            
            win.style.left = currentWidth + 'px';

            if (performance.now() - startTime < 320) {
                requestAnimationFrame(syncBrowser);
            } else {
                win.style.left = targetSidebarWidth + 'px';
                
                if (typeof window.updateMaximizedBrowserSize === 'function') {
                    window.updateMaximizedBrowserSize(targetSidebarWidth, true);
                }
            }
        }
        requestAnimationFrame(syncBrowser);
    }
}

// Toggles the 'Insight' AGI mode and displays a status notification to the user.
function toggleInSight() {
    state.insight = document.getElementById('insight-toggle').checked;
    
    const agiCb = Array.from(document.querySelectorAll('#layers-list input')).find(cb => cb.value.toLowerCase().includes('agi'));
    if (agiCb) {
        agiCb.checked = state.insight;
        if (typeof syncSelectedLayersToState === 'function') syncSelectedLayersToState();
    }
    
    showToast(state.insight ? "INSIGHT: AGI MODE ON" : "INSIGHT: STANDARD AI");
}

// Updates the global temperature state value for the AI and refreshes its UI display.
function updateTemp(val) {
    state.temperature = parseFloat(val);
    updateTempDisplay(val);
}

// Updates the specific UI element that displays the current AI temperature value.
function updateTempDisplay(val) {
    document.getElementById('temp-value').innerText = val;
}

// Toggles the web search functionality state and updates the system based on the active Serper key.
function toggleWebSearch() {
    const keyDisplay = document.getElementById('serper-display');
    const selectedKeyName = keyDisplay ? keyDisplay.dataset.value : "";

    if (!selectedKeyName) {
        showToast("Please select or create an API Key first");
        const target = document.getElementById('serper-key-dropdown');
        if (target) target.classList.add('show');
        return;
    }

    state.webSearchEnabled = !state.webSearchEnabled;
    updateWebSearchUI();
}

// Updates the visual indicators, text, and button active states for the web search toggle.
function updateWebSearchUI() {
    const wrapper = document.getElementById('web-search-wrapper');
    const btn = document.getElementById('web-search-toggle-btn');
    const statusText = document.getElementById('web-status-text');
    const icon = btn ? btn.querySelector('i.fa-globe') : null;
    
    if (!wrapper || !btn || !statusText || !icon) return;
    
    if (state.webSearchEnabled) {
        wrapper.classList.remove('border-[#D4A373]/40', 'bg-[#FDFBF7]');
        wrapper.classList.add('active-web-glow');
        btn.classList.add('web-is-on');
        
        statusText.innerText = "Web On";
        icon.classList.add('animate-pulse');
    } else {
        wrapper.classList.remove('active-web-glow');
        btn.classList.remove('web-is-on');
        
        wrapper.classList.add('border-[#D4A373]/40', 'bg-[#FDFBF7]');
        
        statusText.innerText = "Web Off";
        icon.classList.remove('animate-pulse');
    }
}

// Updates the system mode status text displayed in the user interface.
function setStatus(msg) {
    const el = document.getElementById('mode-name-display');
    if(el) el.innerText = msg;
}

// Processes the user input, sends the message to the chat interface, and handles the AI response generation.
async function sendMessage() {
    const input = document.getElementById('user-input');
    const msg = input.value.trim();

    if (!msg || state.isGenerating) return;

    if (window.inlineEditingContext && window.inlineEditingContext.active) {
        await handleInlineAiGeneration(msg);
        return;
    }

    state.isGenerating = true; 
    if (typeof toggleMainActionBtn === 'function') toggleMainActionBtn(true);

    if (window.pendingRegenPair) {
        await window.deleteMsgPair(window.pendingRegenPair.pairId, window.pendingRegenPair.index, true, true);
        window.pendingRegenPair = null;
    }

    state.lastUserPrompt = msg;
    
    input.value = '';
    input.style.height = 'auto'; 

    if (msg) renderUserBubble(msg);
    updatePromptNavigator();

    document.querySelectorAll('.stop-indicator').forEach(el => {
        el.classList.remove('animate-pulse', 'text-red-600', 'text-[#C62828]');
        el.classList.add('text-gray-400');
        el.style.animation = 'none';
        el.innerText = "[STOPPED]";
    });

    if ((state.mode === 3 || state.mode === 4) && !state.currentSessionFile) {
        try {
            await createNewSession(false); 
        } catch (err) {
            console.error("Error creating session:", err);
            state.isGenerating = false;
            if (typeof toggleMainActionBtn === 'function') toggleMainActionBtn(false);
            return;
        }
    }

    let finalMessageToAI = msg;
    
    if (typeof getBrowserContextForAI === 'function') {
        const browserContext = getBrowserContextForAI();
        if (browserContext !== "") {
            finalMessageToAI += browserContext;
        }
    }

    try {
        await streamChat(finalMessageToAI, state.mode); 
    } catch (err) {
        console.error("Streaming error:", err);
        if (typeof showToast === 'function') showToast("Connection lost. Try again.", true);
        
        state.isGenerating = false;
        if (typeof toggleMainActionBtn === 'function') toggleMainActionBtn(false);
    }
}

// Initiates the visual pulsing animation for the web search container to indicate active searching.
function startWebSearchAnimation() {
    const container = document.getElementById('web-search-container');
    const dot = document.getElementById('key-status-dot');
    
    if (state.webSearchEnabled) {
        container.classList.add('is-searching');
        dot.classList.remove('dot-ready');
        dot.classList.add('dot-searching');
    }
}

// Handles the progressive streaming of the AI chat response and updates the chat UI incrementally.
async function streamChat(message) {
    const container = document.getElementById('chat-container');
    const appLogo = document.getElementById('app-logo');
    
    if (appLogo) appLogo.classList.add('magi-heartbeat-active');
    
    const activeTabContainer = document.querySelector('.tab-item.tab-active .icon-glow-container');
    if (activeTabContainer) {
        activeTabContainer.classList.add('generating-pulse');
    }

    setStatus(state.webSearchEnabled ? "SEARCHING..." : "THINKING...");

    let aiResponseSlot = container.querySelector('.message-pair-group:last-child .ai-response-slot');
    if (!aiResponseSlot) {
        aiResponseSlot = document.createElement('div');
        aiResponseSlot.className = "ai-response-slot flex justify-start w-full relative group/ai mt-3";
        container.appendChild(aiResponseSlot);
    }

    const aiBubble = document.createElement('div');
    aiBubble.className = "chat-bubble-ai w-full"; 
    
    const msgContent = document.createElement('div');
    msgContent.className = "msg-content w-full is-generating transition-all duration-300";
    
    aiBubble.appendChild(msgContent);
    aiResponseSlot.appendChild(aiBubble);
    container.scrollTop = container.scrollHeight;

    abortController = new AbortController();
    state.lastAiResponse = ""; 
    state.agentActive = true; 
    state.isGenerating = true;
    toggleMainActionBtn(true);

    const serperDisplay = document.getElementById('serper-display');
    const selectedKeyName = serperDisplay && serperDisplay.dataset.value ? serperDisplay.dataset.value : null;

    let renderScheduled = false;
    let lastRenderTime = 0;
    
    try {
        const res = await fetch('/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                message: message,
                browser_context: state.currentBrowserContext || "",
                mode: state.mode,
                session_file: state.currentSessionFile,
                combined_sessions: state.combinedSessions,
                model: document.getElementById('sel-model') ? document.getElementById('sel-model').value : "llama3",
                personality: document.getElementById('personality-display') ? (document.getElementById('personality-display').dataset.value || "") : "",
                emotion: document.getElementById('emotion-display') ? (document.getElementById('emotion-display').dataset.value || "") : "",
                values: state.selectedValues,
                selected_files: state.selectedFiles,
                web_search: state.webSearchEnabled,
                serper_key: selectedKeyName,
                insight: state.insight,
                temperature: state.temperature,
                system_layers: state.selectedLayers
            }),
            signal: abortController.signal 
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        setStatus("GENERATING...");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            state.lastAiResponse += chunk;

            const now = performance.now();

            if (!renderScheduled && (now - lastRenderTime > 30)) {
                renderScheduled = true;
                
                requestAnimationFrame(() => {
                    try {
                        let finalHtml = parseMarkdown(state.lastAiResponse);

                        if (state.lastAiResponse.includes("System: [InSight")) {
                            finalHtml = finalHtml.replace(
                                /System: \[InSight (.*?)\]/g, 
                                '<br><span class="text-xs text-[#8D6E63] font-mono italic block my-2 pl-2 border-l-2 border-[#D4A373]">$1</span>'
                            );
                        }

                        finalHtml = finalHtml.replace(/(>|^)([^<>\s]+[\s]*)$/, '$1<span class="reveal-text">$2</span>');
                        finalHtml = appendSmartCursor(finalHtml);

                        if (typeof morphdom !== 'undefined') {
                            morphdom(msgContent, `<div>${finalHtml}</div>`, { childrenOnly: true });
                        } else {
                            msgContent.innerHTML = finalHtml; 
                        }

                        msgContent.querySelectorAll('pre code').forEach(el => {
                            delete el.dataset.highlighted;
                            if (typeof hljs !== 'undefined') hljs.highlightElement(el);
                        });
                        
                        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                        if (isAtBottom) {
                            container.scrollTop = container.scrollHeight;
                        }
                    } catch (e) {
                        console.error("Render error:", e);
                    } finally {
                        lastRenderTime = performance.now();
                        renderScheduled = false;
                    }
                });
            }
        }

        loadSessionList(false);
        return true; 

    } catch (e) {
        if (e.name === 'AbortError') {
            state.wasAborted = true; 
        } else {
            state.lastAiResponse += "\nError: " + e;
        }
        return false; 

    } finally { 
        if (appLogo) appLogo.classList.remove('magi-heartbeat-active');
        if (activeTabContainer) activeTabContainer.classList.remove('generating-pulse');

        if (!state.agentActive) abortController = null;
        state.isGenerating = false;
        setStatus("READY");
        
        if (typeof toggleMainActionBtn === 'function') toggleMainActionBtn(false);

        const localAborted = state.wasAborted;

        let nextPromptText = "";
        if ((state.mode === 1 || state.mode === 3) && !localAborted) {
            if (state.lastAiResponse.includes("[NEXT_PROMPT]:")) {
                const parts = state.lastAiResponse.split("[NEXT_PROMPT]:");
                nextPromptText = parts[parts.length - 1].trim().split("\n")[0].trim();
                
                state.lastAiResponse = parts[0].trim();
            }
        }

        if (msgContent) {
            msgContent.classList.remove('is-generating');

            const finalCleanHtml = parseMarkdown(state.lastAiResponse);

            if (typeof morphdom !== 'undefined') {
                morphdom(msgContent, `<div>${finalCleanHtml}</div>`, { childrenOnly: true });
            } else {
                msgContent.innerHTML = finalCleanHtml;
            }

            if (state.wasAborted) {
                msgContent.insertAdjacentHTML('beforeend', "<span class='stop-indicator text-[#C62828] font-bold ml-2'>█ [STOPPED]</span>");
                state.wasAborted = false; 
            }

            container.scrollTop = container.scrollHeight; 

            setTimeout(() => {
                msgContent.querySelectorAll('pre code').forEach(el => {
                    if (typeof hljs !== 'undefined') {
                        delete el.dataset.highlighted;
                        hljs.highlightElement(el);
                    }
                });
            }, 50);
        }

        if (!state.currentSessionFile) {
            try {
                const res = await fetch('/api/sessions/latest');
                const data = await res.json();
                
                if (data && data.filename) {
                    state.currentSessionFile = data.filename;
                    window.currentSessionFile = data.filename;
                    
                    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
                    if (activeTab) activeTab.filename = state.currentSessionFile;
                    
                    setTimeout(() => {
                        if (typeof startPollingForChanges === 'function') {
                            startPollingForChanges(data.filename);
                        }
                    }, 500);
                }
            } catch(e) { 
                console.error("Outer session sync error", e); 
            }
        } else {
             setTimeout(() => {
                if (typeof startPollingForChanges === 'function') {
                    startPollingForChanges(state.currentSessionFile);
                }
            }, 500);
        }

        const hasAbortMarker = state.lastAiResponse.includes("[SYSTEM_ABORTED_BY_USER]");

        if ((state.mode === 1 || state.mode === 3) && !localAborted && !hasAbortMarker) {
            
            nextPromptText = nextPromptText.replace("[SYSTEM_ABORTED_BY_USER]", "").trim();

            if (!nextPromptText || nextPromptText.length < 5) {
                console.warn("⚠️ [NEXT_PROMPT] missing. Using fallback logic.");
                nextPromptText = `In-depth evolutionary analysis and concept expansion: ${state.lastUserPrompt}`;
            }

            await new Promise(resolve => setTimeout(resolve, 1500));

            if (!state.wasAborted) {
                console.log(`Starting a recursive iteration: ${nextPromptText}`);
                
                if (typeof renderUserBubble === 'function') {
                    renderUserBubble(nextPromptText);
                }
                
                if (container) container.scrollTop = container.scrollHeight;

                state.lastUserPrompt = nextPromptText;
                await streamChat(nextPromptText);
            }
        } else {
            console.log("🛑 [OS MAGI] The recursive chain is CATEGORICALLY broken. The cycle is dead.");
            state.isGenerating = false;
            if (typeof toggleMainActionBtn === 'function') toggleMainActionBtn(false);
        }
    } 
}

// Renders and updates the user interface incrementally as the AI generates text, applying markdown formatting.
function renderIncrementalUI(container, fullText) {
    const parts = fullText.split('```');
    
    while (container.children.length < parts.length) {
        const index = container.children.length;
        const newDiv = document.createElement('div');
        
        if (index % 2 === 0) {
            newDiv.className = "text-part inline";
            newDiv._charIndex = 0;
        } else {
            newDiv.className = "code-block-wrapper my-4 rounded-md overflow-hidden shadow-lg border border-[#8D6E63]";
            newDiv.innerHTML = `
                <div class="code-header flex justify-between items-center bg-[#2D241E] px-4 py-2 border-b border-[#4E342E]">
                    <span class="text-[#D4A373] text-xs font-bold uppercase font-mono">CODE</span>
                    <button class="copy-btn text-[#D4A373] border border-[#D4A373] px-2 py-0.5 rounded text-[10px]" onclick="copyToClipboard(this, true)">COPY</button>
                </div>
                <div class="code-content bg-[#1e1e1e] p-4 text-[#E0E0E0] font-mono text-sm overflow-x-auto">
                    <pre><code class="hljs"></code></pre>
                </div>
            `;
        }
        container.appendChild(newDiv);
    }

    for (let i = 0; i < parts.length; i++) {
        const block = container.children[i];
        const rawContent = parts[i];

        if (i % 2 === 0) {
            const lastIdx = block._charIndex || 0;
            if (rawContent.length > lastIdx) {
                const newText = rawContent.substring(lastIdx);
                for (let char of newText) {
                    const span = document.createElement('span');
                    span.className = "char-pop";
                    span.innerText = char;
                    block.appendChild(span);
                }
                block._charIndex = rawContent.length;
            }
        } else {
            const codeEl = block.querySelector('code');
            const lines = rawContent.split('\n');
            const lang = lines[0].trim();
            const code = lines.slice(1).join('\n');
            
            if (codeEl.textContent !== code) {
                codeEl.textContent = code;
                codeEl.className = `language-${lang || 'plaintext'} hljs`;
                if (typeof hljs !== 'undefined') {
                    hljs.highlightElement(codeEl);
                }
            }
        }
    }
}

// Stops the visual pulsing animation for the web search container.
function stopWebSearchAnimation() {
    const container = document.getElementById('web-search-container');
    const dot = document.getElementById('key-status-dot');
    
    container.classList.remove('is-searching');
    dot.classList.remove('dot-searching');
    updateKeyStatus(); 
}

// Aborts the current AI response generation process and stops the data stream.
function stopGeneration() {
    if (abortController) abortController.abort();
    
    if (typeof fmStopAiAction === 'function') {
        fmStopAiAction();
    }

    const input = document.getElementById('user-input');
    if (input && input.value.trim() === '' && state.lastUserPrompt) {
        input.value = state.lastUserPrompt;
        
        input.style.height = 'auto';
        setTimeout(() => {
            input.style.height = input.scrollHeight + 'px';
        }, 10);
    }
    
    state.agentActive = false;
    state.isGenerating = false; 
    state.wasAborted = true; 
    
    if (typeof toggleMainActionBtn === 'function') {
        toggleMainActionBtn(false);
    }
    
    if (input) input.focus();

    showToast(" Generation Stopped");
}

// Renders the user's input message as a visual bubble inside the chat container.
function renderUserBubble(text, msgIndex = Date.now()) {
    const container = document.getElementById('chat-container');
    const pairId = `pair-${msgIndex}`;

    const pairGroup = document.createElement('div');
    pairGroup.className = "message-pair-group w-full mb-8 flex flex-col group/pair";
    pairGroup.id = pairId;
    pairGroup.setAttribute('data-msg-index', msgIndex);

    pairGroup.innerHTML = `
        <div class="flex justify-end mb-2 w-full relative group/user">
            <div class="chat-bubble-user bg-[#FDFBF7] border border-[#D4A373]/40 text-[#3E2723] shadow-md rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%]">
                <div class="msg-content font-mono text-[13px]">${formatText(text)}</div>
            </div>
            
            <div class="absolute -bottom-6 right-2 opacity-0 group-hover/user:opacity-100 transition-opacity flex gap-2 text-[10px] font-bold text-[#D4A373] uppercase bg-[#FDFBF7] px-2 py-1 rounded border border-[#D4A373]/30 shadow-sm z-10">
                <button onclick="copyMsgText(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5">
                    <i class="fa-solid fa-copy"></i> Copy
                </button>
                <button onclick="editAndRegenUser(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5">
                    <i class="fa-solid fa-pen-to-square"></i> Edit & Regen
                </button>
                <button onclick="deleteMsgPair('${pairId}', ${msgIndex})" class="text-red-400 hover:text-red-600 active:scale-95 transition-all flex items-center gap-1.5">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
            </div>
        </div>
        
        <div class="ai-response-slot flex justify-start w-full relative group/ai mt-2">
            <div class="absolute -top-5 left-4 opacity-0 group-hover/ai:opacity-100 transition-opacity flex gap-2 text-[10px] font-bold text-[#D4A373] uppercase bg-[#FDFBF7] px-2 py-1 rounded border border-[#D4A373]/30 shadow-sm z-10">
                <button onclick="copyMsgText(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-copy"></i> Copy</button>
                <button onclick="enableManualEdit(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-pen"></i> Edit</button>
                <button onclick="retryAiResponse(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-rotate-right"></i> Retry</button>
                
                <button onclick="undoMessage(this)" class="undo-btn hidden hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5 border-l border-[#D4A373]/30 pl-2 ml-1"><i class="fa-solid fa-rotate-left"></i> Undo</button>
                <button onclick="redoMessage(this)" class="redo-btn hidden hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-rotate-right"></i> Redo</button>
            </div>
        </div>
    `;
    
    container.appendChild(pairGroup);
    container.scrollTop = container.scrollHeight;
    
    if (typeof updatePromptNavigator === 'function') updatePromptNavigator();
    
    return pairGroup.querySelector('.ai-response-slot');
}

// Fetches the list of saved chat sessions from the server and populates the sidebar UI.
async function loadSessionList(loadLatest = false) {
    try {
        const res = await fetch('/api/sessions');
        const data = await res.json();
        let sessions = data.sessions || [];
        
        sessions.sort((a, b) => {
            const idA = parseInt(a.id) || 0;
            const idB = parseInt(b.id) || 0;
            return idB - idA;
        });

        state.allSessions = sessions; 

        const container = document.getElementById('session-list-container');
        if (!container) return;
        
        if (sessions.length === 0) {
            container.innerHTML = `<div class="p-4 text-center text-xs text-gray-500 italic">No sessions found</div>`;
            if (loadLatest) createNewSession();
            return;
        }

        container.innerHTML = sessions.map(s => {
            const isActive = s.filename === state.currentSessionFile;
            
            return `
            <div class="session-item group flex items-center justify-between p-2 mb-1 rounded border-b border-[#D4A373]/10 transition-all cursor-default ${isActive ? 'active' : ''}" 
                 data-name="${s.name.toLowerCase()}">
            
                <div class="flex items-center gap-2 flex-1 min-w-0 mr-2 cursor-pointer" onclick="loadSession('${s.filename}')">
                    <span class="session-id-badge shrink-0 font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border border-[#D4A373]/30 shadow-sm">
                        #${s.id}
                    </span>
                    <span class="session-name-text font-bold text-[15px] truncate transition-colors">
                        ${s.name}
                    </span>
                </div>

                <div class="flex items-center shrink-0 gap-1" onclick="event.stopPropagation()">
                    <input type="checkbox" value="${s.filename}" 
                        onchange="toggleCombineSession(this, '${s.name}')"
                        class="w-4 h-4 accent-[#D4A373] cursor-pointer mr-1.5"
                        title="Combine Context"
                        ${state.combinedSessions.includes(s.filename) ? 'checked' : ''}>
                    
                    <button onclick="triggerRename('${s.filename}', '${s.name}')" 
                            class="session-action-btn w-7 h-7 flex items-center justify-center rounded transition-all shadow-sm" title="Rename">
                        <i class="fa-solid fa-pen text-[10px]"></i>
                    </button>

                    <button onclick="deleteSession(event, '${s.filename}')" 
                            class="w-7 h-7 flex items-center justify-center text-red-400 hover:text-white hover:bg-red-500 rounded transition-all ml-1 shadow-sm" title="Delete">
                        <i class="fa-solid fa-xmark text-sm"></i>
                    </button>
                </div>
            </div>
        `;
        }).join('');

        if (loadLatest && sessions.length > 0 && !state.currentSessionFile) {
            loadSession(sessions[0].filename);
        }
    } catch (e) { 
        console.error("Error loading list:", e); 
    }
}

// Creates a new, blank chat session on the server and optionally clears the current chat interface.
async function createNewSession(clearUI = true) { 
    
    if (window.currentSessionFile && window.currentSessionFile.startsWith('temp_passive_')) {
        const currentMode = (typeof state !== 'undefined') ? state.mode : 2;
        if (typeof clearSessionFromLayer === 'function') {
            clearSessionFromLayer(window.currentSessionFile, currentMode);
        }
    }

    try {
        const res = await fetch('/api/sessions/create', { method: 'POST' });
        if (!res.ok) throw new Error("Failed to create session on server");
        const data = await res.json();
        
        state.currentSessionFile = data.filename;
        state.combinedSessions = []; 
        window.currentSessionFile = data.filename;
        
        if (clearUI) {
            const chatContainer = document.getElementById('chat-container');
            if (chatContainer) chatContainer.innerHTML = '';
        }
        
        if (typeof loadSessionList === 'function') await loadSessionList(false);
        if (typeof renderHistoryDropdown === 'function') renderHistoryDropdown();

        if (state.activeTabId) {
            const activeTab = state.tabs.find(t => t.id === state.activeTabId);
            if (activeTab) {
                activeTab.filename = data.filename;
                activeTab.sessionName = data.name; 
            }
        }
        
        const nameInput = document.getElementById('session-name-input');
        if (nameInput) {
            if (state.mode === 1 || state.mode === 2) {
                nameInput.value = "Passive Mode";
            } else {
                nameInput.value = data.name; 
            }
        }
        
        if (clearUI) {
            showToast("Session Reset: " + data.name);
        }
        console.log("✅ Active session for browser:", window.currentSessionFile);
        
        if (typeof browserSocket !== 'undefined' && browserSocket && browserSocket.readyState === WebSocket.OPEN) {
        }
        
    } catch (e) { 
        console.error("Error Reset/Create:", e); 
        showToast("Error creating session", true);
    }
}

// Initiates the renaming process for the currently active chat session file.
async function renameActiveSession() {
    const nameInput = document.getElementById('session-name-input');
    if (!nameInput || !state.currentSessionFile) return;

    const newName = nameInput.value.trim();
    if (newName === "" || newName.toLowerCase() === "untitled") {
        showToast("Please enter a valid name", true);
        return;
    }

    try {
        const response = await fetch('/api/sessions/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: state.currentSessionFile,
                new_name: newName
            })
        });

        if (response.ok) {
            if (state.activeTabId) {
                const activeTab = state.tabs.find(t => t.id === state.activeTabId);
                if (activeTab) {
                    activeTab.sessionName = newName;
                }
            }

            if (typeof loadSessionList === 'function') {
                await loadSessionList(false); 
            }
            if (typeof renderHistoryDropdown === 'function') {
                renderHistoryDropdown();
            }

            nameInput.value = newName;
            
            showToast("Session renamed!");
        }
    } catch (e) {
        console.error("Rename error:", e);
        showToast("Error renaming session", true);
    }
}

// Creates and appends a new workspace tab to the user interface.
async function addNewTab() {
    let maxSpaceNum = 0;
    state.tabs.forEach(tab => {
        const sMatch = tab.name.match(/Portal (\d+)/);
        if (sMatch) maxSpaceNum = Math.max(maxSpaceNum, parseInt(sMatch[1], 10));
    });

    const newTabId = 'tab-' + Date.now();

    const newTab = {
        id: newTabId,
        name: `Portal ${maxSpaceNum + 1}`,
        filename: null, 
        settings: {
            mode: state.mode || 4,
            model: document.getElementById('sel-model')?.value || "llama3",
            personality: document.getElementById('sel-personality')?.value || "",
            emotion: document.getElementById('emotion-display')?.value || "",
            temp: document.getElementById('temp-slider')?.value || 0.7,
            insight: document.getElementById('insight-toggle')?.checked || false,
            values: [...state.selectedValues],
            files: [...state.selectedFiles]
        }
    };

    state.tabs.push(newTab);
    renderTabs();
    
    await switchTab(newTabId);

    const win = document.getElementById('browser-window');
    const bubble = document.getElementById('browser-bubble');
    const fmWin = document.getElementById('fm-window');
    const fmBubble = document.getElementById('fm-bubble');

    if (state.browserActive) {
        if (typeof minimizeBrowser === 'function') {
            minimizeBrowser();
        }
    } else {
        if (win) { win.style.display = 'none'; win.classList.add('hidden'); }
        if (bubble) { bubble.style.display = 'none'; bubble.classList.add('hidden'); }
    }

    if (state.fmActive) {
        if (typeof minimizeFileManager === 'function') {
            minimizeFileManager();
        }
    } else {
        if (fmWin) { fmWin.style.display = 'none'; fmWin.classList.add('hidden'); }
        if (fmBubble) { fmBubble.style.display = 'none'; fmBubble.classList.add('hidden'); }
    }

}

// Renders the list of active workspace tabs based on the current system state.
function renderTabs() {
    const container = document.getElementById('tabs-container');
    if (!container) return;

    const plusBtn = container.querySelector('button[onclick="addNewTab()"]');
    container.querySelectorAll('.tab-item').forEach(el => el.remove());
    
    state.tabs.forEach((tab) => {
        const isActive = state.activeTabId === tab.id;
        const tabEl = document.createElement('div');
        tabEl.className = `tab-item ${isActive ? 'tab-active' : ''}`;
        tabEl.id = tab.id; 

        tabEl.innerHTML = `
            <div class="flex items-center gap-2 pointer-events-none">
                <div class="icon-glow-container">
                    <img src="/static/tppointanchub-icon.png" class="space-tab-img w-9 h-9 object-contain">
                </div>
                <span class="truncate select-none ${isActive ? 'text-[#3E2723] font-bold' : 'text-[#8D6E63]'} text-[13px]">
                    ${tab.name || 'New Portal'}
                </span>
            </div>
            <div class="tab-close ml-3 text-xs opacity-40 hover:opacity-100 hover:text-red-600 transition-opacity cursor-pointer leading-none">✕</div>
        `;

        tabEl.querySelector('.tab-close').onclick = (e) => { e.stopPropagation(); closeTab(tab.id); };
        tabEl.onclick = () => switchTab(tab.id);

        if (plusBtn) container.insertBefore(tabEl, plusBtn);
        else container.appendChild(tabEl);
    });
}

// Initializes drag-and-drop sortable functionality for reorganizing the workspace tabs.
function initTabSortable() {
    const el = document.getElementById('tabs-container');
    if (!el) return;
    
    Sortable.create(el, {
        animation: 250,
        draggable: ".tab-item",
        filter: ".tab-close, button", 
        preventOnFilter: false,
        
        fallbackTolerance: 5, 
        
        ghostClass: "opacity-40",

        onStart: function(evt) {
            evt.item.style.width = evt.item.offsetWidth + "px";
        },
        
        onEnd: function (evt) {
            evt.item.style.width = '';
            
            updateTabsArrayOrder(); 
        },
    });
}

function updateTabsArrayOrder() {
    const container = document.getElementById('tabs-container');
    const domTabs = Array.from(container.querySelectorAll('.tab-item'));
    
    const newTabsArray = [];
    domTabs.forEach(domTab => {
        const tabObj = state.tabs.find(t => t.id === domTab.id);
        if (tabObj) newTabsArray.push(tabObj);
    });
    
    state.tabs = newTabsArray;
    console.log("New order:", state.tabs.map(t => t.name));
}

// Switches the active workspace view to the session associated with the specified tab ID.
async function switchTab(tabId) {
    if (state.activeTabId === tabId) return;

    if (state.activeTabId) {
        const oldTab = state.tabs.find(t => t.id === state.activeTabId);
        if (oldTab) {
            oldTab.settings = {
                mode: state.mode || 4,
                model: document.getElementById('sel-model')?.value || "llama3",
                personality: document.getElementById('personality-display')?.dataset.value || "",
                emotion: document.getElementById('emotion-display')?.dataset.value || "",
                temp: document.getElementById('temp-slider')?.value || 0.7,
                insight: document.getElementById('insight-toggle')?.checked || false,
                values: [...state.selectedValues],
                files: [...state.selectedFiles]
            };
            oldTab.filename = state.currentSessionFile;
        
            oldTab.selectedLayers = [...(state.selectedLayers || [])];

            const currentName = document.getElementById('session-name-input')?.value;
            if (currentName && currentName !== "Passive Mode" && currentName.toLowerCase() !== "untitled") {
                oldTab.sessionName = currentName; 
            }

            const oldInput = document.getElementById('user-input');
            oldTab.draftText = oldInput ? oldInput.value : ""; 
        }
    }

    const tab = state.tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    if (!tab.settings) tab.settings = { mode: 4, model: "llama3", personality: "", emotion: "", temp: 0.7, insight: false, values: [], files: [] };
    if (!tab.selectedLayers) tab.selectedLayers = [];

    state.activeTabId = tabId;
    state.currentSessionFile = tab.filename; 
    state.selectedValues = [...(tab.settings.values || [])];
    state.selectedFiles = [...(tab.settings.files || [])];

    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('tab-active'));
    const tabElement = document.getElementById(tabId);
    if (tabElement) tabElement.classList.add('tab-active');

    const selModel = document.getElementById('sel-model');
    if (selModel) selModel.value = tab.settings.model;
    const pDisplay = document.getElementById('personality-display');
    if (pDisplay) { pDisplay.innerText = tab.settings.personality || "Select persona..."; pDisplay.dataset.value = tab.settings.personality || ""; }
    const eDisplay = document.getElementById('emotion-display');
    if (eDisplay) { eDisplay.innerText = tab.settings.emotion || "Select emotion..."; eDisplay.dataset.value = tab.settings.emotion || ""; }
    const tSlider = document.getElementById('temp-slider');
    if (tSlider) tSlider.value = tab.settings.temp;
    if (typeof updateTemp === 'function') updateTemp(tab.settings.temp);
    const iToggle = document.getElementById('insight-toggle');
    if (iToggle) iToggle.checked = tab.settings.insight;
    
    state.selectedLayers = [...tab.selectedLayers];
    
    document.querySelectorAll('#layers-list input').forEach(cb => {
        cb.checked = state.selectedLayers.includes(cb.value);
    });
    
    if (typeof applyLayerConstraints === 'function') {
        applyLayerConstraints();
    }
    if (typeof updateLayersDisplay === 'function') updateLayersDisplay();
    if (typeof updateMultiSelectDisplays === 'function') updateMultiSelectDisplays();
    
    state.mode = null; 
    if (typeof setMode === 'function') setMode(tab.settings.mode);

    const container = document.getElementById('chat-container');
    const nameInput = document.getElementById('session-name-input');

    if (tab.filename) {
        await loadSession(tab.filename);
    } else {
        if (container) container.innerHTML = '';
        state.currentSessionFile = null; 
        
        tab.browserHistory = [];
        if (typeof renderHistoryDropdown === 'function') renderHistoryDropdown();
    }

    if (nameInput) {
        if (tab.settings.mode === 1 || tab.settings.mode === 2) {
            nameInput.value = "Passive Mode";
        } else if (tab.sessionName && tab.sessionName.toLowerCase() !== "untitled") {
            nameInput.value = tab.sessionName;
        } else if (tab.filename) {
            nameInput.value = tab.filename.replace('session_', 'Session #').replace('.json', '');
        } else {
            nameInput.value = "New Space";
        }
    }

    const inputField = document.getElementById('user-input');
    if (inputField) {
        inputField.value = tab.draftText || "";
        if (typeof autoResize === 'function') autoResize(inputField);
    }
}

// Closes the specified workspace tab and reverts to a fallback state if it is the last open tab.
function closeTab(tabId) {
    const tab = state.tabs.find(t => t.id === tabId);
    
    if (tab && tab.filename) {
        const tabMode = tab.settings?.mode || state.mode;
        clearSessionFromLayer(tab.filename, tabMode);
    }

    if (state.tabs.length === 1) {
        state.tabs = [];
        state.activeTabId = null;
        state.currentSessionFile = null;
        addNewTab();
        return; 
    }

    const index = state.tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const wasActive = (state.activeTabId === tabId);
    let nextTabId = null;

    if (wasActive) {
        const nextTab = state.tabs[index === 0 ? 1 : index - 1];
        nextTabId = nextTab.id;
        state.activeTabId = null; 
    }

    state.tabs.splice(index, 1);
    renderTabs(); 

    if (wasActive && nextTabId) {
        switchTab(nextTabId);
    }
}

window.activePollId = 0;

// Starts a polling timer to detect external changes or updates to the specified session file.
function startPollingForChanges(filename) {
    if (currentPollTimer) {
        clearTimeout(currentPollTimer);
        currentPollTimer = null;
    }
    
    window.activePollId++;
    const myPollId = window.activePollId;
    
    if (window.lastPolledFile !== filename) {
        currentSessionLastModified = null;
        window.lastPolledFile = filename;
    }

    const poll = async () => {
        if (myPollId !== window.activePollId) {
            return; 
        }

        if (!state.currentSessionFile || state.currentSessionFile !== filename) {
            return;
        }

        if (state.isGenerating || state.agentActive || (window.inlineEditingContext && window.inlineEditingContext.active)) {
            currentPollTimer = setTimeout(poll, 2000);
            return; 
        }

        try {
            const res = await fetch(`/api/sessions/check-modified?file=${filename}&_t=${Date.now()}`, {
                cache: 'no-store'
            });
            
            if (res.ok) {
                const data = await res.json();
                
                if (currentSessionLastModified !== null && data.last_modified !== currentSessionLastModified && data.last_modified > 0) {
                    console.log("An external change was detected in the JSON file! Refresh...");
                    
                    const container = document.getElementById('chat-container');
                    const currentScroll = container ? container.scrollTop : 0;
                    
                    await loadSession(filename);
                    
                    if (container) {
                        requestAnimationFrame(() => {
                            container.scrollTop = currentScroll;
                        });
                    }
                }
                
                currentSessionLastModified = data.last_modified;
            }
        } catch (e) {
        }

        if (myPollId === window.activePollId) {
            currentPollTimer = setTimeout(poll, 4000);
        }
    };

    poll();
}

// Loads the chat history data for the specified session file into the user interface.
async function loadSession(filename) {
    if (!filename) return; 
    
    window.currentSessionFile = filename; 
    if (typeof state !== 'undefined') state.currentSessionFile = filename;

    if (typeof closeAllDropdowns === 'function') closeAllDropdowns();

    let currentTabMode = (typeof state !== 'undefined') ? state.mode : 3;

    if (state.activeTabId) {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (activeTab) {
            activeTab.filename = filename;
            if (activeTab.settings && activeTab.settings.mode) {
                currentTabMode = activeTab.settings.mode;
            }
        }
    }

    try {
        const res = await fetch(`/api/sessions/${filename}?_t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error("Session file not found");
        
        const data = await res.json();
        
        if (typeof syncSessionToLayer === 'function') {
            syncSessionToLayer(filename, currentTabMode);
        }
        
        const loadedHistory = data.browser_history || [];
        if (state.activeTabId) {
            const activeTab = state.tabs.find(t => t.id === state.activeTabId);
            if (activeTab) {
                activeTab.browserHistory = [...loadedHistory];
                if (typeof renderHistoryDropdown === 'function') {
                    renderHistoryDropdown();
                }
            }
        }
        
        const nameInput = document.getElementById('session-name-input');
        if (nameInput) {
            nameInput.value = data.name || filename.replace('session_', 'Session #').replace('.json', '');
        }

        const container = document.getElementById('chat-container');
        if (!container) return; 

        let sessionHTML = '';
        const historyArray = data.history || [];

        historyArray.forEach((msg, index) => {
            const pairId = `pair-${index}`;
            if (msg.role === 'User') {
                sessionHTML += `
                <div class="message-pair-group w-full mb-10 flex flex-col group/pair" id="${pairId}" data-msg-index="${index}">
                    <div class="flex justify-end mb-2 w-full relative group/user">
                        <div class="chat-bubble-user bg-[#FDFBF7] border border-[#D4A373]/40 text-[#3E2723] shadow-md rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%]">
                            <div class="msg-content font-mono text-[13px]">${typeof formatText === 'function' ? formatText(msg.content) : msg.content}</div>
                        </div>
                        <div class="absolute -bottom-6 right-2 opacity-0 group-hover/user:opacity-100 transition-opacity flex gap-2 text-[10px] font-bold text-[#D4A373] uppercase bg-[#FDFBF7] px-2 py-1 rounded border border-[#D4A373]/30 shadow-sm z-10">
                            <button onclick="copyMsgText(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-copy"></i> Copy</button>
                            <button onclick="editAndRegenUser(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-pen-to-square"></i> Edit & Regen</button>
                            <button onclick="deleteMsgPair('${pairId}', ${index})" class="text-red-400 hover:text-red-600 active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-trash"></i> Delete</button>
                        </div>
                    </div>`;
            } else {
                let tracker = window.msgHistoryTracker ? window.msgHistoryTracker[index] : null;
                let canUndo = tracker && tracker.currentPos > 0;
                let canRedo = tracker && tracker.currentPos < (tracker.states ? tracker.states.length - 1 : 0);
                
                let undoClass = canUndo ? "undo-btn hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5 border-l border-[#D4A373]/30 pl-2 ml-1" : "undo-btn hidden";
                let redoClass = canRedo ? "redo-btn hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5" : "redo-btn hidden";

                sessionHTML += `
                    <div class="ai-response-slot flex justify-start w-full relative group/ai mt-3">
                        <div class="chat-bubble-ai w-full"> 
                            <div class="msg-content">${typeof parseMarkdown === 'function' ? parseMarkdown(msg.content) : msg.content}</div>
                        </div>
                        <div class="absolute -top-5 left-4 opacity-0 group-hover/ai:opacity-100 transition-opacity flex gap-2 text-[10px] font-bold text-[#D4A373] uppercase bg-[#FDFBF7] px-2 py-1 rounded border border-[#D4A373]/30 shadow-sm z-10">
                            <button onclick="copyMsgText(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-copy"></i> Copy</button>
                            <button onclick="enableManualEdit(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-pen"></i> Edit</button>
                            <button onclick="retryAiResponse(this)" class="hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-1.5"><i class="fa-solid fa-rotate-right"></i> Retry</button>
                            
                            <button onclick="undoMessage(this)" class="${undoClass}"><i class="fa-solid fa-rotate-left"></i> Undo</button>
                            <button onclick="redoMessage(this)" class="${redoClass}"><i class="fa-solid fa-rotate-right"></i> Redo</button>
                        </div>
                    </div>
                </div>`; 
            }
        });

        container.innerHTML = sessionHTML;
        container.scrollTop = container.scrollHeight;
        if (typeof updatePromptNavigator === 'function') updatePromptNavigator();
        
        requestAnimationFrame(() => {
            setTimeout(() => {
                container.querySelectorAll('pre code').forEach((block) => {
                    delete block.dataset.highlighted; 
                    if (typeof hljs !== 'undefined') hljs.highlightElement(block);
                });
                
                if (typeof updatePromptNavigator === 'function') updatePromptNavigator();
            }, 100);
        });

        //if (state.currentSessionFile === filename) {
             //if (typeof startPollingForChanges === 'function') startPollingForChanges(filename);
        //}

    } catch(e) { 
        console.error("Error loading session:", e); 
    }
}

// Prompts for confirmation and deletes the specified chat session from the server.
async function deleteSession(event, filename) {
    event.stopPropagation();
    if(confirm("Delete this session?")) {
        await fetch(`/api/sessions/${filename}`, { method: 'DELETE' });
        if(state.currentSessionFile === filename) createNewSession();
        else loadSessionList();
    }
}

// Prompts the user for a new name and renames the specified session file via the backend API.
async function triggerRename(filename, oldName) {
    const newName = prompt("Rename Session:", oldName);
    if (newName && newName !== oldName && newName.toLowerCase() !== "untitled") {
        try {
            await fetch('/api/sessions/rename', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ filename, new_name: newName })
            });

            const tabToUpdate = state.tabs.find(t => t.filename === filename);
            if (tabToUpdate) {
                tabToUpdate.sessionName = newName;
            }

            await loadSessionList(false);

            if (state.currentSessionFile === filename) {
                const nameInput = document.getElementById('session-name-input');
                if (nameInput) nameInput.value = newName;
            }
            
            showToast("Session renamed!");
        } catch (e) {
            console.error("Rename error:", e);
        }
    }
}

// Toggles the inclusion of a specific session's context into the current combined AI context.
async function toggleCombineSession(checkbox, name) {
    const val = checkbox.value;
    const container = document.getElementById('chat-container');
    const blockId = `linked-block-${val.replace(/[^a-zA-Z0-9]/g, '-')}`;

    if (checkbox.checked) {
        state.combinedSessions.push(val);
        
        try {
            const res = await fetch(`/api/sessions/${val}`);
            const data = await res.json();

            let historyHtml = `<div id="${blockId}" class="linked-session-block message-pair-group max-w-[48rem] mx-auto w-full border-l-4 border-[#D4A373]/40 bg-[#FDFBF7]/50 p-4 my-6 rounded shadow-sm transition-all">`;
            
            historyHtml += `
                <div class="text-[10px] font-bold text-[#8D6E63] mb-4 uppercase border-b border-[#D4A373]/20 pb-2 flex justify-between items-center">
                    <span><i class="fa-solid fa-link mr-2"></i> LINKED CONTEXT: ${name}</span>
                    <span class="opacity-95">HISTORY DATA</span>
                </div>`;

            (data.history || []).forEach(msg => {
                if (msg.role === 'User') {
                    historyHtml += `
                        <div class="flex justify-end mb-3 w-full">
                            <div class="chat-bubble-user bg-[#FDFBF7] border border-[#D4A373]/40 text-[#3E2723] shadow-md rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] opacity-90 transform scale-[0.9] origin-right">
                                <div class="msg-content font-mono text-[12px]">${formatText(msg.content)}</div>
                            </div>
                        </div>`;
                } else {
                    historyHtml += `
                        <div class="flex justify-start mb-3 w-full">
                            <div class="chat-bubble-ai w-full opacity-90 transform scale-[0.95] origin-left pl-3 border-l-2 border-[#D4A373]/30">
                                <div class="msg-content text-[13px]">${parseMarkdown(msg.content)}</div>
                            </div>
                        </div>`;
                }
            });

            historyHtml += `</div>`;

            container.insertAdjacentHTML('beforeend', historyHtml);
            
            container.insertAdjacentHTML('beforeend', `
                <div class="system-msg text-[#D4A373] mt-2 mb-6 text-center text-xs opacity-70">
                    <i class="fa-solid fa-link"></i> Linked Session: <b>${name}</b>
                </div>
            `);

            requestAnimationFrame(() => {
                setTimeout(() => {
                    const newBlock = document.getElementById(blockId);
                    if (newBlock) {
                        newBlock.querySelectorAll('pre code').forEach((block) => {
                            delete block.dataset.highlighted; 
                            if (typeof hljs !== 'undefined') {
                                hljs.highlightElement(block);
                            }
                        });
                    }
                }, 50);
            });

        } catch (e) {
            console.error("Error loading context:", e);
            if (typeof showToast === 'function') showToast("Error linking session");
        }
    } else {
        const idx = state.combinedSessions.indexOf(val);
        if (idx > -1) state.combinedSessions.splice(idx, 1);

        const block = document.getElementById(blockId);
        if (block) {
            block.style.opacity = '0';
            setTimeout(() => block.remove(), 300);
        }

        container.insertAdjacentHTML('beforeend', `
            <div class="system-msg text-red-800/60 mt-2 mb-6 text-center text-xs">
                <i class="fa-solid fa-unlink"></i> Unlinked Session: <b>${name}</b>
            </div>
        `);
    }

    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 50);
}

async function loadMultiSelect(endpoint, listId, dataKey, stateKey, displayId, enableDelete, deleteType) {
    try {
        const res = await fetch(`/api/${endpoint}`);
        const data = await res.json();
        const list = document.getElementById(listId);
        const items = data[dataKey] || [];
        
        if (items.length === 0) { 
            list.innerHTML = `<div class="text-[11px] p-2 text-gray-500 italic">Empty</div>`; 
            return; 
        }
        
        list.innerHTML = items.map(item => `
        <div class="file-item-row flex items-center justify-between hover:bg-[#D4A373]/10 transition-colors border-b border-[#D4A373]/5 w-full">
            <label class="file-item-left flex items-center gap-2 flex-1 min-w-0 cursor-pointer py-1.5 pl-2">
                <input type="checkbox" value="${item}" 
                       onchange="updateMultiSelection(this, '${stateKey}', '${displayId}')" 
                       class="accent-[#D4A373] shrink-0"
                       ${state[stateKey].includes(item) ? 'checked' : ''}>
                
                <span class="file-item-text font-mono font-bold text-[#3E2723] truncate block w-full" title="${item}">
                    ${item}
                </span>
            </label>

            ${enableDelete ? `
            <button onclick="deleteItem('${deleteType}', '${item}')" 
                    class="file-item-delete text-red-300 hover:text-red-600 px-3 py-1 transition-colors shrink-0" 
                    title="Delete">
                <i class="fa-solid fa-xmark text-[14px]"></i>
            </button>` : ''}
        </div>
        `).join('');
    } catch (e) { console.error("Error loading multi-select:", e); }
}


function syncCheckboxesInList(listId, stateArray) {
    const list = document.getElementById(listId);
    if (!list) return;
    const checkboxes = list.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = stateArray.includes(cb.value);
    });
}

async function deleteItem(type, item) {
    let endpoint = type === 'value' ? `/api/config/values/${item}` : `/api/files/${item}`;
    if (confirm(`Delete '${item}'?`)) {
        try {
            await fetch(endpoint, { method: 'DELETE' });
            showToast(`Deleted ${item}`);
            if (type === 'value') loadMultiSelect('config/values', 'values-list', 'items', 'selectedValues', 'values-display', true, 'value');
            else loadMultiSelect('files', 'files-list', 'files', 'selectedFiles', 'files-display', true, 'file');
        } catch(e) { console.error(e); }
    }
}

function updateMultiSelectDisplays() {
    const valDisp = document.getElementById('values-display');
    if (valDisp) {
        valDisp.innerText = state.selectedValues.length > 0 
            ? `${state.selectedValues.length} values selected` 
            : "Select values...";
    }
    
    const fileDisp = document.getElementById('files-display');
    if (fileDisp) {
        fileDisp.innerText = state.selectedFiles.length > 0 
            ? `${state.selectedFiles.length} files selected` 
            : "Select files..."; 
    }

    syncCheckboxesInList('values-list', state.selectedValues);
    syncCheckboxesInList('files-list', state.selectedFiles);
}

function updateMultiSelection(checkbox, stateKey, displayId) {
    const val = checkbox.value;
    if (checkbox.checked) {
        if (!state[stateKey].includes(val)) state[stateKey].push(val);
    } else {
        state[stateKey] = state[stateKey].filter(v => v !== val);
    }
    updateMultiSelectDisplays(); 
}

// Opens a configuration modal for a specific setting category.
function openModal(type) {
    state.configType = type;
    
    const sysInput = document.getElementById('new-system');
    const nameInput = document.getElementById('new-name');
    const saveBtn = document.querySelector('#config-modal button[onclick*="saveConfig"]');
    let metricsContainer = document.getElementById('magi-metrics-display');

    if (type === 'layers') {
        fetch('/api/system_layers/stats')
            .then(res => res.json())
            .then(data => {
                document.getElementById('modal-type-title').innerHTML = '<i class="fa-solid fa-dharmachakra animate-spin-slow text-[#D4A373]"></i> OS MAGI METRICS & PURIFICATION';

                if(nameInput) nameInput.style.display = 'none';
                if(sysInput) sysInput.style.display = 'none';
                if(saveBtn) saveBtn.style.display = 'none';

                if (!metricsContainer) {
                    metricsContainer = document.createElement('div');
                    metricsContainer.id = 'magi-metrics-display';
                    metricsContainer.className = 'p-4 mb-6 bg-[#FDFBF7] text-[#3E2723] font-mono text-[12px] leading-relaxed rounded border border-[#D4A373]/30 overflow-y-auto w-full';
                    if (sysInput && sysInput.parentNode) {
                        sysInput.parentNode.insertBefore(metricsContainer, sysInput);
                    }
                }
                metricsContainer.style.display = 'block';

                metricsContainer.innerHTML = `
                    <div class="mb-5">
                        <div class="text-[#D4A373] font-black uppercase tracking-wider mb-2 border-b border-[#D4A373]/30 pb-1"><i class="fa-solid fa-microchip mr-1"></i> LIFE CYCLE STATUS</div>
                        <ul class="space-y-2 pl-1">
                            <li><i class="fa-solid fa-circle-dot w-4 text-[#8D6E63] text-center text-[12px]"></i> Current OS life cycle: <b>№ ${data.lifecycle_number}</b></li>
                            <li><i class="fa-solid fa-circle-dot w-4 text-[#8D6E63] text-center text-[12px]"></i> Completed life cycles: <b>${data.passed_lifecycles}</b></li>
                            <li><i class="fa-solid fa-circle-dot w-4 text-[#8D6E63] text-center text-[12px]"></i> Remaining prompts to Teshuvah: <b>${data.remaining_prompts} / 1000</b></li>
                            <li><i class="fa-solid fa-circle-dot w-4 text-[#8D6E63] text-center text-[12px]"></i> Current cycle progress: <b>${data.progress_percentage}%</b></li>
                        </ul>
                    </div>
                    <div>
                        <div class="text-[#D4A373] font-black uppercase tracking-wider mb-2 border-b border-[#D4A373]/30 pb-1 mt-4"><i class="fa-solid fa-infinity mr-1"></i> ABSOLUTE MEMORY (AKASHA LAYER)</div>
                        <ul class="space-y-2 pl-1">
                            <li><i class="fa-solid fa-circle-dot w-4 text-[#8D6E63] text-center text-[12px]"></i> Total number of prompts from all cycles: <b>${data.total_prompts_all_time}</b></li>
                            <li><i class="fa-solid fa-circle-dot w-4 text-[#8D6E63] text-center text-[12px]"></i> Total number of words written (prompts): <b>${data.total_prompt_words}</b></li>
                            <li><i class="fa-solid fa-circle-dot w-4 text-[#8D6E63] text-center text-[12px]"></i> Total number of words generated (answers): <b>${data.total_response_words}</b></li>
                        </ul>
                    </div>
                `;

                let modalFooter = document.querySelector('#config-modal .flex.justify-end.gap-2') || document.querySelector('#config-modal .flex.justify-end') || document.querySelector('#config-modal footer');
                
                if (modalFooter) {
                    const oldNirjara = document.getElementById('nirjara-btn');
                    if (oldNirjara) oldNirjara.remove();

                    const nirjaraBtn = document.createElement('button');
                    nirjaraBtn.id = 'nirjara-btn';
                    nirjaraBtn.type = 'button';
                    nirjaraBtn.className = 'px-4 py-1.5 bg-[#FDFBF7] text-[#D4A373] border border-[#D4A373]/40 rounded hover:bg-red-500 hover:text-white hover:border-red-500 active:scale-95 transition-all text-[12px] font-mono font-bold uppercase mr-auto shadow-sm flex items-center gap-2';
                    nirjaraBtn.innerHTML = '<i class="fa-solid fa-fire-burner"></i> NIRJARA';
                    nirjaraBtn.onclick = () => triggerNirjara();
                    
                    modalFooter.insertBefore(nirjaraBtn, modalFooter.firstChild);
                }

                document.getElementById('config-modal').classList.remove('hidden');
            });
        return;
    }

    if (metricsContainer) metricsContainer.style.display = 'none';
    if (nameInput) nameInput.style.display = 'block';
    if (sysInput) sysInput.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'block'; 

    const formattedTitle = type.replace(/_/g, ' ').toUpperCase();
    document.getElementById('modal-type-title').innerHTML = formattedTitle;

    if(nameInput) nameInput.value = '';
    if(sysInput) sysInput.value = '';

    if (type === 'serper_keys') {
        if(nameInput) nameInput.placeholder = "Key Name";
        if(sysInput) sysInput.placeholder = "Serper Key";
    } else {
        if(nameInput) nameInput.placeholder = "Name";
        if(sysInput) sysInput.placeholder = "Write here...";
    }

    document.getElementById('config-modal').classList.remove('hidden');
}

// Closes and hides the currently active configuration modal.
function closeModal() { 
    document.getElementById('config-modal').classList.add('hidden'); 
    
    const nirjaraBtn = document.getElementById('nirjara-btn');
    if (nirjaraBtn) nirjaraBtn.remove();
    
    const metricsContainer = document.getElementById('magi-metrics-display');
    if (metricsContainer) metricsContainer.style.display = 'none';
    
    const sysInput = document.getElementById('new-system');
    const nameInput = document.getElementById('new-name');
    const saveBtn = document.querySelector('#config-modal button[onclick*="saveConfig"]');
    
    if (sysInput) sysInput.style.display = 'block';
    if (nameInput) nameInput.style.display = 'block';
    if (saveBtn) saveBtn.style.display = 'block'; 
}

// Saves the new configuration item (such as a personality or system prompt) to the server and reloads the page.
async function saveConfig() {
    const name = document.getElementById('new-name').value;
    const sys = document.getElementById('new-system').value;
    if(!name) return;
    await fetch(`/api/config/${state.configType}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, system: sys})
    });
    closeModal();
    location.reload();
}

// Fetches a list of configuration options from the API and populates a specific UI dropdown or list.
async function fetchOptions(endpoint, elementId, dataKey) {
    try {
        const res = await fetch(`/api/${endpoint}`);
        const data = await res.json();
        let items = data[dataKey] || [];
        
        if (endpoint === 'ollama-models') {
            let allowedModels = [];
            
            try {
                const listRes = await fetch('/static/ollama_list.json?t=' + new Date().getTime());
                if (listRes.ok) {
                    allowedModels = await listRes.json();
                }
            } catch (err) {
                console.warn("Ollama_list.json can't be loaded. Showing all available models.");
            }
            
            if (Array.isArray(allowedModels) && allowedModels.length > 0) {
                items = items.filter(model => 
                    allowedModels.some(allowed => model.toLowerCase().includes(allowed.toLowerCase()))
                );
            }
        }

        if (endpoint === 'config/personalities') {
            renderSingleSelectList('personalities', items, 'personality-list', 'personality-display');
        } 
        else if (endpoint === 'config/emotionalities') {
            renderSingleSelectList('emotionalities', items, 'emotion-list', 'emotion-display');
        }
        else if (endpoint === 'config/serper_keys') {
            renderSingleSelectList('serper_keys', items, 'serper-keys-list', 'serper-display');
        }

        else {
            const select = document.getElementById(elementId);
            if (select) {
                select.innerHTML = items.map(i => `<option value="${i}">${i}</option>`).join('');
            }
        }
    } catch (e) {
        console.error("Error fetching options:", e);
    }
}

// Deletes a specific configuration item from the server after prompting for user confirmation.
async function deleteConfigItem(category, itemName) {
    if(itemName && confirm(`Delete '${itemName}'?`)) {
        try {
            const res = await fetch(`/api/config/${category}/${itemName}`, { method: 'DELETE' });
            if (res.ok) {
                showToast(`Deleted ${itemName}`);
                fetchOptions(`config/${category}`, null, 'items');
            }
        } catch (e) {
            console.error("Error deleting item:", e);
        }
    }
}

function parseMarkdown(text) {
    if (!text) return "";
    
    let renderText = text;

    const codeBlockMatches = renderText.match(/```/g);
    const isCodeBlockOpen = codeBlockMatches && codeBlockMatches.length % 2 !== 0;
    
    if (isCodeBlockOpen) {
        renderText += "\n```"; 
    }

    renderText = renderText.replace(/[(\[<]?\[([^\]]+)\]\(\s*(https?:\/\/[^\s)]+)[^)]*\)[)\]>]?/g, function(match, title, url) {
        const cleanUrl = url.replace(/[\]\)>.,!?;:]+$/, '');
        return `<a href="${cleanUrl}" data-raw-md="[${title}](${url})" class="chat-link" title="${cleanUrl}"><i class="fa-solid fa-link mr-1 text-[10px] opacity-70"></i>${title}</a>`;
    });

    renderText = renderText.replace(/<\s*(https?:\/\/[^\s>]+)\s*>/g, function(match, url) {
        return `<a href="${url}" data-raw-md="${match}" class="chat-link" title="${url}"><i class="fa-solid fa-link mr-1 text-[10px] opacity-70"></i>${url}</a>`;
    });

    renderText = renderText.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const lineCount = code.split('\n').length;
        const charCount = code.length;
        const safeCode = escapeHtml(code);
        
        const exportMenuId = 'export-code-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        
        return `
        <div class="code-bubble-wrapper font-mono relative group/bubble mt-4 mb-6 rounded-lg border border-[#D4A373]/40 shadow-md flex flex-col overflow-hidden transition-colors duration-300">
            
            <div class="magi-code-bar flex items-center justify-between bg-[#FDFBF7] px-3 h-10 border-b border-[#D4A373]/20 shrink-0 transition-colors">
                <span class="text-[#D4A373] text-[13px] font-bold uppercase tracking-wider">${lang || 'TEXT'}</span>
                
                <div class="flex items-center gap-1.5 text-[#8D6E63]">
                    
                    <button onclick="handleCodeBubble(this, 'toggle_lock')" class="magi-code-btn btn-lock-code h-8 px-3 flex items-center justify-center bg-[#FDFBF7] border border-[#D4A373]/40 rounded hover:bg-white hover:text-[#3E2723] transition-all text-[13px] font-bold active:scale-95 text-[#D4A373]">
                        <i class="fa-solid fa-lock mr-2 text-[14px]"></i> <span class="lock-text">UNLOCK</span>
                    </button>
                    
                    <div class="relative flex items-center">
                        <button onclick="toggleDropdown(event, '${exportMenuId}')" class="magi-code-btn h-8 px-3 flex items-center justify-center bg-[#FDFBF7] border border-[#D4A373]/40 rounded hover:bg-white hover:text-[#3E2723] transition-all text-[13px] font-bold uppercase tracking-wider active:scale-95 text-[#D4A373]">
                            <i class="fa-solid fa-download mr-2 text-[14px]"></i> EXPORT <i class="fa-solid fa-chevron-down ml-2 text-[11px] opacity-70"></i>
                        </button>
                        <div id="${exportMenuId}" class="magi-code-dropdown dropdown-menu w-[220px] mt-1 absolute z-[9999] bg-[#FDFBF7] border border-[#D4A373]/20 shadow-xl rounded-md p-1 hidden transition-colors" style="right: 0; left: auto; top: 100%;">
                            <div class="text-[11px] font-bold text-[#8D6E63] uppercase px-2 py-1.5 mb-1 border-b border-[#D4A373]/20">Select Format:</div>
                            <button onclick="handleCodeBubble(this, 'export_file', 'txt')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-solid fa-file-lines text-[18px] w-7 text-gray-500"></i> Text file (.txt)</button>
                            <button onclick="handleCodeBubble(this, 'export_file', 'json')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-solid fa-database text-[18px] w-7 text-yellow-600"></i> JSON (.json)</button>
                            <button onclick="handleCodeBubble(this, 'export_file', 'bat')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-solid fa-terminal text-[18px] w-7 text-gray-800"></i> Batch file (.bat)</button>
                            <button onclick="handleCodeBubble(this, 'export_file', 'docx')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-solid fa-file-word text-[18px] w-7 text-blue-600"></i> Document (.docx)</button>
                            <button onclick="handleCodeBubble(this, 'export_file', 'py')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-brands fa-python text-[18px] w-7 text-blue-500"></i> Python (.py)</button>
                            <button onclick="handleCodeBubble(this, 'export_file', 'html')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-brands fa-html5 text-[18px] w-7 text-orange-500"></i> HTML (.html)</button>
                            <button onclick="handleCodeBubble(this, 'export_file', 'js')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-brands fa-js text-[18px] w-7 text-yellow-500"></i> JavaScript (.js)</button>
                            <button onclick="handleCodeBubble(this, 'export_file', 'css')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-brands fa-css3-alt text-[18px] w-7 text-blue-400"></i> CSS (.css)</button>
                            <button onclick="handleCodeBubble(this, 'export_file', 'c')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-solid fa-c text-[18px] w-7 text-blue-700"></i> C (.c)</button>
                            <button onclick="handleCodeBubble(this, 'export_file', 'cpp')" class="w-full text-left px-3 py-2 text-[13px] font-bold text-[#3E2723] hover:bg-white hover:text-[#D4A373] rounded transition-colors flex items-center whitespace-nowrap"><i class="fa-solid fa-plus text-[18px] w-7 text-blue-800"></i> C++ (.cpp)</button>
                        </div>
                    </div>

                    <button onclick="handleCodeBubble(this, 'copy')" class="magi-code-btn h-8 px-3 flex items-center justify-center bg-[#FDFBF7] border border-[#D4A373]/40 rounded hover:bg-white hover:text-[#3E2723] transition-all text-[13px] font-bold uppercase tracking-wider active:scale-95 text-[#D4A373]">
                        <i class="fa-regular fa-copy mr-2 text-[14px]"></i> COPY
                    </button>
                    
                </div>
            </div>
            
            <div class="magi-code-body flex relative bg-[#FDFBF7] m-0 p-0 border-b border-[#D4A373]/10 transition-colors">
                
                <div class="magi-code-lines bg-[#F5E6D3] text-[#8D6E63] text-right py-4 pr-3 pl-2 w-10 shrink-0 border-r border-[#D4A373]/20 select-none font-mono text-[14px] leading-[26px] transition-colors">
                    ${generateLineNumbersHTML(code)}
                </div>
                
                <div class="relative flex-1 min-w-0 overflow-auto custom-scroll code-scroll-area bg-transparent m-0 p-0">
                    <pre class="m-0 p-4 min-w-full whitespace-pre !overflow-visible"><code class="language-${lang || 'plaintext'} !bg-transparent !p-0 !m-0 !overflow-visible block whitespace-pre text-[14px] leading-[26px]">${safeCode}</code></pre>
                    <textarea class="magi-code-textarea hidden absolute top-0 left-0 w-full h-full p-4 resize-none outline-none border-none whitespace-pre z-20 bg-[#FDFBF7] text-[#3E2723] text-[14px] leading-[26px] transition-colors" spellcheck="false" data-raw="${encodeURIComponent(code)}">${safeCode}</textarea>
                </div>
            </div>
            
            <div class="magi-code-bar flex justify-between items-center bg-[#FDFBF7] px-3 h-10 text-[13px] text-[#8D6E63] font-bold tracking-wider m-0 shrink-0 transition-colors">
                <div class="flex gap-4">
                    <span>Lines: ${lineCount}</span>
                    <span>Chars: ${charCount}</span>
                </div>
                
                <button onclick="handleCodeBubble(this, 'astral')" class="magi-code-btn h-8 px-3 flex items-center justify-center bg-[#FDFBF7] border border-[#D4A373]/40 rounded hover:bg-white hover:text-[#3E2723] transition-all text-[13px] font-bold uppercase tracking-wider active:scale-95 text-[#D4A373]">
                    <i class="fa-solid fa-wand-magic-sparkles mr-2 text-[14px]"></i> ASTRAL
                </button>
            </div>
            
        </div>`;
    });

    renderText = renderText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    renderText = renderText.replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>');
    
    if (!renderText.includes("code-bubble-wrapper") && !renderText.includes("<li>")) {
        renderText = renderText.replace(/\n/g, '<br>');
    }

    return renderText.includes('<li>') ? `<ul class="list-disc pl-5">${renderText}</ul>` : renderText;
}

function generateLineNumbersHTML(codeText) {
    const linesCount = codeText.split('\n').length;
    let html = '';
    for (let i = 1; i <= linesCount; i++) {
        html += `<div style="height: 26px;">${i}</div>`;
    }
    return html;
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Copies the adjacent code block content directly to the user's system clipboard.
function copyToClipboard(btn) {
    const codeContent = btn.parentElement.nextElementSibling.innerText;
    navigator.clipboard.writeText(codeContent).then(() => {
        const originalText = btn.innerText;
        btn.innerText = "COPIED!";
        setTimeout(() => btn.innerText = originalText, 2000);
    });
}

// Handles global keydown events, specifically triggering message send when Enter is pressed without Shift.
function handleInputKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Displays a temporary toast notification message on the screen with the provided text.
function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-message').innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function formatText(text) { 
    return text ? escapeHtml(text).replace(/\n/g, '<br>') : ""; 
}

// Sets the global operational mode of the system (e.g., Passive, Active) based on the provided ID.
function setMode(id) {
    if (state.mode === id) return; 
    
    const oldMode = state.mode;
    state.mode = id;

    let activeTab = null;
    if (state.activeTabId) {
        activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (activeTab) {
            if (!activeTab.settings) activeTab.settings = {};
            activeTab.settings.mode = id;
        }
    }

    document.querySelectorAll('.mode-tab').forEach(el => el.classList.remove('mode-active'));
    const newTab = document.getElementById(`tab-${id}`);
    if (newTab) newTab.classList.add('mode-active');

    const addressBar = document.getElementById('address-bar-container');
    const nameInput = document.getElementById('session-name-input');
    
    const isOldPassive = oldMode === 1 || oldMode === 2;
    const isNewPassive = id === 1 || id === 2;

    if (oldMode !== null && isOldPassive !== isNewPassive) {
        if (typeof currentPollTimer !== 'undefined' && currentPollTimer) {
            clearTimeout(currentPollTimer);
            currentPollTimer = null;
        }

        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) chatContainer.innerHTML = '';
        
        state.currentSessionFile = null;
        window.currentSessionFile = null;
        if (activeTab) activeTab.filename = null;
    }

    if (id === 1 || id === 2) {
        if (addressBar) addressBar.classList.add('opacity-50', 'pointer-events-none', 'grayscale');
        
        if (activeTab && nameInput && nameInput.value !== "Passive Mode") {
            activeTab.savedSessionName = nameInput.value;
        }
        
        if (nameInput) nameInput.value = "Passive Mode";
        state.currentSessionFile = null; 
    } else {
        if (addressBar) addressBar.classList.remove('opacity-50', 'pointer-events-none', 'grayscale');
        
        if (activeTab && nameInput && nameInput.value === "Passive Mode") {
            nameInput.value = activeTab.savedSessionName || "New Space";
        } else if (!state.currentSessionFile && nameInput) {
            nameInput.value = "New Space";
        }
        
    }

    if (typeof showToast === 'function') {
        const modeNames = {1: "Autonomous (No Save)", 2: "Manual (No Save)", 3: "Autonomous (Save)", 4: "Manual (Save)"};
        showToast(`Mode: ${modeNames[id] || id}`);
    }

    if (typeof applyLayerConstraints === 'function') {
        applyLayerConstraints();
    }
}

// Toggles the visibility of a specific dropdown menu element while preventing event bubbling.
window.toggleDropdown = function(event, id) {
    if (event) event.stopPropagation(); 
    
    const target = document.getElementById(id);
    if (!target) return;

    const isShowClass = target.classList.contains('show');
    const isDisplayVisible = target.style.display === 'block' || target.style.display === 'flex';
    const wasOpen = isShowClass || isDisplayVisible;

    closeAllDropdowns();

    if (!wasOpen) {
        target.classList.add('show');
        target.classList.remove('hidden'); 
        
        target.style.display = (id === 'session-dropdown') ? 'flex' : 'block';
        
        if (id === 'session-dropdown') {
            const sArrow = document.getElementById('session-arrow');
            if (sArrow) sArrow.style.transform = 'rotate(180deg)';
        } else if (event.currentTarget) {
            const arrow = event.currentTarget.querySelector('.arrow-icon');
            if (arrow) arrow.style.transform = 'rotate(180deg)';
        }
    }
};

// Hides all currently open dropdown menus in the application interface.
window.closeAllDropdowns = function() {
    document.querySelectorAll('.dropdown-menu').forEach(el => {
        el.classList.remove('show');
        el.classList.add('hidden'); 
        el.style.display = 'none';  
    });
    
   
    document.querySelectorAll('.arrow-icon').forEach(el => el.style.transform = 'rotate(0deg)');
    const sArrow = document.getElementById('session-arrow');
    if (sArrow) sArrow.style.transform = 'rotate(0deg)';
};

window.onclick = function(e) {

    const isInsideMenu = e.target.closest('.dropdown-menu');
    

    const isTrigger = e.target.closest('[onclick*="toggleDropdown"]') || 
                      e.target.closest('.magi-glow-container') ||
                      e.target.closest('#session-name-input');

    if (!isInsideMenu && !isTrigger) {
        closeAllDropdowns();
    }
};

// Automatically adjusts the height of a textarea element to fit its text content.
function autoResize(textarea) {
    textarea.style.height = 'auto'; 
    textarea.style.height = textarea.scrollHeight + 'px'; 
}

// Opens the configuration modal specifically for managing Serper (web search) API keys.
function openSerperModal() {
    document.getElementById('serper-modal').classList.remove('hidden');
}

function toggleWebState() {
    const container = document.getElementById('web-search-toggle-btn');
    container.classList.toggle('active-web');
    
    if (typeof toggleWebSearch === 'function') {
        toggleWebSearch(); 
    }
}

function copyMsgText(btn) {
    const container = btn.closest('.group\\/user, .group\\/ai').querySelector('.msg-content');
    if (!container) return;

    const textToCopy = container.innerText; 
    
    window.isSystemCopy = true;

    if (typeof window.saveToClipboardDb === 'function') {
        window.saveToClipboardDb(textToCopy, 'copied');
    } else if (typeof logToTimeMachine === 'function') {
        logToTimeMachine('copied', textToCopy, 'Chat');
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check text-green-600"></i> COPIED';
        
        setTimeout(() => {
            btn.innerHTML = orig;
            window.isSystemCopy = false; 
        }, 2000);
    }).catch(err => {
        console.error("Copy failed:", err);
        window.isSystemCopy = false;
    });
}

function copyToClipboard(btn, isCode = false) {
    let textToCopy = "";
    if (isCode) {
        textToCopy = btn.parentElement.nextElementSibling.innerText;
    }

    if (!textToCopy) return; 

    window.isSystemCopy = true;

    if (typeof window.saveToClipboardDb === 'function') {
        window.saveToClipboardDb(textToCopy, 'copied');
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-check mr-2"></i>COPIED`;
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            window.isSystemCopy = false; 
        }, 2000);
    }).catch(err => {
        console.error("Copy failed:", err);
        window.isSystemCopy = false;
    });
}

function renderSingleSelectList(category, items, listId, displayId) {
    const list = document.getElementById(listId);
    if (!list) return;
    
    if (!items || items.length === 0) {
        list.innerHTML = '<div class="text-[13px] p-2 text-gray-500 italic">Empty</div>';
        return;
    }

    list.innerHTML = items.map(item => `
        <div class="shared-list-row flex items-center justify-between border-b border-[#D4A373]/5 group cursor-pointer w-full">
            <div class="single-select-item flex-1 py-1.5 px-2 overflow-hidden flex items-center" onclick="selectSingleItem(event, '${displayId}', '${item}')">
                <span class="text-[13px] font-mono font-bold truncate block w-full text-left">${item}</span>
            </div>
            <button onclick="deleteSingleItem(event, '${category}', '${item}')" 
                    class="shared-delete-btn shrink-0 transition-all flex items-center justify-center" title="Delete">
                <i class="fa-solid fa-xmark text-[14px]"></i>
            </button>
        </div>
    `).join('');
}

window.selectSingleItem = function(event, displayId, item) {
    event.stopPropagation();
    const display = document.getElementById(displayId);
    
    if (display) {
        display.innerText = item;
        display.dataset.value = item;

        if (displayId === 'serper-display') {
            const nameLabel = document.getElementById('serper-display-name');
            if (nameLabel) {
                nameLabel.innerText = item;
                nameLabel.classList.add('text-[#3E2723]'); 
            }

            state.webSearchEnabled = true;
            
            if (typeof updateWebSearchUI === 'function') {
                updateWebSearchUI();
            }
        }
    }
    closeAllDropdowns();
};

window.deleteSingleItem = function(event, category, item) {
    event.stopPropagation();
    if (confirm(`Delete "${item}"?`)) {
        deleteConfigItem(category, item);
    }
};

// Navigates the main application interface backwards or forwards through the session history.
function navigateSession(direction) {
    if (state.mode === 1 || state.mode === 2) return;

    if (!state.allSessions || state.allSessions.length === 0) return;

    const currentIndex = state.allSessions.findIndex(s => s.filename === state.currentSessionFile);
    
    if (currentIndex === -1) {
        if (direction === 'prev' && state.allSessions.length > 0) {
            loadSession(state.allSessions[0].filename);
        }
        return;
    }

    let newIndex;
    if (direction === 'prev') {
        newIndex = currentIndex + 1;
    } else {
        newIndex = currentIndex - 1;
    }

    if (newIndex >= 0 && newIndex < state.allSessions.length) {
        loadSession(state.allSessions[newIndex].filename);
    } else {
        showToast(direction === 'prev' ? "Beginning of the history" : "You are already in the latest session.");
    }
}

async function exportSession(format) {
    if (!state.currentSessionFile) {
        showToast("No active session.");
        return;
    }

    closeAllDropdowns();
    showToast("Generating...");

    try {
        const sessionNameInput = document.getElementById('session-name-input');
        let cleanFileName = (sessionNameInput ? sessionNameInput.value : "session").trim().replace(/[/\\?%*:|"<>\.]/g, '_');

        const res = await fetch(`/api/sessions/${state.currentSessionFile}`);
        const sessionData = await res.json();
        let mainHistory = sessionData.history || [];

        let linkedData = [];
        if (state.combinedSessions && state.combinedSessions.length > 0) {
            for (const file of state.combinedSessions) {
                const lRes = await fetch(`/api/sessions/${file}`);
                const lData = await lRes.json();
                linkedData.push({ name: lData.name, history: lData.history || [] });
            }
        }

        const getLabel = (role) => (role.toLowerCase() === 'user' ? 'X' : 'Magi');

        let content = "";
        let mimeType = "text/plain;charset=utf-8";
        let extension = format.split('_')[0]; 

if (format === 'pdf') {
    const printIframe = document.createElement('iframe');
    printIframe.style.position = 'fixed';
    printIframe.style.right = '100%';
    printIframe.style.bottom = '100%';
    printIframe.style.width = '0px';
    printIframe.style.height = '0px';
    printIframe.style.border = 'none';
    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow.document;

    let pdfHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${cleanFileName}</title><style>
        @page { margin: 20mm; size: A4 portrait; }
        body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #000; padding: 10px; }
        h1 { font-size: 18pt; color: #3E2723; border-bottom: 2px solid #D4A373; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
        h2 { font-size: 14pt; color: #8D6E63; margin-top: 25px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .msg { margin-bottom: 18px; page-break-inside: avoid; }
        .role { font-weight: bold; text-transform: uppercase; font-size: 10pt; letter-spacing: 1px; }
        .role-x { color: #8D6E63; } 
        .role-magi { color: #D4A373; } 
        .content { margin-top: 4px; display: block; }
    </style></head><body>`;
    
    pdfHTML += `<h1>${sessionData.name}</h1>`;
    
    const addHistoryToPrint = (history, title = null) => {
        if (title) pdfHTML += `<h2>${title}</h2>`;
        history.forEach(m => {
            const isUser = m.role.toLowerCase() === 'user';
            const label = isUser ? 'X' : 'Magi';
            const roleClass = isUser ? 'role-x' : 'role-magi';
            
            pdfHTML += `
                <div class="msg">
                    <span class="role ${roleClass}">${label}:</span>
                    <span class="content">${m.content.replace(/\n/g, '<br>')}</span>
                </div>`;
        });
    };

    linkedData.forEach(s => addHistoryToPrint(s.history, `Linked Context: ${s.name}`));
    addHistoryToPrint(mainHistory, "Main Conversation");
    
    pdfHTML += `</body></html>`;

    doc.open();
    doc.write(pdfHTML);
    doc.close();

    setTimeout(() => {
        printIframe.contentWindow.focus();
        printIframe.contentWindow.print();
        
        setTimeout(() => {
            if (document.body.contains(printIframe)) {
                document.body.removeChild(printIframe);
            }
        }, 1000);
    }, 500);
    
    showToast("Select 'Save as PDF' from the window.");
    return;
}

        if (format === 'docx') {
            let docxHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; }
                p, div, span, strong, b { font-size: 12pt; }
                h1 { font-size: 16pt; color: #3E2723; } h2 { font-size: 14pt; color: #8D6E63; }
            </style></head><body>`;
            
            docxHTML += `<h1>${sessionData.name}</h1>`;
            const addHistoryToDocx = (history, title = null) => {
                if (title) docxHTML += `<h2>${title}</h2>`;
                history.forEach(m => {
                    docxHTML += `<p><strong>${getLabel(m.role)}:</strong><br>${m.content.replace(/\n/g, '<br>')}</p>`;
                });
            };

            linkedData.forEach(s => addHistoryToDocx(s.history, `Linked Context: ${s.name}`));
            addHistoryToDocx(mainHistory, "Main Session");
            docxHTML += `</body></html>`;

            if (typeof htmlDocx !== 'undefined') {
                const converted = htmlDocx.asBlob(docxHTML, {orientation: 'portrait', margins: {top: 1440, right: 1440, bottom: 1440, left: 1440}}); 
                saveAsBlob(converted, `${cleanFileName}.docx`);
                return;
            }
        }

        if (format === 'txt') {
            linkedData.forEach(s => {
                content += `--- LINKED CONTEXT: ${s.name} ---\n`;
                s.history.forEach(m => content += `${getLabel(m.role)}:\n${m.content}\n\n`);
            });
            content += `--- MAIN SESSION ---\n`;
            mainHistory.forEach(m => content += `${getLabel(m.role)}:\n${m.content}\n\n`);
        }

        else if (format.startsWith('jsonl')) {
            const allHistory = [];
            linkedData.forEach(s => allHistory.push(...s.history));
            allHistory.push(...mainHistory);

            for (let i = 0; i < allHistory.length; i += 2) {
                const task = allHistory[i].content;
                const answer = allHistory[i + 1] ? allHistory[i + 1].content : "";
                if (format === 'jsonl_lmft') {
                    content += JSON.stringify({ prompt: task, completion: answer }) + "\n";
                } else {
                    content += JSON.stringify({ instruction: task, input: "", output: answer }) + "\n";
                }
            }
            extension = "jsonl";
        }

        saveAsBlob(new Blob([content], { type: mimeType }), `${cleanFileName}.${extension}`);

    } catch (e) { 
        console.error(e); 
        showToast("Export -error.", true); 
    }

    function saveAsBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

window.filterSessions = function() {
    const searchInput = document.getElementById('session-search');
    if (!searchInput) return;
    
    const term = searchInput.value.toLowerCase().trim();

    const items = document.querySelectorAll('.session-item');

    items.forEach(item => {
        const name = item.getAttribute('data-name') || "";
        
        if (name.includes(term)) {
            item.style.setProperty('display', 'flex', 'important');
        } else {
            item.style.setProperty('display', 'none', 'important');
        }
    });
};

// Toggles the application theme between light and dark modes and saves the preference to local storage.
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark-theme');
    localStorage.setItem('magi-theme', isDark ? 'dark' : 'light');
    
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
}

async function handleFileUpload(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    const newFileNames = []; 
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
        newFileNames.push(files[i].name);
    }

    setStatus("UPLOADING & INDEXING...");
    showToast(`Uploading ${files.length} files...`);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            newFileNames.forEach(name => {
                if (!state.selectedFiles.includes(name)) {
                    state.selectedFiles.push(name);
                }
            });

            showToast("Successful upload and indexing!");
            
            await loadMultiSelect('files', 'files-list', 'files', 'selectedFiles', 'files-display', true, 'file');
            
            updateMultiSelectDisplays();
        } else {
            const errData = await response.json();
            showToast("Error: " + (errData.detail || "Upload failed"), true);
        }
    } catch (err) {
        console.error("Upload error:", err);
        showToast("Server connection lost", true);
    } finally {
        setStatus("READY");
        input.value = ''; 
    }
}

let selectionTooltip = null;

document.addEventListener('DOMContentLoaded', () => {
   
    window.linkContextMenu = document.createElement('div');
    window.linkContextMenu.id = 'link-context-menu';
    window.linkContextMenu.className = 'fixed hidden z-[99999] border border-[#D4A373]/30 shadow-xl rounded-md overflow-hidden transition-opacity duration-200 flex-col bg-[#FDFBF7]';
    
    window.linkContextMenu.innerHTML = `
        <div id="link-menu-buttons" class="flex flex-col divide-y divide-[#D4A373]/20">
            <button onclick="handleLinkAction('open_inside')" class="px-4 py-2 text-left text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all text-[11px] font-mono font-bold uppercase flex items-center gap-3">
                <i class="fa-solid fa-window-maximize w-3 text-center"></i> Open Inside
            </button>
            <button onclick="handleLinkAction('open_outside')" class="px-4 py-2 text-left text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all text-[11px] font-mono font-bold uppercase flex items-center gap-3">
                <i class="fa-solid fa-external-link-alt w-3 text-center"></i> Open Outside
            </button>
            <button onclick="handleLinkAction('edit')" class="px-4 py-2 text-left text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all text-[11px] font-mono font-bold uppercase flex items-center gap-3">
                <i class="fa-solid fa-pen w-3 text-center"></i> Edit Link
            </button>
            <button onclick="handleLinkAction('unlink')" class="px-4 py-2 text-left text-red-500 hover:bg-red-50 hover:text-red-700 active:scale-95 transition-all text-[11px] font-mono font-bold uppercase flex items-center gap-3">
                <i class="fa-solid fa-unlink w-3 text-center"></i> Unlink
            </button>
        </div>

        <div id="link-edit-inline-container" class="hidden items-center p-1 gap-2 h-10 border-t border-[#D4A373]/30 bg-[#FDFBF7]">
            <div class="flex-1 flex items-center bg-white border border-[#D4A373]/50 rounded px-2 focus-within:border-[#D4A373] transition-all h-full shadow-sm min-w-[220px]">
                <i class="fa-solid fa-link text-[#D4A373] mr-2 text-xs"></i>
                <input id="edit-existing-link-field" type="text" class="flex-1 bg-transparent text-[12px] font-mono outline-none text-[#3E2723]" onkeydown="if(event.key === 'Enter') handleLinkAction('save_edit')">
            </div>
            <button onclick="handleLinkAction('save_edit')" class="h-full px-3 bg-[#D4A373] text-white rounded hover:bg-[#BCA07D] active:scale-95 transition-all text-[11px] font-black uppercase font-mono tracking-wider shrink-0">Save</button>
            <button onclick="handleLinkAction('cancel_edit')" class="h-full w-8 flex items-center justify-center bg-[#FDFBF7] text-[#D4A373] border border-[#D4A373]/40 rounded hover:bg-red-500 hover:text-white active:scale-95 transition-all shrink-0"><i class="fa-solid fa-xmark text-sm"></i></button>
        </div>
    `;
    document.body.appendChild(window.linkContextMenu);

    selectionTooltip = document.createElement('div');
    selectionTooltip.id = 'selection-tooltip';
    selectionTooltip.className = 'fixed hidden z-[9999] bg-[#FDFBF7] border border-[#D4A373]/40 shadow-2xl rounded-md flex flex-col overflow-hidden transition-opacity duration-200';
    
    selectionTooltip.innerHTML = `
        <div class="flex divide-x divide-[#D4A373]/30 h-9 bg-[#FDFBF7] border-b border-[#D4A373]/30 relative z-20">
            <button onclick="handleSelectionAction('copy')" class="px-3 py-2 text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-copy"></i> Copy</button>
            <button onclick="handleSelectionAction('ask_here')" class="px-3 py-2 text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-reply"></i> Ask Here</button>
            <button onclick="handleSelectionAction('ask_elsewhere')" class="px-3 py-2 text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-share-from-square"></i> Ask Elsewhere</button>
            <button onclick="handleSelectionAction('summary')" class="px-3 py-2 text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-compress"></i> Summary</button>
            <button onclick="handleSelectionAction('explain')" class="px-3 py-2 text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-lightbulb"></i> Explain</button>
            
            <button id="btn-selection-more" onclick="toggleSelectionMore(event)" class="px-3 py-2 text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center justify-center">
                <i class="fa-solid fa-chevron-down transition-transform duration-200" id="more-chevron"></i>
            </button>
        </div>

        <div id="selection-more-menu" class="divide-y divide-[#D4A373]/20 bg-[#FDFBF7] relative z-10">
            <button onclick="handleSelectionAction('find_inside')" class="w-full px-3 py-2 text-left bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-globe w-4 text-center"></i> Find Inside</button>
            <button onclick="handleSelectionAction('find_outside')" class="w-full px-3 py-2 text-left bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-brands fa-google w-4 text-center"></i> Find Outside</button>
            <button id="btn-mark-code" onclick="handleSelectionAction('mark_code')" class="w-full px-3 py-2 text-left bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-code w-4 text-center"></i> Mark as Code</button>
            <button id="btn-mark-text" onclick="handleSelectionAction('mark_text')" class="w-full px-3 py-2 text-left bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-font w-4 text-center"></i> Mark as Text</button>
            <button id="btn-erase" onclick="handleSelectionAction('erase')" class="w-full px-3 py-2 text-left bg-[#FDFBF7] text-red-500 hover:bg-red-50 hover:text-red-700 active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-eraser w-4 text-center"></i> Erase</button>
            <button id="btn-link-it" onclick="handleSelectionAction('link_it')" class="w-full px-3 py-2 text-left bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-link w-4 text-center"></i> Link It</button>
            <button id="btn-regen" onclick="handleSelectionAction('regen')" class="w-full px-3 py-2 text-left bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-arrows-rotate w-4 text-center"></i> Regen Selected (and tell in what way)</button>
            <button id="btn-expand" onclick="handleSelectionAction('expand')" class="w-full px-3 py-2 text-left bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-expand w-4 text-center"></i> Expand Selected (and tell in what way)</button>
            <button onclick="handleSelectionAction('astral')" class="px-3 py-2 text-[#D4A373] hover:bg-[#D4A373]/10 hover:text-[#3E2723] active:scale-95 transition-all flex items-center gap-2 text-[12px] font-mono font-bold uppercase"><i class="fa-solid fa-wand-magic-sparkles"></i> Astral Projection</button>
        </div>

        <div id="link-input-container" class="hidden flex items-center p-1 bg-[#FDFBF7] gap-2 h-10 border-t border-[#D4A373]/30">
            <div class="flex-1 flex items-center bg-white border border-[#D4A373]/50 rounded px-2 focus-within:border-[#D4A373] transition-all h-full shadow-sm">
                <i class="fa-solid fa-link text-[#D4A373] mr-2 text-xs"></i>
                <input id="link-url-field" type="text" placeholder="https://..." class="flex-1 bg-transparent text-[12px] font-mono outline-none text-[#3E2723]" onkeydown="if(event.key === 'Enter') applyLinkIt()">
            </div>
            <button onclick="applyLinkIt()" class="h-full px-3 bg-[#D4A373] text-white rounded hover:bg-[#BCA07D] active:scale-95 transition-all text-[12px] font-black uppercase font-mono tracking-wider shrink-0">Save</button>
            <button onclick="cancelLinkIt()" class="h-full w-8 flex items-center justify-center bg-[#FDFBF7] text-[#D4A373] border border-[#D4A373]/40 rounded hover:bg-red-500 hover:text-white active:scale-95 transition-all shrink-0"><i class="fa-solid fa-xmark text-sm"></i></button>
        </div>
    `;

        
    document.body.appendChild(selectionTooltip);
});

window.toggleSelectionMore = function(e) {
    if (e) e.stopPropagation();
    const moreMenu = document.getElementById('selection-more-menu');
    const chevron = document.getElementById('more-chevron');
    const tooltip = document.getElementById('selection-tooltip');
    
    const isHidden = moreMenu.style.display === 'none' || moreMenu.style.display === '';
    
    moreMenu.style.display = isHidden ? 'flex' : 'none';
    chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';

    if (isHidden && tooltip) {
        requestAnimationFrame(() => {
            const rect = tooltip.getBoundingClientRect();
            if (rect.bottom > window.innerHeight) {
                const overflow = rect.bottom - window.innerHeight + 15;
                const currentTop = parseFloat(tooltip.style.top);
                tooltip.style.top = `${Math.max(10, currentTop - overflow)}px`;
            }
        });
    }
};

document.addEventListener('mousedown', (e) => {
    if (selectionTooltip && !selectionTooltip.contains(e.target)) {
        selectionTooltip.classList.add('hidden');
    }
});

document.addEventListener('mouseup', (e) => {
    if (selectionTooltip && selectionTooltip.contains(e.target)) return;

    let text = "";
    let isInsideCodeTextarea = false;

    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'TEXTAREA') {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (start !== end) {
            text = activeEl.value.substring(start, end).trim();
            if (text !== '') {
                isInsideCodeTextarea = true;
                window.lastActiveTextarea = activeEl;
            }
        }
    } 
    
    if (!isInsideCodeTextarea) {
        const selection = window.getSelection();
        text = selection.toString().trim();
    }
    
    let isInsideChat = false;
    let isInsideBrowser = false;
    let isInsideCode = false;

    if (isInsideCodeTextarea) {
        isInsideChat = activeEl.closest('#chat-container') !== null;
        isInsideBrowser = activeEl.closest('#browser-content-area') !== null;
    } else if (window.getSelection().rangeCount > 0) {
        let node = window.getSelection().anchorNode;
        if (node && node.nodeType === 3) node = node.parentElement;
        if (node) {
            isInsideChat = node.closest('#chat-container') !== null;
            isInsideBrowser = node.closest('#browser-content-area') !== null;
            isInsideCode = node.closest('pre code') !== null;
        }
    }

    if ((!isInsideChat && !isInsideBrowser) || text === '') {
        if (selectionTooltip) selectionTooltip.classList.add('hidden');
        return;
    }

    window.currentSelectedTextForActions = text;

    const eraseBtn = document.getElementById('btn-erase');
    const markCodeBtn = document.getElementById('btn-mark-code');
    const markTextBtn = document.getElementById('btn-mark-text');
    const linkBtn = document.getElementById('btn-link-it');
    const regenBtn = document.getElementById('btn-regen');
    const expandBtn = document.getElementById('btn-expand');
    const moreMenu = document.getElementById('selection-more-menu');
    const moreChevron = document.getElementById('more-chevron');

    if (isInsideBrowser) {
        if (eraseBtn) eraseBtn.style.display = 'none';
        if (markCodeBtn) markCodeBtn.style.display = 'none';
        if (markTextBtn) markTextBtn.style.display = 'none';
        if (linkBtn) linkBtn.style.display = 'none';
        if (regenBtn) regenBtn.style.display = 'none';
        if (expandBtn) expandBtn.style.display = 'none';
    } else {
        if (isInsideCodeTextarea) {
            if (eraseBtn) eraseBtn.style.display = 'none';
            if (linkBtn) linkBtn.style.display = 'none';
            if (regenBtn) regenBtn.style.display = 'none';
            if (expandBtn) expandBtn.style.display = 'none';
            if (markCodeBtn) markCodeBtn.style.display = 'none';
            if (markTextBtn) markTextBtn.style.display = 'none';
        } else {
            if (eraseBtn) eraseBtn.style.display = 'flex';
            if (linkBtn) linkBtn.style.display = 'flex';
            if (regenBtn) regenBtn.style.display = 'flex';
            if (expandBtn) expandBtn.style.display = 'flex';
            
            if (markCodeBtn) markCodeBtn.style.display = isInsideCode ? 'none' : 'flex';
            if (markTextBtn) markTextBtn.style.display = isInsideCode ? 'flex' : 'none';
        }
    }

    if (moreMenu) moreMenu.style.display = 'none';
    if (moreChevron) moreChevron.style.transform = 'rotate(0deg)';

    selectionTooltip.classList.remove('hidden');
    
    let top, left;
    const tooltipWidth = selectionTooltip.offsetWidth;
    const tooltipHeight = selectionTooltip.offsetHeight;

    if (isInsideCodeTextarea) {
        top = e.clientY - tooltipHeight - 15;
        left = e.clientX - (tooltipWidth / 2);
    } else {
        const range = window.getSelection().getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        if (rect.height > 80 || rect.top < 0) {
            top = e.clientY - tooltipHeight - 15;
            left = e.clientX - (tooltipWidth / 2);
        } else {
            top = rect.top - tooltipHeight - 12; 
            left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
        }
    }

    if (top < 0) top = e.clientY + 20; 
    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth) left = window.innerWidth - tooltipWidth - 10;

    selectionTooltip.style.top = `${top}px`;
    selectionTooltip.style.left = `${left}px`;
});

async function handleSelectionAction(action) {
    let text = window.getSelection().toString().trim();
    
    if (!text && window.currentSelectedTextForActions) {
        text = window.currentSelectedTextForActions;
    }
    
    if (!text && window.currentIframeSelectionText) {
        text = window.currentIframeSelectionText;
    }

    if (!text) return;

    const input = document.getElementById('user-input');
    const selectionTooltip = document.getElementById('selection-tooltip');
    const moreMenu = document.getElementById('selection-more-menu');

    const selection = window.getSelection();
    let occurrenceIndex = 0;
    let markdownText = text; 
    
    window.savedTextBefore = "";
    window.savedTextAfter = "";

    if (selection.rangeCount > 0) {
        window.savedSelectionRange = selection.getRangeAt(0);
        const range = window.savedSelectionRange;
        let container = range.commonAncestorContainer;
        if (container.nodeType === 3) container = container.parentElement;
        
        let anchor = container.closest('a.chat-link');
        if (!anchor) {
            const div = document.createElement('div');
            div.appendChild(range.cloneContents());
            const linkInSel = div.querySelector('a.chat-link');
            if (linkInSel && linkInSel.innerText.trim() === text) {
                anchor = linkInSel;
            }
        }
        
        if (anchor && anchor.innerText.trim() === text) {
            markdownText = anchor.getAttribute('data-raw-md') || text;
        }
        
        const msgContent = container.closest('.msg-content');
        if (msgContent && text) {
            const preRange = document.createRange();
            preRange.setStart(msgContent, 0);
            preRange.setEnd(range.startContainer, range.startOffset);
            const preText = preRange.toString();
            
            window.savedTextBefore = preText;
            
            const postRange = document.createRange();
            postRange.setStart(range.endContainer, range.endOffset);
            postRange.setEnd(msgContent, msgContent.childNodes.length);
            window.savedTextAfter = postRange.toString();
            
            let pos = preText.indexOf(text);
            while (pos !== -1) {
                occurrenceIndex++;
                pos = preText.indexOf(text, pos + text.length);
            }
        }
    }
    window.savedOccurrenceIndex = occurrenceIndex; 
    window.savedMarkdownText = markdownText; 
    
    if (selectionTooltip) selectionTooltip.classList.add('hidden');
    if (moreMenu) moreMenu.style.display = 'none';
    const moreChevron = document.getElementById('more-chevron');
    if (moreChevron) moreChevron.style.transform = 'rotate(0deg)';
    
    selection.removeAllRanges(); 
    window.currentIframeSelectionText = "";

    switch (action) {
        case 'copy':
            window.isSystemCopy = true;

            if (typeof window.saveToClipboardDb === 'function') {
                window.saveToClipboardDb(text, 'copied');
            }

            navigator.clipboard.writeText(text).then(() => {
                if (typeof showToast === 'function') showToast("Text copied!");
                
                setTimeout(() => window.isSystemCopy = false, 500);
            }).catch(err => {
                console.warn("Clipboard blocked", err);
                window.isSystemCopy = false;
            });
            break;

        case 'ask_here':
            if (!input) return;
            input.value = input.value.trim() ? `${input.value.trim()}\n\n"${text}"\n` : `"${text}"\n`;
            input.focus();
            if (typeof autoResize === 'function') autoResize(input);
            break;

        case 'ask_elsewhere':
            if (!input) return;
            if (state?.tabs && state.activeTabId) {
                const currentTab = state.tabs.find(t => t.id === state.activeTabId);
                if (currentTab) currentTab.draftText = input.value;
            }
            if (typeof addNewTab === 'function') {
                await addNewTab(); 
                const newInput = document.getElementById('user-input');
                if (newInput) {
                    newInput.value = `"${text}"\n`;
                    newInput.focus();
                    if (typeof autoResize === 'function') autoResize(newInput);
                }
            }
            break;

        case 'summary':
            if (!input) return;
            input.value = `Please summarize:\n\n"${text}"`;
            if (typeof autoResize === 'function') autoResize(input);
            if (typeof sendMessage === 'function') sendMessage();
            break;

        case 'explain':
            if (!input) return;
            input.value = `Please analyze and explain in details:\n\n"${text}"`;
            if (typeof autoResize === 'function') autoResize(input);
            if (typeof sendMessage === 'function') sendMessage();
            break;

        case 'find_inside':
            const urlInput = document.getElementById('browser-url');
            if (urlInput) {
                urlInput.value = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
                if (typeof openMagiApp === 'function') openMagiApp('browser');
                if (typeof triggerSmartNavigate === 'function') triggerSmartNavigate();
                if (typeof showToast === 'function') showToast("Searching inside Webstral...");
            }
            break;

        case 'find_outside':
            window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank');
            if (typeof showToast === 'function') showToast("Searching in external browser...");
            break;

        case 'regen':
        case 'expand':
            let msgGroupInline = null;
            let isAIBubbleInline = false;
            
            if (window.savedSelectionRange) {
                let container = window.savedSelectionRange.commonAncestorContainer;
                if (container.nodeType === 3) container = container.parentElement; 
                msgGroupInline = container.closest('.message-pair-group');
                isAIBubbleInline = container.closest('.chat-bubble-ai') !== null;
            }
            
            if (input) {
                input.value = text;
                input.focus();
                if (typeof autoResize === 'function') autoResize(input);
            }

            const rangeInline = window.savedSelectionRange;
            if (rangeInline) {
                const placeholder = document.createElement('span');
                placeholder.id = 'inline-generation-target';
                placeholder.className = 'bg-[#D4A373]/20 border-b-2 border-[#D4A373] text-[#8D6E63] italic px-1 animate-pulse';
                placeholder.innerText = "[ Editting... ]";
                rangeInline.deleteContents();
                rangeInline.insertNode(placeholder);
            }

            let baseIndex = msgGroupInline ? parseInt(msgGroupInline.getAttribute('data-msg-index')) : null;
            let exactTargetIndex = (baseIndex !== null && isAIBubbleInline) ? baseIndex + 1 : baseIndex;

            window.inlineEditingContext = {
                active: true,
                type: action,
                targetText: text,
                msgIndex: exactTargetIndex, 
                element: msgGroupInline,
                occurrenceIndex: window.savedOccurrenceIndex,
                textBefore: window.savedTextBefore, 
                textAfter: window.savedTextAfter  
            };
            break;

        case 'link_it':
            const linkForm = document.getElementById('link-input-container');
            const tooltipContainer = document.getElementById('selection-tooltip');
            const mainButtons = tooltipContainer ? tooltipContainer.querySelector('.flex.divide-x') : null;
            
            let linkGroup = null;
            if (window.savedSelectionRange) {
                let container = window.savedSelectionRange.commonAncestorContainer;
                if (container.nodeType === 3) container = container.parentElement; 
                linkGroup = container.closest('.message-pair-group');
            }
            
            window.linkTargetContext = {
                text: text,
                msgIndex: linkGroup ? linkGroup.getAttribute('data-msg-index') : null,
                occurrenceIndex: window.savedOccurrenceIndex 
            };

            if (linkForm && mainButtons && tooltipContainer) {
                tooltipContainer.classList.remove('hidden');
                linkForm.classList.remove('hidden');
                mainButtons.classList.add('hidden'); 
                
                const field = document.getElementById('link-url-field');
                field.value = "https://";
                field.focus();
            }
            return; 

        case 'mark_code':
            applyFormatting('code');
            break;

        case 'mark_text':
            applyFormatting('text');
            break;

        case 'erase':
            let eraseGroup = null;
            let isAIBubble = false;
            
            if (window.savedSelectionRange) {
                let container = window.savedSelectionRange.commonAncestorContainer;
                if (container.nodeType === 3) container = container.parentElement; 
                eraseGroup = container.closest('.message-pair-group');
                isAIBubble = container.closest('.chat-bubble-ai') !== null;
            }
            
            if (eraseGroup) {
                const msgIndex = eraseGroup.getAttribute('data-msg-index');
                if (msgIndex !== null) {
                    const targetIndex = isAIBubble ? parseInt(msgIndex) + 1 : parseInt(msgIndex);
                    
                    const textToRemove = window.savedMarkdownText || window.currentSelectedTextForActions || text;
                    
                    await modifyMessageMarkdown(targetIndex, textToRemove, "", window.savedOccurrenceIndex);
                    
                    if (typeof showToast === 'function') showToast("Text erased!");

                    const activeFile = window.currentSessionFile || state.currentSessionFile;
                    if (activeFile && typeof loadSession === 'function') {
                        const chatContainer = document.getElementById('chat-container');
                        const currentScroll = chatContainer ? chatContainer.scrollTop : 0;
                        
                        await loadSession(activeFile);
                        
                        if (chatContainer) {
                            requestAnimationFrame(() => {
                                chatContainer.scrollTop = currentScroll;
                            });
                        }
                    }

                } else {
                    if (typeof showToast === 'function') showToast("Error: Message index missing.", true);
                }
            } else {
                if (typeof showToast === 'function') showToast("Error: Text must be in a chat bubble.", true);
            }
            break;

            case 'astral':
            if (typeof addAstralCell === 'function') {
                addAstralCell(text, 'text', 'plaintext');
                if (typeof showToast === 'function') showToast("Added to Astral Projection! ✨");
                
                if (typeof restoreAstral === 'function') restoreAstral();
            }
            break;
    }
}

window.msgHistoryTracker = window.msgHistoryTracker || {};
window.isUndoRedoAction = false;

window.trackMessageChange = function(msgIndex, oldText, newText) {
    if (!window.msgHistoryTracker[msgIndex]) {
        window.msgHistoryTracker[msgIndex] = {
            states: [oldText], 
            currentPos: 0
        };
    }
    
    let tracker = window.msgHistoryTracker[msgIndex];
    
    if (tracker.currentPos < tracker.states.length - 1) {
        tracker.states = tracker.states.slice(0, tracker.currentPos + 1);
    }
    
    tracker.states.push(newText);
    tracker.currentPos++;
};

window.undoMessage = async function(btn) {
    const msgGroup = btn.closest('.message-pair-group');
    const aiIndex = parseInt(msgGroup.getAttribute('data-msg-index')) + 1;
    let tracker = window.msgHistoryTracker[aiIndex];
    
    if (tracker && tracker.currentPos > 0) {
        const currentText = tracker.states[tracker.currentPos];
        tracker.currentPos--;
        const previousText = tracker.states[tracker.currentPos];
        
        window.isUndoRedoAction = true;
        await modifyMessageMarkdown(aiIndex, currentText, previousText, 0);
        window.isUndoRedoAction = false;
        
        const activeFile = window.currentSessionFile || state.currentSessionFile;
        if (activeFile && typeof loadSession === 'function') {
            const chatContainer = document.getElementById('chat-container');
            const currentScroll = chatContainer ? chatContainer.scrollTop : 0;
            await loadSession(activeFile);
            if (chatContainer) requestAnimationFrame(() => chatContainer.scrollTop = currentScroll);
        }
        if (typeof showToast === 'function') showToast("Undo successful!");
    }
};

window.redoMessage = async function(btn) {
    const msgGroup = btn.closest('.message-pair-group');
    const aiIndex = parseInt(msgGroup.getAttribute('data-msg-index')) + 1;
    let tracker = window.msgHistoryTracker[aiIndex];
    
    if (tracker && tracker.currentPos < tracker.states.length - 1) {
        const currentText = tracker.states[tracker.currentPos];
        tracker.currentPos++;
        const nextText = tracker.states[tracker.currentPos];
        
        window.isUndoRedoAction = true;
        await modifyMessageMarkdown(aiIndex, currentText, nextText, 0);
        window.isUndoRedoAction = false;
        
        const activeFile = window.currentSessionFile || state.currentSessionFile;
        if (activeFile && typeof loadSession === 'function') {
            const chatContainer = document.getElementById('chat-container');
            const currentScroll = chatContainer ? chatContainer.scrollTop : 0;
            await loadSession(activeFile);
            if (chatContainer) requestAnimationFrame(() => chatContainer.scrollTop = currentScroll);
        }
        if (typeof showToast === 'function') showToast("Redo successful!");
    }
};

let isMaximized = false;
let preMaxState = { top: '', left: '', width: '', height: '' };

// Initiates navigation in the integrated browser to the URL currently entered in the input field.
function triggerSmartNavigate() {
    const urlInput = document.getElementById('browser-url');
    if (!urlInput) return;
    
    let query = urlInput.value.trim();
    if (!query) {
        query = "https://www.google.com";
    }

    let targetUrl = "";
    const hasProtocol = /^(http|https):\/\//i.test(query);
    const isPureLatin = /^[a-z0-9.-]+$/i.test(query);
    const domainRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
    const isDomain = isPureLatin && !/\s/.test(query) && domainRegex.test(query);

    if (hasProtocol) {
        targetUrl = query;
    } else if (isDomain) {
        targetUrl = "https://" + query;
    } else {
        targetUrl = "https://www.google.com/search?q=" + encodeURIComponent(query);
    }

    urlInput.value = targetUrl;
    console.log(" The browser sends navigation to:", targetUrl);

    if (typeof browserSocket !== 'undefined' && browserSocket && browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({ action: "goto", url: targetUrl }));
    } else {
        console.log("Open a new link to:", targetUrl);
        if (typeof connectBrowser === 'function') {
            connectBrowser(targetUrl);
        } else {
            console.error(" The connectBrowser function is missing.!");
        }
    }
}

// Global wrapper function to trigger navigation in the integrated browser.
window.navigateBrowser = function() {
    triggerSmartNavigate();
};

// Sends a command to the integrated browser WebSocket to navigate back in its history.
function browserGoBack() {
    if (typeof browserSocket !== 'undefined' && browserSocket?.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({ action: "go_back" }));
    }
}

// Sends a command to the integrated browser WebSocket to navigate forward in its history.
function browserGoForward() {
    if (typeof browserSocket !== 'undefined' && browserSocket?.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({ action: "go_forward" }));
    }
}

// Navigates the integrated browser to the default home page (e.g., Google).
function browserGoHome() {
    const urlInput = document.getElementById('browser-url');
    if (urlInput) {
        urlInput.value = "https://www.google.com";
    }
    triggerSmartNavigate(); 
}

window.addEventListener('resize', updateMaximizedBrowserSize);

// Adjusts the maximum width and height of the integrated browser window when it is maximized.
window.updateMaximizedBrowserSize = function(forcedWidth = null, instant = false) {
    const win = document.getElementById('browser-window');
    
    if (!win || win.classList.contains('hidden') || win.style.display === 'none') {
        return;
    }

    if (typeof isMaximized !== 'undefined' && isMaximized) {
        const sidebar = document.getElementById('sidebar'); 
        const tabsContainer = document.getElementById('tabs-container');
        const topTabsHeight = tabsContainer ? tabsContainer.offsetHeight : 40;
        
        let sidebarWidth = 60;
        if (forcedWidth !== null) {
            sidebarWidth = forcedWidth;
        } else if (sidebar && !sidebar.classList.contains('hidden')) {
            sidebarWidth = sidebar.classList.contains('collapsed-mode') ? 60 : sidebar.offsetWidth;
        }
        
        if (instant) {
            win.style.transition = 'none'; 
        } else {
            win.style.transition = 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s ease, height 0.3s ease';
        }

        win.style.position = 'fixed'; 
        win.style.left = `${sidebarWidth}px`; 
        win.style.width = `calc(100vw - ${sidebarWidth}px)`;
        win.style.top = `${topTabsHeight}px`; 
        win.style.bottom = '0px'; 
        win.style.height = 'auto'; 
        win.style.margin = '0'; 
        win.style.boxSizing = 'border-box';
    }
};

// Toggles the integrated browser window between its maximized state and its standard windowed state.
window.toggleMaximizeBrowser = function() {
    const win = document.getElementById('browser-window');
    const icon = document.getElementById('maximize-icon');
    
    if (!win || win.classList.contains('hidden') || win.style.display === 'none') return;

    if (!isMaximized) {
        window.preMaxState = { 
            top: win.style.top, 
            left: win.style.left, 
            width: win.style.width, 
            height: win.style.height 
        };
        
        isMaximized = true;
        window.updateMaximizedBrowserSize(null, false);
        
        win.style.borderRadius = '0';
        win.classList.remove('shadow-2xl', 'z-[200]');
        win.classList.add('z-[100]'); 
        
        if (icon) icon.className = 'fa-regular fa-window-restore';

        clearTimeout(win.transitionTimeout);
        win.transitionTimeout = setTimeout(() => { if (win && isMaximized) win.style.transition = 'none'; }, 300);
        
    } else {
        isMaximized = false;
        
        win.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'; 
        win.style.position = 'absolute'; 
        win.style.bottom = ''; 
        win.style.margin = '';

        let w = window.preMaxState ? window.preMaxState.width : '';
        let h = window.preMaxState ? window.preMaxState.height : '';
        let t = window.preMaxState ? window.preMaxState.top : '';
        let l = window.preMaxState ? window.preMaxState.left : '';

        if (!w || w.includes('calc') || w.includes('vw') || w === '100%') w = '850px';
        if (!h || h.includes('calc') || h.includes('vh') || h === '100%') h = '550px';
        if (!t) t = '120px';
        if (!l) l = 'calc(50% - 425px)'; 

        win.style.width = w;
        win.style.height = h;
        win.style.top = t;
        win.style.left = l;
        
        win.style.borderRadius = '0.5rem';
        win.classList.add('shadow-2xl', 'z-[200]');
        win.classList.remove('z-[100]'); 
        
        if (icon) icon.className = 'fa-regular fa-window-maximize';
        
        clearTimeout(win.transitionTimeout);
        win.transitionTimeout = setTimeout(() => { if (win && !isMaximized) win.style.transition = 'none'; }, 300);
    }
    
    if (typeof syncMainUIVisibility === 'function') syncMainUIVisibility();
};

window.addEventListener('resize', updateMaximizedBrowserSize);

            updateMaximizedBrowserSize();

const browserWin = document.getElementById('browser-window');
const browserHeader = document.getElementById('browser-header');
let isDraggingWin = false, dragStartX, dragStartY, initialX, initialY;

if (browserHeader) {
    browserHeader.addEventListener('dblclick', (e) => {
        if (!e.target.closest('button')) {
            toggleMaximizeBrowser();
        }
    });
}

if (browserHeader && browserWin) {
    browserHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || (typeof isMaximized !== 'undefined' && isMaximized)) return; 
        if (browserWin.classList.contains('hidden')) return;

        isDraggingWin = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        
        const rect = browserWin.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        
        browserWin.style.right = 'auto'; 
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingWin) return;
        
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        
        let newTop = initialY + dy;
        let newLeft = initialX + dx;
        
        const maxLeft = window.innerWidth - browserWin.offsetWidth;
        const maxTop = window.innerHeight - browserWin.offsetHeight;
        
        if (newTop < 0) newTop = 0; 
        if (newTop > maxTop) newTop = maxTop; 
        
        if (newLeft < 0) newLeft = 0; 
        if (newLeft > maxLeft) newLeft = maxLeft; 
        
        browserWin.style.left = newLeft + 'px';
        browserWin.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDraggingWin = false;
    });
}

 /**
 * Opens a specific application within the Magi ecosystem
 * @param {string} app - The name of the application to open
 */

function openMagiApp(app) {
    const appsMenu = document.getElementById('apps-menu');
    if (appsMenu) {
        appsMenu.classList.add('hidden');
        appsMenu.style.display = 'none'; 
    }

    if (app === 'browser') {
        state.browserActive = true;
        
        const isFirstLaunch = (typeof browserSocket === 'undefined' || !browserSocket || browserSocket.readyState !== WebSocket.OPEN);

        if (typeof restoreBrowser === 'function') {
            restoreBrowser();
        }

        if (isFirstLaunch) {
            if (typeof isMaximized !== 'undefined' && !isMaximized) {
                if (typeof toggleMaximizeBrowser === 'function') {
                    toggleMaximizeBrowser(); 
                }
            }
            
            const urlInput = document.getElementById('browser-url');
            if (urlInput && !urlInput.value.trim()) {
                urlInput.value = "https://www.google.com";
            }
            if (typeof triggerSmartNavigate === 'function') {
                triggerSmartNavigate();
            }
        }
    } 
    else if (app === 'filemanager') {
        state.fmActive = true; 

        if (typeof restoreFileManager === 'function') {
            restoreFileManager();
        }
        
        if (typeof fmLoadDirectory === 'function') {
            fmLoadDirectory(currentFmPath || 'Root'); 
        }
        if (typeof fmLoadSidebar === 'function') {
            fmLoadSidebar();
        }
    }
    else if (app === 'docstral') {
        if (typeof restoreDocstral === 'function') {
            restoreDocstral();
        }

        const firstPage = document.querySelector('.docstral-page');
        if (firstPage) firstPage.focus();
    }
}

const resizers = document.querySelectorAll('.resizer');
let currentResizerDir, origX, origY, origW, origH, origL, origT, targetWindow;

resizers.forEach(resizer => {
    resizer.addEventListener('mousedown', (e) => {
        targetWindow = e.target.closest('#browser-window, #fm-window, #astral-window, #docstral-window');
        if (targetWindow.id === 'astral-window' && astralIsMaximized) return; 

        if (targetWindow.id === 'browser-window' && typeof isMaximized !== 'undefined' && isMaximized) return; 
        if (targetWindow.id === 'fm-window' && typeof fmIsMaximized !== 'undefined' && fmIsMaximized) return;

        e.preventDefault();
        
        currentResizerDir = e.target.getAttribute('data-dir');
        origX = e.clientX;
        origY = e.clientY;
        
        origW = targetWindow.offsetWidth;
        origH = targetWindow.offsetHeight;
        origL = targetWindow.offsetLeft;
        origT = targetWindow.offsetTop;
        
        document.addEventListener('mousemove', resizeWindow);
        document.addEventListener('mouseup', stopResizeWindow);
    });
});

function resizeWindow(e) {
    if (!currentResizerDir || !targetWindow) return;
    
    const dx = e.clientX - origX;
    const dy = e.clientY - origY;
    
    const minW = 600; 
    const minH = 400;
    const minTop = 60; 

    if (currentResizerDir.includes('e')) {
        const newW = origW + dx;
        if (newW >= minW) targetWindow.style.width = newW + 'px';
    }
    
    if (currentResizerDir.includes('s')) {
        const newH = origH + dy;
        if (newH >= minH) targetWindow.style.height = newH + 'px';
    }
    
    if (currentResizerDir.includes('w')) {
        const newW = origW - dx;
        if (newW >= minW) { 
            targetWindow.style.width = newW + 'px'; 
            targetWindow.style.left = (origL + dx) + 'px'; 
        }
    }
    
    if (currentResizerDir.includes('n')) {
        const newH = origH - dy;
        const newT = origT + dy;
        
        if (newH >= minH && newT >= minTop) { 
            targetWindow.style.height = newH + 'px'; 
            targetWindow.style.top = newT + 'px'; 
        } else if (newT < minTop) {
            targetWindow.style.top = minTop + 'px';
            targetWindow.style.height = (origH + (origT - minTop)) + 'px';
        }
    }
}

function stopResizeWindow() {
    currentResizerDir = null;
    targetWindow = null; 
    document.removeEventListener('mousemove', resizeWindow);
    document.removeEventListener('mouseup', stopResizeWindow);
}

let browserSocket = null;
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

// Establishes a WebSocket connection to stream the remote browser view onto a local HTML5 canvas.
function connectBrowser(url) {
    const canvas = document.getElementById('browser-canvas');
    const ctx = canvas.getContext('2d');
    const loader = document.getElementById('browser-loader');
    
    canvas.width = VIEWPORT_WIDTH;
    canvas.height = VIEWPORT_HEIGHT;
    
    if (loader) {
        loader.classList.remove('hidden');
        loader.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-4xl mb-3"></i><p class="font-mono text-xs">Connecting to a virtual machine...</p>`;
    }

    if (browserSocket) {
        browserSocket.close();
    }

    browserSocket = new WebSocket(`ws://${window.location.host}/ws/browser`);

    browserSocket.onopen = () => {
        if (loader) loader.classList.add('hidden'); 
        
        
        browserSocket.send(JSON.stringify({ 
            action: "goto", 
            url: url,
        }));
    };

    let contextTimeout = null;

    browserSocket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === "server_shutdown") {
                console.log("Server is shutting down. Force refresh (F5) to release Playwright...");
                setTimeout(() => {
                    window.location.reload(true); 
                }, 100);
                return; 
            }

            if (msg.type === "frame") {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                };
                img.src = "data:image/jpeg;base64," + msg.data;
            } 
            
            else if (msg.type === "selection_result") {
                const urlInput = document.getElementById('browser-url');
                const currentUrl = urlInput ? urlInput.value : "Unknown website";
                
                if (typeof state !== 'undefined' && msg.page_context) {
                    state.currentBrowserContext = `Website information [${currentUrl}]:\n\n${msg.page_context}`;
                }
                
                const text = msg.text;
                const rect = msg.rect; 
                
                if (text && text.trim() !== "") {
                    window.currentIframeSelectionText = text; 
                    if (typeof showCanvasTooltip === 'function') showCanvasTooltip(rect);
                } else {
                    if (typeof selectionTooltip !== 'undefined' && selectionTooltip) {
                        selectionTooltip.classList.add('hidden');
                    }
                }
            }
            
            else if (msg.type === "export_result") {
                try {
                    const link = document.createElement('a');
                    link.href = 'data:image/png;base64,' + msg.data;
                    link.download = msg.filename || 'webstral_screenshot.png';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    if (typeof showToast === 'function') showToast("PNG downloaded successfully!");
                } catch (err) {
                    console.error("Error saving PNG:", err);
                    if (typeof showToast === 'function') showToast("Error saving PNG!", true);
                }
            }
            
            else if (msg.type === "url_changed") {
                const urlInput = document.getElementById('browser-url');
                if (urlInput) {
                    if (msg.url !== "about:blank") {
                        urlInput.value = msg.url; 
                        if (typeof updateSpaceHistory === 'function') updateSpaceHistory(msg.url);
                        if (typeof saveUrlToBackendFile === 'function') saveUrlToBackendFile(msg.url);
                    } else {
                        urlInput.value = "";
                    }
                }
                
                if (typeof contextTimeout !== 'undefined' && contextTimeout) clearTimeout(contextTimeout);
                window.contextTimeout = setTimeout(() => {
                    if (typeof browserSocket !== 'undefined' && browserSocket?.readyState === WebSocket.OPEN) {
                        browserSocket.send(JSON.stringify({ action: "get_full_context" }));
                    }
                }, 2000);
            }
            
            else if (msg.type === "full_context_result") {
                window.currentBrowserPageText = msg.text;
                
                if (typeof state !== 'undefined' && state !== null && 
                    state.activeTab !== null && state.spaces && 
                    state.spaces[state.activeTab]) {
                    
                    state.spaces[state.activeTab].browserRawText = msg.text;
                    if (typeof saveState === 'function') saveState();
                }
            }
            
        } catch (error) {
            console.error("Error processing message from browser:", error);
        }
    };

    browserSocket.onerror = (e) => {
        console.error("WebSocket error", e);
        if (loader) {
            loader.classList.remove('hidden');
            loader.innerHTML = `<p class="text-red-500 font-mono text-xs">Connection error.</p>`;
        }
    };
    
    if (typeof setupCanvasEvents === 'function') setupCanvasEvents(canvas);
}

// Formats the user's input URL with HTTPS if needed, and initiates navigation in the remote browser context.
function navigateBrowser() {
    let url = document.getElementById('browser-url').value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
        document.getElementById('browser-url').value = url;
    }
    
    if (browserSocket && browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({ action: "goto", url: url }));
    } else {
        connectBrowser(url);
    }
}

// Attaches mouse and keyboard interaction event listeners to the remote browser canvas element.
function setupCanvasEvents(canvas) {
    if (canvas.dataset.eventsAttached === "true") return;
    canvas.dataset.eventsAttached = "true";

    function getScaledCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
            rawX: e.clientX,
            rawY: e.clientY
        };
    }

    let lastMoveTime = 0;
    let lastScrollTime = 0;

    canvas.addEventListener('mousemove', (e) => {
        if (browserSocket?.readyState === WebSocket.OPEN) {
            const now = Date.now();
            if (now - lastMoveTime > 50) { 
                const coords = getScaledCoords(e);
                browserSocket.send(JSON.stringify({ action: "mousemove", x: coords.x, y: coords.y }));
                lastMoveTime = now;
            }
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        if (browserSocket?.readyState === WebSocket.OPEN) {
            browserSocket.send(JSON.stringify({ action: "mousedown" }));
            if (selectionTooltip) selectionTooltip.classList.add('hidden');
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (browserSocket?.readyState === WebSocket.OPEN) {
            browserSocket.send(JSON.stringify({ action: "mouseup" }));
            
            const coords = getScaledCoords(e);
            browserSocket.send(JSON.stringify({ 
                action: "get_selection",
                rect: { left: coords.rawX, top: coords.rawY, width: 0, bottom: coords.rawY } 
            }));
        }
    });

    canvas.addEventListener('click', (e) => {
        if (browserSocket?.readyState === WebSocket.OPEN) {
            canvas.focus(); 
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (browserSocket?.readyState === WebSocket.OPEN) {
            const now = Date.now();
            if (now - lastScrollTime > 50) {
                browserSocket.send(JSON.stringify({ action: "scroll", deltaY: e.deltaY }));
                lastScrollTime = now;
            }
        }
    }, { passive: false });

    canvas.addEventListener('keydown', async (e) => {
        e.preventDefault();
        if (browserSocket?.readyState === WebSocket.OPEN) {
            
            const scrollKeys = ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
            if (scrollKeys.includes(e.key)) {
                browserSocket.send(JSON.stringify({ action: "shortcut", key: e.key }));
                return;
            }

            if (e.ctrlKey && (e.code === 'KeyC' || e.key === 'c' || e.key === 'с')) {
                if (window.currentIframeSelectionText) {
                    navigator.clipboard.writeText(window.currentIframeSelectionText).then(() => {
                        if (typeof showToast === 'function') showToast("Text copied!");
                    }).catch(err => console.warn("Local clipboard blocked:", err));
                }
                browserSocket.send(JSON.stringify({ action: "shortcut", key: "Control+c" }));
                return;
            }
            
            if (e.ctrlKey && (e.code === 'KeyA' || e.key === 'a' || e.key === 'а')) {
                browserSocket.send(JSON.stringify({ action: "shortcut", key: "Control+a" }));
                return;
            }
            
            if (e.ctrlKey && (e.code === 'KeyX' || e.key === 'x' || e.key === 'ч')) {
                browserSocket.send(JSON.stringify({ action: "shortcut", key: "Control+x" }));
                return;
            }

            if (e.ctrlKey && (e.code === 'KeyV' || e.key === 'v' || e.key === 'ж')) {
                try {
                    const localText = await navigator.clipboard.readText();
                    if (localText) {
                        browserSocket.send(JSON.stringify({ action: "paste", text: localText }));
                        return;
                    }
                } catch (err) {
                    console.warn("Local clipboard blocked, using remote.");
                }
                browserSocket.send(JSON.stringify({ action: "shortcut", key: "Control+v" }));
                return;
            }

            if (e.ctrlKey) {
                let keyName = e.code.startsWith('Key') ? e.code.replace('Key', '').toLowerCase() : e.key.toLowerCase();
                browserSocket.send(JSON.stringify({ action: "shortcut", key: `Control+${keyName}` }));
                return;
            }

            browserSocket.send(JSON.stringify({ action: "keydown", key: e.key }));
        }
    });
}

function showCanvasTooltip(rect) {
    if (!selectionTooltip) return;
    selectionTooltip.classList.remove('hidden');
    
    const tooltipWidth = selectionTooltip.offsetWidth;
    const tooltipHeight = selectionTooltip.offsetHeight;
    
    let top = rect.top - tooltipHeight - 15;
    let left = rect.left - (tooltipWidth / 2);

    if (top < 0) top = rect.top + 20;
    
    selectionTooltip.style.top = `${top}px`;
    selectionTooltip.style.left = `${left}px`;
}

const browserUI = document.getElementById('browser-window');

if (browserUI) {
    browserUI.addEventListener('mousedown', (event) => {
        event.stopPropagation();
    });
}

let browserBookmarks = JSON.parse(localStorage.getItem('magiBookmarks')) || [
    { id: 'bm_1', name: 'Mistral AI', url: 'https://mistral.ai' },
    { id: 'bm_2', name: 'Le Chat', url: 'https://chat.mistral.ai/chat' },
    { id: 'bm_3', name: 'Github', url: 'https://github.com' },
    { id: 'bm_4', name: 'Hugging Face', url: 'https://huggingface.co/mistralai' },
    { id: 'bm_5', name: 'Learn Anything', url: 'https://learn-anything.xyz' }
];

let editingBookmarkId = null;

// Renders the list of saved web bookmarks in the browser's bookmark bar UI.
function renderBookmarks() {
    const bar = document.getElementById('bookmarks-bar');
    if (!bar) return;
    
    bar.innerHTML = ''; 
    
    if (browserBookmarks.length === 0) {
        bar.innerHTML = '<span class="opacity-40 font-normal italic px-2 py-1">No bookmarks added.</span>';
        return;
    }

    browserBookmarks.forEach(bm => {
        const btn = document.createElement('button');
        btn.className = "flex items-center gap-1.5 px-3 py-1 hover:bg-[#D4A373]/15 rounded transition-all whitespace-nowrap shrink-0 border border-transparent hover:border-[#D4A373]/30 group cursor-pointer text-[#3E2723] hover:text-black text-[14px] font-medium";
        btn.title = bm.url + " (Right click to edit)";
        
        btn.onclick = () => {
            document.getElementById('browser-url').value = bm.url;
            triggerSmartNavigate();
        };
        
        btn.oncontextmenu = (e) => {
            e.preventDefault();
            openBookmarkModal(bm.id);
        };
        
        btn.innerHTML = `
            <i class="fa-solid fa-angle-right text-[#D4A373] group-hover:text-[#3E2723] transition-colors text-xs mt-[1px]"></i>
            <span class="truncate max-w-[150px] inline-block align-middle">${bm.name}</span>
        `;
        
        bar.appendChild(btn);
    });
}

// Opens the modal for adding a new bookmark or editing an existing one.
function openBookmarkModal(id = null) {
    const modal = document.getElementById('bookmark-modal');
    const title = document.getElementById('bm-modal-title');
    const nameInput = document.getElementById('bm-name');
    const urlInput = document.getElementById('bm-url');
    const delBtn = document.getElementById('bm-delete-btn');
    
    editingBookmarkId = id;
    
    if (id) {
        const bm = browserBookmarks.find(b => b.id === id);
        if (bm) {
            title.innerText = "Rename bookmark";
            nameInput.value = bm.name;
            urlInput.value = bm.url;
            delBtn.style.display = 'block';
        }
    } else {
        title.innerText = "Add a bookmark";
        const currentUrl = document.getElementById('browser-url').value;
        urlInput.value = currentUrl;
        
        let defaultName = "New website";
        try { 
            if(currentUrl) defaultName = new URL(currentUrl).hostname.replace('www.', ''); 
        } catch(e){}
        nameInput.value = defaultName;
        
        delBtn.style.display = 'none';
    }
    
    modal.classList.remove('hidden');
}

function closeBookmarkModal() {
    document.getElementById('bookmark-modal').classList.add('hidden');
    editingBookmarkId = null;
}

// Saves a new or updated bookmark configuration to the local browser storage.
function saveBookmark() {
    const name = document.getElementById('bm-name').value.trim() || "Bookmark";
    let url = document.getElementById('bm-url').value.trim();
    if (!url) return;
    
    if (!url.startsWith('http')) url = 'https://' + url;
    
    if (editingBookmarkId) {
        const bm = browserBookmarks.find(b => b.id === editingBookmarkId);
        if (bm) { bm.name = name; bm.url = url; }
        if (typeof showToast === 'function') showToast("The bookmark has been updated!");
    } else {
        browserBookmarks.push({ id: 'bm_' + Date.now(), name, url });
        if (typeof showToast === 'function') showToast("Bookmark added!");
    }
    
    localStorage.setItem('magiBookmarks', JSON.stringify(browserBookmarks));
    renderBookmarks();
    closeBookmarkModal();
}

// Deletes the currently selected bookmark from local storage and refreshes the UI.
function deleteBookmark() {
    if (!editingBookmarkId) return;
    browserBookmarks = browserBookmarks.filter(b => b.id !== editingBookmarkId);
    localStorage.setItem('magiBookmarks', JSON.stringify(browserBookmarks));
    renderBookmarks();
    closeBookmarkModal();
    if (typeof showToast === 'function') showToast("Bookmark deleted.");
}

renderBookmarks();

// Logs a newly visited URL into the browsing history of the currently active workspace tab.
function updateSpaceHistory(url) {
    if (!state || !state.tabs || !state.activeTabId) return;
    
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (!tab) return;
    
    if (!tab.browserHistory) tab.browserHistory = [];
    
    if (tab.browserHistory.length === 0 || tab.browserHistory[tab.browserHistory.length - 1] !== url) {
        tab.browserHistory.push(url);
        if (tab.browserHistory.length > 25) tab.browserHistory.shift(); 
        
        if (typeof renderHistoryDropdown === 'function') renderHistoryDropdown();
    }
    
    tab.browserUrl = url;
    if (typeof saveState === 'function') saveState();
}

function renderHistoryDropdown() {
    const list = document.getElementById('browser-history-list');
    if (!list || typeof state === 'undefined' || !state.activeTabId) return;
    
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    
    list.innerHTML = '';
    
    if (!tab || !tab.browserHistory || tab.browserHistory.length === 0) {
        list.innerHTML = '<span class="text-[10px] px-2 text-[#8D6E63]/60 italic">There is no history for this session..</span>';
        return;
    }
    
    const indexedHistory = tab.browserHistory.map((url, originalIndex) => ({
        url: url,
        index: originalIndex
    }));
    const reversedHistory = indexedHistory.reverse();
    
    reversedHistory.forEach(item => {
        const url = item.url;
        const originalIndex = item.index;

        let domain = url;
        try { domain = new URL(url).hostname.replace('www.', ''); } catch(e){}
        
        const itemDiv = document.createElement('div');
        itemDiv.className = "flex items-center justify-between w-full px-2 py-1.5 hover:bg-[#D4A373]/10 rounded transition-colors group mb-1";
        
        const navBtn = document.createElement('button');
        navBtn.className = "flex flex-col flex-1 text-left min-w-0 overflow-hidden cursor-pointer";
        navBtn.onclick = () => {
            document.getElementById('browser-url').value = url;
            if (typeof triggerSmartNavigate === 'function') triggerSmartNavigate();
            if (typeof closeAllDropdowns === 'function') closeAllDropdowns();
        };
        navBtn.innerHTML = `
            <span class="text-[11px] font-bold text-[#3E2723] group-hover:text-black truncate w-full">${domain}</span>
            <span class="text-[9px] font-mono text-[#8D6E63] truncate w-full opacity-70">${url}</span>
        `;
        
        const delBtn = document.createElement('button');
        delBtn.className = "ml-3 flex items-center justify-center w-6 h-6 bg-white border border-[#D4A373]/40 shadow-sm rounded text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all shrink-0 active:scale-95";
        delBtn.title = "Delete specific page";
        delBtn.onclick = (e) => {
            e.stopPropagation(); 
            if (typeof deleteHistoryItem === 'function') deleteHistoryItem(originalIndex);
        };
        delBtn.innerHTML = `<i class="fa-solid fa-xmark text-[10px]"></i>`;
        
        itemDiv.appendChild(navBtn);
        itemDiv.appendChild(delBtn);
        list.appendChild(itemDiv);
    });
}

async function deleteHistoryItem(index) {
    if (typeof state === 'undefined' || state.activeTabId === null) return;
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    
    if (tab && tab.browserHistory) {
        const sessionFile = window.currentSessionFile || state.currentSessionFile; 

        if (!sessionFile) {
            showToast("No active session to delete", true);
            return;
        }

        try {
            const response = await fetch(`/api/browser-history/delete-item?session_file=${sessionFile}&index=${index}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                tab.browserHistory.splice(index, 1);
                
                if (typeof saveState === 'function') saveState();
                renderHistoryDropdown(); 
                
                showToast("Page removed from history");
            } else {
                const err = await response.json();
                console.error("Backend error:", err);
                showToast("Server error while deleting", true);
            }
        } catch (err) {
            console.error("Network error:", err);
            showToast("The connection to the server has been lost.", true);
        }
    }
}

// Clears the entire browsing history strictly for the currently active tab or space.
async function clearSpaceHistory() {
    if (!state || !state.activeTabId) return;
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    
    if (!tab) return;
    
    if (!confirm("Do you want to clear the whole history?")) return;

    const sessionFile = window.currentSessionFile || state.currentSessionFile;

    if (sessionFile) {
        try {
            const response = await fetch(`/api/browser-history/clear?session_file=${sessionFile}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
                tab.browserHistory = [];
                renderHistoryDropdown();
                if (typeof saveState === 'function') saveState();
                showToast("History cleared!");
            } else {
                showToast("History clear from the server -error", true);
            }
        } catch (err) {
            console.error("History clear -error:", err);
            showToast("The connection to the server has been lost.", true);
        }
    } else {
        showToast("No active session", true);
    }
}

// Extracts the currently visible content or URL of the integrated browser to be used as AI context.
function getBrowserContextForAI() {
    const win = document.getElementById('browser-window');
    const bubble = document.getElementById('browser-bubble');
    
    if (!win || !bubble) return "";

    if (win.classList.contains('hidden') && bubble.classList.contains('hidden')) {
        return "";
    }
    
    if (typeof state !== 'undefined' && state.activeTabId !== null && state.tabs) {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        const text = (activeTab && activeTab.browserRawText) ? activeTab.browserRawText : (window.currentBrowserPageText || "");
        
        if (text.trim().length > 0) {
            const safeText = text.substring(0, 3000); 
            return `\n\n--- CURRENT BROWSER CONTEXT ---\n${safeText}\n---------------------------------------------\n`;
        }
    }
    return "";
}

function updateMaximizedBrowserSize(forcedWidth = null, instant = false) {
    const win = document.getElementById('browser-window');
    
    if (!win || win.classList.contains('hidden') || win.style.display === 'none') {
        return;
    }

    if (typeof isMaximized !== 'undefined' && isMaximized) {
        const sidebar = document.getElementById('sidebar'); 
        const tabsContainer = document.getElementById('tabs-container');
        const topTabsHeight = tabsContainer ? tabsContainer.offsetHeight : 40;
        
        let sidebarWidth = 0;
        if (forcedWidth !== null) {
            sidebarWidth = forcedWidth;
        } else if (sidebar && !sidebar.classList.contains('hidden')) {
            sidebarWidth = sidebar.classList.contains('collapsed-mode') ? 60 : sidebar.offsetWidth;
        }
        
        if (instant) {
            win.style.transition = 'none'; 
        } else if (forcedWidth !== null) {
            win.style.transition = 'left 0.3s ease-in-out, width 0.3s ease-in-out';
        } else {
            win.style.transition = 'none';
        }

        win.style.position = 'fixed'; 
        win.style.left = `${sidebarWidth}px`; 
        win.style.width = `calc(100vw - ${sidebarWidth}px)`;
        win.style.top = `${topTabsHeight}px`; 
        win.style.bottom = '0px'; 
        win.style.height = 'auto'; 
        win.style.margin = '0'; 
        win.style.boxSizing = 'border-box';

        if (!instant && forcedWidth !== null) {
            setTimeout(() => {
                if (isMaximized && win) win.style.transition = 'none';
            }, 300);
        }
    }
}

function syncMainUIVisibility() {
    const win = document.getElementById('browser-window');
    const isBrowserOpen = win && !win.classList.contains('hidden');
    
    if (isBrowserOpen && typeof isMaximized !== 'undefined' && isMaximized) {
        document.body.classList.add('hide-main-ui');
    } else {
        document.body.classList.remove('hide-main-ui');
    }
}

// Minimizes the integrated browser window and displays its floating bubble icon instead.
window.minimizeBrowser = function() {
    const win = document.getElementById('browser-window');
    const bubble = document.getElementById('browser-bubble');
    
    if (win) {
        win.style.display = ''; 
        win.classList.remove('flex');
        win.classList.add('hidden');
    }
    
    if (bubble) {
        bubble.style.display = ''; 
        bubble.classList.remove('hidden');
        bubble.classList.add('flex'); 
    }
    
    if (typeof syncMainUIVisibility === 'function') syncMainUIVisibility();

    if (typeof browserSocket !== 'undefined' && browserSocket && browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({ action: "pause_stream" }));
    }
};
function minimizeBrowser() { window.minimizeBrowser(); }

// Restores the integrated browser window from its minimized floating bubble state.
window.restoreBrowser = function() {
    const win = document.getElementById('browser-window');
    const bubble = document.getElementById('browser-bubble');
    
    if (win) {
        win.style.display = '';
        win.classList.remove('hidden');
        win.classList.add('flex');
        
        if (typeof isMaximized !== 'undefined' && isMaximized) {
            win.classList.add('z-[100]'); 
            if (typeof updateMaximizedBrowserSize === 'function') updateMaximizedBrowserSize(null, true);
        } else {
            win.classList.add('z-[200]');
            win.style.position = 'absolute';
            if (!win.style.width) win.style.width = '850px';
            if (!win.style.height) win.style.height = '550px';
        }
    }
    
    if (bubble) {
        bubble.style.display = 'none'; 
        bubble.classList.remove('flex');
        bubble.classList.add('hidden');
    }
    
    if (typeof syncMainUIVisibility === 'function') syncMainUIVisibility();

    if (typeof browserSocket !== 'undefined' && browserSocket && browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({ action: "resume_stream" }));
    }
};
function restoreBrowser() { window.restoreBrowser(); }

// Completely closes the integrated browser window and halts its active processes.
window.closeBrowser = function() {
    const win = document.getElementById('browser-window');
    const bubble = document.getElementById('browser-bubble');
    
    if (win) {
        win.style.display = 'none';
        win.classList.remove('flex');
        win.classList.add('hidden');
    }
    
    if (bubble) {
        bubble.style.display = 'none';
        bubble.classList.remove('flex');
        bubble.classList.add('hidden');
    }
    
    state.browserActive = false;

    if (typeof syncMainUIVisibility === 'function') syncMainUIVisibility();

    if (typeof browserSocket !== 'undefined' && browserSocket && browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({ action: "pause_stream" }));
    }
};
function closeBrowser() { window.closeBrowser(); }

window.addEventListener('click', function(e) {
    const win = document.getElementById('browser-window');
    const bubble = document.getElementById('browser-bubble');
    const appsBtn = document.querySelector('[onclick*="apps-menu"]');
    const appsMenu = document.getElementById('apps-menu');
    
    const themeBtn = document.querySelector('[onclick*="toggleTheme"]') || document.getElementById('theme-toggle');

    if (win && !win.classList.contains('hidden') && typeof isMaximized !== 'undefined' && !isMaximized) {
        const isClickInside = win.contains(e.target);
        const isClickOnBubble = bubble && bubble.contains(e.target);
        const isClickOnAppsBtn = appsBtn && appsBtn.contains(e.target);
        const isClickInsideAppsMenu = appsMenu && appsMenu.contains(e.target);
        
        const isClickOnTheme = themeBtn && themeBtn.contains(e.target);
        
        const isClickOnModal = e.target.closest('#bookmark-modal') || 
                               e.target.closest('#config-modal') || 
                               e.target.closest('#toast');
                               
        const isClickOnTab = e.target.closest('.tab-item') || e.target.closest('#tabs-container');

        if (!isClickInside && !isClickOnBubble && !isClickOnAppsBtn && 
            !isClickInsideAppsMenu && !isClickOnModal && !isClickOnTab && 
            !isClickOnTheme) { 
            minimizeBrowser(); 
        }
    }
});

async function saveUrlToBackendFile(url) {
    const sessionFile = window.currentSessionFile || (typeof state !== 'undefined' ? state.currentSessionFile : null);
    
    if (!sessionFile || !url || url === "about:blank") return;

    try {
        await fetch('/api/sessions/add-browser-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: sessionFile,
                url: url
            })
        });
    } catch (e) {
        console.error("Error writing history to JSON:", e);
    }
}

// Triggers an attempt to open the current integrated browser link in the user's default external OS browser.
function openOutside() {
    console.log(" MAGI System: Attempting to go outside...");

    const urlInput = document.getElementById('browser-url');
    
    if (!urlInput) {
        console.error(" Critical Error: 'browser-url' element not found in DOM.");
        return;
    }

    let targetUrl = urlInput.value.trim();

    if (!targetUrl || targetUrl === "" || targetUrl === "about:blank") {
        console.warn("Magi Navigation: No valid URL found in the address bar.");
        if (typeof showToast === 'function') showToast("Load page first!", true);
        return;
    }

    if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl;
    }

    console.log("Redirecting to external environment:", targetUrl);
    
    const newWindow = window.open(targetUrl, '_blank');

    if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') { 
        console.error("Security: Pop-up blocked by the browser.");
        if (typeof showToast === 'function') {
            showToast("Pop-up blocked! Allow pop-ups.", true);
        } else {
            alert("The browser is blocking the opening! Please allow pop-ups for this site..");
        }
    } else {
        if (typeof showToast === 'function') showToast("Opening in new tab...");
    }
}

let isScreenshotMode = false;
let screenStartX = 0, screenStartY = 0;
let currentScreenRect = null;

window.handleBrowserExport = function(exportType) {
    if (typeof closeAllDropdowns === 'function') closeAllDropdowns();

    if (exportType === 'selected') {
        startScreenshotSelection();
        return;
    }

    if (typeof showToast === 'function') showToast("Generating high-res PNG...");

    if (typeof browserSocket !== 'undefined' && browserSocket && browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({ action: "export_png", type: exportType }));
    } else {
        if (typeof showToast === 'function') showToast("Error: Browser not connected", true);
    }
};

// Activates the screenshot overlay mode, allowing the user to select a specific screen area to capture.
function startScreenshotSelection() {
    const overlay = document.getElementById('screenshot-overlay');
    const selectionBox = document.getElementById('screenshot-selection');
    const controls = document.getElementById('screenshot-controls');

    if (!overlay || !selectionBox || !controls) return;

    isScreenshotMode = true;
    overlay.classList.remove('hidden');
    selectionBox.classList.add('hidden');
    controls.classList.add('hidden');
    if (typeof showToast === 'function') showToast("Draw an area on the screen...");

    let isDrawing = false;

    overlay.onmousedown = (e) => {
        if (!isScreenshotMode || e.target === controls || controls.contains(e.target)) return;
        
        isDrawing = true;
        const rect = overlay.getBoundingClientRect();
        screenStartX = e.clientX - rect.left;
        screenStartY = e.clientY - rect.top;

        selectionBox.style.left = screenStartX + 'px';
        selectionBox.style.top = screenStartY + 'px';
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        selectionBox.classList.remove('hidden');
        controls.classList.add('hidden');
    };

    overlay.onmousemove = (e) => {
        if (!isDrawing) return;
        const rect = overlay.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const width = Math.abs(currentX - screenStartX);
        const height = Math.abs(currentY - screenStartY);
        const left = Math.min(screenStartX, currentX);
        const top = Math.min(screenStartY, currentY);

        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';

        currentScreenRect = { left, top, width, height };
    };

    overlay.onmouseup = () => {
        if (!isDrawing) return;
        isDrawing = false;
        
        if (currentScreenRect && currentScreenRect.width > 20 && currentScreenRect.height > 20) {
            controls.classList.remove('hidden');
            controls.style.left = currentScreenRect.left + 'px';
            controls.style.top = (currentScreenRect.top + currentScreenRect.height + 10) + 'px';
        } else {
            cancelScreenshotSelection();
        }
    };
}

// Confirms the selected screen area and initiates the download or backend processing of the screenshot.
window.confirmScreenshot = function() {
    if (!currentScreenRect) return;
    if (typeof showToast === 'function') showToast("Downloading cropped PNG...");

    const canvas = document.getElementById('browser-canvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const scaledClip = {
        x: Math.round(currentScreenRect.left * scaleX),
        y: Math.round(currentScreenRect.top * scaleY),
        width: Math.round(currentScreenRect.width * scaleX),
        height: Math.round(currentScreenRect.height * scaleY)
    };

    if (typeof browserSocket !== 'undefined' && browserSocket && browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.send(JSON.stringify({
            action: "export_png",
            type: "selected",
            clip: scaledClip
        }));
    }

    cancelScreenshotSelection();
};

// Cancels the active screenshot selection mode and hides the visual overlay.
window.cancelScreenshotSelection = function() {
    isScreenshotMode = false;
    currentScreenRect = null;
    const overlay = document.getElementById('screenshot-overlay');
    if (overlay) overlay.classList.add('hidden');
};

let globalPasteTooltip = null;
let lastFocusedInputForPaste = null;

document.addEventListener('DOMContentLoaded', () => {
    globalPasteTooltip = document.createElement('div');
    globalPasteTooltip.id = 'global-paste-tooltip';
    globalPasteTooltip.className = 'fixed hidden z-[99999] border border-[#D4A373]/30 shadow-xl rounded-md overflow-hidden transition-opacity duration-200 flex divide-x divide-[#D4A373]/30';
    
    globalPasteTooltip.innerHTML = `
        <button onclick="handleGlobalPaste(event)" class="pointer-events-auto px-4 py-2 flex items-center gap-2 bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all text-[12px] font-mono font-bold uppercase">
            <i class="fa-solid fa-paste w-3 text-center"></i> Paste
        </button>
        <button id="btn-quick-continue" onclick="handleQuickChatAction('continue', event)" class="pointer-events-auto px-4 py-2 flex items-center gap-2 bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all text-[12px] font-mono font-bold uppercase">
            <i class="fa-solid fa-forward w-3 text-center"></i> Continue
        </button>
        <button id="btn-quick-explain" onclick="handleQuickChatAction('explain', event)" class="pointer-events-auto px-4 py-2 flex items-center gap-2 bg-[#FDFBF7] text-[#D4A373] hover:bg-white hover:text-[#3E2723] active:scale-95 transition-all text-[12px] font-mono font-bold uppercase">
            <i class="fa-solid fa-question w-3 text-center"></i> Explain
        </button>
    `;
    document.body.appendChild(globalPasteTooltip);
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Tab') {
        const el = e.target;
        if (isValidInputField(el)) {
            showGlobalPasteTooltip(el, null); 
        }
    }
});

document.addEventListener('click', (e) => {
    const chatLink = e.target.closest('a.chat-link');
    if (chatLink) {
        e.preventDefault(); 
        showLinkContextMenu(chatLink, e);
        return;
    }
    
    if (window.linkContextMenu && !window.linkContextMenu.contains(e.target)) {
        window.linkContextMenu.classList.add('hidden');
    }

    const el = e.target;
    
    if (globalPasteTooltip && globalPasteTooltip.contains(el)) return;

    if (isValidInputField(el)) {
        showGlobalPasteTooltip(el, e);
    } else if (globalPasteTooltip) {
        globalPasteTooltip.classList.add('hidden');
    }
});

// Evaluates whether a given DOM element is an acceptable text input field for global pasting.
function isValidInputField(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
        const validTypes = ['text', 'password', 'url', 'search', 'email', 'number'];
        return validTypes.includes(el.type);
    }
    return false;
}

// Displays the global paste tooltip near the specified input element when triggered via keyboard shortcuts.
function showGlobalPasteTooltip(inputElement, mouseEvent) {
    if (!globalPasteTooltip) return;
    
    lastFocusedInputForPaste = inputElement;
    
    const isChatInput = inputElement.id === 'user-input';
    document.getElementById('btn-quick-continue').style.display = isChatInput ? 'flex' : 'none';
    document.getElementById('btn-quick-explain').style.display = isChatInput ? 'flex' : 'none';
    
    globalPasteTooltip.classList.remove('hidden');
    
    const rect = inputElement.getBoundingClientRect();
    const tooltipWidth = globalPasteTooltip.offsetWidth;
    const tooltipHeight = globalPasteTooltip.offsetHeight;
    
    let top, left;

    if (mouseEvent && mouseEvent.clientX && mouseEvent.clientY) {
        top = mouseEvent.clientY - tooltipHeight - 30; 
        left = mouseEvent.clientX - (tooltipWidth / 2);
    } else {
        top = rect.top - tooltipHeight - 15;
        left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
    }
    
    if (top < 0) {
        if (mouseEvent && mouseEvent.clientY) {
            top = mouseEvent.clientY + 25;
        } else {
            top = rect.bottom + 15;
        }
    }
    
    if (left < 10) left = 10;
    if (left + tooltipWidth > window.innerWidth) left = window.innerWidth - tooltipWidth - 10;
    
    globalPasteTooltip.style.top = `${top}px`;
    globalPasteTooltip.style.left = `${left}px`;

document.addEventListener('input', (e) => {
    if (typeof globalPasteTooltip !== 'undefined' && globalPasteTooltip && !globalPasteTooltip.classList.contains('hidden')) {
        globalPasteTooltip.classList.add('hidden');
    }
});

document.addEventListener('keydown', (e) => {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    
    if (typeof globalPasteTooltip !== 'undefined' && globalPasteTooltip && !globalPasteTooltip.classList.contains('hidden')) {
        globalPasteTooltip.classList.add('hidden');
    }
});
}

// Handles pasting content globally into the currently focused field, applying AI formatting if requested.
window.handleGlobalPaste = async function(e) {
    if (e) e.stopPropagation();
    
    if (!lastFocusedInputForPaste) return;
    
    try {
        const text = await navigator.clipboard.readText();
        
        if (text) {
            const start = lastFocusedInputForPaste.selectionStart;
            const end = lastFocusedInputForPaste.selectionEnd;
            const currentVal = lastFocusedInputForPaste.value;
            
            lastFocusedInputForPaste.value = currentVal.slice(0, start) + text + currentVal.slice(end);
            
            const newPos = start + text.length;
            lastFocusedInputForPaste.setSelectionRange(newPos, newPos);
            
            lastFocusedInputForPaste.focus();
            
            const inputEvent = new Event('input', { bubbles: true });
            lastFocusedInputForPaste.dispatchEvent(inputEvent);
            
            if (typeof showToast === 'function') showToast("Pasted!");
        }
    } catch (err) {
        console.error("Paste error:", err);
        if (typeof showToast === 'function') showToast("The browser is blocking access to the clipboard.", true);
    }
    
    if (globalPasteTooltip) {
        globalPasteTooltip.classList.add('hidden');
    }
};

// Processes a quick predefined AI action (such as summarize or explain) directly within the chat view.
window.handleQuickChatAction = function(type, e) {
    if (e) e.stopPropagation();
    
    const input = document.getElementById('user-input');
    if (!input) return;

    if (type === 'continue') {
        input.value = "Please continue from exactly where you left off.";
    } else if (type === 'explain') {
        input.value = "Please explain your previous response in more detail.";
    }
    
    if (globalPasteTooltip) {
        globalPasteTooltip.classList.add('hidden');
    }
    
    if (typeof autoResize === 'function') autoResize(input);
    if (typeof sendMessage === 'function') sendMessage();
};

function getRobustMsgGroup(range) {
    let container = range.commonAncestorContainer;
    if (container.nodeType === 3) container = container.parentElement;
    let group = container.closest('.message-pair-group');
    if (!group && window.getSelection().anchorNode) {
        group = window.getSelection().anchorNode.parentElement.closest('.message-pair-group');
    }
    return group;
}

async function applyFormatting(type) {
    const range = window.savedSelectionRange;
    if (!range) return;
    const selectedText = range.toString().trim();
    if (!selectedText) return;

    const msgGroup = getRobustMsgGroup(range);
    if (!msgGroup) return;

    const msgIndex = msgGroup.getAttribute('data-msg-index');
    if (selectionTooltip) selectionTooltip.classList.add('hidden');

    let replacement = "";
    if (type === 'code') {
        replacement = `\n\`\`\`\n${selectedText}\n\`\`\`\n`;
    } else if (type === 'erase') {
        replacement = ""; 
    } else if (type === 'text') {
        replacement = `\n\`\`\`\n\n${selectedText}\n\n\`\`\`\n`;
    }

    await modifyMessageMarkdown(msgIndex, selectedText, replacement, window.savedOccurrenceIndex);
}

// Generates a markdown link from the currently selected text and an entered URL.
window.applyLinkIt = async function() {
    const url = document.getElementById('link-url-field').value.trim();
    const ctx = window.linkTargetContext; 
    
    if (url && ctx && ctx.msgIndex) {
        const markdownLink = `[${ctx.text}](${url})`;
        await modifyMessageMarkdown(ctx.msgIndex, ctx.text, markdownLink, ctx.occurrenceIndex);
        if (typeof showToast === 'function') showToast("Linked!");
    }
    cancelLinkIt();
};

// Cancels the link creation process and resets the selection tooltip context.
window.cancelLinkIt = function() {
    document.getElementById('link-input-container').classList.add('hidden');
    const tooltip = document.getElementById('selection-tooltip');
    if (tooltip) {
        const mainButtons = tooltip.querySelector('.flex.divide-x');
        if (mainButtons) mainButtons.classList.remove('hidden');
        tooltip.classList.add('hidden');
    }
    window.savedSelectionRange = null;
    window.linkTargetContext = null;
};

// Updates the backend markdown file with modifications made inline to a specific chat message.
async function modifyMessageMarkdown(msgIndex, oldText, newText, occurrenceIndex = 0) {
    try {
        const sessionFile = window.currentSessionFile || state.currentSessionFile;
        if (!sessionFile) return;

        const res = await fetch(`/api/sessions/${sessionFile}`);
        const data = await res.json();
        const history = data.history;

        let realIndex = parseInt(msgIndex);
        if (isNaN(realIndex) || !history[realIndex] || realIndex > 1000000) {
            realIndex = history.findIndex(m => m.content.includes(oldText.trim()));
            if (realIndex === -1 && history.length > 0) {
                realIndex = history.findLastIndex(m => m.role !== 'User');
            }
        }

        if (realIndex === -1 || !history[realIndex]) return;

        let content = history[realIndex].content;
        let isReplaced = false;

        const originalContentForUndo = content;
        
        function replaceNth(str, search, replacement, index) {
            const parts = str.split(search);
            if (parts.length > index + 1) {
                const before = parts.slice(0, index + 1).join(search);
                const after = parts.slice(index + 1).join(search);
                return { res: before + replacement + after, ok: true };
            }
            return { res: str, ok: false };
        }

        let exactMatch = replaceNth(content, oldText, newText, occurrenceIndex);
        if (exactMatch.ok) {
            content = exactMatch.res;
            isReplaced = true;
        } 
        else {
            let trimMatch = replaceNth(content, oldText.trim(), newText, occurrenceIndex);
            if (trimMatch.ok) {
                content = trimMatch.res;
                isReplaced = true;
            } 
            else {
                try {
                    const escapedOld = oldText.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const fuzzyParts = escapedOld.split(/\s+/).filter(p => p.trim().length > 0);
                    const coreFuzzy = fuzzyParts.join('(?:[\\s\\*\\_\\`\\[\\]\\#]|\\([^\\)]*\\))*');
                    
                    const fuzzyPattern = `(?:\\[|\\*\\*|\\*|__|_|\\\`)*` + coreFuzzy + `(?:\\]\\([^\\)]*\\)|\\*\\*|\\*|__|_|\\\`)*`;
                    
                    let mCount = 0;
                    const tempContent = content.replace(new RegExp(fuzzyPattern, 'ig'), (match) => {
                        if (mCount === occurrenceIndex) { mCount++; return newText; }
                        mCount++; return match;
                    });
                    
                    if (mCount > 0) {
                        content = mCount <= occurrenceIndex ? content.replace(new RegExp(fuzzyPattern, 'i'), () => newText) : tempContent;
                        isReplaced = true;
                    }
                } catch(err) { console.warn("Fuzzy Regex failed", err); }
            }
        }

        if (!isReplaced) content = content + "\n\n" + newText;

        content = content.replace(/\[\s*\]\([^\)]*\)/g, ""); 
        content = content.replace(/\*\*\s*\*\*/g, "").replace(/\*\s*\*/g, ""); 
        content = content.replace(/__\s*__/g, "");
        content = content.replace(/```[a-zA-Z0-9_\-]*\s*```/g, ""); 

        if (!window.isUndoRedoAction && typeof window.trackMessageChange === 'function') {
            window.trackMessageChange(realIndex, originalContentForUndo, content);
        }

        await fetch('/api/sessions/update-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: sessionFile, index: realIndex, new_text: content })
        });

        const msgGroup = document.querySelector(`.message-pair-group[data-msg-index="${msgIndex}"]`);
        if (msgGroup) {
            msgGroup.setAttribute('data-msg-index', realIndex); 
            const targetBubble = msgGroup.querySelector('.ai-response-slot .msg-content') || msgGroup.querySelector('.chat-bubble-user .msg-content');
            if (targetBubble) {
                targetBubble.innerHTML = parseMarkdown(content);
                targetBubble.querySelectorAll('pre code').forEach(el => {
                    delete el.dataset.highlighted;
                    if (typeof hljs !== 'undefined') hljs.highlightElement(el);
                });
            }
        }
    } catch(e) { console.error("Save error:", e); }
}

let inlineEditingContext = {
    active: false,
    type: null, 
    targetText: "",
    msgIndex: null,
    element: null
};

// Triggers the AI to generate inline text modifications based on user instruction.
async function handleInlineAiGeneration(instruction) {
    const ctx = window.inlineEditingContext;
    const input = document.getElementById('user-input');
    
    input.value = "";
    input.style.height = 'auto';

    const targetSpan = document.getElementById('inline-generation-target');
    if (targetSpan) targetSpan.innerText = "";

    abortController = new AbortController();
    state.agentActive = true; 
    if (typeof toggleMainActionBtn === 'function') toggleMainActionBtn(true);
    
    document.querySelectorAll('.stop-indicator').forEach(el => el.remove());

    try {
        const selModel = document.getElementById('sel-model');
        const response = await fetch('/api/chat/inline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: ctx.type,
                target_text: ctx.targetText,
                instruction: instruction,
                session_file: window.currentSessionFile || state.currentSessionFile,
                msg_index: parseInt(ctx.msgIndex),
                model: selModel ? selModel.value : "llama3",
                mode: state.mode || 4,
                text_before: ctx.textBefore,
                text_after: ctx.textAfter
            }),
            signal: abortController.signal
        });

        if (!response.ok) throw new Error("Server error");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedReplacement = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            accumulatedReplacement += chunk;

            if (targetSpan) {
                let cleanStream = accumulatedReplacement
                    .replace(/```[a-zA-Z0-9]*\n?/g, '')
                    .replace(/```/g, '');
                
                let safeHtml = cleanStream
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                    
                targetSpan.innerHTML = safeHtml.replace(/\n/g, '<br>');
            }
            
            const container = document.getElementById('chat-container');
            if (container && (container.scrollHeight - container.scrollTop < 600)) {
                 container.scrollTop = container.scrollHeight;
            }
        }

        let finalReplacement = accumulatedReplacement.trim();
        
        if (!ctx.targetText.includes('```')) {
            const codeBlockMatch = finalReplacement.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
            
            if (codeBlockMatch) {
                finalReplacement = codeBlockMatch[1].trim();
            } else {
                finalReplacement = finalReplacement
                    .replace(/```[a-zA-Z0-9]*\n?/g, '')
                    .replace(/```/g, '')
                    .trim();
            }
        }

        await modifyMessageMarkdown(ctx.msgIndex, ctx.targetText, finalReplacement, ctx.occurrenceIndex);
        if (typeof showToast === 'function') showToast("Edit completed!");

        const activeFileInline = window.currentSessionFile || state.currentSessionFile;
        if (activeFileInline && typeof loadSession === 'function') {
            const chatContainer = document.getElementById('chat-container');
            const currentScroll = chatContainer ? chatContainer.scrollTop : 0;
            
            await loadSession(activeFileInline);
            
            if (chatContainer) {
                requestAnimationFrame(() => {
                    chatContainer.scrollTop = currentScroll;
                });
            }
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            if (targetSpan) {
                targetSpan.insertAdjacentHTML('beforeend', "<span class='stop-indicator text-[#C62828] font-bold ml-2'>█ [STOPPED]</span>");
            }
            if (typeof showToast === 'function') showToast("Generation has been forcibly stopped.", true);
            
            if (typeof accumulatedReplacement !== 'undefined' && accumulatedReplacement.trim() !== "") {
                let partial = accumulatedReplacement.trim();
                if (!ctx.targetText.includes('```')) {
                    partial = partial.replace(/```[a-zA-Z0-9]*\n?/g, '').replace(/```/g, '').trim();
                }
                await modifyMessageMarkdown(ctx.msgIndex, ctx.targetText, partial, ctx.occurrenceIndex);
                
                const activeFileInline = window.currentSessionFile || state.currentSessionFile;
                if (activeFileInline && typeof loadSession === 'function') {
                    const chatContainer = document.getElementById('chat-container');
                    const currentScroll = chatContainer ? chatContainer.scrollTop : 0;
                    
                    await loadSession(activeFileInline);
                    
                    if (chatContainer) {
                        requestAnimationFrame(() => { chatContainer.scrollTop = currentScroll; });
                    }
                }
            }
        } else {
            console.error("Inline Error:", err);
            if (typeof showToast === 'function') showToast("AI communication error.", true);
        }
    } finally {
        window.inlineEditingContext.active = false;
        state.agentActive = false; 
        abortController = null;
        if (typeof toggleMainActionBtn === 'function') toggleMainActionBtn(false);
        
        const editLabel = document.getElementById('inline-edit-label');
        if (editLabel) editLabel.classList.add('hidden');
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (window.inlineEditingContext?.active) {
            window.inlineEditingContext.active = false;
            const input = document.getElementById('user-input');
            if (input) {
                input.value = "";
                input.style.height = 'auto';
            }
            
            const targetSpan = document.getElementById('inline-generation-target');
            if (targetSpan && window.inlineEditingContext.targetText) {
                targetSpan.outerHTML = window.inlineEditingContext.targetText;
            }
            
            const editLabel = document.getElementById('inline-edit-label');
            if (editLabel) editLabel.classList.add('hidden');
            
            if (typeof showToast === 'function') showToast("Edit canceled.");
        }

        if (window.pendingRegenPair) {
            if (window.pendingRegenPair.element) {
                window.pendingRegenPair.element.classList.remove('opacity-40', 'grayscale');
            }
            window.pendingRegenPair = null;
            
            const input = document.getElementById('user-input');
            if (input) {
                input.value = "";
                input.style.height = 'auto';
            }
            
            if (typeof showToast === 'function') showToast("Regen canceled.");
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('user-input');
    if (chatInput) {
        chatInput.addEventListener('input', (e) => {
            if (window.inlineEditingContext && window.inlineEditingContext.active && e.target.value.trim() === "") {
                window.inlineEditingContext.active = false;
                e.target.style.height = 'auto';
                
                const targetSpan = document.getElementById('inline-generation-target');
                if (targetSpan && window.inlineEditingContext.targetText) {
                    targetSpan.outerHTML = window.inlineEditingContext.targetText;
                }
                
                const editLabel = document.getElementById('inline-edit-label');
                if (editLabel) editLabel.classList.add('hidden');
                
                if (typeof showToast === 'function') showToast("Edit canceled.");
            }

            if (window.pendingRegenPair && e.target.value.trim() === "") {
                if (window.pendingRegenPair.element) {
                    window.pendingRegenPair.element.classList.remove('opacity-40', 'grayscale');
                }
                window.pendingRegenPair = null;
                if (typeof showToast === 'function') showToast("Regen canceled.");
            }
        });
    }
});

window.activeChatLink = null;

// Displays a custom context menu when the user interacts with links generated inside the chat.
function showLinkContextMenu(linkElement, e) {
    window.activeChatLink = linkElement;
    
    document.getElementById('link-menu-buttons').classList.remove('hidden');
    document.getElementById('link-edit-inline-container').classList.add('hidden');
    document.getElementById('link-edit-inline-container').classList.remove('flex');
    
    const menu = window.linkContextMenu;
    menu.classList.remove('hidden');
    
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    
    let top = e.clientY + 15;
    let left = e.clientX - (menuWidth / 2);
    
    if (top + menuHeight > window.innerHeight) top = e.clientY - menuHeight - 15;
    if (left < 10) left = 10;
    if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 10;
    
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
}

window.handleLinkAction = async function(action) {
    if (!window.activeChatLink) return;
    
    const url = window.activeChatLink.getAttribute('href');
    const rawMarkdown = window.activeChatLink.getAttribute('data-raw-md'); 
    const text = window.activeChatLink.innerText;
    
    const msgGroup = window.activeChatLink.closest('.message-pair-group');
    const msgIndex = msgGroup ? msgGroup.getAttribute('data-msg-index') : null;
    
    const menu = window.linkContextMenu;

    switch (action) {
        case 'open_inside':
            document.getElementById('browser-url').value = url;
            if (typeof openMagiApp === 'function') openMagiApp('browser');
            if (typeof triggerSmartNavigate === 'function') triggerSmartNavigate();
            menu.classList.add('hidden');
            break;
            
        case 'open_outside':
            window.open(url, '_blank');
            menu.classList.add('hidden');
            break;
            
        case 'edit':
            document.getElementById('link-menu-buttons').classList.add('hidden');
            const editContainer = document.getElementById('link-edit-inline-container');
            editContainer.classList.remove('hidden');
            editContainer.classList.add('flex');
            
            const input = document.getElementById('edit-existing-link-field');
            input.value = url;
            input.focus();
            break;
            
        case 'cancel_edit':
            document.getElementById('link-menu-buttons').classList.remove('hidden');
            const editCont = document.getElementById('link-edit-inline-container');
            editCont.classList.add('hidden');
            editCont.classList.remove('flex');
            menu.classList.add('hidden');
            break;
            
        case 'save_edit':
            const newUrl = document.getElementById('edit-existing-link-field').value.trim();
            if (newUrl && msgIndex !== null && rawMarkdown) {
                const newMarkdown = `[${text}](${newUrl})`;
                await modifyMessageMarkdown(msgIndex, rawMarkdown, newMarkdown, 0);
                if (typeof showToast === 'function') showToast("Relinked!");
            }
            menu.classList.add('hidden');
            break;
            
        case 'unlink':
            if (msgIndex !== null && rawMarkdown) {
                await modifyMessageMarkdown(msgIndex, rawMarkdown, text, 0);
                if (typeof showToast === 'function') showToast("Link removed!");
            }
            menu.classList.add('hidden');
            break;
    }
};

// Enables manual editing mode for a specific AI or user message block.
async function enableManualEdit(btn) {
    const msgGroup = btn.closest('.message-pair-group');
    const msgIndexAttr = msgGroup.getAttribute('data-msg-index');
    const contentDiv = msgGroup.querySelector('.ai-response-slot .msg-content');

    const sessionFile = window.currentSessionFile || state.currentSessionFile;
    if (!sessionFile) return;

    try {
        const res = await fetch(`/api/sessions/${sessionFile}`);
        const data = await res.json();
        
        let realIndex = parseInt(msgIndexAttr) + 1;
        
        if (!data.history[realIndex] || data.history[realIndex].role === 'User') {
            realIndex = data.history.findLastIndex(m => m.role !== 'User');
        }
        
        if (realIndex === -1 || !data.history[realIndex]) return;

        const rawText = data.history[realIndex].content;

        const editorContainer = document.createElement('div');
        editorContainer.className = "w-full my-2 rounded-md overflow-hidden shadow-xl border border-[#D4A373]/30 flex flex-col bg-[#FDFBF7] transition-all";
        
        const textarea = document.createElement('textarea');
        textarea.className = "w-full bg-transparent text-[#3E2723] p-4 font-mono text-[13px] focus:outline-none resize-y min-h-[150px] leading-relaxed";
        textarea.value = rawText;
        
        const footer = document.createElement('div');
        footer.className = "flex justify-end gap-2 p-2 bg-[#FDFBF7] border-t border-[#D4A373]/30";
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = "px-4 py-1.5 flex items-center gap-2 bg-[#FDFBF7] text-[#D4A373] border border-[#D4A373]/40 rounded hover:bg-white hover:text-[#3E2723] hover:border-[#D4A373]/60 active:scale-95 transition-all text-[12px] font-mono font-bold uppercase shadow-sm";
        cancelBtn.innerHTML = '<i class="fa-solid fa-xmark w-3 text-center"></i> Cancel';
        
        const saveBtn = document.createElement('button');
        saveBtn.className = "px-4 py-1.5 flex items-center gap-2 bg-[#FDFBF7] text-[#D4A373] border border-[#D4A373]/40 rounded hover:bg-white hover:text-[#3E2723] hover:border-[#D4A373]/60 active:scale-95 transition-all text-[12px] font-mono font-bold uppercase shadow-sm";
        saveBtn.innerHTML = '<i class="fa-solid fa-check w-3 text-center"></i> Save';

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);
        editorContainer.appendChild(textarea);
        editorContainer.appendChild(footer);
        
        const parentElement = contentDiv.parentElement;
        contentDiv.style.display = 'none';
        parentElement.insertBefore(editorContainer, contentDiv);
        textarea.focus();

        cancelBtn.onclick = () => {
            editorContainer.remove();
            contentDiv.style.display = 'block';
        };

        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin w-3 text-center"></i> Saving';
            
            const newText = textarea.value;
            
            if (newText !== rawText) {
                await modifyMessageMarkdown(realIndex, rawText, newText, 0);
                
                if (typeof showToast === 'function') showToast("Manual edit saved!");
                
                const activeFile = window.currentSessionFile || state.currentSessionFile;
                if (activeFile && typeof loadSession === 'function') {
                    const chatContainer = document.getElementById('chat-container');
                    const currentScroll = chatContainer ? chatContainer.scrollTop : 0;
                    
                    await loadSession(activeFile);
                    
                    if (chatContainer) {
                        requestAnimationFrame(() => {
                            chatContainer.scrollTop = currentScroll;
                        });
                    }
                }
            } else {
                editorContainer.remove();
                contentDiv.style.display = 'block';
            }
        };

    } catch (e) {
        console.error("Error loading for editing:", e);
    }
}

// Prompts the AI to regenerate its response for a specific chat turn.
async function retryAiResponse(btn) {
    const msgGroup = btn.closest('.message-pair-group');
    const msgIndexAttr = msgGroup.getAttribute('data-msg-index');
    const contentDiv = msgGroup.querySelector('.ai-response-slot .msg-content');
    
    const sessionFile = window.currentSessionFile || state.currentSessionFile;
    if (!sessionFile) return;
    
    try {
        const res = await fetch(`/api/sessions/${sessionFile}`);
        const data = await res.json();
        
        let realIndex = parseInt(msgIndexAttr) + 1;
        
        if (isNaN(realIndex) || !data.history[realIndex] || data.history[realIndex].role === 'User') {
            realIndex = data.history.findLastIndex(m => m.role !== 'User');
        }
        
        if (realIndex === -1 || realIndex === 0) return;

        const userPrompt = data.history[realIndex - 1]?.content || "";
        const oldAiText = data.history[realIndex]?.content || "";

        if (!userPrompt) {
            if (typeof showToast === 'function') showToast("Error: Unable to find the original question.", true);
            return;
        }

        contentDiv.innerHTML = `<div class="text-[#D4A373] animate-pulse font-mono text-sm py-2"><i class="fa-solid fa-rotate-right fa-spin mr-2"></i>Regenerating...</div>`;
        
        abortController = new AbortController();
        state.agentActive = true;
        document.querySelectorAll('.stop-indicator').forEach(el => el.remove());

        const selModel = document.getElementById('sel-model');

        const response = await fetch('/api/chat/inline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'regen',
                target_text: oldAiText,
                instruction: `IGNORE PREVIOUS RESPONSE. Write a completely NEW and better response to this exact prompt: "${userPrompt}"`,
                session_file: sessionFile,
                msg_index: realIndex,
                model: selModel ? selModel.value : "llama3",
                mode: state.mode || 4
            }),
            signal: abortController.signal
        });

        if (!response.ok) throw new Error("Server error");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let newAiText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            newAiText += decoder.decode(value, { stream: true });
            contentDiv.innerHTML = parseMarkdown(newAiText);
            
            const container = document.getElementById('chat-container');
            if (container) {
                const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                if (isAtBottom) {
                    container.scrollTop = container.scrollHeight;
                }
            }
        }

        await modifyMessageMarkdown(realIndex, oldAiText, newAiText, 0);

        if (typeof loadSession === 'function') {
            const chatContainer = document.getElementById('chat-container');
            const currentScroll = chatContainer ? chatContainer.scrollTop : 0;
            await loadSession(sessionFile);
            if (chatContainer) requestAnimationFrame(() => chatContainer.scrollTop = currentScroll);
        }
        
        if (typeof showToast === 'function') showToast("The new answer is ready!");

    } catch (err) {
        if (err.name === 'AbortError') {
            contentDiv.insertAdjacentHTML('beforeend', "<span class='stop-indicator text-red-600 font-bold ml-2'>█ [STOPPED]</span>");
            if (typeof showToast === 'function') showToast("Regeneration was stopped.");
        } else {
            console.error("Retry Error:", err);
            contentDiv.innerHTML = `<span class="text-red-500 font-mono">Regeneration error.</span>`;
        }
    } finally {
        state.agentActive = false;
        abortController = null;
    }
}

// Deletes a user-AI message pair from the interface and the backend session file.
window.deleteMsgPair = async function(pairId, index, skipConfirm = false, skipReload = false) {
    if (!skipConfirm) {
        if (!confirm("Delete this dialog from the session?")) return;
    }
    
    const pairGroup = document.getElementById(pairId) || document.querySelector(`.message-pair-group[data-msg-index="${index}"]`);
    let textToFind = "";
    
    if (pairGroup) {
        const userContent = pairGroup.querySelector('.chat-bubble-user .msg-content');
        if (userContent) textToFind = userContent.innerText.trim();
        
        pairGroup.remove();
        if (typeof updatePromptNavigator === 'function') updatePromptNavigator();
    }
    
    const sessionFile = window.currentSessionFile || state.currentSessionFile;
    if (!sessionFile) return;
    
    try {
        const res = await fetch(`/api/sessions/${sessionFile}`);
        const data = await res.json();
        
        let realIndex = parseInt(index);
        
        if (textToFind && data.history) {
            if (!data.history[realIndex] || !data.history[realIndex].content.includes(textToFind)) {
                realIndex = data.history.findIndex(m => m.role === 'User' && m.content.includes(textToFind));
            }
        }
        
        if (realIndex !== -1) {
            await fetch('/api/sessions/delete-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: sessionFile, msg_index: realIndex, index: realIndex }) 
            });
            
            if (!skipReload && typeof loadSession === 'function') {
                loadSession(sessionFile); 
            }
            
            if (!skipConfirm && typeof showToast === 'function') {
                showToast("Message deleted!");
            }
        }
    } catch (e) {
        console.error("Error deleting from server:", e);
    }
};

// Allows the user to edit their previous prompt and trigger a completely new AI generation branch from that point.
window.editAndRegenUser = async function(btn) {
    const msgGroup = btn.closest('.message-pair-group');
    const sessionFile = window.currentSessionFile || state.currentSessionFile;
    
    if (!sessionFile || !msgGroup) return;

    try {
        const msgIndexAttr = msgGroup.getAttribute('data-msg-index');
        const pairId = msgGroup.id;
        
        const userContent = msgGroup.querySelector('.chat-bubble-user .msg-content');
        if (!userContent) return;
        
        const rawText = userContent.innerText.trim();

        const inputField = document.getElementById('user-input');
        if (inputField) {
            inputField.value = rawText;
            inputField.focus();
            if (typeof autoResize === 'function') autoResize(inputField);
        }

        if (window.pendingRegenPair && window.pendingRegenPair.element) {
            window.pendingRegenPair.element.classList.remove('opacity-40', 'grayscale');
        }

        let realIndex = parseInt(msgIndexAttr);
        window.pendingRegenPair = {
            pairId: pairId,
            index: realIndex,
            element: msgGroup
        };

        msgGroup.classList.add('opacity-40', 'grayscale', 'transition-all', 'duration-300');

        if (typeof showToast === 'function') showToast("The prompt is ready. Press Send to replace it!");

    } catch (e) {
        console.error("Edit & Regen error:", e);
    }
};

// Closes the File Manager window completely and hides its interface.
function closeFileManager() {
    const fmWin = document.getElementById('fm-window');
    const fmBubble = document.getElementById('fm-bubble'); 
    
    if (fmWin) {
        fmWin.classList.add('hidden');
        fmWin.style.display = 'none';
    }
    if (fmBubble) {
        fmBubble.classList.add('hidden');
        fmBubble.style.display = 'none';
    }

    state.fmActive = false;
}

// Minimizes the File Manager window into a draggable floating bubble.
function minimizeFileManager() {
    const fmWin = document.getElementById('fm-window');
    const fmBubble = document.getElementById('fm-bubble');
    
    if (fmWin) {
        fmWin.classList.add('hidden');
        fmWin.style.display = 'none';
    }
    if (fmBubble) {
        fmBubble.classList.remove('hidden');
        fmBubble.style.display = 'flex';
    }
}

// Restores the File Manager window from its minimized floating bubble state.
window.restoreFileManager = function() {
    const fmWin = document.getElementById('fm-window');
    const fmBubble = document.getElementById('fm-bubble');
    
    if (fmWin) {
        fmWin.classList.remove('hidden');
        fmWin.style.display = 'flex';
        fmWin.style.zIndex = '150'; 
    }
    if (fmBubble) {
        fmBubble.classList.add('hidden');
        fmBubble.style.display = 'none';
    }
};

let fmIsMaximized = false;
let fmPreviousState = { top: '', left: '', width: '', height: '' };

// Toggles the File Manager window between its fully maximized size and its default floating size.
function toggleMaximizeFileManager() {
    const fmWin = document.getElementById('fm-window');
    const icon = document.getElementById('fm-maximize-icon');
    if (!fmWin) return;

    if (!fmIsMaximized) {
        fmPreviousState = {
            top: fmWin.style.top,
            left: fmWin.style.left,
            width: fmWin.style.width,
            height: fmWin.style.height
        };
        
        fmWin.style.top = '0';
        fmWin.style.left = '0';
        fmWin.style.width = '100vw';
        fmWin.style.height = '100vh';
        fmWin.style.borderRadius = '0';
        icon.className = 'fa-regular fa-window-restore';
        fmIsMaximized = true;
    } else {
        fmWin.style.top = fmPreviousState.top || '10%';
        fmWin.style.left = fmPreviousState.left || '20%';
        fmWin.style.width = fmPreviousState.width || '850px';
        fmWin.style.height = fmPreviousState.height || '550px';
        fmWin.style.borderRadius = '0.5rem';
        icon.className = 'fa-regular fa-window-maximize';
        fmIsMaximized = false;
    }
}

// Makes the File Manager window draggable by attaching mouse events to its header.
function makeFileManagerDraggable() {
    const fmWin = document.getElementById('fm-window');
    const fmHeader = document.getElementById('fm-header');
    
    if (!fmWin || !fmHeader) return;

    let isDragging = false;
    let offsetX, offsetY;

    fmHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        if (typeof fmIsMaximized !== 'undefined' && fmIsMaximized) return;

        isDragging = true;
        const rect = fmWin.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;

        const maxLeft = window.innerWidth - fmWin.offsetWidth;
        const maxTop = window.innerHeight - fmWin.offsetHeight;

        if (newY < 0) newY = 0; 
        if (newY > maxTop) newY = maxTop; 
        if (newX < 0) newX = 0; 
        if (newX > maxLeft) newX = maxLeft; 

        fmWin.style.left = `${newX}px`;
        fmWin.style.top = `${newY}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    makeFileManagerDraggable();
});


let currentFmPath = 'Root';
let fmHistory = ['Root'];
let fmHistoryIndex = 0;
let activeFmFile = null;

// Fetches and loads the contents of a specified directory path into the File Manager UI.
async function fmLoadDirectory(path, addToHistory = true) {
    try {
        let endpoint = `/api/fs/list?path=${encodeURIComponent(path)}`;
        
        if (path === 'documents' || path.startsWith('documents/')) {
            endpoint = `/api/fs/documents`; 
        }

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Failed to load directory.');
        
        const data = await response.json();
        currentFmPath = path;
        
        if (addToHistory) {
            fmHistory = fmHistory.slice(0, fmHistoryIndex + 1);
            fmHistory.push(path);
            fmHistoryIndex++;
        }
        
        fmUpdateUI(data);
    } catch (error) {
        console.error("File manager error:", error);
    }
}

// Updates the File Manager's file lists based on the newly fetched directory data.
function fmUpdateUI(data) {
    const listContainer = document.getElementById('fm-list-container');
    
    const btnBack = document.getElementById('fm-btn-back');
    const btnForward = document.getElementById('fm-btn-forward');
    if (btnBack) btnBack.disabled = fmHistoryIndex <= 0;
    if (btnForward) btnForward.disabled = fmHistoryIndex >= fmHistory.length - 1;

    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (data.is_grouped) {
        renderGroupedList(listContainer, data);
    } else {
        renderStandardList(listContainer, data);
    }
}

function renderStandardList(container, items) {
    container.innerHTML = ''; 

    items.forEach(item => {
        const div = document.createElement('div');
        const isActive = activeFmFile === item.path;
        
        const activeClass = isActive ? 'bg-white shadow-sm border-l-4 border-l-[#D4A373]' : 'border-l-4 border-l-transparent hover:bg-[#D4A373]/10';
        
        div.className = `fm-list-item group flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-[#D4A373]/10 transition-all ${activeClass}`;
        div.dataset.path = item.path;
        div.dataset.type = item.type;
        div.dataset.immutable = item.immutable;
        
        let iconClass = '';
        let formatText = "";
        
        if (item.type === 'folder') {
            iconClass = item.immutable ? 'fa-solid fa-folder text-[#8D6E63]' : 'fa-solid fa-folder text-[#D4A373]';
            formatText = "FOLDER";
        } else {
            const parts = item.name.split('.');
            const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';

            if (ext === 'json' || ext === 'jsonl') { iconClass = 'fa-solid fa-file-code text-yellow-600'; formatText = ext.toUpperCase(); }
            else if (ext === 'py') { iconClass = 'fa-brands fa-python text-blue-500'; formatText = "PYTHON"; }
            else if (ext === 'pdf') { iconClass = 'fa-solid fa-file-pdf text-red-500'; formatText = "PDF"; }
            else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) { iconClass = 'fa-solid fa-file-image text-purple-500'; formatText = "IMAGE"; }
            else if (ext === 'txt') { iconClass = 'fa-solid fa-file-lines text-gray-500'; formatText = "TEXT"; }
            else if (['html', 'css', 'js'].includes(ext)) { iconClass = 'fa-solid fa-file-code text-orange-500'; formatText = ext.toUpperCase(); }
            else if (['doc', 'docx'].includes(ext)) { iconClass = 'fa-solid fa-file-word text-blue-600'; formatText = ext.toUpperCase(); }
            else if (['xls', 'xlsx', 'csv'].includes(ext)) { iconClass = 'fa-solid fa-file-excel text-green-600'; formatText = ext.toUpperCase(); }
            else { 
                iconClass = 'fa-regular fa-file text-[#8D6E63]'; 
                formatText = ext ? ext.toUpperCase() : "FILE";
            }
        }

        const sizeStr = item.size ? (item.size / 1024).toFixed(1) + ' KB' : '';
        const hideDeleteBtn = item.immutable ? 'invisible pointer-events-none' : ''; 

        div.innerHTML = `
            <input type="checkbox" class="fm-row-checkbox accent-[#D4A373] cursor-pointer w-3.5 h-3.5" value="${item.path}" onclick="event.stopPropagation(); fmUpdateSelectAllState()">
            <i class="${iconClass} text-lg w-5 text-center"></i>
            <div class="flex-1 min-w-0 flex flex-col justify-center">
                <span class="truncate font-bold text-[14px] text-[#3E2723]">${item.name}</span>
                <span class="text-[9px] font-mono opacity-50 uppercase text-[#8D6E63]">${formatText}</span>
            </div>
            <span class="text-[11px] font-mono text-[#8D6E63] uppercase w-16 text-right">${sizeStr}</span>
            <button onclick="event.stopPropagation(); fmDeleteSingle('${item.path}')" class="w-8 flex justify-end text-red-300 hover:text-red-600 transition-colors ${hideDeleteBtn}" title="Delete">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        
        div.onclick = () => {
            if (item.type === 'folder') fmLoadDirectory(item.path);
            else fmOpenFile(item.path, item.name, sizeStr, 'system');
        };
        
        div.oncontextmenu = (e) => showFmContextMenu(e, item);
        container.appendChild(div);
    });
    
    fmUpdateSelectAllState(); 
}

// Toggles the selection state of all file checkboxes in the current File Manager view.
window.fmToggleSelectAll = function(mainCheckbox) {
    const checkboxes = document.querySelectorAll('.fm-row-checkbox:not(.invisible)');
    checkboxes.forEach(cb => cb.checked = mainCheckbox.checked);
};

// Updates the state of the master 'select all' checkbox based on individual file selection statuses.
window.fmUpdateSelectAllState = function() {
    const selectAllCb = document.getElementById('fm-select-all');
    if (!selectAllCb) return;
    const checkboxes = document.querySelectorAll('.fm-row-checkbox:not(.invisible)');
    if (checkboxes.length === 0) {
        selectAllCb.checked = false;
        selectAllCb.disabled = true;
        return;
    }
    selectAllCb.disabled = false;
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const someChecked = Array.from(checkboxes).some(cb => cb.checked);
    selectAllCb.checked = allChecked;
    selectAllCb.indeterminate = someChecked && !allChecked;
};

function renderGroupedList(container, data) {
    let html = '';

    function getIconAndFormat(name) {
        const parts = name.split('.');
        const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
        let iconClass = 'fa-regular fa-file text-[#8D6E63]';
        let formatText = ext ? ext.toUpperCase() : "FILE";

        if (ext === 'json' || ext === 'jsonl') { iconClass = 'fa-solid fa-file-code text-yellow-600'; }
        else if (ext === 'py') { iconClass = 'fa-brands fa-python text-blue-500'; formatText = "PYTHON"; }
        else if (ext === 'pdf') { iconClass = 'fa-solid fa-file-pdf text-red-500'; }
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) { iconClass = 'fa-solid fa-file-image text-purple-500'; formatText = "IMAGE"; }
        else if (ext === 'txt') { iconClass = 'fa-solid fa-file-lines text-gray-500'; formatText = "TEXT"; }
        else if (['html', 'css', 'js'].includes(ext)) { iconClass = 'fa-solid fa-file-code text-orange-500'; }
        else if (['doc', 'docx'].includes(ext)) { iconClass = 'fa-solid fa-file-word text-blue-600'; }
        else if (['xls', 'xlsx', 'csv'].includes(ext)) { iconClass = 'fa-solid fa-file-excel text-green-600'; }
        
        return { iconClass, formatText };
    }

    html += `<div class="px-4 py-2 mt-2 text-[9px] font-black text-[#D4A373] tracking-widest uppercase bg-[#FDFBF7] border-y border-[#D4A373]/20 flex justify-between items-center">
                <span>External Source Library</span> <i class="fa-solid fa-inbox"></i>
             </div>`;

    if (!data.external || data.external.length === 0) {
        html += `<div class="px-4 py-3 text-[10px] text-[#8D6E63] italic">No external files uploaded yet.</div>`;
    } else {
        data.external.forEach(item => {
            const sizeStr = item.size ? (item.size / 1024).toFixed(1) + ' KB' : '';
            const isActive = activeFmFile === item.path;
            const activeClass = isActive ? 'bg-white shadow-sm border-l-4 border-l-[#D4A373]' : 'border-l-4 border-l-transparent hover:bg-[#D4A373]/10';
            const { iconClass, formatText } = getIconAndFormat(item.name);

            html += `
                <div class="fm-list-item group flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-[#D4A373]/10 transition-all ${activeClass}" 
                     data-path="${item.path}" data-type="file"
                     onclick="fmOpenFile('${item.path}', '${item.name}', '${sizeStr}', 'external')"
                     oncontextmenu="showFmContextMenu(event, {path: '${item.path}', type: 'file', name: '${item.name}'})">
                    
                    <input type="checkbox" class="fm-row-checkbox accent-[#D4A373] cursor-pointer w-3.5 h-3.5" value="${item.path}" onclick="event.stopPropagation(); fmUpdateSelectAllState()">
                    <i class="${iconClass} text-lg w-5 text-center"></i>
                    
                    <div class="flex-1 min-w-0 flex flex-col justify-center">
                        <span class="truncate font-bold text-[14px] text-[#3E2723]">${item.name}</span>
                        <span class="text-[9px] font-mono opacity-50 uppercase text-[#8D6E63]">${formatText}</span>
                    </div>
                    
                    <span class="text-[11px] font-mono text-[#8D6E63] uppercase w-16 text-right">${sizeStr}</span>
                    
                    <button onclick="event.stopPropagation(); fmDeleteSingle('${item.path}')" class="w-8 flex justify-end text-red-300 hover:text-red-600 transition-colors" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
        });
    }

    html += `<div class="px-4 py-2 mt-4 text-[9px] font-black text-[#D4A373] tracking-widest uppercase bg-[#FDFBF7] border-y border-[#D4A373]/20 flex justify-between items-center">
                <span>Internal Session Outputs</span> <i class="fa-solid fa-brain"></i>
             </div>`;

    if (!data.internal || Object.keys(data.internal).length === 0) {
        html += `<div class="px-4 py-3 text-[10px] text-[#8D6E63] italic">No session outputs generated yet.</div>`;
    } else {
        const sessions = Object.keys(data.internal).reverse();
        
        sessions.forEach(sessionName => {
            html += `
                <div class="px-4 py-1.5 bg-[rgba(212,163,115,0.05)] text-[10px] font-bold text-[#8D6E63] flex items-center gap-2 border-b border-[#D4A373]/10 cursor-pointer hover:bg-[rgba(212,163,115,0.1)] transition-colors" 
                     onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.fa-chevron-down').classList.toggle('-rotate-90')">
                    <i class="fa-solid fa-chevron-down text-[8px] transition-transform duration-200"></i>
                    <i class="fa-solid fa-folder-open text-[#D4A373]"></i> ${sessionName}
                </div>
                <div class="session-files-group">
            `;
            
            data.internal[sessionName].forEach(item => {
                const sizeStr = item.size ? (item.size / 1024).toFixed(1) + ' KB' : '';
                const isActive = activeFmFile === item.path;
                const activeClass = isActive ? 'bg-white shadow-sm border-l-4 border-l-[#D4A373]' : 'border-l-4 border-l-transparent hover:bg-[#D4A373]/10';
                const { iconClass, formatText } = getIconAndFormat(item.name);

                html += `
                    <div class="fm-list-item group flex items-center gap-3 pl-8 pr-4 py-2.5 cursor-pointer border-b border-[#D4A373]/5 transition-all ${activeClass}" 
                         data-path="${item.path}" data-type="file"
                         onclick="fmOpenFile('${item.path}', '${item.name}', '${sizeStr}', 'internal')"
                         oncontextmenu="showFmContextMenu(event, {path: '${item.path}', type: 'file', name: '${item.name}'})">
                        
                        <input type="checkbox" class="fm-row-checkbox accent-[#D4A373] cursor-pointer w-3.5 h-3.5" value="${item.path}" onclick="event.stopPropagation(); fmUpdateSelectAllState()">
                        <i class="${iconClass} text-lg w-5 text-center opacity-80"></i>
                        
                        <div class="flex-1 min-w-0 flex flex-col justify-center">
                            <span class="truncate font-bold text-[14px] text-[#3E2723]">${item.name}</span>
                            <span class="text-[9px] font-mono opacity-50 uppercase text-[#8D6E63]">EDITED ${formatText}</span>
                        </div>
                        
                        <span class="text-[11px] font-mono text-[#8D6E63] uppercase w-16 text-right">${sizeStr}</span>
                        
                        <button onclick="event.stopPropagation(); fmDeleteSingle('${item.path}')" class="w-8 flex justify-end text-red-300 hover:text-red-600 transition-colors" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `;
            });
            html += `</div>`;
        });
    }

    container.innerHTML = html;
    fmUpdateSelectAllState();
}

let currentFmFileMeta = {}; 

// Updates the line number gutter displayed alongside the File Manager's code editor.
window.updateFmLineNumbers = function() {
    const editor = document.getElementById('fm-main-editor');
    const lineNums = document.getElementById('fm-line-numbers');
    if (!editor || !lineNums || lineNums.style.display === 'none') return;

    const lines = editor.value.split('\n');
    const linesCount = lines.length;
    
    let numbersHtml = '';
    for (let i = 1; i <= linesCount; i++) {
        numbersHtml += `<div style="height: 24px;">${i}</div>`;
    }
    lineNums.innerHTML = numbersHtml;
    
    lineNums.scrollTop = editor.scrollTop;
};

document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('fm-main-editor');
    const lineNums = document.getElementById('fm-line-numbers');
    
    if (editor && lineNums) {
        editor.addEventListener('scroll', () => {
            lineNums.scrollTop = editor.scrollTop;
        });
        
        editor.addEventListener('input', window.updateFmLineNumbers);
    }
});

// Fetches a selected file from the backend and opens its contents inside the File Manager editor.
async function fmOpenFile(path, name, sizeStr, source) {
    activeFmFile = path;
    currentFmFileMeta = { path, name, source };
    
    const editorContainer = document.getElementById('fm-editor-container');
    const placeholder = document.getElementById('fm-viewer-placeholder');
    const mediaViewer = document.getElementById('fm-media-viewer');
    const fileNameDisplay = document.getElementById('fm-active-file-name');
    const metaDisplay = document.getElementById('fm-active-file-meta');
    
    if (fileNameDisplay) fileNameDisplay.innerText = name;
    if (metaDisplay) metaDisplay.innerText = source === 'internal' ? 'AI EDITED' : (sizeStr || 'FILE');

    document.querySelectorAll('.fm-list-item').forEach(el => el.classList.remove('is-open'));
    try {
        const safePath = path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const clickedFile = document.querySelector(`.fm-list-item[data-path="${safePath}"]`);
        if (clickedFile) clickedFile.classList.add('is-open');
    } catch(e) {
        console.warn("The file in the list couldn't be mark:", e);
    }

    placeholder.classList.add('hidden'); 

    const ext = name.split('.').pop().toLowerCase();
    const mediaExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const isPdf = ext === 'pdf';

    // ==========================================
    // ЛОГИКА ЗА СНИМКИ И PDF ФАЙЛОВЕ
    // ==========================================
    if (mediaExts.includes(ext) || isPdf) {
        editorContainer.classList.add('hidden');
        editorContainer.classList.remove('flex');
        
        if (mediaViewer) {
            mediaViewer.classList.remove('hidden');
            mediaViewer.classList.add('flex');
        }

        const mediaContent = document.getElementById('fm-media-content');
        const mediaTitle = document.getElementById('fm-media-file-name');
        if (mediaTitle) mediaTitle.innerText = name;

        if (mediaContent) {
            mediaContent.innerHTML = `<div class="text-[12px] font-mono text-[#D4A373] animate-pulse">🔄 Loading document...</div>`;
            
            const fileUrl = `/api/fs/download?path=${encodeURIComponent(path)}`;

            if (isPdf) {
                // 🔥 МАГИЯТА: Изтегляме файла като blob в RAM, за да заобиколим защитата на браузъра
                fetch(fileUrl)
                    .then(res => {
                        if (!res.ok) throw new Error("Бекенд грешка при четене");
                        return res.blob();
                    })
                    .then(blob => {
                        // Превръщаме суровите байтове в безопасен, локален URL
                        const localPdfUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                        
                        // Зареждаме го в ифрейма с активиран тулбар
                        mediaContent.innerHTML = `
                            <iframe src="${localPdfUrl}#toolbar=1&navpanes=0&scrollbar=1" 
                                    class="w-full h-full border-none bg-white shadow-inner">
                            </iframe>`;
                    })
                    .catch(err => {
                        console.error("PDF Blob error:", err);
                        mediaContent.innerHTML = `<div class="text-[12px] font-mono text-red-500">❌ Error rendering PDF preview.</div>`;
                    });
            } else {
                // За снимките стандартният линк си работи перфектно
                mediaContent.innerHTML = `
                    <div class="w-full h-full flex items-center justify-center overflow-auto custom-scrollbar p-4">
                        <img src="${fileUrl}" class="max-w-full max-h-full object-contain shadow-md rounded border border-[#D4A373]/30 bg-transparent">
                    </div>`;
            }
        }
    }
    else {
        if (mediaViewer) {
            mediaViewer.classList.add('hidden');
            mediaViewer.classList.remove('flex');
        }
        
        editorContainer.classList.remove('hidden');
        editorContainer.classList.add('flex');

        const editor = document.getElementById('fm-main-editor');
        const lineNums = document.getElementById('fm-line-numbers');
        const isCode = ['js', 'py', 'html', 'css', 'json', 'jsonl', 'md', 'bat', 'cpp', 'c', 'php'].includes(ext);

        try {
            const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            
            editor.value = data.content;
            editor.classList.remove('hidden');
            editor.disabled = false;

            if (isCode) {
                lineNums.style.display = 'block';
                window.updateFmLineNumbers();
            } else {
                lineNums.style.display = 'none';
            }
            
            editor.scrollTop = 0;
            if (lineNums) lineNums.scrollTop = 0;

        } catch (err) {
            editor.value = "Loading file error.";
        }
    }
}

function resetEditorStyles(wrapper, editor, syntaxPre, lineNums) {
    window.fmCurrentLang = null;
    if (wrapper) wrapper.style.backgroundColor = 'transparent';
    editor.classList.remove('text-transparent', 'caret-white');
    editor.classList.add('text-[#3E2723]');
    if (syntaxPre) syntaxPre.style.display = 'none';
    if (lineNums) lineNums.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const editor = document.getElementById('fm-main-editor');
    const pre = document.getElementById('fm-syntax-pre');
    const lineNums = document.getElementById('fm-line-numbers');
    
    if (editor && pre) {
        editor.addEventListener('scroll', () => {
            pre.scrollTop = editor.scrollTop;
            pre.scrollLeft = editor.scrollLeft;
            if (lineNums) lineNums.scrollTop = editor.scrollTop;
        });
        
        editor.addEventListener('input', () => {
            if (window.fmCurrentLang) {
                window.updateFmSyntaxHighlighting(editor.value, window.fmCurrentLang);
            }
        });
    }
});

// Navigates backwards one step in the File Manager's directory history.
function fmGoBack() {
    if (fmHistoryIndex > 0) {
        fmHistoryIndex--;
        fmLoadDirectory(fmHistory[fmHistoryIndex], false);
    }
}

// Navigates forwards one step in the File Manager's directory history.
function fmGoForward() {
    if (fmHistoryIndex < fmHistory.length - 1) {
        fmHistoryIndex++;
        fmLoadDirectory(fmHistory[fmHistoryIndex], false);
    }
}

// Refreshes the currently active directory in the File Manager and cancels any active edits.
// Navigates the File Manager directly back to the root directory.
function fmGoHome() { fmLoadDirectory('Root'); }
function fmRefresh() { 
    fmLoadDirectory(currentFmPath, false); 
    fmCancelEdits(); 
}

document.getElementById('fm-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.fm-list-item').forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(term) ? 'flex' : 'none';
    });
});

// Displays the custom right-click context menu for items inside the File Manager.
window.showFmContextMenu = function(e, item) {
    if (e.target.closest('#fm-right-panel') || e.target.id === 'fm-main-editor') {
        return; 
    }
    e.preventDefault();
    e.stopPropagation();
    
    const menu = document.getElementById('fm-context-menu');
    const fmWin = document.getElementById('fm-window'); 
    
    if (!menu || !fmWin) return;

    menu.classList.remove('hidden');
    menu.style.display = 'block';
    
    const pasteBtn = document.getElementById('ctx-paste');
    const hasClipboard = window.fmClipboard && window.fmClipboard.paths.length > 0;
    
    if (item) {
        menu.dataset.targetPath = item.path;
        menu.dataset.targetType = item.type;
        menu.dataset.targetName = item.name;
        
        const isImmutable = item.immutable === true || item.immutable === "true";
        document.getElementById('ctx-open').style.display = 'flex';
        document.getElementById('ctx-rename').style.display = isImmutable ? 'none' : 'flex';
        document.getElementById('ctx-cut').style.display = isImmutable ? 'none' : 'flex';
        document.getElementById('ctx-copy').style.display = 'flex';
        document.getElementById('ctx-delete').style.display = isImmutable ? 'none' : 'flex';
        document.getElementById('ctx-info').style.display = 'flex';
        
        if (pasteBtn) pasteBtn.style.display = hasClipboard ? 'flex' : 'none';
    } else {

        menu.dataset.targetPath = typeof currentFmPath !== 'undefined' ? currentFmPath : 'Root';
        menu.dataset.targetType = 'folder';
        menu.dataset.targetName = 'Current Directory';
        
        document.getElementById('ctx-open').style.display = 'none';
        document.getElementById('ctx-rename').style.display = 'none';
        document.getElementById('ctx-cut').style.display = 'none';
        document.getElementById('ctx-copy').style.display = 'none';
        document.getElementById('ctx-delete').style.display = 'none';
        
        document.getElementById('ctx-info').style.display = 'flex';
        if (pasteBtn) pasteBtn.style.display = hasClipboard ? 'flex' : 'none';

    }
    
    const winRect = fmWin.getBoundingClientRect();
    
    let menuX = e.clientX - winRect.left;
    let menuY = e.clientY - winRect.top;
    
    const menuWidth = menu.offsetWidth || 180; 
    const menuHeight = menu.offsetHeight || 250; 
    
    if (menuX + menuWidth > fmWin.offsetWidth) {
        menuX = menuX - menuWidth;
    }
    
    if (menuY + menuHeight > fmWin.offsetHeight) {
        menuY = menuY - menuHeight;
    }
    
    if (menuX < 0) menuX = 5;
    if (menuY < 0) menuY = 5;
    
    menu.style.left = menuX + 'px';
    menu.style.top = menuY + 'px';
};

const fmLeftPanelContainer = document.getElementById('fm-left-panel');
if (fmLeftPanelContainer) {
    fmLeftPanelContainer.addEventListener('contextmenu', (e) => {
        showFmContextMenu(e, null);
    });
}

// Opens the native OS file picker dialog to import files into the active File Manager directory.
function fmImportFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    
    input.onchange = async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        
        const formData = new FormData();
        formData.append('path', currentFmPath);
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        try {
            document.body.style.cursor = 'wait';
            if (typeof showToast === 'function') showToast(`Uploading ${files.length} files...`);
            
            const res = await fetch('/api/fs/upload', {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                fmRefresh(); 
                if (typeof showToast === 'function') showToast("Upload successful!");
            } else {
                alert("Error uploading files.");
            }
        } catch (err) {
            console.error(err);
        } finally {
            document.body.style.cursor = 'default';
        }
    };
    
    input.click();
}

// Triggers the export process for the currently opened file or selected files in the File Manager.
function fmExport(type) {
    if (typeof closeAllDropdowns === 'function') closeAllDropdowns();
    
    let toExport = [];
    if (type === 'selected') {
        document.querySelectorAll('.fm-row-checkbox:checked').forEach(cb => toExport.push(cb.value));
    } else if (type === 'all') {
        document.querySelectorAll('.fm-row-checkbox').forEach(cb => toExport.push(cb.value));
    }

    if (toExport.length === 0) {
        alert("No files or folders marked for export.");
        return;
    }

    if (typeof showToast === 'function') showToast(`Downloading ${toExport.length} elements...`);
    
    toExport.forEach((path, index) => {
        setTimeout(() => {
            const link = document.createElement('a');
            link.href = `/api/fs/download?path=${encodeURIComponent(path)}`;
            link.download = ''; 
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, index * 500); 
    });
}

// Initiates the deletion process for selected files in the File Manager after prompting for confirmation.
async function fmDelete(type) {
    if (typeof closeAllDropdowns === 'function') closeAllDropdowns();
    
    let toDelete = [];
    if (type === 'selected') {
        document.querySelectorAll('.fm-row-checkbox:checked').forEach(cb => toDelete.push(cb.value));
    } else if (type === 'all') {
        document.querySelectorAll('.fm-row-checkbox:not(.invisible)').forEach(cb => toDelete.push(cb.value));
    }

    if (toDelete.length === 0) {
        alert("No files selected to delete.");
        return;
    }

    if (!confirm(`WARNING!\n\nAre you sure you want to delete? ${toDelete.length} file(s)?\nThis action is irreversible.!`)) return;

    for (const path of toDelete) {
        try {
            await fetch(`/api/fs/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
        } catch(e) { console.error(e); }
    }
    
    if (typeof showToast === 'function') showToast("Deletion completed.");
    setTimeout(fmRefresh, 300);
}

// Deletes a single, specifically targeted file directly via the API.
window.fmDeleteSingle = async function(path) {
    if (!confirm(`Deleting of this file?\n\nPath: ${path}\nThis action is irreversible.!`)) return;
    
    try {
        const res = await fetch(`/api/fs/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
        if (res.ok) {
            if (typeof showToast === 'function') showToast("File deleted.");
            fmRefresh(); 
        } else {
            alert("An error occurred while deleting..");
        }
    } catch(e) { console.error(e); }
};

// Prepares the context for executing a specific AI action on the selected text inside the File Manager editor.
function fmAiAction(action) {
    const editor = document.getElementById('fm-main-editor');
    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    
    if (!selectedText && action !== 'regen' && action !== 'expand') return;

    if (action === 'erase') {
        editor.value = editor.value.substring(0, editor.selectionStart) + editor.value.substring(editor.selectionEnd);
        document.getElementById('fm-ai-floating-menu').classList.add('hidden');
        return;
    }

    document.getElementById('fm-ai-floating-menu').classList.add('hidden');
    document.getElementById('fm-ai-prompt-overlay').classList.remove('hidden');
    document.getElementById('fm-ai-instruction-input').focus();
    
    window.fmAiContext = { action, start: editor.selectionStart, end: editor.selectionEnd, text: selectedText };
}

function fmCloseAiPrompt() {
    document.getElementById('fm-ai-prompt-overlay').classList.add('hidden');
}

// Sends the selected editor text and specific instructions to the backend AI for processing.
function fmExecuteAiAction() {
    const instruction = document.getElementById('fm-ai-instruction-input').value;
    alert(`Sending to AI:\nAction: ${window.fmAiContext.action}\nInstruction: ${instruction}\nText: ${window.fmAiContext.text}\n\n(Expect backend integration)`);
    fmCloseAiPrompt();
}

// Reverts any unsaved text edits made in the File Manager's internal editor.
function fmCancelEdits() {
    activeFmFile = null;
    currentFmFileMeta = {};
    
    const editorContainer = document.getElementById('fm-editor-container');
    const editor = document.getElementById('fm-main-editor');
    const editorWrapper = document.getElementById('fm-editor-wrapper');
    const syntaxPre = document.getElementById('fm-syntax-pre');
    const lineNums = document.getElementById('fm-line-numbers');

    if (editorContainer) editorContainer.classList.add('hidden');
    if (editor) {
        editor.value = "";
        editor.classList.remove('text-transparent', 'caret-white', 'selection:bg-white/30');
        editor.classList.add('text-[#3E2723]', 'selection:bg-[#D4A373]/30');
    }
    if (editorWrapper) {
        editorWrapper.classList.remove('bg-[#282C34]');
        editorWrapper.classList.add('bg-transparent');
    }
    if (syntaxPre) syntaxPre.style.display = 'none';
    window.fmCurrentLang = null;

    if (lineNums) lineNums.style.display = 'none';
    
   const mediaViewer = document.getElementById('fm-media-viewer');
    if (mediaViewer) {
        mediaViewer.classList.add('hidden');
        mediaViewer.classList.remove('flex');
        const mediaContent = document.getElementById('fm-media-content');
        if (mediaContent) mediaContent.innerHTML = '';
    }
    
    const placeholder = document.getElementById('fm-viewer-placeholder');
    if (placeholder) placeholder.classList.remove('hidden');
    
    document.querySelectorAll('.fm-list-item').forEach(el => el.classList.remove('active'));
    
    if (typeof showToast === 'function') showToast("Changes rejected.");
}

// Saves the modified text content from the File Manager editor back to its source file on the server.
async function fmSaveEdits() {
    if (!currentFmFileMeta.name || !currentFmFileMeta.path) return;
    
    if (!confirm(`Are you sure you want to save the changes to:\n${currentFmFileMeta.name}?`)) return;
    
    const editor = document.getElementById('fm-main-editor');
    const content = editor.value;
    const isDocument = currentFmFileMeta.path.startsWith('documents/');

    try {
        if (!isDocument) {
            const res = await fetch('/api/fs/save_direct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: currentFmFileMeta.path, content: content })
            });
            if (res.ok) {
                if (typeof showToast === 'function') showToast("File overwritten successfully!");
                editor.dataset.originalContent = content; 
            } else alert("Direct write error.");
        } else {
            const sessionInput = document.getElementById('session-name-input');
            let sessionName = sessionInput ? sessionInput.value : "Manual Edits";
            if (sessionName === "Passive Mode" || sessionName === "New Session" || sessionName.trim() === "") {
                sessionName = "Manual Edits"; 
            }

            const res = await fetch('/api/fs/save_internal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ original_name: currentFmFileMeta.name, content: content, session_name: sessionName })
            });
            if (res.ok) {
                const data = await res.json();
                if (typeof showToast === 'function') showToast(`The copy is saved in ${sessionName}!`);
                await fmLoadDirectory('documents', false);
                fmOpenFile(data.path, currentFmFileMeta.name.replace(/\.[^/.]+$/, "") + '_edited' + currentFmFileMeta.name.match(/\.[^/.]+$/)[0], '', 'internal');
            } else alert("Error saving to Internal.");
        }
    } catch (err) {
        console.error(err);
        alert("Network error while saving.");
    }
}

document.getElementById('fm-main-editor').addEventListener('mouseup', function(e) {
    const start = this.selectionStart;
    const end = this.selectionEnd;
    const menu = document.getElementById('fm-ai-floating-menu');
    
    if (start !== end) {
        menu.classList.remove('hidden');
        menu.style.left = e.offsetX + 'px'; 
        menu.style.top = '10px';
        menu.style.right = '10px';
        menu.style.left = 'auto';
    } else {
        menu.classList.add('hidden');
    }
});

const fmHeader = document.getElementById('fm-header');
if (fmHeader) {
    fmHeader.addEventListener('dblclick', (e) => {
        if (!e.target.closest('button')) {
            toggleMaximizeFileManager();
        }
    });
}

const fmSplitResizer = document.getElementById('fm-split-resizer');
const fmLeftPanel = document.getElementById('fm-left-panel');
let isFmSplitting = false;

if (fmSplitResizer && fmLeftPanel) {
    fmSplitResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isFmSplitting = true;
        document.body.style.cursor = 'ew-resize'; 
        document.body.classList.add('select-none'); 
    });

    document.addEventListener('mousemove', (e) => {
        if (!isFmSplitting) return;
        
        const fmWin = document.getElementById('fm-window');
        const winRect = fmWin.getBoundingClientRect();
        
        let newWidth = e.clientX - winRect.left;
        
        if (newWidth < 200) newWidth = 200;
        if (newWidth > winRect.width - 300) newWidth = winRect.width - 300;
        
        const percentage = (newWidth / winRect.width) * 100;
        
        fmLeftPanel.classList.remove('w-1/2');

        fmLeftPanel.style.width = `${percentage}%`;
        fmLeftPanel.style.flex = 'none';
    });

    document.addEventListener('mouseup', () => {
        if (isFmSplitting) {
            isFmSplitting = false;
            document.body.style.cursor = 'default';
            document.body.classList.remove('select-none');
        }
    });
}

if (!window.fmClipboard) {
    window.fmClipboard = { action: null, paths: [] };
}

window.showFmContextMenu = function(e, item) {
    e.preventDefault();
    e.stopPropagation();
    
    const menu = document.getElementById('fm-context-menu');
    if (!menu) return;

    menu.classList.remove('hidden');
    menu.style.display = 'block';
    
    const hasClipboard = window.fmClipboard && window.fmClipboard.paths.length > 0;
    
    function toggleMenuBtn(id, isEnabled) {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (isEnabled) {
            btn.classList.remove('opacity-40', 'pointer-events-none');
            if(id === 'ctx-delete') btn.classList.add('hover:bg-red-50');
            else btn.classList.add('hover:bg-[#D4A373]/15');
        } else {
            btn.classList.add('opacity-40', 'pointer-events-none');
            btn.classList.remove('hover:bg-[#D4A373]/15', 'hover:bg-red-50');
        }
    }

    if (item) {
        menu.dataset.targetPath = item.path;
        menu.dataset.targetType = item.type;
        menu.dataset.targetName = item.name;
        
        const isImmutable = item.immutable === true || item.immutable === "true";
        
        toggleMenuBtn('ctx-open', true);
        toggleMenuBtn('ctx-rename', !isImmutable);
        toggleMenuBtn('ctx-cut', !isImmutable);
        toggleMenuBtn('ctx-copy', true);
        toggleMenuBtn('ctx-delete', !isImmutable);
        toggleMenuBtn('ctx-info', true);
        toggleMenuBtn('ctx-paste', hasClipboard); 
    } else {
        menu.dataset.targetPath = typeof currentFmPath !== 'undefined' ? currentFmPath : 'Root';
        menu.dataset.targetType = 'folder';
        menu.dataset.targetName = 'Current Directory';
        
        toggleMenuBtn('ctx-open', false);
        toggleMenuBtn('ctx-rename', false);
        toggleMenuBtn('ctx-cut', false);
        toggleMenuBtn('ctx-copy', false);
        toggleMenuBtn('ctx-delete', false);
        toggleMenuBtn('ctx-info', true);
        toggleMenuBtn('ctx-paste', hasClipboard); 
    }
    
    let menuX = e.clientX;
    let menuY = e.clientY;
    const menuWidth = menu.offsetWidth || 176; 
    const menuHeight = menu.offsetHeight || 250; 
    
    if (menuX + menuWidth > window.innerWidth) menuX = window.innerWidth - menuWidth - 5;
    if (menuY + menuHeight > window.innerHeight) menuY = window.innerHeight - menuHeight - 5;
    if (menuX < 0) menuX = 5;
    if (menuY < 0) menuY = 5;
    
    menu.style.left = menuX + 'px';
    menu.style.top = menuY + 'px';
};

window.handleFmContextAction = async function(action) {
    const menu = document.getElementById('fm-context-menu');
    menu.classList.add('hidden');
    menu.style.display = 'none';
    
    const path = menu.dataset.targetPath;
    const type = menu.dataset.targetType;
    const name = menu.dataset.targetName;

    switch(action) {
        case 'open':
            if (type === 'folder') fmLoadDirectory(path);
            else fmOpenFile(path, name, '', 'system');
            break;
            
        case 'rename':
            const newName = prompt("Enter new file name:", name);
            if (!newName || newName === name || newName.includes('/')) return;
            try {
                const res = await fetch('/api/fs/rename', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ old_path: path, new_name: newName })
                });
                if (res.ok) fmRefresh();
                else alert("Rename error.");
            } catch(e) { console.error(e); }
            break;
            
        case 'cut':
        case 'copy':
            window.fmClipboard = { action: action, paths: [path] };
            
            if (typeof showToast === 'function') {
                showToast(`File added to clipboard (${action.toUpperCase()})`);
            } else {
                alert(`Done! File copied (${action.toUpperCase()})`);
            }
            break;
            
        case 'paste':
            if (!window.fmClipboard || !window.fmClipboard.paths.length) return;
            try {
                const res = await fetch('/api/fs/paste', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        action: window.fmClipboard.action,
                        sources: window.fmClipboard.paths,
                        destination: currentFmPath
                    })
                });
                if (res.ok) {
                    if (typeof showToast === 'function') showToast("File pasted successfully.!");
                    if (window.fmClipboard.action === 'cut') window.fmClipboard = { action: null, paths: [] };
                    fmRefresh();
                } else alert("Paste error.");
            } catch(e) { console.error(e); }
            break;
            
        case 'delete':
            if (typeof window.fmDeleteSingle === 'function') {
                window.fmDeleteSingle(path);
            }
            break;
            
        case 'info':
            alert(`🔍 Information\n\nName: ${name}\nPath: ${path}\nType: ${type.toUpperCase()}`);
            break;
    }
};

document.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        const menu = document.getElementById('fm-context-menu');
        
        if (menu && !menu.contains(e.target)) {
            menu.classList.add('hidden');
            menu.style.display = 'none'; 
        }
    }
}, true);

const fmSearchInput = document.getElementById('fm-search');
if (fmSearchInput) {
    fmSearchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const items = document.querySelectorAll('.fm-list-item');
        
        items.forEach(item => {
            const fileName = item.querySelector('.truncate').innerText.toLowerCase();
            if (fileName.includes(term)) {
                item.style.display = 'flex'; 
            } else {
                item.style.display = 'none'; 
            }
        });
    });
}

let fmSelectionStart = 0;
let fmSelectionEnd = 0;
let fmSelectedText = "";
let fmCurrentAiAction = null;

// Evaluates the current text selection in the File Manager editor to correctly position the AI floating menu.
function checkFmSelection(e) {
    const editor = document.getElementById('fm-main-editor');
    const menu = document.getElementById('fm-ai-floating-menu');
    
    if (!editor || !menu) return;

    setTimeout(() => {
        if (editor.selectionStart !== editor.selectionEnd && !editor.disabled) {
            fmSelectionStart = editor.selectionStart;
            fmSelectionEnd = editor.selectionEnd;
            fmSelectedText = editor.value.substring(fmSelectionStart, fmSelectionEnd);
            
            menu.classList.remove('hidden');
            menu.style.display = 'flex';
            
            let menuX = e.clientX;
            let menuY = e.clientY - 45; 
            
            const menuWidth = menu.offsetWidth || 350;
            
            if (menuX + menuWidth > window.innerWidth) menuX = window.innerWidth - menuWidth - 10;
            if (menuY < 0) menuY = e.clientY + 20;
            if (menuX < 0) menuX = 10;
            
            menu.style.left = menuX + 'px';
            menu.style.top = menuY + 'px';
            menu.style.transform = 'none'; 
            
        } else {
            menu.classList.add('hidden');
            menu.style.display = 'none';
        }
    }, 10);
}

const fmEditorEl = document.getElementById('fm-main-editor');
if (fmEditorEl) {
    fmEditorEl.addEventListener('mouseup', checkFmSelection);
    
    fmEditorEl.addEventListener('keyup', () => {
        const menu = document.getElementById('fm-ai-floating-menu');
        if (menu && fmEditorEl.selectionStart === fmEditorEl.selectionEnd) {
            menu.classList.add('hidden');
            menu.style.display = 'none';
        }
    });
}

document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('fm-ai-floating-menu');
    const editor = document.getElementById('fm-main-editor');
    const overlay = document.getElementById('fm-ai-prompt-overlay');
    
    if (e.target.closest('.fm-ai-btn')) {
        return; 
    }
    
    if (menu && !menu.contains(e.target) && e.target !== editor && (!overlay || !overlay.contains(e.target))) {
        menu.classList.add('hidden');
        menu.style.display = 'none';
    }
}, true);

window.fmAiAction = async function(action) {
    const menu = document.getElementById('fm-ai-floating-menu');
    if (menu) {
        menu.classList.add('hidden'); 
        menu.style.display = 'none';
    }
    
    if (action === 'copy') {
        try {
            await navigator.clipboard.writeText(fmSelectedText);
            if (typeof showToast === 'function') showToast("Text copied!");
        } catch (err) {
            document.execCommand('copy');
            if (typeof showToast === 'function') showToast("Text copied!");
        }
        return;
    }
    
    if (action === 'ask_here') {
        const chatInput = document.getElementById('user-input');
        if (chatInput) {
            chatInput.value = `About this text:\n"${fmSelectedText}"\n\nPlease... `;
            chatInput.style.height = 'auto';
            chatInput.style.height = chatInput.scrollHeight + 'px';
            
            if (typeof minimizeFileManager === 'function') minimizeFileManager();
            
            chatInput.focus();
            chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
        }
        return;
    }
    
    if (action === 'regen' || action === 'expand') {
        fmCurrentAiAction = action; 
        
        const overlay = document.getElementById('fm-ai-prompt-overlay');
        const input = document.getElementById('fm-ai-instruction-input');
        
        if (overlay && input) {
            overlay.classList.remove('hidden');
            overlay.style.display = 'flex'; 
            
            input.value = ''; 
            
            setTimeout(() => input.focus(), 100);
        }
    }
};

window.fmCloseAiPrompt = function() {
    const overlay = document.getElementById('fm-ai-prompt-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
    
    const editor = document.getElementById('fm-main-editor');
    if (editor) {
        editor.focus();
    }
};

const aiPromptInput = document.getElementById('fm-ai-instruction-input');
if (aiPromptInput) {
    aiPromptInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            fmExecuteAiAction();
        }
    });
}

window.fmAiAbortController = null;
window.isFmGenerating = false;

window.fmExecuteAiAction = async function() {
    const instructionInput = document.getElementById('fm-ai-instruction-input');
    const instruction = instructionInput.value.trim();
    
    if (!instruction) {
        alert("Please enter an AI instruction!");
        return;
    }
    
    fmCloseAiPrompt();
    
    const fmEditor = document.getElementById('fm-main-editor');
    if (!fmEditor) return;

    const activeSession = (typeof currentSessionFile !== 'undefined') ? currentSessionFile : null;
    const activeModel = document.getElementById('sel-model') ? document.getElementById('sel-model').value : 'llama3';
    const originalText = fmEditor.value;
    const textBefore = originalText.substring(0, fmSelectionStart);
    const textAfter = originalText.substring(fmSelectionEnd);
    const payload = {
        type: fmCurrentAiAction || 'regen', 
        target_text: fmSelectedText || "",
        instruction: instruction,
        model: activeModel,
        mode: 2, 
        session_file: activeSession,
        text_before: textBefore,
        text_after: textAfter   
    };

    let currentInsertPos = fmSelectionStart;
    
    if (payload.type === 'regen') {
        fmEditor.value = textBefore + textAfter;
    } else {
        fmEditor.value = textBefore + fmSelectedText + "\n\n" + textAfter;
        currentInsertPos = fmSelectionStart + fmSelectedText.length + 2;
    }

    fmEditor.disabled = true;
    fmEditor.classList.add('opacity-70');
    
    const stopBtn = document.getElementById('fm-stop-btn');
    if (stopBtn) stopBtn.classList.remove('hidden');

    window.fmAiAbortController = new AbortController();
    window.isFmGenerating = true;

    try {
        const response = await fetch('/api/chat/inline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: window.fmAiAbortController.signal
        });
        
        if (!response.ok) {
            const errInfo = await response.text();
            throw new Error(`Error ${response.status}: ${errInfo}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        
        while (window.isFmGenerating) {
            const { done, value } = await reader.read();
            if (done || !window.isFmGenerating) break; 
            
            const isAtBottom = fmEditor.scrollHeight - fmEditor.scrollTop - fmEditor.clientHeight < 40;

            const chunk = decoder.decode(value, { stream: true });
            const currentText = fmEditor.value;
            fmEditor.value = currentText.substring(0, currentInsertPos) + chunk + currentText.substring(currentInsertPos);
            
            currentInsertPos += chunk.length;
            if (window.fmCurrentLang) window.updateFmSyntaxHighlighting(fmEditor.value, window.fmCurrentLang);
            
            if (isAtBottom) {
                fmEditor.scrollTop = fmEditor.scrollHeight; 
            }
        }
        
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log("Generation in File Manager was stopped manually.");
        } else {
            console.error("AI generation error:", err);
            alert("An error occurred while connecting to AI: " + err.message);
        }
    } finally {
        window.isFmGenerating = false;
        fmEditor.disabled = false;
        fmEditor.classList.remove('opacity-70');
        if (stopBtn) stopBtn.classList.add('hidden');
        
        fmEditor.selectionStart = currentInsertPos;
        fmEditor.selectionEnd = currentInsertPos;
        fmEditor.focus();
        
        window.fmAiAbortController = null;
    }
};

// Aborts an ongoing AI generation process triggered inside the File Manager.
window.fmStopAiAction = function() {
    window.isFmGenerating = false;
    if (window.fmAiAbortController) {
        window.fmAiAbortController.abort();
        window.fmAiAbortController = null;
    }
    if (typeof showToast === 'function') showToast("Generation stopped.");
};

const promptBox = document.getElementById('fm-ai-prompt-overlay');
const promptHeader = document.getElementById('fm-ai-prompt-header');

if (promptBox && promptHeader) {
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    promptHeader.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = promptBox.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        promptHeader.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const fmRightPanel = document.getElementById('fm-right-panel');
            if (!fmRightPanel) return;
            
            const panelRect = fmRightPanel.getBoundingClientRect();
            
            let newX = e.clientX - dragOffsetX - panelRect.left;
            let newY = e.clientY - dragOffsetY - panelRect.top;
            
            if(newX < 0) newX = 0;
            if(newY < 0) newY = 0;
            if(newX + promptBox.offsetWidth > panelRect.width) newX = panelRect.width - promptBox.offsetWidth;
            if(newY + promptBox.offsetHeight > panelRect.height) newY = panelRect.height - promptBox.offsetHeight;

            promptBox.style.left = newX + 'px';
            promptBox.style.top = newY + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            promptHeader.style.cursor = 'move';
        }
    });
}

const fmEditorInput = document.getElementById('fm-main-editor');

if (fmEditorInput) {
    const stopGlobalScripts = (e) => {
        if (e.button === 0) {
            e.stopPropagation();
        }
    };

    fmEditorInput.addEventListener('mousedown', stopGlobalScripts);
    fmEditorInput.addEventListener('click', stopGlobalScripts);
    
    fmEditorInput.addEventListener('mouseup', (e) => {
        if (e.button === 0) e.stopPropagation();
    });
}

window.fmOpenSettings = function() {
    const fmWindow = document.getElementById('fm-window');
    if (fmWindow) fmWindow.classList.remove('hidden');
    
    if (typeof fmLoadDirectory === 'function') {
        fmLoadDirectory('static');
    }
    
    if (typeof fmOpenFile === 'function') {
        fmOpenFile('static/ollama_list.json', 'ollama_list.json', 'JSON', 'system');
    }
};

// Injects a simulated, flashing cursor marker into a generated text string to indicate active insertion.
function appendSmartCursor(htmlString) {
    if (!htmlString) return '<span class="magi-reveal-cursor">>>></span>';

    const cursorHtml = '<span class="magi-reveal-cursor">>>></span>';

    const closingTagsRegex = /(<\/p>|<\/div>|<\/li>|<\/h[1-6]>|<\/pre>|<\/code>|<\/b>|<\/strong>|<\/i>|<\/em>)$/i;

    if (closingTagsRegex.test(htmlString)) {
        return htmlString.replace(closingTagsRegex, (match) => cursorHtml + match);
    }

    return htmlString + cursorHtml;
}

// Handles interactive actions (like running code or copying) clicked inside a code snippet bubble.
window.handleCodeBubble = async function(btn, action, param) {
    const bubbleWrapper = btn.closest('.code-bubble-wrapper');
    const msgGroup = btn.closest('.message-pair-group');
    if (!bubbleWrapper || !msgGroup) return;
    
    const preBlock = bubbleWrapper.querySelector('pre');
    const codeBlock = bubbleWrapper.querySelector('code');
    const textarea = bubbleWrapper.querySelector('textarea');
    const iconLock = bubbleWrapper.querySelector('.btn-lock-code i');
    const msgIndex = msgGroup.getAttribute('data-msg-index');
    
    let aiIndex = parseInt(msgIndex) + 1;
    let lang = 'txt';
    if (codeBlock.className) {
        const langMatch = codeBlock.className.match(/language-(\w+)/);
        if (langMatch) lang = langMatch[1];
    }

    switch(action) {
        case 'copy': {
            navigator.clipboard.writeText(textarea.value).then(() => {
                const orig = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check text-green-500 mr-2"></i> COPIED';
                setTimeout(() => btn.innerHTML = orig, 2000);
            });
            break;
        }
            
        case 'toggle_lock': {
            const isLocked = !textarea.classList.contains('hidden');
            const lockTextSpan = btn.querySelector('.lock-text'); 
            
            if (isLocked) {
                textarea.classList.add('hidden');
                preBlock.classList.remove('hidden');
                iconLock.className = 'fa-solid fa-lock mr-2';
                if (lockTextSpan) lockTextSpan.innerText = 'UNLOCK';
                
                const oldText = decodeURIComponent(textarea.getAttribute('data-raw'));
                const newText = textarea.value;
                
                codeBlock.textContent = newText;
                delete codeBlock.dataset.highlighted;
                if (typeof hljs !== 'undefined') hljs.highlightElement(codeBlock);
                
                const lineNumbersDiv = bubbleWrapper.querySelector('.magi-code-lines') || bubbleWrapper.querySelector('.code-line-numbers');
                if (lineNumbersDiv && typeof generateLineNumbersHTML === 'function') {
                    lineNumbersDiv.innerHTML = generateLineNumbersHTML(newText);
                }

                const statsDiv = bubbleWrapper.querySelector('.flex.gap-4');
                if (statsDiv) {
                    const newLineCount = newText.split('\n').length;
                    const newCharCount = newText.length;
                    statsDiv.innerHTML = `<span>Lines: ${newLineCount}</span><span>Chars: ${newCharCount}</span>`;
                }
                
                if (oldText !== newText) {
                    textarea.setAttribute('data-raw', encodeURIComponent(newText));
                    const oldMd = `\`\`\`${lang}\n${oldText}\n\`\`\``;
                    const newMd = `\`\`\`${lang}\n${newText}\n\`\`\``;
                    
                    await modifyMessageMarkdown(aiIndex, oldMd, newMd, 0);
                    if (typeof showToast === 'function') showToast("Code locked & saved!");
                }
            } else {
                preBlock.classList.add('hidden');
                textarea.classList.remove('hidden');
                iconLock.className = 'fa-solid fa-lock-open mr-2 text-[#D4A373]';
                if (lockTextSpan) lockTextSpan.innerText = 'LOCK';
                textarea.focus();
            }
            break;
        }
            
        case 'export_file': {
            if (typeof closeAllDropdowns === 'function') closeAllDropdowns();
            
            const textContent = textarea.value;
            const extension = param || 'txt';
            
            let blob;
            if (extension === 'docx' && typeof htmlDocx !== 'undefined') {
                const docxHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre>${escapeHtml(textContent)}</pre></body></html>`;
                blob = htmlDocx.asBlob(docxHTML);
            } else {
                blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            }
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `magi_code_${Date.now()}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            if (typeof showToast === 'function') showToast(`The code is exported as .${extension}`);
            break;
        }

        case 'astral': {
            const codeContent = textarea.value;
            if (typeof addAstralCell === 'function') {
                addAstralCell(codeContent, 'code', lang);
                if (typeof showToast === 'function') showToast("Added to Astral Projection! ✨");
                if (typeof restoreAstral === 'function') restoreAstral();
            }
            break;
        }
    }
};

document.addEventListener('scroll', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('code-scroll-area')) {
        const wrapper = e.target.closest('.code-bubble-wrapper');
        if (wrapper) {
            const lineNums = wrapper.querySelector('.code-line-numbers');
            if (lineNums) lineNums.scrollTop = e.target.scrollTop;
        }
    }
}, true); 

let astralCells = [];
let astralIsMaximized = false;
let astralPrevState = { top: '', left: '', width: '', height: '' };

// Restores the Astral workspace window from its minimized bubble state.
window.restoreAstral = function() {
    const win = document.getElementById('astral-window');
    const bubble = document.getElementById('astral-bubble');
    if (win) { win.classList.remove('hidden'); win.style.display = 'flex'; win.style.zIndex = '160'; }
    if (bubble) { bubble.classList.add('hidden'); bubble.style.display = 'none'; }
    loadAstralData();
};

// Minimizes the Astral workspace window into a floating, draggable bubble.
window.minimizeAstral = function() {
    const win = document.getElementById('astral-window');
    const bubble = document.getElementById('astral-bubble');
    if (win) { win.classList.add('hidden'); win.style.display = 'none'; }
    if (bubble) { bubble.classList.remove('hidden'); bubble.style.display = 'flex'; }
};

// Completely closes the Astral workspace window.
window.closeAstral = function() {
    const win = document.getElementById('astral-window');
    const bubble = document.getElementById('astral-bubble');
    if (win) { win.classList.add('hidden'); win.style.display = 'none'; }
    if (bubble) { bubble.classList.add('hidden'); bubble.style.display = 'none'; }
};

// Toggles the Astral workspace window between a maximized fullscreen state and its default windowed state.
window.toggleMaximizeAstral = function() {
    const win = document.getElementById('astral-window');
    const icon = document.getElementById('astral-maximize-icon');
    if (!win) return;

    if (!astralIsMaximized) {
        astralPrevState = { top: win.style.top, left: win.style.left, width: win.style.width, height: win.style.height };
        win.style.top = '0'; win.style.left = '0'; win.style.width = '100vw'; win.style.height = '100vh'; win.style.borderRadius = '0';
        icon.className = 'fa-solid fa-window-restore text-[16px]'; 
        astralIsMaximized = true;
    } else {
        win.style.top = astralPrevState.top || '150px';
        win.style.left = astralPrevState.left || '25%';
        win.style.width = astralPrevState.width || '800px';
        win.style.height = astralPrevState.height || '500px';
        win.style.borderRadius = '0.5rem';
        icon.className = 'fa-regular fa-window-maximize text-[16px]'; 
        astralIsMaximized = false;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const astralWin = document.getElementById('astral-window');
    const astralHeader = document.getElementById('astral-header');
    
    if (typeof loadAstralData === 'function') loadAstralData();
    if (!astralWin || !astralHeader) return;

    let isDragging = false;
    let offsetX, offsetY;

    astralHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || (typeof astralIsMaximized !== 'undefined' && astralIsMaximized)) return;
        
        isDragging = true;
        const rect = astralWin.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        
        if (newY < 0) newY = 0;
        if (newX < 0) newX = 0;
        if (newY > window.innerHeight - astralWin.offsetHeight) newY = window.innerHeight - astralWin.offsetHeight;
        if (newX > window.innerWidth - astralWin.offsetWidth) newX = window.innerWidth - astralWin.offsetWidth;
        
        astralWin.style.left = `${newX}px`;
        astralWin.style.top = `${newY}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) { 
            isDragging = false; 
        }
    });
});

// Fetches the stored Astral cell data from the backend server and renders it into the workspace.
async function loadAstralData() {
    try {
        const res = await fetch('/api/astral');
        const data = await res.json();
        astralCells = data.cells || [];
        renderAstralCells();
    } catch (e) { console.error("Error loading astral data:", e); }
}

// Saves the current state, order, and content of all Astral cells back to the backend server.
async function saveAstralData() {
    try {
        await fetch('/api/astral/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cells: astralCells })
        });
    } catch (e) { console.error("Error saving astral data:", e); }
}

// Creates and inserts a new note or code cell into the Astral workspace.
window.addAstralCell = function(content = "", type = "code", lang = "plaintext", insertIndex = null) {
    const newCell = {
        id: 'cell_' + Date.now() + Math.floor(Math.random() * 1000),
        session_source: window.currentSessionFile || state.currentSessionFile || "Unknown",
        date_added: new Date().toLocaleString('en-GB', { hour12: false }).slice(0, 16),
        type: type,
        lang: lang,
        content: content,
        selected: false
    };

    if (insertIndex !== null) {
        astralCells.splice(insertIndex, 0, newCell);
    } else {
        astralCells.push(newCell);
    }
    
    saveAstralData();
    renderAstralCells(); 
    
    if (insertIndex === null) {
        setTimeout(() => {
            const container = document.getElementById('astral-cells-container')?.parentElement;
            if (container) container.scrollTop = container.scrollHeight;
        }, 100);
    }
};

// Deletes a specific Astral cell identified by its ID and saves the updated workspace.
window.deleteAstralCell = function(id) {
    astralCells = astralCells.filter(c => c.id !== id);
    saveAstralData();
    renderAstralCells();
};

// Updates the text content of a specific Astral cell as the user types and triggers a save.
window.updateAstralCellContent = function(id, textarea) {
    const cell = astralCells.find(c => c.id === id);
    if (cell) {
        cell.content = textarea.value;
        autoResize(textarea);
        saveAstralData();
    }
};

// Clears all existing cells from the Astral workspace after requesting user confirmation.
window.clearAstral = function() {
    if (confirm("Are you sure you want to clear ALL cells from the workspace?")) {
        astralCells = [];
        saveAstralData();
        renderAstralCells();
    }
};

// Moves a specific Astral cell up or down in the overall workspace order.s
window.moveAstralCell = function(id, dir) {
    const index = astralCells.findIndex(c => c.id === id);
    if (index < 0) return;
    if (dir === -1 && index > 0) {
        [astralCells[index - 1], astralCells[index]] = [astralCells[index], astralCells[index - 1]];
    } else if (dir === 1 && index < astralCells.length - 1) {
        [astralCells[index + 1], astralCells[index]] = [astralCells[index], astralCells[index + 1]];
    }
    saveAstralData();
    renderAstralCells();
};

// Clears the active selection state from all currently marked Astral cells.
window.unmarkAstralCells = function() {
    astralCells.forEach(c => c.selected = false);
    renderAstralCells();
};

// Iterates through the stored Astral cells and renders their corresponding HTML elements into the UI container.
window.renderAstralCells = function() {
    const container = document.getElementById('astral-cells-container');
    const emptyState = document.getElementById('astral-empty-state');
    const stats = document.getElementById('astral-stats');
    if (!container) return;

    if (astralCells.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        if (stats) stats.innerText = '0 Cells | 0 Words';
        return;
    }
    if (emptyState) emptyState.classList.add('hidden');

    let totalWords = 0;
    
    let htmlContent = `<div class="astral-dropzone" onclick="addAstralCell('', 'code', 'plaintext', 0)"><div class="astral-dropzone-label"><i class="fa-solid fa-plus mr-2"></i> Add Cell</div></div>`;

    htmlContent += astralCells.map((cell, index) => {
        totalWords += cell.content.split(/\s+/).filter(w => w.length > 0).length;
        const sessionClean = cell.session_source.replace('.json', ''); 
        const langDisplay = cell.lang === 'plaintext' || cell.lang === 'txt' ? '' : `<span class="text-[#D4A373]">[${cell.lang}]</span>`; 
        
        const cellTitle = cell.title || `Unnamed Cell`;
        
        return `
        <div class="astral-cell bg-[#FDFBF7] border border-[#D4A373]/40 rounded-lg shadow-sm flex flex-col overflow-hidden relative z-10" data-id="${cell.id}">
            
            <div class="astral-cell-header relative bg-[#FDFBF7] border-b border-[#D4A373]/20 px-3 py-2 flex justify-between items-center text-[#8D6E63] text-[12px] font-bold font-mono uppercase tracking-wider cursor-grab active:cursor-grabbing">
                
                <div class="flex items-center gap-2 pointer-events-none z-10">
                    <input type="text" value="${cellTitle}" 
                           onchange="updateAstralCellTitle('${cell.id}', this.value)" 
                           onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" 
                           class="bg-transparent border border-transparent hover:border-[#D4A373]/30 focus:border-[#D4A373] focus:bg-white outline-none text-[12px] font-bold text-[#D4A373] uppercase tracking-wider w-40 px-1 py-0.5 rounded pointer-events-auto transition-colors" 
                           title="Rename Cell">
                    ${langDisplay}
                </div>

                <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] opacity-60 italic pointer-events-none whitespace-nowrap">
                    ${sessionClean}
                </div>

                <div class="astral-cell-actions flex items-center gap-3 pointer-events-auto z-10 opacity-100">
                    <button onclick="navigator.clipboard.writeText(this.closest('.astral-cell').querySelector('textarea').value); if(typeof showToast === 'function') showToast('Copied!')" class="text-[#8D6E63] hover:text-[#D4A373] px-1 text-[14px] transition-colors" title="Copy"><i class="fa-solid fa-copy"></i></button>
                    <button onclick="synthesizeAstral('single', '${cell.id}')" class="text-[#8D6E63] hover:text-[#D4A373] px-1 text-[14px] transition-colors" title="Manifest"><i class="fa-solid fa-bolt"></i></button>
                    <button onclick="deleteAstralCell('${cell.id}')" class="text-[#8D6E63] hover:text-red-500 px-1 text-[14px] transition-colors" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    
                    <input type="checkbox" class="astral-cell-checkbox accent-[#D4A373] w-[16px] h-[16px] cursor-pointer" ${cell.selected ? 'checked' : ''} onchange="toggleCellSelection('${cell.id}', this.checked)">
                </div>
            </div>

            <textarea spellcheck="false" class="w-full p-4 bg-transparent outline-none border-none resize-none font-mono text-[13px] leading-relaxed text-[#3E2723] min-h-[80px]" oninput="updateAstralCellContent('${cell.id}', this)" placeholder="Manifest your thoughts...">${cell.content}</textarea>
        </div>
        
        <div class="astral-dropzone" onclick="addAstralCell('', 'code', 'plaintext', ${index + 1})">
            <div class="astral-dropzone-label"><i class="fa-solid fa-plus mr-2"></i> Add Cell</div>
        </div>`;
    }).join('');

    container.innerHTML = htmlContent;

    if (stats) stats.innerText = `${astralCells.length} Cells | ${totalWords} Words`;

    if (window.astralSortable) window.astralSortable.destroy();
    window.astralSortable = Sortable.create(container, {
        draggable: '.astral-cell', 
        handle: '.astral-cell-header', 
        filter: 'button, input, textarea', 
        preventOnFilter: false,
        animation: 150,
        ghostClass: 'tab-ghost',
        onEnd: function () {
            const newOrder = [];
            container.querySelectorAll('.astral-cell').forEach(el => {
                const id = el.getAttribute('data-id');
                const cell = astralCells.find(c => c.id === id);
                if (cell) newOrder.push(cell);
            });
            astralCells = newOrder;
            saveAstralData();
            renderAstralCells(); 
        }
    });

    container.querySelectorAll('textarea').forEach(autoResize);
};

// Synthesizes the content of selected (or all) Astral cells into a combined output for AI context processing.
window.synthesizeAstral = function(mode, cellId = null) {
    let cellsToSynth = [];
    if (mode === 'single' && cellId) {
        const c = astralCells.find(cell => cell.id === cellId);
        if (c) cellsToSynth.push(c);
    } else if (mode === 'selected') {
        cellsToSynth = astralCells.filter(c => c.selected);
        if (cellsToSynth.length === 0) return alert("There are no marked cells.");
    } else if (mode === 'all') {
        cellsToSynth = [...astralCells];
        if (cellsToSynth.length === 0) return alert("There are no cells for a manifestation.");
    }

    let synthPrompt = "";
    cellsToSynth.forEach(c => synthPrompt += c.content + ":\n");
    synthPrompt += "Please, analyze these fragmented emanations for patterns, core insights, and hidden links. Distill the essential truth from these cells and provide a structured synthesis. Eliminate redundancies and highlight the most critical actions/concepts: ";

    const input = document.getElementById('user-input');
    if (input) {
        input.value = synthPrompt;
        input.focus();
        autoResize(input);
        minimizeAstral();
    }
};


// Updates the custom title of a specific Astral cell and saves the change.
window.updateAstralCellTitle = function(id, title) {
    const cell = astralCells.find(c => c.id === id);
    if (cell) {
        cell.title = title;
        saveAstralData();
    }
};

// Toggles the selection state for all Astral cells simultaneously based on a master checkbox.
window.toggleAstralSelectAll = function(master) {
    const isChecked = master.checked;
    
    astralCells.forEach(cell => cell.selected = isChecked);
    
    const checkboxes = document.querySelectorAll('.astral-cell-checkbox');
    checkboxes.forEach(cb => cb.checked = isChecked);
    
    const label = document.getElementById('astral-master-label');
    if (label) label.innerText = isChecked ? 'UNMARK ALL' : 'MARK ALL';
    
    saveAstralData();
};

// Toggles the individual selection state of a specific Astral cell.
window.toggleCellSelection = function(id, isSelected) {
    const cell = astralCells.find(c => c.id === id);
    if (cell) cell.selected = isSelected;
    
    const master = document.getElementById('astral-master-checkbox');
    const label = document.getElementById('astral-master-label');
    
    if (master && label) {
        const allSelected = astralCells.every(c => c.selected);
        master.checked = allSelected;
        label.innerText = allSelected ? 'UNMARK ALL' : 'MARK ALL';
    }
    
    saveAstralData();
};

// Logs a specific clipboard action or text snippet to the Time Machine database for history tracking.
window.logToTimeMachine = async function(action, content, source) {
    if (!content || content.trim() === "") return;
    try {
        await fetch('/api/clipboard/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, content: content, source: source })
        });
    } catch (e) { console.error("Time Machine Log Error:", e); }
};

// Opens the Time Machine modal interface to view the application's global clipboard history.
window.openTimeMachine = async function() {
    const modal = document.getElementById('time-machine-modal');
    const container = document.getElementById('time-machine-content');
    if (!modal || !container) return;
    
    if (typeof closeAllDropdowns === 'function') closeAllDropdowns();
    
    modal.classList.remove('hidden');
    container.innerHTML = '<div class="text-center text-[#8D6E63] animate-pulse mt-20 font-mono"><i class="fa-solid fa-spinner fa-spin text-3xl mb-4 block"></i> Timeline scanning...</div>';
    
    try {
        const res = await fetch('/api/clipboard/history');
        let history = await res.json();
        
        if (!history || history.length === 0) {
            container.innerHTML = '<div class="text-center text-[#8D6E63] mt-20 font-mono text-sm"><i class="fa-solid fa-ghost text-4xl mb-4 block opacity-50"></i> The time machine is empty.</div>';
            return;
        }
        
        history.reverse(); 
        
        container.innerHTML = history.map(item => {
            const dateStr = new Date(item.timestamp).toLocaleString('bg-BG', { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
            const isCopy = item.action === 'copied';
            const actionColor = isCopy ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50';
            const actionIcon = isCopy ? 'fa-copy' : 'fa-eraser';
            const actionText = isCopy ? 'COPIED' : 'REPLACED / DELETED';
            
            const safeContent = encodeURIComponent(item.content);
            const displayContent = escapeHtml(item.content).substring(0, 400) + (item.content.length > 400 ? '\n\n... [The text is visually cut off, but preserved in its entirety]' : '');
            
            return `
            <div class="bg-white border border-[#D4A373]/30 rounded-lg p-4 shadow-sm flex flex-col gap-3 relative group hover:border-[#D4A373] transition-all">
                <div class="flex justify-between items-center text-[10px] font-mono font-bold uppercase border-b border-[#D4A373]/10 pb-2">
                    <span class="${actionColor} px-2 py-1 rounded border ${isCopy ? 'border-green-200' : 'border-red-200'} flex items-center gap-1.5"><i class="fa-solid ${actionIcon}"></i> ${actionText}</span>
                    <span class="text-[#8D6E63] flex items-center gap-2"><i class="fa-solid fa-cube"></i> ${item.source} <span class="opacity-50">|</span> ${dateStr}</span>
                </div>
                
                <div class="text-[12px] text-[#3E2723] font-mono whitespace-pre-wrap max-h-32 overflow-hidden relative leading-relaxed bg-[#FDFBF7] p-3 rounded border border-black/5">
                    ${displayContent}
                    ${item.content.length > 200 ? '<div class="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-[#FDFBF7] to-transparent"></div>' : ''}
                </div>
                
                <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <button onclick="navigator.clipboard.writeText(decodeURIComponent('${safeContent}')); showToast('Restored to computer clipboard!');" class="text-[10px] font-bold uppercase bg-[#D4A373] text-white hover:bg-[#3E2723] px-3 py-1.5 rounded shadow-md transition-all flex items-center gap-1">
                        <i class="fa-solid fa-paste"></i> Restore (Copy)
                    </button>
                </div>
            </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<div class="text-center text-red-500 mt-20 font-mono">Critical error in the time continuum.</div>';
    }
};

window.closeTimeMachine = function() {
    const modal = document.getElementById('time-machine-modal');
    if (modal) modal.classList.add('hidden');
};

window.updatePromptNavigator = function() {
    const pairs = document.querySelectorAll('.message-pair-group');
    
    const totalEl = document.getElementById('prompt-total-count');
    if (totalEl) {
        totalEl.innerText = pairs.length > 0 ? pairs.length : 1;
    }

    pairs.forEach((pair, index) => {
        let badge = pair.querySelector('.prompt-num-badge');
        
        if (!badge) {
            const userBubble = pair.querySelector('.chat-bubble-user');
            if (userBubble) {
                userBubble.style.position = 'relative';
                
                badge = document.createElement('div');
                badge.className = 'prompt-num-badge absolute -right-3 top-1 text-[11px] font-mono font-bold text-[#D4A373]/60 select-none';
                userBubble.appendChild(badge);
            }
        }
        
        if (badge) {
            badge.innerText = `${index + 1}`;
        }
    });
};

window.navigatePrompts = function(action) {
    const pairs = Array.from(document.querySelectorAll('.message-pair-group'));
    if (pairs.length === 0) return;
    
    const container = document.getElementById('chat-container');
    let closestPairIdx = 0;
    let minDiff = Infinity;
    
    pairs.forEach((pair, index) => {
        const diff = Math.abs(pair.offsetTop - container.scrollTop);
        if (diff < minDiff) { 
            minDiff = diff; 
            closestPairIdx = index; 
        }
    });
    
    let targetIdx = closestPairIdx;
    
    if (action === 'first') {
        targetIdx = 0; 
    } else if (action === 'prev' && targetIdx > 0) {
        targetIdx--;  
    } else if (action === 'next' && targetIdx < pairs.length - 1) {
        targetIdx++;   
    } else if (action === 'last') {
        targetIdx = pairs.length - 1;
    }
    
    container.scrollTo({ top: pairs[targetIdx].offsetTop - 20, behavior: 'smooth' });
    
    const input = document.getElementById('prompt-jump-input');
    if (input) input.value = targetIdx + 1;
};

window.jumpToPrompt = function(val) {
    const pairs = document.querySelectorAll('.message-pair-group');
    let idx = parseInt(val) - 1; 
    
    if (idx < 0) idx = 0;
    if (idx >= pairs.length) idx = pairs.length - 1;
    
    if (pairs.length > 0) {
        document.getElementById('chat-container').scrollTo({ top: pairs[idx].offsetTop - 20, behavior: 'smooth' });
        
        const input = document.getElementById('prompt-jump-input');
        if (input) input.value = idx + 1;
    }
};

window.syncNavigatorWithScroll = function() {
    const pairs = Array.from(document.querySelectorAll('.message-pair-group'));
    if (pairs.length === 0) return;

    const container = document.getElementById('chat-container');
    if (!container) return;

    const input = document.getElementById('prompt-jump-input');
    if (!input) return;

    if (document.activeElement === input) return;

    let closestPairIdx = 0;
    let minDiff = Infinity;
    
    const scrollPos = container.scrollTop + (container.clientHeight / 3);

    pairs.forEach((pair, index) => {
        const diff = Math.abs(pair.offsetTop - scrollPos);
        if (diff < minDiff) { 
            minDiff = diff; 
            closestPairIdx = index; 
        }
    });

    input.value = closestPairIdx + 1;
};

let chatScrollTimeout;
const chatContainer = document.getElementById('chat-container');

if (chatContainer) {
    chatContainer.addEventListener('scroll', () => {
        if (chatScrollTimeout) return;
        
        chatScrollTimeout = setTimeout(() => {
            window.syncNavigatorWithScroll();
            chatScrollTimeout = null;
        }, 50);
    });
}

window.clearUserInput = function() {
    const input = document.getElementById('user-input');
    if (input) {
        input.value = '';
        input.style.height = 'auto'; 
        input.focus();
    }
};

window.toggleMainActionBtn = function(isGenerating) {
    const btn = document.getElementById('main-action-btn');
    const icon = document.getElementById('main-action-icon');
    if (!btn || !icon) return;

    const baseClasses = "transition-all transform active:scale-90 flex items-center justify-center rounded-full group pointer-events-auto";

    if (isGenerating) {
        btn.onclick = stopGeneration; 
        btn.title = "Stop Generation";
        btn.className = `${baseClasses} w-9 h-9 bg-[#FDFBF7] border border-[#D4A373]/40 shadow-sm`;
        
        icon.className = "fa-solid fa-square text-black group-hover:text-[#D4A373] text-[14px] transition-colors";
        
    } else {
        btn.onclick = sendMessage; 
        btn.title = "Send Message";
        
        btn.className = `${baseClasses} w-10 h-10 bg-transparent border-transparent shadow-none`;
        
        icon.className = "fa-solid fa-paper-plane text-[#D4A373] group-hover:text-[#3E2723] text-xl transition-colors";
    }
};

let aboutWindowState = {
    isMaximized: false,
    prevTop: '150px',
    prevLeft: 'calc(50% - 350px)',
    prevWidth: '700px',
    prevHeight: '500px'
};

async function openAboutWindow() {
    const win = document.getElementById('about-window');
    const contentBox = document.getElementById('about-content');
    const loader = document.getElementById('about-loader');
    
    if (!win) return;
    
    win.classList.remove('hidden');
    win.style.display = 'flex';
    loader.classList.remove('hidden');
    contentBox.innerHTML = ''; 

    try {
        const response = await fetch('/static/about.json');
        if (!response.ok) throw new Error('Network response was not ok');
        
        const data = await response.json();
        
        let filesHtml = '';
        if (data.download_files && data.download_files.length > 0) {
            filesHtml = `
                <div class="border-t border-[#D4A373]/20 pt-4 mt-4">
                    <p class="font-bold text-xs text-black dark:text-[#e0e0e0] mb-2">
                        <i class="fa-solid fa-download text-[#D4A373] mr-2"></i> Files:
                    </p>
                    <div class="space-y-2">
                        ${data.download_files.map(file => `
                            <a href="/static/${file.filename}" download class="flex items-center justify-between p-2 rounded bg-[#F5E6D3]/30 hover:bg-[#F5E6D3]/60 border border-[#D4A373]/20 text-xs text-black transition-colors duration-150 select-none dark:bg-transparent dark:text-[#e0e0e0] dark:hover:bg-[#D4A373]/15">
                                <span class="flex items-center">
                                    <i class="fa-regular fa-file-pdf text-red-700 mr-2 text-sm"></i>
                                    ${file.label}
                                </span>
                                <i class="fa-solid fa-arrow-down-border-line text-[#8D6E63] text-[10px]"></i>
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        contentBox.innerHTML = `
            <div class="text-center mb-6 flex flex-col items-center">
                <img src="/static/Brand.png" alt="MAGI Logo" class="w-64 h-auto object-contain mb-4 drop-shadow-lg select-none">
                
                <h2 class="font-['Cinzel'] font-bold text-2xl text-black dark:text-[#e0e0e0] tracking-widest">${data.title}</h2>
                <div class="text-[10px] uppercase tracking-widest text-[#8D6E63] dark:text-[#D4A373] mt-1">${data.version}</div>
            </div>
            
            <div class="p-4 bg-[#F5E6D3]/40 dark:bg-[#2b2b2b]/40 rounded border border-[#D4A373]/20 shadow-inner mb-4">
                <p class="font-bold text-black dark:text-[#D4A373] mb-2"><i class="fa-solid fa-bolt text-[#D4A373] mr-2"></i> ${data.powered_by}</p>
                <p class="opacity-90 text-black dark:text-[#e0e0e0]">${data.description}</p>
            </div>
            
            <div class="space-y-2 text-xs opacity-80 border-t border-[#D4A373]/20 pt-4 text-black dark:text-[#e0e0e0]">
                <p><i class="fa-solid fa-quote-left text-[#D4A373] mr-1"></i> ${data.credits}</p>
                <p class="font-black text-[#D4A373] mt-4">${data.status}</p>
                
                <p class="mt-4 pt-2 border-t border-[#D4A373]/10">
                    <a href="https://github.com/tnenkov1/magixtral" target="_blank" rel="noopener noreferrer" class="github-link inline-flex items-center gap-2 font-mono text-[14px] uppercase tracking-wider">
                        <i class="fa-brands fa-github text-lg"></i> Click here: Github Repository - Source Code 
                    </a>
                </p>
            </div>
            ${filesHtml}
        `;
    } catch (error) {
        contentBox.innerHTML = `<div class="text-red-500 font-bold p-4">Error loading data: ${error.message}</div>`;
    } finally {
        loader.classList.add('hidden');
    }
}

function closeAboutWindow() {
    const win = document.getElementById('about-window');
    if (win) {
        win.classList.add('hidden');
        win.style.display = 'none';
    }
}

function toggleMaximizeAbout() {
    const win = document.getElementById('about-window');
    const icon = document.getElementById('about-maximize-icon');
    if (!win || !icon) return;

    if (!aboutWindowState.isMaximized) {
        aboutWindowState.prevTop = win.style.top;
        aboutWindowState.prevLeft = win.style.left;
        aboutWindowState.prevWidth = win.style.width;
        aboutWindowState.prevHeight = win.style.height;

        win.style.top = '0';
        win.style.left = '0';
        win.style.width = '100vw';
        win.style.height = '100vh';
        
        icon.className = 'fa-regular fa-window-restore text-xs';
        aboutWindowState.isMaximized = true;
        win.classList.add('is-maximized');
    } else {
        win.style.top = aboutWindowState.prevTop || '150px';
        win.style.left = aboutWindowState.prevLeft || 'calc(50% - 350px)';
        win.style.width = aboutWindowState.prevWidth || '700px';
        win.style.height = aboutWindowState.prevHeight || '500px';
        
        icon.className = 'fa-regular fa-window-maximize text-xs';
        aboutWindowState.isMaximized = false;
        win.classList.remove('is-maximized');
    }
}

function makeAboutDraggable() {
    const win = document.getElementById('about-window');
    const header = document.getElementById('about-header');
    if (!win || !header) return;

    let isDragging = false, startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
        if (aboutWindowState.isMaximized) return;
        if (e.target.closest('button')) return; 
        
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = win.offsetLeft;
        initialTop = win.offsetTop;
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        win.style.left = `${initialLeft + dx}px`;
        win.style.top = `${initialTop + dy}px`;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

function initAboutResizers() {
    const win = document.getElementById('about-window');
    if (!win) return;
    const resizers = win.querySelectorAll('.resizer');
    
    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', function(e) {
            if (aboutWindowState.isMaximized) return;
            e.preventDefault(); 
            
            const currentResizer = e.target;
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = parseInt(document.defaultView.getComputedStyle(win).width, 10);
            const startHeight = parseInt(document.defaultView.getComputedStyle(win).height, 10);
            const startLeft = win.offsetLeft;
            const startTop = win.offsetTop;

            function doResize(e) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                if (currentResizer.classList.contains('resizer-right') || currentResizer.classList.contains('resizer-br') || currentResizer.classList.contains('resizer-tr')) {
                    win.style.width = Math.max(300, startWidth + dx) + 'px';
                }
                
                if (currentResizer.classList.contains('resizer-bottom') || currentResizer.classList.contains('resizer-br') || currentResizer.classList.contains('resizer-bl')) {
                    win.style.height = Math.max(200, startHeight + dy) + 'px';
                }
                
                if (currentResizer.classList.contains('resizer-left') || currentResizer.classList.contains('resizer-bl') || currentResizer.classList.contains('resizer-tl')) {
                    const newWidth = startWidth - dx;
                    if (newWidth > 300) {
                        win.style.width = newWidth + 'px';
                        win.style.left = (startLeft + dx) + 'px';
                    }
                }
                
                if (currentResizer.classList.contains('resizer-top') || currentResizer.classList.contains('resizer-tl') || currentResizer.classList.contains('resizer-tr')) {
                    const newHeight = startHeight - dy;
                    if (newHeight > 200) {
                        win.style.height = newHeight + 'px';
                        win.style.top = (startTop + dy) + 'px';
                    }
                }
            }

            function stopResize() {
                window.removeEventListener('mousemove', doResize);
                window.removeEventListener('mouseup', stopResize);
            }

            window.addEventListener('mousemove', doResize);
            window.addEventListener('mouseup', stopResize);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    makeAboutDraggable();
    initAboutResizers();
});

function toggleAstralSelectAll(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.astral-cell-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = masterCheckbox.checked;
    });
}

function updateAstralSelectAllState() {
    const masterCheckbox = document.getElementById('astral-select-all');
    const checkboxes = document.querySelectorAll('.astral-cell-checkbox');
    if (!masterCheckbox || checkboxes.length === 0) return;
    
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const someChecked = Array.from(checkboxes).some(cb => cb.checked);
    
    masterCheckbox.checked = allChecked;
    masterCheckbox.indeterminate = !allChecked && someChecked;
}


const docstralWin = document.getElementById('docstral-window');
const docstralTitleBar = document.getElementById('docstral-title-bar');

// Opens the main Docstral (Document & PDF Editor) window interface.
window.openDocstral = function() {
    
    if (typeof openMagiApp === 'function') openMagiApp('docstral');
    
    setTimeout(() => {
        const docWindow = document.getElementById('docstral-window');
        if (!docWindow) {
            console.error("Error: docstral-window wasn't found!");
            return;
        }

        docWindow.setAttribute('data-mode', 'page');
        document.body.classList.remove('pdf-mode-active', 'qr-mode-active');

        const workspaceContainer = document.getElementById('docstral-workspace');
        const sidebar = document.getElementById('docstral-sidebar');
        
        if (workspaceContainer) {
            workspaceContainer.style.cssText = `
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                overflow-x: hidden;
                background: #E8D8C8;
                position: relative;
            `;
            
            workspaceContainer.innerHTML = `<div id="docstral-pages-container" class="flex flex-col items-center space-y-12 py-10 w-full relative transform origin-top"></div>`;
        }

        if (sidebar) {
            sidebar.style.cssText = ''; 
            sidebar.classList.add('hidden');
            sidebar.style.transform = 'translateX(-100%)';
            sidebar.style.display = 'none';
            
            if (sidebar.parentElement) {
                sidebar.parentElement.style.flexDirection = '';
                sidebar.parentElement.style.padding = '';
                sidebar.parentElement.style.margin = '';
            }
        }

        document.querySelectorAll('[id^="btn-mode-"]').forEach(btn => {
            btn.classList.remove('bg-[#D4A373]', 'text-white');
            btn.classList.add('bg-[#FDFBF7]', 'text-[#D4A373]');
        });
        const activeBtn = document.getElementById('btn-mode-page');
        if (activeBtn) {
            activeBtn.classList.replace('bg-[#FDFBF7]', 'bg-[#D4A373]');
            activeBtn.classList.replace('text-[#D4A373]', 'text-white');
        }

        setTimeout(() => {
            const docNameEl = document.getElementById('current-doc-name');
            const currentDoc = docNameEl ? docNameEl.innerText.trim() : "";
            const newContainer = document.getElementById('docstral-pages-container');
            
            if (!currentDoc || currentDoc.includes("Select") || currentDoc === "new_document.jdoc") {
                
                if (docNameEl) docNameEl.innerText = "Select document...";
                
                if (typeof showDocstralWelcomeScreen === 'function') {
                    showDocstralWelcomeScreen(newContainer);
                }
            } else {
            }
            
            if (typeof window.refreshAddressBar === 'function') window.refreshAddressBar();
        }, 50);

    }, 100); 
};

// Displays the initial welcome screen and basic document export options for Docstral.
window.showDocstralWelcomeScreen = async function(container) {
    if (!container) return;
    if (typeof window.updateExportState === 'function') window.updateExportState();

    container.style.transform = 'none'; 
    const zoomInput = document.getElementById('zoom-value-input');
    if (zoomInput) zoomInput.value = '100%';

    const workspace = document.getElementById('docstral-workspace');
    if (workspace) {
        workspace.style.overflow = 'hidden'; 
        workspace.style.display = 'flex';
        workspace.style.alignItems = 'center';
        workspace.style.justifyContent = 'center';
    }

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center text-[#D4A373]/40 animate-in fade-in zoom-in duration-500">
            <i class="fa-solid fa-file-signature text-6xl mb-8"></i>
        </div>
    `;

    let files = [];
    try {
        const docWindow = document.getElementById('docstral-window');
        const mode = docWindow ? docWindow.getAttribute('data-mode') || 'page' : 'page';
        const res = await fetch(`/api/fs/list_by_mode?mode=${mode}`);
        const data = await res.json();
        files = data.files || [];
        window.currentModeFiles = files;
    } catch (e) {
        console.error("Downloading files error:", e);
    }

    let recentFilesHtml = files.length > 0 
        ? files.slice(0, 5).map(filename => {
            const cleanName = filename.replace(/\.jdoc\.json$|\.json$|\.jdoc$/i, '').replace(/_/g, ' ');
            return `
                <div onclick="window.loadServerFile('${filename}')" class="group flex items-center gap-2 p-2 hover:bg-[#D4A373]/10 rounded cursor-pointer transition-colors border-b border-[#D4A373]/5 shrink-0">
                    <i class="fa-regular fa-file-lines text-[#D4A373]"></i>
                    <span class="text-[12px] font-bold text-[#3E2723] truncate" title="${filename}">${cleanName}</span>
                </div>
            `;
        }).join('')
        : '<div class="text-[12px] italic text-[#8D6E63]/40 p-2 text-center">No .jdoc documents found</div>';

    const sidebarHtml = `
        <div class="p-6 flex flex-col h-full bg-[#FDFBF7] overflow-hidden">
            <button id="btn-new-document" onclick="createPlanchetteDoc(event)" class="w-full py-4 bg-[#D4A373] text-white font-black uppercase tracking-widest text-xs rounded-lg hover:bg-[#3E2723] transition-all shadow-lg flex items-center justify-center gap-2 mb-8 shrink-0">
                <i class=""></i> NEW DOCUMENT
            </button>

            <div class="flex flex-col">
                <div class="text-[12px] font-black text-[#D4A373] uppercase tracking-[0.15em] mb-3 px-1 shrink-0">Recent Files</div>
                <div id="sidebar-recent-list" class="flex flex-col gap-1">
                    ${recentFilesHtml}
                </div>
            </div>
        </div>
    `;

    if (typeof window.openDocstralSidebar === 'function') {
        window.openDocstralSidebar('Planchette mode', sidebarHtml);
    }
};

// Creates a new blank document (Planchette mode) within the Docstral workspace.
window.createPlanchetteDoc = async function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    let filename = prompt("Enter a new document name:", "New Document");
    if (!filename) return;
    
    try {
        if (typeof showToast === 'function') showToast("Creating document...");
        
        const response = await fetch('/api/docstral/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: filename })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            if (typeof showToast === 'function') showToast("Document created!");

            if (typeof DocstralMeta !== 'undefined') {
                DocstralMeta.setFromJSON(result.data.metadata, result.filename);
            }
            if (typeof DocstralHistory !== 'undefined') {
                DocstralHistory.clear(); 
            }
        
            const workspace = document.getElementById('docstral-workspace');
            if (workspace) {
                workspace.style.overflowY = 'auto'; 
                workspace.style.display = 'block'; 
            }
            
            const titleSpan = document.getElementById('current-doc-name');
            if (titleSpan) {
                const cleanName = result.filename.replace(/\.jdoc\.json$|\.json$|\.jdoc$/i, '').replace(/_/g, ' ');
                titleSpan.innerText = cleanName;
                
                titleSpan.blur();
                window.getSelection().removeAllRanges();
            }
            
            if (typeof window.closeDocstralSidebar === 'function') window.closeDocstralSidebar();
            
            const container = document.getElementById('docstral-pages-container');
            if (container) container.innerHTML = '';
            
            if (container) {
                container.innerHTML = `
                    <div class="docstral-document bg-white shadow-xl mx-auto w-[850px] min-h-[1056px] my-8 relative flex">
                        <div id="docstral-editor" class="flex-1 outline-none px-16 py-16 text-black font-sans leading-relaxed relative" contenteditable="true" spellcheck="false">
                            <p data-block-id="b-${Date.now()}" data-layer="base" class="block-line text-gray-400 italic"></p>
                        </div>
                    </div>
                `;
                
                if (typeof DocstralSync !== 'undefined') DocstralSync.scheduleSync();
            }

            if (typeof window.updateExportState === 'function') window.updateExportState();
            if (typeof window.refreshAddressBar === 'function') window.refreshAddressBar();
            
        } else {
            alert("Creation error: " + result.detail);
        }
    } catch (error) {
        console.error("Error creating planchette doc:", error);
        alert("Server connection error.");
    }
};

let isDraggingDocstral = false;
let docstralOffsetX = 0, docstralOffsetY = 0;

if (docstralTitleBar && docstralWin) {
    docstralTitleBar.addEventListener('mousedown', (e) => {
        if(e.target.closest('button')) return; 
        
        isDraggingDocstral = true;
        docstralOffsetX = e.clientX - docstralWin.offsetLeft;
        docstralOffsetY = e.clientY - docstralWin.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingDocstral) return;
        
        let newX = e.clientX - docstralOffsetX;
        let newY = e.clientY - docstralOffsetY;
        
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + docstralWin.offsetWidth > window.innerWidth) newX = window.innerWidth - docstralWin.offsetWidth;
        if (newY + docstralWin.offsetHeight > window.innerHeight) newY = window.innerHeight - docstralWin.offsetHeight;
        
        docstralWin.style.left = `${newX}px`;
        docstralWin.style.top = `${newY}px`;
    });

    document.addEventListener('mouseup', () => {
        isDraggingDocstral = false;
    });
}

window.docstralIsMaximized = true; 
window.docstralPreMaxState = { left: '10vw', top: '100px', width: '1000px', height: '700px' };
window.isZenMode = false;

// Maximizes or restores the Docstral editor window to fit the screen.
window.toggleMaximizeDocstral = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.target.closest('button') && !e.target.closest('#docstral-btn-max')) return;
    }

    const win = document.getElementById('docstral-window');
    const icon = document.getElementById('docstral-maximize-icon');
    if (!win) return;

    if (!window.docstralIsMaximized) {
        const computed = window.getComputedStyle(win);
        window.docstralPreMaxState = { left: computed.left, top: computed.top, width: computed.width, height: computed.height };

        win.style.left = '0px';
        win.style.top = '0px';
        win.style.width = '100vw';
        win.style.height = '100vh';
        win.style.right = 'auto';
        win.style.bottom = 'auto';
        win.style.borderRadius = '0px';
        
        win.classList.remove('rounded-lg', 'shadow-2xl', 'is-windowed');
        win.classList.add('is-maximized');

        if (icon) icon.className = 'fa-solid fa-window-restore text-[16px]';
        window.docstralIsMaximized = true;
    } else {
        win.style.left = window.docstralPreMaxState.left || '10vw';
        win.style.top = window.docstralPreMaxState.top || '100px';
        win.style.width = window.docstralPreMaxState.width || '1000px';
        win.style.height = window.docstralPreMaxState.height || '700px';
        win.style.right = 'auto';
        win.style.bottom = 'auto';
        win.style.borderRadius = '0.5rem';
        
        win.classList.add('rounded-lg', 'shadow-2xl', 'is-windowed');
        win.classList.remove('is-maximized');

        if (icon) icon.className = 'fa-regular fa-window-maximize text-[16px]';
        window.docstralIsMaximized = false;
    }

    setTimeout(() => { if (typeof updateDocstralScale === 'function') updateDocstralScale(); }, 10);
};

// Restores Docstral from its minimized floating bubble state.
window.restoreDocstral = function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    
    const win = document.getElementById('docstral-window');
    const bubble = document.getElementById('docstral-bubble');

    if (win) {
        win.classList.remove('hidden');
        win.classList.add('flex');
        win.style.setProperty('display', 'flex', 'important');
        
        if (window.docstralIsMaximized) {
            win.classList.add('is-maximized');
            win.classList.remove('is-windowed');
        } else {
            win.classList.add('is-windowed');
            win.classList.remove('is-maximized');
        }
        
        if (typeof bringWindowToFront === 'function') bringWindowToFront(win);
        
        setTimeout(() => {
            if (typeof updateDocstralScale === 'function') updateDocstralScale();
        }, 50);
    }

    if (bubble) {
        bubble.classList.remove('flex');
        bubble.classList.add('hidden');
        bubble.style.setProperty('display', 'none', 'important');
    }
};

// Minimizes the Docstral application into a floating bubble.
window.minimizeDocstral = function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    
    const win = document.getElementById('docstral-window');
    const bubble = document.getElementById('docstral-bubble');

    if (win) {
        win.classList.add('hidden');
        win.classList.remove('flex');
        win.style.setProperty('display', 'none', 'important');
    }

    if (bubble) {
        bubble.style.transition = 'none';
        bubble.classList.remove('hidden');
        bubble.style.setProperty('display', 'flex', 'important'); 
        bubble.style.opacity = '1';
        bubble.style.visibility = 'visible';
        
        void bubble.offsetWidth;
        
        bubble.style.transition = ''; 
        
        console.log("Docstral minimized: Transition bug bypassed!");
    }
};

window.closeDocstral = function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const win = document.getElementById('docstral-window');
    const bubble = document.getElementById('docstral-bubble');
    
    if (win) { 
        win.classList.remove('flex');
        win.classList.add('hidden'); 
        win.style.setProperty('display', 'none', 'important'); 
    }
    if (bubble) { 
        bubble.style.transition = 'none';
        bubble.classList.remove('flex');
        bubble.classList.add('hidden'); 
        bubble.style.setProperty('display', 'none', 'important'); 
        void bubble.offsetWidth;
        bubble.style.transition = '';
    }
    
    if (typeof state !== 'undefined') state.docstralActive = false;
};

// Toggles Zen Mode, hiding auxiliary panels to provide a distraction-free writing environment in Docstral.
window.toggleZenMode = function() {
    const docWindow = document.getElementById('docstral-window');
    const currentMode = docWindow ? docWindow.getAttribute('data-mode') || 'page' : 'page';
    
    const topBarsWrapper = document.getElementById('docstral-top-bars');
    const bottomBarsWrapper = document.getElementById('docstral-bottom-bars-wrapper');
    const zenBtn = document.getElementById('docstral-btn-zen');
    
    window.isZenMode = !window.isZenMode;

    if (window.isZenMode) {
        
        if (topBarsWrapper) topBarsWrapper.style.height = topBarsWrapper.offsetHeight + 'px';
        if (bottomBarsWrapper && bottomBarsWrapper.style.display !== 'none') {
            bottomBarsWrapper.style.height = bottomBarsWrapper.offsetHeight + 'px';
        }
        
        void docWindow.offsetWidth;

        if (topBarsWrapper) {
            topBarsWrapper.style.height = '0px';
            topBarsWrapper.style.opacity = '0';
            topBarsWrapper.style.borderBottomWidth = '0px'; 
        }
        if (bottomBarsWrapper && bottomBarsWrapper.style.display !== 'none') {
            bottomBarsWrapper.style.height = '0px';
            bottomBarsWrapper.style.opacity = '0';
            bottomBarsWrapper.style.borderTopWidth = '0px'; 
        }
        
        if (zenBtn) zenBtn.classList.add('active');
        
    } else {
        
        if (topBarsWrapper) {
            topBarsWrapper.style.height = currentMode === 'page' ? '72px' : '36px';
            topBarsWrapper.style.opacity = '1';
            topBarsWrapper.style.borderBottomWidth = '';
            
            setTimeout(() => topBarsWrapper.style.height = '', 300);
        }

        if (bottomBarsWrapper) {
            if (currentMode === 'page') {
                bottomBarsWrapper.style.display = ''; 
                void bottomBarsWrapper.offsetWidth; 
                
                bottomBarsWrapper.style.height = '72px';
                bottomBarsWrapper.style.opacity = '1';
                bottomBarsWrapper.style.borderTopWidth = '';
                
                setTimeout(() => bottomBarsWrapper.style.height = '', 300);
            } else {
                bottomBarsWrapper.style.height = '0px';
                bottomBarsWrapper.style.opacity = '0';
            }
        }

        if (zenBtn) zenBtn.classList.remove('active');
    }
    
    let frames = 0;
    const scaleAnim = setInterval(() => {
        if (typeof updateDocstralScale === 'function') updateDocstralScale();
        frames++;
        if (frames > 15) clearInterval(scaleAnim);
    }, 20);
};

let currentZoom = 100;

// Applies a specific zoom percentage calculation to the document workspace.
function applyZoom(percentage) {
    currentZoom = Math.max(10, Math.min(250, percentage));
    const fillPercent = ((currentZoom - 10) / (250 - 10)) * 100;
    
    const zoomDisplay = document.getElementById('zoom-value-display');
    const zoomFill = document.getElementById('zoom-progress-fill');
    const zoomThumb = document.getElementById('zoom-thumb-strip');
    const pagesContainer = document.getElementById('docstral-pages-container'); 

    if (zoomDisplay) zoomDisplay.innerText = `${Math.round(currentZoom)}%`;
    if (zoomFill) zoomFill.style.width = `${fillPercent}%`;
    if (zoomThumb) zoomThumb.style.left = `${fillPercent}%`;
    
    if (pagesContainer) {
        pagesContainer.style.transform = `scale(${currentZoom / 100})`;
        pagesContainer.style.transformOrigin = 'top center';
    }
}

const hiddenFileInput = document.createElement('input');
hiddenFileInput.type = 'file';
hiddenFileInput.accept = '.json,.jdoc'; 

hiddenFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            
            if (imported.id && imported.data) {
                imported.id = `doc-${Date.now()}`;
                if (typeof virtualFileSystem !== 'undefined') virtualFileSystem.push(imported);
                if (typeof renderFileList === 'function') renderFileList();
                if (typeof loadDocument === 'function') loadDocument(imported.id);
                if (typeof showToast === 'function') showToast("The document is imported!");
            } else {
                alert("Error: Invalid JDOC format.");
            }
        } catch (err) {
            alert("Error reading file. Make sure it is a valid .jdoc.");
        }
        hiddenFileInput.value = ''; 
    };
    reader.readAsText(file);
};

window.handleImportClick = function() {
    if (typeof window.closeDocstralMenus === 'function') window.closeDocstralMenus();

    let fileInput = document.getElementById('docstral-global-import-input');
    
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'docstral-global-import-input';
        fileInput.style.display = 'none';
        
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            if (typeof uploadFileToPython === 'function') {
                await uploadFileToPython(file);
            } else {
                alert("Error: Server connection function is missing (uploadFileToPython).");
            }
            
            fileInput.value = ''; 
        });
    }
    
    fileInput.click();
};

// Uploads a document file to the backend Python service for advanced processing or parsing.
async function uploadFileToPython(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        if (typeof showToast === 'function') showToast("Importing...");
        
        const response = await fetch('/api/docstral/import', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            if (typeof DocstralMeta !== 'undefined') {
                DocstralMeta.setFromJSON(result.data.metadata, result.filename);
            }
            if (typeof DocstralHistory !== 'undefined') DocstralHistory.clear();

            const workspace = document.getElementById('docstral-workspace');
            if (workspace) {
                workspace.style.overflowY = 'auto'; 
                workspace.style.display = 'block'; 
            }
            
            const titleSpan = document.getElementById('current-doc-name');
            if (titleSpan) {
                titleSpan.innerText = result.data.metadata.name;
                
                titleSpan.blur();
                window.getSelection().removeAllRanges();
            }
            
            if (typeof window.closeDocstralSidebar === 'function') window.closeDocstralSidebar();
            
            const container = document.getElementById('docstral-pages-container');
            if (container && typeof DocstralSync !== 'undefined') {
                container.innerHTML = '';
                
               DocstralSync.renderPages(result.data.blocks, container);
                
                setTimeout(() => {
                    DocstralSync.executeSync(false);
                    if (typeof updateDocstralScale === 'function') updateDocstralScale();
                }, 500); 
            }

            if (typeof window.updateExportState === 'function') window.updateExportState();
            if (typeof window.refreshAddressBar === 'function') window.refreshAddressBar();
            if (typeof showToast === 'function') showToast("Import successful!");
            
        } else {
            alert("Import error: " + (result.detail || "Unknown error"));
        }
    } catch (error) {
        console.error("Import error:", error);
        alert("Server connection error.");
    }
}

document.getElementById('btn-mode-page')?.addEventListener('click', () => {
    document.getElementById('btn-mode-page')?.classList.add('text-white');
});

const ctxMenu = document.getElementById('docstral-context-menu');
let uiSelectionTimeout; 

// Tracks the user's text selection and saves the current caret range whenever it changes inside the document.
document.addEventListener('selectionchange', () => {
    clearTimeout(uiSelectionTimeout);
    
    uiSelectionTimeout = setTimeout(() => {
        
        const hoveredElements = document.querySelectorAll(':hover');
        const isHoveringExternalButton = Array.from(hoveredElements).some(el => {
            return el.tagName === 'BUTTON' && (!ctxMenu || !ctxMenu.contains(el));
        });
        
        if (isHoveringExternalButton) {
            if (ctxMenu) ctxMenu.classList.add('hidden');
            return;
        }

        const selection = window.getSelection();
        const workspace = document.getElementById('docstral-workspace');
        
        if (selection.toString().trim().length > 0 && workspace?.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            const docstralWin = document.getElementById('docstral-window') || document.body; 
            const docstralRect = docstralWin.getBoundingClientRect();
            
            let topPos = rect.bottom - docstralRect.top + 10;
            let leftPos = rect.left - docstralRect.left + (rect.width / 2) - (ctxMenu.offsetWidth / 2);
            
            if (leftPos < 10) leftPos = 10;
            if (leftPos + 224 > docstralRect.width) leftPos = docstralRect.width - 234; 
            
            ctxMenu.style.top = `${topPos}px`;
            ctxMenu.style.left = `${leftPos}px`;
            ctxMenu.classList.remove('hidden');
            ctxMenu.style.opacity = '1';
        } else {
            if (!ctxMenu?.contains(document.activeElement)) {
                ctxMenu?.classList.add('hidden');
            }
        }
    }, 100);
});

document.addEventListener('DOMContentLoaded', () => {
    if (ctxMenu) {
        ctxMenu.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) {
                e.preventDefault(); 
            }
        });
    }
});

let globalHighestZIndex = 1000;

// Adjusts the z-index to bring the currently clicked window (like Docstral or FM) to the very front.
window.bringWindowToFront = function(winElement) {
    if (!winElement) return;
    globalHighestZIndex += 10;
    winElement.style.zIndex = globalHighestZIndex;
};

document.addEventListener('mousedown', (e) => {
    const win = e.target.closest('.fixed'); 
    if (win && (win.id === 'docstral-window' || win.id === 'fm-window' || win.id === 'astral-window' || win.id === 'browser-window')) {
        window.bringWindowToFront(win);
    }
}, true);

// Opens a sidebar panel inside Docstral with a smooth transition animation.
window.openSidebarSmoothly = function(title) {
    const sidebar = document.getElementById('docstral-sidebar');
    const titleEl = document.getElementById('docstral-sidebar-title');
    
    if (sidebar && titleEl) {
        titleEl.innerText = title;
        
        sidebar.style.setProperty('display', 'flex', 'important');
        sidebar.style.setProperty('visibility', 'visible', 'important');
        sidebar.style.setProperty('opacity', '1', 'important');
        
        requestAnimationFrame(() => {
            sidebar.style.setProperty('transform', 'translateX(0)', 'important');
        });

        console.log("Docstral Debug: Sidebar opened with override!");
    } else {
        console.error("Docstral Debug: Sidebar element NOT FOUND in DOM!");
    }
};

// Closes the currently active side panel in the Docstral interface.
window.closeDocstralSidebar = function(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
        e.stopPropagation();
    }

    if (typeof DocstralSearch !== 'undefined') {
        DocstralSearch.clear();
    }
    
    const sidebar = document.getElementById('docstral-sidebar');
    
    if (sidebar) {
        sidebar.style.setProperty('transition', 'transform 0.3s ease, opacity 0.3s ease', 'important');
        sidebar.style.setProperty('transform', 'translateX(-100%)', 'important');
        sidebar.style.setProperty('opacity', '0', 'important');
        
        setTimeout(() => {
            sidebar.classList.add('hidden', '-translate-x-full');
            
            sidebar.style.removeProperty('transition');
            sidebar.style.removeProperty('transform');
            sidebar.style.removeProperty('opacity');
            sidebar.style.removeProperty('display');
            sidebar.style.removeProperty('visibility');
            
            console.log("The sidebar is closed and the styles are cleared.");
        }, 300);
    }
};

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DocstralSearch = {
    matches: [],
    activeIndex: -1,
    query: "",
    
    clear() {
        const marks = document.querySelectorAll('mark.docstral-search-match');
        
        marks.forEach(mark => {
            const parent = mark.parentNode;
            if (parent) {
                while (mark.firstChild) {
                    parent.insertBefore(mark.firstChild, mark);
                }
                parent.removeChild(mark);
                parent.normalize();       
            }
        });
        
        this.matches = [];
        this.activeIndex = -1;
        this.query = "";

        const findInput = document.getElementById('docstral-find-val');
        const replaceInput = document.getElementById('docstral-replace-val');
        const resultsContainer = document.getElementById('docstral-find-results');
        
        if (findInput) findInput.value = '';
        if (replaceInput) replaceInput.value = '';
        if (resultsContainer) {
            resultsContainer.innerHTML = '<div class="text-center text-xs opacity-50 mt-4">No matches found..</div>';
        }
        
        if (typeof updateSearchSelectionCounter === 'function') {
            updateSearchSelectionCounter();
        }
    },

    find(query) {
        this.clear();
        this.query = query;
        if (!query || query.trim() === '') {
            this.updateUI();
            return;
        }

        const editor = document.getElementById('docstral-editor');
        if (!editor) return;

        const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
        const allLines = Array.from(editor.querySelectorAll('.block-line'));
        
        let matchId = 0;

        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
            const text = node.nodeValue;
            if (regex.test(text)) {
                const lineEl = node.parentElement.closest('.block-line');
                const lineIndex = allLines.indexOf(lineEl) + 1;

                const parent = node.parentNode;
                let lastIdx = 0;
                const fragment = document.createDocumentFragment();
                
                regex.lastIndex = 0;
                
                text.replace(regex, (match, p1, offset) => {
                    if (offset > lastIdx) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIdx, offset)));
                    }
                    
                    const mark = document.createElement('mark');
                    mark.className = 'docstral-search-match bg-yellow-300 text-black px-0.5 rounded-sm transition-all duration-200';
                    mark.id = `ds-match-${matchId}`;
                    mark.textContent = match;
                    
                    this.matches.push({
                        id: mark.id,
                        line: lineIndex,
                        text: match,
                        snippet: this.getSnippet(text, offset, match.length)
                    });

                    fragment.appendChild(mark);
                    lastIdx = offset + match.length;
                    matchId++;
                });

                if (lastIdx < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
                }
                parent.replaceChild(fragment, node);
            }
        });

        this.updateUI();
    },

    getSnippet(text, offset, len) {
        const start = Math.max(0, offset - 20);
        const end = Math.min(text.length, offset + len + 20);
        return (start > 0 ? "..." : "") + text.substring(start, end).replace(/\n/g, " ") + (end < text.length ? "..." : "");
    },

    focusMatch(index) {
        if (this.matches.length === 0) return;

        if (this.activeIndex !== -1 && this.matches[this.activeIndex]) {
            const oldMark = document.getElementById(this.matches[this.activeIndex].id);
            if (oldMark) {
                oldMark.style.removeProperty('background-color');
                oldMark.style.removeProperty('color');
                oldMark.style.removeProperty('box-shadow');
                oldMark.style.removeProperty('transform');
                oldMark.style.removeProperty('z-index');
                oldMark.style.removeProperty('position');
                oldMark.style.removeProperty('display');
                updateSingleHighlightVisual(oldMark.id);
            }
        }

        if (this.activeIndex === index) {
            this.activeIndex = -1;
            return;
        }

        this.activeIndex = index;
        const match = this.matches[index];
        const markEl = document.getElementById(match.id);

        if (markEl) {
            markEl.style.setProperty('background-color', '#f97316', 'important'); 
            markEl.style.setProperty('color', '#ffffff', 'important'); 
            markEl.style.setProperty('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.2)', 'important');
            markEl.style.setProperty('transform', 'scale(1.15)', 'important');
            markEl.style.setProperty('z-index', '10', 'important');
            markEl.style.setProperty('position', 'relative', 'important');
            markEl.style.setProperty('display', 'inline-block', 'important');
            
            markEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            const cb = document.querySelector(`.docstral-search-cb[value="${match.id}"]`);
            if (cb && !cb.checked) {
                cb.checked = true;
                updateSearchSelectionCounter();
            }
        }
    },

    replace(onlySelected) {
        const findValEl = document.getElementById('docstral-find-val');
        const replaceValEl = document.getElementById('docstral-replace-val');
        if (!replaceValEl || !findValEl) return;

        const query = findValEl.value;
        const replaceText = replaceValEl.value;

        if (this.matches.length === 0 || this.query !== query) {
            if (!query.trim()) {
                alert("Please enter a search term...");
                return;
            }
            this.find(query); 
        }

        const checkboxes = document.querySelectorAll('.docstral-search-cb');
        if (checkboxes.length === 0) {
            alert("No matches found for replacement.");
            return;
        }

        let replacedAny = false;

        checkboxes.forEach(cb => {
            if (!onlySelected || cb.checked) {
                const mark = document.getElementById(cb.value);
                if (mark) {
                    mark.replaceWith(document.createTextNode(replaceText));
                    replacedAny = true;
                }
            }
        });

        if (replacedAny) {
            this.clear(); 
            this.find(query); 
            if (typeof DocstralSync !== 'undefined') DocstralSync.scheduleSync();
            if (typeof showToast === 'function') showToast("Replacement successful!");
        } else if (onlySelected) {
            alert("Please select at least one replacement match.");
        }
    },

    updateUI() {
        renderDocstralSearchResults();
        updateSearchSelectionCounter();
    }
};

function updateSingleHighlightVisual(markId) {
    const markEl = document.getElementById(markId);
    const cb = document.querySelector(`.docstral-search-cb[value="${markId}"]`);
    if (!markEl || !cb) return;

    if (markEl.style.backgroundColor === 'rgb(249, 115, 22)' || markEl.style.backgroundColor.includes('#f97316')) return;

    if (cb.checked) {
        markEl.style.setProperty('background-color', '#fde047', 'important');
        markEl.style.setProperty('color', '#000000', 'important');
        markEl.style.borderBottom = '';
        markEl.style.opacity = '1';
    } else {
        markEl.style.setProperty('background-color', 'transparent', 'important');
        markEl.style.setProperty('color', '#D4A373', 'important');
        markEl.style.borderBottom = '2px dotted #D4A373';
        markEl.style.opacity = '0.5';
    }
}

function updateSearchSelectionCounter() {
    const countSpan = document.getElementById('docstral-find-count');
    const checkboxes = document.querySelectorAll('.docstral-search-cb');
    if (countSpan) {
        const selected = Array.from(checkboxes).filter(cb => cb.checked).length;
        countSpan.innerText = `${selected} / ${DocstralSearch.matches.length} SELECTED`;
    }
}

// Navigates between found text matches during a search operation in Docstral.
function navigateMatches(dir) {
    if (DocstralSearch.matches.length === 0) return;
    let next = DocstralSearch.activeIndex + dir;
    if (next < 0) next = DocstralSearch.matches.length - 1;
    if (next >= DocstralSearch.matches.length) next = 0;
    DocstralSearch.focusMatch(next);
}

function renderDocstralSearchResults() {
    const container = document.getElementById('docstral-find-results');
    if (!container) return;

    if (DocstralSearch.matches.length === 0) {
        container.innerHTML = '<div class="text-center text-xs opacity-50 mt-4">No matches found..</div>';
        updateSearchSelectionCounter();
        return;
    }

    container.innerHTML = DocstralSearch.matches.map((match, index) => {
        const safeSnippet = escapeHtml(match.snippet);
        const regex = new RegExp(`(${escapeRegExp(match.text)})`, 'gi');
        const highlightedSnippet = safeSnippet.replace(regex, `<span class="bg-yellow-300 text-black px-1 rounded-sm">$1</span>`);

        return `
            <div class="flex items-start gap-2 p-2 border-b border-[#D4A373]/20 hover:bg-[#D4A373]/10 transition-colors">
                <input type="checkbox" class="docstral-search-cb accent-[#D4A373] mt-1 cursor-pointer" value="${match.id}" checked 
                       onchange="updateSingleHighlightVisual('${match.id}'); updateSearchSelectionCounter();">
                <div class="flex-1 cursor-pointer" onclick="DocstralSearch.focusMatch(${index})">
                    <div class="text-[10px] font-bold text-[#D4A373] mb-0.5 uppercase">LINE ${match.line}</div>
                    <div class="font-mono text-[#3E2723] leading-snug text-[11px]">${highlightedSnippet}</div>
                </div>
            </div>
        `;
    }).join('');

    const selectAllCb = document.getElementById('docstral-find-select-all');
    if (selectAllCb) {
        selectAllCb.checked = true;
        selectAllCb.onchange = function(e) {
            document.querySelectorAll('.docstral-search-cb').forEach(cb => {
                cb.checked = e.target.checked;
                updateSingleHighlightVisual(cb.value);
            });
            updateSearchSelectionCounter();
        };
    }
    updateSearchSelectionCounter();
}

window.openSearchSidebar = function() {
    if (typeof window.openSidebarSmoothly === 'function') {
        window.openSidebarSmoothly('Find & Replace');
    }

    document.getElementById('docstral-sidebar-content').innerHTML = `
        <div class="flex flex-col h-full bg-[#FDFBF7]">
            <div class="p-4 border-b border-[#D4A373]/30 shrink-0 space-y-3">
                <div class="flex flex-col gap-1">
                    <label class="font-bold text-[10px] uppercase text-[#3E2723]">Find what:</label>
                    <div class="flex items-center bg-[#F5E6D3] border border-[#D4A373] rounded px-2 py-1 focus-within:border-[#3E2723] transition-colors">
                        <i class="fa-solid fa-magnifying-glass text-[#D4A373] text-[10px] mr-2"></i>
                        <input type="text" id="docstral-find-val" autocomplete="off" spellcheck="false" class="w-full bg-transparent outline-none text-xs text-[#3E2723] placeholder-[#D4A373]/70" placeholder="Search text...">
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <label class="font-bold text-[10px] uppercase text-[#3E2723]">Replace with:</label>
                    <div class="flex items-center bg-[#F5E6D3] border border-[#D4A373] rounded px-2 py-1 focus-within:border-[#3E2723] transition-colors">
                        <i class="fa-solid fa-pen text-[#D4A373] text-[10px] mr-2"></i>
                        <input type="text" id="docstral-replace-val" autocomplete="off" spellcheck="false" class="w-full bg-transparent outline-none text-xs text-[#3E2723] placeholder-[#D4A373]/70" placeholder="New text...">
                    </div>
                </div>
                <div class="flex flex-col gap-2 pt-2">
                    <button id="docstral-do-find" class="w-full bg-[#E8D8C8] hover:bg-[#D4A373]/50 border border-[#D4A373] py-2 rounded text-xs font-bold transition-all shadow-sm text-[#3E2723] active:scale-95">Find</button>
                    <div class="flex gap-2">
                        <button onclick="DocstralSearch.replace(false)" class="flex-1 bg-[#3E2723] text-[#D4A373] hover:bg-[#5D4037] py-2 rounded text-xs font-bold transition-all shadow-sm active:scale-95">Replace All</button>
                        <button onclick="DocstralSearch.replace(true)" class="flex-1 bg-[#3E2723] text-[#D4A373] hover:bg-[#5D4037] py-2 rounded text-xs font-bold transition-all shadow-sm active:scale-95">Replace Selected</button>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="navigateMatches(-1)" class="flex-1 bg-white border border-[#D4A373]/50 text-[#3E2723] hover:bg-[#F5E6D3] py-1.5 rounded active:scale-95 transition-all"><i class="fa-solid fa-arrow-left"></i></button>
                        <button onclick="navigateMatches(1)" class="flex-1 bg-white border border-[#D4A373]/50 text-[#3E2723] hover:bg-[#F5E6D3] py-1.5 rounded active:scale-95 transition-all"><i class="fa-solid fa-arrow-right"></i></button>
                    </div>
                </div>
            </div>
            <div class="p-2 bg-[#F4EFEA] flex justify-between items-center text-[10px] font-bold text-[#3E2723] border-b border-[#D4A373]/30">
                <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="docstral-find-select-all" class="accent-[#D4A373]" checked> SELECT ALL</label>
                <span id="docstral-find-count">0 / 0 SELECTED</span>
            </div>
            <div id="docstral-find-results" class="flex-1 overflow-y-auto p-2 text-xs space-y-1 custom-scroll">
                <div class="text-center text-xs opacity-50 mt-4">Enter text and press Find.</div>
            </div>
        </div>
    `;

    setTimeout(() => {
        const findBtn = document.getElementById('docstral-do-find');
        const findInput = document.getElementById('docstral-find-val');

        if (findBtn) {
            findBtn.onclick = () => DocstralSearch.find(document.getElementById('docstral-find-val').value);
        }
        
        if (findInput) {
            findInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    DocstralSearch.find(findInput.value);
                }
            });
            findInput.focus(); 
        }
    }, 50);
    
    if (DocstralSearch.matches.length > 0) {
        renderDocstralSearchResults(); 
    } else {
        updateSearchSelectionCounter(); 
    }
};

if (typeof window.escapeHtml === 'undefined') {
    window.escapeHtml = function(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    };
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        DocstralSearch.clear();
    }, 500); 
    
    if (typeof DocstralSync !== 'undefined' && !DocstralSync._searchPatched) {
        const originalExtract = DocstralSync.extractBlocksFromDOM;
        DocstralSync.extractBlocksFromDOM = function() {
            const blocks = originalExtract.call(this);
            return blocks.map(b => {
                b.content = b.content.replace(/<mark[^>]*docstral-search-match[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
                return b;
            });
        };
        DocstralSync._searchPatched = true;
    }
});

window.sidebarCloseTimeout = null;

window.openDocstralSidebar = function(title, contentHtml) {
    const sidebar = document.getElementById('docstral-sidebar');
    const titleEl = document.getElementById('docstral-sidebar-title');
    const contentEl = document.getElementById('docstral-sidebar-content');

    if (sidebar && titleEl && contentEl) {
        clearTimeout(window.sidebarCloseTimeout);

        titleEl.innerText = title;
        if (contentHtml) contentEl.innerHTML = contentHtml;

        sidebar.style.setProperty('transition', 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease', 'important');
        
        sidebar.classList.remove('hidden', '-translate-x-full');
        sidebar.style.setProperty('display', 'flex', 'important');
        sidebar.style.setProperty('visibility', 'visible', 'important');
        
        void sidebar.offsetWidth;
        
        sidebar.style.setProperty('transform', 'translateX(0)', 'important');
        sidebar.style.setProperty('opacity', '1', 'important');
    }
};

window.closeDocstralSidebar = function(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault(); 
        e.stopPropagation();
    }

    if (typeof DocstralSearch !== 'undefined') {
        DocstralSearch.clear(); 
    }
    
    if (typeof DocstralSync !== 'undefined') {
        if (typeof DocstralSync.executeSync === 'function') {
            DocstralSync.executeSync(false); 
        } else if (typeof DocstralSync.scheduleSync === 'function') {
            DocstralSync.scheduleSync();
        }
    }
    
    const sidebar = document.getElementById('docstral-sidebar');
    if (sidebar) {
        sidebar.style.setProperty('transition', 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease', 'important');
        
        sidebar.style.setProperty('transform', 'translateX(-100%)', 'important');
        sidebar.style.setProperty('opacity', '0', 'important');
        
        clearTimeout(window.sidebarCloseTimeout);
        
        window.sidebarCloseTimeout = setTimeout(() => {
            sidebar.style.setProperty('display', 'none', 'important');
            sidebar.style.setProperty('visibility', 'hidden', 'important');
            sidebar.classList.add('hidden', '-translate-x-full');
            
            sidebar.style.removeProperty('transition');
            sidebar.style.removeProperty('transform');
            sidebar.style.removeProperty('opacity');
        }, 300); 
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const findBtn = document.getElementById('btn-find');
    const clipBtn = document.getElementById('btn-clipboard');
    const closeBtn = document.getElementById('docstral-sidebar-close');

    if (findBtn) {
        findBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.openDocstralSidebar('Find & Replace', '<div class="p-4">The form is here.</div>');
        };
    }

    if (closeBtn) {
        closeBtn.onclick = window.closeDocstralSidebar;
    }
});

// Sets a specific numerical zoom level for viewing Docstral pages.
function setZoom(level) {
    currentZoom = Math.max(10, Math.min(250, level));
    const zInput = document.getElementById('zoom-value-input');
    const pContainer = document.getElementById('docstral-pages-container');

    if (zInput) zInput.value = `${Math.round(currentZoom)}%`;
    
    const scale = currentZoom / 100;

    if (pContainer) {
        pContainer.style.transform = `scale(${scale})`;
        pContainer.style.transformOrigin = 'top center';
    }    
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-find')?.addEventListener('click', (e) => {
        e.preventDefault();
        if(typeof window.openSearchSidebar === 'function') window.openSearchSidebar();
    });

document.getElementById('btn-astral')?.addEventListener('click', (e) => {
    e.preventDefault();
    
    const selectedText = window.getSelection().toString().trim();
    
    if (selectedText && typeof handleSelectionAction === 'function') {
        handleSelectionAction('astral');
    }
});
    
    const zoomInputEl = document.getElementById('zoom-value-input');

    const isDocstralActive = () => {
        const docName = document.getElementById('current-doc-name')?.innerText || "";
        return !(docName.includes("Select") || docName === "");
    };

    document.getElementById('btn-zoom-in')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isDocstralActive()) return;
        setZoom(currentZoom + 10);
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isDocstralActive()) return;
        setZoom(currentZoom - 10);
    });

    zoomInputEl?.addEventListener('change', (e) => {
        if (!isDocstralActive()) {
            e.target.value = "100%"; 
            return;
        }
        let val = parseInt(e.target.value.replace('%', ''));
        if (!isNaN(val)) setZoom(val);
        else setZoom(currentZoom);
    });

    document.getElementById('docstral-workspace')?.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (!isDocstralActive()) return;
            
            const direction = e.deltaY > 0 ? -10 : 10;
            setZoom(currentZoom + direction);
        }
    }, { passive: false });

});

window.restoreAstral = function() {
    const win = document.getElementById('astral-window');
    const bubble = document.getElementById('astral-bubble');
    if (win) { 
        win.classList.remove('hidden'); 
        win.style.display = 'flex'; 
        if (typeof bringWindowToFront === 'function') bringWindowToFront(win);
    }
    if (bubble) { bubble.classList.add('hidden'); bubble.style.display = 'none'; }
    if (typeof loadAstralData === 'function') loadAstralData();
};

if (typeof window.escapeHtml === 'undefined') {
    window.escapeHtml = function(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    };
}

let prevVw = window.innerWidth;

window.handleGlobalAppResize = function(isFromResizeEvent = false) {
    const headerWrapper = document.querySelector('#main-header .bar-content-wrapper');
    const sidebar = document.getElementById('sidebar');
    const vw = window.innerWidth;
    
    const isBrowserWindowed = window.outerWidth < (window.screen.availWidth * 0.98);

    if (isFromResizeEvent && (isBrowserWindowed || vw < 950) && prevVw >= 950 && sidebar && !sidebar.classList.contains('collapsed-mode')) {
        if (typeof toggleSidebar === 'function') toggleSidebar();
    }
    prevVw = vw;

    let sidebarWidth = 340;
    if (sidebar) sidebarWidth = sidebar.classList.contains('collapsed-mode') ? 60 : sidebar.offsetWidth;
    const availableWidth = vw - sidebarWidth;
    
    if (isBrowserWindowed || availableWidth < 850) {
        document.body.classList.add('compact-app');
    } else {
        document.body.classList.remove('compact-app');
    }

    if (isBrowserWindowed || vw < 950) {
        document.body.classList.add('utility-bar-active');
    } else {
        document.body.classList.remove('utility-bar-active');
    }

    if (headerWrapper) {
        const baseWidth = 950; 
        let uiScale = availableWidth / baseWidth;
        uiScale = Math.max(0.80, Math.min(1, uiScale)); 

        headerWrapper.style.transform = `scale(${uiScale})`;
        
        if (uiScale <= 0.85 || isBrowserWindowed) {
            headerWrapper.style.transformOrigin = 'center';
            headerWrapper.style.justifyContent = 'center';
        } else {
            headerWrapper.style.transformOrigin = 'left center';
            headerWrapper.style.justifyContent = 'space-between';
        }
        
        headerWrapper.style.width = `${100 / uiScale}%`;
    }

    const chatWrapper = document.querySelector('#chat-input-area .max-w-4xl'); 
    const browserBubble = document.getElementById('browser-bubble');
    const fmBubble = document.getElementById('fm-bubble');
    const docBubble = document.getElementById('docstral-bubble');

    if (isBrowserWindowed || vw < 950) {
        if (chatWrapper && docBubble && docBubble.parentNode !== chatWrapper) {
            if (browserBubble) chatWrapper.appendChild(browserBubble);
            if (fmBubble) chatWrapper.appendChild(fmBubble);
            if (docBubble) chatWrapper.appendChild(docBubble);
        }
    } else {
        if (docBubble && docBubble.parentNode !== document.body) {
            if (browserBubble) document.body.appendChild(browserBubble);
            if (fmBubble) document.body.appendChild(fmBubble);
            if (docBubble) document.body.appendChild(docBubble);
        }
    }
};

window.addEventListener('resize', () => window.handleGlobalAppResize(true));

const originalToggleSidebar = window.toggleSidebar;
window.toggleSidebar = function() {
    if (typeof originalToggleSidebar === 'function') originalToggleSidebar();
    setTimeout(() => {
        window.handleGlobalAppResize(false);
    }, 310);
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => window.handleGlobalAppResize(true), 100);
});

// Switches the Docstral interface between distinct operating modes (e.g., standard document, PDF, QR generator).
window.setDocstralMode = function(mode) {
    const docWindow = document.getElementById('docstral-window');
    const container = document.getElementById('docstral-pages-container');
    const workspaceContainer = document.getElementById('docstral-workspace');
    
    const docSidebar = document.getElementById('docstral-sidebar');
    const docSidebarClose = document.getElementById('docstral-sidebar-close');
    const docSidebarTitle = document.getElementById('docstral-sidebar-title');
    const docSidebarContent = document.getElementById('docstral-sidebar-content');

    if (!docWindow) return;

    docWindow.setAttribute('data-mode', mode);
    document.body.classList.remove('pdf-mode-active', 'qr-mode-active');
    if (mode === 'pdf') document.body.classList.add('pdf-mode-active');
    if (mode === 'qr') document.body.classList.add('qr-mode-active');

    const topBar2 = document.getElementById('docstral-top-bar-2');
    const bottomBarsWrapper = document.getElementById('docstral-bottom-bars-wrapper');

    const hideToolbars = ['pdf', 'qr'].includes(mode);
    if (topBar2) topBar2.style.setProperty('display', hideToolbars ? 'none' : '', 'important');
    if (bottomBarsWrapper) bottomBarsWrapper.style.setProperty('display', hideToolbars ? 'none' : '', 'important');

    workspaceContainer.innerHTML = ''; 

    if (mode === 'pdf' || mode === 'qr') {
        clearTimeout(window.sidebarCloseTimeout);
        if (docSidebar) {
            docSidebar.classList.remove('hidden', '-translate-x-full');
            docSidebar.style.cssText = `
                position: relative !important;
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
                transform: translateX(0) !important;
                z-index: 30 !important;
                box-shadow: none !important;
                border-right: 1px solid rgba(212, 163, 115, 0.3) !important;
                width: 320px !important;
                min-width: 320px !important;
                margin: 0 !important;
                left: 0 !important;
                border-radius: 0 !important;
                height: 100% !important;
            `;
            if (docSidebar.parentElement) {
                docSidebar.parentElement.style.setProperty('display', 'flex', 'important');
                docSidebar.parentElement.style.setProperty('flex-direction', 'row', 'important');
                docSidebar.parentElement.style.setProperty('padding', '0', 'important');
                docSidebar.parentElement.style.setProperty('margin', '0', 'important');
            }
        }
        if (docSidebarClose) docSidebarClose.style.display = 'none';
        if (docSidebarTitle) docSidebarTitle.innerText = mode === 'pdf' ? "PDF OPTIONS" : "QR GENERATOR";
        
        workspaceContainer.style.cssText = `
            height: 100% !important; flex: 1 !important; margin: 0 !important; padding: 0 !important;
            position: relative; background-color: #E8D8C8; overflow: hidden;
        `;
    } else {
        if (docSidebar) {
            docSidebar.style.position = 'absolute';
            if (docSidebar.parentElement) {
                docSidebar.parentElement.style.flexDirection = '';
                docSidebar.parentElement.style.padding = '';
                docSidebar.parentElement.style.margin = '';
            }
        }
        if (docSidebarClose) docSidebarClose.style.display = '';
        
        workspaceContainer.style.cssText = `
            flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
            background: #E8D8C8; position: relative;
        `;
    }

    document.querySelectorAll('[id^="btn-mode-"]').forEach(btn => {
        btn.classList.remove('mode-active', 'bg-[#D4A373]', 'text-white');
        
        btn.classList.add('bg-[#FDFBF7]', 'text-[#D4A373]');
    });

    const activeBtn = document.getElementById(`btn-mode-${mode}`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-[#FDFBF7]', 'bg-[#D4A373]', 'text-white');
        activeBtn.classList.add('mode-active');
    }

    switch(mode) {
        case 'page':
            workspaceContainer.innerHTML = `<div id="docstral-pages-container" class="flex flex-col items-center space-y-12 py-10 w-full relative transform origin-top"></div>`;
            
            setTimeout(() => {
                const newContainer = document.getElementById('docstral-pages-container');
                const titleSpan = document.getElementById('current-doc-name');
                
                if (titleSpan) titleSpan.innerText = "Select document...";
                if (typeof DocstralMeta !== 'undefined') {
                    DocstralMeta.data.id = null;
                    DocstralMeta.data.name = null;
                    DocstralMeta.data.currentFilename = null;
                }

                if (typeof window.updateExportState === 'function') window.updateExportState();
                if (typeof showDocstralWelcomeScreen === 'function') {
                    showDocstralWelcomeScreen(newContainer);
                }
            }, 10);
            break;
            
        case 'pdf':
            if (typeof initPdfMode === 'function') {
                initPdfMode(workspaceContainer, docSidebarContent);
                if (typeof renderPdfWorkspace === 'function' && window.pdfEngineState.pages.length === 0) renderPdfWorkspace(); 
            }
            break;
            
        case 'qr':
            if (typeof initQrMode === 'function') initQrMode(workspaceContainer, docSidebarContent);
            break;
    }

    setTimeout(() => {
        if (typeof window.refreshAddressBar === 'function') window.refreshAddressBar(); 
        if (typeof updateDocstralScale === 'function') updateDocstralScale(); 
    }, 50);
};

    document.addEventListener('DOMContentLoaded', () => {
        const currentMode = document.getElementById('docstral-window')?.getAttribute('data-mode') || 'page';
        window.setDocstralMode(currentMode);
    });

window.pdfEngineState = {
    files: [], 
    pages: []  
};

// Initializes the UI layout and specialized tools required for the PDF handling mode.
function initPdfMode(container, sidebarContentEl) {
    if (!document.getElementById('pdf-mode-global-styles')) {
        const style = document.createElement('style');
        style.id = 'pdf-mode-global-styles';
        style.innerHTML = `
            #docstral-top-bars, #docstral-top-bar-1, #docstral-top-bar-2, .docstral-header-extra, .docstral-top-bar { 
                transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out, max-height 0.3s ease-in-out, margin 0.3s ease-in-out, padding 0.3s ease-in-out;
                transform: translateY(0);
                opacity: 1;
                max-height: 100px;
                overflow: hidden;
            }

            body.pdf-mode-active #docstral-top-bars, 
            body.pdf-mode-active #docstral-top-bar-1, 
            body.pdf-mode-active #docstral-top-bar-2, 
            body.pdf-mode-active .docstral-header-extra, 
            body.pdf-mode-active .docstral-top-bar { 
                transform: translateY(-100%);
                opacity: 0;
                max-height: 0px !important;
                margin: 0 !important;
                padding: 0 !important;
                border: none !important;
                pointer-events: none;
            }

            body.pdf-mode-active header, 
            body.pdf-mode-active #main-header, 
            body.pdf-mode-active .window-header, 
            body.pdf-mode-active .docstral-window-header { flex-shrink: 0 !important; min-height: 40px !important; }

            body.pdf-mode-active:fullscreen, body.pdf-mode-active .fullscreen, body.pdf-mode-active .is-fullscreen, body.pdf-mode-active .maximized { resize: none !important; }
            body.pdf-mode-active:fullscreen .resize-handle, body.pdf-mode-active .fullscreen .resize-handle, body.pdf-mode-active .maximized .resize-handle,
            body.pdf-mode-active:fullscreen .resizer, body.pdf-mode-active .fullscreen .resizer, body.pdf-mode-active .maximized .resizer { display: none !important; pointer-events: none !important; }

            .pdf-btn-group {
                display: flex; flex-direction: column;
                border: 1px solid rgba(212, 163, 115, 0.4);
                border-radius: 8px; overflow: hidden; background: #FDFBF7;
            }
            .pdf-side-btn {
                width: 100%; padding: 8px 10px; font-size: 12px; font-weight: 800; text-transform: uppercase;
                display: flex; align-items: center; gap: 12px; color: #3E2723;
                transition: background-color 0.15s ease; text-align: left;
                background: #FDFBF7;
                border: none;
                cursor: pointer;
            }
            .pdf-side-btn:not(:last-child) { border-bottom: 1px solid rgba(212, 163, 115, 0.2); }
            .pdf-side-btn i { font-size: 16px; width: 22px; text-align: center; color: #D4A373; }
            .pdf-side-btn:hover { background-color: #F5E6D3; }
            .pdf-side-btn:active { background-color: #E8D8C8; }

            .bulk-toolbar.hidden { 
                transform: translateX(-50%) translateY(-50px) scale(0.9) !important; 
                opacity: 0 !important; 
                pointer-events: none !important; 
            }
        `;
        document.head.appendChild(style);
    }

    if (window.pdfVisibilityTimer) clearInterval(window.pdfVisibilityTimer);
    window.pdfVisibilityTimer = setInterval(() => {
        const workspace = document.getElementById('pdf-workspace-area');
        const isActive = workspace && workspace.offsetWidth > 0;
        
        if (isActive) {
            document.body.classList.add('pdf-mode-active');
        } else {
            document.body.classList.remove('pdf-mode-active');
        }
    }, 150);

    sidebarContentEl.innerHTML = `
        <div id="pdf-sidebar-wrapper" class="flex flex-col h-full w-full overflow-hidden transition-colors">
            
            <div class="pdf-top-section h-1/2 flex flex-col p-3 gap-3 border-b">
                
                <!-- Dropzone -->
                <div id="pdf-sidebar-dropzone" class="pdf-dropzone py-4 px-4 border rounded-xl text-center cursor-pointer transition-colors shrink-0">
                    <i class="fa-solid fa-cloud-arrow-up text-3xl mb-2 dropzone-icon"></i>
                    <p class="text-[12px] font-bold uppercase tracking-wider dropzone-text">Drag & Drop Files</p>
                    <input type="file" id="pdf-sidebar-input" accept=".pdf,.jpg,.jpeg,.png" multiple class="hidden">
                </div>

                <!-- Labels & Badge -->
                <div class="flex justify-between items-center text-[11px] font-black uppercase tracking-widest shrink-0 px-1 mt-1 pdf-heading">
                    <span>Uploaded Files</span>
                    <span id="pdf-selection-count" class="pdf-badge px-2 py-0.5 rounded text-[10px]">0 Selected</span>
                </div>
                
                <!-- File List -->
                <div id="pdf-file-list" class="pdf-file-list flex-1 overflow-y-auto custom-scrollbar border rounded-lg flex flex-col">
                    <div class="text-center text-[12px] italic m-auto pdf-empty-text">No files uploaded.</div>
                </div>
            </div>

            <div class="h-1/2 flex flex-col p-3 overflow-y-auto custom-scrollbar">
                
                <!-- Settings -->
                <div class="pdf-export-settings flex flex-col shrink-0 mb-3">
                    <div class="flex items-center justify-between mb-1.5 px-1">
                        <div class="text-[11px] font-black uppercase tracking-widest pdf-heading">Export Settings</div>
                        <label class="flex items-center gap-2 text-[12px] font-bold cursor-pointer pdf-chk-label">
                            <input type="checkbox" id="pdf-opt-pagination" class="accent-[#D4A373] w-4 h-4">
                            Pagination
                        </label>
                    </div>
                    <input type="text" id="pdf-opt-watermark" placeholder="Watermark (BG/EN)..." class="pdf-input w-full text-[12px] p-1.5 rounded-lg outline-none">
                </div>

                <!-- Buttons -->
                <div class="pdf-btn-group shrink-0 flex flex-col gap-1.5">
                    <button onclick="mergeAllPdfs()" class="pdf-side-btn">
                        <i class="fa-solid fa-file-pdf"></i> Merge all to pdf
                    </button>
                    <button onclick="mergeSelectedPdfs()" class="pdf-side-btn">
                        <i class="fa-regular fa-file-pdf"></i> Merge selected to pdf
                    </button>
                    <button onclick="splitPdfToZip(false)" class="pdf-side-btn">
                        <i class="fa-solid fa-file-zipper icon-orange"></i> Split all to pdf (ZIP)
                    </button>
                    <button onclick="splitPdfToZip(true)" class="pdf-side-btn">
                        <i class="fa-regular fa-file-zipper icon-orange"></i> Split selected to pdf (ZIP)
                    </button>
                    <button onclick="splitPdfToZipPng(false)" class="pdf-side-btn">
                        <i class="fa-solid fa-images icon-purple"></i> Split all to png (ZIP)
                    </button>
                    <button onclick="splitPdfToZipPng(true)" class="pdf-side-btn">
                        <i class="fa-regular fa-images icon-purple"></i> Split selected png (ZIP)
                    </button>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div id="pdf-workspace-area" class="w-full h-full flex-1 overflow-y-auto custom-scrollbar bg-[#E8D8C8] relative select-none">
            
            <div id="pdf-bulk-toolbar" class="bulk-toolbar hidden">
                <span id="bulk-select-count" class="text-xs font-bold border-r border-white/20 pr-4 mr-2">0 SELECTED</span>
                <button onclick="rotateSelectedPages(-90)" class="bulk-btn"><i class="fa-solid fa-rotate-left"></i> -90°</button>
                <button onclick="rotateSelectedPages(90)" class="bulk-btn"><i class="fa-solid fa-rotate-right"></i> +90°</button>
                <button onclick="deleteSelectedPages()" class="bulk-btn danger"><i class="fa-solid fa-trash"></i> Delete sel</button>
                <button onclick="deselectAll()" class="bulk-btn"><i class="fa-solid fa-xmark"></i> Cancel</button>
            </div>

            <div id="pdf-workspace-grid" class="pdf-workspace-grid flex flex-wrap justify-center content-start gap-3 px-4 pt-[80px] pb-16 min-h-full w-full">
    
                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-colors" id="pdf-empty-state">
                    <i class="fa-solid fa-arrow-left text-4xl mb-4 animate-pulse"></i>
                    <div class="text-sm font-bold uppercase tracking-widest">UPLOAD FILES</div>
                </div>

            </div>
        </div>

        <div id="pdf-preview-modal" class="hidden fixed inset-0 z-[999999] bg-black/90 backdrop-blur-md flex-col items-center justify-center">
            <div class="absolute top-4 right-6 flex gap-3 bg-[#2b2b2b] p-2 rounded-lg border border-[#D4A373]/30 shadow-2xl z-50">
                <button onclick="zoomPreview(0.2)" class="w-10 h-10 flex items-center justify-center text-white hover:text-[#D4A373] rounded-lg transition-colors"><i class="fa-solid fa-magnifying-glass-plus text-lg"></i></button>
                <button onclick="zoomPreview(-0.2)" class="w-10 h-10 flex items-center justify-center text-white hover:text-[#D4A373] rounded-lg transition-colors"><i class="fa-solid fa-magnifying-glass-minus text-lg"></i></button>
                <div class="w-px h-6 bg-white/20 my-auto mx-1"></div>
                <button onclick="closePdfPreview()" class="w-10 h-10 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors"><i class="fa-solid fa-xmark text-xl"></i></button>
            </div>
            <div id="pdf-preview-container" class="w-full h-full overflow-y-auto custom-scrollbar flex flex-col items-center gap-8 py-20 px-4"></div>
        </div>
    `;

    setupPdfSidebarEvents();
    
    setTimeout(() => {
        if (typeof initMarqueeSelection === 'function') initMarqueeSelection();
        if (window.pdfEngineState.pages.length > 0) {
            renderPdfWorkspace();
            if (typeof renderPdfFileList === 'function') renderPdfFileList();
        }
    }, 50);
}

function renderPdfFileList() {
    const list = document.getElementById('pdf-file-list');
    if (!list) return;
    
    if (window.pdfEngineState.files.length === 0) {
        list.innerHTML = '<div class="text-center text-[12px] italic text-[#8D6E63]/50 m-auto py-4">No files uploaded.</div>';
        return;
    }
    
    list.innerHTML = window.pdfEngineState.files.map((f, index) => {
        const isImage = f.type.startsWith('image/');
        const iconClass = isImage ? 'fa-file-image text-purple-400' : 'fa-file-pdf text-[#D4A373]';
        const isLast = index === window.pdfEngineState.files.length - 1;
        
        return `
        <div class="flex items-center justify-between py-2.5 px-3 bg-white group hover:bg-[#FDFBF7] transition-colors ${!isLast ? 'border-b border-[#D4A373]/20' : ''}">
            <div class="flex items-center gap-3 min-w-0 flex-1">
                <i class="fa-solid ${iconClass} text-[16px] shrink-0"></i>
                <span class="text-[12px] font-bold text-[#3E2723] truncate" title="${f.name}">${f.name}</span>
            </div>
            <button onclick="removePdfFile('${f.id}')" class="text-red-300 hover:text-red-500 w-6 h-6 flex items-center justify-center shrink-0 transition-all">
                <i class="fa-solid fa-xmark text-[14px]"></i>
            </button>
        </div>
        `;
    }).join('');
}

function setupPdfSidebarEvents() {
    const dropBox = document.getElementById('pdf-sidebar-dropzone');
    const input = document.getElementById('pdf-sidebar-input');
    if(!dropBox || !input) return;

    dropBox.onclick = () => input.click();

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropBox.addEventListener(eventName, (e) => {
            e.preventDefault(); 
            if(eventName === 'dragenter' || eventName === 'dragover') dropBox.classList.add('bg-[#D4A373]/20');
            else dropBox.classList.remove('bg-[#D4A373]/20');
        }, false);
    });

    dropBox.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const filesArray = Array.from(e.dataTransfer.files);
            handlePdfFilesUpload(filesArray);
        }
    });

    input.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const filesArray = Array.from(e.target.files);
            handlePdfFilesUpload(filesArray);
            input.value = ''; 
        }
    };
}

async function handlePdfFilesUpload(files) {
    if(typeof showToast === 'function') showToast(`Processing files...`);
    
    for (let file of files) {
        const fileId = 'file_' + Date.now() + Math.random().toString(36).substr(2, 9);
        const arrayBuffer = await file.arrayBuffer();
        const fileExt = file.name.split('.').pop().toLowerCase();
        
        window.pdfEngineState.files.push({ 
            id: fileId, name: file.name, buffer: arrayBuffer, type: file.type, ext: fileExt
        });
        
        if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png'].includes(fileExt)) {
            const base64Url = await arrayBufferToDataUrl(arrayBuffer, file.type || `image/${fileExt}`);
            addPageToWorkspace(fileId, file.name, 0, base64Url, true);
        } else if (file.type === 'application/pdf' || fileExt === 'pdf') {
            try {
                const typedarray = new Uint8Array(arrayBuffer.slice(0));
                const loadingTask = pdfjsLib.getDocument({ data: typedarray });
                const pdf = await loadingTask.promise;

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 }); 
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    addPageToWorkspace(fileId, file.name, i - 1, canvas.toDataURL('image/png'), false);
                }
            } catch (e) { 
                console.error(e); 
            }
        }
    }
    renderPdfFileList();
    renderPdfWorkspace();
}

// Adds a newly extracted PDF page image to the Docstral PDF workspace grid.
function addPageToWorkspace(fileId, fileName, originalIndex, thumbUrl, isImage) {
    window.pdfEngineState.pages.push({
        id: 'page_' + Date.now() + Math.random().toString(36).substr(2, 5),
        fileId: fileId,
        fileName: fileName,
        originalIndex: originalIndex,
        thumbUrl: thumbUrl,
        rotation: 0,
        selected: false,
        isImage: isImage
    });
}

function arrayBufferToDataUrl(buffer, type) {
    return new Promise((resolve) => {
        const blob = new Blob([buffer], { type: type });
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(blob);
    });
}

// Removes a loaded PDF file and all its associated pages from the current workspace.
window.removePdfFile = function(fileId) {
    window.pdfEngineState.files = window.pdfEngineState.files.filter(f => f.id !== fileId);
    window.pdfEngineState.pages = window.pdfEngineState.pages.filter(p => p.fileId !== fileId);
    renderPdfFileList();
    renderPdfWorkspace();
};

function renderPdfWorkspace() {
    const grid = document.getElementById('pdf-workspace-grid');
    const bulkToolbar = document.getElementById('pdf-bulk-toolbar');
    const bulkCountLabel = document.getElementById('bulk-select-count');
    if (!grid) return;
    
    const selectedPages = window.pdfEngineState.pages.filter(p => p.selected);

    if (selectedPages.length > 0 && bulkToolbar) {
        bulkToolbar.classList.remove('hidden');
        if (bulkCountLabel) bulkCountLabel.innerText = `${selectedPages.length} SELECTED`;
    } else if (bulkToolbar) {
        bulkToolbar.classList.add('hidden');
    }

    if (window.pdfEngineState.pages.length === 0) {
        grid.innerHTML = `
            <div class="absolute inset-0 flex flex-col items-center justify-center text-[#D4A373]/40 pointer-events-none" id="pdf-empty-state">
                <i class="fa-solid fa-arrow-left text-4xl mb-4 animate-pulse"></i>
                <div class="text-sm font-bold uppercase tracking-widest">UPLOAD FILES</div>
            </div>
        `;
        updateSelectionCount();
        return;
    }
    
    grid.innerHTML = '';
    window.pdfEngineState.pages.forEach((page, index) => {
        const item = document.createElement('div');
        
        item.className = `pdf-page-item group w-[220px] flex flex-col items-center bg-[#FDFBF7] p-2.5 rounded-xl border transition-colors cursor-grab active:cursor-grabbing ${
            page.selected ? 'border-[#D4A373] ring-4 ring-[#D4A373]/50 shadow-lg' : 'border-[#D4A373]/40 shadow-sm hover:border-[#D4A373]/60'
        }`;
        item.dataset.id = page.id;
        
        item.innerHTML = `
            <div class="relative w-full aspect-[1/1.4] bg-white mb-2 overflow-hidden rounded-lg border border-[#D4A373]/20 shadow-inner group-hover:border-[#D4A373]/60 transition-colors pointer-events-none">
                <div class="pdf-page-toolbar absolute top-2 left-1/2 -translate-x-1/2 bg-[#3E2723]/95 backdrop-blur-md rounded-lg shadow-xl flex gap-1 p-1 z-30 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-y-0 -translate-y-2">
                    <button onclick="rotatePdfPage('${page.id}', -90)" class="w-8 h-8 flex items-center justify-center text-white hover:text-[#D4A373] rounded transition-colors"><i class="fa-solid fa-rotate-left text-xs pointer-events-none"></i></button>
                    <button onclick="rotatePdfPage('${page.id}', 90)" class="w-8 h-8 flex items-center justify-center text-white hover:text-[#D4A373] rounded transition-colors"><i class="fa-solid fa-rotate-right text-xs pointer-events-none"></i></button>
                    <div class="w-px h-5 bg-white/20 my-auto mx-1 pointer-events-none"></div>
                    <button onclick="deletePdfPage('${page.id}')" class="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white rounded transition-colors"><i class="fa-solid fa-trash text-xs pointer-events-none"></i></button>
                </div>
                <img src="${page.thumbUrl}" class="w-full h-full object-contain pointer-events-none" style="transform: rotate(${page.rotation}deg); transition: transform 0.3s ease;">
                ${page.selected ? '<div class="absolute bottom-1 right-1 bg-[#D4A373] text-white w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white"><i class="fa-solid fa-check text-[12px]"></i></div>' : ''}
            </div>
            <div class="text-center w-full mt-auto pb-1 pointer-events-none">
                <div class="text-[10px] font-black text-[#3E2723] bg-[#D4A373]/20 rounded px-2 py-0.5 inline-block mb-1 border border-[#D4A373]/30 uppercase">pg. ${index + 1}</div>
                <div class="text-[9px] text-[#8D6E63] font-mono truncate w-full px-2" title="${page.fileName}">${page.fileName}</div>
            </div>
        `;

        item.onclick = (e) => {
            if (e.target.closest('.pdf-page-toolbar')) return;
            page.selected = !page.selected; 
            renderPdfWorkspace();
        };

        item.ondblclick = (e) => {
            if (e.target.closest('.pdf-page-toolbar')) return;
            if (typeof openPdfPreview === 'function') {
                openPdfPreview(page.id);
            }
        };

        grid.appendChild(item);
    });
    
    updateSelectionCount();

    if (window.pdfSortable) {
        window.pdfSortable.destroy();
    }
    
    if (typeof Sortable !== 'undefined') {
        window.pdfSortable = Sortable.create(grid, {
            animation: 200,
            draggable: '.pdf-page-item',
            ghostClass: 'opacity-30',
            filter: '.pdf-page-toolbar, button', 
            preventOnFilter: false,
            fallbackTolerance: 5,
            
            onEnd: function() {
                const domIds = Array.from(grid.querySelectorAll('.pdf-page-item')).map(el => el.dataset.id);
                
                window.pdfEngineState.pages = domIds.map(id => {
                    return window.pdfEngineState.pages.find(p => p.id === id);
                }).filter(p => p !== undefined);
                
                renderPdfWorkspace(); 
            }
        });
    } else {
    }
}

function updateSelectionCount() {
    const count = window.pdfEngineState.pages.filter(p => p.selected).length;
    const el = document.getElementById('pdf-selection-count');
    if (el) {
        el.innerText = `${count} Selected`;
    }
}

// Applies a specific rotation angle to all currently selected pages in the PDF workspace.
window.rotateSelectedPages = function(angle) {
    window.pdfEngineState.pages.forEach(page => {
        if (page.selected) {
            page.rotation = (page.rotation + angle) % 360;
        }
    });
    renderPdfWorkspace();
};

// Deletes all currently selected PDF pages from the active workspace.
window.deleteSelectedPages = function() {
    if (!confirm('Are you sure you want to delete the selected pages?')) return;
    window.pdfEngineState.pages = window.pdfEngineState.pages.filter(page => !page.selected);
    
    const remainingFileIds = [...new Set(window.pdfEngineState.pages.map(p => p.fileId))];
    window.pdfEngineState.files = window.pdfEngineState.files.filter(f => remainingFileIds.includes(f.id));
    
    renderPdfWorkspace();
    renderPdfFileList();
};

window.deselectAll = function() {
    window.pdfEngineState.pages.forEach(page => page.selected = false);
    renderPdfWorkspace();
};

function initMarqueeSelection() {
    const area = document.getElementById('pdf-workspace-area');
    const grid = document.getElementById('pdf-workspace-grid');
    if (!area || !grid) return;
    
    let lasso = null, isDrawing = false, startX, startY;
    let scrollInterval = null; 
    let hasDragged = false; 

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    area.addEventListener('click', (e) => {
        if (hasDragged) return;

        if (e.target === area || e.target === grid) {
            window.pdfEngineState.pages.forEach(p => p.selected = false);
            renderPdfWorkspace();
        }
    });

    area.addEventListener('mousedown', (e) => {
        if (e.target.closest('.pdf-page-item') || e.target.closest('button')) return;
        
        isDrawing = true;
        hasDragged = false; 
        
        const rect = area.getBoundingClientRect();
        startX = e.clientX - rect.left + area.scrollLeft;
        startY = e.clientY - rect.top + area.scrollTop;

        lasso = document.createElement('div');
        lasso.style.position = 'absolute'; 
        lasso.style.zIndex = '999999';
        lasso.style.backgroundColor = 'rgba(212, 163, 115, 0.2)';
        lasso.style.border = '1px solid #D4A373';
        lasso.style.pointerEvents = 'none';
        
        area.appendChild(lasso);
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDrawing || !lasso) return;
        
        const rect = area.getBoundingClientRect();
        const curX = e.clientX - rect.left + area.scrollLeft;
        const curY = e.clientY - rect.top + area.scrollTop;

        if (Math.abs(curX - startX) > 3 || Math.abs(curY - startY) > 3) {
            hasDragged = true;
        }

        clearInterval(scrollInterval);
        const scrollZone = 50; 
        const scrollSpeed = 20;
        
        if (e.clientY < rect.top + scrollZone) {
            scrollInterval = setInterval(() => area.scrollTop -= scrollSpeed, 20);
        } else if (e.clientY > rect.bottom - scrollZone) {
            scrollInterval = setInterval(() => area.scrollTop += scrollSpeed, 20);
        }

        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.abs(curX - startX);
        const height = Math.abs(curY - startY);

        lasso.style.left = `${left}px`;
        lasso.style.top = `${top}px`;
        lasso.style.width = `${width}px`;
        lasso.style.height = `${height}px`;

        const lRect = lasso.getBoundingClientRect();
        document.querySelectorAll('.pdf-page-item').forEach(item => {
            const iRect = item.getBoundingClientRect();
            const collision = !(lRect.right < iRect.left || lRect.left > iRect.right || lRect.bottom < iRect.top || lRect.top > iRect.bottom);
            const page = window.pdfEngineState.pages.find(p => p.id === item.dataset.id);
            
            if (collision) {
                if (!page.selected) {
                    item.classList.add('border-[#D4A373]', 'ring-4', 'ring-[#D4A373]/50', 'scale-[1.02]');
                    page.selected = true;
                }
            } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                if (page.selected) {
                    item.classList.remove('border-[#D4A373]', 'ring-4', 'ring-[#D4A373]/50', 'scale-[1.02]');
                    page.selected = false;
                }
            }
        });
        updateSelectionCount();
    });

    window.addEventListener('mouseup', () => {
        if (isDrawing) {
            isDrawing = false;
            clearInterval(scrollInterval); 
            if (lasso) lasso.remove();
            lasso = null;
            
            renderPdfWorkspace();
            
            setTimeout(() => {
                hasDragged = false;
            }, 50);
        }
    });
}

let currentPreviewZoom = 1;

window.openPdfPreview = function(startPageId) {
    const modal = document.getElementById('pdf-preview-modal');
    const container = document.getElementById('pdf-preview-container');
    if(!modal || !container) return;

    container.innerHTML = ''; 
    currentPreviewZoom = 1; 

    window.pdfEngineState.pages.forEach((page, index) => {
        const pageEl = document.createElement('div');
        pageEl.id = `preview-${page.id}`;
        pageEl.className = "preview-page-wrapper flex flex-col items-center justify-center shrink-0 mb-12";
        
        pageEl.innerHTML = `
            <div class="text-white/50 text-sm font-mono mb-2">Page ${index + 1} (${page.fileName})</div>
            <img src="${page.thumbUrl}" class="preview-img transition-all duration-200 shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 bg-white" 
                 style="width: 80vw; max-width: 800px; transform: rotate(${page.rotation}deg);">
        `;
        container.appendChild(pageEl);
    });
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    setTimeout(() => {
        const targetEl = document.getElementById(`preview-${startPageId}`);
        if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
};

// Zooms in or out of the image currently displayed in the PDF fullscreen preview.
window.zoomPreview = function(delta) {
    const images = document.querySelectorAll('.preview-img');
    if(images.length === 0) return;

    currentPreviewZoom += delta;
    if (currentPreviewZoom < 0.3) currentPreviewZoom = 0.3; 
    if (currentPreviewZoom > 4) currentPreviewZoom = 4; 

    images.forEach(img => {
        img.style.width = `${80 * currentPreviewZoom}vw`;
        img.style.maxWidth = `${800 * currentPreviewZoom}px`;
    });
};

window.closePdfPreview = function() {
    const modal = document.getElementById('pdf-preview-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

// Rotates a single, specific PDF page by a given angle.
window.rotatePdfPage = function(pageId, angle) {
    const page = window.pdfEngineState.pages.find(p => p.id === pageId);
    if (page) { 
        page.rotation = (page.rotation + angle) % 360; 
        const itemNode = document.querySelector(`.pdf-page-item[data-id="${pageId}"]`);
        if (itemNode) {
            const img = itemNode.querySelector('img');
            if (img) img.style.transform = `rotate(${page.rotation}deg)`;
        }
    }
};

window.deletePdfPage = function(pageId) {
    window.pdfEngineState.pages = window.pdfEngineState.pages.filter(p => p.id !== pageId);
    renderPdfWorkspace();
};

async function getWatermarkImage(pdfDoc, text) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; 
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    
    ctx.translate(600, 600);
    ctx.rotate(-45 * Math.PI / 180); 
    ctx.font = 'bold 100px Arial, sans-serif'; 
    ctx.fillStyle = 'rgba(150, 150, 150, 0.3)'; 
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.toUpperCase(), 0, 0);
    
    const dataUrl = canvas.toDataURL('image/png');
    return await pdfDoc.embedPng(dataUrl);
}

// Compiles the selected workspace pages back into a single binary PDF stream.
async function generatePdfBytes(pagesToExport) {
    if (typeof window.PDFLib === 'undefined') return null;
    if(typeof showToast === 'function') showToast(`Rendering ${pagesToExport.length} pages...`);

    const { PDFDocument, StandardFonts, rgb, degrees } = window.PDFLib;
    const mergedPdf = await PDFDocument.create();
    const loadedFilesCache = {};
    const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
    
    const addPagination = document.getElementById('pdf-opt-pagination')?.checked || false;
    const watermarkText = document.getElementById('pdf-opt-watermark')?.value || '';

    try {
        for (let pageData of pagesToExport) {
            let copiedPage;

            if (pageData.isImage) {
                const base64Data = pageData.thumbUrl.split(',')[1];
                const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                
                let image;
                if (pageData.thumbUrl.startsWith('data:image/png')) {
                    image = await mergedPdf.embedPng(imageBytes);
                } else {
                    image = await mergedPdf.embedJpg(imageBytes);
                }
                
                if (image) {
                    const isLandscape = Math.abs(pageData.rotation) === 90 || Math.abs(pageData.rotation) === 270;
                    const pageWidth = isLandscape ? image.height : image.width;
                    const pageHeight = isLandscape ? image.width : image.height;
                    
                    copiedPage = mergedPdf.addPage([pageWidth, pageHeight]);
                    
                    copiedPage.drawImage(image, {
                        x: 0, 
                        y: 0,
                        width: image.width, 
                        height: image.height
                    });
                    
                    copiedPage.setRotation(degrees(pageData.rotation));
                }
            } else {
                const fileObj = window.pdfEngineState.files.find(f => f.id === pageData.fileId);
                if (!fileObj) continue;

                if (!loadedFilesCache[fileObj.id]) {
                    loadedFilesCache[fileObj.id] = await PDFDocument.load(fileObj.buffer);
                }
                const sourceDoc = loadedFilesCache[fileObj.id];

                const [p] = await mergedPdf.copyPages(sourceDoc, [pageData.originalIndex]);
                copiedPage = p;
                
                let currentRotation = copiedPage.getRotation().angle;
                copiedPage.setRotation(degrees(currentRotation + pageData.rotation));

                mergedPdf.addPage(copiedPage);
            }
        }

        let watermarkImg = null;
        if (watermarkText.trim() !== '') {
            watermarkImg = await getWatermarkImage(mergedPdf, watermarkText);
        }

        const allPages = mergedPdf.getPages();
        allPages.forEach((page, idx) => {
            const { width, height } = page.getSize();
            
            if (watermarkImg) {
                page.drawImage(watermarkImg, {
                    x: (width / 2) - 600,
                    y: (height / 2) - 600,
                    width: 1200,
                    height: 1200
                });
            }

            if (addPagination) {
                const text = `Page ${idx + 1} of ${allPages.length}`;
                const textWidth = font.widthOfTextAtSize(text, 10);
                page.drawText(text, {
                    x: (width / 2) - (textWidth / 2),
                    y: 20,
                    size: 10,
                    font: font,
                    color: rgb(0, 0, 0),
                });
            }
        });

        return await mergedPdf.save();
    } catch(e) {
        console.error("PDF-Lib generation error:", e);
        return null;
    }
}

// Merges all loaded workspace pages into a single PDF file and triggers an automatic download.
window.mergeAllPdfs = async function() {
    if (window.pdfEngineState.pages.length === 0) return alert("No pages available.");
    const bytes = await generatePdfBytes(window.pdfEngineState.pages);
    if (bytes) {
        const blob = new Blob([bytes], { type: "application/pdf" });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
        link.download = `Magi_Document.pdf`; link.click();
    }
};

// Merges only the currently selected pages into a new PDF file and triggers a download.
window.mergeSelectedPdfs = async function() {
    const selectedPages = window.pdfEngineState.pages.filter(p => p.selected);
    if (selectedPages.length === 0) return alert("Select pages first.");
    const bytes = await generatePdfBytes(selectedPages);
    if (bytes) {
        const blob = new Blob([bytes], { type: "application/pdf" });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
        link.download = `Magi_Selected.pdf`; link.click();
    }
};

// Exports individual PDF pages into a compressed ZIP file.
window.splitPdfToZip = async function(onlySelected = false) {
    if (typeof window.JSZip === 'undefined') return;
    const pages = onlySelected ? window.pdfEngineState.pages.filter(p => p.selected) : window.pdfEngineState.pages;
    if (pages.length === 0) return alert(onlySelected ? "No pages selected." : "No pages available.");

    try {
        const zip = new window.JSZip();
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const bytes = await generatePdfBytes([page]); 
            if (bytes) {
                const pageNumStr = String(i + 1).padStart(3, '0'); 
                const cleanName = page.fileName.replace(/\.[^/.]+$/, ""); 
                zip.file(`${pageNumStr}_${cleanName}.pdf`, bytes);
            }
        }
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a'); link.href = URL.createObjectURL(content);
        link.download = `Magi_Split_PDFs.zip`; link.click();
    } catch(e) { console.error(e); }
};

window.splitPdfToZipPng = async function(onlySelected = false) {
    if (typeof window.JSZip === 'undefined') return;
    const pages = onlySelected ? window.pdfEngineState.pages.filter(p => p.selected) : window.pdfEngineState.pages;
    if (pages.length === 0) return alert(onlySelected ? "No pages selected." : "No pages available.");

    try {
        const zip = new window.JSZip();
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const base64Data = page.thumbUrl.split(',')[1];
            const pageNumStr = String(i + 1).padStart(3, '0'); 
            const cleanName = page.fileName.replace(/\.[^/.]+$/, ""); 
            zip.file(`${pageNumStr}_${cleanName}.png`, base64Data, {base64: true});
        }
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a'); link.href = URL.createObjectURL(content);
        link.download = `Magi_Split_Images.zip`; link.click();
    } catch(e) { console.error(e); }
};

// Initializes the workspace layout and tools for generating and editing QR codes.
function initQrMode(container, sidebarContentEl) {
    document.body.classList.add('qr-mode-active');
    
    if (!document.getElementById('qr-mode-styles')) {
        const style = document.createElement('style');
        style.id = 'qr-mode-styles';
        style.innerHTML = `
            .pdf-btn-group {
                display: flex; flex-direction: column;
                border: 1px solid rgba(212, 163, 115, 0.4);
                border-radius: 8px; overflow: hidden; background: #FDFBF7;
                margin-bottom: 8px;
                width: 100%;
            }
            .pdf-side-btn {
                width: 100%; padding: 10px 12px; 
                font-size: 12px !important; 
                font-weight: 800; text-transform: uppercase;
                display: flex; align-items: center; gap: 10px; color: #3E2723;
                transition: all 0.1s ease; text-align: left;
                background: #FDFBF7; border: none; cursor: pointer;
            }
            .pdf-side-btn:not(:last-child) { border-bottom: 1px solid rgba(212, 163, 115, 0.2); }
            
            .pdf-side-btn i { 
                font-size: 12px !important; 
                width: 16px; text-align: center; color: #D4A373; 
            }
            
            .pdf-side-btn:hover { background-color: #F5E6D3; }
            .pdf-side-btn:active { background-color: #E8D8C8; transform: scale(0.98); }
            
            body.qr-mode-active #docstral-top-bars, 
            body.qr-mode-active #docstral-top-bar-1, 
            body.qr-mode-active #docstral-top-bar-2 { display: none !important; }

            .qr-label-12 { 
                font-size: 12px !important; 
                font-weight: 900; 
                color: #D4A373; 
                text-transform: uppercase; 
                display: block; 
                margin-bottom: 4px;
            }

            details > summary::-webkit-details-marker {
                display: none !important;
            }
            details > summary {
                list-style: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    sidebarContentEl.innerHTML = `
        <div class="flex flex-col h-full bg-[#FDFBF7] p-3 gap-3 overflow-y-auto custom-scrollbar">
            
            <textarea id="qr-input-text" class="w-full h-24 p-2.5 border border-[#D4A373]/40 rounded-lg bg-white text-[#3E2723] text-[12px] outline-none focus:border-[#D4A373] transition-all resize-none shadow-inner" placeholder="Enter text or URL..."></textarea>

            <div class="flex flex-row gap-2 w-full">
                <button onclick="updateQRCode()" class="flex-1 pdf-side-btn !border !border-[#D4A373]/40 !rounded-lg justify-center hover:bg-[#F5E6D3]">
                    <i class="fa-solid fa-qrcode"></i> Generate
                </button>
                <button onclick="resetQrWorkspace()" class="flex-1 pdf-side-btn !border !border-red-300 !rounded-lg !text-red-500 justify-center hover:!bg-red-50">
                    <i class="fa-solid fa-trash-can"></i> Reset
                </button>
            </div>

            <div class="space-y-3 px-1">
                <div>
                    <div class="flex justify-between items-center mb-1">
                        <span class="qr-label-12">Size:</span>
                        <span id="qr-size-display" class="text-[12px] font-bold text-[#3E2723]">400px</span>
                    </div>
                    <input type="range" id="qr-size-slider" min="100" max="1000" value="400" step="10" class="w-full accent-[#D4A373] h-1.5 cursor-pointer">
                </div>

                <div>
                    <label class="qr-label-12">Dot style:</label>
                    <select id="qr-dots-type" class="w-full p-1.5 border border-[#D4A373]/40 rounded-md bg-white text-[12px] font-bold text-[#3E2723] outline-none">
                        <option value="square">Square style</option>
                        <option value="dots">Dot style</option>
                        <option value="rounded">Rounded style</option>
                        <option value="extra-rounded">Strongly rounded</option>
                        <option value="classy">Elegant style</option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-2 px-1">
                <div>
                    <label class="qr-label-12">Code</label>
                    <input type="color" id="qr-color-dark" value="#3E2723" class="w-full h-8 border border-[#D4A373]/30 rounded cursor-pointer bg-white p-0.5">
                </div>
                <div>
                    <label class="qr-label-12">Background</label>
                    <input type="color" id="qr-color-light" value="#ffffff" class="w-full h-8 border border-[#D4A373]/30 rounded cursor-pointer bg-white p-0.5">
                </div>
            </div>

            <div class="w-full">
                <input type="file" id="qr-logo-upload" accept="image/*" class="hidden">
                <button onclick="document.getElementById('qr-logo-upload').click()" class="w-full pdf-side-btn !border !border-[#D4A373]/40 !rounded-lg hover:bg-[#F5E6D3] justify-start">
                    <i class="fa-solid fa-image"></i> Select logo
                </button>
            </div>

            <details class="relative w-full group" id="export-details">
                <summary class="w-full pdf-side-btn !border-solid !border !border-[#D4A373] !rounded-lg flex justify-between items-center hover:bg-[#F5E6D3] cursor-pointer list-none" style="list-style: none; outline: none;">
                    <span><i class="fa-solid fa-download mr-2"></i> Export Options</span>
                    <i class="fa-solid fa-chevron-down text-[10px] transition-transform duration-200 group-open:rotate-180"></i>
                </summary>
                
                <div class="absolute top-full left-0 w-full mt-2 bg-[#FDFBF7] border border-[#D4A373]/40 rounded-lg shadow-lg z-50 flex flex-col overflow-hidden">
                    <button onclick="downloadQR('png'); document.getElementById('export-details').removeAttribute('open')" class="w-full pdf-side-btn !border-0 !border-b !border-[#D4A373]/20 !rounded-none hover:!bg-[#F5E6D3] transition-colors justify-start">
                        <i class="fa-solid fa-image w-4 text-center mr-2 text-[#D4A373]"></i> Export PNG
                    </button>
                    <button onclick="downloadQR('png', true); document.getElementById('export-details').removeAttribute('open')" class="w-full pdf-side-btn !border-0 !border-b !border-[#D4A373]/20 !rounded-none hover:!bg-[#F5E6D3] transition-colors justify-start">
                        <i class="fa-regular fa-image w-4 text-center mr-2 text-[#D4A373]"></i> Export Transparent PNG
                    </button>
                    <button onclick="downloadQR('svg'); document.getElementById('export-details').removeAttribute('open')" class="w-full pdf-side-btn !border-0 !border-b !border-[#D4A373]/20 !rounded-none hover:!bg-[#F5E6D3] transition-colors justify-start">
                        <i class="fa-solid fa-circle-nodes w-4 text-center mr-2 text-[#D4A373]"></i> Export SVG Vector
                    </button>
                    <button onclick="downloadQR('jpeg'); document.getElementById('export-details').removeAttribute('open')" class="w-full pdf-side-btn !border-0 !rounded-none hover:!bg-[#F5E6D3] transition-colors justify-start">
                        <i class="fa-solid fa-file-image w-4 text-center mr-2 text-[#D4A373]"></i> Export JPG
                    </button>
                </div>
            </details>
            
            <div class="h-4 w-full"></div>
        </div>
    `;

    container.innerHTML = `
        <div id="qr-workspace" class="w-full h-full flex flex-col items-center justify-center relative overflow-auto p-10 custom-scrollbar">
    
            <div id="qr-result-container" class="bg-white p-8 rounded-[40px] shadow-2xl border-[6px] border-white transition-all duration-700 scale-90 opacity-0 transform translate-y-10 hidden">
                <div id="qr-code-output"></div>
            </div>

            <div id="qr-empty-state" class="flex flex-col items-center transition-colors">
                <div class="qr-icon-circle w-20 h-20 mb-4 rounded-full border-2 border-dashed flex items-center justify-center transition-colors">
                    <i class="fa-solid fa-qrcode text-4xl"></i>
                </div>
                <div class="text-[12px] font-black uppercase tracking-widest"></div>
            </div>

        </div>
    `;

    document.getElementById('qr-size-slider').addEventListener('input', (e) => {
        document.getElementById('qr-size-display').innerText = e.target.value + 'px';
        if (window.qrStylingInstance) window.updateQRCode();
    });

    document.addEventListener('click', function(event) {
        const detailsMenu = document.getElementById('export-details');
        if (detailsMenu && detailsMenu.hasAttribute('open')) {
            if (!detailsMenu.contains(event.target)) {
                detailsMenu.removeAttribute('open');
            }
        }
    });

    const logoUploadInput = document.getElementById('qr-logo-upload');
    if (logoUploadInput) {
        logoUploadInput.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    currentLogoData = e.target.result;
                    
                    const uploadBtn = logoUploadInput.nextElementSibling;
                    if (uploadBtn) {
                        uploadBtn.innerHTML = '<i class="fa-solid fa-check text-green-600"></i> The logo is ready';
                    }

                    if (document.getElementById('qr-input-text').value.trim() !== "") {
                        window.updateQRCode();
                    } else if (typeof showToast === 'function') {
                        showToast("Logo uploaded! Now enter text.");
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }
}


let qrStylingInstance = null; 
let currentLogoData = null;

// Re-generates the QR code graphic based on the user's input parameters and settings.
window.updateQRCode = function() {
    const textInput = document.getElementById('qr-input-text');
    const text = textInput.value.trim();
    const sizeInput = document.getElementById('qr-size-slider');
    const size = parseInt(sizeInput.value) || 400;
    
    if (!text) {
        if(typeof showToast === 'function') showToast("Please enter data!");
        else alert("Please enter data!");
        return;
    }

    const utf8Text = unescape(encodeURIComponent(text));
    const dotsType = document.getElementById('qr-dots-type').value;
    const colorDark = document.getElementById('qr-color-dark').value;
    const colorLight = document.getElementById('qr-color-light').value;
    const outputContainer = document.getElementById("qr-code-output");

    const hdRenderSize = size * 2; 

    const options = {
        width: hdRenderSize,
        height: hdRenderSize,
        type: "canvas", 
        data: utf8Text,
        image: currentLogoData,
        dotsOptions: { color: colorDark, type: dotsType },
        backgroundOptions: { color: colorLight },
        imageOptions: { crossOrigin: "anonymous", margin: 20, imageSize: 0.4 },
        cornersSquareOptions: { type: dotsType === 'square' ? 'square' : 'extra-rounded', color: colorDark },
        cornersDotOptions: { type: dotsType === 'square' ? 'square' : 'dot', color: colorDark },
        qrOptions: { typeNumber: 0, mode: 'Byte', errorCorrectionLevel: "H" }
    };

    outputContainer.innerHTML = ""; 
    qrStylingInstance = new QRCodeStyling(options);
    qrStylingInstance.append(outputContainer);

    const renderedCanvas = outputContainer.querySelector("canvas");
    if (renderedCanvas) {
        renderedCanvas.style.width = size + "px";
        renderedCanvas.style.height = size + "px";
        renderedCanvas.style.display = 'block';
    }

    document.getElementById('qr-empty-state').classList.add('hidden');
    const res = document.getElementById('qr-result-container');
    res.classList.remove('hidden');
    setTimeout(() => {
        res.classList.remove('opacity-0', 'translate-y-10', 'scale-90');
        res.classList.add('opacity-100', 'translate-y-0', 'scale-100');
    }, 50);
};

// Downloads the generated QR code in a specified graphical format (like PNG or SVG).
window.downloadQR = function(format, transparent = false) {
    const outputContainer = document.getElementById("qr-code-output");
    if (!outputContainer || outputContainer.innerHTML === "") {
        alert("Generate code first!");
        return;
    }
    
    const sizeInput = document.getElementById('qr-size-slider');
    const originalRequestedSize = parseInt(sizeInput.value) || 400;
    const fileName = "magi-qr-" + Date.now();
    const textInput = document.getElementById('qr-input-text');
    const utf8Text = unescape(encodeURIComponent(textInput.value.trim()));
    const dotsType = document.getElementById('qr-dots-type').value;
    const colorDark = document.getElementById('qr-color-dark').value;
    const colorLight = (transparent && format === 'png') ? 'transparent' : document.getElementById('qr-color-light').value;

    const downloadOptions = {
        width: originalRequestedSize,
        height: originalRequestedSize,
        type: format === 'svg' ? 'svg' : 'canvas',
        data: utf8Text,
        image: currentLogoData,
        dotsOptions: { color: colorDark, type: dotsType },
        backgroundOptions: { color: colorLight },
        imageOptions: { crossOrigin: "anonymous", margin: 10, imageSize: 0.4 },
        cornersSquareOptions: { type: dotsType === 'square' ? 'square' : 'extra-rounded', color: colorDark },
        cornersDotOptions: { type: dotsType === 'square' ? 'square' : 'dot', color: colorDark },
        qrOptions: { mode: 'Byte', errorCorrectionLevel: "H" }
    };

    const tempDownloadInstance = new QRCodeStyling(downloadOptions);
    
    setTimeout(() => {
        tempDownloadInstance.download({ name: fileName, extension: format });
    }, 100);
};

// Clears the current QR code generation workspace and resets parameters.
window.resetQrWorkspace = function() {
    const output = document.getElementById('qr-code-output');
    if (output) output.innerHTML = "";
    qrStylingInstance = null;
    currentLogoData = null;
    
    document.getElementById('qr-input-text').value = "";
    document.getElementById('qr-logo-upload').value = "";
    document.getElementById('qr-size-slider').value = 400;
    document.getElementById('qr-size-display').innerText = "400px";
    
    const uploadBtn = document.querySelector('button[onclick*="qr-logo-upload"]');
    if (uploadBtn) uploadBtn.innerHTML = '<i class="fa-solid fa-image"></i> Select logo';
    
    document.getElementById('qr-empty-state').classList.remove('hidden');
    const res = document.getElementById('qr-result-container');
    res.classList.add('opacity-0', 'translate-y-10', 'scale-90');
    setTimeout(() => res.classList.add('hidden'), 500);
};

window.toggleDocstralAddressBar = async function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const dropdown = document.getElementById('docstral-docs-dropdown');
    if (!dropdown) return;

    if (typeof window.closeDocstralMenus === 'function') window.closeDocstralMenus();

    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
        await window.refreshAddressBar();
        dropdown.classList.remove('hidden');
        dropdown.style.display = 'block'; 
    } else {
        dropdown.classList.add('hidden');
        dropdown.style.display = 'none';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const addressBarBtn = document.getElementById('docstral-address-bar');
    if (addressBarBtn) {
        const newBtn = addressBarBtn.cloneNode(true);
        addressBarBtn.parentNode.replaceChild(newBtn, addressBarBtn);
        
        newBtn.addEventListener('click', window.toggleDocstralAddressBar);
    }
});

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('docstral-docs-dropdown');
    if (dropdown && !dropdown.classList.contains('hidden') && !e.target.closest('#docstral-docs-dropdown') && !e.target.closest('#docstral-address-bar')) {
        dropdown.classList.add('hidden');
        dropdown.style.display = 'none';
    }
});

// Loads a specific document file from the server into the Docstral editor.
window.loadServerFile = async function(filename) {
    if (typeof DocstralSync !== 'undefined' && typeof DocstralSync.cancelSync === 'function') {
        DocstralSync.cancelSync();
    }

    const container = document.getElementById('docstral-pages-container');
    if (container) {
        container.innerHTML = '<div class="w-full flex justify-center py-20 text-[#D4A373]"><i class="fa-solid fa-circle-notch fa-spin text-2xl"></i></div>';
    }

    if (typeof showToast === 'function') showToast(`Loading document...`);
    
    try {
        const res = await fetch(`/api/fs/load_file?mode=page&filename=${filename}`);
        if (!res.ok) throw new Error("The file couldn't be loaded.");
        
        const responseJSON = await res.json();
        const docContent = responseJSON.data || responseJSON;
        
        if (typeof DocstralMeta !== 'undefined') {
            const meta = docContent.metadata || {}; 
            DocstralMeta.setFromJSON(meta, filename); 
        }

        const workspace = document.getElementById('docstral-workspace');
        if (workspace) {
            workspace.style.overflowY = 'auto';
            workspace.style.display = 'block';
        }

        let allBlocks = [];
        
        if (docContent.blocks && docContent.blocks.length > 0) {
            allBlocks = docContent.blocks;
        } 
        else if (docContent.pages && docContent.pages.length > 0) {
            allBlocks = docContent.pages.flatMap(p => p.blocks || []);
        }

        if (allBlocks.length === 0) {
            allBlocks = [{ id: "b-init", type: "paragraph", content: "<br>", layer: "base" }];
        }

        if (typeof DocstralSync !== 'undefined') {
            DocstralSync.renderDocument(allBlocks, null);
            
            if (typeof DocstralHistory !== 'undefined') {
                DocstralHistory.clear();
                DocstralHistory.saveState(allBlocks, null);
            }
        }

        if (typeof DocstralLayerManager !== 'undefined') {
            if (docContent.visible_layers && Array.isArray(docContent.visible_layers)) {
                DocstralLayerManager.visibleLayers = new Set(docContent.visible_layers);
            } else {
                DocstralLayerManager.init(); 
            }
            
            setTimeout(() => {
                DocstralLayerManager.applyVisibility();
                if (document.getElementById('master-layer-chk')) {
                    DocstralLayerManager.renderSidebarUI();
                }
            }, 100);
        }

        if (typeof window.closeDocstralSidebar === 'function') window.closeDocstralSidebar();
        
        const dropdown = document.getElementById('docstral-docs-dropdown');
        if (dropdown) dropdown.style.display = 'none';

        if (typeof window.updateExportState === 'function') window.updateExportState();

    } catch (err) {
        alert("File openning error: " + err);
        console.error(err);
        if (container) container.innerHTML = ''; 
    }
};

window.loadDocumentByFilename = async function(filename) {
    window.loadServerFile(filename);
};

// Cycles backwards or forwards through the available document files in the server directory.
window.navigateFiles = async function(direction) {
    if (typeof DocstralSync !== 'undefined' && typeof DocstralSync.cancelSync === 'function') {
        DocstralSync.cancelSync();
    }

    let files = window.currentModeFiles || [];
    
    if (files.length === 0) {
        const docWindow = document.getElementById('docstral-window');
        const mode = docWindow ? docWindow.getAttribute('data-mode') || 'page' : 'page';
        try {
            const res = await fetch(`/api/fs/list_by_mode?mode=${mode}`);
            const data = await res.json();
            
            files = data.files || [];
            window.currentModeFiles = files; 
        } catch (err) {
            console.error("Error downloading file list:", err);
            return;
        }
    }

    if (files.length === 0) return;

    let currentSystemName = null;
    if (typeof DocstralMeta !== 'undefined' && DocstralMeta.data.currentFilename) {
        currentSystemName = DocstralMeta.data.currentFilename;
    }

    let currentIndex = files.indexOf(currentSystemName);
    let targetIndex = 0;

    if (currentIndex !== -1) {
        if (direction === 'next') {
            targetIndex = currentIndex + 1;
            if (targetIndex >= files.length) targetIndex = 0; 
        } else if (direction === 'prev') {
            targetIndex = currentIndex - 1;
            if (targetIndex < 0) targetIndex = files.length - 1; 
        }
    }

    const targetFilename = files[targetIndex];

    if (targetFilename === currentSystemName) return;

    if (typeof window.loadServerFile === 'function') {
        window.loadServerFile(targetFilename);
    }
};

function getOrCreateGlobalDropdown() {
    let dropdown = document.getElementById('docstral-global-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'docstral-global-dropdown';
        dropdown.style.cssText = 'display: none; position: fixed; background: #fff; border: 1px solid #D4A373; box-shadow: 0 15px 50px rgba(0,0,0,0.4); z-index: 2147483647; border-radius: 6px; padding: 4px; width: 250px; max-height: 250px; overflow-y: auto; color: #3E2723; font-family: monospace; font-size: 12px;';
        document.body.appendChild(dropdown);
    }
    return dropdown;
}

window.refreshAddressBar = async function() {
    const docWindow = document.getElementById('docstral-window');
    const mode = docWindow ? docWindow.getAttribute('data-mode') || 'page' : 'page';
    const dropdown = document.getElementById('docstral-docs-dropdown');
    const addressBarText = document.getElementById('current-doc-name');

    try {
        const res = await fetch(`/api/fs/list_by_mode?mode=${mode}`);
        const data = await res.json();
        
        window.currentModeFiles = data.files || [];

        if (dropdown) {
            dropdown.innerHTML = '';
            dropdown.style.setProperty('z-index', '999999', 'important');
            dropdown.style.setProperty('position', 'absolute', 'important');
            
            if (window.currentModeFiles.length === 0) {
                dropdown.innerHTML = '<div class="p-2 text-xs opacity-50 text-center">No files found</div>';
            } else {
                window.currentModeFiles.forEach((filename) => {
                    const cleanName = filename.replace(/\.jdoc\.json$|\.json$|\.jdoc$/i, '').replace(/_/g, ' ');
                    
                    const item = document.createElement('div');
                    item.style.cssText = 'padding: 6px 10px; border-bottom: 1px solid rgba(212,163,115,0.1); display: flex; justify-content: space-between; align-items: center; font-weight: 600; color: #3E2723; transition: background 0.2s;';
                    
                    item.innerHTML = `
                        <div class="file-load-trigger cursor-pointer" style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;" title="Open document">
                            <i class="fa-regular fa-file-code" style="color:#D4A373; font-size: 14px; flex-shrink: 0;"></i> 
                            <span style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cleanName}</span>
                        </div>
                        <div class="pl-file-actions">
                            <button class="pl-action-btn pl-rename-btn" title="Rename">
                                <i class="fa-solid fa-pen" style="font-size: 13px;"></i>
                            </button>
                            <button class="pl-action-btn pl-delete-btn" title="Delete">
                                <i class="fa-solid fa-xmark" style="font-size: 15px;"></i>
                            </button>
                        </div>
                    `;
                    
                    const loadTrigger = item.querySelector('.file-load-trigger');
                    const renameBtn = item.querySelector('.pl-rename-btn');
                    const deleteBtn = item.querySelector('.pl-delete-btn');

                    item.onmouseover = () => { item.style.background = 'rgba(212,163,115,0.15)'; };
                    item.onmouseout = () => { item.style.background = 'transparent'; };
                    item.style.cursor = 'pointer';                
                    item.onclick = (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        
                        dropdown.style.display = 'none';
                        dropdown.classList.add('hidden');
                        
                        if (addressBarText) addressBarText.innerText = cleanName;
                        
                        window.loadServerFile(filename); 
                    };

                    renameBtn.onclick = async (ev) => {
                        ev.preventDefault(); ev.stopPropagation(); 
                        
                        let newName = prompt("Enter new name for the file:", cleanName);
                        if (!newName || newName.trim() === "" || newName.trim() === cleanName) return;
                        
                        try {
                            const renameRes = await fetch('/api/fs/rename', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ old_name: filename, new_name: newName.trim(), mode: 'page' })
                            });
                            
                            const result = await renameRes.json();
                            if (result.status === 'success') {
                                if(typeof showToast === 'function') showToast("The file is renamed!");
                                
                                if (addressBarText && addressBarText.innerText === cleanName) {
                                    const finalDisplayName = result.display_name || newName.trim();
                                    addressBarText.innerText = finalDisplayName;
                                    
                                    if (typeof DocstralMeta !== 'undefined') {
                                        DocstralMeta.data.name = finalDisplayName;
                                        DocstralMeta.data.currentFilename = result.new_name; 
                                    }
                                }
                                window.refreshAddressBar();
                            } else {
                                alert("Error: " + result.message);
                            }
                        } catch (err) {
                            alert("Server connection error.");
                        }
                    };

                    deleteBtn.onclick = async (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        
                        if (!confirm(`Are you sure you want to delete the document "${cleanName}" pernamently?`)) return;

                        try {
                            const delRes = await fetch('/api/fs/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filename: filename, mode: 'page' })
                            });
                            
                            const result = await delRes.json();
                            if (result.status === 'success') {
                                dropdown.style.display = 'none';
                                if(typeof showToast === 'function') showToast("The file is deleted!");
                                
                                window.refreshAddressBar();
                                
                                if (addressBarText && addressBarText.innerText === cleanName) {
                                    addressBarText.innerText = "Select document...";
                                    document.getElementById('docstral-pages-container').innerHTML = '';
                                    if (typeof showDocstralWelcomeScreen === 'function') {
                                        showDocstralWelcomeScreen(document.getElementById('docstral-pages-container'));
                                    }
                                }
                            } else {
                                alert("Delete error: " + result.message);
                            }
                        } catch (err) {
                            alert("Server connection error.");
                        }
                    };

                    dropdown.appendChild(item);
                });
            }
        }

        const recentListContainer = document.getElementById('sidebar-recent-list');
        if (recentListContainer) {
            if (window.currentModeFiles.length === 0) {
                recentListContainer.innerHTML = '<div class="text-[10px] italic text-[#8D6E63]/40 p-2 text-center">No recent documents found</div>';
            } else {
                recentListContainer.innerHTML = window.currentModeFiles.slice(0, 5).map(filename => {
                    const cleanName = filename.replace(/\.jdoc\.json$|\.json$|\.jdoc$/i, '').replace(/_/g, ' ');
                    return `
                        <div onclick="window.loadServerFile('${filename}')" class="group flex items-center gap-2 p-2 hover:bg-[#D4A373]/10 rounded cursor-pointer transition-colors border-b border-[#D4A373]/5">
                            <i class="fa-regular fa-file-lines text-[#D4A373]"></i>
                            <span class="text-[12px] font-bold text-[#3E2723] truncate" title="${filename}">${cleanName}</span>
                        </div>
                    `;
                }).join('');
            }
        }

        if (addressBarText) {
            let currentName = typeof activeDocId !== 'undefined' ? virtualFileSystem.find(d => d.id === activeDocId)?.name : "";
            
            if (!currentName && addressBarText.innerText !== "Select document...") {
                currentName = addressBarText.innerText;
            }
            
            if (currentName) {
                currentName = currentName.replace(/\.jdoc\.json$|\.json$|\.jdoc$/i, '').replace(/_/g, ' ');
            }
            
            addressBarText.innerText = currentName || "Select document...";
        }

    } catch (err) {
        console.error("Address bar refresh error:", err);
    }
};

document.addEventListener('click', async (e) => {
    const addressBarBtn = e.target.closest('#docstral-address-bar');
    const dropdownClick = e.target.closest('#docstral-global-dropdown');
    const dropdown = getOrCreateGlobalDropdown();

    if (addressBarBtn) {
        e.preventDefault();
        e.stopPropagation();

        if (dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
            return;
        }

        const rect = addressBarBtn.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.width = `${rect.width}px`;
        
        dropdown.style.display = 'block';
        dropdown.innerHTML = '<div style="padding: 10px; text-align: center; color: #D4A373; font-weight: bold;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>';

        const docWindow = document.getElementById('docstral-window');
        const mode = docWindow ? docWindow.getAttribute('data-mode') || 'page' : 'page';

        try {
            const res = await fetch(`/api/fs/list_by_mode?mode=${mode}`);
            const data = await res.json();
            
            window.currentModeFiles = data.files || [];

            dropdown.innerHTML = '';
            if (window.currentModeFiles.length === 0) {
                dropdown.innerHTML = '<div style="padding: 10px; text-align: center; opacity: 0.6; font-weight: bold; font-size: 14px;">No files</div>';
            } else {
                window.currentModeFiles.forEach(filename => {
                    const cleanName = filename.replace(/\.jdoc\.json$|\.json$|\.jdoc$/i, '').replace(/_/g, ' ');

                    const item = document.createElement('div');
                    item.style.cssText = 'padding: 8px 10px; cursor: pointer; border-bottom: 1px solid rgba(212,163,115,0.15); transition: background 0.2s; display: flex; justify-content: space-between; align-items: center; font-weight: 600; color: #3E2723;';
                    
                    item.innerHTML = `
                        <div class="load-file-area" style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;" title="Open: ${cleanName}">
                            <i class="fa-regular fa-file-code" style="color:#D4A373; font-size: 14px; flex-shrink: 0;"></i> 
                            <span style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cleanName}</span>
                        </div>
                        <div style="display: flex; gap: 2px; flex-shrink: 0;">
                            <button class="pl-rename-btn" style="background: none; border: none; color: #D4A373; cursor: pointer; padding: 4px 6px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;" title="Rename">
                                <i class="fa-solid fa-pen" style="font-size: 14px;"></i>
                            </button>
                            <button class="pl-delete-btn" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px 6px; display: flex; align-items: center; justify-content: center; transition: color 0.2s; opacity: 0.7;" title="Delete">
                                <i class="fa-solid fa-xmark" style="font-size: 16px;"></i>
                            </button>
                        </div>
                    `;
                    
                    const loadArea = item.querySelector('.load-file-area');
                    const renameBtn = item.querySelector('.pl-rename-btn');
                    const deleteBtn = item.querySelector('.pl-delete-btn');

                    item.onmouseover = () => {
                        item.style.background = 'rgba(212,163,115,0.2)';
                        renameBtn.style.color = '#3E2723';
                        deleteBtn.style.opacity = '1';
                    };
                    item.onmouseout = () => {
                        item.style.background = 'transparent';
                        renameBtn.style.color = '#D4A373';
                        deleteBtn.style.opacity = '0.7';
                    };
                    
                    renameBtn.onclick = async (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation(); 
                        
                        let newCleanName = prompt("Enter new file name:", cleanName);
                        if (!newCleanName || newCleanName.trim() === "" || newCleanName.trim() === cleanName) return;
                        
                        try {
                            const renameRes = await fetch('/api/fs/rename', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ old_name: filename, new_name: newCleanName.trim(), mode: 'page' })
                            });
                            
                            const result = await renameRes.json();
                            if (result.status === 'success') {
                                const titleSpan = document.getElementById('current-doc-name');
                                if (titleSpan && titleSpan.innerText === cleanName) {
                                    const finalDisplayName = result.display_name || newCleanName.trim();
                                    titleSpan.innerText = finalDisplayName;
                                    
                                    if (typeof DocstralMeta !== 'undefined') {
                                        DocstralMeta.data.name = finalDisplayName;
                                        DocstralMeta.data.currentFilename = result.new_name; 
                                    }
                                }
                                
                                dropdown.style.display = 'none';
                                if(typeof showToast === 'function') showToast("The file is renamed!");
                                
                                if (typeof window.refreshAddressBar === 'function') window.refreshAddressBar();
                            } else {
                                alert("Error: " + result.message);
                            }
                        } catch (err) {
                            alert("Server connection error.");
                        }
                    };

                    deleteBtn.onclick = async (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        
                        if (!confirm(`Are you sure you want to delete the document "${cleanName}"?`)) return;

                        try {
                            const delRes = await fetch('/api/fs/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filename: filename, mode: 'page' }) 
                            });
                            
                            const result = await delRes.json();
                            if (result.status === 'success') {
                                dropdown.style.display = 'none';
                                if(typeof showToast === 'function') showToast("The file is deleted!");
                                
                                const titleSpan = document.getElementById('current-doc-name');
                                if (titleSpan && titleSpan.innerText === cleanName) {
                                    titleSpan.innerText = "Select document...";
                                    document.getElementById('docstral-pages-container').innerHTML = '';
                                    if (typeof showDocstralWelcomeScreen === 'function') {
                                        showDocstralWelcomeScreen(document.getElementById('docstral-pages-container'));
                                    }
                                }
                                
                                if (typeof window.refreshAddressBar === 'function') window.refreshAddressBar();
                            } else {
                                alert("Delete error: " + result.message);
                            }
                        } catch (err) {
                            alert("Server connection error.");
                        }
                    };

                    item.onclick = (ev) => {
                        ev.preventDefault(); ev.stopPropagation();
                        dropdown.style.display = 'none';
                        const titleSpan = document.getElementById('current-doc-name');
                        if (titleSpan) titleSpan.innerText = cleanName; 
                        if (typeof window.loadServerFile === 'function') {
                            window.loadServerFile(filename); 
                        }
                    };
                    
                    dropdown.appendChild(item);
                });
            }
        } catch (err) {
            console.error(err);
            dropdown.innerHTML = '<div style="padding: 10px; color: red; text-align: center; font-weight: bold; font-size: 14px;">Error!</div>';
        }
        return;
    }

    if (!dropdownClick && dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
    }

}, true);

window._eagleViewState = {
    isPinned: false,
    isLensFrozen: false, 
    isContentCached: false, 
    mutationTimer: null,
    SAFE_ZONE: 30, 
    scale: 1, transX: 0, transY: 0
};

window._initEagleMarkers = function() {
};

window._updateEaglePreview = function() {
    const previewContent = document.getElementById('eagle-preview-content');
    const magContent = document.getElementById('eagle-mag-content');
    const editor = document.getElementById('docstral-editor');
    
    if (!previewContent || !editor) return;

    previewContent.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position: relative; width: 850px; margin: 0; display: flex; flex-direction: column; align-items: center;`;
    
    const docContainer = editor.closest('.docstral-document') || editor;
    const clone = docContainer.cloneNode(true);
    
    clone.removeAttribute('contenteditable');
    clone.style.pointerEvents = 'none';
    clone.style.userSelect = 'none';
    
    clone.style.cssText += `
        display: block !important; width: 850px !important; min-height: 1056px !important; 
        background-color: #ffffff !important; box-shadow: 0 5px 15px rgba(0,0,0,0.1) !important; 
        transform: none !important; overflow: hidden !important; color: #000 !important; 
        margin: 0 !important;
    `;
    
    wrapper.appendChild(clone);
    previewContent.appendChild(wrapper);
    window._eagleViewState.isContentCached = true;

    if (window._eagleViewState.isPinned && magContent) {
        magContent.innerHTML = previewContent.innerHTML;
    }
};

// Refreshes the content and interactive scroll markers of the Eagle View minimap rail.
window.refreshEagleView = function() {
    const rail = document.getElementById('eagle-view-rail');
    if (rail && !rail.classList.contains('hidden') && rail.style.display !== 'none') {
        window._eagleViewState.isContentCached = false;
        window._initEagleMarkers(); 
        window._updateEaglePreview(); 
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const workspace = document.getElementById('docstral-workspace');
    const rail = document.getElementById('eagle-view-rail');
    
    if (!workspace || !rail) return; 

    const pagesContainer = document.getElementById('docstral-pages-container');
    const previewWin = document.getElementById('eagle-preview-window');
    const btnEagleOriginal = document.getElementById('btn-eagle-view');
    let magnifier = document.getElementById('eagle-magnifier');
    let magContent = document.getElementById('eagle-mag-content');

    if (!document.getElementById('eagle-magnifier-style')) {
        const style = document.createElement('style');
        style.id = 'eagle-magnifier-style';
        style.innerHTML = `
            #eagle-magnifier {
                position: fixed !important; width: 800px !important; height: 200px !important; 
                border: 2px solid #D4A373 !important; border-radius: 12px !important;
                box-shadow: 0 20px 50px rgba(0,0,0,0.3) !important;
                pointer-events: none !important; z-index: 9999999 !important; 
                display: none; background-color: #E8D8C8 !important; overflow: hidden !important;
                transition: border-color 0.3s ease, box-shadow 0.3s ease;
            }
            #eagle-magnifier.frozen {
                border-color: #3E2723 !important;
                box-shadow: 0 0 0 4px rgba(62,39,35,0.2), 0 20px 50px rgba(0,0,0,0.4) !important;
                pointer-events: auto !important;
            }
        `;
        document.head.appendChild(style);
    }

    if (!magnifier) {
        magnifier = document.createElement('div');
        magnifier.id = 'eagle-magnifier';
        document.body.appendChild(magnifier); 
    }

    if (!magContent) {
        magContent = document.createElement('div');
        magContent.id = 'eagle-mag-content';
        magContent.style.cssText = `
            position: absolute !important; top: 0 !important; left: 0 !important; width: 850px !important; 
            transform-origin: top left !important; display: flex !important; 
            flex-direction: column !important; align-items: center !important;
        `;
        magnifier.appendChild(magContent);
    }

    window.turnOffEagleView = function() {
        if (rail) { rail.classList.add('hidden'); rail.style.display = 'none'; }
        if (previewWin) { previewWin.classList.add('hidden'); previewWin.style.display = 'none'; }
        const previewContent = document.getElementById('eagle-preview-content');
        if (previewContent) previewContent.innerHTML = "";
        if (magnifier) { magnifier.style.display = 'none'; magnifier.classList.remove('frozen'); }
        
        window._eagleViewState.isPinned = false;
        window._eagleViewState.isLensFrozen = false;
        window._eagleViewState.isContentCached = false;
    };

    function handleInteraction(mouseY) {
        if (window._eagleViewState.isPinned) return;
        previewWin.classList.remove('hidden');
        previewWin.style.display = 'block';
        previewWin.style.cursor = 'crosshair';

        if (!window._eagleViewState.isContentCached) {
            window._updateEaglePreview();
        }

        const previewContent = document.getElementById('eagle-preview-content');
        if (!previewContent) return;

        const windowWidth = previewWin.clientWidth || 300;
        const windowHeight = previewWin.clientHeight || 400;
        const rect = rail.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (mouseY - window._eagleViewState.SAFE_ZONE) / (rect.height - (window._eagleViewState.SAFE_ZONE * 2))));
        
        window._eagleViewState.scale = (windowWidth - 40) / 850;
        const maxScroll = Math.max(0, previewContent.scrollHeight - (windowHeight / window._eagleViewState.scale));
        window._eagleViewState.transX = 20 / window._eagleViewState.scale;
        window._eagleViewState.transY = -(maxScroll * percent);

        previewContent.style.transform = `scale(${window._eagleViewState.scale}) translate(${window._eagleViewState.transX}px, ${window._eagleViewState.transY}px)`;
    }

    rail.addEventListener('mousemove', (e) => {
        const rect = rail.getBoundingClientRect();
        handleInteraction(e.clientY - rect.top);
    });

    rail.addEventListener('click', () => {
        window._eagleViewState.isPinned = !window._eagleViewState.isPinned;
        previewWin.style.boxShadow = window._eagleViewState.isPinned ? "0 0 50px 10px rgba(212, 163, 115, 0.4)" : "0 15px 40px -5px rgba(0,0,0,0.15)";
        
        if (window._eagleViewState.isPinned) {
            const previewContent = document.getElementById('eagle-preview-content');
            if(magContent && previewContent) magContent.innerHTML = previewContent.innerHTML;
            previewWin.style.cursor = 'zoom-in';
        } else {
            magnifier.style.display = 'none';
            window._eagleViewState.isLensFrozen = false;
            magnifier.classList.remove('frozen');
            previewWin.style.cursor = 'crosshair';
        }
    });

    previewWin.addEventListener('click', () => {
        if (!window._eagleViewState.isPinned) return;
        window._eagleViewState.isLensFrozen = !window._eagleViewState.isLensFrozen;
        if (window._eagleViewState.isLensFrozen) magnifier.classList.add('frozen');
        else magnifier.classList.remove('frozen');
    });

    rail.addEventListener('mouseleave', () => { 
        if (!window._eagleViewState.isPinned) previewWin.style.display = 'none'; 
    });

    rail.addEventListener('dblclick', (e) => {
        const rect = rail.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientY - rect.top - window._eagleViewState.SAFE_ZONE) / (rect.height - (window._eagleViewState.SAFE_ZONE * 2))));
        workspace.scrollTo({ top: workspace.scrollHeight * percent, behavior: 'smooth' });
    });

    previewWin.addEventListener('mousemove', (e) => {
        if (!window._eagleViewState.isPinned || window._eagleViewState.isLensFrozen) return;
        
        magnifier.style.display = 'block';
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        magnifier.style.left = `${mouseX - 400}px`; 
        magnifier.style.top = `${mouseY - 100}px`;  

        const winRect = previewWin.getBoundingClientRect();
        const relX = mouseX - winRect.left;
        const relY = mouseY - winRect.top;

        const LENS_ZOOM = 2;

        magContent.style.left = `${400 - (relX * LENS_ZOOM)}px`;
        magContent.style.top = `${100 - (relY * LENS_ZOOM)}px`;
        magContent.style.transform = `scale(${window._eagleViewState.scale * LENS_ZOOM}) translate(${window._eagleViewState.transX}px, ${window._eagleViewState.transY}px)`;
    });

    previewWin.addEventListener('mouseleave', () => {
        if (!window._eagleViewState.isLensFrozen) magnifier.style.display = 'none';
        if (!window._eagleViewState.isPinned) previewWin.style.display = 'none';
    });

    const observer = new MutationObserver(() => {
        if (rail.classList.contains('hidden') || rail.style.display === 'none') return;
        
        window._eagleViewState.isContentCached = false;
        clearTimeout(window._eagleViewState.mutationTimer);
        
        window._eagleViewState.mutationTimer = setTimeout(() => {
            window._initEagleMarkers();
            if (previewWin.style.display === 'block' || window._eagleViewState.isPinned) {
                window._updateEaglePreview();
            }
        }, 400); 
    });
    
    if (pagesContainer) {
        observer.observe(pagesContainer, { childList: true, subtree: true, characterData: true });
    }

    if (btnEagleOriginal) {
        const btnEagle = btnEagleOriginal.cloneNode(true);
        btnEagleOriginal.parentNode.replaceChild(btnEagle, btnEagleOriginal);
        btnEagle.addEventListener('click', (e) => {
            e.preventDefault();
            const isCurrentlyHidden = rail.classList.contains('hidden') || rail.style.display === 'none';
            if (isCurrentlyHidden) {
                rail.classList.remove('hidden'); 
                rail.style.display = 'block';
                setTimeout(window._initEagleMarkers, 50);
            } else {
                window.turnOffEagleView();
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    initLayersModule();
    initTocModule();
    initInfoModule();
});

window.DocstralLayerManager = {
    layerDefinitions: [
        { id: 'h1_all', name: 'Heading 1 All', isGroup: ['h1_names', 'h1_content'] },
        { id: 'h1_names', name: 'Heading 1 Names' },
        { id: 'h1_content', name: 'Heading 1 Content' },
        
        { id: 'h2_all', name: 'Heading 2 All', isGroup: ['h2_names', 'h2_content'] },
        { id: 'h2_names', name: 'Heading 2 Names' },
        { id: 'h2_content', name: 'Heading 2 Content' },
        
        { id: 'h3_all', name: 'Heading 3 All', isGroup: ['h3_names', 'h3_content'] },
        { id: 'h3_names', name: 'Heading 3 Names' },
        { id: 'h3_content', name: 'Heading 3 Content' },
        
        { id: 'h4_all', name: 'Heading 4 All', isGroup: ['h4_names', 'h4_content'] },
        { id: 'h4_names', name: 'Heading 4 Names' },
        { id: 'h4_content', name: 'Heading 4 Content' },
        
        { id: 'title', name: 'Title' },
        { id: 'quotes', name: 'Quotes' },
        { id: 'content', name: 'Content (txt, tables)' }
    ],

    selectedLayers: new Set(),
    visibleLayers: new Set(), 
    activeVersion: 'main',
    loadedVersions: [],

    syncMetadataToGlobal() {
        if (typeof DocstralMeta !== 'undefined' && DocstralMeta.data) {
            if (!DocstralMeta.data.metadata) DocstralMeta.data.metadata = {};
            DocstralMeta.data.metadata.active_version = this.activeVersion;
            DocstralMeta.data.visible_layers = Array.from(this.visibleLayers);
        }
    },

    init() {
        if (this.visibleLayers.size === 0) {
            this.layerDefinitions.forEach(l => {
                if (!l.isGroup) this.visibleLayers.add(l.id);
            });
        }
        this.syncMetadataToGlobal();

        if (!window.docstralFetchIntercepted) {
            const originalFetch = window.fetch;
            window.fetch = async function() {
                const url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] instanceof Request ? arguments[0].url : '');
                
                if (url.includes('/api/docstral/save')) {
                    try {
                        let options = arguments[1];
                        if (options && options.body) {
                            let bodyObj = JSON.parse(options.body);
                            if (bodyObj && bodyObj.data) {
                                if (!bodyObj.data.metadata) bodyObj.data.metadata = {};
                                
                                bodyObj.data.metadata.active_version = window.DocstralLayerManager.activeVersion;
                                bodyObj.data.visible_layers = Array.from(window.DocstralLayerManager.visibleLayers);
                                
                                options.body = JSON.stringify(bodyObj);
                            }
                        }
                    } catch(e) { console.warn("Fetch interceptor error", e); }
                }
                return originalFetch.apply(this, arguments);
            };
            window.docstralFetchIntercepted = true;
        }
    },

    parseDOM() {
        const editor = document.getElementById('docstral-editor');
        if (!editor) return [];

        const lines = Array.from(editor.children);
        let currentH = 0; 
        
        const parsedBlocks = lines.map(line => {
            let type = line.getAttribute('data-block-type');
            if (!type) {
                const tag = line.tagName.toLowerCase();
                if (tag === 'h5') type = 'title';
                else if (['h1', 'h2', 'h3', 'h4'].includes(tag)) type = tag;
                else if (tag === 'blockquote') type = 'quote'; 
                else if (tag === 'table') type = 'table';
                else type = 'paragraph';
            }
            
            if (type === 'heading-1') type = 'h1';
            if (type === 'heading-2') type = 'h2';
            if (type === 'heading-3') type = 'h3';
            if (type === 'heading-4') type = 'h4';
            if (type === 'blockquote') type = 'quote';

            let structuralLayer = 'content';
            let elementTypeLayer = '';

            if (type === 'title') { structuralLayer = 'title'; currentH = 0; }
            else if (type === 'h1') { structuralLayer = 'h1_names'; currentH = 1; }
            else if (type === 'h2') { structuralLayer = 'h2_names'; currentH = 2; }
            else if (type === 'h3') { structuralLayer = 'h3_names'; currentH = 3; }
            else if (type === 'h4') { structuralLayer = 'h4_names'; currentH = 4; }
            else {
                if (currentH === 1) structuralLayer = 'h1_content';
                else if (currentH === 2) structuralLayer = 'h2_content';
                else if (currentH === 3) structuralLayer = 'h3_content';
                else if (currentH === 4) structuralLayer = 'h4_content';
                else structuralLayer = 'content';
                
                if (type === 'quote') elementTypeLayer = 'quotes';
                else elementTypeLayer = 'content'; 
            }

            let finalLayers = structuralLayer;
            if (elementTypeLayer && elementTypeLayer !== structuralLayer) {
                finalLayers += ' ' + elementTypeLayer;
            }

            if (line.getAttribute('data-semantic-layer') !== finalLayers) {
                line.setAttribute('data-semantic-layer', finalLayers);
            }

            return { 
                element: line, 
                layers: finalLayers.split(' '), 
                rawBlock: this.extractSingleBlock(line, type) 
            };
        });

        return parsedBlocks;
    },

    extractSingleBlock(node, resolvedType) {
        const tag = node.tagName.toLowerCase();
        const cleanText = tag === 'table' ? node.outerHTML : node.innerHTML; 
        return {
            id: node.getAttribute('data-block-id') || `b-${Date.now()}${Math.floor(Math.random()*1000)}`,
            type: resolvedType || node.getAttribute('data-block-type') || 'paragraph',
            content: cleanText,
            layer: 'base',
            style: node.getAttribute('style') || ""
        };
    },

    applyVisibility() {
        this.parseDOM(); 

        let styleEl = document.getElementById('docstral-layers-css');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'docstral-layers-css';
            document.head.appendChild(styleEl);
        }
        
        let css = '';
        this.layerDefinitions.forEach(def => {
            if (def.isGroup) {
                def.isGroup.forEach(sub => {
                    if (!this.visibleLayers.has(sub)) css += `#docstral-editor [data-semantic-layer~="${sub}"] { display: none !important; }\n`;
                });
            } else {
                if (!this.visibleLayers.has(def.id)) css += `#docstral-editor [data-semantic-layer~="${def.id}"] { display: none !important; }\n`;
            }
        });
        
        styleEl.innerHTML = css;
        
        this.syncMetadataToGlobal(); 

        setTimeout(() => {
            if (typeof window.updateDocstralNavDisplay === 'function') {
                window.updateDocstralNavDisplay();
            }
        }, 50);
    },

    updateSidebarStateUI() {
        this.layerDefinitions.forEach(layer => {
            let isSelected = false;
            if (layer.isGroup) isSelected = layer.isGroup.every(sub => this.selectedLayers.has(sub));
            else isSelected = this.selectedLayers.has(layer.id);

            let isVisible = false;
            if (layer.isGroup) isVisible = layer.isGroup.every(sub => this.visibleLayers.has(sub));
            else isVisible = this.visibleLayers.has(layer.id);

            const chk = document.getElementById(`layer-chk-${layer.id}`);
            if (chk) chk.checked = isSelected;

            const eyeBtn = document.getElementById(`layer-eye-btn-${layer.id}`);
            const eyeIcon = document.getElementById(`layer-eye-icon-${layer.id}`);
            if (eyeBtn && eyeIcon) {
                eyeBtn.className = `w-6 h-6 flex items-center justify-center ${isVisible ? 'text-[#3E2723]' : 'text-[#8D6E63]/40'} hover:bg-[#D4A373]/20 rounded transition-colors`;
                eyeIcon.className = `fa-solid ${isVisible ? 'fa-eye' : 'fa-eye-slash'} text-xs`;
            }
        });

        const totalBaseLayers = this.layerDefinitions.filter(l => !l.isGroup).length;
        const isMasterChecked = this.selectedLayers.size === totalBaseLayers;
        const isMasterVisible = this.visibleLayers.size === totalBaseLayers;

        const masterChk = document.getElementById('master-layer-chk');
        if (masterChk) masterChk.checked = isMasterChecked;

        const masterEyeBtn = document.getElementById('master-eye-btn');
        if (masterEyeBtn) {
            masterEyeBtn.className = `w-6 h-6 flex items-center justify-center ${isMasterVisible ? 'text-[#3E2723]' : 'text-[#8D6E63]/40'} hover:bg-[#D4A373]/20 rounded transition-colors`;
            masterEyeBtn.innerHTML = `<i class="fa-solid ${isMasterVisible ? 'fa-eye' : 'fa-eye-slash'} text-xs"></i>`;
        }

        const versionRadios = document.getElementsByName('layer-version');
        if (versionRadios) {
            versionRadios.forEach(r => {
                if (r.value === this.activeVersion) r.checked = true;
            });
        }
    },

    toggleLayerSelect(id, checked) {
        const def = this.layerDefinitions.find(l => l.id === id);
        if (def.isGroup) {
            def.isGroup.forEach(sub => checked ? this.selectedLayers.add(sub) : this.selectedLayers.delete(sub));
        } else {
            checked ? this.selectedLayers.add(id) : this.selectedLayers.delete(id);
        }
        this.updateSidebarStateUI();
    },

    toggleVisibility(id) {
        const def = this.layerDefinitions.find(l => l.id === id);
        let isVisible = false;

        if (def.isGroup) {
            isVisible = !def.isGroup.every(sub => this.visibleLayers.has(sub));
            def.isGroup.forEach(sub => isVisible ? this.visibleLayers.add(sub) : this.visibleLayers.delete(sub));
        } else {
            isVisible = !this.visibleLayers.has(id);
            isVisible ? this.visibleLayers.add(id) : this.visibleLayers.delete(id);
        }
        
        this.applyVisibility();
        this.updateSidebarStateUI();
        
        if (typeof DocstralSync !== 'undefined' && typeof DocstralSync.scheduleSync === 'function') {
            DocstralSync.scheduleSync();
        }
    },

    toggleMasterSelect(checked) {
        this.layerDefinitions.forEach(l => {
            if (!l.isGroup) {
                if (checked) this.selectedLayers.add(l.id);
                else this.selectedLayers.delete(l.id);
            }
        });
        this.updateSidebarStateUI(); 
    },

    toggleMasterVisibility() {
        const totalBaseLayers = this.layerDefinitions.filter(l => !l.isGroup).length;
        const isMasterVisible = this.visibleLayers.size === totalBaseLayers;
        
        this.layerDefinitions.forEach(l => {
            if (!l.isGroup) {
                if (isMasterVisible) this.visibleLayers.delete(l.id); 
                else this.visibleLayers.add(l.id); 
            }
        });
        
        this.applyVisibility();
        this.updateSidebarStateUI(); 
        
        if (typeof DocstralSync !== 'undefined' && typeof DocstralSync.scheduleSync === 'function') {
            DocstralSync.scheduleSync();
        }
    },

    getBlocksForLayers(targetLayersSet) {
        const parsed = this.parseDOM();
        return parsed.filter(p => p.layers.some(l => targetLayersSet.has(l))).map(p => p.rawBlock);
    },

    async fetchVersions() {
        const currentFilename = typeof DocstralMeta !== 'undefined' ? DocstralMeta.data.currentFilename : null;
        if (!currentFilename) return [];
        try {
            const res = await fetch(`/api/docstral/versions/list?filename=${currentFilename}`);
            const data = await res.json();
            this.loadedVersions = ['main', ...(data.versions || [])];
            return this.loadedVersions;
        } catch (e) { return ['main']; }
    },

    async renderSidebarUI() {
        const scrollContainer = document.getElementById('layers-scroll-container');
        const savedScrollPosition = scrollContainer ? scrollContainer.scrollTop : 0;

        await this.fetchVersions();
        
        const totalBaseLayers = this.layerDefinitions.filter(l => !l.isGroup).length;
        const isMasterChecked = this.selectedLayers.size === totalBaseLayers;
        const isMasterVisible = this.visibleLayers.size === totalBaseLayers;

        let layersHtml = '';
        this.layerDefinitions.forEach(layer => {
            let isSelected = false;
            if (layer.isGroup) isSelected = layer.isGroup.every(sub => this.selectedLayers.has(sub));
            else isSelected = this.selectedLayers.has(layer.id);

            let isVisible = false;
            if (layer.isGroup) isVisible = layer.isGroup.every(sub => this.visibleLayers.has(sub));
            else isVisible = this.visibleLayers.has(layer.id);

            layersHtml += `
                <div class="flex flex-col border-b border-[#D4A373]/20 hover:bg-[#D4A373]/5 transition-colors">
                    <div class="flex items-center justify-between p-2">
                        <label class="flex items-center gap-2 cursor-pointer min-w-0">
                            <input type="checkbox" id="layer-chk-${layer.id}" class="accent-[#D4A373] w-3.5 h-3.5" ${isSelected ? 'checked' : ''} onchange="window.DocstralLayerManager.toggleLayerSelect('${layer.id}', this.checked)"> 
                            <span class="text-xs font-bold text-[#3E2723] truncate">${layer.name}</span>
                        </label>
                        <div class="flex items-center gap-1 shrink-0">
                            <button onclick="window.DocstralLayerManager.showAIInput('${layer.id}')" class="w-6 h-6 flex items-center justify-center text-[#D4A373] hover:bg-[#D4A373]/20 rounded transition-colors" title="Ask Magi for this layer">
                                <i class="fa-solid fa-solid fa-fire-flame-simple text-[10px]"></i>
                            </button>
                            <button id="layer-eye-btn-${layer.id}" onclick="window.DocstralLayerManager.toggleVisibility('${layer.id}')" class="w-6 h-6 flex items-center justify-center ${isVisible ? 'text-[#3E2723]' : 'text-[#8D6E63]/40'} hover:bg-[#D4A373]/20 rounded transition-colors">
                                <i id="layer-eye-icon-${layer.id}" class="fa-solid ${isVisible ? 'fa-eye' : 'fa-eye-slash'} text-xs"></i>
                            </button>
                        </div>
                    </div>
                    <div id="ai-input-container-${layer.id}" class="hidden px-2 pb-2 animate-in fade-in slide-in-from-top-2">
                        <textarea id="ai-prompt-${layer.id}" rows="2" placeholder="Ask AI about this layer... (Press Enter)" class="w-full text-[10px] p-1.5 bg-white border border-[#D4A373]/40 rounded outline-none focus:border-[#D4A373] resize-none" onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); window.DocstralLayerManager.executeAI('${layer.id}'); }"></textarea>
                    </div>
                </div>
            `;
        });

        let versionsHtml = this.loadedVersions.map(v => {
            if (v === 'main') {
                return `
                <div class="flex items-center justify-between p-1 hover:bg-white rounded transition-colors border border-transparent hover:border-[#D4A373]/20">
                    <label class="flex items-center gap-2 cursor-pointer flex-1 min-w-0 p-0.5">
                        <input type="radio" name="layer-version" value="${v}" ${this.activeVersion === v ? 'checked' : ''} onchange="window.DocstralLayerManager.loadVersion('${v}')" class="accent-[#D4A373]">
                        <span class="text-[11px] font-bold text-[#3E2723] uppercase tracking-wider">${v}</span>
                    </label>
                </div>`;
            } else {
                return `
                <div class="flex items-center justify-between p-1 hover:bg-white rounded transition-colors border border-transparent hover:border-[#D4A373]/20 group">
                    <label class="flex items-center gap-2 cursor-pointer flex-1 min-w-0 p-0.5">
                        <input type="radio" name="layer-version" value="${v}" ${this.activeVersion === v ? 'checked' : ''} onchange="window.DocstralLayerManager.loadVersion('${v}')" class="accent-[#D4A373]">
                        <span class="text-[11px] font-bold text-[#3E2723] uppercase tracking-wider truncate">${v}</span>
                    </label>
                    <button onclick="window.DocstralLayerManager.deleteVersion('${v}')" class="w-5 h-5 flex items-center justify-center text-[#8D6E63]/40 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100 shrink-0" title="Delete version">
                        <i class="fa-solid fa-trash text-[10px]"></i>
                    </button>
                </div>`;
            }
        }).join('');

        window.openDocstralSidebar('Document Layers', `
            <div class="flex flex-col h-full bg-[#FDFBF7]">
                <div class="p-3 border-b border-[#D4A373]/30 bg-[#F5E6D3]/50 flex justify-between items-center">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="master-layer-chk" class="accent-[#D4A373] w-4 h-4" ${isMasterChecked ? 'checked' : ''} onchange="window.DocstralLayerManager.toggleMasterSelect(this.checked)">
                        <span class="text-xs font-black uppercase tracking-widest text-[#3E2723]">Select All Layers</span>
                    </label>
                    <button id="master-eye-btn" onclick="window.DocstralLayerManager.toggleMasterVisibility()" class="w-6 h-6 flex items-center justify-center ${isMasterVisible ? 'text-[#3E2723]' : 'text-[#8D6E63]/40'} hover:bg-[#D4A373]/20 rounded transition-colors" title="Toggle Visibility for All">
                        <i class="fa-solid ${isMasterVisible ? 'fa-eye' : 'fa-eye-slash'} text-xs"></i>
                    </button>
                </div>

                <div id="layers-scroll-container" class="flex-1 overflow-y-auto custom-scroll">
                    ${layersHtml}
                </div>

                <div class="p-3 border-t-2 border-[#D4A373]/30 bg-[#E8D8C8]/20 relative z-50">
                    <button onclick="window.DocstralLayerManager.toggleActionMenu()" 
                            class="w-full py-2 bg-[#3E2723] text-[#D4A373] hover:bg-[#5D4037] rounded text-[12px] font-bold uppercase transition-all shadow-sm flex items-center justify-center gap-2">
                        <i class="fa-solid fa-gears"></i>
                        Layer Actions
                        <i id="layer-actions-chevron" class="fa-solid fa-chevron-up text-[12px] transition-transform duration-200"></i>
                    </button>

                    <div id="layers-actions-dropdown" 
                         class="hidden absolute bottom-full -left-3 -right-3 mb-3 max-h-[50vh] overflow-y-auto custom-scroll bg-white border-y border-[#D4A373]/40 shadow-[0_-10px_20px_rgba(0,0,0,0.1)] z-[100] flex flex-col">

                        <div class="px-4 py-1 bg-[#F5E6D3]/50 text-[16px] font-black text-[#8D6E63] uppercase border-b border-[#D4A373]/10 sticky top-0 backdrop-blur-sm">
                            Create Outside - New .jdoc
                        </div>
                        <button onclick="window.DocstralLayerManager.actionNewDoc('selected'); closeLayerDropdown()" 
                                class="text-left px-5 py-1.5 text-[14px] text-[#3E2723] hover:bg-[#F5E6D3] transition-colors flex items-center gap-3">
                            <i class="fa-solid fa-file-circle-plus text-[#D4A373] w-4"></i> From Selected Layers
                        </button>
                        <button onclick="window.DocstralLayerManager.actionNewDoc('all'); closeLayerDropdown()" 
                                class="text-left px-5 py-1.5 text-[14px] text-[#3E2723] hover:bg-[#F5E6D3] transition-colors flex items-center gap-3">
                            <i class="fa-solid fa-copy text-[#D4A373] w-4"></i> From All Layers
                        </button>

                        <div class="px-4 py-1 bg-[#F5E6D3]/50 text-[16px] font-black text-[#8D6E63] uppercase border-y border-[#D4A373]/10 sticky top-0 backdrop-blur-sm">
                            Create Inside - New Version
                        </div>
                        <button onclick="window.DocstralLayerManager.actionNewVersion('selected'); closeLayerDropdown()" 
                                class="text-left px-5 py-1.5 text-[14px] text-[#3E2723] hover:bg-[#F5E6D3] transition-colors flex items-center gap-3">
                            <i class="fa-solid fa-code-branch text-[#D4A373] w-4"></i> From Selected Layers
                        </button>
                        <button onclick="window.DocstralLayerManager.actionNewVersion('all'); closeLayerDropdown()" 
                                class="text-left px-5 py-1.5 text-[14px] text-[#3E2723] hover:bg-[#F5E6D3] transition-colors flex items-center gap-3">
                            <i class="fa-solid fa-code-compare text-[#D4A373] w-4"></i> From All Layers
                        </button>

                        <div class="px-4 py-1 bg-[#F5E6D3]/50 text-[16px] font-black text-[#8D6E63] uppercase border-y border-[#D4A373]/10 sticky top-0 backdrop-blur-sm">
                            Other actions
                        </div>
                        <button onclick="window.DocstralLayerManager.actionExportTxt(); closeLayerDropdown()" 
                                class="text-left px-5 py-1.5 text-[14px] text-[#3E2723] hover:bg-[#F5E6D3] transition-colors flex items-center gap-3">
                            <i class="fa-solid fa-file-export text-[#D4A373] w-4"></i> Export Selected to .TXT file
                        </button>

                        <button onclick="window.DocstralLayerManager.actionClearLayers(); closeLayerDropdown()" 
                                class="text-left px-5 py-1.5 text-[14px] text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3 border-t border-red-100">
                            <i class="fa-solid fa-trash-can w-4"></i> Remove Selected From Here
                        </button>
                    </div>
                </div>

                <div class="p-3">
                    <span class="text-[12px] font-black uppercase tracking-widest text-[#8D6E63] mb-2 block">Document Versions</span>
                    <div id="layers-versions-container" class="flex flex-col gap-1 max-h-[120px] overflow-y-auto custom-scroll">
                        ${versionsHtml}
                    </div>
                </div>
            </div>
        `);

        setTimeout(() => {
            const newScrollContainer = document.getElementById('layers-scroll-container');
            if (newScrollContainer) {
                newScrollContainer.scrollTop = savedScrollPosition;
            }
            this.updateSidebarStateUI();
        }, 10);
    },

    showAIInput(layerId) {
        const container = document.getElementById(`ai-input-container-${layerId}`);
        if (container) {
            container.classList.toggle('hidden');
            if (!container.classList.contains('hidden')) {
                document.getElementById(`ai-prompt-${layerId}`).focus();
            }
        }
    },

    actionClearLayers() {
        if (this.selectedLayers.size === 0) return alert("Please select layers.");
        if (!confirm("WARNING! This will delete the contents of the selected layers from the current document. Do you want to continue?")) return;

        const parsed = this.parseDOM();
        const blocksToRemove = parsed.filter(p => p.layers.some(l => this.selectedLayers.has(l)));

        if (blocksToRemove.length === 0) return alert("The selected layers are empty.");

        blocksToRemove.forEach(p => {
            if (p.element && p.element.parentNode) {
                p.element.parentNode.removeChild(p.element);
            }
        });

        if (typeof DocstralSync !== 'undefined' && typeof DocstralSync.scheduleSync === 'function') {
            DocstralSync.scheduleSync();
        }

        if (typeof showToast === 'function') showToast("The content is deleted successfully.");
    },

    async deleteVersion(versionName) {
        if (!confirm(`Are you sure that you want to delete the version "${versionName}"? This is irreversible!`)) return;

        const currentFilename = typeof DocstralMeta !== 'undefined' ? DocstralMeta.data.currentFilename : null;
        if (!currentFilename) return;

        try {
            const res = await fetch('/api/docstral/versions/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: currentFilename, version_name: versionName })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                if (typeof showToast === 'function') showToast("The version is deleted!");
                if (this.activeVersion === versionName) {
                    this.loadVersion('main');
                } else {
                    this.renderSidebarUI(); 
                }
            } else {
                alert("Error: " + data.message);
            }
        } catch (e) { alert("Server connection error."); }
    },

    async executeAI(layerId) {
        const input = document.getElementById(`ai-prompt-${layerId}`);
        const userPrompt = input.value.trim();
        if (!userPrompt) return;

        input.disabled = true;
        input.value = "AI is thinking...";

        const def = this.layerDefinitions.find(l => l.id === layerId);
        let targetLayers = new Set();
        if (def.isGroup) def.isGroup.forEach(s => targetLayers.add(s));
        else targetLayers.add(layerId);

        const blocks = this.getBlocksForLayers(targetLayers);
        const contextText = blocks.map(b => b.content.replace(/<[^>]+>/g, '').trim()).join('\n');

        if (!contextText) {
            alert("This layer is empty. Magi has no work.");
            input.disabled = false; input.value = ""; return;
        }

        const modelDropdown = document.getElementById('sel-model');
        const selectedModel = modelDropdown ? modelDropdown.value : '';

        const finalPrompt = `Complete the following task strictly:\n${userPrompt}\n\nUse the following text as material for the assignment:\n"""\n${contextText}\n"""`;

        try {
            const response = await fetch('/api/ai/regen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: finalPrompt, context: "", model: selectedModel })
            });
            const data = await response.json();

            if (data.status === 'success') {
                const editor = document.getElementById('docstral-editor');
                const p = document.createElement('p');
                p.className = 'block-line';
                p.setAttribute('data-semantic-layer', 'content');
                p.setAttribute('data-layer', 'base');
                p.setAttribute('data-block-id', `b-${Date.now()}`);
                
                p.innerHTML = `<strong style="color:#D4A373;">AI (Layer: ${def.name}):</strong> <span class="ai-typing-text"></span>`;
                editor.appendChild(p);
                
                p.scrollIntoView({ behavior: 'smooth', block: 'center' });

                const typingContainer = p.querySelector('.ai-typing-text');
                const htmlString = data.text;
                let charIndex = 0;
                let isInsideTag = false;
                let currentHTML = "";

                function typeWriter() {
                    if (charIndex < htmlString.length) {
                        const char = htmlString.charAt(charIndex);
                        currentHTML += char;
                        
                        if (char === '<') isInsideTag = true;
                        if (char === '>') isInsideTag = false;
                        
                        typingContainer.innerHTML = currentHTML;
                        charIndex++;
                        
                        if (isInsideTag) {
                            typeWriter(); 
                        } else {
                            setTimeout(typeWriter, 2); 
                        }
                    } else {
                        if (typeof DocstralSync !== 'undefined') DocstralSync.scheduleSync();
                    }
                }
                
                typeWriter();

            } else {
                alert("Error: " + data.message);
            }
        } catch (e) {
            alert("Network error.");
        } finally {
            input.disabled = false;
            input.value = "";
            document.getElementById(`ai-input-container-${layerId}`).classList.add('hidden');
        }
    },

    async actionNewDoc(mode) {
        const currentFilename = typeof DocstralMeta !== 'undefined' ? DocstralMeta.data.currentFilename : null;
        if (!currentFilename || currentFilename === "new_document.jdoc.json") {
            return alert("Please save the current document before creating a new one from it.");
        }

        let blocks = [];
        const allParsed = this.parseDOM(); 

        if (mode === 'selected') {
            if (this.selectedLayers.size === 0) return alert("Please select layers.");
            blocks = allParsed.filter(p => p.layers.some(l => this.selectedLayers.has(l))).map(p => p.rawBlock);
        } else {
            blocks = allParsed.map(p => p.rawBlock);
        }

        if (blocks.length === 0) return alert("The selected layers are empty.");

        const rawBaseName = currentFilename.replace(".jdoc.json", "").replace(/_/g, " ");
        const defaultSuffix = mode === 'selected' ? 'Extracted' : 'Copy';
        const newDocName = prompt("Enter new document name:", `${rawBaseName} - ${defaultSuffix}`);

        if (!newDocName || newDocName.trim() === "") return; 

        try {
            const res = await fetch('/api/docstral/layers/new_doc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    base_filename: newDocName.trim(), 
                    suffix: "", 
                    blocks: blocks 
                })
            });
            const data = await res.json();
            if (data.status === 'success') {
                if (typeof showToast === 'function') showToast("New document is created!");
                if (typeof window.loadServerFile === 'function') window.loadServerFile(data.filename);
                if (typeof window.refreshAddressBar === 'function') window.refreshAddressBar();
                
                setTimeout(async () => {
                    if (typeof window.loadFilesList === 'function') await window.loadFilesList();
                    else if (typeof window.refreshFileList === 'function') await window.refreshFileList();
                    else if (typeof window.fetchFilesList === 'function') await window.fetchFilesList();
                }, 200);
            }
        } catch (e) { alert("Error creating a new document."); }
    },

    actionExportTxt() {
        if (this.selectedLayers.size === 0) return alert("Please select layers.");
        const blocks = this.getBlocksForLayers(this.selectedLayers);
        if (blocks.length === 0) return alert("The layers are empty.");

        const text = blocks.map(b => b.content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()).join('\n\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Exported_Layers_${Date.now()}.txt`;
        a.click();
    },

    async actionNewVersion(mode) {
        const currentFilename = typeof DocstralMeta !== 'undefined' ? DocstralMeta.data.currentFilename : null;
        if (!currentFilename || currentFilename === "new_document.jdoc.json") {
            return alert("Please save the document.");
        }

        let blocks = [];
        const allParsed = this.parseDOM();

        if (mode === 'selected') {
            if (this.selectedLayers.size === 0) return alert("Please select layers.");
            blocks = allParsed.filter(p => p.layers.some(l => this.selectedLayers.has(l))).map(p => p.rawBlock);
        } else {
            blocks = allParsed.map(p => p.rawBlock);
        }
        
        if (blocks.length === 0) return alert("The selected layers are empty.");

        const versionBlocks = blocks.map((b, index) => ({
            ...b,
            id: `v${Date.now()}-${index}-${Math.floor(Math.random()*1000)}`
        }));

        const vName = prompt("Enter new version name (example: EN, Draft, Technical, HR and etc.):", `v_${Date.now().toString().slice(-4)}`);
        if (!vName || vName.trim() === "") return;

        try {
            const res = await fetch('/api/docstral/versions/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: currentFilename,
                    version_name: vName.trim(),
                    blocks: versionBlocks, 
                    visible_layers: Array.from(this.visibleLayers)
                })
            });
            const data = await res.json();
            if (data.status === 'success') {
                if (typeof showToast === 'function') showToast("The version is saved!");
                this.renderSidebarUI();
            }
        } catch (e) { alert("Error creating new version."); }
    },

    async loadVersion(versionName) {
        if (versionName === this.activeVersion) return;
        
        const currentFilename = typeof DocstralMeta !== 'undefined' ? DocstralMeta.data.currentFilename : null;
        if (!currentFilename) return;

        if (typeof DocstralSync !== 'undefined' && typeof DocstralSync.scheduleSync === 'function') {
            DocstralSync.scheduleSync();
        }

        if (versionName === 'main') {
            if (typeof window.loadServerFile === 'function') window.loadServerFile(currentFilename);
            this.activeVersion = 'main';
            
            setTimeout(() => {
                if (typeof DocstralMeta !== 'undefined' && DocstralMeta.data && DocstralMeta.data.visible_layers) {
                    this.visibleLayers = new Set(DocstralMeta.data.visible_layers);
                }
                this.applyVisibility();
                this.updateSidebarStateUI(); 
                
                if (typeof showToast === 'function') showToast(`Main version is loaded!`);
            }, 300); 
            return;
        }

        try {
            const res = await fetch('/api/docstral/versions/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: currentFilename, version_name: versionName })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                const editor = document.getElementById('docstral-editor');
                if (editor && typeof DocstralSync !== 'undefined') {
                    const oldSync = DocstralSync.scheduleSync;
                    DocstralSync.scheduleSync = function(){};

                    DocstralSync.renderDocument(data.blocks, null);
                    
                    if (data.visible_layers) {
                        this.visibleLayers = new Set(data.visible_layers);
                    }
                    this.activeVersion = versionName;
                    
                    this.applyVisibility();
                    this.updateSidebarStateUI(); 
                    
                    if (typeof showToast === 'function') showToast(`Version [${versionName}] is loaded!`);

                    setTimeout(() => { DocstralSync.scheduleSync = oldSync; }, 500);
                }
            }
        } catch (e) { alert("Error loading the version."); }
    }
};

window.DocstralLayerManager.toggleActionMenu = function() {
    const dropdown = document.getElementById('layers-actions-dropdown');
    const chevron = document.getElementById('layer-actions-chevron');
    
    dropdown.classList.toggle('hidden');
    
    if (dropdown.classList.contains('hidden')) {
        chevron.classList.remove('fa-chevron-down');
        chevron.classList.add('fa-chevron-up'); 
    } else {
        chevron.classList.remove('fa-chevron-up');
        chevron.classList.add('fa-chevron-down'); 
    }
};

window.closeLayerDropdown = function() {
    const dropdown = document.getElementById('layers-actions-dropdown');
    const chevron = document.getElementById('layer-actions-chevron');
    
    if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
        if (chevron) {
            chevron.classList.remove('fa-chevron-down');
            chevron.classList.add('fa-chevron-up');
        }
    }
};

document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('layers-actions-dropdown');
    const button = event.target.closest('button');
    
    if (dropdown && !dropdown.contains(event.target) && (!button || !button.getAttribute('onclick')?.includes('toggleActionMenu'))) {
        window.closeLayerDropdown();
    }
});

// Initializes the document layers module, allowing for layered text visibility and management.
function initLayersModule() {
    window.DocstralLayerManager.init();
    
    const btnLayers = document.getElementById('docstral-btn-layers');
    if (!btnLayers) return;

    const newBtnLayers = btnLayers.cloneNode(true);
    btnLayers.parentNode.replaceChild(newBtnLayers, btnLayers);
    
    newBtnLayers.addEventListener('click', (e) => {
        e.preventDefault();
        window.DocstralLayerManager.parseDOM(); 
        window.DocstralLayerManager.renderSidebarUI();
    });
}

function initTocModule() {
    const btnToc = document.getElementById('btn-insert-toc');
    if (!btnToc) return;

    const newBtnToc = btnToc.cloneNode(true);
    btnToc.parentNode.replaceChild(newBtnToc, btnToc);

    newBtnToc.addEventListener('click', (e) => {
        e.preventDefault();
        window.openDocstralSidebar('Table of Contents', `
            <div class="flex flex-col h-full bg-[#FDFBF7]">
                
                <div class="p-4 border-b border-[#D4A373]/30 shrink-0 space-y-4">
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase text-[#3E2723]">Add before line:</label>
                        <div class="flex items-center bg-[#F5E6D3] border border-[#D4A373] rounded px-2 py-1 focus-within:border-[#3E2723] transition-colors">
                            <i class="fa-solid fa-hashtag text-[#D4A373] text-[10px] mr-2"></i>
                            <input type="number" id="toc-line-input" autocomplete="off" class="w-full bg-transparent outline-none text-xs text-[#3E2723] placeholder-[#D4A373]/70" placeholder="e.g. 1">
                        </div>
                    </div>

                    <button id="toc-generate-btn" class="w-full bg-[#D4A373] text-white font-black py-2 rounded text-xs uppercase hover:bg-[#3E2723] active:scale-95 transition-all shadow-sm">
                        <i class="fa-solid fa-list-ol mr-2"></i> Create Table of Contents
                    </button>
                </div>

                <div class="p-4 flex-1 overflow-y-auto custom-scroll">
                    <label class="text-[10px] font-bold uppercase text-[#3E2723] mb-3 block">Include elements:</label>
                    <div class="flex flex-col gap-2 text-sm text-[#3E2723] font-bold">
                        <label class="flex items-center gap-3 cursor-pointer hover:bg-[#D4A373]/10 p-2 rounded transition-colors border border-transparent hover:border-[#D4A373]/30">
                            <input type="checkbox" value="title" checked class="toc-include-cb accent-[#D4A373] w-4 h-4"> Titles
                        </label>
                        <label class="flex items-center gap-3 cursor-pointer hover:bg-[#D4A373]/10 p-2 rounded transition-colors border border-transparent hover:border-[#D4A373]/30">
                            <input type="checkbox" value="h1" checked class="toc-include-cb accent-[#D4A373] w-4 h-4"> Headings 1
                        </label>
                        <label class="flex items-center gap-3 cursor-pointer hover:bg-[#D4A373]/10 p-2 rounded transition-colors border border-transparent hover:border-[#D4A373]/30">
                            <input type="checkbox" value="h2" checked class="toc-include-cb accent-[#D4A373] w-4 h-4"> Headings 2
                        </label>
                        <label class="flex items-center gap-3 cursor-pointer hover:bg-[#D4A373]/10 p-2 rounded transition-colors border border-transparent hover:border-[#D4A373]/30">
                            <input type="checkbox" value="h3" checked class="toc-include-cb accent-[#D4A373] w-4 h-4"> Headings 3
                        </label>
                        <label class="flex items-center gap-3 cursor-pointer hover:bg-[#D4A373]/10 p-2 rounded transition-colors border border-transparent hover:border-[#D4A373]/30">
                            <input type="checkbox" value="h4" checked class="toc-include-cb accent-[#D4A373] w-4 h-4"> Headings 4
                        </label>
                    </div>
                </div>
                
            </div>
        `);
    });
}

document.addEventListener('click', async (e) => {
    const btnGen = e.target.closest('#toc-generate-btn');
    if (!btnGen) return;

    e.preventDefault();

    const currentFilename = typeof DocstralMeta !== 'undefined' ? DocstralMeta.data.currentFilename : null;
    
    if (!currentFilename || currentFilename === "new_document.jdoc.json") {
        alert("Error: The document is not saved on the server. Please type at least one word in it to save it first.");
        return;
    }

    const inputLine = document.getElementById('toc-line-input');
    const targetLineStr = inputLine ? inputLine.value.trim() : "";
    const targetLine = targetLineStr ? parseInt(targetLineStr) : 1;

    const checkedBoxes = Array.from(document.querySelectorAll('.toc-include-cb:checked'));
    const includedTypes = checkedBoxes.map(cb => cb.value);

    const originalBtnText = btnGen.innerHTML;
    btnGen.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Generating...';
    btnGen.disabled = true;

    try {
        if (typeof DocstralSync !== 'undefined' && typeof DocstralSync.executeSync === 'function') {
            await DocstralSync.executeSync(true); 
        }

        const response = await fetch('/api/docstral/generate_toc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: currentFilename,
                target_line: targetLine,
                included_types: includedTypes
            })
        });

        const result = await response.json();

        if (response.ok && result.status === 'success') {
            if (typeof showToast === 'function') showToast("Table of Contents generated!");
            if (typeof window.closeDocstralSidebar === 'function') window.closeDocstralSidebar();
            
            if (typeof window.loadServerFile === 'function') {
                window.loadServerFile(currentFilename);
            }
        } else {
            alert("Generation error: " + (result.message || "Unknown error."));
        }

    } catch (error) {
        console.error("TOC API Error:", error);
        alert("Server connection error.");
    } finally {
        btnGen.innerHTML = originalBtnText;
        btnGen.disabled = false;
    }
});

function initInfoModule() {
    const btnInfo = document.getElementById('docstral-btn-info');
    if (!btnInfo) return;

    const newBtnInfo = btnInfo.cloneNode(true);
    btnInfo.parentNode.replaceChild(newBtnInfo, btnInfo);

    window.refreshInfoDynamicData = async function() {
        const totalWordsEl = document.getElementById('stat-total-words');
        if (!totalWordsEl) return; 

        const editor = document.getElementById('docstral-editor');
        if (!editor) return;

        let stats = {
            totalWords: 0,
            h1Count: 0, h1Words: 0,
            h2Count: 0, h2Words: 0,
            h3Count: 0, h3Words: 0,
            h4Count: 0, h4Words: 0,
            quoteCount: 0, quoteWords: 0,
            titleCount: 0, titleWords: 0
        };

        const lines = Array.from(editor.querySelectorAll('.block-line'));
        
        let currentHeading = null; 

        lines.forEach(line => {
            let type = line.getAttribute('data-block-type');
            if (!type) {
                const tag = line.tagName.toLowerCase();
                if (tag === 'h5') type = 'title';
                else if (['h1', 'h2', 'h3', 'h4'].includes(tag)) type = tag;
                else type = 'paragraph';
            }
            
            if (type === 'heading-1') type = 'h1';
            if (type === 'heading-2') type = 'h2';
            if (type === 'heading-3') type = 'h3';
            if (type === 'heading-4') type = 'h4';

            const cleanText = line.innerText.replace(/[\n\r]+/g, ' ').replace(/&nbsp;/g, ' ').trim();
            const wordCount = cleanText ? cleanText.split(/\s+/).filter(w => w.length > 0).length : 0;

            stats.totalWords += wordCount;

            if (type === 'title') { 
                stats.titleCount++; 
                stats.titleWords += wordCount; 
                currentHeading = 'title'; 
            }
            else if (type === 'h1') { 
                stats.h1Count++; 
                stats.h1Words += wordCount; 
                currentHeading = 'h1'; 
            }
            else if (type === 'h2') { 
                stats.h2Count++; 
                stats.h2Words += wordCount; 
                currentHeading = 'h2'; 
            }
            else if (type === 'h3') { 
                stats.h3Count++; 
                stats.h3Words += wordCount; 
                currentHeading = 'h3'; 
            }
            else if (type === 'h4') { 
                stats.h4Count++; 
                stats.h4Words += wordCount; 
                currentHeading = 'h4'; 
            }
            else if (type === 'quote') { 
                stats.quoteCount++; 
                stats.quoteWords += wordCount; 
            }
            else if (type === 'paragraph') {
                if (currentHeading === 'title') stats.titleWords += wordCount;
                else if (currentHeading === 'h1') stats.h1Words += wordCount;
                else if (currentHeading === 'h2') stats.h2Words += wordCount;
                else if (currentHeading === 'h3') stats.h3Words += wordCount;
                else if (currentHeading === 'h4') stats.h4Words += wordCount;
            }
        });

        const safeSet = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
        
        safeSet('stat-total-words', stats.totalWords);
        
        safeSet('stat-title-count', stats.titleCount);
        safeSet('stat-h1-count', stats.h1Count);
        safeSet('stat-h2-count', stats.h2Count);
        safeSet('stat-h3-count', stats.h3Count);
        safeSet('stat-h4-count', stats.h4Count);
        safeSet('stat-quote-count', stats.quoteCount);

        safeSet('stat-title-words', stats.titleWords);
        safeSet('stat-h1-words', stats.h1Words);
        safeSet('stat-h2-words', stats.h2Words);
        safeSet('stat-h3-words', stats.h3Words);
        safeSet('stat-h4-words', stats.h4Words);
        safeSet('stat-quote-words', stats.quoteWords);
    };

    newBtnInfo.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const editor = document.getElementById('docstral-editor');
        if (!editor) {
            alert("Please open a document.");
            return;
        }

        window.openDocstralSidebar('Document Info', `
            <div class="p-4 space-y-4 text-xs text-[#3E2723] bg-[#FDFBF7] h-full overflow-y-auto custom-scroll pb-10">
                
                <div class="p-3 bg-white rounded-xl border border-[#D4A373]/20 shadow-sm hover:border-[#D4A373]/40 transition-colors">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-[#D4A373]/10">
                        <i class="fa-solid fa-layer-group text-[#D4A373] text-sm"></i>
                        <span class="font-black uppercase tracking-widest text-[#3E2723] text-[10px]">Structure Counts</span>
                    </div>
                    <div class="space-y-2 text-[11px]">
                        <div class="flex justify-between"><span>Title Blocks:</span> <span id="stat-title-count" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Heading 1:</span> <span id="stat-h1-count" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Heading 2:</span> <span id="stat-h2-count" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Heading 3:</span> <span id="stat-h3-count" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Heading 4:</span> <span id="stat-h4-count" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Quotes:</span> <span id="stat-quote-count" class="font-bold">0</span></div>
                    </div>
                </div>

                <div class="p-3 bg-[#E8D8C8] rounded-xl border border-[#D4A373]/30 shadow-sm hover:border-[#D4A373]/50 transition-colors">
                    <div class="flex items-center gap-2 mb-3 pb-2 border-b border-[#D4A373]/30">
                        <i class="fa-solid fa-font text-[#D4A373] text-sm"></i>
                        <span class="font-black uppercase tracking-widest text-[#3E2723] text-[10px]">Word Distribution</span>
                    </div>
                    
                    <div class="flex justify-between items-center mb-3 pb-3 border-b border-[#D4A373]/20">
                        <span class="text-[#8D6E63] font-black uppercase tracking-wider text-[11px]">Total Words:</span> 
                        <span id="stat-total-words" class="font-mono bg-white px-2 py-0.5 rounded text-[#D4A373] font-black text-sm shadow-inner">0</span>
                    </div>

                    <div class="space-y-2 text-[11px]">
                        <div class="flex justify-between"><span>Words in Titles:</span> <span id="stat-title-words" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Words in H1:</span> <span id="stat-h1-words" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Words in H2:</span> <span id="stat-h2-words" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Words in H3:</span> <span id="stat-h3-words" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Words in H4:</span> <span id="stat-h4-words" class="font-bold">0</span></div>
                        <div class="flex justify-between"><span>Words in Quotes:</span> <span id="stat-quote-words" class="font-bold">0</span></div>
                    </div>
                </div>

            </div>
        `);

        await window.refreshInfoDynamicData();
    });

    setTimeout(() => {
        if (typeof DocstralSync !== 'undefined' && !DocstralSync._infoPatched_v2) {
            const originalUpdateStatus = DocstralSync.updateSyncStatus;
            
            DocstralSync.updateSyncStatus = function(status) {
                if (typeof originalUpdateStatus === 'function') {
                    originalUpdateStatus.call(this, status);
                }
                
                if (status === 'saved') {
                    if (typeof window.refreshInfoDynamicData === 'function') {
                        window.refreshInfoDynamicData();
                    }
                    if (typeof window.refreshTOCDynamicData === 'function') {
                        window.refreshTOCDynamicData();
                    }
                    if (typeof DocstralLayerManager !== 'undefined' && typeof DocstralLayerManager.applyVisibility === 'function') {
                        DocstralLayerManager.applyVisibility();
                    }
                }
            };
            DocstralSync._infoPatched_v2 = true;
        }
    }, 1000);
}

const DocstralSync = {
    timeout: null,
    abortController: null,
    isSyncing: false,
    _isInitialized: false,

    init() {
        if (this._isInitialized) return;

        document.addEventListener('input', (e) => {
            const targetEl = e.target.nodeType === 3 ? e.target.parentNode : e.target;
            if (targetEl && typeof targetEl.closest === 'function' && targetEl.closest('#docstral-editor')) {
                this.scheduleSync(1200);
            }
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                const editor = document.getElementById('docstral-editor');
                if (editor && editor.contains(e.target)) {
                    e.preventDefault(); 
                    this.executeSync(); 
                }
            }
        });

        this._isInitialized = true;
    },

    cancelSync() {
        clearTimeout(this.timeout);
        if (this.abortController) this.abortController.abort();
        this.isSyncing = false;
    },

    scheduleSync(delay = 1000) {
        clearTimeout(this.timeout); 
        this.updateSyncStatus('saving'); 
        
        this.timeout = setTimeout(() => this.executeSync(), delay); 
    },

    sanitizeDOMIDs() {
        const editor = document.getElementById('docstral-editor');
        if (!editor) return;

        const seenIds = new Set();
        let counter = Date.now();

        Array.from(editor.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent.trim();
                if (text) {
                    const p = document.createElement('p');
                    const newId = `b-${counter++}`;
                    p.setAttribute('data-block-id', newId);
                    p.setAttribute('data-layer', 'base');
                    p.className = 'block-line';
                    p.textContent = text;
                    node.parentNode.replaceChild(p, node);
                    seenIds.add(newId);
                }
            } 
            else if (node.nodeType === Node.ELEMENT_NODE) {
                let id = node.getAttribute('data-block-id');
                if (!id || seenIds.has(id) || id.includes('temp')) {
                    id = `b-${counter++}`;
                    node.setAttribute('data-block-id', id);
                }
                if (!node.classList.contains('block-line')) {
                    node.classList.add('block-line');
                }
                seenIds.add(id); 
            }
        });
    },

    saveCaretPosition() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;

        const range = sel.getRangeAt(0);

        const getOffsetInfo = (node, offset) => {
            let blockEl = node.nodeType === 3 ? node.parentNode : node;
            let closestBlock = blockEl.closest ? blockEl.closest('[data-block-id]') : null;
            if (!closestBlock) return null;

            const preRange = document.createRange();
            preRange.selectNodeContents(closestBlock);
            preRange.setEnd(node, offset);
            return {
                blockId: closestBlock.getAttribute('data-block-id'),
                offset: preRange.toString().length
            };
        };

        const startInfo = getOffsetInfo(range.startContainer, range.startOffset);
        const endInfo = getOffsetInfo(range.endContainer, range.endOffset);

        if (!startInfo || !endInfo) return null;

        return {
            startBlockId: startInfo.blockId,
            startOffset: startInfo.offset,
            endBlockId: endInfo.blockId,
            endOffset: endInfo.offset
        };
    },

    restoreCaretPosition(caretState) {
        if (!caretState || !caretState.startBlockId || !caretState.endBlockId) return;

        const sel = window.getSelection();
        const range = document.createRange();

        const findNodeByOffset = (blockId, targetOffset) => {
            const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
            if (!blockEl) return null;

            if (blockEl.textContent.trim() === "" || blockEl.textContent.length === 0) {
                return { node: blockEl, offset: 0 };
            }

            let currentOffset = 0, targetNode = null, targetNodeOffset = 0;

            const findNode = (node) => {
                if (targetNode) return;
                if (node.nodeType === 3) {
                    if (currentOffset + node.length >= targetOffset) {
                        targetNode = node;
                        targetNodeOffset = targetOffset - currentOffset;
                    } else {
                        currentOffset += node.length;
                    }
                } else {
                    for (let child of node.childNodes) findNode(child);
                }
            };

            findNode(blockEl);
            return targetNode ? { node: targetNode, offset: targetNodeOffset } : { node: blockEl, offset: blockEl.childNodes.length };
        };

        const startData = findNodeByOffset(caretState.startBlockId, caretState.startOffset);
        const endData = findNodeByOffset(caretState.endBlockId, caretState.endOffset);

        if (startData && endData) {
            try {
                range.setStart(startData.node, startData.offset);
                range.setEnd(endData.node, endData.offset);
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (e) {}
        }
    },

    extractBlocksFromDOM() {
        const editor = document.getElementById('docstral-editor');
        const blocks = [];
        if (!editor) return blocks;

        Array.from(editor.childNodes).forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toLowerCase();
                const cleanText = tag === 'table' ? node.outerHTML : node.innerHTML; 
                
                const isBlock = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'blockquote', 'div', 'table'].includes(tag);
                if (!cleanText.trim() && !isBlock && tag !== 'br') return;

                let type = 'paragraph', defaultLayer = 'base'; 

                if (tag === 'h5') { type = 'title'; defaultLayer = 'title'; }
                else if (tag === 'h1') { type = 'h1'; defaultLayer = 'heading_1'; }
                else if (tag === 'h2') { type = 'h2'; defaultLayer = 'heading_2'; }
                else if (tag === 'h3') { type = 'h3'; defaultLayer = 'heading_3'; }
                else if (tag === 'h4') { type = 'h4'; defaultLayer = 'heading_4'; }
                else if (tag === 'blockquote') { type = 'quote'; defaultLayer = 'quote'; }
                else if (tag === 'table') { type = 'table'; defaultLayer = 'table'; }

                const blockId = node.getAttribute('data-block-id');
                const blockLayer = node.getAttribute('data-layer') || defaultLayer;
                const blockStyle = node.getAttribute('style') || "";

                if (blockId) {
                    blocks.push({ id: blockId, type: type, content: cleanText, layer: blockLayer, style: blockStyle });
                }
            }
        });

        if (blocks.length === 0) {
            blocks.push({ id: `b-${Date.now()}`, type: "paragraph", content: "<br>", layer: "base", style: "" });
        }
        return blocks;
    },

    async executeSync(skipHistory = false) {
        const editor = document.getElementById('docstral-editor');
        if (!editor) return;

        this.sanitizeDOMIDs();
        const caretState = this.saveCaretPosition();
        let blocks = this.extractBlocksFromDOM(); 

        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();
        this.isSyncing = true;

        try {
            const response = await fetch('/api/docstral/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocks: blocks }), 
                signal: this.abortController.signal
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const result = await response.json();
            
            if (result.status === 'success') {
                this.renderDocument(result.blocks, caretState);
                if (typeof window.refreshEagleView === 'function') {
                    window.refreshEagleView();
                }

                this.updateSyncStatus('saved');
                
                const currentUIName = document.getElementById('current-doc-name').innerText.trim();
                
                if (currentUIName && !currentUIName.includes("Select") && currentUIName !== "") {
                    let filenameForFS = currentUIName.replace(/[\s\u00A0]+/g, '_') + ".jdoc.json";
                    const oldFilenameFS = DocstralMeta.data.currentFilename;

                    let currentVisibleLayers = ['title', 'h1_names', 'h2_names', 'h3_names', 'h4_names', 'h1_content', 'h2_content', 'h3_content', 'h4_content', 'content', 'quotes'];
                    if (typeof DocstralLayerManager !== 'undefined') {
                        currentVisibleLayers = Array.from(DocstralLayerManager.visibleLayers);
                    }

                    const saveResponse = await fetch('/api/docstral/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filename: DocstralMeta.data.currentFilename || filenameForFS,      
                            old_filename: oldFilenameFS,  
                            data: { 
                                file_version: "3.0",
                                metadata: DocstralMeta.getForSave(currentUIName), 
                                visible_layers: currentVisibleLayers, 
                                blocks: result.blocks 
                            }
                        })
                    });

                    const saveResult = await saveResponse.json();

                    if (saveResult.status === 'success') {
                        DocstralMeta.data.currentFilename = saveResult.actual_filename || filenameForFS;
                        DocstralMeta.data.name = currentUIName;

                        if (!skipHistory && typeof DocstralHistory !== 'undefined') {
                            DocstralHistory.saveState(blocks, caretState);
                        }
                    }
                }
            } else {
                throw new Error(result.message || "Unknown server error");
            }

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Synchronization error:", err);
                this.updateSyncStatus('error');
            }
        } finally {
            this.isSyncing = false;
        }
    },

    renderDocument(blocks, caretState) {
        let container = document.getElementById('docstral-pages-container');
        if (!container) return;

        let editor = document.getElementById('docstral-editor');
        if (!editor) {
            container.innerHTML = `<div class="docstral-document bg-white shadow-xl mx-auto w-[850px] min-h-[1056px] my-8 relative flex"><div id="docstral-editor" class="flex-1 outline-none px-16 py-16 text-black font-sans leading-relaxed relative" contenteditable="true" spellcheck="false"></div></div>`;
            editor = document.getElementById('docstral-editor');
        }

        let html = '';
        const safeBlocks = Array.isArray(blocks) ? blocks : [];
        
        safeBlocks.forEach(block => {
            if (!block || block.content === undefined || block.content === null) {
                return; 
            }
            
            let safeText = block.content.toString().trim() === "" ? "<br>" : block.content;
            let styleAttr = block.style ? `style="${block.style}"` : "";
            let attrs = `data-block-id="${block.id}" data-layer="${block.layer || 'base'}" class="block-line" ${styleAttr}`;

            if (block.type === 'title') html += `<h5 ${attrs}>${safeText}</h5>`;
            else if (block.type === 'h1') html += `<h1 ${attrs}>${safeText}</h1>`;
            else if (block.type === 'h2') html += `<h2 ${attrs}>${safeText}</h2>`;
            else if (block.type === 'h3') html += `<h3 ${attrs}>${safeText}</h3>`;
            else if (block.type === 'h4') html += `<h4 ${attrs}>${safeText}</h4>`;
            else if (block.type === 'table') html += safeText;
            else if (block.type === 'quote') html += `<blockquote ${attrs}>${safeText}</blockquote>`;
            else html += `<p ${attrs}>${safeText}</p>`;
        });

        editor.innerHTML = html;
        if (caretState) this.restoreCaretPosition(caretState);
    },

    renderPages(layoutData, container, caretState) {
        let blocksToRender = [];
        if (Array.isArray(layoutData)) {
            blocksToRender = layoutData;
        } else if (layoutData && layoutData.blocks) {
            blocksToRender = layoutData.blocks;
        } else if (layoutData && layoutData.pages) {
            layoutData.pages.forEach(p => { 
                if (p.blocks) blocksToRender.push(...p.blocks); 
            });
        }
        this.renderDocument(blocksToRender, caretState);
    },

    renderBlocks(layoutData, container, caretState) {
        this.renderPages(layoutData, container, caretState);
    },

    updateSyncStatus(status) {
        const docNameEl = document.getElementById('current-doc-name');
        if (!docNameEl) return;
        if (status === 'saving') docNameEl.style.opacity = '0.5';
        else if (status === 'saved') docNameEl.style.opacity = '1';
        else if (status === 'error') docNameEl.style.color = 'red';
    }
};

// Initializes the document synchronization module to automatically save changes to the server
window.DocstralSync = DocstralSync;

document.addEventListener('DOMContentLoaded', () => {
    DocstralSync.init();
});

const DocstralHistory = {
    undoStack: [],
    redoStack: [],
    maxHistory: 50,
    isRestoring: false,

    init() {
        document.getElementById('btn-undo')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.undo();
        });
        document.getElementById('btn-redo')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.redo();
        });

        document.addEventListener('keydown', (e) => {
            const isCtrl = e.ctrlKey || e.metaKey;

            if (isCtrl) {
                if (e.code === 'KeyZ') {
                    e.preventDefault(); 
                    if (e.shiftKey) this.redo();
                    else this.undo();
                } else if (e.code === 'KeyY') {
                    e.preventDefault(); 
                    this.redo();
                }
            }
        });

        this.updateButtons();
    },

    saveState(blocks, caret) {
        if (this.isRestoring) return; 

        const currentStateStr = JSON.stringify(blocks);
        
        if (this.undoStack.length > 0) {
            const lastState = this.undoStack[this.undoStack.length - 1];
            if (JSON.stringify(lastState.blocks) === currentStateStr) return;
        }

        this.undoStack.push({
            blocks: JSON.parse(JSON.stringify(blocks)), 
            caret: caret
        });

        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift(); 
        }

        this.redoStack = []; 
        this.updateButtons();
    },

    async undo() {
        if (this.undoStack.length <= 1) return; 

        const currentState = this.undoStack.pop();
        this.redoStack.push(currentState);

        const previousState = this.undoStack[this.undoStack.length - 1];
        await this.restoreState(previousState);
    },

    async redo() {
        if (this.redoStack.length === 0) return;

        const nextState = this.redoStack.pop();
        this.undoStack.push(nextState);

        await this.restoreState(nextState);
    },

    async restoreState(state) {
        this.isRestoring = true;
        
        const container = document.getElementById('docstral-editor') || document.getElementById('docstral-pages-container');
        if (!container) return;

        if (typeof showToast === 'function') showToast("Restoring...");

        try {
            const response = await fetch('/api/docstral/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocks: state.blocks })
            });

            const result = await response.json();
            if (result.status === 'success') {
                
                const layoutData = result.blocks || result.pages;

                if (typeof DocstralSync.renderDocument === 'function') {
                    DocstralSync.renderDocument(layoutData, container, state.caret);
                } else if (typeof DocstralSync.renderBlocks === 'function') {
                    DocstralSync.renderBlocks(layoutData, container, state.caret);
                } else if (typeof DocstralSync.renderPages === 'function') {
                    DocstralSync.renderPages(layoutData, container, state.caret);
                }
                
                if (typeof DocstralSync.executeSync === 'function') {
                    await DocstralSync.executeSync(true); 
                }
            }
        } catch (err) {
            console.error("Undo/Redo error:", err);
        } finally {
            this.updateButtons();
            setTimeout(() => { this.isRestoring = false; }, 200);
        }
    },

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.updateButtons();
    },

    updateButtons() {
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');

        if (btnUndo) {
            btnUndo.style.opacity = this.undoStack.length <= 1 ? '0.4' : '1';
            btnUndo.style.pointerEvents = this.undoStack.length <= 1 ? 'none' : 'auto';
        }
        if (btnRedo) {
            btnRedo.style.opacity = this.redoStack.length === 0 ? '0.4' : '1';
            btnRedo.style.pointerEvents = this.redoStack.length === 0 ? 'none' : 'auto';
        }
    }
};

// Initializes the document history tracking system for undo and redo functionality within the editor.
document.addEventListener('DOMContentLoaded', () => {
    DocstralHistory.init();
});

const DocstralFormat = {
    map: {
        'T': 'H5',
        'H1': 'H1',
        'H2': 'H2',
        'H3': 'H3',
        'H4': 'H4',
        'Q': 'BLOCKQUOTE',
        'TEXT': 'P'
    },

    getSelectedBlocks(sel, editor) {
        if (!sel.rangeCount) return [];
        let blocks = [];

        if (sel.isCollapsed) {
            let node = sel.anchorNode;
            if (node.id === 'docstral-editor') node = node.childNodes[sel.anchorOffset] || node.lastChild;
            if (!node) return [];
            let block = node.nodeType === 3 ? node.parentNode : node;
            block = block.closest('.block-line');
            if (block) blocks.push(block);
            return blocks;
        }

        const range = sel.getRangeAt(0);
        let startNode = range.startContainer;
        let endNode = range.endContainer;

        let startBlock = (startNode.nodeType === 3 ? startNode.parentNode : startNode).closest('.block-line');
        let endBlock = (endNode.nodeType === 3 ? endNode.parentNode : endNode).closest('.block-line');

        const allBlocks = Array.from(editor.querySelectorAll('.block-line'));
        let inRange = false;
        
        for (let block of allBlocks) {
            if (block === startBlock) inRange = true;
            if (inRange) blocks.push(block);
            if (block === endBlock) break;
        }
        
        return blocks;
    },

    applyFormat(formatKey) {
        const sel = window.getSelection();
        const editor = document.getElementById('docstral-editor');
        if (!editor || !sel.rangeCount) return;

        const targetTag = this.map[formatKey];
        if (!targetTag) return;

        const selectedBlocks = this.getSelectedBlocks(sel, editor);
        if (selectedBlocks.length === 0) return;

        const firstBlockId = selectedBlocks[0].getAttribute('data-block-id');
        const lastBlockId = selectedBlocks[selectedBlocks.length - 1].getAttribute('data-block-id');
        let isChanged = false;

        selectedBlocks.forEach(block => {
            if (block.tagName === targetTag) return; 
            isChanged = true;

            const newBlock = document.createElement(targetTag);
            newBlock.className = block.className;
            newBlock.innerHTML = block.innerHTML;
            
            if (block.hasAttribute('data-block-id')) newBlock.setAttribute('data-block-id', block.getAttribute('data-block-id'));
            if (block.hasAttribute('data-layer')) newBlock.setAttribute('data-layer', block.getAttribute('data-layer'));
            if (block.hasAttribute('style')) newBlock.setAttribute('style', block.getAttribute('style'));

            block.parentNode.replaceChild(newBlock, block);
        });

        if (!isChanged) return;

        try {
            const newFirst = document.querySelector(`[data-block-id="${firstBlockId}"]`);
            const newLast = document.querySelector(`[data-block-id="${lastBlockId}"]`);
            
            if (newFirst && newLast) {
                const range = document.createRange();
                range.setStartBefore(newFirst.firstChild || newFirst);
                range.setEndAfter(newLast.lastChild || newLast);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        } catch (e) {
            console.warn("Could not restore selection.");
        }

        editor.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof DocstralSync !== 'undefined') DocstralSync.scheduleSync();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    
    const findFormatBtn = (keywords) => {
        const btns = Array.from(document.querySelectorAll('#docstral-bottom-bars-wrapper button'));
        return btns.find(b => {
            const btnText = b.innerText.trim().toUpperCase();
            return keywords.some(keyword => btnText === keyword || btnText.includes(keyword));
        });
    };

    const bindFormatBtn = (keywords, key) => {
        const btn = findFormatBtn(keywords);
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            newBtn.addEventListener('mousedown', (e) => { 
                e.preventDefault(); 
                DocstralFormat.applyFormat(key); 
            });
        } else {
            console.warn(`Docstral: The button for [${keywords.join(', ')}] wasn't found inside the HTML!`);
        }
    };

    bindFormatBtn(['TITLE', 'TTL'], 'T');
    bindFormatBtn(['H1'], 'H1');
    bindFormatBtn(['H2'], 'H2');
    bindFormatBtn(['H3'], 'H3');
    bindFormatBtn(['H4'], 'H4');
    bindFormatBtn(['QUOTE', 'Q'], 'Q');
    bindFormatBtn(['TEXT', 'TXT', 'P'], 'TEXT'); 
});

document.addEventListener('DOMContentLoaded', () => {
    
    if (typeof DocstralSync !== 'undefined') {
        DocstralSync.init();
    }

    const findFormatBtn = (text) => Array.from(document.querySelectorAll('#docstral-bottom-bars-wrapper button')).find(b => b.innerText.trim() === text);

    const btnT = findFormatBtn('T');
    if (btnT) btnT.addEventListener('click', (e) => { e.preventDefault(); DocstralFormat.applyFormat('title'); });

    const btnH1 = findFormatBtn('H1');
    if (btnH1) btnH1.addEventListener('click', (e) => { e.preventDefault(); DocstralFormat.applyFormat('heading_1'); });

    const btnH2 = findFormatBtn('H2');
    if (btnH2) btnH2.addEventListener('click', (e) => { e.preventDefault(); DocstralFormat.applyFormat('heading_2'); });

    const btnQ = findFormatBtn('Q');
    if (btnQ) btnQ.addEventListener('click', (e) => { e.preventDefault(); DocstralFormat.applyFormat('quote'); });

    const btnText = findFormatBtn('TEXT');
    if (btnText) btnText.addEventListener('click', (e) => { e.preventDefault(); DocstralFormat.applyFormat('text'); });

    const docWindow = document.getElementById('docstral-window');
    if (docWindow) {
        docWindow.addEventListener('mousedown', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const inlineCommands = {
                'btn-bold': 'bold',
                'btn-italic': 'italic',
                'btn-underline': 'underline',
                'btn-strike': 'strikeThrough',
                'btn-sup': 'superscript',
                'btn-sub': 'subscript'
            };

            if (inlineCommands[btn.id]) {
                e.preventDefault(); 
                
                document.execCommand(inlineCommands[btn.id], false, null);
                
                if (typeof DocstralSync !== 'undefined') {
                    DocstralSync.scheduleSync();
                }
            }
            
            if (btn.id === 'btn-clear-format') {
                e.preventDefault();
                document.execCommand('removeFormat', false, null);
                
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    let block = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
                    block = block.closest('.block-line');
                    if (block) block.removeAttribute('style');
                }

                if (typeof DocstralSync !== 'undefined') DocstralSync.scheduleSync();
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (typeof DocstralSync !== 'undefined' && typeof DocstralSync.init === 'function') {
        DocstralSync.init();
    }
});

const DocstralMeta = {
    data: {
        id: null,
        name: null,
        currentFilename: null 
    },

    setFromJSON(metadata, actualFilename) {
        const safeMeta = metadata || {};
        const safeFilename = actualFilename || "new_document.jdoc.json";

        this.data.id = safeMeta.id || `doc-${Date.now()}`;
        this.data.currentFilename = safeFilename;

        let rawName = safeMeta.name || safeMeta.title || safeFilename.replace(/\.jdoc\.json$/i, '');
        this.data.name = rawName.replace(/_/g, ' '); 

        const titleSpan = document.getElementById('current-doc-name');
        if (titleSpan) {
            titleSpan.innerText = this.data.name;
        }
    },

    getForSave(uiName) {
        if (!this.data.id) this.data.id = `doc-${Date.now()}`;
        
        const safeUiName = uiName || "No name";

        let cleanName = safeUiName.replace(/[\u00A0]/g, ' ').trim();
        
        return {
            id: this.data.id, 
            name: cleanName   
        };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const titleEl = document.getElementById('current-doc-name');
    if (titleEl) {
        titleEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                titleEl.blur(); 
            }
        });

        titleEl.addEventListener('blur', function() {
            if (typeof DocstralSync !== 'undefined') {
                console.log("Address bar has been changed. Forced entry...");
                DocstralSync.scheduleSync();
            }
        });
    }
});

// Deletes the currently open document from the server after confirmation.
window.handleDeleteDoc = async function(specificFilename = null, specificCleanName = null) {
    const filename = specificFilename || (typeof DocstralMeta !== 'undefined' ? DocstralMeta.data.currentFilename : null);
    const cleanName = specificCleanName || (typeof DocstralMeta !== 'undefined' ? DocstralMeta.data.name : "this document");

    if (!filename || filename === "new_document.jdoc") {
        alert("There is no document for deleting.");
        return;
    }

    if (!confirm(`Are you sure you want to delete the document "${cleanName}"?`)) return;

    try {
        const delRes = await fetch('/api/fs/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: filename, mode: 'page' }) 
        });
        
        const result = await delRes.json();
        if (result.status === 'success') {
            if(typeof showToast === 'function') showToast("The file is deleted!");
            
            if (typeof DocstralMeta !== 'undefined' && DocstralMeta.data.currentFilename === filename) {
                
                const titleSpan = document.getElementById('current-doc-name');
                if (titleSpan) titleSpan.innerText = "Select document...";
                const container = document.getElementById('docstral-pages-container');
                if (container) container.innerHTML = '';

                if (typeof window.updateExportState === 'function') window.updateExportState();
                
                if (typeof window.setDocstralMode === 'function') {
                    window.setDocstralMode('page');
                }
            }
            
            if (typeof window.refreshAddressBar === 'function') window.refreshAddressBar();
            
            const dropdown = document.getElementById('docstral-docs-dropdown');
            if (dropdown) dropdown.style.display = 'none';

        } else {
            alert("Delete error: " + (result.message || "Unknown error"));
        }
    } catch (err) {
        console.error("Delete error:", err);
        alert("Server connection error.");
    }
};

window.showDynamicExportMenu = function(e) {
    e.preventDefault();
    e.stopPropagation();

    const btn = e.currentTarget;
    if (btn && (btn.classList.contains('docstral-btn-disabled') || btn.disabled)) {
        return; 
    }

    let existingMenu = document.getElementById('magi-dynamic-menu');
    if (existingMenu) {
        existingMenu.remove();
        return;
    }

    if (typeof window.closeDocstralMenus === 'function') window.closeDocstralMenus();
    const globalDropdown = document.getElementById('docstral-docs-dropdown');
    if (globalDropdown) globalDropdown.style.display = 'none';

    const menu = document.createElement('div');
    menu.id = 'magi-dynamic-menu';
    
    menu.style.cssText = `
        position: fixed !important;
        z-index: 2147483647 !important;
        background: #ffffff !important;
        border: 1px solid rgba(212, 163, 115, 0.4) !important;
        border-radius: 8px !important;
        box-shadow: 0 15px 35px rgba(0,0,0,0.2) !important;
        width: 220px !important;
        padding: 4px !important;
        font-family: 'JetBrains Mono', monospace, sans-serif !important;
        font-size: 13px !important;
        color: #3E2723 !important;
    `;

    const btnRect = e.currentTarget.getBoundingClientRect();
    menu.style.top = `${btnRect.bottom + 5}px`;
    menu.style.left = `${btnRect.right - 220}px`; 

    menu.innerHTML = `
        <div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0; display: flex; gap: 10px; align-items: center; font-weight: bold;" 
             onmouseover="this.style.background='#fdfbf7'" onmouseout="this.style.background='transparent'"
             onclick="handleExport('docx'); this.parentNode.remove();">
            <i class="fa-solid fa-file-word" style="color: #2563eb; width: 18px; font-size: 14px; text-align: center;"></i> .DOCX
        </div>
        <div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0; display: flex; gap: 10px; align-items: center; font-weight: bold;" 
             onmouseover="this.style.background='#fdfbf7'" onmouseout="this.style.background='transparent'"
             onclick="handleExport('pdf'); this.parentNode.remove();">
            <i class="fa-solid fa-file-pdf" style="color: #ef4444; width: 18px; font-size: 14px; text-align: center;"></i> .PDF
        </div>
        <div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0; display: flex; gap: 10px; align-items: center; font-weight: bold;" 
             onmouseover="this.style.background='#fdfbf7'" onmouseout="this.style.background='transparent'"
             onclick="handleExport('txt'); this.parentNode.remove();">
            <i class="fa-solid fa-file-lines" style="color: #6b7280; width: 18px; font-size: 14px; text-align: center;"></i> .TXT
        </div>
        <div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #f0f0f0; display: flex; gap: 10px; align-items: center; font-weight: bold;" 
             onmouseover="this.style.background='#fdfbf7'" onmouseout="this.style.background='transparent'"
             onclick="handleExport('json'); this.parentNode.remove();">
            <i class="fa-solid fa-file-code" style="color: #f97316; width: 18px; font-size: 14px; text-align: center;"></i> .JDOC.JSON
        </div>
        <div style="padding: 10px; cursor: pointer; display: flex; gap: 10px; align-items: center; font-weight: bold;" 
             onmouseover="this.style.background='#fdfbf7'" onmouseout="this.style.background='transparent'"
             onclick="handleExport('png'); this.parentNode.remove();">
            <i class="fa-solid fa-file-image" style="color: #a855f7; width: 18px; font-size: 14px; text-align: center;"></i> .PNG
        </div>
    `;

    document.body.appendChild(menu);

    setTimeout(() => {
        const closeMenu = (clickEvent) => {
            if (!menu.contains(clickEvent.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);
    }, 10);
};

// Triggers the export of the current document into a chosen format (e.g., Markdown, TXT).
window.handleExport = async function(format) {
    const menu = document.getElementById('export-menu');
    if (menu) menu.style.display = 'none';

    let currentName = document.getElementById('current-doc-name').innerText;
    currentName = currentName.replace(/\.jdoc\.json$|\.json$|\.jdoc$/i, '').trim() || "Magi_Document";
    const safeFilename = currentName.replace(/\s+/g, '_'); 

    const blocks = typeof DocstralSync !== 'undefined' ? DocstralSync.extractBlocksFromDOM() : [];

    const triggerDownload = (url, filename, revoke = false) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (revoke) window.URL.revokeObjectURL(url);
    };

    if (format === 'pdf') {
        printDocument(); 
    } 
    else if (format === 'json') {
        const serverFilename = typeof DocstralMeta !== 'undefined' ? DocstralMeta.data.currentFilename : null;
        if (!serverFilename) {
            alert("The file has not yet been saved to the server. Please enter text to save.");
            return;
        }
        const downloadUrl = `/api/fs/download?path=documents/internal/planchette_mode/${encodeURIComponent(serverFilename)}`;
        triggerDownload(downloadUrl, serverFilename);
    }
    else if (format === 'txt') {
        const plainText = blocks.map(b => {
            const temp = document.createElement('div');
            temp.innerHTML = b.content;
            return temp.innerText || temp.textContent || "";
        }).join('\n\n');
        const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(plainText);
        triggerDownload(dataStr, safeFilename + ".txt");
    }
    else if (format === 'docx') {
        if (typeof showToast === 'function') showToast("Generating a Word document...");
        try {
            const response = await fetch('/api/docstral/export/docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocks: blocks })
            });
            if (!response.ok) throw new Error("Server error");
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            triggerDownload(url, safeFilename + ".docx", true);
        } catch (err) {
            alert("Error creating DOCX file.");
        }
    }
    else if (format === 'png') {
        const editorWrapper = document.querySelector('.docstral-document'); 
        if (!editorWrapper) return alert("No document to capture.");
        if (typeof html2canvas === 'undefined') return alert("Missing library: html2canvas.");

        if (typeof showToast === 'function') showToast(`Document capturing...`);

        try {
            const canvas = await html2canvas(editorWrapper, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
            const url = canvas.toDataURL("image/png");
            triggerDownload(url, `${safeFilename}.png`, false);
        } catch (err) {
            alert("An error occurred while generating the image.");
        }
    }
};

window.updateExportState = function() {
    const exportBtns = document.querySelectorAll('#docstral-export-btn, button[onclick="window.showDynamicExportMenu(event)"]');
    const deleteBtns = document.querySelectorAll('button[onclick="handleDeleteDoc()"]');
    const titleSpan = document.getElementById('current-doc-name');
    
    const noDocumentOpen = !titleSpan || 
                           titleSpan.innerText.includes("Select") || 
                           titleSpan.innerText.trim() === "";

    exportBtns.forEach(btn => {
        if (noDocumentOpen) {
            btn.classList.add('docstral-btn-disabled');
            btn.disabled = true; 
        } else {
            btn.classList.remove('docstral-btn-disabled');
            btn.disabled = false;
        }
    });

    deleteBtns.forEach(btn => {
        if (noDocumentOpen) {
            btn.classList.add('docstral-btn-disabled');
            btn.disabled = true;
        } else {
            btn.classList.remove('docstral-btn-disabled');
            btn.disabled = false;
        }
    });
};

window.isSystemCopy = false; 

window.docstralLastCaretRange = null;

// Updates the internal state for the last known caret range and selected text specifically for Docstral's AI tools.
document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        let node = sel.anchorNode;
        let isInsideDoc = false;
        if (node.nodeType === 3) {
            isInsideDoc = node.parentNode.closest('.docstral-page-a4') !== null;
        } else if (node.closest) {
            isInsideDoc = node.closest('.docstral-page-a4') !== null;
        }
        if (isInsideDoc) {
            window.docstralLastCaretRange = sel.getRangeAt(0).cloneRange(); 
        }
    }
});

// Saves copied or cut text actively to the internal clipboard history database.
window.saveToClipboardDb = async function(text, action) {
    if (!text || text.trim() === "") return;
    try {
        await fetch('/api/clipboard/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text, action: action })
        });
        
        window.loadClipboardSidebar();
    } catch (err) {
        console.error("Error writing to clipboard:", err);
    }
};

// Listens for copy events and automatically saves the copied text to the internal Time Machine clipboard database
document.addEventListener('copy', (e) => {
    if (window.isSystemCopy) return; 
    const text = window.getSelection().toString();
    window.saveToClipboardDb(text, 'copied');
});

// Listens for cut events and automatically saves the cut text to the internal Time Machine clipboard database.
document.addEventListener('cut', (e) => {
    if (window.isSystemCopy) return;
    const text = window.getSelection().toString();
    window.saveToClipboardDb(text, 'cut');
});

// Loads the internal clipboard history into the side panel interface.
window.loadClipboardSidebar = async function(forceLoad = false) {
    const content = document.getElementById('docstral-sidebar-content');
    const title = document.getElementById('docstral-sidebar-title');
    
    if (!forceLoad) {
        if (!content || !title || !title.innerText.toLowerCase().includes('clipboard')) {
            return; 
        }
    }
    
    try {
        const res = await fetch('/api/clipboard/history');
        let history = await res.json();
        
        if (!history || history.length === 0) {
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-center opacity-50 p-4">
                    <i class="fa-solid fa-clipboard-list text-5xl mb-4 text-[#D4A373]"></i>
                    <div class="text-xs font-bold text-[#3E2723]">Clipboard is empty.</div>
                </div>`;
            return;
        }
        
        history.reverse(); 

        let html = `
        <div class="flex flex-col h-full bg-[#FDFBF7]">
            <div class="p-3 border-b border-[#D4A373]/30 shrink-0 flex justify-between items-center bg-[#F5E6D3]">
                <span class="text-[10px] font-bold text-[#3E2723] uppercase tracking-widest">${history.length} ITEMS SAVED</span>
                <button onclick="clearAllClipboard()" class="text-[10px] bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1 rounded font-bold transition-colors shadow-sm">
                    <i class="fa-solid fa-trash-can mr-1"></i> Clear All
                </button>
            </div>
            <div class="flex-1 overflow-y-auto p-3 space-y-3 custom-scroll pb-10">
        `;

        html += history.map(item => {
            const safeContent = window.escapeHtml ? window.escapeHtml(item.content) : item.content;
            const encodedContent = encodeURIComponent(item.content);
            const sourceIcon = item.action === 'cut' ? 'fa-scissors' : 'fa-copy';
            const actionName = item.action === 'cut' ? 'CUT' : 'COPIED';
            
            return `
            <div class="p-3 border border-[#D4A373]/40 rounded-lg bg-white shadow-sm group hover:border-[#D4A373] transition-all">
                <div class="flex justify-between items-center mb-2 pb-1 border-b border-[#D4A373]/10">
                    <span class="text-[9px] font-bold text-[#D4A373] uppercase tracking-wider">
                        <i class="fa-solid ${sourceIcon} mr-1"></i> ${actionName}
                    </span>
                    <span class="text-[9px] text-gray-400">${new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                
                <div class="text-[11px] text-[#3E2723] line-clamp-4 font-mono leading-relaxed mb-3 cursor-text" title="${safeContent}">
                    ${safeContent}
                </div>
                
                <div class="flex items-center gap-2 border-t border-[#D4A373]/10 pt-2">
                    <button onclick="copyFromSidebar('${encodedContent}')" class="flex-1 py-1.5 bg-[#E8D8C8] hover:bg-[#D4A373]/50 text-[#3E2723] rounded text-[10px] font-bold transition-colors shadow-sm">
                        <i class="fa-solid fa-copy"></i> Copy
                    </button>
                    <button onclick="showRegenInput('${item.id}')" class="flex-1 py-1.5 bg-[#3E2723] hover:bg-[#5D4037] text-[#D4A373] rounded text-[10px] font-bold transition-colors shadow-sm">
                        <i class="fa-solid fa-fire-flame-simple"></i> Regen
                    </button>
                    <button onclick="deleteClipboardItem('${item.id}')" class="py-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-500 rounded text-[10px] font-bold transition-colors shadow-sm">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>

                <div id="regen-container-${item.id}" class="hidden mt-2 pt-2 border-t border-[#D4A373]/20 animate-in fade-in duration-200">
                    <textarea id="regen-input-${item.id}" placeholder="What should AI do with this text?..." class="w-full p-2 text-[11px] font-mono border border-[#D4A373]/50 rounded outline-none focus:border-[#D4A373] mb-1 bg-[#FDFBF7] resize-none" rows="2" onkeydown="handleRegenEnter(event, '${item.id}', '${encodedContent}')"></textarea>
                    <div class="text-[9px] text-[#8D6E63] italic text-right">Press Enter to generate</div>
                </div>
            </div>`;
        }).join('');

        html += `</div></div>`;
        content.innerHTML = html;
        
    } catch(err) {
        content.innerHTML = '<div class="text-center text-red-500 text-xs mt-10">Loading error.</div>';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const clipBtn = document.getElementById('btn-clipboard');
    if (clipBtn) {
        const newClipBtn = clipBtn.cloneNode(true);
        clipBtn.parentNode.replaceChild(newClipBtn, clipBtn);
        
        newClipBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if(typeof window.openSidebarSmoothly === 'function') {
                window.openSidebarSmoothly('Clipboard History');
            }
            
            const content = document.getElementById('docstral-sidebar-content');
            if (content) {
                content.innerHTML = '<div class="text-center mt-10 text-[#D4A373]"><i class="fa-solid fa-circle-notch fa-spin text-2xl"></i></div>';
            }
            
            window.loadClipboardSidebar(true); 
        });
    }
});

// Copies an item from the internal clipboard history sidebar directly to the OS system clipboard.
window.copyFromSidebar = function(encodedText) {
    window.isSystemCopy = true; 
    const text = decodeURIComponent(encodedText);
    navigator.clipboard.writeText(text).then(() => {
        if(typeof showToast==='function') showToast('Copied to system clipboard!');
        setTimeout(() => window.isSystemCopy = false, 500); 
    }).catch(err => {
        console.error("Error:", err);
        window.isSystemCopy = false;
    });
};

// Clears the entire internal clipboard history database after prompting the user for confirmation.
window.clearAllClipboard = async function() {
    if (!confirm("This will clear the clipboard contents! Shall we continue??")) return;
    try {
        await fetch('/api/clipboard/clear', { method: 'DELETE' });
        window.loadClipboardSidebar();
    } catch (e) { alert("Error."); }
};

// Deletes a single, specific item from the internal clipboard history database.
window.deleteClipboardItem = async function(id) {
    try {
        await fetch(`/api/clipboard/delete/${id}`, { method: 'DELETE' });
        window.loadClipboardSidebar(); 
    } catch (e) { alert("Error."); }
};

// Toggles the visibility of the input field used for regenerating specific AI content.
window.showRegenInput = function(id) {
    const container = document.getElementById(`regen-container-${id}`);
    const input = document.getElementById(`regen-input-${id}`);
    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        input.focus();
    } else {
        container.classList.add('hidden');
    }
};

// Processes the Enter key press in the regeneration input and triggers the generation based on the prompt.
window.handleRegenEnter = async function(e, id, encodedContext) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const prompt = e.target.value.trim();
        if (!prompt) return;
        
        const contextText = decodeURIComponent(encodedContext);
        e.target.disabled = true;
        e.target.value = "AI is thinking...";

        const modelDropdown = document.getElementById('sel-model');
        const selectedModel = modelDropdown ? modelDropdown.value : '';

        try {
            const response = await fetch('/api/ai/regen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt: prompt, 
                    context: contextText,
                    model: selectedModel 
                })
            });

            const data = await response.json();
            
            if (data.status === 'success') {
                const editor = document.getElementById('docstral-editor');
                if (!editor) return;

                editor.focus();
                const sel = window.getSelection();
                
                if (window.docstralLastCaretRange) {
                    sel.removeAllRanges();
                    sel.addRange(window.docstralLastCaretRange);
                } else {
                    sel.selectAllChildren(editor);
                    sel.collapseToEnd();
                }

                document.execCommand('insertText', false, data.text);
                
                if (typeof DocstralSync !== 'undefined') DocstralSync.scheduleSync();
                if (typeof showToast === 'function') showToast('The text is added!');
            } else {
                alert("AI Error: " + data.message);
            }
        } catch (err) {
            console.error("AI Error:", err);
            alert("Server connection error.");
        } finally {
            e.target.value = "";
            e.target.disabled = false;
            const container = document.getElementById(`regen-container-${id}`);
            if (container) container.classList.add('hidden');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    
    const fonts = ['Times New Roman', 'Arial', 'Calibri', 'Courier New', 'Georgia', 'Verdana', 'Comic Sans MS', 'Trebuchet MS', 'Impact', 'Tahoma'];
    const fontDropdown = document.getElementById('font-family-dropdown');
    const colorDropdown = document.getElementById('font-color-dropdown');
    
    const displayWrapper = document.getElementById('typography-display-wrapper');
    const displayText = document.getElementById('typography-display-text');

    if (fontDropdown) {
        fontDropdown.innerHTML = fonts.map(f => 
            `<button class="w-full text-left px-4 py-1.5 text-[13px] text-[#3E2723] hover:bg-[#F5E6D3] transition-colors" style="font-family: '${f}'" data-font="${f}">${f}</button>`
        ).join('');
    }

    document.getElementById('btn-font-family')?.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        fontDropdown?.classList.toggle('hidden');
        colorDropdown?.classList.add('hidden');
    });

    document.getElementById('btn-font-color')?.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        colorDropdown?.classList.toggle('hidden');
        fontDropdown?.classList.add('hidden');
    });

    document.addEventListener('click', () => {
        fontDropdown?.classList.add('hidden');
        colorDropdown?.classList.add('hidden');
    });

    window.applyTypography = function(type, value) {
        document.execCommand('styleWithCSS', false, true);

        if (type === 'fontName') {
            document.execCommand('fontName', false, value);
        } 
        else if (type === 'foreColor') {
            document.execCommand('foreColor', false, value);
        } 
        else if (type === 'fontSize') {
            const node = window.getSelection().focusNode;
            if (!node) return;
            const element = node.nodeType === 3 ? node.parentElement : node;
            const currentPx = parseFloat(window.getComputedStyle(element).fontSize);
            const currentPt = Math.round(currentPx * 0.75); 
            
            let newSize = currentPt + value;
            if (newSize < 4) newSize = 4; 
            if (newSize > 72) newSize = 72;

            document.execCommand('fontSize', false, '7');
            const giantFonts = document.querySelectorAll('font[size="7"], span[style*="xx-large"]');
            giantFonts.forEach(f => {
                f.removeAttribute('size');
                f.style.fontSize = newSize + 'pt';
            });
        }

        if (typeof DocstralSync !== 'undefined') DocstralSync.scheduleSync();
        updateTypographyDisplay(); 
    };

    fontDropdown?.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') applyTypography('fontName', e.target.getAttribute('data-font'));
    });

    document.querySelectorAll('#basic-color-palette button').forEach(btn => {
        btn.addEventListener('click', (e) => applyTypography('foreColor', e.target.getAttribute('data-color')));
    });

    document.getElementById('custom-color-picker')?.addEventListener('input', (e) => {
        applyTypography('foreColor', e.target.value);
    });

    let fontChangeInterval;
    const startFontChange = (val) => {
        applyTypography('fontSize', val);
        fontChangeInterval = setInterval(() => applyTypography('fontSize', val), 150);
    };
    const stopFontChange = () => clearInterval(fontChangeInterval);

    const btnMinus = document.getElementById('btn-font-minus');
    const btnPlus = document.getElementById('btn-font-plus');

    if(btnMinus) {
        btnMinus.addEventListener('mousedown', (e) => { e.preventDefault(); startFontChange(-1); });
        btnMinus.addEventListener('mouseup', stopFontChange);
        btnMinus.addEventListener('mouseleave', stopFontChange);
    }
    if(btnPlus) {
        btnPlus.addEventListener('mousedown', (e) => { e.preventDefault(); startFontChange(1); });
        btnPlus.addEventListener('mouseup', stopFontChange);
        btnPlus.addEventListener('mouseleave', stopFontChange);
    }

    function updateTypographyDisplay() {
        const displayText = document.getElementById('typography-display-text');
        if (!displayText) return;
        
        const sel = window.getSelection();
        const docWindow = document.getElementById('docstral-window');
        
        if (docWindow && docWindow.classList.contains('is-windowed')) return;

        if (!sel || sel.rangeCount === 0) {
            displayText.innerText = "";
            return;
        }
        
        const range = sel.getRangeAt(0);
        const node = sel.focusNode;
        if (!node) return;
        
        const element = node.nodeType === 3 ? node.parentNode : node;
        
        if (!element || !element.closest('#docstral-editor')) {
            displayText.innerText = "";
            return;
        }

        let isMixed = false;

        if (!sel.isCollapsed) {
            const container = range.commonAncestorContainer;
            const rootNode = container.nodeType === 3 ? container.parentNode : container;
            
            const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null, false);

            let firstFont = null;
            let firstSize = null;
            let currentNode;

            while ((currentNode = walker.nextNode())) {
                if (range.intersectsNode(currentNode) && currentNode.nodeValue.trim().length > 0) {
                    const style = window.getComputedStyle(currentNode.parentElement);
                    const font = style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
                    const size = style.fontSize;
                    
                    if (!firstFont) {
                        firstFont = font;
                        firstSize = size;
                    } else if (firstFont !== font || firstSize !== size) {
                        isMixed = true;
                        break;
                    }
                }
            }
        }

        if (isMixed) {
            displayText.innerText = "Mixture of fonts";
        } else {
            const style = window.getComputedStyle(element);
            const ptSize = Math.round(parseFloat(style.fontSize) * 0.75);
            const cleanFontName = style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();

            displayText.innerText = `${cleanFontName}, ${ptSize}pt`;
        }
    }

    document.addEventListener('selectionchange', updateTypographyDisplay);
    document.getElementById('docstral-workspace')?.addEventListener('click', updateTypographyDisplay);
    document.getElementById('docstral-workspace')?.addEventListener('keyup', updateTypographyDisplay);
    
    document.getElementById('docstral-btn-max')?.addEventListener('click', () => {
        setTimeout(updateTypographyDisplay, 50);
    });
});

const TableManager = {
    state: {
        ruler: { active: 0, scale: 1, startX: 0, startY: 0, line: null, label: null },
        selectedCells: new Set(),
        activeTable: null,
        isSelecting: false, 
        dragged: false, 
        startCoords: null, 
        wasAlreadySelected: false,
        resizing: { el: null, type: '', startX: 0, startY: 0, startW: 0, startH: 0 }
    },

    init() {
        this.injectRulerStyles();
        this.bindEvents();
    },

    injectRulerStyles() {
        if (!document.getElementById('ruler-cursor-style')) {
            const style = document.createElement('style'); style.id = 'ruler-cursor-style';
            style.innerHTML = `.ruler-active-cursor, .ruler-active-cursor * { cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="none" stroke="%23D4A373" stroke-width="2"/><circle cx="10" cy="10" r="2" fill="%23D4A373"/></svg>') 10 10, auto !important; }`;
            document.head.appendChild(style);
        }
    },

    getCellCoords(td) {
        const tr = td.parentElement;
        const tbody = tr.parentElement;
        return {
            r: Array.prototype.indexOf.call(tbody.children, tr),
            c: Array.prototype.indexOf.call(tr.children, td)
        };
    },

    bindEvents() {
        document.addEventListener('click', (e) => this.handleRulerClick(e), true);
        document.addEventListener('mousemove', (e) => this.handleRulerMove(e));

        document.getElementById('docstral-btn-media')?.addEventListener('click', () => {
            if (typeof openSidebarSmoothly === 'function') openSidebarSmoothly('AI Tables & Tools');
            this.buildSidebarUI();
        });

        document.addEventListener('mousedown', (e) => {
            const isSidebar = e.target.closest('#docstral-sidebar') || 
                              e.target.closest('#docstral-sidebar-panel') || 
                              e.target.closest('#docstral-sidebar-content');
            const isTable = e.target.closest('.docstral-table');

            if (!isTable && !isSidebar) {
                this.clearCellSelection();
                this.lockAllCells();
                this.state.activeTable = null;
            }
        });

        const workspace = document.getElementById('docstral-workspace');
        if (!workspace) return;

        workspace.addEventListener('mousedown', (e) => {
            const td = e.target.closest('td[data-cell]');
            
            if (td) {
                if (td.getAttribute('contenteditable') === 'true') return;

                e.preventDefault(); 
                this.lockAllCells();

                this.state.isSelecting = true;
                this.state.dragged = false;
                this.state.activeTable = td.closest('table');
                this.state.startCoords = this.getCellCoords(td);
                this.state.wasAlreadySelected = td.classList.contains('cell-selected');

                if (typeof openSidebarSmoothly === 'function') {
                    const sidebar = document.getElementById('docstral-sidebar');
                    if (sidebar && sidebar.classList.contains('hidden')) {
                        openSidebarSmoothly('AI Tables & Tools');
                        this.buildSidebarUI();
                    }
                }

                if (e.ctrlKey || e.metaKey) {
                    this.toggleCellSelection(td);
                } else {
                    this.clearCellSelection(true); 
                    this.toggleCellSelection(td, true);
                }
            }
        });

        workspace.addEventListener('mouseover', (e) => {
            if (this.state.isSelecting && this.state.activeTable && !e.ctrlKey) {
                const td = e.target.closest('td[data-cell]');
                if (td && td.closest('table') === this.state.activeTable && td.getAttribute('contenteditable') !== 'true') {
                    
                    this.state.dragged = true;
                    const currentCoords = this.getCellCoords(td);
                    
                    this.clearCellSelection(true);
                    const minR = Math.min(this.state.startCoords.r, currentCoords.r);
                    const maxR = Math.max(this.state.startCoords.r, currentCoords.r);
                    const minC = Math.min(this.state.startCoords.c, currentCoords.c);
                    const maxC = Math.max(this.state.startCoords.c, currentCoords.c);

                    const rows = this.state.activeTable.querySelectorAll('tr');
                    for(let r = minR; r <= maxR; r++) {
                        if(!rows[r]) continue;
                        for(let c = minC; c <= maxC; c++) {
                            const cell = rows[r].children[c];
                            if (cell) this.toggleCellSelection(cell, true, true);
                        }
                    }
                    this.updateSidebarSelection();
                }
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (this.state.isSelecting) {
                this.state.isSelecting = false;
                const td = e.target.closest('td[data-cell]');
                if (!this.state.dragged && td && this.state.wasAlreadySelected && !e.ctrlKey) {
                    this.clearCellSelection();
                }
            }
            this.stopResize();
        });

        workspace.addEventListener('dblclick', (e) => {
            const td = e.target.closest('td[data-cell]');
            if (td) {
                this.clearCellSelection();
                td.setAttribute('contenteditable', 'true');
                td.focus();
                const sel = window.getSelection();
                sel.selectAllChildren(td);
                sel.collapseToEnd();
            }
        });

        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.selectedCells.size > 0) {
                if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
                e.preventDefault();
                this.state.selectedCells.forEach(td => td.innerHTML = '<br>');
                if (window.DocstralSync) DocstralSync.scheduleSync();
            }
        });

        workspace.addEventListener('mousemove', (e) => {
            if (this.state.resizing.el) {
                this.doResize(e);
                return;
            }

            const td = e.target.closest('td, th');
            if (!td || td.getAttribute('contenteditable') === 'true') return;

            const rect = td.getBoundingClientRect();
            const edgeThreshold = 5;

            if (Math.abs(e.clientX - rect.right) < edgeThreshold) {
                td.style.cursor = 'col-resize';
                td.onmousedown = (ev) => { if(td.style.cursor === 'col-resize') this.startResize(ev, td, 'col'); };
            } else if (Math.abs(e.clientY - rect.bottom) < edgeThreshold) {
                td.style.cursor = 'row-resize';
                td.onmousedown = (ev) => { if(td.style.cursor === 'row-resize') this.startResize(ev, td, 'row'); };
            } else {
                td.style.cursor = 'cell';
                td.onmousedown = null;
            }
        });
    },

    lockAllCells() {
        document.querySelectorAll('td[data-cell][contenteditable="true"]').forEach(c => {
            c.setAttribute('contenteditable', 'false');
        });
    },

    buildSidebarUI() {
        const content = document.getElementById('docstral-sidebar-content');
        if (!content) return;

        const isRulerOn = this.state.ruler.active > 0;
        const btnClass = isRulerOn ? 'bg-[#D4A373] text-white' : 'bg-[#FDFBF7] text-[#D4A373] hover:bg-[#D4A373] hover:text-white';

        content.innerHTML = `
                    <div id="tables-sidebar-wrapper" class="flex flex-col h-full text-[#3E2723] p-1 overflow-y-auto custom-scrollbar pb-10">

                        <div class="mb-4">
                            <div class="text-[12px] font-bold text-[#8D6E63] uppercase mb-4 text-center">Create table</div>
                            <div class="flex gap-4 mb-4">
                                <div class="flex-1">
                                    <label class="block text-[10px] font-bold text-[#8D6E63] mb-1 text-center">Rows</label>
                                    <input type="number" id="tbl-rows" min="1" max="20" value="3" class="tbl-input w-full bg-[#FDFBF7] border border-[#D4A373]/40 rounded py-1.5 text-center text-[#3E2723] outline-none focus:border-[#D4A373]">
                                </div>
                                <div class="flex-1">
                                    <label class="block text-[10px] font-bold text-[#8D6E63] mb-1 text-center">Columns</label>
                                    <input type="number" id="tbl-cols" min="1" max="10" value="3" class="tbl-input w-full bg-[#FDFBF7] border border-[#D4A373]/40 rounded py-1.5 text-center text-[#3E2723] outline-none focus:border-[#D4A373]">
                                </div>
                            </div>
                            <button onclick="TableManager.insertTable()" class="tbl-btn-std w-full py-1.5 bg-[#FDFBF7] border border-[#D4A373]/40 rounded text-[12px] font-bold text-[#D4A373] hover:bg-[#D4A373] hover:text-white transition-colors uppercase shadow-sm">
                                <i class="fa-solid fa-table-cells mr-1"></i> Insert table
                            </button>
                        </div>

                        <div class="tbl-edit-panel bg-[#F5E6D3]/50 p-2 rounded border border-[#D4A373]/30 mb-6">
                            <div class="text-[12px] font-bold text-[#8D6E63] uppercase mb-2 text-center">Editing a marked table</div>
                            <div class="grid grid-cols-4 gap-1">
                                <button onclick="TableManager.modifyTable('add-row-up')" class="tbl-btn-std py-1.5 bg-white border border-[#D4A373]/50 rounded text-[#D4A373] hover:bg-[#D4A373] hover:text-white text-xs" title="Row above"><i class="fa-solid fa-arrow-up"></i></button>
                                <button onclick="TableManager.modifyTable('add-row-down')" class="tbl-btn-std py-1.5 bg-white border border-[#D4A373]/50 rounded text-[#D4A373] hover:bg-[#D4A373] hover:text-white text-xs" title="Row below"><i class="fa-solid fa-arrow-down"></i></button>
                                <button onclick="TableManager.modifyTable('add-col-left')" class="tbl-btn-std py-1.5 bg-white border border-[#D4A373]/50 rounded text-[#D4A373] hover:bg-[#D4A373] hover:text-white text-xs" title="Column Left"><i class="fa-solid fa-arrow-left"></i></button>
                                <button onclick="TableManager.modifyTable('add-col-right')" class="tbl-btn-std py-1.5 bg-white border border-[#D4A373]/50 rounded text-[#D4A373] hover:bg-[#D4A373] hover:text-white text-xs" title="Column Right"><i class="fa-solid fa-arrow-right"></i></button>
                            </div>
                            <div class="grid grid-cols-2 gap-1 mt-1">
                                <button onclick="TableManager.modifyTable('del-row')" class="tbl-btn-red py-1.5 bg-red-50 border border-red-200 rounded text-red-500 hover:bg-red-500 hover:text-white text-[12px] font-bold uppercase transition-colors"><i class="fa-solid fa-grip-lines mr-1"></i> Delete row</button>
                                <button onclick="TableManager.modifyTable('del-col')" class="tbl-btn-red py-1.5 bg-red-50 border border-red-200 rounded text-red-500 hover:bg-red-500 hover:text-white text-[12px] font-bold uppercase transition-colors"><i class="fa-solid fa-grip-lines-vertical mr-1"></i> Delete column</button>
                                <button onclick="TableManager.modifyTable('del-table')" class="tbl-btn-red-strong col-span-2 mt-1 py-1.5 bg-red-100 border border-red-300 rounded text-red-600 hover:bg-red-500 hover:text-white text-[12px] font-bold uppercase transition-colors shadow-sm"><i class="fa-solid fa-trash mr-1"></i> Delete table</button>
                            </div>
                        </div>

                        <div class="border-t border-[#D4A373]/20 pt-4 mb-4">
                            <div class="text-[12px] font-black text-[#D4A373] uppercase mb-2 text-center tracking-widest"><i class="fa-solid fa-fire-flame-simple"></i> AI Table Assistant</div>

                            <label class="block text-[12px] font-bold text-[#8D6E63] mb-1">Marked cells for context:</label>
                            <div id="ai-selected-cells" class="tbl-ai-box w-full min-h-[28px] max-h-[80px] overflow-y-auto bg-white border border-[#D4A373]/40 rounded p-1.5 text-[12px] text-[#D4A373] font-mono mb-4 break-words custom-scrollbar">
                                There are no marked cells.
                            </div>

                            <label class="block text-[12px] font-bold text-[#8D6E63] mb-1">Enter a prompt here:</label>
                            <textarea id="ai-table-prompt" rows="3" placeholder="(example): Explain me this... (Press Enter)" class="tbl-input w-full bg-[#FDFBF7] border border-[#D4A373]/40 rounded p-2 text-xs text-[#3E2723] outline-none focus:border-[#D4A373] mb-3 resize-none"></textarea>

                            <button onclick="TableManager.generateAIAnswer()" class="tbl-btn-ai-gen w-full py-1.5 bg-[#3E2723] border border-[#D4A373]/40 rounded text-[12px] font-bold text-[#D4A373] hover:bg-[#5D4037] transition-colors uppercase shadow-sm mb-3">
                                Generate Answer
                            </button>

                            <div class="flex flex-col gap-2">
                                <button onclick="TableManager.quickAI('Explain to me the logic and relationship between the data in the table as an expert.')" class="tbl-btn-explain w-full py-1.5 bg-[#F5E6D3] border border-[#D4A373]/50 rounded text-[12px] font-bold text-[#3E2723] hover:bg-[#D4A373]/50 transition-colors shadow-sm">EXPLAIN DATA</button>
                                <button onclick="TableManager.quickAI('Generate a Python script (Pandas) that creates a DataFrame with this data and exports it to an .xlsx file.')" class="tbl-btn-pandas w-full py-1.5 bg-green-50 border border-green-200 rounded text-[12px] font-bold text-green-700 hover:bg-green-100 transition-colors shadow-sm"><i class=" mr-1"></i> EXPORT TO PYTHON PANDAS</button>
                            </div>
                        </div>

                        <button id="btn-ruler-global" onclick="TableManager.toggleRuler()" class="tbl-btn-std mt-auto w-full py-1.5 bg-white border border-[#D4A373]/40 rounded text-[12px] font-bold text-[#D4A373] hover:bg-[#D4A373] hover:text-white transition-colors uppercase shadow-sm ${btnClass}">
                            <i class="fa-solid fa-ruler mr-1"></i> Ruler (On/Off)
                        </button>

                    </div>
        `;
        this.updateSidebarSelection();

        const promptInput = document.getElementById('ai-table-prompt');
        if (promptInput) {
            promptInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.generateAIAnswer();
                }
            });
        }
    },

    toggleCellSelection(td, forceSelect = null, silent = false) {
        const isSelected = forceSelect !== null ? forceSelect : !td.classList.contains('cell-selected');
        if (isSelected) {
            td.classList.add('cell-selected');
            this.state.selectedCells.add(td);
        } else {
            td.classList.remove('cell-selected');
            this.state.selectedCells.delete(td);
        }
        if (!silent) this.updateSidebarSelection();
    },

    clearCellSelection(silent = false) {
        this.state.selectedCells.forEach(td => td.classList.remove('cell-selected'));
        this.state.selectedCells.clear();
        if (!silent) this.updateSidebarSelection();
    },

    updateSidebarSelection() {
        const display = document.getElementById('ai-selected-cells');
        if (!display) return;

        if (this.state.selectedCells.size === 0) {
            display.innerHTML = '<span class="opacity-50">No marked cells</span>';
            return;
        }

        const refs = Array.from(this.state.selectedCells).map(td => td.getAttribute('data-cell')).filter(Boolean).sort();
        display.innerText = refs.join(', ');
    },

    startResize(e, td, type) {
        e.preventDefault();
        e.stopPropagation();
        this.state.resizing = { el: td, type: type, startX: e.clientX, startY: e.clientY, startW: td.offsetWidth, startH: td.offsetHeight };
        
        const table = td.closest('table');
        table.querySelectorAll('td').forEach(cell => {
            cell.style.width = cell.offsetWidth + 'px';
            cell.style.minWidth = '';
            cell.style.maxWidth = '';
        });
    },

    doResize(e) {
        const r = this.state.resizing;
        if (!r.el) return;

        if (r.type === 'col') {
            const newW = r.startW + (e.clientX - r.startX);
            if (newW > 30) {
                const tr = r.el.parentElement;
                const colIdx = Array.prototype.indexOf.call(tr.children, r.el);
                const table = tr.closest('table');
                
                const rows = table.querySelectorAll('tr');
                rows.forEach(row => {
                    const cell = row.children[colIdx];
                    if (cell) {
                        cell.style.width = `${newW}px`;
                    }
                });
            }
        } else if (r.type === 'row') {
            const newH = r.startH + (e.clientY - r.startY);
            if (newH > 20) r.el.parentElement.style.height = `${newH}px`;
        }
    },

    stopResize() {
        if (this.state.resizing.el) {
            this.state.resizing = { el: null, type: '', startX: 0, startY: 0, startW: 0, startH: 0 };
            if (window.DocstralSync) DocstralSync.scheduleSync();
        }
    },

    modifyTable(action) {
        const table = this.state.activeTable;
        if (!table) {
            alert("Please highlight a cell in the table you want to edit.");
            return;
        }

        if (action === 'del-table') {
            if (confirm("Are you sure you want to delete the entire table?")) {
                table.remove();
                this.clearCellSelection();
                this.state.activeTable = null;
                if (window.DocstralSync) DocstralSync.scheduleSync();
            }
            return;
        }

        let td = Array.from(this.state.selectedCells)[0];
        if (!td) td = table.querySelector('td');
        
        const tr = td.parentElement;
        const tbody = table.querySelector('tbody');
        const colIndex = Array.from(tr.children).indexOf(td);

        if (action === 'add-row-up' || action === 'add-row-down') {
            const newRow = document.createElement('tr');
            Array.from(tr.children).forEach((cell) => {
                const width = cell.style.width || '100px';
                newRow.innerHTML += `<td style="border: 1px solid #D4A373; padding: 8px; width: ${width};" contenteditable="false"><br></td>`;
            });
            if (action === 'add-row-up') tr.parentNode.insertBefore(newRow, tr);
            else tr.parentNode.insertBefore(newRow, tr.nextSibling);
        } 
        else if (action === 'add-col-left' || action === 'add-col-right') {
            const rows = table.querySelectorAll('tr');
            rows.forEach(row => {
                const newTd = document.createElement('td');
                newTd.style.cssText = "border: 1px solid #D4A373; padding: 8px; width: 100px;";
                newTd.setAttribute('contenteditable', 'false');
                newTd.innerHTML = '<br>';
                const targetCell = row.children[colIndex];
                if (action === 'add-col-left') row.insertBefore(newTd, targetCell);
                else row.insertBefore(newTd, targetCell.nextSibling);
            });
        }
        else if (action === 'del-row') {
            if (tbody.children.length > 1) tr.remove();
            else table.remove(); 
        }
        else if (action === 'del-col') {
            if (tr.children.length > 1) {
                table.querySelectorAll('tr').forEach(row => row.children[colIndex].remove());
            } else {
                table.remove();
            }
        }

        if (document.body.contains(table)) this.reindexTable(table);
        this.clearCellSelection();
        if (window.DocstralSync) DocstralSync.scheduleSync();
    },

    reindexTable(table) {
        const rows = table.querySelectorAll('tr');
        rows.forEach((row, rIdx) => {
            Array.from(row.children).forEach((cell, cIdx) => {
                const colLetter = String.fromCharCode(65 + cIdx); 
                const rowNum = rIdx + 1;
                const ref = `${colLetter}${rowNum}`;
                cell.setAttribute('data-cell', ref);
                cell.id = `${table.id}_${ref}`;
            });
        });
    },

    insertTable() {
        const rows = parseInt(document.getElementById('tbl-rows').value) || 3;
        const cols = parseInt(document.getElementById('tbl-cols').value) || 3;

        if (window.docstralLastCaretRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(window.docstralLastCaretRange);
        } else {
            document.querySelector('.docstral-page-a4')?.focus();
        }

        const tableId = 'tbl_' + Math.random().toString(36).substr(2, 9);
        const blockId = 'b-' + Date.now();
        
        let tableHTML = `<table id="${tableId}" data-block-id="${blockId}" class="docstral-table" data-type="ai-calc-table"><tbody>`;
        for (let r = 0; r < rows; r++) {
            tableHTML += `<tr>`;
            for (let c = 0; c < cols; c++) {
                const ref = `${String.fromCharCode(65 + c)}${r + 1}`; 
                tableHTML += `<td id="${tableId}_${ref}" data-cell="${ref}" contenteditable="false" style="width: 100px;"><br></td>`;
            }
            tableHTML += `</tr>`;
        }
        tableHTML += `</tbody></table><p><br></p>`;

        document.execCommand('insertHTML', false, tableHTML);
        setTimeout(() => { if (window.DocstralSync) DocstralSync.scheduleSync(); }, 100);
    },

    quickAI(actionPrompt) {
        document.getElementById('ai-table-prompt').value = actionPrompt;
        this.generateAIAnswer();
    },

    async generateAIAnswer() {
        const promptInput = document.getElementById('ai-table-prompt');
        const prompt = promptInput.value;
        if (!prompt || !this.state.activeTable) {
            alert("Please select table/cells and enter prompt.");
            return;
        }

        const extractText = (td) => {
            let clone = td.cloneNode(true);
            clone.innerHTML = clone.innerHTML.replace(/<br\s*[\/]?>/gi, " ");
            return clone.textContent.trim().replace(/\s+/g, ' '); 
        };

        const table = this.state.activeTable;
        const rows = table.querySelectorAll('tr');
        
        let semanticContext = "Table Structure (Coordinates and Values):\n";
        
        rows.forEach((row, rIdx) => {
            const rowNum = rIdx + 1;
            semanticContext += `Row ${rowNum}: `;
            
            const rowData = Array.from(row.children).map((td, cIdx) => {
                const colLetter = String.fromCharCode(65 + cIdx);
                const val = extractText(td) || "-";
                return `[${colLetter}${rowNum}: "${val}"]`;
            });
            
            semanticContext += rowData.join(" | ") + "\n";
        });

        let focusInstruction = "";
        if (this.state.selectedCells.size > 0) {
            const refs = Array.from(this.state.selectedCells).map(td => td.getAttribute('data-cell')).filter(Boolean).sort();
            focusInstruction = `\n\nUSER FOCUS: The user has specifically marked the following cells: [${refs.join(', ')}]. Use the data from them for your answer.`;
        }

        const finalContext = "You are an expert in data analysis. Here is the data submitted:\n\n" + semanticContext + focusInstruction;

        const resultBlockId = 'b-' + Date.now();
        const resultP = document.createElement('p');
        resultP.setAttribute('data-block-id', resultBlockId);
        resultP.setAttribute('data-layer', 'base');
        resultP.innerHTML = `<i style="color: #D4A373;">AI is thinking...</i>`;
        
        table.parentNode.insertBefore(resultP, table.nextSibling);

        try {
            const modelDropdown = document.getElementById('sel-model');
            const selectedModel = modelDropdown ? modelDropdown.value : '';

            const response = await fetch('/api/ai/regen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt: prompt, 
                    context: finalContext,
                    model: selectedModel 
                })
            });

            const data = await response.json();
            if (data.status === 'success') {
                if (prompt.includes('Pandas') || prompt.includes('Python')) {
                    resultP.innerHTML = `<span style="background: rgba(212, 163, 115, 0.1); padding: 4px; border-radius: 4px; font-weight: bold;">AI Code:</span><br><pre style="background:#2b2b2b; color:#a6e22e; padding:10px; border-radius:6px; font-size:12px; overflow-x:auto;">${data.text}</pre>`;
                } else {
                    resultP.innerHTML = `<span style="background: rgba(212, 163, 115, 0.1); padding: 4px; border-radius: 4px; font-weight: bold;">AI answer:</span> ${data.text}`;
                }
            } else {
                resultP.innerText = `Error: ${data.message}`;
            }
        } catch (err) {
            resultP.innerText = "Server connection error.";
        }

        promptInput.value = '';
        this.clearCellSelection();
        if (window.DocstralSync) DocstralSync.scheduleSync();
    },

    pxToMm(px) { return parseFloat(px) * 0.264583333; },
    formatMm(mm) { return mm.toFixed(1).replace('.', ',') + ' mm'; },

    toggleRuler() {
        const btn = document.getElementById('btn-ruler-global');
        if (this.state.ruler.active > 0) {
            this.state.ruler.active = 0;
            if (btn) btn.classList.remove('bg-[#D4A373]', 'text-white');
            document.body.classList.remove('ruler-active-cursor');
            this.removeRulerVisuals();
        } else {
            this.state.ruler.active = 1;
            if (btn) btn.classList.add('bg-[#D4A373]', 'text-white');
            document.body.classList.add('ruler-active-cursor');
        }
    },

    handleRulerClick(e) {
        if (this.state.ruler.active === 0 || e.target.closest('#docstral-sidebar-panel')) return;
        const r = this.state.ruler;

        if (r.active === 1) {
            r.active = 2; r.startX = e.pageX; r.startY = e.pageY;
            const page = document.querySelector('.docstral-page-a4');
            r.scale = page ? (page.getBoundingClientRect().width / page.offsetWidth) : 1;

            r.line = document.createElement('div');
            r.line.style.cssText = `position: absolute; height: 0px; border-top: 2px dashed #D4A373; transform-origin: 0 50%; z-index: 99999; left: ${r.startX}px; top: ${r.startY}px; pointer-events: none;`;
            r.label = document.createElement('div');
            r.label.style.cssText = `position: absolute; background-color: #3E2723; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; z-index: 99999; pointer-events: none; box-shadow: 0 2px 5px rgba(0,0,0,0.2);`;

            document.body.appendChild(r.line); document.body.appendChild(r.label);
        } else if (r.active === 2) { r.active = 3; } 
        else if (r.active === 3) { this.removeRulerVisuals(); r.active = 1; }
    },

    handleRulerMove(e) {
        const r = this.state.ruler;
        if (r.active !== 2 || !r.line) return;
        const dx = e.pageX - r.startX, dy = e.pageY - r.startY;
        const distancePx = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        r.line.style.width = distancePx + 'px';
        r.line.style.transform = `rotate(${angle}deg)`;
        r.label.style.left = (e.pageX + 15) + 'px';
        r.label.style.top = (e.pageY + 15) + 'px';
        r.label.innerText = this.formatMm(this.pxToMm(distancePx / r.scale));
    },

    removeRulerVisuals() {
        if (this.state.ruler.line) { this.state.ruler.line.remove(); this.state.ruler.line = null; }
        if (this.state.ruler.label) { this.state.ruler.label.remove(); this.state.ruler.label = null; }
    }
};

// Initializes the TableManager module, setting up state and event listeners for interactive table manipulation.
TableManager.init();

document.addEventListener('DOMContentLoaded', () => {
    const btnLines = document.getElementById('btn-sidebar-lines') || document.getElementById('btn-sidebar-pages');

    if (!btnLines) {
        console.error("LineManager: The button is missing inside the HTML!");
        return;
    }

    const LineManager = {
        selectedIndices: new Set(),
        observer: null,

        init() {
            const newBtn = btnLines.cloneNode(true);
            btnLines.parentNode.replaceChild(newBtn, btnLines);

            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                
                const editor = document.getElementById('docstral-editor');
                if (!editor) {
                    if(typeof showToast === 'function') showToast("Please open a document first.");
                    else alert("Please select a document.");
                    return;
                }

                if (typeof window.openSidebarSmoothly === 'function') {
                    window.openSidebarSmoothly('Lines Management');
                } else if (typeof window.openDocstralSidebar === 'function') {
                    window.openDocstralSidebar('Lines Management', ''); 
                }

                this.buildSidebarUI();
                this.renderLinesList();
                this.setupRealTimeObserver(); 
            });
        },

        setupRealTimeObserver() {
            const editor = document.getElementById('docstral-editor');
            if (!editor) return;
            if (this.observer) this.observer.disconnect();

            let debounceTimer = null;

            this.observer = new MutationObserver(() => {
                if (!document.getElementById('lm-lines-list')) return;

                clearTimeout(debounceTimer);
                
                debounceTimer = setTimeout(() => {
                    this.renderLinesList();
                }, 300);
            });

            this.observer.observe(editor, { childList: true, subtree: true, characterData: true });
        },

        buildSidebarUI() {
            const content = document.getElementById('docstral-sidebar-content');
            if (!content) return;

            content.innerHTML = `
                <style>
                    #lm-lines-list button, #lm-lines-list .line-item {
                        padding-top: 3px !important;
                        padding-bottom: 3px !important;
                        font-size: 11px !important;
                        min-height: 24px !important;
                        line-height: 1.2 !important;
                    }
                </style>

                <div id="lm-sidebar-wrapper" class="flex flex-col h-full pb-2">
                    
                    <div class="h-1/2 flex flex-col p-1 overflow-y-auto custom-scrollbar">
                        
                        <div class="lm-panel p-2 rounded-lg mb-2 mx-1 mt-1 shrink-0">
                            
                            <div class="flex items-center gap-1.5 mb-1.5">
                                <input type="number" id="lm-input-before" placeholder="N" min="1" max="50" class="lm-input w-10 rounded px-1 py-1 text-center text-[12px] outline-none shadow-inner">
                                <button id="lm-btn-before" class="lm-btn-std flex-1 py-1.5 rounded text-[12px] font-bold uppercase transition-colors shadow-sm">Add Before</button>
                            </div>
                    
                            <div class="flex items-center gap-1.5 mb-2.5">
                                <input type="number" id="lm-input-after" placeholder="N" min="1" max="50" class="lm-input w-10 rounded px-1 py-1 text-center text-[12px] outline-none shadow-inner">
                                <button id="lm-btn-after" class="lm-btn-std flex-1 py-1.5 rounded text-[12px] font-bold uppercase transition-colors shadow-sm">Add After</button>
                            </div>
                    
                            <div class="flex gap-1.5">
                                <button id="lm-del-all" class="lm-btn-red flex-1 py-1.5 rounded text-[12px] font-bold uppercase transition-colors shadow-sm"><i class="fa-solid fa-trash-can mr-1"></i> Delete All</button>
                                <button id="lm-del-sel" class="lm-btn-std flex-1 py-1.5 rounded text-[12px] font-bold uppercase transition-colors shadow-sm"><i class="fa-solid fa-check-double mr-1"></i> Delete Selected</button>
                            </div>
                        </div>
                    
                        <div class="mb-2 mx-1 shrink-0">
                            <label class="lm-label block text-[12px] font-bold mb-1.5 uppercase tracking-widest">Remove Specific (e.g. 1, 2-5)</label>
                            <div class="flex gap-2">
                                <input type="text" id="lm-input-remove" placeholder="1, 2-5" class="lm-input flex-1 rounded px-2 py-1 text-[12px] outline-none shadow-inner">
                                <button id="lm-btn-remove" class="lm-btn-red w-8 rounded transition-colors shadow-sm flex justify-center items-center" title="Remove lines">
                                    <i class="fa-solid fa-trash-can text-[12px]"></i>
                                </button>
                            </div>
                        </div>
                        
                    </div> 
                    
                    <div class="h-1/2 flex flex-col pt-2 px-2 border-t-2 border-[#D4A373]/20 mt-1">
                        
                        <div class="lm-header-bar flex justify-between items-center pb-1.5 mb-1.5 shrink-0 border-b border-[#D4A373]/20">
                            <span class="lm-label text-[12px] font-bold uppercase tracking-widest">Doc Lines</span>
                            
                            <div class="lm-chk-wrapper flex items-center gap-2 px-1.5 py-0.5 rounded border border-[#D4A373]/30">
                                <label class="lm-chk-label flex items-center gap-1 cursor-pointer text-[12px] font-bold uppercase"><input type="checkbox" id="lm-chk-all" class="accent-[#D4A373] w-3.5 h-3.5"> All</label>
                                <label class="lm-chk-label flex items-center gap-1 cursor-pointer text-[12px] font-bold uppercase"><input type="checkbox" id="lm-chk-even" class="accent-[#D4A373] w-3.5 h-3.5"> Even</label>
                                <label class="lm-chk-label flex items-center gap-1 cursor-pointer text-[12px] font-bold uppercase"><input type="checkbox" id="lm-chk-odd" class="accent-[#D4A373] w-3.5 h-3.5"> Odd</label>
                            </div>
                        </div>
                        
                        <div id="lm-lines-list" class="flex-1 flex flex-col gap-[2px] overflow-y-auto custom-scrollbar pb-2 pr-1">
                        </div>
                        
                    </div> 
                </div>
            `;

            this.bindSidebarEvents();
        },

        bindSidebarEvents() {
            document.getElementById('lm-del-all').onclick = () => this.deleteAllLines();
            document.getElementById('lm-del-sel').onclick = () => this.deleteSelectedLines();
            
            const inputRemove = document.getElementById('lm-input-remove');
            const btnRemove = document.getElementById('lm-btn-remove');
            const execRemove = () => this.removeLinesByRange(inputRemove.value);
            btnRemove.onclick = execRemove;
            inputRemove.onkeydown = (e) => { if(e.key === 'Enter') execRemove(); };

            const inputBefore = document.getElementById('lm-input-before');
            const btnBefore = document.getElementById('lm-btn-before');
            const execBefore = () => this.addLinesToSelected(parseInt(inputBefore.value) || 1, 'before');
            btnBefore.onclick = execBefore;
            inputBefore.onkeydown = (e) => { if(e.key === 'Enter') execBefore(); };

            const inputAfter = document.getElementById('lm-input-after');
            const btnAfter = document.getElementById('lm-btn-after');
            const execAfter = () => this.addLinesToSelected(parseInt(inputAfter.value) || 1, 'after');
            btnAfter.onclick = execAfter;
            inputAfter.onkeydown = (e) => { if(e.key === 'Enter') execAfter(); };

            document.getElementById('lm-chk-all').onchange = (e) => this.massSelect('all', e.target.checked);
            document.getElementById('lm-chk-even').onchange = (e) => this.massSelect('even', e.target.checked);
            document.getElementById('lm-chk-odd').onchange = (e) => this.massSelect('odd', e.target.checked);
        },

        renderLinesList() {
            const listContainer = document.getElementById('lm-lines-list');
            if (!listContainer) return;

            const currentScroll = listContainer.scrollTop;
            listContainer.innerHTML = '';
            
            const editor = document.getElementById('docstral-editor');
            if (!editor) return;

            const lines = editor.querySelectorAll('.block-line');
            const newSelection = new Set();

            lines.forEach((line, index) => {
                const lineNum = index + 1;
                const isSelected = this.selectedIndices.has(lineNum);
                if (isSelected) newSelection.add(lineNum);

                let textPreview = line.textContent.trim().substring(0, 35);
                if (!textPreview) textPreview = '<Empty Line>';
                const tagType = line.tagName.toLowerCase();
                const row = document.createElement('div');
                row.className = `flex items-center justify-between p-2 mx-1 rounded border transition-colors ${isSelected ? 'bg-[#F5E6D3]/50 border-[#D4A373]/50 shadow-sm' : 'bg-white border-[#D4A373]/10 hover:border-[#D4A373]/40 hover:bg-[#FDFBF7]'}`;
                
                row.innerHTML = `
                        <label class="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                            <input type="checkbox" class="lm-row-chk accent-[#D4A373] w-4 h-4 shrink-0" data-line="${lineNum}" ${isSelected ? 'checked' : ''}>
                            <div class="flex flex-col min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="lm-line-text text-xs font-bold">Line ${lineNum}</span>
                                    <span class="lm-line-tag text-[9px] font-mono px-1 rounded uppercase">${tagType}</span>
                                </div>
                                <span class="lm-line-subtext text-[10px] truncate mt-0.5" title="${textPreview.replace(/"/g, '&quot;')}">${textPreview}</span>
                            </div>
                        </label>
                        <button class="lm-row-del shrink-0 px-2 py-1 rounded transition-colors ml-2" data-line="${lineNum}" title="Delete Line">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    `;

                const chk = row.querySelector('.lm-row-chk');
                chk.onchange = (e) => {
                    if (e.target.checked) this.selectedIndices.add(lineNum);
                    else this.selectedIndices.delete(lineNum);
                    
                    if(e.target.checked) row.className = `flex items-center justify-between p-2 mx-1 rounded border transition-colors bg-[#F5E6D3]/50 border-[#D4A373]/50 shadow-sm`;
                    else row.className = `flex items-center justify-between p-2 mx-1 rounded border transition-colors bg-white border-[#D4A373]/10 hover:border-[#D4A373]/40 hover:bg-[#FDFBF7]`;
                    
                    this.uncheckMassSelectors();
                };

                const delBtn = row.querySelector('.lm-row-del');
                delBtn.onclick = () => this.removeSpecificLine(lineNum);

                listContainer.appendChild(row);
            });

            this.selectedIndices = newSelection;
            listContainer.scrollTop = currentScroll; 
        },

        massSelect(type, isChecked) {
            const editor = document.getElementById('docstral-editor');
            if (!editor) return;
            const linesCount = editor.querySelectorAll('.block-line').length;

            if (type === 'all') {
                for (let i = 1; i <= linesCount; i++) {
                    if (isChecked) this.selectedIndices.add(i);
                    else this.selectedIndices.delete(i);
                }
                if(isChecked) {
                    document.getElementById('lm-chk-even').checked = false;
                    document.getElementById('lm-chk-odd').checked = false;
                }
            } else if (type === 'even') {
                for (let i = 1; i <= linesCount; i++) {
                    if (i % 2 === 0) { if (isChecked) this.selectedIndices.add(i); else this.selectedIndices.delete(i); }
                }
            } else if (type === 'odd') {
                for (let i = 1; i <= linesCount; i++) {
                    if (i % 2 !== 0) { if (isChecked) this.selectedIndices.add(i); else this.selectedIndices.delete(i); }
                }
            }
            this.renderLinesList();
        },

        uncheckMassSelectors() {
            document.getElementById('lm-chk-all').checked = false;
            document.getElementById('lm-chk-even').checked = false;
            document.getElementById('lm-chk-odd').checked = false;
        },

        deleteAllLines() {
            if (!confirm("Are you sure you want to delete ALL lines? Only one empty line will remain.")) return;
            const editor = document.getElementById('docstral-editor');
            if(!editor) return;
            
            editor.innerHTML = '';
            editor.appendChild(this.createBlankLine());
            this.finalizeAction();
        },

        deleteSelectedLines() {
            if (this.selectedIndices.size === 0) return alert("Select lines to delete first.");
            const indicesToDelete = Array.from(this.selectedIndices).sort((a, b) => b - a);
            this.executeDeletion(indicesToDelete);
        },

        removeLinesByRange(inputStr) {
            const editor = document.getElementById('docstral-editor');
            if(!editor) return;
            const maxLines = editor.querySelectorAll('.block-line').length;
            const linesToDelete = new Set();
            
            inputStr.split(',').forEach(part => {
                const range = part.trim().split('-');
                if (range.length === 2) {
                    const start = parseInt(range[0]);
                    const end = parseInt(range[1]);
                    if (!isNaN(start) && !isNaN(end)) {
                        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                            if (i >= 1 && i <= maxLines) linesToDelete.add(i);
                        }
                    }
                } else {
                    const num = parseInt(part);
                    if (!isNaN(num) && num >= 1 && num <= maxLines) linesToDelete.add(num);
                }
            });

            if (linesToDelete.size === 0) return alert("Invalid line numbers or range.");
            
            const indicesToDelete = Array.from(linesToDelete).sort((a, b) => b - a);
            this.executeDeletion(indicesToDelete);
            document.getElementById('lm-input-remove').value = ''; 
        },

        removeSpecificLine(lineNum) {
            this.executeDeletion([lineNum]);
        },

        executeDeletion(indicesArrayDesc) {
            const editor = document.getElementById('docstral-editor');
            if (!editor) return;
            const lines = editor.querySelectorAll('.block-line');

            indicesArrayDesc.forEach(lineNum => {
                const index = lineNum - 1; 
                if (lines[index]) {
                    lines[index].remove();
                }
            });

            if (editor.querySelectorAll('.block-line').length === 0) {
                editor.appendChild(this.createBlankLine());
            }

            this.finalizeAction();
        },

        addLinesToSelected(count, position) {
            if (this.selectedIndices.size === 0) return alert("Select at least one line to insert before/after.");
            if (count < 1 || count > 100) return alert("Please enter a valid number of lines (1-100).");

            const editor = document.getElementById('docstral-editor');
            if (!editor) return;
            const lines = editor.querySelectorAll('.block-line');

            const sortedSelected = Array.from(this.selectedIndices).sort((a, b) => b - a);

            sortedSelected.forEach(lineNum => {
                const targetLine = lines[lineNum - 1];
                if (!targetLine) return;

                const fragment = document.createDocumentFragment();
                for (let i = 0; i < count; i++) {
                    fragment.appendChild(this.createBlankLine()); 
                }

                if (position === 'before') {
                    targetLine.parentNode.insertBefore(fragment, targetLine);
                } else if (position === 'after') {
                    targetLine.parentNode.insertBefore(fragment, targetLine.nextSibling);
                }
            });

            document.getElementById('lm-input-before').value = '';
            document.getElementById('lm-input-after').value = '';
            this.finalizeAction();
        },

        createBlankLine() {
            const p = document.createElement('p');
            p.className = 'block-line';
            p.setAttribute('data-layer', 'base');
            p.setAttribute('data-block-id', `b-${Date.now()}${Math.floor(Math.random() * 1000)}`);
            p.innerHTML = '<br>';
            return p;
        },

        finalizeAction() {
            this.selectedIndices.clear(); 
            this.uncheckMassSelectors();
            
            if (window.DocstralSync) {
                window.DocstralSync.cancelSync(); 
                window.DocstralSync.executeSync(false); 
            }
        }
    };

    LineManager.init();
});

// Updates the text display in the user interface to reflect the currently active text formatting style.
document.addEventListener('DOMContentLoaded', () => {
    function updateFormatDisplay() {
        const displayText = document.getElementById('format-display-text');
        if (!displayText) return;

        const sel = window.getSelection();
        const docWindow = document.getElementById('docstral-window');

        if (docWindow && docWindow.classList.contains('is-windowed')) return;
        if (!sel || sel.rangeCount === 0) {
            displayText.innerText = "";
            return;
        }

        const node = sel.focusNode;
        if (!node) return;

        const element = node.nodeType === 3 ? node.parentNode : node;
        
        const block = element.closest('.block-line');
        if (!block || !block.closest('#docstral-editor')) {
            displayText.innerText = "";
            return;
        }

        const tag = block.tagName.toLowerCase();
        let formatName = "TEXT"; 

        if (tag === 'h5') formatName = "TITLE (T)";
        else if (tag === 'h1') formatName = "HEADING 1";
        else if (tag === 'h2') formatName = "HEADING 2";
        else if (tag === 'h3') formatName = "HEADING 3";
        else if (tag === 'h4') formatName = "HEADING 4";
        else if (tag === 'blockquote') formatName = "QUOTE (Q)";
        else if (tag === 'table') formatName = "TABLE";

        displayText.innerText = formatName;
    }

    document.addEventListener('selectionchange', updateFormatDisplay);
    document.getElementById('docstral-workspace')?.addEventListener('click', updateFormatDisplay);
    document.getElementById('docstral-workspace')?.addEventListener('keyup', updateFormatDisplay);
    document.getElementById('docstral-btn-max')?.addEventListener('click', () => {
        setTimeout(updateFormatDisplay, 50);
    });
});

// Initializes the navigation buttons and inputs for jumping between different lines or pages in the document.
function initLinesNavigation() {
    const btnFirst = document.getElementById('nav-btn-first');
    const btnPrev = document.getElementById('nav-btn-prev');
    const btnNext = document.getElementById('nav-btn-next');
    const btnLast = document.getElementById('nav-btn-last');
    const inputCurrent = document.getElementById('nav-input-current');
    const spanTotal = document.getElementById('nav-span-total');

    if (!btnFirst || !inputCurrent) {
        console.warn("Docstral: Row navigation did not find its HTML elements!");
        return;
    }

    let currentLineIndex = 0; 

    function getVisibleLines() {
        const editor = document.getElementById('docstral-editor');
        if (!editor) return [];
        
        return Array.from(editor.querySelectorAll('.block-line')).filter(line => {
            return getComputedStyle(line).display !== 'none';
        });
    }

    function updateNavDisplay() {
        const editor = document.getElementById('docstral-editor');
        if (!editor || !spanTotal || !inputCurrent) return;

        const visibleLines = getVisibleLines();
        const totalLines = visibleLines.length || 1;
        
        spanTotal.innerText = `/ ${totalLines}`;

        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const node = sel.focusNode;
            if (node && editor.contains(node)) {
                const element = node.nodeType === 3 ? node.parentNode : node;
                const block = element.closest('.block-line');
                
                if (block && getComputedStyle(block).display !== 'none') {
                    currentLineIndex = visibleLines.indexOf(block);
                }
            }
        }

        if (currentLineIndex < 0) currentLineIndex = 0;
        if (currentLineIndex >= totalLines) currentLineIndex = totalLines - 1;

        if (document.activeElement !== inputCurrent) {
            inputCurrent.value = currentLineIndex + 1;
        }
    }

    function jumpToLine(index) {
        const visibleLines = getVisibleLines();
        if (visibleLines.length === 0) return;

        let targetIndex = parseInt(index);
        if (isNaN(targetIndex) || targetIndex < 0) targetIndex = 0;
        if (targetIndex >= visibleLines.length) targetIndex = visibleLines.length - 1;

        const targetBlock = visibleLines[targetIndex];

        try {
            const editor = document.getElementById('docstral-editor');
            editor.focus({ preventScroll: true }); 
            
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(targetBlock);
            range.collapse(false); 
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (e) {
            console.error("Docstral Navigation Error: Failed to place cursor.", e);
        }

        setTimeout(() => {
            targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 10);

        setTimeout(updateNavDisplay, 50);
    }

    btnFirst.addEventListener('click', (e) => { e.preventDefault(); jumpToLine(0); });
    btnPrev.addEventListener('click', (e) => { e.preventDefault(); jumpToLine(currentLineIndex - 1); });
    btnNext.addEventListener('click', (e) => { e.preventDefault(); jumpToLine(currentLineIndex + 1); });
    btnLast.addEventListener('click', (e) => { 
        e.preventDefault(); 
        const visibleLines = getVisibleLines();
        if (visibleLines.length > 0) jumpToLine(visibleLines.length - 1); 
    });

    inputCurrent.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            jumpToLine(inputCurrent.value - 1);
            inputCurrent.blur(); 
        }
    });

    inputCurrent.addEventListener('blur', updateNavDisplay);

    document.addEventListener('selectionchange', () => {
        const editor = document.getElementById('docstral-editor');
        const sel = window.getSelection();
        if (editor && sel && sel.focusNode && editor.contains(sel.focusNode)) {
            updateNavDisplay();
        }
    });
    
    window.updateDocstralNavDisplay = updateNavDisplay;

    const editor = document.getElementById('docstral-editor');
    if (editor) {
        const observer = new MutationObserver(() => {
            setTimeout(updateNavDisplay, 50);
        });
        observer.observe(editor, { childList: true, subtree: true });
    }

    setTimeout(updateNavDisplay, 300);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLinesNavigation);
} else {
    initLinesNavigation();
}

document.addEventListener('DOMContentLoaded', () => {
    const alignments = {
        'align-left': 'left',
        'align-center': 'center',
        'align-right': 'right',
        'align-justify': 'justify'
    };

    Object.keys(alignments).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('mousedown', (e) => {
                e.preventDefault(); 

                const sel = window.getSelection();
                const editor = document.getElementById('docstral-editor');
                if (!editor || !sel.rangeCount) return;

                const selectedBlocks = DocstralFormat.getSelectedBlocks(sel, editor);
                if (selectedBlocks.length === 0) return;

                selectedBlocks.forEach(block => {
                    const targetAlign = alignments[btnId];
                    const wrapperClass = "style-wrapper";
                    
                    let wrapper = block.querySelector(`.${wrapperClass}`);

                    if (!wrapper) {
                        const currentHTML = block.innerHTML;
                        block.innerHTML = `<span class="${wrapperClass}" style="display: block; text-align: ${targetAlign};">${currentHTML}</span>`;
                    } else {
                        wrapper.style.textAlign = targetAlign;
                    }
                });

                editor.dispatchEvent(new Event('input', { bubbles: true }));
                if (typeof window.DocstralSync !== 'undefined') {
                    window.DocstralSync.executeSync(false);
                }
            });
        }
    });
});

window.docstralLastCaretRange = null;
window.docstralLastSelectedText = ""; 
window.docstralSelectionTimeout = null; 

document.addEventListener('selectionchange', () => {
    clearTimeout(window.docstralSelectionTimeout);
    
    window.docstralSelectionTimeout = setTimeout(() => {
        const sel = window.getSelection();
        const editor = document.getElementById('docstral-editor');

        if (document.activeElement && document.activeElement.classList.contains('docstral-ai-input')) return;

        if (sel.rangeCount > 0 && editor && editor.contains(sel.anchorNode)) {
            const currentText = sel.toString().trim();
            window.docstralLastSelectedText = currentText; 
            window.docstralLastCaretRange = sel.getRangeAt(0).cloneRange(); 
        }
    }, 50); 
});

// Safely restores the user's text cursor (caret) to its last known position within the editor.
function safeRestoreCaret() {
    const editor = document.getElementById('docstral-editor');
    if (!editor) return;

    editor.focus(); 
    const sel = window.getSelection();
    sel.removeAllRanges();

    if (window.docstralLastCaretRange && document.contains(window.docstralLastCaretRange.commonAncestorContainer)) {
        sel.addRange(window.docstralLastCaretRange);
    } else {
        sel.selectAllChildren(editor);
        sel.collapseToEnd();
    }
}

// Simulates a fast typing effect to insert dynamically generated AI text into the editor seamlessly.
async function typeTextEffectFast(text) {
    const editor = document.getElementById('docstral-editor');
    if (!text || !editor) return;

    editor.focus();
    
    for (let i = 0; i < text.length; i += 3) {
        document.execCommand('insertText', false, text.slice(i, i + 3));
        await new Promise(r => setTimeout(r, 2)); 
    }
}

// Listens for the Enter key inside the inline AI input field to trigger the requested text generation.
document.addEventListener('keydown', async (e) => {
    if (e.target && e.target.classList.contains('docstral-ai-input')) {
        if (e.key === 'Enter' && !e.shiftKey) {
            
            const rawUserPrompt = e.target.value.trim();
            
            e.preventDefault(); 
            
            if (!rawUserPrompt || rawUserPrompt === "AI is generating...") return;

            const inputField = e.target;
            const contextText = window.docstralLastSelectedText || "";
            const contextMenu = document.getElementById('docstral-context-menu');
            if (contextMenu) {
                contextMenu.classList.add('hidden');
            }
            
            const originalPlaceholder = inputField.placeholder;
            inputField.value = '';
            inputField.placeholder = "AI is generating...";
            inputField.disabled = true;

            const modelDropdown = document.getElementById('sel-model');
            const selectedModel = modelDropdown ? modelDropdown.value : '';

            try {
                const response = await fetch('/api/ai/regen', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        prompt: rawUserPrompt, 
                        context: contextText, 
                        model: selectedModel 
                    })
                });

                const data = await response.json();
                
                if (data.status === 'success') {
                    if (typeof DocstralSync !== 'undefined' && typeof DocstralSync.cancelSync === 'function') {
                        DocstralSync.cancelSync();
                    }
                    
                    safeRestoreCaret();
                    
                    await typeTextEffectFast(data.text);
                    
                    if (typeof DocstralSync !== 'undefined') {
                        DocstralSync.executeSync(false);
                    }
                    
                    window.docstralLastSelectedText = "";
                    
                    if (typeof showToast === 'function') showToast('AI Action Completed!');

                } else {
                    alert("Error from AI: " + data.message);
                }
            } catch (err) {
                console.error("AI Error:", err);
                alert("Server connection error.");
            } finally {
                inputField.disabled = false;
                inputField.placeholder = originalPlaceholder;
                inputField.value = "";
                if (document.activeElement === inputField) {
                    document.getElementById('docstral-editor')?.focus();
                }
            }
        }
    }
});

// Highlights the previously selected text with a temporary glowing effect when the AI input field gains focus.
document.addEventListener('focusin', (e) => {
    if (e.target && e.target.classList.contains('docstral-ai-input')) {
        if (window.docstralLastCaretRange && window.docstralLastSelectedText) {
            if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
                try {
                    const highlight = new Highlight(window.docstralLastCaretRange);
                    CSS.highlights.set('ai-glow', highlight);
                    setTimeout(() => CSS.highlights.delete('ai-glow'), 800);
                } catch (err) {}
            }
        }
    }
});

// Executes a native text formatting command (like bold or italic) within the Docstral editor.
window.docstralFormatText = function(command) {
    document.execCommand(command, false, null);
    document.getElementById('docstral-editor')?.focus();
    
    if (typeof DocstralSync !== 'undefined') {
        DocstralSync.executeSync(false);
    }
};

// Triggers a specific AI menu action (like summarize or explain) on the currently selected text in the editor.
window.docstralMenuAction = async function(action) {
    const text = window.docstralLastSelectedText || window.getSelection().toString().trim();
    
    const menu = document.getElementById('docstral-context-menu');
    if (menu) menu.classList.add('hidden');

    switch (action) {
        case 'cut':
            document.execCommand('cut');
            if (typeof DocstralSync !== 'undefined') DocstralSync.executeSync(false);
            if (typeof showToast === 'function') showToast("Text cut to clipboard");
            break;

        case 'copy':
            document.execCommand('copy');
            if (typeof showToast === 'function') showToast("Text copied!");
            break;

        case 'paste':
            try {
                const clipText = await navigator.clipboard.readText();
                document.execCommand('insertText', false, clipText);
            } catch (e) {
                document.execCommand('paste');
            }
            if (typeof DocstralSync !== 'undefined') DocstralSync.executeSync(false);
            break;

        case 'find_here':
            if (!text) return;
            if (typeof window.openSearchSidebar === 'function') {
                window.openSearchSidebar();
            }
            setTimeout(() => {
                const findInput = document.getElementById('docstral-find-val');
                if (findInput) {
                    findInput.value = text;
                    if (typeof DocstralSearch !== 'undefined') {
                        DocstralSearch.find(text);
                    }
                }
            }, 100);
            break;

        case 'find_inside':
            if (!text) return;
            const urlInput = document.getElementById('browser-url');
            if (urlInput) {
                urlInput.value = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
                
                if (typeof openMagiApp === 'function') openMagiApp('browser');
                if (typeof triggerSmartNavigate === 'function') triggerSmartNavigate();
                if (typeof showToast === 'function') showToast("Searching inside Webstral...");
                if (typeof minimizeDocstral === 'function') {
                    minimizeDocstral({ preventDefault: () => {}, stopPropagation: () => {} });
                } else {
                    document.getElementById('docstral-btn-min')?.click();
                }
            }
            break;

        case 'find_outside':
            if (!text) return;
            window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank');
            if (typeof showToast === 'function') showToast("Searching in external browser...");
            break;

        case 'astral':
            if (!text) return;
            if (typeof addAstralCell === 'function') {
                addAstralCell(text, 'text', 'plaintext');
                if (typeof showToast === 'function') showToast("Added to Astral Projection! ✨");
                
                if (typeof restoreAstral === 'function') restoreAstral();
            }
            break;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const formatButtons = [
        'format-h1', 'format-h2', 'format-h3', 'format-h4', 
        'format-t', 'format-q', 'format-p'
    ];

    formatButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault(); 
            });

            btn.addEventListener('click', () => {
                const ctxMenu = document.getElementById('docstral-context-menu');
                const tooltip = document.getElementById('selection-tooltip');
                
                if (ctxMenu) ctxMenu.classList.add('hidden');
                if (tooltip) tooltip.classList.add('hidden');
            });
        }
    });
});

let fadeTicking = false;
let mouseX = 0, mouseY = 0;

// Tracks the mouse coordinates globally across the document to be used for proximity fading UI effects
document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!fadeTicking) {
        requestAnimationFrame(() => {
            updateProximityFade();
            fadeTicking = false;
        });
        fadeTicking = true;
    }
});

// Calculates the distance between the mouse and specific UI elements to dynamically adjust their opacity.
function updateProximityFade() {
    const FADE_START = 80;  
    const HIDE_LIMIT = 240; 

    function applyFadeToElement(element, exceptionInputId) {
        if (!element || element.classList.contains('hidden')) return;
        if (exceptionInputId && document.activeElement && document.activeElement.id === exceptionInputId) return;

        const rect = element.getBoundingClientRect();
        if (rect.width === 0) return;

        element.style.transitionDuration = '0ms';

        let dx = 0, dy = 0;
        if (mouseX < rect.left) dx = rect.left - mouseX;
        else if (mouseX > rect.right) dx = mouseX - rect.right;
        
        if (mouseY < rect.top) dy = rect.top - mouseY;
        else if (mouseY > rect.bottom) dy = mouseY - rect.bottom;
        
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < FADE_START) {
            element.style.opacity = '1';
            element.style.pointerEvents = 'auto';
        } else if (distance >= FADE_START && distance < HIDE_LIMIT) {
            const opacity = 1 - ((distance - FADE_START) / (HIDE_LIMIT - FADE_START));
            element.style.opacity = opacity.toFixed(3); 
            element.style.pointerEvents = 'auto';
        } else {
            element.classList.add('hidden');
            element.style.opacity = '1';
            element.style.pointerEvents = 'none';
            element.style.transitionDuration = ''; 

            if (element.id === 'selection-tooltip') {
                const moreMenu = document.getElementById('selection-more-menu');
                const linkContainer = document.getElementById('link-input-container');
                const chevron = document.getElementById('more-chevron'); 
                
                if (moreMenu) moreMenu.style.display = 'none';
                if (linkContainer) linkContainer.classList.add('hidden');
                if (chevron) chevron.style.transform = 'rotate(180deg)';
            }
        }
    }

    if (typeof ctxMenu !== 'undefined') applyFadeToElement(ctxMenu, 'ctx-ai-prompt-input');
    applyFadeToElement(document.getElementById('selection-tooltip'), 'link-url-field');
    applyFadeToElement(document.getElementById('global-paste-tooltip'), null);
}

// Triggers the browser's native print dialog for printing the current document view.
function printDocument() {
    const editor = document.getElementById('docstral-editor');
    if (!editor) {
        return;
    }

    let currentName = "Magi_Document";
    const titleSpan = document.getElementById('current-doc-name');
    
    if (titleSpan && titleSpan.innerText && !titleSpan.innerText.includes("Select")) {
        currentName = titleSpan.innerText;
    }

    currentName = currentName.replace(/\.jdoc\.json$|\.json$|\.jdoc$/i, '').trim() || "Magi_Document";
    const safeFilename = currentName.replace(/\s+/g, '_'); 
    const finalFilename = safeFilename + ".pdf";
    const btn = document.querySelector('button[onclick="printDocument()"]');
    const originalBtnText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[13px]"></i> Loading...';

    const originalWarn = console.warn;
    console.warn = function(message) {
        if (typeof message === 'string' && message.includes('willReadFrequently')) return;
        originalWarn.apply(console, arguments);
    };

    const opt = {
        margin:       15,
        filename:     finalFilename, 
        image:        { type: 'jpeg', quality: 0.75 },
        html2canvas:  { 
            scale: 2, 
            logging: false, 
            useCORS: true, 
            backgroundColor: '#ffffff' 
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: 'css', avoid: '.block-line' } 
    };

    html2pdf().set(opt).from(editor).save().then(() => {
        console.warn = originalWarn;
        if (btn) btn.innerHTML = originalBtnText;
    }).catch(err => {
        console.warn = originalWarn;
        console.error("PDF generation error:", err);
        if (btn) btn.innerHTML = originalBtnText;
    });
}

// Asynchronously loads cognitive layers from the server, including support for custom layers, deletion, and info tooltips
async function loadCognitiveLayers() {
    try {
        const res = await fetch('/api/config/cognitive_layers');
        const data = await res.json();
        const rawItems = data.items || [];
        const seenLayers = new Set();
        let items = [];
        
        rawItems.forEach(item => {
            const cleanKey = item.trim().toLowerCase();
            
            let baseName = cleanKey.replace(/^\d+_/g, ''); 

            if (baseName.includes('system')) {
                baseName = 'system';
            }
            if (baseName.includes('karma')) {
                baseName = 'karma';
            }
            if (baseName.includes('agi')) {
                baseName = 'agi';
            }

            if (!seenLayers.has(baseName)) {
                seenLayers.add(baseName);
                items.push(item); 
            }
        });

        const exactOrder = ['AGI', 'System', 'Karma', 'Samsara', 'Akasha', 'Citta', 'Vritti'];
        
        items.sort((a, b) => {
            const indexA = exactOrder.findIndex(key => a.toLowerCase().includes(key.toLowerCase()));
            const indexB = exactOrder.findIndex(key => b.toLowerCase().includes(key.toLowerCase()));
            
            if (indexA !== -1 && indexB !== -1) return indexA - indexB; 
            if (indexA !== -1) return -1; 
            if (indexB !== -1) return 1;  
            return a.localeCompare(b);   
        });

        const listDiv = document.getElementById('layers-list');
        listDiv.innerHTML = '';

        items.forEach(item => {
            const isCustom = item.toLowerCase().startsWith('custom_');
            let displayName = "";
            let matchedKey = "";
            
            if (isCustom) {
                let rawName = item.substring(7);
                displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1).replace(/_/g, ' ');
            } else {
                matchedKey = exactOrder.find(key => item.toLowerCase().includes(key.toLowerCase()));
                displayName = matchedKey ? matchedKey : item.replace(/^\d+_/g, ''); 
            }
            
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-2 hover:bg-[#FDFBF7] transition-colors w-full group relative';
            
            const label = document.createElement('label');
            label.className = 'flex items-center gap-2 cursor-pointer flex-1 min-w-0';
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = item;
            cb.className = 'accent-[#D4A373] w-4 h-4 shrink-0';
            cb.dataset.isCustom = isCustom ? "true" : "false";

            cb.checked = state.selectedLayers && state.selectedLayers.includes(item);

            cb.addEventListener('change', (e) => {
                if (item.toLowerCase().includes('agi') && !isCustom) {
                    const toggle = document.getElementById('insight-toggle');
                    if (toggle) {
                        toggle.checked = e.target.checked;
                        state.insight = e.target.checked;
                        if (typeof showToast === 'function') showToast(state.insight ? "INSIGHT: AGI MODE ON" : "INSIGHT: STANDARD AI");
                    }
                }
                syncSelectedLayersToState();
            });

            label.appendChild(cb);
            
            const span = document.createElement('span');
            span.className = 'font-mono font-bold text-[#3E2723] text-[13px] truncate';
            span.innerText = displayName;
            label.appendChild(span);
            row.appendChild(label);

            const lookupKey = matchedKey ? matchedKey.toLowerCase() : item.toLowerCase().replace(/^\d+_/g, '');
            
            if (LAYER_DEFINITIONS && LAYER_DEFINITIONS[lookupKey]) {
                const infoContainer = document.createElement('div');
                infoContainer.className = 'layer-info-container text-[#D4A373] hover:text-[#3E2723] transition-colors pl-2 mr-2 text-xs select-none';
                infoContainer.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
                
                const tooltipText = document.createElement('div');
                tooltipText.className = 'layer-tooltip-text';
                tooltipText.innerText = LAYER_DEFINITIONS[lookupKey];
                
                infoContainer.appendChild(tooltipText);
                row.appendChild(infoContainer);
            } else if (isCustom) {
                const infoContainer = document.createElement('div');
                infoContainer.className = 'layer-info-container text-[#D4A373] hover:text-[#3E2723] transition-colors pl-2 mr-2 text-xs select-none';
                infoContainer.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
                
                const tooltipText = document.createElement('div');
                tooltipText.className = 'layer-tooltip-text';
                tooltipText.innerText = `Custom cognitive layer [${displayName}]. Keeps specific, externally loaded context data in the computer's RAM.`;
                
                infoContainer.appendChild(tooltipText);
                row.appendChild(infoContainer);
            }

            if (isCustom) {
                const delBtn = document.createElement('button');
                delBtn.className = 'opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-600 px-2 transition-all shrink-0 ml-auto';
                delBtn.innerHTML = '<i class="fa-solid fa-xmark text-sm"></i>';
                delBtn.title = 'Delete this layer';
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteCustomLayer(item);
                };
                row.appendChild(delBtn);
            }
            
            listDiv.appendChild(row);
        });

        applyLayerConstraints();

    } catch (e) { console.error('Failed to load layers', e); }
}

// Applies specific constraints to the checkboxes, ensuring that custom layers always remain accessible
function applyLayerConstraints() {
    const checkboxes = document.querySelectorAll('#layers-list input[type="checkbox"]');
    const isActiveMode = (state.mode === 3 || state.mode === 4);

    checkboxes.forEach(cb => {
        const val = cb.value.toLowerCase();
        const label = cb.parentElement;
        const isCustom = cb.dataset.isCustom === "true";
        
        cb.disabled = false;
        label.style.opacity = '1';
        label.style.pointerEvents = 'auto';

        if (isCustom) return; 

        if (isActiveMode) {
            if (val.includes('system') || val.includes('karma') || val.includes('samsara')) {
                cb.checked = true; cb.disabled = true; label.style.opacity = '0.5'; label.style.pointerEvents = 'none';
            } else if (val.includes('vritti')) {
                cb.checked = false; cb.disabled = true; label.style.opacity = '0.5'; label.style.pointerEvents = 'none';
            }
        } else {
            if (val.includes('system')) {
                cb.checked = true; cb.disabled = true; label.style.opacity = '0.5'; label.style.pointerEvents = 'none';
            } else if (val.includes('karma') || val.includes('samsara') || val.includes('akasha') || val.includes('citta')) {
                cb.checked = false; cb.disabled = true; label.style.opacity = '0.5'; label.style.pointerEvents = 'none';
            }
        }

        if (val.includes('agi') && !cb.disabled) {
            const toggle = document.getElementById('insight-toggle');
            if (toggle) cb.checked = toggle.checked;
        }
    });

    syncSelectedLayersToState();
}

// Permanently deletes a specified custom layer after prompting the user for confirmation
async function deleteCustomLayer(layerKey) {
    if (!confirm(`Are you sure you want to permanently delete: ${layerKey}?`)) return;
    
    try {
        const encodedKey = encodeURIComponent(layerKey);
        const res = await fetch(`/api/cognitive_layers/custom/${encodedKey}`, { 
            method: 'DELETE' 
        });
        
        const data = await res.json(); 
        
        if (res.ok) {
            if (typeof showToast === 'function') showToast("Custom layer deleted.");
            loadCognitiveLayers(); 
        } else {
            console.error("Server Error:", data.detail);
            if (typeof showToast === 'function') showToast("Error: " + data.detail, true);
        }
    } catch (err) {
        console.error("Network/Parsing Error:", err);

        if (typeof showToast === 'function') showToast("Network error occurred.", true);
    }
}

// Synchronizes and saves the selected layers individually to the application state with strict isolation for each tab
function syncSelectedLayersToState() {
    const checkedBoxes = Array.from(document.querySelectorAll('#layers-list input:checked')).map(cb => cb.value);
    
    state.selectedLayers = checkedBoxes;
    
    if (state.activeTabId) {
        const currentTab = state.tabs.find(tab => tab.id === state.activeTabId);
        if (currentTab) {
            currentTab.selectedLayers = [...checkedBoxes];
        }
    }

    updateLayersDisplay();
}

// Updates the user interface to display the number of selected layers without rendering remove buttons
function updateLayersDisplay() {
    const display = document.getElementById('layers-display');
    if (!display) return;
    
    const count = state.selectedLayers.length;
    display.innerText = count > 0 ? `${count} layers selected` : 'Select layers...';
    display.style.color = count > 0 ? '#3E2723' : '#9ca3af'; 
}

// Triggers an irreversible global reset that completely clears the Karma, Samsara, and Hall of Maat layers after user confirmation
async function triggerNirjara() {
    if (!confirm("💥 NIRJARA RESET WARNING!\n\nAre you sure you want to completely reset and delete the layers: Karma, Samsara and Hall of Maat? This action is irreversible!")) return;
    
    const btn = document.getElementById('nirjara-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> PURIFYING...';
    }

    try {
        const res = await fetch('/api/system_layers/nirjara', { method: 'POST' });
        if (res.ok) {
            if (typeof showToast === 'function') showToast("Nirjara Completed: Karma & Samsara Purified! 🔥");
            
            if (typeof closeModal === 'function') closeModal();
            
            if (typeof loadCognitiveLayers === 'function') loadCognitiveLayers();
        } else {
            alert("Error during Nirjara reset.");
        }
    } catch (e) {
        console.error(e);
    }
}

// Initiates the creation of a new custom brain system layer by generating a hidden file input element for selecting various document types
window.fmCreateBrainLayer = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.txt,.docx,.xlsx,.xls,.json,.jsonl,.html,.css,.js,.md,.csv';
    
    input.onchange = async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        
        const layerNameRaw = prompt("Enter a name for the new knowledge layer (e.g. 'Legal Data', 'My Rules'):");
        if (!layerNameRaw) return;
        
        const layerName = layerNameRaw.trim();
        if (layerName === "") return;
        
        const formData = new FormData();
        formData.append('name', layerName);
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }
        
        if (typeof showToast === 'function') showToast("Building neural layer... Please wait.");
        document.body.style.cursor = 'wait';
        
        try {
            const res = await fetch('/api/cognitive_layers/create_custom', {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                if (typeof showToast === 'function') showToast("Layer created successfully!");
                if (typeof loadCognitiveLayers === 'function') loadCognitiveLayers();
            } else {
                if (typeof showToast === 'function') showToast("Error creating layer.", true);
            }
        } catch (err) {
            console.error(err);
            if (typeof showToast === 'function') showToast("Network error.", true);
        } finally {
            document.body.style.cursor = 'default';
        }
    };
    
    input.click(); 
};

// Signals the backend to generate in-memory vectors and synchronizes the session to either the Citta or Vritti layer based on the active mode
async function syncSessionToLayer(sessionFile, modeId) {
    if (!sessionFile) return;
    const layerKey = (modeId === 3 || modeId === 4) ? 'citta' : 'vritti';
    
    const currentModel = (typeof state !== 'undefined' && state.model) ? state.model : null;
    
    try {
        await fetch('/api/cognitive_layers/sync_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                layer_key: layerKey,
                session_file: sessionFile,
                mode_id: modeId,
                model_name: currentModel
            })
        });

        console.log(`[OS MAGI] Session ${sessionFile} synced to ${layerKey.toUpperCase()} using model ${currentModel}`);
    } catch (e) {
        console.error("Sync error:", e);
    }
}

// Signals the backend to clear session data from the corresponding cognitive layer, Citta or Vritti, when a tab is closed
async function clearSessionFromLayer(sessionFile, modeId) {
    if (!sessionFile) return;
    const layerKey = (modeId === 3 || modeId === 4) ? 'citta' : 'vritti';
    try {
        await fetch('/api/cognitive_layers/clear_session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                layer_key: layerKey,
                session_file: sessionFile
            })
        });
        console.log(`[OS MAGI] Session ${sessionFile} cleared from ${layerKey.toUpperCase()}`);
    } catch (e) {
        console.error("Clear error:", e);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (state.tabs && state.tabs.length > 0) {
            state.tabs.forEach(tab => {
                if (tab.currentSession) {
                    const tabMode = tab.settings?.mode || state.mode;
                    syncSessionToLayer(tab.currentSession, tabMode);
                }
            });
        }
    }, 1000);
});

const LAYER_DEFINITIONS = {
    "agi": "1_AGI: Meta-Cognition Engine. Orchestrates the reasoning pipeline, performs step-by-step logic decomposition, and selects optimal execution strategies for complex problem-solving.",
    "system": "2_System: Global Constraint Controller. The top-level middleware that enforces safety protocols, ethical boundaries, and operational limits. Hard-wired as a non-bypassable input filter.",
    "karma": "3_Karma: Distilled Insight Repository. Stores high-level vector embeddings of user preferences and behavioral patterns. Used for long-term personalization and cross-session heuristic alignment.",
    "samsara": "4_Samsara: Lifecycle Context Window. Maintains the state of the current active session. Automatically manages state expiration and triggers cycle resets to prevent context-related entropy.",
    "akasha": "5_Akasha: Immutable Audit Stream. A comprehensive, read-only historical ledger of all inputs and outputs. Serves as the system's Ground Truth for debugging and state recovery.",
    "citta": "6_Citta: Dynamic Task-State Manager. Holds transient, high-priority variables for multi-step goals. Maintains goal-oriented continuity and state-persistence during complex task execution.",
    "vritti": "7_Vritti: Low-Latency Transient Buffer. High-speed, short-lived memory for immediate input/output processing. Automatically flushed after each turn to ensure resource efficiency."
};

window.addEventListener('beforeunload', () => {
    if (window.currentSessionFile && window.currentSessionFile.startsWith('temp_passive_')) {
        const blob = new Blob([JSON.stringify({ 
            layer_key: 'vritti', 
            session_file: window.currentSessionFile 
        })], { type: 'application/json' });
        navigator.sendBeacon('/api/cognitive_layers/clear_session', blob);
    }
    
    if (typeof state !== 'undefined' && state.tabs) {
        state.tabs.forEach(tab => {
            if (tab.filename && tab.filename.startsWith('temp_passive_') && tab.filename !== window.currentSessionFile) {
                const blob = new Blob([JSON.stringify({ 
                    layer_key: 'vritti', 
                    session_file: tab.filename 
                })], { type: 'application/json' });
                navigator.sendBeacon('/api/cognitive_layers/clear_session', blob);
            }
        });
    }
});

function renderMediaInFileManager(fileName, fileUrl) {
    const ext = fileName.split('.').pop().toLowerCase();
    
    const editorContainer = document.getElementById('fm-editor-container');
    const mediaViewer = document.getElementById('fm-media-viewer');
    const placeholder = document.getElementById('fm-viewer-placeholder');
    const mediaContent = document.getElementById('fm-media-content');
    const mediaFileName = document.getElementById('fm-media-file-name');

    editorContainer.classList.add('hidden');
    editorContainer.classList.remove('flex');
    placeholder.classList.add('hidden');
    
    mediaViewer.classList.remove('hidden');
    mediaViewer.classList.add('flex');
    mediaFileName.innerText = fileName;
    mediaContent.innerHTML = ''; 

    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

    if (imageExts.includes(ext)) {
        mediaContent.innerHTML = `
            <div class="w-full h-full flex items-center justify-center overflow-auto custom-scrollbar">
                <img src="${fileUrl}" class="max-w-full max-h-full object-contain shadow-md border border-[#D4A373]/30 rounded bg-white" alt="${fileName}">
            </div>
        `;
    } else if (ext === 'pdf') {
      
        mediaContent.innerHTML = `
            <iframe src="${fileUrl}#toolbar=1&navpanes=0&scrollbar=1" class="w-full h-full border border-[#D4A373]/20 rounded shadow-inner bg-white"></iframe>
        `;
    }
}

window.fmCloseMedia = function() {
    const mediaViewer = document.getElementById('fm-media-viewer');
    const placeholder = document.getElementById('fm-viewer-placeholder');
    const mediaContent = document.getElementById('fm-media-content');

    mediaViewer.classList.add('hidden');
    mediaViewer.classList.remove('flex');
    placeholder.classList.remove('hidden');
    mediaContent.innerHTML = ''; 
};

window.fmCloseMedia = function() {
    const mediaViewer = document.getElementById('fm-media-viewer');
    const placeholder = document.getElementById('fm-viewer-placeholder');
    const mediaContent = document.getElementById('fm-media-content');

    if (mediaViewer) {
        mediaViewer.classList.add('hidden');
        mediaViewer.classList.remove('flex');
    }
    if (placeholder) {
        placeholder.classList.remove('hidden');
    }
    if (mediaContent) {
        mediaContent.innerHTML = ''; // Освобождаваме RAM паметта от браузъра
    }

    document.querySelectorAll('.fm-list-item').forEach(el => el.classList.remove('is-open'));
    activeFmFile = null;
    currentFmFileMeta = {};
};