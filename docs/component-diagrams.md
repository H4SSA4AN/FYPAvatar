# FYPAvatar – Component Diagrams

This document contains component diagrams for the **FYPAvatar** system – an AI-driven talking-head avatar chatbot platform built with Python Flask, ChromaDB, SQLite, and ComfyUI.

---

## 1. High-Level System Architecture

Shows the major subsystems and how they relate to each other at the deployment level.

```mermaid
graph TB
    subgraph Client["Client Browser"]
        CreateQA["CreateQA Page\n(createQA.html)"]
        EditQA["EditQA Page\n(editQA.html)"]
        TestQA["TestQA Page\n(testQA.html)"]
        Player["Interactive Player\n(player.html)"]
        Dashboard["Dashboard\n(main.html)"]
    end

    subgraph GAE["Google App Engine (Python 3.10 / Gunicorn)"]
        Flask["Flask Application\n(backend/app.py)"]

        subgraph Services["Backend Services"]
            FAQSvc["FAQService\n(FAQService.py)"]
            ComfySvc["ComfyService\n(comfyService.py)"]
            DBSvc["DatabaseService\n(database.py)"]
            VecSvc["VectorDBService\n(vectorDB.py)"]
            TransSvc["TranscriptionService\n(transcriptionService.py)"]
        end

        subgraph Storage["Persistent Storage"]
            SQLite["SQLite\n(app.db)"]
            ChromaDB["ChromaDB\n(backend/db/)"]
            StaticFiles["Static Files\n(videos / audio / images)"]
        end
    end

    subgraph External["External Services"]
        ComfyUI["ComfyUI Server\n(158.125.80.37:8188)"]
        Whisper["Faster Whisper\n(base.en model, local)"]
    end

    subgraph Standalone["Standalone Player (optional deployment)"]
        StPlayer["Standalone Flask App\n(playerStandalone/playerapp.py)"]
        StData["Extracted Project Data\n(data/)"]
    end

    Client -- "HTTP/REST" --> Flask
    Flask --> FAQSvc
    Flask --> ComfySvc
    Flask --> DBSvc
    Flask --> VecSvc
    Flask --> TransSvc

    FAQSvc --> DBSvc
    FAQSvc --> VecSvc

    DBSvc --> SQLite
    VecSvc --> ChromaDB

    ComfySvc -- "HTTP + WebSocket" --> ComfyUI
    ComfySvc --> StaticFiles

    TransSvc --> Whisper

    Flask -- "ZIP export" --> StPlayer
    StPlayer --> StData
```

---

## 2. Backend Component Diagram

Detailed view of the Flask application and its service dependencies.

```mermaid
graph LR
    subgraph FlaskApp["Flask Application (app.py)"]
        Routes["30+ REST Routes\n/upload /faqs /query\n/generateImage /generate-video-*\n/generate-audio-* /transcribe\n/download-project /progress/:id"]
        ProgressStore["In-Memory\nPROGRESS_STORE\n(async job tracking)"]
    end

    subgraph ServiceLayer["Service Layer"]
        FAQSvc["FAQService\n────────────\nprocess_csv()\nquery_faq()\nadd_faq_single()\nupdate_faq_single()\ndelete_faq_single()\nget_faqs()\nget_avatar()\nget_videos()\ndelete_topic()"]

        ComfySvc["ComfyService\n────────────\ngenerate_image()\ngenerate_audio_single()\ngenerate_audio_test()\ngenerate_video()\ngenerate_video_talking_head()\ngenerate_video_extended()\nqueue_prompt()\nexecute_workflow()"]

        DBSvc["DatabaseService\n────────────\ninit_db()\nadd_title()\nget_title_id()\nadd_question_answer()\nupdate_question_answer()\ndelete_question_answer()\ndelete_title_by_name()"]

        VecSvc["VectorDBService\n────────────\nadd_documents()\nquery()\nquery_rude()\nadd_rude_documents()\ndelete_by_title()\ndelete_by_ids()"]

        TransSvc["TranscriptionService\n────────────\ntranscribe()"]
    end

    subgraph DataLayer["Data Layer"]
        SQLite[("SQLite\napp.db\n────\ntitles\nquestionAnswers\nvideos")]
        ChromaDB[("ChromaDB\nbackend/db/\n────\nfaq collection\nrude collection")]
        StaticFiles[["Static Files\nbackend/static/\n────\nvideos/{title}/{cat}/\naudio/{title}/{cat}/\nimages/{title}/avatar.png"]]
    end

    subgraph AILayer["AI / ML Layer"]
        ComfyUI["ComfyUI Server\n────────────\nzTurboImageGen workflow\nIndexTTS-2 workflow\nInfiniteTalk workflow\nInfiniteTalk Extended\nHunyuan video workflow"]
        Whisper["Faster Whisper\nbase.en model\n(local inference)"]
    end

    Routes --> FAQSvc
    Routes --> ComfySvc
    Routes --> TransSvc
    Routes --> ProgressStore

    FAQSvc --> DBSvc
    FAQSvc --> VecSvc

    DBSvc --> SQLite
    VecSvc --> ChromaDB

    ComfySvc --> ComfyUI
    ComfySvc --> StaticFiles

    TransSvc --> Whisper
```

