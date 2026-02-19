const Database = require('better-sqlite3');
const path = require('path');

const db = new Database('smartcalories.db', { verbose: console.log });

function initDb() {
  // User Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      age INTEGER,
      gender TEXT,
      height REAL,
      weight REAL,
      activity_level TEXT,
      caloric_goal INTEGER,
      goal_type TEXT, -- 'maintain', 'loss', 'gain'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Foods Table (Common Database)
  db.exec(`
    CREATE TABLE IF NOT EXISTS foods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      base_calories REAL, -- per 100g or 1 unit
      unit TEXT, -- 'g', 'ml', 'piece'
      default_serving REAL,
      carbs REAL,
      protein REAL,
      fat REAL,
      category TEXT
    )
  `);

  // Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      food_name TEXT,
      calories REAL,
      quantity REAL,
      unit TEXT,
      cooking_method TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      meal_type TEXT -- 'breakfast', 'lunch', 'dinner', 'snack'
    )
  `);

  console.log('Database tables initialized.');
  seedFoods();
}

function seedFoods() {
  const count = db.prepare('SELECT count(*) as count FROM foods').get();
  if (count.count > 0) return;

  const insert = db.prepare(`
    INSERT INTO foods (name, base_calories, unit, default_serving, carbs, protein, fat, category)
    VALUES (@name, @base_calories, @unit, @default_serving, @carbs, @protein, @fat, @category)
  `);

  const initialFoods = [
    { name: 'Rice (Raw)', base_calories: 360, unit: 'g', default_serving: 50, carbs: 78, protein: 6.8, fat: 0.5, category: 'Staple' },
    { name: 'Roti (Wheat)', base_calories: 120, unit: 'piece', default_serving: 1, carbs: 20, protein: 4, fat: 2, category: 'Staple' },
    { name: 'Dal (Toor, Plain)', base_calories: 100, unit: 'bowl', default_serving: 1, carbs: 15, protein: 6, fat: 1, category: 'Main' },
    { name: 'Paneer Butter Masala', base_calories: 350, unit: 'bowl', default_serving: 1, carbs: 12, protein: 10, fat: 25, category: 'Main' },
    { name: 'Chicken Curry', base_calories: 300, unit: 'bowl', default_serving: 1, carbs: 8, protein: 25, fat: 18, category: 'Main' },
    { name: 'Dosa (Plain)', base_calories: 133, unit: 'piece', default_serving: 1, carbs: 23, protein: 4, fat: 3, category: 'Staple' },
    { name: 'Idli', base_calories: 58, unit: 'piece', default_serving: 2, carbs: 12, protein: 2, fat: 0.2, category: 'Staple' },
    { name: 'Banana', base_calories: 89, unit: 'piece', default_serving: 1, carbs: 22, protein: 1, fat: 0.3, category: 'Fruit' },
    { name: 'Milk (Cow)', base_calories: 60, unit: '100ml', default_serving: 200, carbs: 4.8, protein: 3.2, fat: 3.5, category: 'Dairy' },
  ];

  const insertMany = db.transaction((foods) => {
    for (const food of foods) insert.run(food);
  });

  insertMany(initialFoods);
  console.log('Seeded initial food data.');
}

module.exports = { db, initDb };
