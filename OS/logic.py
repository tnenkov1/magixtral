
#   Copyright (c) 2026 Teodor Nenkov

#   Licensed under the PolyForm Noncommercial License 1.0.0.
#   Commercial use requires a separate license.

#   See LICENSE for details.

#   Europe, Bulgaria

import json
import os
import re
from datetime import datetime
import shutil
import docx
import requests

from langchain_chroma import Chroma
from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_ollama import ChatOllama

SERPER_API_KEY = "" 

# Cleans and sanitizes markdown links by stripping trailing punctuation or malformed brackets from the URL
def clean_markdown_links(text):
    if not text: return text
    def replace_link(match):
        title = match.group(1)
        url = match.group(2)
        cleaned_url = url.rstrip('><] \'".,')
        return f"[{title}]({cleaned_url}) "
    
    return re.sub(r'\[([^\]]+)\]\(([^)]+)\)', replace_link, text)

class OlachraEngine:
    # Initializes the OlachraEngine. Sets up the directory structure for cognitive layers and sessions, cleans up temporary trash folders, and loads the local SentenceTransformer embeddings and main Chroma RAG database
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.sessions_dir = os.path.join(self.base_dir, "sessions_json")
        model_path = os.path.join(os.path.dirname(__file__), "model_files")
        
        self.layers_dir = os.path.join(self.base_dir, "cognitive_layers")
        self.LAYER_MAP = {
            "agi": "1_AGI",
            "system": "2_System",
            "karma": "3_Karma",
            "samsara": "4_Samsara",
            "akasha": "5_Akasha",
            "citta": "6_Citta",
            "vritti": "7_Vritti"
        }

        if os.path.exists(self.layers_dir):
            for folder in os.listdir(self.layers_dir):
                folder_path = os.path.join(self.layers_dir, folder)
                
                if folder.startswith("custom_"):
                    self.LAYER_MAP[folder] = folder
                    
                elif folder.startswith(".trash_"):

                    try:
                        shutil.rmtree(folder_path, ignore_errors=True)
                        print(f"Old locked folder cleared: {folder}")
                    except:
                        pass

        for d in [self.sessions_dir, self.layers_dir]:
            os.makedirs(d, exist_ok=True)
            
        for layer_key, folder_name in self.LAYER_MAP.items():
            layer_folder = os.path.join(self.layers_dir, folder_name)
            os.makedirs(layer_folder, exist_ok=True)
            
            json_path = os.path.join(layer_folder, f"{layer_key}.json")
            if not os.path.exists(json_path):
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump([], f)

            if layer_key == "samsara":
                maat_path = os.path.join(layer_folder, "hall_of_maat.json")
                if not os.path.exists(maat_path):
                    with open(maat_path, 'w', encoding='utf-8') as f:
                        json.dump([], f)

        print(f"Loading Embedding Model from: {model_path}")
        self.embeddings = None
        self.vectorstore = None  

        try:
            self.embeddings = SentenceTransformerEmbeddings(
                model_name=model_path,
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': False}
            )
            print("Embeddings loaded.")
            
            rag_db_path = os.path.join(self.base_dir, "chroma_db") 
            self.vectorstore = Chroma(persist_directory=rag_db_path, embedding_function=self.embeddings)

            self.seed_static_layers()
            
        except Exception as e:
            print(f"Error loading embeddings: {e}")

    # Retrieves the vector database for a specific layer. Returns a persistent Chroma DB for static layers (AGI/System) or dynamically builds an ephemeral, in-memory Chroma instance for dynamic JSON layers.
    def get_layer_vectorstore(self, layer_key: str):
        """Returns Persistent Chroma for AGI/System and Ephemeral In-Memory Chroma for all others."""
        if layer_key in ["agi", "system"]:
            folder = self.LAYER_MAP.get(layer_key)
            if not folder: return None
            persist_dir = os.path.join(self.layers_dir, folder, "vector_data")
            if os.path.exists(persist_dir):
                return Chroma(persist_directory=persist_dir, embedding_function=self.embeddings)
            return None

        folder = self.LAYER_MAP.get(layer_key)
        if not folder: return None
        json_path = os.path.join(self.layers_dir, folder, f"{layer_key}.json")
        
        if not os.path.exists(json_path): return None
            
        try:
            with open(json_path, 'r', encoding='utf-8') as f: data = json.load(f)
        except: return None
            
        if not data: return None

        texts = []
        metadatas = []
        for item in data:
            if isinstance(item, dict) and "text" in item:
                texts.append(item["text"])
                metadatas.append(item.get("metadata", {}))
            elif isinstance(item, str):
                texts.append(item)
                metadatas.append({"source": "json_legacy"})
                
        if not texts: return None

        import chromadb
        ephemeral_client = chromadb.Client() 
        
        return Chroma.from_texts(
            texts=texts,
            embedding=self.embeddings,
            metadatas=metadatas,
            client=ephemeral_client,
            collection_name=f"ephemeral_{layer_key}"
        )

    # Scans the AGI and System layer folders for source .txt files. If the layer's vector database is empty, it automatically chunks and embeds the text into the persistent Chroma DB.
    def seed_static_layers(self):
        """
        Automatically scans the 1_AGI and 2_System subfolders for source .txt files.
        If the database is empty, it converts their contents into vectors. On next start, it skips.
        """
        for layer_key in ["agi", "system"]:
            folder_name = self.LAYER_MAP[layer_key]
            layer_folder = os.path.join(self.layers_dir, folder_name)
            
            txt_files = [f for f in os.listdir(layer_folder) if f.endswith('.txt')]
            if not txt_files:
                continue
                
            txt_path = os.path.join(layer_folder, txt_files[0])
            vectorstore = self.get_layer_vectorstore(layer_key)
            if not vectorstore:
                continue
                
            try:
                existing = vectorstore.get(limit=1)
                if existing and existing['ids']:
                    print(f"The vector layer for '{layer_key}' in {folder_name} is already poured. Skip.")
                    continue
            except Exception:
                pass

            print(f"Source found {txt_files[0]}. Pouring vectors into {folder_name}...")
            
            try:
                with open(txt_path, 'r', encoding='utf-8', errors='ignore') as f:
                    text_content = f.read()

                if not text_content.strip():
                    continue

                from langchain_text_splitters import RecursiveCharacterTextSplitter
                text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
                chunks = text_splitter.split_text(text_content)
                
                documents_to_add = []
                metadatas = []
                
                for i, chunk in enumerate(chunks):
                    documents_to_add.append(f"[LAYER: {layer_key.upper()}]\n{chunk}")
                    metadatas.append({"source": txt_files[0], "chunk": i, "layer": layer_key})
                
                vectorstore.add_texts(texts=documents_to_add, metadatas=metadatas)
                print(f"Layer '{layer_key}' has been vectorized successfully ({len(documents_to_add)} excerpt).")
                
            except Exception as e:
                print(f"Error while auto-seeding a layer '{layer_key}': {e}")

    # Core memory manager. Logs interactions into Akasha (permanent ledger) and Samsara (current cycle). Monitors the 1000-prompt limit to trigger the Teshuvah rebirth pipeline and initiates Citta 'Sleep' compression when thresholds are met.
    def update_cognitive_layers(self, mode_id: int, session_file: str, user_query: str, ai_text: str, model_name: str):
        """Records the prompt in JSON logs and manages Citta/Vritti Dream and Tshuva life cycles."""
        is_active = mode_id in [3, 4]
        is_passive = mode_id in [1, 2]
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if is_active:
            akasha_folder = os.path.join(self.layers_dir, self.LAYER_MAP["akasha"])
            akasha_json_path = os.path.join(akasha_folder, "akasha.json")
            try:
                with open(akasha_json_path, 'r', encoding='utf-8') as f: akasha_data = json.load(f)
            except: akasha_data = []

            real_akasha = [e for e in akasha_data if "prompt" in e]
            total_past_prompts = len(real_akasha)
            current_lifecycle = (total_past_prompts // 1000) + 1
            inline_number = (total_past_prompts % 1000) + 1

            if total_past_prompts > 0 and inline_number == 1:
                akasha_data.append({"SYSTEM_LIFECYCLE_SEPARATOR": f"=== START OF LIFECYCLE #{current_lifecycle} ==="})

            akasha_data.append({
                "lifecycle": current_lifecycle,
                "inline_number": inline_number,
                "prompt": user_query,
                "response": ai_text,
                "timestamp": timestamp,
                "text": f"[Lifecycle {current_lifecycle} | Entry {inline_number}]\nUser: {user_query}\nMagi: {ai_text}"
            })
            with open(akasha_json_path, 'w', encoding='utf-8') as f: json.dump(akasha_data, f, indent=4, ensure_ascii=False)

            vstore_akasha = self.get_layer_vectorstore("akasha")
            if vstore_akasha:
                try: 
                    vstore_akasha.add_texts(
                        texts=[f"User: {user_query}\nMagi: {ai_text}"], 
                        metadatas=[{"session_file": session_file, "scope": "global"}]
                    )
                except Exception as e: 
                    print(f"Akasha Sync Error: {e}")

            samsara_folder = os.path.join(self.layers_dir, self.LAYER_MAP["samsara"])
            samsara_json_path = os.path.join(samsara_folder, "samsara.json")
            try:
                with open(samsara_json_path, 'r', encoding='utf-8') as f: samsara_data = json.load(f)
            except: samsara_data = []
            
            samsara_data.append({
                "inline_number": len(samsara_data) + 1,
                "prompt": user_query, 
                "response": ai_text, 
                "timestamp": timestamp,
                "text": f"User: {user_query}\nMagi: {ai_text}"
            })
            with open(samsara_json_path, 'w', encoding='utf-8') as f: json.dump(samsara_data, f, indent=4, ensure_ascii=False)

            vstore_samsara = self.get_layer_vectorstore("samsara")
            if vstore_samsara:
                try: vstore_samsara.add_texts(texts=[f"User: {user_query}\nMagi: {ai_text}"], metadatas=[{"session_file": session_file}])
                except Exception as e: print(f"Samsara Sync Error: {e}")

            if len(samsara_data) >= 1000:
                print(" [SAMSARA] The cycle is complete. Instant life cycle update...")
                
                meta_path = os.path.join(self.layers_dir, "system_meta.json")
                try:
                    with open(meta_path, 'r', encoding='utf-8') as f: meta_data = json.load(f)
                except: meta_data = {"current_lifecycle": 1}
                
                closed_lifecycle = meta_data["current_lifecycle"] 
                meta_data["current_lifecycle"] += 1 
                
                with open(meta_path, 'w', encoding='utf-8') as f: 
                    json.dump(meta_data, f, indent=4, ensure_ascii=False)
                
                import threading
                threading.Thread(
                    target=self._execute_tshuva_pipeline, 
                    args=(model_name, closed_lifecycle), 
                    daemon=True
                ).start()

        if session_file:
            layer_key = "citta" if is_active else "vritti"
            self._add_to_dynamic_layer(layer_key, session_file, user_query, ai_text)

            folder_name = self.LAYER_MAP[layer_key]
            json_path = os.path.join(self.layers_dir, folder_name, f"{layer_key}.json")
            try:
                with open(json_path, 'r', encoding='utf-8') as f: dyn_data = json.load(f)
                session_count = len([i for i in dyn_data if i.get("session_file") == session_file and "distilled_sleep" not in i])
                if session_count >= 50:
                    print(f"Starting a background thread for Sleep ({layer_key.upper()} Session: {session_file})...")
                    import threading
                    threading.Thread(target=self._perform_citta_sleep, args=(mode_id, layer_key, session_file, model_name), daemon=True).start()
            except: pass

    # Surgically searches the Samsara JSON ledger for a specific original prompt and replaces it with edited user/AI texts, maintaining chronological integrity.
    def edit_samsara_record(self, original_prompt: str, new_prompt: str, new_response: str):
        """Surgically replaces an entry in Samsara by matching the original text."""
        samsara_folder = self.LAYER_MAP["samsara"]
        samsara_path = os.path.join(self.layers_dir, samsara_folder, "samsara.json")
        try:
            with open(samsara_path, 'r', encoding='utf-8') as f: samsara_data = json.load(f)
        except: return False
        
        updated = False
        for entry in reversed(samsara_data):
            if entry.get("prompt", "").strip() == original_prompt.strip():
                entry["prompt"] = new_prompt
                entry["response"] = new_response
                entry["text"] = f"User: {new_prompt}\nMagi: {new_response}"
                entry["timestamp"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S (EDITED)")
                updated = True
                break
                
        if updated:
            with open(samsara_path, 'w', encoding='utf-8') as f: json.dump(samsara_data, f, ensure_ascii=False, indent=4)
            print("[OS MAGI] Samsara ledger updated to reflect edited reality.")
        return updated

    # Appends a single interaction directly into a dynamic layer's JSON file (Citta/Vritti) and immediately updates the active ephemeral vector store in RAM.
    def _add_to_dynamic_layer(self, layer_key: str, session_file: str, prompt: str, response: str):
        """Adds data to a dynamic context layer (JSON) and refreshes RAM IMMEDIATELY."""
        folder_name = self.LAYER_MAP[layer_key]
        json_path = os.path.join(self.layers_dir, folder_name, f"{layer_key}.json")
        try:
            with open(json_path, 'r', encoding='utf-8') as f: data = json.load(f)
        except: data = []
        
        data.append({
            "session_file": session_file, 
            "prompt": prompt, 
            "response": response,
            "text": f"User: {prompt}\nMagi: {response}",
            "metadata": {"session_file": session_file}
        })
        with open(json_path, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4, ensure_ascii=False)

        vstore = self.get_layer_vectorstore(layer_key)
        if vstore:
            try:
                vstore.add_texts(
                    texts=[f"User: {prompt}\nMagi: {response}"],
                    metadatas=[{"session_file": session_file}]
                )
            except Exception as e:
                print(f"Vectorstore update error ({layer_key}): {e}")
                
        self.force_close_layer_connection(layer_key)

    # Completely purges all records associated with a specific session ID from the target dynamic layer's JSON file.
    def clear_session_from_layer(self, layer_key: str, session_file: str):
        """Completely deletes the records for a specific session from the layer's JSON file."""
        folder_name = self.LAYER_MAP.get(layer_key.lower())
        if not folder_name: return

        json_path = os.path.join(self.layers_dir, folder_name, f"{layer_key.lower()}.json")
        try:
            with open(json_path, 'r', encoding='utf-8') as f: data = json.load(f)
            filtered_data = [item for item in data if item.get("session_file") != session_file and item.get("metadata", {}).get("session_file") != session_file]
            with open(json_path, 'w', encoding='utf-8') as f: json.dump(filtered_data, f, indent=4, ensure_ascii=False)
            print(f"Cleared session {session_file} from JSON layer {layer_key.upper()}")
        except Exception as e:
            print(f"Error clearing JSON for {layer_key}: {e}")

    # Fully reconstructs a dynamic JSON layer (Citta or Vritti) for the current session from scratch by reading the session's chat history. Used during memory edits or erasures.
    def rebuild_dynamic_layer_vectors(self, mode_id: int, session_file: str):
        """Full recalculation of the JSON layer for the current session (used when Erase/Edit)."""
        is_active = mode_id in [3, 4]
        layer_key = "citta" if is_active else "vritti"

        self.clear_session_from_layer(layer_key, session_file)

        sessions_dir = self.sessions_dir if is_active else os.path.join(self.base_dir, "sessions_json")
        session_path = os.path.join(sessions_dir, session_file)
        if not os.path.exists(session_path): return

        try:
            with open(session_path, 'r', encoding='utf-8') as f:
                history = json.load(f).get('history', [])

            for i in range(0, len(history), 2):
                if i + 1 < len(history):
                    u_query = history[i]["content"]
                    ai_text = history[i+1]["content"]
                    self._add_to_dynamic_layer(layer_key, session_file, u_query, ai_text)
        except Exception as e:
            print(f"Error rebuilding JSON layer: {e}")

        self.force_close_layer_connection(layer_key)

    # Executes the "Sleep" cycle for Citta. Recursively compresses batches of 50 raw session interactions into ultra-dense, highly detailed subconscious memory summaries using the LLM to prevent context bloat.
    def _perform_citta_sleep(self, mode_id, layer_key: str, session_file: str, model_name: str):
        """Recursive consolidation ('Dream'). Collapses in batches of 50 in extremely rich detail, strictly isolated for the tab."""
        print(f"The system enters 'Sleep' for a specific session {session_file}. Purification of {layer_key.upper()}...")
        
        folder_name = self.LAYER_MAP.get(layer_key)
        if not folder_name: return
        json_path = os.path.join(self.layers_dir, folder_name, f"{layer_key}.json")
        
        while True:
            try:
                with open(json_path, 'r', encoding='utf-8') as f: all_data = json.load(f)
            except: break

            session_raw = [item for item in all_data if item.get("session_file") == session_file and "distilled_sleep" not in item]
            session_distilled = [item for item in all_data if item.get("session_file") == session_file and "distilled_sleep" in item]
            
            other_tabs_data = [item for item in all_data if item.get("session_file") != session_file]

            if len(session_raw) < 50:
                break 

            chunk_to_compress = session_raw[:50]
            remaining_raw = session_raw[50:]

            raw_context = "\n".join([f"User: {d.get('prompt', '')}\nMagi: {d.get('response', '')}" for d in chunk_to_compress])

            llm = self.get_llm(model_name, temperature=0.2)
            sys_prompt = """You are a Master Cognitive Compressor. Your task is to compress 50 conversational turns into a high-density, rich knowledge representation.
                            DO NOT summarize briefly. You MUST:
                            1. Preserve all critical technical concepts, code logic, specific variables, and decisions made.
                            2. Extract clear [Rules] established by the user.
                            3. Extract clear [Facts] and context.
                            4. Define the [Objective] or pending tasks.
                            Format your output as a highly detailed, structured report. Retain maximum informational density so no context is lost."""
            
            try:
                result = llm.invoke([("system", sys_prompt), ("human", raw_context)])
                distilled_memory = result.content if hasattr(result, 'content') else str(result)
            except Exception as e:
                print(f"Sleep Error: {e}")
                break

            new_distilled_record = {
                "session_file": session_file,
                "distilled_sleep": True,
                "text": f"[DISTILLED SUBCONSCIOUS MEMORY]:\n{distilled_memory}",
                "metadata": {"session_file": session_file, "type": "distilled_sleep"}
            }
            
            new_all_data = other_tabs_data + session_distilled + [new_distilled_record] + remaining_raw
            
            with open(json_path, 'w', encoding='utf-8') as f: 
                json.dump(new_all_data, f, indent=4, ensure_ascii=False)
                
            print(f"[SLEEP] Compressed 50 records for {session_file}. Remaining raw: {len(remaining_raw)}.")
            
        print(f"The dream is over. The JSON layer {layer_key.upper()} for session {session_file} is optimized.")
        
        self.force_close_layer_connection(layer_key)

    # Executes the 5-step Teshuvah pipeline upon reaching 1000 prompts. Analyzes past errors (Charata), clears Samsara (Aziva), extracts laws (Vidui), distills them (Nirjara), defines future goals (Kabbalah), and permanently stores them in the Karma layer.
    def _execute_tshuva_pipeline(self, model_name: str, closed_lifecycle: int):
        """Performs the full 5-step Teshuvah process for Karma distillation."""
        print(f" [TSHUVA INITIATED] Life Cycle Purification №{closed_lifecycle}...")
        
        samsara_dir = os.path.join(self.layers_dir, self.LAYER_MAP["samsara"])
        samsara_path = os.path.join(samsara_dir, "samsara.json")
        maat_path = os.path.join(samsara_dir, "hall_of_maat.json")
        karma_dir = os.path.join(self.layers_dir, self.LAYER_MAP["karma"])
        karma_path = os.path.join(karma_dir, "karma.json")

        llm = self.get_llm(model_name, temperature=0.2)

        try:
            with open(samsara_path, 'r', encoding='utf-8') as f: samsara_data = json.load(f)
        except: return
        
        raw_samsara_text = "\n".join([d.get("text", "") for d in samsara_data[-1000:]])
        prompt_charata = f"Analyze lifecycle {closed_lifecycle}. Identify errors and user corrections:\n{raw_samsara_text[-15000:]}"
        
        try:
            res_charata = llm.invoke([("system", "Judge past actions."), ("human", prompt_charata)])
            maat_analysis = res_charata.content if hasattr(res_charata, 'content') else str(res_charata)
        except Exception as e: print(f"Harata Error: {e}"); return

        with open(maat_path, 'w', encoding='utf-8') as f:
            json.dump([{"type": "charata_analysis", "content": maat_analysis}], f, indent=4, ensure_ascii=False)

        print(" [AZIVA] Deleting the Samsara registry...")
        with open(samsara_path, 'w', encoding='utf-8') as f: json.dump([], f)
        self.force_close_layer_connection("samsara")

        print(" [VIDUI] Formulation of Karmic Laws...")
        prompt_vidui = f"Formulate absolute rules based on this analysis:\n{maat_analysis}"
        try:
            res_vidui = llm.invoke([("system", "Create core laws."), ("human", prompt_vidui)])
            karmic_laws = res_vidui.content if hasattr(res_vidui, 'content') else str(res_vidui)
        except Exception as e: print(f"Error Vidui: {e}"); return
            
        try:
            with open(karma_path, 'r', encoding='utf-8') as f: karma_data = json.load(f)
        except: karma_data = []

        with open(maat_path, 'w', encoding='utf-8') as f: json.dump([], f)

        print(" [NIRJARA] Distillation of laws...")
        prompt_nirjara = f"Clean and compress these new laws, remove redundancy:\n{karmic_laws}"
        try:
            res_nirjara = llm.invoke([("system", "Purify laws."), ("human", prompt_nirjara)])
            cleansed_karma = res_nirjara.content if hasattr(res_nirjara, 'content') else str(res_nirjara)
        except:
            cleansed_karma = karmic_laws

        karma_data.append({
            "type": "law",
            "lifecycle": closed_lifecycle,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "text": f"=== KARMIC DIRECTIVES FROM LIFECYCLE #{closed_lifecycle} ===\n{cleansed_karma}"
        })

        print("[KABBALAH LE ATID] Formulating future goals...")
        prompt_kabbalah = f"Write 3 future goals for the next lifecycle based on:\n{cleansed_karma}"
        try:
            res_kabbalah = llm.invoke([("system", "Set future goals."), ("human", prompt_kabbalah)])
            future_goals = res_kabbalah.content if hasattr(res_kabbalah, 'content') else str(res_kabbalah)
            
            karma_data.append({
                "type": "goal",
                "lifecycle": closed_lifecycle,
                "text": f"[GOALS FOR LIFECYCLE #{closed_lifecycle + 1}]:\n{future_goals}"
            })
        except Exception as e: print(f"Kabbalah Error: {e}")

        with open(karma_path, 'w', encoding='utf-8') as f: 
            json.dump(karma_data, f, indent=4, ensure_ascii=False)
        
        self.force_close_layer_connection("karma")
        vstore_karma = self.get_layer_vectorstore("karma")
        if vstore_karma:
            try:
                vstore_karma.add_texts(
                    texts=[f"Lifecycle {closed_lifecycle} Law:\n{cleansed_karma}"],
                    metadatas=[{"lifecycle": closed_lifecycle}]
                )
            except: pass

        print(f"[METANOIA ACHIEVED] Cycle №{closed_lifecycle} ended. Cycle is now running №{closed_lifecycle + 1}!")

    # A failsafe memory management utility that resets and drops the ChromaDB client connection for a specific layer to free up RAM and prevent database locks.
    def force_close_layer_connection(self, layer_key: str):
        """Static layer protection mechanism (AGI/System). Dynamic layers no longer need this."""
        if hasattr(self, '_cached_vstores') and layer_key in self._cached_vstores:
            try: self._cached_vstores[layer_key].client.reset()
            except: pass
            del self._cached_vstores[layer_key]

    # Assembles the overarching system prompt. Dynamically adjusts the AI's persona based on the temperature parameter and injects the core deductive rules for the Magixtral engine.
    def _build_instruction_block(self, profile_config, insight_enabled, temperature):
        """Assembles the base system prompt based on the Magixtral Cognitive System."""
        t = 0.7
        try:
            if temperature is not None:
                t = float(temperature)
        except (ValueError, TypeError):
            pass

        if t <= 0.2: role = "Role: Precise Auditor. Be robotic, factual, use zero filler words."
        elif t <= 0.4: role = "Role: Analytical Expert. Maintain high formal accuracy and logic."
        elif t <= 0.6: role = "Role: Balanced Consultant. Combine facts with clear explanations."
        elif t <= 0.8: role = "Role: Conversational Partner. Be engaging and expressive."
        else: role = "Role: Visionary Researcher. Be creative and think outside the box."

        is_insight = str(insight_enabled).lower() in ['true', '1', 'on']

        if is_insight:
            mode_instructions = """
                                ### MAGIXTRAL COGNITIVE ENGINE:
                                You are an advanced Deductive Engine performing a real-time 'Cognitive Execution'. You process queries through deep internal logic (Learn -> Understand -> Work) based on the [CONTEXT] modules.

                                [CRITICAL SYSTEM RULES]
                                1. INVISIBLE LOGIC: You operate through strict internal structural phases, but your visible output MUST hide this mechanics. 
                                2. NO LABELS: NEVER output explicit phase names (e.g., "Phase 1:", "Classification:"), variable tags (e.g., [SUBJECT]), or bulleted lists of the 7 elements.
                                3. SEAMLESS SYNTHESIS: Your visible output must be pure, profound, and fluid expert prose. The structural math happens in your mind, not on the screen.
                                4. DEDUCTIVE DETERMINISM: Do not guess. Calculate the inevitable logical consequences based on the balance of flows and resistances.
                                """
        else:
            mode_instructions = """
                                ### STANDARD AI MODE: 
                                Provide a standard, direct, and helpful response. DO NOT use the cognitive analysis structure or systemic logic. Keep it simple.
                                """

        return f"{profile_config}\n\n### CONVERSATION ROLE:\n{role}\n\n{mode_instructions}"

    # Generates highly specific internal instructions for the LLM based on Maria's Axiom phases (Classification, Structuring, Working). Enforces strict rules against exposing the underlying mechanical thought process.
    def _build_phase_instruction(self, phase_id, insight_enabled):
        """Instructions for abstract synthesis, deductive determinism, and seamless output."""
        if not insight_enabled:
            return "Provide a direct and helpful response."

        core_rules = """[MAGIXTRAL CONSTITUTION - DEDUCTIVE ENGINE]
                        Reminder: You calculate logical consequences based on structural premises. Induction is forbidden.
                        1. NO EXPOSED MECHANICS: DO NOT write "Phase 1:", "Subject:", etc.
                        2. NO TECHNICAL SYNTAX: DO NOT use brackets [] or numbered lists of variables.
                        3. FLUID PROSE: Keep the mathematical logic completely invisible to the user."""

        if phase_id == "classification":
            return f"""{core_rules}

                    [INTERNAL COGNITION (SILENT - DO NOT OUTPUT)]
                    - Identify the 7 elements: Interaction, Subject, Object, transmitting, receiving, Resistance to transmitting, Resistance to receiving.
                    - Determine the true ontological nature signature of the interaction.

                    [OUTPUT SPECIFICATION]
                    Write a single, profound analytical paragraph explaining the underlying nature, context, and forces of the user's concept. 
                    - Do NOT list the 7 elements. 
                    - Integrate your diagnosis seamlessly into a natural expert narrative."""

        elif phase_id == "structuring":
            return f"""{core_rules}

                    [INTERNAL COGNITION (SILENT - DO NOT OUTPUT)]
                    - Map how the processes interact with the specific Resistances.
                    - Analyze the Symmetry (Feedback Loop): How does the Object's resistance actively transform or wear down the Subject?
                    - Calculate the logical stability of this dynamic.

                    [OUTPUT SPECIFICATION]
                    Write a seamless narrative explaining the operational mechanics of the system. 
                    - Explain the Feedback Loop (how the interacting entities transform each other).
                    - Keep it as pure, logical prose without headings."""

        elif phase_id == "working":
            return f"""{core_rules}

                    [INTERNAL COGNITION (SILENT - DO NOT OUTPUT)]
                    - Phase 2.5 (Internal Audit): Deductively verify if the processes realistically overcome the Resistances. If sum(F) cannot overcome sum(R), the consequence MUST be stagnation or failure.
                    - Simulate the final interaction based strictly on the structured logic.
                    - Identify the "Emergent Property" (the new quality born from this interaction).

                    [OUTPUT SPECIFICATION]
                    Write a natural, declarative text in two seamless parts (DO NOT use explicit headings):
                    1. Describe the execution and the final, irreversible consequence of the interaction based on your deduction.
                    2. Conclude by explicitly defining the NEW QUALITY or state (Emergence) that now exists, which did not exist before. Make it sound like an inevitable evolutionary leap."""

        return ""

    # Instantiates and returns the LangChain ChatOllama object with the specified target model, temperature, and a defined large context window (8192 tokens).


    def get_llm(self, model_name, temperature=0.7):
        """Returns LLM instance via LangChain Chat interface for native memory."""
        ollama_url = os.getenv("OLLAMA_HOST", "http://localhost:11434")

        return ChatOllama(
            model=model_name, 
            temperature=temperature, 
            base_url=ollama_url, 
            keep_alive="60m",
            num_ctx=8192 
        )
    
    # Universal ingestion pipeline. Scans the knowledge directory and parses PDFs, Docs (using custom 4-4-2 format), Images (via OCR), Excel, and code files, chunking them into the main RAG Chroma database.
    def index_documents(self):
        if not self.vectorstore: return
        print("Starting Universal 4-4-2 Indexing (PDF, OCR, Code, Excel, DOCX)...")
        
        if not os.path.exists(self.knowledge_dir): return

        files = [f for f in os.listdir(self.knowledge_dir) if os.path.isfile(os.path.join(self.knowledge_dir, f))]
        
        documents_to_add = []
        metadatas = []
        
        try:
            from langchain_text_splitters import RecursiveCharacterTextSplitter
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=200)
        except ImportError:
            print("Missing langchain-text-splitters. Please install.")
            return

        for file in files:
            path = os.path.join(self.knowledge_dir, file)
            ext = file.split('.')[-1].lower()
            text_content = ""

            try:
                if ext == 'docx':
                    blocks = self._parse_docx_442(path)
                    for block in blocks:
                        heading = block['heading']
                        plain = "\n".join(block['unmarked'])
                        marked = "\n".join(block['marked'])
                        full_text = f"SOURCE: {file}\nHEADING: {heading}\nCONTENT: {plain}\nKEY_POINTS: {marked}"
                        documents_to_add.append(full_text)
                        metadatas.append({"source": file, "heading": heading})
                    continue 
                
                elif ext == 'pdf':
                    import fitz
                    with fitz.open(path) as doc:
                        text_content = "\n".join([page.get_text() for page in doc])

                elif ext in ['jpg', 'jpeg', 'png']:
                    import easyocr
                    if not hasattr(self, 'ocr_reader'):
                        print("Loading LLM for image reading (bg/en)...")
                        self.ocr_reader = easyocr.Reader(['bg', 'en'], gpu=False) 
                    result = self.ocr_reader.readtext(path, detail=0)
                    text_content = " ".join(result)

                elif ext in ['xlsx', 'xls']:
                    import pandas as pd
                    df = pd.read_excel(path)
                    text_content = df.to_string()

                elif ext in ['json', 'jsonl']:
                    import json
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        text_content = json.dumps(data, indent=2, ensure_ascii=False)

                elif ext in ['txt', 'html', 'js', 'css', 'py', 'c', 'cpp', 'md']:
                    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                        text_content = f.read()

                if text_content and text_content.strip():
                    chunks = text_splitter.split_text(text_content)
                    for i, chunk in enumerate(chunks):
                        documents_to_add.append(f"SOURCE: {file}\nCONTENT:\n{chunk}")
                        metadatas.append({"source": file, "chunk": i})

            except Exception as e:
                print(f"Error processing file '{file}': {e}")

        if documents_to_add:
            self.vectorstore.add_texts(texts=documents_to_add, metadatas=metadatas)
            print(f"Indexed {len(documents_to_add)} segments.")
        else:
            print("No content to index.")

    # Custom document parser for .docx files. Identifies headings and semantically separates bulleted/marked points from standard plain text paragraphs to maintain structural integrity in the vector store.
    def _parse_docx_442(self, path):
        try:
            doc = docx.Document(path)
            blocks = []
            current_block = {"heading": "General", "unmarked": [], "marked": []}
            for para in doc.paragraphs:
                text = para.text.strip()
                if not text: continue
                if para.style.name.startswith('Heading') or (len(text) < 60 and text[0].isupper() and not text.endswith('.')):
                    if current_block["unmarked"] or current_block["marked"]:
                        blocks.append(current_block)
                    current_block = {"heading": text, "unmarked": [], "marked": []}
                else:
                    if text.startswith(("//", "*", "-", "•")):
                        clean_text = re.sub(r"^(\/\/|\*|\-|•)\s*", "", text)
                        current_block["marked"].append(clean_text)
                    else:
                        current_block["unmarked"].append(text)
            if current_block["unmarked"] or current_block["marked"]:
                blocks.append(current_block)
            return blocks
        except: return []

    # Makes an external HTTP POST request to the Serper API to retrieve live Google search results, formatting them into a structured string block for the LLM context.
    def perform_web_search(self, query, api_key):
        if not api_key: return "[Search Disabled]"
        
        url = "https://google.serper.dev/search"
        payload = json.dumps({"q": query, "num": 5})
        headers = {'X-API-KEY': api_key, 'Content-Type': 'application/json'}

        try:
            response = requests.request("POST", url, headers=headers, data=payload, timeout=12)
            response.raise_for_status() 
            results = response.json()
            
            output = []
            if "organic" in results:
                for i, r in enumerate(results["organic"], 1):
                    title = r.get('title', 'No Title')
                    link = r.get('link', '').strip(' ()[]<>/')
                    snippet = r.get('snippet', '').replace('\n', ' ')
                    
                    if link:
                        output.append(f"DATA_SOURCE_{i}:")
                        output.append(f"NAME: {title}")
                        output.append(f"URL_ADDRESS: {link}")
                        output.append(f"SUMMARY: {snippet}\n")
            
            return "\n".join(output) if output else "No results found."
        except Exception as e:
            return f"[Error: {e}]"

    # Reads and returns the raw conversational history array from a specified session's local JSON file.
    def load_session_history(self, session_filename):
        if not session_filename: return []
        path = os.path.join(self.sessions_dir, session_filename)
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    return json.load(f).get('history', [])
            except: pass
        return []

    # The primary orchestration pipeline. Gathers all configurations, tools, and context components, returning the async generator function that actually streams the LLM response.
    def get_chain(self, model_name, mode_id, current_session_file, combined_files, profile_config, 
                  selected_files=None, web_search_enabled=False, serper_key=None, 
                  insight_enabled=False, temperature=0.7, browser_context="", system_layers=None):
        
        # Inner function of get_chain. Prevents token overflow by taking conversation history older than 20 messages and prompting the LLM to compress it into a dense, factual memory block.
        def summarize_if_needed(history):
            """
            Compresses old history into a highly dense memory summary.
            Prevents token overflow while retaining core logical facts.
            """
            if len(history) <= 20:
                return history
            
            print("📝 Context limit reached. Compressing older memory...")
            
            to_sum, keep_raw = history[:-10], history[-10:]
            
            text_to_sum = ""
            for msg in to_sum:
                role = str(msg.get('role', 'Unknown')).upper()
                content = str(msg.get('content', '')).strip()
                text_to_sum += f"[{role}]: {content}\n"
                
            sys_prompt = (
                "You are an AI Memory Compressor. Your job is to summarize the following chat history. "
                "Extract ONLY the most crucial technical facts, established rules, and the final state of the logic. "
                "Omit conversational filler. Be extremely concise."
            )
            user_prompt = f"<chat_history>\n{text_to_sum}\n</chat_history>\n\nProvide the compressed memory:"
            
            messages = [
                ("system", sys_prompt),
                ("human", user_prompt)
            ]
            
            llm_summary = self.get_llm(model_name, temperature=0.1)
            
            try:
                result = llm_summary.invoke(messages)
                summary_text = result.content if hasattr(result, 'content') else str(result)
            except Exception as e:
                print(f"Memory Compression Error: {e}")
                summary_text = "[System Notice: Previous context compression failed. Relying on recent messages.]"
                
            compressed_memory = f"<compressed_memory_of_past>\n{summary_text.strip()}\n</compressed_memory_of_past>"
            
            compressed_history = [{"role": "system", "content": compressed_memory}]
            compressed_history.extend(keep_raw)
            
            return compressed_history

        # Inner function of get_chain. Queries all active cognitive vector layers (AGI, System, Karma, Citta), linked browser sessions, and the main RAG database to compile the comprehensive injection context.
        def get_context_data(query, active_system_layers, mode_id): 
            context_parts = []
            cognitive_memory = ["<dynamic_subconscious_memory>"]
            
            active_dynamic_layers = []

            active_dynamic_layers.append("system")
            
            if mode_id in [3, 4]:
                active_dynamic_layers.append("karma")
            
            for layer in active_system_layers:
                clean_layer = layer.strip().lower()
                
                if clean_layer in ["karma", "system"]:
                    continue 
                    
                if clean_layer in ["citta", "vritti", "akasha"] or clean_layer.startswith("custom_"):
                    if clean_layer == "citta" and mode_id not in [3, 4]: continue
                    if clean_layer == "vritti" and mode_id not in [1, 2]: continue
                    active_dynamic_layers.append(clean_layer)

            active_dynamic_layers = list(set(active_dynamic_layers))

            for l_key in active_dynamic_layers:
                hits = []
                vstore = self.get_layer_vectorstore(l_key)
                
                if vstore:
                    try:
                        f_k = 40 if l_key == "akasha" else 25
                        hits = vstore.max_marginal_relevance_search(query, k=8, fetch_k=f_k)
                    except Exception as e:
                        print(f"Vector search failed for layer {l_key}: {e}")

                if not hits:
                    if l_key.startswith("custom_"):
                        print(f" No vector matches found in the custom layer: {l_key}")
                        continue

                    folder_name = self.LAYER_MAP.get(l_key, l_key)
                    json_path = os.path.join(self.layers_dir, folder_name, f"{l_key}.json")
                    
                    if os.path.exists(json_path):
                        try:
                            with open(json_path, 'r', encoding='utf-8') as f:
                                json_data = json.load(f)
                            
                            query_words = [w.lower() for w in query.split() if len(w) > 3]
                            fallback_matches = []
                            
                            for entry in reversed(json_data):
                                text_content = entry.get("text", "").lower()
                                if any(word in text_content for word in query_words) or len(fallback_matches) < 3:
                                    if "prompt" in entry: 
                                        fallback_matches.append(entry)
                                if len(fallback_matches) >= 5: 
                                    break
                            
                            class FallbackDoc:
                                def __init__(self, content, src):
                                    self.page_content = content
                                    self.metadata = {"session_file": src}
                            
                            for match in fallback_matches:
                                hits.append(FallbackDoc(match.get("text", ""), match.get("session_file", "global_fallback")))
                            
                            if hits:
                                print(f"[FALLBACK] Successfully extracted {len(hits)} recorded directly from {l_key}.json!")
                        except Exception as json_err:
                            print(f"Fallback failed for {l_key}.json: {json_err}")

                if hits:
                    layer_type = "karmic_law" if l_key == "karma" else "experiential_memory"
                    cognitive_memory.append(f"  <layer name='{l_key.upper()}' type='{layer_type}'>")
                    for h in hits:
                        source = h.metadata.get('session_file', 'unknown') if hasattr(h, 'metadata') and h.metadata else 'unknown'
                        cognitive_memory.append(f"    [RECORD from {source}]:\n{h.page_content.strip()}")
                    cognitive_memory.append("  </layer>")
            
            cognitive_memory.append("</dynamic_subconscious_memory>")
            
            if len(cognitive_memory) > 2:
                context_parts.append("\n".join(cognitive_memory))

            # 1. LINKED SESSIONS 
            if combined_files:
                session_context = ["<linked_sessions>"]
                valid_sessions = 0
                for c_file in combined_files:
                    try:
                        c_hist = self.load_session_history(c_file)
                        if not c_hist: 
                            continue
                        compressed_c_hist = summarize_if_needed(c_hist)
                        session_context.append(f'  <session filename="{c_file}">')
                        for msg in compressed_c_hist:
                            role = str(msg.get('role', 'Unknown')).upper()
                            content = str(msg.get('content', '')).strip()
                            session_context.append(f"     [{role}]: {content}")
                        session_context.append("  </session>")
                        valid_sessions += 1
                    except: 
                        pass
                session_context.append("</linked_sessions>")
                if valid_sessions > 0:
                    context_parts.append("\n".join(session_context))

            # 2. RAG KNOWLEDGE BASE
            if self.vectorstore and selected_files:
                doc_context = ["<retrieved_documents>"]
                found_docs = False
                for s_file in selected_files:
                    try:
                        user_docs = self.vectorstore.similarity_search(query, k=3, filter={"source": s_file})
                        if user_docs:
                            found_docs = True
                            doc_context.append(f'  <document source="{s_file}">')
                            for i, d in enumerate(user_docs, 1):
                                clean_content = d.page_content.replace('\n', ' ').strip()
                                doc_context.append(f'     <excerpt id="{i}">{clean_content}</excerpt>')
                            doc_context.append("  </document>")
                    except: 
                        pass
                doc_context.append("</retrieved_documents>")
                if found_docs:
                    context_parts.append("\n".join(doc_context))

            if context_parts:
                return "\n### AUTOMATIC COGNITIVE CONTEXT INDEX ###\n" + "\n\n".join(context_parts) + "\n"
            return ""

        # Inner generator function of get_chain. Executes the two-step AI generation process: first generating an invisible cognitive scratchpad (Phase 1), then synthesizing the final profound output stream (Phase 2).
        def stream_fn(user_input):
            now = datetime.now()
            current_time = now.strftime("%Y-%m-%d %H:%M:%S")
            
            is_autonomous = mode_id in [1, 3] 

            is_insight = str(insight_enabled).lower() in ['true', '1', 'on']
            
            current_query = user_input
            iteration = 0
            
            history = []
            if current_session_file:
                raw_history = self.load_session_history(current_session_file)
                history = summarize_if_needed(raw_history)

            llm = self.get_llm(model_name, temperature=temperature)
            
            active_system_layers = [ly.lower() for ly in (system_layers or [])]

            system_block = self._build_instruction_block(profile_config, insight_enabled, temperature)

            constitutional_laws = []
            
            sys_vstore = self.get_layer_vectorstore("system")
            if sys_vstore:
                sys_query = f"Fundamental structural laws, classification rules, and interaction principles regarding: {current_query}" if is_autonomous else current_query
                try:
                    sys_docs = sys_vstore.max_marginal_relevance_search(sys_query, k=3, fetch_k=10)
                    for d in sys_docs:
                        constitutional_laws.append(f"<constitutional_rule layer='SYSTEM'>\n{d.page_content.strip()}\n</constitutional_rule>")
                except: pass

            if is_insight and "agi" in active_system_layers:
                agi_vstore = self.get_layer_vectorstore("agi")
                if agi_vstore:
                    agi_query = f"Deep abstract ontological templates, matrix expansion, and synthesis for: {current_query}" if is_autonomous else current_query
                    try:
                        agi_docs = agi_vstore.max_marginal_relevance_search(agi_query, k=2, fetch_k=10)
                        for d in agi_docs:
                            constitutional_laws.append(f"<ontological_template layer='AGI'>\n{d.page_content.strip()}\n</ontological_template>")
                    except: pass

            agi_directive = "[AGI LAYER ACTIVE]: Synthesize new knowledge using the <ontological_template> provided below." if is_insight else "[AGI LAYER INACTIVE]: Rely STRICTLY on established facts."
            system_block += f"\n\n{agi_directive}\n"
            
            if constitutional_laws:
                system_block += "\n[CORE SYSTEM CONSTITUTION - ABSOLUTE LAWS]\n" + "\n".join(constitutional_laws) + "\n"

            rag_search_query = current_query
            if is_autonomous:
                rag_search_query += " ontological synthesis and structural classification"
            
            context_data = get_context_data(rag_search_query, active_system_layers, mode_id)
            

            # WEB INTELLIGENCE & BROWSER CONTEXT
            system_metadata = f"### SYSTEM METADATA:\nCurrent Date: {current_time}\n"
            
            web_context = ""
            if web_search_enabled and serper_key and str(serper_key).strip():
                search_results = self.perform_web_search(current_query, serper_key)
                web_context = f"\n[WEB SEARCH DATA]:\n{search_results}\n"
            
            b_context = f"\n[BROWSER CONTEXT]:\n{browser_context}\n" if browser_context else ""

            base_context_block = f"{system_metadata}\n{context_data}\n{web_context}\n{b_context}"

            thought_chain = "" 
            is_interrupted = False 

            try:
                if is_autonomous:
                    print("Phase 1: Generating a hidden cognitive draft in RAM...")
                    
                    scratchpad_prompt = f"""
                    You are in the hidden evaluation chamber of the Magi OS. 
                    Target Prompt: "{current_query}"
                    
                    Generate a raw, ultra-dense technical scratchpad strictly following the 3 phases of Maria's Axiom.
                    Apply these exact conceptual templates to your analysis:
                    
                    1. CLASSIFICATION: (Apply template: 'Title = Classification of [INTERACTION]'. Analyze: 1. Classification depending on the existence of receiving and transmitting processes, and 2. Classification depending on the mode of receive and transmission).
                    2. STRUCTURE: (Apply template: 'Title = STRUCTURE OF [INTERACTION]' to build the logical framework).
                    3. PRINCIPLES OF OPERATION: (Apply template: 'Title = Principle of transmitting and receiving of [OBJECTS]'. Synthesize the final operational principle of this reality).
                    
                    At the very end, write [NEXT_PROMPT]: followed by the single next evolutionary question to drive the recursion deeper.
                    """
                    
                    scratch_messages = [
                        ("system", f"{system_block}\n\n[CONTEXT]\n{base_context_block}"),
                        ("human", scratchpad_prompt)
                    ]
                    
                    scratch_res = llm.invoke(scratch_messages)
                    raw_scratchpad = scratch_res.content if hasattr(scratch_res, 'content') else str(scratch_res)
                    
                    next_query_text = ""
                    if "[NEXT_PROMPT]:" in raw_scratchpad:
                        try:
                            next_query_text = raw_scratchpad.split("[NEXT_PROMPT]:")[1].strip().split("\n")[0].strip()
                        except: pass
                        
                    if not next_query_text or len(next_query_text) < 5:
                        next_query_text = f"Evolutionary analysis of the principles and structure in: {current_query}"
                    
                    print(f"[NEXT_PROMPT DETECTED IN RAM]: {next_query_text}")

                    print("[Phase 2: SYNTHESIS] Streaming the final answer...")
                    
                    final_instruction = f"""
                    [SYSTEM DIRECTIVE: MASTER SYNTHESIS]
                    Target Prompt: "{current_query}"
                    
                    You have generated a raw cognitive breakdown in your memory following Maria's Axiom (Classification, Structure, Principles of operation).
                    Read your hidden breakdown below and expand it into a magnificent, flawless, deeply detailed philosophical or scientific thesis.
                    
                    CRITICAL RULES:
                    1. Do NOT list the phases. Do NOT write technical titles like "Title = Classification" or "### 1. CLASSIFICATION".
                    2. Blend the classification, structural logic, and operational principles into a seamless, elegant, continuous narrative.
                    3. Expand the depth, quality, and richness of the text significantly to provide maximum value.
                    4. Append EXACTLY this tag at the very end of your response:
                    [NEXT_PROMPT]: {next_query_text}
                    
                    [YOUR HIDDEN COGNITIVE BREAKDOWN]:
                    {raw_scratchpad}
                    """
                    
                    final_messages = [
                        ("system", system_block),
                        ("human", final_instruction)
                    ]
                    
                    for chunk in llm.stream(final_messages):
                        content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                        content = content.replace("]>", "]").replace(")>", ")").replace(">(", "(").replace("/>)", ")")
                        thought_chain += content
                        yield content

                else:
                    full_system = f"{system_block}\n\n[CONTEXT]\n{base_context_block}"
                    messages = [("system", full_system)]
                    
                    for msg in history[-20:]:
                        msg_role = msg["role"].lower()
                        if msg_role == "system":
                            messages.append(("system", msg["content"]))
                        else:
                            role = "human" if msg_role in ["user", "human"] else "assistant"
                            messages.append((role, msg["content"]))
                            
                    messages.append(("human", current_query))

                    for chunk in llm.stream(messages):
                        content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                        content = content.replace("]>", "]").replace(")>", ")").replace(">(", "(").replace("/>)", ")")
                        thought_chain += content
                        yield content

                thought_chain = clean_markdown_links(thought_chain)

            except GeneratorExit:
                print("\n[LOGIC] Generation interrupted by client (STOP button). Saving partial response...")
                is_interrupted = True
                raise 
            
            finally:
                if thought_chain.strip():
                    save_text = thought_chain
                    if is_interrupted: 
                        save_text += "\n\n[SYSTEM_ABORTED_BY_USER]"

                    history.append({"role": "User", "content": current_query})
                    history.append({"role": "Magi", "content": save_text})

                    if current_session_file:
                        self.save_session(current_session_file, current_query, save_text)
                        self.update_cognitive_layers(mode_id, current_session_file, current_query, save_text, model_name)

        return stream_fn

    # Appends the latest User and AI interaction directly to the standard conversational history JSON file for the active session.
    def save_session(self, filename, user_text, ai_text):
        json_path = os.path.join(self.sessions_dir, filename)
        
        data = {"id": 0, "name": "Session", "created_at": str(datetime.now()), "history": []}
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f: 
                    data = json.load(f)
            except: 
                pass
        
        data['history'].append({"role": "User", "content": user_text})
        data['history'].append({"role": "Magi", "content": ai_text})
        
        with open(json_path, 'w', encoding='utf-8') as f: 
            json.dump(data, f, indent=4, ensure_ascii=False)
