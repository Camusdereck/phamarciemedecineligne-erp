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
    inventoryPhysical: {}, // clé: `${productId}_${zone}` -> qty physique, chargé depuis Supabase (plus de localStorage)
    cart: [],
    transferProduct: null
};

// NB: on n'expose PAS `state` sur window pour éviter toute manipulation directe
// depuis le HTML (attributs oninput/onclick). Toute interaction passe par des
// fonctions dédiées exposées explicitement en bas du fichier.

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

// ==================== 5. SECURITE / UTILITAIRES D'AFFICHAGE ====================
// Empêche l'injection HTML (XSS) via des noms de produits/clients saisis par un utilisateur.
// A utiliser SYSTEMATIQUEMENT pour toute donnée provenant de la base avant de l'insérer en innerHTML.
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==================== 6. BASE DE DONNÉES ====================
async function loadDatabase() {
    try {
        const { data: profData, error: profErr } = await supabase.from('profiles').select('*');
        if (profErr) throw profErr;
        state.profiles = profData || [];
        
        if(state.currentUser) {
            state.userProfile = state.profiles.find(p => p.id === state.currentUser.id);
            let displayName = state.userProfile?.full_name || state.currentUser.email.split('@')[0];
            document.getElementById('user-name').textContent = displayName;
            document.getElementById('user-avatar').textContent = displayName.charAt(0).toUpperCase();
            document.getElementById('user-role').textContent = state.userProfile?.role || 'Personnel';
        }

        const [prodReq, cliReq, salesReq, auditReq, invReq] = await Promise.all([
            supabase.from('products').select('*'),
            supabase.from('clients').select('*'),
            supabase.from('sales').select('*').order('created_at', { ascending: false }),
            supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(100),
            supabase.from('inventory_counts').select('*')
        ]);

        if (prodReq.error) throw prodReq.error;
        if (cliReq.error) throw cliReq.error;
        if (salesReq.error) throw salesReq.error;

        state.products = (prodReq.data || []).map(p => ({
            id: p.id, name: p.name, cat: p.cat || 'Médicaments', unit: p.unit, buyPrice: p.buy_price, 
            sellPrice: p.sell_price, qtyEntrepot: p.qty_entrepot, qtyOfficine: p.qty_officine, alertSeuil: p.alert_seuil
        }));
        state.clients = cliReq.data || [];
        state.sales = salesReq.data || [];
        state.audits = auditReq.data || [];

        // Comptage physique d'inventaire : chargé depuis Supabase (plus de localStorage,
        // ainsi tous les postes voient le même brouillon d'inventaire en cours).
        state.inventoryPhysical = {};
        (invReq.data || []).forEach(row => {
            state.inventoryPhysical[`${row.product_id}_${row.zone}`] = row.physical_qty;
        });

        // Le panier reste local à l'appareil (comportement volontairement conservé : c'est
        // une saisie en cours non validée, propre à un poste de caisse).
        const localCart = localStorage.getItem('medecineligne_cart');
        if(localCart) state.cart = JSON.parse(localCart);

        renderDashboard();
        if(!document.getElementById('page-audit').classList.contains('hidden')) renderAudit();
        if(!document.getElementById('page-caisse').classList.contains('hidden')) renderCaisse();
        if(!document.getElementById('page-crm').classList.contains('hidden')) renderCRM();
        if(!document.getElementById('page-inventaire').classList.contains('hidden')) renderInventaire();
        
    } catch (err) {
        showToast("Erreur de synchronisation: " + (err.message || ''), "error");
    }
}

function saveLocalCart() { localStorage.setItem('medecineligne_cart', JSON.stringify(state.cart)); }

// ==================== 7. UTILITAIRES ====================
const fmtMoney = n => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
const genId = prefix => prefix + Date.now().toString(36).toUpperCase() + Math.floor(100 + Math.random() * 900);

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    if(!t) return;
    t.textContent = msg;
    t.className = `fixed bottom-6 right-6 z-[200] transform transition-all duration-300 translate-y-0 opacity-100 px-5 py-3 rounded-xl shadow-2xl font-bold text-sm ${type==='error'?'bg-red-600 text-white':'bg-slate-900 text-white'}`;
    setTimeout(() => { t.classList.replace('translate-y-0', 'translate-y-20'); t.classList.replace('opacity-100', 'opacity-0'); }, 3000);
}

// ==================== 8. ROUTAGE ====================
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

