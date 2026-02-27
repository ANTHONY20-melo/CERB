// --- CONTROLE DE VERSÃO DO ARMAZENAMENTO ---
// Garante que o navegador do usuário não tenha dados de uma versão antiga e incompatível.
const APP_STORAGE_VERSION = '2.1';
const currentVersion = localStorage.getItem('app_storage_version');

if (currentVersion !== APP_STORAGE_VERSION) {
    sessionStorage.clear(); // Limpa a sessão para forçar o logout
    localStorage.clear();   // Limpa os dados antigos
    localStorage.setItem('app_storage_version', APP_STORAGE_VERSION);
}

// PROTEÇÃO: Se não estiver logado, volta para o login
let usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));
if (!usuarioLogado) {
    window.location.href = "login.html";
}

// --- FUNÇÕES DE CRIPTOGRAFIA (para redefinição de senha) ---
// Gera um salt aleatório (16 bytes = 128 bits)
function generateSalt() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
}

// PBKDF2 com SHA-256: deriveKey(password, salt) retorna { salt, hash }
async function deriveKey(password, salt = null) {
    if (!salt) salt = generateSalt();
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const saltBuffer = new Uint8Array(salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBuffer, iterations: 100000, hash: 'SHA-256' }, baseKey, 256);
    const hashArray = Array.from(new Uint8Array(bits));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return { salt, hash };
}

async function resetUserPassword(userId, newPassword) {
    let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    const userIndex = usuarios.findIndex(u => String(u.id) === String(userId) || u.usuario === userId);

    if (userIndex !== -1) {
        const { salt, hash } = await deriveKey(newPassword);
        usuarios[userIndex].salt = salt;
        usuarios[userIndex].senha = hash;
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
    } else { throw new Error("Usuário não encontrado para redefinir a senha."); }
}

// DADOS PERSISTENTES
let totalReceitas = parseFloat(localStorage.getItem('totalReceitas')) || 0;
let totalDespesas = parseFloat(localStorage.getItem('totalDespesas')) || 0;
let agendaSalva = JSON.parse(localStorage.getItem('agendaSalva')) || [];
let historicoFinancas = JSON.parse(localStorage.getItem('historicoFinancas')) || [];
// Médicos e disponibilidade: armazenamos array de { nome, dias: [0..6] }
let medicos = JSON.parse(localStorage.getItem('medicos')) || null;
if (!medicos) {
    // Seed inicial com vários médicos genéricos para testes
    medicos = [
        { nome: 'Dr. Arnaldo (Cardio)', dias: [1,2,3,4,5] },
        { nome: 'Dra. Beatriz (Pediatria)', dias: [2,4] },
        { nome: 'Dr. Carlos (Ortopedia)', dias: [1,3,5] },
        { nome: 'Dra. Daniela (Ginecologia)', dias: [2,3,4] },
        { nome: 'Dr. Eduardo (Neurologia)', dias: [1,4,6] },
        { nome: 'Dra. Flávia (Dermatologia)', dias: [2,5] },
        { nome: 'Dr. Gabriel (Clínico Geral)', dias: [1,2,3,4,5,6] }
    ];
    localStorage.setItem('medicos', JSON.stringify(medicos));
}

// DADOS CONSTANTES
const examesDisponiveis = [
    { id: 1, nome: 'Hemograma', preco: 45.00, descricao: 'Análise completa do sangue' },
    { id: 2, nome: 'Glicemia', preco: 35.00, descricao: 'Medição de açúcar no sangue' },
    { id: 3, nome: 'Colesterol Total', preco: 55.00, descricao: 'Perfil lipídico completo' },
    { id: 4, nome: 'TSH', preco: 60.00, descricao: 'Teste da tireoide' },
    { id: 5, nome: 'Raio-X Tórax', preco: 120.00, descricao: 'Radiografia de tórax' },
    { id: 6, nome: 'Ultrassom Abdômen', preco: 180.00, descricao: 'Ultrassom abdominal completo' }
];

let activeChart = null;
let editandoIndex = null;
let editandoMedicoIndex = null;
let carouselInterval = null; // Para controlar o intervalo do carrossel da home
// Estado do calendário (mês/ano) para navegação entre meses
const hojeCalendario = new Date();
// Tenta restaurar seleção anterior do sessionStorage (persistência entre navegações)
const savedMonth = sessionStorage.getItem('calendarMonth');
const savedYear = sessionStorage.getItem('calendarYear');
let calendarMonth = savedMonth !== null ? parseInt(savedMonth, 10) : hojeCalendario.getMonth();
let calendarYear = savedYear !== null ? parseInt(savedYear, 10) : hojeCalendario.getFullYear();

