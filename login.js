// --- CONTROLE DE VERSÃO DO ARMAZENAMENTO ---
// Se a versão do armazenamento for diferente da atual, limpa o localStorage para evitar inconsistências.
// Isso força a recriação do usuário 'admin' com a senha correta em novos deploys.
const APP_STORAGE_VERSION = '2.1'; // Incremente esta versão se fizer mudanças que quebram o formato dos dados.
const currentVersion = localStorage.getItem('app_storage_version');

if (currentVersion !== APP_STORAGE_VERSION) {
    localStorage.clear(); // Limpa todo o armazenamento local do domínio.
    localStorage.setItem('app_storage_version', APP_STORAGE_VERSION);
}

// Função de exibição de notificações (toasts)
function showToast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-msg">${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('fadeOut'); setTimeout(() => toast.remove(), 500); }, duration);
}

// Navegação entre abas
document.getElementById('tab-login').addEventListener('click', () => {
    document.getElementById('form-login').classList.add('active');
    document.getElementById('form-registro').classList.remove('active');
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('tab-registro').classList.remove('active');
});

document.getElementById('tab-registro').addEventListener('click', () => {
    document.getElementById('form-registro').classList.add('active');
    document.getElementById('form-login').classList.remove('active');
    document.getElementById('tab-registro').classList.add('active');
    document.getElementById('tab-login').classList.remove('active');
});

// Garante campos limpos no carregamento
document.addEventListener('DOMContentLoaded', () => {
    try { document.getElementById('user').value = ''; document.getElementById('pass').value = ''; } catch (e) { }
});

// Função SHA-256 simples usada para migrar senhas antigas
async function sha256(password) {
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
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

// Login (usa PBKDF2 com salt + migração de schema antigo)
document.getElementById('btn-login').addEventListener('click', async function () {
    const u = document.getElementById('user').value.trim();
    const p = document.getElementById('pass').value;
    if (!u || !p) { showToast('Preencha todos os campos!', 'error'); return; }

    let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    const usuario = usuarios.find(usr => usr.usuario === u);
    if (!usuario) { showToast('Usuário ou senha incorretos!', 'error'); return; }

    let valid = false;
    if (usuario.salt) {
        const { hash: hashedInput } = await deriveKey(p, usuario.salt);
        if (usuario.senha === hashedInput) valid = true;
    } else {
        const legacy = await sha256(p);
        if (usuario.senha === legacy || usuario.senha === p) {
            valid = true;
            // Migrar para o novo formato seguro
            const { salt, hash } = await deriveKey(p);
            usuario.salt = salt;
            usuario.senha = hash;
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
        }
    }

    if (!valid) { showToast('Usuário ou senha incorretos!', 'error'); return; }

    const usuarioSessao = { ...usuario };
    delete usuarioSessao.senha;
    delete usuarioSessao.salt;
    sessionStorage.setItem('usuarioLogado', JSON.stringify(usuarioSessao));
    window.location.href = 'index.html';
});


// Registro
document.getElementById('btn-registro').addEventListener('click', async function () {
    const nome = document.getElementById('reg-nome').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const usuario = document.getElementById('reg-user').value.trim();
    const senha = document.getElementById('reg-pass').value;
    const senha2 = document.getElementById('reg-pass2').value;

    if (!nome || !email || !usuario || !senha || !senha2) { showToast('Preencha todos os campos!', 'error'); return; }
    if (senha !== senha2) { showToast('As senhas não coincidem!', 'error'); return; }

    let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    if (usuarios.find(u => u.usuario === usuario)) { showToast('Usuário já existe!', 'error'); return; }

    const { salt, hash } = await deriveKey(senha);
    const novoUsuario = { id: Date.now(), nome, email, usuario, salt, senha: hash, perfil: 'usuario', dataCriacao: new Date().toLocaleDateString() };
    usuarios.push(novoUsuario);
    localStorage.setItem('usuarios', JSON.stringify(usuarios));

    showToast('Conta criada com sucesso! Faça o login.', 'success');
    document.getElementById('form-registro').reset();
    document.getElementById('tab-login').click();
});

if (!JSON.parse(localStorage.getItem('usuarios'))) {
    localStorage.setItem('usuarios', JSON.stringify([{ id: 1, nome: 'Administrador', email: 'admin@clinica.com', usuario: 'admin', senha: '123', perfil: 'admin', dataCriacao: '01/01/2026' }]));
}