# ArenaVerse v2

A server-authoritative multiplayer game hub.

## Included
- SOS: real rules, extra turn after making SOS, scoring, rounds, rematch
- Connect 4: win/draw detection
- Dots & Boxes: box scoring + extra turn
- Reversi: legal move validation + flips
- Chess: board/turn/capture/castling/promotion basics (not a tournament-grade chess engine)
- Ludo: turn/roll/capture/home basics
- PvP: room-based Socket.IO multiplayer
- PvC: server-controlled computer opponent
- Rematch and match history
- Ready/start flow
- Reconnect-safe player identity during a room session
- Server-side action validation
- Rate limiting for game actions
- Health endpoint

## Run on Windows

```bat
cd C:\Users\YOURNAME\Downloads\arena-verse-v2
npm install
npm start
```

Open http://localhost:3000

## Production
Deploy the Node server to a host that supports long-running Node.js + WebSockets.
Set `PORT` from the platform environment. Put HTTPS in front of it in production.

## Important
This is a real backend foundation, not a complete esports platform. Chess/Ludo still use a deliberately approachable rules implementation. For production competition, add a mature chess rules library, database, authentication, persistent ratings, anti-cheat, and durable match storage.
