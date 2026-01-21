// ==========================================
// TEAM CONFIGURATION
// ==========================================
// 이제 데이터는 DB에서 불러옵니다. 초기 설정만 남겨둡니다.
const teamConfig = {
    teamName: "BANDI FC",
    sport: "soccer",
    positions: [
        { id: 'ALL', label: 'ALL' },
        { id: 'FW', label: 'FW (공격수)' },
        { id: 'MF', label: 'MF (미드필더)' },
        { id: 'DF', label: 'DF (수비수)' },
        { id: 'GK', label: 'GK (골키퍼)' },
        { id: 'STAFF', label: '코칭스탭' },
        { id: 'MGT', label: '운영진' }
    ],
    // DB에서 로드할 것이므로 빈 배열로 초기화
    roster: [],
    matches: []
};

// ==========================================
// APPLICATION LOGIC
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load Data from DB
    await loadTeamData();
    
    // 2. Init UI
    initRoster();
    initSchedule();
    initForms();
    initModals();
});

async function loadTeamData() {
    try {
        const res = await axios.get('/api/data');
        if (res.data) {
            teamConfig.roster = res.data.players;
            teamConfig.matches = res.data.matches;
        }
    } catch (err) {
        console.error('Failed to load team data:', err);
    }
}

// --- Schedule Logic ---
function initSchedule() {
    const scheduleContainer = document.getElementById('schedule-list');
    if (!scheduleContainer) return;

    if (!teamConfig.matches || teamConfig.matches.length === 0) {
        scheduleContainer.innerHTML = '<div class="text-center text-gray-500 py-8">등록된 경기 일정이 없습니다.</div>';
        return;
    }

    scheduleContainer.innerHTML = teamConfig.matches.map(match => {
        const isCompleted = match.status === 'COMPLETED';
        const isWin = match.result === 'WIN';
        
        // Dynamic Styles based on status
        const statusClass = isCompleted 
            ? (isWin ? 'text-team-primary' : 'text-gray-400') 
            : 'text-team-primary animate-pulse';
            
        const borderClass = !isCompleted && match.d_day 
            ? 'border-team-primary/50 shadow-[0_0_15px_rgba(163,230,53,0.1)]' 
            : 'border-white/5';

        const statusLabel = isCompleted 
            ? `<span class="text-xl font-game ${isWin ? 'text-team-primary' : 'text-red-500'}">${match.result}</span>`
            : `<span class="px-3 py-1 bg-team-primary text-team-darker font-bold rounded-full text-sm shadow-lg shadow-team-primary/20">${match.d_day || 'UPCOMING'}</span>`;

        const scoreOrTime = isCompleted
            ? `<span class="text-3xl font-game text-white tracking-widest">${match.score}</span>`
            : `<span class="text-2xl font-game text-white tracking-wider">${match.time}</span>`;

        return `
            <div class="group relative bg-team-card rounded-xl p-6 border ${borderClass} hover:border-team-primary/30 transition-all duration-300 hover:-translate-y-1">
                <!-- Background Gradient on Hover -->
                <div class="absolute inset-0 bg-gradient-to-r from-team-primary/0 via-team-primary/0 to-team-primary/5 group-hover:via-team-primary/5 transition-all duration-500 rounded-xl"></div>
                
                <div class="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    
                    <!-- Date & Location -->
                    <div class="w-full md:w-1/4 text-center md:text-left">
                        <div class="text-gray-400 text-sm font-bold mb-1 flex items-center justify-center md:justify-start gap-2">
                            <i class="far fa-calendar-alt"></i> ${match.date}
                        </div>
                        <div class="text-white font-bold flex items-center justify-center md:justify-start gap-2">
                            <span class="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">${match.location}</span>
                            <span class="text-sm text-gray-400">Stadium</span>
                        </div>
                    </div>

                    <!-- Match Info (Center) -->
                    <div class="w-full md:w-2/4 flex items-center justify-center gap-4 md:gap-8">
                        <div class="text-right flex-1">
                            <span class="font-game text-lg md:text-2xl text-white block md:inline">${teamConfig.teamName}</span>
                        </div>
                        
                        <div class="flex flex-col items-center justify-center w-24 shrink-0">
                            ${scoreOrTime}
                            ${!isCompleted ? '<span class="text-xs text-team-primary mt-1 font-bold">START TIME</span>' : ''}
                        </div>

                        <div class="text-left flex-1">
                            <span class="font-game text-lg md:text-2xl text-gray-400 block md:inline">${match.opponent}</span>
                        </div>
                    </div>

                    <!-- Status/Result (Right) -->
                    <div class="w-full md:w-1/4 text-center md:text-right flex flex-col items-center md:items-end justify-center">
                        ${statusLabel}
                        ${isCompleted ? '<span class="text-xs text-gray-500 mt-1">GAME RESULT</span>' : ''}
                    </div>

                </div>
            </div>
        `;
    }).join('');
}

// --- Roster Logic ---
let currentFilter = 'FW'; // Default tab

function initRoster() {
    renderTabs();
    renderPlayers(currentFilter);
}

