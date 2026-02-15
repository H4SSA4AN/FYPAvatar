"""
Standalone Interactive Avatar Player Backend

A self-contained Flask server that:
1. Serves the player UI
2. Accepts a zip upload containing all project data
3. Extracts ChromaDB, SQLite, videos, audio, and JSON configs
4. Provides the same query/titles/faqs/video endpoints as the main app
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import zipfile
import sqlite3
import json
import shutil

import chromadb
from chromadb.utils import embedding_functions

app = Flask(__name__, static_folder=None)
CORS(app)

# Base directory for extracted data
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

# ChromaDB and SQLite are initialized after zip upload
chroma_client = None
faq_collection = None
rude_collection = None
ef = None

def get_db_conn():
    """Get a connection to the extracted SQLite database"""
    db_path = os.path.join(DATA_DIR, 'app.db')
    if not os.path.exists(db_path):
        return None
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_chroma():
    """Initialize ChromaDB from the extracted db directory"""
    global chroma_client, faq_collection, rude_collection, ef

    chroma_path = os.path.join(DATA_DIR, 'db')
    if not os.path.exists(chroma_path):
        print(f"[WARN] ChromaDB directory not found at {chroma_path}")
        return False

    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name='multi-qa-mpnet-base-dot-v1'
    )
    chroma_client = chromadb.PersistentClient(path=chroma_path)

    try:
        faq_collection = chroma_client.get_or_create_collection('faq', embedding_function=ef)
        print(f"[INIT] FAQ collection loaded: {faq_collection.count()} entries")
    except Exception as e:
        print(f"[INIT] Error loading FAQ collection: {e}")
        faq_collection = None

    try:
        rude_collection = chroma_client.get_or_create_collection('rude', embedding_function=ef)
        print(f"[INIT] Rude collection loaded: {rude_collection.count()} entries")
    except Exception as e:
        print(f"[INIT] Error loading rude collection: {e}")
        rude_collection = None

    return True


# === PAGE ROUTES ===

@app.route('/')
def index():
    return send_from_directory('.', 'player.html')

@app.route('/player.css')
def serve_css():
    return send_from_directory('.', 'player.css')

@app.route('/player.js')
def serve_js():
    return send_from_directory('.', 'player.js')


# === STATIC FILE SERVING ===

@app.route('/static/<path:filepath>')
def serve_static(filepath):
    static_dir = os.path.join(DATA_DIR, 'static')
    return send_from_directory(static_dir, filepath)


# === ZIP UPLOAD ===

@app.route('/upload-zip', methods=['POST'])
def upload_zip():
    if 'zipfile' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['zipfile']
    if not file.filename.endswith('.zip'):
        return jsonify({'error': 'File must be a .zip'}), 400

    # Clear old data
    if os.path.exists(DATA_DIR):
        shutil.rmtree(DATA_DIR)
    os.makedirs(DATA_DIR, exist_ok=True)

    # Save and extract zip
    zip_path = os.path.join(DATA_DIR, 'upload.zip')
    file.save(zip_path)

    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(DATA_DIR)
        os.remove(zip_path)
    except zipfile.BadZipFile:
        return jsonify({'error': 'Invalid zip file'}), 400

    # Initialize databases from extracted data
    success = init_chroma()
    if not success:
        return jsonify({'error': 'Failed to initialize ChromaDB from zip'}), 500

    # Verify SQLite exists
    db_path = os.path.join(DATA_DIR, 'app.db')
    if not os.path.exists(db_path):
        return jsonify({'error': 'app.db not found in zip'}), 500

    # Count what was loaded
    video_dir = os.path.join(DATA_DIR, 'static', 'videos')
    video_count = 0
    if os.path.exists(video_dir):
        for root, dirs, files in os.walk(video_dir):
            video_count += len([f for f in files if f.endswith('.mp4')])

    return jsonify({
        'message': 'Data loaded successfully',
        'videos': video_count,
        'faq_entries': faq_collection.count() if faq_collection else 0,
        'rude_entries': rude_collection.count() if rude_collection else 0
    }), 200


# === TITLES ===

@app.route('/titles', methods=['GET'])
def get_titles():
    try:
        conn = get_db_conn()
        if not conn:
            return jsonify({'data': []}), 200
        cursor = conn.cursor()
        cursor.execute('SELECT name FROM titles')
        rows = cursor.fetchall()
        conn.close()
        titles = [row['name'] for row in rows]
        return jsonify({'data': titles}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# === FAQS ===

@app.route('/faqs', methods=['GET'])
def get_faqs():
    title = request.args.get('title')
    if not title or not faq_collection:
        return jsonify({'data': []}), 200

    try:
        results = faq_collection.get(
            where={"Title": title},
            include=["metadatas", "documents"]
        )
        formatted = []
        if results['ids']:
            for i, doc_id in enumerate(results['ids']):
                formatted.append({
                    "id": doc_id,
                    "question": results['documents'][i],
                    "answer": results['metadatas'][i].get('answer', ''),
                    "title": results['metadatas'][i].get('Title', '')
                })
        return jsonify({'data': formatted}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# === QUERY (rude -> conversational -> answers -> no_answer) ===

@app.route('/query', methods=['POST'])
def query_faq():
    data = request.get_json()
    if not data or 'query' not in data:
        return jsonify({'error': 'Invalid request'}), 400

    query_text = data['query']
    title = data.get('title', 'none')
    query_texts = [query_text]

    print(f"\n[QUERY] Input: '{query_text}' | Title: '{title}'")

    # Step 1: Check rude
    try:
        if rude_collection and rude_collection.count() > 0:
            rude_results = rude_collection.query(query_texts=[query_text], n_results=1)
            if rude_results['distances'] and rude_results['distances'][0]:
                rude_distance = rude_results['distances'][0][0]
                rude_confidence = max(0, min(100, (1 - rude_distance) * 100))
                rude_matched = rude_results['documents'][0][0]
                print(f"[STEP 1 - RUDE] Matched: '{rude_matched}' | Distance: {rude_distance:.4f} | Confidence: {rude_confidence:.1f}%")

                if rude_confidence >= 60:
                    print("[STEP 1 - RUDE] >>> RUDE DETECTED")
                    return jsonify({
                        "answer": None,
                        "question": rude_matched,
                        "id": None,
                        "score": rude_distance,
                        "title": title,
                        "category": "rude"
                    }), 200
    except Exception as e:
        print(f"[STEP 1 - RUDE] Exception: {e}")

    # Step 2: Check conversational
    try:
        if faq_collection:
            conv_results = faq_collection.query(
                query_texts=query_texts,
                n_results=1,
                where={"category": "conversational"}
            )
            if conv_results['distances'] and conv_results['distances'][0]:
                conv_distance = conv_results['distances'][0][0]
                conv_confidence = max(0, min(100, (1 - conv_distance) * 100))
                conv_matched = conv_results['documents'][0][0]
                print(f"[STEP 2 - CONV] Matched: '{conv_matched}' | Distance: {conv_distance:.4f} | Confidence: {conv_confidence:.1f}%")

                if conv_confidence >= 60:
                    conv_metadata = conv_results['metadatas'][0][0]
                    print("[STEP 2 - CONV] >>> CONVERSATIONAL HIT")
                    return jsonify({
                        "answer": conv_metadata['answer'],
                        "question": conv_results['documents'][0][0],
                        "id": conv_results['ids'][0][0],
                        "score": conv_distance,
                        "title": conv_metadata.get('Title', title),
                        "category": "conversational"
                    }), 200
    except Exception as e:
        print(f"[STEP 2 - CONV] Exception: {e}")

    # Step 3: Check answers
    try:
        if faq_collection:
            answer_results = faq_collection.query(
                query_texts=query_texts,
                n_results=1,
                where={"Title": title}
            )
            if answer_results['distances'] and answer_results['distances'][0]:
                ans_distance = answer_results['distances'][0][0]
                ans_confidence = max(0, min(100, (1 - ans_distance) * 100))
                ans_matched = answer_results['documents'][0][0]
                print(f"[STEP 3 - ANSWER] Matched: '{ans_matched}' | Distance: {ans_distance:.4f} | Confidence: {ans_confidence:.1f}%")

                if ans_confidence >= 60:
                    ans_metadata = answer_results['metadatas'][0][0]
                    print("[STEP 3 - ANSWER] >>> ANSWER HIT")
                    return jsonify({
                        "answer": ans_metadata['answer'],
                        "question": answer_results['documents'][0][0],
                        "id": answer_results['ids'][0][0],
                        "score": ans_distance,
                        "title": ans_metadata.get('Title', title),
                        "category": ans_metadata.get('category', 'answers')
                    }), 200
                else:
                    print("[STEP 3 - ANSWER] Confidence below 60%, no_answer")
                    return jsonify({
                        "answer": None,
                        "question": answer_results['documents'][0][0],
                        "id": None,
                        "score": ans_distance,
                        "title": title,
                        "category": "no_answer"
                    }), 200
    except Exception as e:
        print(f"[STEP 3 - ANSWER] Exception: {e}")

    # Step 4: Fallback
    print("[STEP 4] No matches, returning no_answer")
    return jsonify({
        "answer": None, "question": None, "id": None,
        "score": None, "title": title, "category": "no_answer"
    }), 200


# === GET VIDEOS ===

@app.route('/get-videos', methods=['GET'])
def get_videos():
    title = request.args.get('title')
    category = request.args.get('category')
    if not title:
        return jsonify({'data': []}), 200

    if category:
        video_dir = os.path.join(DATA_DIR, 'static', 'videos', title, category)
    else:
        video_dir = os.path.join(DATA_DIR, 'static', 'videos', title)

    video_files = []
    if os.path.exists(video_dir):
        try:
            video_files = [f for f in os.listdir(video_dir) if f.endswith('.mp4')]
        except OSError as e:
            print(f"Error listing videos: {e}")

    return jsonify({'data': video_files}), 200


# === DEFAULT RESPONSES ===

@app.route('/default-responses', methods=['GET'])
def get_default_responses():
    json_path = os.path.join(DATA_DIR, 'defaultResponses.json')
    try:
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f)), 200
        return jsonify({"rude": [], "no_answer": []}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# === TRANSCRIPTION (uses Web Speech API on client, but keep endpoint for mic compatibility) ===

@app.route('/transcribe', methods=['POST'])
def transcribe():
    return jsonify({'error': 'Transcription not available in standalone mode. Use the browser Web Speech API or type your message.'}), 501


if __name__ == '__main__':
    if os.path.exists(DATA_DIR):
        shutil.rmtree(DATA_DIR)
        print(f"[STARTUP] Purged old data directory")
    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"[STARTUP] Standalone player backend starting...")
    print(f"[STARTUP] Data directory: {DATA_DIR}")
    print(f"[STARTUP] Upload a zip file at http://127.0.0.1:5001")
    app.run(host='0.0.0.0', port=5001)