// SISTEMA DE NOTIFICAÇÃO (TOAST)
function notify(mensagem, tipo = 'sucesso') {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    
    const icon = tipo === 'sucesso' ? 'fa-check-circle' : 'fa-exclamation-circle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i> ${mensagem}`;
    container.appendChild(toast);

    // Remove a notificação após 3 segundos
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.5s forwards';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// TELAS (HTML INTERNO)
const contentData = {
    home: `<div id="menu-slider-container"></div>`,
    
    agenda: `<div id="agenda-container"></div>`,
    financas: `<div id="financas-container"></div>`,
    usuarios: `<div id="usuarios-container"></div>`
,
    medicos: `<div id="medicos-container"></div>`,
    marcacao: `<div id="marcacao-container"></div>`,
    exames: `<div id="exames-container"></div>`,
    calendario: `<div id="calendario-container"></div>`,
    solicitacoes: `<div id="solicitacoes-container"></div>`
};

// --- NAVEGAÇÃO ---
function logout() {
    sessionStorage.removeItem('usuarioLogado');
    window.location.href = "login.html";
}

function buildDynamicMenu() {
    const menu = document.querySelector('.sidebar nav ul');
    menu.innerHTML = '';

    const menuItems = [
        { id: 'menu-home', label: 'MENU', icon: 'fa-bars', section: 'home' }
    ];

    if (usuarioLogado.perfil === 'admin') {
        // Administrador vê Solicitações e telas administrativas
        menuItems.push({ id: 'menu-solicitacoes', label: 'Solicitações', icon: 'fa-file-medical', section: 'solicitacoes' });
        menuItems.push(
            { id: 'menu-agenda', label: 'Agenda', icon: 'fa-calendar-alt', section: 'agenda' },
            { id: 'menu-medicos', label: 'Médicos', icon: 'fa-user-md', section: 'medicos' },
            { id: 'menu-usuarios', label: 'Usuários', icon: 'fa-users-cog', section: 'usuarios' },
            { id: 'menu-financas', label: 'Financeiro', icon: 'fa-hand-holding-usd', section: 'financas' }
        );
    } else {
        menuItems.push(
            { id: 'menu-marcacao', label: 'Marcação', icon: 'fa-bookmark', section: 'marcacao' },
            { id: 'menu-exames', label: 'Exames', icon: 'fa-flask', section: 'exames' },
            { id: 'menu-calendario', label: 'Calendário', icon: 'fa-calendar', section: 'calendario' }
        );
    }

    menuItems.forEach((item, index) => {
        const li = document.createElement('li');
        li.id = item.id;
        li.role = 'button';
        li.tabIndex = 0;
        li.setAttribute('data-section', item.section);
        if (index === 0) li.classList.add('active');
        li.innerHTML = `<i class="fas ${item.icon}"></i> ${item.label}`;
        li.addEventListener('click', () => showSection(item.section));
        li.addEventListener('keypress', (e) => { if (e.key === 'Enter' || e.key === ' ') showSection(item.section); });
        menu.appendChild(li);
    });
}

// Renderiza listagem de solicitações de exames
function renderSolicitacoesUI() {
    const container = document.getElementById('solicitacoes-container');
    if (!container) return;

    const todos = JSON.parse(localStorage.getItem('examesSolicitados')) || [];
    const lista = usuarioLogado.perfil === 'admin' ? todos : todos.filter(s => String(s.usuarioId) === String(usuarioLogado.id || usuarioLogado.usuario));

    const html = `
        <div class="card">
            <h3>Solicitações de Exames (${lista.length})</h3>
            ${lista.length === 0 ? '<p style="color:var(--text-sub)">Nenhuma solicitação encontrada.</p>' : `
            <div style="overflow-x:auto; margin-top:12px;">
                <table style="width:100%; border-collapse: collapse; min-width: 720px;">
                    <thead>
                        <tr style="background:#f8f9fa; text-align:left;"><th style="padding:10px;">Data</th><th>Exame</th><th>Paciente</th><th>Pagamento</th><th>Status</th><th style="text-align:center;">Ações</th></tr>
                    </thead>
                    <tbody>
                        ${lista.map(s => `
                            <tr>
                                <td style="padding:10px;">${s.data} ${s.hora}</td>
                                <td>${s.exameNome}</td>
                                <td>${s.usuarioId}</td>
                                <td>${s.pagamento}</td>
                                <td>
                                    <select class="sol-status" data-id="${s.id}" style="padding:6px; border-radius:6px;">
                                        <option value="Pendente" ${s.status==='Pendente'?'selected':''}>Pendente</option>
                                        <option value="Confirmado" ${s.status==='Confirmado'?'selected':''}>Confirmado</option>
                                        <option value="Concluído" ${s.status==='Concluído'?'selected':''}>Concluído</option>
                                        <option value="Cancelado" ${s.status==='Cancelado'?'selected':''}>Cancelado</option>
                                    </select>
                                </td>
                                <td class="acoes-cell">
                                    <div class="acoes-buttons">
                                        <button class="btn-view btn-action" data-id="${s.id}">Ver</button>
                                        ${usuarioLogado.perfil === 'admin' && s.status !== 'Confirmado' ? `<button class="btn-convert-sol btn-action" data-id="${s.id}">Converter</button>` : ''}
                                        <button class="btn-delete-sol btn-action" data-id="${s.id}">Excluir</button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            `}
        </div>
    `;

    container.innerHTML = html;

    // Event listeners: alterar status
    container.querySelectorAll('.sol-status').forEach(sel => {
        sel.addEventListener('change', () => {
            const id = sel.dataset.id;
            const all = JSON.parse(localStorage.getItem('examesSolicitados')) || [];
            const idx = all.findIndex(x => String(x.id) === String(id));
            if (idx >= 0) {
                all[idx].status = sel.value;
                localStorage.setItem('examesSolicitados', JSON.stringify(all));
                notify('Status atualizado', 'sucesso');
                // se desejar, também atualizar agenda se necessário
                renderSolicitacoesUI();
            }
        });
    });

    container.querySelectorAll('.btn-delete-sol').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (!confirm('Excluir essa solicitação?')) return;
        let all = JSON.parse(localStorage.getItem('examesSolicitados')) || [];
        all = all.filter(x => String(x.id) !== String(id));
        localStorage.setItem('examesSolicitados', JSON.stringify(all));
        notify('Solicitação removida', 'erro');
        renderSolicitacoesUI();
    }));

    // Converter solicitação em consulta (apenas admin)
    container.querySelectorAll('.btn-convert-sol').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (!confirm('Confirmar e converter esta solicitação em consulta?')) return;
        const all = JSON.parse(localStorage.getItem('examesSolicitados')) || [];
        const idx = all.findIndex(x => String(x.id) === String(id));
        if (idx < 0) return;
        const s = all[idx];
        s.status = 'Confirmado';
        all[idx] = s;
        localStorage.setItem('examesSolicitados', JSON.stringify(all));

        // Verifica se já existe agendamento similar; se existir, marca como Confirmado, senão cria um novo
        const agenda = JSON.parse(localStorage.getItem('agendaSalva')) || [];
        const found = agenda.find(a => String(a.usuarioId) === String(s.usuarioId) && String(a.data).startsWith(String(s.data)) && (a.hora === s.hora || String(a.hora).startsWith(String(s.hora))));
        if (found) {
            found.status = 'Confirmado';
        } else {
            const novo = {
                id: 'conv-' + Date.now(),
                usuarioId: s.usuarioId,
                nome: s.usuarioId,
                data: s.data,
                hora: s.hora,
                medico: s.medico || 'Aguardando',
                status: 'Confirmado',
                tipo: 'Exame',
                criadoEm: new Date().toISOString()
            };
            agenda.push(novo);
        }
        localStorage.setItem('agendaSalva', JSON.stringify(agenda));

        notify('Solicitação confirmada e convertida em consulta', 'sucesso');
        renderSolicitacoesUI();
        try { renderAgendaUI(); } catch (e) { console.error('Erro ao renderizar agenda:', e); }
        try { renderCalendarioUI(); } catch (e) { console.error('Erro ao renderizar calendário:', e); }
    }));

    container.querySelectorAll('.btn-view').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const all = JSON.parse(localStorage.getItem('examesSolicitados')) || [];
        const s = all.find(x => String(x.id) === String(id));
        if (!s) return;
        alert(`Solicitação:\nExame: ${s.exameNome}\nData: ${s.data} ${s.hora}\nPagamento: ${s.pagamento}\nStatus: ${s.status}`);
    }));
}

function updateHeaderUser() {
    document.getElementById('user-name').textContent = usuarioLogado.nome;
    const avatarEl = document.getElementById('user-avatar');
    if (usuarioLogado.avatar) avatarEl.src = usuarioLogado.avatar;
    else avatarEl.src = `https://i.pravatar.cc/150?u=${usuarioLogado.usuario}`;
}

// Inicializa troca de avatar no header
function initAvatarUpload() {
    const btn = document.getElementById('btn-change-avatar');
    const input = document.getElementById('avatar-input');
    if (!btn || !input) return;

    btn.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        // limite simples: 2MB
        if (file.size > 2 * 1024 * 1024) { notify('Arquivo muito grande (máx 2MB)', 'erro'); return; }
        handleAvatarFile(file);
    });
}

function handleAvatarFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = reader.result;
        // Atualiza sessão e armazenamento de usuários
        usuarioLogado.avatar = dataUrl;
        sessionStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const idx = usuarios.findIndex(u => (u.usuario && usuarioLogado.usuario && u.usuario === usuarioLogado.usuario) || (u.id && usuarioLogado.id && u.id === usuarioLogado.id));
        if (idx >= 0) {
            usuarios[idx].avatar = dataUrl;
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
        }

        updateHeaderUser();
        notify('Avatar atualizado com sucesso!', 'sucesso');
    };
    reader.readAsDataURL(file);
}

// Atualiza título da página (header) de acordo com seção
function updatePageTitle(section) {
    const titleMap = { home: 'MENU', agenda: 'Agenda', medicos: 'Médicos', financas: 'Financeiro', marcacao: 'Marcação', exames: 'Exames', calendario: 'Calendário' };
    document.getElementById('page-title').textContent = titleMap[section] || '';
}

