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
import tempfile
import csv
from datetime import datetime

import chromadb
from chromadb.utils import embedding_functions

from faster_whisper import WhisperModel
import torch

app = Flask(__name__, static_folder=None)
CORS(app)

# Whisper transcription model
model_size = "base.en"
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"
print(f"[STARTUP] Loading Whisper model: {model_size} on {device}...")
try:
    whisper_model = WhisperModel(model_size, device=device, compute_type=compute_type)
    print("[STARTUP] Whisper model loaded successfully.")
except Exception as e:
    print(f"[STARTUP] Error loading Whisper model: {e}, falling back to tiny.en")
    whisper_model = WhisperModel("tiny.en", device=device, compute_type=compute_type)

# Base directory for extracted data
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
# Directory for interaction logs
LOGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')

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

    # Gather confidence scores from all categories, then pick the best
    candidates = []

    # 1. Query rude collection
    try:
        if rude_collection and rude_collection.count() > 0:
            rude_results = rude_collection.query(query_texts=[query_text], n_results=1)
            if rude_results['distances'] and rude_results['distances'][0]:
                rude_distance = rude_results['distances'][0][0]
                rude_confidence = max(0, min(100, (1 - rude_distance) * 100))
                rude_matched = rude_results['documents'][0][0]
                print(f"[RUDE] Matched: '{rude_matched}' | Distance: {rude_distance:.4f} | Confidence: {rude_confidence:.1f}%")
                candidates.append({
                    "confidence": rude_confidence,
                    "distance": rude_distance,
                    "category": "rude",
                    "matched": rude_matched,
                    "result": {
                        "answer": None,
                        "question": rude_matched,
                        "id": None,
                        "score": rude_distance,
                        "title": title,
                        "category": "rude"
                    }
                })
    except Exception as e:
        print(f"[RUDE] Exception: {e}")

    # 2. Query conversational (filtered by topic)
    try:
        if faq_collection:
            conv_results = faq_collection.query(
                query_texts=query_texts,
                n_results=1,
                where={"$and": [{"category": "conversational"}, {"Title": title}]}
            )
            if conv_results['distances'] and conv_results['distances'][0]:
                conv_distance = conv_results['distances'][0][0]
                conv_confidence = max(0, min(100, (1 - conv_distance) * 100))
                conv_matched = conv_results['documents'][0][0]
                conv_metadata = conv_results['metadatas'][0][0]
                print(f"[CONV] Matched: '{conv_matched}' | Distance: {conv_distance:.4f} | Confidence: {conv_confidence:.1f}%")
                candidates.append({
                    "confidence": conv_confidence,
                    "distance": conv_distance,
                    "category": "conversational",
                    "matched": conv_matched,
                    "result": {
                        "answer": conv_metadata['answer'],
                        "question": conv_matched,
                        "id": conv_results['ids'][0][0],
                        "score": conv_distance,
                        "title": title,
                        "category": "conversational"
                    }
                })
    except Exception as e:
        print(f"[CONV] Exception: {e}")

    # 3. Query answers for this topic
    try:
        if faq_collection:
            answer_results = faq_collection.query(
                query_texts=query_texts,
                n_results=1,
                where={"$and": [{"category": "answers"}, {"Title": title}]}
            )
            if answer_results['distances'] and answer_results['distances'][0]:
                ans_distance = answer_results['distances'][0][0]
                ans_confidence = max(0, min(100, (1 - ans_distance) * 100))
                ans_matched = answer_results['documents'][0][0]
                ans_metadata = answer_results['metadatas'][0][0]
                print(f"[ANSWER] Matched: '{ans_matched}' | Distance: {ans_distance:.4f} | Confidence: {ans_confidence:.1f}%")
                candidates.append({
                    "confidence": ans_confidence,
                    "distance": ans_distance,
                    "category": "answers",
                    "matched": ans_matched,
                    "result": {
                        "answer": ans_metadata['answer'],
                        "question": ans_matched,
                        "id": answer_results['ids'][0][0],
                        "score": ans_distance,
                        "title": title,
                        "category": "answers"
                    }
                })
    except Exception as e:
        print(f"[ANSWER] Exception: {e}")

    # Pick the candidate with the highest confidence (minimum 60%)
    valid = [c for c in candidates if c['confidence'] >= 60]

    if valid:
        best = max(valid, key=lambda c: c['confidence'])
        print(f"[DECISION] Winner: {best['category']} at {best['confidence']:.1f}% — '{best['matched']}'")
        return jsonify(best['result']), 200

    # No candidate reached 60% — return no_answer with the best partial match info
    if candidates:
        best_partial = max(candidates, key=lambda c: c['confidence'])
        print(f"[DECISION] No category reached 60%. Best was {best_partial['category']} at {best_partial['confidence']:.1f}%. Returning no_answer.")
        return jsonify({
            "answer": None,
            "question": best_partial['matched'],
            "id": None,
            "score": best_partial['distance'],
            "title": title,
            "category": "no_answer"
        }), 200

    print(f"[DECISION] No matches at all, returning no_answer")
    return jsonify({
        "answer": None, "question": None, "id": None,
        "score": None, "title": title, "category": "no_answer"
    }), 200


# === LOG INTERACTION ===

CSV_HEADERS = ['Title', 'Question user asked', 'Question system thought', 'Answer given', 'Category of answer', 'Confidence score', 'Timestamp']

@app.route('/log-interaction', methods=['POST'])
def log_interaction():
    """Append an avatar-user interaction to a CSV log file."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request'}), 400

    title = data.get('title', '')
    question_user = data.get('question_user_asked', '')
    question_system = data.get('question_system_thought', '')
    answer_given = data.get('answer_given', '')
    category = data.get('category', '')
    confidence = data.get('confidence_score', '')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')

    os.makedirs(LOGS_DIR, exist_ok=True)
    csv_path = os.path.join(LOGS_DIR, 'interactions.csv')
    file_exists = os.path.exists(csv_path)

    try:
        with open(csv_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(CSV_HEADERS)
            writer.writerow([title, question_user, question_system, answer_given, category, confidence, timestamp])
        return jsonify({'ok': True}), 200
    except Exception as e:
        print(f"[LOG] Error writing interaction: {e}")
        return jsonify({'error': str(e)}), 500


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


# === TRANSCRIPTION ===

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        audio_file.save(temp_audio.name)
        temp_path = temp_audio.name

    try:
        segments, info = whisper_model.transcribe(
            temp_path,
            beam_size=1,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        text = " ".join([segment.text for segment in segments])
        return jsonify({'text': text.strip()}), 200
    except Exception as e:
        print(f"Transcription error: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == '__main__':
    if os.path.exists(DATA_DIR):
        shutil.rmtree(DATA_DIR)
        print(f"[STARTUP] Purged old data directory")
    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"[STARTUP] Standalone player backend starting...")
    print(f"[STARTUP] Data directory: {DATA_DIR}")
    print(f"[STARTUP] Upload a zip file at http://127.0.0.1:5001")
    app.run(host='0.0.0.0', port=5001)
