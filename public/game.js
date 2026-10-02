
const socket=io();
let selectedGame="sos", mode="pvp", room=null, me=null, selected=null; const urlRoom=new URLSearchParams(location.search).get("room");
const $=id=>document.getElementById(id);
const games=[["sos","SOS","5×5 strategy"],["connect4","Connect 4","4 in a row"],["dots","Dots & Boxes","Claim boxes"],["reversi","Reversi","Flip the board"],["chess","Chess","Classic board game"],["ludo","Ludo","Race home"]];
games.forEach(([id,n,d])=>{const x=document.createElement("button");x.className="game-card"+(id===selectedGame?" active":"");x.innerHTML=`<b>${n}</b><small>${d}</small>`;x.onclick=()=>{selectedGame=id;document.querySelectorAll(".game-card").forEach(e=>e.classList.remove("active"));x.classList.add("active")};$("games").append(x)});
document.querySelectorAll(".mode").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll(".mode").forEach(x=>x.classList.remove("active"));b.classList.add("active")});
$("create").onclick=()=>socket.emit("room:create",{name:$("name").value,game:selectedGame,mode});
$("join").onclick=()=>socket.emit("room:join",{name:$("name").value,code:$("roomCode").value});
$("share").onclick=async()=>{if(!room)return;const link=`${location.origin}/?room=${encodeURIComponent(room.code)}`;try{await navigator.share({title:"ArenaVerse room",text:`Join room ${room.code}`,url:link})}catch(e){try{await navigator.clipboard.writeText(link);alert("Room link copied")}catch(_){prompt("Copy room link:",link)}}};
$("ready").onclick=()=>socket.emit("room:ready");
$("start").onclick=()=>socket.emit("room:start");
$("rematch").onclick=()=>socket.emit("match:rematch");
$("leave").onclick=()=>location.reload();

socket.on("connect",()=>{$("status").textContent="ONLINE"});
socket.on("disconnect",()=>{$("status").textContent="RECONNECTING…"});
socket.on("error:msg",m=>alert(m));
socket.on("room:joined",r=>{room=r;me=socket.id;show("lobby");renderLobby();history.replaceState({}, "", `/?room=${encodeURIComponent(r.code)}`);$("share").classList.remove("hidden")});
if(urlRoom){$("roomCode").value=urlRoom.toUpperCase();}
socket.on("room:update",r=>{room=r;if($("lobby").classList.contains("hidden")===false)renderLobby()});
socket.on("game:start",r=>{room=r;show("game");$("result").innerHTML="";$("rematch").classList.add("hidden")});
socket.on("game:state",x=>{room=x.room;renderGame(x.state)});
socket.on("match:over",x=>{$("result").innerHTML=`<div class="rule"><b>Match complete.</b><br>${x.winner===null?"Draw":(x.winner===0?"Player 1":"Player 2")} wins.</div>`;$("rematch").classList.remove("hidden")});

