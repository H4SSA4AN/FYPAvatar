import chromadb
from chromadb.utils import embedding_functions

class VectorDBService:
    def __init__(self, collection_name='faq'):
        self.client = chromadb.EphemeralClient()
        self.ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name='multi-qa-mpnet-base-dot-v1')
        
        self.collection = self.client.get_or_create_collection(
            collection_name, 
            embedding_function=self.ef
            )

    def add_documents(self, ids, documents, metadatas):
        self.collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
        )

    def query(self, query_text, n_results=10):
        return self.collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
    
