import './input.css';

// Importações do Firebase
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
// Mantemos a importação do storage para inicialização, mas não usamos para upload
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// Debug
console.log('Verificando VITE_FIREBASE_API_KEY:', import.meta.env.VITE_FIREBASE_API_KEY);

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Elementos Globais da UI
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const mainAuthBtn = document.getElementById('main-auth-btn');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const authError = document.getElementById('auth-error');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const loadingOverlay = document.getElementById('loading-overlay');
let isLoginMode = true;

// --- LISTENERS DE AUTENTICAÇÃO ---
const handleAuthKeyPress = (event) => { if (event.key === 'Enter') { event.preventDefault(); mainAuthBtn.click(); } };
if(document.getElementById('email-input')) document.getElementById('email-input').addEventListener('keydown', handleAuthKeyPress);
if(document.getElementById('password-input')) document.getElementById('password-input').addEventListener('keydown', handleAuthKeyPress);
if(document.getElementById('confirm-password-input')) document.getElementById('confirm-password-input').addEventListener('keydown', handleAuthKeyPress);

const showError = (message) => { if(authError) authError.textContent = message; };

const applyTheme = (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    if (themeToggleBtn) {
        themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
    if (window.App && App.state.currentUserId && App.state.monthlyData && App.state.monthlyData[App.state.activeMonthIndex]) { 
        App.showMonth(App.state.activeMonthIndex); 
    }
};

applyTheme(localStorage.getItem('theme') || 'light');

if (mainAuthBtn) {
    mainAuthBtn.addEventListener('click', () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        showError('');
        const originalBtnText = mainAuthBtn.textContent;
        mainAuthBtn.disabled = true;
        mainAuthBtn.textContent = 'Aguarde...';
        const restoreBtn = () => { mainAuthBtn.disabled = false; mainAuthBtn.textContent = originalBtnText; };
        
        if (isLoginMode) {
            signInWithEmailAndPassword(auth, email, password).catch(error => { 
                console.error(error);
                showError('Email ou senha inválidos.'); 
                restoreBtn(); 
            });
        } else {
            const confirmPassword = document.getElementById('confirm-password-input').value;
            if (password !== confirmPassword) { showError('As senhas não coincidem.'); restoreBtn(); return; }
            createUserWithEmailAndPassword(auth, email, password).catch(error => {
                if (error.code === 'auth/email-already-in-use') showError('Este email já está em uso.');
                else if (error.code === 'auth/weak-password') showError('A senha deve ter pelo menos 6 caracteres.');
                else showError('Erro ao criar conta.');
                restoreBtn();
            });
        }
    });
}

if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('email-input');
        if(!emailInput) return;
        
        const email = emailInput.value.trim(); 
        showError(''); 
        
        if (!email) { 
            showError('Por favor, insira seu email para recuperar a senha.'); 
            return; 
        }
        
        const actionCodeSettings = {
            url: 'https://ricoplus.com.br/login', 
            handleCodeInApp: false,
        };
        
        const originalText = forgotPasswordLink.textContent;
        forgotPasswordLink.textContent = 'Enviando...';
        forgotPasswordLink.style.pointerEvents = 'none';

        try {
            await sendPasswordResetEmail(auth, email, actionCodeSettings); 
            showError('Link de recuperação enviado! Verifique sua caixa de entrada.');
            authError.style.color = 'var(--green-color)';
        } catch (error) {
            console.error("Erro ao enviar email:", error);
            showError('Link de recuperação enviado! Verifique sua caixa de entrada.');
            authError.style.color = 'var(--green-color)';
        } finally {
            forgotPasswordLink.textContent = originalText;
            forgotPasswordLink.style.pointerEvents = 'auto';
        }
    });
}