function show(s){["home","lobby","game"].forEach(x=>$(x).classList.toggle("hidden",x!==s))}
function renderLobby(){
  $("code").textContent=room.code;
  $("players").innerHTML=room.players.map((p,i)=>`<div class="player"><span>${i===0?"👑 ":""}${escape(p.name)} ${p.connected?"":"(offline)"}</span><span>${p.ready?"READY":"NOT READY"}</span></div>`).join("");
  $("lobbyMsg").textContent=`${room.game.toUpperCase()} • ${room.mode==="pvc"?"PLAYER vs COMPUTER":"PLAYER vs PLAYER"} • Match ${room.matchNo+1}`;
}
function renderGame(g){
  $("gameName").textContent=room.game.toUpperCase()+" • "+(room.mode==="pvc"?"PLAYER vs COMPUTER":"PLAYER vs PLAYER");
  $("turnText").textContent=g.over?"MATCH OVER":`Turn: ${g.turn===0?"Player 1":"Player 2"}`;
  $("score").innerHTML=(g.scores?`<div class="scoreline"><b>Player 1</b><b>${g.scores[0]}</b></div><div class="scoreline"><b>Player 2</b><b>${g.scores[1]}</b></div>`:"");
  $("rules").innerHTML=`<div class="rule">${rules(room.game)}</div>`;
  const b=$("board");b.innerHTML="";
  if(g.type==="sos")renderSOS(b,g);
  if(g.type==="connect4")renderC4(b,g);
  if(g.type==="reversi")renderRev(b,g);
  if(g.type==="dots")renderDots(b,g);
  if(g.type==="chess")renderChess(b,g);
  if(g.type==="ludo")renderLudo(b,g);
}
function rules(g){return {sos:"Place S or O. Completing SOS scores a point and gives you another turn. Highest score wins.",connect4:"Drop pieces into columns. Four connected pieces wins.",dots:"Draw an edge. Completing a box scores it and gives another turn.",reversi:"Place a piece to bracket and flip opponent pieces. Most pieces wins.",chess:"Move pieces according to basic chess movement. Capture the king to end the match.",ludo:"Roll and move your token toward home. Rolling 6 lets you continue."}[g]}
function renderSOS(b,g){b.className="board";const grid=document.createElement("div");grid.className="grid sos";g.board.forEach((v,i)=>{const c=btn(v||"•");c.onclick=()=>{if(!v){const l=prompt("Type S or O","S");if(l)cAction({kind:"sos",pos:i,letter:l.toUpperCase()})}};grid.append(c)});b.append(grid)}
function renderC4(b,g){b.className="board";const grid=document.createElement("div");grid.className="grid c4";g.board.forEach((v,i)=>{const c=btn(v?`<span class="piece p${v}"></span>`:"");c.onclick=()=>cAction({kind:"connect4",col:i%7});grid.append(c)});b.append(grid)}
function renderRev(b,g){b.className="board";const grid=document.createElement("div");grid.className="grid rev";g.board.forEach((v,i)=>{const c=btn(v?`<span class="piece p${v}"></span>`:"");c.onclick=()=>cAction({kind:"reversi",pos:i});grid.append(c)});b.append(grid)}
function renderDots(b,g){b.className="board";const wrap=document.createElement("div");wrap.style.width="min(560px,100%)";for(let r=0;r<7;r++){if(r%2===0){const row=document.createElement("div");row.className="hrow";for(let c=0;c<4;c++){dot(row);edge(row,g.h[(r/2)*4+c],"h",(r/2)*4+c)}wrap.append(row)}else{const row=document.createElement("div");row.className="hrow";for(let c=0;c<4;c++){const col=document.createElement("div");col.className="vcol";edge(col,g.v[Math.floor(r/2)*3+c],"v",Math.floor(r/2)*3+c);row.append(col)}wrap.append(row)}}b.append(wrap)}
function dot(p){const d=document.createElement("span");d.className="dot";p.append(d)}
function edge(p,on,line,pos){const e=document.createElement("button");e.className="edge"+(on?" on":"");e.innerHTML="";e.onclick=()=>cAction({kind:"dots",line,pos});p.append(e)}
const pcs={wp:"♙",wr:"♖",wn:"♘",wb:"♗",wq:"♕",wk:"♔",bp:"♟",br:"♜",bn:"♞",bb:"♝",bq:"♛",bk:"♚"};
function renderChess(b,g){b.className="board";const grid=document.createElement("div");grid.className="grid chess";g.board.forEach((v,i)=>{const c=btn(pcs[v]||"");if(selected===i)c.classList.add("selected");c.onclick=()=>{if(selected===null&&v){selected=i;renderGame(g)}else if(selected!==null){cAction({kind:"chess",from:selected,to:i,promo:"q"});selected=null}};grid.append(c)});b.append(grid)}
function renderLudo(b,g){b.className="board";b.innerHTML=`<div class="panel" style="width:min(520px,100%);text-align:center"><h2>🎲 Ludo Race</h2><p class="muted">Each turn rolls a server-side die. A 6 brings a token onto the track. Reach home to win.</p><button class="primary" onclick="cAction({kind:'ludo',roll:1+Math.floor(Math.random()*6)})">ROLL DICE</button><p>Last roll: ${g.lastRoll??"—"}</p><p>Player 1: ${g.positions[0].filter(x=>x===51).length}/4 home</p><p>Player 2: ${g.positions[1].filter(x=>x===51).length}/4 home</p></div>`}
function btn(inner){const c=document.createElement("button");c.className="cell";c.innerHTML=inner;return c}
function cAction(a){socket.emit("game:action",a)}
function escape(x){return String(x).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
