// Tela de login

// Tela de login

function renderLogin() {
    return `
    <div class="min-h-screen login-bg flex items-center justify-center p-4" >
        <div id="global-toast-container" class="absolute inset-0 pointer-events-none z-50">
            ${state.msg.text ? `
            <div class="absolute top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce ${state.msg.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'} font-bold pointer-events-auto">
                <i data-lucide="${state.msg.type === 'error' ? 'x-circle' : 'check-circle'}"></i>
                ${state.msg.text}
            </div>
            ` : ''}
        </div>
        
        <div class="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-slate-200 fade-in relative z-50">
            <div class="text-center mb-8">
                <div class="flex justify-center mx-auto mb-6">
                    <img src="assets/img/logo_hgp.jpg" alt="Hospital Geral de Palmas" class="h-40 object-contain">
                </div>
                <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">GESTAO DE ESTOQUE</h1>
            </div>
            <div class="space-y-4">
                <input id="login_user" type="email" placeholder="E-mail" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" onkeypress="if(event.key === 'Enter') handleLoginAction()" class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                <input id="login_pass" type="password" placeholder="Senha" autocomplete="current-password" onkeypress="if(event.key === 'Enter') handleLoginAction()" class="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all">
                <button onclick="handleLoginAction()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95">Entrar no Sistema</button>
                <button type="button" onclick="handleForgotPassword()" class="w-full text-sm font-semibold text-blue-600 hover:text-blue-800 py-1 transition-colors">Esqueci minha senha</button>
            </div>
                    <div id="login-error" class="mt-4 text-red-500 text-xs text-center font-bold hidden">Credenciais Inválidas</div>


            </div>
        </div>`;
}