// --- APLICAÇÃO PRINCIPAL ---
const App = {
    state: {
        currentUserId: null,
        listenersBound: false,
        profile: { name: '', avatarUrl: '' },
        integrations: { whatsapp: { phoneNumberId: '', accessToken: '', webhookVerifyToken: '' } },
        creditCards: [],
        categories: [{ name: 'Alimentação', budget: 500 }, { name: 'Transporte', budget: 150 }, { name: 'Moradia', budget: 1500 }, { name: 'Lazer', budget: 300 }, { name: 'Saúde', budget: 200 }, { name: 'Outros', budget: 100 }],
        recurringEntries: [],
        monthlyData: {},
        activeMonthIndex: new Date().getMonth(),
        lastViewedMonthIndex: new Date().getMonth(),
        chartInstances: {},
        saveTimeout: null
    },

    ui: {
        monthContentContainer: null, settingsModal: null, accountModal: null,
        userNameInput: null, userEmailDisplay: null, 
        newCardNameInput: null, cardListContainer: null,
        newCategoryNameInput: null, categoryListContainer: null,
        recurringListContainer: null, saveFeedback: null,
        aiAnalysisModal: null, aiAnalysisResult: null
    },

    constants: {
        monthNames: ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro", "Balanço Anual"],
        basePaymentMethods: ['Pix', 'Débito', 'Crédito', 'Dinheiro', 'Outro']
    },

    init(userId) {
        this.state.currentUserId = userId;
        
        this.ui.monthContentContainer = document.getElementById('monthContentContainer');
        this.ui.settingsModal = document.getElementById('settings-modal');
        this.ui.accountModal = document.getElementById('account-modal');
        this.ui.userNameInput = document.getElementById('user-name-input');
        this.ui.userEmailDisplay = document.getElementById('user-email-display');
        this.ui.newCardNameInput = document.getElementById('new-card-name');
        this.ui.cardListContainer = document.getElementById('card-list');
        this.ui.newCategoryNameInput = document.getElementById('new-category-name');
        this.ui.categoryListContainer = document.getElementById('category-list');
        this.ui.recurringListContainer = document.getElementById('recurring-list');
        this.ui.saveFeedback = document.getElementById('save-feedback');
        this.ui.aiAnalysisModal = document.getElementById('ai-analysis-modal');
        this.ui.aiAnalysisResult = document.getElementById('ai-analysis-result');

        this.loadData();

        if (!this.state.listenersBound) {
            this.bindGlobalEventListeners();
            this.state.listenersBound = true; 
            console.log("Listeners globais inicializados.");
        }
    },

    helpers: {
        formatCurrency: (value) => `R$ ${value.toFixed(2).replace('.', ',')}`,
        debounce(func, delay) { return (...args) => { clearTimeout(App.state.saveTimeout); App.state.saveTimeout = setTimeout(() => { func.apply(this, args); }, delay); }; },
        showSaveFeedback() { 
            if(App.ui.saveFeedback) {
                App.ui.saveFeedback.classList.add('show'); 
                setTimeout(() => { App.ui.saveFeedback.classList.remove('show'); }, 2000); 
            }
        },
        cleanAIResponse(text) {
            if (typeof text !== 'string') return '';
            let cleanedText = text.replace(/```html|```/g, '');
            const firstTagIndex = cleanedText.indexOf('<');
            if (firstTagIndex > -1) { cleanedText = cleanedText.substring(firstTagIndex); }
            return cleanedText.trim();
        },
        generateRandomToken() { return [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join(''); }
    },

    handleAvatarUpload(event) {
        const file = event.target.files[0];
        if (!file || !this.state.currentUserId) return;

        if (file.size > 700 * 1024) {
            alert("A imagem é muito grande! Escolha uma foto menor que 700KB.");
            return;
        }

        const avatarImg = document.getElementById('user-avatar');
        const originalSrc = avatarImg.src;
        avatarImg.style.opacity = '0.5';

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const base64String = e.target.result;
                this.state.profile.avatarUrl = base64String;
                avatarImg.src = base64String;
                await this.saveDataToFirestore();
            } catch (error) {
                console.error("Erro ao processar avatar:", error);
                avatarImg.src = originalSrc;
                alert("Erro ao salvar a imagem.");
            } finally {
                avatarImg.style.opacity = '1';
            }
        };
        reader.onerror = () => {
            console.error("Erro ao ler arquivo");
            avatarImg.src = originalSrc;
            avatarImg.style.opacity = '1';
        };
        reader.readAsDataURL(file);
    },

    async saveDataToFirestore() {
        if (!App.state.currentUserId) return;
        try {
            const dataToSave = {
                profile: App.state.profile,
                integrations: App.state.integrations,
                monthlyData: App.state.monthlyData,
                creditCards: App.state.creditCards,
                categories: App.state.categories,
                recurringEntries: App.state.recurringEntries
            };
            await setDoc(doc(db, 'users', App.state.currentUserId), dataToSave, { merge: true });
            App.helpers.showSaveFeedback();
        } catch (e) { console.error("Erro ao salvar dados: ", e); }
    },

    debouncedSave: null,

    async loadData() {
        if (!this.state.currentUserId) return;
        
        try {
            const docSnap = await getDoc(doc(db, 'users', this.state.currentUserId));
            if (docSnap.exists()) {
                const d = docSnap.data();
                this.state.profile = d.profile || { name: '', avatarUrl: '' };
                this.state.integrations = d.integrations || { whatsapp: { phoneNumberId: '', accessToken: '', webhookVerifyToken: '' } };
                this.state.monthlyData = d.monthlyData || {};
                this.state.creditCards = d.creditCards || [];
                this.state.categories = d.categories && d.categories.length > 0 ? d.categories : this.state.categories;
                this.state.recurringEntries = d.recurringEntries || [];
            }
            
            for (let i = 0; i < 12; i++) {
                if (!this.state.monthlyData[i]) { this.state.monthlyData[i] = {}; }
                this.state.monthlyData[i].pjEntries = this.state.monthlyData[i].pjEntries || [];
                this.state.monthlyData[i].pfEntries = this.state.monthlyData[i].pfEntries || [];
                if (!Array.isArray(this.state.monthlyData[i].expenses) || this.state.monthlyData[i].expenses.length < 31) {
                    this.state.monthlyData[i].expenses = Array(31).fill(null).map(() => ({ personalEntries: [], businessEntries: [] }));
                }
                this.state.monthlyData[i].expenses.forEach(day => {
                    if (day && day.personalEntries) {
                        day.personalEntries.forEach(entry => { if (!entry.category) entry.category = 'Outros'; });
                    }
                });
            }

            this.ui.monthContentContainer.innerHTML = '';
            this.constants.monthNames.forEach((_, index) => { 
                this.ui.monthContentContainer.insertAdjacentHTML('beforeend', index === 12 ? this.render.createBalanceContentHTML() : this.render.createMonthContentHTML(index)); 
            });
            
            this.showMonth(this.state.activeMonthIndex);
            this.render.updateHeader();

        } catch (error) { 
            console.error("Erro crítico ao carregar dados:", error); 
        } finally {
            if (loadingOverlay) loadingOverlay.classList.add('hidden');
        }
    },

    handleRecurringDeletion(recurringId, startingMonthIndex = 0) {
        for (let i = startingMonthIndex; i < 12; i++) {
            const monthData = this.state.monthlyData[i];
            if (!monthData) continue;
            monthData.pjEntries = monthData.pjEntries.filter(entry => entry.recurringId !== recurringId);
            monthData.pfEntries = monthData.pfEntries.filter(entry => entry.recurringId !== recurringId);
            monthData.expenses.forEach(day => {
                if (day.personalEntries) { day.personalEntries = day.personalEntries.filter(entry => entry.recurringId !== recurringId); }
                if (day.businessEntries) { day.businessEntries = day.businessEntries.filter(entry => entry.recurringId !== recurringId); }
            });
        }
    },

    showMonth(monthIndex) {
        if (this.state.activeMonthIndex !== monthIndex && this.state.saveTimeout) {
            clearTimeout(this.state.saveTimeout);
            this.saveDataToFirestore();
            this.state.saveTimeout = null;
        }
        if (monthIndex >= 0 && monthIndex <= 11) {
            this.state.lastViewedMonthIndex = monthIndex;
        }
        this.state.activeMonthIndex = monthIndex;
        Object.values(this.state.chartInstances).forEach(c => c?.destroy());
        
        const allContents = document.querySelectorAll('.month-content');
        allContents.forEach(c => c.classList.remove('active'));
        
        if (monthIndex < 12) { this.applyRecurringEntries(monthIndex); }
        
        const contentEl = document.getElementById(`month-${monthIndex}-content`);
        if (contentEl) {
            contentEl.classList.add('active');
            if (monthIndex < 12) {
                this.render.renderCalendarView(monthIndex);
                this.render.renderPJEntries(monthIndex);
                this.render.renderPFEntries(monthIndex);
                this.render.renderExpenseTable(monthIndex);
                this.recalculateAndDisplayTotals(monthIndex);
            } else {
                this.render.renderBalanceSummary();
            }
        }
    },

    recalculateAndDisplayTotals(m) {
        const d = this.state.monthlyData[m];
        if (!d) return;
        const t = {
            pj: d.pjEntries.reduce((s, e) => s + e.amount, 0),
            pf: d.pfEntries.reduce((s, e) => s + e.amount, 0),
            personal: d.expenses.flat().reduce((a, day) => a + day.personalEntries.reduce((s, e) => s + e.amount, 0), 0),
            business: d.expenses.flat().reduce((a, day) => a + day.businessEntries.reduce((s, e) => s + e.amount, 0), 0)
        };
        t.remainingPersonal = t.pf - t.personal;
        t.remainingBusiness = t.pj - t.business;
        t.remainingTotal = (t.pj + t.pf) - (t.personal + t.business);
        
        const setTxt = (id, val, color) => {
            const el = document.getElementById(id);
            if(el) {
                el.textContent = this.helpers.formatCurrency(val);
                if(color) el.style.color = color;
            }
        };

        setTxt(`companyCash-${m}`, t.pj);
        setTxt(`personalCash-${m}`, t.pf);
        setTxt(`totalPersonalExpenses-${m}`, t.personal);
        setTxt(`totalBusinessExpenses-${m}`, t.business);
        setTxt(`remainingPersonal-${m}`, t.remainingPersonal, t.remainingPersonal < 0 ? 'var(--red-color)' : 'var(--green-color)');
        setTxt(`remainingBusiness-${m}`, t.remainingBusiness, t.remainingBusiness < 0 ? 'var(--red-color)' : 'var(--green-color)');
        setTxt(`remainingTotal-${m}`, t.remainingTotal, t.remainingTotal < 0 ? 'var(--red-color)' : 'var(--primary-color)');
        
        this.render.updateBudgetAlerts(m);
        this.render.updateAllCharts(m, { totalPersonal: t.personal, totalBusiness: t.business, remainingBudget: t.remainingTotal });
    },

    applyRecurringEntries(monthIndex) {
        if (!this.state.monthlyData[monthIndex]) return;
        let wasModified = false;
        const appliedRecurringIds = new Set();
        const month = this.state.monthlyData[monthIndex];
        
        month.pfEntries.forEach(e => { if (e.recurringId) appliedRecurringIds.add(e.recurringId); });
        month.pjEntries.forEach(e => { if (e.recurringId) appliedRecurringIds.add(e.recurringId); });
        month.expenses.forEach(day => {
            day.personalEntries.forEach(e => { if (e.recurringId) appliedRecurringIds.add(e.recurringId); });
            day.businessEntries.forEach(e => { if (e.recurringId) appliedRecurringIds.add(e.recurringId); });
        });

        const currentYear = new Date().getFullYear();
        const daysInCurrentMonth = new Date(currentYear, monthIndex + 1, 0).getDate();

        this.state.recurringEntries.forEach(r => {
            if (r.id && !appliedRecurringIds.has(r.id)) {
                const effectiveDay = Math.min(r.dayOfMonth, daysInCurrentMonth);
                const dayIndex = effectiveDay - 1;
                if (dayIndex < 0 || dayIndex >= daysInCurrentMonth) return;
                
                const newEntry = {
                    id: Date.now() + Math.random(),
                    description: r.description || 'Lançamento recorrente',
                    amount: r.amount,
                    isRecurring: true,
                    recurringId: r.id
                };

                if (r.type === "Ganho PF") {
                    month.pfEntries.push(newEntry);
                    wasModified = true;
                } else if (r.type === "Ganho PJ") {
                    month.pjEntries.push(newEntry);
                    wasModified = true;
                } else if (r.type === "Gasto Pessoal") {
                    Object.assign(newEntry, { category: r.category, paymentMethod: r.paymentMethod, card: r.card });
                    month.expenses[dayIndex].personalEntries.push(newEntry);
                    wasModified = true;
                } else if (r.type === "Gasto Empresa") {
                    Object.assign(newEntry, { category: 'N/A', paymentMethod: r.paymentMethod, card: r.card });
                    month.expenses[dayIndex].businessEntries.push(newEntry);
                    wasModified = true;
                }
            }
        });
        if (wasModified) {
            this.saveDataToFirestore();
        }
    },

    exportMonthToCSV(monthIndex) {
        const monthData = this.state.monthlyData[monthIndex];
        if (!monthData) { return; }
        const monthName = this.constants.monthNames[monthIndex];
        
        const pjTotal = monthData.pjEntries.reduce((s, e) => s + e.amount, 0);
        const pfTotal = monthData.pfEntries.reduce((s, e) => s + e.amount, 0);
        const personalTotal = monthData.expenses.flat().reduce((a, day) => a + day.personalEntries.reduce((s, e) => s + e.amount, 0), 0);
        const businessTotal = monthData.expenses.flat().reduce((a, day) => a + day.businessEntries.reduce((s, e) => s + e.amount, 0), 0);
        const totalGains = pjTotal + pfTotal;
        const totalExpenses = personalTotal + businessTotal;
        const balance = totalGains - totalExpenses;

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += `Relatorio Financeiro - ${monthName}\r\n\r\n`;
        csvContent += "Resumo do Mes\r\n";
        csvContent += `Total de Ganhos;${totalGains.toFixed(2).replace('.', ',')}\r\n`;
        csvContent += `Total de Gastos;${totalExpenses.toFixed(2).replace('.', ',')}\r\n`;
        csvContent += `Saldo Final;${balance.toFixed(2).replace('.', ',')}\r\n\r\n`;
        csvContent += "Detalhes das Transacoes\r\n";
        csvContent += "Tipo;Dia;Descricao;Valor;Categoria;Metodo de Pagamento;Cartao\r\n";
        
        const sanitize = (str) => `"${(str || '').replace(/"/g, '""')}"`;
        
        monthData.pjEntries.forEach(e => csvContent += `Ganho PJ;;${sanitize(e.description)};${e.amount.toFixed(2).replace('.', ',')};;;\r\n`);
        monthData.pfEntries.forEach(e => csvContent += `Ganho PF;;${sanitize(e.description)};${e.amount.toFixed(2).replace('.', ',')};;;\r\n`);
        
        monthData.expenses.forEach((dayData, dayIndex) => {
            const processEntries = (entries, type) => {
                entries.forEach(e => { 
                    let row = [type, dayIndex + 1, sanitize(e.description), e.amount.toFixed(2).replace('.', ','), sanitize(e.category), sanitize(e.paymentMethod), sanitize(e.card)].join(';'); 
                    csvContent += row + "\r\n"; 
                });
            };
            processEntries(dayData.personalEntries, 'Gasto Pessoal');
            processEntries(dayData.businessEntries, 'Gasto Empresa');
        });

        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `relatorio_${monthName}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    exportMonthToPDF(monthIndex) {
        const monthData = this.state.monthlyData[monthIndex];
        if (!monthData) return;
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const monthName = this.constants.monthNames[monthIndex];
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;

        const addWatermark = (doc) => {
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.05 }));
            doc.setFontSize(40);
            doc.setTextColor(200, 200, 200);
            doc.setFont('helvetica', 'bold');
            doc.text("Rico Plus by Franzoi Tech", pageWidth / 2, pageHeight / 1.8, { angle: -45, align: 'center' });
            doc.restoreGraphicsState();
        };

        const addHeaderAndFooter = (data) => {
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            doc.text("Relatório Financeiro", 14, 20);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Período: ${monthName}`, 14, 26);
            doc.setLineWidth(0.5);
            doc.line(14, 30, pageWidth - 14, 30);
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.text(`Rico Plus by Franzoi Tech | Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pageHeight - 10);
            doc.text(`Página ${data.pageNumber} de ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
        };

        const pjTotal = monthData.pjEntries.reduce((s, e) => s + e.amount, 0);
        const pfTotal = monthData.pfEntries.reduce((s, e) => s + e.amount, 0);
        const personalTotal = monthData.expenses.flat().reduce((a, day) => a + day.personalEntries.reduce((s, e) => s + e.amount, 0), 0);
        const businessTotal = monthData.expenses.flat().reduce((a, day) => a + day.businessEntries.reduce((s, e) => s + e.amount, 0), 0);
        const balance = (pjTotal + pfTotal) - (personalTotal + businessTotal);
        
        const expensesByCategory = {};
        monthData.expenses.flat().forEach(day => { day.personalEntries.forEach(entry => { expensesByCategory[entry.category] = (expensesByCategory[entry.category] || 0) + entry.amount; }); });
        const categoryBody = Object.keys(expensesByCategory).map(cat => [cat, this.helpers.formatCurrency(expensesByCategory[cat])]);
        
        const transactionsBody = [];
        monthData.pjEntries.forEach(e => transactionsBody.push(['-', 'Ganho PJ', e.description, '-', '-', e.amount.toFixed(2).replace('.', ',')]));
        monthData.pfEntries.forEach(e => transactionsBody.push(['-', 'Ganho PF', e.description, '-', '-', e.amount.toFixed(2).replace('.', ',')]));
        monthData.expenses.forEach((dayData, dayIndex) => {
            dayData.personalEntries.forEach(e => transactionsBody.push([dayIndex + 1, 'Gasto Pessoal', e.description, e.category, `${e.paymentMethod}${e.card ? ` (${e.card})` : ''}`, e.amount.toFixed(2).replace('.', ',')]));
            dayData.businessEntries.forEach(e => transactionsBody.push([dayIndex + 1, 'Gasto Empresa', e.description, '-', `${e.paymentMethod}${e.card ? ` (${e.card})` : ''}`, e.amount.toFixed(2).replace('.', ',')]));
        });

        let finalY = 40;
        doc.autoTable({ startY: finalY, head: [['Resumo Geral', 'Valor']], body: [['Total Ganhos', this.helpers.formatCurrency(pjTotal + pfTotal)], ['Total Gastos', this.helpers.formatCurrency(personalTotal + businessTotal)], [{ content: 'Saldo Final', styles: { fontStyle: 'bold' } }, { content: this.helpers.formatCurrency(balance), styles: { fontStyle: 'bold' } }]], theme: 'grid', headStyles: { fillColor: [22, 160, 133] } });
        finalY = doc.lastAutoTable.finalY + 10;
        if (categoryBody.length > 0) { doc.autoTable({ startY: finalY, head: [['Gastos por Categoria (Pessoal)', 'Total']], body: categoryBody, theme: 'striped', headStyles: { fillColor: [41, 128, 185] } }); finalY = doc.lastAutoTable.finalY + 10; }
        doc.autoTable({ startY: finalY, head: [['Data', 'Tipo', 'Descrição', 'Cat.', 'Pag.', 'Valor (R$)']], body: transactionsBody, theme: 'grid', didDrawPage: (data) => { addWatermark(doc); addHeaderAndFooter(data); }, headStyles: { fillColor: [44, 62, 80] }, margin: { top: 38, bottom: 20 } });
        
        const pageCountFinal = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCountFinal; i++) { doc.setPage(i); addWatermark(doc); addHeaderAndFooter({ pageNumber: i, pageCount: pageCountFinal }); }
        doc.save(`relatorio_${monthName}.pdf`);
    },

    bindGlobalEventListeners() {
        this.debouncedSave = this.helpers.debounce(this.saveDataToFirestore, 750);
        
        const chatbotModal = document.getElementById('chatbot-modal');
        const chatbotModalContent = chatbotModal ? chatbotModal.querySelector('.modal-content') : null;
        
        if (chatbotModal) {
            const toggleChatbot = () => {
                document.body.classList.add('modal-open');
                chatbotModal.classList.remove('hidden');
                setTimeout(() => {
                    chatbotModal.style.opacity = '1';
                    if(chatbotModalContent) chatbotModalContent.style.transform = 'translateY(0)';
                }, 10);
            };
            const closeChatbot = () => {
                document.body.classList.remove('modal-open');
                chatbotModal.style.opacity = '0';
                if(chatbotModalContent) chatbotModalContent.style.transform = 'translateY(2rem)';
                setTimeout(() => { chatbotModal.classList.add('hidden'); }, 300);
            };

            document.getElementById('floating-chatbot-btn')?.addEventListener('click', toggleChatbot);
            document.getElementById('close-chatbot-modal-btn')?.addEventListener('click', closeChatbot);
            
            const sendBtn = document.getElementById('chatbot-send-btn');
            const chatInput = document.getElementById('chatbot-input');
            
            if(sendBtn && chatInput) {
                const sendMessage = () => {
                    const messagesContainer = document.getElementById('chatbot-messages');
                    const userMessage = chatInput.value.trim();
                    if (userMessage) {
                        messagesContainer.innerHTML += `<div class="flex justify-end"><div class="p-3 rounded-lg max-w-[85%] text-sm text-white" style="background-color: var(--primary-color);"><p class="font-bold mb-1">Você</p><p>${userMessage}</p></div></div>`;
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        setTimeout(() => {
                            messagesContainer.innerHTML += `<div class="p-3 rounded-lg max-w-[85%] text-sm" style="background-color: var(--secondary-bg);"><p class="font-bold mb-1">Assistente</p><p class="italic">Pensando...</p></div>`;
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                            App.ai.getChatbotResponse(userMessage);
                        }, 500);
                        chatInput.value = '';
                    }
                };
                sendBtn.addEventListener('click', sendMessage);
                chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } });
            }
        }
        
        const avatarInput = document.getElementById('avatar-upload-input');
        if(avatarInput) avatarInput.addEventListener('change', this.handleAvatarUpload.bind(this));
        
        if(themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                const newTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
                localStorage.setItem('theme', newTheme);
                applyTheme(newTheme);
            });
        }
        
        const actionMenuBtn = document.getElementById('action-menu-btn');
        const actionMenuDropdown = document.getElementById('action-menu-dropdown');
        if (actionMenuBtn && actionMenuDropdown) {
            actionMenuBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                actionMenuDropdown.classList.toggle('is-closed');
            });
            document.addEventListener('click', () => {
                if (!actionMenuDropdown.classList.contains('is-closed')) {
                    actionMenuDropdown.classList.add('is-closed');
                }
            });
        }
        
        document.getElementById('manage-settings-btn')?.addEventListener('click', (event) => {
            event.preventDefault();
            document.body.classList.add('modal-open');
            App.render.renderSettingsModal();
        });

        document.getElementById('logout-btn')?.addEventListener('click', (event) => {
            event.preventDefault();
            signOut(auth).then(() => { console.log("Logout success"); }).catch(console.error);
        });

        document.getElementById('close-modal-btn')?.addEventListener('click', () => {
            document.body.classList.remove('modal-open');
            App.ui.settingsModal.classList.add('hidden');
        });
        
        document.getElementById('close-account-modal-btn')?.addEventListener('click', () => {
            document.body.classList.remove('modal-open');
            App.ui.accountModal.classList.add('hidden');
        });
        
        document.getElementById('close-ai-modal-btn')?.addEventListener('click', () => { 
            App.ui.aiAnalysisModal.classList.add('hidden'); 
        });

        document.getElementById('manage-account-btn')?.addEventListener('click', (event) => {
            event.preventDefault();
            document.body.classList.add('modal-open');
            App.render.renderAccountModal();
        });

        document.getElementById('save-profile-btn')?.addEventListener('click', () => {
            App.state.profile.name = App.ui.userNameInput.value;
            App.saveDataToFirestore();
            App.ui.accountModal.classList.add('hidden');
            document.body.classList.remove('modal-open');
            App.helpers.showSaveFeedback();
            App.render.updateHeader();
        });

        document.getElementById('add-card-btn')?.addEventListener('click', () => { 
            const n = App.ui.newCardNameInput.value.trim(); 
            if (n && !App.state.creditCards.includes(n)) { 
                App.state.creditCards.push(n); 
                App.ui.newCardNameInput.value = ''; 
                App.render.renderCardList(); 
                App.saveDataToFirestore(); 
            } 
        });
        
        document.getElementById('add-category-btn')?.addEventListener('click', () => {
            const newName = App.ui.newCategoryNameInput.value.trim();
            const normalizedNewName = newName.toLowerCase();
            if (newName && !App.state.categories.some(c => c.name.toLowerCase() === normalizedNewName)) {
                App.state.categories.push({ name: newName, budget: 0 });
                App.ui.newCategoryNameInput.value = '';
                App.render.renderCategoryList();
                App.saveDataToFirestore();
            } else if (newName) {
                alert('Já existe uma categoria com este nome.');
            }
        });

        const recType = document.getElementById('recurring-type');
        if(recType) recType.addEventListener('change', (e) => { document.getElementById('recurring-expense-fields').classList.toggle('hidden', !e.target.value.includes('Gasto')); });
        
        const recPayment = document.getElementById('recurring-payment');
        if(recPayment) recPayment.addEventListener('change', (e) => { document.getElementById('recurring-card').classList.toggle('hidden', e.target.value !== 'Crédito'); });
        
        document.getElementById('add-recurring-btn')?.addEventListener('click', () => { 
            const desc = document.getElementById('recurring-desc').value;
            const amt = parseFloat(document.getElementById('recurring-amount').value) || 0;
            const day = parseInt(document.getElementById('recurring-day').value) || 1;
            const type = document.getElementById('recurring-type').value;
            
            if (!desc || amt <= 0) { alert('Preencha descrição e valor.'); return; } 
            
            const newRec = { id: Date.now(), description: desc, amount: amt, dayOfMonth: day, type: type };
            
            if (type.includes('Gasto')) { 
                newRec.category = document.getElementById('recurring-category').value; 
                newRec.paymentMethod = document.getElementById('recurring-payment').value; 
                newRec.card = newRec.paymentMethod === 'Crédito' ? document.getElementById('recurring-card').value : ''; 
            } 
            
            App.state.recurringEntries.push(newRec); 
            App.render.renderRecurringList(); 
            App.saveDataToFirestore(); 
            document.getElementById('recurring-form').querySelectorAll('input, select').forEach(el => el.value = ''); 
        });
        
        document.body.addEventListener('click', (event) => {
            const t = event.target;
            
            const settingsAccordionTrigger = t.closest('.settings-accordion-trigger');
            if (settingsAccordionTrigger) {
                const parentItem = settingsAccordionTrigger.parentElement;
                parentItem.classList.toggle('active');
                return;
            }

            const navBtn = t.closest('.calendar-nav-btn, [data-action="show-annual"]');
            if (navBtn) {
                const action = navBtn.dataset.action;
                const currentMonth = App.state.activeMonthIndex;
                if (action === 'show-annual') { App.state.lastViewedMonthIndex = currentMonth; App.showMonth(12); } 
                else if (action === 'prev-month') { const prevMonth = (currentMonth - 1 + 12) % 12; App.showMonth(prevMonth); } 
                else if (action === 'next-month') { const nextMonth = (currentMonth + 1) % 12; App.showMonth(nextMonth); }
                return;
            }
            
            const dayCell = t.closest('.calendar-day.current-month');
            if (dayCell) {
                const dayIndex = parseInt(dayCell.dataset.day);
                const monthIndex = App.state.activeMonthIndex;
                const allAccordions = document.querySelectorAll(`#expense-accordion-container-${monthIndex} .accordion-item`);
                const accordionToToggle = allAccordions[dayIndex];
                const wasActive = dayCell.classList.contains('active');
                
                document.querySelectorAll(`#calendar-container-${monthIndex} .calendar-day.active`).forEach(el => el.classList.remove('active'));
                allAccordions.forEach(item => item.classList.remove('active'));
                
                if (!wasActive) {
                    dayCell.classList.add('active');
                    if (accordionToToggle) {
                        accordionToToggle.classList.add('active');
                        setTimeout(() => {
                            accordionToToggle.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                    }
                }
            }

            if (t.matches('.tab-button')) this.showMonth(parseInt(t.dataset.monthIndex));
            if (t.matches('.export-csv-btn')) this.exportMonthToCSV(parseInt(t.dataset.monthIndex));
            if (t.matches('.export-pdf-btn')) this.exportMonthToPDF(parseInt(t.dataset.monthIndex));
            
            if (t.closest('.accordion-trigger') && !t.closest('.settings-accordion-trigger')) {
                const trigger = t.closest('.accordion-trigger');
                const parentItem = trigger.parentElement;
                if (parentItem.classList.contains('active')) {
                    parentItem.classList.remove('active');
                } else {
                    parentItem.classList.add('active');
                }
            }

            if (t.closest('.ai-analysis-btn')) this.ai.getFinancialAnalysis(parseInt(t.closest('.ai-analysis-btn').dataset.monthIndex));
            if (t.matches('#ai-annual-analysis-btn')) this.ai.getAnnualFinancialAnalysis();
            if (t.closest('.suggest-category-btn')) {
                const btn = t.closest('.suggest-category-btn');
                const el = btn.closest('.expense-entry-row');
                if (el) {
                    const entryId = el.querySelector('.remove-btn').dataset.entryId;
                    const descriptionInput = el.querySelector('[data-field="description"]');
                    if (descriptionInput && descriptionInput.value) {
                        this.ai.getCategorySuggestion(descriptionInput.value, entryId, btn);
                    }
                }
            }

            if (t.matches('.add-entry-btn')) {
                const { monthIndex, type, day, category } = t.dataset;
                const month = parseInt(monthIndex);
                const entries = (type === 'pj') ? this.state.monthlyData[month].pjEntries : (type === 'pf') ? this.state.monthlyData[month].pfEntries : this.state.monthlyData[month].expenses[parseInt(day)][`${category}Entries`];
                if (type === 'pj' || type === 'pf') {
                    const newEntry = { id: Date.now(), description: '', amount: 0 };
                    entries.push(newEntry);
                    document.getElementById(`${type}-entries-container-${month}`).appendChild(this.render.createEntryElement({ monthIndex: month, entry: newEntry, type: type }));
                } else if (type === 'expense') {
                    const n = { id: Date.now(), description: '', amount: 0, paymentMethod: 'Pix', card: this.state.creditCards.length > 0 ? this.state.creditCards[0] : '', category: this.state.categories[0].name };
                    entries.push(n);
                    document.getElementById(`${category}-entries-${month}-${day}`).appendChild(this.render.createEntryElement({ monthIndex: month, dayIndex: parseInt(day), category, entry: n, type: 'expense' }));
                }
                this.recalculateAndDisplayTotals(month);
                this.saveDataToFirestore();
            }
            if (t.matches('.remove-btn')) {
                const { monthIndex, type, day, category, entryId } = t.dataset;
                const month = parseInt(monthIndex);
                const id = parseFloat(entryId);
                if (type === 'pj') { this.state.monthlyData[month].pjEntries = this.state.monthlyData[month].pjEntries.filter(e => e.id !== id); }
                else if (type === 'pf') { this.state.monthlyData[month].pfEntries = this.state.monthlyData[month].pfEntries.filter(e => e.id !== id); }
                else { this.state.monthlyData[month].expenses[parseInt(day)][`${category}Entries`] = this.state.monthlyData[month].expenses[parseInt(day)][`${category}Entries`].filter(e => e.id !== id); }
                t.closest('.expense-entry-row').remove();
                this.recalculateAndDisplayTotals(month);
                this.saveDataToFirestore();
            }

            if (t.matches('.remove-card-btn')) {
                const cardNameToRemove = t.dataset.cardName;
                this.state.creditCards = this.state.creditCards.filter(c => c !== cardNameToRemove);
                this.render.renderCardList();
                this.saveDataToFirestore();
            }
            if (t.matches('.remove-category-btn')) {
                const categoryNameToRemove = t.dataset.categoryName;
                this.state.categories = this.state.categories.filter(c => c.name !== categoryNameToRemove);
                this.render.renderCategoryList();
                this.saveDataToFirestore();
            }
            if (t.matches('.remove-recurring-btn')) {
                const index = parseInt(t.dataset.index);
                const entryToDelete = App.state.recurringEntries[index];
                if (entryToDelete && entryToDelete.id) {
                    const modal = document.getElementById('confirm-recurring-delete-modal');
                    modal.dataset.recurringId = entryToDelete.id;
                    modal.dataset.recurringIndex = index;
                    const futureBtn = document.getElementById('delete-future-recurring-btn');
                    const activeMonthName = App.constants.monthNames[App.state.activeMonthIndex];
                    futureBtn.textContent = `Remover de ${activeMonthName} em diante`;
                    modal.classList.remove('hidden');
                }
            }
            if (t.matches('[data-action="back-to-months"]')) {
                const lastMonth = App.state.lastViewedMonthIndex;
                if (typeof lastMonth === 'number') { App.showMonth(lastMonth); }
                else { App.showMonth(new Date().getMonth()); }
            }
        });

        document.body.addEventListener('input', (event) => {
            const t = event.target;
            if (t.matches('.entry-input')) {
                const el = t.closest('.expense-entry-row');
                const btn = el.querySelector('.remove-btn');
                if (!btn) return;
                const { monthIndex, type, day, category, entryId } = btn.dataset;
                const month = parseInt(monthIndex);
                const id = parseFloat(entryId);
                let entry;
                if (type === 'pj') { entry = this.state.monthlyData[month].pjEntries.find(e => e.id === id); } 
                else if (type === 'pf') { entry = this.state.monthlyData[month].pfEntries.find(e => e.id === id); } 
                else { entry = this.state.monthlyData[month].expenses[parseInt(day)][`${category}Entries`].find(e => e.id === id); }
                
                if (entry) { 
                    const field = t.dataset.field; 
                    if (field === 'amount') { entry.amount = parseFloat(t.value) || 0; } else { entry[field] = t.value; } 
                    if (field === 'paymentMethod') { this.showMonth(month); } else { this.recalculateAndDisplayTotals(month); } 
                    this.debouncedSave(); 
                }
            }
            if (t.matches('.category-budget-input')) { const cat = this.state.categories.find(c => c.name === t.dataset.categoryName); if (cat) { cat.budget = parseFloat(t.value) || 0; this.debouncedSave(); } }
        });
        
        document.body.addEventListener('change', (event) => {
            const t = event.target;
            if (t.matches('.category-name-input')) {
                const oldName = t.dataset.oldName;
                const newName = t.value.trim();
                const normalizedNewName = newName.toLowerCase();
                const normalizedOldName = oldName.toLowerCase();
                const categoryExists = this.state.categories.some(c => c.name.toLowerCase() === normalizedNewName);
                if (newName && normalizedOldName !== normalizedNewName && !categoryExists) {
                    for (let i = 0; i < 12; i++) {
                        this.state.monthlyData[i].expenses.forEach(day => {
                            day.personalEntries.forEach(entry => {
                                if (entry.category.toLowerCase() === normalizedOldName) entry.category = newName;
                            });
                        });
                    }
                    const cat = this.state.categories.find(c => c.name.toLowerCase() === normalizedOldName);
                    if (cat) cat.name = newName;
                    t.dataset.oldName = newName;
                    this.state.recurringEntries.forEach(r => {
                        if (r.category.toLowerCase() === normalizedOldName) r.category = newName;
                    });
                    this.saveDataToFirestore();
                } else if (categoryExists && normalizedOldName !== normalizedNewName) {
                    alert('Já existe uma categoria com este nome.');
                    t.value = oldName;
                }
            }
        });

        const confirmModal = document.getElementById('confirm-recurring-delete-modal');
        document.getElementById('delete-all-recurring-btn')?.addEventListener('click', () => {
            const id = parseFloat(confirmModal.dataset.recurringId);
            const index = parseInt(confirmModal.dataset.recurringIndex);
            App.handleRecurringDeletion(id, 0);
            App.state.recurringEntries.splice(index, 1);
            App.render.renderRecurringList();
            App.showMonth(App.state.activeMonthIndex);
            App.saveDataToFirestore();
            confirmModal.classList.add('hidden');
        });
        document.getElementById('delete-future-recurring-btn')?.addEventListener('click', () => {
            const id = parseFloat(confirmModal.dataset.recurringId);
            const index = parseInt(confirmModal.dataset.recurringIndex);
            App.handleRecurringDeletion(id, App.state.activeMonthIndex);
            App.state.recurringEntries.splice(index, 1);
            App.render.renderRecurringList();
            App.showMonth(App.state.activeMonthIndex);
            App.saveDataToFirestore();
            confirmModal.classList.add('hidden');
        });
        document.getElementById('cancel-delete-recurring-btn')?.addEventListener('click', () => {
            confirmModal.classList.add('hidden');
        });
    },

    // ==========================================================================
    // RENDERIZAÇÃO (VISUAL MODERNO - IPHONE STYLE)
    // ==========================================================================
    render: {
        updateHeader: function() {
            const name = App.state.profile.name?.split(' ')[0] || 'Visitante';
            document.getElementById('greeting-text').textContent = `Olá, ${name}`;
            const hour = new Date().getHours();
            let greeting = 'Boa tarde!';
            if (hour >= 5 && hour < 12) { greeting = 'Bom dia!'; }
            else if (hour >= 18 || hour < 5) { greeting = 'Boa noite!'; }
            document.getElementById('time-greeting').textContent = greeting;
            const avatarUrl = App.state.profile.avatarUrl || 'https://raw.githubusercontent.com/franzoieric-art/controledegastos.franzoitech/main/ricoplus-landing-page/images/default-avatar.svg';
            document.getElementById('user-avatar').src = avatarUrl;
        },
        renderCalendarView: function(monthIndex) {
            const container = document.getElementById(`calendar-container-${monthIndex}`);
            if (!container) return;
            const year = new Date().getFullYear();
            const firstDay = new Date(year, monthIndex, 1);
            const lastDay = new Date(year, monthIndex + 1, 0);
            const startingDayOfWeek = firstDay.getDay();
            const monthName = App.constants.monthNames[monthIndex];
            let headerHTML = `<div class="calendar-nav-header flex items-center justify-between mb-6 p-1.5 rounded-2xl bg-[var(--secondary-bg)]"><button class="calendar-nav-btn w-10 h-10 rounded-xl hover:bg-white/50 transition-colors" data-action="prev-month">‹</button><div class="flex items-center gap-3"><h3 class="text-base font-semibold text-[var(--text-color)]">${monthName} ${year}</h3><button class="px-3 py-1 text-xs font-semibold rounded-lg bg-[var(--card-bg)] shadow-sm border border-[var(--border-color)]" data-action="show-annual">Anual</button></div><button class="calendar-nav-btn w-10 h-10 rounded-xl hover:bg-white/50 transition-colors" data-action="next-month">›</button></div>`;
            let gridHTML = '<div class="calendar-grid">';
            ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach(day => { gridHTML += `<div class="calendar-header text-xs uppercase tracking-wide opacity-60">${day}</div>`; });
            for (let i = 0; i < startingDayOfWeek; i++) { gridHTML += '<div></div>'; }
            for (let day = 1; day <= lastDay.getDate(); day++) {
                const dayData = App.state.monthlyData[monthIndex].expenses[day - 1];
                let classes = 'calendar-day current-month';
                if (dayData && (dayData.personalEntries.length > 0 || dayData.businessEntries.length > 0)) { classes += ' has-entries'; }
                gridHTML += `<div class="${classes}" data-day="${day - 1}">${day}</div>`;
            }
            gridHTML += '</div>';
            container.innerHTML = headerHTML + gridHTML;
        },
        createMonthContentHTML: function(monthIndex) {
            return `<div id="month-${monthIndex}-content" class="month-content"><div class="flex justify-end gap-2 mb-6"><button class="export-csv-btn px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border-color)] hover:bg-[var(--secondary-bg)] transition-colors" data-month-index="${monthIndex}">CSV</button><button class="export-pdf-btn px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--border-color)] hover:bg-[var(--secondary-bg)] transition-colors" data-month-index="${monthIndex}">PDF</button></div><div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"><div class="lg:col-span-1 p-6 rounded-3xl card border-l-4 border-yellow-400 bg-gradient-to-br from-white to-yellow-50/50 dark:from-[var(--card-bg)] dark:to-[var(--card-bg)]"><h2 class="text-lg font-bold mb-4 flex items-center gap-2">💼 Jurídica</h2><div id="pj-entries-container-${monthIndex}" class="flex flex-col gap-3 mb-4"></div><button class="add-entry-btn w-full py-2.5 text-sm font-semibold rounded-xl bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors" data-month-index="${monthIndex}" data-type="pj">+ Adicionar Ganho</button></div><div class="lg:col-span-1 p-6 rounded-3xl card border-l-4 border-green-400 bg-gradient-to-br from-white to-green-50/50 dark:from-[var(--card-bg)] dark:to-[var(--card-bg)]"><h2 class="text-lg font-bold mb-4 flex items-center gap-2">👤 Física</h2><div id="pf-entries-container-${monthIndex}" class="flex flex-col gap-3 mb-4"></div><button class="add-entry-btn w-full py-2.5 text-sm font-semibold rounded-xl bg-green-100 text-green-700 hover:bg-green-200 transition-colors" data-month-index="${monthIndex}" data-type="pf">+ Adicionar Ganho</button></div><div class="lg:col-span-1 grid gap-6"><div><div class="p-6 rounded-3xl card border-l-4 border-blue-400 space-y-4"><div class="flex justify-between items-end border-b border-dashed border-gray-200 pb-3"><div><label class="block text-xs font-medium uppercase tracking-wider opacity-60">Caixa Empresa</label><p id="companyCash-${monthIndex}" class="text-2xl font-bold mt-1">R$ 0,00</p></div></div><div class="flex justify-between items-end"><div><label class="block text-xs font-medium uppercase tracking-wider opacity-60">Caixa Pessoal</label><p id="personalCash-${monthIndex}" class="text-2xl font-bold mt-1">R$ 0,00</p></div></div></div></div><div><div id="summary-card-${monthIndex}" class="p-6 rounded-3xl card border-l-4 border-purple-400"><h2 class="text-lg font-bold mb-4">Resumo</h2><div class="space-y-3 text-sm"><div class="flex justify-between items-center"><span>Gastos Pessoais</span><span id="totalPersonalExpenses-${monthIndex}" class="font-semibold text-red-500">R$ 0,00</span></div><div class="flex justify-between items-center"><span>Gastos Empresa</span><span id="totalBusinessExpenses-${monthIndex}" class="font-semibold text-red-500">R$ 0,00</span></div><div class="h-px bg-[var(--border-color)] my-2"></div><div class="flex justify-between items-center"><span class="opacity-80">Sobrou (Pessoal)</span><span id="remainingPersonal-${monthIndex}" class="font-bold">R$ 0,00</span></div><div class="flex justify-between items-center"><span class="opacity-80">Sobrou (Empresa)</span><span id="remainingBusiness-${monthIndex}" class="font-bold">R$ 0,00</span></div><div class="p-3 mt-2 rounded-xl bg-[var(--secondary-bg)] flex justify-between items-center"><span class="font-bold">Saldo Total</span><span id="remainingTotal-${monthIndex}" class="text-lg font-extrabold">R$ 0,00</span></div></div><div id="budget-alerts-${monthIndex}" class="mt-4 text-xs bg-red-50 text-red-600 p-3 rounded-lg hidden:empty"></div></div></div></div></div><div class="text-center mb-8"><button class="ai-analysis-btn group px-6 py-3 text-white font-semibold rounded-full shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105 flex items-center justify-center gap-2 mx-auto bg-gradient-to-r from-indigo-500 to-purple-600" data-month-index="${monthIndex}"><span>✨ Analisar Mês com IA</span></button></div><div id="calendar-container-${monthIndex}" class="mb-8"></div><div id="expense-section-wrapper-${monthIndex}" class=""><div id="expense-accordion-container-${monthIndex}" class="space-y-3 mb-8"></div></div><div class="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-8"><div class="card p-6 rounded-3xl"><h2 class="text-lg font-semibold text-center mb-6">Distribuição</h2><div class="relative mx-auto" style="height: 250px;"><canvas id="budgetPieChart-${monthIndex}"></canvas></div></div><div class="card p-6 rounded-3xl"><h2 class="text-lg font-semibold text-center mb-6">Métodos de Pagamento</h2><div class="relative mx-auto" style="height: 250px;"><canvas id="paymentMethodChart-${monthIndex}"></canvas></div></div><div class="card p-6 rounded-3xl"><h2 class="text-lg font-semibold text-center mb-6">Metas vs. Realizado</h2><div class="relative mx-auto" style="height: 250px;"><canvas id="budgetGoalsChart-${monthIndex}"></canvas></div></div></div></div>` 
        },
        createBalanceContentHTML: function() { 
            return `<div id="month-12-content" class="month-content"><div class="flex items-center justify-center gap-4 mb-8"><h2 class="text-3xl font-bold">Balanço Anual</h2><button class="px-3 py-1.5 text-sm font-semibold rounded-lg" style="background-color: var(--secondary-bg); color: var(--secondary-text);" data-action="back-to-months">← Voltar</button></div><div class="text-center mb-8 -mt-4"><button id="ai-annual-analysis-btn" class="px-5 py-2 text-white font-semibold rounded-xl shadow-sm transition-colors" style="background-color: var(--primary-color);">Analisar Ano com IA ✨</button></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 text-center"><div class="card border-t-4 border-yellow-400 p-5 rounded-2xl"><span class="block text-sm muted-text mb-2">Total Ganhos PJ</span><span id="totalAnnualPJ" class="text-2xl font-semibold">R$ 0,00</span></div><div class="card border-t-4 border-green-400 p-5 rounded-2xl"><span class="block text-sm muted-text mb-2">Total Ganhos PF</span><span id="totalAnnualPF" class="text-2xl font-semibold">R$ 0,00</span></div><div class="card border-t-4 border-red-400 p-5 rounded-2xl"><span class="block text-sm muted-text mb-2">Gastos Totais</span><span id="totalAnnualExpenses" class="text-2xl font-semibold">R$ 0,00</span></div><div class="card border-t-4 border-blue-400 p-5 rounded-2xl"><span class="block text-sm muted-text mb-2">Saldo Final</span><span id="annualBalance" class="text-2xl font-bold">R$ 0,00</span><p id="annualPerformance" class="text-lg font-semibold mt-1"></p></div></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="card p-6 rounded-2xl lg:col-span-2"><h3 class="text-xl font-semibold text-center mb-4">Desempenho Mensal</h3><div class="relative mx-auto" style="height: 400px;"><canvas id="monthlyPerformanceBarChart"></canvas></div></div><div class="card p-6 rounded-2xl"><h3 class="text-xl font-semibold text-center mb-4">Maiores Gastos do Ano (Top 5)</h3><div id="top-spends-container" class="text-sm space-y-2 max-h-96 overflow-y-auto p-2"></div></div></div></div>` 
        },
        createEntryElement: function(config) {
            const { monthIndex, dayIndex, category, entry, type } = config;
            const d = document.createElement('div');
            d.classList.add('group', 'flex', 'items-center', 'gap-3', 'w-full', 'p-2', 'rounded-xl', 'hover:bg-[var(--secondary-bg)]', 'transition-colors', 'expense-entry-row');
            let r = '', p = '', c = '', s = '', aiBtn = '';
            
            const removeBtn = (dataAttrs) => `<button class="remove-btn w-8 h-8 rounded-full bg-transparent hover:bg-red-100 text-gray-400 hover:text-red-500 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100" ${dataAttrs}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" /></svg></button>`;

            if (type === 'expense') {
                r = removeBtn(`data-type="expense" data-month-index="${monthIndex}" data-day="${dayIndex}" data-category="${category}" data-entry-id="${entry.id}"`);
                p = `<select class="entry-input bg-transparent text-xs font-medium text-[var(--muted-text)] outline-none cursor-pointer hover:text-[var(--primary-color)]" data-field="paymentMethod" title="Método">${App.constants.basePaymentMethods.map(m => `<option value="${m}" ${entry.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
                if (entry.paymentMethod === 'Crédito') { c = `<select class="entry-input bg-transparent text-xs font-medium text-[var(--muted-text)] outline-none cursor-pointer hover:text-[var(--primary-color)] ml-2" data-field="card" title="Cartão">${App.state.creditCards.map(c => `<option value="${c}" ${entry.card === c ? 'selected' : ''}>${c}</option>`).join('')}</select>`; }
                s = `<select class="entry-input w-28 bg-[var(--input-bg)] rounded-lg px-2 py-1 text-xs border border-transparent hover:border-[var(--border-color)] outline-none" data-field="category">${App.state.categories.map(c => `<option value="${c.name}" ${entry.category === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}</select>`;
                aiBtn = `<button class="suggest-category-btn w-6 h-6 rounded-full flex items-center justify-center text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="IA: Sugerir Categoria"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 5.651a1 1 0 01-.753.87l-5.582 1.276a1 1 0 000 1.955l5.582 1.277a1 1 0 01.753.87l.683 5.65a1 1 0 001.898 0l.683-5.65a1 1 0 01.753-.87l5.582-1.277a1 1 0 000-1.955l-5.582-1.276a1 1 0 01-.753-.87l-.683-5.651z" /></svg></button>`;
            } else {
                r = removeBtn(`data-type="${type}" data-month-index="${monthIndex}" data-entry-id="${entry.id}"`);
            }
            
            const descInput = `<input type="text" value="${entry.description}" placeholder="Descrição..." class="entry-input flex-grow bg-transparent border-b border-transparent hover:border-[var(--border-color)] focus:border-[var(--primary-color)] px-1 py-1 outline-none transition-colors text-sm" data-field="description">`;
            const amountInput = `<div class="relative flex items-center"><span class="text-xs text-[var(--muted-text)] mr-1">R$</span><input type="number" value="${entry.amount}" min="0" step="0.01" placeholder="0,00" class="entry-input w-20 bg-[var(--input-bg)] rounded-lg px-2 py-1 text-sm font-semibold text-right outline-none focus:ring-2 focus:ring-[var(--primary-color)] focus:ring-opacity-20 transition-all" data-field="amount"></div>`;

            d.innerHTML = `${descInput}${amountInput}${s || ''}${aiBtn || ''}<div class="flex items-center gap-1 text-[var(--muted-text)]">${p || ''}<span class="card-selector-container">${c || ''}</span></div>${r}`;
            return d;
        },
        renderPJEntries: function(m) { const c = document.getElementById(`pj-entries-container-${m}`); if (!c) return; c.innerHTML = ''; App.state.monthlyData[m].pjEntries.forEach(e => c.appendChild(App.render.createEntryElement({ monthIndex: m, entry: e, type: 'pj' }))); },
        renderPFEntries: function(m) { const c = document.getElementById(`pf-entries-container-${m}`); if (!c) return; c.innerHTML = ''; App.state.monthlyData[m].pfEntries.forEach(e => c.appendChild(App.render.createEntryElement({ monthIndex: m, entry: e, type: 'pf' }))); },
        renderExpenseTable: function(m) { const container = document.getElementById(`expense-accordion-container-${m}`); if (!container) return; container.innerHTML = ''; for (let day = 0; day < 31; day++) { const item = document.createElement('div'); item.className = 'accordion-item card rounded-2xl overflow-hidden border border-[var(--border-color)] shadow-sm'; item.innerHTML = `<div class="accordion-trigger flex justify-between items-center p-4 cursor-pointer hover:bg-[var(--secondary-bg)] transition-colors"><div class="flex items-center gap-3"><span class="w-8 h-8 rounded-full bg-[var(--primary-color)] text-white flex items-center justify-center font-bold text-sm">${day + 1}</span><span class="font-semibold">Despesas do Dia</span></div><span class="arrow text-xl muted-text">▼</span></div><div class="accordion-content bg-[var(--bg-color)]/50"><div class="grid grid-cols-1 md:grid-cols-2 gap-6 p-2"><div><h3 class="text-xs font-bold uppercase tracking-wider muted-text mb-3 pl-2">Gastos Pessoais</h3><div id="personal-entries-${m}-${day}" class="flex flex-col gap-2"></div><button class="add-entry-btn mt-3 w-full py-2 border border-dashed border-[var(--border-color)] rounded-xl text-xs font-medium text-[var(--muted-text)] hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] transition-colors" data-month-index="${m}" data-day="${day}" data-type="expense" data-category="personal">+ Adicionar Despesa</button></div><div><h3 class="text-xs font-bold uppercase tracking-wider muted-text mb-3 pl-2">Gastos da Empresa</h3><div id="business-entries-${m}-${day}" class="flex flex-col gap-2"></div><button class="add-entry-btn mt-3 w-full py-2 border border-dashed border-[var(--border-color)] rounded-xl text-xs font-medium text-[var(--muted-text)] hover:border-[var(--primary-color)] hover:text-[var(--primary-color)] transition-colors" data-month-index="${m}" data-day="${day}" data-type="expense" data-category="business">+ Adicionar Despesa</button></div></div></div>`; container.appendChild(item); ['personal', 'business'].forEach(type => { const entriesContainer = item.querySelector(`#${type}-entries-${m}-${day}`); App.state.monthlyData[m].expenses[day][`${type}Entries`].forEach(e => entriesContainer.appendChild(App.render.createEntryElement({ monthIndex: m, dayIndex: day, category: type, entry: e, type: 'expense' }))); }); } },
        updateBudgetAlerts: function(m) { const c = document.getElementById(`budget-alerts-${m}`); if (!c) return; const expenses = App.state.categories.reduce((a, cat) => ({...a, [cat.name]: 0 }), {}); App.state.monthlyData[m].expenses.forEach(d => { d.personalEntries.forEach(e => { if (expenses[e.category] !== undefined) expenses[e.category] += e.amount; }); }); const alerts = App.state.categories.map(cat => (expenses[cat.name] > cat.budget && cat.budget > 0) ? `<li class="flex items-start gap-2"><svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg><span><b>${cat.name}</b> excedeu em <b>${App.helpers.formatCurrency(expenses[cat.name] - cat.budget)}</b></span></li>` : '').filter(Boolean); c.innerHTML = alerts.length > 0 ? `<ul class="space-y-1">${alerts.join('')}</ul>` : ''; c.classList.toggle('hidden', alerts.length === 0); },
        updateAllCharts: function(m, totals) {
            const chartTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color');
            const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color');
            const options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: chartTextColor, font: { family: 'Inter' } } } } };
            const barOptions = {...options, scales: { y: { ticks: { color: chartTextColor }, grid: { color: gridColor } }, x: { ticks: { color: chartTextColor }, grid: { color: gridColor } } } };
            if (App.state.chartInstances.pie) App.state.chartInstances.pie.destroy();
            App.state.chartInstances.pie = new Chart(document.getElementById(`budgetPieChart-${m}`).getContext('2d'), { type: 'pie', data: { labels: ['Pessoais', 'Empresa', 'Saldo'], datasets: [{ data: [totals.totalPersonal, totals.totalBusiness, Math.max(0, totals.remainingBudget)], backgroundColor: ['#ff453a', '#32d74b', '#2997ff'] }] }, options });
            const paymentLabels = [...App.constants.basePaymentMethods.filter(m => m !== 'Crédito'), ...App.state.creditCards.map(c => `Crédito (${c})`)];
            const paymentTotals = Object.fromEntries(paymentLabels.map(l => [l, 0]));
            App.state.monthlyData[m].expenses.forEach(d => {
                [...d.personalEntries, ...d.businessEntries].forEach(e => { let k = e.paymentMethod === 'Crédito' ? `Crédito (${e.card})` : e.paymentMethod; if (paymentTotals[k] !== undefined) paymentTotals[k] += e.amount; }); });
            const paymentColors = ['#007BFF', '#FD7E14', '#DC3545', '#20C997', '#6F42C1', '#D63384', '#198754', '#6C757D'];
            if (App.state.chartInstances.payment) App.state.chartInstances.payment.destroy();
            App.state.chartInstances.payment = new Chart(document.getElementById(`paymentMethodChart-${m}`).getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: paymentLabels,
                    datasets: [{
                        data: Object.values(paymentTotals),
                        backgroundColor: paymentColors,
                        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card-bg'),
                        borderWidth: 2
                    }]
                },
                options
            });
            const expensesByCategory = App.state.categories.reduce((a, c) => ({...a, [c.name]: 0 }), {});
            App.state.monthlyData[m].expenses.forEach(d => { d.personalEntries.forEach(e => { if (expensesByCategory[e.category] !== undefined) expensesByCategory[e.category] += e.amount; }); });
            const spentData = App.state.categories.map(c => expensesByCategory[c.name]);
            const budgetData = App.state.categories.map(c => c.budget);
            const barColors = spentData.map((s, i) => (s > budgetData[i] && budgetData[i] > 0) ? '#ff9500' : '#ff453a');
            if (App.state.chartInstances.goals) App.state.chartInstances.goals.destroy();
            App.state.chartInstances.goals = new Chart(document.getElementById(`budgetGoalsChart-${m}`).getContext('2d'), { type: 'bar', data: { labels: App.state.categories.map(c => c.name), datasets: [{ label: 'Gasto', data: spentData, backgroundColor: barColors }, { label: 'Meta', data: budgetData, backgroundColor: '#2997ff' }] }, options: {...barOptions, indexAxis: 'y' } });
        },
        renderBalanceSummary: function(l) { /* Mantido Igual */ },
        updateAnnualCharts: function(p) { /* Mantido Igual */ },

        renderCardList: () => { 
            App.ui.cardListContainer.innerHTML = App.state.creditCards.map(c => `
                <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--input-bg)] border border-[var(--border-color)] mb-2 group hover:border-[var(--primary-color)] transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                        </div>
                        <span class="font-medium text-[var(--text-color)]">${c}</span>
                    </div>
                    <button class="remove-card-btn w-8 h-8 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-all" data-card-name="${c}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                    </button>
                </div>
            `).join(''); 
        },
        renderCategoryList: () => { 
            App.ui.categoryListContainer.innerHTML = App.state.categories.map(c => `
                <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--input-bg)] border border-[var(--border-color)] mb-2 group">
                    <div class="flex-grow flex items-center gap-3 mr-3">
                        <div class="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                        </div>
                        <input type="text" value="${c.name}" class="category-name-input w-full bg-transparent font-medium text-[var(--text-color)] outline-none border-b border-transparent focus:border-[var(--primary-color)] transition-colors" data-old-name="${c.name}">
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="relative">
                            <span class="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-[var(--muted-text)]">R$</span>
                            <input type="number" value="${c.budget}" min="0" class="category-budget-input w-24 pl-6 pr-2 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--border-color)] text-sm font-semibold text-right outline-none focus:border-[var(--primary-color)] transition-colors" data-category-name="${c.name}">
                        </div>
                        <button class="remove-category-btn w-8 h-8 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-all" data-category-name="${c.name}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                        </button>
                    </div>
                </div>
            `).join(''); 
        },
        renderRecurringList: () => { 
            App.ui.recurringListContainer.innerHTML = App.state.recurringEntries.map((r, i) => `
                <div class="p-3 rounded-xl bg-[var(--input-bg)] border border-[var(--border-color)] mb-2 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div>
                            <p class="font-semibold text-sm text-[var(--text-color)]">${r.description}</p>
                            <p class="text-xs text-[var(--muted-text)]">Dia ${r.dayOfMonth} • ${App.helpers.formatCurrency(r.amount)} • ${r.type}</p>
                        </div>
                    </div>
                    <button class="remove-recurring-btn w-8 h-8 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-500 flex items-center justify-center transition-all" data-index="${i}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                    </button>
                </div>
            `).join(''); 
        },
        
        renderSettingsModal: () => {
            App.render.renderCardList();
            App.render.renderCategoryList();
            App.render.renderRecurringList();
            const recurringTypes = ['Ganho PF', 'Ganho PJ', 'Gasto Pessoal', 'Gasto Empresa'];
            document.getElementById('recurring-type').innerHTML = recurringTypes.map(type => `<option value="${type}">${type}</option>`).join('');
            document.getElementById('recurring-category').innerHTML = App.state.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
            document.getElementById('recurring-payment').innerHTML = App.constants.basePaymentMethods.map(m => `<option value="${m}">${m}</option>`).join('');
            document.getElementById('recurring-card').innerHTML = App.state.creditCards.map(c => `<option value="${c}">${c}</option>`).join('');
            App.ui.settingsModal.classList.remove('hidden');
            setTimeout(() => App.ui.settingsModal.querySelector('.modal-content').classList.remove('scale-95'), 10);
        },
        
        renderAccountModal: () => {
            const user = auth.currentUser;
            if (user) {
                App.ui.userNameInput.value = App.state.profile.name || '';
                App.ui.userEmailDisplay.value = user.email || '';
                App.ui.accountModal.classList.remove('hidden');
                setTimeout(() => App.ui.accountModal.querySelector('.modal-content').classList.remove('scale-95'), 10);
            }
        },
    }
};

window.App = App;

onAuthStateChanged(auth, user => {
    console.log("--- onAuthStateChanged FOI ACIONADO ---");

    if (user) {
        console.log("STATUS: Usuário está LOGADO.", user);
        authScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        
        if (window.location.pathname === '/login') {
            window.history.replaceState(null, '', '/');
        }

        if(loadingOverlay) loadingOverlay.classList.remove('hidden');
        App.init(user.uid);
    } else {
        console.log("STATUS: Usuário está DESLOGADO.");
        App.state.currentUserId = null;
        App.state.listenersBound = false; 
        authScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
    }
    console.log("------------------------------------");
});