let pcs = JSON.parse(localStorage.getItem('ti_pcs')) || [];
let printers = JSON.parse(localStorage.getItem('ti_printers')) || [];
let editandoIndex = null;
let editandoTipo = null;

const listaNucleos = [
    "SALVADOR", "BARREIRAS", "CAETITE", "IRECE", "JUAZEIRO", 
    "RIBEIRA DO POMBAL", "SEABRA", "SENHOR DO BONFIM", 
    "SANTA MARIA DA VITORIA", "TEIXEIRA DE FREITAS", "VITORIA DA CONQUISTA"
];

const mapaSiglas = {
    "SBONFIM": "SENHOR DO BONFIM",
    "RPOMBAL": "RIBEIRA DO POMBAL",
    "SMV": "SANTA MARIA DA VITORIA",
    "TFREITAS": "TEIXEIRA DE FREITAS",
    "VCONQUISTA": "VITORIA DA CONQUISTA"
};

// --- FUNÇÕES DE INTERFACE ---

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.sidebar-overlay').classList.toggle('active');
}

function identificarNucleo(texto) {
    if (!texto) return "SALVADOR";
    let t = texto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const sigla in mapaSiglas) { if (t.includes(sigla)) return mapaSiglas[sigla]; }
    for (const n of listaNucleos) {
        const nNorm = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (t.includes(nNorm)) return n;
    }
    return "SALVADOR";
}

function scrollToNucleo(nucleo) {
    const id = "row-" + nucleo.replace(/\s/g, '');
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.innerWidth <= 768) toggleSidebar();
    }
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabName).style.display = 'block';
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    if (window.innerWidth <= 768) toggleSidebar();
}

window.onscroll = function() {
    const btn = document.getElementById("backToTop");
    if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
        btn.style.display = "flex";
    } else {
        btn.style.display = "none";
    }
};

// --- EDIÇÃO DE REGISTROS ---

function abrirEditor(tipo, idx) {
    editandoTipo = tipo;
    editandoIndex = idx;
    const item = tipo === 'pc' ? pcs[idx] : printers[idx];
    const form = document.getElementById('formEdicao');
    
    // Título dinâmico para o modal de edição (opcional, adicione um id no H3 do modal)
    
    if (tipo === 'pc') {
        form.innerHTML = `
            <div class="edit-form">
                <label>Identificação do PC</label><input type="text" id="edit-pc" value="${item.pc}">
                <label>Usuário Responsável</label><input type="text" id="edit-user" value="${item.usuario}">
                <label>Memória RAM</label><input type="text" id="edit-ram" value="${item.ram}">
                <label>Processador</label><input type="text" id="edit-cpu" value="${item.cpu}">
                <label>Nº de Série</label><input type="text" id="edit-sn" value="${item.serial}">
                <button type="button" class="btn-save-edit" onclick="salvarEdicao()"><i class="fas fa-save"></i> Atualizar Dados</button>
            </div>
        `;
    } else {
        form.innerHTML = `
            <div class="edit-form">
                <label>Modelo</label><input type="text" id="edit-modelo" value="${item.modelo}">
                <label>Nº de Série</label><input type="text" id="edit-sn" value="${item.serial}">
                <label>Observação / Localização</label><input type="text" id="edit-obs" value="${item.obs}">
                <button type="button" class="btn-save-edit" onclick="salvarEdicao()"><i class="fas fa-save"></i> Atualizar Dados</button>
            </div>
        `;
    }
    document.getElementById('editModal').style.display = 'flex';
}

