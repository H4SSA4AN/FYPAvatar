from flask import Flask, request, jsonify, make_response, jsonify, send_from_directory
from flask_cors import CORS
from services.FAQService import FAQService
from services.comfyService import ComfyService
from services.transcriptionService import TranscriptionService
import os
import uuid
import tempfile
import threading
import time
import shutil

app = Flask(__name__)
CORS(app)

VIDEO_FOLDER = os.path.join(app.root_path, 'static', 'videos')
os.makedirs(VIDEO_FOLDER, exist_ok=True)

faq_service = FAQService()
comfy_service = ComfyService()
transcription_service = TranscriptionService()

# Auto-seed the rude collection on startup
try:
    count = faq_service.seed_rude_collection()
    print(f"[STARTUP] Rude collection seeded with {count} phrases")
except Exception as e:
    print(f"[STARTUP] Failed to seed rude collection: {e}")

# Global store for progress: { "uuid": { "status": "processing", "progress": 0, "eta": 0, "url": None, "error": None } }
PROGRESS_STORE = {}


@app.route('/comfy-health', methods=['GET'])
def comfy_health():
    """Quick check if ComfyUI is reachable."""
    try:
        import urllib.request
        url = f"http://{comfy_service.server_addr}/system_stats"
        req = urllib.request.Request(url, method='GET')
        urllib.request.urlopen(req, timeout=5)
        return jsonify({'status': 'ok'}), 200
    except Exception as e:
        return jsonify({'status': 'down', 'error': str(e)}), 503

def video_worker(audio_path, image_path, title, filename_id, prompt, category, job_id):
    def update_progress(current, total, eta):
        PROGRESS_STORE[job_id]['progress'] = int((current / total) * 100)
        PROGRESS_STORE[job_id]['eta'] = int(eta)

    try:
        video_url = comfy_service.generate_video_talking_head(
            audio_path, image_path, title, filename_id, prompt,
            category=category, progress_callback=update_progress
        )
        
        if video_url:
            PROGRESS_STORE[job_id]['status'] = 'completed'
            PROGRESS_STORE[job_id]['progress'] = 100
            PROGRESS_STORE[job_id]['url'] = video_url
        else:
            PROGRESS_STORE[job_id]['status'] = 'failed'
            PROGRESS_STORE[job_id]['error'] = "Generation returned no URL"

    except Exception as e:
        PROGRESS_STORE[job_id]['status'] = 'failed'
        PROGRESS_STORE[job_id]['error'] = str(e)