// Renderiza menu com logo de fundo transparente, carrossel de saúde e informações de atendimento
function renderMenuUI() {
    const container = document.getElementById('menu-slider-container');
    if (!container) return;
    container.style.minHeight = 'auto';
    container.innerHTML = '';
    // Remover imagem de fundo solicitada pelo usuário
    container.style.backgroundImage = 'none';
    container.style.backgroundColor = '#f8f9fa';

    const html = `
        <!-- Hero com sobreposição -->
        <div style="background: linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.6)); min-height: 300px; display: flex; align-items: center; justify-content: center; color: white; text-align: center;">
            <div>
                <h1 style="font-size: 2.5rem; margin: 0; font-weight: bold;">Bem-vindo à Clínica SBM</h1>
                <p style="font-size: 1.1rem; margin: 10px 0 0 0;">Cuidados integrados para sua saúde</p>
            </div>
        </div>

        <!-- Carrossel de Saúde -->
        <div style="padding: 40px 20px; background: #f8f9fa;">
            <h2 style="text-align: center; margin-bottom: 30px; color: var(--text-main);">Conteúdo sobre Saúde e Bem-estar</h2>
            <div class="carousel-wrapper" style="position: relative; max-width: 900px; margin: auto; overflow: hidden; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <div class="carousel-container" style="display: flex; transition: transform 0.5s ease;">
                    <div class="carousel-item" style="min-width: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; color: white; text-align: center;">
                        <i class="fas fa-heart" style="font-size: 3rem; margin-bottom: 15px;"></i>
                        <h3>Saúde do Coração</h3>
                        <p>Mantenha seu coração saudável com exercícios regulares e alimentação equilibrada. Realize check-ups anuais com nossos cardiologistas.</p>
                    </div>
                    <div class="carousel-item" style="min-width: 100%; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px; color: white; text-align: center;">
                        <i class="fas fa-dumbbell" style="font-size: 3rem; margin-bottom: 15px;"></i>
                        <h3>Exercício Físico</h3>
                        <p>Atividade física regular reduz riscos de doenças. Consulte nossos profissionais para um programa personalizado.</p>
                    </div>
                    <div class="carousel-item" style="min-width: 100%; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 40px; color: white; text-align: center;">
                        <i class="fas fa-apple-alt" style="font-size: 3rem; margin-bottom: 15px;"></i>
                        <h3>Nutrição Balanceada</h3>
                        <p>Uma alimentação equilibrada é essencial. Marque uma consulta com nossos nutricionistas para orientação personalizada.</p>
                    </div>
                    <div class="carousel-item" style="min-width: 100%; background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 40px; color: white; text-align: center;">
                        <i class="fas fa-bed" style="font-size: 3rem; margin-bottom: 15px;"></i>
                        <h3>Qualidade do Sono</h3>
                        <p>Dormir bem é fundamental para a saúde. Dicas: mantenha uma rotina, evite telas antes de dormir.</p>
                    </div>
                    <div class="carousel-item" style="min-width: 100%; background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); padding: 40px; color: white; text-align: center;">
                        <i class="fas fa-flask" style="font-size: 3rem; margin-bottom: 15px;"></i>
                        <h3>Exames Preventivos</h3>
                        <p>Realize exames periódicos para diagnóstico precoce. Oferecemos hemograma, colesterol, glicemia e muito mais.</p>
                    </div>
                </div>
                <button class="carousel-btn prev" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); z-index: 10; background: var(--primary); color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem;">❮</button>
                <button class="carousel-btn next" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); z-index: 10; background: var(--primary); color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem;">❯</button>
            </div>
        </div>

        <!-- Locais de Atendimento -->
        <div style="padding: 40px 20px; background: white;">
            <h2 style="text-align: center; margin-bottom: 30px; color: var(--text-main);">Locais de Atendimento</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; max-width: 1000px; margin: 0 auto;">
                <div class="location-card" style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid var(--primary);">
                    <h4 style="color: var(--primary); margin-top: 0;">Unidade Centro</h4>
                    <p><i class="fas fa-map-marker-alt" style="margin-right: 8px;"></i>Rua Principal, 123 - Centro</p>
                    <p><i class="fas fa-phone" style="margin-right: 8px;"></i>(11) 3333-3333</p>
                    <p><i class="fas fa-clock" style="margin-right: 8px;"></i>Seg-Sex: 08h às 19h | Sáb: 08h às 13h</p>
                </div>
                <div class="location-card" style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid var(--success);">
                    <h4 style="color: var(--success); margin-top: 0;">Unidade Zona Sul</h4>
                    <p><i class="fas fa-map-marker-alt" style="margin-right: 8px;"></i>Av. Paulista, 456 - Zona Sul</p>
                    <p><i class="fas fa-phone" style="margin-right: 8px;"></i>(11) 4444-4444</p>
                    <p><i class="fas fa-clock" style="margin-right: 8px;"></i>Seg-Sex: 07h às 20h | Sáb: 08h às 14h</p>
                </div>
                <div class="location-card" style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid var(--info, #9b59b6);">
                    <h4 style="color: var(--info, #9b59b6); margin-top: 0;">Unidade Zona Norte</h4>
                    <p><i class="fas fa-map-marker-alt" style="margin-right: 8px;"></i>Rod. Anhanguera, 789 - Zona Norte</p>
                    <p><i class="fas fa-phone" style="margin-right: 8px;"></i>(11) 5555-5555</p>
                    <p><i class="fas fa-clock" style="margin-right: 8px;"></i>Seg-Sex: 08h às 18h | Dom: 09h às 13h</p>
                </div>
            </div>
        </div>

        <!-- Serviços Oferecidos -->
        <div style="padding: 40px 20px; background: #f8f9fa;">
            <h2 style="text-align: center; margin-bottom: 30px; color: var(--text-main);">Nossos Serviços</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; max-width: 1000px; margin: 0 auto;">
                <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                    <i class="fas fa-stethoscope" style="font-size: 2rem; color: var(--primary); margin-bottom: 10px;"></i>
                    <h4>Consultas Médicas</h4>
                    <p style="color: var(--text-sub); font-size: 0.9rem;">Atendimento com médicos especialistas</p>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                    <i class="fas fa-flask-vial" style="font-size: 2rem; color: var(--success); margin-bottom: 10px;"></i>
                    <h4>Exames Laboratoriais</h4>
                    <p style="color: var(--text-sub); font-size: 0.9rem;">Hemograma, glicemia, colesterol e mais</p>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                    <i class="fas fa-x-ray" style="font-size: 2rem; color: #e74c3c; margin-bottom: 10px;"></i>
                    <h4>Imagem Médica</h4>
                    <p style="color: var(--text-sub); font-size: 0.9rem;">Raio-X, ultrassom e tomografia</p>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                    <i class="fas fa-heartbeat" style="font-size: 2rem; color: #f39c12; margin-bottom: 10px;"></i>
                    <h4>Cardiologia</h4>
                    <p style="color: var(--text-sub); font-size: 0.9rem;">Especialidade em saúde do coração</p>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                    <i class="fas fa-leaf" style="font-size: 2rem; color: #27ae60; margin-bottom: 10px;"></i>
                    <h4>Nutrição</h4>
                    <p style="color: var(--text-sub); font-size: 0.9rem;">Orientação nutricional personalizada</p>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                    <i class="fas fa-dumbbell" style="font-size: 2rem; color: #3498db; margin-bottom: 10px;"></i>
                    <h4>Fisioterapia</h4>
                    <p style="color: var(--text-sub); font-size: 0.9rem;">Reabilitação e prevenção de lesões</p>
                </div>
            </div>
        </div>

        <!-- CTA -->
        <div style="padding: 40px 20px; background: linear-gradient(135deg, var(--primary), var(--success)); color: white; text-align: center;">
            <h2>Agende sua Consulta Agora</h2>
            <p style="font-size: 1.1rem; margin: 15px 0;">Não adie sua saúde. Estamos prontos para cuidar de você!</p>
            <p><i class="fas fa-phone" style="margin-right: 8px;"></i>Ligue: (11) 3333-3333</p>
        </div>
    `;

    container.innerHTML = html;

    // Lógica do carrossel
    const carouselContainer = container.querySelector('.carousel-container');
    let currentSlide = 0;
    const totalSlides = container.querySelectorAll('.carousel-item').length;

    function updateCarousel() {
        carouselContainer.style.transform = `translateX(-${currentSlide * 100}%)`;
    }

    container.querySelector('.carousel-btn.prev').addEventListener('click', () => {
        currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
        updateCarousel();
    });

    container.querySelector('.carousel-btn.next').addEventListener('click', () => {
        currentSlide = (currentSlide + 1) % totalSlides;
        updateCarousel();
    });

    // Auto-play do carrossel
    setInterval(() => {
        currentSlide = (currentSlide + 1) % totalSlides;
        updateCarousel();
    }, 5000);
}
function showSection(section) {
    const display = document.getElementById('main-display');

    // Limpeza de timers/intervalos da seção anterior para evitar memory leaks
    if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
    }

    // Proteção: solicitações só para admin
    if (section === 'solicitacoes' && usuarioLogado.perfil !== 'admin') {
        notify('Acesso negado: área restrita ao administrador', 'erro');
        // Redireciona para a home se o acesso for negado
        section = 'home';
    }

    display.innerHTML = contentData[section];

    updatePageTitle(section);

    document.querySelectorAll('.sidebar ul li').forEach(li => li.classList.remove('active'));
    const menuEl = document.getElementById(`menu-${section}`);
    if (menuEl) menuEl.classList.add('active');

    setTimeout(() => {
        if (section === 'home') {
            renderMenuUI();
        }
        if (section === 'agenda') {
            renderAgendaUI();
        }
        if (section === 'medicos') {
            renderMedicosUI();
        }
        if (section === 'financas') {
            renderFinancasUI();
        }
        if (section === 'marcacao') {
            renderMarcacaoUI();
        }
        if (section === 'exames') {
            renderExamesUI();
        }
        if (section === 'calendario') {
            renderCalendarioUI();
        }
        if (section === 'solicitacoes') {
            renderSolicitacoesUI();
        }
        if (section === 'usuarios') {
            renderUsuariosUI();
        }
    }, 50);
}

// --- DASHBOARD ---
function atualizarDashboardHome() {
    const saldo = totalReceitas - totalDespesas;
    const dashPacientes = document.getElementById('dash-pacientes');
    const dashSaldo = document.getElementById('dash-saldo');
    
    if(dashPacientes) dashPacientes.innerText = agendaSalva.length;
    if(dashSaldo) {
        dashSaldo.innerText = `R$ ${saldo.toFixed(2)}`;
        dashSaldo.style.color = saldo < 0 ? 'var(--danger)' : 'var(--success)';
    }
}

// --- AGENDA ---
function adicionarConsulta() {
    const nome = document.getElementById('paciente').value;
    const data = document.getElementById('data').value;
    const medico = document.getElementById('medico-select').value;

    if(!nome || !data || !medico) {
        notify("Preencha todos os campos!", "erro");
        return;
    }

    const novoAgendamento = { 
        nome, 
        data: data.replace('T', ' '), 
        medico: medico,
        status: 'Pendente' 
    };

    if (editandoIndex !== null) {
        novoAgendamento.status = agendaSalva[editandoIndex].status;
        agendaSalva[editandoIndex] = novoAgendamento;
        editandoIndex = null;
        notify("Cadastro atualizado com sucesso!");
    } else {
        agendaSalva.push(novoAgendamento);
        notify("Paciente agendado com sucesso!");
    }
    
    localStorage.setItem('agendaSalva', JSON.stringify(agendaSalva));
    renderAgendaUI();
}

// Preenche select de médicos baseado na data. Se data vazia, mostra todos.
function preencherMedicosPorData() {
    const sel = document.getElementById('medico-select');
    if(!sel) return;
    const dataVal = document.getElementById('data')?.value;
    let options = [];
    const dayNamesFull = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

    if (!medicos) medicos = [];

    if (!dataVal) {
        options = medicos.map(m => ({ value: m.nome, label: m.nome }));
    } else {
        const dt = new Date(dataVal);
        const weekday = dt.getDay();
        options = medicos.filter(m => m.dias.includes(weekday)).map(m => ({ value: m.nome, label: `${m.nome} — ${dayNamesFull[weekday]}` }));
    }

    // Remonta select
    sel.innerHTML = `<option value="">-- Selecione Médico --</option>` + options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
}

// ==================== NOVOS MENUS PARA USUÁRIOS COMUNS ====================