function salvarEdicao() {
    if (editandoTipo === 'pc') {
        pcs[editandoIndex] = {
            pc: document.getElementById('edit-pc').value.toUpperCase(),
            usuario: document.getElementById('edit-user').value,
            ram: document.getElementById('edit-ram').value,
            cpu: document.getElementById('edit-cpu').value,
            serial: document.getElementById('edit-sn').value
        };
    } else {
        const obs = document.getElementById('edit-obs').value;
        printers[editandoIndex] = {
            modelo: document.getElementById('edit-modelo').value,
            serial: document.getElementById('edit-sn').value,
            obs: obs,
            nucleo: identificarNucleo(obs)
        };
    }
    closeEditModal();
    save();
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

// --- RENDERIZAÇÃO ---

function render() {
    const pcBody = document.getElementById('pcTableBody');
    const printerBody = document.getElementById('printerTableBody');
    const dash = document.getElementById('dashboard-resumo');
    const menu = document.getElementById('nucleos-menu');
    const term = document.getElementById('searchInput').value.toLowerCase();

    pcBody.innerHTML = ''; printerBody.innerHTML = ''; dash.innerHTML = ''; menu.innerHTML = '';

    listaNucleos.forEach(nucleo => {
        const nId = nucleo.replace(/\s/g, '');
        const pcsN = pcs.filter(p => identificarNucleo(p.pc) === nucleo);
        const priN = printers.filter(p => p.nucleo === nucleo);

        if (pcsN.length > 0 || priN.length > 0) {
            dash.innerHTML += `<div class="card-nucleo ${nId}"><span>${nucleo}</span><span>${pcsN.length} PCs | ${priN.length} Imp.</span></div>`;
            menu.innerHTML += `<button class="nav-item-sub" onclick="scrollToNucleo('${nucleo}')"><i class="fas fa-location-arrow"></i> ${nucleo}</button>`;

            // Render PCs
            const fPcs = pcsN.filter(p => Object.values(p).join(' ').toLowerCase().includes(term));
            if (fPcs.length > 0) {
                pcBody.innerHTML += `<tr id="row-${nId}" class="row-nucleo ${nId}"><td colspan="6"><i class="fas fa-city"></i> ${nucleo}</td></tr>`;
                fPcs.forEach(p => {
                    const idx = pcs.indexOf(p);
                    pcBody.innerHTML += `
                    <tr>
                        <td data-label="PC">${p.pc}</td>
                        <td data-label="Usuário">${p.usuario}</td>
                        <td data-label="RAM">${p.ram}</td>
                        <td data-label="CPU">${p.cpu}</td>
                        <td data-label="S/N">${p.serial}</td>
                        <td data-label="Ações">
                            <div class="actions-group">
                                <button class="btn-action" onclick="abrirQR('pc', ${idx})"><i class="fas fa-qrcode"></i></button>
                                <button class="btn-action btn-edit" onclick="abrirEditor('pc', ${idx})"><i class="fas fa-edit"></i></button>
                                <button class="btn-action" onclick="excluir('pc', ${idx})"><i class="fas fa-trash"></i></button>
                            </div>
                        </td>
                    </tr>`;
                });
            }

            // Render Impressoras
            const fPri = priN.filter(p => Object.values(p).join(' ').toLowerCase().includes(term));
            if (fPri.length > 0) {
                printerBody.innerHTML += `<tr id="row-${nId}" class="row-nucleo ${nId}"><td colspan="4"><i class="fas fa-print"></i> ${nucleo}</td></tr>`;
                fPri.forEach(p => {
                    const idx = printers.indexOf(p);
                    printerBody.innerHTML += `
                    <tr>
                        <td data-label="Modelo">${p.modelo}</td>
                        <td data-label="S/N">${p.serial}</td>
                        <td data-label="Local">${p.obs}</td>
                        <td data-label="Ações">
                            <div class="actions-group">
                                <button class="btn-action" onclick="abrirQR('pri', ${idx})"><i class="fas fa-qrcode"></i></button>
                                <button class="btn-action btn-edit" onclick="abrirEditor('pri', ${idx})"><i class="fas fa-edit"></i></button>
                                <button class="btn-action" onclick="excluir('pri', ${idx})"><i class="fas fa-trash"></i></button>
                            </div>
                        </td>
                    </tr>`;
                });
            }
        }
    });
}

// Funções de apoio
function save() { localStorage.setItem('ti_pcs', JSON.stringify(pcs)); localStorage.setItem('ti_printers', JSON.stringify(printers)); render(); }
function excluir(t, i) { if(confirm("Deseja realmente excluir este item?")) { t==='pc' ? pcs.splice(i,1) : printers.splice(i,1); save(); } }
function limparBase() { if(confirm("AVISO: Isso apagará TODOS os dados. Continuar?")) { pcs=[]; printers=[]; save(); } }
function closeModal() { document.getElementById('qrModal').style.display = 'none'; }
function abrirQR(tipo, idx) {
    const item = tipo === 'pc' ? pcs[idx] : printers[idx];
    document.getElementById('qrcode').innerHTML = '';
    new QRCode(document.getElementById('qrcode'), { text: item.serial, width: 120, height: 120 });
    document.getElementById('l-title').innerText = tipo === 'pc' ? item.pc : item.modelo;
    document.getElementById('l-serial').innerText = item.serial;
    document.getElementById('qrModal').style.display = 'flex';
}

document.getElementById('searchInput').addEventListener('input', render);
render();