const API_BASE_URL = window.location.origin;
let allTitles = [];
let currentOtherCategoryItems = [];
let currentOtherCategoryTitle = '';
let modifiedAnswers = {}; // id -> { question, answer } for edit tracking

const OTHER_CATEGORY_LABELS = { conversational: 'Conversational', rude: 'Rude', no_answer: 'No answer' };

document.addEventListener('DOMContentLoaded', () => {
    fetchTitles();
    setupSearch();
    setupDelete();
    setupResume();
    setupOtherCategoryFilter();
    setupAddFaq();
    resumeProgress.restore();
});

function getCurrentTitle() {
    return document.getElementById('topicSearch') && document.getElementById('topicSearch').value.trim();
}

function createInfoIcon(tooltipText) {
    const span = document.createElement('span');
    span.className = 'info-icon';
    span.setAttribute('data-tooltip', tooltipText);
    span.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    return span;
}

function wrapButtonWithTooltip(button, tooltipText) {
    const wrapper = document.createElement('span');
    wrapper.className = 'btn-with-tooltip';
    wrapper.appendChild(button);
    wrapper.appendChild(createInfoIcon(tooltipText));
    return wrapper;
}

function setupAddFaq() {
    const addBtn = document.getElementById('addFaqBtn');
    const section = document.getElementById('addFaqSection');
    const cancelBtn = document.getElementById('addFaqCancelBtn');
    const submitBtn = document.getElementById('addFaqSubmitBtn');
    const addQuestion = document.getElementById('addQuestion');
    const addAnswer = document.getElementById('addAnswer');
    if (!addBtn || !section || !cancelBtn || !submitBtn) return;

    addBtn.addEventListener('click', () => {
        if (!getCurrentTitle()) {
            alert('Please select a topic first.');
            return;
        }
        addQuestion.value = '';
        addAnswer.value = '';
        section.style.display = 'block';
    });
    cancelBtn.addEventListener('click', () => {
        section.style.display = 'none';
    });
    submitBtn.addEventListener('click', async () => {
        const title = getCurrentTitle();
        if (!title) return;
        const question = addQuestion.value.trim();
        const answer = addAnswer.value.trim();
        if (!question || !answer) {
            alert('Please enter both question and answer.');
            return;
        }
        if (!currentAvatarPath) {
            alert('No avatar image found for this topic. Please upload one first.');
            return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';
        try {
            const res = await fetch(`${API_BASE_URL}/faq-answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, question, answer })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to add');
            const faq = data.data;
            const statusEl = document.createElement('div');
            statusEl.id = 'addFaqStatus';
            statusEl.className = 'add-faq-status';
            section.appendChild(statusEl);
            const setStatus = (msg) => { const e = document.getElementById('addFaqStatus'); if (e) e.textContent = msg; };
            setStatus('Generating audio and video (1/3)...');
            await generateThreeVariantsForAnswer(faq.id, title, answer, setStatus);
            setStatus('Done.');
            section.style.display = 'none';
            await loadFAQs(title);
        } catch (e) {
            alert(e.message || 'Failed to add question-answer.');
        } finally {
            const el = document.getElementById('addFaqStatus');
            if (el) el.remove();
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add and generate';
        }
    });
}

async function generateThreeVariantsForAnswer(baseId, title, answerText, setStatus) {
    const prompt = document.getElementById('videoPrompt') && document.getElementById('videoPrompt').value.trim() || 'talking head';
    for (let v = 1; v <= 3; v++) {
        if (setStatus) setStatus(`Generating variant ${v}/3...`);
        const filenameId = `${baseId}_${v}`;
        const audioRes = await fetch(`${API_BASE_URL}/generate-audio-single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: answerText, title, filename_id: filenameId, category: 'answers' })
        });
        const audioData = await audioRes.json();
        if (!audioRes.ok) throw new Error(audioData.error || 'Audio failed');
        const videoRes = await fetch(`${API_BASE_URL}/generate-video-extended`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio_path: audioData.audio_url,
                image_path: currentAvatarPath,
                title,
                filename_id: filenameId,
                category: 'answers',
                prompt
            })
        });
        const videoData = await videoRes.json();
        if (!videoRes.ok) throw new Error(videoData.error || 'Video failed');
        const jobId = videoData.job_id;
        await new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
                try {
                    const pr = await fetch(`${API_BASE_URL}/progress/${jobId}`);
                    const pd = await pr.json();
                    if (pd.status === 'completed') { clearInterval(interval); resolve(); }
                    else if (pd.status === 'failed') { clearInterval(interval); reject(new Error(pd.error)); }
                } catch (e) { clearInterval(interval); reject(e); }
            }, 2000);
        });
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
    const addSection = document.getElementById('addFaqSection');
    if (addSection) addSection.style.display = 'none';
    modifiedAnswers = {};

    document.getElementById('managementControls').style.display = 'block';
    const toolbar = document.getElementById('faqTableToolbar');
    if (toolbar) toolbar.style.display = 'block';
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
                const toolbar = document.getElementById('faqTableToolbar');
                if (toolbar) toolbar.style.display = 'none';
                document.querySelector('#faqTable tbody').innerHTML = '<tr><td colspan="4">Select a topic to view or delete...</td></tr>';
                setOtherCategoriesPlaceholder('Select a topic to view other category videos.');
                currentOtherCategoryItems = [];
                hideOtherCategoryFilter();
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

