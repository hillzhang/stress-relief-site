import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'
import { pop } from '../sfx'

type Fruit = { id:number, x:number,y:number,vx:number,vy:number,r:number,emoji:string,sliced:boolean, dangerous:boolean, hp?:number, tag?:'slow'|'shield'|'star'|'frenzy'|'nuke'|'boss' }
const EMOJIS = ['🍉','🍋','🍊','🥝','🍓','🍎','🍐']

export default function FruitSlice(){
  const canvasRef = useRef<HTMLCanvasElement|null>(null)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const scoreRef = useRef(score)
  const livesRef = useRef(lives)
  const [holding, setHolding] = useState(false)
  const fruitsRef = useRef<Fruit[]>([])
  const trail = useRef<{x:number,y:number,t:number}[]>([])
  const rafRef = useRef(0)

  type Difficulty = 'easy'|'normal'|'hard'
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [paused, setPaused] = useState(false)
  const comboRef = useRef(0)
  const multRef = useRef(1)
  const lastSliceRef = useRef<number>(0)
  const COMBO_WINDOW = 900 // ms
  const MAX_MULT = 5
  const slowUntilRef = useRef<number>(0)

  // --- Modes & Buffs ---
  type GameMode = 'classic' | 'waves' | 'timed' | 'zen'
  const [mode, setMode] = useState<GameMode>('classic')
  const [timeLeft, setTimeLeft] = useState(90) // timed mode seconds
  const timeRef = useRef(timeLeft)
  useEffect(()=>{ timeRef.current = timeLeft }, [timeLeft])

  const shieldRef = useRef(0)      // 🛡 护盾层数（抵消一次炸弹）
  const frenzyUntilRef = useRef(0) // 🔥 狂热时间点（双倍得分+高产）
  const starCooldownRef = useRef(0)// ⭐ 冷却（不重复生成）

  // 风场 & 重力变奏
  const windRef = useRef(0)        // 水平加速度（像素/s^2）
  const gravityRef = useRef(980)   // 垂直加速度基准
  let GRAVITY = gravityRef.current

  useEffect(() => { scoreRef.current = score }, [score])
  useEffect(() => { livesRef.current = lives }, [lives])

  useEffect(()=>{
    const cvs = canvasRef.current!, ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect(), DPR = devicePixelRatio||1
    function fit(){
      rect = cvs.getBoundingClientRect();
      DPR = (window as any).devicePixelRatio || 1;
      const H = 560;
      cvs.width = rect.width * DPR;
      cvs.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    const H = 560; cvs.style.height = H+'px'; cvs.style.width='100%'
    cvs.style.touchAction = 'none'
    fit(); addEventListener('resize', fit)

    // --- Mode timers ---
    let modeTimer:number|undefined
    if(mode==='timed'){
      setTimeLeft(90)
      modeTimer = window.setInterval(()=>{
        if(!paused && livesRef.current>0){ setTimeLeft(v=> Math.max(0, v-1)) }
      }, 1000)
    }
    // 风场每 10s 变化
    let windTimer = window.setInterval(()=>{
      const dir = Math.random()<0.5? -1: 1
      windRef.current = dir * (20 + Math.random()*60) // 20~80 px/s^2
    }, 10000)
    // 重力变奏每 15s 变化 4s
    let gravTimer = window.setInterval(()=>{
      const low = Math.random()<0.5
      gravityRef.current = low? 720 : 1260
      setTimeout(()=>{ gravityRef.current = 980 }, 4000)
    }, 15000)

    // --- Waves ---
    let inRest = false
    let waveEndAt = performance.now() + 35000 // 35s 一波
    let restEndAt = 0
    let wave = 1

    function spawn(){
      // 产出节奏：狂热提升 1.8x
      const isFrenzy = performance.now() < frenzyUntilRef.current
      const baseR = 26
      const r = baseR + Math.random()*16

      // 出生源：30% 左右侧投掷
      const origin = Math.random()<0.3 ? (Math.random()<0.5?'left':'right') : 'bottom'
      const H = 560
      let x = 40 + Math.random()*(rect.width-80)
      let y = H + r + 10
      let vy = - ( (difficulty==='easy'? 720 : difficulty==='hard'? 960 : 840) + Math.random()*320 )
      let vx = (Math.random()*2-1) * (difficulty==='hard'? 220 : 180)
      if(origin==='left'){ x = -r-10; y = H*0.65 + Math.random()*80; vx = 260 + Math.random()*180; vy = - (540 + Math.random()*220) }
      if(origin==='right'){ x = rect.width + r + 10; y = H*0.65 + Math.random()*80; vx = - (260 + Math.random()*180); vy = - (540 + Math.random()*220) }

      // 模式：禅=无炸弹/不扣命；timed 减少炸弹；waves 随波数提升炸弹率
      let bombP = (difficulty==='easy'? 0.10 : difficulty==='hard'? 0.20 : 0.15)
      if(mode==='zen') bombP = 0
      if(mode==='timed') bombP *= 0.6
      if(mode==='waves') bombP *= (1 + (wave-1)*0.12)

      // 道具概率（综合控制，禅/经典略降，狂热期间少出
      const slowP = 0.06
      const shieldP = 0.06
      const starP = (performance.now()>starCooldownRef.current? 0.08 : 0.0)
      const frenzyP = isFrenzy? 0.0 : 0.05
      const nukeP = 0.02
      const bossP = 0.04

      let tag: Fruit['tag']|undefined
      let emoji = EMOJIS[Math.floor(Math.random()*EMOJIS.length)]
      let dangerous = false
      let hp: number|undefined

      const roll = Math.random()
      if(roll < bombP){ emoji='💣'; dangerous=true }
      else if(roll < bombP + slowP){ emoji='⏳'; tag='slow' }
      else if(roll < bombP + slowP + shieldP){ emoji='🛡'; tag='shield' }
      else if(roll < bombP + slowP + shieldP + starP){ emoji='⭐'; tag='star'; starCooldownRef.current = performance.now() + 10000 }
      else if(roll < bombP + slowP + shieldP + starP + frenzyP){ emoji='🔥'; tag='frenzy' }
      else if(roll < bombP + slowP + shieldP + starP + frenzyP + nukeP){ emoji='💥'; tag='nuke' }
      else if(roll < bombP + slowP + shieldP + starP + frenzyP + nukeP + bossP){ emoji='🍍'; tag='boss'; hp=3 }

      fruitsRef.current.push({id:Math.random(), x, y, vx, vy, r, emoji, sliced:false, dangerous, hp, tag})

      // 狂热加速：额外再投 1 个小果
      if(isFrenzy && Math.random()<0.9){
        const rx = x + (Math.random()*120-60); const ry=y
        fruitsRef.current.push({id:Math.random(), x:rx, y:ry, vx:vx*1.1, vy:vy*0.9, r:r*0.85, emoji:EMOJIS[Math.floor(Math.random()*EMOJIS.length)], sliced:false, dangerous:false})
      }
    }
    function lineCircleHit(ax:number,ay:number,bx:number,by:number,cx:number,cy:number,r:number){
      const dx=bx-ax, dy=by-ay, fx=ax-cx, fy=ay-cy
      const a=dx*dx+dy*dy; if(a<1e-6) return false
      let t = -(fx*dx+fy*dy)/a; t=Math.max(0,Math.min(1,t))
      const px=ax+dx*t, py=ay+dy*t
      return Math.hypot(px-cx, py-cy) <= r
    }
    const particles: {x:number,y:number,vx:number,vy:number,t:number,life:number,emoji:string}[] = []
    function splash(x:number,y:number,emoji:string){
      for(let i=0;i<12;i++){
        const ang=Math.random()*Math.PI*2, spd=80+Math.random()*160, life=600+Math.random()*500
        particles.push({x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,t:performance.now(),life,emoji})
      }
    }

    let last = performance.now(), spawnAcc = 0
    function draw(now:number){
      const dt = Math.min(0.032,(now-last)/1000); last=now
      if(paused){
        ctx.fillStyle = 'rgba(15,23,42,.5)'; ctx.fillRect(0,0,rect.width,H)
        ctx.fillStyle = '#fff'; ctx.font='bold 24px system-ui'; ctx.fillText('已暂停', rect.width/2-44, H/2)
        rafRef.current = requestAnimationFrame(draw); return
      }
      ctx.clearRect(0,0,rect.width,H)
      // background
      const g = ctx.createLinearGradient(0,0,rect.width,H); g.addColorStop(0,'#bbf7d0'); g.addColorStop(1,'#a2d2ff'); ctx.fillStyle=g; ctx.fillRect(0,0,rect.width,H)

      // spawn cadence: waves/rest & frenzy boost
      const isFrenzy = performance.now() < frenzyUntilRef.current
      let interval = 850
      if(mode==='zen') interval = 900
      if(mode==='timed') interval = 780
      if(mode==='waves'){
        // 波次：战斗 35s / 休整 5s
        const nowp = performance.now()
        if(!inRest && nowp>waveEndAt){ inRest=true; restEndAt = nowp + 5000 }
        if(inRest && nowp>restEndAt){ inRest=false; wave+=1; waveEndAt = nowp + 35000 }
        interval = inRest? 1100 : Math.max(540, 820 - (wave-1)*60)
      }
      if(isFrenzy) interval *= 0.55

      spawnAcc += dt*1000
      if(spawnAcc>interval){ spawn(); spawnAcc=0 }

      const slowFactor = (performance.now() < slowUntilRef.current) ? 0.55 : 1

      // update fruits
      for(let i=fruitsRef.current.length-1;i>=0;i--){
        const f = fruitsRef.current[i]
        f.vx += windRef.current*dt; // 风场
        f.x += f.vx*dt;
        f.y += f.vy*dt*slowFactor;
        const gNow = gravityRef.current
        f.vy += gNow*dt*slowFactor;
        if(f.y>H+80){
          fruitsRef.current.splice(i,1);
          if(!f.dangerous && mode!=='zen'){
            setLives(v=>{ const nv=Math.max(0,v-1); livesRef.current=nv; return nv })
          }
        }
      }
      // draw fruits
      for(const f of fruitsRef.current){ ctx.save(); ctx.font=`${f.r*1.6}px system-ui`; ctx.fillText(f.emoji, f.x - f.r*0.8, f.y + f.r*0.6); ctx.restore() }

      // blade trail (speed based)
      if(trail.current.length>1){
        const pts = trail.current.slice(-18)
        for(let i=0;i<pts.length-1;i++){
          const a=pts[i], b=pts[i+1]
          const seg = Math.hypot(b.x-a.x, b.y-a.y)
          const w = Math.min(22, 4 + seg*0.25)
          const g2 = ctx.createLinearGradient(a.x,a.y,b.x,b.y)
          g2.addColorStop(0,'rgba(255,255,255,0.9)')
          g2.addColorStop(1,'rgba(255,255,255,0.3)')
          ctx.strokeStyle = g2
          ctx.lineCap='round'; ctx.lineJoin='round'; ctx.lineWidth = w
          ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke()
        }
        // hit detection: allow when holding OR when a trail exists (improves UX on desktop)
        if(holding || pts.length>1){
          for(const f of fruitsRef.current){
            if(f.sliced) continue
            for(let i=0;i<pts.length-1;i++){
              const a=pts[i], b=pts[i+1]
              if(lineCircleHit(a.x,a.y,b.x,b.y,f.x,f.y,f.r + 6)){
                f.sliced = true
                if (f.dangerous) {
                  // 炸弹：有护盾先吃盾
                  if(shieldRef.current>0){
                    shieldRef.current -= 1
                    splash(f.x, f.y, '🛡')
                  } else {
                    splash(f.x, f.y, '💥')
                    setLives(v=>{ const nv=Math.max(0,v-1); livesRef.current=nv; return nv })
                    comboRef.current = 0; multRef.current = 1
                  }
                } else if (f.tag==='slow' || f.emoji==='⏳') {
                  splash(f.x, f.y, '✨')
                  slowUntilRef.current = performance.now() + 4000 // 4s slow-mo
                } else if (f.tag==='shield') {
                  shieldRef.current = Math.min(3, shieldRef.current + 1)
                  splash(f.x, f.y, '🛡')
                } else if (f.tag==='star') {
                  const nowt = performance.now()
                  comboRef.current = Math.min(999, (nowt - lastSliceRef.current <= COMBO_WINDOW ? comboRef.current : 0) + 2)
                  lastSliceRef.current = nowt
                  multRef.current = Math.min(MAX_MULT, 1 + Math.floor((comboRef.current-1)/2))
                  splash(f.x, f.y, '⭐')
                } else if (f.tag==='frenzy') {
                  frenzyUntilRef.current = performance.now() + 6000 // 6s 狂热
                  splash(f.x, f.y, '🔥')
                } else if (f.tag==='nuke') {
                  // 清屏普通水果
                  splash(f.x, f.y, '💥')
                  for(const t of fruitsRef.current){ if(!t.dangerous && !t.sliced && t!==f && t.tag!=='boss'){ t.sliced=true; setScore(s=>{ const ns=s+2; scoreRef.current=ns; return ns }) }}
                } else if (f.tag==='boss') {
                  f.hp = (f.hp||3) - 1
                  splash(f.x, f.y, '🥥')
                  if(f.hp>0){ f.sliced=false; continue } // 需要多次命中
                  // 破裂得分
                  const nowt = performance.now()
                  if(nowt - lastSliceRef.current <= COMBO_WINDOW){ comboRef.current = Math.min(comboRef.current+1, 999) } else { comboRef.current = 1 }
                  lastSliceRef.current = nowt
                  multRef.current = Math.min(MAX_MULT, 1 + Math.floor((comboRef.current-1)/2))
                  const gain = (6 * multRef.current)
                  setScore(s=>{ const ns=s+gain; scoreRef.current=ns; return ns })
                } else {
                  splash(f.x, f.y, f.emoji)
                  pop()
                  const nowt = performance.now()
                  if(nowt - lastSliceRef.current <= COMBO_WINDOW){ comboRef.current = Math.min(comboRef.current+1, 999) } else { comboRef.current = 1 }
                  lastSliceRef.current = nowt
                  multRef.current = Math.min(MAX_MULT, 1 + Math.floor((comboRef.current-1)/2))
                  let gain = 2 * multRef.current
                  if(performance.now() < frenzyUntilRef.current) gain *= 2 // 狂热双倍
                  setScore(s=>{ const ns=s+gain; scoreRef.current=ns; return ns })
                }
                break
              }
            }
          }
          fruitsRef.current = fruitsRef.current.filter(f=>!f.sliced)
        }
      }

      // particles
      const nowt = performance.now()
      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=600*dt
        const alpha = 1 - (nowt - p.t)/p.life; if(alpha<=0){ particles.splice(i,1); continue }
        ctx.save(); ctx.globalAlpha=Math.max(0,alpha); ctx.font='16px system-ui'; ctx.fillText(p.emoji, p.x, p.y); ctx.restore()
      }

      // HUD
      ctx.fillStyle = 'rgba(255,255,255,.92)'
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(10, 10, 400, 64, 16)
        ctx.fill()
      } else {
        ctx.fillRect(10, 10, 400, 64)
      }
      ctx.fillStyle = '#111'
      ctx.font = 'bold 16px system-ui'
      // 第一行：分数/生命/倍数/狂热/护盾
      ctx.fillText(`得分 ${scoreRef.current}`, 22, 38)
      ctx.fillText(`❤ ${livesRef.current}`, 110, 38)
      if(multRef.current>1){ ctx.fillText(`×${multRef.current}`, 180, 38) }
      if(performance.now()<frenzyUntilRef.current){ ctx.fillText(`🔥`, 230, 38) }
      if(shieldRef.current>0){ ctx.fillText(`🛡x${shieldRef.current}`, 260, 38) }
      // 第二行：难度/模式/剩余
      const diffName = ({easy:'轻松', normal:'标准', hard:'困难'} as any)[difficulty] || difficulty
      const modeName = ({classic:'经典', waves:'波次', timed:'限时', zen:'禅'} as any)[mode] || mode
      ctx.fillText(`难度: ${diffName}`, 22, 60)
      ctx.fillText(`模式: ${modeName}`, 150, 60)
      if(mode==='timed'){ ctx.fillText(`剩余: ${timeRef.current}s`, 280, 60) }
      if(livesRef.current<=0){ ctx.fillStyle='rgba(15,23,42,.6)'; ctx.fillRect(0,0,rect.width,H); ctx.fillStyle='#fff'; ctx.font='bold 28px system-ui'; ctx.fillText('游戏结束', rect.width/2-70, H/2); setHolding(false); trail.current=[] }
      if(mode==='timed' && timeRef.current<=0){ ctx.fillStyle='rgba(15,23,42,.6)'; ctx.fillRect(0,0,rect.width,H); ctx.fillStyle='#fff'; ctx.font='bold 28px system-ui'; ctx.fillText('时间到！', rect.width/2-70, H/2); setHolding(false); trail.current=[] }

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    function pos(e:any){ const p=(e.touches&&e.touches[0])||e; const x=(p.clientX-rect.left), y=(p.clientY-rect.top); return {x,y} }
    function down(e:any){ if(paused) return; setHolding(true); trail.current.push({...pos(e), t:performance.now()}); }
    function move(e:any){ if(paused) return; const p=pos(e); trail.current.push({x:p.x,y:p.y,t:performance.now()}); if(trail.current.length>32) trail.current=trail.current.slice(-32) }
    function up(){ if(paused) return; setHolding(false); trail.current=[] }

    addEventListener('pointerdown', down as any, {passive:true})
    addEventListener('pointermove', move as any, {passive:true})
    addEventListener('pointerup', up as any)
    addEventListener('pointercancel', up as any)

    // timers cleanup
    const clearTimers = ()=>{
      if(modeTimer) clearInterval(modeTimer)
      clearInterval(windTimer); clearInterval(gravTimer)
    }

    return ()=>{
      clearTimers()
      cancelAnimationFrame(rafRef.current)
      removeEventListener('pointerup', up as any)
      removeEventListener('pointercancel', up as any)
      removeEventListener('pointerdown', down as any)
      removeEventListener('pointermove', move as any)
      removeEventListener('resize', fit)
    }
  }, [difficulty, paused, mode])

  function restart(){
    setLives(3); setScore(0);
    livesRef.current=3; scoreRef.current=0;
    fruitsRef.current=[]
  }

  return (
    <div className="container">
      <h1>🍉 切水果</h1>
      <p className="desc">按住拖动才算“挥刀”，带刀光轨迹与飞溅粒子。漏接扣生命。</p>
      <div className="stage" style={{position:'relative', height:560}}>
        <canvas ref={canvasRef}/>
      </div>
      <div style={{display:'flex', flexWrap:'wrap', gap:10, marginTop:12, alignItems:'center'}}>
        <span style={{opacity:.75}}>模式：</span>
        <button className={`btn ${mode==='classic'?'primary':'ghost'}`} title="经典：常规玩法，无时间限制。" onClick={()=>setMode('classic')}>经典</button>
        <button className={`btn ${mode==='waves'?'primary':'ghost'}`} title="波次：35秒战斗 + 5秒休整，越到后面越密集。" onClick={()=>setMode('waves')}>波次</button>
        <button className={`btn ${mode==='timed'?'primary':'ghost'}`} title="限时：90秒倒计时，时间到结算。" onClick={()=>setMode('timed')}>限时</button>
        <button className={`btn ${mode==='zen'?'primary':'ghost'}`} title="禅：无炸弹惩罚，漏接不扣命，纯手感。" onClick={()=>setMode('zen')}>禅</button>
        <span style={{width:1,height:24,background:'rgba(0,0,0,.08)'}}/>
        <span style={{opacity:.75}}>难度：</span>
        <button className={`btn ${difficulty==='easy'?'primary':'ghost'}`} onClick={()=>setDifficulty('easy')}>轻松</button>
        <button className={`btn ${difficulty==='normal'?'primary':'ghost'}`} onClick={()=>setDifficulty('normal')}>标准</button>
        <button className={`btn ${difficulty==='hard'?'primary':'ghost'}`} onClick={()=>setDifficulty('hard')}>困难</button>
        <span style={{width:1,height:24,background:'rgba(0,0,0,.08)'}}/>
        <button className="btn" onClick={()=>setPaused(p=>!p)}>{paused?'继续':'暂停'}</button>
        <button className="btn" onClick={restart}>重开</button>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
