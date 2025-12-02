import websocket 
import uuid
import json
import urllib.request
import urllib.parse
import random

class ComfyService:
    def __init__(self, server_addr='127.0.0.1:8000'):
        self.server_addr = server_addr
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

    