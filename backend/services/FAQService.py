
import pandas as pd
import uuid
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


    def process_csv(self, file_stream, title):

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
        
        where_filter = {"Title": title}
        
        # Search both selected title AND 'Basic'
        if title and title != "Basic" and title != "none":
            where_filter = {
                "$or": [
                    {"Title": title},
                    {"Title": "Basic"}
                ]
            }

        # Ensure query_text is a list
        query_texts = [query_text] if isinstance(query_text, str) else query_text

        results = self.vector_db_service.collection.query(
            query_texts=query_texts, 
            n_results=1, 
            where=where_filter
        )
        
        if results['metadatas'] and results['metadatas'][0]:
            # Access the first result
            metadata = results['metadatas'][0][0]
            document_id = results['ids'][0][0]
            
            # Extract Distance (Confidence Score)
            distance = results['distances'][0][0] if 'distances' in results else None
            
            # Get the actual title of the matched document (e.g. "Basic" or the selected title)
            matched_title = metadata.get('Title', title)

            return {
                "answer": metadata['answer'],
                "question": results['documents'][0][0],
                "id": document_id,
                "score": distance,
                "title": matched_title # Return the matched title
            }
            
        return {"answer": "No suitable answer found", "id": None}

    def delete_topic(self, title):
        print(f"Deleting topic: {title}")
        # 1. Delete from SQL DB
        self.database_service.delete_title_by_name(title)
        
        # 2. Delete from Vector DB
        self.vector_db_service.delete_by_title(title)
        
        return True


    
    def get_videos(self, title):
        if not title:
            return []
        
        # Robust path construction (points to backend/static/videos/Title)
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        video_dir = os.path.join(backend_dir, 'static', 'videos', title)
        
        video_files = []
        if os.path.exists(video_dir):
            try:
                # List all mp4 files
                files = os.listdir(video_dir)
                # Return just the filenames (which are UUIDs.mp4) or full relative paths
                # Returning just filenames (e.g. "uuid.mp4") is usually enough for matching
                video_files = [f for f in files if f.endswith('.mp4')]
            except OSError as e:
                print(f"Error accessing video directory: {e}")
                
        return video_files

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


