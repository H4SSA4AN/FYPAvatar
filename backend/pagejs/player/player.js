let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let silenceTimer;
let isRecording = false;
let audioStream = null; // Keep stream alive between recordings

const API_BASE_URL = window.location.origin;
// topic immediately shows when opening page
const DEFAULT_TOPIC = "CS Open Day FAQ";
let allTitles = [];
let currentTitle = null; // Add this global variable
let idleTimer = null;
const IDLE_TIMEOUT_MS = 45000; // 45 seconds

// Variant tracking: Map<questionId, Set<playedVariantNumbers>>
const VARIANT_COUNT = 3;
const playedVariants = new Map();

function pickVariant(questionId) {
    if (!playedVariants.has(questionId)) {
        playedVariants.set(questionId, new Set());
    }
    let played = playedVariants.get(questionId);

    // Reset if all variants have been played
    if (played.size >= VARIANT_COUNT) {
        played.clear();
    }

    // Pick a random unplayed variant
    let available = [];
    for (let v = 1; v <= VARIANT_COUNT; v++) {
        if (!played.has(v)) available.push(v);
    }
    const chosen = available[Math.floor(Math.random() * available.length)];
    played.add(chosen);
    console.log(`Picked variant ${chosen} for ${questionId}`);
    return chosen;
}

document.addEventListener('DOMContentLoaded', async () => {
    const chatInput = document.getElementById('chat-input');
    const micButton = document.getElementById('mic-button');

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleUserMessage();
            }
        });
    }

    if (micButton) {
        micButton.addEventListener('click', toggleVoiceDetection);
    }

    await fetchTitles();
    setupSearch();
    setupToggle();

    if (allTitles.includes(DEFAULT_TOPIC)) {
        const searchInput = document.getElementById('topicSearch');
        if (searchInput) {
            searchInput.value = DEFAULT_TOPIC;
        }
        await selectTopic(DEFAULT_TOPIC);
    }
});

async function toggleVoiceDetection() {
    if (isRecording) {
        stopRecording();
    } else {
        // --- NEW: Interrupt any playing video before starting recording ---
        interruptActiveVideo();
        startRecording();
    }
}

async function startRecording() {
    try {
        // Only request permission once - reuse stream if it exists
        if (!audioStream) {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(audioStream);
        source.connect(analyser);
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        mediaRecorder = new MediaRecorder(audioStream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            // Only send if we have data
            if (audioChunks.length > 0) {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                await sendAudioToBackend(audioBlob);
            }
            
            // DON'T stop the stream - keep it alive for reuse
            // stream.getTracks().forEach(track => track.stop()); // REMOVED
            
            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close();
            }
            isRecording = false;
            updateMicVisual(false);
        };
        
        mediaRecorder.start();
        isRecording = true;
        updateMicVisual(true);
        
        detectSilence(dataArray, bufferLength);
        
    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Could not access microphone. Please ensure permissions are granted.");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        if (silenceTimer) clearTimeout(silenceTimer);
    }
}

function detectSilence(dataArray, bufferLength) {
    if (!isRecording) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    let sum = 0;
    for(let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
    }
    const average = sum / bufferLength;
    
    // Threshold for silence (adjustable based on environment)
    const SILENCE_THRESHOLD = 10; 
    
    if (average < SILENCE_THRESHOLD) {
        if (!silenceTimer) {
            silenceTimer = setTimeout(() => {
                console.log("Silence detected for 1s, stopping recording...");
                stopRecording();
            }, 1000); // Changed from 300 to 1000ms
        }
    } else {
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    }
    
    requestAnimationFrame(() => detectSilence(dataArray, bufferLength));
}

