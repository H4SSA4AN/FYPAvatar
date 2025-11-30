from flask import Flask, request, jsonify
from flask_cors import CORS
from services.FAQService import FAQService

app = Flask(__name__)
CORS(app)

faq_service = FAQService()

@app.route('/upload', methods=['POST'])
def upload_csv():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    title = request.form['title']

    try:
        data = faq_service.process_csv(file.stream, title)
        return jsonify({'message': 'Processed successfully', 'data': data}), 200
    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 500



@app.route('/faqs', methods=['GET'])
def get_faqs():
    title = request.args.get('title')

    try:
        data = faq_service.get_faqs(title)
        return jsonify({'message': 'Fetched successfully', 'data': data}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/query', methods=['POST'])
def query_faq():
    data = request.get_json()
    if not data or 'query' not in data:
        return jsonify({'error': 'Invalid request'}), 400

    try:
        answer = faq_service.query_faq(data['query'], data['title'])
        return jsonify({'answer': answer}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/titles', methods=['GET'])
def get_titles():
    try:
        topics = faq_service.get_titles()
        return jsonify({'message': 'Fetched successfully', 'data': topics}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)



