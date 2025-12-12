    // === Configuration Authgear 
const AUTHGEAR_CLIENT_ID = 'd84a3c572ba550ba' 
const AUTHGEAR_ENDPOINT = 'https://there-2oyy25.authgear.cloud' 
const CALLBACK_PATH = '/callback.html' //redirection

// === Variables d'état ===
let allProducts = []
let categories = []
let cart = {products: []} 
let user = null
let token = localStorage.getItem('token') || null

// --- Afficher erreurs utilisateur ---
function showError(msg){
  alert(msg)
  console.error(msg)
}

// --- Mock Authgear pour demo locale ---
const mockAuthgear = {
  isConfigured: false,
  async login(email, password){
    // simple validation demo
    if(!email || !password) throw new Error('Credentials missing')
    const demoToken = 'demo-token-' + btoa(email + ':' + Date.now())
    localStorage.setItem('token', demoToken)
    token = demoToken
    user = {email, sub: 'demo-'+btoa(email)}
    console.log('TOKEN =', token)
    return {access_token: token}
  },
  async logout(){
    localStorage.removeItem('token')
    token = null
    user = null
  },
  async fetchUserInfo(){
    if(!token) throw new Error('not authenticated')
    return user || {email: 'demo@example.com', sub: 'demo-user'}
  }
}

// --- Authgear bridge: si SDK existe on peut l'utiliser, sinon fallback ---
const AuthBridge = (function(){
  // detecter window.Authgear si inclu via SDK
  if(window.Authgear && AUTHGEAR_CLIENT_ID && AUTHGEAR_ENDPOINT){
    //Importer @authgear/web dans la page
    const ag = new window.Authgear({clientID: AUTHGEAR_CLIENT_ID, endpoint: AUTHGEAR_ENDPOINT})
    return {
      isConfigured: true,
      authorize: (...args) => ag.authorize(...args),
      finishAuthorization: (...args) => ag.finishAuthorization(...args),
      sessionAccessToken: () => ag.sessionAccessToken,
      login: async (email, password) => {
        throw new Error('Utilisez le flux Authgear via authorize() et callback.')
      },
      logout: () => ag.logout(),
      fetchUserInfo: () => ag.fetchUserInfo()
    }
  }
  return mockAuthgear
})()

// --- SPA navigation ---
function navigate(page){
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'))
  const el = document.getElementById('page-'+page)
  if(el) el.classList.remove('hidden')
  // mettre à jour active nav buttons (simple)
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav===page))
}

document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', ()=>{
  const page = b.dataset.nav
  const logged = !!localStorage.getItem('token')
  if(page !== 'login' && !logged){
    navigate('login')
    return
  }
  navigate(page)
}))

// Search inputs
document.getElementById('searchInput').addEventListener('input', (e)=>{ searchProduct(e.target.value) })
document.getElementById('searchInputSide').addEventListener('input', (e)=>{ searchProduct(e.target.value) })
document.getElementById('categoryFilter').addEventListener('change', (e)=>{ filterByCategory(e.target.value) })
document.getElementById('categoryFilterSide').addEventListener('change', (e)=>{ filterByCategory(e.target.value) })

// Profile toggle + logout
document.getElementById('btnProfile').addEventListener('click', toggleProfile)
document.getElementById('btnLogout').addEventListener('click', async ()=>{
  try{
    await AuthBridge.logout()
  }catch(err){ console.warn(err) }
  localStorage.removeItem('token')
  document.cookie = 'token=; path=/; max-age=0'
  token = null
  user = null
  updateUIAuth()
  navigate('login')
})

function toggleProfile(){
  const box = document.getElementById('profileBox')
  box.classList.toggle('hidden')
  if(!box.classList.contains('hidden')) loadUserProfile()
}

