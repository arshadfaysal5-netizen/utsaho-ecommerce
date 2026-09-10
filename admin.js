const API_BASE = 'http://localhost:3000';
const TOKEN_KEY = 'utsaho_admin_token';

let editingProductId = null;
let currentProduct = null;

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('utsaho_user_token');
    location.reload();
}

async function apiFetch(url, options = {}) {
    const headers = options.headers || {};
    const token = getToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || 'Request failed');
    }
    return data;
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function init() {
    const token = getToken() || localStorage.getItem('utsaho_user_token');
    const login = document.getElementById('adminLogin');
    const dashboard = document.getElementById('dashboard');

    if (!token) {
        return;
    }

    try {
        const user = await apiFetch('/api/auth/me');
        if (user.role !== 'admin') {
            throw new Error('Not admin');
        }
        if (localStorage.getItem('utsaho_user_token') && !getToken()) {
            localStorage.setItem(TOKEN_KEY, localStorage.getItem('utsaho_user_token'));
        }
        login.style.display = 'none';
        dashboard.style.display = 'block';
        loadAll();
        setInterval(loadNotifications, 30000);
    } catch (err) {
        localStorage.removeItem(TOKEN_KEY);
        showToast('Session expired, please login again');
    }
}

async function loadAll() {
    await Promise.all([loadProducts(), loadOrders(), loadMessages(), loadStockAlerts(), loadCustomOrders(), loadUsers(), loadStats(), loadCoupons(), loadNotifications()]);
}

async function loadStats() {
    try {
        const [products, orders, messages, users] = await Promise.all([
            apiFetch('/api/products'),
            apiFetch('/api/orders'),
            apiFetch('/api/contact'),
            apiFetch('/api/users')
        ]);

        const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
        const lowStock = products.filter(p => p.stock < 5).length;
        const pendingOrders = orders.filter(o => o.status === 'pending').length;

        document.getElementById('stats').innerHTML = `
            <div class="stat-card"><div class="stat-value">${products.length}</div><div class="stat-label">Products</div></div>
            <div class="stat-card"><div class="stat-value">${orders.length}</div><div class="stat-label">Orders (${pendingOrders} pending)</div></div>
            <div class="stat-card"><div class="stat-value">৳${totalRevenue.toLocaleString()}</div><div class="stat-label">Revenue</div></div>
            <div class="stat-card"><div class="stat-value">${messages.length}</div><div class="stat-label">Messages</div></div>
            <div class="stat-card"><div class="stat-value">${users.length}</div><div class="stat-label">Users</div></div>
            <div class="stat-card"><div class="stat-value">${lowStock}</div><div class="stat-label">Low stock</div></div>
        `;
    } catch (err) {
        console.error(err);
    }
}

async function loadNotifications() {
    try {
        const orders = await apiFetch('/api/orders');
        const messages = await apiFetch('/api/contact');
        const customs = await apiFetch('/api/custom-orders');
        let alertsCount = 0;
        try {
            const alerts = await apiFetch('/api/stock-notify');
            alertsCount = alerts.filter(a => !a.notified).length;
        } catch { }

        const pendingOrders = orders.filter(o => o.status === 'pending').length;
        const unreadMessages = messages.filter(m => !m.is_read).length;
        const unreadCustoms = customs.filter(c => !c.is_read).length;
        const total = pendingOrders + unreadMessages + unreadCustoms + alertsCount;

        const badge = document.getElementById('messageNotif');
        if (total > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = total;
        } else {
            badge.style.display = 'none';
        }
    } catch (err) {
        console.error(err);
    }
}

