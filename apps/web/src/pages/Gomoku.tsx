import React, { useEffect, useMemo, useRef, useState } from "react";
import '../styles.css';

// ===== 配置 =====
const SIZE = 15; // 15x15
const STAR_POINTS = [3, 7, 11].flatMap(r => [3, 7, 11].map(c => ({ r, c })));
const LETTERS = Array.from({ length: SIZE }, (_, i) => String.fromCharCode("A".charCodeAt(0) + i));
const PADDING = 24; // 画布内边距
const MIN_CELL = 32; // 最小格距

const UI = {
  btn: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#ffffff',
    color: '#374151',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    cursor: 'pointer'
  } as React.CSSProperties,
  btnPrimary: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid #111827',
    background: '#111827',
    color: '#ffffff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
    cursor: 'pointer'
  } as React.CSSProperties,
  card: {
    borderRadius: 16,
    background: '#ffffff',
    boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
  } as React.CSSProperties,
  inner: {
    borderRadius: 12,
    background: '#f9fafb',
    boxShadow: 'inset 0 0 0 1px #e5e7eb',
    padding: '12px 16px'
  } as React.CSSProperties,
  title: {
    fontSize: 24,
    fontWeight: 800,
    color: '#1f2937',
    margin: 0
  } as React.CSSProperties
};

// 0 空，1 黑（先手），2 白
type Cell = 0 | 1 | 2;

function findWin(board: Cell[][], r: number, c: number, who: Cell): { r:number; c:number }[] | null {
  if (who === 0) return null;
  const dirs = [[1,0],[0,1],[1,1],[1,-1]] as const;
  for (const [dr,dc] of dirs) {
    const line: {r:number;c:number}[] = [{r,c}];
    for (let k=1;k<5;k++){ const nr=r+dr*k,nc=c+dc*k; if(nr<0||nr>=SIZE||nc<0||nc>=SIZE||board[nr][nc]!==who) break; line.push({r:nr,c:nc});}
    for (let k=1;k<5;k++){ const nr=r-dr*k,nc=c-dc*k; if(nr<0||nr>=SIZE||nc<0||nc>=SIZE||board[nr][nc]!==who) break; line.unshift({r:nr,c:nc});}
    if (line.length>=5) return line.slice(0,5);
  }
  return null;
}

