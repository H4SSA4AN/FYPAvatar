const API_BASE_URL = window.location.origin;
let allTitles = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchTitles();
    setupSearch();
    setupDelete();
    setupResume();
    resumeProgress.restore();
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
    
    document.getElementById('managementControls').style.display = 'block';
    document.getElementById('videoPrompt').value = "talking head";

    if (resumeProgress.activeTitle === title) {
        resumeProgress.show();
    } else {
        // Different topic -- hide progress bar and reset UI
        resumeProgress.hide();
        const statusEl = document.getElementById('resumeStatus');
        if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
        const resumeBtn = document.getElementById('resumeAllBtn');
        if (resumeBtn) resumeBtn.disabled = false;
    }

    await loadFAQs(title);
    
    const avatarImg = document.getElementById('topicAvatar');
    if (currentAvatarPath) {
        avatarImg.src = `${API_BASE_URL}/${currentAvatarPath}`;
    } else {
        avatarImg.src = "";
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
        const videoResponse = await fetch(`${API_BASE_URL}/generate-video-extended`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio_path: audioResult.audio_url,
                image_path: currentAvatarPath,
                title: title,
                filename_id: id,
                category: 'answers',
                prompt: prompt
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
        bubble.innerHTML = `
            <div class="spinner"></div>
            <span>Generating video (Queue: ${count})</span>
        `;
    } else {
        bubble.textContent = `Queue: ${count} videos`;
    }
}


function setupResume() {
    const resumeBtn = document.getElementById('resumeAllBtn');
    if (!resumeBtn) return;

    resumeBtn.addEventListener('click', () => {
        const title = document.getElementById('topicSearch').value;
        if (!title) {
            alert('Please select a topic first.');
            return;
        }
        resumeAllMissing(title);
    });
}

async function checkComfyHealth() {
    try {
        const res = await fetch(`${API_BASE_URL}/comfy-health`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return false;
        const data = await res.json();
        return data.status === 'ok';
    } catch {
        return false;
    }
}

async function waitForVideo(jobId, pollInterval = 3000, maxWait = 600000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            const res = await fetch(`${API_BASE_URL}/progress/${jobId}`);
            if (!res.ok) {
                return { ok: false, error: `Progress endpoint returned ${res.status}` };
            }
            const info = await res.json();

            if (info.status === 'completed') {
                return { ok: true, video_url: info.url };
            }
            if (info.status === 'failed') {
                return { ok: false, error: info.error || 'Video generation failed' };
            }
        } catch (e) {
            console.error(`Error polling progress for ${jobId}:`, e);
        }

        await new Promise(r => setTimeout(r, pollInterval));
    }
    return { ok: false, error: 'Timed out waiting for video generation' };
}

const PROGRESS_STORAGE_KEY = 'editQA_resumeProgress';

