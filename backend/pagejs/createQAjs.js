const statusDiv = document.getElementById('statusMessage');

document.addEventListener('DOMContentLoaded', function() {

    //modal 
    const modal = document.getElementById('avatarModal');
    const button = document.getElementById('generateVideoBtn');
    const span = document.getElementsByClassName('close-modal')[0];

    button.onclick = function() {
        modal.style.display = 'block';
    }

    span.onclick = function() {
        modal.style.display = 'none';
    }

    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    }

    const uploadInput = document.getElementById('avatarImageUpload');
    const previewBox = document.getElementById('imagePreviewBox');
    const previewImg = document.getElementById('avatarPreview');
    const previewText = document.getElementById('previewText');

    if(uploadInput) {
        uploadInput.addEventListener('change', function(e) {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    previewImg.src = e.target.result;
                    previewImg.style.display = 'block';
                    previewText.style.display = 'none';
                }
                reader.readAsDataURL(this.files[0]);
            }
        });

    }

});



function updateLabel(inputId, defaultText) {
    const input = document.getElementById(inputId);
    const label = document.querySelector(`label[for="${inputId}"].upload-label`);
    const removeBtn = document.getElementById(inputId === 'csvFile' ? 'csvFileRemoveBtn' : 'mediaFileRemoveBtn');

    if (!input || !label) return;

    input.addEventListener('change', function() {
        if (this.files && this.files.length > 0) {
            label.innerHTML = this.files[0].name;
            removeBtn.style.display = 'block';

            if (inputId === 'csvFile') {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const text = e.target.result;
                    // Split by new line and filter out empty lines
                    const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
                    // Subtract 1 for header row if you assume there is one
                    const count = lines.length > 0 ? lines.length - 1 : 0; 
                    
                    statusDiv.innerHTML = `Selected file has ${count} records ready to upload.`;
                    statusDiv.className = 'status-message processing'; // Or a new 'info' class
                };
                reader.onerror = function() {
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



    removeBtn.addEventListener('click', function(e) {
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
        const response = await fetch('http://127.0.0.1:5000/upload' , {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (response.ok) {
            console.log(result);
            // Need to add the result to the page

            const count = Array.isArray(result.data) ? result.data.length : 'some';

            statusDiv.innerHTML = `Uploaded ${count} records`;
            statusDiv.className = 'status-message success';

        } else {
            console.error('Error:', result.error);
            statusDiv.innerHTML = `Failed to upload file: ${result.error}`;
            statusDiv.className = 'status-message error';
        }
    } catch (error) {
        console.error('Error:', error);
        statusDiv.innerHTML = `An error occurred : ${error.message}`;
        statusDiv.className = 'status-message error';
    }

}


async function createFAQ() {
    //Check if user has uploaded a csv file
    await uploadCSV();

    //Check if user has typed in their questions

    //Reference media 



}