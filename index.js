const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { db, initDb } = require('./db');

const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Initialize DB
initDb();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_API_KEY_HERE");

// --- Helpers ---
const calculateBMR = (weight, height, age, gender) => {
    // Mifflin-St Jeor Equation
    let bmr = 10 * weight + 6.25 * height - 5 * age;
    if (gender.toLowerCase() === 'male') {
        bmr += 5;
    } else {
        bmr -= 161;
    }
    return bmr;
};

const calculateTDEE = (bmr, activityLevel) => {
    const multipliers = {
        sedentary: 1.2,
        light: 1.375,
        moderate: 1.55,
        active: 1.725,
        very_active: 1.9,
    };
    return Math.round(bmr * (multipliers[activityLevel] || 1.2));
};

// --- Routes ---

// 1. User Profile
app.get('/api/user', (req, res) => {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    if (user) res.json(user);
    else res.json(null);
});

app.post('/api/user', (req, res) => {
    try {
        const { name, age, gender, height, weight, activity_level, goal_type } = req.body;

        if (!name || !age || !height || !weight) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const bmr = calculateBMR(weight, height, age, gender);
        let tdee = calculateTDEE(bmr, activity_level);

        // Adjust for goal
        let caloric_goal = tdee;
        if (goal_type === 'loss') caloric_goal -= 500;
        if (goal_type === 'gain') caloric_goal += 500;

        // Check if user exists
        const existing = db.prepare('SELECT id FROM users LIMIT 1').get();

        if (existing) {
            const update = db.prepare(`
          UPDATE users SET name=@name, age=@age, gender=@gender, height=@height, weight=@weight, 
          activity_level=@activity_level, caloric_goal=@caloric_goal, goal_type=@goal_type
          WHERE id = @id
        `);
            update.run({ ...req.body, caloric_goal, id: existing.id });
        } else {
            const insert = db.prepare(`
          INSERT INTO users (name, age, gender, height, weight, activity_level, caloric_goal, goal_type)
          VALUES (@name, @age, @gender, @height, @weight, @activity_level, @caloric_goal, @goal_type)
        `);
            insert.run({ ...req.body, caloric_goal });
        }

        res.json({ success: true, caloric_goal });
    } catch (err) {
        console.error("Error in /api/user:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Food Search
app.get('/api/foods', (req, res) => {
    const { q } = req.query;
    if (!q) {
        const all = db.prepare('SELECT * FROM foods LIMIT 20').all();
        return res.json(all);
    }
    const foods = db.prepare('SELECT * FROM foods WHERE name LIKE ?').all(`%${q}%`);
    res.json(foods);
});

// 3. Logs
app.get('/api/logs', (req, res) => {
    const { date } = req.query; // YYYY-MM-DD
    let query = 'SELECT * FROM logs';
    const params = [];

    if (date) {
        query += ' WHERE date(timestamp) = ?';
        params.push(date);
    }
    query += ' ORDER BY timestamp DESC';

    const logs = db.prepare(query).all(...params);

    // Aggregates
    const totalCalories = logs.reduce((sum, log) => sum + log.calories, 0);

    res.json({ logs, totalCalories });
});

app.post('/api/logs', (req, res) => {
    const { user_id, food_name, calories, quantity, unit, cooking_method, meal_type } = req.body;

    const insert = db.prepare(`
    INSERT INTO logs (user_id, food_name, calories, quantity, unit, cooking_method, meal_type)
    VALUES (@user_id, @food_name, @calories, @quantity, @unit, @cooking_method, @meal_type)
  `);

    const info = insert.run(req.body);
    res.json({ success: true, id: info.lastInsertRowid });
});

// 4. AI Image Recognition
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image uploaded" });
        }

        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
            // Return mock if no key for UI testing
            console.log("No API Key found, returning mock data");
            return res.json({
                detected: [
                    { name: 'Rice (Raw)', confidence: 0.95 },
                    { name: 'Dal (Plain)', confidence: 0.88 },
                    { name: 'Roti', confidence: 0.70 }
                ]
            });
        }

        const user = db.prepare('SELECT * FROM users LIMIT 1').get();
        let userContext = "";
        if (user) {
            userContext = `\nUser Profile:\n- Weight: ${user.weight}kg\n- Goal: ${user.goal_type}\n- Activity: ${user.activity_level}\n`;
        }

        const systemInstruction = `
You are SmartCalories AI, an expert nutrition analysis assistant.${userContext}

Goal:
Estimate food calories accurately without manual calorie entry using AI reasoning.

Instructions:
1. Estimate calories realistically based on food type, quantity, cooking method, and oil usage.
2. Adjust estimation slightly based on user profile and goal (if provided).
3. If quantity is vague, infer a reasonable portion size.
4. If image is provided, cross-check food type and portion visually.
5. Avoid extreme or unrealistic values.
6. Be concise and factual.

Output:
Return ONLY valid JSON in the following format:
{
  "calories": number,
  "macros": {
    "protein": "X g",
    "fat": "X g",
    "carbs": "X g"
  },
  "confidence": "low | medium | high",
  "ai_insight": "One short helpful suggestion"
}
`;

        const prompt = "Analyze this food image. Return ONLY the JSON object as specified in the system instructions.";

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemInstruction
        });

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: req.file.mimetype,
                },
            },
        ]);
        const response = await result.response;
        const text = response.text();
        // Parse JSON from text (handle potential markdown ticks)
        const jsonStr = text.replace(/```json|```/g, '').trim();
        const data = JSON.parse(jsonStr);
        res.json(data);
    } catch (err) {
        console.error("Error in /api/analyze-image:", err);
        res.status(500).json({ error: err.message });
    }
});