function renderTabs() {
    const tabsContainer = document.getElementById('position-tabs');
    tabsContainer.innerHTML = teamConfig.positions.map(pos => `
        <button 
            onclick="switchTab('${pos.id}')"
            class="px-6 py-2 rounded-full border border-white/10 text-sm md:text-base font-bold transition-all duration-300 ${currentFilter === pos.id ? 'bg-team-primary text-team-darker shadow-[0_0_15px_rgba(163,230,53,0.5)] scale-105' : 'bg-transparent text-gray-400 hover:text-white hover:border-white/30'}"
        >
            ${pos.label}
        </button>
    `).join('');
}

window.switchTab = (posId) => {
    currentFilter = posId;
    renderTabs();
    
    // Animate grid out
    const grid = document.getElementById('player-grid');
    grid.style.opacity = '0';
    grid.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        renderPlayers(posId);
        // Animate grid in
        requestAnimationFrame(() => {
            grid.style.opacity = '1';
            grid.style.transform = 'translateY(0)';
        });
    }, 300);
};

function renderPlayers(filter) {
    const grid = document.getElementById('player-grid');
    
    const filteredPlayers = filter === 'ALL' 
        ? teamConfig.roster 
        : teamConfig.roster.filter(p => p.position === filter);

    if (filteredPlayers.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <p class="text-gray-500 text-xl font-kor-body">등록된 선수가 없습니다.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredPlayers.map((player, index) => {
        // Generate placeholder if no image
        const imgUrl = player.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=random&color=fff&size=256`;
        
        return `
            <div class="group relative bg-team-card rounded-xl overflow-hidden shadow-lg border border-white/5 hover:border-team-primary/50 transition-all duration-300 hover:-translate-y-2" style="animation: fadeInUp 0.5s ease-out ${index * 0.1}s backwards">
                
                <!-- Card Background Effect -->
                <div class="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 z-10"></div>
                
                <!-- Player Image Area -->
                <div class="aspect-[3/4] overflow-hidden bg-gray-800 relative">
                    <img src="${imgUrl}" alt="${player.name}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                    
                    <!-- Number Badge -->
                    <div class="absolute top-4 right-4 z-20 bg-team-primary text-team-darker font-game font-bold text-xl w-10 h-10 flex items-center justify-center rounded shadow-lg skew-x-[-10deg]">
                        <span class="skew-x-[10deg]">${player.number}</span>
                    </div>
                </div>

                <!-- Info Area -->
                <div class="absolute bottom-0 left-0 right-0 p-6 z-20">
                    <p class="text-team-primary text-sm font-bold mb-1 tracking-wider uppercase">${player.role || player.position}</p>
                    <h3 class="text-3xl font-kor-title text-white drop-shadow-md">${player.name}</h3>
                </div>

                <!-- Hover Overlay -->
                <div class="absolute inset-0 bg-team-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30 pointer-events-none"></div>
            </div>
        `;
    }).join('');
}

// --- Modal Logic ---
window.openModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent body scroll

    // Animate in
    setTimeout(() => {
        const backdrop = modal.querySelector('.modal-backdrop');
        const panel = modal.querySelector('.modal-panel');
        
        if (backdrop) backdrop.classList.remove('opacity-0');
        if (panel) {
            panel.classList.remove('scale-95', 'opacity-0');
            panel.classList.add('scale-100', 'opacity-100');
        }
    }, 10);
};

window.closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Animate out
    const backdrop = modal.querySelector('.modal-backdrop');
    const panel = modal.querySelector('.modal-panel');
    
    if (backdrop) backdrop.classList.add('opacity-0');
    if (panel) {
        panel.classList.remove('scale-100', 'opacity-100');
        panel.classList.add('scale-95', 'opacity-0');
    }

    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.style.overflow = ''; // Restore body scroll
    }, 300); // Wait for transition
};

function initModals() {
    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('[role="dialog"]').forEach(modal => {
                if (!modal.classList.contains('hidden')) {
                    closeModal(modal.id);
                }
            });
        }
    });
}

// --- Form Logic ---
function initForms() {
    const matchForm = document.getElementById('match-form');
    const joinForm = document.getElementById('join-form');

    if (matchForm) {
        matchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = matchForm.querySelector('button');
            const originalText = btn.innerText;
            
            setLoading(btn, true);

            try {
                const formData = new FormData(matchForm);
                const data = Object.fromEntries(formData.entries());
                
                const res = await axios.post('/api/match-request', data);
                
                if (res.data.success) {
                    alert('매칭 신청이 성공적으로 접수되었습니다. 담당자가 곧 연락드리겠습니다.');
                    matchForm.reset();
                    closeModal('match-modal');
                }
            } catch (err) {
                alert('오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
                console.error(err);
            } finally {
                setLoading(btn, false, originalText);
            }
        });
    }

    if (joinForm) {
        joinForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = joinForm.querySelector('button');
            const originalText = btn.innerText;

            setLoading(btn, true);

            try {
                const formData = new FormData(joinForm);
                const data = Object.fromEntries(formData.entries());
                
                const res = await axios.post('/api/join-request', data);
                
                if (res.data.success) {
                    alert('가입 문의가 전송되었습니다. 환영합니다!');
                    joinForm.reset();
                    closeModal('join-modal');
                }
            } catch (err) {
                alert('오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
                console.error(err);
            } finally {
                setLoading(btn, false, originalText);
            }
        });
    }
}

function setLoading(btn, isLoading, originalText = '') {
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 전송 중...';
        btn.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
        btn.disabled = false;
        btn.innerText = originalText;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}
