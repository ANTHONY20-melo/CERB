// PROTEÇÃO: Se não estiver logado, volta para o login
let usuarioLogado = JSON.parse(sessionStorage.getItem('usuarioLogado'));
if (!usuarioLogado) {
    window.location.href = "login.html";
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

let activeChart = null;
let editandoIndex = null;
let editandoMedicoIndex = null;

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
    home: `
        <div class="stats-grid">
            <div class="stat-card">
                <i class="fas fa-user-injured"></i>
                <div><h3 id="dash-pacientes">0</h3><p>Pacientes</p></div>
            </div>
            <div class="stat-card" id="card-saldo" style="border-left-color: var(--success)">
                <i class="fas fa-coins"></i>
                <div><h3 id="dash-saldo">R$ 0,00</h3><p>Saldo em Caixa</p></div>
            </div>
        </div>
        <div class="card">
            <h3>Fluxo de Atendimento Semanal</h3>
            <div class="chart-container"><canvas id="homeChart"></canvas></div>
        </div>`,
    
    agenda: `<div id="agenda-container"></div>`,
    financas: `<div id="financas-container"></div>`
,
    medicos: `<div id="medicos-container"></div>`,
    marcacao: `<div id="marcacao-container"></div>`,
    exames: `<div id="exames-container"></div>`,
    calendario: `<div id="calendario-container"></div>`
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
        { id: 'menu-home', label: 'Dashboard', icon: 'fa-chart-line', section: 'home' }
    ];

    if (usuarioLogado.perfil === 'admin') {
        menuItems.push(
            { id: 'menu-agenda', label: 'Agenda', icon: 'fa-calendar-alt', section: 'agenda' },
            { id: 'menu-medicos', label: 'Médicos', icon: 'fa-user-md', section: 'medicos' },
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

function updateHeaderUser() {
    document.getElementById('user-name').textContent = usuarioLogado.nome;
    document.getElementById('user-avatar').src = `https://i.pravatar.cc/150?u=${usuarioLogado.usuario}`;
}

function showSection(section) {
    const display = document.getElementById('main-display');
    display.innerHTML = contentData[section];

    document.querySelectorAll('.sidebar ul li').forEach(li => li.classList.remove('active'));
    document.getElementById(`menu-${section}`).classList.add('active');

    setTimeout(() => {
        if (section === 'home') {
            atualizarDashboardHome();
            renderChart();
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

// ---------- FUNÇÕES DE MÉDICOS ----------
function salvarMedico() {
    const nome = document.getElementById('med-nome').value.trim();
    const checkboxes = Array.from(document.querySelectorAll('.med-dia'));
    const dias = checkboxes.filter(c => c.checked).map(c => parseInt(c.value, 10));

    if (!nome) { notify('Informe o nome do médico', 'erro'); return; }
    if (dias.length === 0) { notify('Selecione pelo menos um dia', 'erro'); return; }

    medicos.push({ nome, dias });
    localStorage.setItem('medicos', JSON.stringify(medicos));
    notify('Médico salvo com sucesso!');
    renderMedicosTabela();
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
            <td style="text-align:center;"><button class="btn-delete" onclick="apagarMedico(${idx})"><i class="fas fa-trash"></i></button></td>
        </tr>
    `
    }).join('');
}

function apagarMedico(index) {
    if (!confirm(`Excluir o médico ${medicos[index].nome}?`)) return;
    medicos.splice(index, 1);
    localStorage.setItem('medicos', JSON.stringify(medicos));
    notify('Médico removido', 'erro');
    renderMedicosTabela();
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
        <div class="card">
            <h3>Agendar Consulta</h3>
            <div class="agenda-form">
                <div class="form-group">
                    <label for="marcacao-data">Data da Consulta:</label>
                    <input type="date" id="marcacao-data">
                </div>
                <div class="form-group">
                    <label for="marcacao-medico">Médico:</label>
                    <select id="marcacao-medico">
                        <option value="">-- Selecione Médico --</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="marcacao-queixa">Queixa Principal:</label>
                    <input type="text" id="marcacao-queixa" placeholder="Descreva o motivo da consulta">
                </div>
                <div class="form-actions">
                    <button class="btn btn-primary" id="btn-marcar">Agendar</button>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h3>Minhas Marcações (${minhasMarcacoes.length})</h3>
            ${minhasMarcacoes.length === 0 ? '<p style="color: var(--text-sub);">Nenhuma marcação ainda</p>' : `
                <table class="med-table">
                    <thead>
                        <tr><th>Data</th><th>Médico</th><th>Queixa</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        ${minhasMarcacoes.map(m => `
                            <tr>
                                <td>${m.data}</td>
                                <td>${m.medico}</td>
                                <td>${m.queixa}</td>
                                <td><span class="badge badge-${m.status === 'Confirmado' ? 'success' : m.status === 'Pendente' ? 'warning' : 'danger'}">${m.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>
    `;

    const dataInput = document.getElementById('marcacao-data');
    dataInput?.addEventListener('change', () => preencherMedicosMarcacao());

    document.getElementById('btn-marcar')?.addEventListener('click', () => {
        const data = document.getElementById('marcacao-data').value;
        const medico = document.getElementById('marcacao-medico').value;
        const queixa = document.getElementById('marcacao-queixa').value;

        if (!data || !medico || !queixa) {
            alert('Preencha todos os campos!');
            return;
        }

        const novaAgenda = {
            id: Date.now(),
            usuarioId: usuarioLogado.id,
            data, medico, queixa,
            status: 'Pendente',
            dataAgendamento: new Date().toLocaleDateString()
        };

        agendaSalva.push(novaAgenda);
        localStorage.setItem('agendaSalva', JSON.stringify(agendaSalva));
        notify('Consulta agendada com sucesso!', 'sucesso');
        renderMarcacaoUI();
    });
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

    const examesDisponiveis = [
        { id: 1, nome: 'Hemograma', preco: 45.00, descricao: 'Análise completa do sangue' },
        { id: 2, nome: 'Glicemia', preco: 35.00, descricao: 'Medição de açúcar no sangue' },
        { id: 3, nome: 'Colesterol Total', preco: 55.00, descricao: 'Perfil lipídico completo' },
        { id: 4, nome: 'TSH', preco: 60.00, descricao: 'Teste da tireoide' },
        { id: 5, nome: 'Raio-X Tórax', preco: 120.00, descricao: 'Radiografia de tórax' },
        { id: 6, nome: 'Ultrassom Abdômen', preco: 180.00, descricao: 'Ultrassom abdominal completo' }
    ];

    container.innerHTML = `
        <div class="card">
            <h3>Exames Disponíveis</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px;">
                ${examesDisponiveis.map(ex => `
                    <div class="med-card" style="padding: 15px;">
                        <h4>${ex.nome}</h4>
                        <p style="color: var(--text-sub); font-size: 0.9rem; margin: 10px 0;">${ex.descricao}</p>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
                            <span style="font-size: 1.2rem; font-weight: bold; color: var(--primary);">R$ ${ex.preco.toFixed(2)}</span>
                            <button class="btn btn-primary" data-exam-id="${ex.id}">Solicitar</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    document.querySelectorAll('[data-exam-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const exId = parseInt(btn.dataset.examId);
            const exame = examesDisponiveis.find(e => e.id === exId);
            notify(`Exame "${exame.nome}" solicitado com sucesso!`, 'sucesso');
        });
    });
}

function renderCalendarioUI() {
    const container = document.getElementById('calendario-container');
    if (!container) return;

    const hoje = new Date();
    const mes = hoje.getMonth();
    const ano = hoje.getFullYear();

    const primeiroDia = new Date(ano, mes, 1);
    const ultimoDia = new Date(ano, mes + 1, 0);
    const diasDoMes = ultimoDia.getDate();
    const comecaEm = primeiroDia.getDay();

    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    let html = `
        <div class="card">
            <h3>Calendário de Disponibilidade - ${nomesMeses[mes]} ${ano}</h3>
            <table style="width: 100%; text-align: center; border-collapse: collapse; margin: 20px 0;">
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
                            const medicosDia = medicos.filter(m => m.dias.includes(weekday));
                            const temMedicos = medicosDia.length > 0;

                            html += `<td style="padding: 15px; border: 1px solid var(--border); ${temMedicos ? 'background: #f0f8ff;' : ''} cursor: ${temMedicos ? 'pointer' : 'default'};">
                                <div style="font-weight: bold;">${dia}</div>
                                ${temMedicos ? `<div style="font-size: 0.75rem; color: var(--primary); margin-top: 5px;">${medicosDia.length} médico(s)</div>` : ''}
                            </td>`;

                            if ((comecaEm + dia) % 7 === 0 && dia < diasDoMes) html += '</tr><tr>';
                        }

                        const faltam = 42 - (comecaEm + diasDoMes);
                        for (let i = 0; i < faltam; i++) html += '<td></td>';
                        html += '</tr>';
                        return html;
                    })()}
                </tbody>
            </table>
            <p style="color: var(--text-sub); font-size: 0.9rem; margin-top: 15px;">
                <i class="fas fa-info-circle"></i> Dias em azul claro têm médicos disponíveis para agendamento.
            </p>
        </div>
    `;

    container.innerHTML = html;
}

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', () => {
    buildDynamicMenu();
    updateHeaderUser();
    
    document.getElementById('btn-logout').addEventListener('click', logout);
    
    showSection('home');
});


function carregarTabela() {
    const corpo = document.getElementById('tabela-agenda-corpo');
    if(!corpo) return;

    if (agendaSalva.length === 0) {
        corpo.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:#888;">Nenhum agendamento cadastrado.</td></tr>`;
        return;
    }

    corpo.innerHTML = agendaSalva.map((i, index) => {
        let statusColor = "#f39c12"; // Pendente
        if(i.status === 'Concluído') statusColor = "#27ae60"; 
        if(i.status === 'Cancelado') statusColor = "#e74c3c"; 

        return `
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
    `}).reverse().join('');
    
    // Adicionar event listeners aos selects e botões de ação
    document.querySelectorAll('.status-select').forEach(sel => {
        sel.addEventListener('change', () => {
            const idx = parseInt(sel.dataset.index);
            const realIdx = (agendaSalva.length - 1) - idx;
            agendaSalva[realIdx].status = sel.value;
            localStorage.setItem('agendaSalva', JSON.stringify(agendaSalva));
            notify(`Status alterado para ${sel.value}`);
            carregarTabela();
        });
    });
    
    document.querySelectorAll('.btn-edit-agenda').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            const realIdx = (agendaSalva.length - 1) - idx;
            prepararEdicao(realIdx);
        });
    });
    
    document.querySelectorAll('.btn-delete-agenda').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            const realIdx = (agendaSalva.length - 1) - idx;
            apagarAgendamento(realIdx);
        });
    });
}