---

## 3. Frontend Component Diagram

Shows how the HTML/CSS/JavaScript pages are structured and their API interactions.

```mermaid
graph TB
    subgraph Pages["Frontend Pages (web/)"]
        direction TB
        CreatePage["CreateQA Page\ncreateQA.html + createQA.css\ncreatQAjs.js (1936 lines)\n────────────\n• Upload FAQ CSV\n• Generate avatar image\n• Generate audio/video\n• Track job progress\n• Multi-variant support"]

        EditPage["EditQA Page\neditQA.html + editQA.css\neditQA.js (1296 lines)\n────────────\n• Edit Q&A pairs\n• Replace audio/video\n• Delete FAQs"]

        TestPage["TestQA Page\ntestQA.html + testQA.css\ntestQA.js (357 lines)\n────────────\n• Test avatar responses\n• Text/voice query input\n• View matched answer"]

        PlayerPage["Player Page\nplayer.html + player.css\nplayer.js (630 lines)\n────────────\n• Interactive chatbot UI\n• Text + microphone input\n• Video/audio playback\n• Topic selector\n• Chat log display"]

        DashPage["Dashboard\nmain.html + main.css\n────────────\n• Admin overview\n• Topic management"]
    end

    subgraph API["Flask API Endpoints"]
        UploadAPI["/upload POST"]
        FAQsAPI["/faqs GET"]
        FAQEditAPI["/faq-answer POST/PUT/DELETE"]
        QueryAPI["/query POST"]
        TitlesAPI["/titles GET"]
        ImgAPI["/generateImage POST"]
        AudioAPI["/generate-audio-single POST\n/generate-audio-test POST"]
        VideoAPI["/generate-video-single POST\n/generate-video-extended POST"]
        TranscribeAPI["/transcribe POST"]
        ProgressAPI["/progress/:job_id GET"]
        MediaAPI["/get-videos GET\n/get-avatar GET\n/get-missing-media GET"]
        ExportAPI["/download-project GET"]
        SeedAPI["/seed-rude POST\n/load-conversational POST"]
        DefaultAPI["/default-responses GET"]
    end

    CreatePage --> UploadAPI
    CreatePage --> ImgAPI
    CreatePage --> AudioAPI
    CreatePage --> VideoAPI
    CreatePage --> ProgressAPI
    CreatePage --> MediaAPI
    CreatePage --> SeedAPI

    EditPage --> FAQsAPI
    EditPage --> FAQEditAPI
    EditPage --> AudioAPI
    EditPage --> VideoAPI
    EditPage --> ProgressAPI
    EditPage --> MediaAPI

    TestPage --> QueryAPI
    TestPage --> TranscribeAPI
    TestPage --> TitlesAPI
    TestPage --> AudioAPI

    PlayerPage --> QueryAPI
    PlayerPage --> TranscribeAPI
    PlayerPage --> TitlesAPI
    PlayerPage --> MediaAPI
    PlayerPage --> DefaultAPI

    DashPage --> TitlesAPI
    DashPage --> ExportAPI
```

---

## 4. FAQ Creation Data Flow

Sequence of events when a user creates a new FAQ topic with generated avatar media.

