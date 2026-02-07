const statusDiv = document.getElementById('statusMessage');
let counter = 1;

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
        videoPlayer.src = `http://127.0.0.1:5000${videoUrl}`;
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
    const mediaFile = document.getElementById('mediaFile').files[0];

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
        const response = await fetch('http://127.0.0.1:5000/upload-avatar', {
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


async function generateAudioForFAQ(faqData) {
    const title = document.getElementById('title').value;
    const statusDiv = document.getElementById('statusMessage');
    let audioResults = [];
    let limit = faqData.length;

    for (let i = 0; i < limit; i++) {
        const item = faqData[i];
        const answerText = item.answer; 
        const answerId = item.id; // Get the UUID from the response

        statusDiv.innerHTML = `Generating audio for answer ${i + 1} of ${limit}...`;
        statusDiv.className = 'status-message processing';

        try {
            // Call the new single audio endpoint
            const response = await fetch('http://127.0.0.1:5000/generate-audio-single', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: answerText,
                    title: title,
                    filename_id: answerId // Use the ID as the filename
                })
            });
            
            const result = await response.json();
            if (response.ok) {
                console.log(`Audio generated for Q${i+1} (${answerId}):`, result.audio_url);
                audioResults.push({
                    id: answerId,
                    audio_url: result.audio_url
                });

            } else {
                console.error(`Failed to generate audio for Q${i+1}:`, result.error);
            }

        } catch (e) {
             console.error(`Error processing answer ${i+1}:`, e);
        }
    }

    statusDiv.innerHTML = `FAQ Created Successfully! Audio generated for ${faqData.length} items.`;
    statusDiv.className = 'status-message success';

    return audioResults;
}

async function generateVideoForFAQ(audioResults) {
    const title = document.getElementById('title').value;
    const statusDiv = document.getElementById('statusMessage');
    const imagePreview = document.getElementById('finalImagePreview') || document.getElementById('avatarPreview');
    const videoPrompt = document.getElementById('videoPrompt').value;

    let uploadedImagePath = await uploadAvatarImage(title);
    if (!uploadedImagePath) {
        console.error("Failed to upload avatar image for video generation.");
        return;
    }

    // Generate an idle video first
    try {
        const response = await generateVideoSingleRequest({
            audio_path: '../backend/static/audio/IdleSound.mp3',
            image_path: uploadedImagePath,
            title: title,
            filename_id: `Idle`,
            prompt: "Smiling and looking at the camera, blinking idly."
        });
        const result = await response.json();
        if (response.ok) {
            console.log(`Idle video generated:`, result.video_url);
        }
    } catch (e) {
        console.error(`Error generating idle video:`, e);
    }
    

    for (let i = 0; i < audioResults.length; i++) {
        const item = audioResults[i];
        const audioPath = item.audio_url; 
        const filenameId = item.id;

        statusDiv.innerHTML = `Generating video for answer ${i + 1} of ${audioResults.length}...`;
        statusDiv.className = 'status-message processing';

        try {
            // Use the new apiCall function
            const response = await generateVideoSingleRequest({ 
                audio_path: audioPath,
                image_path: uploadedImagePath,
                title: title,
                filename_id: filenameId,
                prompt: videoPrompt
            });

            const result = await response.json();
            if (response.ok) {
                console.log(`Video generated for (${filenameId}):`, result.video_url);
            } else {
                console.error(`Failed to generate video for (${filenameId}):`, result.error);
            }

        } catch (e) {
            console.error(`Error generating video for ${filenameId}:`, e);
        }
    }

    statusDiv.innerHTML = `FAQ Creation & Video Generation Complete!`;
    statusDiv.className = 'status-message success';
}


async function createFAQ() {
    //Check if user has uploaded a csv file, and does api request to create FAQ
  //  await uploadCSV();

    //Reference media 
    
    if (!checkMedia()) {
        alert("Please upload a video or generate an avatar image/video.");
        return; 
    }
    
    // Get FAQ data from csv
    const faqData = await uploadCSV();
    
    if (!faqData || faqData.length === 0) {
        console.error("No FAQ data returned or upload failed.");
        return;
    }

    
    // 3. Generate Audio for each Answer
    let audioResults = await generateAudioForFAQ(faqData);
    if (!audioResults || audioResults.length === 0) {
        console.error("No audio results returned or generation failed.");
        return;
    }

    // 4. Generate Video for each Answer
    await generateVideoForFAQ(audioResults);
    
    
    console.log("FAQ Creation Complete");
}


