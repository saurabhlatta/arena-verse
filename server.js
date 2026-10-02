
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const app = express();
const httpServer = http.createServer(app);
app.set("trust proxy", 1);
const io = new Server(httpServer, {
  pingInterval: 5000,
  pingTimeout: 10000,
  maxHttpBufferSize: 1e5,
  transports: ["websocket", "polling"]
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/api/room/:code", (req,res)=>{
  const r=rooms.get(String(req.params.code||"").toUpperCase());
  if(!r) return res.status(404).json({ok:false,error:"Room not found"});
  res.json({ok:true,room:publicRoom(r)});
});
app.get("/health", (_, res) => res.json({
  ok: true,
  service: "ArenaVerse",
  version: "2.0.0",
  rooms: rooms.size,
  uptime: Math.round(process.uptime())
}));

const rooms = new Map();
const MAX_PLAYERS = 16;
const GAMES = {
  sos: { name: "SOS", min: 2, max: 2, modes: ["pvp","pvc"] },
  connect4: { name: "Connect 4", min: 2, max: 2, modes: ["pvp","pvc"] },
  dots: { name: "Dots & Boxes", min: 2, max: 2, modes: ["pvp","pvc"] },
  reversi: { name: "Reversi", min: 2, max: 2, modes: ["pvp","pvc"] },
  chess: { name: "Chess", min: 2, max: 2, modes: ["pvp","pvc"] },
  ludo: { name: "Ludo", min: 2, max: 2, modes: ["pvp","pvc"] }
};

const sessions = new Map(); // socketId -> {roomCode, playerId}
const actionWindow = new Map();

function id() { return Math.random().toString(36).slice(2, 10); }
function code() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function clampName(n) { return String(n || "Player").trim().slice(0, 18) || "Player"; }
function cleanGame(g) { return GAMES[g] ? g : "sos"; }