function setOtherCategoriesPlaceholder(text) {
    const el = document.getElementById('otherCategoriesContent');
    if (el) el.innerHTML = `<p class="other-categories-placeholder">${text}</p>`;
}

async function loadFAQs(title) {
    const tbody = document.querySelector('#faqTable tbody');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    setOtherCategoriesPlaceholder('Loading...');

    try {
        const encodedTitle = encodeURIComponent(title);
        
        const responses = await Promise.all([
            fetch(`${API_BASE_URL}/faqs?title=${encodedTitle}`),
            fetch(`${API_BASE_URL}/get-videos?title=${encodedTitle}&category=answers`),
            fetch(`${API_BASE_URL}/get-videos?title=${encodedTitle}&category=conversational`),
            fetch(`${API_BASE_URL}/get-avatar?title=${encodedTitle}`),
            fetch(`${API_BASE_URL}/default-responses`),
            fetch(`${API_BASE_URL}/get-videos?title=${encodedTitle}&category=rude`),
            fetch(`${API_BASE_URL}/get-videos?title=${encodedTitle}&category=no_answer`)
        ]);

        for (let i = 0; i < 4; i++) {
            const res = responses[i];
            if (!res.ok) {
                console.error(`Fetch failed for ${res.url}: ${res.status} ${res.statusText}`);
                const text = await res.text();
                console.error("Response body:", text);
                throw new Error(`API Error: ${res.status} from ${res.url}`);
            }
        }

        const faqResult = await responses[0].json();
        const answersVideos = (await responses[1].json()).data || [];
        const conversationalVideos = (await responses[2].json()).data || [];
        const avatarResult = await responses[3].json();
        let defaultResponses = { rude: [], no_answer: [] };
        try {
            const drRes = await responses[4].json();
            if (responses[4].ok && drRes) defaultResponses = drRes;
        } catch (_) { /* use empty */ }
        const rudeVideos = (await responses[5].json()).data || [];
        const noAnswerVideos = (await responses[6].json()).data || [];

        if (faqResult.message === 'Fetched successfully' || faqResult.data) {
            currentAvatarPath = avatarResult.avatar_path || null;
            
            const avatarImg = document.getElementById('topicAvatar');
            if (currentAvatarPath) {
                avatarImg.src = `${API_BASE_URL}/${currentAvatarPath}`;
            } else {
                avatarImg.src = ""; 
            }

            const faqs = faqResult.data || [];
            const videosByCategory = {
                answers: answersVideos,
                conversational: conversationalVideos,
                rude: rudeVideos,
                no_answer: noAnswerVideos
            };

            const answersFaqs = [];
            const otherFaqs = [];
            faqs.forEach(faq => {
                const category = faq.category || 'answers';
                const videoList = videosByCategory[category] || [];
                const variants = [];
                for (let v = 1; v <= 3; v++) {
                    if (videoList.includes(`${faq.id}_${v}.mp4`)) {
                        variants.push(v);
                    }
                }
                faq.variants = variants;
                faq.has_video = variants.length > 0;
                if (category === 'answers') {
                    answersFaqs.push(faq);
                } else {
                    otherFaqs.push(faq);
                }
            });

            // Build rude items from defaultResponses (id format: rude_1, rude_2, ...; videos: rude_1_1.mp4, ...)
            (defaultResponses.rude || []).forEach((text, i) => {
                const baseId = `rude_${i + 1}`;
                const variants = [];
                for (let v = 1; v <= 3; v++) {
                    if (rudeVideos.includes(`${baseId}_${v}.mp4`)) variants.push(v);
                }
                otherFaqs.push({
                    id: baseId,
                    question: `Rude #${i + 1}`,
                    answer: text,
                    title,
                    category: 'rude',
                    variants,
                    has_video: variants.length > 0
                });
            });

            // Build no_answer items (id format: no_answer_1, ...; videos: no_answer_1_1.mp4, ...)
            (defaultResponses.no_answer || []).forEach((text, i) => {
                const baseId = `no_answer_${i + 1}`;
                const variants = [];
                for (let v = 1; v <= 3; v++) {
                    if (noAnswerVideos.includes(`${baseId}_${v}.mp4`)) variants.push(v);
                }
                otherFaqs.push({
                    id: baseId,
                    question: `No answer #${i + 1}`,
                    answer: text,
                    title,
                    category: 'no_answer',
                    variants,
                    has_video: variants.length > 0
                });
            });

            populateFAQTable(answersFaqs);
            currentOtherCategoryItems = otherFaqs;
            currentOtherCategoryTitle = title;
            populateOtherCategoryFilter(otherFaqs);
            applyOtherCategoryFilter();
        } else {
            tbody.innerHTML = '<tr><td colspan="4">No FAQs found.</td></tr>';
            setOtherCategoriesPlaceholder('No other category items for this topic.');
            currentOtherCategoryItems = [];
            hideOtherCategoryFilter();
        }

    } catch (error) {
        console.error("Critical error loading FAQs:", error);
        tbody.innerHTML = `<tr><td colspan="4" style="color: red;">Error: ${error.message}</td></tr>`;
        setOtherCategoriesPlaceholder('Select a topic to view other category videos.');
        currentOtherCategoryItems = [];
        hideOtherCategoryFilter();
    }
}