async function loadProducts() {
    try {
        const products = await apiFetch('/api/products');

        if (products.length === 0) {
            const table = document.querySelector('#tab-products .admin-table');
            if (table) table.style.display = 'none';

            let emptyBox = document.getElementById('productsEmptyBox');
            if (!emptyBox) {
                emptyBox = document.createElement('div');
                emptyBox.id = 'productsEmptyBox';
                emptyBox.className = 'empty-box';
                emptyBox.innerHTML = `
                    <div class="empty-box-icon">🛍️</div>
                    <h3>No Products Yet</h3>
                    <p>Your store is empty. Add your first handcrafted product — it will appear on the website immediately.</p>
                    <button class="btn-add btn-add-large" onclick="openProductModal()">+ Add Your First Product</button>`;
                document.getElementById('tab-products').appendChild(emptyBox);
            }
            return;
        }

        const table = document.querySelector('#tab-products .admin-table');
        if (table) table.style.display = 'table';
        const emptyBox = document.getElementById('productsEmptyBox');
        if (emptyBox) emptyBox.remove();

        document.getElementById('productsTableBody').innerHTML = products.map(p => `
            <tr>
                <td>${p.id}</td>
                <td>${p.image_url
                    ? `<img class="thumb-img" src="${API_BASE}${p.image_url}" alt="${p.name}">`
                    : '<span style="font-size:1.4rem">🛍️</span>'}</td>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td>৳${Number(p.price).toLocaleString()}${p.original_price && Number(p.original_price) > Number(p.price) ? ` <span class="badge-featured">SALE</span>` : ''}</td>
                <td style="color: ${p.stock < 5 ? 'var(--danger)' : 'inherit'}; font-weight: bold;">${p.stock}</td>
                <td>${p.featured ? '<span class="badge-featured">Featured</span>' : '—'}</td>
                <td>
                    <div class="row-actions">
                        <button class="action-btn action-edit" onclick="editProduct(${p.id})">Edit</button>
                        <button class="action-btn action-featured" onclick="toggleFeatured(${p.id}, ${!p.featured})">${p.featured ? 'Unfeature' : 'Feature'}</button>
                        <button class="action-btn action-delete" onclick="deleteProduct(${p.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function toggleFeatured(id, featured) {
    try {
        await apiFetch(`/api/products/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ featured })
        });
        showToast(featured ? 'Product marked as featured' : 'Featured removed');
        loadProducts();
    } catch (err) {
        showToast(err.message);
    }
}

function renderGalleryPreviews(product) {
    const wrap = document.getElementById('galleryPreviews');
    wrap.innerHTML = '';

    let urls = [];
    if (product) {
        urls = (product.gallery && product.gallery.length ? product.gallery : (product.image_url ? [product.image_url] : []));
    }

    urls.forEach(url => {
        const img = document.createElement('img');
        img.src = `${API_BASE}${url}`;
        img.className = 'gallery-thumb';
        wrap.appendChild(img);
    });

    document.getElementById('removeImagesWrap').style.display = product && urls.length > 0 ? 'flex' : 'none';
}

function openProductModal(product = null) {
    editingProductId = product ? product.id : null;
    currentProduct = product;
    document.getElementById('productModalTitle').textContent = product ? 'Edit Product' : 'Add Product';
    document.getElementById('productId').value = product ? product.id : '';
    document.getElementById('productName').value = product ? product.name : '';
    document.getElementById('productCategory').value = product ? product.category : '';
    document.getElementById('productPrice').value = product ? product.price : '';
    document.getElementById('productOriginalPrice').value = product && product.original_price ? product.original_price : '';
    document.getElementById('productStock').value = product ? product.stock : '';
    document.getElementById('productDesc').value = product ? product.description : '';
    document.getElementById('productFeatured').checked = product ? !!product.featured : false;
    document.getElementById('productImage').value = '';
    document.getElementById('removeImages').checked = false;

    renderGalleryPreviews(product);

    document.getElementById('productFormError').textContent = '';
    document.getElementById('productModal').classList.add('show');
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('show');
    editingProductId = null;
    currentProduct = null;
}

async function editProduct(id) {
    try {
        const product = await apiFetch(`/api/products/${id}`);
        openProductModal(product);
    } catch (err) {
        showToast(err.message);
    }
}

async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    try {
        await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
        showToast('Product deleted');
        loadProducts();
        loadStats();
    } catch (err) {
        showToast(err.message);
    }
}

document.getElementById('productImage').addEventListener('change', function() {
    const files = Array.from(this.files);
    const wrap = document.getElementById('galleryPreviews');
    wrap.innerHTML = '';
    files.forEach(file => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.className = 'gallery-thumb';
        wrap.appendChild(img);
    });
});

document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('productId').value;

    const formData = new FormData();
    formData.append('name', document.getElementById('productName').value);
    formData.append('category', document.getElementById('productCategory').value);
    formData.append('price', document.getElementById('productPrice').value);
    formData.append('original_price', document.getElementById('productOriginalPrice').value || '');
    formData.append('stock', document.getElementById('productStock').value);
    formData.append('description', document.getElementById('productDesc').value);
    formData.append('featured', document.getElementById('productFeatured').checked);

    const imageInput = document.getElementById('productImage');
    const removeAll = document.getElementById('removeImages').checked;

    if (imageInput.files.length > 0) {
        Array.from(imageInput.files).forEach(file => formData.append('images', file));
    } else if (removeAll && id) {
        formData.append('removeImages', 'true');
    } else if (id && currentProduct) {
        const existing = (currentProduct.gallery && currentProduct.gallery.length) ? currentProduct.gallery
            : (currentProduct.image_url ? [currentProduct.image_url] : []);
        formData.append('gallery', JSON.stringify(existing));
    }

    try {
        if (id) {
            await apiFetch(`/api/products/${id}`, { method: 'PUT', body: formData });
            showToast('Product updated');
        } else {
            await apiFetch('/api/products', { method: 'POST', body: formData });
            showToast('Product added');
        }
        closeProductModal();
        loadProducts();
        loadStats();
    } catch (err) {
        document.getElementById('productFormError').textContent = err.message;
    }
});