```mermaid
sequenceDiagram
    actor User
    participant Browser as Browser (CreateQA)
    participant Flask as Flask (app.py)
    participant FAQSvc as FAQService
    participant DBSvc as DatabaseService
    participant VecSvc as VectorDBService
    participant ComfySvc as ComfyService
    participant ComfyUI as ComfyUI Server
    participant FS as File System (static/)

    User->>Browser: Upload FAQ CSV file
    Browser->>Flask: POST /upload (multipart CSV)
    Flask->>FAQSvc: process_csv(csv_file, title)
    FAQSvc->>DBSvc: add_title(title)
    DBSvc-->>FAQSvc: title_id
    loop For each Q&A row in CSV
        FAQSvc->>DBSvc: add_question_answer(uuid, title_id, question, answer)
        FAQSvc->>VecSvc: add_documents([{question, answer, title, category}])
    end
    FAQSvc-->>Flask: {success, count}
    Flask-->>Browser: 200 OK

    User->>Browser: Enter avatar image prompt
    Browser->>Flask: POST /generateImage {title, prompt}
    Flask->>ComfySvc: generate_image(title, prompt)
    ComfySvc->>ComfyUI: POST /prompt (zTurboImageGen workflow)
    ComfyUI-->>ComfySvc: {prompt_id}
    ComfySvc->>ComfyUI: WebSocket (track execution)
    ComfyUI-->>ComfySvc: image binary
    ComfySvc->>FS: Save backend/static/images/{title}/avatar.png
    Flask-->>Browser: 200 OK + image path

    loop For each Q&A pair
        User->>Browser: Click "Generate Audio"
        Browser->>Flask: POST /generate-audio-single {title, qa_id, answer, variant}
        Flask->>ComfySvc: generate_audio_single(title, qa_id, answer, variant)
        ComfySvc->>ComfyUI: POST /prompt (IndexTTS-2 workflow)
        ComfyUI-->>ComfySvc: audio binary (.mp3)
        ComfySvc->>FS: Save backend/static/audio/{title}/answers/{qa_id}_v{n}.mp3
        Flask-->>Browser: 200 OK

        User->>Browser: Click "Generate Video"
        Browser->>Flask: POST /generate-video-single {title, qa_id, variant}
        Flask->>ComfySvc: generate_video_talking_head(title, qa_id, variant)
        ComfySvc->>ComfyUI: POST /prompt (InfiniteTalk workflow)
        ComfyUI-->>ComfySvc: video binary (.mp4)
        ComfySvc->>FS: Save backend/static/videos/{title}/answers/{qa_id}_v{n}.mp4
        Flask-->>Browser: 200 OK
    end
```

---

## 5. Query & Response Data Flow

How a user question is processed and an avatar video response is served.

```mermaid
sequenceDiagram
    actor User
    participant Browser as Browser (Player)
    participant Flask as Flask (app.py)
    participant FAQSvc as FAQService
    participant VecSvc as VectorDBService
    participant TransSvc as TranscriptionService
    participant Whisper as Faster Whisper

    alt Text input
        User->>Browser: Type question
    else Microphone input
        User->>Browser: Record audio
        Browser->>Flask: POST /transcribe (WebM audio blob)
        Flask->>TransSvc: transcribe(audio_bytes)
        TransSvc->>Whisper: transcribe (VAD filter)
        Whisper-->>TransSvc: text segments
        TransSvc-->>Flask: transcribed_text
        Flask-->>Browser: {text}
    end

    Browser->>Flask: POST /query {query, title}
    Flask->>FAQSvc: query_faq(query, title)

    FAQSvc->>VecSvc: query_rude(query)
    VecSvc-->>FAQSvc: {distance, rude_phrase}

    alt Rude query detected (distance < threshold)
        FAQSvc-->>Flask: {category: "rude", answer: random_rude_response}
    else Not rude
        FAQSvc->>VecSvc: query(query, collection="conversational")
        VecSvc-->>FAQSvc: {distance, answer}

        alt Conversational match (distance < 0.4)
            FAQSvc-->>Flask: {category: "conversational", answer}
        else No conversational match
            FAQSvc->>VecSvc: query(query, collection="faq")
            VecSvc-->>FAQSvc: {distance, answer, qa_id}

            alt FAQ match (distance < 0.6)
                FAQSvc-->>Flask: {category: "answers", answer, qa_id}
            else No match
                FAQSvc-->>Flask: {category: "no_answer", answer: random_no_answer_response}
            end
        end
    end

    Flask-->>Browser: {category, answer, qa_id}
    Browser->>Browser: Select video path:\nstatic/videos/{title}/{category}/{qa_id}_v{random}.mp4
    Browser->>Browser: Load & play avatar video + audio
    Browser->>Browser: Append to chat log
```