function alterarStatus(index, novoStatus) {
    agendaSalva[index].status = novoStatus;
    localStorage.setItem('agendaSalva', JSON.stringify(agendaSalva));
    notify(`Status alterado para ${novoStatus}`);
    carregarTabela();
}

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

function cancelarEdicao() {
    editandoIndex = null;
    showSection('agenda');
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

// Inicialização: tratar navegação da sidebar e botão de logout sem usar handlers inline
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sidebar ul li[role="button"]').forEach(el => {
        el.addEventListener('click', () => showSection(el.dataset.section));
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSection(el.dataset.section); } });
    });

    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // Mostrar tela inicial
    showSection('home');
});

// ========== RENDERIZAÇÃO DE AGENDA ==========
function renderAgendaUI() {
    const container = document.getElementById('agenda-container');
    if (!container) return;
    
    const html = `
        <div class="card agenda-card">
            <h3 id="agenda-titulo"><i class="fas fa-calendar-plus"></i> Novo Agendamento</h3>
            <div class="agenda-form">
                <div class="form-group">
                    <label for="paciente">Nome do Paciente</label>
                    <input type="text" id="paciente" placeholder="Ex: João Silva">
                </div>
                
                <div class="form-group">
                    <label for="data">Data e Hora</label>
                    <input type="datetime-local" id="data">
                </div>
                
                <div class="form-group">
                    <label for="medico-select">Médico Responsável</label>
                    <select id="medico-select"><option value="">-- Selecione Médico --</option></select>
                </div>
                
                <div class="form-actions">
                    <button id="btn-salvar-agenda" class="btn-primary">Salvar Agendamento</button>
                    <button id="btn-cancelar-agenda" class="btn-outline" style="display:none;">Cancelar</button>
                </div>
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
    
    // Event listeners
    document.getElementById('data')?.addEventListener('change', preencherMedicosPorData);
    document.getElementById('btn-salvar-agenda')?.addEventListener('click', adicionarConsulta);
    document.getElementById('btn-cancelar-agenda')?.addEventListener('click', cancelarEdicao);
    
    carregarTabela();
    preencherMedicosPorData();
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
        <div class="card" style="margin-top: 20px;">
            <h3><i class="fas fa-history"></i> Histórico de Transações</h3>
            <div style="overflow-x: auto;">
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