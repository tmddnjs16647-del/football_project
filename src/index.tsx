import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { cors } from 'hono/cors'
import { getCookie, setCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// Increase body limit for image uploads
app.use('*', async (c, next) => {
  await next()
})

// 정적 파일 서빙 설정 수정
// 1. /static/* 요청은 ./public/static/* 파일로 매핑
app.use('/static/*', serveStatic({ root: './public' }))

// 2. 혹시 모를 루트 경로 파일들도 서빙 (favicon 등)
app.use('/favicon.ico', serveStatic({ path: './public/favicon.ico' }))

app.use('/api/*', cors())

// Error Handling
app.onError((err, c) => {
  console.error(`${err}`)
  return c.text('Internal Server Error', 500)
})

// --- Public API: Get Data ---
app.get('/api/data', async (c) => {
  const { results: players } = await c.env.DB.prepare('SELECT * FROM players ORDER BY id DESC').all()
  const { results: matches } = await c.env.DB.prepare('SELECT * FROM matches ORDER BY date ASC').all()
  const stadium = await c.env.DB.prepare('SELECT * FROM stadium WHERE id = 1').first()
  return c.json({ players, matches, stadium })
})

// --- Public API: Submit Requests ---
app.post('/api/match-request', async (c) => {
  const { teamName, date, time, contact } = await c.req.json()
  await c.env.DB.prepare('INSERT INTO match_requests (team_name, date, time, contact) VALUES (?, ?, ?, ?)')
    .bind(teamName, date, time, contact)
    .run()
  return c.json({ success: true, message: '매칭 신청이 접수되었습니다!' })
})

app.post('/api/join-request', async (c) => {
  const { name, birth, position, contact } = await c.req.json()
  await c.env.DB.prepare('INSERT INTO join_requests (name, birth, position, contact) VALUES (?, ?, ?, ?)')
    .bind(name, birth, position, contact)
    .run()
  return c.json({ success: true, message: '가입 문의가 전송되었습니다!' })
})

// --- Admin Auth ---
app.post('/api/admin/login', async (c) => {
  const { username, password } = await c.req.json()
  const admin = await c.env.DB.prepare('SELECT * FROM admins WHERE username = ? AND password = ?')
    .bind(username, password)
    .first()

  if (admin) {
    setCookie(c, 'admin_session', 'logged_in', { path: '/', httpOnly: false })
    return c.json({ success: true })
  }
  return c.json({ success: false }, 401)
})

// --- Admin API: Manage Stadium ---
app.post('/api/admin/stadium', async (c) => {
  const { address, description, contact_info } = await c.req.json()

  if (address) {
    // Geocode address and update everything
    try {
      const geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, {
        headers: { 'User-Agent': 'BandiFC/1.0' }
      });
      const geoData = await geoResponse.json()

      if (geoData && geoData.length > 0) {
        const { lat, lon } = geoData[0]
        await c.env.DB.prepare('UPDATE stadium SET address = ?, lat = ?, lng = ?, description = ?, contact_info = ? WHERE id = 1')
          .bind(address, parseFloat(lat), parseFloat(lon), description, contact_info)
          .run()
        return c.json({ success: true })
      } else {
        // Only update the text fields if geocoding fails but an address was provided
        await c.env.DB.prepare('UPDATE stadium SET address = ?, description = ?, contact_info = ? WHERE id = 1')
          .bind(address, description, contact_info)
          .run()
        return c.json({ success: true, message: '주소 좌표를 찾지 못했지만, 텍스트 정보는 저장되었습니다.' })
      }
    } catch (e) {
      console.error('Geocoding error:', e)
      // Fallback to saving text fields even if geocoding fails
      await c.env.DB.prepare('UPDATE stadium SET address = ?, description = ?, contact_info = ? WHERE id = 1')
        .bind(address, description, contact_info)
        .run()
      return c.json({ success: true, message: '주소 변환 중 오류가 발생했지만, 텍스트 정보는 저장되었습니다.' })
    }
  } else {
    // Update only description and contact info
    await c.env.DB.prepare('UPDATE stadium SET description = ?, contact_info = ? WHERE id = 1')
      .bind(description, contact_info)
      .run()
    return c.json({ success: true })
  }
})

// --- Admin API: Manage Players ---
app.post('/api/admin/players', async (c) => {
  const { name, number, position, role, image } = await c.req.json()
  await c.env.DB.prepare('INSERT INTO players (name, number, position, role, image) VALUES (?, ?, ?, ?, ?)')
    .bind(name, number, position, role, image)
    .run()
  return c.json({ success: true })
})

