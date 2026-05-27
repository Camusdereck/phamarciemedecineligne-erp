// ==================== APPLICATION CORE STATE ====================
let state = {
    products: [],
    sales: [],
    clients: [],
    inventoryPhysical: {}, // Schema: { "prodId_entrepot": qty, "prodId_officine": qty }
    cart: [],
    transferProduct: null
};

// ==================== PERSISTENCE layer ====================
function saveState() {
    localStorage.setItem('medecineligne_v2_pro', JSON.stringify(state));
}

function loadState() {
    const s = localStorage.getItem('medecineligne_v2_pro');
    if (s) {
        try { 
            state = JSON.parse(s); 
            if(!state.inventoryPhysical) state.inventoryPhysical = {};
            if(!state.cart) state.cart = [];
        } catch(e) {
            seedData();
        }
    } else {
        seedData();
    }
}

function seedData() {
    state.products = [
        {id:'p1', name:'Paracétamol Biogaran 500mg', cat:'Antalgiques', unit:'Boîte de 16', buyPrice:450, sellPrice:900, qtyEntrepot:240, qtyOfficine:85, alertSeuil:15, expiry:'11/2028'},
        {id:'p2', name:'Amoxicilline Sandoz 500mg', cat:'Antibiotiques', unit:'Boîte de 12', buyPrice:1300, sellPrice:2500, qtyEntrepot:110, qtyOfficine:30, alertSeuil:10, expiry:'04/2027'},
        {id:'p3', name:'Ibuprofène Mylan 400mg', cat:'Anti-inflammatoires', unit:'Boîte de 20', buyPrice:750, sellPrice:1500, qtyEntrepot:80, qtyOfficine:8, alertSeuil:12, expiry:'08/2028'},
        {id:'p4', name:'Artemether + Lumefantrine (Coartem)', cat:'Antipaludéens', unit:'Boîte de 24', buyPrice:1800, sellPrice:3200, qtyEntrepot:90, qtyOfficine:40, alertSeuil:15, expiry:'09/2027'},
        {id:'p5', name:'Sirop Humex Toux Sèche', cat:'ORL / Poumon', unit:'Flacon 125ml', buyPrice:1100, sellPrice:2100, qtyEntrepot:45, qtyOfficine:3, alertSeuil:8, expiry:'01/2027'}
    ];
    state.clients = [
        {id:'c1', name:'Mme Fatima Coulibaly', phone:'+225 07 48 92 12', address:'Abatta, Cocody', debt: 0},
        {id:'c2', name:'M. Mamadou Traoré', phone:'+225 05 11 23 84', address:'Riviera 3, Cocody', debt: 5700},
        {id:'c3', name:'Dr. Soko Waza Personal Account', phone:'+225 07 00 11 22', address:'Pharmacie Direct', debt: 0}
    ];
    
    const today = new Date();
    state.sales = [
        {
            id:'INV-0482', 
            clientId:'c1', 
            items:[{productId:'p1', name:'Paracétamol Biogaran 500mg', qty:3, price:900}], 
            total:2700, 
            mode:'especes', 
            date: today.toISOString(), 
            status:'payé'
        },
        {
            id:'INV-0481', 
            clientId:'c2', 
            items:[{productId:'p2', name:'Amoxicilline Sandoz 500mg', qty:1, price:2500}, {productId:'p4', name:'Artemether + Lumefantrine (Coartem)', qty:1, price:3200}], 
            total:5700, 
            mode:'credit', 
            date: new Date(today.getTime() - 86400000).toISOString(), 
            status:'crédit'
        }
    ];
    saveState();
}

// ==================== UTILITIES ====================
const fmtMoney = n => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
const genId = prefix => prefix + Math.floor(1000 + Math.random() * 9000);

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    t.innerHTML = msg;
    t.className = `fixed bottom-6 right-6 z-[200] transform transition-all duration-300 translate-y-0 opacity-100 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 font-medium text-sm ${type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`;
    setTimeout(() => {
        t.classList.replace('translate-y-0', 'translate-y-20');
        t.classList.replace('opacity-100', 'opacity-0');
    }, 3500);
}

// ==================== NAVIGATION AND ROUTING (CORRIGÉ) ====================
function navigate(page) {
    // 1. Cacher toutes les pages (retrait explicite de 'block')
    document.querySelectorAll('.page').forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('block');
    });
    
    // 2. Retirer l'état actif des boutons
    document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
    
    const targetPage = document.getElementById('page-' + page);
    const targetNav = document.getElementById('nav-' + page);
    
    // 3. Afficher la nouvelle page
    if(targetPage) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('block');
    }
    if(targetNav) {
        targetNav.classList.add('active');
    }
    
    const pageTitles = {
        dashboard: 'Tableau de bord de Performance',
        entrepot: 'Entrepôt Principal (Réserve)',
        officine: 'Officine (Rayons de Vente)',
        caisse: 'Caisse POS — Enregistrement des Ordonnances',
        crm: 'CRM Patientèle & Gestion des Crédits',
        inventaire: "Audit de Rapprochement d'Inventaire"
    };
    
    document.getElementById('page-title').textContent = pageTitles[page] || 'Gestion';
    
    // Auto collapse sidebar on mobile layout
    if (window.innerWidth <= 1024) {
        document.getElementById('sidebar').classList.add('-translate-x-full');
        document.getElementById('mob-overlay').classList.add('hidden');
    }
    
    // Core Router triggers
    if(page === 'dashboard') renderDashboard();
    if(page === 'entrepot') renderEntrepot();
    if(page === 'officine') renderOfficine();
    if(page === 'caisse') renderCaisse();
    if(page === 'crm') { showCRMList(); }
    if(page === 'inventaire') renderInventaire();
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mob-overlay');
    if(sb.classList.contains('-translate-x-full')) {
        sb.classList.remove('-translate-x-full');
        ov.classList.remove('hidden');
    } else {
        sb.classList.add('-translate-x-full');
        ov.classList.add('hidden');
    }
}

