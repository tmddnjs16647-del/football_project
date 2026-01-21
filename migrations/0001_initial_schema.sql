-- 0001_initial_schema.sql

-- Admin Table
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL -- In real world, use hashed password
);

-- Players Table
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    number TEXT NOT NULL, -- String to allow 'HEAD', 'COACH' etc.
    position TEXT NOT NULL,
    role TEXT,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Matches Table
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT DEFAULT 'UPCOMING', -- UPCOMING, COMPLETED
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    opponent TEXT NOT NULL,
    location TEXT DEFAULT 'HOME',
    result TEXT, -- WIN, LOSE, DRAW
    score TEXT,
    d_day TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Admin (admin / 1234)
INSERT OR IGNORE INTO admins (username, password) VALUES ('admin', '1234');

-- Insert Initial Players (Sample Data)
INSERT OR IGNORE INTO players (name, number, position, role) VALUES 
('김감독', 'HEAD', 'STAFF', '감독'),
('최공격', '10', 'FW', '에이스'),
('박지성', '13', 'MF', '주장'),
('김민재', '4', 'DF', '벽'),
('조현우', '21', 'GK', '빛');

-- Insert Initial Matches (Sample Data)
INSERT OR IGNORE INTO matches (status, date, time, opponent, location, result, score) VALUES 
('COMPLETED', '2024.03.10', '14:00', 'FC STORM', 'HOME', 'WIN', '3 : 1'),
('UPCOMING', '2024.03.31', '14:00', 'RED DEVILS', 'HOME', NULL, NULL);
