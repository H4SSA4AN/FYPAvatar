import sqlite3
import os

class DatabaseService:
    def __init__(self, db_path = 'app.db'):
        self.db_path = db_path
        self.init_db()

    def get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        conn = self.get_conn()
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS titles
            (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            name TEXT UNIQUE NOT NULL, 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
           ''' )

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS questionAnswers
            (
            UUID TEXT PRIMARY KEY, 
            title_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (title_id) REFERENCES titles(id)
            )
            ''' )

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS videos
            (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            title_id INTEGER NOT NULL,
            question_id TEXT NOT NULL,
            video_path TEXT NOT NULL, 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (title_id) REFERENCES titles(id),
            FOREIGN KEY (question_id) REFERENCES questionAnswers(UUID)
            )
           ''' )

        conn.commit()
        conn.close()


    def add_title(self, title):
        conn = self.get_conn()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO titles (name) VALUES (?)
                ''', (title,))
            conn.commit()
        except sqlite3.IntegrityError:
            raise ValueError("Title already exists")
        finally:
            conn.close()

    def add_question_answer(self, question_id, title_id, question, answer):
        conn = self.get_conn()
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT into questionAnswers (UUID, title_id, question, answer) VALUES (?, ?, ?, ?)
            ''', (question_id, title_id, question, answer))
            conn.commit()
        except sqlite3.IntegrityError:
            raise ValueError("Question already exists")
        finally:
            conn.close()

    def get_titles(self):
        conn = self.get_conn()
        cursor = conn.cursor()
        try:
            cursor.execute('''
            SELECT * FROM titles
            ''')
            return cursor.fetchall()
        except sqlite3.OperationalError:
            return []
        finally:
            conn.close()
    
    def get_title_id(self, title):
        conn = self.get_conn()
        cursor = conn.cursor()
        try:
            cursor.execute('''
            SELECT id FROM titles WHERE name = ?
            ''', (title,))
            
            result = cursor.fetchone()
            return result['id'] if result else None
        except sqlite3.OperationalError:
            return None
        finally:
            conn.close()

    def delete_title_by_name(self, title):
        conn = self.get_conn()
        cursor = conn.cursor()
        try:
            # 1. Get the Title ID
            cursor.execute('SELECT id FROM titles WHERE name = ?', (title,))
            result = cursor.fetchone()
            if not result:
                return False
            
            title_id = result['id']

            # 2. Delete from videos (FK to title_id)
            cursor.execute('DELETE FROM videos WHERE title_id = ?', (title_id,))

            # 3. Delete from questionAnswers (FK to title_id)
            cursor.execute('DELETE FROM questionAnswers WHERE title_id = ?', (title_id,))

            # 4. Delete from titles
            cursor.execute('DELETE FROM titles WHERE id = ?', (title_id,))
            
            conn.commit()
            return True
        except Exception as e:
            print(f"Error deleting title {title}: {e}")
            return False
        finally:
            conn.close()

    

    