// 5. AI Text Analysis
app.post('/api/analyze-text', async (req, res) => {
    try {
        const { food_name, quantity, cooking_method, oil_type } = req.body;

        if (!food_name) {
            return res.status(400).json({ error: "Missing food_name" });
        }

        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
            return res.json({
                calories: 350,
                macros: { protein: "20g", fat: "15g", carbs: "35g" },
                confidence: "medium",
                ai_insight: "Based on common portions."
            });
        }

        const user = db.prepare('SELECT * FROM users LIMIT 1').get();
        let userContext = "";
        if (user) {
            userContext = `\nUser Profile:\n- Weight: ${user.weight}kg\n- Goal: ${user.goal_type}\n- Activity: ${user.activity_level}\n`;
        }

        const systemInstruction = `
You are SmartCalories AI, an expert nutrition analysis assistant.${userContext}

Goal:
Estimate food calories accurately without manual calorie entry using AI reasoning.

Instructions:
1. Estimate calories realistically based on food type, quantity, cooking method, and oil usage.
2. Adjust estimation slightly based on user profile and goal (if provided).
3. If quantity is vague, infer a reasonable portion size.
4. If image is provided, cross-check food type and portion visually.
5. Avoid extreme or unrealistic values.
6. Be concise and factual.

Output:
Return ONLY valid JSON in the following format:
{
  "calories": number,
  "macros": {
    "protein": "X g",
    "fat": "X g",
    "carbs": "X g"
  },
  "confidence": "low | medium | high",
  "ai_insight": "One short helpful suggestion"
}
`;

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: systemInstruction
        });

        const prompt = `Analyze this meal entry:
Food: ${food_name}
Quantity: ${quantity || "1 serving"}
Cooking Method: ${cooking_method || "standard"}
${oil_type ? `Oil used: ${oil_type}` : ""}

Return ONLY the JSON object.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        const jsonStr = text.replace(/```json|```/g, '').trim();
        const data = JSON.parse(jsonStr);
        res.json(data);
    } catch (err) {
        console.error("Error in /api/analyze-text:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Server running on http://127.0.0.1:${PORT}`);
    console.log("Ready to accept connections...");
});
