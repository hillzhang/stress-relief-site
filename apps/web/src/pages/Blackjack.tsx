import React, { useEffect, useMemo, useState } from "react";
import "../styles.css";

type Card = { v: number; s: "♠" | "♥" | "♦" | "♣" };
 type Hand = Card[];

type DealerRule = "S17" | "H17"; // S17: 软17停牌, H17: 软17继续要牌

// ===== 工具 =====
function makeShoe(decks = 6): Card[] {
  const suits: Card["s"][] = ["♠", "♥", "♦", "♣"];
  const d: Card[] = [];
  for (let k = 0; k < decks; k++) {
    for (const s of suits) for (let v = 1; v <= 13; v++) d.push({ v, s });
  }
  // shuffle Fisher–Yates
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function handValue(hand: Hand): { total: number; soft: boolean } {
  let sum = 0,
    aces = 0;
  for (const c of hand) {
    if (c.v === 1) {
      aces++;
      sum += 11;
    } else if (c.v >= 10) sum += 10;
    else sum += c.v;
  }
  let soft = aces > 0;
  while (sum > 21 && aces > 0) {
    sum -= 10; // 把一个A当作1
    aces--;
  }
  if (aces === 0) soft = false; // 没有把 A 当11 就不是 soft
  return { total: sum, soft };
}

function label(c: Card) {
  const map: Record<number, string> = { 1: "A", 11: "J", 12: "Q", 13: "K" };
  return (map[c.v] || String(c.v)) + c.s;
}

function isBlackjack(hand: Hand) {
  return hand.length === 2 && handValue(hand).total === 21;
}

export default function Blackjack() {
  // 规则/模式
  const [rule, setRule] = useState<DealerRule>("S17");
  const [decks] = useState(6);

  // 牌靴与手牌
  const [shoe, setShoe] = useState<Card[]>([]);
  const [player, setPlayer] = useState<Hand>([]);
  const [dealer, setDealer] = useState<Hand>([]);

  // 状态
  const [ended, setEnded] = useState(false);
  const [message, setMessage] = useState("");
  const [canDouble, setCanDouble] = useState(true); // 仅开局前两张允许

  // 初始化/重新开局
  const deal = (fresh = false) => {
    const s = fresh || shoe.length < 20 ? makeShoe(decks) : [...shoe];
    const p: Hand = [s.pop()!, s.pop()!];
    const d: Hand = [s.pop()!, s.pop()!];

    setShoe(s);
    setPlayer(p);
    setDealer(d);
    setEnded(false);
    setMessage("");
    setCanDouble(true);

    // 自然黑杰克判定
    const pBJ = isBlackjack(p);
    const dBJ = isBlackjack(d);
    if (pBJ || dBJ) {
      // 亮牌
      const pv = handValue(p).total;
      const dv = handValue(d).total;
      setEnded(true);
      if (pBJ && dBJ) setMessage("双方都是 Blackjack，平局");
      else if (pBJ) setMessage("Blackjack！你赢了");
      else setMessage("庄家 Blackjack，你输了");
    }
  };

  useEffect(() => {
    deal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 动作
  const hit = () => {
    if (ended) return;
    const s = [...shoe];
    const p = [...player, s.pop()!];
    setShoe(s);
    setPlayer(p);
    setCanDouble(false);
    if (handValue(p).total > 21) {
      setEnded(true);
      setMessage("爆牌！你输了");
    }
  };

  const stand = () => {
    if (ended) return;
    // 庄家规则：17 以上停；若 H17 则软17继续要牌
    const s = [...shoe];
    const dl = [...dealer];
    while (true) {
      const { total, soft } = handValue(dl);
      if (total < 17) dl.push(s.pop()!);
      else if (total === 17 && soft && rule === "H17") dl.push(s.pop()!);
      else break;
      if (handValue(dl).total >= 22) break;
    }
    setShoe(s);
    setDealer(dl);
    settle(dl);
  };

  const doubleDown = () => {
    if (ended || !canDouble) return;
    const s = [...shoe];
    const p = [...player, s.pop()!];
    setShoe(s);
    setPlayer(p);
    setCanDouble(false);
    if (handValue(p).total > 21) {
      setEnded(true);
      setMessage("爆牌！你输了");
      return;
    }
    // Double 后强制停牌
    const dl = playDealer([...dealer], s, rule);
    setDealer(dl);
    settle(dl, /*doubled*/ true);
  };

  function playDealer(dl: Hand, s: Card[], r: DealerRule) {
    while (true) {
      const { total, soft } = handValue(dl);
      if (total < 17) dl.push(s.pop()!);
      else if (total === 17 && soft && r === "H17") dl.push(s.pop()!);
      else break;
      if (handValue(dl).total >= 22) break;
    }
    return dl;
  }

  function settle(dl: Hand, doubled = false) {
    const { total: pv } = handValue(player);
    const { total: dv } = handValue(dl);
    let msg = "";
    if (dv > 21) msg = doubled ? "庄家爆牌，你双倍赢了！" : "庄家爆牌，你赢了！";
    else if (pv > dv) msg = doubled ? "你双倍赢了！" : "你赢了！";
    else if (pv < dv) msg = doubled ? "你双倍输了…" : "你输了！";
    else msg = "平局";
    setEnded(true);
    setMessage(msg);
  }

  const restart = () => deal(false);

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ended) {
        if (e.key === "r" || e.key === "R") { e.preventDefault(); restart(); }
        return;
      }
      if (e.key === "h" || e.key === "H") { e.preventDefault(); hit(); }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); stand(); }
      if (e.key === "d" || e.key === "D") { e.preventDefault(); doubleDown(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ended, shoe, player, dealer, rule, canDouble]);

  // 计算显示
  const pv = handValue(player);
  const dv = handValue(dealer);
  const dealerUp = dealer[0] ? handValue([dealer[0]]).total : 0; // guard when dealer not dealt yet
  const visibleDealer = ended ? dv.total : dealerUp;

  // ===== UI =====
  return (
    <>
      <div className="page-wrap">
        <div className="shell">
          <div className="left">
            <header className="page-header compact">
              <h1 className="title">🂡 21点 · Blackjack</h1>
              <p className="subtitle"> 6 副牌 · 支持双倍下注 & 软17规则切换（S17/H17）。快捷键：H 要牌 / S 停牌 / D 双倍 / R 再来一局。</p>

              <div className="stats unified">
                <div className="chip"><div className="label">你的点数</div><div className="value">{pv.total}{pv.soft?" · soft":""}</div></div>
                <div className="chip"><div className="label">庄家点数</div><div className="value">{visibleDealer}{!ended?" + ?":""}</div></div>
                <div className="chip"><div className="label">牌靴剩余</div><div className="value">{shoe.length}</div></div>
                <button className="btn icon" onClick={restart}>🔄 再来一局</button>
                <button className="btn secondary" onClick={()=> setRule(r=> r==="S17"?"H17":"S17")}>规则：{rule}</button>
                <a className="btn secondary" href="/">返回首页</a>
              </div>
            </header>

            <div id="board-wrap" className="board-card">
              <div className="flex-col" style={{display:'grid', gap:12}}>
                {/* 玩家 */}
                <section>
                  <div className="title" style={{fontSize:16, marginBottom:6}}>你（{pv.total}{pv.soft?" · soft":""}）</div>
                  <div className="cards-row">
                    {player.map((c,i)=> (
                      <div key={i} className={`card ui ${c.s==='♥'||c.s==='♦'?'red':''}`}>{label(c)}</div>
                    ))}
                  </div>
                  {!ended && (
                    <div className="actions" style={{marginTop:8}}>
                      <button className="btn primary" onClick={hit} disabled={ended}>要牌 (H)</button>
                      <button className="btn secondary" onClick={stand} disabled={ended}>停牌 (S)</button>
                      <button className="btn icon" onClick={doubleDown} disabled={!canDouble || ended}>双倍 (D)</button>
                    </div>
                  )}
                </section>

                {/* 庄家 */}
                <section>
                  <div className="title" style={{fontSize:16, marginBottom:6}}>庄家（{ended? dv.total : dealerUp + "+?"}）</div>
                  <div className="cards-row">
                    {dealer.map((c,i)=> (
                      <div key={i} className={`card ui ${(!ended && i===1)?'back':''} ${c.s==='♥'||c.s==='♦'?'red':''}`}>
                        {(!ended && i===1)? '🂠' : label(c)}
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {ended && (
                <div className="overlay">
                  <div className="panel">
                    <div className="result-title">{message}</div>
                    <div className="result-sub">快捷键 R 立即开始新一局。</div>
                    <div className="overlay-actions">
                      <button className="btn primary" onClick={restart}>再来一局</button>
                      <a className="btn secondary" href="/">返回首页</a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bottom-bar">
            <div className="actions">
              <button className="btn primary" onClick={restart}>再来一局</button>
              <a className="btn secondary" href="/">返回首页</a>
            </div>
            <p className="help">操作：H 要牌 / S 停牌 / D 双倍 / R 再来一局 · 规则可切换 S17/H17。</p>
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

        /* 扑克牌渲染 */
        .cards-row{ display:flex; flex-wrap:wrap; gap:10px; }
        .card.ui{ min-width:56px; height:80px; border-radius:12px; border:1px solid #e2e8f0; background:linear-gradient(180deg,#fff,#f1f5f9); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:20px; color:#0f172a; box-shadow:0 10px 24px rgba(2,6,23,.08), inset 0 -4px 8px rgba(2,6,23,.04); }
        .card.ui.red{ color:#dc2626; }
        .card.ui.back{ color:#64748b; background:repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 8px,#f1f5f9 8px,#f1f5f9 16px); border:1px solid #cbd5e1; }
      `}</style>
    </>
  );
}