function renderMarcacaoUI() {
    const container = document.getElementById('marcacao-container');
    if (!container) return;

    const minhasMarcacoes = agendaSalva.filter(ag => ag.usuarioId === usuarioLogado.id);

    container.innerHTML = `
        <!-- BOTÃO DE AGENDAMENTO -->
        <div style="text-align: center; padding: 40px 20px; margin-bottom: 20px;">
            <button id="btn-abrir-modal-marcacao" style="background: var(--primary); color: white; border: none; padding: 16px 48px; font-size: 1.1rem; font-weight: 600; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; transition: all 0.3s;">
                <i class="fas fa-calendar-plus"></i>AGENDAR NOVA CONSULTA
            </button>
        </div>
        
        <!-- SEÇÃO DE HISTÓRICO -->
        <div class="card" style="margin-top: 30px; border-top: 5px solid var(--success);">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                <i class="fas fa-history" style="font-size: 1.8rem; color: var(--success);"></i>
                <h3 style="margin: 0;">Minhas Marcações (${minhasMarcacoes.length})</h3>
            </div>
            ${minhasMarcacoes.length === 0 ? `
                <div style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-inbox" style="font-size: 3rem; color: var(--border); margin-bottom: 12px;"></i>
                    <p style="color: var(--text-sub); font-size: 1rem;">Nenhuma marcação realizada ainda. Agende uma consulta acima!</p>
                </div>
            ` : `
                <div style="display: grid; gap: 12px;">
                    ${minhasMarcacoes.map(m => `
                        <div style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: white; display: grid; grid-template-columns: 150px 1fr 120px 100px; gap: 16px; align-items: center;">
                            <div>
                                <p style="color: var(--text-sub); font-size: 0.85rem; margin: 0 0 4px 0;">Data</p>
                                <p style="font-weight: 600; color: var(--text-main); margin: 0;">${m.data}</p>
                            </div>
                            <div>
                                <p style="color: var(--text-sub); font-size: 0.85rem; margin: 0 0 4px 0;">Médico & Queixa</p>
                                <p style="font-weight: 600; color: var(--text-main); margin: 0;">${m.medico}</p>
                                <p style="color: var(--text-sub); font-size: 0.9rem; margin: 4px 0 0 0;">${m.queixa}</p>
                            </div>
                            <div>
                                <p style="color: var(--text-sub); font-size: 0.85rem; margin: 0 0 4px 0;">Status</p>
                                <span class="badge badge-${m.status === 'Confirmado' ? 'success' : m.status === 'Pendente' ? 'warning' : 'danger'}" style="display: inline-block;">${m.status}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        </div>
    `;

    // Listener do botão para abrir modal
    const btnAbrirModal = document.getElementById('btn-abrir-modal-marcacao');
    if (btnAbrirModal) {
        btnAbrirModal.addEventListener('click', openMarcacaoModal);
    }
}

function preencherMedicosMarcacao() {
    const sel = document.getElementById('marcacao-medico');
    if (!sel) return;
    const dataVal = document.getElementById('marcacao-data').value;
    let options = [];

    if (!medicos) medicos = [];

    if (!dataVal) {
        options = medicos.map(m => ({ value: m.nome, label: m.nome }));
    } else {
        const dt = new Date(dataVal);
        const weekday = dt.getDay();
        options = medicos.filter(m => m.dias.includes(weekday)).map(m => ({ value: m.nome, label: m.nome }));
    }

    sel.innerHTML = `<option value="">-- Selecione Médico --</option>` + options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
}

function preencherMedicosMarcacao() {
    const sel = document.getElementById('marcacao-medico');
    if (!sel) return;
    const dataVal = document.getElementById('marcacao-data').value;
    let options = [];

    if (!medicos) medicos = [];

    if (!dataVal) {
        options = medicos.map(m => ({ value: m.nome, label: m.nome }));
    } else {
        const dt = new Date(dataVal);
        const weekday = dt.getDay();
        options = medicos.filter(m => m.dias.includes(weekday)).map(m => ({ value: m.nome, label: m.nome }));
    }

    sel.innerHTML = `<option value="">-- Selecione Médico --</option>` + options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
}

function renderExamesUI() {
    const container = document.getElementById('exames-container');
    if (!container) return;

    container.innerHTML = `
        <div class="card">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
                <i class="fas fa-flask-vial" style="font-size: 1.8rem; color: var(--primary);"></i>
                <h3 style="margin: 0;">Tabela de Preços - Exames</h3>
            </div>
            <p style="color: var(--text-sub); margin-bottom: 20px;">Solicite exames durante o agendamento de sua consulta na aba <strong>Marcação</strong>.</p>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
                ${examesDisponiveis.map(ex => `
                    <div style="padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: white; transition: all 0.3s; box-shadow: 0 2px 6px rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px;">
                            <i class="fas fa-microscope" style="font-size: 1.4rem; color: var(--primary); margin-top: 2px;"></i>
                            <h4 style="margin: 0; color: var(--text-main);">${ex.nome}</h4>
                        </div>
                        <p style="color: var(--text-sub); font-size: 0.9rem; margin: 10px 0; line-height: 1.5;">${ex.descricao}</p>
                        <div style="padding-top: 12px; border-top: 1px solid var(--border);">
                            <p style="margin: 0; color: var(--text-sub); font-size: 0.85rem;">Valor:</p>
                            <p style="font-size: 1.4rem; font-weight: bold; color: var(--primary); margin: 4px 0 0 0;">R$ ${ex.preco.toFixed(2)}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Modal para agendamento de consulta
function openMarcacaoModal() {
    const examesDisponiveis = [
        { id: 1, nome: 'Hemograma', preco: 45.00, descricao: 'Análise completa do sangue' },
        { id: 2, nome: 'Glicemia', preco: 35.00, descricao: 'Medição de açúcar no sangue' },
        { id: 3, nome: 'Colesterol Total', preco: 55.00, descricao: 'Perfil lipídico completo' },
        { id: 4, nome: 'TSH', preco: 60.00, descricao: 'Teste da tireoide' },
        { id: 5, nome: 'Raio-X Tórax', preco: 120.00, descricao: 'Radiografia de tórax' },
        { id: 6, nome: 'Ultrassom Abdômen', preco: 180.00, descricao: 'Ultrassom abdominal completo' }
    ];

    const modal = document.createElement('div');
    modal.id = 'modal-marcacao';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true" aria-label="Agendar Consulta">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: var(--text-main);">Agendar Nova Consulta</h2>
                <button type="button" id="close-modal-marcacao" style="background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-sub);">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Dados básicos -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                <div>
                    <label for="marcacao-modal-data" style="display: block; font-weight: 600; margin-bottom: 6px; color: var(--text-main);">Data <span style="color: var(--danger);">*</span></label>
                    <input type="date" id="marcacao-modal-data" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                </div>
                <div>
                    <label for="marcacao-modal-medico" style="display: block; font-weight: 600; margin-bottom: 6px; color: var(--text-main);">Médico <span style="color: var(--danger);">*</span></label>
                    <select id="marcacao-modal-medico" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                        <option value="">-- Selecione Médico --</option>
                    </select>
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <label for="marcacao-modal-queixa" style="display: block; font-weight: 600; margin-bottom: 6px; color: var(--text-main);">Queixa Principal <span style="color: var(--danger);">*</span></label>
                <input type="text" id="marcacao-modal-queixa" placeholder="Descreva o motivo da consulta" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
            </div>

            <!-- Exames -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-weight: 600; margin-bottom: 10px; color: var(--text-main);">
                    <i class="fas fa-flask" style="color: var(--primary); margin-right: 6px;"></i>Exames (opcional)
                </label>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; max-height: 200px; overflow-y: auto;">
                    ${examesDisponiveis.map(ex => `
                        <div style="border: 1px solid var(--border); padding: 10px; border-radius: 6px; cursor: pointer;" class="exam-card-modal" data-exam-id="${ex.id}">
                            <input type="checkbox" id="exam-modal-${ex.id}" value="${ex.id}" class="marcacao-exam-modal" data-exam='${JSON.stringify(ex).replace(/'/g, "&quot;")}'>
                            <label for="exam-modal-${ex.id}" style="cursor: pointer; margin-left: 6px; font-size: 0.9rem;">
                                ${ex.nome} - R$ ${ex.preco.toFixed(2)}
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Pagamento -->
            <div style="margin-bottom: 20px;">
                <label for="marcacao-modal-pagamento" style="display: block; font-weight: 600; margin-bottom: 6px; color: var(--text-main);">Forma de Pagamento (se houver exames)</label>
                <select id="marcacao-modal-pagamento" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                    <option value="">-- Selecione --</option>
                    <option value="PIX">PIX</option>
                    <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                    <option value="CARTAO_DEBITO">Cartão de Débito</option>
                    <option value="PLANO_SAUDE">Plano de Saúde</option>
                </select>
            </div>

            <!-- Botões -->
            <div style="display: flex; gap: 12px; justify-content: flex-end;">
                <button type="button" id="btn-cancelar-marcacao" style="padding: 10px 20px; border: 1px solid var(--border); background: white; color: var(--text-main); border-radius: 6px; cursor: pointer; font-weight: 600;">Cancelar</button>
                <button type="button" id="btn-confirmar-marcacao" style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Confirmar Agendamento</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Listeners
    document.getElementById('close-modal-marcacao').addEventListener('click', () => {
        modal.remove();
    });
    document.getElementById('btn-cancelar-marcacao').addEventListener('click', () => {
        modal.remove();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Preencher médicos ao mudar data
    const dataInput = document.getElementById('marcacao-modal-data');
    dataInput.addEventListener('change', () => preencherMedicosMarcacaoModal());

    // Confirmar agendamento
    document.getElementById('btn-confirmar-marcacao').addEventListener('click', () => {
        const data = document.getElementById('marcacao-modal-data').value;
        const medico = document.getElementById('marcacao-modal-medico').value;
        const queixa = document.getElementById('marcacao-modal-queixa').value;
        const pagamento = document.getElementById('marcacao-modal-pagamento').value;

        if (!data || !medico || !queixa) {
            notify('Preencha todos os campos obrigatórios!', 'erro');
            return;
        }

        const examesSelecionados = Array.from(document.querySelectorAll('.marcacao-exam-modal:checked')).map(cb => {
            return JSON.parse(cb.dataset.exam);
        });

        if (examesSelecionados.length > 0 && !pagamento) {
            notify('Selecione uma forma de pagamento para os exames!', 'erro');
            return;
        }

        // Salvar agendamento
        const agenda = JSON.parse(localStorage.getItem('agendaSalva')) || [];
        const novaConsulta = {
            id: Date.now(),
            usuarioId: usuarioLogado.id,
            nome: usuarioLogado.nome || usuarioLogado.usuario,
            data: data,
            hora: '09:00',
            medico: medico,
            queixa: queixa,
            status: 'Pendente',
            tipo: 'Consulta'
        };
        agenda.push(novaConsulta);
        localStorage.setItem('agendaSalva', JSON.stringify(agenda));

        // Salvar exames se houver
        if (examesSelecionados.length > 0) {
            const exames = JSON.parse(localStorage.getItem('examesSolicitados')) || [];
            examesSelecionados.forEach(ex => {
                const pedido = {
                    id: Date.now() + Math.random(),
                    usuarioId: usuarioLogado.id,
                    exameId: ex.id,
                    exameNome: ex.nome,
                    data: data,
                    hora: '09:00',
                    pagamento: pagamento,
                    status: 'Pendente',
                    criadoEm: new Date().toISOString()
                };
                exames.push(pedido);
            });
            localStorage.setItem('examesSolicitados', JSON.stringify(exames));
        }

        notify('Consulta agendada com sucesso!', 'sucesso');
        modal.remove();
        renderMarcacaoUI();
        // Atualizar calendário para mostrar a nova marcação
        try { renderCalendarioUI(); } catch (e) { console.error('Erro ao atualizar calendário:', e); }
        // Atualizar solicitações do admin se estiver visualizando
        try { renderSolicitacoesUI(); } catch (e) { console.error('Erro ao atualizar solicitações:', e); }
    });
}

function preencherMedicosMarcacaoModal() {
    const sel = document.getElementById('marcacao-modal-medico');
    if (!sel) return;
    const dataVal = document.getElementById('marcacao-modal-data').value;
    let options = [];

    if (!medicos) medicos = [];
    const medicosDoDia = medicos.filter(m => {
        const diaSemana = new Date(dataVal).getDay();
        return m.dias && m.dias.includes(diaSemana);
    });

    if (medicosDoDia.length > 0) {
        options = medicosDoDia.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
    } else {
        options = '<option value="">Nenhum médico disponível</option>';
    }

    sel.innerHTML = '<option value="">-- Selecione Médico --</option>' + options;
}

function renderCalendarioUI() {
    const container = document.getElementById('calendario-container');
    if (!container) return;

    const mes = calendarMonth;
    const ano = calendarYear;

    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diasDoMes = ultimoDia.getDate();
    const comecaEm = primeiroDia.getDay();

    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    // Cabeçalho com navegação entre meses
    let html = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div>
                    <button id="cal-prev" class="btn btn-outline" aria-label="Mês anterior">❮</button>
                    <button id="cal-next" class="btn btn-outline" aria-label="Próximo mês">❯</button>
                </div>
                <div style="font-weight:700; font-size:1.05rem;">${nomesMeses[mes]} ${ano}</div>
                <div>
                    <select id="cal-month-select" aria-label="Selecionar mês">
                        ${nomesMeses.map((mName, i) => `<option value="${i}" ${i === mes ? 'selected' : ''}>${mName}</option>`).join('')}
                    </select>
                    <select id="cal-year-select" aria-label="Selecionar ano">
                        ${(() => {
                            // anos entre ano-5 e ano+5 (mais opções)
                            let opts = '';
                            for (let y = ano - 5; y <= ano + 5; y++) {
                                opts += `<option value="${y}" ${y === ano ? 'selected' : ''}>${y}</option>`;
                            }
                            return opts;
                        })()}
                    </select>
                </div>
            </div>

            <table style="width: 100%; text-align: center; border-collapse: collapse; margin: 10px 0;">
                <thead>
                    <tr>
                        ${diasSemana.map(d => `<th style="padding: 10px; background: var(--primary); color: white;">${d}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${(() => {
                        let html = '<tr>';
                        for (let i = 0; i < comecaEm; i++) html += '<td></td>';

                        for (let dia = 1; dia <= diasDoMes; dia++) {
                            const dataObj = new Date(ano, mes, dia);
                            const weekday = dataObj.getDay();

                            // Se for admin: mostra médicos por dia (visão operativa)
                            if (usuarioLogado.perfil === 'admin') {
                                // primeiro, verificar se há agendamentos para este dia
                                const dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                                const appts = (agendaSalva || []).filter(a => String(a.data).startsWith(dateStr));
                                if (appts.length > 0) {
                                    // montar badges com hora – paciente – médico
                                    const badges = appts.slice(0,2).map(a => {
                                        const hora = a.hora || (String(a.data).split(' ')[1]||'');
                                        const nomePac = a.nome || a.usuarioId;
                                        const med = a.medico || '';
                                        return `<span class="cal-badge">${hora} ${nomePac}${med ? ' - ' + med : ''}</span>`;
                                    }).join(' ');
                                    const extra = appts.length > 2 ? `<span class="cal-badge">+${appts.length - 2} mais</span>` : '';
                                    html += `<td data-dia="${dia}" data-medicos="${appts.length} agendamento(s)" style="padding: 12px; border: 1px solid var(--border); background: #f0f8ff; cursor: pointer;">
                                        <div style="font-weight: bold;">${dia}</div>
                                        <div style="margin-top:6px;">${badges} ${extra}</div>
                                    </td>`;
                                } else {
                                    // nenhum agendamento, mostrar disponibilidade de médicos como antes
                                    const medicosDia = medicos.filter(m => m.dias.includes(weekday));
                                    const temMedicos = medicosDia.length > 0;
                                    const countLabel = `${medicosDia.length} médico(s) disponível(is)`;
                                    html += `<td data-dia="${dia}" data-medicos='${countLabel.replace(/'/g, "&#39;")}' style="padding: 12px; border: 1px solid var(--border); ${temMedicos ? 'background: #f0f8ff; cursor: pointer;' : ''}">
                                        <div style="font-weight: bold;">${dia}</div>
                                        ${temMedicos ? `<div style="margin-top:6px;"><span class="cal-count-badge">${medicosDia.length} disponível(is)</span></div>` : ''}
                                    </td>`;
                                }
                            } else {
                                // Usuário comum: mostrar apenas os agendamentos/exames do próprio usuário
                                const compareDateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                                const meus = (agendaSalva || []).filter(a => {
                                    const uid = String(a.usuarioId || a.usuarioId === 0 ? a.usuarioId : '') ;
                                    const meId = String(usuarioLogado.id || usuarioLogado.usuario || '');
                                    // verifica vínculo de usuário
                                    if (!meId) return false;
                                    if (String(a.usuarioId) !== meId) return false;
                                    // normaliza datas que podem vir como 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM' ou com T
                                    if (!a.data) return false;
                                    return String(a.data).startsWith(compareDateStr);
                                });

                                if (meus.length > 0) {
                                    // construir badges com horário — mostra até 2 e um +N se houver mais
                                    const preview = meus.slice(0,2);
                                    const badgesHtml = preview.map(m => {
                                        const hora = m.hora || (String(m.data).split(' ')[1] || '').replace('T',' ');
                                        const medicoLabel = m.medico || m.tipo || '';
                                        return `<span class="cal-badge">${hora} — ${medicoLabel}</span>`;
                                    }).join(' ');
                                    const more = meus.length > 2 ? `<span class="cal-badge">+${meus.length - 2} mais</span>` : '';
                                    const detalhe = meus.map(m => `${m.hora || (String(m.data).split(' ')[1]||'')} — ${m.medico || m.tipo || ''}`).join('\n');
                                    const safe = detalhe.replace(/'/g, "&#39;").replace(/\n/g, ' / ');
                                    html += `<td data-dia="${dia}" data-medicos='${safe}' style="padding: 12px; border: 1px solid var(--border); background: #e8f7ef; cursor: pointer;">
                                        <div style="font-weight: bold;">${dia}</div>
                                        <div style="margin-top:6px;">${badgesHtml} ${more}</div>
                                    </td>`;
                                } else {
                                    // dia vazio para paciente — mostra o número do dia, sem destaque
                                    html += `<td data-dia="${dia}" style="padding: 12px; border: 1px solid var(--border);"><div style="font-weight: bold;">${dia}</div></td>`;
                                }
                            }

                            if ((comecaEm + dia) % 7 === 0 && dia < diasDoMes) html += '</tr><tr>';
                        }

                        const cellsUsed = comecaEm + diasDoMes;
                        const faltam = (Math.ceil(cellsUsed / 7) * 7) - cellsUsed;
                        for (let i = 0; i < faltam; i++) html += '<td></td>';
                        html += '</tr>';
                        return html;
                    })()}
                </tbody>
            </table>
            ${usuarioLogado.perfil === 'admin' ? `
            <p style="color: var(--text-sub); font-size: 0.9rem; margin-top: 8px;">
                <i class="fas fa-info-circle"></i> Passe o mouse sobre um dia para ver os médicos disponíveis.
            </p>
            ` : `
            <p style="color: var(--text-sub); font-size: 0.9rem; margin-top: 8px;">
                <i class="fas fa-info-circle"></i> Seu calendário estará vazio até você agendar exames ou consultas; passe o mouse sobre dias com agendamentos para ver detalhes.
            </p>
            `}
        </div>
    `;

    container.innerHTML = html;

    // Tooltip element (criado uma vez por render)
    let tooltip = container.querySelector('#calendar-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'calendar-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.padding = '8px 10px';
        tooltip.style.background = 'rgba(0,0,0,0.85)';
        tooltip.style.color = 'white';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '0.85rem';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.zIndex = '9999';
        tooltip.style.display = 'none';
        container.style.position = 'relative';
        container.appendChild(tooltip);
    }

    // Event listeners para navegação
    const prevBtn = container.querySelector('#cal-prev');
    const nextBtn = container.querySelector('#cal-next');
    const monthSelect = container.querySelector('#cal-month-select');
    const yearSelect = container.querySelector('#cal-year-select');

    if (prevBtn) prevBtn.addEventListener('click', () => {
        calendarMonth -= 1;
        if (calendarMonth < 0) { calendarMonth = 11; calendarYear -= 1; }
        sessionStorage.setItem('calendarMonth', calendarMonth);
        sessionStorage.setItem('calendarYear', calendarYear);
        renderCalendarioUI();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        calendarMonth += 1;
        if (calendarMonth > 11) { calendarMonth = 0; calendarYear += 1; }
        sessionStorage.setItem('calendarMonth', calendarMonth);
        sessionStorage.setItem('calendarYear', calendarYear);
        renderCalendarioUI();
    });
    if (monthSelect) monthSelect.addEventListener('change', (e) => {
        calendarMonth = parseInt(e.target.value, 10);
        sessionStorage.setItem('calendarMonth', calendarMonth);
        renderCalendarioUI();
    });
    if (yearSelect) yearSelect.addEventListener('change', (e) => {
        calendarYear = parseInt(e.target.value, 10);
        sessionStorage.setItem('calendarYear', calendarYear);
        renderCalendarioUI();
    });

    // Tooltip handlers: delegação em células que tenham data-medicos
    container.querySelectorAll('td[data-medicos]').forEach(td => {
        td.addEventListener('mouseenter', (ev) => {
            const medStr = td.getAttribute('data-medicos') || '';
            tooltip.innerHTML = medStr ? `<strong>Médicos:</strong> ${medStr}` : 'Sem médicos disponíveis';
            tooltip.style.display = 'block';
            // posiciona próximo ao mouse
            const rect = container.getBoundingClientRect();
            const offsetX = ev.clientX - rect.left + 12;
            const offsetY = ev.clientY - rect.top + 12;
            tooltip.style.left = offsetX + 'px';
            tooltip.style.top = offsetY + 'px';
        });
        td.addEventListener('mousemove', (ev) => {
            const rect = container.getBoundingClientRect();
            const offsetX = ev.clientX - rect.left + 12;
            const offsetY = ev.clientY - rect.top + 12;
            tooltip.style.left = offsetX + 'px';
            tooltip.style.top = offsetY + 'px';
        });
        td.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });

    // Clique em célula abre modal com detalhes (agenda)
    container.querySelectorAll('td[data-dia]').forEach(td => {
        td.addEventListener('click', () => {
            const dia = td.getAttribute('data-dia');
            const dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
            openCalendarDayModal(dateStr);
        });
    });
}

// Modal para visualizar/edit arranjos de um dia específico
function openCalendarDayModal(dateStr) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const entriesAll = (agendaSalva || []).map((e,i) => ({item:e,index:i}));
    let entries = entriesAll.filter(obj => String(obj.item.data).startsWith(dateStr));
    if (usuarioLogado.perfil !== 'admin') {
        entries = entries.filter(obj => String(obj.item.usuarioId) === String(usuarioLogado.id || usuarioLogado.usuario));
    }
    let rows = '';
    if (entries.length === 0) {
        rows = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#888;">Nenhum agendamento neste dia.</td></tr>`;
    } else {
        rows = entries.map(o => {
            const a = o.item;
            return `<tr>
                        <td>${a.hora || ''}</td>
                        <td>${usuarioLogado.perfil === 'admin' ? (a.nome || a.usuarioId) : ''}</td>
                        <td>${a.medico || ''}</td>
                        <td>${a.status || ''}</td>
                        <td style="text-align:center;">
                            <button class="btn-edit-day" data-index="${o.index}">Editar</button>
                            <button class="btn-delete-day" data-index="${o.index}">Excluir</button>
                        </td>
                    </tr>`;
        }).join('');
    }

    overlay.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true" style="max-width:600px;">
            <h4>Agendamentos em ${dateStr}</h4>
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead><tr><th>Hora</th>${usuarioLogado.perfil==='admin'?'<th>Paciente</th>':''}<th>Médico</th><th>Status</th><th>Ações</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="modal-actions">
                <button id="close-day-modal" class="btn btn-outline">Fechar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#close-day-modal')?.addEventListener('click', close);

    // eventos internas
    overlay.querySelectorAll('.btn-delete-day').forEach(btn => btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        if (confirm('Excluir agendamento?')) {
            apagarAgendamento(idx);
            // fecha e reabre para atualizar
            close();
            openCalendarDayModal(dateStr);
        }
    }));

    overlay.querySelectorAll('.btn-edit-day').forEach(btn => btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        close();
        prepararEdicao(idx);
    }));
}

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', () => {
    buildDynamicMenu();
    updateHeaderUser();
    initAvatarUpload();
    
    document.getElementById('btn-logout').addEventListener('click', logout);
    
    showSection('home');
});


