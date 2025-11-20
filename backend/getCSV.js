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
            displayFAQ(result.data);
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

function displayFAQ(data) {
    const container = document.getElementById('faq-container');

    if (!data || data.length === 0) {
        container.innerHTML = '<p>No FAQ uploaded</p>';
        return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    
    const headers = Object.keys(data[0]);
    const headerRow = document.createElement('tr');
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    data.forEach(row => {
        const tr = document.createElement('tr');
        headers.forEach(header => {
            const td = document.createElement('td');
            td.textContent = row[header];
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);

    container.innerHTML = '';
    container.appendChild(table);
}

function searchFAQ() {

    const input = document.getElementById('searchInput').value;
    const container = document.getElementById('faq-container');
    const table = document.getElementsByTagName('table')[0];

    if (!table) return;

    const rows = table.getElementsByTagName('tr');
    const headers = table.getElementsByTagName('th');


    //Find column that is question column, incase CSV gives different column names

    let questionColumn = -1;
    for (let i =0; i < headers.length; i++) {
        if (headers[i].textContent.trim().toLowerCase() === 'question') {
            questionColumn = i;
            break;
        }
    }

    if (questionColumn === -1) return;

    for (let i = 0; i < rows.length; i++) {
        const cell = rows[i].getElementsByTagName('td')[questionColumn];
        if (cell) {
            const cellText = cell.textContent.toLowerCase();
            if (cellText.includes(input.toLowerCase())) {
                rows[i].style.display = '';
            } else {
                rows[i].style.display = 'none';
            }
        }
    }
}