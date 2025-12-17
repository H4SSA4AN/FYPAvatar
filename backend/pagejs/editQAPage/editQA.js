const API_BASE_URL = 'http://127.0.0.1:5000';
let allTitles = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchTitles();
    setupSearch();
    setupDelete();
});

function setupSearch() {
    const searchInput = document.getElementById('topicSearch');
    const dropdown = document.getElementById('customDropdown');

    if (searchInput && dropdown) {
        // Filter as user types
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const filtered = allTitles.filter(t => t.toLowerCase().includes(val));
            renderDropdown(filtered);
            dropdown.style.display = (val.length > 0 && filtered.length > 0) ? 'block' : 'none';
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        // Show all on focus
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim() === "") {
                renderDropdown(allTitles);
                dropdown.style.display = 'block';
            }
        });
    }
}

function renderDropdown(titles) {
    const dropdown = document.getElementById('customDropdown');
    const searchInput = document.getElementById('topicSearch');
    dropdown.innerHTML = '';
    
    titles.forEach(title => {
        const li = document.createElement('li');
        li.className = 'dropdown-item';
        li.textContent = title;
        li.style.padding = '10px';
        li.style.cursor = 'pointer';
        li.style.borderBottom = '1px solid #eee';
        
        li.addEventListener('click', () => {
            searchInput.value = title;
            dropdown.style.display = 'none';
            selectTopic(title);
        });
        
        dropdown.appendChild(li);
    });
}

function selectTopic(title) {
    document.getElementById('selectedTitle').textContent = `Selected Topic: ${title}`;
    document.getElementById('deleteBtn').style.display = 'inline-block';
    loadFAQs(title);
}

function setupDelete() {
    const deleteBtn = document.getElementById('deleteBtn');
    
    deleteBtn.addEventListener('click', async () => {
        const title = document.getElementById('topicSearch').value;
        
        if (!title || !confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/delete-title?title=${encodeURIComponent(title)}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                alert('Topic deleted successfully.');
                // Reset UI
                document.getElementById('topicSearch').value = '';
                document.getElementById('selectedTitle').textContent = '';
                document.getElementById('deleteBtn').style.display = 'none';
                document.querySelector('#faqTable tbody').innerHTML = '<tr><td colspan="2">Select a topic...</td></tr>';
                // Refresh titles
                fetchTitles();
            } else {
                alert('Failed to delete topic.');
            }
        } catch (error) {
            console.error('Error deleting topic:', error);
            alert('Error connecting to server.');
        }
    });
}

// ... Copy fetchTitles and loadFAQs/populateFAQTable from TestQA/testQA.js ...
// You can copy fetchTitles, loadFAQs, and populateFAQTable exactly as they are 
// from your testQA.js file to reuse the data fetching logic.

async function fetchTitles() {
    try {
        const response = await fetch(`${API_BASE_URL}/titles`);
        const result = await response.json();
        if (response.ok && result.data) {
            allTitles = result.data;
        }
    } catch (error) {
        console.error('Error fetching titles:', error);
    }
}

async function loadFAQs(title) {
    const tbody = document.querySelector('#faqTable tbody');
    tbody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/faqs?title=${encodeURIComponent(title)}`);
        const result = await response.json();
        
        if (response.ok) {
            populateFAQTable(result.data);
        } else {
            tbody.innerHTML = '<tr><td colspan="2">No FAQs found.</td></tr>';
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="2">Error loading FAQs.</td></tr>';
    }
}

function populateFAQTable(faqs) {
    const tbody = document.querySelector('#faqTable tbody');
    tbody.innerHTML = '';
    
    if (!faqs || faqs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2">No FAQs found for this topic.</td></tr>';
        return;
    }

    faqs.forEach(faq => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${faq.question}</td>
            <td>${faq.answer}</td>
        `;
        tbody.appendChild(row);
    });
}
