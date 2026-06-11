// ==================== 1. SUPABASE ====================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://szuwsflyfsopdojirpkl.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6dXdzZmx5ZnNvcGRvamlycGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTQwNzYsImV4cCI6MjA5NjA3MDA3Nn0.CZ0MW9gkluYav4HCiG4PSXAQOdHE70Y6SKtTU5Y6EOE'; 

const supabase = createClient(supabaseUrl, supabaseKey);

// ==================== 2. ETAT GLOBAL (STATE) ====================
let state = {
    currentUser: null,
    userProfile: null,
    profiles: [],
    products: [],
    sales: [],
    clients: [],
    audits: [],
    inventoryPhysical: {},
    cart: [],
    transferProduct: null
};

// ==================== 3. AUTHENTIFICATION ====================
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        state.currentUser = session.user;
        unlockApplication();
    } else {
        state.currentUser = null;
        lockApplication();
    }
});

function lockApplication() {
    document.getElementById('main-app').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('login-screen').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('app-body').classList.add('overflow-hidden');
}

async function unlockApplication() {
    document.getElementById('login-screen').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('main-app').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('app-body').classList.remove('overflow-hidden');
    await loadDatabase();
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    
    btn.innerHTML = 'Connexion...';
    btn.disabled = true;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        showToast("Identifiants incorrects", "error");
        btn.innerHTML = 'Déverrouiller le système';
        btn.disabled = false;
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
}

// ==================== 4. AUDIT (TRAÇABILITÉ) ====================
async function logMovement(productId, actionType, qtyMoved, source, destination, note = "") {
    if(!state.currentUser) return;
    const { error } = await supabase.from('stock_movements').insert([{
        product_id: productId, user_id: state.currentUser.id, action_type: actionType,
        qty_moved: qtyMoved, stock_source: source, stock_destination: destination, note: note
    }]);
    if(error) showToast("Erreur Trace: " + error.message, "error"); 
}

// ==================== 5. BASE DE DONNÉES ====================
async function loadDatabase() {
    try {
        const { data: profData } = await supabase.from('profiles').select('*');
        state.profiles = profData || [];
        
        if(state.currentUser) {
            state.userProfile = state.profiles.find(p => p.id === state.currentUser.id);
            let displayName = state.userProfile?.full_name || state.currentUser.email.split('@')[0];
            document.getElementById('user-name').textContent = displayName;
            document.getElementById('user-avatar').textContent = displayName.charAt(0).toUpperCase();
            document.getElementById('user-role').textContent = state.userProfile?.role || 'Personnel';
        }

        const [prodReq, cliReq, salesReq, auditReq] = await Promise.all([
            supabase.from('products').select('*'),
            supabase.from('clients').select('*'),
            supabase.from('sales').select('*').order('created_at', { ascending: false }),
            supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(100)
        ]);

        state.products = (prodReq.data || []).map(p => ({
            id: p.id, name: p.name, cat: p.cat, unit: p.unit, buyPrice: p.buy_price, 
            sellPrice: p.sell_price, qtyEntrepot: p.qty_entrepot, qtyOfficine: p.qty_officine, alertSeuil: p.alert_seuil
        }));
        state.clients = cliReq.data || [];
        state.sales = salesReq.data || [];
        state.audits = auditReq.data || [];

        // Récupération Locale (Inventaire et Panier Anti-F5)
        const localInv = localStorage.getItem('medecineligne_inventory');
        if(localInv) state.inventoryPhysical = JSON.parse(localInv);
        const localCart = localStorage.getItem('medecineligne_cart');
        if(localCart) state.cart = JSON.parse(localCart);

        renderDashboard();
        if(!document.getElementById('page-audit').classList.contains('hidden')) renderAudit();
        if(!document.getElementById('page-caisse').classList.contains('hidden')) renderCaisse();
        
    } catch (err) {
        showToast("Erreur DB", "error");
    }
}

function saveLocalInventory() { localStorage.setItem('medecineligne_inventory', JSON.stringify(state.inventoryPhysical)); }
function saveLocalCart() { localStorage.setItem('medecineligne_cart', JSON.stringify(state.cart)); }

