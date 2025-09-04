import React, { useEffect, useRef, useState } from 'react'
import '../styles.css'

type Point = {x:number,y:number}
type Stroke = { points:Point[], color:string, width:number, mode:'normal'|'rainbow'|'jitter'|'erase'|'line'|'rect'|'circle'|'sticker', sticker?:string, start?:Point }

const STICKERS = ['😺','🐻','🐼','🌈','⭐️','🍀','🎈','🪄','💖']

export default function DoodleBoard(){
  const canvasRef = useRef<HTMLCanvasElement|null>(null)
  const [mode, setMode] = useState<Stroke['mode']>('normal')
  const [width, setWidth] = useState(6)
  const [color, setColor] = useState('#111827')
  const [bgGrid, setBgGrid] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redoStack, setRedo] = useState<Stroke[]>([])
  const [hue, setHue] = useState(0)
  const drawing = useRef(false)

  // 恢复上次绘制
  useEffect(() => {
    const raw = localStorage.getItem('doodle_v1');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data.strokes)) setStrokes(data.strokes);
      if (data.opts) {
        if (data.opts.mode) setMode(data.opts.mode);
        if (typeof data.opts.width === 'number') setWidth(data.opts.width);
        if (typeof data.opts.color === 'string') setColor(data.opts.color);
        if (typeof data.opts.bgGrid === 'boolean') setBgGrid(data.opts.bgGrid);
      }
    } catch {}
  }, []);

  useEffect(()=>{
    const cvs = canvasRef.current!
    const ctx = cvs.getContext('2d')!
    let rect = cvs.getBoundingClientRect()
    const DPR = window.devicePixelRatio || 1
    function fit(){
      rect = cvs.getBoundingClientRect()
      ctx.setTransform(1,0,0,1,0,0)
      cvs.width = rect.width * DPR; cvs.height = 520 * DPR; ctx.scale(DPR, DPR)
      redraw()
    }
    function drawGrid(){
      if(!bgGrid) return
      const step = 20; ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1
      for(let x=0;x<rect.width;x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,520); ctx.stroke() }
      for(let y=0;y<520;y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(rect.width,y); ctx.stroke() }
    }
    function redraw(){
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,rect.width,520); drawGrid()
      for(const s of strokes){
        ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        if(s.mode==='erase'){ ctx.globalCompositeOperation='destination-out'; ctx.strokeStyle='#000' }
        else { ctx.globalCompositeOperation='source-over'; ctx.strokeStyle = s.color }
        if(s.mode==='sticker' && s.sticker && s.start){
          ctx.font = `${s.width*6}px system-ui`; ctx.fillText(s.sticker, s.start.x, s.start.y)
          continue
        }
        if(s.mode==='line' && s.start && s.points[0]){
          ctx.beginPath(); ctx.moveTo(s.start.x, s.start.y); const p=s.points[s.points.length-1]; ctx.lineTo(p.x,p.y); ctx.stroke(); continue
        }
        if(s.mode==='rect' && s.start && s.points[0]){
          const p=s.points[s.points.length-1]; ctx.strokeRect(s.start.x, s.start.y, p.x-s.start.x, p.y-s.start.y); continue
        }
        if(s.mode==='circle' && s.start && s.points[0]){
          const p=s.points[s.points.length-1]; const rx=(p.x-s.start.x)/2, ry=(p.y-s.start.y)/2; const cx=s.start.x+rx, cy=s.start.y+ry
          ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI*2); ctx.stroke(); continue
        }
        ctx.beginPath(); s.points.forEach((p,i)=> i? ctx.lineTo(p.x,p.y): ctx.moveTo(p.x,p.y)); ctx.stroke()
      }
    }
    fit()
    window.addEventListener('resize', fit)
    const id = setInterval(()=>{ if(mode==='rainbow') setHue(h => (h+4)%360) }, 30)
    return ()=>{ window.removeEventListener('resize', fit); clearInterval(id) }
  }, [strokes, mode, bgGrid])

  function getColor(){ return mode==='rainbow' ? `hsl(${hue}, 90%, 50%)` : color }

  function onDown(e: React.MouseEvent|React.TouchEvent){
    drawing.current = true; setRedo([])
    const pos = getPos(e); const s:Stroke = { points:[pos], color:getColor(), width, mode, start: pos }
    if(mode==='sticker') s.sticker = STICKERS[Math.floor(Math.random()*STICKERS.length)]
    setStrokes(prev => [...prev, s])
  }
  function onMove(e: any){
    if(!drawing.current) return
    const pos = getPos(e)
    setStrokes(prev => {
      const cur = [...prev]; const last = cur[cur.length-1]
      const p = {...pos}
      if(last.mode==='jitter'){ p.x += (Math.random()*2-1)*2; p.y += (Math.random()*2-1)*2 }
      last.points.push(p)
      if(last.mode==='rainbow') last.color = getColor()
      return cur
    })
  }
  function onUp(){ drawing.current = false }

  function getPos(e:any){
    const rect = canvasRef.current!.getBoundingClientRect()
    const p = ('touches' in e) ? e.touches[0] : e
    return { x: p.clientX - rect.left, y: p.clientY - rect.top }
  }

  const undo = ()=> setStrokes(prev => { if(!prev.length) return prev; const next = prev.slice(0,-1); setRedo(r=>[...r, prev[prev.length-1]]); return next })
  const redo = ()=> setRedo(prev => { if(!prev.length) return prev; const last = prev[prev.length-1]; setStrokes(s=>[...s, last]); return prev.slice(0,-1) })
  const clear = ()=> { if(confirm('清空画布？')) { setStrokes([]); setRedo([]) } }
  const save = ()=>{ const url = (canvasRef.current as HTMLCanvasElement).toDataURL('image/png'); const a = document.createElement('a'); a.href=url; a.download='doodle.png'; a.click() }

  // 自动保存当前画布与设置
  useEffect(() => {
    const payload = JSON.stringify({
      strokes,
      opts: { mode, width, color, bgGrid }
    });
    try { localStorage.setItem('doodle_v1', payload); } catch {}
  }, [strokes, mode, width, color, bgGrid]);

  // 键盘快捷键：Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z / Ctrl+Y 重做、Ctrl/Cmd+S 导出、G 网格、[ ] 线宽、N/E/R/L/M/O/S 切换工具
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); (e.shiftKey ? redo : undo)(); return; }
      if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
      if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); save(); return; }
      if (k === 'g' || k === 'G') { setBgGrid(v => !v); return; }
      if (k === '[') { setWidth(w => Math.max(1, w - 1)); return; }
      if (k === ']') { setWidth(w => Math.min(28, w + 1)); return; }
      if (ctrl && (k === 'c' || k === 'C')) { clear(); return; }
      // 工具切换（非样式改动，仅交互增强）
      switch (k) {
        case 'n': case 'N': setMode('normal'); break;
        case 'e': case 'E': setMode('erase'); break;
        case 'r': case 'R': setMode('rainbow'); break;
        case 'l': case 'L': setMode('line'); break;
        case 'm': case 'M': setMode('rect'); break;
        case 'o': case 'O': setMode('circle'); break;
        case 's': case 'S': if (!ctrl) setMode('sticker'); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, save, clear]);

  return (
    <div className="container">
      <h1>🎨 涂鸦板</h1>
      <p className="desc">笔刷：普通/彩虹/抖动/橡皮擦；形状：直线/矩形/椭圆；玩法：贴纸、网格、撤销/重做、导出。</p>

      <div className="card fade-in" style={{padding:12}}>
        <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:8}}>
          <select value={mode} onChange={e=>setMode(e.target.value as any)} style={{padding:'8px 10px', borderRadius:10}}>
            <option value="normal">✏️ 普通笔</option>
            <option value="rainbow">🌈 彩虹笔</option>
            <option value="jitter">✨ 抖动笔</option>
            <option value="erase">🧽 橡皮擦</option>
            <option value="line">📏 直线</option>
            <option value="rect">▭ 矩形</option>
            <option value="circle">⬭ 椭圆</option>
            <option value="sticker">🧸 贴纸</option>
          </select>
          {!(mode==='rainbow' || mode==='erase' || mode==='sticker') && (
            <input type="color" value={color} onChange={e=>setColor(e.target.value)} />
          )}
          <label style={{display:'flex', alignItems:'center', gap:8}}>粗细
            <input type="range" min={1} max={28} value={width} onChange={e=>setWidth(parseInt(e.target.value))}/>
          </label>
          <label style={{display:'flex', alignItems:'center', gap:8}}>
            <input type="checkbox" checked={bgGrid} onChange={e=>setBgGrid(e.target.checked)}/> 网格
          </label>
          <button className="btn ghost" onClick={undo}>撤销</button>
          <button className="btn ghost" onClick={redo}>重做</button>
          <button className="btn secondary" onClick={save}>导出PNG</button>
          <button className="btn" onClick={clear}>清空</button>
        </div>

        <div className="stage" style={{background:'#fff'}}>
          <canvas ref={canvasRef} style={{width:'100%', height:520, touchAction:'none'}}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}/>
        </div>
      </div>

      <div style={{marginTop:12}}><a className="btn ghost" href="/">返回首页</a></div>
    </div>
  )
}
