# FYPAvatar – Component Diagrams & Activity Diagrams

This document provides an overview of the **FYPAvatar** system architecture and key user flows. FYPAvatar is an AI-driven talking-head avatar chatbot platform that lets administrators build a knowledge base and deploy an interactive avatar that answers questions with generated speech and video.

---

## Component Diagrams

### 1. System Overview

The system is divided into four top-level areas: the admin/user browser, the backend application, external AI services, and an optional standalone deployment.

```mermaid
graph TB
    Browser["Browser\n(Admin & End-User)"]

    subgraph Backend["Backend Application"]
        API["REST API"]
        FAQMgmt["FAQ Management"]
        MediaGen["Media Generation"]
        Transcription["Speech Transcription"]
    end

    subgraph Storage["Storage"]
        RelDB[("Relational DB\nSQLite")]
        VectorDB[("Vector DB\nChromaDB")]
        MediaFiles[["Media Files\nVideos · Audio · Images"]]
    end

    subgraph AIServices["AI Services"]
        ComfyUI["ComfyUI\nImage · Audio · Video Generation"]
        Whisper["Faster Whisper\nSpeech-to-Text"]
    end

    Standalone["Standalone Player\n(self-contained deployment)"]

    Browser -- "HTTP" --> API
    API --> FAQMgmt
    API --> MediaGen
    API --> Transcription

    FAQMgmt --> RelDB
    FAQMgmt --> VectorDB

    MediaGen --> ComfyUI
    MediaGen --> MediaFiles

    Transcription --> Whisper

    Backend -- "ZIP export" --> Standalone
```

---

### 2. Backend Component Relationships

Shows how the five backend services relate to each other and to the data stores.

```mermaid
graph LR
    API["REST API"]

    FAQSvc["FAQ Service"]
    ComfySvc["Media Generation Service"]
    DBSvc["Database Service"]
    VecSvc["Vector DB Service"]
    TransSvc["Transcription Service"]

    RelDB[("Relational DB")]
    VectorDB[("Vector DB")]
    MediaFiles[["Media Files"]]
    ComfyUI["ComfyUI"]
    Whisper["Faster Whisper"]

    API --> FAQSvc
    API --> ComfySvc
    API --> TransSvc

    FAQSvc --> DBSvc
    FAQSvc --> VecSvc

    DBSvc --> RelDB
    VecSvc --> VectorDB

    ComfySvc --> ComfyUI
    ComfySvc --> MediaFiles

    TransSvc --> Whisper
```

---

### 3. Frontend Component Relationships

Shows which browser pages interact with which backend capability groups.

```mermaid
graph LR
    subgraph Pages["Browser Pages"]
        CreateQA["Create FAQ"]
        EditQA["Edit FAQ"]
        TestQA["Test FAQ"]
        Player["Interactive Player"]
        Dashboard["Dashboard"]
    end

    subgraph BackendCaps["Backend Capabilities"]
        FAQMgmt["FAQ Management"]
        MediaGen["Media Generation"]
        Query["Query & Search"]
        Transcription["Transcription"]
        Export["Project Export"]
    end

    CreateQA --> FAQMgmt
    CreateQA --> MediaGen

    EditQA --> FAQMgmt
    EditQA --> MediaGen

    TestQA --> Query
    TestQA --> Transcription

    Player --> Query
    Player --> Transcription

    Dashboard --> FAQMgmt
    Dashboard --> Export
```

---

### 4. Data Storage Relationships

Shows how the two databases and the media file store relate to each other and to the key domain entities.

```mermaid
graph TB
    subgraph Domain["Domain Entities"]
        Topic["Topic"]
        QA["Q&A Pair"]
        Video["Video"]
    end

    subgraph SQLite["Relational DB (SQLite)"]
        Titles["titles"]
        QuestionAnswers["questionAnswers"]
        Videos["videos"]
    end

    subgraph ChromaDB["Vector DB (ChromaDB)"]
        FAQCol["FAQ Collection\n(semantic search)"]
        RudeCol["Rude Collection\n(content filtering)"]
    end

    MediaFiles[["Media Files\nvideos · audio · images"]]

    Topic --> Titles
    QA --> QuestionAnswers
    Video --> Videos

    Titles -- "1 → many" --> QuestionAnswers
    QuestionAnswers -- "1 → many" --> Videos

    QA -- "indexed as embeddings" --> FAQCol
    QA -- "rude phrases indexed" --> RudeCol

    Videos -- "references" --> MediaFiles
```

---

## Activity Diagrams

### 5. User Flow: Create FAQ Topic

Covers the end-to-end journey an admin takes to set up a new topic, generate an avatar, and produce media for each Q&A pair.