// ==================== 9. DASHBOARD ====================
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

    // Clients + créances totales (éléments présents dans le HTML mais jamais remplis auparavant)
    const clientsEl = document.getElementById('stat-clients');
    const dettesEl = document.getElementById('stat-dettes-total');
    if (clientsEl) clientsEl.textContent = state.clients.length;
    if (dettesEl) {
        const totalDebt = state.clients.reduce((sum, c) => sum + (Number(c.debt) || 0), 0);
        dettesEl.textContent = 'Créances: ' + fmtMoney(totalDebt);
    }

    // Alertes de seuil critique
    const alertsList = document.getElementById('alerts-list');
    if (alertsList) {
        if (!outOfStockItems.length) {
            alertsList.innerHTML = `<p class="text-xs text-gray-400 font-medium">Aucune alerte de stock</p>`;
        } else {
            alertsList.innerHTML = outOfStockItems.slice(0, 8).map(p => `
                <div class="flex justify-between items-center text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <span class="font-bold text-red-700 truncate mr-2">${escapeHtml(p.name)}</span>
                    <span class="text-red-500 font-semibold whitespace-nowrap">${p.qtyEntrepot + p.qtyOfficine} u.</span>
                </div>
            `).join('');
        }
    }

    // Chiffre d'affaires des 7 derniers jours
    const chartBars = document.getElementById('chart-bars');
    const chartLabels = document.getElementById('chart-labels');
    if (chartBars && chartLabels) {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(d);
        }
        const totals = days.map(d => {
            const dayStr = d.toDateString();
            return state.sales.filter(s => new Date(s.created_at).toDateString() === dayStr)
                               .reduce((sum, s) => sum + Number(s.total), 0);
        });
        const max = Math.max(...totals, 1);
        chartBars.innerHTML = totals.map(t => `
            <div class="flex-1 flex flex-col justify-end h-full">
                <div class="bg-medical-500 rounded-t-md w-full" style="height:${Math.max((t / max) * 100, 2)}%" title="${fmtMoney(t)}"></div>
            </div>
        `).join('');
        chartLabels.innerHTML = days.map(d => `<div class="flex-1 text-center text-[10px] font-semibold text-gray-400">${d.toLocaleDateString('fr-FR', { weekday: 'short' })}</div>`).join('');
    }
    
    const tableBody = document.getElementById('recent-sales-body');
    const sortedSales = [...state.sales].sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0, 5);
    tableBody.innerHTML = sortedSales.map(s => `<tr><td class="px-6 py-3 font-bold">${escapeHtml(s.id)}</td><td class="px-6 py-3">${escapeHtml(s.mode)}</td><td class="px-6 py-3 font-bold">${fmtMoney(s.total)}</td><td class="px-6 py-3">${fmtDate(s.created_at)}</td><td><button data-sale-id="${escapeHtml(s.id)}" class="btn-print-facture text-blue-600 font-bold text-xs cursor-pointer hover:underline">Imprimer</button></td></tr>`).join('');
    bindPrintButtons(tableBody);
}

function bindPrintButtons(container) {
    container.querySelectorAll('.btn-print-facture').forEach(btn => {
        btn.onclick = () => printFacture(btn.dataset.saleId);
    });
}

// ==================== 10. LOGISTIQUE ====================
function renderEntrepot() {
    const query = document.getElementById('search-entrepot').value.toLowerCase();
    const body = document.getElementById('entrepot-body');
    body.innerHTML = state.products.filter(p => p.name.toLowerCase().includes(query)).map(p => `
        <tr class="hover:bg-gray-50/50">
            <td class="px-6 py-4 font-bold">${escapeHtml(p.name)}</td>
            <td class="px-6 py-4 font-bold text-blue-600">${p.qtyEntrepot} u.</td>
            <td class="px-6 py-4 text-right"><button data-id="${p.id}" class="btn-transfer text-blue-600 font-bold text-xs cursor-pointer hover:underline">Transférer</button></td>
        </tr>
    `).join('');
    body.querySelectorAll('.btn-transfer').forEach(btn => btn.onclick = () => openTransferModal(btn.dataset.id));
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
    if(qty <= 0) return showToast('Quantité invalide', 'error');

    const { error } = await supabase.rpc('transfer_stock', {
        p_product_id: prod.id, p_qty: qty, p_user_id: state.currentUser.id
    });

    if (error) return showToast("Transfert refusé: " + error.message, "error");

    closeModal('modal-transfer'); showToast(`✅ Transféré`); await loadDatabase(); renderEntrepot();
}

