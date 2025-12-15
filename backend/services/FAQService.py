
import pandas as pd
import uuid
from .vectorDB import VectorDBService
from .database import DatabaseService


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

        results = self.vector_db_service.collection.query(query_texts = query_text, where={"Title": title})
        
        if results['metadatas'] and results['metadatas'][0]:
            # Access the first result
            metadata = results['metadatas'][0][0]
            document_id = results['ids'][0][0] # IDs are in a parallel list
            
            return {
                "answer": metadata['answer'],
                "question": results['documents'][0][0], # The matched question
                "id": document_id
            }
            
        return {"answer": "No suitable answer found", "id": None}



