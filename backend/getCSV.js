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