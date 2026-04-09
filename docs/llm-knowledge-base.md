# LLM Knowledge Base — Conversation Detection & Topic Routing

## Overview

Obelisk uses a lightweight local LLM (`llama3.2:1b`) to detect when conversations emerge organically in public channels and route them to the right place — either an existing thread/topic or a newly suggested one.

## How It Works

### 1. Conversation Detection

The system monitors message flow in public channels. When **N messages** between a subset of users (2+ people) occur within a **configurable time window**, the system flags it as an emerging conversation.

**Trigger conditions:**
- Minimum messages threshold (e.g., 5 messages)
- Within a time window (e.g., 10 minutes)
- Between a subset of participants (2+ users replying to each other)
- In a non-thread context (main channel, not already in a thread)

**Detection heuristics:**
- Direct replies between users
- Consecutive messages from the same small group
- @mentions between participants
- Semantic continuity (same topic across messages)

### 2. Thread Index

All existing threads and forum posts are indexed in a lightweight searchable system:

```
ThreadIndex {
  id: string           // thread/post ID
  channelId: string    // parent channel
  title: string        // thread title or first message summary
  description: string  // LLM-generated summary of the thread content
  tags: string[]       // extracted keywords/topics
  createdAt: DateTime
  lastActivityAt: DateTime
  messageCount: number
}
```

**Indexing pipeline:**
1. When a thread/forum post is created or receives significant new activity, the LLM generates a short description
2. Descriptions are stored alongside the thread metadata
3. Mod approval is required before a description enters the index (see Fase 5 roadmap)

### 3. LLM Matching — Topic Router

When a conversation is detected, the system:

1. **Extracts** the set of messages from the involved participants within the time window
2. **Summarizes** the conversation topic using the LLM
3. **Queries** the thread index with the summary
4. **Returns** one of:
   - **Match found:** The ID of the most relevant existing thread → suggest participants move there
   - **No match:** Recommend creating a new topic/thread with a suggested title

#### LLM Prompt Design

The LLM (`llama3.2:1b`) receives a structured prompt:

```
You are a topic router. Given a conversation summary and a list of existing threads, return the ID of the best matching thread. If no thread matches, return "NEW".

Conversation:
{conversation_summary}

Existing threads:
{thread_index_entries}

Return ONLY the thread ID or "NEW". No explanation.
```

**Why llama3.2:1b:**
- Runs locally, no API costs
- 1B parameters — fast inference even on modest hardware
- Sufficient for classification/matching tasks (not generating long text)
- Can run via Ollama on the server host

### 4. User-Facing Behavior

When the system detects a conversation and finds a match:

```
🔀 Looks like you're discussing "{topic}".
   There's an existing thread about this: #{thread_title}
   [Go to thread] [Dismiss]
```

When no match is found:

```
💡 This looks like a new topic: "{suggested_title}".
   Want to create a thread so others can follow along?
   [Create thread] [Dismiss]
```

- Suggestions appear as **non-intrusive inline cards** in the chat (similar to typing indicators)
- Each user in the conversation sees the suggestion
- Dismissing hides it for that user only
- The suggestion is **not** a mod action — it's a soft nudge

### 5. Configuration

Server admins configure the detection parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `conversation_min_messages` | 5 | Min messages to trigger detection |
| `conversation_time_window` | 600 | Time window in seconds (10 min) |
| `conversation_min_participants` | 2 | Min distinct users |
| `llm_model` | `llama3.2:1b` | Ollama model name |
| `llm_endpoint` | `http://localhost:11434` | Ollama API endpoint |
| `suggestion_cooldown` | 1800 | Seconds before re-suggesting in same channel |
| `index_approval_required` | true | Require mod approval for index entries |

### 6. Architecture

```
Message Flow (Socket.io)
        │
        ▼
┌─────────────────────┐
│ Conversation Detector│  ← monitors message patterns
│ (in-memory sliding   │
│  window per channel) │
└────────┬────────────┘
         │ triggers when threshold met
         ▼
┌─────────────────────┐
│ Topic Summarizer     │  ← llama3.2:1b via Ollama
│ (summarize messages) │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Thread Index         │  ← SQLite/Prisma table
│ (id, description,   │
│  tags, metadata)     │
└────────┬────────────┘
         │ query with summary
         ▼
┌─────────────────────┐
│ Topic Router         │  ← llama3.2:1b via Ollama
│ (match or NEW)       │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Suggestion Emitter   │  ← Socket.io event to participants
│ (inline UI card)     │
└────────┘
```

### 7. Data Model Additions

```prisma
model ThreadIndex {
  id              String   @id @default(cuid())
  threadId        String?  // null if forum post
  postId          String?  // null if thread
  channelId       String
  title           String
  description     String   // LLM-generated summary
  tags            String   // comma-separated keywords
  approved        Boolean  @default(false)
  approvedBy      String?  // mod pubkey
  createdAt       DateTime @default(now())
  lastActivityAt  DateTime @default(now())
  messageCount    Int      @default(0)
}

model ConversationSuggestion {
  id              String   @id @default(cuid())
  channelId       String
  participants    String   // comma-separated pubkeys
  summary         String   // LLM-generated topic summary
  matchedThreadId String?  // null if NEW suggested
  suggestedTitle  String?  // non-null if NEW suggested
  status          String   @default("pending") // pending, accepted, dismissed
  createdAt       DateTime @default(now())
}
```

### 8. Future Enhancements

- **Semantic search:** Users can search the knowledge base using natural language
- **Auto-tagging:** LLM auto-generates tags for threads on creation
- **Conversation quality scoring:** Detect low-effort or off-topic messages
- **Cross-server knowledge:** Federated index across Obelisk instances
