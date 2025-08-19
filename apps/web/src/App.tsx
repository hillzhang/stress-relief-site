
import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import WhiteNoise from './pages/WhiteNoise'
import Breath from './pages/Breath'
import Bubbles from './pages/Bubbles'
import FruitSlice from './pages/FruitSlice'
import Bottle from './pages/Bottle'
import BlindBox from './pages/BlindBox'
import DoodleBoard from './pages/DoodleBoard'
import Moyu from './pages/Moyu'
import PopWrap from './pages/PopWrap'
import Spinner from './pages/Spinner'
import Woodfish from './pages/Woodfish'
import Knives from './pages/Knives'
import Fireworks from './pages/Fireworks'
// new games
import Breakout from './pages/Breakout'
import Mole from './pages/Mole'
import Memory from './pages/Memory'

import './styles.css'

function Home() {
  const [quote, setQuote] = useState('')
  useEffect(() => {
    fetch('http://localhost:8080/api/quote')
      .then(r => r.json()).then(d => setQuote(d.quote))
      .catch(() => setQuote('慢慢来，心会跟上。'))
  }, [])

  return (
    <div>
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-badge">😀</div>
            解压小网站
          </div>
          <nav className="nav">
            <a href="#games">小游戏</a>
            <a href="#tools">工具</a>
            <Link to="/noise">白噪音</Link>
            <a href="#fun">互动</a>
            <a href="#about">关于</a>
          </nav>
        </div>
      </header>

      <section className="banner">
        <div className="inner">
          <h1>点一点，放松一整天</h1>
          <p>一句治愈：{quote}</p>
          <div className="cta">
            <Link className="btn primary pop" to="/bubbles">🎮 开始解压</Link>
            <Link className="btn secondary pop" to="/noise">🎵 听白噪音</Link>
          </div>
        </div>
      </section>

      <main className="container">
        <div className="ad"><strong>广告位</strong>（示意）横幅不打扰体验</div>

        <section className="section" id="games">
          <h2>🎮 小游戏</h2>
          <div className="grid">
            <Link className="card pop" to="/bubbles"><div className="title">🫧 戳泡泡</div><div className="desc">即时解压 + 连击</div></Link>
            <Link className="card pop" to="/fruit"><div className="title">🍉 切水果</div><div className="desc">刀光轨迹 + 飞溅</div></Link>
            <Link className="card pop" to="/moyu"><div className="title">🐟 摸鱼模拟器</div><div className="desc">投喂/群游/昼夜</div></Link>
            <Link className="card pop" to="/popwrap"><div className="title">🫧 泡泡纸</div><div className="desc">真实POP音</div></Link>
            <Link className="card pop" to="/spinner"><div className="title">🌀 指尖陀螺</div><div className="desc">RPM 显示</div></Link>
            <Link className="card pop" to="/woodfish"><div className="title">🔔 木鱼</div><div className="desc">禅风 UI</div></Link>
            <Link className="card pop" to="/knives"><div className="title">🎯 飞刀靶</div><div className="desc">木靶 + 钢刀</div></Link>
            <Link className="card pop" to="/fireworks"><div className="title">🎆 放烟花</div><div className="desc">环形/爱心/菊花</div></Link>
            <Link className="card pop" to="/breakout"><div className="title">🧱 打砖块</div><div className="desc">经典复刻</div></Link>
            <Link className="card pop" to="/mole"><div className="title">🐹 打地鼠</div><div className="desc">限时反应</div></Link>
            <Link className="card pop" to="/memory"><div className="title">🃏 记忆翻牌</div><div className="desc">配对放松</div></Link>
          </div>
        </section>

        <section className="section" id="tools">
          <h2>🧰 解压工具</h2>
          <div className="grid">
            <Link className="card pop" to="/breath"><div className="title">😮‍💨 呼吸训练</div><div className="desc">4-4-4-4 / 4-7-8</div></Link>
            <Link className="card pop" to="/doodle"><div className="title">🎨 涂鸦板</div><div className="desc">形状/贴纸/撤销</div></Link>
            <Link className="card pop" to="/noise"><div className="title">🎵 白噪音</div><div className="desc">淡入淡出</div></Link>
          </div>
        </section>

        <section className="section" id="fun">
          <h2>🎁 趣味互动</h2>
          <div className="grid">
            <Link className="card pop" to="/bottle"><div className="title">🥤 解压瓶</div><div className="desc">装瓶→砸碎</div></Link>
            <Link className="card pop" to="/blindbox"><div className="title">📦 拆盲盒</div><div className="desc">贴纸稀有度</div></Link>
          </div>
        </section>

        <footer id="about">©2025 解压小网站 · 轻松一下，继续摸鱼</footer>
      </main>
    </div>
  )
}

export default function App(){
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/noise" element={<WhiteNoise/>} />
        <Route path="/breath" element={<Breath/>} />
        <Route path="/bubbles" element={<Bubbles/>} />
        <Route path="/fruit" element={<FruitSlice/>} />
        <Route path="/bottle" element={<Bottle/>} />
        <Route path="/blindbox" element={<BlindBox/>} />
        <Route path="/doodle" element={<DoodleBoard/>} />
        <Route path="/moyu" element={<Moyu/>} />
        <Route path="/popwrap" element={<PopWrap/>} />
        <Route path="/spinner" element={<Spinner/>} />
        <Route path="/woodfish" element={<Woodfish/>} />
        <Route path="/knives" element={<Knives/>} />
        <Route path="/fireworks" element={<Fireworks/>} />
        <Route path="/breakout" element={<Breakout/>} />
        <Route path="/mole" element={<Mole/>} />
        <Route path="/memory" element={<Memory/>} />
      </Routes>
    </BrowserRouter>
  )
}
