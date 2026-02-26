# 🏥 Clínica SBM - Guia de Uso

## 📋 Sistema de Autenticação e Controle de Acesso

O sistema agora possui **2 tipos de usuários** com permissões diferentes:

### 👨‍💼 **Admin**
- **Login padrão**: `admin` / `123`
- **Acesso a**:
  - 📊 Dashboard (visão geral)
  - 📅 Agenda (gerenciar agendamentos)
  - 👨‍⚕️ Médicos (CRUD de médicos e disponibilidade)
  - 💰 Financeiro (receitas e despesas)

### 👤 **Usuário Comum**
- **Criar via**: Aba "Cadastro" na tela de login
- **Acesso a**:
  - 📊 Dashboard (resumido)
  - 📝 **Marcação** (agendar consultas)
  - 🔬 **Exames** (visualizar exames com preços)
  - 📆 **Calendário** (ver disponibilidade de médicos)

---

## 🚀 Como Usar

### 1️⃣ **Registrar Novo Usuário**
1. Abra `login.html` no navegador
2. Clique na aba **"Cadastro"**
3. Preencha os campos:
   - Nome Completo
   - Email
   - Usuário (username)
   - Senha
   - Confirmar Senha
4. Clique em **"Criar Conta"**
5. Efetue login com as credenciais criadas

### 2️⃣ **Login**
1. Aba **"Login"**
2. Digite o usuário e senha
3. Clique em **"Acessar Sistema"**

### 3️⃣ **Funcionalidades por Perfil**

#### Admin - Agenda
- Registrar novos agendamentos
- Atualizar status (Pendente → Confirmado → Atendido)
- Visualizar histórico de agendamentos

#### Admin - Médicos
- Adicionar/editar/deletar médicos
- Definir dias de atendimento (seg-dom)
- Visualizar calendário de disponibilidade

#### Admin - Financeiro
- Registrar receitas e despesas
- Visualizar gráficos de fluxo
- Histórico de transações

#### Usuário - Marcação
- Agendar consulta selecionando:
  - Data
  - Médico (filtrado por disponibilidade)
  - Queixa principal
- Visualizar minhas marcações

#### Usuário - Exames
- Ver lista de exames disponíveis com preços:
  - Hemograma (R$ 45.00)
  - Glicemia (R$ 35.00)
  - Colesterol (R$ 55.00)
  - TSH (R$ 60.00)
  - Raio-X (R$ 120.00)
  - Ultrassom (R$ 180.00)

#### Usuário - Calendário
- Visualizar mês atual
- Dias em azul claro = médicos disponíveis
- Contar médicos por dia

---

## 💾 Dados Armazenados

Tudo é persistido em `localStorage`:
- `usuarios` - Array de usuários cadastrados
- `agendaSalva` - Agendamentos (com `usuarioId`)
- `medicos` - Lista de médicos
- `historicoFinancas` - Transações financeiras

> **Nota**: Para limpar dados, abra DevTools (F12) → Storage → localStorage → Delete

---

## 📱 Responsividade

- ✅ **Desktop**: Layout completo (sidebar + header)
- ✅ **Tablet (768px)**: Sidebar horizontal
- ✅ **Mobile (480px)**: Otimizado para celular

---

## 🔐 Segurança

- ⚠️ **IMPORTANTE**: Este é um sistema **educacional**
- Senhas são armazenadas em plain text no localStorage
- Em produção, usar backend seguro com hash de senhas
- Nunca exponha dados sensíveis no client-side

---

## 🐛 Troubleshooting

**"Sem acesso ao menu X"**
→ Você é usuário comum. Menu disponível apenas para admins

**"Usuário não encontrado"**
→ Verifique credenciais ou registre novo usuário

**"Agendamento não aparece"**
→ Filtra por `usuarioId`. Cada usuário vê apenas seus agendamentos

**Limpar tudo:**
```javascript
// Console do navegador (F12)
localStorage.clear();
sessionStorage.clear();
window.location.reload();
```

---

## 📝 Fluxo de Dados

```
login.html (Autenticação)
    ↓
sessionStorage['usuarioLogado'] = {id, nome, perfil, ...}
    ↓
index.html (Carrega script.js)
    ↓
buildDynamicMenu() → Renderiza menu por perfil
    ↓
showSection() → Chamado ao clicar no menu
    ↓
render[Tipo]UI() → Cria UI e binds eventos
    ↓
localStorage → Persiste dados
```

---

**Versão**: 2.0 Stable  
**Última atualização**: 2026