async function addProduct() {
    const name = document.getElementById('np-name').value.trim();
    const buyPrice = parseFloat(document.getElementById('np-buy').value);
    const sellPrice = parseFloat(document.getElementById('np-sell').value);
    const cat = document.getElementById('np-cat').value || 'Médicaments';
    const unit = document.getElementById('np-unit').value || 'Boîte';
    const qtyEntrepot = parseInt(document.getElementById('np-qty').value) || 0;
    const alertSeuil = parseInt(document.getElementById('np-alert').value) || 10;

    if(!name || isNaN(buyPrice) || isNaN(sellPrice)) return showToast("Saisie invalide", 'error');

    const { error } = await supabase.from('products').insert([{ name, buy_price: buyPrice, sell_price: sellPrice, cat, unit, qty_entrepot: qtyEntrepot, qty_officine: 0, alert_seuil: alertSeuil }]);
    if (error) return showToast("Erreur création produit: " + error.message, "error");

    closeModal('modal-add-product'); showToast(`✅ Produit créé`); await loadDatabase(); renderEntrepot();
}

function populateProductSelect(id) { document.getElementById(id).innerHTML = state.products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(''); }

async function receiveStock() {
    const id = document.getElementById('stock-product-select').value;
    const qty = parseInt(document.getElementById('stock-qty').value);
    if(!id || !qty || qty <= 0) return showToast("Saisie invalide", "error");

    const { error } = await supabase.rpc('receive_stock', {
        p_product_id: id, p_qty: qty, p_user_id: state.currentUser.id
    });
    if (error) return showToast("Erreur réception: " + error.message, "error");

    closeModal('modal-add-stock'); showToast(`✅ Reçu`); await loadDatabase(); renderEntrepot();
}

function renderOfficine() {
    const query = document.getElementById('search-officine').value.toLowerCase();
    document.getElementById('officine-body').innerHTML = state.products.filter(p => p.name.toLowerCase().includes(query)).map(p => `
        <tr class="hover:bg-gray-50/50"><td class="px-6 py-4 font-bold">${escapeHtml(p.name)}</td><td class="px-6 py-4 font-bold text-green-600">${p.qtyOfficine} u.</td><td class="px-6 py-4 font-bold">${fmtMoney(p.sellPrice)}</td></tr>
    `).join('');
}

// ==================== 11. CAISSE ====================
function renderCaisse() { 
    const cats = [...new Set(state.products.map(p => p.cat))];
    document.getElementById('filter-category').innerHTML = '<option value="">Toutes catégories</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    
    const clientSelect = document.getElementById('cart-client');
    clientSelect.innerHTML = '<option value="">— Client Comptant —</option>' + state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    searchProducts(); 
    updateCartUI(); 
}

function searchProducts() {
    const query = document.getElementById('search-caisse').value.toLowerCase();
    const catFilter = document.getElementById('filter-category').value;
    
    let matched = state.products;
    if(query) matched = matched.filter(p => p.name.toLowerCase().includes(query));
    if(catFilter) matched = matched.filter(p => p.cat === catFilter);

    const grid = document.getElementById('products-grid');
    grid.innerHTML = matched.map(p => `
        <div data-id="${p.id}" class="product-card bg-white border rounded-xl p-4 cursor-pointer hover:border-blue-400 select-none shadow-sm">
            <div class="font-bold text-sm truncate">${escapeHtml(p.name)}</div>
            <div class="flex justify-between mt-2 items-center"><span class="font-bold text-sm text-medical-600">${fmtMoney(p.sellPrice)}</span><span class="text-xs font-semibold ${p.qtyOfficine <= 0 ? 'text-red-500':'text-gray-500'}">${p.qtyOfficine <= 0 ? 'Rupture' : p.qtyOfficine + ' dispo'}</span></div>
        </div>
    `).join('');
    grid.querySelectorAll('.product-card').forEach(card => card.onclick = () => addToCart(card.dataset.id));
}

function addToCart(id) {
    const p = state.products.find(x => x.id === id);
    if(p.qtyOfficine <= 0) return showToast("Stock épuisé en rayon", "error");
    const item = state.cart.find(c => c.productId === id);
    if(item) { if(item.qty >= p.qtyOfficine) return showToast("Alerte: Limite du stock atteinte", "error"); item.qty++; } else { state.cart.push({ productId: id, name: p.name, qty: 1, price: p.sellPrice }); }
    updateCartUI();
}

