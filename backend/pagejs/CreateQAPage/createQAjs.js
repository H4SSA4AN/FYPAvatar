const API_BASE_URL = window.location.origin;
const statusDiv = document.getElementById('statusMessage');
let counter = 1;

const progress = {
    totalOps: 0,
    completedOps: 0,
    opStartTime: null,
    globalStartTime: null,
    recentDurations: [],

    reset() {
        this.totalOps = 0;
        this.completedOps = 0;
        this.opStartTime = null;
        this.globalStartTime = Date.now();
        this.recentDurations = [];
        const container = document.getElementById('progressContainer');
        if (container) container.style.display = 'block';
        this.render();
    },

    addOps(count) {
        this.totalOps += count;
        this.render();
    },

    startOp() {
        this.opStartTime = Date.now();
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

    getAvgMs() {
        if (this.recentDurations.length === 0) return 0;
        const sum = this.recentDurations.reduce((a, b) => a + b, 0);
        return sum / this.recentDurations.length;
    },

    getETA() {
        const remaining = this.totalOps - this.completedOps;
        if (remaining <= 0 || this.recentDurations.length === 0) return '';
        const ms = this.getAvgMs() * remaining;
        const secs = Math.round(ms / 1000);
        if (secs < 60) return `~${secs}s remaining`;
        const mins = Math.floor(secs / 60);
        const remSecs = secs % 60;
        return `~${mins}m ${remSecs}s remaining`;
    },

    getPercent() {
        if (this.totalOps === 0) return 0;
        return Math.round((this.completedOps / this.totalOps) * 100);
    },

    render() {
        const fill = document.getElementById('progressBarFill');
        const text = document.getElementById('progressText');
        const eta = document.getElementById('progressETA');
        const pct = this.getPercent();
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = `${pct}% (${this.completedOps}/${this.totalOps})`;
        if (eta) eta.textContent = this.getETA();
    },

    hide() {
        const container = document.getElementById('progressContainer');
        if (container) container.style.display = 'none';
    }
};

let generationHalted = false;

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

function haltGeneration(reason) {
    generationHalted = true;
    statusDiv.innerHTML = `Generation stopped: ${reason}. Your topic has been saved — use Edit FAQs to resume later.`;
    statusDiv.className = 'status-message error';
    const fill = document.getElementById('progressBarFill');
    if (fill) fill.style.background = '#e74c3c';
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

document.addEventListener('DOMContentLoaded', function () {

    initaliseModals();
    initialiseUploads();
    initialiseManualEntry();

    document.getElementById('avatarImageUpload').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            const img = document.getElementById('avatarPreview');
            const txt = document.getElementById('previewText');
            
            img.src = url;
            img.style.display = 'block';
            if(txt) txt.style.display = 'none'; // Hide the "Generated image will appear here" text
            
            // Enable the generate video button
            document.getElementById('confirmAvatarBtn').disabled = false;

            const confirmImageBtn = document.getElementById('confirmImageBtn');
            if (confirmImageBtn) confirmImageBtn.disabled = false;
        }


    });

});

function initaliseModals() {

    const avatarModal = document.getElementById('avatarModal');
    const avatarButton = document.getElementById('generateVideoBtn');
    setupModal(avatarModal, avatarButton);

    const manualEntryModal = document.getElementById('manualEntryModal');
    const manualEntryButton = document.getElementById('manualEntryBtn');
    setupModal(manualEntryModal, manualEntryButton);

    window.onclick = function (event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    };
}

function setupModal(modal, button) {
    if (!modal || !button) return;

    const span = modal.querySelector('.close-modal');

    button.onclick = function () {
        modal.style.display = 'block';
    };

    if (span) {
        span.onclick = function () {
            modal.style.display = 'none';
        };
    }

    window.onclick = function (event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    };
}

function initialiseUploads() {
    const uploadInput = document.getElementById('avatarImageUpload');
    const previewImg = document.getElementById('avatarPreview');
    const previewText = document.getElementById('previewText');

    if (uploadInput && previewImg) {
        uploadInput.addEventListener('change', function (e) {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    previewImg.src = e.target.result;
                    previewImg.style.display = 'block';
                    if (previewText) previewText.style.display = 'none';
                };
                reader.readAsDataURL(this.files[0]);
            };
        });
    }
}


function initialiseManualEntry() {
    const addRecordBtn = document.getElementById('addRecordBtn');
    const manualEntryList = document.getElementById('manualEntryList');
    const saveManualEntryBtn = document.getElementById('saveManualEntryBtn');

    if (addRecordBtn && manualEntryList) {
        addRecordBtn.onclick = function () {
            const newRow = document.createElement('div');
            newRow.className = 'manual-entry-row';
            counter++;

            newRow.innerHTML = `
                <div class="manual-entry-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Question ${counter}</label>
                        <input type="text" class="manual-question" placeholder="Type question...">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Answer</label>
                        <input type="text" class="manual-answer" placeholder="Type answer...">
                    </div>
                </div>
            `;

            manualEntryList.appendChild(newRow);
            manualEntryList.scrollTop = manualEntryList.scrollHeight;
        };
    }

    if (saveManualEntryBtn) {
        saveManualEntryBtn.onclick = function () {
            saveManualData();

        };
    }

    const manualRemoveBtn = document.getElementById('manualRemoveBtn');
    const manualEntryBtn = document.getElementById('manualEntryBtn');
    const fileInput = document.getElementById('csvFile');
    const csvLabel = document.getElementById('csvFileLabel');
    
    if (manualRemoveBtn) {
        manualRemoveBtn.addEventListener('click', function(e) {
            e.preventDefault(); // Stop button click if nested
            e.stopPropagation();

            // 1. Reset Manual Button
            if (manualEntryBtn) {
                manualEntryBtn.innerHTML = "Click here to manually enter FAQ";
                manualEntryBtn.style.borderColor = ''; // Reset styles
                manualEntryBtn.style.backgroundColor = '';
            }

            // 2. Hide Remove Button
            manualRemoveBtn.style.display = 'none';

            // 3. Re-enable CSV Upload
            if (csvLabel) {
                csvLabel.innerHTML = "Upload CSV here";
                csvLabel.style.pointerEvents = 'auto';
                csvLabel.style.backgroundColor = '';
                csvLabel.style.color = '';
                csvLabel.style.border = '';
            }

            // 4. Clear File Input (actual data)
            if (fileInput) {
                fileInput.value = '';
                // Optional: dispatch change to clear status message
                // fileInput.dispatchEvent(new Event('change'));
            }
            
            // 5. Clear Status Message
            const statusDiv = document.getElementById('statusMessage');
            if(statusDiv) {
                statusDiv.innerHTML = '';
                statusDiv.className = 'status-message';
            }

            // Inside remove listeners (manual and csv)
            const rightPanel = document.querySelector('.right-panel');
            if (rightPanel) {
                rightPanel.innerHTML = `
                    <h2>Preview / Instructions</h2>
                    <p>Select a topic or create a new one to start adding questions to your knowledge base.</p>
                `;
            }


            // Reset Manual Entry List
            const entryList = document.getElementById('manualEntryList');
            if (entryList) {
                entryList.innerHTML = `
               <div class="manual-entry-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Question 1</label>
                        <input type="text" class="manual-question" placeholder="Type question...">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Answer</label>
                        <input type="text" class="manual-answer" placeholder="Type answer...">
                    </div>
                </div>`;
                counter = 1;
                
            }
        });
    }
}