async function loadOrders() {
    try {
        const orders = await apiFetch('/api/orders');
        if (orders.length === 0) {
            document.getElementById('ordersList').innerHTML = '<div class="empty-state">No orders yet</div>';
            return;
        }

        document.getElementById('ordersList').innerHTML = orders.map(o => `
            <div class="order-card">
                <div class="order-head">
                    <div>
                        <strong>Order #${o.id}</strong>
                        <span class="status-badge status-${o.status}">${o.status}</span>
                        <span class="status-badge ${o.payment_status === 'paid' ? 'status-delivered' : 'status-pending'}" style="margin-left:6px;">${o.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</span>
                    </div>
                    <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                        <select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)">
                            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                            <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>Shipped</option>
                            <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                        <select class="status-select" onchange="updatePaymentStatus(${o.id}, this.value)">
                            <option value="unpaid" ${o.payment_status === 'unpaid' ? 'selected' : ''}>Mark Unpaid</option>
                            <option value="paid" ${o.payment_status === 'paid' ? 'selected' : ''}>Mark Paid</option>
                        </select>
                    </div>
                </div>
                <p class="order-meta">Customer: ${o.customer_name} | Phone: ${o.phone || '-'} | Email: ${o.email || '-'}
                    ${o.delivery_area ? `| Delivery: <strong>${DELIVERY_LABELS[o.delivery_area] || o.delivery_area}</strong>` : ''}</p>
                <p class="order-meta">Address: ${o.address || '-'}
                    | Payment: <strong>${o.payment_method ? o.payment_method.toUpperCase() : 'COD'}</strong>
                    | Date: ${new Date(o.created_at).toLocaleString()}</p>
                <div class="tracking-row">
                    <input class="tracking-input courier" placeholder="Courier (e.g. Pathao)" value="${o.courier || ''}" id="courier-${o.id}">
                    <input class="tracking-input" placeholder="Tracking number" value="${o.tracking_number || ''}" id="tracking-${o.id}">
                    <button class="action-btn action-edit tracking-save" onclick="saveTracking(${o.id})">Save Tracking</button>
                    ${o.tracking_number ? `<span class="tracking-note">📦 ${o.courier || 'Courier'}: ${o.tracking_number}</span>` : ''}
                </div>
                ${o.items.map(item => `
                    <div class="order-item">${item.product_name} x${item.quantity} — ৳${(Number(item.price) * item.quantity).toLocaleString()}</div>
                `).join('')}
                <p class="order-breakdown">
                    Subtotal ৳${(Number(o.total_amount) - Number(o.delivery_fee || 0) + Number(o.discount_amount || 0)).toLocaleString()}
                    ${o.discount_amount > 0 ? ` | Discount <span class="discount-note">-৳${Number(o.discount_amount).toLocaleString()}</span>${o.coupon_code ? ` (${o.coupon_code})` : ''}` : ''}
                    | Delivery ${Number(o.delivery_fee || 0) === 0 ? 'FREE' : `+৳${Number(o.delivery_fee).toLocaleString()}`}
                    | <span class="order-total">Total: ৳${Number(o.total_amount).toLocaleString()}</span>
                </p>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

const DELIVERY_LABELS = {
    khulsi: 'Khulsi',
    chattogram_city: 'Chattogram City',
    outside_city: 'Outside City',
    pickup: 'Pickup from Shop'
};

async function updateOrderStatus(id, status) {
    try {
        const updated = await apiFetch(`/api/orders/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        showToast(`Order #${updated.id} marked as ${status}`);
        loadOrders();
        loadStats();
        loadNotifications();
    } catch (err) {
        showToast(err.message);
    }
}

async function updatePaymentStatus(id, payment_status) {
    try {
        const updated = await apiFetch(`/api/orders/${id}/payment`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_status })
        });
        showToast(`Order #${updated.id} payment ${payment_status}`);
        loadOrders();
        loadStats();
    } catch (err) {
        showToast(err.message);
    }
}

