import React, {useEffect, useMemo, useRef, useState} from 'react'
import '../styles.css'

// ===== Theme (复用吃豆人配色) =====
const COLOR_BG = '#0b1220'
const COLOR_BOARD_FROM = '#0f172a'
const COLOR_BOARD_TO = '#0b1220'
const COLOR_WALL = '#334155'    // 砖
const COLOR_STEEL = '#64748b'   // 钢
const COLOR_WATER = '#0ea5e9'   // 水
const COLOR_GRASS = '#16a34a'   // 草（遮挡）
const COLOR_BASE = '#eab308'    // 鹰
const COLOR_TANK_ME = '#fbbf24'
const COLOR_TANK_EN = '#fb7185'
const COLOR_BULLET = '#e2e8f0'
const COLOR_WALL_EDGE = 'rgba(94,116,141,.7)'

// ===== Grid / Map =====
type Cell = ' ' | '#' | '@' | '~' | '"' | 'E' // 空/砖/钢/水/草/鹰
const ROWS = 13
const COLS = 13

// 经典初始图（底部中央为基地 E）
const MAP_1: string[] = [
    '#############',
    '#   #   #   #',
    '# # # # # # #',
    '#   ###   # #',
    '###   #   # #',
    '#   #   ### #',
    '# #   #     #',
    '# ### ### ###',
    '# ~~~   ~~~ #',
    '# ~~~   ~~~ #',
    '#    # #    #',
    '#    #E#    #',
    '#############',
]

type Vec = {x:number;y:number}
type Bullet = {x:number;y:number;dir:Vec;me:boolean;alive:boolean}
type Tank = {x:number;y:number;dir:Vec;me:boolean;alive:boolean;cd:number}

function clamp(v:number,min:number,max:number){ return Math.max(min, Math.min(max, v)) }
function add(a:Vec,b:Vec){ return {x:a.x+b.x,y:a.y+b.y} }
const DIRS: Vec[] = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]