function setupOtherCategoryFilter() {
    const sel = document.getElementById('otherCategoryFilter');
    if (!sel) return;
    sel.addEventListener('change', () => applyOtherCategoryFilter());
}

function populateOtherCategoryFilter(items) {
    const sel = document.getElementById('otherCategoryFilter');
    if (!sel) return;
    const categories = [...new Set((items || []).map(item => item.category).filter(Boolean))].sort();
    sel.innerHTML = '<option value="all">All</option>';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = OTHER_CATEGORY_LABELS[cat] || cat;
        sel.appendChild(opt);
    });
    sel.value = 'all';
    sel.style.display = categories.length > 0 ? 'block' : 'none';
}

function hideOtherCategoryFilter() {
    const sel = document.getElementById('otherCategoryFilter');
    if (sel) {
        sel.style.display = 'none';
        sel.innerHTML = '<option value="all">All</option>';
    }
}

function applyOtherCategoryFilter() {
    const sel = document.getElementById('otherCategoryFilter');
    const value = sel ? sel.value : 'all';
    const filtered = value === 'all'
        ? currentOtherCategoryItems
        : currentOtherCategoryItems.filter(item => item.category === value);
    populateOtherCategoriesPanel(filtered, currentOtherCategoryTitle);
}

function populateFAQTable(faqs) {
    const tbody = document.querySelector('#faqTable tbody');
    tbody.innerHTML = '';
    modifiedAnswers = {};

    if (!faqs || faqs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">No FAQs found for this topic.</td></tr>';
        return;
    }

    faqs.forEach(faq => {
        const row = document.createElement('tr');
        row.dataset.faqId = faq.id;

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
            const controls = document.createElement('div');
            controls.className = 'carousel-controls';
            const label = document.createElement('span');
            label.className = 'carousel-label';
            label.textContent = `1 of ${faq.variants.length}`;
            let currentIdx = 0;
            function updateVariant() {
                const v = faq.variants[currentIdx];
                video.src = `${API_BASE_URL}/static/videos/${encodedTitle}/answers/${faq.id}_${v}.mp4`;
                label.textContent = `${currentIdx + 1} of ${faq.variants.length}`;
            }
            if (faq.variants.length > 1) {
                const prevBtn = document.createElement('button');
                prevBtn.className = 'carousel-arrow';
                prevBtn.innerHTML = '&#8249;';
                const nextBtn = document.createElement('button');
                nextBtn.className = 'carousel-arrow';
                nextBtn.innerHTML = '&#8250;';
                prevBtn.onclick = () => { currentIdx = (currentIdx - 1 + faq.variants.length) % faq.variants.length; updateVariant(); };
                nextBtn.onclick = () => { currentIdx = (currentIdx + 1) % faq.variants.length; updateVariant(); };
                controls.appendChild(prevBtn);
                controls.appendChild(label);
                controls.appendChild(nextBtn);
            } else {
                controls.appendChild(label);
            }
            carousel.appendChild(controls);
            vCell.appendChild(carousel);
        } else {
            const noVideos = document.createElement('span');
            noVideos.className = 'no-videos-label';
            noVideos.textContent = 'No videos';
            vCell.appendChild(noVideos);
        }

        const actionsCell = document.createElement('td');
        actionsCell.className = 'faq-actions-cell';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'edit-faq-btn';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => enterEditMode(row, faq);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-faq-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteFaqRow(faq);
        actionsCell.appendChild(wrapButtonWithTooltip(editBtn, 'Edit this question and answer; save will regenerate all 3 video variants'));
        actionsCell.appendChild(wrapButtonWithTooltip(deleteBtn, 'Delete this answer and its videos'));

        row.appendChild(qCell);
        row.appendChild(aCell);
        row.appendChild(vCell);
        row.appendChild(actionsCell);
        tbody.appendChild(row);
    });
}

