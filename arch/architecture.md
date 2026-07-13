# Nosy Architecture

Nosy watches a Slack conversation for you, filters routine noise, and reaches out only when a decision, risk, promise, or direct question deserves your attention. In DMs, it also runs a game room and makes short Nosy Productions teasers from workspace gossip.

```mermaid
flowchart TB
    classDef slack fill:#611f69,stroke:#3d1342,color:#ffffff;
    classDef nosy fill:#1264a3,stroke:#0a3d68,color:#ffffff;
    classDef rts fill:#ecb22e,stroke:#8a6100,stroke-width:3px,color:#111111;
    classDef ext fill:#2eb67d,stroke:#1c6f4c,color:#ffffff;
    classDef data fill:#efefef,stroke:#999999,color:#111111;

    Follow["Run /nosy<br/>Follow a thread or channel"]:::slack
    Thread["New reply in a watched conversation"]:::slack
    Question["DM Nosy<br/>Ask, play games, or request a teaser"]:::slack

    Nosy["Nosy<br/>Filters noise, spots decisions and promises<br/>Also hosts games and Nosy Productions"]:::nosy

    Claude["Claude<br/>Reads the thread and writes movie-teaser prompts"]:::ext
    Memory[("Supabase<br/>Follows, memory, promises, conversation history")]:::data
    RTS["Slack Real-Time Search<br/>Finds real live workspace messages"]:::rts
    Gemini["Gemini Omni Flash<br/>Renders the Nosy Productions teaser"]:::ext

    Update["Notable update<br/>A short DM about a decision, risk, or blindspot"]:::slack
    Receipt["Receipt card<br/>Nudge, snooze, or close a stale promise"]:::slack
    Fun["DM fun<br/>Answers, games, and movie teasers"]:::slack

    Follow --> Thread --> Nosy
    Nosy --> Claude --> Nosy
    Nosy <--> Memory

    Question --> RTS --> Nosy
    Nosy --> Gemini

    Nosy --> Update
    Nosy --> Receipt
    Nosy --> Fun
```

Gold traces the path Nosy uses to look up live Slack messages when someone asks a question. Open `architecture.html` in a browser and screenshot it for the Devpost architecture upload.