function saveManualData() {
    const questions = document.querySelectorAll('.manual-question');
    const answers = document.querySelectorAll('.manual-answer');
    const data = [];

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i].value.trim();
        const a = answers[i].value.trim();
        if (q && a) {
            data.push({ question: q, answer: a });
        }
    }

    if (data.length > 0) {
        // Convert to CSV Logic
        const csvHeader = "Question,Answer\n";
        const csvRows = data.map(row => {
            const q = `"${row.question.replace(/"/g, '""')}"`;
            const a = `"${row.answer.replace(/"/g, '""')}"`;
            return `${q},${a}`;
        }).join("\n");

        const csvContent = csvHeader + csvRows;
        previewCSV(csvContent);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        if (data.length > 0) {
            // ... csv generation logic ...
            const file = new File([blob], "manual_entry.csv", { type: 'text/csv' });

            // Assign to File Input
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);

            const fileInput = document.getElementById('csvFile');
            if (fileInput) {
                fileInput.files = dataTransfer.files;
            }

            // UPDATE UI
            // 1. Update Manual Button Text
            const manualEntryBtn = document.getElementById('manualEntryBtn');
            const manualRemoveBtn = document.getElementById('manualRemoveBtn');

            if (manualEntryBtn) {
                manualEntryBtn.innerHTML = `manual_entry.csv (${data.length} records)`;
                manualEntryBtn.style.borderColor = '#2ecc71'; // Green border to indicate success
                manualEntryBtn.style.backgroundColor = '#e8f5e9';
            }

            if (manualRemoveBtn) {
                manualRemoveBtn.style.display = 'block'; // Show X
            }

            // 2. "Disable" CSV Upload Button (Visual only, input remains active for form)
            const csvLabel = document.getElementById('csvFileLabel');
            if (csvLabel) {
                csvLabel.innerHTML = "Using Manual Entry";
                csvLabel.style.pointerEvents = 'none';
                csvLabel.style.backgroundColor = '#f0f0f0';
                csvLabel.style.color = '#999';
                csvLabel.style.border = '1px dashed #ccc';
            }

            // Remove the X button for CSV if it was there
            const csvRemoveBtn = document.getElementById('csvFileRemoveBtn');
            if (csvRemoveBtn) csvRemoveBtn.style.display = 'none';

            document.getElementById('manualEntryModal').style.display = 'none';
            // Reset form
            /*
            const entryList = document.getElementById('manualEntryList');
            if (entryList) {
                entryList.innerHTML = `
               <div class="manual-entry-row" style="display: flex; gap: 10px; margin-bottom: 10px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Question 1</label>
                        <input type="text" class="manual-question" placeholder="Type question...">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Answer</label>
                        <input type="text" class="manual-answer" placeholder="Type answer...">
                    </div>
                </div>`;
                counter = 1;
                
            }
            */
        } else {
            alert("Please enter at least one valid question/answer pair.");
        }
    }
}



function updateLabel(inputId, defaultText) {
    const input = document.getElementById(inputId);
    const label = document.querySelector(`label[for="${inputId}"].upload-label`);
    let removeBtn;

    switch (inputId) {
        case 'csvFile':
            removeBtn = document.getElementById('csvFileRemoveBtn');
            break;
        case 'mediaFile':
            removeBtn = document.getElementById('mediaFileRemoveBtn');
            break;
    }

    if (!input || !label) return;

    input.addEventListener('change', function () {
        if (this.files && this.files.length > 0) {
            label.innerHTML = this.files[0].name;
            const fileName = this.files[0].name;
            removeBtn.style.display = 'block';

            if (inputId === 'csvFile') {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const text = e.target.result;
                    // Split by new line and filter out empty lines
                    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
                    // Subtract 1 for header row if you assume there is one
                    const count = lines.length > 0 ? lines.length - 1 : 0;

                    label.innerHTML = `${fileName} (${count} records)`;
                    label.style.borderColor = '#2ecc71';
                    label.style.backgroundColor = '#e8f5e9';
                    previewCSV(text);
                    // NEW: Disable Manual Entry Button
                    const manualBtn = document.getElementById('manualEntryBtn');
                    if (manualBtn) {
                        manualBtn.innerHTML = "CSV Upload Active";
                        manualBtn.disabled = true; // Use disabled attribute for buttons
                        manualBtn.style.pointerEvents = 'none'; // Ensure no clicks
                        manualBtn.style.opacity = '0.6';
                        manualBtn.style.border = '1px dashed #ccc';
                        manualBtn.style.backgroundColor = '#f0f0f0';
                        manualBtn.style.color = '#999';
                    }
                };
                reader.onerror = function () {
                    statusDiv.innerHTML = "Error reading file.";
                    statusDiv.className = 'status-message error';
                };
                reader.readAsText(this.files[0]);
            }

            if (inputId === 'mediaFile') {
                const videoContainer = document.getElementById('videoPreviewContainer');
                const videoPreview = document.getElementById('videoPreview');

                if (videoContainer && videoPreview) {
                    const fileURL = URL.createObjectURL(this.files[0]);
                    videoPreview.src = fileURL;

                    videoContainer.style.display = 'flex';

                    setTimeout(() => {
                        videoContainer.classList.add('open');
                    }, 10);
                }
            }

        }
    });



    removeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        input.value = '';
        label.innerHTML = defaultText;
        removeBtn.style.display = 'none';

        if (inputId === 'mediaFile') {
            const videoContainer = document.getElementById('videoPreviewContainer');
            const videoPreview = document.getElementById('videoPreview');
            if (videoContainer) {
                videoContainer.classList.remove('open');
                setTimeout(() => {
                    videoContainer.style.display = 'none';
                }, 600);
                if (videoPreview) {
                    videoPreview.src = '';
                    URL.revokeObjectURL(videoPreview.src);
                }
            }
        }

        label.style.borderColor = ''; // Reset border
        label.style.backgroundColor = ''; // Reset background

        if (inputId === 'csvFile') {
            // NEW: Re-enable Manual Entry Button
            const manualBtn = document.getElementById('manualEntryBtn');
            if (manualBtn) {
                manualBtn.innerHTML = "Click here to manually enter FAQ";
                manualBtn.disabled = false;
                manualBtn.style.pointerEvents = 'auto';
                manualBtn.style.opacity = '1';
                manualBtn.style.border = ''; // Reset to stylesheet default
                manualBtn.style.backgroundColor = '';
                manualBtn.style.color = '';
            }

            // Inside remove listeners (manual and csv)
            const rightPanel = document.querySelector('.right-panel');
            if (rightPanel) {
                rightPanel.innerHTML = `
                    <h2>Preview / Instructions</h2>
                    <p>Select a topic or create a new one to start adding questions to your knowledge base.</p>
                `;
            }
        }

    });
}