// ==================== 6. UTILITAIRES ====================
const fmtMoney = n => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
const genId = prefix => prefix + Math.floor(1000 + Math.random() * 9000);

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    t.innerHTML = msg;
    t.className = `fixed bottom-6 right-6 z-[200] transform transition-all duration-300 translate-y-0 opacity-100 px-5 py-3 rounded-xl shadow-2xl font-bold text-sm ${type==='error'?'bg-red-600 text-white':'bg-slate-900 text-white'}`;
    setTimeout(() => { t.classList.replace('translate-y-0', 'translate-y-20'); t.classList.replace('opacity-100', 'opacity-0'); }, 3000);
}

// ==================== 7. ROUTAGE ====================
function navigate(page) {
    document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.classList.remove('block'); });
    document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
    const targetPage = document.getElementById('page-' + page);
    if(targetPage) { targetPage.classList.remove('hidden'); targetPage.classList.add('block'); }
    const targetNav = document.getElementById('nav-' + page);
    if(targetNav) targetNav.classList.add('active');
    
    if (window.innerWidth <= 1024) toggleSidebar();
    
    if(page === 'dashboard') renderDashboard();
    if(page === 'entrepot') renderEntrepot();
    if(page === 'officine') renderOfficine();
    if(page === 'caisse') renderCaisse();
    if(page === 'crm') showCRMList();
    if(page === 'audit') renderAudit();
    if(page === 'inventaire') renderInventaire();
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mob-overlay');
    sb.classList.toggle('-translate-x-full');
    ov.classList.toggle('hidden');
}