async function sendAudioToBackend(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    
    const chatInput = document.getElementById('chat-input');
    const originalPlaceholder = chatInput.placeholder;
    chatInput.placeholder = "Transcribing...";
    
    const startTime = performance.now(); // Start timer
    
    try {
        const response = await fetch(`${API_BASE_URL}/transcribe`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        const endTime = performance.now(); // End timer
        const duration = ((endTime - startTime) / 1000).toFixed(2); // Seconds
        
        if (result.text) {
            chatInput.value = result.text;
            handleUserMessage(duration); // Pass duration
        } else if (result.error) {
            console.error("Transcription error:", result.error);
        }
    } catch (error) {
        console.error("Network error during transcription:", error);
    } finally {
        chatInput.placeholder = originalPlaceholder;
    }
}

function updateMicVisual(active) {
    const btn = document.getElementById('mic-button');
    if (!btn) return;
    
    if (active) {
        btn.classList.add('active');
        // Visual feedback for recording state
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="red" width="20" height="20">
                 <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                 <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
        `;
    } else {
        btn.classList.remove('active');
        // Revert to original icon
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
        `;
    }
}

async function logInteraction(data) {
    try {
        await fetch(`${API_BASE_URL}/log-interaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.warn('Failed to log interaction:', e);
    }
}

async function handleUserMessage(transcriptionTime = null) {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    if (!message) return;

    // Reset timer immediately on user interaction
    clearTimeout(idleTimer); 

    // 1. Add User Message
    addMessageToLog('user', message, transcriptionTime);
    
    // Clear input
    chatInput.value = '';

    // 2. Check if a topic is selected
    if (!currentTitle) {
        addMessageToLog('system', 'Please select a topic from the search box first.');
        return;
    }

    // 3. Call Backend
    try {
        const loadingMsg = addMessageToLog('system', 'Thinking...');
        
        const response = await fetch(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: message, title: currentTitle })
        });

        const result = await response.json();
        
        // Remove loading message (optional, or just leave it)
        if (loadingMsg) loadingMsg.remove();

        if (response.ok) {
            const category = result.category || 'answers';
            const confidencePercent = (result.score !== undefined && result.score !== null)
                ? Math.max(0, Math.min(100, (1 - result.score) * 100)).toFixed(1)
                : '';

            if (result.question && confidencePercent !== '') {
                addMessageToLog('system', `Matched: "${result.question}"\nConfidence: ${confidencePercent}% | Category: ${category}`);
            }

            let answerGiven = '';

            if (category === 'rude') {
                answerGiven = "That language is not appropriate.";
                addMessageToLog('bot', answerGiven);
                playRandomCategoryVideo(currentTitle, 'rude');

            } else if (category === 'no_answer' || category === 'no_answer_relevant' || category === 'no_answer_irrelevant') {
                answerGiven = "I'm not confident about this answer. Let me get back to you.";
                addMessageToLog('bot', answerGiven);
                playRandomCategoryVideo(currentTitle, 'no_answer');

            } else {
                answerGiven = result.answer || '';
                if (result.answer) {
                    addMessageToLog('bot', result.answer);
                }
                if (result.id) {
                    playAnswerVideo(result.id, currentTitle, category);
                }
            }

            logInteraction({
                title: currentTitle,
                question_user_asked: message,
                question_system_thought: result.question || '',
                answer_given: answerGiven,
                category,
                confidence_score: confidencePercent,
                timestamp: new Date().toISOString()
            });
        } else {
            addMessageToLog('system', `Error: ${result.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Chat error:', error);
        addMessageToLog('system', 'Error connecting to server.');
    }
}

function addMessageToLog(sender, text, transcriptionTime = null) {
    const chatLog = document.getElementById('chat-log');
    const msgDiv = document.createElement('div');
    
    msgDiv.className = `message ${sender}`;
    
    // Create text node
    const textNode = document.createTextNode(text);
    msgDiv.appendChild(textNode);
    
    // Add timer if available (only for user messages that were transcribed)
    if (transcriptionTime && sender === 'user') {
        const timerSpan = document.createElement('span');
        timerSpan.className = 'transcription-time';
        timerSpan.textContent = ` (${transcriptionTime}s)`;
        timerSpan.style.fontSize = '0.8em';
        timerSpan.style.color = '#eee';
        timerSpan.style.marginLeft = '8px';
        msgDiv.appendChild(timerSpan);
    }
    
    chatLog.appendChild(msgDiv);
    
    // Auto-scroll to bottom
    chatLog.scrollTop = chatLog.scrollHeight;
}

// --- Search Functionality ---

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
        
        li.addEventListener('click', () => {
            searchInput.value = title;
            dropdown.style.display = 'none';
            selectTopic(title);
        });
        
        dropdown.appendChild(li);
    });
}