function openModal(id) {
    document.getElementById(id).classList.add('open');
    if(id === 'modal-add-stock') populateProductSelect('stock-product-select');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// ==================== CORE MODULE: DASHBOARD ====================
function renderDashboard() {
    const todayStr = new Date().toDateString();
    const todaySales = state.sales.filter(s => new Date(s.date).toDateString() === todayStr);
    const dailyCA = todaySales.reduce((sum, s) => sum + s.total, 0);
    const globalStockValue = state.products.reduce((sum, p) => sum + (p.qtyEntrepot + p.qtyOfficine) * p.sellPrice, 0);
    const outOfStockItems = state.products.filter(p => (p.qtyEntrepot + p.qtyOfficine) <= p.alertSeuil);
    const totalDettes = state.clients.reduce((sum, c) => sum + (c.debt || 0), 0);
    
    document.getElementById('stat-ventes').textContent = fmtMoney(dailyCA);
    document.getElementById('stat-ventes-nb').textContent = todaySales.length + ' vente(s) réalisée(s)';
    document.getElementById('stat-stock').textContent = fmtMoney(globalStockValue);
    document.getElementById('stat-ruptures').textContent = outOfStockItems.length;
    document.getElementById('stat-clients').textContent = state.clients.length;
    document.getElementById('stat-dettes-total').textContent = `Créances globales: ${fmtMoney(totalDettes)}`;
    
    renderDashboardWeeklyChart();
    renderDashboardCriticalAlerts(outOfStockItems);
    renderDashboardRecentSalesTable();
}

function renderDashboardWeeklyChart() {
    const dayNames = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const barData = [];
    
    for(let i = 6; i >= 0; i--) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - i);
        const dateStr = targetDate.toDateString();
        const dailyTotal = state.sales.filter(s => new Date(s.date).toDateString() === dateStr).reduce((a, s) => a + s.total, 0);
        barData.push({ label: dayNames[targetDate.getDay()], value: dailyTotal });
    }
    
    const maxVal = Math.max(...barData.map(b => b.value), 1);
    const barsEl = document.getElementById('chart-bars');
    const labelsEl = document.getElementById('chart-labels');
    
    barsEl.innerHTML = '';
    labelsEl.innerHTML = '';
    
    barData.forEach(item => {
        const calculatedHeight = Math.max((item.value / maxVal) * 100, 3); // minimum visual bar indicator
        
        const columnMarkup = document.createElement('div');
        columnMarkup.className = "flex-1 flex flex-col justify-end items-center group relative h-full";
        columnMarkup.innerHTML = `
            <div class="w-full max-w-[36px] bg-blue-600 rounded-t group-hover:bg-blue-500 transition-all duration-500" style="height:${calculatedHeight}%;"></div>
            <span class="absolute -top-8 text-[11px] font-bold text-slate-800 opacity-0 group-hover:opacity-100 transition-all bg-white px-2 py-1 rounded shadow-md border border-gray-100 whitespace-nowrap z-10">${fmtMoney(item.value)}</span>
        `;
        barsEl.appendChild(columnMarkup);
        
        const labelMarkup = document.createElement('div');
        labelMarkup.className = "flex-1 text-center text-xs font-semibold text-gray-500";
        labelMarkup.textContent = item.label;
        labelsEl.appendChild(labelMarkup);
    });
}

function renderDashboardCriticalAlerts(criticalItems) {
    const listContainer = document.getElementById('alerts-list');
    if(!criticalItems.length) {
        listContainer.innerHTML = `
            <div class="text-center py-6 text-gray-400 text-sm font-medium flex flex-col items-center justify-center gap-2">
                <span class="text-emerald-500 text-xl">✓</span> Aucun produit en rupture
            </div>`;
        return;
    }
    
    listContainer.innerHTML = criticalItems.slice(0, 5).map(p => {
        const combinedQty = p.qtyEntrepot + p.qtyOfficine;
        const badgeStyle = combinedQty === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
        return `
            <div class="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100 text-xs">
                <div class="font-semibold text-gray-800 truncate pr-2 max-w-[180px]">${p.name}</div>
                <span class="px-2 py-0.5 rounded-full font-bold ${badgeStyle}">${combinedQty === 0 ? 'Rupture' : combinedQty + ' unités'}</span>
            </div>
        `;
    }).join('');
}

