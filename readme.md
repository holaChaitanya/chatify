
# Chatify: Headless Chat Client

Chatify is a browser-based headless chat client offering core functionality for messaging, data syncing, and offline persistence.

Architecture

Core Components

1. ChatCore: Main interface
2. Database: IndexedDB interactions
3. DataSyncer: Server synchronization
4. MessageScheduler: Message sending and retrying logix
5. EventEmitter: Pub/sub system

Key Functionalities

1. Real time messaging
2. Offline support
3. Data synchronization
4. Message retry mechanism (with exponential backoff)
5. Draft message management