async function saveTracking(id) {
    const courier = document.getElementById(`courier-${id}`).value.trim();
    const tracking_number = document.getElementById(`tracking-${id}`).value.trim();
    try {
        await apiFetch(`/api/orders/${id}/tracking`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courier, tracking_number })
        });
        showToast(`Tracking saved for Order #${id}`);
        loadOrders();
    } catch (err) {
        showToast(err.message);
    }
}

async function loadCoupons() {
    try {
        const coupons = await apiFetch('/api/coupons');
        if (coupons.length === 0) {
            document.getElementById('couponsList').innerHTML = `
                <div class="empty-state">No coupons yet. Create one to give your customers a discount.</div>`;
            return;
        }
        document.getElementById('couponsList').innerHTML = coupons.map(c => `
            <div class="coupon-card ${c.active ? '' : 'coupon-inactive'}">
                <div>
                    <span class="coupon-code">${c.code}</span>
                    <span class="coupon-percent">${c.discount_percent}% OFF</span>
                    <span class="status-badge ${c.active ? 'status-delivered' : 'status-cancelled'}">${c.active ? 'Active' : 'Disabled'}</span>
                </div>
                <div class="row-actions">
                    <button class="action-btn action-featured" onclick="toggleCoupon(${c.id}, ${!c.active})">${c.active ? 'Disable' : 'Enable'}</button>
                    <button class="action-btn action-delete" onclick="deleteCoupon(${c.id})">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function loadStockAlerts() {
    try {
        const alerts = await apiFetch('/api/stock-notify');
        const listEl = document.getElementById('stockAlertsList');
        if (alerts.length === 0) {
            listEl.innerHTML = '<div class="empty-state">No back-in-stock requests yet.</div>';
            return;
        }
        listEl.innerHTML = alerts.map(a => `
            <div class="message-card">
                <div class="msg-head">
                    <span class="msg-from">📦 ${a.product_name}</span>
                    <span class="msg-time">${new Date(a.created_at).toLocaleString()}</span>
                </div>
                <p class="order-meta">Requested by: <strong>${a.email}</strong></p>
                <div class="row-actions" style="margin-top:0.5rem;">
                    <button class="action-btn action-featured" onclick="markNotified(${a.id})">${a.notified ? 'Mark Not Notified' : 'Mark Notified (I restocked)'}</button>
                    <button class="action-btn action-delete" onclick="deleteStockAlert(${a.id})">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function markNotified(id) {
    try {
        const alerts = await apiFetch('/api/stock-notify');
        const alert = alerts.find(a => a.id === id);
        await apiFetch(`/api/stock-notify/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notified: !alert.notified })
        });
        showToast('Updated');
        loadStockAlerts();
        loadNotifications();
    } catch (err) {
        showToast(err.message);
    }
}

async function deleteStockAlert(id) {
    if (!confirm('Delete this request?')) return;
    try {
        await apiFetch(`/api/stock-notify/${id}`, { method: 'DELETE' });
        showToast('Request deleted');
        loadStockAlerts();
        loadNotifications();
    } catch (err) {
        showToast(err.message);
    }
}

async function loadCustomOrders() {
    try {
        const requests = await apiFetch('/api/custom-orders');
        const listEl = document.getElementById('customOrdersList');
        if (requests.length === 0) {
            listEl.innerHTML = '<div class="empty-state">No custom order requests yet.</div>';
            return;
        }
        listEl.innerHTML = requests.map(r => `
            <div class="message-card" ${r.is_read ? '' : 'style="border-left:4px solid var(--primary);"'}>
                <div class="msg-head" onclick="markCustomRead(${r.id})">
                    <span class="msg-from">🎨 ${r.name} ${!r.is_read ? '<span class="badge-featured">New</span>' : ''}</span>
                    <span class="msg-time">${new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p class="order-meta">${r.phone ? 'Phone: ' + r.phone : ''}${r.phone && r.email ? ' | ' : ''}${r.email ? 'Email: ' + r.email : ''}</p>
                ${r.product_type ? `<p class="order-meta"><strong>Category:</strong> ${r.product_type}</p>` : ''}
                <div class="co-admin-attachments">
                    ${r.image_url ? `<a href="${r.image_url}" target="_blank"><img src="${r.image_url}" alt="ref" class="co-thumb"></a>` : ''}
                    ${r.video_url ? `<a href="${r.video_url}" target="_blank"><video src="${r.video_url}" controls muted class="co-thumb"></video></a>` : ''}
                </div>
                <p>${(r.details || '').replace(/\\n/g, '<br>')}</p>
                ${r.reply ? `
                    <div class="co-admin-reply" style="background:#eaf7e9;border:1px solid var(--primary);border-radius:8px;padding:0.6rem 0.8rem;margin-top:0.5rem;">
                        <p><strong>Reply:</strong> ${(r.reply || '').replace(/\\n/g, '<br>')}</p>
                        ${r.reply_price ? `<p class="reply-price"><strong>Price:</strong> BDT ${Number(r.reply_price).toLocaleString()}</p>` : ''}
                        <p class="order-meta">Replied: ${new Date(r.replied_at).toLocaleString()}</p>
                    </div>
                ` : ''}
                <div class="reply-box">
                    <input type="number" min="0" step="0.01" placeholder="Price (BDT)" value="${r.reply_price !== null && r.reply_price !== undefined ? r.reply_price : ''}" id="coPrice_${r.id}">
                    <textarea rows="2" placeholder="Your personal reply: product details, materials, delivery, timeline..." id="coReply_${r.id}">${r.reply ? r.reply.replace(/"/g, '&quot;') : ''}</textarea>
                    <button class="btn-primary btn-sm" onclick="saveCustomReply(${r.id})">💬 Save Reply</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function saveCustomReply(id) {
    try {
        const reply = document.getElementById(`coReply_${id}`).value.trim();
        const price = document.getElementById(`coPrice_${id}`).value;
        if (!reply) {
            alert('Please write the reply message (product details / price info).');
            return;
        }
        await apiFetch(`/api/custom-orders/${id}/reply`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reply, reply_price: price ? Number(price) : null })
        });
        showToast ? showToast('Reply saved — customer can now see price & details.') : alert('Reply saved.');
        loadCustomOrders();
    } catch (err) {
        console.error(err);
        alert('Failed to save reply.');
    }
}

async function markCustomRead(id) {
    try {
        await apiFetch(`/api/custom-orders/${id}/read`, { method: 'PUT' });
        loadCustomOrders();
        loadNotifications();
    } catch (err) {
        console.error(err);
    }
}

function openCouponModal() {
    document.getElementById('couponCode').value = '';
    document.getElementById('couponPercent').value = '';
    document.getElementById('couponFormError').textContent = '';
    document.getElementById('couponModal').classList.add('show');
}

document.getElementById('couponForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('couponCode').value.trim();
    const percent = document.getElementById('couponPercent').value;

    try {
        await apiFetch('/api/coupons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, discount_percent: percent })
        });
        showToast('Coupon created');
        document.getElementById('couponModal').classList.remove('show');
        loadCoupons();
    } catch (err) {
        document.getElementById('couponFormError').textContent = err.message;
    }
});

async function toggleCoupon(id, active) {
    try {
        await apiFetch(`/api/coupons/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active })
        });
        showToast(active ? 'Coupon enabled' : 'Coupon disabled');
        loadCoupons();
    } catch (err) {
        showToast(err.message);
    }
}

async function deleteCoupon(id) {
    if (!confirm('Delete this coupon?')) return;
    try {
        await apiFetch(`/api/coupons/${id}`, { method: 'DELETE' });
        showToast('Coupon deleted');
        loadCoupons();
    } catch (err) {
        showToast(err.message);
    }
}

async function loadMessages() {
    try {
        const messages = await apiFetch('/api/contact');
        if (messages.length === 0) {
            document.getElementById('messagesList').innerHTML = '<div class="empty-state">No messages yet</div>';
            return;
        }
        document.getElementById('messagesList').innerHTML = messages.map(m => `
            <div class="message-card ${m.is_read ? '' : 'message-unread'}" onclick="markRead(${m.id})">
                <div class="msg-head">
                    <span class="msg-from">${m.name} (${m.email}) ${!m.is_read ? '<span class="badge-featured">New</span>' : ''}</span>
                    <span class="msg-time">${new Date(m.created_at).toLocaleString()}</span>
                </div>
                ${m.subject ? `<p><strong>Subject:</strong> ${m.subject}</p>` : ''}
                <p>${m.message}</p>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function markRead(id) {
    try {
        await apiFetch(`/api/contact/${id}/read`, { method: 'PUT' });
        loadMessages();
        loadNotifications();
    } catch (err) {
        console.error(err);
    }
}

async function loadUsers() {
    try {
        const users = await apiFetch('/api/users');
        document.getElementById('usersTableBody').innerHTML = users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>${u.phone || '-'}</td>
                <td>${u.role}</td>
                <td>${new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('adminLoginError');
    errorEl.textContent = '';

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        if (data.user.role !== 'admin') {
            throw new Error('This account is not an admin');
        }
        setToken(data.token);
        localStorage.setItem('utsaho_user_token', data.token);
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadAll();
    } catch (err) {
        errorEl.textContent = err.message;
    }
});

document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

init();