function removeFromCart(id) {
    state.cart = state.cart.filter(x => x.productId !== id);
    updateCartUI();
}

function clearCart() { state.cart = []; updateCartUI(); }

function updateCartUI() {
    const total = state.cart.reduce((s, i) => s + i.qty * i.price, 0);
    const cartItemsEl = document.getElementById('cart-items');
    cartItemsEl.innerHTML = state.cart.map(c => `
        <div class="flex justify-between items-center bg-white border p-3 rounded-xl shadow-sm text-sm">
            <div class="font-bold flex-1 truncate mr-2">${escapeHtml(c.name)} <span class="text-medical-600 font-semibold">(x${c.qty})</span></div>
            <button data-id="${c.productId}" class="btn-remove-cart text-red-500 font-bold text-xl cursor-pointer hover:text-red-700 px-1">×</button>
        </div>
    `).join('');
    cartItemsEl.querySelectorAll('.btn-remove-cart').forEach(btn => btn.onclick = () => removeFromCart(btn.dataset.id));
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

    const validateBtn = document.querySelector('[data-action="validate-sale"]');
    if (validateBtn) validateBtn.disabled = true;

    try {
        const items = state.cart.map(i => ({ product_id: i.productId, name: i.name, qty: i.qty, price: i.price }));

        // Appel atomique côté base : décrémente le stock, journalise, enregistre
        // la vente ET le détail des articles en une seule transaction. Si le stock
        // manque pour un article, tout est annulé (rien n'est à moitié enregistré).
        const { error } = await supabase.rpc('process_sale', {
            p_sale_id: invId,
            p_items: items,
            p_total: total,
            p_mode: mode,
            p_status: mode === 'credit' ? 'crédit' : 'payé',
            p_client_id: clientId,
            p_user_id: state.currentUser.id
        });

        if (error) throw error;

        clearCart(); showToast(`✅ Vente enregistrée avec succès`); await loadDatabase(); renderCaisse();
        if(confirm('Souhaitez-vous imprimer le ticket officiel ?')) printFacture(invId);
    } catch(err) {
        showToast("Vente refusée: " + (err.message || 'erreur transactionnelle'), "error");
    } finally {
        if (validateBtn) validateBtn.disabled = false;
    }
}

