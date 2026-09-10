const API_BASE = 'http://localhost:3000';
const TOKEN_KEY = 'utsaho_user_token';
const USER_KEY = 'utsaho_user';

let products = [];
let cart = [];
let modalProduct = null;
let modalQty = 1;
let selectedPayment = 'cod';
let pendingOrder = null;
let searchTimer = null;
let currentFilter = 'all';
let currentSort = 'newest';
let wishlistIds = new Set();
let appliedCoupon = null;
let modalImageIndex = 0;

const CURRENCY = '৳';
const BKASH_NUMBER = '01600-164055';
const NAGAD_NUMBER = '01600-164055';
const WHATSAPP_NUMBER = '8801600164055';
const FREE_DELIVERY_THRESHOLD = 2000;

const DELIVERY_AREAS = {
    khulsi: { label: 'Khulsi', fee: 30 },
    chattogram_city: { label: 'Chattogram City', fee: 50 },
    outside_city: { label: 'Outside City', fee: 100 },
    pickup: { label: 'Pickup from Shop (Khulsi)', fee: 0 }
};

const CATEGORY_LABELS = {
    candle: 'Candle',
    dress: 'Heritage Dresses',
    decor: 'Home Decor',
    soap: 'Soap & Cosmetics',
    jewelry: 'Jewelry',
    bags: 'Bags & Accessories',
    festive: 'Festive Items',
    jute: 'Jute Crafts'
};

/* ---------------- MOBILE MENU ---------------- */

function toggleMobileMenu() {
    document.getElementById('navLinks').classList.toggle('open');
    document.getElementById('hamburger').classList.toggle('open');
}

function closeMobileMenu() {
    document.getElementById('navLinks').classList.remove('open');
    document.getElementById('hamburger').classList.remove('open');
}

/* ---------------- PRODUCTS ---------------- */

async function fetchProducts(search = '') {
    try {
        let url = `${API_BASE}/api/products`;
        const params = new URLSearchParams();
        if (currentFilter && currentFilter !== 'all') params.set('category', currentFilter);
        if (search) params.set('search', search);
        if (params.toString()) url += `?${params.toString()}`;

        const response = await fetch(url);
        products = await response.json();
        renderProducts();
        updateFilterButtons();
    } catch (err) {
        console.error('Failed to load products:', err);
        showToast('Failed to load products');
    }
}

function sortedProducts() {
    const list = [...products];
    switch (currentSort) {
        case 'price-low':
            return list.sort((a, b) => Number(a.price) - Number(b.price));
        case 'price-high':
            return list.sort((a, b) => Number(b.price) - Number(a.price));
        case 'name':
            return list.sort((a, b) => a.name.localeCompare(b.name));
        case 'rating':
            return list.sort((a, b) =>
                (Number(b.avg_rating || 0) - Number(a.avg_rating || 0)) ||
                (Number(b.review_count || 0) - Number(a.review_count || 0)) ||
                (b.id - a.id)
            );
        case 'sale':
            return list.sort((a, b) => {
                const dA = (a.original_price && Number(a.original_price) > Number(a.price)) ? Number(a.original_price) - Number(a.price) : -1;
                const dB = (b.original_price && Number(b.original_price) > Number(b.price)) ? Number(b.original_price) - Number(b.price) : -1;
                return dB - dA;
            });
        case 'newest':
        default:
            return list.sort((a, b) => b.id - a.id);
    }
}

function setSort(value) {
    currentSort = value;
    renderProducts();
}

