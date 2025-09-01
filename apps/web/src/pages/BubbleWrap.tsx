import React, { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'

type Cell = {
    id: number
    popped: boolean
    // 为“玻璃/霓虹”皮肤计算高光角度
    glow: number
}

type Mode = 'zen' | 'classic' | 'timed' | 'challenge'
type ThemeKey = 'classic' | 'pastel' | 'glass' | 'neon'

const THEMES: Record<ThemeKey, {
    name: string
    bg: string
    bubble: string
    bubblePopped: string
    accent: string
    gridBg: string
}> = {
    classic: {
        name: '经典',
        bg: 'linear-gradient(180deg,#eef2ff,#ffffff)',
        bubble: '#cbd5e1',
        bubblePopped: '#94a3b8',
        accent: '#0ea5e9',
        gridBg: 'rgba(255,255,255,.6)',
    },
    pastel: {
        name: '马卡龙',
        bg: 'linear-gradient(180deg,#fde2e4,#e9f5db)',
        bubble: '#ffd6a5',
        bubblePopped: '#ffc6ff',
        accent: '#ff6b6b',
        gridBg: 'rgba(255,255,255,.7)',
    },
    glass: {
        name: '玻璃',
        bg: 'linear-gradient(180deg,#e0f2fe,#f0f9ff)',
        bubble: 'rgba(255,255,255,.55)',
        bubblePopped: 'rgba(255,255,255,.25)',
        accent: '#22d3ee',
        gridBg: 'rgba(255,255,255,.35)',
    },
    neon: {
        name: '霓虹',
        bg: 'linear-gradient(180deg,#0f172a,#111827)',
        bubble: '#22c55e',
        bubblePopped: '#16a34a',
        accent: '#a78bfa',
        gridBg: 'rgba(2,6,23,.35)',
    },
}

function useSfx(muted: boolean) {
    const ctxRef = useRef<AudioContext | null>(null)
    function ensure() {
        if (!ctxRef.current) {
            const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
            if (Ctx) ctxRef.current = new Ctx({ latencyHint: 'interactive' })
        }
        const ctx = ctxRef.current
        try {
            if (ctx && (ctx.state === 'suspended' || (ctx as any).state === 'interrupted')) {
                (ctx as any).resume?.()
            }
        } catch {}
        return ctx
    }
    React.useEffect(() => {
        const prewarm = () => { const c = ensure(); try { (c as any)?.resume?.() } catch {} }
        // 首次用户触摸/点击时预热音频，移除 1 次后停止监听
        document.addEventListener('pointerdown', prewarm, { once: true, passive: true })
        return () => document.removeEventListener('pointerdown', prewarm)
    }, [])
    const pop = () => {
        if (muted) return
        const ctx = ensure(); if (!ctx) return
        const now = ctx.currentTime
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        o.type = 'square'
        o.frequency.setValueAtTime(300, now)
        o.frequency.exponentialRampToValueAtTime(80, now + 0.1)
        g.gain.setValueAtTime(0.0001, now)
        g.gain.linearRampToValueAtTime(0.4, now + 0.005)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
        o.connect(g).connect(ctx.destination)
        o.start(now); o.stop(now + 0.16)
    }
    const combo = () => {
        if (muted) return
        const ctx = ensure(); if (!ctx) return
        const now = ctx.currentTime
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.type = 'sine'
        o.frequency.setValueAtTime(500, now)
        o.frequency.exponentialRampToValueAtTime(1200, now + 0.18)
        g.gain.setValueAtTime(0.0001, now)
        g.gain.linearRampToValueAtTime(0.35, now + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
        o.connect(g).connect(ctx.destination)
        o.start(now); o.stop(now + 0.22)
    }
    return { pop, combo }
}

const COMBO_WINDOW = 350 // ms, 连击判定时间窗（更宽松且移动端手感更好）

export default function BubbleWrap() {
    const [rows, setRows] = useState(10)
    const [cols, setCols] = useState(14)
    const [themeKey, setThemeKey] = useState<ThemeKey>('classic')
    const theme = THEMES[themeKey]
    const [mode, setMode] = useState<Mode>('classic')
    const [score, setScore] = useState(0)
    const [timeLeft, setTimeLeft] = useState(60) // timed 模式
    const [muted, setMuted] = useState(false)
    const [combo, setCombo] = useState(0)
    const [maxCombo, setMaxCombo] = useState(0)
    const [power, setPower] = useState<'none'|'row'|'col'|'bomb'>('none')
    const [maskVer, setMaskVer] = useState(0)

    const grid = useRef<Cell[]>([])
    const lastTapRef = useRef(0)
    const challengeMask = useRef<Set<number>>(new Set()) // challenge 需要指定图案
    const sfx = useSfx(muted)

    // 初始化网格
    function buildGrid(r=rows, c=cols) {
        const arr: Cell[] = []
        let id = 0
        for (let i=0;i<r;i++){
            for (let j=0;j<c;j++){
                arr.push({ id:id++, popped:false, glow: Math.random()*1.5 })
            }
        }
        grid.current = arr
    }

    useEffect(()=>{ buildGrid() }, [])
    useEffect(()=>{
        // timed 模式倒计时
        if (mode !== 'timed') return
        if (timeLeft <= 0) return
        const t = setTimeout(()=> setTimeLeft(tl => tl-1), 1000)
        return ()=> clearTimeout(t)
    }, [mode, timeLeft])

    // 当行/列变化时自动重建网格
    useEffect(() => {
        buildGrid(rows, cols)
    }, [rows, cols])

    // challenge：随机生成一个“目标图案”（例如一个心形/笑脸的少量点位）
    function regenChallenge() {
        const s = new Set<number>()
        // 简化：随机挑选 18~26 个点位作为必须按压
        const n = 18 + Math.floor(Math.random()*8)
        const total = rows*cols
        while (s.size < n) s.add(Math.floor(Math.random()*total))
        challengeMask.current = s
        // 触发重渲染，让图案立即显示
        setMaskVer(v => v + 1)
    }

    useEffect(()=>{
        if (mode === 'challenge') regenChallenge()
    }, [mode, rows, cols])

    function resetAll() {
        buildGrid()
        setScore(0); setCombo(0); setMaxCombo(0)
        setTimeLeft(60)
        if (mode === 'challenge') regenChallenge()
    }

    function vibrate(ms=8){ try{ navigator.vibrate?.(ms) }catch{} }

    function popOne(index:number) {
        const cell = grid.current[index]
        if (!cell || cell.popped) return
        cell.popped = true
        setScore(s => s + 1 + Math.floor(combo*0.2)) // combo 加成
        const now = performance.now()
        // 300ms 内连续按算连击
        if (now - lastTapRef.current < COMBO_WINDOW) {
            setCombo(c => {
                const nc = c+1; setMaxCombo(m => Math.max(m, nc)); return nc
            })
            sfx.combo()
        } else {
            setCombo(1); setMaxCombo(m=>Math.max(m,1))
            sfx.pop()
        }
        lastTapRef.current = now
        vibrate(10)
        spawnBurstParticles(index)
        // challenge 检查
        if (mode === 'challenge') {
            challengeMask.current.delete(index)
            if (challengeMask.current.size === 0) {
                // 完成图案，给奖励
                setScore(s => s + 50)
                regenChallenge()
            }
        }
    }

    // 道具
    function usePowerRow(row:number){
        const start = row*cols
        for (let i=0;i<cols;i++) popOne(start+i)
    }
    function usePowerCol(col:number){
        for (let r=0;r<rows;r++) popOne(r*cols+col)
    }
    function usePowerBomb(index:number){
        const r = Math.floor(index/cols), c = index%cols
        for (let dr=-1; dr<=1; dr++){
            for (let dc=-1; dc<=1; dc++){
                const rr = r+dr, cc = c+dc
                if (rr<0||cc<0||rr>=rows||cc>=cols) continue
                popOne(rr*cols+cc)
            }
        }
    }

    function onCellClick(index:number){
        if (mode==='timed' && timeLeft<=0) return
        if (power==='row'){ usePowerRow(Math.floor(index/cols)); setPower('none'); return }
        if (power==='col'){ usePowerCol(index%cols); setPower('none'); return }
        if (power==='bomb'){ usePowerBomb(index); setPower('none'); return }
        popOne(index)
    }

    // 粒子反馈（简单的 DOM 粒子）
    const containerRef = useRef<HTMLDivElement|null>(null)
    function spawnBurstParticles(index:number){
        const cont = containerRef.current; if (!cont) return
        const cellEl = cont.querySelector(`[data-idx="${index}"]`) as HTMLElement | null
        if (!cellEl) return
        const n = 8
        for (let i=0;i<n;i++){
            const p = document.createElement('div')
            p.className = 'bw-particle'
            p.style.left = '50%'; p.style.top = '50%'
            const a = Math.random()*Math.PI*2
            const d = 14+Math.random()*18
            const tx = Math.cos(a)*d, ty = Math.sin(a)*d
            p.style.transform = `translate(${tx}px, ${ty}px)`
            p.style.background = theme.accent
            cellEl.appendChild(p)
            setTimeout(()=>{ p.remove() }, 260)
        }
    }

    const rowsArr = useMemo(()=> Array.from({length:rows}, (_,i)=>i), [rows])
    const colsArr = useMemo(()=> Array.from({length:cols}, (_,i)=>i), [cols])

    const targetLeft = mode==='timed' ? timeLeft : undefined

    return (
        <div className="bw-root" style={{
          // 固定页面背景，不随皮肤切换
          background: 'linear-gradient(180deg,#f8fafc,#ffffff)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '20px',
          touchAction: 'manipulation'
        }}>
            <h1>🫧 泡泡纸 - 多模式</h1>
            <p className="desc">连击得分 · 计时挑战 · 图案闯关 · 主题皮肤 · 道具（整行/整列/爆裂）</p>

            <div className="bw-toolbar">
                <div className="badge">分数 {score}</div>
                <div className="badge">连击 {combo}（最高 {maxCombo}）</div>
                {mode==='timed' && <div className="badge warn">倒计时 {targetLeft}s</div>}
                <button className="btn ghost" onClick={()=>{
                    const order: ThemeKey[] = ['classic','pastel','glass','neon']
                    setThemeKey(k => order[(order.indexOf(k)+1)%order.length])
                }}>皮肤：{THEMES[themeKey].name}</button>
                <button className="btn ghost" onClick={()=>setMuted(m=>!m)}>{muted?'静音':'音效'}</button>
                <button
                  className={`btn ${mode==='zen' ? 'primary' : 'secondary'}`}
                  onClick={()=>{ setMode('zen'); resetAll(); }}
                >禅模式</button>

                <button
                  className={`btn ${mode==='classic' ? 'primary' : 'secondary'}`}
                  onClick={()=>{ setMode('classic'); resetAll(); }}
                >经典</button>

                <button
                  className={`btn ${mode==='timed' ? 'primary' : 'secondary'}`}
                  onClick={()=>{ setMode('timed'); resetAll(); }}
                >计时60s</button>

                <button
                  className={`btn ${mode==='challenge' ? 'primary' : 'secondary'}`}
                  onClick={()=>{ setMode('challenge'); resetAll(); regenChallenge(); }}
                >挑战图案</button>
                <button className="btn ghost" onClick={()=>{ setRows(r=>Math.min(18,r+1)) }}>增加行</button>
                <button className="btn ghost" onClick={()=>{ setCols(c=>Math.min(24,c+1)) }}>增加列</button>
                <a className="btn ghost" href="/">返回首页</a>
            </div>

            <div className="bw-powers">
                <span>道具：</span>
                <button className={`chip ${power==='row'?'on':''}`} onClick={()=>setPower(p=>p==='row'?'none':'row')}>整行</button>
                <button className={`chip ${power==='col'?'on':''}`} onClick={()=>setPower(p=>p==='col'?'none':'col')}>整列</button>
                <button className={`chip ${power==='bomb'?'on':''}`} onClick={()=>setPower(p=>p==='bomb'?'none':'bomb')}>爆裂</button>
                <button className="chip" onClick={resetAll}>重置</button>
            </div>

            <div className="bw-grid-wrap" style={{ background: 'rgba(255,255,255,.7)', width: 'min(92vw, 720px)', margin: '0 auto' }}>
                <div className="bw-grid" ref={containerRef}
                     style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, width: '100%' }}>
                    {rowsArr.map(r => colsArr.map(c => {
                        const idx = r*cols+c
                        const cell = grid.current[idx] || { popped:false, glow:0, id:idx }
                        const must = mode==='challenge' && challengeMask.current.has(idx)
                        return (
                            <button
                                type="button"
                                key={idx}
                                data-idx={idx}
                                className={`bw-cell ${cell.popped?'popped':''} ${must?'must':''} ${themeKey}`}
                                onPointerDown={(e)=>{ e.preventDefault(); onCellClick(idx) }}
                                aria-label={cell.popped?'已按':'未按'}
                                style={{
                                  '--b': theme.bubble,
                                  '--bp': theme.bubblePopped,
                                  '--a': theme.accent,
                                  '--g': String(cell.glow.toFixed(2)),
                                } as React.CSSProperties}>
                                <span className="bw-bump"/>
                            </button>
                        )
                    }))}
                </div>
            </div>

            <div className="bw-tips">
                <div>玩法：快速连续按出<a>连击</a>可提高得分；使用<a>道具</a>搞定大范围。</div>
                <div>挑战：在「挑战图案」模式，带光晕的格子是目标位，全部按下可获得奖励。</div>
            </div>
        </div>
    )
}