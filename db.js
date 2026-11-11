import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import bcrypt from "bcryptjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, "conf.db"));
const hash = (pwd) => bcrypt.hashSync(pwd, 10);

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    fio TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    room_id INTEGER NOT NULL,
    date_start TEXT NOT NULL,
    payment TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Новая',
    review TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT
  );
`);

const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;

if (count === 0) {
  const stmt = db.prepare(
    "INSERT INTO users (login, password, fio, phone, email) VALUES (?, ?, ?, ?, ?)",
  );
  const demoHash = hash("demo");
  stmt.run(
    "ivan",
    demoHash,
    "Иванов Иван",
    "8(999)123-45-67",
    "ivan@example.com",
  );
  stmt.run(
    "petr",
    demoHash,
    "Петров Пётр",
    "8(999)123-45-68",
    "petr@example.com",
  );
  stmt.run(
    "anna",
    demoHash,
    "Анна Сидорова",
    "8(999)123-45-69",
    "anna@example.com",
  );
  stmt.run(
    "Conf2027",
    hash("Demo77"),
    "Администратор",
    "8(999)000-00-00",
    "admin@conf.ru",
  );
  console.log("Тестовые пользователи добавлены");
}

const roomsCount = db.prepare("SELECT COUNT(*) AS c FROM rooms").get().c;

if (roomsCount === 0) {
  const stmt = db.prepare(`
    INSERT INTO rooms (name, type, capacity)
    VALUES (?, ?, ?)
  `);
  stmt.run("Аудитория №1", "Аудитория", 100);
  stmt.run("Аудитория №2", "Аудитория", 50);
  stmt.run("Коворкинг «Точка»", "Коворкинг", 20);
  stmt.run("Кинозал «Октябрь»", "Кинозал", 80);
  console.log("Тестовые комнаты добавлены");
}

const requestsCount = db.prepare("SELECT COUNT(*) AS c FROM requests").get().c;

if (requestsCount === 0) {
  const stmt = db.prepare(`
    INSERT INTO requests (user_id, room_id, date_start, payment)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(1, 1, "2027-03-15", "При очном посещении");
  stmt.run(1, 3, "2027-03-20", "Перевод по СБП");
  stmt.run(2, 4, "2027-04-01", "При очном посещении");
  console.log("Тестовые заявки добавлены");
}

const plainUsers = db.prepare("SELECT id, password FROM users").all();
const updatePassword = db.prepare("UPDATE users SET password = ? WHERE id = ?");

for (const user of plainUsers) {
  if (!/^\$2[aby]\$/.test(user.password)) {
    updatePassword.run(hash(user.password), user.id);
  }
}

db.prepare(
  "UPDATE requests SET payment = 'Перевод по СБП' WHERE payment = 'Перевод по СПБ'",
).run();

class UserModel {
  constructor() {
    this.table = "users";
  }

  create({ login, password, fio, phone, email }) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const stmt = db.prepare(`
      INSERT INTO ${this.table} (login, password, fio, phone, email)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(login, hashedPassword, fio, phone, email);
    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  findByLogin(login) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE login = ?`).get(login);
  }

  findAll() {
    return db.prepare(`SELECT * FROM ${this.table}`).all();
  }

  count() {
    const result = db
      .prepare(`SELECT COUNT(*) AS count FROM ${this.table}`)
      .get();
    return result ? result.count : 0;
  }

  exists(login) {
    const user = db
      .prepare(`SELECT 1 FROM ${this.table} WHERE login = ?`)
      .get(login);
    return !!user;
  }
}

class RoomModel {
  constructor() {
    this.table = "rooms";
  }

  findAll() {
    return db.prepare(`SELECT * FROM ${this.table}`).all();
  }

  findById(id) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  findByType(type) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE type = ?`).get(type);
  }

  count() {
    const result = db
      .prepare(`SELECT COUNT(*) AS count FROM ${this.table}`)
      .get();
    return result ? result.count : 0;
  }
}

class RequestModel {
  constructor() {
    this.table = "requests";
  }

  create({ userId, roomId, dateStart, payment }) {
    const result = db
      .prepare(
        `
        INSERT INTO ${this.table} (user_id, room_id, date_start, payment)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(userId, roomId, dateStart, payment);

    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  findByUser(userId) {
    return db
      .prepare(
        `
        SELECT
          r.*,
          rm.name AS room_name,
          rm.type AS room_type
        FROM ${this.table} AS r
        JOIN rooms AS rm ON rm.id = r.room_id
        WHERE r.user_id = ?
        ORDER BY r.id DESC
      `,
      )
      .all(userId);
  }

  findAllDetailed() {
    return db
      .prepare(
        `
        SELECT
          r.*,
          u.fio AS user_fio,
          u.login AS user_login,
          rm.name AS room_name,
          rm.type AS room_type
        FROM ${this.table} AS r
        JOIN users AS u ON u.id = r.user_id
        JOIN rooms AS rm ON rm.id = r.room_id
        ORDER BY r.id DESC
      `,
      )
      .all();
  }

  findDetailed(id) {
    return db
      .prepare(
        `
    SELECT r.*,
           u.fio AS user_fio,
           u.login AS user_login,
           u.email AS user_email,
           u.phone AS user_phone,
           rm.name AS room_name,
           rm.type AS room_type,
           rm.capacity AS room_capacity
    FROM ${this.table} r
    JOIN users u ON u.id = r.user_id
    JOIN rooms rm ON rm.id = r.room_id
    WHERE r.id = ?
  `,
      )
      .get(id);
  }

  count() {
    const result = db
      .prepare(`SELECT COUNT(*) AS count FROM ${this.table}`)
      .get();
    return result ? result.count : 0;
  }

  findByStatus(status) {
    return db
      .prepare(
        `
        SELECT
          r.*,
          u.fio AS user_fio,
          u.login AS user_login,
          rm.name AS room_name,
          rm.type AS room_type
        FROM ${this.table} AS r
        JOIN users AS u ON u.id = r.user_id
        JOIN rooms AS rm ON rm.id = r.room_id
        WHERE r.status = ?
        ORDER BY r.id DESC
      `,
      )
      .all(status);
  }

  updateStatus(id, status) {
    return db
      .prepare(`UPDATE ${this.table} SET status = ? WHERE id = ?`)
      .run(status, id);
  }

  addReview(id, userId, review) {
    if (!review || !review.trim()) return false;

    const info = db
      .prepare(
        `UPDATE ${this.table}
         SET review = ?
         WHERE id = ? AND user_id = ? AND status = 'Завершено'`,
      )
      .run(review.trim(), id, userId);

    return info.changes > 0;
  }
}

export const User = new UserModel();
export const Room = new RoomModel();
export const Request = new RequestModel();
export default db;
