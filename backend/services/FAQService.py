
import pandas as pd
import uuid
import json
from .vectorDB import VectorDBService
from .database import DatabaseService
import os


class FAQService:

    database_service = DatabaseService()
    


    def __init__(self):
        self.vector_db_service = VectorDBService()

    def get_titles(self):
        titles_rows = self.database_service.get_titles()
        titles = [row['name'] for row in titles_rows]
        return titles

    def add_title(self, title):
        self.database_service.add_title(title)

    def get_title_id(self, title):
        return self.database_service.get_title_id(title)


    def process_csv(self, file_stream, title, category='answers'):

        titles = self.get_titles()

        if title in titles:
            print(f"Title {title} already exists")
            raise ValueError("Title already exists")

        self.add_title(title)


        df = pd.read_csv(file_stream)
        df.columns = df.columns.str.lower()


        ids = [str(uuid.uuid4()) for _ in range(len(df))]
        df['id'] = ids
        
        questions = df['question'].tolist()
        id_strings = df['id'].astype(str).tolist()

        # Needs to be in dictionary as Chroma Docs says metadata needs to be a dictionary
        metadatas = df[['answer']].to_dict(orient='records')

        for metadata in metadatas:
            metadata['Title'] = title
            metadata['category'] = category

        self.vector_db_service.add_documents(id_strings, questions, metadatas)
        print("DONE")

        try:
            title_id = self.get_title_id(title)
            print(title_id)

            for index, row in df.iterrows():
                self.database_service.add_question_answer(row['id'], title_id, row['question'], row['answer'])
        except Exception as e:
            print(e)
            raise e

        return df.to_dict(orient='records')


    def get_faqs(self, title):

        results = self.vector_db_service.collection.get(
            where={"Title": title}, 
            include = ["metadatas", "documents"]
        )
        formatted_results = []
        if results['ids']:
            for i, doc_id in enumerate(results['ids']):

                formatted_results.append({
                    "id": doc_id,
                    "question": results['documents'][i],
                    "answer": results['metadatas'][i].get('answer', ''),
                    "title": results['metadatas'][i].get('Title', '')
                })

        return formatted_results

    def query_faq(self, query_text, title="none"):
        query_texts = [query_text] if isinstance(query_text, str) else query_text

        # Step 1: Check rude collection first
        try:
            rude_results = self.vector_db_service.query_rude(query_text, n_results=1)
            if rude_results['distances'] and rude_results['distances'][0]:
                rude_distance = rude_results['distances'][0][0]
                rude_confidence = max(0, min(100, (1 - rude_distance) * 100))
                if rude_confidence >= 60:
                    return {
                        "answer": None,
                        "question": rude_results['documents'][0][0],
                        "id": None,
                        "score": rude_distance,
                        "title": title,
                        "category": "rude"
                    }
        except Exception as e:
            # Rude collection might be empty -- that's fine, skip
            print(f"Rude check skipped: {e}")

        # Step 2: Query answers + conversational
        where_filter = {"Title": title}
        
        # Search both selected title AND conversational entries
        if title and title != "none":
            where_filter = {
                "$or": [
                    {"Title": title},
                    {"category": "conversational"}
                ]
            }

        results = self.vector_db_service.collection.query(
            query_texts=query_texts, 
            n_results=1, 
            where=where_filter
        )
        
        if results['metadatas'] and results['metadatas'][0]:
            metadata = results['metadatas'][0][0]
            document_id = results['ids'][0][0]
            distance = results['distances'][0][0] if 'distances' in results else None
            matched_title = metadata.get('Title', title)
            matched_category = metadata.get('category', 'answers')

            # Calculate confidence
            confidence = max(0, min(100, (1 - distance) * 100)) if distance is not None else 0

            # Step 3: If confidence too low, return no_answer
            if confidence < 60:
                return {
                    "answer": None,
                    "question": results['documents'][0][0],
                    "id": None,
                    "score": distance,
                    "title": title,
                    "category": "no_answer"
                }

            return {
                "answer": metadata['answer'],
                "question": results['documents'][0][0],
                "id": document_id,
                "score": distance,
                "title": matched_title,
                "category": matched_category
            }
            
        return {"answer": "No suitable answer found", "id": None, "category": "no_answer"}

    def delete_topic(self, title):
        print(f"Deleting topic: {title}")
        # 1. Delete from SQL DB
        self.database_service.delete_title_by_name(title)
        
        # 2. Delete from Vector DB
        self.vector_db_service.delete_by_title(title)
        
        return True


    
    def get_videos(self, title, category=None):
        if not title:
            return []
        
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        if category:
            video_dir = os.path.join(backend_dir, 'static', 'videos', title, category)
        else:
            video_dir = os.path.join(backend_dir, 'static', 'videos', title)
        
        video_files = []
        if os.path.exists(video_dir):
            try:
                files = os.listdir(video_dir)
                video_files = [f for f in files if f.endswith('.mp4')]
            except OSError as e:
                print(f"Error accessing video directory: {e}")
                
        return video_files

    def get_default_responses(self):
        """Read defaultResponses.json and return the rude and no_answer text arrays"""
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_path = os.path.join(backend_dir, 'defaultResponses.json')
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading defaultResponses.json: {e}")
            return {"rude": [], "no_answer": []}

    def load_conversational(self, title):
        """Load conversational.csv into the vector DB with category='conversational' for the given title"""
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        csv_path = os.path.join(backend_dir, 'conversational.csv')

        df = pd.read_csv(csv_path, skipinitialspace=True)
        df.columns = df.columns.str.strip().str.lower()

        ids = [f"conv_{uuid.uuid4()}" for _ in range(len(df))]
        df['id'] = ids

        questions = df['question'].tolist()
        id_strings = df['id'].astype(str).tolist()

        metadatas = df[['answer']].to_dict(orient='records')
        for metadata in metadatas:
            metadata['Title'] = title
            metadata['category'] = 'conversational'

        self.vector_db_service.add_documents(id_strings, questions, metadatas)

        # Also add to SQL DB so they show up in FAQ lists
        try:
            title_id = self.get_title_id(title)
            for _, row in df.iterrows():
                self.database_service.add_question_answer(row['id'], title_id, row['question'], row['answer'])
        except Exception as e:
            print(f"Error adding conversational to SQL: {e}")

        return df.to_dict(orient='records')

    def get_avatar(self, title):
        if not title:
            return None
            
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # Construct path to the FOLDER named after the title
        image_dir = os.path.join(backend_dir, 'static', 'images', title)
        
        # Debug print to verify path
        # print(f"DEBUG: Looking for avatar in: {image_dir}") 
        
        if os.path.exists(image_dir):
            try:
                files = os.listdir(image_dir)
                # Find any image file inside this folder
                images = [f for f in files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]
                
                if images:
                    # Return path to the first image found
                    # images[0] is the actual filename (e.g. avatar_uuid.png)
                    return f"static/images/{title}/{images[0]}"
            except OSError as e:
                print(f"Error accessing image directory: {e}")
                
        return None


