import React, { useEffect, useState } from "react";
import "../styles.css";

type Cell = 0 | 1 | 2; // 0 empty, 1 X, 2 O

// ---------- 规则 ----------
function calcWinner(b: Cell[]): Cell | -1 {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const [a,b2,c] of lines) {
    if (b[a] && b[a]===b[b2] && b[a]===b[c]) return b[a];
  }
  if (b.every(v => v!==0)) return -1; // draw
  return 0; // none
}

export default function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array<Cell>(9).fill(0));
  const [turn, setTurn] = useState<Cell>(1); // 1=X, 2=O
  const [winner, setWinner] = useState<Cell | -1>(0);
  const [moves, setMoves] = useState<number[]>([]); // 落子索引历史，便于悔棋

  // 人机对战 & 先手
  const [vsAI, setVsAI] = useState(false);
  const [aiSide, setAiSide] = useState<Cell>(2); // 默认 O 执机
  const [aiLevel, setAiLevel] = useState<'easy'|'normal'|'perfect'>('perfect'); // AI 强度

  const restart = () => {
    setBoard(Array<Cell>(9).fill(0));
    setTurn(1);
    setWinner(0);
    setMoves([]);
  };

  const undo = () => {
    if (!moves.length || winner) return;
    const last = moves[moves.length - 1];
    const next = board.slice();
    next[last] = 0;
    setBoard(next);
    setMoves(m => m.slice(0, -1));
    setTurn(t => (t === 1 ? 2 : 1));
  };

  const place = (i: number) => {
    if (winner || board[i] !== 0) return;
    const next = board.slice();
    next[i] = turn;
    setBoard(next);
    setMoves(m => [...m, i]);
    const w = calcWinner(next);
    if (w) { setWinner(w); return; }
    setTurn(turn===1?2:1);
  };

  // Minimax：小状态空间，加入 depth 奖惩（越快赢分越高，越晚输分越高），并做走法排序
  function minimax(board: Cell[], player: Cell, ai: Cell, depth = 0): { score: number; move: number } {
    const w = calcWinner(board);
    if (w === ai) return { score: 10 - depth, move: -1 };
    if (w && w !== ai) return { score: depth - 10, move: -1 };
    if (w === -1) return { score: 0, move: -1 };

    const order = [4,0,2,6,8,1,3,5,7]; // 中心>角>边
    let bestScore = player === ai ? -Infinity : Infinity;
    let bestMove = -1;

    for (const i of order) {
      if (board[i] !== 0) continue;
      const next = board.slice();
      next[i] = player;
      const { score } = minimax(next, player === 1 ? 2 : 1, ai, depth + 1);
      if (player === ai) {
        if (score > bestScore) { bestScore = score; bestMove = i; }
      } else {
        if (score < bestScore) { bestScore = score; bestMove = i; }
      }
    }
    if (bestMove === -1) return { score: 0, move: -1 };
    return { score: bestScore, move: bestMove };
  }

  function findImmediateWin(b: Cell[], who: Cell): number | -1 {
    for (let i = 0; i < 9; i++) {
      if (b[i] !== 0) continue;
      const n = b.slice(); n[i] = who;
      if (calcWinner(n) === who) return i;
    }
    return -1;
  }

  function bestHeuristic(b: Cell[]): number | -1 {
    const order = [4,0,2,6,8,1,3,5,7];
    for (const i of order) if (b[i] === 0) return i;
    return -1;
  }

  function computeAIMoveByLevel(b: Cell[], ai: Cell, level: 'easy'|'normal'|'perfect'): number {
    const human: Cell = ai === 1 ? 2 : 1;
    if (level === 'perfect') {
      return minimax(b, ai, ai).move;
    }
    // Normal：先查即胜，再查即堵，否则按启发中心>角>边
    const win = findImmediateWin(b, ai); if (win !== -1) return win;
    const block = findImmediateWin(b, human); if (block !== -1) return block;
    if (level === 'normal') {
      return bestHeuristic(b);
    }
    // Easy：有 20% 概率故意不堵；否则在可用格随机，带一点中心角偏好
    const empties = b.map((v,i)=> v===0? i : -1).filter(i=> i!==-1);
    if (empties.length === 0) return -1;
    if (Math.random() < 0.20 && block !== -1) {
      // 故意不堵：随机走
      return empties[Math.floor(Math.random()*empties.length)];
    }
    // 正常：50% 取启发点，否则随机
    if (Math.random() < 0.5) {
      const h = bestHeuristic(b); if (h !== -1) return h;
    }
    return empties[Math.floor(Math.random()*empties.length)];
  }

  // 键盘快捷键：1-9 对应格子；Z/⌫ 悔棋；R 重开
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); undo(); return; }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); restart(); return; }
      const idx = '123456789'.indexOf(e.key);
      if (idx >= 0) { e.preventDefault(); place(idx); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [board, winner, turn]);

  // 人机：AI 回合自动落子
  useEffect(() => {
    if (!vsAI || winner) return;
    if (turn !== aiSide) return;
    const id = setTimeout(() => {
      const mv = computeAIMoveByLevel(board, aiSide, aiLevel);
      if (mv !== -1) place(mv);
    }, 120);
    return () => clearTimeout(id);
  }, [vsAI, aiSide, board, turn, winner, aiLevel]);

  // 人机：AI 执先且开局无子时，自动走第一手
  useEffect(() => {
    if (!vsAI) return;
    const empty = board.every(v => v === 0);
    if (empty && aiSide === 1 && turn === 1 && !winner) {
      const mv = computeAIMoveByLevel(board, aiSide, aiLevel);
      if (mv !== -1) place(mv);
    }
  }, [vsAI, aiSide, aiLevel]);

  // ---------- UI ----------
  return (
    <>
      <div className="page-wrap">
        <div className="shell">
          <div className="left">
            <header className="page-header compact">
              <h1 className="title"># 井字棋 · TicTacToe</h1>
              <p className="subtitle">鼠标/触控点格子落子；X 先。支持悔棋/重开/人机对战（可切换先手）。</p>

              <div className="stats unified">
                <div className="chip"><div className="label">回合</div><div className="value">{turn===1?'X':'O'}</div></div>
                <div className="chip"><div className="label">结果</div><div className="value">{winner===0?'-': (winner===-1?'平局': (winner===1?'X 胜':'O 胜'))}</div></div>
                <button className="btn icon" onClick={undo} aria-label="悔棋">↩️ 悔棋</button>
                <button className="btn icon" onClick={restart} aria-label="重开">🔄 重开</button>
                <button className="btn secondary" onClick={()=> setVsAI(v=>!v)}>{vsAI?'🤖 人机：开':'🤖 人机：关'}</button>
                <button className="btn secondary" onClick={()=> setAiSide(s=> s===1?2:1)} disabled={moves.length>0}>电脑执{aiSide===1?'X':'O'}</button>
                <button className="btn secondary" onClick={()=> setAiLevel(l=> l==='easy' ? 'normal' : l==='normal' ? 'perfect' : 'easy')}>
                  强度：{aiLevel==='easy'?'简单':aiLevel==='normal'?'普通':'完美'}
                </button>
              </div>
            </header>

            {/* 棋盘卡片 */}
            <div id="board-wrap" className="board-card" style={{display:'flex',justifyContent:'center',alignItems:'center',width:'100%'}}>
              <div className="ttt-grid" style={{margin:'auto'}}>
                {board.map((v,i)=> (
                  <button key={i} onClick={()=>place(i)} className={`ttt-cell ${v===1? 'x':'o'} ${v===0? 'empty':''}`} aria-label={`cell-${i}`}>
                    {v===1? 'X' : v===2? 'O' : ''}
                  </button>
                ))}
              </div>

              {winner!==0 && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">{winner===-1? '🤝 平局' : winner===1? '🎉 X 获胜' : '🎉 O 获胜'}</div>
                    <div className="result-sub">再试一次，或切换到人机对战体验 AI 先/后手。</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={restart}>再来一局</button>
                      <a className="btn secondary" href="/">返回首页</a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 底部操作条 */}
          <div className="bottom-bar">
            <div className="actions">
              <button className="btn primary" onClick={restart}>再来一局</button>
              <a className="btn secondary" href="/">返回首页</a>
            </div>
            <p className="help">提示：键盘 1-9 也可落子；Z/⌫ 悔棋，R 重开；人机可切先手。</p>
          </div>
        </div>
      </div>

      <style>{`
        .page-wrap{ min-height:100vh; display:flex; align-items:flex-start; justify-content:center; padding:16px 24px 24px; background:radial-gradient(1000px 600px at 20% 0%,#f8fafc,#eef2f7); }
        .page-header{ width:min(100%,980px); margin:0 auto 14px; text-align:left; }
        .page-header.compact{ width:100%; margin:0 0 10px; }
        .page-header .title{ font-size:clamp(22px,3.2vw,32px); margin:0; }
        .page-header .subtitle{ font-size:14px; color:#475569; margin:6px 0 10px; }
        .shell{ width: min(100%, 980px); display:grid; grid-template-columns: 1fr; gap: 16px; align-items:start; }

        .board-card{ background: linear-gradient(135deg,#ffffff,#f1f5f9); border-radius: 16px; box-shadow: 0 10px 24px rgba(2,6,23,.12); padding: clamp(14px, 2.6vw, 20px); position:relative; }

        .title{ margin:0 0 6px; font-size:28px; font-weight:800; color:#0f172a; }
        .subtitle{ margin:0 0 12px; color:#475569; font-size:14px; }
        .stats{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:10px 0 14px; }
        .chip{ flex:0 0 auto; min-width:140px; background:#0f172a; color:#e2e8f0; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.06); }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }
        .btn.icon{ background:#6366f1; color:#fff; border:none; border-radius:12px; padding:10px 12px; font-weight:700; box-shadow: 0 6px 14px rgba(99,102,241,.25); }
        .actions{ display:flex; gap:12px; margin:8px 0 10px; }
        .btn{ appearance:none; border:none; border-radius:10px; padding:10px 14px; font-weight:700; cursor:pointer; }
        .btn.primary{ background:#10b981; color:#053a2b; box-shadow: 0 6px 14px rgba(16,185,129,.28); }
        .btn.primary:hover{ filter:brightness(1.06); }
        .btn.secondary{ background:#ffffff; color:#0f172a; border:1px solid #e2e8f0; }
        .btn.secondary:hover{ background:#f8fafc; }
        .help{ color:#64748b; font-size:12px; margin-top:6px; text-align:center; }
        .bottom-bar{ background: linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px; display:flex; align-items:center; justify-content:space-between; box-shadow: 0 10px 24px rgba(2,6,23,.08); }
        @media (max-width: 640px){ .bottom-bar{ flex-direction:column; gap:8px; align-items:stretch; text-align:center; } .bottom-bar .actions{ justify-content:center; } }

        .overlay{ position:absolute; inset:0; background:rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; border-radius:16px; backdrop-filter:saturate(140%) blur(2px); }
        .panel{ background:linear-gradient(135deg,#ffffff,#f8fafc); border:1px solid #e2e8f0; border-radius:14px; padding:16px; width:min(92%, 360px); text-align:center; box-shadow:0 20px 40px rgba(2,6,23,.25); }
        .result-title{ font-size:20px; font-weight:800; color:#0f172a; margin-bottom:6px; }
        .result-sub{ color:#475569; font-size:13px; margin-bottom:12px; }
        .overlay-actions{ display:flex; gap:10px; justify-content:center; }

        /* === 井字棋棋盘 === */
        #board-wrap.board-card{ display:flex; justify-content:center; align-items:center; width:100%; }
        .ttt-grid{ --size: clamp(72px, 16vw, 120px); --gap: clamp(8px, 2vw, 12px); display:grid; grid-template-columns: repeat(3, var(--size)); grid-template-rows: repeat(3, var(--size)); gap: var(--gap); justify-content:center; margin:auto; }
        .ttt-cell{ border-radius: 14px; background: linear-gradient(180deg,#ffffff,#f1f5f9); border:1px solid #e2e8f0; box-shadow: 0 10px 24px rgba(2,6,23,.08), inset 0 -4px 8px rgba(2,6,23,.04); font-weight:800; font-size: clamp(28px, 6vw, 48px); color:#0f172a; display:flex; align-items:center; justify-content:center; user-select:none; transition: transform .08s ease, background .2s ease; }
        .ttt-cell.empty:hover{ background:#f8fafc; transform: translateY(-1px); }
        .ttt-cell.x{ color:#111827; text-shadow: 0 1px 0 rgba(255,255,255,.6); }
        .ttt-cell.o{ color:#0b5d91; text-shadow: 0 1px 0 rgba(255,255,255,.6); }
      `}</style>
    </>
  );
}
