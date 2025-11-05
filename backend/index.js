const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'SECRET'; // Use a .env file in a real app
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error("Error opening database:", err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDb();
    }
});
app.use(cors()); 
app.use(express.json()); 
function initializeDb() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS Users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            )
        `);

        // Events (Slots) Table
        db.run(`
            CREATE TABLE IF NOT EXISTS Events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                startTime TEXT NOT NULL,
                endTime TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('BUSY', 'SWAPPABLE', 'SWAP_PENDING')),
                userId INTEGER NOT NULL,
                FOREIGN KEY (userId) REFERENCES Users(id)
            )
        `);

        // Swap Requests Table
        db.run(`
            CREATE TABLE IF NOT EXISTS SwapRequests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                requestedSlotId INTEGER NOT NULL,
                offeredSlotId INTEGER NOT NULL,
                requesterId INTEGER NOT NULL,
                ownerId INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
                FOREIGN KEY (requestedSlotId) REFERENCES Events(id),
                FOREIGN KEY (offeredSlotId) REFERENCES Events(id),
                FOREIGN KEY (requesterId) REFERENCES Users(id),
                FOREIGN KEY (ownerId) REFERENCES Users(id)
            )
        `);
    });
}
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Adds { id, email } to the request object
        next();
    } catch (ex) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};

// 1. Auth Routes
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const sql = `INSERT INTO Users (name, email, password_hash) VALUES (?, ?, ?)`;
        db.run(sql, [name, email, password_hash], function (err) {
            if (err) {
                return res.status(400).json({ message: "Email already exists", error: err.message });
            }
            const userId = this.lastID;
            const token = jwt.sign({ id: userId, email: email }, JWT_SECRET, { expiresIn: '1h' });
            res.status(201).json({ token });
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const sql = `SELECT * FROM Users WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err) return res.status(500).json({ message: "Server error", error: err.message });
        if (!user) return res.status(400).json({ message: "Invalid email or password" });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ message: "Invalid email or password" });

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    });
});

// 2. Event/Calendar Routes (Protected)
app.get('/api/my-events', authMiddleware, (req, res) => {
    const sql = `SELECT * FROM Events WHERE userId = ? ORDER BY startTime`;
    db.all(sql, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ message: "Server error", error: err.message });
        res.json(rows);
    });
});

