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
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-body').classList.add('overflow-hidden');
}

async function unlockApplication() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('app-body').classList.remove('overflow-hidden');
    await loadDatabase();
}

async function handleLogin(e) {
    if(e) e.preventDefault();
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
            id: p.id, name: p.name, cat: p.cat || 'Médicaments', unit: p.unit, buyPrice: p.buy_price, 
            sellPrice: p.sell_price, qtyEntrepot: p.qty_entrepot, qtyOfficine: p.qty_officine, alertSeuil: p.alert_seuil
        }));
        state.clients = cliReq.data || [];
        state.sales = salesReq.data || [];
        state.audits = auditReq.data || [];

        const localInv = localStorage.getItem('medecineligne_inventory');
        if(localInv) state.inventoryPhysical = JSON.parse(localInv);
        const localCart = localStorage.getItem('medecineligne_cart');
        if(localCart) state.cart = JSON.parse(localCart);

        renderDashboard();
        if(!document.getElementById('page-audit').classList.contains('hidden')) renderAudit();
        if(!document.getElementById('page-caisse').classList.contains('hidden')) renderCaisse();
        if(!document.getElementById('page-crm').classList.contains('hidden')) renderCRM();
        
    } catch (err) {
        showToast("Erreur de synchronisation", "error");
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
    if(!t) return;
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
    
    if (window.innerWidth <= 1024 && !document.getElementById('sidebar').classList.contains('-translate-x-full')) toggleSidebar();
    
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
    tableBody.innerHTML = sortedSales.map(s => `<tr><td class="px-6 py-3 font-bold">${s.id}</td><td class="px-6 py-3">${s.mode}</td><td class="px-6 py-3 font-bold">${fmtMoney(s.total)}</td><td class="px-6 py-3">${fmtDate(s.created_at)}</td><td><button onclick="printFacture('${s.id}')" class="text-blue-600 font-bold text-xs cursor-pointer hover:underline">Imprimer</button></td></tr>`).join('');
}