updateLabel('csvFile', 'Upload CSV here');
updateLabel('mediaFile', 'Upload mp4 here');



// Will work whether user uploads csv or types in their questions
async function uploadCSV() {
    const file = document.getElementById('csvFile').files[0];
    const title = document.getElementById('title').value;

    if (!file || !title) {
        alert('Please fill in all fields');
        return;
    }

    statusDiv.innerHTML = `Uploading file ${file.name}...`;
    statusDiv.className = 'status-message processing';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

    try {
        const response = await uploadCSVRequest(formData);
        const result = await response.json();

        if (response.ok) {
            console.log(result);
            // Need to add the result to the page

            const count = Array.isArray(result.data) ? result.data.length : 'some';

            statusDiv.innerHTML = `Uploaded ${count} records`;
            statusDiv.className = 'status-message success';

            return result.data; 

        } else {
            console.error('Error:', result.error);
            statusDiv.innerHTML = `Failed to upload file: ${result.error}`;
            statusDiv.className = 'status-message error';
            return null;
        }
    } catch (error) {
        console.error('Error:', error);
        statusDiv.innerHTML = `An error occurred : ${error.message}`;
        statusDiv.className = 'status-message error';
        return null;
    }

}

function previewCSV(csvText) {
    const rightPanel = document.querySelector('.right-panel');
    const shownRows = 20;
    if (!rightPanel) return;

    const rows = csvText.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (rows.length === 0) return;

    // Take header + next 20 rows
    const previewRows = rows.slice(0, shownRows + 1); 
    
    let tableHTML = `
        <h3>CSV Preview</h3>
        <div style="max-height: 500px; overflow-y: auto; overflow-x: auto; border: 1px solid #ddd;">
            <table style="width:100%; border-collapse: collapse; font-size: 0.9rem;">
                <thead style="position: sticky; top: 0; background: #f2f2f2; z-index: 1;">
    `;
    
    previewRows.forEach((row, index) => {
     //   const cells = row.split(','); // Reminder: simple split
        const cells = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // advanced split to handle quotes
        
        if (index === 0) {
            tableHTML += '<tr>';
            cells.forEach(cell => {
                const cellText = cell.replace(/^"|"$/g, ''); 
                tableHTML += `<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${cellText}</th>`;
            });
            tableHTML += '</tr></thead><tbody>'; // Close header, start body
        } else {
            tableHTML += '<tr>';
            cells.forEach(cell => {
                const cellText = cell.replace(/^"|"$/g, ''); 
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${cellText}</td>`;
            });
            tableHTML += '</tr>';
        }
    });
    
    tableHTML += '</tbody></table></div>';
    
    if (rows.length > shownRows) {
        tableHTML += `<p style="text-align: center; color: #666; margin-top: 10px;">Showing first ${shownRows} of ${rows.length - 1} rows.</p>`;
    }

    rightPanel.innerHTML = tableHTML;
}


async function generateImage() {
    const prompt = document.getElementById('avatarPrompt').value;
    const imageContainer = document.getElementById('imagePreviewBox');

    if (!prompt) {
        alert('Please enter a prompt');
        return;
    }

    try {
        imageContainer.innerHTML = 'Generating image...';

        const response = await generateImageRequest(prompt);

        if (!response.ok) {
            throw new Error('Failed to generate image');
        }

        const blob = await response.blob();
        
        const imageUrl = URL.createObjectURL(blob);

        const img = document.getElementById('avatarPreview');
        const txt = document.getElementById('previewText');

        if (img) {
            img.src = imageUrl;
            img.style.display = 'block'; // Make sure it's visible
            if (txt) txt.style.display = 'none'; // Hide text
        } else {
             // Fallback if somehow missing
             imageContainer.innerHTML = `<img id="avatarPreview" src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">`;
        }
        
        document.getElementById('confirmAvatarBtn').disabled = false;

        const confirmImageBtn = document.getElementById('confirmImageBtn');
        if (confirmImageBtn) confirmImageBtn.disabled = false;


    } catch (error) {
        console.error('Error:', error);
        imageContainer.innerHTML = 'Error generating image';
        document.getElementById('confirmAvatarBtn').disabled = true;
        
    }
}

async function generateVideo() {
    // 1. Get Elements using the correct IDs from createQA.html
    const previewImage = document.getElementById('avatarPreview'); // The image inside the modal
    const videoPlayer = document.getElementById('videoPreview');   // The video player in the middle panel
    const videoContainer = document.getElementById('videoPreviewContainer'); // The middle panel div
    const btn = document.getElementById('confirmAvatarBtn');       // The button inside the modal
    const modal = document.getElementById('avatarModal');          // The modal itself

    // 2. Validate Image
    if (!previewImage || previewImage.src === "" || previewImage.style.display === "none") {
        alert("Please generate or upload an image first.");
        return;
    }

    // 3. Set UI to Loading State
    btn.disabled = true;
    btn.innerText = "Generating Video... (Please Wait)";
    
    try {
        // 4. Convert Image Source to Blob
        const imageResponse = await fetch(previewImage.src);
        const imageBlob = await imageResponse.blob();

        // 5. Prepare Form Data
        const formData = new FormData();
        formData.append('image', imageBlob, 'source_image.png');

        // 6. Send Request to Backend
        const response = await generateVideoRequest(formData);
        const result = await response.json();

        if (!response.ok) {
            throw new Error('Video generation failed');
        }

        if (!result.video_url) {
            throw new Error('No video URL returned');
        }

        const videoUrl = result.video_url;
        console.log("Video saved at:", videoUrl);



        // 2. Update Video Player
        videoPlayer.src = `${API_BASE_URL}${videoUrl}`;
        videoContainer.style.display = 'block';
        videoContainer.classList.add('open');
        videoPlayer.style.display = 'block';
        
        // Close Modal and Reset Button
        modal.style.display = "none";
        btn.innerText = "Confirm & Generate Video";
        btn.disabled = false;
        
        // Auto-play
        videoPlayer.play().catch(e => {
            console.error("Auto-play failed:", e);
            videoPlayer.controls = true;
        });

    } catch (error) {
        console.error('Error:', error);
        alert("Failed to generate video. Check console for details.");
        btn.innerText = "Confirm & Generate Video";
        btn.disabled = false;
    }
}

async function confirmImage() {
    const previewImage = document.getElementById('avatarPreview');
    const modal = document.getElementById('avatarModal');
    
    if (!previewImage || previewImage.src === "" || previewImage.style.display === "none") {
        alert("Please generate or upload an image first.");
        return;
    }

    // Display image in the middle panel instead of video
    const middlePanel = document.getElementById('videoPreviewContainer');
    const videoPreview = document.getElementById('videoPreview');
    const promptContainer = document.getElementById('videoPromptContainer');
    const speechSettingsContainer = document.getElementById('speechSettingsContainer');
    
    if (middlePanel) {
        // Create an image element if it doesn't exist, or find it
        let imgPreview = document.getElementById('finalImagePreview');
        if (!imgPreview) {
            imgPreview = document.createElement('img');
            imgPreview.id = 'finalImagePreview';
            imgPreview.style.width = '100%';
            imgPreview.style.height = 'auto';
            imgPreview.style.borderRadius = '8px';
            // Insert before the video player
            middlePanel.insertBefore(imgPreview, videoPreview);
        }
        
        imgPreview.src = previewImage.src;
        imgPreview.style.display = 'block';
        
        // Hide the video player since we are using an image
        if (videoPreview) videoPreview.style.display = 'none'; 

        // Show the prompt container
        if (promptContainer) promptContainer.style.display = 'block';
        if (speechSettingsContainer) speechSettingsContainer.style.display = 'block';
        
        // Show the panel
        middlePanel.style.display = 'flex';
        setTimeout(() => {
             middlePanel.classList.add('open');
        }, 10);
    }

    console.log("Image confirmed:", previewImage.src);
    modal.style.display = "none";
}



function checkMedia() {
    const videoPreview = document.getElementById('videoPreview');
    const imagePreview = document.getElementById('finalImagePreview');
    const mediaFileInput = document.getElementById('mediaFile');
    const mediaFile = mediaFileInput ? mediaFileInput.files[0] : null;

    // 1. Check if user uploaded a video directly
    if (mediaFile) {
        console.log("Using uploaded video file");
        return true;
    }
    // 2. Check if a generated video is present
    if (videoPreview && videoPreview.style.display !== 'none' && videoPreview.src) {
        console.log("Using generated video");
        return true;
    }
    // 3. Check if a generated/confirmed image is present
    if (imagePreview && imagePreview.style.display !== 'none' && imagePreview.src) {
        console.log("Using confirmed image");
        return true;
    }

    return false;
}

async function uploadAvatarImage(title) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.innerHTML = "Uploading avatar image...";
    statusDiv.className = 'status-message processing';

    const imagePreview = document.getElementById('finalImagePreview') || document.getElementById('avatarPreview');
    let imageBlob = null;

    // Check if we have a file from input
    const fileInput = document.getElementById('avatarImageUpload');
    if (fileInput && fileInput.files[0]) {
        imageBlob = fileInput.files[0];
    } else if (imagePreview && imagePreview.src) {
        // Fetch blob from src (blob:http://... or data:...)
        try {
            const res = await fetch(imagePreview.src);
            imageBlob = await res.blob();
        } catch(e) {
            console.error("Failed to fetch image blob", e);
        }
    }

    if (!imageBlob) {
        alert("No avatar image found to upload.");
        return null;
    }

    const formData = new FormData();
    // Ensure filename ends with .png or .jpg based on blob type if possible, default to .png
    const filename = 'avatar.png';
    formData.append('image', imageBlob, filename);
    formData.append('title', title);

    try {
        const response = await fetch(`${API_BASE_URL}/upload-avatar`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (response.ok) {
            console.log("Avatar uploaded:", result.image_path);
            return result.image_path;
        } else {
            console.error("Avatar upload failed:", result.error);
            statusDiv.innerHTML = `Error uploading avatar: ${result.error}`;
            statusDiv.className = 'status-message error';
            return null;
        }
    } catch (e) {
        console.error(e);
        statusDiv.innerHTML = `Error uploading avatar: ${e.message}`;
        statusDiv.className = 'status-message error';
        return null;
    }
}

async function generateAudioTest() {

    let speechSettings = [];
    speechSettings.push(document.getElementById('speechHappy').value);
    speechSettings.push(document.getElementById('speechAngry').value);
    speechSettings.push(document.getElementById('speechSad').value);
    speechSettings.push(document.getElementById('speechSurprised').value);
    speechSettings.push(document.getElementById('speechAfraid').value);
    speechSettings.push(document.getElementById('speechDisgusted').value);
    speechSettings.push(document.getElementById('speechCalm').value);
    speechSettings.push(document.getElementById('speechMelancholic').value);

    const response = await fetch(`${API_BASE_URL}/generate-audio-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speechSettings: speechSettings })
    });
    const result = await response.json();
    console.log(result);

    return result;

}


async function generateAudioForFAQ(faqData) {
    const title = document.getElementById('title').value;
    const statusDiv = document.getElementById('statusMessage');
    const audioOnly = document.getElementById('audioOnly').checked;
    // When audioOnly is on, always generate real audio (never placeholder)
    const usePlaceholders = audioOnly ? false : document.getElementById('usePlaceholders').checked;
    let speechSettings = [];

    speechSettings.push(document.getElementById('speechHappy').value);
    speechSettings.push(document.getElementById('speechAngry').value);
    speechSettings.push(document.getElementById('speechSad').value);
    speechSettings.push(document.getElementById('speechSurprised').value);
    speechSettings.push(document.getElementById('speechAfraid').value);
    speechSettings.push(document.getElementById('speechDisgusted').value);
    speechSettings.push(document.getElementById('speechCalm').value);
    speechSettings.push(document.getElementById('speechMelancholic').value);


    const VARIANT_COUNT = 3;
    let audioResults = [];
    let limit = faqData.length;
    const totalGenerations = limit * VARIANT_COUNT;
    let generationCount = 0;

    for (let i = 0; i < limit; i++) {
        const item = faqData[i];
        const answerText = item.answer; 
        const answerId = item.id;

        let variantUrls = [];

        for (let v = 1; v <= VARIANT_COUNT; v++) {
            if (generationHalted) return audioResults;
            generationCount++;
            const variantId = `${answerId}_${v}`;

            statusDiv.innerHTML = `Generating audio ${generationCount} of ${totalGenerations} (Q${i+1}, variant ${v})...`;
            statusDiv.className = 'status-message processing';

            progress.startOp();
            try {
                const response = await fetch(`${API_BASE_URL}/generate-audio-single`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        text: answerText,
                        title: title,
                        filename_id: variantId,
                        category: 'answers',
                        speechSettings: speechSettings,
                        usePlaceholder: usePlaceholders
                    })
                });
                
                const result = await response.json();
                if (response.ok) {
                    console.log(`Audio generated for Q${i+1} variant ${v} (${variantId}):`, result.audio_url);
                    variantUrls.push({
                        variant: v,
                        audio_url: result.audio_url
                    });
                } else {
                    console.error(`Failed to generate audio for Q${i+1} variant ${v}:`, result.error);
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return audioResults; }
                }
            } catch (e) {
                console.error(`Error processing answer ${i+1} variant ${v}:`, e);
                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return audioResults; }
            }
            progress.completeOp();
        }

        audioResults.push({
            id: answerId,
            variants: variantUrls
        });
    }

    statusDiv.innerHTML = `Audio generated for ${faqData.length} items (${VARIANT_COUNT} variants each).`;
    statusDiv.className = 'status-message success';

    return audioResults;
}

async function generateVideoForFAQ(audioResults) {
    const title = document.getElementById('title').value;
    const statusDiv = document.getElementById('statusMessage');
    const imagePreview = document.getElementById('finalImagePreview') || document.getElementById('avatarPreview');
    const videoPrompt = document.getElementById('videoPrompt').value;
    const audioOnly = document.getElementById('audioOnly').checked;
    // When audioOnly is on, always use placeholder videos
    const usePlaceholders = audioOnly ? true : document.getElementById('usePlaceholders').checked;

    let uploadedImagePath = await uploadAvatarImage(title);
    if (!uploadedImagePath) {
        console.error("Failed to upload avatar image for video generation.");
        return;
    }

    // Generate an idle video first
    if (generationHalted) return;
    statusDiv.innerHTML = `Generating idle video...`;
    statusDiv.className = 'status-message processing';
    progress.startOp();
    try {
        const response = await generateVideoSingleRequest({
            audio_path: '../backend/static/audio/IdleSound.mp3',
            image_path: uploadedImagePath,
            title: title,
            filename_id: `Idle`,
            prompt: "Smiling and looking at the camera, blinking idly.",
            usePlaceholder : usePlaceholders
        });
        const result = await response.json();
        if (response.ok && result.job_id) {
            const videoResult = await waitForVideo(result.job_id);
            if (videoResult.ok) {
                console.log(`Idle video generated:`, videoResult.video_url);
            } else {
                console.error(`Idle video failed:`, videoResult.error);
                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
            }
        } else {
            if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
        }
    } catch (e) {
        console.error(`Error generating idle video:`, e);
        if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
    }
    progress.completeOp();

    const totalGenerations = audioResults.reduce((sum, item) => sum + item.variants.length, 0);
    let generationCount = 0;

    for (let i = 0; i < audioResults.length; i++) {
        const item = audioResults[i];
        const baseId = item.id;

        for (let j = 0; j < item.variants.length; j++) {
            if (generationHalted) return;
            const variant = item.variants[j];
            const variantId = `${baseId}_${variant.variant}`;
            generationCount++;

            statusDiv.innerHTML = `Generating video ${generationCount} of ${totalGenerations} (Q${i+1}, variant ${variant.variant})...`;
            statusDiv.className = 'status-message processing';

            progress.startOp();
            try {
                const response = await generateVideoSingleRequest({ 
                    audio_path: variant.audio_url,
                    image_path: uploadedImagePath,
                    title: title,
                    filename_id: variantId,
                    category: 'answers',
                    prompt: videoPrompt,
                    usePlaceholder: usePlaceholders,
                    audioOnly: audioOnly
                });

                const result = await response.json();
                if (response.ok && result.job_id) {
                    const videoResult = await waitForVideo(result.job_id);
                    if (videoResult.ok) {
                        console.log(`Video generated for (${variantId}):`, videoResult.video_url);
                    } else {
                        console.error(`Failed to generate video for (${variantId}):`, videoResult.error);
                        if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                    }
                } else {
                    console.error(`Failed to start video for (${variantId}):`, result.error);
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                }
            } catch (e) {
                console.error(`Error generating video for ${variantId}:`, e);
                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
            }
            progress.completeOp();
        }
    }

    statusDiv.innerHTML = `FAQ Creation & Video Generation Complete!`;
    statusDiv.className = 'status-message success';
}


async function generateVideoForFAQExtended(audioResults) {
    const title = document.getElementById('title').value;
    const statusDiv = document.getElementById('statusMessage');
    const videoPrompt = document.getElementById('videoPrompt').value;
    const audioOnly = document.getElementById('audioOnly').checked;
    const usePlaceholders = audioOnly ? true : document.getElementById('usePlaceholders').checked;

    let uploadedImagePath = await uploadAvatarImage(title);
    if (!uploadedImagePath) {
        console.error("Failed to upload avatar image for video generation.");
        return;
    }

    // Idle video
    if (generationHalted) return;
    statusDiv.innerHTML = `Generating idle video...`;
    statusDiv.className = 'status-message processing';
    progress.startOp();
    try {
        const response = await generateVideoExtendedRequest({
            audio_path: '../backend/static/audio/IdleSound.mp3',
            image_path: uploadedImagePath,
            title: title,
            filename_id: `Idle`,
            prompt: "Smiling and looking at the camera, blinking idly.",
            usePlaceholder: usePlaceholders
        });
        const result = await response.json();
        if (response.ok && result.job_id) {
            const videoResult = await waitForVideo(result.job_id);
            if (videoResult.ok) {
                console.log(`Idle video generated:`, videoResult.video_url);
            } else {
                console.error(`Idle video failed:`, videoResult.error);
                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
            }
        } else {
            if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
        }
    } catch (e) {
        console.error(`Error generating idle video:`, e);
        if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
    }
    progress.completeOp();

    const totalGenerations = audioResults.reduce((sum, item) => sum + item.variants.length, 0);
    let generationCount = 0;

    for (let i = 0; i < audioResults.length; i++) {
        const item = audioResults[i];
        const baseId = item.id;

        for (let j = 0; j < item.variants.length; j++) {
            if (generationHalted) return;
            const variant = item.variants[j];
            const variantId = `${baseId}_${variant.variant}`;
            generationCount++;

            statusDiv.innerHTML = `Generating video ${generationCount} of ${totalGenerations} (Q${i+1}, variant ${variant.variant})...`;
            statusDiv.className = 'status-message processing';

            progress.startOp();
            try {
                const response = await generateVideoExtendedRequest({
                    audio_path: variant.audio_url,
                    image_path: uploadedImagePath,
                    title: title,
                    filename_id: variantId,
                    category: 'answers',
                    prompt: videoPrompt,
                    usePlaceholder: usePlaceholders,
                    audioOnly: audioOnly
                });

                const result = await response.json();
                if (response.ok && result.job_id) {
                    const videoResult = await waitForVideo(result.job_id);
                    if (videoResult.ok) {
                        console.log(`Video generated for (${variantId}):`, videoResult.video_url);
                    } else {
                        console.error(`Failed to generate video for (${variantId}):`, videoResult.error);
                        if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                    }
                } else {
                    console.error(`Failed to start video for (${variantId}):`, result.error);
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                }
            } catch (e) {
                console.error(`Error generating video for ${variantId}:`, e);
                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
            }
            progress.completeOp();
        }
    }

    statusDiv.innerHTML = `FAQ Creation & Video Generation Complete!`;
    statusDiv.className = 'status-message success';
}


async function generateDefaultCategoryVideos(title) {
    const statusDiv = document.getElementById('statusMessage');
    const audioOnly = document.getElementById('audioOnly').checked;
    const videoPrompt = document.getElementById('videoPrompt').value;
    let speechSettings = [];
    speechSettings.push(document.getElementById('speechHappy').value);
    speechSettings.push(document.getElementById('speechAngry').value);
    speechSettings.push(document.getElementById('speechSad').value);
    speechSettings.push(document.getElementById('speechSurprised').value);
    speechSettings.push(document.getElementById('speechAfraid').value);
    speechSettings.push(document.getElementById('speechDisgusted').value);
    speechSettings.push(document.getElementById('speechCalm').value);
    speechSettings.push(document.getElementById('speechMelancholic').value);

    const VARIANT_COUNT = 3;

    // Fetch default responses from backend
    let defaultResponses;
    try {
        const resp = await fetch(`${API_BASE_URL}/default-responses`);
        defaultResponses = await resp.json();
    } catch (e) {
        console.error("Failed to fetch default responses:", e);
        return;
    }

    // Get the uploaded image path for this topic
    let uploadedImagePath = await uploadAvatarImage(title);
    if (!uploadedImagePath) {
        console.error("Failed to upload avatar image for default category video generation.");
        return;
    }

    // audioOnly: real audio, placeholder video. Otherwise respect the usePlaceholders checkbox.
    const useAudioPlaceholder = audioOnly ? false : document.getElementById('usePlaceholders').checked;
    const useVideoPlaceholder = audioOnly ? true : document.getElementById('usePlaceholders').checked;

    // Generate for each category: rude and no_answer
    const categories = ['rude', 'no_answer'];

    let defaultTotalOps = 0;
    for (const cat of categories) {
        defaultTotalOps += (defaultResponses[cat] || []).length * VARIANT_COUNT * 2;
    }
    progress.addOps(defaultTotalOps);

    for (const category of categories) {
        const texts = defaultResponses[category] || [];
        const totalForCategory = texts.length * VARIANT_COUNT;
        let count = 0;

        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            const baseId = `${category}_${i + 1}`;

            for (let v = 1; v <= VARIANT_COUNT; v++) {
                if (generationHalted) return;
                count++;
                const variantId = `${baseId}_${v}`;

                statusDiv.innerHTML = `Generating ${category} audio ${count} of ${totalForCategory}...`;
                statusDiv.className = 'status-message processing';

                let audioUrl = null;
                progress.startOp();
                try {
                    const audioResp = await fetch(`${API_BASE_URL}/generate-audio-single`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: text,
                            title: title,
                            filename_id: variantId,
                            category: category,
                            speechSettings: speechSettings,
                            usePlaceholder: useAudioPlaceholder
                        })
                    });
                    const audioResult = await audioResp.json();
                    if (audioResp.ok) {
                        audioUrl = audioResult.audio_url;
                        console.log(`${category} audio ${variantId}:`, audioUrl);
                    } else {
                        if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                    }
                } catch (e) {
                    console.error(`Error generating ${category} audio ${variantId}:`, e);
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                }
                progress.completeOp();

                if (generationHalted) return;
                if (audioUrl) {
                    statusDiv.innerHTML = `Generating ${category} video ${count} of ${totalForCategory}...`;

                    progress.startOp();
                    try {
                        const videoResp = await generateVideoSingleRequest({
                            audio_path: audioUrl,
                            image_path: uploadedImagePath,
                            title: title,
                            filename_id: variantId,
                            category: category,
                            prompt: videoPrompt,
                            usePlaceholder: useVideoPlaceholder,
                            audioOnly: audioOnly
                        });
                        const videoResult = await videoResp.json();
                        if (videoResp.ok && videoResult.job_id) {
                            const pollResult = await waitForVideo(videoResult.job_id);
                            if (pollResult.ok) {
                                console.log(`${category} video ${variantId}:`, pollResult.video_url);
                            } else {
                                console.error(`${category} video ${variantId} failed:`, pollResult.error);
                                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                            }
                        } else {
                            if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                        }
                    } catch (e) {
                        console.error(`Error generating ${category} video ${variantId}:`, e);
                        if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                    }
                    progress.completeOp();
                } else {
                    progress.completeOp();
                }
            }
        }
    }

    statusDiv.innerHTML = `Default category videos generated!`;
    statusDiv.className = 'status-message success';
}


async function generateDefaultCategoryVideosExtended(title) {
    const statusDiv = document.getElementById('statusMessage');
    const audioOnly = document.getElementById('audioOnly').checked;
    const videoPrompt = document.getElementById('videoPrompt').value;
    let speechSettings = [];
    speechSettings.push(document.getElementById('speechHappy').value);
    speechSettings.push(document.getElementById('speechAngry').value);
    speechSettings.push(document.getElementById('speechSad').value);
    speechSettings.push(document.getElementById('speechSurprised').value);
    speechSettings.push(document.getElementById('speechAfraid').value);
    speechSettings.push(document.getElementById('speechDisgusted').value);
    speechSettings.push(document.getElementById('speechCalm').value);
    speechSettings.push(document.getElementById('speechMelancholic').value);

    const VARIANT_COUNT = 3;

    let defaultResponses;
    try {
        const resp = await fetch(`${API_BASE_URL}/default-responses`);
        defaultResponses = await resp.json();
    } catch (e) {
        console.error("Failed to fetch default responses:", e);
        return;
    }

    let uploadedImagePath = await uploadAvatarImage(title);
    if (!uploadedImagePath) {
        console.error("Failed to upload avatar image for default category video generation.");
        return;
    }

    const useAudioPlaceholder = audioOnly ? false : document.getElementById('usePlaceholders').checked;
    const useVideoPlaceholder = audioOnly ? true : document.getElementById('usePlaceholders').checked;

    const categories = ['rude', 'no_answer'];

    let defaultTotalOps = 0;
    for (const cat of categories) {
        defaultTotalOps += (defaultResponses[cat] || []).length * VARIANT_COUNT * 2;
    }
    progress.addOps(defaultTotalOps);

    // Phase 1: Generate ALL audios first, collect results
    const audioResults = []; // { category, variantId, audioUrl }

    for (const category of categories) {
        const texts = defaultResponses[category] || [];
        const totalForCategory = texts.length * VARIANT_COUNT;
        let count = 0;

        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            const baseId = `${category}_${i + 1}`;

            for (let v = 1; v <= VARIANT_COUNT; v++) {
                if (generationHalted) return;
                count++;
                const variantId = `${baseId}_${v}`;

                statusDiv.innerHTML = `Generating ${category} audio ${count} of ${totalForCategory}...`;
                statusDiv.className = 'status-message processing';

                progress.startOp();
                try {
                    const audioResp = await fetch(`${API_BASE_URL}/generate-audio-single`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: text,
                            title: title,
                            filename_id: variantId,
                            category: category,
                            speechSettings: speechSettings,
                            usePlaceholder: useAudioPlaceholder
                        })
                    });
                    const audioResult = await audioResp.json();
                    if (audioResp.ok) {
                        console.log(`${category} audio ${variantId}:`, audioResult.audio_url);
                        audioResults.push({ category, variantId, audioUrl: audioResult.audio_url });
                    } else {
                        if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                    }
                } catch (e) {
                    console.error(`Error generating ${category} audio ${variantId}:`, e);
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                }
                progress.completeOp();
            }
        }
    }

    // Phase 2: Generate ALL videos from collected audio results
    const totalVideos = audioResults.length;

    for (let idx = 0; idx < audioResults.length; idx++) {
        if (generationHalted) return;
        const { category, variantId, audioUrl } = audioResults[idx];

        statusDiv.innerHTML = `Generating ${category} video ${idx + 1} of ${totalVideos}...`;
        statusDiv.className = 'status-message processing';

        progress.startOp();
        try {
            const videoResp = await generateVideoExtendedRequest({
                audio_path: audioUrl,
                image_path: uploadedImagePath,
                title: title,
                filename_id: variantId,
                category: category,
                prompt: videoPrompt,
                usePlaceholder: useVideoPlaceholder,
                audioOnly: audioOnly
            });
            const videoResult = await videoResp.json();
            if (videoResp.ok && videoResult.job_id) {
                const pollResult = await waitForVideo(videoResult.job_id);
                if (pollResult.ok) {
                    console.log(`${category} video ${variantId}:`, pollResult.video_url);
                } else {
                    console.error(`${category} video ${variantId} failed:`, pollResult.error);
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                }
            } else {
                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
            }
        } catch (e) {
            console.error(`Error generating ${category} video ${variantId}:`, e);
            if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
        }
        progress.completeOp();
    }

    statusDiv.innerHTML = `Default category videos generated!`;
    statusDiv.className = 'status-message success';
}


async function generateConversationalVideos(title) {
    const statusDiv = document.getElementById('statusMessage');
    const audioOnly = document.getElementById('audioOnly').checked;
    const videoPrompt = document.getElementById('videoPrompt').value;
    let speechSettings = [];
    speechSettings.push(document.getElementById('speechHappy').value);
    speechSettings.push(document.getElementById('speechAngry').value);
    speechSettings.push(document.getElementById('speechSad').value);
    speechSettings.push(document.getElementById('speechSurprised').value);
    speechSettings.push(document.getElementById('speechAfraid').value);
    speechSettings.push(document.getElementById('speechDisgusted').value);
    speechSettings.push(document.getElementById('speechCalm').value);
    speechSettings.push(document.getElementById('speechMelancholic').value);

    const VARIANT_COUNT = 3;

    // 1. Load conversational CSV into vector DB for this title
    statusDiv.innerHTML = 'Loading conversational data...';
    statusDiv.className = 'status-message processing';

    let convData;
    try {
        const resp = await fetch(`${API_BASE_URL}/load-conversational`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title })
        });
        const result = await resp.json();
        if (!resp.ok) {
            console.error("Failed to load conversational data:", result.error);
            return;
        }
        convData = result.data;
    } catch (e) {
        console.error("Failed to load conversational data:", e);
        return;
    }

    if (!convData || convData.length === 0) {
        console.warn("No conversational data found.");
        return;
    }

    // Get the uploaded image path for this topic
    let uploadedImagePath = await uploadAvatarImage(title);
    if (!uploadedImagePath) {
        console.error("Failed to upload avatar image for conversational video generation.");
        return;
    }

    const category = 'conversational';
    const totalGenerations = convData.length * VARIANT_COUNT;
    let count = 0;

    progress.addOps(convData.length * VARIANT_COUNT * 2);

    for (let i = 0; i < convData.length; i++) {
        const item = convData[i];
        const text = item.answer;
        const answerId = item.id;

        for (let v = 1; v <= VARIANT_COUNT; v++) {
            if (generationHalted) return;
            count++;
            const variantId = `${answerId}_${v}`;

            const useAudioPlaceholder = audioOnly ? false : document.getElementById('usePlaceholders').checked;
            const useVideoPlaceholder = audioOnly ? true : document.getElementById('usePlaceholders').checked;

            statusDiv.innerHTML = `Generating conversational audio ${count} of ${totalGenerations}...`;
            statusDiv.className = 'status-message processing';

            let audioUrl = null;
            progress.startOp();
            try {
                const audioResp = await fetch(`${API_BASE_URL}/generate-audio-single`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: text,
                        title: title,
                        filename_id: variantId,
                        category: category,
                        speechSettings: speechSettings,
                        usePlaceholder: useAudioPlaceholder
                    })
                });
                const audioResult = await audioResp.json();
                if (audioResp.ok) {
                    audioUrl = audioResult.audio_url;
                    console.log(`Conversational audio ${variantId}:`, audioUrl);
                } else {
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                }
            } catch (e) {
                console.error(`Error generating conversational audio ${variantId}:`, e);
                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
            }
            progress.completeOp();

            if (generationHalted) return;
            if (audioUrl) {
                statusDiv.innerHTML = `Generating conversational video ${count} of ${totalGenerations}...`;

                progress.startOp();
                try {
                    const videoResp = await generateVideoSingleRequest({
                        audio_path: audioUrl,
                        image_path: uploadedImagePath,
                        title: title,
                        filename_id: variantId,
                        category: category,
                        prompt: videoPrompt,
                        usePlaceholder: useVideoPlaceholder,
                        audioOnly: audioOnly
                    });
                    const videoResult = await videoResp.json();
                    if (videoResp.ok && videoResult.job_id) {
                        const pollResult = await waitForVideo(videoResult.job_id);
                        if (pollResult.ok) {
                            console.log(`Conversational video ${variantId}:`, pollResult.video_url);
                        } else {
                            console.error(`Conversational video ${variantId} failed:`, pollResult.error);
                            if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                        }
                    } else {
                        if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                    }
                } catch (e) {
                    console.error(`Error generating conversational video ${variantId}:`, e);
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                }
                progress.completeOp();
            } else {
                progress.completeOp();
            }
        }
    }

    statusDiv.innerHTML = 'Conversational videos generated!';
    statusDiv.className = 'status-message success';
}


async function generateConversationalVideosExtended(title) {
    const statusDiv = document.getElementById('statusMessage');
    const audioOnly = document.getElementById('audioOnly').checked;
    const videoPrompt = document.getElementById('videoPrompt').value;
    let speechSettings = [];
    speechSettings.push(document.getElementById('speechHappy').value);
    speechSettings.push(document.getElementById('speechAngry').value);
    speechSettings.push(document.getElementById('speechSad').value);
    speechSettings.push(document.getElementById('speechSurprised').value);
    speechSettings.push(document.getElementById('speechAfraid').value);
    speechSettings.push(document.getElementById('speechDisgusted').value);
    speechSettings.push(document.getElementById('speechCalm').value);
    speechSettings.push(document.getElementById('speechMelancholic').value);

    const VARIANT_COUNT = 3;

    statusDiv.innerHTML = 'Loading conversational data...';
    statusDiv.className = 'status-message processing';

    let convData;
    try {
        const resp = await fetch(`${API_BASE_URL}/load-conversational`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title })
        });
        const result = await resp.json();
        if (!resp.ok) {
            console.error("Failed to load conversational data:", result.error);
            return;
        }
        convData = result.data;
    } catch (e) {
        console.error("Failed to load conversational data:", e);
        return;
    }

    if (!convData || convData.length === 0) {
        console.warn("No conversational data found.");
        return;
    }

    let uploadedImagePath = await uploadAvatarImage(title);
    if (!uploadedImagePath) {
        console.error("Failed to upload avatar image for conversational video generation.");
        return;
    }

    const category = 'conversational';
    const useAudioPlaceholder = audioOnly ? false : document.getElementById('usePlaceholders').checked;
    const useVideoPlaceholder = audioOnly ? true : document.getElementById('usePlaceholders').checked;
    const totalGenerations = convData.length * VARIANT_COUNT;

    progress.addOps(convData.length * VARIANT_COUNT * 2);

    // Phase 1: Generate ALL conversational audios first, collect results
    const audioResults = []; // { variantId, audioUrl }
    let audioCount = 0;

    for (let i = 0; i < convData.length; i++) {
        const item = convData[i];
        const text = item.answer;
        const answerId = item.id;

        for (let v = 1; v <= VARIANT_COUNT; v++) {
            if (generationHalted) return;
            audioCount++;
            const variantId = `${answerId}_${v}`;

            statusDiv.innerHTML = `Generating conversational audio ${audioCount} of ${totalGenerations}...`;
            statusDiv.className = 'status-message processing';

            progress.startOp();
            try {
                const audioResp = await fetch(`${API_BASE_URL}/generate-audio-single`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: text,
                        title: title,
                        filename_id: variantId,
                        category: category,
                        speechSettings: speechSettings,
                        usePlaceholder: useAudioPlaceholder
                    })
                });
                const audioResult = await audioResp.json();
                if (audioResp.ok) {
                    console.log(`Conversational audio ${variantId}:`, audioResult.audio_url);
                    audioResults.push({ variantId, audioUrl: audioResult.audio_url });
                } else {
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                }
            } catch (e) {
                console.error(`Error generating conversational audio ${variantId}:`, e);
                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
            }
            progress.completeOp();
        }
    }

    // Phase 2: Generate ALL conversational videos from collected audio results
    const totalVideos = audioResults.length;

    for (let idx = 0; idx < audioResults.length; idx++) {
        if (generationHalted) return;
        const { variantId, audioUrl } = audioResults[idx];

        statusDiv.innerHTML = `Generating conversational video ${idx + 1} of ${totalVideos}...`;
        statusDiv.className = 'status-message processing';

        progress.startOp();
        try {
            const videoResp = await generateVideoExtendedRequest({
                audio_path: audioUrl,
                image_path: uploadedImagePath,
                title: title,
                filename_id: variantId,
                category: category,
                prompt: videoPrompt,
                usePlaceholder: useVideoPlaceholder,
                audioOnly: audioOnly
            });
            const videoResult = await videoResp.json();
            if (videoResp.ok && videoResult.job_id) {
                const pollResult = await waitForVideo(videoResult.job_id);
                if (pollResult.ok) {
                    console.log(`Conversational video ${variantId}:`, pollResult.video_url);
                } else {
                    console.error(`Conversational video ${variantId} failed:`, pollResult.error);
                    if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
                }
            } else {
                if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
            }
        } catch (e) {
            console.error(`Error generating conversational video ${variantId}:`, e);
            if (!(await checkComfyHealth())) { haltGeneration('ComfyUI service is not responding'); return; }
        }
        progress.completeOp();
    }

    statusDiv.innerHTML = 'Conversational videos generated!';
    statusDiv.className = 'status-message success';
}


async function createFAQ() {
    if (!checkMedia()) {
        alert("Please upload a video or generate an avatar image/video.");
        return; 
    }
    
    const faqData = await uploadCSV();
    
    if (!faqData || faqData.length === 0) {
        console.error("No FAQ data returned or upload failed.");
        return;
    }

    const title = document.getElementById('title').value;
    const VARIANT_COUNT = 3;

    generationHalted = false;
    progress.reset();
    const faqAudioOps = faqData.length * VARIANT_COUNT;
    const faqVideoOps = faqData.length * VARIANT_COUNT + 1;
    progress.addOps(faqAudioOps + faqVideoOps);

    let audioResults = await generateAudioForFAQ(faqData);
    if (generationHalted) return;
    if (!audioResults || audioResults.length === 0) {
        console.error("No audio results returned or generation failed.");
        progress.hide();
        return;
    }



   // await generateVideoForFAQ(audioResults);

    await generateVideoForFAQExtended(audioResults);
    if (generationHalted) return;

    //await generateDefaultCategoryVideos(title);

    await generateDefaultCategoryVideosExtended(title);
    if (generationHalted) return;

    await generateConversationalVideosExtended(title);
    if (generationHalted) return;

   // await generateConversationalVideos(title);

    statusDiv.innerHTML = 'All generation complete!';
    statusDiv.className = 'status-message success';
    console.log("FAQ Creation Complete");
}

async function downloadProjectData() {
    const btn = document.querySelector('.download-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Preparing...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/download-project`);
        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'InteractiveAvatar_Data.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Download error:', e);
        alert('Failed to download project data: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Download';
        }
    }
}

