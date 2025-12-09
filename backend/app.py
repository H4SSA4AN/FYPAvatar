from flask import Flask, request, jsonify, make_response, jsonify, send_from_directory
from flask_cors import CORS
from services.FAQService import FAQService
from services.comfyService import ComfyService
import os
import uuid

app = Flask(__name__)
CORS(app)

VIDEO_FOLDER = os.path.join(app.root_path, 'static', 'videos')
os.makedirs(VIDEO_FOLDER, exist_ok=True)

faq_service = FAQService()
comfy_service = ComfyService()

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


@app.route('/query', methods=['POST'])
def query_faq():
    data = request.get_json()
    if not data or 'query' not in data:
        return jsonify({'error': 'Invalid request'}), 400

    try:
        answer = faq_service.query_faq(data['query'], data['title'])
        return jsonify({'answer': answer}), 200
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


@app.route('/generate-audio-single', methods=['POST'])
def generate_audio_single_route():
    data = request.get_json()
    text = data.get('text')
    title = data.get('title')
    filename_id = data.get('filename_id') # Get the UUID
    
    if not text or not title or not filename_id:
        return jsonify({'error': 'Missing text, title, or filename_id'}), 400

    try:
        audio_url = comfy_service.generate_audio_single(text, title, filename_id)
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
    
    if not all([audio_path, image_path, title, filename_id]):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        video_url = comfy_service.generate_video_talking_head(audio_path, image_path, title, filename_id)
        if video_url:
             return jsonify({'video_url': video_url}), 200
        else:
             return jsonify({'error': 'Failed to generate video'}), 500
    except Exception as e:
        print(f"Error generating video: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)