async function selectTopic(title) {
    currentTitle = title; // Store the title

    // 1. Enable the toggle button
    const toggleBtn = document.getElementById('toggleQuestionsBtn');
    if (toggleBtn) {
        toggleBtn.style.display = 'block';
        toggleBtn.textContent = `Show Questions for "${title}" ▼`;
    }
    
    // 2. Play Intro Video IMMEDIATELY to preserve user gesture
    playIntroVideo(title);

    // 3. Load FAQs for the table (in background/parallel)
    // We don't await this blocking the video start
    loadFAQs(title).catch(err => console.error("Error loading FAQs:", err));

    console.log(`Topic selected: ${title}`);
}

function playIntroVideo(title) {
    const introUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(title)}/Intro.mp4`;
    
    console.log("Attempting to play intro:", introUrl);
    // startMuted: intro may run without a user gesture (e.g. auto-selected topic on load).
    // Browsers block unmuted autoplay; muted autoplay is allowed.
    playActiveVideo(introUrl, () => {
        console.log("Intro finished. Starting idle video.");
        playIdleVideo(title);
    }, { startMuted: true });
}

function playIdleVideo(title) {
    const idleVideo = document.getElementById('idle-video');
    const activeVideo = document.getElementById('active-video');
    
    if (!idleVideo) return;
    
    const idleUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(title)}/Idle.mp4`;

    // Only set src if it's different to avoid reloading loop
    if (!idleVideo.src.includes(encodeURIComponent(title))) {
         idleVideo.src = idleUrl;
    }

    idleVideo.loop = true;
    idleVideo.muted = true;
    
    idleVideo.play().then(() => {
        // Fade out active video to reveal idle
        if (activeVideo) activeVideo.style.opacity = '0';
        resetIdleTimer();
    }).catch(error => {
        console.error("Error playing idle video:", error);
    });
}

function playActiveVideo(videoUrl, onEndedCallback, options = {}) {
    const activeVideo = document.getElementById('active-video');
    const startMuted = !!options.startMuted;

    if (!activeVideo) return;

    console.log("Playing active video:", videoUrl); // Add logging

    // Stop timer while active video plays
    clearTimeout(idleTimer);

    // Reset properties
    activeVideo.onended = null;
    activeVideo.onplay = null;

    activeVideo.src = videoUrl;
    activeVideo.loop = false;
    activeVideo.muted = startMuted;
    
    // Explicitly force opacity to 0 initially
    activeVideo.style.opacity = '0';
    
    const showVideo = () => {
        console.log("Showing active video (opacity -> 1)");
        activeVideo.style.opacity = '1';
    };

    activeVideo.onplay = showVideo;

    activeVideo.onended = () => {
        console.log("Active video finished.");
        activeVideo.style.opacity = '0';
        
        if (onEndedCallback) {
            onEndedCallback();
        } else {
            resetIdleTimer();
        }
    };

    activeVideo.play().then(() => {
        console.log("Play promise resolved.");
        showVideo();
        if (startMuted) {
            try {
                activeVideo.muted = false;
            } catch (_) { /* ignore */ }
        }
    }).catch(e => {
        console.error("Error playing active video:", e);
        // Do not call onEndedCallback — a failed play is not "video finished".
    });
}

