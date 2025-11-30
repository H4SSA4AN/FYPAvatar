window.onload = async function() {
    const topics = await fetchTopics();
}

async function fetchTopics() {
    const select = document.getElementById('titleSelect');
    
    try {
        const response = await fetch('http://127.0.0.1:5000/topics');
        const result = await response.json();
        if (response.ok) {
            titles = result.data;
            titles.forEach(title => {
                const option = document.createElement('option');
                option.value = title;
                option.textContent = title;
                select.appendChild(option);
            });
        } else {
            console.error(result.error);
        }
    } catch (error) {
        console.error(error);
    }
}

async function uploadCSV() {
    const file = document.getElementById('csvFile').files[0];
    const title = document.getElementById('titleName').value;
    const status = document.getElementById('status');

    if (!file || !title) {
        status.textContent = 'No file or title selected';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

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


async function fetchFAQ() {
    const title = document.getElementById('titleSelect').value;
    const container = document.getElementById('faq-container');

    container.innerHTML = 'Fetching FAQ...';

    try {

        const url = title 
        ? `http://127.0.0.1:5000/faqs?title=${title}`
        : `http://127.0.0.1:5000/faqs`;
    

    const response = await fetch(url);
    const result = await response.json();

    if (response.ok) {
        displayFAQ(result.data);
    } else {
        container.innerHTML = `Error: ${result.error}`;
    }
    } catch (error) {
        container.innerHTML = `Error fetching FAQ`;
        console.error(error);
    }    


}

async function queryFAQ() {

    const question = document.getElementById('questionInput').value;
    const title = document.getElementById('titleSelect').value;
    const answer = document.getElementById('answer');

    if (!question) return;

    answer.textContent = 'Querying...';

    try {
        const response = await fetch('http://127.0.0.1:5000/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                query: question, 
                title: title 
            })
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
    container.innerHTML = '';

    if (!data || data.length === 0) {
        container.innerHTML = '<p>No FAQ uploaded</p>';
        return;
    }

    const table = document.createElement('table');

    const thead = document.createElement('thead');
    thead.innerHTML = `
    <tr>
        <th>ID</th>
        <th>Question</th>
        <th>Answer</th>
        <th>Title</th>
    </tr>
    `;
    table.appendChild(thead);

    for (let i = 0; i < data.length; i++) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
        <td>${data[i].id}</td>
        <td>${data[i].question}</td>
        <td>${data[i].answer}</td>
        <td>${data[i].title}</td>
        `;
        table.appendChild(tr);
    }
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