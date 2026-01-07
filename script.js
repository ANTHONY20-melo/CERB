let pcs = JSON.parse(localStorage.getItem('ti_pcs')) || [];
let printers = JSON.parse(localStorage.getItem('ti_printers')) || [];

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
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tabName).style.display = 'block';
    event.currentTarget.classList.add('active');
}

// IMPORTAÇÃO E PROCESSAMENTO
document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        distribuirDados(data);
    };
    reader.readAsBinaryString(file);
});

function distribuirDados(rows) {
    rows.forEach(row => {
        const item = {};
        Object.keys(row).forEach(k => {
            const key = k.toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            item[key] = row[k];
        });

        if (item['PROCESSADOR'] || item['CPU'] || item['USUARIO']) {
            pcs.push({
                pc: (item['PC'] || item['COMPUTADOR'] || 'PC-NOVO').toUpperCase(),
                usuario: item['USUARIO'] || 'N/A',
                ram: item['RAM'] || '-',
                cpu: item['PROCESSADOR'] || item['CPU'] || '-',
                serial: item['Nº DE SERIE'] || item['SERIAL'] || 'S/N'
            });
        } else if (item['MODELO'] || item['OBSERVACAO']) {
            const obs = (item['OBSERVACAO'] || "").toUpperCase();
            printers.push({
                modelo: item['MODELO'] || 'Impressora',
                serial: item['Nº DE SERIE'] || 'S/N',
                obs: obs,
                nucleo: identificarNucleo(obs)
            });
        }
    });
    save();
}
// ... (mantenha todas as funções anteriores: identificarNucleo, render, salvar, etc) ...

// FUNÇÕES DE MENU MOBILE
function toggleSidebar() {
    const sidebar = document.getElementById('mainSidebar');
    sidebar.classList.toggle('active');
}

// Fecha a sidebar se estiver no mobile (ajuda na navegação)
function maybeCloseSidebar() {
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

// Modifique a sua função scrollToNucleo para fechar a sidebar após clicar
function scrollToNucleo(nucleo) {
    maybeCloseSidebar();
    const id = "row-" + nucleo.replace(/\s/g, '');
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Ajuste na função render() para garantir que as tabelas permitam scroll
// Certifique-se de que o HTML gerado para as TRs de núcleo usem o ID correto row-ID

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
            // Dashboard & Menu Lateral
            dash.innerHTML += `<div class="card-nucleo ${nId}"><span>${nucleo}</span><span>${pcsN.length} PCs | ${priN.length} Imp.</span></div>`;
            menu.innerHTML += `<button class="nav-item-sub" onclick="scrollToNucleo('${nucleo}')"><i class="fas fa-location-arrow"></i> ${nucleo}</button>`;

            // Render PCs
            const fPcs = pcsN.filter(p => Object.values(p).join(' ').toLowerCase().includes(term));
            if (fPcs.length > 0) {
                pcBody.innerHTML += `<tr id="row-${nId}" class="row-nucleo ${nId}"><td colspan="6"><i class="fas fa-city"></i> ${nucleo}</td></tr>`;
                fPcs.forEach(p => {
                    const idx = pcs.indexOf(p);
                    pcBody.innerHTML += `<tr><td>${p.pc}</td><td>${p.usuario}</td><td>${p.ram}</td><td>${p.cpu}</td><td>${p.serial}</td><td>
                        <button class="btn-action" onclick="abrirQR('pc', ${idx})"><i class="fas fa-qrcode"></i></button>
                        <button class="btn-action" onclick="excluir('pc', ${idx})"><i class="fas fa-trash"></i></button>
                    </td></tr>`;
                });
            }

            // Render Impressoras
            const fPri = priN.filter(p => Object.values(p).join(' ').toLowerCase().includes(term));
            if (fPri.length > 0) {
                printerBody.innerHTML += `<tr id="row-${nId}" class="row-nucleo ${nId}"><td colspan="4"><i class="fas fa-print"></i> ${nucleo}</td></tr>`;
                fPri.forEach(p => {
                    const idx = printers.indexOf(p);
                    printerBody.innerHTML += `<tr><td>${p.modelo}</td><td>${p.serial}</td><td>${p.obs}</td><td>
                        <button class="btn-action" onclick="abrirQR('pri', ${idx})"><i class="fas fa-qrcode"></i></button>
                        <button class="btn-action" onclick="excluir('pri', ${idx})"><i class="fas fa-trash"></i></button>
                    </td></tr>`;
                });
            }
        }
    });
}

function abrirQR(tipo, idx) {
    const item = tipo === 'pc' ? pcs[idx] : printers[idx];
    document.getElementById('qrcode').innerHTML = '';
    new QRCode(document.getElementById('qrcode'), { text: item.serial, width: 120, height: 120 });
    document.getElementById('l-title').innerText = tipo === 'pc' ? item.pc : item.modelo;
    document.getElementById('l-serial').innerText = item.serial;
    document.getElementById('qrModal').style.display = 'flex';
}

function save() { localStorage.setItem('ti_pcs', JSON.stringify(pcs)); localStorage.setItem('ti_printers', JSON.stringify(printers)); render(); }
function excluir(t, i) { if(confirm("Excluir?")) { t==='pc' ? pcs.splice(i,1) : printers.splice(i,1); save(); } }
function limparBase() { if(confirm("Limpar tudo?")) { pcs=[]; printers=[]; save(); } }
function closeModal() { document.getElementById('qrModal').style.display = 'none'; }
document.getElementById('searchInput').addEventListener('input', render);
render();