async function printFacture(id) {
    const s = state.sales.find(x => x.id === id);
    if(!s) return;
    const clientName = s.client_id ? (state.clients.find(c => c.id === s.client_id)?.name || 'Patient') : 'Client Comptant';

    // Le détail des articles n'est plus stocké en mémoire locale : on va le
    // chercher dans sale_items, ce qui permet de réimprimer un ticket correct
    // même après un rechargement de page ou depuis un autre poste.
    let itemsToPrint = [{ name: "Achats divers", qty: 1, price: s.total }];
    const { data: saleItems, error } = await supabase.from('sale_items').select('*').eq('sale_id', id);
    if (!error && saleItems && saleItems.length) {
        itemsToPrint = saleItems.map(i => ({ name: i.product_name, qty: i.qty, price: i.unit_price }));
    }
    
    document.getElementById('print-receipt-area').innerHTML = `
        <div style="font-family: 'Courier New', monospace; max-width: 290px; margin: 0 auto; color: #000; padding: 5px; font-size: 12px; line-height: 1.3;">
            <div style="text-align: center; margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 10px;">
                <h2 style="margin: 0; font-size: 15px; font-weight: bold; text-transform: uppercase;">PHARMACIE DR SOKO WAZA</h2>
                <p style="margin: 3px 0 0 0; font-size: 11px;">Officine & Logistique Médicale</p>
                <p style="margin: 2px 0 0 0; font-size: 11px;">Tél: +225 07 00 11 22</p>
            </div>
            <div style="margin-bottom: 10px; font-size: 11px;">
                <div><b>TICKET  :</b> ${escapeHtml(s.id)}</div>
                <div><b>DATE    :</b> ${fmtDate(s.created_at || new Date())}</div>
                <div><b>CLIENT  :</b> ${escapeHtml(clientName)}</div>
                <div><b>RÈGLEMENT:</b> ${escapeHtml((s.mode || '').toUpperCase())}</div>
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
                            <td style="padding: 4px 0; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(i.name)}</td>
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

// ==================== 12. CRM ====================
async function addClient() {
    const name = document.getElementById('nc-name')?.value.trim();
    const phone = document.getElementById('nc-phone')?.value.trim();
    if(!name || !phone) return showToast('⚠️ Nom et téléphone obligatoires', 'error');

    const { error } = await supabase.from('clients').insert([{ name, phone, debt: 0 }]);
    if(error) return showToast('Erreur lors de la création du client: ' + error.message, 'error');

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
                <td class="px-6 py-4 font-bold text-gray-900">${escapeHtml(c.name)}</td>
                <td class="px-6 py-4 text-gray-500">${escapeHtml(c.phone) || '—'}</td>
                <td class="px-6 py-4"><span class="px-2.5 py-0.5 rounded text-xs font-bold ${debt > 0 ? 'bg-red-100 text-red-700':'bg-green-100 text-green-700'}">${debt > 0 ? fmtMoney(debt) : 'Soldé'}</span></td>
                <td class="px-6 py-4 text-right">
                    <button data-id="${c.id}" class="btn-detail-client text-slate-600 border border-gray-200 px-2.5 py-1 rounded-lg cursor-pointer text-xs font-semibold mr-2 hover:bg-gray-50">Dossier</button>
                    ${debt > 0 ? `<button data-id="${c.id}" data-debt="${debt}" class="btn-pay-debt bg-green-600 text-white px-2.5 py-1 rounded-lg cursor-pointer text-xs font-bold hover:bg-green-700">Recouvrer</button>`:''}
                </td>
            </tr>
        `;
    }).join('');

    body.querySelectorAll('.btn-detail-client').forEach(btn => btn.onclick = () => showClientDetail(btn.dataset.id));
    body.querySelectorAll('.btn-pay-debt').forEach(btn => btn.onclick = () => payClientDebt(btn.dataset.id, Number(btn.dataset.debt)));
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
            <td class="px-6 py-3.5 font-bold text-gray-900">${escapeHtml(sale.id)}</td>
            <td class="px-6 py-3.5 text-gray-400 font-medium">${fmtDate(sale.created_at)}</td>
            <td class="px-6 py-3.5 font-bold text-gray-900">${fmtMoney(sale.total)}</td>
            <td class="px-6 py-3.5"><span class="px-2 py-0.5 rounded text-xs font-bold ${sale.status==='payé'?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}">${escapeHtml(sale.status)}</span></td>
            <td class="px-6 py-3.5 text-right"><button data-sale-id="${escapeHtml(sale.id)}" class="btn-print-facture text-blue-600 font-bold text-xs cursor-pointer hover:underline">Imprimer</button></td>
        </tr>
    `).join('');
    bindPrintButtons(invoicesBody);
}

function showCRMList() {
    document.getElementById('crm-list-view').style.display = 'block';
    document.getElementById('crm-detail-view').style.display = 'none';
    renderCRM();
}

async function payClientDebt(clientId, amount) {
    const client = state.clients.find(c => c.id === clientId);
    if(client && confirm(`Confirmer l'encaissement de ${fmtMoney(amount)} pour solder le compte de ${client.name} ?`)) {
        const { error: e1 } = await supabase.from('clients').update({ debt: 0 }).eq('id', clientId);
        const { error: e2 } = await supabase.from('sales').update({ status: 'payé' }).eq('client_id', clientId).eq('status', 'crédit');
        if (e1 || e2) return showToast("Erreur lors du recouvrement: " + (e1 || e2).message, "error");
        showToast(`✅ Compte patient régularisé`);
        await loadDatabase();
    }
}

// ==================== 13. INVENTAIRE & AUDIT ====================
function renderAudit() {
    document.getElementById('audit-body').innerHTML = state.audits.map(a => {
        const p = state.products.find(x => x.id === a.product_id);
        const u = state.profiles.find(x => x.id === a.user_id);
        return `<tr><td class="px-6 py-3">${fmtDate(a.created_at)}</td><td class="px-6 py-3 font-bold">${escapeHtml(u?.full_name||'N/A')}</td><td class="px-6 py-3 text-xs font-semibold">${escapeHtml(a.action_type)}</td><td class="px-6 py-3 font-bold">${escapeHtml(p?.name||'Article supprimé')}</td><td class="px-6 py-3 font-bold">${a.qty_moved}</td></tr>`;
    }).join('');
}

