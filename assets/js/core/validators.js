// Validações e formatações reutilizáveis (CPF, telefone, datas, nomes)

const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');

/** CPF válido: 11 dígitos, não repetidos e com os dois dígitos verificadores corretos. */
function validateCPF(value) {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const check = (len) => {
        let sum = 0;
        for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
        const rest = (sum * 10) % 11;
        return (rest === 10 ? 0 : rest) === Number(cpf[len]);
    };
    return check(9) && check(10);
}

/** 12345678909 → 123.456.789-09 (aceita CPF parcial, para máscara durante a digitação). */
function formatCPF(value) {
    const d = onlyDigits(value).slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** Esconde o miolo do CPF nas listagens (proteção de dados pessoais): 123.***.***-09 */
function maskCPF(value) {
    const d = onlyDigits(value);
    if (d.length !== 11) return d ? '***' : '—';
    return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

/** (63) 98765-4321 (aceita telefone parcial). */
function formatPhone(value) {
    const d = onlyDigits(value).slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone brasileiro com DDD: 10 ou 11 dígitos. */
const validatePhone = (value) => [10, 11].includes(onlyDigits(value).length);

/** Nome para busca: sem acentos, minúsculo e com espaços simples. */
const searchKey = (value) => normalizeText(value).replace(/\s+/g, ' ').trim();

/** Data local no formato YYYY-MM-DD. */
function todayISO(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Hora local HH:MM. */
function nowTime(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 2026-11-18 → 18/11/2026 */
function formatDateBR(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** ISO completo → 18/11/2026 14:35 */
function formatDateTimeBR(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Idade em anos completos a partir da data de nascimento (YYYY-MM-DD). */
function ageFromBirth(iso, ref = new Date()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
    if (!m) return null;
    let age = ref.getFullYear() - Number(m[1]);
    if (ref.getMonth() + 1 < Number(m[2]) || (ref.getMonth() + 1 === Number(m[2]) && ref.getDate() < Number(m[3]))) age--;
    return age >= 0 ? age : null;
}

/** Data de nascimento válida: formato correto, não futura e até 130 anos atrás. */
function validateBirthDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? ''))) return false;
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return false;
    const age = ageFromBirth(iso);
    return age !== null && age <= 130 && iso <= todayISO();
}

/** Identificador único curto para documentos (ex.: pac_lq3k9x2a). */
function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- CNPJ, CEP e e-mail (cadastros) ----------

function validateCNPJ(value) {
    const n = onlyDigits(value);
    if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
    const calc = (len) => {
        let soma = 0;
        let pos = len - 7;
        for (let i = len; i >= 1; i--) {
            soma += Number(n[len - i]) * pos--;
            if (pos < 2) pos = 9;
        }
        const r = soma % 11;
        return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(n[12]) && calc(13) === Number(n[13]);
}

function formatCNPJ(value) {
    const n = onlyDigits(value).slice(0, 14);
    return n.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

const formatCEP = (value) => onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? '').trim());
