const API_BASE_URL = window.location.origin;
let allTitles = []; // Store titles locally for filtering
let defaultResponses = null; // Cached default responses from JSON

const VARIANT_COUNT = 3;
const playedVariants = new Map(); // Map<id, Set<playedVariantNumbers>>

function pickVariant(questionId) {
    if (!playedVariants.has(questionId)) {
        playedVariants.set(questionId, new Set());
    }
    const played = playedVariants.get(questionId);
    if (played.size >= VARIANT_COUNT) {
        played.clear();
    }
    let variant;
    do {
        variant = Math.floor(Math.random() * VARIANT_COUNT) + 1;
    } while (played.has(variant));
    played.add(variant);
    console.log(`Picked variant ${variant} for ${questionId}`);
    return variant;
}

document.addEventListener('DOMContentLoaded', () => {
    fetchTitles();
    fetchDefaultResponses();
    
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

    const video = document.getElementById('idleVideo');
    const container = document.querySelector('.video-container');

    if (video && container) {
        video.addEventListener('loadedmetadata', function () {
            // Check to avoid division by zero
            if (this.videoHeight > 0) {
                // Apply the exact ratio of the loaded video
                container.style.aspectRatio = `${this.videoWidth} / ${this.videoHeight}`;
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

    const idleVideo = document.getElementById('idleVideo');
    if (idleVideo) {
        const idleVideoUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(title)}/Idle.mp4`;
        idleVideo.src = idleVideoUrl;
        
        try {
            await idleVideo.play();
        } catch (e) {
            console.warn("Could not auto-play idle video:", e);
        }
    }
    
    // Ensure Top Layer is hidden initially
    const avatarVideo = document.getElementById('avatarVideo');
    if (avatarVideo) {
        avatarVideo.style.opacity = '0'; // Hide top layer to show idle
        
        // When answer ends, fade out top layer to reveal idle
        avatarVideo.onended = () => {
             console.log("Answer video ended, fading to idle.");
             avatarVideo.style.opacity = '0';
        };
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
            const category = result.category || 'answers';

            // Show matched question + confidence info
            if (result.question && result.score !== undefined && result.score !== null) {
                const confidencePercent = Math.max(0, Math.min(100, (1 - result.score) * 100));
                addMessageToLog('system', `Matched: "${result.question}" | Confidence: ${confidencePercent.toFixed(1)}% | Category: ${category}`);
            }

            const avatarVideo = document.getElementById('avatarVideo');
            const idleVideo = document.getElementById('idleVideo');

            if (category === 'rude' || category === 'no_answer') {
                // Pick a random response index from defaultResponses
                const texts = (defaultResponses && defaultResponses[category]) || [];
                if (texts.length > 0) {
                    const responseIndex = Math.floor(Math.random() * texts.length);
                    addMessageToLog('bot', texts[responseIndex]);

                    // Video files are named {category}_{index+1}_{variant}.mp4
                    const baseId = `${category}_${responseIndex + 1}`;
                    const variant = pickVariant(baseId);
                    const videoUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(title)}/${category}/${baseId}_${variant}.mp4`;
                    await playVideoOverlay(videoUrl, avatarVideo, idleVideo);
                } else {
                    addMessageToLog('bot', category === 'rude'
                        ? "That language is not appropriate."
                        : "I'm not confident about this answer.");
                }

            } else if (category === 'conversational') {
                // Conversational: show the matched answer and play from conversational folder
                if (result.answer) {
                    addMessageToLog('bot', result.answer);
                }
                if (result.id && title) {
                    const variant = pickVariant(result.id);
                    const videoUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(title)}/conversational/${result.id}_${variant}.mp4`;
                    await playVideoOverlay(videoUrl, avatarVideo, idleVideo);
                }

            } else {
                // 'answers' category
                if (result.answer) {
                    addMessageToLog('bot', result.answer);
                }
                if (result.id && title) {
                    const variant = pickVariant(result.id);
                    const videoUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(title)}/answers/${result.id}_${variant}.mp4`;
                    await playVideoOverlay(videoUrl, avatarVideo, idleVideo);
                }
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
    
    chatLog.appendChild(msgDiv);
    chatLog.scrollTop = chatLog.scrollHeight; // Auto-scroll
    return msgDiv;
}

async function fetchDefaultResponses() {
    try {
        const response = await fetch(`${API_BASE_URL}/default-responses`);
        if (response.ok) {
            defaultResponses = await response.json();
            console.log("Default responses loaded:", defaultResponses);
        }
    } catch (e) {
        console.error("Failed to fetch default responses:", e);
    }
}

async function playVideoOverlay(videoUrl, avatarVideo, idleVideo) {
    if (!avatarVideo) return;

    console.log("Playing video:", videoUrl);
    avatarVideo.src = videoUrl;
    avatarVideo.loop = false;
    avatarVideo.muted = false;

    // Ensure idle is playing underneath for smooth transition
    if (idleVideo && idleVideo.paused) idleVideo.play();

    try {
        await avatarVideo.play();
        avatarVideo.style.opacity = '1'; // Fade in on top of idle
    } catch (e) {
        console.warn("Auto-play failed:", e);
    }
}