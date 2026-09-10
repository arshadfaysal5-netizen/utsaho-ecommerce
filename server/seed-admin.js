const pool = require('./db');
const bcrypt = require('bcryptjs');

async function seedAdmin() {
    const email = 'admin@utsaho.com';
    const password = 'admin123';
    const name = 'Site Admin';

    try {
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            console.log('Admin already exists');
            return;
        }

        const hash = await bcrypt.hash(password, 10);
        await pool.query(
            `INSERT INTO users (name, email, phone, address, password_hash, role)
             VALUES ($1, $2, $3, $4, $5, 'admin')`,
            [name, email, '01600-164055', 'Khulsi, Chattogram, Bangladesh', hash]
        );
        console.log('Admin user created:', email, '/', password);
    } catch (err) {
        console.error('Seed admin error:', err.message);
    }
}

seedAdmin().then(() => process.exit(0));