---

## 6. Database Schema Diagram

Entity-relationship view of the SQLite and ChromaDB stores.

```mermaid
erDiagram
    TITLES {
        int id PK
        text name UK
        timestamp created_at
    }

    QUESTION_ANSWERS {
        text UUID PK
        int title_id FK
        text question
        text answer
        timestamp created_at
    }

    VIDEOS {
        int id PK
        int title_id FK
        text question_id FK
        text video_path
        timestamp created_at
    }

    TITLES ||--o{ QUESTION_ANSWERS : "has"
    TITLES ||--o{ VIDEOS : "has"
    QUESTION_ANSWERS ||--o{ VIDEOS : "generates"
```

### ChromaDB Collections

```mermaid
graph LR
    subgraph ChromaDB["ChromaDB (backend/db/)"]
        subgraph FAQCol["faq collection"]
            FAQDoc["Document: question text\n────────────\nMetadata:\n  answer: text\n  title: string\n  category: answers | conversational\nEmbedding: sentence-transformer\n(multi-qa-mpnet-base-dot-v1)"]
        end

        subgraph RudeCol["rude collection"]
            RudeDoc["Document: rude phrase\n────────────\nMetadata:\n  source: rudeWords.json\nEmbedding: sentence-transformer"]
        end
    end

    FAQQuery["query_faq()\nSemantic similarity search"] --> FAQCol
    RudeQuery["query_rude()\nRude detection search"] --> RudeCol
```

---

## 7. Static Assets Organisation

```mermaid
graph TD
    Static["backend/static/"]

    Static --> Videos["videos/"]
    Static --> Audio["audio/"]
    Static --> Images["images/"]
    Static --> PlaceholderMP4["placeholder.mp4"]
    Static --> PlaceholderMP3["placeholder.mp3"]

    Videos --> VidTitle["{title}/"]
    VidTitle --> VidAnswers["answers/\n{qa_id}_v1.mp4\n{qa_id}_v2.mp4\n{qa_id}_v3.mp4"]
    VidTitle --> VidConv["conversational/\n{qa_id}_v1.mp4 …"]
    VidTitle --> VidRude["rude/\n{qa_id}_v1.mp4 …"]
    VidTitle --> VidNoAns["no_answer/\n{qa_id}_v1.mp4 …"]

    Audio --> AudTitle["{title}/"]
    AudTitle --> AudAnswers["answers/\n{qa_id}_v1.mp3 …"]
    AudTitle --> AudConv["conversational/"]
    AudTitle --> AudRude["rude/"]
    AudTitle --> AudNoAns["no_answer/"]
    AudTitle --> TestAudios["TestAudios/"]

    Images --> ImgTitle["{title}/"]
    ImgTitle --> AvatarPNG["avatar.png"]
```

---

## 8. Standalone Player Architecture

The standalone player is a self-contained deployment that receives a ZIP export from the main application.

```mermaid
graph TB
    subgraph MainApp["Main Application"]
        ExportZIP["POST /download-project\n→ ZIP archive\n(db, audio, video, images,\napp.db, defaultResponses.json)"]
    end

    subgraph StandaloneApp["Standalone Player (playerStandalone/)"]
        StFlask["Flask App\n(playerapp.py)\n────────────\nRoutes:\n/upload-zip POST\n/query POST\n/transcribe POST\n/faqs GET\n/titles GET\n/player GET\n/get-videos GET\n/get-avatar GET\n/default-responses GET"]

        StServices["Services (inline)\n────────────\nFAQService (query_faq)\nVectorDBService (ChromaDB)\nDatabaseService (SQLite)\nTranscriptionService (Whisper)"]

        subgraph StData["data/ (extracted ZIP)"]
            StDB[("SQLite\napp.db")]
            StChroma[("ChromaDB\ndb/")]
            StVideos[["videos/"]]
            StAudio[["audio/"]]
            StImages[["images/"]]
        end

        StLogs["logs/\nInteraction logs\n(timestamp, query, response)"]
    end

    subgraph StClient["End-User Browser"]
        StPlayer["player.html\nplayer.js\nplayer.css"]
    end

    MainApp -- "ZIP download + upload" --> StFlask
    StFlask -- "extract & init" --> StData
    StFlask --> StServices
    StServices --> StDB
    StServices --> StChroma
    StFlask --> StLogs
    StClient -- "HTTP" --> StFlask
    StFlask -- "static files" --> StVideos
    StFlask -- "static files" --> StAudio
    StFlask -- "static files" --> StImages
```