function renderProducts() {
    const grid = document.getElementById('productGrid');
    const list = sortedProducts();

    if (list.length === 0) {
        grid.innerHTML = `
            <div class="empty-store">
                <div class="empty-store-icon">🛍️</div>
                <h3>Products coming soon!</h3>
                <p>Our handcrafted treasures are being prepared by our artisans.<br>Please check back later or contact us to pre-order.</p>
            </div>`;
        return;
    }

    grid.innerHTML = list.map(product => {
        const stockBadge = product.stock <= 0
            ? '<p class="stock-badge out">Out of Stock</p>'
            : product.stock < 5
                ? `<p class="stock-badge low">Only ${product.stock} left!</p>`
                : '<p class="stock-badge in">&#10004; In Stock</p>';

        const badges = [
            product.featured ? '<span class="badge featured">Featured</span>' : '',
            product.new ? '<span class="badge new">New</span>' : '',
            (product.original_price && Number(product.original_price) > Number(product.price))
                ? '<span class="badge sale">SALE</span>' : ''
        ].filter(Boolean).join('') || '';

        const imageHtml = product.image_url
            ? `<img class="product-img" src="${API_BASE}${product.image_url}" alt="${product.name}" loading="lazy">`
            : `<div class="product-image">${product.emoji || '🛍️'}</div>`;

        const isOnSale = product.original_price && Number(product.original_price) > Number(product.price);
        const priceHtml = isOnSale
            ? `<p class="product-price"><span class="orig-price">${CURRENCY}${Number(product.original_price).toLocaleString()}</span> ${CURRENCY}${Number(product.price).toLocaleString()}</p>`
            : `<p class="product-price">${CURRENCY}${Number(product.price).toLocaleString()}</p>`;

        const ratingHtml = product.review_count > 0
            ? `${'★'.repeat(Math.round(product.avg_rating))}${'☆'.repeat(5 - Math.round(product.avg_rating))} <span>${(+product.avg_rating).toFixed(1)} (${product.review_count})</span>`
            : '';

        const heartClass = wishlistIds.has(product.id) ? 'active' : '';

        return `
        <div class="product-card" data-category="${product.category}">
            <div class="product-img-wrap">
                ${imageHtml}
                ${badges ? `<div class="product-badges">${badges}</div>` : ''}
                <button class="wishlist-heart ${heartClass}" onclick="toggleWishlist(${product.id}, this)" data-pid="${product.id}" title="Add to wishlist">&#10084;</button>
            </div>
            <div class="product-info">
                <p class="product-category">${product.category}</p>
                <h4>${product.name}</h4>
                <div class="card-rating">${ratingHtml}</div>
                ${priceHtml}
                ${stockBadge}
                <div class="product-buttons">
                    <button class="view-btn" onclick="openModal(${product.id})">View</button>
                    <button class="add-btn" onclick="addToCart(${product.id})" ${product.stock <= 0 ? 'disabled' : ''}>Add to Cart</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function handleSearch(value) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => fetchProducts(value.trim()), 300);
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    fetchProducts('');
}

function filterProducts(category) {
    currentFilter = category;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        }
    });
    document.getElementById('searchInput').value = '';
    fetchProducts('');
}

async function updateFilterButtons() {
    try {
        const res = await fetch(`${API_BASE}/api/categories`);
        const categories = await res.json();
        const container = document.querySelector('.filter-buttons');
        const counts = categories.reduce((acc, c) => { acc[c.category] = Number(c.product_count); return acc; }, {});

        let html = '<button class="filter-btn active" data-category="all" onclick="filterProducts(\'all\')">All</button>';
        Object.keys(CATEGORY_LABELS).forEach(cat => {
            html += `<button class="filter-btn" data-category="${cat}" onclick="filterProducts('${cat}')">${CATEGORY_LABELS[cat]} (${counts[cat] || 0})</button>`;
        });
        container.innerHTML = html;
    } catch (err) {
        console.error(err);
    }
}

function scrollToProducts() {
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

/* ---------------- WISHLIST ---------------- */

function isLoggedIn() {
    return !!(getUser() && localStorage.getItem(TOKEN_KEY));
}

async function loadWishlist() {
    const user = getUser();
    const token = localStorage.getItem(TOKEN_KEY);
    const grid = document.getElementById('wishlistGrid');
    if (!grid) return;

    if (!isLoggedIn()) {
        grid.innerHTML = '<p class="orders-login-hint">Login to save items to your wishlist.</p>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/wishlist`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const items = await res.json();
        if (!res.ok) throw new Error(items.error || 'Failed');

        wishlistIds = new Set(items.map(i => i.product_id));
        renderAllHearts();

        if (items.length === 0) {
            grid.innerHTML = '<div class="orders-login-hint">Your wishlist is empty. Tap the ♥ on any product to save it.</div>';
            return;
        }

        grid.innerHTML = items.map(i => `
            <div class="wishlist-card">
                <div class="wishlist-img-wrap">
                    ${i.image_url
                        ? `<img class="product-img" src="${API_BASE}${i.image_url}" alt="${i.name}">`
                        : `<div class="product-image">🛍️</div>`}
                </div>
                <div class="wishlist-info">
                    <p class="product-category">${i.category}</p>
                    <h4>${i.name}</h4>
                    <p class="product-price">${CURRENCY}${Number(i.price).toLocaleString()}</p>
                    <div class="wishlist-actions">
                        <button class="view-btn" onclick="openModalPressed(${i.product_id})">View</button>
                        <button class="wishlist-remove" onclick="toggleWishlist(${i.product_id}, null)">Remove</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = `<p class="orders-login-hint">${err.message}</p>`;
    }
}

function renderAllHearts() {
    document.querySelectorAll('.wishlist-heart').forEach(btn => {
        const id = Number(btn.dataset.pid);
        btn.classList.toggle('active', wishlistIds.has(id));
    });
}

async function toggleWishlist(productId, el) {
    if (!isLoggedIn()) {
        showToast('Please login to use the wishlist');
        showAuthModal('login');
        return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    const isWish = wishlistIds.has(productId);

    try {
        if (isWish) {
            await fetch(`${API_BASE}/api/wishlist/${productId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            wishlistIds.delete(productId);
            showToast('Removed from wishlist');
        } else {
            const res = await fetch(`${API_BASE}/api/wishlist/${productId}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            wishlistIds.add(productId);
            showToast('Added to wishlist');
        }

        if (el) {
            el.classList.toggle('active', !isWish);
        } else {
            renderAllHearts();
        }
        if (!isWish) loadWishlistPartial();
    } catch (err) {
        showToast(err.message);
    }
}

function loadWishlistPartial() {
    if (isLoggedIn()) loadWishlist();
}

async function openModalPressed(id) {
    openModal(id);
    scrollToProducts();
}

/* ---------------- CART ---------------- */

function addToCart(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    if (product.stock <= 0) {
        showToast('Sorry, this product is out of stock');
        return;
    }

    const existing = cart.find(item => item.id === id);

    if (existing) {
        if (existing.qty >= product.stock) {
            showToast('Not enough stock available');
            return;
        }
        existing.qty += 1;
    } else {
        cart.push({ ...product, qty: 1 });
    }

    updateCartUI();
    showToast(`${product.name} added to cart!`);
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    updateCartUI();
}

function updateCartUI() {
    const cartItems = document.getElementById('cartItems');
    const cartCount = document.getElementById('cartCount');
    const cartTotal = document.getElementById('cartTotal');

    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (Number(item.price) * item.qty), 0);

    cartCount.textContent = totalItems;
    cartTotal.textContent = `${CURRENCY}${totalPrice.toLocaleString()}`;

    if (cart.length === 0) {
        cartItems.innerHTML = '<div class="empty-cart"><p>Your cart is empty</p><p>Add some beautiful handmade items!</p></div>';
        return;
    }

    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <span class="cart-item-emoji">${item.image_url ? `<img class="cart-item-img" src="${API_BASE}${item.image_url}">` : (item.emoji || '🛍️')}</span>
            <div class="cart-item-details">
                <h4>${item.name}</h4>
                <p class="cart-item-price">${CURRENCY}${(Number(item.price) * item.qty).toLocaleString()}</p>
                <div class="cart-qty">
                    <button class="qty-btn" onclick="changeCartQty(${item.id}, -1)">−</button>
                    <span>${item.qty}</span>
                    <button class="qty-btn" onclick="changeCartQty(${item.id}, 1)">+</button>
                    <span class="cart-item-remove" onclick="removeFromCart(${item.id})">Remove</span>
                </div>
            </div>
        </div>
    `).join('');
}

function changeCartQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;

    const product = products.find(p => p.id === id);
    const maxStock = product ? product.stock : item.qty;

    if (item.qty + delta < 1) {
        removeFromCart(id);
        return;
    }
    if (item.qty + delta > maxStock) {
        showToast('Not enough stock available');
        return;
    }

    item.qty += delta;
    updateCartUI();
}

function toggleCart() {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

/* ---------------- PRODUCT MODAL ---------------- */

async function openModal(id) {
    modalProduct = products.find(p => p.id === id);
    if (!modalProduct) {
        try {
            const res = await fetch(`${API_BASE}/api/products/${id}`);
            modalProduct = await res.json();
        } catch (err) {
            showToast('Product not found');
            return;
        }
    }
    modalQty = 1;
    modalImageIndex = 0;

    renderModalImage();
    renderModalGallery();

    document.getElementById('modalTitle').textContent = modalProduct.name;
    document.getElementById('modalCategory').textContent = `${CATEGORY_LABELS[modalProduct.category] || modalProduct.category}`;
    document.getElementById('modalPrice').innerHTML =
        modalProduct.original_price && Number(modalProduct.original_price) > Number(modalProduct.price)
            ? `<span class="orig-price">${CURRENCY}${Number(modalProduct.original_price).toLocaleString()}</span> ${CURRENCY}${Number(modalProduct.price).toLocaleString()} <span class="badge sale" style="position:static;display:inline-block;margin-left:0.3rem;">SALE</span>`
            : `${CURRENCY}${Number(modalProduct.price).toLocaleString()}`;

    const stockEl = document.getElementById('modalStock');
    if (modalProduct.stock <= 0) {
        stockEl.textContent = 'Out of Stock';
        stockEl.className = 'modal-stock out-of-stock';
    } else if (modalProduct.stock < 5) {
        stockEl.textContent = `Only ${modalProduct.stock} left in stock`;
        stockEl.className = 'modal-stock low-stock-text';
    } else {
        stockEl.textContent = `In Stock (${modalProduct.stock} available)`;
        stockEl.className = 'modal-stock in-stock';
    }

    document.getElementById('modalDesc').textContent = modalProduct.description;
    document.getElementById('modalQty').textContent = modalQty;
    document.querySelector('#productModal .add-to-cart-btn').disabled = modalProduct.stock <= 0;

    renderModalWishlist();
    renderNotifyArea();
    renderRelatedProducts();

    document.getElementById('productModal').classList.add('show');
    loadReviews(modalProduct.id);
}

function modalImageList() {
    if (!modalProduct) return [];
    const list = (modalProduct.gallery && modalProduct.gallery.length)
        ? modalProduct.gallery
        : (modalProduct.image_url ? [modalProduct.image_url] : []);
    return list;
}

function renderModalImage() {
    const container = document.getElementById('modalImage');
    const images = modalImageList();
    if (images.length > 0) {
        container.innerHTML = `<img class="modal-img" src="${API_BASE}${images[modalImageIndex]}" alt="${modalProduct.name}">`;
    } else {
        container.innerHTML = modalProduct.emoji || '🛍️';
    }
}

function renderModalGallery() {
    const container = document.getElementById('modalGallery');
    const images = modalImageList();
    if (images.length <= 1) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = images.map((url, i) => `
        <img class="gallery-img ${i === modalImageIndex ? 'active' : ''}" src="${API_BASE}${url}"
             alt="${modalProduct.name}" onclick="setModalImage(${i})">
    `).join('');
}

function setModalImage(index) {
    modalImageIndex = index;
    renderModalImage();
    renderModalGallery();
}

function renderModalWishlist() {
    const btn = document.getElementById('modalWishlistBtn');
    const active = wishlistIds.has(modalProduct.id);
    btn.innerHTML = `<button class="wishlist-in-modal ${active ? 'active' : ''}" onclick="toggleWishlist(${modalProduct.id}, this)">&#10084; ${active ? 'In Wishlist' : 'Add to Wishlist'}</button>`;
}

function renderNotifyArea() {
    const area = document.getElementById('notifyStockArea');
    if (!modalProduct || modalProduct.stock > 0) {
        area.innerHTML = '';
        return;
    }
    area.innerHTML = `
        <button class="stock-notify-btn" onclick="showStockNotify()">&#128276; Notify me when back in stock</button>
    `;
}

function showStockNotify() {
    if (!modalProduct) return;
    const email = prompt('Enter your email — we will let you know when "' + modalProduct.name + '" is back in stock:');
    if (!email) return;

    fetch(`${API_BASE}/api/stock-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: modalProduct.id, email })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        showToast(data.message);
    })
    .catch(err => showToast(err.message || 'Failed to save request'));
}

function renderRelatedProducts() {
    const grid = document.getElementById('relatedGrid');
    const related = products
        .filter(p => p.category === modalProduct.category && p.id !== modalProduct.id)
        .slice(0, 4);

    if (related.length === 0) {
        document.querySelector('.related-products').style.display = 'none';
        grid.innerHTML = '';
        return;
    }
    document.querySelector('.related-products').style.display = 'block';

    grid.innerHTML = related.map(p => `
        <div class="related-card" onclick="closeModal(); openModal(${p.id})" data-pid="${p.id}">
            ${p.image_url
                ? `<img src="${API_BASE}${p.image_url}" alt="${p.name}">`
                : `<div class="related-emoji">${p.emoji || '🛍️'}</div>`}
            ${p.stock > 0 && p.stock < 5 ? `<span class="stock-badge low">Only ${p.stock} left</span>` : ''}
            <h4>${p.name}</h4>
            <p class="product-price">${CURRENCY}${Number(p.price).toLocaleString()}</p>
        </div>
    `).join('');
}

function closeModal() {
    document.getElementById('productModal').classList.remove('show');
}

function changeModalQty(delta) {
    modalQty = Math.max(1, modalQty + delta);
    document.getElementById('modalQty').textContent = modalQty;
}

function addToCartFromModal() {
    if (!modalProduct) return;

    const existing = cart.find(item => item.id === modalProduct.id);
    if (existing) {
        if (existing.qty + modalQty > modalProduct.stock) {
            showToast('Not enough stock available');
            return;
        }
        existing.qty += modalQty;
    } else {
        if (modalQty > modalProduct.stock) {
            showToast('Not enough stock available');
            return;
        }
        cart.push({ ...modalProduct, qty: modalQty });
    }

    updateCartUI();
    closeModal();
    showToast(`${modalProduct.name} added to cart!`);
}

/* ---------------- REVIEWS ---------------- */

async function loadReviews(productId) {
    try {
        const res = await fetch(`${API_BASE}/api/products/${productId}/reviews`);
        const data = await res.json();

        const summaryEl = document.getElementById('reviewSummary');
        if (data.review_count > 0) {
            summaryEl.innerHTML = `
                <div class="avg-rating">${data.average_rating}
                    <span class="stars">${'★'.repeat(Math.round(data.average_rating))}${'☆'.repeat(5 - Math.round(data.average_rating))}</span>
                    <span class="count">(${data.review_count} reviews)</span>
                </div>`;
        } else {
            summaryEl.innerHTML = '<p class="no-reviews">No reviews yet.</p>';
        }

        document.getElementById('reviewList').innerHTML = data.reviews.map(r => `
            <div class="review-card">
                <div class="review-head">
                    <strong>${r.user_name}</strong>
                    <span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                </div>
                ${r.review ? `<p class="review-text">${r.review}</p>` : ''}
                <span class="review-time">${new Date(r.created_at).toLocaleDateString()}</span>
            </div>
        `).join('');

        renderReviewForm(productId);
    } catch (err) {
        console.error(err);
    }
}

async function renderReviewForm(productId) {
    const area = document.getElementById('reviewFormArea');
    const user = getUser();
    const token = localStorage.getItem(TOKEN_KEY);

    if (!user || !token) {
        area.innerHTML = '<p class="review-login-msg">Login to your account and order this product to leave a review.</p>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/products/${productId}/can-review`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (!data.can_review) {
            area.innerHTML = '<p class="review-login-msg">Buy this product to leave a review.</p>';
            return;
        }

        const rating = data.existing_review ? data.existing_review.rating : 0;
        const reviewText = data.existing_review ? data.existing_review.review || '' : '';

        area.innerHTML = `
            <div class="write-review">
                <h4>${data.existing_review ? 'Your Review' : 'Write a Review'}</h4>
                <div class="star-input" id="starInput">
                    ${[1,2,3,4,5].map(i => `<span class="star ${i <= rating ? 'active' : ''}" onclick="setReviewRating(${i})">★</span>`).join('')}
                </div>
                <textarea id="reviewText" placeholder="Share your experience with this product..." rows="3">${reviewText}</textarea>
                <button class="add-to-cart-btn" onclick="submitReview(${productId})">${data.existing_review ? 'Update Review' : 'Submit Review'}</button>
            </div>`;
    } catch (err) {
        console.error(err);
        area.innerHTML = '';
    }
}

function setReviewRating(rating) {
    document.querySelectorAll('#starInput .star').forEach((s, i) => {
        s.classList.toggle('active', i < rating);
    });
}

async function submitReview(productId) {
    const user = getUser();
    const token = localStorage.getItem(TOKEN_KEY);
    const stars = document.querySelectorAll('#starInput .star');
    let rating = 0;
    stars.forEach((s, i) => { if (s.classList.contains('active')) rating = i + 1; });

    if (rating === 0) {
        showToast('Please select a star rating');
        return;
    }

    const review = document.getElementById('reviewText').value.trim();

    try {
        const res = await fetch(`${API_BASE}/api/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ product_id: productId, rating, review })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to submit review');

        showToast('Review submitted! Thank you.');
        loadReviews(productId);
        fetchProducts(document.getElementById('searchInput').value);
    } catch (err) {
        showToast(err.message);
    }
}

/* ---------------- AUTH ---------------- */

function getUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY));
    } catch {
        return null;
    }
}

function getToken() {
    return localStorage.getItem(TOKEN_KEY) || null;
}

function showAuthModal(mode) {
    document.getElementById('loginForm').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('registerForm').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('authTitle').textContent = mode === 'login' ? 'Login' : 'Create Account';
    document.getElementById('loginError').textContent = '';
    document.getElementById('registerError').textContent = '';
    document.getElementById('authModal').classList.add('show');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('show');
}

function handleAuthSuccess(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    closeAuthModal();
    renderAuthUI();
    loadMyOrders();
    loadWishlist();
    loadMyCustomRequests();
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        localStorage.setItem(TOKEN_KEY, data.token);
        handleAuthSuccess(data.user);
        showToast(`Welcome back, ${data.user.name}!`);
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const phone = document.getElementById('regPhone').value;
    const address = document.getElementById('regAddress').value;
    const password = document.getElementById('regPassword').value;
    const errorEl = document.getElementById('registerError');
    errorEl.textContent = '';

    try {
        const res = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, address, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');

        localStorage.setItem(TOKEN_KEY, data.token);
        handleAuthSuccess(data.user);
        showToast(`Welcome, ${data.user.name}! Registration successful.`);
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    wishlistIds = new Set();
    renderAuthUI();
    document.getElementById('myOrdersList').innerHTML = '<p class="orders-login-hint">Please login to view your orders.</p>';
    document.getElementById('wishlistGrid').innerHTML = '<p class="orders-login-hint">Login to save items to your wishlist.</p>';
    document.getElementById('myCustomRequests').innerHTML = '<p class="orders-login-hint">Login to track your custom requests and replies here.</p>';
    renderAllHearts();
    showToast('Logged out successfully');
}

function renderAuthUI() {
    const user = getUser();
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');

    if (user) {
        authButtons.style.display = 'none';
        userMenu.style.display = 'flex';
        document.getElementById('userName').textContent = user.name;
    } else {
        authButtons.style.display = 'flex';
        userMenu.style.display = 'none';
    }
}

/* ---------------- CHECKOUT ---------------- */

function cartSubtotal() {
    return cart.reduce((sum, item) => sum + (Number(item.price) * item.qty), 0);
}

async function checkout() {
    if (cart.length === 0) {
        showToast('Your cart is empty!');
        return;
    }

    const user = getUser();
    let firstName = user ? user.name : null;
    let phone = user ? user.phone : null;
    let email = user ? user.email : null;
    let address = user ? user.address : null;

    if (!firstName) firstName = prompt('Enter your name:');
    if (!firstName) return;
    if (!phone) phone = prompt('Enter your phone number:');
    if (!phone) return;
    if (!email) email = prompt('Enter your email (optional):') || '';
    if (!address) address = prompt('Enter your delivery address:') || '';

    appliedCoupon = null;
    document.getElementById('couponInput').value = '';
    document.getElementById('couponMsg').textContent = '';

    pendingOrder = {
        customer_name: firstName,
        phone,
        email,
        address,
        items: cart.map(item => ({
            product_id: item.id,
            name: item.name,
            quantity: item.qty,
            price: item.price
        }))
    };

    recalcPayment();
    selectPayment({ value: 'cod' }, true);
    document.getElementById('paymentModal').classList.add('show');
}

function discountAmount() {
    const subtotal = cartSubtotal();
    if (!appliedCoupon) return 0;
    return Math.round(subtotal * appliedCoupon.discount_percent / 100);
}

function deliveryFeeFor(subtotalAfterDiscount, area) {
    if (subtotalAfterDiscount >= FREE_DELIVERY_THRESHOLD) return 0;
    const info = DELIVERY_AREAS[area];
    return info ? info.fee : 0;
}

function recalcPayment() {
    const subtotal = cartSubtotal();
    const discount = discountAmount();
    const area = document.getElementById('deliveryArea').value;
    const fee = deliveryFeeFor(subtotal - discount, area);
    const total = (subtotal - discount) + fee;

    document.getElementById('bSubtotal').textContent = `${CURRENCY}${subtotal.toLocaleString()}`;
    document.getElementById('bDiscount').textContent = discount > 0
        ? `-${CURRENCY}${discount.toLocaleString()}`
        : `-${CURRENCY}0`;
    document.getElementById('bDiscount').style.color = discount > 0 ? 'var(--success)' : 'inherit';
    document.getElementById('bDelivery').textContent = fee === 0 ? 'FREE' : `${CURRENCY}${fee.toLocaleString()}`;
    document.getElementById('paymentTotal').textContent = `${CURRENCY}${total.toLocaleString()}`;
}

async function applyCoupon() {
    const code = document.getElementById('couponInput').value.trim();
    const msgEl = document.getElementById('couponMsg');

    if (!code) {
        msgEl.textContent = '';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/coupons/validate/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid coupon');

        appliedCoupon = data;
        msgEl.textContent = `✅ ${data.code} applied — ${data.discount_percent}% off`;
        msgEl.className = 'coupon-msg ok';
        recalcPayment();
    } catch (err) {
        appliedCoupon = null;
        recalcPayment();
        msgEl.textContent = err.message;
        msgEl.className = 'coupon-msg err';
    }
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('show');
}

function selectPayment(input, force) {
    if (input && !force) {
        selectedPayment = input.value;
    } else if (force) {
        selectedPayment = 'cod';
        const radio = document.querySelector('input[name="payment"][value="cod"]');
        if (radio) radio.checked = true;
    }

    document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
    document.getElementById(`pay${selectedPayment.charAt(0).toUpperCase() + selectedPayment.slice(1)}`).classList.add('selected');

    const note = document.getElementById('paymentNote');
    if (selectedPayment === 'bkash') {
        note.innerHTML = `Send money to <strong>bKash ${BKASH_NUMBER}</strong>. Your order will be confirmed after payment verification.`;
    } else if (selectedPayment === 'nagad') {
        note.innerHTML = `Send money to <strong>Nagad ${NAGAD_NUMBER}</strong>. Your order will be confirmed after payment verification.`;
    } else {
        note.innerHTML = 'Pay in cash when your order is delivered.';
    }
}

async function confirmPayment() {
    if (!pendingOrder) return;

    const user = getUser();
    const headers = { 'Content-Type': 'application/json' };
    if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;

    const delivery_area = document.getElementById('deliveryArea').value;
    const coupon_code = appliedCoupon ? appliedCoupon.code : null;

    try {
        showToast('Placing your order...');

        const res = await fetch(`${API_BASE}/api/orders`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                ...pendingOrder,
                payment_method: selectedPayment,
                delivery_area,
                coupon_code
            })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to place order');

        const deliveryLabel = DELIVERY_AREAS[result.order.delivery_area] ? DELIVERY_AREAS[result.order.delivery_area].label : '';
        const items = cart.map(item => `• ${item.name} x${item.qty} = ${CURRENCY}${(Number(item.price) * item.qty).toLocaleString()}`).join('\n');
        const message = encodeURIComponent(
            `🛍️ NEW ORDER #${result.order.id}\n\n${items}\n\n` +
            `Subtotal: ${CURRENCY}${result.subtotal.toLocaleString()}\n` +
            (result.discount_amount > 0 ? `Discount (${result.order.coupon_code || ''}): -${CURRENCY}${Number(result.discount_amount).toLocaleString()}\n` : '') +
            `Delivery ${result.order.delivery_fee == 0 ? '(FREE)' : `(${deliveryLabel})`}: ${CURRENCY}${Number(result.order.delivery_fee).toLocaleString()}\n` +
            `TOTAL: ${CURRENCY}${Number(result.order.total_amount).toLocaleString()} (BDT)\n` +
            `Payment: ${selectedPayment.toUpperCase()}\n` +
            `Name: ${pendingOrder.customer_name}\nPhone: ${pendingOrder.phone}\nAddress: ${pendingOrder.address}\n\nThank you!`);
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank');

        cart = [];
        pendingOrder = null;
        appliedCoupon = null;
        updateCartUI();
        toggleCart();
        closePaymentModal();
        showToast(`Order #${result.order.id} placed successfully!`);
        fetchProducts();
        if (user) loadMyOrders();
    } catch (err) {
        console.error('Order failed:', err);
        showToast(err.message || 'Failed to place order. Please try again.');
    }
}

/* ---------------- MY ORDERS ---------------- */

async function loadMyOrders() {
    const listEl = document.getElementById('myOrdersList');
    const user = getUser();
    const token = localStorage.getItem(TOKEN_KEY);

    if (!user || !token) {
        listEl.innerHTML = '<p class="orders-login-hint">Please login to view your orders.</p>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/orders/my`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const orders = await res.json();
        if (!res.ok) throw new Error(orders.error || 'Failed');

        if (orders.length === 0) {
            listEl.innerHTML = '<div class="orders-login-hint">You have no orders yet. Start shopping!</div>';
            return;
        }

        listEl.innerHTML = orders.map(o => `
            <div class="order-card">
                <div class="order-head">
                    <strong>Order #${o.id}</strong>
                    <span>
                        <span class="status-badge status-${o.status}">${o.status}</span>
                        <span class="status-badge ${o.payment_status === 'paid' ? 'status-delivered' : 'status-pending'}">${o.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</span>
                        <span class="status-badge status-confirmed">${DELIVERY_AREAS[o.delivery_area] ? DELIVERY_AREAS[o.delivery_area].label : ''}</span>
                    </span>
                </div>
                <p class="order-meta">${new Date(o.created_at).toLocaleString()} | Payment: <strong>${(o.payment_method || 'cod').toUpperCase()}</strong></p>
                ${o.items.map(item => `
                    <div class="order-item">${item.product_name} x${item.quantity} — ${CURRENCY}${(Number(item.price) * item.quantity).toLocaleString()}</div>
                `).join('')}
                ${o.discount_amount > 0 ? `<p class="order-meta" style="color:var(--success);">Discount: -${CURRENCY}${Number(o.discount_amount).toLocaleString()} ${o.coupon_code ? `(${o.coupon_code})` : ''}</p>` : ''}
                ${o.delivery_fee > 0 ? `<p class="order-meta">Delivery: ${CURRENCY}${Number(o.delivery_fee).toLocaleString()}</p>` : '<p class="order-meta" style="color:var(--success);">Delivery: FREE</p>'}
                ${o.tracking_number ? `<p class="order-meta">🚚 ${o.courier || 'Courier'}: <strong>${o.tracking_number}</strong></p>` : ''}
                <p class="order-total">Total: ${CURRENCY}${Number(o.total_amount).toLocaleString()}</p>
            </div>
        `).join('');
    } catch (err) {
        listEl.innerHTML = '<p class="orders-login-hint">Failed to load your orders.</p>';
    }
}

/* ---------------- CONTACT ---------------- */

function handleContact(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        email: formData.get('email'),
        subject: formData.get('subject') || '',
        message: formData.get('message')
    };

    fetch(`${API_BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(() => {
        showToast('Message sent! We will get back to you soon.');
        e.target.reset();
    })
    .catch(err => {
        console.error('Contact failed:', err);
        showToast('Failed to send message. Please try again.');
    });
}

function handleCustomOrder(e) {
    e.preventDefault();

    const fd = new FormData();
    fd.append('name', document.getElementById('coName').value.trim());
    fd.append('phone', document.getElementById('coPhone').value.trim() || '');
    fd.append('email', document.getElementById('coEmail').value.trim() || '');
    fd.append('product_type', document.getElementById('coType').value || '');
    fd.append('details', document.getElementById('coDetails').value.trim());
    const imgFile = document.getElementById('coImage').files[0];
    const vidFile = document.getElementById('coVideo').files[0];
    if (imgFile) fd.append('image', imgFile);
    if (vidFile) fd.append('video', vidFile);

    const headers = {};
    if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;

    fetch(`${API_BASE}/api/custom-order`, {
        method: 'POST',
        headers,
        body: fd
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) throw new Error(data.error);
        showToast(data.message || 'Your custom request has been received!');
        e.target.reset();
        loadMyCustomRequests();
    })
    .catch(err => {
        console.error('Custom order failed:', err);
        showToast(err.message || 'Failed to send request. Please try again.');
    });
}

/* ---------------- MY CUSTOM REQUESTS ---------------- */

async function loadMyCustomRequests() {
    const listEl = document.getElementById('myCustomRequests');
    if (!listEl) return;

    if (!getToken()) {
        listEl.innerHTML = '<p class="orders-login-hint">Login to track your custom requests and replies here.</p>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/custom-orders/mine`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!res.ok) {
            listEl.innerHTML = '';
            return;
        }
        const items = await res.json();
        if (items.length === 0) {
            listEl.innerHTML = '<p class="orders-login-hint">Your custom requests and the admin\'s reply (with price) will appear here.</p>';
            return;
        }
        listEl.innerHTML = '<h5>Your Custom Requests</h5>' + items.map(r => `
            <div class="my-custom-card">
                <div class="msg-head">
                    <span class="msg-from">🎨 ${r.product_type ? r.product_type : 'Custom piece'}</span>
                    <span class="msg-time">${new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div class="co-attachments">
                    ${r.image_url ? `<a href="${API_BASE}${r.image_url}" target="_blank"><img src="${API_BASE}${r.image_url}" alt="ref"></a>` : ''}
                    ${r.video_url ? `<a href="${API_BASE}${r.video_url}" target="_blank"><video src="${API_BASE}${r.video_url}" controls muted></video></a>` : ''}
                </div>
                <p>${r.details}</p>
                ${r.reply ? `
                    <div class="co-reply">
                        <p class="reply-price">${r.reply_price ? `Price: BDT ${Number(r.reply_price).toLocaleString()} ` : ''}</p>
                        <p>${r.reply}</p>
                    </div>
                ` : '<p class="co-pending">⏳ Awaiting admin reply...</p>'}
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load custom requests:', err);
    }
}

/* ---------------- TOAST ---------------- */

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

/* ---------------- EVENT LISTENERS ---------------- */

document.getElementById('cartIcon').addEventListener('click', toggleCart);

document.getElementById('productModal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
});

document.getElementById('paymentModal').addEventListener('click', function(e) {
    if (e.target === this) closePaymentModal();
});

document.getElementById('authModal').addEventListener('click', function(e) {
    if (e.target === this) closeAuthModal();
});

document.getElementById('contactForm').addEventListener('submit', handleContact);

/* ---------------- INIT ---------------- */

window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.admin-link').forEach(el => el.style.display = 'none');
    document.querySelectorAll('a[href="admin.html"]').forEach(el => el.style.display = 'none');
});

renderAuthUI();
fetchProducts();
updateCartUI();
loadWishlist();
loadMyCustomRequests();