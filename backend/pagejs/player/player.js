let mediaRecorder;
let audioChunks = [];
let audioContext;
let analyser;
let silenceTimer;
let isRecording = false;

document.addEventListener('DOMContentLoaded', () => {
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
});

async function toggleVoiceDetection() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        mediaRecorder = new MediaRecorder(stream);
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
            
            // Clean up
            stream.getTracks().forEach(track => track.stop());
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
        const API_BASE_URL = 'http://127.0.0.1:5000'; 
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

function handleUserMessage(transcriptionTime = null) {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();

    if (!message) return;

    // 1. Add User Message with optional timer
    addMessageToLog('user', message, transcriptionTime);
    
    // Clear input
    chatInput.value = '';

    // 2. Simulate Bot Response (Placeholder)
    setTimeout(() => {
        addMessageToLog('bot', 'This response is a placeholder for later functionality');
    }, 500); 
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
