import websocket 
import uuid
import json
import urllib.request
import urllib.parse
import random
import requests
import os
import yaml


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

    