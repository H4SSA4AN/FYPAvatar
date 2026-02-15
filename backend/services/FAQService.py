
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
        print(f"\n[QUERY] Input: '{query_text}' | Title: '{title}'")

        # Step 1: Check rude collection first
        try:
            rude_count = self.vector_db_service.rude_collection.count()
            print(f"[STEP 1 - RUDE] Collection has {rude_count} entries")

            if rude_count > 0:
                rude_results = self.vector_db_service.query_rude(query_text, n_results=1)
                if rude_results['distances'] and rude_results['distances'][0]:
                    rude_distance = rude_results['distances'][0][0]
                    rude_confidence = max(0, min(100, (1 - rude_distance) * 100))
                    rude_matched = rude_results['documents'][0][0]
                    print(f"[STEP 1 - RUDE] Matched: '{rude_matched}' | Distance: {rude_distance:.4f} | Confidence: {rude_confidence:.1f}%")

                    if rude_confidence >= 60:
                        print(f"[STEP 1 - RUDE] >>> RUDE DETECTED, returning rude category")
                        return {
                            "answer": None,
                            "question": rude_matched,
                            "id": None,
                            "score": rude_distance,
                            "title": title,
                            "category": "rude"
                        }
                    else:
                        print(f"[STEP 1 - RUDE] Confidence below 60%, moving to step 2")
            else:
                print(f"[STEP 1 - RUDE] Collection is empty, skipping")
        except Exception as e:
            print(f"[STEP 1 - RUDE] Exception: {e}")

        # Step 2: Check conversational
        try:
            conv_results = self.vector_db_service.collection.query(
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
                    print(f"[STEP 2 - CONV] >>> CONVERSATIONAL HIT, returning")
                    return {
                        "answer": conv_metadata['answer'],
                        "question": conv_results['documents'][0][0],
                        "id": conv_results['ids'][0][0],
                        "score": conv_distance,
                        "title": conv_metadata.get('Title', title),
                        "category": "conversational"
                    }
                else:
                    print(f"[STEP 2 - CONV] Confidence below 60%, moving to step 3")
        except Exception as e:
            print(f"[STEP 2 - CONV] Exception: {e}")

        # Step 3: Check answers for this topic
        try:
            answer_results = self.vector_db_service.collection.query(
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
                    print(f"[STEP 3 - ANSWER] >>> ANSWER HIT, returning")
                    return {
                        "answer": ans_metadata['answer'],
                        "question": answer_results['documents'][0][0],
                        "id": answer_results['ids'][0][0],
                        "score": ans_distance,
                        "title": ans_metadata.get('Title', title),
                        "category": ans_metadata.get('category', 'answers')
                    }
                else:
                    print(f"[STEP 3 - ANSWER] Confidence below 60%, falling through to no_answer")
                    return {
                        "answer": None,
                        "question": answer_results['documents'][0][0],
                        "id": None,
                        "score": ans_distance,
                        "title": title,
                        "category": "no_answer"
                    }
        except Exception as e:
            print(f"[STEP 3 - ANSWER] Exception: {e}")

        # Step 4: No answer fallback
        print(f"[STEP 4] No matches at all, returning no_answer")
        return {"answer": None, "question": None, "id": None, "score": None, "title": title, "category": "no_answer"}

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

    def seed_rude_collection(self):
        """Read rudeWords.json and populate the rude ChromaDB collection"""
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        json_path = os.path.join(backend_dir, 'rudeWords.json')

        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            phrases = data.get('rude_phrases', [])
            if not phrases:
                print("No rude phrases found in rudeWords.json")
                return 0

            # Clear existing entries first to avoid duplicates on re-seed
            self.vector_db_service.delete_rude_all()

            ids = [f"rude_{i}" for i in range(len(phrases))]
            metadatas = [{"source": "rudeWords.json"} for _ in phrases]

            self.vector_db_service.add_rude_documents(ids, phrases, metadatas)
            print(f"Seeded rude collection with {len(phrases)} phrases")
            return len(phrases)

        except Exception as e:
            print(f"Error seeding rude collection: {e}")
            raise e

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