function renderDashboardRecentSalesTable() {
    const tableBody = document.getElementById('recent-sales-body');
    const sortedSales = [...state.sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    
    if(!sortedSales.length) {
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400 font-medium">Aucune facture enregistrée sur la période</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = sortedSales.map(sale => {
        const clientObj = sale.clientId ? state.clients.find(c => c.id === sale.clientId) : null;
        const displayName = clientObj ? clientObj.name : 'Client Comptant';
        const statusBadge = sale.status === 'payé' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';
        const modeLabel = sale.mode === 'especes' ? '💵 Espèces' : sale.mode === 'mobile_money' ? '📱 Mobile' : '📋 Crédit';
        
        return `
            <tr class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3.5 font-bold text-gray-900">${sale.id}</td>
                <td class="px-6 py-3.5 text-gray-600 font-medium">${displayName}</td>
                <td class="px-6 py-3.5 text-xs text-gray-500 font-semibold">${modeLabel}</td>
                <td class="px-6 py-3.5 font-bold text-slate-900">${fmtMoney(sale.total)}</td>
                <td class="px-6 py-3.5 text-gray-400 font-medium">${fmtDate(sale.date)}</td>
                <td class="px-6 py-3.5"><span class="px-2 py-0.5 rounded text-xs font-bold ${statusBadge}">${sale.status}</span></td>
                <td class="px-6 py-3.5 text-right"><button onclick="printFacture('${sale.id}')" class="text-blue-600 hover:text-blue-800 text-xs font-bold border border-gray-200 hover:border-blue-200 px-2.5 py-1 rounded bg-white transition-all shadow-sm">Imprimer Reçu</button></td>
            </tr>
        `;
    }).join('');
}