// --- Login form handling ---
document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault()
  const email = document.getElementById('email').value
  const password = document.getElementById('password').value
  try{
    const res = await AuthBridge.login(email,password)
    // si le bridge retourne un token, on l'affiche et le stocke
    if(res && res.access_token){
      token = res.access_token
      localStorage.setItem('token', token)
      document.cookie = 'token=' + encodeURIComponent(token) + '; path=/'
      console.log('TOKEN =', token)
      const infoEl = document.getElementById('loginTokenInfo')
      if(infoEl) infoEl.innerText = 'Token: ' + token
    }
    updateUIAuth()
    navigate('home')
  }catch(err){
    console.error(err)
    showError('Erreur de connexion: '+(err.message||err))
  }
})

// Button login via Authgear (redirect flow)
document.getElementById('btnAuthgearLogin').addEventListener('click', async ()=>{
  if(!AUTHGEAR_CLIENT_ID || !AUTHGEAR_ENDPOINT){
    alert('Authgear non configuré. Mode demo utilisé.');
    return;
  }
  
  alert('Lancer le flux Authgear via SDK (voir commentaire dans le code)')
})

// --- Produits: FakeStoreAPI ---
async function loadProducts(){
  try{
    const res = await fetch('https://fakestoreapi.com/products')
    if(!res.ok) throw new Error('Impossible de charger les produits')
    allProducts = await res.json()
    categories = Array.from(new Set(allProducts.map(p=>p.category)))
    populateCategoryFilters()
    displayProducts(allProducts)
    document.getElementById('productCount').innerText = `${allProducts.length} produits`;
  }catch(err){
    showError('Erreur chargement produits: '+err.message)
  }
}

function populateCategoryFilters(){
  const sel = document.getElementById('categoryFilter')
  const sel2 = document.getElementById('categoryFilterSide')
  categories.forEach(c=>{
    const o = document.createElement('option'); o.value = c; o.innerText = c; sel.appendChild(o)
    const o2 = o.cloneNode(true); sel2.appendChild(o2)
  })
}

function displayProducts(list){
  const c = document.getElementById('products')
  c.innerHTML = list.map(p=>`
    <div class="card product">
      <h4>${escapeHtml(p.title)}</h4>
      <img src="${p.image}" alt="${escapeHtml(p.title)}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <div><strong>${p.price} $</strong></div>
        <div style="display:flex;gap:8px">
          <button class="btn ghost" onclick="viewDetail(${p.id})">Voir plus</button>
          <button class="btn" onclick="addToCart(${p.id})">Add to Cart</button>
        </div>
      </div>
    </div>
  `).join('')
}

// Security helper for small demo to avoid injecting raw HTML
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

