# ArenaVerse Internet Deployment

1. Upload this project to a GitHub repository.
2. Create a Render Web Service from that repository.
3. Build command: npm install
4. Start command: npm start
5. Render provides an HTTPS public URL.
6. Anyone can open it from any Wi-Fi/mobile network/device.

Room links:
https://YOUR-DOMAIN/?room=ABC123

Socket.IO connects to the same HTTPS origin and uses secure WebSockets.

For a serious public launch, add persistent database/Redis, accounts, matchmaking, durable match history, edge rate limiting, moderation, monitoring, backups, and a complete chess rules engine.