async function loadFAQs(title) {
    const tbody = document.querySelector('#faqTable tbody');
    tbody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}/faqs?title=${encodeURIComponent(title)}`);
        const result = await response.json();
        
        if (response.ok && result.data) {
            populateFAQTable(result.data);
        } else {
            tbody.innerHTML = '<tr><td colspan="2">No questions found.</td></tr>';
        }
    } catch (error) {
        console.error("Error loading FAQs:", error);
        tbody.innerHTML = '<tr><td colspan="2">Error loading data.</td></tr>';
    }
}

function populateFAQTable(faqs) {
    const tbody = document.querySelector('#faqTable tbody');
    tbody.innerHTML = '';
    
    faqs.forEach(faq => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${faq.question}</td>
            <td>${faq.answer}</td>
        `;
        tbody.appendChild(row);
    });
}

function setupToggle() {
    const btn = document.getElementById('toggleQuestionsBtn');
    const panel = document.getElementById('questionsPanel');
    
    if(btn && panel) {
        btn.addEventListener('click', () => {
            const isHidden = panel.style.display === 'none';
            panel.style.display = isHidden ? 'block' : 'none';
            // Update arrow
            const currentText = btn.textContent.replace(' ▼', '').replace(' ▲', '');
            btn.textContent = `${currentText} ${isHidden ? '▲' : '▼'}`;
        });
    }
}

function playAnswerVideo(videoId, videoTitle, category = 'answers') {
    const useTitle = videoTitle || currentTitle;
    const variant = pickVariant(videoId);
    const videoUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(useTitle)}/${category}/${videoId}_${variant}.mp4`;
    
    console.log(`Playing ${category} variant ${variant} for ${videoId}`);
    playActiveVideo(videoUrl, () => {
        console.log("Answer finished. Revealing Idle.");
        playIdleVideo(useTitle);
    });
}

async function playRandomCategoryVideo(title, category) {
    try {
        const response = await fetch(`${API_BASE_URL}/get-videos?title=${encodeURIComponent(title)}&category=${category}`);
        const result = await response.json();
        
        if (result.data && result.data.length > 0) {
            // Pick a random video from the list
            const randomIndex = Math.floor(Math.random() * result.data.length);
            const videoFile = result.data[randomIndex];
            const videoUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(title)}/${category}/${videoFile}`;
            
            console.log(`Playing random ${category} video: ${videoFile}`);
            playActiveVideo(videoUrl, () => {
                console.log(`${category} video finished. Revealing Idle.`);
                playIdleVideo(title);
            });
        } else {
            console.warn(`No ${category} videos found for topic "${title}".`);
            resetIdleTimer();
        }
    } catch (e) {
        console.error(`Error fetching ${category} videos:`, e);
        resetIdleTimer();
    }
}

// --- NEW HELPER FUNCTION ---
function interruptActiveVideo() {
    const activeVideo = document.getElementById('active-video');
    
    // Only interrupt if active video exists and is potentially playing
    if (activeVideo) {
        // 1. Start fade out immediately
        activeVideo.style.opacity = '0';
        
        // 2. Pause immediately to stop audio/motion
        if (!activeVideo.paused) {
            activeVideo.pause();
        }
        activeVideo.currentTime = 0; // Reset position
        
        // 3. Remove event listeners so callbacks (like resuming idle timer) don't fire unexpectedly
        activeVideo.onended = null;
        activeVideo.onplay = null;
        
        // 4. Ensure idle video is running (it should be in background)
        if (currentTitle) {
            playIdleVideo(currentTitle);
        }
    }
}

// --- NEW FUNCTIONS ---

function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    
    // Only set timer if we have a title selected (meaning we are in a session)
    if (currentTitle) {
        idleTimer = setTimeout(playIdleTooLongVideo, IDLE_TIMEOUT_MS);
    }
}

function playIdleTooLongVideo() {
    if (!currentTitle) return;
    
    console.log("Idle timeout reached. Playing IdleTooLong.");
    const tooLongUrl = `${API_BASE_URL}/static/videos/${encodeURIComponent(currentTitle)}/IdleTooLong.mp4`;

    playActiveVideo(tooLongUrl, () => {
        console.log("IdleTooLong finished. Revealing Idle.");
        playIdleVideo(currentTitle);
    });
}