---

## 9. ComfyUI Workflow Integration

How the backend communicates with ComfyUI to run AI generation pipelines.

```mermaid
sequenceDiagram
    participant ComfySvc as ComfyService (comfyService.py)
    participant ComfyHTTP as ComfyUI HTTP API
    participant ComfyWS as ComfyUI WebSocket

    ComfySvc->>ComfySvc: Load workflow JSON\n(e.g. InfiniteTalkWorkflow.json)
    ComfySvc->>ComfySvc: Inject parameters\n(prompt, image path, audio path, seed)
    ComfySvc->>ComfyHTTP: POST /prompt {prompt: workflow_json, client_id}
    ComfyHTTP-->>ComfySvc: {prompt_id}

    ComfySvc->>ComfyWS: ws://comfyui/ws?clientId=...
    loop Until execution_complete
        ComfyWS-->>ComfySvc: {type: "executing", data: {node}}
        ComfyWS-->>ComfySvc: {type: "progress", data: {value, max}}
    end
    ComfyWS-->>ComfySvc: {type: "execution_complete"}

    ComfySvc->>ComfyHTTP: GET /history/{prompt_id}
    ComfyHTTP-->>ComfySvc: {outputs: {node_id: {images|audio|video: [{filename}]}}}

    ComfySvc->>ComfyHTTP: GET /view?filename=...&type=output
    ComfyHTTP-->>ComfySvc: binary file data

    ComfySvc->>ComfySvc: Save to backend/static/{media_type}/{title}/...
```

### ComfyUI Workflow Summary

| Workflow File | Purpose | Outputs |
|---|---|---|
| `zTurboImageGen.json` | Avatar image generation from text prompt | PNG image |
| `IndexTTS-2.json` | Text-to-speech synthesis | MP3 audio |
| `InfiniteTalkWorkflow.json` | Basic talking-head video (image + audio) | MP4 video |
| `InfiniteTalkFlowNEWExtend2Chunk.json` | Extended talking-head (2 chunks) | MP4 video |
| `InfiniteTalkFlowNEWExtend3Chunk.json` | Extended talking-head (3 chunks) | MP4 video |
| `InfiniteTalkFlowNEWExtendFull.json` | Full extended talking-head | MP4 video |
| `hunyanVideoGen.json` | Hunyuan video generation | MP4 video |

---

## 10. Component Responsibility Summary

| Component | Technology | Responsibility |
|---|---|---|
| **app.py** | Python / Flask | REST API routing, async job tracking, static file serving |
| **FAQService** | Python | FAQ CRUD, semantic query orchestration, rude detection |
| **DatabaseService** | Python / SQLite | Relational data persistence (topics, Q&A, videos) |
| **VectorDBService** | Python / ChromaDB | Semantic vector search, embedding management |
| **ComfyService** | Python / HTTP / WebSocket | AI media generation (image, audio, video) via ComfyUI |
| **TranscriptionService** | Python / Faster Whisper | Speech-to-text conversion |
| **createQAjs.js** | Vanilla JS | FAQ creation UI, generation progress tracking |
| **editQA.js** | Vanilla JS | FAQ editing UI, media replacement |
| **player.js** | Vanilla JS | Interactive chatbot UI, video playback, microphone input |
| **testQA.js** | Vanilla JS | FAQ query testing interface |
| **playerapp.py** | Python / Flask | Self-contained standalone player backend |
| **ComfyUI** | External service | Node-based AI pipeline execution (image/audio/video gen) |
| **ChromaDB** | Embedded DB | Vector similarity search for FAQ and rude detection |
| **SQLite** | Embedded DB | Structured data storage for topics, Q&A pairs, video refs |
| **Faster Whisper** | Local ML model | Offline speech-to-text transcription |
