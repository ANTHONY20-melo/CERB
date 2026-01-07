let pcs = JSON.parse(localStorage.getItem('ti_pcs')) || [];
let printers = JSON.parse(localStorage.getItem('ti_printers')) || [];

const listaNucleos = [
    "SALVADOR", "BARREIRAS", "CAETITE", "IRECE", "JUAZEIRO", 
    "RIBEIRA DO POMBAL", "SEABRA", "SENHOR DO BONFIM", 
    "SANTA MARIA DA VITORIA", "TEIXEIRA DE FREITAS", "VITORIA DA CONQUISTA"
];

// --- AUXILIARES ---
function identificarNucleo(texto) {
    if (!texto) return "SALVADOR";
    const t = texto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const n of listaNucleos) {
        if (t.includes(n)) return n;
    }
    return "SALVADOR";
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const targetTab = document.getElementById('tab-' + tabName);
    if(targetTab) targetTab.style.display = 'block';
    if(event) event.currentTarget.classList.add('active');
}

// --- IMPORTAÇÃO ---
document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    const filename = file.name.toLowerCase();

    reader.onload = function(event) {
        let data;
        try {
            if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
                const workbook = XLSX.read(event.target.result, { type: 'binary' });
                data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            } else {
                const bytes = new Uint8Array(event.target.result);
                let decoder = new TextDecoder('utf-8');
                let csvText = decoder.decode(bytes);
                if (csvText.includes('')) {
                    decoder = new TextDecoder('windows-1252');
                    csvText = decoder.decode(bytes);
                }
                data = processarCSV(csvText);
            }
            distribuirDados(data);
        } catch (err) { alert("Erro ao ler o arquivo."); }
    };
    filename.endsWith('.xlsx') || filename.endsWith('.xls') ? reader.readAsBinaryString(file) : reader.readAsArrayBuffer(file);
});

function distribuirDados(rows) {
    rows.forEach(row => {
        const item = {};
        Object.keys(row).forEach(key => {
            const normalizedKey = key.toUpperCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            item[normalizedKey] = row[key];
        });

        if (item['PROCESSADOR'] || item['CPU'] || item['USUARIO'] || item['RAM']) {
            pcs.push({
                pc: (item['PC'] || item['COMPUTADOR'] || 'PC-NOVO').toUpperCase(),
                usuario: item['USUARIO'] || 'N/A',
                ram: item['MEMORIA RAM'] || item['RAM'] || '-',
                cpu: item['PROCESSADOR'] || item['CPU'] || '-',
                serial: item['Nº DE SERIE'] || item['SERIAL'] || 'S/N'
            });
        } 
        else if (item['MODELO'] || item['OBSERVACAO']) {
            const obs = (item['OBSERVACAO'] || item['OBSERVACOES'] || "").toUpperCase();
            printers.push({
                modelo: item['MODELO'] || 'Impressora',
                serial: item['Nº DE SERIE'] || item['SERIAL'] || 'S/N',
                obs: obs,
                nucleo: identificarNucleo(obs)
            });
        }
    });
    save();
}

function processarCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
    if (lines.length === 0) return [];
    const separator = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(separator).map(h => h.trim().toUpperCase());
    return lines.slice(1).map(line => {
        const cols = line.split(separator);
        let obj = {};
        headers.forEach((header, i) => obj[header] = cols[i] ? cols[i].trim().replace(/^"|"$/g, '') : '');
        return obj;
    });
}