// ==================== 9. LOGISTIQUE ====================
function renderEntrepot() {
    const query = document.getElementById('search-entrepot').value.toLowerCase();
    document.getElementById('entrepot-body').innerHTML = state.products.filter(p => p.name.toLowerCase().includes(query)).map(p => `
        <tr class="hover:bg-gray-50/50">
            <td class="px-6 py-4 font-bold">${p.name}</td>
            <td class="px-6 py-4 font-bold text-blue-600">${p.qtyEntrepot} u.</td>
            <td class="px-6 py-4 text-right"><button onclick="openTransferModal('${p.id}')" class="text-blue-600 font-bold text-xs cursor-pointer hover:underline">Transférer</button></td>
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
    const cat = document.getElementById('np-cat').value || 'Médicaments';
    const unit = document.getElementById('np-unit').value || 'Boîte';
    const qtyEntrepot = parseInt(document.getElementById('np-qty').value) || 0;
    const alertSeuil = parseInt(document.getElementById('np-alert').value) || 10;

    if(!name || !buyPrice || !sellPrice) return showToast("Saisie invalide", 'error');
    await supabase.from('products').insert([{ name, buy_price: buyPrice, sell_price: sellPrice, cat, unit, qty_entrepot: qtyEntrepot, qty_officine: 0, alert_seuil: alertSeuil }]);
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
function renderCaisse() { 
    // Remplissage dynamique des catégories
    const cats = [...new Set(state.products.map(p => p.cat))];
    document.getElementById('filter-category').innerHTML = '<option value="">Toutes catégories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    
    // Remplissage dynamique des clients
    const clientSelect = document.getElementById('cart-client');
    clientSelect.innerHTML = '<option value="">— Client Comptant —</option>' + state.clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    searchProducts(); 
    updateCartUI(); 
}

function searchProducts() {
    const query = document.getElementById('search-caisse').value.toLowerCase();
    const catFilter = document.getElementById('filter-category').value;
    
    let matched = state.products;
    if(query) matched = matched.filter(p => p.name.toLowerCase().includes(query));
    if(catFilter) matched = matched.filter(p => p.cat === catFilter);

    document.getElementById('products-grid').innerHTML = matched.map(p => `
        <div onclick="addToCart('${p.id}')" class="bg-white border rounded-xl p-4 cursor-pointer hover:border-blue-400 select-none shadow-sm">
            <div class="font-bold text-sm truncate">${p.name}</div>
            <div class="flex justify-between mt-2 items-center"><span class="font-bold text-sm text-medical-600">${fmtMoney(p.sellPrice)}</span><span class="text-xs font-semibold ${p.qtyOfficine <= 0 ? 'text-red-500':'text-gray-500'}">${p.qtyOfficine <= 0 ? 'Rupture' : p.qtyOfficine + ' dispo'}</span></div>
        </div>
    `).join('');
}

function addToCart(id) {
    const p = state.products.find(x => x.id === id);
    if(p.qtyOfficine <= 0) return showToast("Stock épuisé en rayon", "error");
    const item = state.cart.find(c => c.productId === id);
    if(item) { if(item.qty >= p.qtyOfficine) return showToast("Alerte: Limite du stock atteinte", "error"); item.qty++; } else { state.cart.push({ productId: id, name: p.name, qty: 1, price: p.sellPrice }); }
    updateCartUI();
}

function clearCart() { state.cart = []; updateCartUI(); }

function updateCartUI() {
    const total = state.cart.reduce((s, i) => s + i.qty * i.price, 0);
    document.getElementById('cart-items').innerHTML = state.cart.map(c => `
        <div class="flex justify-between items-center bg-white border p-3 rounded-xl shadow-sm text-sm">
            <div class="font-bold flex-1 truncate mr-2">${c.name} <span class="text-medical-600 font-semibold">(x${c.qty})</span></div>
            <button onclick="state.cart = state.cart.filter(x=>x.productId!=='${c.productId}'); updateCartUI()" class="text-red-500 font-bold text-xl cursor-pointer hover:text-red-700 px-1">×</button>
        </div>
    `).join('');
    document.getElementById('cart-total').textContent = fmtMoney(total);
    saveLocalCart();
}

async function validateSale() {
    if(!navigator.onLine) return showToast("⚠️ Impossible d'encaisser hors ligne", "error");
    if(!state.cart.length) return showToast("Le panier est vide", "error");
    
    const clientId = document.getElementById('cart-client').value || null;
    const mode = document.getElementById('payment-mode').value;
    const total = state.cart.reduce((s, i) => s + i.qty * i.price, 0);
    
    if(mode === 'credit' && !clientId) return showToast("Sélectionnez un profil client pour les ventes à crédit", "error");
    const invId = genId('INV-');

    try {
        for(let i of state.cart) {
            const p = state.products.find(x => x.id === i.productId);
            await supabase.from('products').update({ qty_officine: p.qtyOfficine - i.qty }).eq('id', p.id);
            await logMovement(p.id, 'VENTE', i.qty, 'Officine', 'Client', `Ticket: ${invId}`);
        }

        if(mode === 'credit' && clientId) {
            const currentClient = state.clients.find(c => c.id === clientId);
            await supabase.from('clients').update({ debt: (Number(currentClient.debt) || 0) + total }).eq('id', clientId);
        }

        await supabase.from('sales').insert([{ id: invId, total, mode, status: mode === 'credit' ? 'crédit' : 'payé', user_id: state.currentUser.id, client_id: clientId }]);
        
        state.sales.unshift({ id: invId, items: [...state.cart], total, mode, created_at: new Date().toISOString(), client_id: clientId });
        clearCart(); showToast(`✅ Vente enregistrée avec succès`); await loadDatabase(); renderCaisse();
        if(confirm('Souhaitez-vous imprimer le ticket officiel ?')) printFacture(invId);
    } catch(err) {
        showToast("Erreur transactionnelle", "error");
    }
}

function printFacture(id) {
    const s = state.sales.find(x => x.id === id);
    if(!s) return;
    const clientName = s.client_id ? (state.clients.find(c => c.id === s.client_id)?.name || 'Patient') : 'Client Comptant';
    const itemsToPrint = s.items || [{ name: "Achats divers", qty: 1, price: s.total }];
    
    document.getElementById('print-receipt-area').innerHTML = `
        <div style="font-family: 'Courier New', monospace; max-width: 290px; margin: 0 auto; color: #000; padding: 5px; font-size: 12px; line-height: 1.3;">
            <div style="text-align: center; margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px;">
                <h2 style="margin: 0; font-size: 15px; font-weight: bold; text-transform: uppercase;">PHARMACIE DR SOKO WAZA</h2>
                <p style="margin: 3px 0 0 0; font-size: 11px;">Officine & Logistique Médicale</p>
                <p style="margin: 2px 0 0 0; font-size: 11px;">Tél: +225 07 00 11 22</p>
            </div>
            <div style="margin-bottom: 10px; font-size: 11px;">
                <div><b>TICKET  :</b> ${s.id}</div>
                <div><b>DATE    :</b> ${fmtDate(s.created_at || new Date())}</div>
                <div><b>CLIENT  :</b> ${clientName}</div>
                <div><b>RÈGLEMENT:</b> ${s.mode.toUpperCase()}</div>
            </div>
            <table style="width: 100%; text-align: left; border-collapse: collapse; margin-top: 5px;">
                <thead>
                    <tr style="border-bottom: 1px solid #000; font-weight: bold; font-size: 11px;">
                        <th style="padding-bottom: 3px;">ARTICLE</th>
                        <th style="text-align: center; padding-bottom: 3px;">QTÉ</th>
                        <th style="text-align: right; padding-bottom: 3px;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsToPrint.map(i => `
                        <tr style="font-size: 11px;">
                            <td style="padding: 4px 0; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${i.name}</td>
                            <td style="text-align: center; padding: 4px 0;">${i.qty}</td>
                            <td style="text-align: right; padding: 4px 0;">${fmtMoney(i.price * i.qty)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div style="border-top: 1px dashed #000; margin-top: 10px; padding-top: 6px; text-align: right;">
                <div style="font-size: 13px; font-weight: bold;">NET À PAYER : ${fmtMoney(s.total)}</div>
            </div>
            <div style="text-align: center; margin-top: 25px; border-top: 1px solid #000; padding-top: 8px; font-size: 10px;">
                <p style="margin: 0; font-weight: bold;">Les médicaments vendus ne sont pas repris.</p>
                <p style="margin: 3px 0 0 0; color: #444;">Solutions : Agence Satmak © 2026</p>
            </div>
        </div>
    `;
    
    const printArea = document.getElementById('print-receipt-area');
    printArea.classList.remove('hidden');
    window.print();
    printArea.classList.add('hidden');
}

// ==================== 11. CRM ====================
async function addClient() {
    const name = document.getElementById('nc-name')?.value.trim();
    const phone = document.getElementById('nc-phone')?.value.trim();
    if(!name || !phone) return showToast('⚠️ Nom et téléphone obligatoires', 'error');

    const { error } = await supabase.from('clients').insert([{ name, phone, debt: 0 }]);
    if(error) return showToast('Erreur lors de la création du client', 'error');

    closeModal('modal-add-client');
    showToast(`✅ Client enregistré`);
    await loadDatabase();
}

function renderCRM() {
    const body = document.getElementById('crm-body');
    if(!body) return;
    
    if(!state.clients.length) {
        body.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400">Aucun profil patient enregistré</td></tr>`;
        return;
    }
    
    body.innerHTML = state.clients.map(c => {
        const debt = Number(c.debt) || 0;
        return `
            <tr class="hover:bg-gray-50/50">
                <td class="px-6 py-4 font-bold text-gray-900">${c.name}</td>
                <td class="px-6 py-4 text-gray-500">${c.phone || '—'}</td>
                <td class="px-6 py-4"><span class="px-2.5 py-0.5 rounded text-xs font-bold ${debt > 0 ? 'bg-red-100 text-red-700':'bg-green-100 text-green-700'}">${debt > 0 ? fmtMoney(debt) : 'Soldé'}</span></td>
                <td class="px-6 py-4 text-right">
                    <button onclick="showClientDetail('${c.id}')" class="text-slate-600 border border-gray-200 px-2.5 py-1 rounded-lg cursor-pointer text-xs font-semibold mr-2 hover:bg-gray-50">Dossier</button>
                    ${debt > 0 ? `<button onclick="payClientDebt('${c.id}', ${debt})" class="bg-green-600 text-white px-2.5 py-1 rounded-lg cursor-pointer text-xs font-bold hover:bg-green-700">Recouvrer</button>`:''}
                </td>
            </tr>
        `;
    }).join('');
}

function showClientDetail(clientId) {
    const client = state.clients.find(c => c.id === clientId);
    if(!client) return;
    
    document.getElementById('crm-list-view').style.display = 'none';
    document.getElementById('crm-detail-view').style.display = 'block';
    document.getElementById('detail-client-name').textContent = client.name;
    
    const associatedSales = state.sales.filter(s => s.client_id === clientId);
    const cumulativeSpent = associatedSales.reduce((a, b) => a + Number(b.total), 0);
    const balance = Number(client.debt) || 0;
    
    document.getElementById('detail-total').textContent = fmtMoney(cumulativeSpent);
    document.getElementById('detail-nb').textContent = associatedSales.length;
    document.getElementById('detail-solde').textContent = fmtMoney(balance);
    document.getElementById('detail-solde').className = `font-display text-2xl font-bold mt-1 ${balance > 0 ? 'text-red-600' : 'text-green-600'}`;
    
    const invoicesBody = document.getElementById('detail-invoices');
    if(!associatedSales.length) {
        invoicesBody.innerHTML = `<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400 font-medium">Aucune facture sur ce dossier</td></tr>`;
        return;
    }
    
    invoicesBody.innerHTML = associatedSales.map(sale => `
        <tr class="hover:bg-gray-50/50">
            <td class="px-6 py-3.5 font-bold text-gray-900">${sale.id}</td>
            <td class="px-6 py-3.5 text-gray-400 font-medium">${fmtDate(sale.created_at)}</td>
            <td class="px-6 py-3.5 font-bold text-gray-900">${fmtMoney(sale.total)}</td>
            <td class="px-6 py-3.5"><span class="px-2 py-0.5 rounded text-xs font-bold ${sale.status==='payé'?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}">${sale.status}</span></td>
            <td class="px-6 py-3.5 text-right"><button onclick="printFacture('${sale.id}')" class="text-blue-600 font-bold text-xs cursor-pointer hover:underline">Imprimer</button></td>
        </tr>
    `).join('');
}

function showCRMList() {
    document.getElementById('crm-list-view').style.display = 'block';
    document.getElementById('crm-detail-view').style.display = 'none';
    renderCRM();
}

async function payClientDebt(clientId, amount) {
    const client = state.clients.find(c => c.id === clientId);
    if(client && confirm(`Confirmer l'encaissement de ${fmtMoney(amount)} pour solder le compte de ${client.name} ?`)) {
        await supabase.from('clients').update({ debt: 0 }).eq('id', clientId);
        await supabase.from('sales').update({ status: 'payé' }).eq('client_id', clientId).eq('status', 'crédit');
        showToast(`✅ Compte patient régularisé`);
        await loadDatabase();
    }
}

// ==================== 12. INVENTAIRE & AUDIT ====================
function renderAudit() {
    document.getElementById('audit-body').innerHTML = state.audits.map(a => {
        const p = state.products.find(x => x.id === a.product_id);
        const u = state.profiles.find(x => x.id === a.user_id);
        return `<tr><td class="px-6 py-3">${fmtDate(a.created_at)}</td><td class="px-6 py-3 font-bold">${u?.full_name||'N/A'}</td><td class="px-6 py-3 text-xs font-semibold">${a.action_type}</td><td class="px-6 py-3 font-bold">${p?.name||'Article supprimé'}</td><td class="px-6 py-3 font-bold">${a.qty_moved}</td></tr>`;
    }).join('');
}

function renderInventaire() {
    document.getElementById('inventaire-body').innerHTML = state.products.map(p => {
        const k = p.id + '_officine';
        const v = state.inventoryPhysical[k] !== undefined ? state.inventoryPhysical[k] : '';
        return `<tr><td class="px-6 py-3 font-bold">${p.name}</td><td class="px-6 py-3 text-gray-500">${p.qtyOfficine} (Théorique)</td><td><input type="number" value="${v}" oninput="state.inventoryPhysical['${k}'] = parseInt(this.value)||0; localStorage.setItem('medecineligne_inventory', JSON.stringify(state.inventoryPhysical))" class="border p-1 w-20 rounded outline-none text-center font-semibold"></td></tr>`;
    }).join('');
}

async function appliquerAjustementsGlobaux() {
    const keys = Object.keys(state.inventoryPhysical);
    if(!keys.length) return showToast("Aucune donnée d'inventaire saisie", "error");
    
    if(confirm(`Voulez-vous écraser les valeurs théoriques par les comptages physiques réels ?`)) {
        for(let key of keys) {
            const [id] = key.split('_');
            const p = state.products.find(x => x.id === id);
            const diff = state.inventoryPhysical[key] - p.qtyOfficine;
            await supabase.from('products').update({ qty_officine: state.inventoryPhysical[key] }).eq('id', id);
            if(diff !== 0) await logMovement(id, 'AJUSTEMENT', diff, 'Officine', 'Officine');
        }
        state.inventoryPhysical = {}; localStorage.removeItem('medecineligne_inventory'); showToast("Ajustement de stock appliqué"); await loadDatabase();
    }
}

// ==================== 13. EXPOSITION GLOBALE (SCOPE MODULE) ====================
window.navigate = navigate; 
window.toggleSidebar = toggleSidebar; 
window.openModal = openModal; 
window.closeModal = closeModal;
window.executeTransfer = executeTransfer; 
window.openTransferModal = openTransferModal; 
window.addProduct = addProduct; 
window.receiveStock = receiveStock;
window.searchProducts = searchProducts; 
window.addToCart = addToCart; 
window.clearCart = clearCart; 
window.validateSale = validateSale; 
window.printFacture = printFacture;
window.renderEntrepot = renderEntrepot; 
window.renderOfficine = renderOfficine; 
window.renderAudit = renderAudit; 
window.appliquerAjustementsGlobaux = appliquerAjustementsGlobaux;
window.addClient = addClient;
window.showCRMList = showCRMList;
window.showClientDetail = showClientDetail;
window.payClientDebt = payClientDebt;
window.handleLogout = handleLogout;

// ==================== 14. INITIATIONS ET LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    
    document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    window.addEventListener('offline', () => { 
        showToast("⚠️ Connexion Internet perdue.", "error"); 
        const btn = document.querySelector('button[onclick="validateSale()"]');
        if(btn) { btn.disabled = true; btn.classList.add('opacity-40', 'cursor-not-allowed'); }
    });
    
    window.addEventListener('online', () => { 
        showToast("✅ Connexion rétablie."); 
        const btn = document.querySelector('button[onclick="validateSale()"]');
        if(btn) { btn.disabled = false; btn.classList.remove('opacity-40', 'cursor-not-allowed'); }
    });
});