@app.route('/upload', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    title = request.form['title']

    try:
        data = faq_service.process_csv(file.stream, title)
        return jsonify({'message': 'Processed successfully', 'data': data}), 200
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 500



@app.route('/faqs', methods=['GET'])
def get_faqs():
    title = request.args.get('title')

    try:
        data = faq_service.get_faqs(title)
        return jsonify({'message': 'Fetched successfully', 'data': data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/faq-answer', methods=['POST'])
def add_faq_answer():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request'}), 400
    title = data.get('title')
    question = data.get('question')
    answer = data.get('answer')
    if not title or not question or not answer:
        return jsonify({'error': 'title, question, and answer are required'}), 400
    try:
        faq = faq_service.add_faq_single(title, question, answer)
        return jsonify({'message': 'Added successfully', 'data': faq}), 201
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/faq-answer', methods=['PUT'])
def update_faq_answer():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request'}), 400
    title = data.get('title')
    faq_id = data.get('id')
    question = data.get('question')
    answer = data.get('answer')
    if not title or not faq_id or question is None or answer is None:
        return jsonify({'error': 'title, id, question, and answer are required'}), 400
    try:
        faq = faq_service.update_faq_single(title, faq_id, question, answer)
        return jsonify({'message': 'Updated successfully', 'data': faq}), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/faq-answer', methods=['DELETE'])
def delete_faq_answer():
    title = request.args.get('title')
    faq_id = request.args.get('id')
    if not title or not faq_id:
        return jsonify({'error': 'title and id are required'}), 400
    try:
        faq_service.delete_faq_single(title, faq_id)
        return jsonify({'message': 'Deleted successfully'}), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/query', methods=['POST'])
def query_faq():
    data = request.get_json()
    if not data or 'query' not in data:
        return jsonify({'error': 'Invalid request'}), 400

    try:
        result = faq_service.query_faq(data['query'], data['title'])
        # result is now a dict { answer, question, id }
        return jsonify(result), 200 
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/titles', methods=['GET'])
def get_titles():
    try:
        topics = faq_service.get_titles()
        return jsonify({'message': 'Fetched successfully', 'data': topics}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/generateImage', methods=['POST'])
def generate_image():
    try:
        data = request.get_json()
        prompt = data.get('prompt')
        
        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        # Generate the image
        image_data = comfy_service.generate_image(prompt)

        if image_data:
            # Return the image directly as a response
            return image_data, 200, {'Content-Type': 'image/png'}
        else:
            return jsonify({'error': 'Failed to generate image'}), 500

    except Exception as e:
        print(f"Error generating avatar: {e}")
        return jsonify({'error': str(e)}), 500



@app.route('/generate-video', methods=['POST'])
def generate_video_route():
    # ... check for image file ...
    if 'image' not in request.files:
         return jsonify({'error': 'No image file provided'}), 400
    file = request.files['image']
    image_data = file.read()

    try:
        # Generate video
        video_data = comfy_service.generate_video(image_data)
        
        if video_data:
            # 1. Save to file
            filename = f"generated_{uuid.uuid4()}.mp4"
            filepath = os.path.join(VIDEO_FOLDER, filename)
            
            with open(filepath, 'wb') as f:
                f.write(video_data)
            
            # 2. Return the URL
            # Assuming your app is running at root, url is /static/videos/...
            video_url = f"/static/videos/{filename}"
            
            return jsonify({'video_url': video_url}), 200
        else:
            return jsonify({'error': 'Failed to generate video'}), 500

    except Exception as e:
        print(f"Error generating video: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/generate-audio-test', methods=['POST'])
def generate_audio_test_route():
    data = request.get_json()
    speechSettings = data.get('speechSettings')
    if not speechSettings:
        return jsonify({'error': 'Missing speechSettings'}), 400
    try:
        audio_url = comfy_service.generate_audio_test(speechSettings)
        if audio_url:
            return jsonify({'audio_url': audio_url}), 200
        else:
            return jsonify({'error': 'Failed to generate audio'}), 500
    except Exception as e:
        print(f"Error generating audio: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/generate-audio-single', methods=['POST'])
def generate_audio_single_route():
    data = request.get_json()
    text = data.get('text')
    title = data.get('title')
    filename_id = data.get('filename_id') # Get the UUID
    category = data.get('category', 'answers')
    use_placeholder = data.get('usePlaceholder', False)
    speechSettings = data.get('speechSettings', [])
    
    if not text or not title or not filename_id:
        return jsonify({'error': 'Missing text, title, or filename_id'}), 400

    try:
        if use_placeholder:
            # Skip ComfyUI -- copy placeholder file directly
            output_dir = os.path.join(app.root_path, 'static', 'audio', title, category)
            os.makedirs(output_dir, exist_ok=True)
            save_filename = f"{filename_id}.mp3"
            save_path = os.path.join(output_dir, save_filename)
            placeholder_path = os.path.join(app.root_path, 'static', 'placeholder.mp3')
            shutil.copy(placeholder_path, save_path)
            audio_url = f"/static/audio/{title}/{category}/{save_filename}"
            return jsonify({'audio_url': audio_url}), 200
        else:
            audio_url = comfy_service.generate_audio_single(text, title, filename_id, speechSettings, category)
            if audio_url:
                 return jsonify({'audio_url': audio_url}), 200
            else:
                 return jsonify({'error': 'Failed to generate audio'}), 500
    except Exception as e:
        print(f"Error generating audio: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/generate-video-single', methods=['POST'])
def generate_video_single_route():
    data = request.get_json()
    audio_path = data.get('audio_path') # e.g. "static/audio/Title/uuid.mp3"
    image_path = data.get('image_path') # e.g. "static/temp/image.png" or just a filename if already uploaded
    title = data.get('title')
    filename_id = data.get('filename_id')
    prompt = data.get('prompt') # Get prompt
    use_placeholder = data.get('usePlaceholder', False)
    
    if not all([audio_path, image_path, title, filename_id]):
        return jsonify({'error': 'Missing required fields'}), 400

    category = data.get('category', 'answers')

    audio_only = data.get('audioOnly', False)

    if use_placeholder:
        output_dir = os.path.join(app.root_path, 'static', 'videos', title, category)
        os.makedirs(output_dir, exist_ok=True)
        save_filename = f"{filename_id}.mp4"
        save_path = os.path.join(output_dir, save_filename)
        placeholder_path = os.path.join(app.root_path, 'static', 'placeholder.mp4')

        if audio_only and audio_path:
            # Mux real audio with placeholder video using ffmpeg
            import subprocess
            # Resolve the audio path relative to app root
            abs_audio = os.path.join(app.root_path, audio_path.lstrip('/'))
            if os.path.exists(abs_audio):
                try:
                    subprocess.run([
                        'ffmpeg', '-y',
                        '-stream_loop', '-1',
                        '-i', placeholder_path,
                        '-i', abs_audio,
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        '-shortest',
                        '-map', '0:v:0',
                        '-map', '1:a:0',
                        save_path
                    ], check=True, capture_output=True)
                    print(f"[AUDIO-ONLY] Muxed {abs_audio} into {save_path}")
                except subprocess.CalledProcessError as e:
                    print(f"[AUDIO-ONLY] ffmpeg failed: {e.stderr.decode()}")
                    shutil.copy(placeholder_path, save_path)
            else:
                print(f"[AUDIO-ONLY] Audio file not found: {abs_audio}, using silent placeholder")
                shutil.copy(placeholder_path, save_path)
        else:
            # Pure placeholder -- just copy the silent video
            shutil.copy(placeholder_path, save_path)

        video_url = f"/static/videos/{title}/{category}/{save_filename}"
        job_id = filename_id
        PROGRESS_STORE[job_id] = { "status": "completed", "progress": 100, "eta": 0, "url": video_url }
        return jsonify({'job_id': job_id, 'status': 'started'}), 202
    else:
        # Use the filename_id (UUID) as the job_id since it's unique per question
        job_id = filename_id 
        
        # Initialize progress
        PROGRESS_STORE[job_id] = { "status": "processing", "progress": 0, "eta": 0 }

        thread = threading.Thread(target=video_worker, args=(audio_path, image_path, title, filename_id, prompt, category, job_id))
        thread.start()

        return jsonify({'job_id': job_id, 'status': 'started'}), 202


def video_worker_extended(audio_path, image_path, title, filename_id, prompt, num_chunks, category, job_id):
    def update_progress(current, total, eta):
        PROGRESS_STORE[job_id]['progress'] = int((current / total) * 100)
        PROGRESS_STORE[job_id]['eta'] = int(eta)

    try:
        video_url = comfy_service.generate_video_extended(
            audio_path, image_path, title, filename_id, prompt,
            category=category, num_chunks=num_chunks,
            progress_callback=update_progress
        )

        if video_url:
            PROGRESS_STORE[job_id]['status'] = 'completed'
            PROGRESS_STORE[job_id]['progress'] = 100
            PROGRESS_STORE[job_id]['url'] = video_url
        else:
            PROGRESS_STORE[job_id]['status'] = 'failed'
            PROGRESS_STORE[job_id]['error'] = "Generation returned no URL"

    except Exception as e:
        PROGRESS_STORE[job_id]['status'] = 'failed'
        PROGRESS_STORE[job_id]['error'] = str(e)


@app.route('/generate-video-extended', methods=['POST'])
def generate_video_extended_route():
    """
    Extended video generation using InfiniteTalk chunked workflow.
    Accepts the same fields as /generate-video-single plus an optional
    num_chunks (auto-calculated from audio duration when omitted).
    Uses the same /progress/<job_id> polling endpoint for status.
    """
    data = request.get_json()
    audio_path = data.get('audio_path')
    image_path = data.get('image_path')
    title = data.get('title')
    filename_id = data.get('filename_id')
    prompt = data.get('prompt')
    num_chunks = data.get('num_chunks')
    use_placeholder = data.get('usePlaceholder', False)

    if not all([audio_path, image_path, title, filename_id]):
        return jsonify({'error': 'Missing required fields (audio_path, image_path, title, filename_id)'}), 400

    category = data.get('category', 'answers')
    audio_only = data.get('audioOnly', False)

    if use_placeholder:
        output_dir = os.path.join(app.root_path, 'static', 'videos', title, category)
        os.makedirs(output_dir, exist_ok=True)
        save_filename = f"{filename_id}.mp4"
        save_path = os.path.join(output_dir, save_filename)
        placeholder_path = os.path.join(app.root_path, 'static', 'placeholder.mp4')

        if audio_only and audio_path:
            import subprocess
            abs_audio = os.path.join(app.root_path, audio_path.lstrip('/'))
            if os.path.exists(abs_audio):
                try:
                    subprocess.run([
                        'ffmpeg', '-y',
                        '-stream_loop', '-1',
                        '-i', placeholder_path,
                        '-i', abs_audio,
                        '-c:v', 'copy', '-c:a', 'aac',
                        '-shortest',
                        '-map', '0:v:0', '-map', '1:a:0',
                        save_path
                    ], check=True, capture_output=True)
                except subprocess.CalledProcessError:
                    shutil.copy(placeholder_path, save_path)
            else:
                shutil.copy(placeholder_path, save_path)
        else:
            shutil.copy(placeholder_path, save_path)

        video_url = f"/static/videos/{title}/{category}/{save_filename}"
        job_id = filename_id
        PROGRESS_STORE[job_id] = {"status": "completed", "progress": 100, "eta": 0, "url": video_url}
        return jsonify({'job_id': job_id, 'status': 'started'}), 202
    else:
        job_id = filename_id
        PROGRESS_STORE[job_id] = {"status": "processing", "progress": 0, "eta": 0}

        thread = threading.Thread(
            target=video_worker_extended,
            args=(audio_path, image_path, title, filename_id, prompt, num_chunks, category, job_id)
        )
        thread.start()

        return jsonify({'job_id': job_id, 'status': 'started'}), 202


@app.route('/upload-avatar', methods=['POST'])
def upload_avatar():
    if 'image' not in request.files:
        return jsonify({'error': 'No image part'}), 400
    
    file = request.files['image']
    title = request.form.get('title')
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if not title:
         return jsonify({'error': 'Title is required'}), 400

    try:
        # Create directory for the title if it doesn't exist
        # We can save it in static/temp or static/images/Title
        upload_dir = os.path.join(app.root_path, 'static', 'images', title)
        os.makedirs(upload_dir, exist_ok=True)
        
        filename = f"avatar_{uuid.uuid4()}.png"
        filepath = os.path.join(upload_dir, filename)
        file.save(filepath)
        
        # Return the relative path
        image_path = f"/static/images/{title}/{filename}"
        return jsonify({'message': 'Avatar uploaded successfully', 'image_path': image_path}), 200

    except Exception as e:
        print(f"Error uploading avatar: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    # Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        audio_file.save(temp_audio.name)
        temp_path = temp_audio.name
        
    try:
        text = transcription_service.transcribe(temp_path)
        return jsonify({'text': text}), 200
    except Exception as e:
        print(f"Transcription error: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.route('/delete-title', methods=['DELETE'])
def delete_title_route():
    title = request.args.get('title')
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    try:
        faq_service.delete_topic(title)
        
        # Remove all static directories for this topic (images, videos, audio)
        for folder in ['images', 'videos', 'audio']:
            try:
                dir_path = os.path.join(app.root_path, 'static', folder, title)
                if os.path.exists(dir_path):
                    shutil.rmtree(dir_path)
                    print(f"Deleted {folder} directory for '{title}'")
            except Exception as e:
                print(f"Warning: Could not delete {folder} directory: {e}")

        return jsonify({'message': f'Title "{title}" deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/get-missing-media', methods=['GET'])
def get_missing_media():
    """Return items across all categories that are missing audio or video variants."""
    title = request.args.get('title')
    if not title:
        return jsonify({'error': 'Title is required'}), 400

    try:
        base_dir = app.root_path
        variant_count = 3
        missing = []

        def check_variants(item_id, text, category, label=''):
            for v in range(1, variant_count + 1):
                vid = f"{item_id}_{v}"
                audio_path = os.path.join(base_dir, 'static', 'audio', title, category, f"{vid}.mp3")
                video_path = os.path.join(base_dir, 'static', 'videos', title, category, f"{vid}.mp4")
                needs_audio = not os.path.exists(audio_path)
                needs_video = not os.path.exists(video_path)
                if needs_audio or needs_video:
                    missing.append({
                        'variant_id': vid,
                        'variant': v,
                        'answer': text,
                        'category': category,
                        'label': label,
                        'needs_audio': needs_audio,
                        'needs_video': needs_video
                    })

        # 1. FAQ answers + conversational (both stored in SQL)
        faqs = faq_service.get_faqs(title) or []
        for faq in faqs:
            faq_id = faq.get('id', '')
            cat = 'conversational' if str(faq_id).startswith('conv_') else 'answers'
            check_variants(faq_id, faq.get('answer', ''), cat, faq.get('question', ''))

        # 2. Rude & no_answer (from defaultResponses.json)
        default_responses = faq_service.get_default_responses()
        for category in ['rude', 'no_answer']:
            texts = default_responses.get(category, [])
            for i, text in enumerate(texts):
                base_id = f"{category}_{i + 1}"
                check_variants(base_id, text, category, f"{category} #{i + 1}")

        return jsonify({'missing': missing, 'total': len(missing)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/get-videos', methods=['GET'])
def get_videos_route():
    title = request.args.get('title')
    category = request.args.get('category')
    try:
        videos = faq_service.get_videos(title, category)
        return jsonify({'message': 'Fetched successfully', 'data': videos}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/seed-rude', methods=['POST'])
def seed_rude_collection():
    try:
        count = faq_service.seed_rude_collection()
        return jsonify({'message': f'Seeded rude collection with {count} phrases'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/default-responses', methods=['GET'])
def get_default_responses():
    try:
        responses = faq_service.get_default_responses()
        return jsonify(responses), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/load-conversational', methods=['POST'])
def load_conversational():
    """Load the conversational.csv into ChromaDB for a given title"""
    data = request.get_json()
    title = data.get('title')
    if not title:
        return jsonify({'error': 'Title is required'}), 400
    try:
        result = faq_service.load_conversational(title)
        return jsonify({'message': 'Conversational data loaded', 'data': result}), 200
    except Exception as e:
        print(f"Error loading conversational data: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/get-avatar', methods=['GET'])
def get_avatar_route():
    title = request.args.get('title')
    try:
        avatar_path = faq_service.get_avatar(title)
        # Return path or null
        return jsonify({'message': 'Fetched successfully', 'avatar_path': avatar_path}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/progress/<job_id>', methods=['GET'])
def get_progress(job_id):
    info = PROGRESS_STORE.get(job_id)
    if not info:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(info), 200

# --- Shared asset route for all JS under pagejs ---
@app.route('/backend/pagejs/<path:filename>')
def serve_pagejs(filename):
    return send_from_directory('pagejs', filename)

# --- Create FAQ page ---
@app.route('/')
@app.route('/home')
@app.route('/createQA')
def createQAPage():
    return send_from_directory('../web/createQA', 'createQA.html')

@app.route('/createQA.css')
def createQA_css():
    return send_from_directory('../web/createQA', 'createQA.css')

# --- Edit FAQ page ---
@app.route('/editQA')
def editQAPage():
    return send_from_directory('../web/editQA', 'editQA.html')

@app.route('/editQA.css')
def editQA_css():
    return send_from_directory('../web/editQA', 'editQA.css')

# --- Test FAQ page ---
@app.route('/testQA')
def testQAPage():
    return send_from_directory('../web/TestQA', 'testQA.html')

@app.route('/testQA.css')
def testQA_css():
    return send_from_directory('../web/TestQA', 'testQA.css')

# --- Player page ---
@app.route('/player')
def player():
    return send_from_directory('../web/player', 'player.html')

@app.route('/player/<path:filename>')
def player_assets(filename):
    if filename.endswith('.css'):
        return send_from_directory('../web/player', filename)
    elif filename.endswith('.js'):
        return send_from_directory('pagejs/player', filename)
    return send_from_directory('../web/player', filename)

@app.route('/download-project', methods=['GET'])
def download_project():
    """Create a zip of all project data: videos, audio, ChromaDB, SQLite DB, and JSON configs"""
    import zipfile
    import io

    memory_file = io.BytesIO()

    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        # 1. Videos folder
        videos_dir = os.path.join(app.root_path, 'static', 'videos')
        if os.path.exists(videos_dir):
            for root, dirs, files in os.walk(videos_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, app.root_path)
                    zf.write(file_path, arcname)

        # 2. Audio folder
        audio_dir = os.path.join(app.root_path, 'static', 'audio')
        if os.path.exists(audio_dir):
            for root, dirs, files in os.walk(audio_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, app.root_path)
                    zf.write(file_path, arcname)

        # 3. ChromaDB directory
        chroma_dir = os.path.join(os.getcwd(), 'db')
        if os.path.exists(chroma_dir):
            for root, dirs, files in os.walk(chroma_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.join('db', os.path.relpath(file_path, chroma_dir))
                    zf.write(file_path, arcname)

        # 4. SQLite database
        db_path = os.path.join(os.getcwd(), 'app.db')
        if os.path.exists(db_path):
            zf.write(db_path, 'app.db')

        # 5. defaultResponses.json
        defaults_path = os.path.join(app.root_path, 'defaultResponses.json')
        if os.path.exists(defaults_path):
            zf.write(defaults_path, 'defaultResponses.json')

        # 6. rudeWords.json
        rude_path = os.path.join(app.root_path, 'rudeWords.json')
        if os.path.exists(rude_path):
            zf.write(rude_path, 'rudeWords.json')

    memory_file.seek(0)

    response = make_response(memory_file.read())
    response.headers['Content-Type'] = 'application/zip'
    response.headers['Content-Disposition'] = 'attachment; filename=InteractiveAvatar_Data.zip'
    return response

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)



