async function uploadCSV() {
    const file = document.getElementById('csvFile').files[0];
    const status = document.getElementById('status');

    if (!file) {
        status.textContent = 'No file selected';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    status.textContent = 'Uploading file...';

    try {
        const response = await fetch('http://127.0.0.1:5000/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (response.ok) {
            status.textContent = 'File uploaded successfully';
            console.log(result);
        } else {
            status.textContent = `Error: ${result.error}`;
        }
    } catch (error) {
        status.textContent = 'Error uploading file';
        console.error(error);
    }
}

async function queryFAQ() {

    const question = document.getElementById('questionInput').value;
    const answer = document.getElementById('answer');

    if (!question) return;

    answer.textContent = 'Querying...';

    try {
        const response = await fetch('http://127.0.0.1:5000/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: question })
        });
        const result = await response.json();
        if (response.ok) {
            answer.textContent = result.answer;
        } else {
            answer.textContent = `Error: ${result.error}`;
        }
    } catch (error) {
        answer.textContent = 'Error querying FAQ';
    }


}