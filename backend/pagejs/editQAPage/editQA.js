const API_BASE_URL = window.location.origin;
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

async function selectTopic(title) {
    document.getElementById('selectedTitle').textContent = title;
    
    // Show the controls container
    document.getElementById('managementControls').style.display = 'block';
    
    // Reset Prompt
    document.getElementById('videoPrompt').value = "talking head"; // Or keep empty
    
    // Load FAQs (this will also find the avatar path)
    await loadFAQs(title);
    
    // Update Avatar Image in the UI
    const avatarImg = document.getElementById('topicAvatar');
    if (currentAvatarPath) {
        // currentAvatarPath is like "static/images/Title/img.png"
        avatarImg.src = `${API_BASE_URL}/${currentAvatarPath}`;
    } else {
        avatarImg.src = ""; // Or a placeholder image URL
    }
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
                document.getElementById('managementControls').style.display = 'none';
                document.querySelector('#faqTable tbody').innerHTML = '<tr><td colspan="3">Select a topic to view or delete...</td></tr>';
                currentAvatarPath = null;
                // Refresh titles
                fetchTitles();
            } else {
                const result = await response.json();
                alert(`Failed to delete topic: ${result.error || 'Unknown error'}`);
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
    tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';

    try {
        const encodedTitle = encodeURIComponent(title);
        
        const responses = await Promise.all([
            fetch(`${API_BASE_URL}/faqs?title=${encodedTitle}`),
            fetch(`${API_BASE_URL}/get-videos?title=${encodedTitle}&category=answers`),
            fetch(`${API_BASE_URL}/get-avatar?title=${encodedTitle}`)
        ]);

        for (const res of responses) {
            if (!res.ok) {
                console.error(`Fetch failed for ${res.url}: ${res.status} ${res.statusText}`);
                const text = await res.text();
                console.error("Response body:", text);
                throw new Error(`API Error: ${res.status} from ${res.url}`);
            }
        }

        const faqResult = await responses[0].json();
        const videoResult = await responses[1].json();
        const avatarResult = await responses[2].json();
        
        if (faqResult.message === 'Fetched successfully' || faqResult.data) {
            currentAvatarPath = avatarResult.avatar_path || null;
            
            const avatarImg = document.getElementById('topicAvatar');
            if (currentAvatarPath) {
                avatarImg.src = `${API_BASE_URL}/${currentAvatarPath}`;
            } else {
                avatarImg.src = ""; 
            }

            const faqs = faqResult.data;
            const existingVideos = videoResult.data || [];

            faqs.forEach(faq => {
                const variants = [];
                for (let v = 1; v <= 3; v++) {
                    if (existingVideos.includes(`${faq.id}_${v}.mp4`)) {
                        variants.push(v);
                    }
                }
                faq.variants = variants;
                faq.has_video = variants.length > 0;
            });

            populateFAQTable(faqs);
        } else {
            tbody.innerHTML = '<tr><td colspan="3">No FAQs found.</td></tr>';
        }

    } catch (error) {
        console.error("Critical error loading FAQs:", error);
        tbody.innerHTML = `<tr><td colspan="3" style="color: red;">Error: ${error.message}</td></tr>`;
    }
}

function populateFAQTable(faqs) {
    const tbody = document.querySelector('#faqTable tbody');
    tbody.innerHTML = '';
    
    if (!faqs || faqs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">No FAQs found for this topic.</td></tr>';
        return;
    }

    faqs.forEach(faq => {
        const row = document.createElement('tr');
        
        const qCell = document.createElement('td');
        qCell.textContent = faq.question;
        
        const aCell = document.createElement('td');
        aCell.textContent = faq.answer;
        
        const vCell = document.createElement('td');
        
        if (faq.has_video && faq.variants.length > 0) {
            const carousel = document.createElement('div');
            carousel.className = 'video-carousel';

            const video = document.createElement('video');
            const encodedTitle = encodeURIComponent(faq.title);
            video.src = `${API_BASE_URL}/static/videos/${encodedTitle}/answers/${faq.id}_${faq.variants[0]}.mp4`;
            video.controls = true;
            video.className = 'carousel-video';
            carousel.appendChild(video);

            if (faq.variants.length > 1) {
                const controls = document.createElement('div');
                controls.className = 'carousel-controls';

                const prevBtn = document.createElement('button');
                prevBtn.className = 'carousel-arrow';
                prevBtn.innerHTML = '&#8249;';

                const label = document.createElement('span');
                label.className = 'carousel-label';
                label.textContent = `1 of ${faq.variants.length}`;

                const nextBtn = document.createElement('button');
                nextBtn.className = 'carousel-arrow';
                nextBtn.innerHTML = '&#8250;';

                let currentIdx = 0;

                function updateVariant() {
                    const v = faq.variants[currentIdx];
                    video.src = `${API_BASE_URL}/static/videos/${encodedTitle}/answers/${faq.id}_${v}.mp4`;
                    label.textContent = `${currentIdx + 1} of ${faq.variants.length}`;
                }

                prevBtn.onclick = () => {
                    currentIdx = (currentIdx - 1 + faq.variants.length) % faq.variants.length;
                    updateVariant();
                };

                nextBtn.onclick = () => {
                    currentIdx = (currentIdx + 1) % faq.variants.length;
                    updateVariant();
                };

                controls.appendChild(prevBtn);
                controls.appendChild(label);
                controls.appendChild(nextBtn);
                carousel.appendChild(controls);
            }

            vCell.appendChild(carousel);
        } else {
            const btn = document.createElement('button');
            btn.textContent = "Generate Video";
            btn.className = "generate-btn";
            
            btn.onclick = () => {
                const promptText = document.getElementById('videoPrompt').value.trim() || "talking head";
                addToQueue(btn, faq.id, faq.title, faq.answer, promptText);
            };
            
            vCell.appendChild(btn);
        }

        row.appendChild(qCell);
        row.appendChild(aCell);
        row.appendChild(vCell);
        tbody.appendChild(row);
    });
}