// Debounce des écritures en base pendant la saisie du comptage physique,
// pour ne pas envoyer une requête à chaque frappe.
let inventoryDebounceTimers = {};

function updatePhysicalCount(productId, zone, rawValue) {
    const qty = parseInt(rawValue) || 0;
    const key = `${productId}_${zone}`;
    state.inventoryPhysical[key] = qty; // reflet immédiat en mémoire pour l'UI

    clearTimeout(inventoryDebounceTimers[key]);
    inventoryDebounceTimers[key] = setTimeout(async () => {
        const { error } = await supabase.from('inventory_counts').upsert({
            product_id: productId,
            zone: zone,
            physical_qty: qty,
            counted_by: state.currentUser?.id,
            updated_at: new Date().toISOString()
        }, { onConflict: 'product_id,zone' });
        if (error) showToast("Erreur sauvegarde comptage: " + error.message, "error");
    }, 500);
}

function renderInventaireZone(zone, tbodyId) {
    const qtyKey = zone === 'officine' ? 'qtyOfficine' : 'qtyEntrepot';
    document.getElementById(tbodyId).innerHTML = state.products.map(p => {
        const k = `${p.id}_${zone}`;
        const v = state.inventoryPhysical[k] !== undefined ? state.inventoryPhysical[k] : '';
        return `<tr>
            <td class="px-6 py-3 font-bold">${escapeHtml(p.name)}</td>
            <td class="px-6 py-3 text-gray-500">${p[qtyKey]} (Théorique)</td>
            <td><input type="number" value="${v}" data-id="${p.id}" data-zone="${zone}" class="inventory-input border p-1 w-20 rounded outline-none text-center font-semibold"></td>
        </tr>`;
    }).join('');
    document.querySelectorAll(`#${tbodyId} .inventory-input`).forEach(input => {
        input.oninput = () => updatePhysicalCount(input.dataset.id, input.dataset.zone, input.value);
    });
}

function renderInventaire() {
    // Officine ET entrepôt sont désormais tous les deux couverts.
    // Le HTML doit contenir #inventaire-body-officine et #inventaire-body-entrepot.
    if (document.getElementById('inventaire-body-officine')) renderInventaireZone('officine', 'inventaire-body-officine');
    if (document.getElementById('inventaire-body-entrepot')) renderInventaireZone('entrepot', 'inventaire-body-entrepot');
    // Compat rétro si l'ancien tbody unique existe encore (officine uniquement)
    if (document.getElementById('inventaire-body')) renderInventaireZone('officine', 'inventaire-body');
}

async function appliquerAjustementsGlobaux(zone) {
    // zone = 'officine' | 'entrepot' | undefined (undefined = les deux)
    const keys = Object.keys(state.inventoryPhysical).filter(k => !zone || k.endsWith('_' + zone));
    if(!keys.length) return showToast("Aucune donnée d'inventaire saisie", "error");
    
    if(!confirm(`Voulez-vous écraser les valeurs théoriques par les comptages physiques réels ?`)) return;

    let errors = 0;
    for(let key of keys) {
        const [productId, z] = key.split('_');
        const newQty = state.inventoryPhysical[key];

        const { error } = await supabase.rpc('apply_inventory_adjustment', {
            p_product_id: productId,
            p_zone: z,
            p_new_qty: newQty,
            p_user_id: state.currentUser.id
        });
        if (error) { errors++; showToast(`Erreur sur un produit: ${error.message}`, "error"); }
    }

    if (errors === 0) showToast("Ajustement de stock appliqué");
    await loadDatabase();
}

// ==================== 14. EXPOSITION GLOBALE (SCOPE MODULE) ====================
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
window.renderInventaire = renderInventaire;
window.updatePhysicalCount = updatePhysicalCount;

// ==================== 15. INITIATIONS ET LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    
    document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    window.addEventListener('offline', () => { 
        showToast("⚠️ Connexion Internet perdue.", "error"); 
        const btn = document.querySelector('[data-action="validate-sale"]');
        if(btn) { btn.disabled = true; btn.classList.add('opacity-40', 'cursor-not-allowed'); }
    });
    
    window.addEventListener('online', () => { 
        showToast("✅ Connexion rétablie."); 
        const btn = document.querySelector('[data-action="validate-sale"]');
        if(btn) { btn.disabled = false; btn.classList.remove('opacity-40', 'cursor-not-allowed'); }
    });
});