function rateLimit(socketId) {
  const now = Date.now();
  let a = actionWindow.get(socketId) || [];
  a = a.filter(t => now - t < 1000);
  if (a.length >= 15) return false;
  a.push(now); actionWindow.set(socketId, a);
  return true;
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function publicRoom(room) {
  return {
    code: room.code, hostId: room.hostId, game: room.game, mode: room.mode,
    started: room.started, players: room.players.map(p => ({
      id: p.id, name: p.name, ready: p.ready, connected: p.connected,
      team: p.team, color: p.color, score: p.score
    })),
    matchNo: room.matchNo, history: room.history.slice(-10)
  };
}
function player(room, pid) { return room.players.find(p => p.id === pid); }
function activePlayers(room) { return room.players.filter(p => p.connected); }

function makeGame(game, mode) {
  if (game === "sos") return {
    type:"sos", size:5, board:Array(25).fill(""), turn:0, scores:[0,0], round:1, over:false
  };
  if (game === "connect4") return {
    type:"connect4", rows:6, cols:7, board:Array(42).fill(""), turn:0, scores:[0,0], over:false
  };
  if (game === "dots") return {
    type:"dots", rows:4, cols:4, h:Array(3*4).fill(false), v:Array(4*3).fill(false),
    turn:0, scores:[0,0], over:false
  };
  if (game === "reversi") {
    const b=Array(64).fill(0);
    b[27]=2;b[28]=1;b[35]=1;b[36]=2;
    return {type:"reversi", board:b, turn:0, scores:[2,2], over:false};
  }
  if (game === "chess") return {
    type:"chess", board:chessInitial(), turn:0, over:false, winner:null, castling:{wK:true,wQ:true,bK:true,bQ:true}
  };
  if (game === "ludo") return {
    type:"ludo", turn:0, scores:[0,0], over:false,
    tokens:[[0,0,0,0],[0,0,0,0]], positions:[[-1,-1,-1,-1],[-1,-1,-1,-1]], lastRoll:null
  };
}

function chessInitial() {
  const r = Array(64).fill("");
  const back = ["r","n","b","q","k","b","n","r"];
  for(let i=0;i<8;i++){r[i]="b"+back[i];r[8+i]="bp";r[48+i]="wp";r[56+i]="w"+back[i];}
  return r;
}
function rc(i){return [Math.floor(i/8),i%8]}
function idx(r,c){return r*8+c}
function colorOf(x){return x ? x[0] : ""}
function typeOf(x){return x ? x[1] : ""}

function sosAction(g, p, pos, letter) {
  if(g.over || p !== g.turn || !Number.isInteger(pos) || pos<0 || pos>=25 || g.board[pos]) return {ok:false};
  if(letter !== "S" && letter !== "O") return {ok:false};
  g.board[pos]=letter;
  const r=Math.floor(pos/5), c=pos%5;
  let made=0;
  const dirs=[[0,1],[1,0],[1,1],[1,-1]];
  for(const [dr,dc] of dirs){
    for(let k=-2;k<=0;k++){
      const cells=[];
      for(let z=0;z<3;z++){let rr=r+(k+z)*dr,cc=c+(k+z)*dc;
        if(rr<0||rr>=5||cc<0||cc>=5){cells.length=0;break}
        cells.push(g.board[rr*5+cc]);
      }
      if(cells.join("")==="SOS") made++;
    }
  }
  g.scores[p]+=made;
  if(g.board.every(Boolean)) g.over=true;
  if(!g.over && made===0) g.turn=1-p;
  return {ok:true, extra:made>0};
}

function connect4Action(g,p,col){
  if(g.over||p!==g.turn||col<0||col>=7)return {ok:false};
  let row=-1;
  for(let r=5;r>=0;r--) if(!g.board[r*7+col]){row=r;break}
  if(row<0)return {ok:false};
  g.board[row*7+col]=p+1;
  const dirs=[[1,0],[0,1],[1,1],[1,-1]];
  const count=(r,c,dr,dc)=>{
    let n=0;
    while(r>=0&&r<6&&c>=0&&c<7&&g.board[r*7+c]===p+1){n++;r+=dr;c+=dc}
    return n;
  };
  if(dirs.some(([dr,dc])=>count(row,col,dr,dc)+count(row,col,-dr,-dc)-1>=4)){g.over=true;g.winner=p}
  else if(g.board.every(Boolean))g.over=true;
  else g.turn=1-p;
  return {ok:true};
}

function dotsAction(g,p,kind,pos){
  if(g.over||p!==g.turn||!Number.isInteger(pos)||pos<0)return {ok:false};
  const arr=kind==="h"?g.h:g.v;
  if(pos>=arr.length||arr[pos])return {ok:false};
  arr[pos]=true;
  let made=0;
  if(kind==="h"){
    const r=Math.floor(pos/4),c=pos%4;
    if(r>0&&g.h[(r-1)*4+c]&&g.v[(r-1)*3+c]&&g.v[(r-1)*3+c+1])made++;
    if(r<3&&g.h[(r+1)*4+c]&&g.v[r*3+c]&&g.v[r*3+c+1])made++;
  } else {
    const r=Math.floor(pos/3),c=pos%3;
    if(c>0&&g.v[r*3+c-1]&&g.h[r*4+c-1]&&g.h[(r+1)*4+c-1])made++;
    if(c<3&&g.v[r*3+c+1]&&g.h[r*4+c]&&g.h[(r+1)*4+c])made++;
  }
  g.scores[p]+=made;
  const total=g.h.filter(Boolean).length+g.v.filter(Boolean).length;
  if(total===24)g.over=true;
  if(!g.over&&made===0)g.turn=1-p;
  return {ok:true};
}

function reversiLegal(g,p){
  const me=p+1,op=2-p, out=[];
  const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for(let i=0;i<64;i++){
    if(g.board[i])continue; const [r,c]=rc(i); let good=false;
    for(const [dr,dc] of dirs){
      let rr=r+dr,cc=c+dc,n=0;
      while(rr>=0&&rr<8&&cc>=0&&cc<8&&g.board[idx(rr,cc)]===op){n++;rr+=dr;cc+=dc}
      if(n&&rr>=0&&rr<8&&cc>=0&&cc<8&&g.board[idx(rr,cc)]===me){good=true;break}
    }
    if(good)out.push(i);
  } return out;
}
function reversiAction(g,p,pos){
  if(g.over||p!==g.turn||!reversiLegal(g,p).includes(pos))return {ok:false};
  const me=p+1,op=2-p,[r,c]=rc(pos),dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  g.board[pos]=me;
  for(const [dr,dc] of dirs){
    let rr=r+dr,cc=c+dc,run=[];
    while(rr>=0&&rr<8&&cc>=0&&cc<8&&g.board[idx(rr,cc)]===op){run.push(idx(rr,cc));rr+=dr;cc+=dc}
    if(run.length&&rr>=0&&rr<8&&cc>=0&&cc<8&&g.board[idx(rr,cc)]===me)run.forEach(i=>g.board[i]=me);
  }
  g.scores=[g.board.filter(x=>x===1).length,g.board.filter(x=>x===2).length];
  const other=1-p;
  if(reversiLegal(g,other).length)g.turn=other;
  else if(reversiLegal(g,p).length)g.turn=p;
  else g.over=true;
  return {ok:true};
}

function chessLegal(g,p,from,to){
  const b=g.board, piece=b[from]; if(!piece||colorOf(piece)!==(p?"b":"w")||b[to]&&colorOf(b[to])===colorOf(piece))return false;
  const [r,c]=rc(from),[tr,tc]=rc(to),dr=tr-r,dc=tc-c,t=typeOf(piece);
  const clearLine=(sr,sc)=>{
    let rr=r+sr,cc=c+sc;
    while(rr!==tr||cc!==tc){if(b[idx(rr,cc)])return false;rr+=sr;cc+=sc} return true;
  };
  if(t==="p"){
    const d=p?1:-1,start=p?1:6;
    if(dc===0&&!b[to]&&dr===d)return true;
    if(dc===0&&!b[to]&&r===start&&dr===2*d&&!b[idx(r+d,c)])return true;
    return Math.abs(dc)===1&&dr===d&&!!b[to];
  }
  if(t==="n")return (Math.abs(dr)===2&&Math.abs(dc)===1)||(Math.abs(dr)===1&&Math.abs(dc)===2);
  if(t==="b")return Math.abs(dr)===Math.abs(dc)&&clearLine(Math.sign(dr),Math.sign(dc));
  if(t==="r")return (dr===0||dc===0)&&clearLine(Math.sign(dr),Math.sign(dc));
  if(t==="q")return ((dr===0||dc===0)||Math.abs(dr)===Math.abs(dc))&&clearLine(Math.sign(dr),Math.sign(dc));
  if(t==="k")return Math.max(Math.abs(dr),Math.abs(dc))===1;
  return false;
}
function chessAction(g,p,from,to,promo){
  if(g.over||p!==g.turn||!Number.isInteger(from)||!Number.isInteger(to)||!chessLegal(g,p,from,to))return {ok:false};
  const piece=g.board[from], target=g.board[to]; g.board[to]=piece;g.board[from]="";
  if(typeOf(piece)==="p"&&(rc(to)[0]===0||rc(to)[0]===7))g.board[to]=(p?"b":"w")+(promo&&["q","r","b","n"].includes(promo)?promo:"q");
  if(target&&typeOf(target)==="k"){g.over=true;g.winner=p;return {ok:true}}
  g.turn=1-p; return {ok:true};
}

function ludoAction(g,p,roll){
  if(g.over||p!==g.turn||!Number.isInteger(roll)||roll<1||roll>6)return {ok:false};
  g.lastRoll=roll;
  // Simplified but deterministic race: a 6 enters a token; later rolls advance the first active token.
  let t=g.positions[p].findIndex(x=>x>=0&&x<51);
  if(roll===6&&g.positions[p].every(x=>x<0))t=0;
  if(t<0)t=0;
  if(g.positions[p][t]<0){if(roll!==6){g.turn=1-p;return {ok:true,changed:false}}g.positions[p][t]=0}
  else g.positions[p][t]+=roll;
  if(g.positions[p][t]>=51)g.positions[p][t]=51;
  if(g.positions[p].every(x=>x===51)){g.over=true;g.winner=p}else if(roll!==6)g.turn=1-p;
  return {ok:true};
}

function randomLegalAction(g,p){
  if(g.type==="sos"){
    const empty=g.board.map((x,i)=>x?null:i).filter(x=>x!==null);
    if(!empty.length)return null; return {kind:"sos",pos:empty[Math.floor(Math.random()*empty.length)],letter:Math.random()<.5?"S":"O"};
  }
  if(g.type==="connect4"){const a=[0,1,2,3,4,5,6].filter(c=>!g.board[c]);return a.length?{kind:"connect4",col:a[Math.floor(Math.random()*a.length)]}:null}
  if(g.type==="dots"){const a=[];g.h.forEach((x,i)=>!x&&a.push({kind:"dots",line:"h",pos:i}));g.v.forEach((x,i)=>!x&&a.push({kind:"dots",line:"v",pos:i}));return a.length?a[Math.floor(Math.random()*a.length)]:null}
  if(g.type==="reversi"){const a=reversiLegal(g,p);return a.length?{kind:"reversi",pos:a[Math.floor(Math.random()*a.length)]}:null}
  if(g.type==="chess"){for(let f=0;f<64;f++)for(let t=0;t<64;t++)if(chessLegal(g,p,f,t))return {kind:"chess",from:f,to:t,promo:"q"};return null}
  if(g.type==="ludo")return {kind:"ludo",roll:1+Math.floor(Math.random()*6)};
}

function applyAction(g,p,a){
  if(a.kind==="sos")return sosAction(g,p,a.pos,a.letter);
  if(a.kind==="connect4")return connect4Action(g,p,a.col);
  if(a.kind==="dots")return dotsAction(g,p,a.line,a.pos);
  if(a.kind==="reversi")return reversiAction(g,p,a.pos);
  if(a.kind==="chess")return chessAction(g,p,a.from,a.to,a.promo);
  if(a.kind==="ludo")return ludoAction(g,p,a.roll);
  return {ok:false};
}

function startRoom(room){
  room.started=true; room.matchNo++;
  room.gameState=makeGame(room.game,room.mode);
  room.players.forEach((p,i)=>{p.ready=false;p.score=0;p.color=i===0?"w":"b"});
  io.to(room.code).emit("game:start", publicRoom(room));
  emitState(room);
  if(room.mode==="pvc" && room.gameState.turn===1) computerTurn(room);
}
function emitState(room){
  io.to(room.code).emit("game:state",{game:room.game, state:room.gameState, room:publicRoom(room)});
}
function computerTurn(room){
  if(!room.started||room.mode!=="pvc"||room.gameState.over||room.gameState.turn!==1)return;
  setTimeout(()=>{
    if(!room.started||room.gameState.over||room.gameState.turn!==1)return;
    const a=randomLegalAction(room.gameState,1); if(!a)return;
    const result=applyAction(room.gameState,1,a);
    if(result.ok){emitState(room);if(room.gameState.turn===1&&!room.gameState.over)computerTurn(room);finishIfOver(room)}
  },350+Math.random()*650);
}
function finishIfOver(room){
  if(!room.gameState.over)return;
  room.history.push({
    match:room.matchNo, game:room.game, winner:room.gameState.winner ?? null,
    scores:room.gameState.scores||null, at:new Date().toISOString()
  });
  room.started=false;
  io.to(room.code).emit("match:over",{winner:room.gameState.winner??null,history:room.history.slice(-10)});
  emitRoom(room);
}

io.on("connection",socket=>{
  socket.on("room:create",({name,game,mode})=>{
    game=cleanGame(game); mode=mode==="pvc"?"pvc":"pvp";
    const c=code(), pid=id();
    const room={code:c,hostId:pid,game,mode,started:false,matchNo:0,history:[],players:[],gameState:null};
    room.players.push({id:pid,name:clampName(name),ready:false,connected:true,team:0,score:0,color:"w"});
    rooms.set(c,room);sessions.set(socket.id,{roomCode:c,playerId:pid});socket.join(c);
    socket.emit("room:joined",publicRoom(room));emitRoom(room);
  });

  socket.on("room:join",({name,code:c})=>{
    c=String(c||"").trim().toUpperCase();const room=rooms.get(c);
    if(!room)return socket.emit("error:msg","Room not found.");
    if(room.started)return socket.emit("error:msg","Match already running.");
    if(room.players.length>=MAX_PLAYERS)return socket.emit("error:msg","Room is full.");
    if(room.mode==="pvc"&&room.players.length>=1)return socket.emit("error:msg","This room is Player vs Computer.");
    const pid=id();room.players.push({id:pid,name:clampName(name),ready:false,connected:true,team:room.players.length%2,score:0,color:room.players.length?"b":"w"});
    sessions.set(socket.id,{roomCode:c,playerId:pid});socket.join(c);socket.emit("room:joined",publicRoom(room));emitRoom(room);
  });

  socket.on("room:ready",()=>{
    if(!rateLimit(socket.id))return;
    const s=sessions.get(socket.id),r=s&&rooms.get(s.roomCode);if(!r)return;
    const p=player(r,s.playerId);if(p){p.ready=!p.ready;emitRoom(r)}
  });
  socket.on("room:start",()=>{
    if(!rateLimit(socket.id))return;
    const s=sessions.get(socket.id),r=s&&rooms.get(s.roomCode);if(!r)return;
    if(r.hostId!==s.playerId)return socket.emit("error:msg","Only the host can start.");
    const needed=r.mode==="pvc"?1:2;
    if(activePlayers(r).length<needed)return socket.emit("error:msg",`Need ${needed} player(s).`);
    if(r.mode==="pvp"&&!activePlayers(r).every(p=>p.ready))return socket.emit("error:msg","All players must be ready.");
    startRoom(r);
  });

  socket.on("game:action",a=>{
    if(!rateLimit(socket.id))return;
    const s=sessions.get(socket.id),r=s&&rooms.get(s.roomCode);if(!r||!r.started)return;
    const p=r.players.findIndex(x=>x.id===s.playerId);if(p<0)return;
    if(r.mode==="pvc"&&p===1)return;
    const result=applyAction(r.gameState,p,a||{});
    if(!result.ok)return socket.emit("error:msg","Invalid move.");
    emitState(r);finishIfOver(r);
    if(r.started&&r.mode==="pvc"&&r.gameState.turn===1)computerTurn(r);
  });

  socket.on("match:rematch",()=>{
    const s=sessions.get(socket.id),r=s&&rooms.get(s.roomCode);if(!r)return;
    if(r.started)return;
    if(r.hostId!==s.playerId)return socket.emit("error:msg","Only the host can rematch.");
    startRoom(r);
  });

  socket.on("disconnect",()=>{
    const s=sessions.get(socket.id);if(!s)return;
    const r=rooms.get(s.roomCode);sessions.delete(socket.id);actionWindow.delete(socket.id);
    if(!r)return;
    const p=player(r,s.playerId);if(p)p.connected=false;
    if(r.hostId===s.playerId){const next=activePlayers(r)[0];if(next)r.hostId=next.id}
    if(activePlayers(r).length===0){rooms.delete(r.code);return}
    emitRoom(r);
  });
});

const PORT=process.env.PORT||3000;
httpServer.listen(PORT,()=>console.log(`ArenaVerse v2 running on http://localhost:${PORT}`));
