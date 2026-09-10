const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const pool = require('./db');
const { signToken, authenticate, requireAdmin, JWT_SECRET } = require('./auth');
const jwt = require('jsonwebtoken');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use((req, res, next) => {
    if (req.path.startsWith('/server/') || req.path.startsWith('/database/') || req.path.startsWith('/logs/')) {
        return res.status(404).end();
    }
    next();
});
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `p_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'));
    }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

const customFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image and video files are allowed'));
    }
};

const customUpload = multer({ storage, fileFilter: customFileFilter, limits: { fileSize: 25 * 1024 * 1024 } });

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Too many login/register attempts. Try again later.' }
});

pool.query('SELECT NOW()')
    .then(() => console.log('Connected to PostgreSQL'))
    .catch(err => console.error('Database connection error:', err.message));

const CATEGORIES = ['candle', 'dress', 'decor', 'soap', 'jewelry', 'bags', 'festive', 'jute'];

const DELIVERY_AREAS = {
    khulsi: { label: 'Khulsi', fee: 30 },
    chattogram_city: { label: 'Chattogram City', fee: 50 },
    outside_city: { label: 'Outside City', fee: 100 },
    pickup: { label: 'Pickup from Shop (Khulsi)', fee: 0 }
};

const FREE_DELIVERY_THRESHOLD = 2000;

/* ---------------- AUTH ROUTES ---------------- */

app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { name, email, phone, address, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (name, email, phone, address, password_hash, role)
             VALUES ($1, $2, $3, $4, $5, 'customer') RETURNING id, name, email, phone, address, role`,
            [name, email.toLowerCase(), phone || null, address || null, password_hash]
        );

        const user = result.rows[0];
        const token = signToken(user);

        res.status(201).json({ message: 'Registration successful', token, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = signToken(user);
        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, phone, address, role, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

app.put('/api/auth/profile', authenticate, async (req, res) => {
    try {
        const { phone, address } = req.body;
        const result = await pool.query(
            `UPDATE users SET phone = COALESCE($1, phone), address = COALESCE($2, address)
             WHERE id = $3 RETURNING id, name, email, phone, address, role`,
            [phone || null, address || null, req.user.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

/* ---------------- PRODUCT ROUTES ---------------- */

app.get('/api/products', async (req, res) => {
    try {
        const { category, search, featured } = req.query;
        const conditions = [];
        const params = [];

        if (category && category !== 'all') {
            params.push(category);
            conditions.push(`category = $${params.length}`);
        }

        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length} OR category ILIKE $${params.length})`);
        }

        if (featured === 'true') {
            conditions.push('featured = true');
        }

        let query = `
            SELECT p.*, COALESCE(AVG(r.rating), 0)::float AS avg_rating, COUNT(r.id)::int AS review_count
            FROM products p
            LEFT JOIN reviews r ON r.product_id = p.id`;
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' GROUP BY p.id ORDER BY p.id';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

app.post('/api/upload', authenticate, requireAdmin, upload.array('images', 6), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No image uploaded' });
    }
    const urls = req.files.map(f => `/uploads/${f.filename}`);
    res.status(201).json({ message: 'Upload successful', images: urls });
});

app.post('/api/products', authenticate, requireAdmin, upload.array('images', 6), async (req, res) => {
    try {
        const { name, category, price, description, stock, featured, original_price } = req.body;
        const isFeatured = featured === 'true' || featured === true;
        const origPrice = (original_price !== undefined && original_price !== '' && original_price !== null && original_price != 0)
            ? Number(original_price) : null;

        let gallery = [];
        if (req.files && req.files.length > 0) {
            gallery = req.files.map(f => `/uploads/${f.filename}`);
        } else if (req.body.gallery) {
            try {
                gallery = JSON.parse(req.body.gallery);
            } catch { gallery = []; }
        }
        if (gallery.length === 0 && req.body.image_url) {
            gallery = [req.body.image_url];
        }

        if (!name || !category || !price || !description) {
            return res.status(400).json({ error: 'Name, category, price and description are required' });
        }
        if (!CATEGORIES.includes(category)) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        const image_url = gallery[0] || null;

        const result = await pool.query(
            `INSERT INTO products (name, category, price, description, image_url, gallery, stock, featured, original_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [name, category, price, description, image_url, gallery, stock || 20, isFeatured, origPrice]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

app.put('/api/products/:id', authenticate, requireAdmin, upload.array('images', 6), async (req, res) => {
    try {
        const { name, category, price, description, stock, featured, removeImages, original_price } = req.body;
        const product = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (product.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        let gallery = product.rows[0].gallery || [];
        let image_url = product.rows[0].image_url;

        if (req.files && req.files.length > 0) {
            gallery = req.files.map(f => `/uploads/${f.filename}`);
            image_url = gallery[0];
        } else if (removeImages === 'true') {
            gallery = [];
            image_url = null;
        } else if (req.body.gallery) {
            try {
                gallery = JSON.parse(req.body.gallery);
                image_url = gallery[0] || null;
            } catch { gallery = product.rows[0].gallery || []; }
        }

        const isFeatured = featured === 'true' || featured === true;
        const origPrice = (original_price !== undefined && original_price !== '' && original_price !== null && original_price != 0)
            ? Number(original_price) : null;

        const result = await pool.query(
            `UPDATE products SET
                name = COALESCE($1, name),
                category = COALESCE($2, category),
                price = COALESCE($3, price),
                description = COALESCE($4, description),
                image_url = COALESCE($5, image_url),
                gallery = COALESCE($6, gallery),
                stock = COALESCE($7, stock),
                featured = COALESCE($8, featured),
                original_price = $9
             WHERE id = $10 RETURNING *`,
            [name, category, price, description, image_url, gallery, stock, isFeatured, origPrice, req.params.id]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

app.delete('/api/products/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ message: 'Product deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

/* ---------------- COUPON ROUTES ---------------- */

app.get('/api/coupons', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM coupons ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch coupons' });
    }
});

app.post('/api/coupons', authenticate, requireAdmin, async (req, res) => {
    try {
        const { code, discount_percent } = req.body;
        if (!code || !discount_percent) {
            return res.status(400).json({ error: 'Code and discount percent are required' });
        }
        const percent = parseInt(discount_percent, 10);
        if (percent < 1 || percent > 100) {
            return res.status(400).json({ error: 'Discount must be between 1 and 100%' });
        }
        const result = await pool.query(
            'INSERT INTO coupons (code, discount_percent) VALUES (UPPER($1), $2) ON CONFLICT (code) DO UPDATE SET discount_percent = EXCLUDED.discount_percent, active = true RETURNING *',
            [code, percent]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create coupon' });
    }
});

app.put('/api/coupons/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { active } = req.body;
        const result = await pool.query(
            'UPDATE coupons SET active = $1 WHERE id = $2 RETURNING *',
            [active, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update coupon' });
    }
});

app.delete('/api/coupons/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM coupons WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        res.json({ message: 'Coupon deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete coupon' });
    }
});

app.get('/api/coupons/validate/:code', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT code, discount_percent, active FROM coupons WHERE code = UPPER($1)',
            [req.params.code]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Invalid coupon code' });
        }
        const coupon = result.rows[0];
        if (!coupon.active) {
            return res.status(400).json({ error: 'This coupon is no longer active' });
        }
        res.json(coupon);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to validate coupon' });
    }
});

/* ---------------- ORDER ROUTES ---------------- */

function calcDeliveryFee(subtotal, area) {
    if (area === 'pickup') return 0;
    if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
    const areaInfo = DELIVERY_AREAS[area];
    return areaInfo ? areaInfo.fee : 0;
}

app.post('/api/orders', async (req, res) => {
    const client = await pool.connect();

    try {
        const { customer_name, phone, email, address, items, payment_method, delivery_area, coupon_code } = req.body;
        let userId = null;
        if (req.headers.authorization) {
            try {
                const decoded = jwt.verify(req.headers.authorization.replace('Bearer ', ''), JWT_SECRET);
                userId = decoded.id || null;
            } catch (err) { userId = null; }
        }

        if (!customer_name || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Customer name and items are required' });
        }

        const method = payment_method || 'cod';
        if (!['cod', 'bkash', 'nagad'].includes(method)) {
            return res.status(400).json({ error: 'Invalid payment method' });
        }

        const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);

        await client.query('BEGIN');

        let discount = 0;
        let finalCoupon = null;
        if (coupon_code && coupon_code.trim()) {
            const couponRes = await client.query(
                'SELECT code, discount_percent, active FROM coupons WHERE code = UPPER($1)',
                [coupon_code.trim()]
            );
            if (couponRes.rows.length > 0) {
                const coupon = couponRes.rows[0];
                if (coupon.active) {
                    discount = Math.round(subtotal * coupon.discount_percent / 100);
                    finalCoupon = coupon.code;
                }
            }
        }

        const deliveryFee = calcDeliveryFee(subtotal - discount, delivery_area);
        const total = Math.max(0, subtotal - discount) + deliveryFee;

        const orderResult = await client.query(
            `INSERT INTO orders (customer_name, phone, email, address, total_amount, user_id, payment_method, delivery_area, delivery_fee, coupon_code, discount_amount, payment_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unpaid') RETURNING *`,
            [customer_name, phone || null, email || null, address || null, total, userId, method,
             delivery_area || null, deliveryFee, finalCoupon, discount]
        );

        const order = orderResult.rows[0];

        for (const item of items) {
            if (!item.product_id) continue;
            const stockCheck = await client.query(
                'SELECT stock FROM products WHERE id = $1 FOR UPDATE',
                [item.product_id]
            );
            if (stockCheck.rows.length === 0) {
                throw new Error(`Product ${item.name} no longer exists`);
            }
            if (stockCheck.rows[0].stock < item.quantity) {
                throw new Error(`Not enough stock for ${item.name}`);
            }

            await client.query(
                `INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
                 VALUES ($1, $2, $3, $4, $5)`,
                [order.id, item.product_id, item.name, item.quantity, item.price]
            );

            await client.query(
                'UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2',
                [item.quantity, item.product_id]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({
            message: 'Order created successfully',
            order,
            subtotal,
            delivery_fee: deliveryFee,
            discount_amount: discount,
            delivery_area
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: err.message || 'Failed to create order' });
    } finally {
        client.release();
    }
});

app.get('/api/orders', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, json_agg(json_build_object(
                'product_name', oi.product_name,
                'quantity', oi.quantity,
                'price', oi.price
            )) AS items
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

app.get('/api/orders/my', authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, json_agg(json_build_object(
                'product_name', oi.product_name,
                'quantity', oi.quantity,
                'price', oi.price
            )) AS items
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.user_id = $1
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `, [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch your orders' });
    }
});

app.put('/api/orders/:id/status', authenticate, requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const valid = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
        if (!valid.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const result = await pool.query(
            'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

app.put('/api/orders/:id/payment', authenticate, requireAdmin, async (req, res) => {
    try {
        const { payment_status } = req.body;
        if (!['unpaid', 'paid'].includes(payment_status)) {
            return res.status(400).json({ error: 'Invalid payment status' });
        }
        const result = await pool.query(
            'UPDATE orders SET payment_status = $1 WHERE id = $2 RETURNING *',
            [payment_status, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update payment status' });
    }
});

app.put('/api/orders/:id/tracking', authenticate, requireAdmin, async (req, res) => {
    try {
        const { courier, tracking_number } = req.body;
        const result = await pool.query(
            'UPDATE orders SET courier = $1, tracking_number = $2 WHERE id = $3 RETURNING *',
            [courier || null, tracking_number || null, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update tracking' });
    }
});

/* ---------------- BACK-IN-STOCK NOTIFICATIONS ---------------- */

app.post('/api/stock-notify', async (req, res) => {
    try {
        const { product_id, email } = req.body;
        if (!product_id || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Valid product id and email are required' });
        }

        const product = await pool.query('SELECT id, name FROM products WHERE id = $1', [product_id]);
        if (product.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const existing = await pool.query(
            'SELECT id FROM stock_notifications WHERE product_id = $1 AND email = $2 AND notified = false',
            [product_id, email.toLowerCase()]
        );
        if (existing.rows.length > 0) {
            return res.json({ message: 'You are already on the waitlist for this product' });
        }

        await pool.query(
            'INSERT INTO stock_notifications (product_id, product_name, email) VALUES ($1, $2, $3)',
            [product_id, product.rows[0].name, email.toLowerCase()]
        );
        res.status(201).json({ message: 'We will notify you when it is back in stock!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save notification request' });
    }
});

app.get('/api/stock-notify', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT n.*, p.image_url IS NOT NULL AS has_image
            FROM stock_notifications n
            JOIN products p ON p.id = n.product_id
            ORDER BY n.notified, n.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stock notifications' });
    }
});

app.put('/api/stock-notify/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const { notified } = req.body;
        const result = await pool.query(
            'UPDATE stock_notifications SET notified = $1 WHERE id = $2 RETURNING *',
            [notified, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

app.delete('/api/stock-notify/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM stock_notifications WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.json({ message: 'Notification request deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

/* ---------------- CUSTOM ORDER REQUESTS ---------------- */

app.post('/api/custom-order', customUpload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
    try {
        const { name, phone, email, product_type, details } = req.body;
        const image = req.files && req.files['image'] ? req.files['image'][0] : null;
        const video = req.files && req.files['video'] ? req.files['video'][0] : null;

        if (!name || !details) {
            return res.status(400).json({ error: 'Name and details are required' });
        }

        let token = null;
        if (req.headers.authorization) {
            try {
                const decoded = jwt.verify(req.headers.authorization.replace('Bearer ', ''), JWT_SECRET);
                token = decoded.id || null;
            } catch (err) { token = null; }
        }

        await pool.query(
            `INSERT INTO custom_orders (name, phone, email, product_type, details, user_id, image_url, video_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [name, phone || null, email || null, product_type || null, details, token, image ? `/uploads/${image.filename}` : null, video ? `/uploads/${video.filename}` : null]
        );

        res.status(201).json({ message: 'Your custom request has been received! We will personally reply to you soon with the price and product details.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save custom order request' });
    }
});

app.get('/api/custom-orders', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM custom_orders ORDER BY is_read, created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch custom order requests' });
    }
});

app.put('/api/custom-orders/:id/read', authenticate, requireAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE custom_orders SET is_read = true WHERE id = $1', [req.params.id]);
        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update custom order request' });
    }
});

app.put('/api/custom-orders/:id/reply', authenticate, requireAdmin, async (req, res) => {
    try {
        const { reply, reply_price } = req.body;
        if (!reply) {
            return res.status(400).json({ error: 'Reply message is required' });
        }
        const price = reply_price ? (Number(reply_price) > 0 ? Number(reply_price) : null) : null;
        await pool.query(
            `UPDATE custom_orders
             SET reply = $1, reply_price = $2, replied_at = CURRENT_TIMESTAMP, is_read = true
             WHERE id = $3`,
            [reply, price, req.params.id]
        );
        res.json({ message: 'Reply saved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save reply' });
    }
});

app.get('/api/custom-orders/mine', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, product_type, details, image_url, video_url, reply, reply_price, replied_at, created_at
             FROM custom_orders
             WHERE user_id = $1 OR email = $2
             ORDER BY created_at DESC`,
            [req.user.id, req.user.email]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch your custom requests' });
    }
});

app.get('/api/wishlist', authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT w.id, w.product_id, p.name, p.price, p.image_url, p.emoji, p.category, p.stock
            FROM wishlist w
            JOIN products p ON p.id = w.product_id
            WHERE w.user_id = $1
            ORDER BY w.created_at DESC
        `, [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch wishlist' });
    }
});

app.post('/api/wishlist/:productId', authenticate, async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid product id' });
        }
        await pool.query(
            'INSERT INTO wishlist (user_id, product_id) VALUES ($1, $2) ON CONFLICT (user_id, product_id) DO NOTHING',
            [req.user.id, productId]
        );
        res.status(201).json({ message: 'Added to wishlist' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add to wishlist' });
    }
});

app.delete('/api/wishlist/:productId', authenticate, async (req, res) => {
    try {
        const productId = parseInt(req.params.productId, 10);
        await pool.query('DELETE FROM wishlist WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
        res.json({ message: 'Removed from wishlist' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove from wishlist' });
    }
});

/* ---------------- REVIEW ROUTES ---------------- */

app.get('/api/products/:id/reviews', async (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid product id' });
        }

        const result = await pool.query(`
            SELECT r.id, r.rating, r.review, r.created_at, u.name AS user_name
            FROM reviews r
            JOIN users u ON u.id = r.user_id
            WHERE r.product_id = $1
            ORDER BY r.created_at DESC
        `, [productId]);

        const avg = await pool.query(
            'SELECT COALESCE(AVG(rating), 0)::float AS average, COUNT(*) AS count FROM reviews WHERE product_id = $1',
            [productId]
        );

        res.json({
            reviews: result.rows,
            average_rating: Math.round(avg.rows[0].average * 10) / 10,
            review_count: Number(avg.rows[0].count)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

app.get('/api/products/:id/can-review', authenticate, async (req, res) => {
    try {
        const productId = parseInt(req.params.id, 10);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid product id' });
        }

        const purchase = await pool.query(`
            SELECT oi.id AS order_item_id, o.id AS order_id, o.status
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = $1 AND o.user_id = $2
            ORDER BY o.created_at DESC LIMIT 1
        `, [productId, req.user.id]);

        if (purchase.rows.length === 0) {
            return res.json({ can_review: false, reason: 'Not purchased this product' });
        }

        const existing = await pool.query(
            `SELECT id, rating, review FROM reviews
             WHERE product_id = $1 AND user_id = $2 AND order_id = $3`,
            [productId, req.user.id, purchase.rows[0].order_id]
        );

        res.json({
            can_review: true,
            order_id: purchase.rows[0].order_id,
            existing_review: existing.rows[0] || null,
            order_status: purchase.rows[0].status
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to check review eligibility' });
    }
});

app.post('/api/reviews', authenticate, async (req, res) => {
    const client = await pool.connect();

    try {
        const { product_id, rating, review } = req.body;
        const ratingNum = parseInt(rating, 10);

        if (!product_id || !ratingNum || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ error: 'Valid product id and rating (1-5) are required' });
        }

        await client.query('BEGIN');

        const purchase = await client.query(`
            SELECT o.id AS order_id
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = $1 AND o.user_id = $2
            ORDER BY o.created_at DESC LIMIT 1
        `, [product_id, req.user.id]);

        if (purchase.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'You can only review products you have purchased' });
        }

        const existing = await client.query(
            `SELECT id FROM reviews WHERE product_id = $1 AND user_id = $2 AND order_id = $3`,
            [product_id, req.user.id, purchase.rows[0].order_id]
        );

        let result;
        if (existing.rows.length > 0) {
            result = await client.query(
                `UPDATE reviews SET rating = $1, review = $2
                 WHERE id = $3 RETURNING *`,
                [ratingNum, review || null, existing.rows[0].id]
            );
        } else {
            result = await client.query(
                `INSERT INTO reviews (product_id, user_id, order_id, rating, review)
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [product_id, req.user.id, purchase.rows[0].order_id, ratingNum, review || null]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Review submitted', review: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to submit review' });
    } finally {
        client.release();
    }
});

/* ---------------- CONTACT ROUTES ---------------- */

app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email and message are required' });
        }

        await pool.query(
            `INSERT INTO contact_messages (name, email, subject, message)
             VALUES ($1, $2, $3, $4)`,
            [name, email, subject || null, message]
        );

        res.status(201).json({ message: 'Message saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save message' });
    }
});

app.get('/api/contact', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, subject, message, created_at, is_read FROM contact_messages ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

app.put('/api/contact/:id/read', authenticate, requireAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE contact_messages SET is_read = true WHERE id = $1', [req.params.id]);
        res.json({ message: 'Marked as read' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update message' });
    }
});

/* ---------------- USER ADMIN ROUTES ---------------- */

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, phone, address, role, created_at FROM users ORDER BY id'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/* ---------------- CATEGORY ROUTES ---------------- */

app.get('/api/categories', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT category, COUNT(*) as product_count FROM products GROUP BY category ORDER BY category'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

/* ---------------- SERVER ---------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});