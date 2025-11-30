
import pandas as pd
from .vectorDB import VectorDBService

class FAQService:

    topicList = []

    def __init__(self):
        self.vector_db_service = VectorDBService()

    def process_csv(self, file_stream, topic):


        if topic in self.topicList:
            raise ValueError("Topic already exists")


        df = pd.read_csv(file_stream)
        df.columns = df.columns.str.lower()

        count = self.vector_db_service.collection.count()

        ids = range(count, count + len(df))

        df['id'] = ids
        
        questions = df['question'].tolist()
        id_strings = df['id'].astype(str).tolist()

        # Needs to be in dictionary as Chroma Docs says metadata needs to be a dictionary
        metadatas = df[['answer']].to_dict(orient='records')

        for metadata in metadatas:
            metadata['Topic'] = topic

        self.vector_db_service.add_documents(id_strings, questions, metadatas)
        print("DONE")
        return df.to_dict(orient='records')


    def get_faqs(self, topic):

        results = self.vector_db_service.collection.get(
            where={"Topic": topic}, 
            include = ["metadatas", "documents"]
        )
        formatted_results = []
        if results['ids']:
            for i, doc_id in enumerate(results['ids']):

                formatted_results.append({
                    "id": doc_id,
                    "question": results['documents'][i],
                    "answer": results['metadatas'][i].get('answer', ''),
                    "topic": results['metadatas'][i].get('Topic', '')
                })

        return formatted_results

    def query_faq(self, query_text, topic="none"):

        results = self.vector_db_service.collection.query(query_texts = query_text, where={"Topic": topic})
        
        if results['metadatas'] and results['metadatas'][0]:
            return results['metadatas'][0][0]['answer']
        return "No suitable answer found"


    def get_topics(self):
        results = self.vector_db_service.collection.get(
            include = ["metadatas"]
        )

        if results['metadatas']:
            for metadata in results['metadatas']:
                if metadata.get('Topic'):
                    self.topicList.append(metadata.get('Topic'))
        return list(set(self.topicList))


