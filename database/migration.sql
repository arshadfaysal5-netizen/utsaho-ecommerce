\c utsaho

-- 1. Expand categories: drop CHECK constraint so all 8 categories are allowed
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;

-- Categories now: mombati, dress, decor, soap, jewelry, bags, festive, jute

-- 2. Add image_url to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

-- 3. Orders: add payment method and payment status
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cod'
    CHECK (payment_method IN ('cod', 'bkash', 'nagad'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid'));

-- 4. Reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (product_id, user_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

ALTER TABLE reviews OWNER TO utsaho;
ALTER TABLE orders OWNER TO utsaho;
ALTER TABLE products OWNER TO utsaho;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO utsaho;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO utsaho;