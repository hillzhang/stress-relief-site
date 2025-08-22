import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

type Fish = { x:number,y:number,vx:number,vy:number,angle:number,size:number,color:string, hunger:number, sprite?: number }
type Pellet = { x:number,y:number,vy:number,life:number,age:number }

const FISH_TYPES = [
  { size: 12, speed: 50, color: ()=>`hsl(${180+Math.random()*60},80%,55%)` }, // blue-cyan range
  { size: 18, speed: 65, color: ()=>`hsl(${20+Math.random()*40},85%,55%)` },  // red-orange range
  { size: 22, speed: 45, color: ()=>`hsl(${100+Math.random()*60},65%,50%)` }, // green-yellow range
  { size: 14, speed: 80, color: ()=>`hsl(${260+Math.random()*80},75%,60%)` }, // purple-magenta range
  { size: 16, speed: 70, color: ()=>`hsl(${0+Math.random()*360},70%,50%)` },  // rainbow random
]

export default function Moyu(){
  const [night, setNight] = useState(false)
  const [count, setCount] = useState(8)
  const ref = useRef<HTMLCanvasElement|null>(null)
  const fishRef = useRef<Fish[]>([])
  const pelletsRef = useRef<Pellet[]>([])
  type Ripple = { x:number,y:number,r:number,life:number }
  const ripplesRef = useRef<Ripple[]>([])

  const raf = useRef(0)
  const feedingRef = useRef(false)
  const lastFeedTs = useRef(0)

  // UI / gameplay toggles
  const [autoFeed, setAutoFeed] = useState(false)
  const [schooling, setSchooling] = useState(true)    // 鱼群跟随
  const [attract, setAttract] = useState(1)           // 吸引力 0.5~1.5
  const [speedScale, setSpeedScale] = useState(1)     // 全局速度 0.6~1.6
  const [sound, setSound] = useState(false)           // 海浪白噪
  const [realistic, setRealistic] = useState(false)   // 真实渲染
  const [current, setCurrent] = useState(0)           // 水流强度 0~100
  const [fishScale, setFishScale] = useState(1.6)     // 鱼体大小整体缩放（1.0~2.2）
  // removed sprite-related states/refs
  const audioCtxRef = useRef<AudioContext|null>(null)
  const noiseNodeRef = useRef<AudioWorkletNode|AudioNode|null>(null)

  type Weed = { x:number, h:number, phase:number }
  const seaweedRef = useRef<Weed[]>([])
  type Star = { x:number,y:number,a:number,va:number,r:number }
  const starsRef = useRef<Star[]>([])
  const beamsRef = useRef<number[]>([]) // light beam phases
  type Dust = { x:number,y:number,r:number,a:number,vy:number }
  const dustRef = useRef<Dust[]>([])
  const currentPhaseRef = useRef(0)

  const longPressStart = useRef(0)
  const rainTimer = useRef<number|undefined>(undefined)

  useEffect(()=>{
    const cvs = ref.current!
    const ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect()
    let DPR = window.devicePixelRatio || 1
    function fit(){
      rect = cvs.getBoundingClientRect()
      DPR = window.devicePixelRatio || 1
      cvs.width = rect.width * DPR
      cvs.height = 440 * DPR
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      ctx.imageSmoothingEnabled = true
      ;(ctx as any).imageSmoothingQuality = 'high'
    }
    fit()
    cvs.style.width = '100%'
    cvs.style.height = '440px'
    ;(cvs as any).style.touchAction = 'none'
    window.addEventListener('resize', fit)

    // init decorations by width
    seaweedRef.current = Array.from({length:6},(_,i)=>({
      x: 40 + i*(rect.width-80)/5 + (Math.random()*30-15),
      h: 80 + Math.random()*70,
      phase: Math.random()*Math.PI*2,
    }))
    if(night){
      starsRef.current = Array.from({length:48},()=>({
        x: Math.random()*rect.width,
        y: Math.random()*200,
        a: 0.5+Math.random()*0.5,
        va: (Math.random()*0.6-0.3)*0.02,
        r: 0.7+Math.random()*1.2,
      }))
    } else { starsRef.current = [] }
    beamsRef.current = [Math.random()*1000, Math.random()*1000]
    dustRef.current = Array.from({length:36},()=>({
      x: Math.random()*rect.width,
      y: Math.random()*440,
      r: 0.7 + Math.random()*1.2,
      a: 0.12 + Math.random()*0.18,
      vy: 8 + Math.random()*14,
    }))

    // removed sprite image loading

    // setup simple ocean noise when enabled
    async function startNoise(){
      if(!sound || audioCtxRef.current) return
      try{
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioCtxRef.current = ctx
        // create white noise
        const bufferSize = 2 * ctx.sampleRate
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const output = noiseBuffer.getChannelData(0)
        for(let i=0;i<bufferSize;i++){ output[i] = (Math.random()*2-1) * 0.2 }
        const white = ctx.createBufferSource(); white.buffer = noiseBuffer; white.loop = true
        const biquad = ctx.createBiquadFilter(); biquad.type='lowpass'; biquad.frequency.value=600
        const gain = ctx.createGain(); gain.gain.value = 0.1
        white.connect(biquad).connect(gain).connect(ctx.destination)
        white.start()
        noiseNodeRef.current = gain
      }catch(e){ console.warn('Audio init failed', e) }
    }
    if(sound) startNoise()

    // auto feed timer
    let autoTimer:number|undefined
    function randomFeed(){
      if(!autoFeed) return
      const x = rect.left + 40 + Math.random()*(rect.width-80)
      const y = rect.top + 60 + Math.random()*180
      feedAt(x, y)
    }
    if(autoFeed){ autoTimer = window.setInterval(randomFeed, 1400) }

    function sprinkle(clientX:number, clientY:number){
      for(let i=0;i<6;i++){
        const jx = clientX + (Math.random()*16-8)
        const jy = clientY + (Math.random()*16-8)
        feedAt(jx, jy)
      }
    }
    function onDblClick(e:MouseEvent){ sprinkle(e.clientX, e.clientY) }
    function onKeyDown(e:KeyboardEvent){
      if(e.code==='Space'){
        e.preventDefault()
        const x = rect.left + 40 + Math.random()*(rect.width-80)
        const y = rect.top + 60 + Math.random()*120
        sprinkle(x,y)
      }
    }
    window.addEventListener('dblclick', onDblClick)
    window.addEventListener('keydown', onKeyDown)

    const PREFS:("edge"|"center"|"top"|"bottom")[]=['edge','center','top','bottom']
    fishRef.current = [...Array(count)].map((_,i)=> {
      const type = FISH_TYPES[Math.floor(Math.random()*FISH_TYPES.length)]
      return {
        x: 60+Math.random()*(rect.width-120),
        y: 60+Math.random()*(440-120),
        vx: (Math.random()*2-1)*type.speed,
        vy: (Math.random()*2-1)*(type.speed*0.5),
        angle: 0,
        size: type.size + Math.random()*4,
        color: type.color(),
        hunger: Math.random(),
        // @ts-ignore
        pref: PREFS[Math.floor(Math.random()*PREFS.length)]
      } as any
    })

    let last = performance.now()
    function drawFish(f:Fish, now:number){
      ctx.save()
      // soft shadow under the fish (always rendered underneath to avoid bleeding through)
      if(realistic){
        ctx.save()
        ctx.globalCompositeOperation = 'destination-over'
        ctx.globalAlpha = 0.12
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.ellipse(
          f.x + Math.cos(f.angle)*6,
          f.y + 16,
          f.size*1.3*fishScale,
          f.size*0.45*fishScale,
          0, 0, Math.PI*2
        )
        ctx.fill()
        ctx.restore()
      }

      ctx.translate(f.x,f.y); ctx.rotate(f.angle)

      if(realistic){
        const grad = ctx.createLinearGradient(-f.size*1.6, 0, f.size*1.6, 0)
        // use opaque stops to avoid seeing the shadow through the body
        grad.addColorStop(0, '#1f2937')         // dark (opaque)
        grad.addColorStop(0.5, f.color)         // main body color
        grad.addColorStop(1, '#e5e7eb')         // light (opaque)
        ctx.fillStyle = grad
      }else{
        ctx.fillStyle = f.color
      }
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.ellipse(0,0,f.size*1.6*fishScale,f.size*1.0*fishScale,0,0,Math.PI*2)
      ctx.fill()

      const wag = Math.sin(now*0.02 + (f.x+f.y)*0.03) * (f.size*0.28*fishScale)
      ctx.fillStyle = realistic ? 'rgba(0,0,0,0.15)' : f.color
      ctx.beginPath()
      ctx.moveTo(-f.size*1.6*fishScale,0)
      ctx.lineTo(-f.size*2.2*fishScale, wag + f.size*0.6*fishScale)
      ctx.lineTo(-f.size*2.2*fishScale, wag - f.size*0.6*fishScale)
      ctx.closePath()
      ctx.fill()

      if(realistic){
        ctx.globalAlpha = 0.25
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.ellipse(f.size*0.6*fishScale, -f.size*0.35*fishScale, f.size*0.6*fishScale, f.size*0.25*fishScale, 0, 0, Math.PI*2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(f.size*0.9*fishScale,-f.size*0.2*fishScale,2*fishScale,0,Math.PI*2); ctx.fill()
      ctx.globalAlpha = 1
      ctx.restore()
    }
    function drawDust(now:number, curVX:number, dt:number){
      ctx.save();
      for(const d of dustRef.current){
        d.x += curVX*dt*0.3
        d.y -= d.vy*dt
        if(d.y < -4){ d.y = 444; d.x = (d.x+rect.width)%rect.width }
        if(d.x < -4) d.x += rect.width
        if(d.x > rect.width+4) d.x -= rect.width
        ctx.globalAlpha = d.a
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2); ctx.fill()
      }
      ctx.restore()
    }
    function drawPellet(p:Pellet){
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill()
    }
    function drawBubbles(now:number){
      ctx.save(); ctx.globalAlpha = .2
      for(let i=0;i<20;i++){
        const x = (i*53 + (now*0.03)%rect.width)%rect.width
        const y = 440 - ((now*0.02 + i*30)%500)
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill()
      }
      ctx.restore()
    }
    function drawRipples(){
      for(let i=ripplesRef.current.length-1;i>=0;i--){
        const r = ripplesRef.current[i]
        r.r += 24 * 0.016 * (1+Math.random()*0.2)
        r.life -= 0.02
        if(r.life<=0){ ripplesRef.current.splice(i,1); continue }
        ctx.save(); ctx.globalAlpha = Math.max(0, r.life)
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.4
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2); ctx.stroke(); ctx.restore()
      }
    }

    function drawSeaweed(now:number){
      ctx.save(); ctx.strokeStyle = night? 'rgba(34,197,94,.6)': 'rgba(16,185,129,.6)'; ctx.lineWidth=3
      for(const w of seaweedRef.current){
        const sway = Math.sin(now*0.002 + w.phase) * 10
        ctx.beginPath();
        ctx.moveTo(w.x, 440)
        ctx.bezierCurveTo(w.x+sway, 440-w.h*0.4, w.x-sway, 440-w.h*0.8, w.x+sway*0.6, 440-w.h)
        ctx.stroke()
      }
      ctx.restore()
    }
    function drawStars(){
      if(!night) return
      ctx.save()
      for(const s of starsRef.current){ s.a += s.va; if(s.a<0.2||s.a>1) s.va*=-1; ctx.globalAlpha = Math.max(0.2, Math.min(1,s.a)); ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill() }
      ctx.restore()
    }
    function drawBeams(now:number){
      // beams disabled per request
      return
    }

    function step(now:number){
      const dtRaw = Math.min(0.032, (now-last)/1000); last = now
      const dt = dtRaw * speedScale
      currentPhaseRef.current += dt
      const curStrength = (current/100) * 40 // px/s 最大水平漂移
      const curVX = Math.sin(currentPhaseRef.current*0.8) * curStrength
      ctx.clearRect(0,0,rect.width,440)
      // background
      const g = ctx.createLinearGradient(0,0,0,440)
      g.addColorStop(0, night ? '#0ea5e9' : '#22d3ee')
      g.addColorStop(1, night ? '#0f172a' : '#a78bfa')
      ctx.fillStyle = g; ctx.fillRect(0,0,rect.width,440)
      drawDust(now, curVX, dt)
      drawBubbles(now)
      drawRipples()
      drawStars();

      // HUD badge
      ctx.fillStyle='rgba(255,255,255,.88)'
      ctx.roundRect ? (ctx as any).roundRect(10,10,180,38,12) : ctx.fillRect(10,10,180,38)
      ctx.fill()
      ctx.fillStyle='#0f172a'; ctx.font='bold 14px system-ui'
      ctx.fillText(`鱼 ${fishRef.current.length}  饵 ${pelletsRef.current.length}`, 20, 34)

      // pellets
      for(let i=pelletsRef.current.length-1;i>=0;i--){
        const p = pelletsRef.current[i]
        p.age += dt
        // Float phase then gentle sink; much lower terminal velocity so fish can catch up
        const FLOAT_T = 1.4
        if(p.age < FLOAT_T){
          const targetVy = 18 // px/s
          p.vy += (targetVy - p.vy) * (0.6 * dt * 60) // ease toward slow sink
        } else {
          const G = 60
          p.vy = Math.min(p.vy + G*dt, 110)
        }
        p.y += p.vy*dt
        p.x += curVX*dt*0.5
        if(p.x < 0) p.x = 0; if(p.x > rect.width) p.x = rect.width
        p.life -= dt
        if(p.y>440 || p.life <= 0){ pelletsRef.current.splice(i,1); continue }
        drawPellet(p)
      }

      // fish logic
      fishRef.current.forEach(f=>{
        // target nearest pellet
        let tx = f.x + f.vx*0.5, ty = f.y + f.vy*0.5
        if(pelletsRef.current.length){
          let best = 1e9, target:Pellet|null = null
          for(const p of pelletsRef.current){ const d = (p.x-f.x)**2 + (p.y-f.y)**2; if(d<best){ best=d; target=p } }
          if(target){ tx = target.x; ty = target.y }
        } else {
          // slight bias according to preference
          const pref = (f as any).pref
          if(pref==='center'){ tx = rect.width*0.5; ty = 220 }
          if(pref==='edge'){ tx = (f.x<rect.width*0.5? 30 : rect.width-30); ty = f.y }
          if(pref==='top'){ ty = 120 }
          if(pref==='bottom'){ ty = 360 }
        }
        let steer = (pelletsRef.current.length ? 0.45 : 0.25) * attract
        // schooling: 轻微靠近群体中心，提高观赏性
        if(schooling && !pelletsRef.current.length){
          const cx = fishRef.current.reduce((s,f)=>s+f.x,0)/Math.max(1,fishRef.current.length)
          const cy = fishRef.current.reduce((s,f)=>s+f.y,0)/Math.max(1,fishRef.current.length)
          tx = (tx*0.7 + cx*0.3); ty = (ty*0.7 + cy*0.3)
        }
        const ax = (tx - f.x)*steer, ay = (ty - f.y)*steer
        // mild water current push (horizontal)
        f.vx += (curVX*0.05) * dt
        // avoid seaweed bases slightly
        for(const w of seaweedRef.current){
          const dxw = w.x - f.x
          const dyw = (440 - w.h*0.6) - f.y
          const d2 = dxw*dxw + dyw*dyw
          if(d2 < (w.h*0.35)*(w.h*0.35)){
            f.vx += (-dxw)*0.0008
            f.vy += (-dyw)*0.0008
          }
        }
        f.vx = (f.vx + ax*dt); f.vy = (f.vy + ay*dt)
        const speed = Math.hypot(f.vx, f.vy)
        // hunger: slowly rises; lowers on eating; affects max speed & alpha
        // @ts-ignore
        f.hunger = Math.max(0, Math.min(1, (f.hunger||0) + dt*0.03))
        const hunger = (f as any).hunger || 0
        const hungerScale = 1 - hunger*0.25
        const max = (pelletsRef.current.length ? 90 : 60) * hungerScale
        if(speed>max){ f.vx = f.vx/speed*max; f.vy = f.vy/speed*max }
        f.x += f.vx*dt; f.y += f.vy*dt
        if(f.x<20||f.x>rect.width-20) f.vx*=-1
        if(f.y<20||f.y>420) f.vy*=-1
        f.angle = Math.atan2(f.vy, f.vx)

        // eat pellet if close
        for(let i=pelletsRef.current.length-1;i>=0;i--){
          const p = pelletsRef.current[i]
          const dx = p.x - f.x, dy = p.y - f.y
          if(dx*dx + dy*dy < (f.size*2.0)*(f.size*2.0)){
            pelletsRef.current.splice(i,1)
            // @ts-ignore
            f.hunger = Math.max(0, (f.hunger||0) - 0.4)
            // small burst when eating
            const boost = 30
            const sp = Math.hypot(f.vx,f.vy) || 1
            f.vx += (dx/sp) * (boost*0.2)
            f.vy += (dy/sp) * (boost*0.2)
            break
          }
        }

        drawFish(f, now)
      })
      drawSeaweed(now)

      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)

    function feedAt(clientX:number, clientY:number){
      const x = (clientX - rect.left)
      const y = (clientY - rect.top)
      pelletsRef.current.push({x,y,vy:0,life:15,age:0})
      ripplesRef.current.push({x,y,r:6,life:1})
    }
    function onPointerDown(e:PointerEvent){
      feedingRef.current = true
      lastFeedTs.current = 0
      longPressStart.current = performance.now()
      if(rainTimer.current) clearInterval(rainTimer.current)
      rainTimer.current = window.setInterval(()=>{
        if(!feedingRef.current) return
        if(performance.now() - longPressStart.current > 300){ feedAt((window as any)._lastX||rect.left+rect.width/2, (window as any)._lastY||rect.top+80) }
      }, 90)
      feedAt(e.clientX, e.clientY)
    }
    function onPointerMove(e:PointerEvent){
      if(!feedingRef.current) return
      ;(window as any)._lastX = e.clientX; (window as any)._lastY = e.clientY
      const now = performance.now()
      if(now - lastFeedTs.current > 120){
        lastFeedTs.current = now
        feedAt(e.clientX, e.clientY)
      }
    }
    function onPointerUp(){ feedingRef.current = false; if(rainTimer.current) clearInterval(rainTimer.current) }

    window.addEventListener('pointerdown', onPointerDown as any, {passive:true})
    window.addEventListener('pointermove', onPointerMove as any, {passive:true})
    window.addEventListener('pointerup', onPointerUp as any)
    window.addEventListener('pointercancel', onPointerUp as any)

    return ()=>{
      cancelAnimationFrame(raf.current)
      if(autoTimer) clearInterval(autoTimer)
      window.removeEventListener('pointerdown', onPointerDown as any)
      window.removeEventListener('pointermove', onPointerMove as any)
      window.removeEventListener('pointerup', onPointerUp as any)
      window.removeEventListener('pointercancel', onPointerUp as any)
      window.removeEventListener('resize', fit)
      window.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('keydown', onKeyDown)
      if(rainTimer.current) clearInterval(rainTimer.current)
      if(audioCtxRef.current){ audioCtxRef.current.close(); audioCtxRef.current=null; noiseNodeRef.current=null }
    }
  }, [night, count, autoFeed, schooling, attract, speedScale, sound, current, realistic, fishScale])

  return (
    <div className="container">
      <h1>🐟 摸鱼模拟器</h1>
      <p className="desc">点击投喂小饵，鱼儿会靠近；开/关夜晚；看它们慢慢游，摸一会儿鱼。</p>
      <div className="stage" style={{height:440, borderRadius:16, overflow:'hidden', boxShadow:'0 8px 30px rgba(2,6,23,.12)'}}>
        <canvas ref={ref} style={{width:'100%', height:'100%', display:'block'}}/>
      </div>
      <div style={{display:'flex', gap:12, marginTop:12, alignItems:'center', flexWrap:'wrap'}}>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="切换白天/夜晚色调">
          <input type="checkbox" checked={night} onChange={e=>setNight(e.target.checked)}/> 夜晚
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="场景中的鱼数量">
          鱼数
          <input type="range" min={3} max={14} value={count} onChange={e=>setCount(parseInt(e.target.value))}/>
          <span className="badge">{count}</span>
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="鱼之间会轻微靠拢，形成鱼群">
          <input type="checkbox" checked={schooling} onChange={e=>setSchooling(e.target.checked)}/> 鱼群
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="鱼儿受饵吸引的强度">
          吸引力
          <input type="range" min={50} max={150} value={Math.round(attract*100)} onChange={e=>setAttract(parseInt(e.target.value)/100)}/>
          <span className="badge">{attract.toFixed(2)}</span>
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="整体游动与动画速度">
          速度
          <input type="range" min={60} max={160} value={Math.round(speedScale*100)} onChange={e=>setSpeedScale(parseInt(e.target.value)/100)}/>
          <span className="badge">{speedScale.toFixed(2)}</span>
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="自动以低频投喂，适合放着看">
          <input type="checkbox" checked={autoFeed} onChange={e=>setAutoFeed(e.target.checked)}/> 自动投喂
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="开启细微白噪，模拟海浪声">
          <input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/> 海浪
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="更真实的鱼体渲染与阴影">
          <input type="checkbox" checked={realistic} onChange={e=>setRealistic(e.target.checked)}/> 真实
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="鱼体整体大小（不会影响数量）">
          鱼体大小
          <input type="range" min={80} max={220} value={Math.round(fishScale*100)} onChange={e=>setFishScale(parseInt(e.target.value)/100)} />
          <span className="badge">{fishScale.toFixed(2)}x</span>
        </label>
        <label style={{display:'flex', alignItems:'center', gap:6}} title="水流强度，影响漂浮与鱼的微小位移">
          水流
          <input type="range" min={0} max={100} value={current} onChange={e=>setCurrent(parseInt(e.target.value))}/>
          <span className="badge">{current}</span>
        </label>
        <button className="btn ghost" title="保存当前画面为图片" onClick={()=>{
          const cvs = ref.current; if(!cvs) return; const a=document.createElement('a'); a.download='moyu.png'; a.href=(cvs as HTMLCanvasElement).toDataURL('image/png'); a.click();
        }}>截图</button>
        <a className="btn ghost" href="/">返回首页</a>
      </div>
    </div>
  )
}