function enterEditMode(row, faq) {
    const qCell = row.querySelector('td:nth-child(1)');
    const aCell = row.querySelector('td:nth-child(2)');
    const vCell = row.querySelector('td:nth-child(3)');
    const actionsCell = row.querySelector('td:nth-child(4)');
    const origQ = faq.question;
    const origA = faq.answer;
    qCell.innerHTML = '';
    const qInput = document.createElement('textarea');
    qInput.rows = 2;
    qInput.value = origQ;
    qInput.className = 'edit-faq-input';
    qCell.appendChild(qInput);
    aCell.innerHTML = '';
    const aInput = document.createElement('textarea');
    aInput.rows = 3;
    aInput.value = origA;
    aInput.className = 'edit-faq-input';
    aCell.appendChild(aInput);
    actionsCell.innerHTML = '';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'save-faq-btn';
    saveBtn.textContent = 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel-faq-btn';
    cancelBtn.textContent = 'Cancel';
    saveBtn.onclick = async () => {
        const question = qInput.value.trim();
        const answer = aInput.value.trim();
        if (!question || !answer) { alert('Question and answer cannot be empty.'); return; }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        const title = faq.title || getCurrentTitle();
        try {
            const res = await fetch(`${API_BASE_URL}/faq-answer`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, id: faq.id, question, answer })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Update failed');
            const setStatus = (msg) => { saveBtn.textContent = msg; };
            await generateThreeVariantsForAnswer(faq.id, title, answer, setStatus);
            await loadFAQs(title);
        } catch (e) {
            alert(e.message || 'Failed to save.');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    };
    cancelBtn.onclick = () => {
        qCell.textContent = origQ;
        aCell.textContent = origA;
        actionsCell.innerHTML = '';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'edit-faq-btn';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => enterEditMode(row, faq);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-faq-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteFaqRow(faq);
        actionsCell.appendChild(wrapButtonWithTooltip(editBtn, 'Edit this question and answer; save will regenerate all 3 video variants'));
        actionsCell.appendChild(wrapButtonWithTooltip(deleteBtn, 'Delete this answer and its videos'));
    };
    actionsCell.appendChild(wrapButtonWithTooltip(saveBtn, 'Save changes and regenerate all 3 video variants for this row'));
    actionsCell.appendChild(wrapButtonWithTooltip(cancelBtn, 'Discard edits'));
}

