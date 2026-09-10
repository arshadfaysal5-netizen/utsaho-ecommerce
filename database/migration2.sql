\c utsaho

-- Products: featured badge + image gallery
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery TEXT[] DEFAULT '{}';

-- Orders: delivery + discount
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_area VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;

-- Coupons
CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wishlist
CREATE TABLE IF NOT EXISTS wishlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);

ALTER TABLE products OWNER TO utsaho;
ALTER TABLE orders OWNER TO utsaho;
ALTER TABLE coupons OWNER TO utsaho;
ALTER TABLE wishlist OWNER TO utsaho;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO utsaho;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO utsaho;