app.delete('/api/admin/players/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM players WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// --- Admin API: Manage Matches ---
app.post('/api/admin/matches', async (c) => {
  const body = await c.req.json()
  await c.env.DB.prepare(`
    INSERT INTO matches (status, date, time, opponent, location, result, score, d_day) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    body.status || 'UPCOMING', 
    body.date, 
    body.time, 
    body.opponent, 
    body.location || 'HOME', 
    body.result, 
    body.score,
    body.dDay
  ).run()
  return c.json({ success: true })
})

app.delete('/api/admin/matches/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM matches WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// --- Admin API: Get Requests ---
app.get('/api/admin/requests', async (c) => {
  const { results: matchRequests } = await c.env.DB.prepare('SELECT * FROM match_requests ORDER BY id DESC').all()
  const { results: joinRequests } = await c.env.DB.prepare('SELECT * FROM join_requests ORDER BY id DESC').all()
  return c.json({ matchRequests, joinRequests })
})

app.delete('/api/admin/requests/:type/:id', async (c) => {
  const type = c.req.param('type')
  const id = c.req.param('id')
  const table = type === 'match' ? 'match_requests' : 'join_requests'
  
  // Safe table name usage (whitelisted)
  if (table !== 'match_requests' && table !== 'join_requests') return c.json({ success: false }, 400)

  await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run()
  return c.json({ success: true })
})

// --- Page Routes ---
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko" class="scroll-smooth">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BANDI FC - Official Team Site</title>
        
        <!-- Fonts & Icons -->
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Do+Hyeon&family=Russo+One&display=swap" rel="stylesheet">
        
        <!-- Custom CSS -->
        <link href="/static/styles.css" rel="stylesheet">
        
        <!-- Tailwind Configuration -->
        <script>
            tailwind.config = {
                theme: {
                    extend: {
                        colors: {
                            'team-primary': '#a3e635',
                            'team-dark': '#0f172a',
                            'team-darker': '#020617',
                            'team-card': '#1e293b',
                        },
                        fontFamily: {
                            'game': ['"Russo One"', 'sans-serif'],
                            'kor-title': ['"Black Han Sans"', 'sans-serif'],
                            'kor-body': ['"Do Hyeon"', 'sans-serif'],
                        }
                    }
                }
            }
        </script>
    </head>
    <body class="bg-team-dark text-white font-kor-body antialiased selection:bg-team-primary selection:text-team-darker">

        <!-- Navigation -->
        <nav class="fixed w-full z-50 bg-team-darker/90 backdrop-blur-md border-b border-white/10">
            <div class="container mx-auto px-4 py-3 flex justify-between items-center">
                <a href="#" class="text-2xl font-game text-team-primary tracking-wider italic flex items-center gap-2">
                    <i class="fas fa-bolt"></i> BANDI FC
                </a>
                <div class="hidden md:flex space-x-8 text-lg">
                    <a href="#roster" class="hover:text-team-primary transition-colors">TEAM</a>
                    <a href="#stadium" class="hover:text-team-primary transition-colors">STADIUM</a>
                    <a href="#contact" class="hover:text-team-primary transition-colors">CONTACT</a>
                </div>
                <div class="flex gap-2">
                    <button onclick="document.getElementById('contact').scrollIntoView()" class="bg-team-primary text-team-darker font-bold px-4 py-1 skew-x-[-12deg] hover:bg-white transition-colors">
                        <span class="block skew-x-[12deg]">JOIN US</span>
                    </button>
                    <!-- Admin Link (Hidden-ish) -->
                    <a href="/admin" class="text-gray-600 hover:text-white flex items-center px-2">
                        <i class="fas fa-cog"></i>
                    </a>
                </div>
            </div>
        </nav>

        <!-- Hero Section -->
        <header id="home" class="relative h-screen min-h-[600px] flex items-center justify-center overflow-hidden">
            <!-- Background Image with Overlay -->
            <div class="absolute inset-0 z-0">
                <img src="https://images.unsplash.com/photo-1522778119026-d647f0565c6d?q=80&w=2070&auto=format&fit=crop" 
                     alt="Stadium" 
                     class="w-full h-full object-cover opacity-60">
                <div class="absolute inset-0 bg-gradient-to-t from-team-dark via-team-dark/50 to-transparent"></div>
            </div>
            
            <div class="relative z-10 text-center px-4 max-w-4xl mx-auto mt-16">
                <div class="inline-block border border-team-primary/50 bg-black/30 backdrop-blur px-4 py-1 rounded-full mb-4 animate-fade-in-up">
                    <span class="text-team-primary font-bold tracking-widest text-sm">SINCE 2024</span>
                </div>
                <h1 class="text-6xl md:text-8xl font-game text-white mb-6 tracking-tighter drop-shadow-lg animate-fade-in">
                    WE ARE <span class="text-transparent bg-clip-text bg-gradient-to-r from-team-primary to-green-600">BANDI</span>
                </h1>
                <p class="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto font-light leading-relaxed">
                    열정으로 하나되는 반디FC 공식 홈페이지에 오신 것을 환영합니다.<br>
                    함께 땀 흘리며 승리의 기쁨을 나눌 당신을 기다립니다.
                </p>
                
                <div class="flex flex-col sm:flex-row gap-4 justify-center">
                    <a href="#roster" class="group relative px-8 py-4 bg-transparent border-2 border-team-primary text-team-primary font-bold overflow-hidden">
                        <span class="absolute inset-0 w-full h-full bg-team-primary/10 group-hover:bg-team-primary/100 group-hover:text-team-darker transition-all duration-300 ease-out transform scale-x-0 group-hover:scale-x-100 origin-left"></span>
                        <span class="relative z-10 group-hover:text-team-darker transition-colors duration-300">선수단 보기</span>
                    </a>
                </div>
            </div>
            
            <!-- Scroll Indicator -->
            <div class="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
                <i class="fas fa-chevron-down text-team-primary text-2xl"></i>
            </div>
        </header>

        <!-- Schedule Section -->
        <section id="schedule" class="py-20 bg-team-darker border-b border-white/5 relative">
            <div class="container mx-auto px-4 max-w-5xl">
                <div class="flex items-end justify-between mb-10 border-b border-white/10 pb-4">
                    <div>
                        <h2 class="text-3xl md:text-4xl font-game text-white">MATCH SCHEDULE</h2>
                        <p class="text-gray-400 mt-2 text-sm md:text-base">이번 시즌 경기 일정 및 결과</p>
                    </div>
                    <div class="hidden md:block">
                        <span class="text-xs font-bold px-2 py-1 bg-team-primary/10 text-team-primary rounded border border-team-primary/30">SEASON 2024</span>
                    </div>
                </div>

                <!-- Schedule List Container -->
                <div id="schedule-list" class="space-y-4">
                    <!-- Matches will be injected by JS -->
                    <div class="text-center py-8">
                        <i class="fas fa-spinner fa-spin text-team-primary text-2xl"></i>
                    </div>
                </div>
                
                <div class="mt-8 text-center md:text-right">
                    <a href="#contact" class="inline-flex items-center text-sm text-gray-400 hover:text-team-primary transition-colors">
                        <i class="fas fa-plus-circle mr-2"></i> 전체 일정 보기 / 매칭 신청하기
                    </a>
                </div>
            </div>
        </section>

        <!-- Roster Section -->
        <section id="roster" class="py-20 bg-team-dark relative">
            <div class="container mx-auto px-4">
                <div class="text-center mb-16">
                    <h2 class="text-4xl md:text-5xl font-game text-white mb-4">TEAM ROSTER</h2>
                    <div class="h-1 w-20 bg-team-primary mx-auto"></div>
                </div>

                <!-- Position Tabs -->
                <div class="flex flex-wrap justify-center gap-2 mb-12" id="position-tabs">
                    <!-- Tabs will be injected by JS -->
                </div>

                <!-- Player Grid -->
                <div id="player-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <!-- Players will be injected by JS -->
                    <div class="col-span-full text-center py-8">
                        <i class="fas fa-spinner fa-spin text-team-primary text-2xl"></i>
                    </div>
                </div>
            </div>
        </section>

        <!-- Stadium/Info Section -->
        <section id="stadium" class="py-20 bg-team-darker relative border-t border-white/5">
            <div class="container mx-auto px-4">
                <div class="flex flex-col lg:flex-row gap-12 items-center">
                    
                    <!-- Map/Image Area -->
                    <div class="w-full lg:w-1/2 relative group">
                        <div class="absolute -inset-2 bg-gradient-to-r from-team-primary to-blue-500 rounded-xl opacity-20 group-hover:opacity-40 blur transition duration-500"></div>
                        <div class="relative bg-team-card rounded-xl overflow-hidden border border-white/10 h-[400px]">
                            <!-- Placeholder for Map -->
                            <iframe 
                                src="https://www.google.com/maps?q=35.7958,128.4907&output=embed&z=15" 
                                width="100%" 
                                height="100%" 
                                style="border:0;" 
                                allowfullscreen="" 
                                loading="lazy"
                                class="grayscale hover:grayscale-0 transition-all duration-500">
                            </iframe>
                            <div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                                <p class="text-team-primary font-bold text-lg"><i class="fas fa-map-marker-alt mr-2"></i> HOME GROUND</p>
                            </div>
                        </div>
                    </div>

                    <!-- Info Text -->
                    <div class="w-full lg:w-1/2 space-y-8">
                        <div>
                            <h2 class="text-4xl font-game text-white mb-2">STADIUM INFO</h2>
                            <p class="text-team-primary text-xl font-kor-title">옥포읍 간경리 10</p>
                        </div>

                        <div class="space-y-6">
                            <div class="flex items-start gap-4 p-4 bg-team-card/50 rounded-lg border-l-4 border-team-primary">
                                <div class="bg-team-primary/20 p-3 rounded-full text-team-primary">
                                    <i class="fas fa-road text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold mb-1">오시는 길</h3>
                                    <p class="text-gray-400">대구 달성군 옥포읍 간경리 10 시민체육공원 축구장</p>
                                    <p class="text-sm text-gray-500 mt-1">* 주차장 완비 / 야간 조명 가능</p>
                                </div>
                            </div>

                            <div class="flex items-start gap-4 p-4 bg-team-card/50 rounded-lg border-l-4 border-blue-500">
                                <div class="bg-blue-500/20 p-3 rounded-full text-blue-500">
                                    <i class="fas fa-phone text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold mb-1">팀 연락처</h3>
                                    <p class="text-gray-400">총무: 010-1234-5678</p>
                                    <p class="text-gray-400">주장: 010-9876-5432</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Contact Action Section -->
        <section id="contact" class="py-20 bg-team-dark relative overflow-hidden">
            <!-- Background Decoration -->
            <div class="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div class="absolute -top-24 -right-24 w-96 h-96 bg-team-primary/5 rounded-full blur-3xl"></div>
                <div class="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl"></div>
            </div>

            <div class="container mx-auto px-4 max-w-5xl relative z-10">
                <div class="text-center mb-16">
                    <h2 class="text-4xl md:text-5xl font-game text-white mb-4">CONTACT US</h2>
                    <p class="text-gray-400">BANDI FC와 함께할 준비가 되셨나요?</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    <!-- Match Request Action Card -->
                    <div onclick="openModal('match-modal')" class="group cursor-pointer relative bg-team-card rounded-2xl p-8 border border-white/10 hover:border-team-primary transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(163,230,53,0.15)] text-center overflow-hidden">
                        <div class="absolute inset-0 bg-gradient-to-br from-team-primary/0 via-team-primary/0 to-team-primary/5 group-hover:via-team-primary/10 transition-all duration-500"></div>
                        
                        <div class="relative z-10">
                            <div class="w-20 h-20 mx-auto bg-team-card border-2 border-team-primary rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_15px_rgba(163,230,53,0.3)]">
                                <i class="fas fa-handshake text-3xl text-team-primary"></i>
                            </div>
                            <h3 class="text-2xl font-game text-white mb-2 group-hover:text-team-primary transition-colors">MATCH REQUEST</h3>
                            <p class="text-gray-400 mb-6 word-keep-all">우리 팀과 경기를 하고 싶으신가요?<br>언제든 환영합니다.</p>
                            <span class="inline-block px-6 py-2 border border-team-primary text-team-primary font-bold rounded hover:bg-team-primary hover:text-team-darker transition-colors">
                                매칭 신청하기
                            </span>
                        </div>
                    </div>

                    <!-- Join Request Action Card -->
                    <div onclick="openModal('join-modal')" class="group cursor-pointer relative bg-team-card rounded-2xl p-8 border border-white/10 hover:border-blue-500 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] text-center overflow-hidden">
                        <div class="absolute inset-0 bg-gradient-to-br from-blue-500/0 via-blue-500/0 to-blue-500/5 group-hover:via-blue-500/10 transition-all duration-500"></div>
                        
                        <div class="relative z-10">
                            <div class="w-20 h-20 mx-auto bg-team-card border-2 border-blue-500 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                <i class="fas fa-user-plus text-3xl text-blue-500"></i>
                            </div>
                            <h3 class="text-2xl font-game text-white mb-2 group-hover:text-blue-500 transition-colors">JOIN TEAM</h3>
                            <p class="text-gray-400 mb-6 word-keep-all">BANDI FC의 일원이 되어주세요.<br>열정만 있다면 충분합니다.</p>
                            <span class="inline-block px-6 py-2 border border-blue-500 text-blue-500 font-bold rounded hover:bg-blue-500 hover:text-white transition-colors">
                                입단 신청하기
                            </span>
                        </div>
                    </div>

                </div>
            </div>
        </section>

        <!-- Modals (Hidden by default) -->
        <!-- Match Modal -->
        <div id="match-modal" class="fixed inset-0 z-[100] hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <!-- Backdrop -->
            <div class="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity opacity-0 modal-backdrop" onclick="closeModal('match-modal')"></div>

            <div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
                <div class="relative transform overflow-hidden rounded-2xl bg-team-card border border-team-primary/30 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg scale-95 opacity-0 modal-panel">
                    
                    <!-- Header -->
                    <div class="bg-team-darker/50 px-4 py-3 sm:px-6 border-b border-white/5 flex justify-between items-center">
                        <h3 class="text-lg font-game text-team-primary flex items-center gap-2">
                            <i class="fas fa-handshake"></i> MATCH REQUEST
                        </h3>
                        <button type="button" onclick="closeModal('match-modal')" class="text-gray-400 hover:text-white transition-colors">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="px-4 py-6 sm:p-6 bg-team-card">
                        <form id="match-form" class="space-y-4">
                            <div>
                                <label class="block text-sm text-gray-400 mb-1">상대 팀명</label>
                                <input type="text" name="teamName" required class="w-full bg-team-dark border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-team-primary focus:ring-1 focus:ring-team-primary transition-colors text-white">
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm text-gray-400 mb-1">희망 날짜</label>
                                    <input type="date" name="date" required class="w-full bg-team-dark border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-team-primary text-white">
                                </div>
                                <div>
                                    <label class="block text-sm text-gray-400 mb-1">희망 시간</label>
                                    <input type="time" name="time" required class="w-full bg-team-dark border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-team-primary text-white">
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm text-gray-400 mb-1">연락처</label>
                                <input type="tel" name="contact" required class="w-full bg-team-dark border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-team-primary text-white">
                            </div>
                            <button type="submit" class="w-full bg-gradient-to-r from-team-primary to-green-600 text-team-darker font-bold py-3 mt-4 hover:shadow-[0_0_20px_rgba(163,230,53,0.4)] transition-all uppercase tracking-wider rounded">
                                매칭 신청하기
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <!-- Join Modal -->
        <div id="join-modal" class="fixed inset-0 z-[100] hidden" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <!-- Backdrop -->
            <div class="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity opacity-0 modal-backdrop" onclick="closeModal('join-modal')"></div>

            <div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
                <div class="relative transform overflow-hidden rounded-2xl bg-team-card border border-blue-500/30 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg scale-95 opacity-0 modal-panel">
                    
                    <!-- Header -->
                    <div class="bg-team-darker/50 px-4 py-3 sm:px-6 border-b border-white/5 flex justify-between items-center">
                        <h3 class="text-lg font-game text-blue-500 flex items-center gap-2">
                            <i class="fas fa-user-plus"></i> JOIN TEAM
                        </h3>
                        <button type="button" onclick="closeModal('join-modal')" class="text-gray-400 hover:text-white transition-colors">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div class="px-4 py-6 sm:p-6 bg-team-card">
                        <form id="join-form" class="space-y-4">
                            <div>
                                <label class="block text-sm text-gray-400 mb-1">이름</label>
                                <input type="text" name="name" required class="w-full bg-team-dark border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors text-white">
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm text-gray-400 mb-1">생년월일</label>
                                    <input type="text" name="birth" placeholder="950101" class="w-full bg-team-dark border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-blue-500 text-white">
                                </div>
                                <div>
                                    <label class="block text-sm text-gray-400 mb-1">주포지션</label>
                                    <select name="position" class="w-full bg-team-dark border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-blue-500 text-white">
                                        <option value="FW">FW (공격수)</option>
                                        <option value="MF">MF (미드필더)</option>
                                        <option value="DF">DF (수비수)</option>
                                        <option value="GK">GK (골키퍼)</option>
                                        <option value="NONE">초보/미정</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm text-gray-400 mb-1">연락처</label>
                                <input type="tel" name="contact" required class="w-full bg-team-dark border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-blue-500 text-white">
                            </div>
                            <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 mt-4 hover:bg-blue-500 transition-all uppercase tracking-wider shadow-lg shadow-blue-900/50">
                                가입 문의하기
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <footer class="bg-team-darker py-8 border-t border-white/10 text-center">
            <p class="text-team-primary font-game text-xl mb-2">BANDI FC</p>
            <p class="text-gray-500 text-sm">© 2024 BANDI FC. All rights reserved.</p>
        </footer>

        <!-- JS Logic -->
        <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

app.get('/admin', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BANDI FC - Admin</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-slate-900 text-white font-sans">
        
        <!-- Login Form -->
        <div id="login-section" class="min-h-screen flex items-center justify-center">
            <div class="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-md border border-slate-700">
                <h1 class="text-3xl font-bold text-center mb-6 text-lime-400">ADMIN LOGIN</h1>
                <form id="login-form" class="space-y-4">
                    <input type="text" id="username" placeholder="Username" class="w-full bg-slate-900 border border-slate-700 p-3 rounded text-white focus:border-lime-400 focus:outline-none">
                    <input type="password" id="password" placeholder="Password" class="w-full bg-slate-900 border border-slate-700 p-3 rounded text-white focus:border-lime-400 focus:outline-none">
                    <button type="submit" class="w-full bg-lime-400 text-slate-900 font-bold py-3 rounded hover:bg-lime-300 transition-colors">LOGIN</button>
                </form>
            </div>
        </div>

        <!-- Dashboard (Hidden initially) -->
        <div id="dashboard-section" class="hidden min-h-screen flex flex-col">
            <nav class="bg-slate-950 border-b border-slate-800 p-4 sticky top-0 z-50">
                <div class="container mx-auto flex justify-between items-center">
                    <h1 class="text-xl font-bold text-lime-400">BANDI FC MANAGER</h1>
                    <div class="flex gap-4">
                        <a href="/" target="_blank" class="text-gray-400 hover:text-white"><i class="fas fa-home"></i> 홈으로</a>
                        <button onclick="logout()" class="text-gray-400 hover:text-white"><i class="fas fa-sign-out-alt"></i> 로그아웃</button>
                    </div>
                </div>
            </nav>

            <div class="container mx-auto p-4 lg:p-8 grid grid-cols-1 xl:grid-cols-2 gap-8 flex-1">
                
                <!-- Player Management -->
                <div class="bg-slate-800 rounded-xl p-6 border border-slate-700 flex flex-col h-full max-h-[800px]">
                    <h2 class="text-2xl font-bold mb-4 flex items-center gap-2"><i class="fas fa-users text-lime-400"></i> 선수단 관리</h2>
                    
                    <!-- Add Player Form -->
                    <form id="add-player-form" class="bg-slate-900 p-4 rounded-lg mb-6 grid grid-cols-2 gap-2">
                        <div class="col-span-2 text-xs text-gray-400 mb-1">
                            * 사진은 500KB 이하의 정사각형 이미지를 권장합니다.
                        </div>
                        <input type="text" name="name" placeholder="이름" required class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                        <input type="text" name="number" placeholder="등번호/직책" required class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                        <select name="position" class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                            <option value="FW">FW</option>
                            <option value="MF">MF</option>
                            <option value="DF">DF</option>
                            <option value="GK">GK</option>
                            <option value="STAFF">STAFF</option>
                            <option value="MGT">운영진</option>
                        </select>
                        <input type="text" name="role" placeholder="역할 (예: 주장)" class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                        
                        <!-- Image Upload -->
                        <div class="col-span-2">
                            <label class="block text-sm text-gray-400 mb-1">선수 사진 (선택)</label>
                            <input type="file" id="player-image" accept="image/*" class="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-lime-400 file:text-slate-900 hover:file:bg-lime-300">
                        </div>

                        <button type="submit" class="col-span-2 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-bold mt-2">선수 추가</button>
                    </form>

                    <!-- Player List -->
                    <div id="admin-player-list" class="space-y-2 overflow-y-auto pr-2 flex-1">
                        <!-- Loaded by JS -->
                    </div>
                </div>

                <!-- Right Column: Matches & Requests -->
                <div class="flex flex-col gap-8 h-full">
                    
                    <!-- Match Management -->
                    <div class="bg-slate-800 rounded-xl p-6 border border-slate-700 max-h-[400px] flex flex-col">
                        <h2 class="text-2xl font-bold mb-4 flex items-center gap-2"><i class="fas fa-calendar-alt text-lime-400"></i> 경기 일정 관리</h2>

                        <!-- Add Match Form -->
                        <form id="add-match-form" class="bg-slate-900 p-4 rounded-lg mb-6 space-y-2 text-sm">
                            <div class="grid grid-cols-2 gap-2">
                                <select name="status" class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                                    <option value="UPCOMING">예정된 경기</option>
                                    <option value="COMPLETED">종료된 경기</option>
                                </select>
                                <input type="text" name="dDay" placeholder="D-Day (예: D-7)" class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <input type="text" name="date" placeholder="날짜 (2024.01.01)" required class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                                <input type="text" name="time" placeholder="시간 (14:00)" required class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                            </div>
                            <input type="text" name="opponent" placeholder="상대팀명" required class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                            <div class="grid grid-cols-2 gap-2">
                                <select name="location" class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                                    <option value="HOME">HOME</option>
                                    <option value="AWAY">AWAY</option>
                                </select>
                                <select name="result" class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                                    <option value="">결과 (미정)</option>
                                    <option value="WIN">WIN</option>
                                    <option value="LOSE">LOSE</option>
                                    <option value="DRAW">DRAW</option>
                                </select>
                            </div>
                            <input type="text" name="score" placeholder="스코어 (예: 3 : 1)" class="bg-slate-800 border border-slate-700 p-2 rounded text-white">
                            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-bold">경기 추가</button>
                        </form>

                        <!-- Match List -->
                        <div id="admin-match-list" class="space-y-2 overflow-y-auto pr-2 flex-1">
                            <!-- Loaded by JS -->
                        </div>
                    </div>

                    <!-- Requests Inbox -->
                    <div class="bg-slate-800 rounded-xl p-6 border border-slate-700 flex-1 flex flex-col min-h-[300px]">
                        <div class="flex justify-between items-center mb-4">
                            <h2 class="text-2xl font-bold flex items-center gap-2"><i class="fas fa-inbox text-lime-400"></i> 받은 신청함</h2>
                            <button onclick="loadRequests()" class="text-sm text-lime-400 hover:underline"><i class="fas fa-sync"></i> 새로고침</button>
                        </div>
                        
                        <div class="flex gap-2 mb-4 border-b border-slate-700">
                            <button onclick="switchRequestTab('match')" id="tab-match" class="px-4 py-2 font-bold text-lime-400 border-b-2 border-lime-400">매칭 신청</button>
                            <button onclick="switchRequestTab('join')" id="tab-join" class="px-4 py-2 font-bold text-gray-500 hover:text-white">가입 문의</button>
                        </div>

                        <div id="requests-container" class="space-y-2 overflow-y-auto pr-2 flex-1">
                            <!-- Loaded by JS -->
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
        <script>
            // --- Global State ---
            let requestData = { matches: [], joins: [] };
            let currentRequestTab = 'match';

            // --- Auth Logic ---
            function checkAuth() {
                if (document.cookie.includes('admin_session=logged_in')) {
                    document.getElementById('login-section').classList.add('hidden');
                    document.getElementById('dashboard-section').classList.remove('hidden');
                    loadData();
                    loadRequests();
                }
            }

            async function login(e) {
                e.preventDefault();
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                
                try {
                    const res = await axios.post('/api/admin/login', { username, password });
                    if (res.data.success) {
                        location.reload();
                    }
                } catch(err) {
                    alert('로그인 실패. 아이디/비밀번호를 확인하세요.');
                }
            }

            function logout() {
                document.cookie = 'admin_session=; Max-Age=0; path=/';
                location.reload();
            }

            document.getElementById('login-form').addEventListener('submit', login);
            checkAuth();

            // --- Data Loading ---
            async function loadData() {
                const res = await axios.get('/api/data');
                const { players, matches } = res.data;
                renderAdminPlayers(players);
                renderAdminMatches(matches);
            }

            async function loadRequests() {
                const res = await axios.get('/api/admin/requests');
                requestData.matches = res.data.matchRequests;
                requestData.joins = res.data.joinRequests;
                renderRequests();
            }

            // --- Render Logic ---
            function renderAdminPlayers(players) {
                const list = document.getElementById('admin-player-list');
                list.innerHTML = players.map(p => {
                    const hasImage = p.image ? '<i class="fas fa-image text-lime-400"></i>' : '<i class="fas fa-image text-gray-600"></i>';
                    return \`
                        <div class="flex justify-between items-center bg-slate-900 p-3 rounded border border-slate-700">
                            <div class="flex items-center gap-3">
                                \${hasImage}
                                <div>
                                    <span class="font-bold text-lime-400 w-8 inline-block">\${p.number}</span>
                                    <span class="font-bold">\${p.name}</span>
                                    <span class="text-xs text-gray-400 ml-2">(\${p.position})</span>
                                </div>
                            </div>
                            <button onclick="deletePlayer(\${p.id})" class="text-red-500 hover:text-red-400 px-2">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    \`;
                }).join('');
            }

            function renderAdminMatches(matches) {
                const list = document.getElementById('admin-match-list');
                list.innerHTML = matches.map(m => \`
                    <div class="flex justify-between items-center bg-slate-900 p-3 rounded border border-slate-700">
                        <div>
                            <div class="text-xs text-gray-400">\${m.date} \${m.time}</div>
                            <div class="font-bold">\${m.opponent} <span class="text-xs bg-gray-700 px-1 rounded">\${m.location}</span></div>
                        </div>
                        <button onclick="deleteMatch(\${m.id})" class="text-red-500 hover:text-red-400 px-2">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                \`).join('');
            }

            window.switchRequestTab = (tab) => {
                currentRequestTab = tab;
                document.getElementById('tab-match').className = tab === 'match' ? 'px-4 py-2 font-bold text-lime-400 border-b-2 border-lime-400' : 'px-4 py-2 font-bold text-gray-500 hover:text-white';
                document.getElementById('tab-join').className = tab === 'join' ? 'px-4 py-2 font-bold text-lime-400 border-b-2 border-lime-400' : 'px-4 py-2 font-bold text-gray-500 hover:text-white';
                renderRequests();
            };

            function renderRequests() {
                const container = document.getElementById('requests-container');
                const list = currentRequestTab === 'match' ? requestData.matches : requestData.joins;

                if (list.length === 0) {
                    container.innerHTML = '<div class="text-center text-gray-500 py-8">받은 신청 내역이 없습니다.</div>';
                    return;
                }

                container.innerHTML = list.map(item => {
                    const title = currentRequestTab === 'match' 
                        ? \`<span class="font-bold text-lime-400">VS \${item.team_name}</span>\` 
                        : \`<span class="font-bold text-lime-400">\${item.name} (\${item.position})</span>\`;
                    
                    const details = currentRequestTab === 'match'
                        ? \`\${item.date} \${item.time} / 연락처: \${item.contact}\`
                        : \`생년월일: \${item.birth} / 연락처: \${item.contact}\`;

                    return \`
                        <div class="bg-slate-900 p-3 rounded border border-slate-700 text-sm">
                            <div class="flex justify-between items-start">
                                <div>
                                    <div class="mb-1">\${title}</div>
                                    <div class="text-gray-400 text-xs">\${details}</div>
                                    <div class="text-gray-600 text-[10px] mt-1">\${item.created_at}</div>
                                </div>
                                <button onclick="deleteRequest('\${currentRequestTab}', \${item.id})" class="text-gray-500 hover:text-red-500">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    \`;
                }).join('');
            }

            // --- Action Logic ---
            
            // 1. Add Player with Image
            document.getElementById('add-player-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                
                // Handle Image File
                const fileInput = document.getElementById('player-image');
                if (fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    if (file.size > 500 * 1024) { // 500KB Limit warning
                        if(!confirm('이미지 크기가 큽니다(500KB 이상). 업로드 시 속도가 느려질 수 있습니다. 계속하시겠습니까?')) return;
                    }
                    
                    // Convert to Base64
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = async () => {
                        data.image = reader.result; // Add Base64 string to data
                        await submitPlayer(data, e.target);
                    };
                    reader.onerror = error => alert('이미지 읽기 실패');
                } else {
                    data.image = null;
                    await submitPlayer(data, e.target);
                }
            });

            async function submitPlayer(data, form) {
                try {
                    await axios.post('/api/admin/players', data);
                    form.reset();
                    loadData();
                } catch(err) {
                    alert('저장 실패. 이미지 용량이 너무 클 수 있습니다.');
                }
            }

            document.getElementById('add-match-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                await axios.post('/api/admin/matches', data);
                e.target.reset();
                loadData();
            });

            // --- Delete Actions ---
            window.deletePlayer = async (id) => {
                if(confirm('정말 삭제하시겠습니까?')) {
                    await axios.delete(\`/api/admin/players/\${id}\`);
                    loadData();
                }
            };

            window.deleteMatch = async (id) => {
                if(confirm('정말 삭제하시겠습니까?')) {
                    await axios.delete(\`/api/admin/matches/\${id}\`);
                    loadData();
                }
            };

            window.deleteRequest = async (type, id) => {
                if(confirm('이 신청 내역을 삭제하시겠습니까?')) {
                    await axios.delete(\`/api/admin/requests/\${type}/\${id}\`);
                    loadRequests();
                }
            }
        </script>
    </body>
    </html>
  `)
})

export default app
