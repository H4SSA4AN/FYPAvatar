
import pandas as pd
from .vectorDB import VectorDBService

class FAQService:
    def __init__(self):
        self.vector_db_service = VectorDBService()

    def process_csv(self, file_stream):
        df = pd.read_csv(file_stream)
        df.insert(0, 'id', range(0, len(df)))
        
        questions = df['Question'].tolist()
        ids = df['id'].astype(str).tolist()

        # Needs to be in dictionary as Chroma Docs says metadata needs to be a dictionary
        metadatas = df[['Answer']].to_dict(orient='records')

        self.vector_db_service.add_documents(ids, questions, metadatas)
        print("DONE")
        return df.to_dict(orient='records')
    
    def query_faq(self, query_text):

        results = self.vector_db_service.query(query_text)
        
        if results['metadatas'] and results['metadatas'][0]:
            return results['metadatas'][0][0]['Answer']
        return "No suitable answer found"