function prepararEdicao(index) {
    editandoIndex = index;
    const item = agendaSalva[index];

    const inputNome = document.getElementById('paciente');
    const inputData = document.getElementById('data');
    const selectMedico = document.getElementById('medico-select');
    const titulo = document.getElementById('agenda-titulo');
    const btnSalvar = document.getElementById('btn-salvar-agenda');
    const btnCancelar = document.getElementById('btn-cancelar-agenda');

    if (inputNome) inputNome.value = item.nome;
    if (inputData) inputData.value = item.data.replace(' ', 'T');
    if (selectMedico) selectMedico.value = item.medico;
    if (titulo) titulo.innerHTML = `<i class="fas fa-edit" style="color:#f39c12"></i> Editando Agendamento`;
    if (btnSalvar) {
        btnSalvar.innerText = "Atualizar Cadastro";
        btnSalvar.style.background = "#f39c12";
    }
    if (btnCancelar) btnCancelar.style.display = "block";
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function apagarAgendamento(index) {
    if (confirm(`Excluir o agendamento de ${agendaSalva[index].nome}?`)) {
        agendaSalva.splice(index, 1);
        localStorage.setItem('agendaSalva', JSON.stringify(agendaSalva));
        notify("Agendamento excluído", "erro");
        carregarTabela();
        atualizarDashboardHome();
    }
}
function carregarTabela() {
    const corpo = document.getElementById('tabela-agenda-corpo');
    if(!corpo) return;

    if (agendaSalva.length === 0) {
        corpo.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#888;">Nenhum agendamento cadastrado.</td></tr>`;
        return;
    }

    let html = '';
    // Itera do mais recente para o mais antigo, simplificando a lógica de índice
    for (let index = agendaSalva.length - 1; index >= 0; index--) {
        const i = agendaSalva[index];
        let statusColor = "#f39c12"; // Pendente
        if(i.status === 'Concluído') statusColor = "#27ae60"; 
        if(i.status === 'Cancelado') statusColor = "#e74c3c"; 

        html += `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding:12px; font-size: 0.85rem;">${i.data}</td>
            <td style="padding:12px;"><strong>${i.nome}</strong></td>
            <td style="padding:12px; font-size: 0.85rem; color:#666;">${i.medico}</td>
            <td style="padding:12px;">
                <select class="status-select" data-index="${index}" style="
                    padding: 4px 8px; border-radius: 4px; border: 1px solid ${statusColor};
                    color: ${statusColor}; font-weight: bold; background: white; cursor: pointer;
                ">
                    <option value="Pendente" ${i.status === 'Pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="Concluído" ${i.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
                    <option value="Cancelado" ${i.status === 'Cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
            </td>
            <td style="padding:12px; text-align:center;">
                <button class="btn-edit-agenda" data-index="${index}" style="padding:5px 10px; background:#f39c12; border:none; color:white; border-radius:4px; cursor:pointer;"><i class="fas fa-edit"></i></button>
                <button class="btn-delete-agenda" data-index="${index}" style="padding:5px 10px; background:#e74c3c; border:none; color:white; border-radius:4px; cursor:pointer;"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
        `;
    }
    corpo.innerHTML = html;
}

// Filtra a tabela de agenda baseado na pesquisa
function filtrarAgenda() {
    const inputPesquisa = document.querySelector('#agenda-pesquisa');
    if (!inputPesquisa) return;

    const termoBusca = inputPesquisa.value.toLowerCase().trim();
    const corpo = document.getElementById('tabela-agenda-corpo');
    if (!corpo) return;

    // Se o campo estiver vazio, mostra todas as linhas
    if (termoBusca === '') {
        carregarTabela();
        return;
    }

    // Filtra os agendamentos
    const filtrados = agendaSalva.filter(item => {
        const nome = (item.nome || '').toLowerCase();
        const medico = (item.medico || '').toLowerCase();
        const data = (item.data || '').toLowerCase();
        
        return nome.includes(termoBusca) || medico.includes(termoBusca) || data.includes(termoBusca);
    });

    // Renderiza apenas os filtrados
    if (filtrados.length === 0) {
        corpo.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#888;">Nenhum resultado encontrado.</td></tr>`;
        return;
    }

    let html = '';
    for (let i = 0; i < filtrados.length; i++) {
        const item = filtrados[i];
        const index = agendaSalva.indexOf(item);
        let statusColor = "#f39c12"; // Pendente
        if(item.status === 'Concluído') statusColor = "#27ae60"; 
        if(item.status === 'Cancelado') statusColor = "#e74c3c"; 

        html += `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding:12px; font-size: 0.85rem;">${item.data}</td>
            <td style="padding:12px;"><strong>${item.nome}</strong></td>
            <td style="padding:12px; font-size: 0.85rem; color:#666;">${item.medico}</td>
            <td style="padding:12px;">
                <select class="status-select" data-index="${index}" style="
                    padding: 4px 8px; border-radius: 4px; border: 1px solid ${statusColor};
                    color: ${statusColor}; font-weight: bold; background: white; cursor: pointer;
                ">
                    <option value="Pendente" ${item.status === 'Pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="Concluído" ${item.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
                    <option value="Cancelado" ${item.status === 'Cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
            </td>
            <td style="padding:12px; text-align:center;">
                <button class="btn-edit-agenda" data-index="${index}" style="padding:5px 10px; background:#f39c12; border:none; color:white; border-radius:4px; cursor:pointer;"><i class="fas fa-edit"></i></button>
                <button class="btn-delete-agenda" data-index="${index}" style="padding:5px 10px; background:#e74c3c; border:none; color:white; border-radius:4px; cursor:pointer;"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
        `;
    }
    corpo.innerHTML = html;
}

// --- FINANCEIRO ---
function atualizarFinancas() {
    const v = parseFloat(document.getElementById('fin-valor').value);
    const d = document.getElementById('fin-desc').value;
    const t = document.getElementById('fin-tipo').value;
    
    if(!d || isNaN(v)) {
        notify("Preencha os dados financeiros!", "erro");
        return;
    }

    if(t === 'receita') totalReceitas += v;
    else totalDespesas += v;

    historicoFinancas.unshift({ desc: d, valor: v, tipo: t, data: new Date().toLocaleDateString() });
    localStorage.setItem('totalReceitas', totalReceitas);
    localStorage.setItem('totalDespesas', totalDespesas);
    localStorage.setItem('historicoFinancas', JSON.stringify(historicoFinancas));

    notify("Movimentação registrada!");
    renderFinancasUI();
}

function renderHistoricoTabela() {
    const lista = document.getElementById('lista-financas');
    if(!lista) return;
    lista.innerHTML = historicoFinancas.map(i => `
        <tr>
            <td>${i.data}</td><td>${i.desc}</td>
            <td><span class="badge-${i.tipo}">${i.tipo.toUpperCase()}</span></td>
            <td style="color: ${i.tipo === 'receita' ? '#27ae60' : '#e74c3c'}; font-weight: bold;">R$ ${i.valor.toFixed(2)}</td>
        </tr>
    `).join('');
}

function limparHistorico() {
    if(confirm("Zerar histórico?")) {
        totalReceitas = 0; totalDespesas = 0; historicoFinancas = [];
        // Remover apenas as chaves que este app usa (evita apagar dados de outros scripts no mesmo domínio)
        localStorage.removeItem('totalReceitas');
        localStorage.removeItem('totalDespesas');
        localStorage.removeItem('agendaSalva');
        localStorage.removeItem('historicoFinancas');
        sessionStorage.removeItem('isAdmin');
        notify("Sistema resetado!");
        renderFinancasUI();
    }
}

// --- GRÁFICOS ---
function renderChart() {
    const ctx = document.getElementById('homeChart')?.getContext('2d');
    if(!ctx) return;
    if(activeChart) activeChart.destroy();
    activeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
            datasets: [{ label: 'Atendimentos', data: [5, 12, 8, 15, 10], backgroundColor: '#3498db' }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderFinanceChart() {
    const ctx = document.getElementById('financePieChart')?.getContext('2d');
    if (!ctx) return;
    if (activeChart) activeChart.destroy();
    activeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Receitas', 'Despesas'],
            datasets: [{ data: [totalReceitas, totalDespesas], backgroundColor: ['#27ae60', '#e74c3c'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
    });
}

// ========== RENDERIZAÇÃO DE AGENDA ==========
function renderAgendaUI() {
    const container = document.getElementById('agenda-container');
    if (!container) return;
    
    const html = `
        <div class="card agenda-card">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                <i class="fas fa-search" style="font-size: 1.2rem; color: var(--primary);"></i>
                <input type="text" id="agenda-pesquisa" placeholder="Pesquisar por paciente, médico ou data..." style="flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.95rem;">
            </div>
        </div>
        <div class="card" style="margin-top:20px;">
            <h3><i class="fas fa-list"></i> Lista de Atendimentos</h3>
            <div style="overflow-x: auto; margin-top:15px;">
                <table style="width:100%; border-collapse: collapse; min-width: 600px;">
                    <thead>
                        <tr style="text-align:left; background: #f8f9fa;">
                            <th style="padding:12px; border-bottom: 2px solid var(--border);">Data/Hora</th>
                            <th style="padding:12px; border-bottom: 2px solid var(--border);">Paciente</th>
                            <th style="padding:12px; border-bottom: 2px solid var(--border);">Médico</th>
                            <th style="padding:12px; border-bottom: 2px solid var(--border);">Status</th>
                            <th style="padding:12px; border-bottom: 2px solid var(--border); text-align:center;">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tabela-agenda-corpo"></tbody>
                </table>
            </div>
        </div>
    `;
    container.innerHTML = html;
    
    // Listeners para a tabela (delegação)
    container.addEventListener('click', (e) => {
        // Botões da tabela (delegação)
        const button = e.target.closest('button.btn-edit-agenda, button.btn-delete-agenda');
        if (button && button.dataset.index) {
            const index = parseInt(button.dataset.index, 10);
            if (button.classList.contains('btn-edit-agenda')) {
                prepararEdicao(index);
            } else if (button.classList.contains('btn-delete-agenda')) {
                apagarAgendamento(index);
            }
        }
    });

    container.addEventListener('change', (e) => {
        // Select de status da tabela (delegação)
        if (e.target.classList.contains('status-select') && e.target.dataset.index) {
            const idx = parseInt(e.target.dataset.index, 10);
            agendaSalva[idx].status = e.target.value;
            localStorage.setItem('agendaSalva', JSON.stringify(agendaSalva));
            notify(`Status alterado para ${e.target.value}`);
            carregarTabela(); // Re-renderiza para atualizar a cor
        }
    });

    // Listener para pesquisa
    const inputPesquisa = container.querySelector('#agenda-pesquisa');
    if (inputPesquisa) {
        inputPesquisa.addEventListener('input', () => filtrarAgenda());
    }

    carregarTabela();
}

// ========== RENDERIZAÇÃO DE FINANÇAS ==========
function renderFinancasUI() {
    const container = document.getElementById('financas-container');
    if (!container) return;
    
    const html = `
        <div class="finance-header-grid">
            <div class="card">
                <h3><i class="fas fa-plus-circle"></i> Novo Lançamento</h3>
                <div class="finance-form">
                    <input type="text" id="fin-desc" placeholder="Descrição (ex: Consulta João)">
                    <input type="number" id="fin-valor" placeholder="Valor R$">
                    <select id="fin-tipo">
                        <option value="receita">Receita (+)</option>
                        <option value="despesa">Despesa (-)</option>
                    </select>
                    <button id="btn-registrar-fin" style="width:100%;">Registrar Movimentação</button>
                    <button id="btn-zerar-fin" class="btn-outline" style="width:100%;">Zerar Histórico</button>
                </div>
            </div>
            <div class="card">
                <h3><i class="fas fa-chart-pie"></i> Balanço Visual</h3>
                <div class="chart-container-small">
                    <canvas id="financePieChart"></canvas>
                </div>
            </div>
        </div>
        <div class="card finance-history-card" style="margin-top: 20px;">
            <h3><i class="fas fa-history"></i> Histórico de Transações</h3>
            <div class="finance-table-wrapper">
                <table class="finance-table">
                    <thead>
                        <tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr>
                    </thead>
                    <tbody id="lista-financas"></tbody>
                </table>
            </div>
        </div>
    `;
    container.innerHTML = html;
    
    // Event listeners
    document.getElementById('btn-registrar-fin')?.addEventListener('click', atualizarFinancas);
    document.getElementById('btn-zerar-fin')?.addEventListener('click', limparHistorico);
    
    renderFinanceChart();
    renderHistoricoTabela();
}

// ========== RENDERIZAÇÃO DE MÉDICOS ==========
function renderMedicosUI() {
    const container = document.getElementById('medicos-container');
    if (!container) return;
    
    const isEditing = editandoMedicoIndex !== null;
    const medico = isEditing ? medicos[editandoMedicoIndex] : null;
    
    const html = `
        <div class="med-grid">
            <div class="card med-card">
                <h3><i class="fas fa-user-md"></i> ${isEditing ? 'Editar Médico' : 'Cadastrar Médico'}</h3>
                <div class="med-form">
                    <label for="med-nome">Nome do Médico</label>
                    <input type="text" id="med-nome" placeholder="Ex: Dr. João Silva" value="${medico ? medico.nome : ''}">

                    <div class="med-days">
                        <div class="days-label">Disponibilidade</div>
                        <div class="days-list">
                            ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((dia, idx) => {
                                const checked = medico && medico.dias.includes(idx) ? 'checked' : '';
                                return `<label class="day-item"><input type="checkbox" value="${idx}" class="med-dia" ${checked}> ${dia}</label>`;
                            }).join('')}
                        </div>
                    </div>

                    <div class="med-actions">
                        <button id="btn-salvar-med" class="btn-primary">${isEditing ? 'Atualizar Médico' : 'Salvar Médico'}</button>
                        ${isEditing ? '<button id="btn-cancelar-med" class="btn-outline">Cancelar Edição</button>' : ''}
                    </div>
                </div>
            </div>

            <div class="card med-list-card">
                <h3><i class="fas fa-list"></i> Médicos Cadastrados</h3>
                <div class="med-table-container">
                    <table class="med-table">
                        <thead>
                            <tr><th>Nome</th><th>Dias</th><th style="text-align:center;">Ações</th></tr>
                        </thead>
                        <tbody id="tabela-medicos-corpo"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;
    
    // Event listeners
    document.getElementById('btn-salvar-med')?.addEventListener('click', salvarMedico);
    document.getElementById('btn-cancelar-med')?.addEventListener('click', cancelarEdicaoMedico);
    
    renderMedicosTabela();
}

// ========== RENDERIZAÇÃO DE USUÁRIOS (ADMIN) ==========
function renderUsuariosUI() {
    const container = document.getElementById('usuarios-container');
    if (!container) return;

    const allUsers = JSON.parse(localStorage.getItem('usuarios')) || [];

    const html = `
        <div class="card">
            <h3><i class="fas fa-users-cog"></i> Gerenciamento de Usuários</h3>
            <p style="color: var(--text-sub); margin-bottom: 15px;">Altere o avatar ou redefina a senha de qualquer usuário do sistema.</p>
            <div style="margin-bottom: 20px;">
                <input type="search" id="user-search-input" placeholder="🔎 Buscar por nome ou usuário..." style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.95rem;">
            </div>
            <div style="overflow-x: auto;">
                <table style="width:100%; border-collapse: collapse; min-width: 600px;">
                    <thead>
                        <tr style="text-align:left; background: #f8f9fa;">
                            <th style="padding:12px;">Avatar</th>
                            <th style="padding:12px;">Nome</th>
                            <th style="padding:12px;">Usuário</th>
                            <th style="padding:12px;">Perfil</th>
                            <th style="padding:12px; text-align:center;">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tabela-usuarios-corpo"></tbody>
                </table>
            </div>
            <!-- Input de arquivo oculto para ser acionado pelos botões -->
            <input type="file" id="admin-avatar-input" accept="image/*" style="display:none;" />
        </div>
    `;

    container.innerHTML = html;

    // Adicionar event listeners
    const fileInput = container.querySelector('#admin-avatar-input');
    let targetUserId = null;

    container.querySelectorAll('.btn-edit-avatar').forEach(btn => {
        btn.addEventListener('click', () => {
            targetUserId = btn.dataset.userid;
            fileInput.click(); // Aciona o input de arquivo
        });
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (file && targetUserId) {
            handleAdminAvatarChange(file, targetUserId);
        }
    });

    // Event listener para redefinir senha
    container.querySelectorAll('.btn-reset-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const userId = btn.dataset.userid;
            const user = allUsers.find(u => String(u.id) === String(userId) || u.usuario === userId);
            if (!user) return;

            const newPassword = prompt(`Digite a NOVA senha para o usuário '${user.nome}'.`);
            if (!newPassword || newPassword.trim() === '') {
                notify('Operação cancelada ou senha vazia.', 'info');
                return;
            }

            const confirmPassword = prompt('Confirme a nova senha.');
            if (newPassword !== confirmPassword) {
                notify('As senhas não coincidem!', 'erro');
                return;
            }

            resetUserPassword(userId, newPassword)
                .then(() => {
                    notify(`Senha do usuário '${user.nome}' foi redefinida com sucesso!`, 'sucesso');
                })
                .catch(err => { notify(`Erro ao redefinir senha: ${err.message}`, 'erro'); });
        });
    });
}

function handleAdminAvatarChange(file, userId) {
    if (file.size > 2 * 1024 * 1024) { notify('Arquivo muito grande (máx 2MB)', 'erro'); return; }

    const reader = new FileReader();
    reader.onload = () => {
        const dataUrl = reader.result;
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const userIndex = usuarios.findIndex(u => String(u.id) === String(userId) || u.usuario === userId);

        if (userIndex !== -1) {
            usuarios[userIndex].avatar = dataUrl;
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            if (String(usuarios[userIndex].id) === String(usuarioLogado.id)) { usuarioLogado.avatar = dataUrl; sessionStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado)); updateHeaderUser(); }
            notify(`Avatar do usuário '${usuarios[userIndex].nome}' atualizado!`, 'sucesso');
            renderUsuariosUI();
        } else { notify('Usuário não encontrado para atualizar o avatar.', 'erro'); }
    };
    reader.readAsDataURL(file);
}

// ========== FUNÇÕES DE SUPORTE (AGENDA) ==========
function cancelarEdicao() {
    editandoIndex = null;
    renderAgendaUI();
    carregarTabela();
}

// ========== FUNÇÕES DE SUPORTE (MÉDICOS) ==========
function salvarMedico() {
    const nome = document.getElementById('med-nome').value.trim();
    const checkboxes = Array.from(document.querySelectorAll('.med-dia'));
    const dias = checkboxes.filter(c => c.checked).map(c => parseInt(c.value, 10));

    if (!nome) { notify('Informe o nome do médico', 'erro'); return; }
    if (dias.length === 0) { notify('Selecione pelo menos um dia', 'erro'); return; }

    if (editandoMedicoIndex !== null) {
        medicos[editandoMedicoIndex] = { nome, dias };
        notify('Médico atualizado com sucesso!');
        editandoMedicoIndex = null;
    } else {
        medicos.push({ nome, dias });
        notify('Médico salvo com sucesso!');
    }
    
    localStorage.setItem('medicos', JSON.stringify(medicos));
    renderMedicosUI();
}

function renderMedicosTabela() {
    const corpo = document.getElementById('tabela-medicos-corpo');
    if (!corpo) return;
    if (!medicos || medicos.length === 0) {
        corpo.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#888;">Nenhum médico cadastrado.</td></tr>`;
        return;
    }

    const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    corpo.innerHTML = medicos.map((m, idx) => {
        const diasHtml = m.dias.map(d => `<span class="day-item">${dayNames[d]}</span>`).join(' ');
        return `
        <tr>
            <td><strong>${m.nome}</strong></td>
            <td>${diasHtml}</td>
            <td style="text-align:center;">
                <button class="btn-edit" data-index="${idx}"><i class="fas fa-edit"></i></button>
                <button class="btn-delete" data-index="${idx}"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `
    }).join('');
    
    // Event listeners para editar e deletar
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            editandoMedicoIndex = parseInt(btn.dataset.index);
            renderMedicosUI();
        });
    });
    
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            if (confirm(`Excluir o médico ${medicos[idx].nome}?`)) {
                medicos.splice(idx, 1);
                localStorage.setItem('medicos', JSON.stringify(medicos));
                notify('Médico removido', 'erro');
                renderMedicosTabela();
            }
        });
    });
}

function cancelarEdicaoMedico() {
    editandoMedicoIndex = null;
    renderMedicosUI();
}