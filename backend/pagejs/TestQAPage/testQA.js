const API_BASE_URL = 'http://127.0.0.1:5000';
let allTitles = []; // Store titles locally for filtering

document.addEventListener('DOMContentLoaded', () => {
    fetchTitles();
    
    const searchInput = document.getElementById('topicSearch');
    const dropdown = document.getElementById('customDropdown');
    
    if (searchInput && dropdown) {
        // 1. Filter as user types
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const filtered = allTitles.filter(t => t.toLowerCase().includes(val));
            renderDropdown(filtered);
            
            if (val.length > 0 && filtered.length > 0) {
                dropdown.style.display = 'block';
            } else {
                dropdown.style.display = 'none';
            }
        });

        // 2. Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        // 3. Handle Enter key to load table if exact match or just load first/current value
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = searchInput.value;
                dropdown.style.display = 'none';
                loadFAQs(val); 
            }
        });
        
        // 4. Show all options on focus (optional, usually good UX)
        searchInput.addEventListener('focus', () => {
             if (searchInput.value.trim() === "") {
                 renderDropdown(allTitles);
                 dropdown.style.display = 'block';
             }
        });

    }


    // 5. Chat Functionality
    const sendBtn = document.getElementById('sendBtn');
    const userInput = document.getElementById('userInput');

    if (sendBtn && userInput) {
        // Fix: Prevent default behavior and call sendMessage explicitly
        sendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sendMessage();
        });

        // Fix: Use keydown instead of keypress
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent newline in input
                sendMessage();
            }
        });
    }
});

function renderDropdown(titles) {
    const dropdown = document.getElementById('customDropdown');
    const searchInput = document.getElementById('topicSearch');
    dropdown.innerHTML = '';
    
    titles.forEach(title => {
        const li = document.createElement('li');
        li.className = 'dropdown-item';
        li.textContent = title;
        
        // Click handler for selection
        li.addEventListener('click', () => {
            searchInput.value = title;
            dropdown.style.display = 'none';
            loadFAQs(title); // Explicitly load table on click
        });
        
        dropdown.appendChild(li);
    });
}

async function fetchTitles() {
    try {
        const response = await fetch(`${API_BASE_URL}/titles`);
        const result = await response.json();
        
        if (response.ok) {
            if (result.data && Array.isArray(result.data)) {
                allTitles = result.data; // Store globally
            }
        } else {
            console.error('Failed to fetch titles:', result.error);
        }
    } catch (error) {
        console.error('Error fetching titles:', error);
    }
}

async function loadFAQs(title) {
    if (!title) return;
    

    // Update Header
    const headerTitle = document.querySelector('.faq-header h2');
    if (headerTitle) {
        headerTitle.textContent = title;
    }

    const tbody = document.querySelector('#faqTable tbody');
    tbody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/faqs?title=${encodeURIComponent(title)}`);
        const result = await response.json();
        
        if (response.ok) {
            populateFAQTable(result.data);
        } else {
            console.error('Failed to load FAQs:', result.error);
            tbody.innerHTML = '<tr><td colspan="2">Error loading FAQs or Topic not found.</td></tr>';
        }
    } catch (error) {
        console.error('Error loading FAQs:', error);
        tbody.innerHTML = '<tr><td colspan="2">Error loading FAQs.</td></tr>';
    }
}

function populateFAQTable(faqs) {
    const tbody = document.querySelector('#faqTable tbody');
    tbody.innerHTML = '';
    
    if (!faqs || faqs.length === 0) {
        const row = document.createElement('tr');
        const headerTitle = document.querySelector('.faq-header h2');
        if (headerTitle) {
            headerTitle.textContent = "FAQs";
        }
        row.innerHTML = '<td colspan="2">No FAQs found for this topic.</td>';
        tbody.appendChild(row);
        return;
    }

    faqs.forEach(faq => {
        const row = document.createElement('tr');
        const safeQuestion = faq.question ? faq.question.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
        const safeAnswer = faq.answer ? faq.answer.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
        
        row.innerHTML = `
            <td>${safeQuestion}</td>
            <td>${safeAnswer}</td>
        `;
        tbody.appendChild(row);
    });
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    if (!message) return;

    // 1. Display User Message
    addMessageToLog('user', message);
    input.value = ''; 

    // 2. Get Current Title (Topic)
    const headerTitle = document.querySelector('.faq-header h2').textContent;
    const title = (headerTitle !== "FAQs" && headerTitle !== "Avatar Interaction") ? headerTitle : "";

    // 3. Call Backend
    try {
        // Add loading indicator and keep reference to element
        const loadingMsgElement = addMessageToLog('system', 'Thinking...');
        
        const response = await fetch(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: message, title: title })
        });

        const result = await response.json();
        
        // Remove loading indicator
        if (loadingMsgElement) loadingMsgElement.remove();

        if (response.ok) {
            // 4. Display Answer
            if (result.question) {
                addMessageToLog('system', `Found related question: "${result.question}"`);
            }
            addMessageToLog('bot', result.answer);
            
            // 5. Play Video if UUID exists
            if (result.id) {
                console.log("Relevant FAQ UUID:", result.id);
                
                const avatarVideo = document.getElementById('avatarVideo');
                // We need both the element and a valid title to find the folder
                if (avatarVideo && title) {
                    // Construct URL: /static/videos/<Title>/<UUID>.mp4
                    const videoUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(title)}/${result.id}.mp4`;
                    
                    console.log("Playing video:", videoUrl);
                    avatarVideo.src = videoUrl;
                    
                    try {
                        await avatarVideo.play();
                    } catch (e) {
                        console.warn("Auto-play failed (user might need to interact with document first):", e);
                    }
                }
            } else {
                console.log("Answer received (No UUID returned)");
            }

        } else {
            addMessageToLog('system', `Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Chat error:', error);
        addMessageToLog('system', 'Error communicating with server.');
    }
}

function addMessageToLog(sender, text) {
    const chatLog = document.getElementById('chatLog');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.textContent = text;
    
    // Generate simple ID for removal (loading state)
    
    chatLog.appendChild(msgDiv);
    chatLog.scrollTop = chatLog.scrollHeight; // Auto-scroll
    return msgDiv;
}