function openModal(id) { document.getElementById(id).classList.add('open'); if(id==='modal-add-stock') populateProductSelect('stock-product-select'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ==================== 8. DASHBOARD ====================
function renderDashboard() {
    const todayStr = new Date().toDateString();
    const todaySales = state.sales.filter(s => new Date(s.created_at).toDateString() === todayStr);
    const dailyCA = todaySales.reduce((sum, s) => sum + Number(s.total), 0);
    const globalStockValue = state.products.reduce((sum, p) => sum + (p.qtyEntrepot + p.qtyOfficine) * p.sellPrice, 0);
    const outOfStockItems = state.products.filter(p => (p.qtyEntrepot + p.qtyOfficine) <= p.alertSeuil);
    
    document.getElementById('stat-ventes').textContent = fmtMoney(dailyCA);
    document.getElementById('stat-ventes-nb').textContent = todaySales.length + ' vente(s)';
    document.getElementById('stat-stock').textContent = fmtMoney(globalStockValue);
    document.getElementById('stat-ruptures').textContent = outOfStockItems.length;
    
    const tableBody = document.getElementById('recent-sales-body');
    const sortedSales = [...state.sales].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0, 5);
    tableBody.innerHTML = sortedSales.map(s => `<tr><td class="px-6 py-3 font-bold">${s.id}</td><td class="px-6 py-3">${s.mode}</td><td class="px-6 py-3 font-bold">${fmtMoney(s.total)}</td><td class="px-6 py-3">${fmtDate(s.created_at)}</td><td><button onclick="printFacture('${s.id}')" class="text-blue-600 font-bold text-xs">Imprimer</button></td></tr>`).join('');
}

// ==================== 9. LOGISTIQUE ====================
function renderEntrepot() {
    const query = document.getElementById('search-entrepot').value.toLowerCase();
    document.getElementById('entrepot-body').innerHTML = state.products.filter(p => p.name.toLowerCase().includes(query)).map(p => `
        <tr class="hover:bg-gray-50/50">
            <td class="px-6 py-4 font-bold">${p.name}</td>
            <td class="px-6 py-4 font-bold text-blue-600">${p.qtyEntrepot} u.</td>
            <td class="px-6 py-4 text-right"><button onclick="openTransferModal('${p.id}')" class="text-blue-600 font-bold text-xs">Transférer</button></td>
        </tr>
    `).join('');
}

function openTransferModal(productId) {
    const prod = state.products.find(p => p.id === productId);
    state.transferProduct = productId;
    document.getElementById('transfer-product-name').textContent = prod.name + ` (Réserve: ${prod.qtyEntrepot})`;
    openModal('modal-transfer');
}

async function executeTransfer() {
    const qty = parseInt(document.getElementById('transfer-qty').value) || 0;
    const prod = state.products.find(p => p.id === state.transferProduct);
    if(qty <= 0 || qty > prod.qtyEntrepot) return showToast('Quantité invalide', 'error');
    
    await supabase.from('products').update({ qty_entrepot: prod.qtyEntrepot - qty, qty_officine: prod.qtyOfficine + qty }).eq('id', prod.id);
    await logMovement(prod.id, 'TRANSFERT_OFFICINE', qty, 'Entrepôt', 'Officine');

    closeModal('modal-transfer'); showToast(`✅ Transféré`); await loadDatabase(); renderEntrepot();
}

async function addProduct() {
    const name = document.getElementById('np-name').value;
    const buyPrice = parseFloat(document.getElementById('np-buy').value);
    const sellPrice = parseFloat(document.getElementById('np-sell').value);
    if(!name || !buyPrice) return showToast("Saisie invalide", 'error');
    await supabase.from('products').insert([{ name, buy_price: buyPrice, sell_price: sellPrice }]);
    closeModal('modal-add-product'); showToast(`✅ Produit créé`); await loadDatabase(); renderEntrepot();
}

function populateProductSelect(id) { document.getElementById(id).innerHTML = state.products.map(p => `<option value="${p.id}">${p.name}</option>`).join(''); }

async function receiveStock() {
    const id = document.getElementById('stock-product-select').value;
    const qty = parseInt(document.getElementById('stock-qty').value);
    if(!id || !qty) return;
    const p = state.products.find(x => x.id === id);
    await supabase.from('products').update({ qty_entrepot: p.qtyEntrepot + qty }).eq('id', id);
    await logMovement(id, 'RECEPTION', qty, 'Fournisseur', 'Entrepôt');
    closeModal('modal-add-stock'); showToast(`✅ Reçu`); await loadDatabase(); renderEntrepot();
}

function renderOfficine() {
    const query = document.getElementById('search-officine').value.toLowerCase();
    document.getElementById('officine-body').innerHTML = state.products.filter(p => p.name.toLowerCase().includes(query)).map(p => `
        <tr class="hover:bg-gray-50/50"><td class="px-6 py-4 font-bold">${p.name}</td><td class="px-6 py-4 font-bold text-green-600">${p.qtyOfficine} u.</td><td class="px-6 py-4 font-bold">${fmtMoney(p.sellPrice)}</td></tr>
    `).join('');
}

// ==================== 10. CAISSE ====================
function renderCaisse() { searchProducts(); updateCartUI(); }

function searchProducts() {
    const query = document.getElementById('search-caisse').value.toLowerCase();
    document.getElementById('products-grid').innerHTML = state.products.filter(p => p.name.toLowerCase().includes(query)).map(p => `
        <div onclick="addToCart('${p.id}')" class="bg-white border rounded-xl p-4 cursor-pointer hover:border-blue-400">
            <div class="font-bold text-sm">${p.name}</div>
            <div class="flex justify-between mt-2"><span class="font-bold">${fmtMoney(p.sellPrice)}</span><span class="text-xs text-gray-500">${p.qtyOfficine} dispo</span></div>
        </div>
    `).join('');
}

function addToCart(id) {
    const p = state.products.find(x => x.id === id);
    if(p.qtyOfficine <= 0) return;
    const item = state.cart.find(c => c.productId === id);
    if(item) { if(item.qty >= p.qtyOfficine) return; item.qty++; } else { state.cart.push({ productId: id, name: p.name, qty: 1, price: p.sellPrice }); }
    updateCartUI();
}

function clearCart() { state.cart = []; updateCartUI(); }

function updateCartUI() {
    const total = state.cart.reduce((s, i) => s + i.qty * i.price, 0);
    document.getElementById('cart-items').innerHTML = state.cart.map(c => `
        <div class="flex justify-between bg-white border p-3 rounded-xl shadow-sm text-sm">
            <div class="font-bold">${c.name} <span class="font-normal text-gray-500">(x${c.qty})</span></div>
            <button onclick="state.cart = state.cart.filter(x=>x.productId!=='${c.productId}'); updateCartUI()" class="text-red-500 font-bold text-lg">×</button>
        </div>
    `).join('');
    document.getElementById('cart-total').textContent = fmtMoney(total);
    saveLocalCart();
}

async function validateSale() {
    if(!navigator.onLine) return showToast("⚠️ Impossible d'encaisser hors ligne", "error");
    if(!state.cart.length) return;
    const mode = document.getElementById('payment-mode').value;
    const total = state.cart.reduce((s, i) => s + i.qty * i.price, 0);
    const invId = genId('INV-');

    for(let i of state.cart) {
        const p = state.products.find(x => x.id === i.productId);
        await supabase.from('products').update({ qty_officine: p.qtyOfficine - i.qty }).eq('id', p.id);
        await logMovement(p.id, 'VENTE', i.qty, 'Officine', 'Client', `Ticket: ${invId}`);
    }

    await supabase.from('sales').insert([{ id: invId, total, mode, status: 'payé', user_id: state.currentUser.id }]);
    
    state.sales.unshift({ id: invId, items: [...state.cart], total, created_at: new Date().toISOString() });
    clearCart(); showToast(`✅ Vente validée`); await loadDatabase(); renderCaisse();
    if(confirm('Imprimer ?')) printFacture(invId);
}

function printFacture(id) {
    const s = state.sales.find(x => x.id === id);
    document.getElementById('print-receipt-area').innerHTML = `
        <div style="font-family: monospace; text-align: center; background: white; padding: 20px;">
            <h3>PHARMACIE DR SOKO</h3><p>Ticket: ${s.id}</p><hr>
            ${(s.items||[]).map(i=>`<p>${i.name} (x${i.qty}) : ${i.price*i.qty}</p>`).join('')}
            <hr><h3>TOTAL: ${s.total}</h3>
        </div>
    `;
    document.getElementById('print-receipt-area').classList.remove('hidden');
    window.print();
    document.getElementById('print-receipt-area').classList.add('hidden');
}

// ==================== 11. AUDIT & INVENTAIRE ====================
function renderAudit() {
    document.getElementById('audit-body').innerHTML = state.audits.map(a => {
        const p = state.products.find(x => x.id === a.product_id);
        const u = state.profiles.find(x => x.id === a.user_id);
        return `<tr><td class="px-6 py-3">${fmtDate(a.created_at)}</td><td class="px-6 py-3 font-bold">${u?.full_name||'N/A'}</td><td class="px-6 py-3">${a.action_type}</td><td class="px-6 py-3 font-bold">${p?.name||''}</td><td class="px-6 py-3">${a.qty_moved}</td></tr>`;
    }).join('');
}

function renderInventaire() {
    document.getElementById('inventaire-body').innerHTML = state.products.map(p => {
        const k = p.id + '_officine';
        const v = state.inventoryPhysical[k] !== undefined ? state.inventoryPhysical[k] : '';
        return `<tr><td class="px-6 py-3 font-bold">${p.name}</td><td class="px-6 py-3">${p.qtyOfficine} (Théorique)</td><td><input type="number" value="${v}" oninput="state.inventoryPhysical['${k}'] = parseInt(this.value)||0; localStorage.setItem('medecineligne_inventory', JSON.stringify(state.inventoryPhysical))" class="border p-1 w-20"></td></tr>`;
    }).join('');
}

async function appliquerAjustementsGlobaux() {
    for(let key of Object.keys(state.inventoryPhysical)) {
        const [id, loc] = key.split('_');
        const p = state.products.find(x => x.id === id);
        const diff = state.inventoryPhysical[key] - p.qtyOfficine;
        await supabase.from('products').update({ qty_officine: state.inventoryPhysical[key] }).eq('id', id);
        if(diff !== 0) await logMovement(id, 'AJUSTEMENT', diff, 'Officine', 'Officine');
    }
    state.inventoryPhysical = {}; localStorage.removeItem('medecineligne_inventory'); showToast("Ajustement validé"); await loadDatabase();
}

// ==================== 12. BINDINGS & INIT ====================
window.navigate = navigate; window.toggleSidebar = toggleSidebar; window.openModal = openModal; window.closeModal = closeModal;
window.executeTransfer = executeTransfer; window.openTransferModal = openTransferModal; window.addProduct = addProduct; window.receiveStock = receiveStock;
window.searchProducts = searchProducts; window.addToCart = addToCart; window.clearCart = clearCart; window.validateSale = validateSale; window.printFacture = printFacture;
window.renderEntrepot = renderEntrepot; window.renderOfficine = renderOfficine; window.renderAudit = renderAudit; window.appliquerAjustementsGlobaux = appliquerAjustementsGlobaux;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    window.addEventListener('offline', () => { showToast("Hors ligne", "error"); document.getElementById('payment-mode').disabled = true; });
    window.addEventListener('online', () => { showToast("En ligne"); document.getElementById('payment-mode').disabled = false; });
});