// ==================== CORE MODULE: RESERVES / WAREHOUSE ====================
function renderEntrepot() {
    const searchFilter = document.getElementById('search-entrepot').value.toLowerCase();
    const tableBody = document.getElementById('entrepot-body');
    const matchedProducts = state.products.filter(p => p.name.toLowerCase().includes(searchFilter) || p.cat.toLowerCase().includes(searchFilter));
    
    if(!matchedProducts.length) {
        tableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-8 text-center text-gray-400 font-medium">Aucune molécule trouvée dans l'entrepôt</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = matchedProducts.map(p => {
        const qty = p.qtyEntrepot;
        const alertClass = qty === 0 ? 'bg-red-100 text-red-700' : qty <= p.alertSeuil ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
        return `
            <tr class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-4"><div class="font-bold text-gray-900">${p.name}</div><div class="text-xs text-gray-400 font-medium">${p.unit}</div></td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold">${p.cat}</span></td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 rounded text-xs font-bold ${alertClass}">${qty} unités</span></td>
                <td class="px-6 py-4 font-medium text-gray-600">${fmtMoney(p.buyPrice)}</td>
                <td class="px-6 py-4 font-bold text-slate-900">${fmtMoney(p.sellPrice)}</td>
                <td class="px-6 py-4 text-xs font-bold text-red-600/80">${p.expiry || '—'}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="openTransferModal('${p.id}')" class="text-blue-600 hover:text-white border border-blue-200 hover:bg-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm">
                        Mettre en Rayon
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function openTransferModal(productId) {
    const prod = state.products.find(p => p.id === productId);
    if(!prod) return;
    state.transferProduct = productId;
    
    document.getElementById('transfer-product-name').textContent = prod.name;
    document.getElementById('transfer-available').textContent = prod.qtyEntrepot + ' unité(s)';
    document.getElementById('transfer-officine-current').textContent = prod.qtyOfficine + ' unité(s)';
    document.getElementById('transfer-qty').value = '';
    
    openModal('modal-transfer');
}

function executeTransfer() {
    const qtyToMove = parseInt(document.getElementById('transfer-qty').value) || 0;
    const prod = state.products.find(p => p.id === state.transferProduct);
    
    if(!prod || qtyToMove <= 0) {
        showToast('⚠️ Veuillez saisir un montant de transfert valide supérieur à zéro', 'error');
        return;
    }
    if(qtyToMove > prod.qtyEntrepot) {
        showToast('⚠️ Stock insuffisant en réserve pour exécuter cette opération', 'error');
        return;
    }
    
    // Core logic adjustments
    prod.qtyEntrepot -= qtyToMove;
    prod.qtyOfficine += qtyToMove;
    
    saveState();
    closeModal('modal-transfer');
    
    // CRITICAL BUG FIX: Refresh the currently visible tables so views are synchronized instantly
    renderEntrepot();
    renderOfficine(); 
    
    showToast(`✅ Mutation interne validée: ${qtyToMove} unités de <b>${prod.name}</b> injectées en officine`);
}

// ==================== CORE MODULE: OFFICINE (RAYONS) ====================
function renderOfficine() {
    const searchFilter = document.getElementById('search-officine').value.toLowerCase();
    const tableBody = document.getElementById('officine-body');
    const matchedProducts = state.products.filter(p => p.name.toLowerCase().includes(searchFilter) || p.cat.toLowerCase().includes(searchFilter));
    
    if(!matchedProducts.length) {
        tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400 font-medium">Aucun médicament disponible dans les rayons de l'officine</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = matchedProducts.map(p => {
        const qty = p.qtyOfficine;
        const statusText = qty === 0 ? 'Rupture Rayon' : qty <= p.alertSeuil ? 'Stock Faible' : 'Disponible';
        const badgeClass = qty === 0 ? 'bg-red-100 text-red-700' : qty <= p.alertSeuil ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
        
        return `
            <tr class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-4"><div class="font-bold text-gray-900">${p.name}</div><div class="text-xs text-gray-400 font-medium">${p.unit}</div></td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold">${p.cat}</span></td>
                <td class="px-6 py-4 font-bold text-gray-800">${qty} unités</td>
                <td class="px-6 py-4 font-bold text-blue-600">${fmtMoney(p.sellPrice)}</td>
                <td class="px-6 py-4"><span class="px-2.5 py-1 rounded text-xs font-bold ${badgeClass}">${statusText}</span></td>
            </tr>
        `;
    }).join('');
}

// ==================== CORE MODULE: CAISSE POS TERMINAL ====================
function renderCaisse() {
    searchProducts();
    
    // Populate client filter drop down list
    const clientSelect = document.getElementById('cart-client');
    clientSelect.innerHTML = '<option value="">— Client Comptant —</option>' + 
        state.clients.map(c => `<option value="${c.id}">${c.name} (${fmtMoney(c.debt || 0)} dette)</option>`).join('');
        
    // Update category filtering metrics
    const uniqueCategories = [...new Set(state.products.map(p => p.cat))];
    const catSelect = document.getElementById('filter-category');
    const previousSelection = catSelect.value;
    catSelect.innerHTML = '<option value="">Toutes catégories</option>' + 
        uniqueCategories.map(c => `<option value="${c}" ${c === previousSelection ? 'selected':''}>${c}</option>`).join('');
        
    updateCartUI();
}

function searchProducts() {
    const query = document.getElementById('search-caisse').value.toLowerCase();
    const catFilter = document.getElementById('filter-category').value;
    const gridContainer = document.getElementById('products-grid');
    
    const matched = state.products.filter(p => {
        const matchesQuery = !query || p.name.toLowerCase().includes(query) || p.cat.toLowerCase().includes(query);
        const matchesCat = !catFilter || p.cat === catFilter;
        return matchesQuery && matchesCat;
    });
    
    if(!matched.length) {
        gridContainer.innerHTML = `<div class="col-span-full text-center py-12 text-gray-400 text-sm font-medium">Aucun produit en stock ou correspondant</div>`;
        return;
    }
    
    gridContainer.innerHTML = matched.map(p => {
        const isOutOfStock = p.qtyOfficine <= 0;
        const colorClass = isOutOfStock ? 'opacity-60 border-gray-200' : 'hover:border-blue-400 hover:shadow-md cursor-pointer';
        const clickTrigger = isOutOfStock ? '' : `onclick="addToCart('${p.id}')"`;
        
        return `
            <div ${clickTrigger} class="bg-white border border-gray-200 rounded-xl p-4 transition-all flex flex-col justify-between ${colorClass}">
                <div>
                    <div class="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-0.5">${p.cat}</div>
                    <div class="font-bold text-gray-900 text-sm leading-tight">${p.name}</div>
                </div>
                <div class="flex justify-between items-end mt-4">
                    <span class="font-display font-bold text-sm text-gray-900">${fmtMoney(p.sellPrice)}</span>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded ${p.qtyOfficine <= p.alertSeuil ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}">
                        ${p.qtyOfficine <= 0 ? 'RUPTURE RAYON' : p.qtyOfficine + ' dispo'}
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

function addToCart(productId) {
    const prod = state.products.find(p => p.id === productId);
    if(!prod || prod.qtyOfficine <= 0) return;
    
    const exist = state.cart.find(item => item.productId === productId);
    if(exist) {
        if(exist.qty >= prod.qtyOfficine) {
            showToast('⚠️ Impossible de dépasser la quantité disponible sur les rayons de l\'officine', 'error');
            return;
        }
        exist.qty++;
    } else {
        state.cart.push({ productId, name: prod.name, qty: 1, price: prod.sellPrice, unit: prod.unit });
    }
    updateCartUI();
}

function updateCartQty(productId, newQty) {
    const prod = state.products.find(p => p.id === productId);
    const cartItem = state.cart.find(c => c.productId === productId);
    if(!cartItem) return;
    
    const parsedQty = parseInt(newQty) || 0;
    if(parsedQty <= 0) {
        removeFromCart(productId);
        return;
    }
    if(parsedQty > prod.qtyOfficine) {
        showToast(`⚠️ Stock insuffisant en officine (${prod.qtyOfficine} max)`, 'error');
        cartItem.qty = prod.qtyOfficine;
    } else {
        cartItem.qty = parsedQty;
    }
    updateCartUI();
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(item => item.productId !== productId);
    updateCartUI();
}

function clearCart() {
    state.cart = [];
    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    const totalAmount = state.cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    
    if(!state.cart.length) {
        container.innerHTML = `
            <div class="text-center py-10 text-gray-400 text-xs font-medium flex flex-col items-center justify-center gap-1">
                <span>🛒 Panier de vente vide</span>
                <span class="text-[10px] text-gray-300">Cliquez sur les produits pour les insérer</span>
            </div>`;
    } else {
        container.innerHTML = state.cart.map(c => `
            <div class="flex justify-between items-center bg-white border border-gray-200 p-3 rounded-xl shadow-sm gap-2">
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-xs text-gray-900 truncate">${c.name}</div>
                    <div class="text-[11px] text-gray-500 font-medium">${fmtMoney(c.price)} / unité</div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button onclick="updateCartQty('${c.productId}', ${c.qty - 1})" class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 font-bold text-sm flex items-center justify-center">-</button>
                    <input type="number" min="1" value="${c.qty}" onchange="updateCartQty('${c.productId}', this.value)" class="w-10 text-center font-bold text-xs border border-gray-200 py-0.5 rounded">
                    <button onclick="updateCartQty('${c.productId}', ${c.qty + 1})" class="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 font-bold text-sm flex items-center justify-center">+</button>
                    <button onclick="removeFromCart('${c.productId}')" class="text-red-500 hover:bg-red-50 p-1 rounded ml-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    document.getElementById('cart-subtotal').textContent = fmtMoney(totalAmount);
    document.getElementById('cart-total').textContent = fmtMoney(totalAmount);
}

function validateSale() {
    if(!state.cart.length) {
        showToast('⚠️ Le panier actif est vide de transactions', 'error');
        return;
    }
    
    const clientId = document.getElementById('cart-client').value;
    const payMode = document.getElementById('payment-mode').value;
    const totalNet = state.cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    
    if(payMode === 'credit' && !clientId) {
        showToast('⚠️ Opération interdite: Les ventes à crédit exigent l\'assignation d\'un profil patient enregistré !', 'error');
        return;
    }
    
    // Deduct only from officine stock parameters
    for(let item of state.cart) {
        const prod = state.products.find(p => p.id === item.productId);
        if(!prod || prod.qtyOfficine < item.qty) {
            showToast(`⚠️ Erreur fatale: Stock officine insuffisant pour la molécule ${item.name}`, 'error');
            return;
        }
    }
    
    // Apply inventory cuts
    state.cart.forEach(item => {
        const prod = state.products.find(p => p.id === item.productId);
        prod.qtyOfficine -= item.qty;
    });
    
    // Create Sale record
    const invoiceNumber = genId('INV-');
    const saleObject = {
        id: invoiceNumber,
        clientId: clientId || '',
        items: [...state.cart],
        total: totalNet,
        mode: payMode,
        date: new Date().toISOString(),
        status: payMode === 'credit' ? 'crédit' : 'payé'
    };
    
    state.sales.push(saleObject);
    
    // Handle Client Debt updates
    if(payMode === 'credit' && clientId) {
        const clientObj = state.clients.find(c => c.id === clientId);
        if(clientObj) clientObj.debt = (clientObj.debt || 0) + totalNet;
    }
    
    // Flush terminal data
    state.cart = [];
    saveState();
    
    // Re-render components
    renderCaisse();
    renderOfficine();
    
    showToast(`✅ Facturation validée avec succès (${fmtMoney(totalNet)})`);
    
    // Trigger advanced printing workflow automatically
    setTimeout(() => {
        if(confirm(`Voulez-vous imprimer le ticket de caisse officiel pour le reçu ${invoiceNumber} ?`)) {
            printFacture(invoiceNumber);
        }
    }, 300);
}

// ==================== CORE MODULE: ADVANCED PRINT RECEIPTS ====================
function printFacture(saleId) {
    const sale = state.sales.find(s => s.id === saleId);
    if(!sale) return;
    
    const clientName = sale.clientId ? (state.clients.find(c => c.id === sale.clientId)?.name || 'Patient Enregistré') : 'Client Comptant';
    const rawClientObj = sale.clientId ? state.clients.find(c => c.id === sale.clientId) : null;
    
    let modeLabel = "CHÈQUE / COMPTANT";
    if (sale.mode === 'especes') modeLabel = "ESPÈCES";
    if (sale.mode === 'mobile_money') modeLabel = "MOBILE MONEY (ELECTRONIQUE)";
    if (sale.mode === 'credit') modeLabel = "COMPTE CRÉDIT (À RECOUVRER)";
    
    const printArea = document.getElementById('print-receipt-area');
    
    // Génération du HTML du ticket
    printArea.innerHTML = `
        <div style="max-width: 300px; margin: 0 auto; padding: 20px; font-family: 'Courier New', monospace; color: #000; background: #fff;">
            <div style="text-align: center; line-height: 1.3; border-bottom: 1px dashed #000; padding-bottom: 12px; margin-bottom: 12px;">
                <h2 style="font-size: 16px; margin: 0 0 4px 0; font-weight: bold;">PHARMACIE DR SOKO WAZA</h2>
                <p style="margin: 0; font-size: 12px; font-weight: bold;">MEDECINELIGNE</p>
                <p style="margin: 4px 0 0 0; font-size: 11px;">Abidjan, Cocody Abatta</p>
                <p style="margin: 2px 0 0 0; font-size: 11px;">Tél: +225 07 00 11 22</p>
            </div>
            
            <div style="font-size: 11px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed #000;">
                <div style="margin-bottom: 4px;"><b>TICKET N° :</b> ${sale.id}</div>
                <div style="margin-bottom: 4px;"><b>DATE :</b> ${fmtDate(sale.date)}</div>
                <div style="margin-bottom: 4px;"><b>CAISSIER :</b> G. Camus D.</div>
                <div style="margin-bottom: 4px;"><b>CLIENT :</b> ${clientName}</div>
                ${rawClientObj && sale.mode === 'credit' ? `<div><b>DETTE RESTANTE :</b> ${fmtMoney(rawClientObj.debt || 0)}</div>` : ''}
            </div>
            
            <table style="width: 100%; font-size: 11px; text-align: left; border-collapse: collapse; margin-bottom: 12px;">
                <thead>
                    <tr style="border-bottom: 1px solid #000;">
                        <th style="padding-bottom: 4px; width: 50%;">Article</th>
                        <th style="text-align: center; padding-bottom: 4px; width: 15%;">Qté</th>
                        <th style="text-align: right; padding-bottom: 4px; width: 35%;">Montant</th>
                    </tr>
                </thead>
                <tbody>
                    ${sale.items.map(item => `
                        <tr>
                            <td style="padding: 6px 0;">${item.name}</td>
                            <td style="text-align: center; padding: 6px 0;">${item.qty}</td>
                            <td style="text-align: right; padding: 6px 0;">${fmtMoney(item.price * item.qty)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <div style="font-size: 11px; border-top: 1px dashed #000; padding-top: 8px; text-align: right; margin-bottom: 15px;">
                <div style="font-size: 14px; font-weight: bold; margin-top: 4px;">TOTAL : ${fmtMoney(sale.total)}</div>
                <div style="font-size: 10px; margin-top: 6px; font-style: italic;">Règlement : ${modeLabel}</div>
            </div>
            
            <div style="text-align: center; font-size: 10px; border-top: 1px solid #000; padding-top: 10px;">
                <p style="margin: 0; font-weight: bold;">Les médicaments ne sont ni repris ni échangés.</p>
                <p style="margin: 6px 0 0 0; color:#555;">Solution logicielle : Agence Satmak</p>
                <p style="margin: 2px 0 0 0;">Merci de votre visite !</p>
            </div>
        </div>
    `;
    
    // Démasquer la zone pour l'impression
    printArea.classList.remove('hidden');
    
    // Lancer la fenêtre d'impression du navigateur
    window.print();
    
    // Remasquer la zone une fois l'impression lancée/annulée
    printArea.classList.add('hidden');
}

// ==================== CORE MODULE: CRM & CLIENTS ====================
function renderCRM() {
    const filter = document.getElementById('search-crm').value.toLowerCase();
    const body = document.getElementById('crm-body');
    const records = state.clients.filter(c => c.name.toLowerCase().includes(filter) || c.phone.includes(filter));
    
    if(!records.length) {
        body.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400 font-medium">Aucun profil patient correspondant</td></tr>`;
        return;
    }
    
    body.innerHTML = records.map(c => {
        const clientSales = state.sales.filter(s => s.clientId === c.id);
        const totalSpent = clientSales.reduce((sum, s) => sum + s.total, 0);
        const debt = c.debt || 0;
        
        return `
            <tr class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-xs flex-shrink-0">${c.name.charAt(0).toUpperCase()}</div>
                        <div>
                            <div class="font-bold text-gray-900">${c.name}</div>
                            <div class="text-xs text-gray-400 font-medium">${c.address || '—'}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 font-medium text-gray-500">${c.phone || '—'}</td>
                <td class="px-6 py-4 font-bold text-gray-700">${clientSales.length} facture(s)</td>
                <td class="px-6 py-4"><span class="px-2.5 py-0.5 rounded text-xs font-bold ${debt > 0 ? 'bg-red-100 text-red-700':'bg-green-100 text-green-700'}">${debt > 0 ? fmtMoney(debt) : 'Soldé'}</span></td>
                <td class="px-6 py-4 text-right space-x-1">
                    <button onclick="showClientDetail('${c.id}')" class="text-slate-600 hover:text-slate-900 border border-gray-200 hover:bg-gray-50 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all shadow-sm">Ouvrir Dossier</button>
                    ${debt > 0 ? `<button onclick="payClientDebt('${c.id}', ${debt})" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-2.5 py-1 rounded-lg transition-all shadow-sm">Recouvrer Solder</button>`:''}
                </td>
            </tr>
        `;
    }).join('');
}

function showClientDetail(clientId) {
    const client = state.clients.find(c => c.id === clientId);
    if(!client) return;
    
    document.getElementById('crm-list-view').classList.add('hidden');
    document.getElementById('crm-detail-view').classList.remove('hidden');
    document.getElementById('detail-client-name').textContent = client.name;
    
    const associatedSales = state.sales.filter(s => s.clientId === clientId);
    const cumulativeSpent = associatedSales.reduce((a, b) => a + b.total, 0);
    const balance = client.debt || 0;
    
    document.getElementById('detail-total').textContent = fmtMoney(cumulativeSpent);
    document.getElementById('detail-nb').textContent = associatedSales.length;
    document.getElementById('detail-solde').textContent = fmtMoney(balance);
    document.getElementById('detail-solde').className = `font-display text-2xl font-bold mt-1 ${balance > 0 ? 'text-red-600' : 'text-green-600'}`;
    
    const invoicesBody = document.getElementById('detail-invoices');
    if(!associatedSales.length) {
        invoicesBody.innerHTML = `<tr><td colspan="6" class="px-6 py-6 text-center text-gray-400 font-medium">Aucune ligne de facture sur ce dossier</td></tr>`;
        return;
    }
    
    invoicesBody.innerHTML = [...associatedSales].sort((a,b) => new Date(b.date) - new Date(a.date)).map(sale => {
        const badgeColor = sale.status === 'payé' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';
        return `
            <tr class="hover:bg-gray-50/50 transition-colors">
                <td class="px-6 py-3.5 font-bold text-gray-900">${sale.id}</td>
                <td class="px-6 py-3.5 text-gray-400 font-medium">${fmtDate(sale.date)}</td>
                <td class="px-6 py-3.5 text-gray-600 font-medium max-w-[220px] truncate">${sale.items.map(i=>i.name + ' x' + i.qty).join(', ')}</td>
                <td class="px-6 py-3.5 font-bold text-gray-900">${fmtMoney(sale.total)}</td>
                <td class="px-6 py-3.5"><span class="px-2 py-0.5 rounded text-xs font-bold ${badgeColor}">${sale.status}</span></td>
                <td class="px-6 py-3.5 text-right"><button onclick="printFacture('${sale.id}')" class="text-blue-600 hover:underline text-xs font-bold">Imprimer</button></td>
            </tr>
        `;
    }).join('');
}

function showCRMList() {
    document.getElementById('crm-list-view').classList.remove('hidden');
    document.getElementById('crm-detail-view').classList.add('hidden');
    renderCRM();
}

function payClientDebt(clientId, amount) {
    const client = state.clients.find(c => c.id === clientId);
    if(!client) return;
    
    if(confirm(`Voulez-vous encaisser le règlement global de créance pour ${client.name} d'un montant de ${fmtMoney(amount)} ?`)) {
        client.debt = 0;
        
        // Mark all credit invoices for this client as fully paid
        state.sales.filter(s => s.clientId === clientId && s.status === 'crédit').forEach(s => s.status = 'payé');
        
        saveState();
        renderCRM();
        showToast(`✅ Balance soldée avec succès pour le patient <b>${client.name}</b>`);
        
        // If viewing deep details, update metrics live
        if(!document.getElementById('crm-detail-view').classList.contains('hidden')) {
            showClientDetail(clientId);
        }
    }
}

// ==================== CORE MODULE: INVENTAIRE (RAPPROCHEMENT) ====================
function renderInventaire() {
    const body = document.getElementById('inventaire-body');
    const tableRows = [];
    
    state.products.forEach(p => {
        ['entrepot', 'officine'].forEach(locationKey => {
            const theoreticalQty = locationKey === 'entrepot' ? p.qtyEntrepot : p.qtyOfficine;
            const recordKey = p.id + '_' + locationKey;
            
            const physicalSavedVal = state.inventoryPhysical[recordKey];
            const physicalInputValue = physicalSavedVal !== undefined ? physicalSavedVal : '';
            
            let ecartQty = '';
            let ecartFinancier = '';
            let statusBadge = '<span class="px-2.5 py-0.5 rounded bg-gray-100 text-gray-500 font-bold text-xs">En attente d\'audit</span>';
            
            if(physicalInputValue !== '') {
                ecartQty = parseInt(physicalInputValue) - theoreticalQty;
                ecartFinancier = ecartQty * p.sellPrice;
                
                if(ecartQty === 0) {
                    statusBadge = '<span class="px-2.5 py-0.5 rounded bg-green-100 text-green-700 font-bold text-xs">✓ Conforme</span>';
                } else if(ecartQty < 0) {
                    statusBadge = `<span class="px-2.5 py-0.5 rounded bg-red-100 text-red-700 font-bold text-xs">⚠ Perte (${ecartQty})</span>`;
                } else {
                    statusBadge = `<span class="px-2.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-xs">+ Surplus (+${ecartQty})</span>`;
                }
            }
            
            tableRows.push(`
                <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-6 py-3.5 font-bold text-gray-900">${p.name}</td>
                    <td class="px-6 py-3.5"><span class="px-2 py-0.5 rounded font-bold text-xs ${locationKey === 'entrepot' ? 'bg-indigo-50 text-indigo-700':'bg-amber-50 text-amber-700'}">${locationKey === 'entrepot' ? 'Entrepôt':'Rayons Officine'}</span></td>
                    <td class="px-6 py-3.5 font-bold text-gray-700">${theoreticalQty} u.</td>
                    <td class="px-6 py-3.5">
                        <input type="number" min="0" value="${physicalInputValue}" placeholder="Saisir comptage..." oninput="registerPhysicalCount('${recordKey}', this.value)" class="w-full max-w-[130px] px-3 py-1 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500 font-semibold">
                    </td>
                    <td class="px-6 py-3.5 font-bold ${ecartQty === '' ? 'text-gray-400' : ecartQty < 0 ? 'text-red-600': ecartQty > 0 ? 'text-blue-600' : 'text-green-600'}">
                        ${ecartQty !== '' ? (ecartQty > 0 ? '+' + ecartQty : ecartQty) + ' u.' : '—'}
                    </td>
                    <td class="px-6 py-3.5 font-medium text-gray-500">
                        ${ecartFinancier !== '' ? fmtMoney(ecartFinancier) : '—'}
                    </td>
                    <td class="px-6 py-3.5">${statusBadge}</td>
                </tr>
            `);
        });
    });
    
    body.innerHTML = tableRows.join('');
    updateInventorySummaryCounters();
}

function registerPhysicalCount(recordKey, value) {
    if(value === '') {
        delete state.inventoryPhysical[recordKey];
    } else {
        state.inventoryPhysical[recordKey] = Math.max(0, parseInt(value) || 0);
    }
    saveState();
    updateInventorySummaryCounters();
}

function updateInventorySummaryCounters() {
    let conforme = 0, perte = 0, surplus = 0;
    
    state.products.forEach(p => {
        ['entrepot', 'officine'].forEach(loc => {
            const theo = loc === 'entrepot' ? p.qtyEntrepot : p.qtyOfficine;
            const key = p.id + '_' + loc;
            const phys = state.inventoryPhysical[key];
            
            if(phys === undefined) return;
            const delta = phys - theo;
            if(delta === 0) conforme++;
            else if(delta < 0) perte++;
            else surplus++;
        });
    });
    
    // Safety check because components might change view
    const confEl = document.getElementById('inv-conforme-count');
    const pertEl = document.getElementById('inv-perte-count');
    const surpEl = document.getElementById('inv-surplus-count');
    
    if(confEl) confEl.textContent = conforme + " sous-ensemble(s)";
    if(pertEl) pertEl.textContent = perte + " anomalie(s)";
    if(surpEl) surpEl.textContent = surplus + " excédent(s)";
}

function resetInventaire() {
    if(confirm('Voulez-vous supprimer l\'intégralité des comptages physiques saisis en cours ?')) {
        state.inventoryPhysical = {};
        saveState();
        renderInventaire();
    }
}

// CRITICAL EXCLUSIVE ERP FEATURE: Commit and Adjust Stock permanently
function appliquerAjustementsGlobaux() {
    const keys = Object.keys(state.inventoryPhysical);
    if(!keys.length) {
        showToast("⚠️ Aucun comptage physique n'a été saisi pour déclencher l'ajustement", 'error');
        return;
    }
    
    if(confirm(`🚨 ATTENTION LOGISTIQUE ! Vous allez écraser les stocks théoriques actuels par les valeurs physiques comptées pour ${keys.length} ligne(s). Êtes-vous sûr ?`)) {
        
        keys.forEach(key => {
            const [prodId, locationKey] = key.split('_');
            const targetProduct = state.products.find(p => p.id === prodId);
            const physicalCounted = state.inventoryPhysical[key];
            
            if(targetProduct && physicalCounted !== undefined) {
                if(locationKey === 'entrepot') {
                    targetProduct.qtyEntrepot = physicalCounted;
                } else if(locationKey === 'officine') {
                    targetProduct.qtyOfficine = physicalCounted;
                }
            }
        });
        
        // Clear matching tables
        state.inventoryPhysical = {};
        saveState();
        
        // Sync everything globally
        renderInventaire();
        renderEntrepot();
        renderOfficine();
        
        showToast("🚀 Rapprochement validé ! Les bases de données de stocks ont été corrigées avec succès.");
    }
}

// ==================== OPERATIONAL DATA MANIPULATIONS ====================
function addProduct() {
    const name = document.getElementById('np-name').value.trim();
    const cat = document.getElementById('np-cat').value.trim() || 'Médicaments Génériques';
    const unit = document.getElementById('np-unit').value.trim() || 'Boîte';
    const buyPrice = parseFloat(document.getElementById('np-buy').value) || 0;
    const sellPrice = parseFloat(document.getElementById('np-sell').value) || 0;
    const qtyReserve = parseInt(document.getElementById('np-qty').value) || 0;
    const alertSeuil = parseInt(document.getElementById('np-alert').value) || 10;
    const expiry = document.getElementById('np-exp').value.trim();
    
    if(!name || buyPrice <= 0 || sellPrice <= 0) {
        showToast('⚠️ Saisie invalide: Désignation, Prix d\'achat et Prix de vente requis', 'error');
        return;
    }
    
    const newId = genId('p');
    state.products.push({
        id: newId, name, cat, unit, buyPrice, sellPrice, qtyEntrepot: qtyReserve, qtyOfficine: 0, alertSeuil, expiry
    });
    
    saveState();
    closeModal('modal-add-product');
    
    // Flush input text areas
    ['np-name','np-cat','np-unit','np-buy','np-sell','np-qty','np-alert','np-exp'].forEach(id => document.getElementById(id).value = '');
    
    renderEntrepot();
    showToast(`✅ Molécule enregistrée: <b>${name}</b> insérée en entrepôt`);
}

function populateProductSelect(selectId) {
    const dropdown = document.getElementById(selectId);
    dropdown.innerHTML = '<option value="">— Sélectionner l\'article —</option>' + 
        state.products.map(p => `<option value="${p.id}">${p.name} (Réserve: ${p.qtyEntrepot})</option>`).join('');
}

function receiveStock() {
    const productId = document.getElementById('stock-product-select').value;
    const deliveredQty = parseInt(document.getElementById('stock-qty').value) || 0;
    const customBuyPrice = parseFloat(document.getElementById('stock-buy-price').value) || 0;
    
    if(!productId || deliveredQty <= 0) {
        showToast('⚠️ Erreur: Sélection produit et quantité d\'entrée requises', 'error');
        return;
    }
    
    const targetProduct = state.products.find(p => p.id === productId);
    targetProduct.qtyEntrepot += deliveredQty;
    if(customBuyPrice > 0) targetProduct.buyPrice = customBuyPrice;
    
    saveState();
    closeModal('modal-add-stock');
    
    renderEntrepot();
    showToast(`✅ Lot réceptionné: +${deliveredQty} unités sur la fiche de <b>${targetProduct.name}</b>`);
    
    document.getElementById('stock-qty').value = '';
    document.getElementById('stock-buy-price').value = '';
}

function addClient() {
    const name = document.getElementById('nc-name').value.trim();
    const phone = document.getElementById('nc-phone').value.trim();
    const address = document.getElementById('nc-address').value.trim();
    
    if(!name || !phone) {
        showToast('⚠️ Nom complet et numéro de téléphone mobile obligatoires', 'error');
        return;
    }
    
    const clientId = genId('c');
    state.clients.push({ id: clientId, name, phone, address, debt: 0 });
    
    saveState();
    closeModal('modal-add-client');
    
    document.getElementById('nc-name').value = '';
    document.getElementById('nc-phone').value = '';
    document.getElementById('nc-address').value = '';
    
    renderCRM();
    showToast(`✅ Nouveau dossier patient rattaché au nom de <b>${name}</b>`);
}

// ==================== BIND TO GLOBAL SCOPE FOR COMPATIBILITY ====================
window.navigate = navigate;
window.toggleSidebar = toggleSidebar;
window.openModal = openModal;
window.closeModal = closeModal;
window.executeTransfer = executeTransfer;
window.openTransferModal = openTransferModal;
window.searchProducts = searchProducts;
window.addToCart = addToCart;
window.updateCartQty = updateCartQty;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.validateSale = validateSale;
window.printFacture = printFacture;
window.showClientDetail = showClientDetail;
window.showCRMList = showCRMList;
window.payClientDebt = payClientDebt;
window.registerPhysicalCount = registerPhysicalCount;
window.resetInventaire = resetInventaire;
window.appliquerAjustementsGlobaux = appliquerAjustementsGlobaux;
window.addProduct = addProduct;
window.receiveStock = receiveStock;
window.addClient = addClient;
window.renderEntrepot = renderEntrepot;
window.renderOfficine = renderOfficine;
window.renderCRM = renderCRM;

// ==================== APP INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    loadState();
    renderDashboard();
});