```mermaid
flowchart TD
    Start([Admin opens Create FAQ page])

    Start --> UploadCSV[Upload FAQ CSV file]
    UploadCSV --> ParseCSV{CSV valid?}
    ParseCSV -- No --> ShowError[Show validation error]
    ShowError --> UploadCSV
    ParseCSV -- Yes --> IndexData[Index Q&A pairs in DB\nand Vector Store]

    IndexData --> GenAvatar[Enter avatar image prompt\nand generate avatar]
    GenAvatar --> AvatarReady{Image generated?}
    AvatarReady -- No --> RetryImg[Retry or adjust prompt]
    RetryImg --> GenAvatar
    AvatarReady -- Yes --> ReviewAvatar[Review avatar image]

    ReviewAvatar --> LoopQA[For each Q&A pair]

    LoopQA --> GenAudio[Generate audio\nfor answer]
    GenAudio --> AudioReady{Audio ready?}
    AudioReady -- No --> RetryAudio[Retry generation]
    RetryAudio --> GenAudio
    AudioReady -- Yes --> GenVideo[Generate talking-head video]

    GenVideo --> VideoReady{Video ready?}
    VideoReady -- No --> RetryVideo[Retry generation]
    RetryVideo --> GenVideo
    VideoReady -- Yes --> MoreQA{More Q&A pairs?}

    MoreQA -- Yes --> LoopQA
    MoreQA -- No --> SeedData[Seed rude & conversational\nresponse collections]

    SeedData --> Done([Topic ready for use])
```

---

### 6. User Flow: Edit FAQ Content

Covers how an admin modifies existing Q&A pairs, replaces media, or removes entries.

```mermaid
flowchart TD
    Start([Admin opens Edit FAQ page])

    Start --> SelectTopic[Select topic]
    SelectTopic --> LoadFAQs[Load all Q&A pairs]

    LoadFAQs --> ChooseAction{Choose action}

    ChooseAction --> EditText[Edit question or answer text]
    EditText --> SaveText[Save changes to DB\nand Vector Store]
    SaveText --> RegenMedia{Regenerate media?}
    RegenMedia -- Yes --> GenAudio2[Generate new audio]
    GenAudio2 --> GenVideo2[Generate new video]
    GenVideo2 --> ChooseAction
    RegenMedia -- No --> ChooseAction

    ChooseAction --> DeleteEntry[Delete Q&A pair]
    DeleteEntry --> ConfirmDelete{Confirm delete?}
    ConfirmDelete -- No --> ChooseAction
    ConfirmDelete -- Yes --> RemoveFromDB[Remove from DB\nand Vector Store]
    RemoveFromDB --> ChooseAction

    ChooseAction --> ReplaceMedia[Replace audio or video\nfor an existing entry]
    ReplaceMedia --> GenAudio3[Generate new audio / video]
    GenAudio3 --> ChooseAction

    ChooseAction --> Done([Exit edit page])
```

---

### 7. User Flow: Ask a Question (Interactive Player)

Covers the end-to-end journey of an end-user interacting with the avatar player.

```mermaid
flowchart TD
    Start([User opens Player])

    Start --> SelectTopic[Select a topic]
    SelectTopic --> InputMethod{Input method?}

    InputMethod -- Text --> TypeQuestion[Type question]
    InputMethod -- Microphone --> RecordAudio[Record audio]

    RecordAudio --> Transcribe[Transcribe audio to text]
    Transcribe --> TranscribeOK{Transcription OK?}
    TranscribeOK -- No --> RetryRecord[Retry recording]
    RetryRecord --> RecordAudio
    TranscribeOK -- Yes --> TypeQuestion

    TypeQuestion --> SendQuery[Send query to backend]
    SendQuery --> RudeCheck{Rude or\ninappropriate?}

    RudeCheck -- Yes --> PlayRude[Play rude-response video]
    PlayRude --> InputMethod

    RudeCheck -- No --> ConvCheck{Conversational\nmatch?}

    ConvCheck -- Yes --> PlayConv[Play conversational-response video]
    PlayConv --> InputMethod

    ConvCheck -- No --> FAQCheck{FAQ match\nfound?}

    FAQCheck -- Yes --> PlayAnswer[Play answer video]
    PlayAnswer --> InputMethod

    FAQCheck -- No --> PlayNoAnswer[Play no-answer video]
    PlayNoAnswer --> InputMethod
```

---

### 8. User Flow: Export & Deploy Standalone Player

Covers how an admin exports a completed project and deploys it as a self-contained player.

```mermaid
flowchart TD
    Start([Admin ready to deploy])

    Start --> OpenDashboard[Open Dashboard]
    OpenDashboard --> SelectProject[Select topic / project]
    SelectProject --> Download[Download project as ZIP]

    Download --> TransferZIP[Transfer ZIP to\nstandalone server]

    TransferZIP --> UploadZIP[Upload ZIP to\nstandalone player app]
    UploadZIP --> ExtractData[Extract databases\nand media files]

    ExtractData --> InitServices[Initialize FAQ, Vector DB\nand Transcription services]
    InitServices --> Verify{Services\ninitialized OK?}

    Verify -- No --> ShowInitError[Show error &\ncheck logs]
    ShowInitError --> UploadZIP

    Verify -- Yes --> ShareURL[Share player URL\nwith end users]
    ShareURL --> End([Standalone player live])
```
