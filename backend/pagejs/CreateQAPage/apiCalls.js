const API_BASE_URL = 'http://127.0.0.1:5000';

async function uploadCSVRequest(formData) {
    return await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
    });
}

async function generateImageRequest(prompt) {
    return await fetch(`${API_BASE_URL}/generateImage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: prompt })
    });
}


// This is the old endpoint for generating video do not use
async function generateVideoRequest(formData) {
    return await fetch(`${API_BASE_URL}/generate-video`, {
        method: 'POST',
        body: formData
    });
}

async function generateVideoSingleRequest(data) {
    return await fetch(`${API_BASE_URL}/generate-video-single`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
}