let currentAvatarPath = null;
const videoQueue = []; // Queue to store pending requests
let isProcessingQueue = false; // Flag to check if we are currently generating

function addToQueue(btnElement, id, title, text, prompt) {
    if (!currentAvatarPath) {
        alert("No avatar image found for this topic. Please upload one first.");
        return;
    }

    // 1. Update UI immediately
    btnElement.disabled = true;
    btnElement.textContent = "Queued";
    btnElement.style.background = "#f39c12"; // Orange for queued
    btnElement.style.transform = "none";

    // 2. Add to Queue
    videoQueue.push({
        btnElement,
        id,
        title,
        text,
        prompt // Store it
    });

    // 3. Update Bubble
    updateQueueBubble();

    // 4. Start Processing if idle
    if (!isProcessingQueue) {
        processQueue();
    }
}

async function processQueue() {
    if (videoQueue.length === 0) {
        isProcessingQueue = false;
        updateQueueBubble();
        return;
    }

    isProcessingQueue = true;
    const currentTask = videoQueue[0]; // Peek at first item
    
    // Update button status to "Generating..."
    const { btnElement, id, title, text, prompt } = currentTask; // Extract prompt
    btnElement.textContent = "Generating...";
    btnElement.style.background = "#3498db"; // Blue for processing

    try {
        updateQueueBubble(true); // Show "Processing 1 of X"

        // --- API Call Logic (Same as before) ---
        // 1. Audio
        const audioResponse = await fetch(`${API_BASE_URL}/generate-audio-single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, title: title, filename_id: id })
        });
        const audioResult = await audioResponse.json();
        if (!audioResponse.ok) throw new Error(audioResult.error || "Audio failed");

        // 2. Start Video Generation
        const videoResponse = await fetch(`${API_BASE_URL}/generate-video-single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio_path: audioResult.audio_url,
                image_path: currentAvatarPath, // This comes from loadFAQs logic
                title: title,
                filename_id: id,
                prompt: prompt // Pass the custom prompt here
            })
        });
        const videoResult = await videoResponse.json();
        
        if (!videoResponse.ok) throw new Error(videoResult.error);

        const jobId = videoResult.job_id;

        // 3. Poll for Progress
        await new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
                try {
                    const progRes = await fetch(`${API_BASE_URL}/progress/${jobId}`);
                    const progData = await progRes.json();

                    if (progData.status === 'completed') {
                        clearInterval(interval);
                        resolve(progData.url);
                    } else if (progData.status === 'failed') {
                        clearInterval(interval);
                        reject(new Error(progData.error));
                    } else {
                        // Update UI with Progress
                        const eta = progData.eta > 0 ? `(${progData.eta}s remaining)` : '';
                        btnElement.textContent = `${progData.progress}% ${eta}`;
                        // Update Bubble
                        updateQueueBubble(true, progData.progress); 
                    }
                } catch (e) {
                    clearInterval(interval);
                    reject(e);
                }
            }, 1000); // Poll every second
        });

        // Success (loop continues)
        const cell = btnElement.parentNode;
        cell.innerHTML = '<span class="status-ready">Ready</span>';

    } catch (error) {
        console.error("Queue task failed:", error);
        btnElement.textContent = "Retry";
        btnElement.disabled = false;
        btnElement.style.background = "#e74c3c";
        
        // Optional: Re-bind click to addToQueue if they want to try again
        btnElement.onclick = () => addToQueue(btnElement, id, title, text, prompt);
    } finally {
        // Remove processed item (success or fail)
        videoQueue.shift();
        
        // Process next item
        processQueue();
    }
}

function updateQueueBubble(isProcessing = false, progress = 0) {
    let bubble = document.getElementById('queueBubble');
    if (!bubble) return;

    const count = videoQueue.length;
    
    if (count === 0 && !isProcessing) {
        bubble.style.display = 'none';
        return;
    }

    bubble.style.display = 'flex';
    if (isProcessing) {
        // e.g. "Processing... (2 pending)"
        // Since we removed the item *after* processing, count includes the current one
        bubble.innerHTML = `
            <div class="spinner"></div>
            <span>Generating video (Queue: ${count})</span>
        `;
    } else {
        bubble.textContent = `Queue: ${count} videos`;
    }
}