export default function Tank90(){
    const stageRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const dpr = typeof window!=='undefined' ? window.devicePixelRatio||1 : 1

    // ===== Game State =====
    const [paused,setPaused] = useState(false)
    const [over,setOver] = useState(false)
    const [score,setScore] = useState(0)
    const [lives,setLives] = useState(3)
    const [wave,setWave] = useState(1)
    const [started,setStarted] = useState(false)
    // 经典皮肤开关（更贴近 FC 版的像素风格）
    const [classicSkin, setClassicSkin] = useState(true)

    const grid = useRef<Cell[][]>(MAP_1.map(r=> r.split('').map(ch => {
        if (ch==='#') return '#'
        if (ch==='@') return '@'
        if (ch==='~') return '~'
        if (ch==='"') return '"'
        if (ch==='E') return 'E'
        return ' '
    })))
    // 砖块子块掩码：bit0=左上, bit1=右上, bit2=左下, bit3=右下；1 表示该子块存在
    const brickMask = useRef<number[][]>(MAP_1.map(r => r.split('').map(ch => ch==='#' ? 0b1111 : 0)))

    const me = useRef<Tank>({x:6,y:10,dir:{x:0,y:-1},me:true,alive:true,cd:0})
    const enemies = useRef<Tank[]>([
        {x:1,y:1,dir:{x:0,y:1},me:false,alive:true,cd:0},
        {x:6,y:1,dir:{x:0,y:1},me:false,alive:true,cd:0},
        {x:11,y:1,dir:{x:0,y:1},me:false,alive:true,cd:0},
    ])
    const bullets = useRef<Bullet[]>([])
    const lastTs = useRef<number|null>(null)
    const acc = useRef(0)
    const accAI = useRef(0)

    // 速度：每格像素用 tile 尺度，下方动态适配
    const stepMs = 120  // 坦克步进（ms/格）
    const aiMs = 400    // 敌人决策周期

    // ===== Input =====
    useEffect(()=>{
        const onKey = (e:KeyboardEvent)=>{
            if (!started){ setStarted(true) }
            if (over){ return }
            if (e.key===' '){ setPaused(p=>!p); return }
            if (paused) return

            const m = me.current
            if (!m.alive) return
            if (e.key==='ArrowUp' || e.key==='w'){ m.dir={x:0,y:-1}; tryMove(m) }
            if (e.key==='ArrowDown'|| e.key==='s'){ m.dir={x:0,y:1};  tryMove(m) }
            if (e.key==='ArrowLeft'|| e.key==='a'){ m.dir={x:-1,y:0}; tryMove(m) }
            if (e.key==='ArrowRight'||e.key==='d'){ m.dir={x:1,y:0};  tryMove(m) }
            if (e.key==='j' || e.key==='k' || e.key==='Enter'){ shoot(m) }
        }
        window.addEventListener('keydown', onKey)
        return ()=> window.removeEventListener('keydown', onKey)
    }, [paused, started, over])

    // ===== Movement / Collision Helpers =====
    function cellAt(v:Vec){ if(v.y<0||v.y>=ROWS||v.x<0||v.x>=COLS) return '#'; return grid.current[v.y][v.x] }
    function passable(c:Cell){ return c===' ' || c==='"' || c==='E' } // 草地可走，水阻挡
    function blockBullet(c:Cell){
      // 子弹与砖碰撞破坏；钢板/水阻挡；草/空/基地不挡
      if (c==='#') return 'destroy-brick'
      if (c==='@') return 'block'
      if (c==='~') return 'block'
      return 'pass'
    }

    function tryMove(t:Tank){
        const nx = clamp(t.x + t.dir.x, 0, COLS-1)
        const ny = clamp(t.y + t.dir.y, 0, ROWS-1)
        if (passable(cellAt({x:nx,y:ny}))){
            t.x = nx; t.y = ny
        }
    }

    function shoot(t:Tank){
        if (t.cd>0) return
        // 每个坦克同屏仅一发
        if (bullets.current.some(b=> b.alive && b.me===t.me)) return
        const bx = t.x + t.dir.x
        const by = t.y + t.dir.y
        if (bx<0||bx>=COLS||by<0||by>=ROWS) return
        bullets.current.push({x:bx,y:by,dir:{...t.dir},me:t.me,alive:true})
        t.cd = 3 // 简单冷却（步）
    }

    // ===== AI =====
    function enemyAI(){
        for (const e of enemies.current){
            if (!e.alive) continue
            // 随机换向（偏向靠近基地）
            if (Math.random() < 0.4){
                const base = findBase()
                const dx = Math.sign(base.x - e.x)
                const dy = Math.sign(base.y - e.y)
                const choices = shuffle([
                    {x:dx,y:0},{x:0,y:dy},
                    ...DIRS
                ])
                for (const d of choices){
                    const nx = clamp(e.x + d.x,0,COLS-1)
                    const ny = clamp(e.y + d.y,0,ROWS-1)
                    if (passable(cellAt({x:nx,y:ny}))){ e.dir = d; break }
                }
            }
            if (Math.random() < 0.35) shoot(e)
            tryMove(e)
            if (e.cd>0) e.cd--
        }
    }
    function shuffle<T>(a:T[]){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]] } return a }
    function findBase(){ for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){ if(grid.current[y][x]==='E') return {x,y} } return {x:6,y:11} }

    // ===== Tick =====
    useEffect(()=>{
        const raf = (ts:number)=>{
            if (lastTs.current==null) lastTs.current = ts
            const dt = ts - lastTs.current
            lastTs.current = ts
            if (!paused && !over){
                acc.current += dt
                accAI.current += dt
                while(acc.current >= stepMs){
                    acc.current -= stepMs
                    // 子弹推进 & 碰撞
                    for (const b of bullets.current){
                        if (!b.alive) continue
                        const nx = b.x + b.dir.x
                        const ny = b.y + b.dir.y
                        if (nx<0||ny<0||nx>=COLS||ny>=ROWS){ b.alive=false; continue }
                        const hit = grid.current[ny][nx]
                        const judge = blockBullet(hit)
                        if (judge==='destroy-brick'){
                          // 方向化摧毁半块砖：横向打掉左右两子块之一；纵向打掉上下两子块之一
                          const mask = brickMask.current[ny][nx]
                          const leftTop=1, rightTop=2, leftBottom=4, rightBottom=8
                          let newMask = mask
                          if (b.dir.x!==0){
                            // 水平命中：根据子弹来自左或右，清除对应一侧（上+下）
                            const clear = b.dir.x>0 ? (leftTop|leftBottom) : (rightTop|rightBottom)
                            newMask = mask & (~clear)
                          }else{
                            // 垂直命中：来自上或下，清除对应一侧（左+右）
                            const clear = b.dir.y>0 ? (leftTop|rightTop) : (leftBottom|rightBottom)
                            newMask = mask & (~clear)
                          }
                          brickMask.current[ny][nx] = newMask
                          if (newMask===0){ grid.current[ny][nx]=' ' }
                          b.alive=false; continue
                        }
                        if (judge==='block'){ b.alive=false; continue }
                        // 击中基地
                        if (hit==='E'){ b.alive=false; setOver(true); continue }
                        // 击中坦克
                        if (b.me){
                            for (const e of enemies.current){
                                if (e.alive && e.x===nx && e.y===ny){ e.alive=false; setScore(s=>s+100); b.alive=false }
                            }
                        }else{
                            const m = me.current
                            if (m.alive && m.x===nx && m.y===ny){
                                m.alive=false; b.alive=false
                                setLives(v=>{
                                    const nv = v-1
                                    if (nv<=0) setOver(true)
                                    else respawnMe()
                                    return nv
                                })
                            }
                        }
                        if (b.alive){ b.x = nx; b.y = ny }
                    }
                    bullets.current = bullets.current.filter(b=>b.alive)
                    // 子弹对撞：同格相遇则同时消失
                    const key = (b:Bullet)=> `${b.x},${b.y}`
                    const map = new Map<string, Bullet[]>()
                    for (const b of bullets.current){
                      const k = key(b);
                      const arr = map.get(k); if (arr) arr.push(b); else map.set(k,[b])
                    }
                    for (const arr of map.values()){
                      if (arr.length>1){ for (const b of arr) b.alive=false }
                    }
                    bullets.current = bullets.current.filter(b=>b.alive)

                    // 冷却递减（玩家 + 敌人）
                    if (me.current.cd > 0) me.current.cd--
                    for (const e of enemies.current){ if (e.cd>0) e.cd-- }
                }
                while(accAI.current >= aiMs){
                    accAI.current -= aiMs
                    enemyAI()
                    // 补充敌人（每波最多 6 台）
                    if (enemies.current.filter(e=>e.alive).length < Math.min(3+wave,6) && Math.random()<0.5){
                        const spawns = [{x:1,y:1},{x:6,y:1},{x:11,y:1}]
                        const spot = spawns[Math.floor(Math.random()*spawns.length)]
                        if (passable(cellAt(spot)) && !enemies.current.some(e=>e.alive && e.x===spot.x && e.y===spot.y)){
                            enemies.current.push({x:spot.x,y:spot.y,dir:{x:0,y:1},me:false,alive:true,cd:0})
                        }
                    }
                    // 清一波进入下一波
                    if (enemies.current.every(e=>!e.alive)){
                        setWave(w=>w+1)
                        // 小幅提高敌人射速/决策频率
                        if (aiMs>220){ /* 这里保守，保持 aiMs 常量，避免复杂化；需要的话可做成 state */ }
                    }
                }
            }
            draw()
            requestAnimationFrame(raf)
        }
        const id = requestAnimationFrame(raf)
        return ()=> cancelAnimationFrame(id)
    }, [paused, over])

    function respawnMe(){
        me.current = {x:6,y:10,dir:{x:0,y:-1},me:true,alive:true,cd:0}
    }

    // 像素网格辅助：以 8×8 单位在单个格子里绘制
    function pfill(ctx:CanvasRenderingContext2D, x:number, y:number, w:number, h:number, unit:number){
        ctx.fillRect(x, y, w*unit, h*unit)
    }

    // ===== Draw =====
    function draw(){
        const cvs = canvasRef.current!
        const ctx = cvs.getContext('2d')!
        // fit
        const stage = stageRef.current!.getBoundingClientRect()
        const w = Math.max(280, stage.width)
        const h = Math.max(300, stage.height)
        cvs.width = Math.floor(w*dpr)
        cvs.height = Math.floor(h*dpr)
        cvs.style.width = w+'px'; cvs.style.height = h+'px'
        ctx.setTransform(dpr,0,0,dpr,0,0)

        // bg
        const g = ctx.createLinearGradient(0,0,0,h)
        g.addColorStop(0, COLOR_BOARD_FROM)
        g.addColorStop(1, COLOR_BOARD_TO)
        ctx.fillStyle = g; ctx.fillRect(0,0,w,h)

        const size = Math.floor(Math.min(w/COLS, h/ROWS))
        const ox = Math.floor((w - size*COLS)/2)
        const oy = Math.floor((h - size*ROWS)/2)

        // frame
        ctx.strokeStyle = COLOR_WALL_EDGE
        if (classicSkin){ ctx.strokeStyle = 'rgba(15,23,42,.9)' }
        ctx.strokeRect(ox-6, oy-6, size*COLS+12, size*ROWS+12)

        // tiles
        for (let y=0;y<ROWS;y++){
            for (let x=0;x<COLS;x++){
                const c = grid.current[y][x]
                const px = ox + x*size, py = oy + y*size
                if (c==='#'){
                  if (classicSkin){
                    // 经典：按 2x2 子砖 + 粗像素
                    const unit = Math.max(1, Math.floor(size/8))
                    const mask = brickMask.current[y][x]
                    ctx.fillStyle = COLOR_WALL
                    // 左上
                    if (mask & 1) pfill(ctx, px,           py,           4,4, unit)
                    // 右上
                    if (mask & 2) pfill(ctx, px+4*unit,    py,           4,4, unit)
                    // 左下
                    if (mask & 4) pfill(ctx, px,           py+4*unit,    4,4, unit)
                    // 右下
                    if (mask & 8) pfill(ctx, px+4*unit,    py+4*unit,    4,4, unit)
                  }else{
                    const sub = size/2
                    const mask = brickMask.current[y][x]
                    ctx.fillStyle = COLOR_WALL
                    if (mask & 1) ctx.fillRect(px,       py,       sub-1, sub-1)
                    if (mask & 2) ctx.fillRect(px+sub+1, py,       sub-1, sub-1)
                    if (mask & 4) ctx.fillRect(px,       py+sub+1, sub-1, sub-1)
                    if (mask & 8) ctx.fillRect(px+sub+1, py+sub+1, sub-1, sub-1)
                    ctx.strokeStyle = 'rgba(255,255,255,.06)'
                    ctx.strokeRect(px+.5,py+.5,size-1,size-1)
                  }
                } else if (c==='@') { // steel
                  if (classicSkin){
                    const unit = Math.max(1, Math.floor(size/8))
                    ctx.fillStyle = COLOR_STEEL
                    pfill(ctx, px,           py,           4,4, unit)
                    pfill(ctx, px+4*unit,    py,           4,4, unit)
                    pfill(ctx, px,           py+4*unit,    4,4, unit)
                    pfill(ctx, px+4*unit,    py+4*unit,    4,4, unit)
                    // 铆钉
                    ctx.fillStyle = '#0f172a'
                    pfill(ctx, px+unit*1.5, py+unit*1.5, 1,1, unit)
                    pfill(ctx, px+unit*6.5, py+unit*1.5, 1,1, unit)
                    pfill(ctx, px+unit*1.5, py+unit*6.5, 1,1, unit)
                    pfill(ctx, px+unit*6.5, py+unit*6.5, 1,1, unit)
                  }else{
                    ctx.fillStyle = COLOR_STEEL
                    ctx.fillRect(px,py,size,size)
                    ctx.strokeStyle = 'rgba(0,0,0,.25)'
                    ctx.strokeRect(px+.5,py+.5,size-1,size-1)
                  }
                } else if (c==='~') { // water
                  if (classicSkin){
                    const unit = Math.max(1, Math.floor(size/8))
                    ctx.fillStyle = COLOR_WATER
                    pfill(ctx, px, py, 8,8, unit)
                    // 波纹条纹
                    ctx.fillStyle = 'rgba(255,255,255,.18)'
                    for (let i=1;i<8;i+=2){ pfill(ctx, px, py+i*unit, 8,1, unit) }
                  }else{
                    ctx.fillStyle = COLOR_WATER
                    ctx.fillRect(px,py,size,size)
                    ctx.fillStyle = 'rgba(255,255,255,.15)'
                    ctx.fillRect(px,py+size*0.6,size,size*0.4)
                  }
                } else if (c==='"') { // grass (overlay)
                  if (classicSkin){
                    const unit = Math.max(1, Math.floor(size/8))
                    ctx.fillStyle = '#0b1220'
                    ctx.fillRect(px,py,size,size)
                    ctx.fillStyle = COLOR_GRASS
                    for (let iy=1; iy<8; iy+=2){
                      for (let ix=0; ix<8; ix+=2){ pfill(ctx, px+ix*unit, py+iy*unit, 1,1, unit) }
                    }
                  }else{
                    ctx.fillStyle = '#0b1220'
                    ctx.fillRect(px,py,size,size)
                    ctx.fillStyle = COLOR_GRASS
                    ctx.globalAlpha = .75
                    ctx.fillRect(px+2,py+2,size-4,size-4)
                    ctx.globalAlpha = 1
                  }
                } else if (c==='E') { // base (eagle)
                  // 保留现代老鹰画法；经典皮肤下颜色更高对比
                  if (classicSkin){
                    const unit = Math.max(1, Math.floor(size/8))
                    // 背板
                    ctx.fillStyle = '#0b1220'
                    pfill(ctx, px, py, 8,8, unit)
                    // 机身 & 双翼（像素形状）
                    ctx.fillStyle = '#ffffff'
                    pfill(ctx, px+2*unit, py+2*unit, 4,2, unit) // 机身
                    pfill(ctx, px+1*unit, py+3*unit, 2,2, unit) // 左翼
                    pfill(ctx, px+5*unit, py+3*unit, 2,2, unit) // 右翼
                    // 头 & 喙
                    pfill(ctx, px+3*unit, py+1*unit, 1,1, unit)
                    ctx.fillStyle = '#f59e0b'
                    pfill(ctx, px+4*unit, py+1*unit, 2,1, unit)
                    // 基座
                    ctx.fillStyle = COLOR_BASE
                    pfill(ctx, px+2*unit, py+5*unit, 4,1, unit)
                  } else {
                    // 原有现代样式
                    const cx = px + size/2
                    const cy = py + size/2
                    ctx.fillStyle = '#111827'
                    ctx.fillRect(px+size*0.1, py+size*0.15, size*0.8, size*0.7)
                    ctx.fillStyle = '#ffffff'
                    ctx.fillRect(px+size*0.22, py+size*0.22, size*0.56, size*0.28)
                    ctx.beginPath();
                    ctx.moveTo(px+size*0.14, py+size*0.36)
                    ctx.lineTo(px+size*0.32, py+size*0.36)
                    ctx.lineTo(px+size*0.22, py+size*0.56)
                    ctx.closePath(); ctx.fill()
                    ctx.beginPath();
                    ctx.moveTo(px+size*0.86, py+size*0.36)
                    ctx.lineTo(px+size*0.68, py+size*0.36)
                    ctx.lineTo(px+size*0.78, py+size*0.56)
                    ctx.closePath(); ctx.fill()
                    ctx.fillRect(px+size*0.44, py+size*0.18, size*0.12, size*0.12)
                    ctx.fillStyle = '#f59e0b'
                    ctx.beginPath();
                    ctx.moveTo(px+size*0.56, py+size*0.22)
                    ctx.lineTo(px+size*0.72, py+size*0.26)
                    ctx.lineTo(px+size*0.56, py+size*0.30)
                    ctx.closePath(); ctx.fill()
                    ctx.fillStyle = COLOR_BASE
                    ctx.fillRect(px+size*0.22, py+size*0.62, size*0.56, size*0.10)
                  }
                }
            }
        }

        // tanks
        const drawTank = (t:Tank)=>{
            if (!t.alive) return
            const px = ox + t.x*size + size/2
            const py = oy + t.y*size + size/2
            if (classicSkin){
              const unit = Math.max(1, Math.floor(size/8))
              // 轨道
              ctx.fillStyle = '#1f2937'
              pfill(ctx, px-size*0.5, py-size*0.38, 1,6, unit)
              pfill(ctx, px+size*0.5 - 1*unit, py-size*0.38, 1,6, unit)
              // 车体
              ctx.fillStyle = t.me ? COLOR_TANK_ME : COLOR_TANK_EN
              pfill(ctx, px-size*0.30, py-size*0.30, 6,6, unit)
              // 炮塔
              ctx.fillStyle = '#0b1220'
              pfill(ctx, px-size*0.10, py-size*0.10, 2,2, unit)
              // 炮管
              ctx.fillStyle = t.me ? COLOR_TANK_ME : COLOR_TANK_EN
              const dir = t.dir
              if (Math.abs(dir.x)>0){
                const sign = dir.x>0 ? 1 : -1
                pfill(ctx, px + sign*size*0.10, py-size*0.03, 3,1, unit)
              }else{
                const sign = dir.y>0 ? 1 : -1
                pfill(ctx, px-size*0.03, py + sign*size*0.10, 1,3, unit)
              }
            } else {
              ctx.fillStyle = t.me ? COLOR_TANK_ME : COLOR_TANK_EN
              ctx.fillRect(px-size*0.38, py-size*0.35, size*0.76, size*0.7)
              ctx.fillStyle = '#111827'
              ctx.beginPath(); ctx.arc(px,py,size*0.18,0,Math.PI*2); ctx.fill()
              ctx.strokeStyle = t.me ? COLOR_TANK_ME : COLOR_TANK_EN
              ctx.lineWidth = Math.max(2, size*0.08)
              ctx.beginPath(); ctx.moveTo(px,py)
              ctx.lineTo(px + t.dir.x*size*0.45, py + t.dir.y*size*0.45)
              ctx.stroke()
            }
        }
        drawTank(me.current)
        for (const e of enemies.current) drawTank(e)

        // bullets
        ctx.fillStyle = COLOR_BULLET
        for (const b of bullets.current){
            if (!b.alive) continue
            const bx = ox + b.x*size + size*0.5
            const by = oy + b.y*size + size*0.5
            if (classicSkin){
              const unit = Math.max(1, Math.floor(size/8))
              ctx.fillRect(bx-unit, by-unit, unit*2, unit*2)
            }else{
              ctx.beginPath(); ctx.arc(bx,by, Math.max(2, size*0.12), 0, Math.PI*2); ctx.fill()
            }
        }
    }

    // ===== Layout (统一风格) =====
    return (
        <div className="page-wrap">
            <div className="shell">
                <header className="page-header compact">
                    <h1 className="title">🛡️ 坦克 90 · 速玩版</h1>
                    <p className="subtitle">方向键/WASD 移动，J/K/Enter 开火；守住基地 🦅。空格暂停。</p>
                    <div className="modes">
                        <button className="mode-btn" onClick={()=>setPaused(p=>!p)}>{paused?'继续':'暂停'}</button>
                        <button className="mode-btn" onClick={()=>location.reload()}>重开</button>
                        <button className={`mode-btn ${classicSkin?'on':''}`} onClick={()=>setClassicSkin(v=>!v)}>
                            {classicSkin ? '经典皮肤：开' : '经典皮肤：关'}
                        </button>
                    </div>
                    <div className="stats unified">
                        <div className="chip"><div className="label">分数</div><div className="value">{score}</div></div>
                        <div className="chip"><div className="label">命数</div><div className="value">{lives}</div></div>
                        <div className="chip"><div className="label">波次</div><div className="value">{wave}</div></div>
                    </div>
                </header>

                <main className="board-card">
                    <div ref={stageRef} className="stage" style={{width:'100%', height:'clamp(360px, 58vh, 640px)'}}>
                        <canvas ref={canvasRef}/>
                    </div>

                    {paused && !over && (
                        <div className="overlay"><div className="panel">
                            <div className="result-title">暂停中</div>
                            <div className="result-sub">分数 {score} · 命数 {lives}</div>
                            <div className="overlay-actions">
                                <button className="btn primary" onClick={()=>setPaused(false)}>继续</button>
                                <button className="btn secondary" onClick={()=>location.reload()}>重开</button>
                                <a className="btn secondary" href="/">返回首页</a>
                            </div>
                        </div></div>
                    )}

                    {over && (
                        <div className="overlay"><div className="panel">
                            <div className="result-title">本局结束</div>
                            <div className="result-sub">分数 {score}</div>
                            <div className="overlay-actions">
                                <button className="btn primary" onClick={()=>location.reload()}>再来一局</button>
                                <a className="btn secondary" href="/">返回首页</a>
                            </div>
                        </div></div>
                    )}
                </main>
            </div>
            <style>{`
        .page-wrap{ min-height:100vh; display:flex; align-items:flex-start; justify-content:center; padding:16px 24px 24px; background:radial-gradient(1000px 600px at 20% 0%,#eef2f7,#e2e8f0); }
        .shell{ width:min(100%,980px); display:grid; grid-template-columns: 1fr; gap:16px; }
        .page-header .title{ font-size:clamp(24px,3.2vw,34px); margin:0; letter-spacing:.2px; }
        .page-header .subtitle{ font-size:14px; color:#475569; margin:6px 0 10px; }
        .modes{ display:flex; gap:8px; margin:6px 0 8px; flex-wrap:wrap; align-items:center; }
        .mode-btn{ appearance:none; border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700; cursor:pointer; }
        .mode-btn:hover{ background:#f8fafc; }
        .mode-btn.on{ background:#0ea5e9; color:#062a37; border-color:#0ea5e9; box-shadow:0 6px 14px rgba(14,165,233,.25); }
        .board-card{ background: linear-gradient(135deg,${COLOR_BOARD_FROM},${COLOR_BOARD_TO}); border-radius: 18px; box-shadow: 0 14px 28px rgba(2,6,23,.35); padding: 12px; position:relative; overflow:hidden; width:100%; }
        .board-card::before{ content:""; position:absolute; inset:10px; border-radius:14px; box-shadow: inset 0 0 0 1px rgba(51,65,85,.55), inset 0 -24px 48px rgba(2,6,23,.22); pointer-events:none; }
        .stats{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin:10px 0 14px; }
        .chip{ flex:0 0 auto; min-width:120px; background:#dde6ef; color:#0b1220; border-radius:12px; padding:10px 12px; box-shadow: inset 0 -2px 0 rgba(255,255,255,.04); }
        .chip .label{ font-size:12px; opacity:.8; }
        .chip .value{ font-size:20px; font-weight:800; line-height:1.1; }
        .overlay{ position:absolute; inset:0; background:rgba(15,23,42,.22); display:flex; align-items:center; justify-content:center; border-radius:16px; backdrop-filter:saturate(120%) blur(1.2px); pointer-events:none; }
        .panel{ background:linear-gradient(135deg, rgba(255,255,255,.92), rgba(248,250,252,.90)); border:1px solid rgba(226,232,240,.9); border-radius:14px; padding:16px; width:min(92%, 360px); text-align:center; box-shadow:0 20px 40px rgba(2,6,23,.25); pointer-events:auto; }
        .result-title{ font-size:20px; font-weight:800; color:#0f172a; margin-bottom:6px; }
        .result-sub{ color:#475569; font-size:13px; margin-bottom:12px; }
        .overlay-actions{ display:flex; gap:10px; justify-content:center; }
      `}</style>
        </div>
    )
}