import websocket 
import uuid
import json
import urllib.request
import urllib.parse
import random
import requests
import os
import yaml
import time


class ComfyService:
    def __init__(self):

        config_path = os.path.join(os.path.dirname(__file__), '../../config.yaml')
        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
            self.server_addr = config.get('comfy_url')
        except Exception as e:
            print(f"Error loading config: {e}")
            self.server_addr = '127.0.0.1:8000'

        self.client_id = str(uuid.uuid4())

    def queue_prompt(self, prompt_workflow):
        p = {"prompt": prompt_workflow, "client_id": self.client_id}
        data = json.dumps(p).encode('utf-8')
        # POST to http://.../prompt
        req = urllib.request.Request(f"http://{self.server_addr}/prompt", data=data)
        return json.loads(urllib.request.urlopen(req).read())

    def get_image(self, filename, subfolder, folder_type):
        data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        url_values = urllib.parse.urlencode(data)
        with urllib.request.urlopen(f"http://{self.server_addr}/view?{url_values}") as response:
            return response.read()

    def get_history(self, prompt_id):
        with urllib.request.urlopen(f"http://{self.server_addr}/history/{prompt_id}") as response:
            return json.loads(response.read())

    def generate_image(self, prompt_text):
        workflow_path = "../backend/ComfyAPIs/zTurboImageGen.json"
        
        # 1. Load the Workflow JSON
        with open(workflow_path, 'r', encoding="utf-8") as f:
            workflow = json.load(f)

        # 2. Modify inputs
        # Node "45" is the CLIPTextEncode (Prompt)
        workflow["45"]["inputs"]["text"] = prompt_text + "\n\nA photorealistic portrait of a human avatar, upper body visible from the waist up, facing the camera. The image includes the full torso, both arms clearly visible, natural relaxed posture, clean clothing, neutral background, well-lit, sharp detailed face, realistic skin texture, symmetrical anatomy, professional appearance, centered composition, high-quality character design."
        
        # Node "44" is the KSampler - randomize seed to get new images
        workflow["44"]["inputs"]["seed"] = random.randint(1, 10**14)

        # 3. Connect to WebSocket
        ws = websocket.WebSocket()
        ws.connect(f"ws://{self.server_addr}/ws?clientId={self.client_id}")
        
        # 4. Queue the prompt
        print("Queueing prompt...")
        prompt_response = self.queue_prompt(workflow)
        prompt_id = prompt_response['prompt_id']
        
        # 5. Listen for completion
        output_images = []
        while True:
            out = ws.recv()
            if isinstance(out, str):
                message = json.loads(out)
                if message['type'] == 'executing':
                    data = message['data']
                    if data['node'] is None and data['prompt_id'] == prompt_id:
                        print("Execution complete!")
                        break # Execution is done
            else:
                continue

        # 6. Retrieve images from history
        history = self.get_history(prompt_id)[prompt_id]
        for node_id in history['outputs']:
            node_output = history['outputs'][node_id]
            if 'images' in node_output:
                for image in node_output['images']:
                    image_data = self.get_image(image['filename'], image['subfolder'], image['type'])
                    output_images.append(image_data)

        # Return the first image found (binary data)
        return output_images[0] if output_images else None

    

    def upload_image(self, image_data, filename="input_image.png"):
        """Uploads an image to ComfyUI to be used in workflows"""
        p = {'image': (filename, image_data)}
        # POST to http://.../upload/image
        # Note: ComfyUI expects multipart/form-data
        response = requests.post(f"http://{self.server_addr}/upload/image", files=p)
        return response.json()

    def generate_video(self, source_image_data):
        workflow_path = "../backend/ComfyAPIs/hunyanVideoGen.json" # Adjust path if needed
        
        # 1. Upload the source image first
        # We give it a specific name so we can reference it in the JSON
        filename = f"video_source_{uuid.uuid4()}.png"
        self.upload_image(source_image_data, filename)

        # 2. Load the Workflow JSON
        with open(workflow_path, 'r', encoding="utf-8") as f:
            workflow = json.load(f)

        # 3. Modify inputs
        # Node "80" is LoadImage - set the uploaded filename
        workflow["80"]["inputs"]["image"] = filename
        
        # Node "127" is RandomNoise - randomize seed
        workflow["127"]["inputs"]["noise_seed"] = random.randint(1, 10**14)

        # 4. Connect to WebSocket
        ws = websocket.WebSocket()
        ws.connect(f"ws://{self.server_addr}/ws?clientId={self.client_id}")
        
        # 5. Queue the prompt
        print("Queueing video generation...")
        prompt_response = self.queue_prompt(workflow)
        prompt_id = prompt_response['prompt_id']
        
        # 6. Listen for completion
        output_videos = []
        while True:
            out = ws.recv()
            if isinstance(out, str):
                message = json.loads(out)
                if message['type'] == 'executing':
                    data = message['data']
                    if data['node'] is None and data['prompt_id'] == prompt_id:
                        print("Video execution complete!")
                        break 
            else:
                continue

        # 7. Retrieve video from history
        history = self.get_history(prompt_id)[prompt_id]
        
        # DEBUG (You can keep or remove)
        print("DEBUG: History Outputs Keys:", history['outputs'].keys())

        for node_id in history['outputs']:
            node_output = history['outputs'][node_id]
            print(f"DEBUG: Node {node_id} output keys: {node_output.keys()}")
            
            # 1. Standard Video Nodes
            if 'videos' in node_output:
                for video in node_output['videos']:
                    video_data = self.get_image(video['filename'], video['subfolder'], video['type'])
                    output_videos.append(video_data)
            
            # 2. VHS / GIF Nodes
            elif 'gifs' in node_output:
                for video in node_output['gifs']:
                    video_data = self.get_image(video['filename'], video['subfolder'], video['type'])
                    output_videos.append(video_data)
                    
            # 3. Fallback to 'images' (Common for custom video savers or animated outputs)
            elif 'images' in node_output:
                 for image in node_output['images']:
                    # If 'animated' key exists and is true, it's definitely a video/gif
                    # OR if it has a video extension
                    is_animated = False
                    if 'animated' in node_output:
                        val = node_output['animated']
                        if isinstance(val, list) and len(val) > 0: is_animated = val[0]
                        else: is_animated = bool(val)

                    if is_animated or image['filename'].lower().endswith(('.mp4', '.mov', '.webm', '.gif', '.webp')):
                        video_data = self.get_image(image['filename'], image['subfolder'], image['type'])
                        print(f"DEBUG: Retrieved video size: {len(video_data)} bytes")
                        output_videos.append(video_data)

        return output_videos[0] if output_videos else None

    def generate_audio_test(self, speechSettings):
        workflow_path = "../backend/ComfyAPIs/IndexTTS-2.json"

        with open(workflow_path, 'r', encoding="utf-8") as f:
            workflow = json.load(f)
        
        workflow["125"]["inputs"]["Happy"] = speechSettings[0]
        workflow["125"]["inputs"]["Angry"] = speechSettings[1]
        workflow["125"]["inputs"]["Sad"] = speechSettings[2]
        workflow["125"]["inputs"]["Surprised"] = speechSettings[3]
        workflow["125"]["inputs"]["Afraid"] = speechSettings[4]
        workflow["125"]["inputs"]["Disgusted"] = speechSettings[5]
        workflow["125"]["inputs"]["Calm"] = speechSettings[6]
        workflow["125"]["inputs"]["Melancholic"] = speechSettings[7]

        workflow["47"]["inputs"]["seed"] = random.randint(1, 10**9)
        workflow["82"]["inputs"]["value"] += " I am a test audio, to see if the emotions work. [pause:0.5s]"

        ws = websocket.WebSocket()
        ws.connect(f"ws://{self.server_addr}/ws?clientId={self.client_id}")

        print("Queueing audio test...")
        prompt_response = self.queue_prompt(workflow)
        prompt_id = prompt_response['prompt_id']

        while True:
            out = ws.recv()
            if isinstance(out, str):
                message = json.loads(out)
                if message['type'] == 'executing':
                    data = message['data']
                    if data['node'] is None and data['prompt_id'] == prompt_id:
                        break 
            else:
                continue


        # Retrieve output from history
        history = self.get_history(prompt_id)[prompt_id]
        node_outputs = history['outputs']

        # Save to static/test/
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        output_dir = os.path.join(base_dir, 'static', 'test')
        os.makedirs(output_dir, exist_ok=True)

        if "134" in node_outputs:
            outputs = node_outputs["134"]
            if "audio" in outputs and len(outputs["audio"]) > 0:
                audio_info = outputs["audio"][0]
                audio_filename = audio_info.get("filename")
                subfolder = audio_info.get("subfolder", "")
                folder_type = audio_info.get("type", "output")

                audio_data = self.get_image(audio_filename, subfolder, folder_type)

                save_filename = f"test_{uuid.uuid4()}.mp3"
                save_path = os.path.join(output_dir, save_filename)
                with open(save_path, 'wb') as audio_file:
                    audio_file.write(audio_data)

                return f"/static/test/{save_filename}"

        return None


    def generate_audio_single(self, text, title, filename_id, speechSettings):
        workflow_path = "../backend/ComfyAPIs/IndexTTS-2.json"
        
        # Create directory for the title
        # Use absolute path for robustness
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        output_dir = os.path.join(base_dir, 'static', 'audio', title)
        os.makedirs(output_dir, exist_ok=True)

        # Construct the expected filename
        save_filename = f"{filename_id}.mp3"
        save_path = os.path.join(output_dir, save_filename)

        # --- NEW CHECK: Return existing file if found ---
        if os.path.exists(save_path):
            print(f"Audio already exists for {filename_id}, skipping generation.")
            # Return the web-accessible URL
            return f"/static/audio/{title}/{save_filename}"
        # ------------------------------------------------

        with open(workflow_path, 'r', encoding="utf-8") as f:
            workflow = json.load(f)

        workflow["125"]["inputs"]["Happy"] = speechSettings[0]
        workflow["125"]["inputs"]["Angry"] = speechSettings[1]
        workflow["125"]["inputs"]["Sad"] = speechSettings[2]
        workflow["125"]["inputs"]["Surprised"] = speechSettings[3]
        workflow["125"]["inputs"]["Afraid"] = speechSettings[4]
        workflow["125"]["inputs"]["Disgusted"] = speechSettings[5]
        workflow["125"]["inputs"]["Calm"] = speechSettings[6]
        workflow["125"]["inputs"]["Melancholic"] = speechSettings[7]


        # Node 82 is PrimitiveStringMultiline (Text Input)
        workflow["82"]["inputs"]["value"] += " " + text + " [pause:0.5s]"

        # Randomize seed (Node 47)
        if "47" in workflow:
                workflow["47"]["inputs"]["seed"] = random.randint(1, 10**9)

        # Connect to WebSocket
        ws = websocket.WebSocket()
        ws.connect(f"ws://{self.server_addr}/ws?clientId={self.client_id}")

        print(f"Queueing audio for text: {text[:30]}...")
        prompt_response = self.queue_prompt(workflow)
        prompt_id = prompt_response['prompt_id']

        # Listen for completion
        while True:
            out = ws.recv()
            if isinstance(out, str):
                message = json.loads(out)
                if message['type'] == 'executing':
                    data = message['data']
                    if data['node'] is None and data['prompt_id'] == prompt_id:
                        break 
            else:
                continue
        
        # Retrieve output
        history = self.get_history(prompt_id)[prompt_id]
        node_outputs = history['outputs']
        
        # Find audio node (Node 134 is SaveAudioMP3)
        if "134" in node_outputs:
            outputs = node_outputs["134"]
            if "audio" in outputs and len(outputs["audio"]) > 0:
                audio_info = outputs["audio"][0]
                audio_filename = audio_info.get("filename")
                subfolder = audio_info.get("subfolder", "")
                folder_type = audio_info.get("type", "output")
                
                audio_data = self.get_image(audio_filename, subfolder, folder_type)
                
                # Save locally with the UUID as filename
                save_filename = f"{filename_id}.mp3"
                save_path = os.path.join(output_dir, save_filename)
                with open(save_path, 'wb') as audio_file:
                    audio_file.write(audio_data)
                
                return f"/static/audio/{title}/{save_filename}"
        
        return None

        

    def upload_file(self, file_path, filename=None):
        """Uploads a file to ComfyUI input directory"""
        if filename is None:
            filename = os.path.basename(file_path)
            
        with open(file_path, 'rb') as f:
            files = {'image': (filename, f)}
            response = requests.post(f"http://{self.server_addr}/upload/image", files=files)
        return response.json()

    # Update the method signature to accept a progress_callback
    def generate_video_talking_head(self, audio_path, image_path, title, filename_id, prompt_text, progress_callback=None):
        workflow_path = "../backend/ComfyAPIs/InfiniteTalkWorkflow.json"
        
        # Output directory
        output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'videos', title)
        os.makedirs(output_dir, exist_ok=True)

        # 1. Upload Audio to ComfyUI
        # audio_path is relative to the backend root if it starts with static/
        # e.g. "static/audio/Title/uuid.mp3"
        local_audio_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), audio_path.lstrip('/'))
        if not os.path.exists(local_audio_path):
             print(f"Audio file not found: {local_audio_path}")
             return None
             
        audio_filename = f"audio_{filename_id}.mp3"
        self.upload_file(local_audio_path, audio_filename)

        # 2. Upload Image to ComfyUI
        # If image_path is a local path on server
        if image_path.startswith("static") or image_path.startswith("/static"):
             local_image_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), image_path.lstrip('/'))
             if os.path.exists(local_image_path):
                 image_filename = f"image_{filename_id}.png"
                 self.upload_file(local_image_path, image_filename)
             else:
                 print(f"Image file not found: {local_image_path}")
                 # Fallback: maybe it's just a filename already there
                 image_filename = os.path.basename(image_path)
        else:
             # Assume it's a filename already in ComfyUI or uploaded differently
             image_filename = os.path.basename(image_path)

        # 3. Load Workflow
        with open(workflow_path, 'r', encoding="utf-8") as f:
            workflow = json.load(f)

        # 4. Configure Nodes
        # Node 12: LoadImage
        workflow["12"]["inputs"]["image"] = image_filename
        
        # Node 19: LoadAudio
        workflow["19"]["inputs"]["audio"] = audio_filename


                # Node 17: WanVideoTextEncodeCached (Positive Prompt)
        if prompt_text and "17" in workflow:
            # Keep the default negative prompt or allow passing it too if needed
            workflow["17"]["inputs"]["positive_prompt"] = prompt_text
        
        # Node 16: WanVideoSampler - Randomize Seed
        if "16" in workflow:
             workflow["16"]["inputs"]["seed"] = random.randint(1, 10**14)

        # 5. Execute
        ws = websocket.WebSocket()
        ws.connect(f"ws://{self.server_addr}/ws?clientId={self.client_id}")
        
        print(f"Queueing video for {filename_id}...")
        prompt_response = self.queue_prompt(workflow)
        prompt_id = prompt_response['prompt_id']
        
        start_time = time.time()

        # Loop
        while True:
            out = ws.recv()
            if isinstance(out, str):
                message = json.loads(out)
                
                # --- NEW: Handle Progress ---
                if message['type'] == 'progress':
                    data = message['data']
                    current_step = data['value']
                    max_steps = data['max']
                    
                    if progress_callback:
                        # Calculate simple ETA
                        elapsed = time.time() - start_time
                        if current_step > 0:
                            avg_time_per_step = elapsed / current_step
                            remaining_steps = max_steps - current_step
                            eta_seconds = remaining_steps * avg_time_per_step
                        else:
                            eta_seconds = 0
                            
                        progress_callback(current_step, max_steps, eta_seconds)
                # -----------------------------

                if message['type'] == 'executing':
                    data = message['data']
                    if data['node'] is None and data['prompt_id'] == prompt_id:
                        break 
            else:
                continue

        # 6. Retrieve
        history = self.get_history(prompt_id)[prompt_id]
        node_outputs = history['outputs']
        
        # Node 23 is VHS_VideoCombine
        if "23" in node_outputs:
             outputs = node_outputs["23"]
             # Check for 'gifs' or 'videos' depending on VHS version
             vid_list = outputs.get("gifs", outputs.get("videos", []))
             
             if len(vid_list) > 0:
                 vid_info = vid_list[0]
                 filename = vid_info['filename']
                 subfolder = vid_info['subfolder']
                 folder_type = vid_info['type']
                 
                 video_data = self.get_image(filename, subfolder, folder_type)
                 
                 save_filename = f"{filename_id}.mp4"
                 save_path = os.path.join(output_dir, save_filename)
                 
                 with open(save_path, 'wb') as f:
                     f.write(video_data)
                     
                 return f"/static/videos/{title}/{save_filename}"
        
        return None

    