const resumeProgress = {
    totalOps: 0,
    completedOps: 0,
    opStartTime: null,
    globalStartTime: null,
    recentDurations: [],
    currentLabel: '',
    activeTitle: null,
    statusText: '',
    statusClass: '',
    isError: false,

    reset(title) {
        this.totalOps = 0;
        this.completedOps = 0;
        this.opStartTime = null;
        this.globalStartTime = Date.now();
        this.recentDurations = [];
        this.currentLabel = '';
        this.activeTitle = title;
        this.statusText = '';
        this.statusClass = 'resume-status processing';
        this.isError = false;
        const container = document.getElementById('resumeProgressContainer');
        if (container) container.style.display = 'block';
        const fill = document.getElementById('resumeProgressBarFill');
        if (fill) fill.style.background = 'linear-gradient(90deg, #3498db, #2ecc71)';
        this.render();
    },

    addOps(count) {
        this.totalOps += count;
        this.render();
    },

    startOp(label) {
        this.opStartTime = Date.now();
        this.currentLabel = label || '';
        this.render();
    },

    completeOp() {
        if (this.opStartTime) {
            this.recentDurations.push(Date.now() - this.opStartTime);
            if (this.recentDurations.length > 20) this.recentDurations.shift();
        }
        this.completedOps++;
        this.opStartTime = null;
        this.render();
    },

    setStatus(text, className) {
        this.statusText = text;
        this.statusClass = className || 'resume-status processing';
        const statusEl = document.getElementById('resumeStatus');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = text;
            statusEl.className = this.statusClass;
        }
        this.save();
    },

    getETA() {
        const remaining = this.totalOps - this.completedOps;
        if (remaining <= 0 || this.recentDurations.length === 0) return '';
        const avg = this.recentDurations.reduce((a, b) => a + b, 0) / this.recentDurations.length;
        const secs = Math.round((avg * remaining) / 1000);
        if (secs < 60) return `~${secs}s remaining`;
        const mins = Math.floor(secs / 60);
        const rem = secs % 60;
        if (mins < 60) return `~${mins}m ${rem}s remaining`;
        const hrs = Math.floor(mins / 60);
        return `~${hrs}h ${mins % 60}m remaining`;
    },

    getElapsed() {
        if (!this.globalStartTime) return '';
        const secs = Math.round((Date.now() - this.globalStartTime) / 1000);
        if (secs < 60) return `${secs}s elapsed`;
        const mins = Math.floor(secs / 60);
        const rem = secs % 60;
        if (mins < 60) return `${mins}m ${rem}s elapsed`;
        const hrs = Math.floor(mins / 60);
        return `${hrs}h ${mins % 60}m elapsed`;
    },

    getPercent() {
        if (this.totalOps === 0) return 0;
        return Math.round((this.completedOps / this.totalOps) * 100);
    },

    render() {
        const fill = document.getElementById('resumeProgressBarFill');
        const text = document.getElementById('resumeProgressText');
        const eta = document.getElementById('resumeProgressETA');
        const pct = this.getPercent();
        if (fill) fill.style.width = pct + '%';
        let info = `${pct}% (${this.completedOps}/${this.totalOps})`;
        if (this.currentLabel) info += ` — ${this.currentLabel}`;
        if (text) text.textContent = info;
        const etaParts = [];
        const etaStr = this.getETA();
        const elapsedStr = this.getElapsed();
        if (etaStr) etaParts.push(etaStr);
        if (elapsedStr) etaParts.push(elapsedStr);
        if (eta) eta.textContent = etaParts.join(' | ');
        this.save();
    },

    hide() {
        const container = document.getElementById('resumeProgressContainer');
        if (container) container.style.display = 'none';
    },

    show() {
        const container = document.getElementById('resumeProgressContainer');
        if (container) container.style.display = 'block';
        if (this.isError) {
            const fill = document.getElementById('resumeProgressBarFill');
            if (fill) fill.style.background = '#e74c3c';
        }
        this.render();
        const statusEl = document.getElementById('resumeStatus');
        if (statusEl && this.statusText) {
            statusEl.style.display = 'block';
            statusEl.textContent = this.statusText;
            statusEl.className = this.statusClass;
        }
    },

    isActive() {
        return this.activeTitle !== null;
    },

    finish() {
        this.activeTitle = null;
        localStorage.removeItem(PROGRESS_STORAGE_KEY);
    },

    markError() {
        this.isError = true;
        const fill = document.getElementById('resumeProgressBarFill');
        if (fill) fill.style.background = '#e74c3c';
        this.save();
    },

    save() {
        if (!this.activeTitle) return;
        try {
            localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
                activeTitle: this.activeTitle,
                totalOps: this.totalOps,
                completedOps: this.completedOps,
                globalStartTime: this.globalStartTime,
                recentDurations: this.recentDurations,
                currentLabel: this.currentLabel,
                statusText: this.statusText,
                statusClass: this.statusClass,
                isError: this.isError
            }));
        } catch (e) { /* quota exceeded or private mode */ }
    },

    restore() {
        try {
            const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
            if (!raw) return false;
            const s = JSON.parse(raw);
            if (!s.activeTitle) return false;
            this.activeTitle = s.activeTitle;
            this.totalOps = s.totalOps || 0;
            this.completedOps = s.completedOps || 0;
            this.globalStartTime = s.globalStartTime || null;
            this.recentDurations = s.recentDurations || [];
            this.currentLabel = s.currentLabel || '';
            this.statusText = s.statusText || '';
            this.statusClass = s.statusClass || 'resume-status processing';
            this.isError = s.isError || false;
            return true;
        } catch (e) {
            return false;
        }
    }
};