export default function Gomoku(){
  const wrapRef = useRef<HTMLDivElement|null>(null);
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const [boardPx, setBoardPx] = useState(600); // 画布边长（CSS 像素）
  const [cell, setCell] = useState(MIN_CELL);  // 格距（CSS 像素）
  const [board, setBoard] = useState<Cell[][]>(()=>Array.from({length:SIZE},()=>Array<Cell>(SIZE).fill(0)));
  const [turn, setTurn] = useState<Cell>(1);
  const [winner, setWinner] = useState<Cell>(0);
  const [moves, setMoves] = useState<{r:number;c:number}[]>([]);
  const [hover, setHover] = useState<{r:number;c:number}|null>(null);
  const [winLine, setWinLine] = useState<{r:number;c:number}[]|null>(null);
  const [vsAI, setVsAI] = useState(false);           // 人机对战开关
  const [aiColor, setAiColor] = useState<Cell>(2);   // 电脑执子：默认白子(2)
  const [aiLevel, setAiLevel] = useState<'easy'|'normal'|'strong'>('normal'); // 思考强度

  // 自适应：根据容器宽度推算 boardPx 与 cell
  useEffect(()=>{
    const compute = (w:number)=>{
      const avail = Math.max(340, Math.min(820, Math.floor(w)));
      const cellSize = Math.max(MIN_CELL, Math.floor((avail - PADDING*2)/(SIZE-1)));
      setCell(cellSize);
      setBoardPx(cellSize*(SIZE-1)+PADDING*2);
    };
    const resize = ()=> compute(wrapRef.current?.clientWidth||600);
    resize();
    window.addEventListener('resize', resize);
    // ResizeObserver 更稳
    const ro = (window as any).ResizeObserver ? new (window as any).ResizeObserver(resize) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    return ()=>{ window.removeEventListener('resize', resize); ro?.disconnect(); };
  },[]);

  // 计算像素坐标
  const posX = (c:number)=> PADDING + c*cell;
  const posY = (r:number)=> PADDING + r*cell;

  // ===== 简易 AI：优先级 = 自己一招获胜 > 挡对手一招获胜 > 做长连（带空位）> 居中偏好 =====
  const dirs4 = [[1,0],[0,1],[1,1],[1,-1]] as const;

  const canWinAt = (b: Cell[][], r: number, c: number, who: Cell) => {
    if (b[r][c] !== 0) return false;
    const nb = b.map(row => row.slice());
    nb[r][c] = who;
    return !!findWin(nb, r, c, who);
  };

  const countLine = (b: Cell[][], r: number, c: number, dr: number, dc: number, who: Cell) => {
    let cntPos = 0, rr = r + dr, cc = c + dc;
    while (rr>=0 && rr<SIZE && cc>=0 && cc<SIZE && b[rr][cc] === who) { cntPos++; rr += dr; cc += dc; }
    let openPos = (rr>=0 && rr<SIZE && cc>=0 && cc<SIZE && b[rr][cc] === 0) ? 1 : 0;
    let cntNeg = 0; rr = r - dr; cc = c - dc;
    while (rr>=0 && rr<SIZE && cc>=0 && cc<SIZE && b[rr][cc] === who) { cntNeg++; rr -= dr; cc -= dc; }
    let openNeg = (rr>=0 && rr<SIZE && cc>=0 && cc<SIZE && b[rr][cc] === 0) ? 1 : 0;
    const total = 1 + cntPos + cntNeg;
    const open = openPos + openNeg; // 0~2
    return { total, open };
  };

  const scoreCell = (b: Cell[][], r: number, c: number, me: Cell) => {
    if (b[r][c] !== 0) return -Infinity;
    const opp: Cell = me === 1 ? 2 : 1;

    // 立刻胜 / 立刻被对手赢 的强力规则
    if (canWinAt(b, r, c, me)) return 1e9;           // 自己一招赢
    if (canWinAt(b, r, c, opp)) return 1e9 - 1;      // 先堵对手

    let sMe = 0, sOpp = 0;
    for (const [dr, dc] of dirs4) {
      const a = countLine(b, r, c, dr, dc, me);
      const b2 = countLine(b, r, c, dr, dc, opp);
      // 带开放端的长连更有价值；四连>三连>二连；开放端越多越好
      sMe += Math.pow(a.total, 4) * (1 + a.open);
      sOpp += Math.pow(b2.total, 4) * (1 + b2.open);
    }
    // 中心偏好（越靠近中心分越高）
    const center = (SIZE - 1) / 2;
    const dist = Math.abs(r - center) + Math.abs(c - center);
    const centerBonus = 200 - dist * 5;

    return sMe + sOpp * 0.9 + centerBonus;
  };

  const computeAiMove = (b: Cell[][], me: Cell) => {
    let best = -Infinity, br = -1, bc = -1;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const sc = scoreCell(b, r, c, me);
        if (sc > best) { best = sc; br = r; bc = c; }
      }
    }
    return { r: br, c: bc };
  };

  // ===== 候选点生成与“加强”搜索 =====
  const hasNeighbor = (b: Cell[][], r: number, c: number, dist = 2) => {
    for (let dr = -dist; dr <= dist; dr++) {
      for (let dc = -dist; dc <= dist; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr, cc = c + dc;
        if (rr>=0 && rr<SIZE && cc>=0 && cc<SIZE && b[rr][cc] !== 0) return true;
      }
    }
    return false;
  };

  const genCandidates = (b: Cell[][], me: Cell) => {
    const list: {r:number;c:number;score:number}[] = [];
    let hasAny = false;
    for (let r=0;r<SIZE;r++) { for (let c=0;c<SIZE;c++) { if (b[r][c]!==0) { hasAny = true; break; } } if (hasAny) break; }
    if (!hasAny) {
      const mid = Math.floor((SIZE-1)/2);
      return [{ r: mid, c: mid, score: Infinity }];
    }
    for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) {
      if (b[r][c]!==0) continue;
      if (!hasNeighbor(b,r,c,2)) continue;
      const sc = scoreCell(b, r, c, me);
      if (sc === -Infinity) continue;
      list.push({ r, c, score: sc });
    }
    list.sort((a,b2)=> b2.score - a.score);
    return list;
  };

  const computeAiMoveStrong = (b: Cell[][], me: Cell) => {
    const opp: Cell = me===1?2:1;
    // 先查必胜/必堵
    for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (canWinAt(b,r,c,me)) return {r,c};
    for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (canWinAt(b,r,c,opp)) return {r,c};

    const cand = genCandidates(b, me);
    const TOP_ME = 24;  // 我方候选束宽
    const TOP_OP = 12;  // 对手候选束宽
    let bestScore = -Infinity, br = -1, bc = -1;
    for (const {r,c,score:base} of cand.slice(0, TOP_ME)) {
      const nb = b.map(row=>row.slice());
      nb[r][c] = me;
      // 若此步直接胜
      if (findWin(nb, r, c, me)) return { r, c };
      // 估计对方最佳反击
      let worst = Infinity;
      const oppCand = genCandidates(nb, opp).slice(0, TOP_OP);
      if (oppCand.length === 0) {
        return { r, c };
      }
      for (const oc of oppCand) {
        const nb2 = nb.map(row=>row.slice());
        nb2[oc.r][oc.c] = opp;
        if (findWin(nb2, oc.r, oc.c, opp)) { worst = -1e8; break; }
        // 我方局面再评估
        const back = genCandidates(nb2, me)[0]?.score ?? 0;
        worst = Math.min(worst, back);
      }
      const final = Math.min(base, worst);
      if (final > bestScore) { bestScore = final; br = r; bc = c; }
    }
    if (br!==-1) return { r: br, c: bc };
    // 退化到普通
    return computeAiMove(b, me);
  };

  const computeAiMoveLevel = (b: Cell[][], me: Cell) => {
    if (aiLevel === 'strong') return computeAiMoveStrong(b, me);
    if (aiLevel === 'easy') {
      // 简单：在前 4 个候选中随机选一个，且有 10% 几率不堵对手（更像初学者）
      const opp: Cell = me===1?2:1;
      const mustWin: {r:number;c:number}[] = [];
      const mustBlock: {r:number;c:number}[] = [];
      for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) {
        if (canWinAt(b,r,c,me)) mustWin.push({r,c});
        else if (canWinAt(b,r,c,opp)) mustBlock.push({r,c});
      }
      if (mustWin.length) return mustWin[0];
      if (Math.random() > 0.10 && mustBlock.length) return mustBlock[0];
      const cand = genCandidates(b, me).slice(0, 4);
      if (cand.length) {
        const pick = cand[Math.floor(Math.random()*cand.length)];
        return { r: pick.r, c: pick.c };
      }
      return computeAiMove(b, me);
    }
    // normal：原本的启发式
    return computeAiMove(b, me);
  };

  // 绘制
  useEffect(()=>{
    const cvs = canvasRef.current; if(!cvs) return;
    const ctx = cvs.getContext('2d'); if(!ctx) return;
    const dpr = Math.max(1, (window.devicePixelRatio||1));
    // 设置画布像素尺寸，确保清晰
    cvs.style.width = `${boardPx}px`;
    cvs.style.height = `${boardPx}px`;
    cvs.width = Math.round(boardPx*dpr);
    cvs.height = Math.round(boardPx*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);

    // 背景
    ctx.clearRect(0,0,boardPx,boardPx);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,boardPx,boardPx);

    // 边框与阴影
    ctx.save();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5,0.5,boardPx-1,boardPx-1);
    ctx.restore();

    // 网格
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    for(let i=0;i<SIZE;i++){
      const y = Math.round(posY(i))+0.5, x = Math.round(posX(i))+0.5;
      // 横线
      ctx.beginPath(); ctx.moveTo(PADDING+0.5,y); ctx.lineTo(boardPx-PADDING-0.5,y); ctx.stroke();
      // 竖线
      ctx.beginPath(); ctx.moveTo(x,PADDING+0.5); ctx.lineTo(x,boardPx-PADDING-0.5); ctx.stroke();
    }

    // 星位
    ctx.fillStyle = '#94a3b8';
    for (const {r,c} of STAR_POINTS){
      ctx.beginPath(); ctx.arc(posX(c), posY(r), 2.5, 0, Math.PI*2); ctx.fill();
    }

    // 坐标
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for(let i=0;i<SIZE;i++){
      ctx.fillText(LETTERS[i], posX(i), PADDING-6);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i+1), PADDING-6, posY(i));
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    }

    // 棋子
    const drawStone = (x:number,y:number,color:Cell, glow=false)=>{
      const r = Math.max(18, Math.floor(cell*0.42));
      const grd = ctx.createRadialGradient(x-r*0.35, y-r*0.35, r*0.1, x, y, r);
      if(color===1){ grd.addColorStop(0,'#2a2a2a'); grd.addColorStop(1,'#000000'); }
      else { grd.addColorStop(0,'#ffffff'); grd.addColorStop(1,'#e5e7eb'); }
      if (glow){ ctx.save(); ctx.shadowColor = 'rgba(34,197,94,0.6)'; ctx.shadowBlur = 12; }
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle = grd; ctx.fill();
      if(color===2){ ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1; ctx.stroke(); }
      if (glow){ ctx.restore(); }
    };

    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
      const v = board[r][c]; if(!v) continue;
      const inWin = !!winLine?.some(p=>p.r===r&&p.c===c);
      drawStone(posX(c), posY(r), v, inWin);
    }

    // 预览子
    if(!winner && hover && board[hover.r][hover.c]===0){
      const x = posX(hover.c), y = posY(hover.r);
      const r = Math.max(18, Math.floor(cell*0.42));
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fillStyle = turn===1 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.8)';
      ctx.fill();
      ctx.setLineDash([4,4]);
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }

    // 最后一步标记
    const last = moves[moves.length-1];
    if(last){
      const x = posX(last.c), y = posY(last.r);
      ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.stroke();
    }
  },[boardPx, cell, board, hover, moves, turn, winner, winLine]);

  // 事件：容器 -> 精准坐标
  const toRC = (e: React.MouseEvent)=>{
    const cvs = canvasRef.current!; const rect = cvs.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    const c = Math.max(0, Math.min(SIZE-1, Math.floor(((x - PADDING)/cell) + 0.5)));
    const r = Math.max(0, Math.min(SIZE-1, Math.floor(((y - PADDING)/cell) + 0.5)));
    return {r,c};
  };

  const onMove = (e: React.MouseEvent)=>{ setHover(toRC(e)); };
  const onLeave = ()=> setHover(null);
  const onClick = (e: React.MouseEvent)=>{ const {r,c}=toRC(e); if(!winner && board[r][c]===0) place(r,c); };

  const place = (r:number,c:number)=>{
    if (winner || board[r][c] !== 0) return;
    // 玩家当前落子
    let nb = board.map(row=>row.slice());
    nb[r][c] = turn;
    let mv = [...moves, {r,c}];
    let line = findWin(nb, r, c, turn);
    if (line){
      setBoard(nb); setMoves(mv); setWinner(turn); setWinLine(line); return;
    }
    let nextTurn: Cell = (turn===1?2:1);

    // 人机对战：如果轮到电脑
    if (vsAI && nextTurn === aiColor) {
      const ai = computeAiMoveLevel(nb, aiColor);
      if (ai.r !== -1 && ai.c !== -1) {
        nb[ai.r][ai.c] = aiColor;
        mv.push({r: ai.r, c: ai.c});
        const line2 = findWin(nb, ai.r, ai.c, aiColor);
        if (line2) { setBoard(nb); setMoves(mv); setWinner(aiColor); setWinLine(line2); setTurn(turn); return; }
        // 电脑下完，轮回玩家
        setBoard(nb); setMoves(mv); setTurn(turn); setHover(null); return;
      }
    }

    // 普通对战或还未轮到电脑
    setBoard(nb); setMoves(mv); setTurn(nextTurn);
  };
  // 电脑执黑且开启人机对战时，开局自动落第一手
  useEffect(()=>{
    if (!vsAI || winner !== 0) return;
    const noMoves = moves.length === 0;
    if (noMoves && aiColor === 1) {
      // 让电脑先手（黑子）
      const nb = board.map(r=>r.slice());
      const ai = computeAiMoveLevel(nb, 1);
      if (ai.r !== -1 && ai.c !== -1) {
        nb[ai.r][ai.c] = 1;
        setBoard(nb);
        setMoves([{r: ai.r, c: ai.c}]);
        setTurn(2);
      }
    }
  }, [vsAI, aiColor, moves.length, winner]);

  const undo = ()=>{
    if(!moves.length || winner) return;
    const last = moves[moves.length-1];
    const next = board.map(row=>row.slice());
    next[last.r][last.c] = 0;
    setBoard(next);
    setMoves(m=>m.slice(0,-1));
    setTurn(t=>t===1?2:1);
    setWinLine(null);
  };

  const restart = ()=>{
    setBoard(Array.from({length:SIZE},()=>Array<Cell>(SIZE).fill(0)));
    setTurn(1); setWinner(0); setMoves([]); setHover(null); setWinLine(null);
  };

  // 触控坐标换算
  const getRCByClient = (clientX:number, clientY:number) => {
    const cvs = canvasRef.current!; const rect = cvs.getBoundingClientRect();
    const x = Math.round(clientX - rect.left);
    const y = Math.round(clientY - rect.top);
    const c = Math.max(0, Math.min(SIZE-1, Math.floor(((x - PADDING)/cell) + 0.5)));
    const r = Math.max(0, Math.min(SIZE-1, Math.floor(((y - PADDING)/cell) + 0.5)));
    return { r, c };
  };

  // 触控支持
  useEffect(()=>{
    const cvs = canvasRef.current; if(!cvs) return;
    const onTouchMove = (e:TouchEvent)=>{ const t=e.touches[0]; if(!t) return; const {r,c}=getRCByClient(t.clientX,t.clientY); setHover({r,c}); };
    const onTouchEnd = (e:TouchEvent)=>{ const t=e.changedTouches[0]; if(!t) return; const {r,c}=getRCByClient(t.clientX,t.clientY); if(!winner && board[r][c]===0) place(r,c); setHover(null); };
    const onTouchCancel = ()=> setHover(null);
    cvs.addEventListener('touchmove', onTouchMove, {passive:true});
    cvs.addEventListener('touchend', onTouchEnd);
    cvs.addEventListener('touchcancel', onTouchCancel);
    return ()=>{ cvs.removeEventListener('touchmove', onTouchMove); cvs.removeEventListener('touchend', onTouchEnd); cvs.removeEventListener('touchcancel', onTouchCancel); };
  },[board, winner, cell]);

  // 键盘快捷键：Z/Backspace 悔棋，R 重开
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==='z'||e.key==='Z'||e.key==='Backspace'){ undo(); }
      if(e.key==='r'||e.key==='R'){ restart(); }
    };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  },[undo, restart]);

  return (
    <>
      <div className="page-wrap">
        <div className="shell">
          <div className="left">
            <header className="page-header compact">
              <h1 className="title">♟️ 五子棋 · Gomoku</h1>
              <p className="subtitle">先手黑棋，点击/触控在交点落子，连成五子即胜；支持悔棋与重开。</p>

              <div className="stats unified">
                <div className="chip"><div className="label">回合</div><div className="value">{turn===1?'● 黑子':'○ 白子'}</div></div>
                <div className="chip"><div className="label">步数</div><div className="value">{moves.length}</div></div>
                {winner!==0 && (
                  <div className="chip danger"><div className="label">结果</div><div className="value">{winner===1?'黑子胜利':'白子胜利'}</div></div>
                )}
                <button className="btn icon" aria-label="悔棋" onClick={undo}>↩️ 悔棋</button>
                <button className="btn icon" aria-label="重开" onClick={restart}>🔄 重开</button>
                <button className="btn secondary" onClick={()=> setVsAI(v=>!v)}>{vsAI ? '🤖 人机：开' : '🤖 人机：关'}</button>
                <button className="btn secondary" onClick={()=> setAiColor(prev => prev===1?2:1)} disabled={moves.length>0}>电脑执{aiColor===1?'黑':'白'}</button>
                <button className="btn secondary" onClick={()=> setAiLevel(l=> l==='easy' ? 'normal' : l==='normal' ? 'strong' : 'easy')}>
                  思考强度：{aiLevel==='easy'?'简单':aiLevel==='normal'?'普通':'加强'}
                </button>
              </div>
            </header>

            {/* 棋盘卡片 */}
            <div id="board-wrap" className="board-card">
              <div ref={wrapRef} className="w-full" style={{ userSelect:'none' }}>
                <canvas
                  ref={canvasRef}
                  style={{ display: 'block', margin: '0 auto', borderRadius: 16, background: '#ffffff', boxShadow: 'inset 0 0 0 1px #e2e8f0' }}
                  onMouseMove={onMove}
                  onMouseLeave={onLeave}
                  onClick={onClick}
                />
              </div>

              {winner!==0 && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">{winner===1? '🎉 黑子胜利':'🎉 白子胜利'}</div>
                    <div className="result-sub">五连珠达成 · 共落 {moves.length} 手</div>
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
            <p className="help">提示：点击/触控交点落子；Z 或 ⌫ 悔棋，R 重开；“人机：开”时电脑自动落子（默认执白，可切换）；可切换思考强度（简单/普通/加强）。</p>
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
        .chip.danger{ background:#dc2626; }
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
      `}</style>
    </>
  );
}