app.post('/api/events', authMiddleware, (req, res) => {
    const { title, startTime, endTime } = req.body;
    // Simple validation
    if (!title || !startTime || !endTime) {
        return res.status(400).json({ message: "Missing event data" });
    }
    const status = 'BUSY'; // Default status
    const userId = req.user.id;

    const sql = `INSERT INTO Events (title, startTime, endTime, status, userId) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [title, startTime, endTime, status, userId], function (err) {
        if (err) return res.status(500).json({ message: "Server error", error: err.message });
        res.status(201).json({ id: this.lastID, title, startTime, endTime, status, userId });
    });
});

app.put('/api/events/:id/status', authMiddleware, (req, res) => {
    const { status } = req.body;
    const eventId = req.params.id;
    const userId = req.user.id;

    if (!['BUSY', 'SWAPPABLE'].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Can only set to BUSY or SWAPPABLE." });
    }
    
    // Check ownership
    const sql = `UPDATE Events SET status = ? WHERE id = ? AND userId = ?`;
    db.run(sql, [status, eventId, userId], function (err) {
        if (err) return res.status(500).json({ message: "Server error", error: err.message });
        if (this.changes === 0) {
            return res.status(404).json({ message: "Event not found or you don't own this event." });
        }
        res.json({ message: "Status updated successfully", changes: this.changes });
    });
});


// 3. Core Swap Logic (Protected)

// GET: All swappable slots from OTHER users
app.get('/api/swappable-slots', authMiddleware, (req, res) => {
    const sql = `
        SELECT e.id, e.title, e.startTime, e.endTime, u.name AS ownerName
        FROM Events e
        JOIN Users u ON e.userId = u.id
        WHERE e.status = 'SWAPPABLE' AND e.userId != ?
    `;
    db.all(sql, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ message: "Server error", error: err.message });
        res.json(rows);
    });
});

// POST: Request a swap
app.post('/api/swap-request', authMiddleware, (req, res) => {
    const { mySlotId, theirSlotId } = req.body;
    const requesterId = req.user.id;

    // A good server would wrap this in a database transaction.
    // For sqlite3, we can use db.serialize() to ensure sequential execution.
    db.serialize(() => {
        const getMySlotSql = `SELECT * FROM Events WHERE id = ? AND userId = ? AND status = 'SWAPPABLE'`;
        db.get(getMySlotSql, [mySlotId, requesterId], (err, mySlot) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!mySlot) return res.status(400).json({ message: "Your slot is not valid or not swappable." });

            const getTheirSlotSql = `SELECT * FROM Events WHERE id = ? AND userId != ? AND status = 'SWAPPABLE'`;
            db.get(getTheirSlotSql, [theirSlotId, requesterId], (err, theirSlot) => {
                if (err) return res.status(500).json({ error: err.message });
                if (!theirSlot) return res.status(400).json({ message: "Their slot is not valid or not swappable." });
                
                const ownerId = theirSlot.userId;

                // 1. Create the SwapRequest
                const insertSql = `
                    INSERT INTO SwapRequests (requestedSlotId, offeredSlotId, requesterId, ownerId, status)
                    VALUES (?, ?, ?, ?, 'PENDING')
                `;
                db.run(insertSql, [theirSlotId, mySlotId, requesterId, ownerId], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    // 2. Update both slots to SWAP_PENDING
                    const updateSql = `UPDATE Events SET status = 'SWAP_PENDING' WHERE id = ? OR id = ?`;
                    db.run(updateSql, [mySlotId, theirSlotId], function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.status(201).json({ message: "Swap request created successfully." });
                    });
                });
            });
        });
    });
});

// GET: All incoming and outgoing requests for the logged-in user
app.get('/api/requests', authMiddleware, (req, res) => {
    const userId = req.user.id;
    const results = { incoming: [], outgoing: [] };

    // db.serialize to run queries one after another
    db.serialize(() => {
        // Incoming requests (I am the owner)
        const incomingSql = `
            SELECT sr.id, sr.status, 
                   reqSlot.title AS requestedSlotTitle, reqSlot.startTime AS requestedSlotStart,
                   offSlot.title AS offeredSlotTitle, offSlot.startTime AS offeredSlotStart,
                   requester.name AS requesterName
            FROM SwapRequests sr
            JOIN Events reqSlot ON sr.requestedSlotId = reqSlot.id
            JOIN Events offSlot ON sr.offeredSlotId = offSlot.id
            JOIN Users requester ON sr.requesterId = requester.id
            WHERE sr.ownerId = ? AND sr.status = 'PENDING'
        `;
        db.all(incomingSql, [userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            results.incoming = rows;
            
            // Outgoing requests (I am the requester)
            const outgoingSql = `
                SELECT sr.id, sr.status,
                       reqSlot.title AS requestedSlotTitle, reqSlot.startTime AS requestedSlotStart,
                       offSlot.title AS offeredSlotTitle, offSlot.startTime AS offeredSlotStart,
                       owner.name AS ownerName
                FROM SwapRequests sr
                JOIN Events reqSlot ON sr.requestedSlotId = reqSlot.id
                JOIN Events offSlot ON sr.offeredSlotId = offSlot.id
                JOIN Users owner ON sr.ownerId = owner.id
                WHERE sr.requesterId = ? AND sr.status = 'PENDING'
            `;
            db.all(outgoingSql, [userId], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                results.outgoing = rows;
                res.json(results);
            });
        });
    });
});


// POST: Respond to a swap request (Accept/Reject)
app.post('/api/swap-response/:requestId', authMiddleware, (req, res) => {
    const { accept } = req.body; // true or false
    const requestId = req.params.requestId;
    const userId = req.user.id;

    db.serialize(() => {
        // 1. Find the request and verify the user is the owner
        const getReqSql = `SELECT * FROM SwapRequests WHERE id = ? AND ownerId = ? AND status = 'PENDING'`;
        db.get(getReqSql, [requestId, userId], (err, swap) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!swap) return res.status(404).json({ message: "Swap request not found or you are not the owner." });

            const { requestedSlotId, offeredSlotId, requesterId, ownerId } = swap;

            if (accept === true) {
                // --- ACCEPT LOGIC ---
                // 1. Update SwapRequest status
                const updateReqSql = `UPDATE SwapRequests SET status = 'ACCEPTED' WHERE id = ?`;
                db.run(updateReqSql, [requestId], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                });

                // 2. Swap owners and set status to BUSY
                // My slot (requested by them) goes to the requester
                const giveMySlotSql = `UPDATE Events SET userId = ?, status = 'BUSY' WHERE id = ?`;
                db.run(giveMySlotSql, [requesterId, requestedSlotId], (err) => {
                     if (err) return res.status(500).json({ error: err.message });
                });

                // Their slot (offered by them) comes to me
                const takeTheirSlotSql = `UPDATE Events SET userId = ?, status = 'BUSY' WHERE id = ?`;
                db.run(takeTheirSlotSql, [ownerId, offeredSlotId], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: "Swap accepted!" });
                });
                
            } else {
                // --- REJECT LOGIC ---
                // 1. Update SwapRequest status
                const updateReqSql = `UPDATE SwapRequests SET status = 'REJECTED' WHERE id = ?`;
                db.run(updateReqSql, [requestId], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                });

                // 2. Set both slots back to SWAPPABLE
                const updateEventsSql = `UPDATE Events SET status = 'SWAPPABLE' WHERE id = ? OR id = ?`;
                db.run(updateEventsSql, [requestedSlotId, offeredSlotId], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: "Swap rejected." });
                });
            }
        });
    });
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});