async function resumeAllMissing(title) {
    const resumeBtn = document.getElementById('resumeAllBtn');
    resumeBtn.disabled = true;

    resumeProgress.setStatus('Checking for missing media...', 'resume-status processing');

    try {
        const res = await fetch(`${API_BASE_URL}/get-missing-media?title=${encodeURIComponent(title)}`);
        const data = await res.json();

        if (!res.ok) {
            resumeProgress.setStatus(`Error: ${data.error}`, 'resume-status error');
            resumeBtn.disabled = false;
            return;
        }

        const missing = data.missing || [];
        if (missing.length === 0) {
            resumeProgress.setStatus('All audio and video variants are already generated!', 'resume-status success');
            resumeBtn.disabled = false;
            return;
        }

        if (!currentAvatarPath) {
            resumeProgress.setStatus('No avatar image found for this topic.', 'resume-status error');
            resumeBtn.disabled = false;
            return;
        }

        const promptText = document.getElementById('videoPrompt').value.trim() || 'talking head';
        const needsAudio = missing.filter(m => m.needs_audio);
        const needsVideo = missing.filter(m => m.needs_video);

        resumeProgress.reset(title);
        resumeProgress.addOps(needsAudio.length + needsVideo.length);
        resumeProgress.setStatus(
            `Found ${missing.length} missing items (${needsAudio.length} audio, ${needsVideo.length} video). Generating audio...`,
            'resume-status processing'
        );

        // Phase 1: Generate all missing audio
        const audioResults = [];

        for (let i = 0; i < needsAudio.length; i++) {
            const item = needsAudio[i];
            const itemDesc = `${item.category} "${item.label}" variant ${item.variant}`;
            resumeProgress.setStatus(`Generating audio ${i + 1}/${needsAudio.length}: ${itemDesc}`, 'resume-status processing');

            resumeProgress.startOp(`Audio: ${itemDesc}`);
            try {
                const audioResp = await fetch(`${API_BASE_URL}/generate-audio-single`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: item.answer,
                        title: title,
                        filename_id: item.variant_id,
                        category: item.category,
                        speechSettings: [],
                        usePlaceholder: false
                    })
                });
                const audioResult = await audioResp.json();
                if (audioResp.ok) {
                    audioResults.push({ variant_id: item.variant_id, category: item.category, audioUrl: audioResult.audio_url });
                } else {
                    console.error(`Audio failed for ${item.variant_id}:`, audioResult.error);
                    if (!(await checkComfyHealth())) {
                        resumeProgress.setStatus('ComfyUI crashed during audio. Resume again later.', 'resume-status error');
                        resumeProgress.markError();
                        resumeProgress.finish();
                        resumeBtn.disabled = false;
                        return;
                    }
                }
            } catch (e) {
                console.error(`Audio error for ${item.variant_id}:`, e);
                if (!(await checkComfyHealth())) {
                    resumeProgress.setStatus('ComfyUI crashed during audio. Resume again later.', 'resume-status error');
                    resumeProgress.markError();
                    resumeProgress.finish();
                    resumeBtn.disabled = false;
                    return;
                }
            }
            resumeProgress.completeOp();
        }

        // Phase 2: Generate all missing video
        const freshAudioMap = {};
        for (const a of audioResults) {
            freshAudioMap[a.variant_id] = a.audioUrl;
        }

        resumeProgress.setStatus(`Audio done. Generating ${needsVideo.length} videos...`, 'resume-status processing');

        for (let i = 0; i < needsVideo.length; i++) {
            const item = needsVideo[i];
            const audioUrl = freshAudioMap[item.variant_id] || `/static/audio/${title}/${item.category}/${item.variant_id}.mp3`;
            const itemDesc = `${item.category} "${item.label}" variant ${item.variant}`;
            resumeProgress.setStatus(`Generating video ${i + 1}/${needsVideo.length}: ${itemDesc}`, 'resume-status processing');

            resumeProgress.startOp(`Video: ${itemDesc}`);
            try {
                const videoResp = await fetch(`${API_BASE_URL}/generate-video-extended`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audio_path: audioUrl,
                        image_path: currentAvatarPath,
                        title: title,
                        filename_id: item.variant_id,
                        category: item.category,
                        prompt: promptText,
                        usePlaceholder: false
                    })
                });
                const videoResult = await videoResp.json();
                if (videoResp.ok && videoResult.job_id) {
                    const pollResult = await waitForVideo(videoResult.job_id);
                    if (!pollResult.ok) {
                        console.error(`Video failed for ${item.variant_id}:`, pollResult.error);
                        if (!(await checkComfyHealth())) {
                            resumeProgress.setStatus('ComfyUI crashed during video. Resume again later.', 'resume-status error');
                            resumeProgress.markError();
                            resumeProgress.finish();
                            resumeBtn.disabled = false;
                            return;
                        }
                    }
                } else {
                    console.error(`Video start failed for ${item.variant_id}:`, videoResult?.error);
                    if (!(await checkComfyHealth())) {
                        resumeProgress.setStatus('ComfyUI crashed during video. Resume again later.', 'resume-status error');
                        resumeProgress.markError();
                        resumeProgress.finish();
                        resumeBtn.disabled = false;
                        return;
                    }
                }
            } catch (e) {
                console.error(`Video error for ${item.variant_id}:`, e);
                if (!(await checkComfyHealth())) {
                    resumeProgress.setStatus('ComfyUI crashed during video. Resume again later.', 'resume-status error');
                    resumeProgress.markError();
                    resumeProgress.finish();
                    resumeBtn.disabled = false;
                    return;
                }
            }
            resumeProgress.completeOp();
        }

        resumeProgress.setStatus('Done! All missing media generated. Refreshing...', 'resume-status success');
        resumeProgress.finish();
        resumeBtn.disabled = false;
        await loadFAQs(title);

    } catch (e) {
        console.error('Resume error:', e);
        resumeProgress.setStatus(`Error: ${e.message}`, 'resume-status error');
        resumeProgress.markError();
        resumeProgress.finish();
        resumeBtn.disabled = false;
    }
}
