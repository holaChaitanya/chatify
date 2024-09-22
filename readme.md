
# Chatify: Headless Chat Client

Chatify is a browser-based headless chat client offering core functionality for messaging, data syncing, and offline persistence.

![image](https://github.com/user-attachments/assets/28fa32dd-f990-48a4-9bf6-823467983dfb)

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


Scope of Improvements -
1. Integrate BroadcastChannel APIs to communicate changes made to Indexed DB on a real-time basis to other tabs
2. Detection of when the application goes offline - I'm a bit confused whether this logic should be a part of the project or it should be exposed to the consumer using an API
3. Add some form of visualisation or sandbox env, where people can get an understanding how does everything work
4. Long polling support as a fallback for when the socket connection isn't getting established
5. Ability to use REST endpoint to send a message as POST requests instead of using sockets