async function deleteFaqRow(faq) {
    if (!confirm('Delete this answer? This will remove the question-answer and its videos.')) return;
    const title = faq.title || getCurrentTitle();
    if (!title) return;
    try {
        const res = await fetch(`${API_BASE_URL}/faq-answer?title=${encodeURIComponent(title)}&id=${encodeURIComponent(faq.id)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Delete failed');
        await loadFAQs(title);
    } catch (e) {
        alert(e.message || 'Failed to delete.');
    }
}

function populateOtherCategoriesPanel(items, title) {
    const container = document.getElementById('otherCategoriesContent');
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = '<p class="other-categories-placeholder">No other category items for this topic.</p>';
        return;
    }

    const encodedTitle = encodeURIComponent(title);
    container.innerHTML = '';

    items.forEach(faq => {
        const card = document.createElement('div');
        card.className = 'other-category-card';

        const categoryLabel = document.createElement('div');
        categoryLabel.className = 'card-category';
        categoryLabel.textContent = faq.category || 'other';

        const questionEl = document.createElement('div');
        questionEl.className = 'card-question';
        questionEl.textContent = faq.question;

        const answerEl = document.createElement('div');
        answerEl.className = 'card-answer';
        answerEl.textContent = faq.answer;

        const videosWrap = document.createElement('div');
        videosWrap.className = 'card-videos';

        const variants = faq.variants || [];
        const nextVariant = [1, 2, 3].find(v => !variants.includes(v));

        if (faq.has_video && variants.length > 0) {
            const carousel = document.createElement('div');
            carousel.className = 'video-carousel';

            const video = document.createElement('video');
            const cat = faq.category || 'conversational';
            video.src = `${API_BASE_URL}/static/videos/${encodedTitle}/${cat}/${faq.id}_${variants[0]}.mp4`;
            video.controls = true;
            video.className = 'carousel-video';
            carousel.appendChild(video);

            if (variants.length > 1) {
                const controls = document.createElement('div');
                controls.className = 'carousel-controls';
                const prevBtn = document.createElement('button');
                prevBtn.className = 'carousel-arrow';
                prevBtn.innerHTML = '&#8249;';
                const label = document.createElement('span');
                label.className = 'carousel-label';
                label.textContent = `1 of ${variants.length}`;
                const nextBtn = document.createElement('button');
                nextBtn.className = 'carousel-arrow';
                nextBtn.innerHTML = '&#8250;';
                let currentIdx = 0;
                function updateVariant() {
                    const v = variants[currentIdx];
                    video.src = `${API_BASE_URL}/static/videos/${encodedTitle}/${cat}/${faq.id}_${v}.mp4`;
                    label.textContent = `${currentIdx + 1} of ${variants.length}`;
                }
                prevBtn.onclick = () => {
                    currentIdx = (currentIdx - 1 + variants.length) % variants.length;
                    updateVariant();
                };
                nextBtn.onclick = () => {
                    currentIdx = (currentIdx + 1) % variants.length;
                    updateVariant();
                };
                controls.appendChild(prevBtn);
                controls.appendChild(label);
                controls.appendChild(nextBtn);
                carousel.appendChild(controls);
            }
            videosWrap.appendChild(carousel);
        }

        if (nextVariant !== undefined) {
            const filenameId = `${faq.id}_${nextVariant}`;
            const btn = document.createElement('button');
            btn.textContent = variants.length > 0 ? `Generate variant ${nextVariant}` : 'Generate Video';
            btn.className = 'generate-btn';
            btn.onclick = () => {
                const promptText = document.getElementById('videoPrompt').value.trim() || 'talking head';
                addToQueue(btn, filenameId, faq.title, faq.answer, promptText, faq.category);
            };
            videosWrap.appendChild(wrapButtonWithTooltip(btn, 'Generate missing video variant for this item'));
        }

        card.appendChild(categoryLabel);
        card.appendChild(questionEl);
        card.appendChild(answerEl);
        card.appendChild(videosWrap);
        container.appendChild(card);
    });
}

let currentAvatarPath = null;
const videoQueue = []; // Queue to store pending requests
let isProcessingQueue = false; // Flag to check if we are currently generating

function addToQueue(btnElement, id, title, text, prompt, category) {
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
        prompt,
        category: category || 'answers'
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
    const { btnElement, id, title, text, prompt, category } = currentTask;
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
                category: category || 'answers',
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

        // Success: refresh both panels so new video appears
        const cell = btnElement.parentNode;
        cell.innerHTML = '<span class="status-ready">Ready</span>';
        await loadFAQs(title);

    } catch (error) {
        console.error("Queue task failed:", error);
        btnElement.textContent = "Retry";
        btnElement.disabled = false;
        btnElement.style.background = "#e74c3c";
        
        btnElement.onclick = () => addToQueue(btnElement, id, title, text, prompt, category);
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