async function viewDetail(id){
  try{
    const res = await fetch('https://fakestoreapi.com/products/'+id)
    if(!res.ok) throw new Error('Produit introuvable')
    const p = await res.json()
    document.getElementById('modalDetail').innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start">
        <img src="${p.image}" style="width:160px;height:160px;object-fit:contain">
        <div>
          <h3>${escapeHtml(p.title)}</h3>
          <p class="small muted">${escapeHtml(p.category)}</p>
          <p>${escapeHtml(p.description)}</p>
          <p><strong>${p.price} $</strong></p>
          <div style="display:flex;gap:8px">
            <button class="btn" onclick="addToCart(${p.id})">Add to Cart</button>
            <button class="btn ghost" onclick="closeProductModal()">Fermer</button>
          </div>
        </div>
      </div>
    `
    document.getElementById('productModal').classList.remove('hidden')
  }catch(err){ showError(err.message) }
}

function closeProductModal(){
  document.getElementById('productModal').classList.add('hidden')
  document.getElementById('modalDetail').innerHTML = ''
}

// --- Cart: stockage local pour demo (simule endpoints) ---
function loadCartFromStorage(){
  try{
    const s = localStorage.getItem('demo_cart')
    cart = s ? JSON.parse(s) : {products: []}
  }catch(err){ cart = {products: []} }
  updateCartCount();
}

function saveCartToStorage(){ localStorage.setItem('demo_cart', JSON.stringify(cart)); updateCartUI(); updateCartCount() }

async function addToCart(productId){
  try{
    const p = allProducts.find(x=>x.id===productId)
    if(!p) throw new Error('Produit introuvable')
    const existing = cart.products.find(x=>x.productId===productId)
    if(existing) existing.quantity += 1
    else cart.products.push({productId, quantity:1, price:p.price, title:p.title, image:p.image})
    saveCartToStorage()
  }catch(err){ showError(err.message) }
}

// Met à jour l'affichage du panier
function updateCartUI(){
  const container = document.getElementById('cartItems')
  if(!cart.products.length){ container.innerHTML = '<div class="small muted">Votre panier est vide</div>'; document.getElementById('cartTotal').innerText = '0 $'; return }
  container.innerHTML = cart.products.map(item=>`
    <div class="cart-item" style="justify-content:space-between;padding:8px;border-bottom:1px solid #eee">
      <div style="display:flex;gap:8px;align-items:center">
        <img src="${item.image}">
        <div>
          <div style="font-weight:700">${escapeHtml(item.title)}</div>
          <div class="small muted">${item.price} $</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <button onclick="changeQty(${item.productId}, -1)" class="btn ghost">-</button>
        <div>${item.quantity}</div>
        <button onclick="changeQty(${item.productId}, 1)" class="btn ghost">+</button>
        <button onclick="removeItem(${item.productId})" class="btn ghost">Supprimer</button>
      </div>
    </div>
  `).join('')
  document.getElementById('cartTotal').innerText = calculateTotal() + ' $'
}

function changeQty(productId, delta){
  const it = cart.products.find(x=>x.productId===productId)
  if(!it) return
  it.quantity += delta
  if(it.quantity<=0) cart.products = cart.products.filter(x=>x.productId!==productId)
  saveCartToStorage()
}

function removeItem(productId){ cart.products = cart.products.filter(x=>x.productId!==productId); saveCartToStorage() }

function calculateTotal(){ return cart.products.reduce((s,p)=>s + (p.price * p.quantity), 0).toFixed(2) }

function updateCartCount(){
  const count = cart.products.reduce((s,p)=>s+p.quantity,0)
  document.getElementById('cartCount').innerText = `Panier (${count})`
}

// --- Search & Filter ---
function searchProduct(keyword){
  const k = keyword.trim().toLowerCase()
  const filtered = allProducts.filter(p => p.title.toLowerCase().includes(k) || p.description.toLowerCase().includes(k))
  displayProducts(filtered)
}

function filterByCategory(cat){
  if(!cat) displayProducts(allProducts)
  else displayProducts(allProducts.filter(p=>p.category===cat))
}

// --- User profile ---
async function loadUserProfile(){
  try{
    if(!token) { document.getElementById('profileContent').innerText = 'Aucun utilisateur connecté'; return }
    const info = await AuthBridge.fetchUserInfo()
    document.getElementById('profileContent').innerHTML = `Email: ${escapeHtml(info.email || info.sub || '—')}<br>ID: ${escapeHtml(info.sub||'—')}`
  }catch(err){ document.getElementById('profileContent').innerText = 'Erreur récupération profil' }
}

function updateUIAuth(){
  const logged = !!localStorage.getItem('token')
  document.getElementById('btnLogout').classList.toggle('hidden', !logged)
  document.getElementById('navLogin').classList.toggle('hidden', logged)
  document.getElementById('btnProfile').classList.toggle('hidden', !logged)
  const infoEl = document.getElementById('loginTokenInfo')
  if(infoEl){
    if(logged){
      const t = localStorage.getItem('token')
      infoEl.innerText = 'Token: ' + t
    }else{
      infoEl.innerText = ''
    }
  }
  if(logged) loadUserProfile()
}

// --- Init ---
window.addEventListener('load', async ()=>{
  // charger produits
  await loadProducts()
  loadCartFromStorage()
  updateCartUI()
  updateUIAuth()
  const t = localStorage.getItem('token')
  if(t){
    console.log('TOKEN =', t)
  }
  // Tout le monde commence sur la page d'authentification
  navigate('login')
})

// Expose certaines fonctions pour les boutons inline
window.viewDetail = viewDetail
window.addToCart = addToCart
window.changeQty = changeQty
window.removeItem = removeItem
window.closeProductModal = closeProductModal