// --- RENDERIZAÇÃO ---
function render() {
    const pcBody = document.getElementById('pcTableBody');
    const printerBody = document.getElementById('printerTableBody');
    const dashResumo = document.getElementById('dashboard-resumo');
    const term = document.getElementById('searchInput').value.toLowerCase();

    if(pcBody) pcBody.innerHTML = '';
    if(printerBody) printerBody.innerHTML = '';
    if(dashResumo) dashResumo.innerHTML = '';

    listaNucleos.forEach(nucleo => {
        const nucleoClean = nucleo.replace(/\s/g, '');
        
        // Filtros
        const pcsDoNucleo = pcs.filter(p => identificarNucleo(p.pc) === nucleo);
        const printersDoNucleo = printers.filter(p => p.nucleo === nucleo);
        
        const pcsFiltrados = pcsDoNucleo.filter(p => Object.values(p).join(' ').toLowerCase().includes(term));
        const printersFiltrados = printersDoNucleo.filter(p => Object.values(p).join(' ').toLowerCase().includes(term));

        // 1. Dashboard
        if (pcsDoNucleo.length > 0 || printersDoNucleo.length > 0) {
            dashResumo.innerHTML += `
                <div class="card-nucleo ${nucleoClean}">
                    <span>${nucleo}</span>
                    <span>${pcsDoNucleo.length} PCs | ${printersDoNucleo.length} Imp.</span>
                </div>`;
        }

        // 2. Tabela PCs
        if (pcsFiltrados.length > 0) {
            pcBody.innerHTML += `<tr class="row-nucleo ${nucleoClean}"><td colspan="6"><i class="fas fa-city"></i> ${nucleo}</td></tr>`;
            pcsFiltrados.forEach(item => {
                const idx = pcs.indexOf(item);
                pcBody.innerHTML += `<tr><td>${item.pc}</td><td>${item.usuario}</td><td>${item.ram}</td><td>${item.cpu}</td><td><code>${item.serial}</code></td>
                <td><button class="btn-action" onclick="abrirQR('pc', ${idx})"><i class="fas fa-qrcode"></i></button>
                <button class="btn-action btn-del" onclick="excluir('pc', ${idx})"><i class="fas fa-trash"></i></button></td></tr>`;
            });
        }

        // 3. Tabela Impressoras
        if (printersFiltrados.length > 0) {
            printerBody.innerHTML += `<tr class="row-nucleo ${nucleoClean}"><td colspan="4"><i class="fas fa-print"></i> ${nucleo}</td></tr>`;
            printersFiltrados.forEach(item => {
                const idx = printers.indexOf(item);
                printerBody.innerHTML += `<tr><td>${item.modelo}</td><td><code>${item.serial}</code></td><td>${item.obs}</td>
                <td><button class="btn-action" onclick="abrirQR('printer', ${idx})"><i class="fas fa-qrcode"></i></button>
                <button class="btn-action btn-del" onclick="excluir('printer', ${idx})"><i class="fas fa-trash"></i></button></td></tr>`;
            });
        }
    });
}

function abrirQR(tipo, idx) {
    const item = tipo === 'pc' ? pcs[idx] : printers[idx];
    const qrDiv = document.getElementById('qrcode');
    qrDiv.innerHTML = ''; 
    new QRCode(qrDiv, { text: `SN:${item.serial}`, width: 128, height: 128 });
    document.getElementById('l-title').innerText = tipo === 'pc' ? item.pc : item.modelo;
    document.getElementById('l-serial').innerText = "S/N: " + item.serial;
    document.getElementById('l-extra').innerText = tipo === 'pc' ? "User: " + item.usuario : "Local: " + (item.nucleo || "Salvador");
    document.getElementById('qrModal').style.display = 'flex';
}

function save() {
    localStorage.setItem('ti_pcs', JSON.stringify(pcs));
    localStorage.setItem('ti_printers', JSON.stringify(printers));
    render();
}

function excluir(tipo, idx) {
    if (confirm("Remover item?")) {
        tipo === 'pc' ? pcs.splice(idx, 1) : printers.splice(idx, 1);
        save();
    }
}

function limparBase() {
    if (confirm("Resetar todo o inventário?")) { pcs = []; printers = []; save(); }
}

function closeModal() { document.getElementById('qrModal').style.display = 'none'; }
document.getElementById('searchInput').addEventListener('input', render);
render();