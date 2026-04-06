import chromadb
from chromadb.utils import embedding_functions

class VectorDBService:
    def __init__(self, collection_name='faq'):
        self.persist_directory = 'db'


        # Use EphemeralClient for testing purposes
       # self.client = chromadb.EphemeralClient()
        self.client = chromadb.PersistentClient(path=self.persist_directory)
        self.ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name='multi-qa-mpnet-base-dot-v1')
        
        self.collection = self.client.get_or_create_collection(
            collection_name, 
            embedding_function=self.ef
            )

        # Separate collection for rude phrase detection
        self.rude_collection = self.client.get_or_create_collection(
            'rude',
            embedding_function=self.ef
            )

    def add_documents(self, ids, documents, metadatas):
        self.collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
        )

    def query(self, query_text, n_results=10, title="none"):
        return self.collection.query(
            query_texts=[query_text],
            n_results=n_results,
            where={"Title": title}
        )
    
    def delete_by_title(self, title):
        # ChromaDB allows deleting by metadata filter
        self.collection.delete(
            where={"Title": title}
        )

    def delete_by_ids(self, ids):
        """Delete documents by their ids."""
        if ids:
            self.collection.delete(ids=ids)

    # --- Rude collection methods ---

    def add_rude_documents(self, ids, documents, metadatas=None):
        if metadatas is None:
            metadatas = [{"source": "rude"} for _ in ids]
        self.rude_collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
        )

    def query_rude(self, query_text, n_results=1):
        return self.rude_collection.query(
            query_texts=[query_text],
            n_results=n_results,
        )

    def delete_rude_all(self):
        # Delete and recreate the collection
        self.client.delete_collection('rude')
        self.rude_collection = self.client.get_or_create_collection(
            'rude',
            embedding_function=self.ef
        )
    
