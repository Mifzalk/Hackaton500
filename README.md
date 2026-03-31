# Kerala Smart Farmer App

A comprehensive digital platform for Kerala's farming community, integrating IoT monitoring, AI-driven diagnostics, and community resource management.

## Features

### 1. AI Crop Diagnosis
- Upload or capture photos of crops to get instant health reports.
- Powered by Gemini AI for accurate disease identification and treatment suggestions.
- Maintains a history of previous diagnoses for long-term tracking.

### 2. Interactive Farm Map (Pencil Sketch Style)
- Draw and define your farm areas using a unique hand-drawn pencil sketch aesthetic.
- Directly input field names and crop types on the map.
- Calculate area size automatically.
- Place and monitor IoT devices (sensors, valves) on your farm layout.

### 3. AI Farming Assistant
- Dedicated chat interface for agricultural expert advice.
- Specialized in farming topics, crop management, and sustainable practices.
- Blocks non-farming related queries to stay focused on your agricultural needs.

### 4. Smart Insights & IoT Monitoring
- Real-time monitoring of soil moisture, temperature, and humidity.
- Historical data visualization using interactive charts.
- Automated health scores and alerts based on sensor data.

### 5. Community Resource Hub
- Find nearby Markets, Krishi Bhavans, and Seed Banks.
- Real-time price tracking for major crops (Coconut, Rubber, Banana).
- User reviews and contact information for local resources.

### 6. Crop Calendar
- Plan and track your farming activities (Planting, Harvesting, Fertilizing).
- Visual monthly calendar view for easy task management.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Lucide Icons, Framer Motion.
- **Canvas/Mapping:** Konva.js for interactive farm layouts.
- **Backend:** Firebase (Firestore, Authentication).
- **AI Integration:** Google Gemini API for diagnostics and chat assistance.
- **Charts:** Recharts for data visualization.

## Setup Instructions

1. **Environment Variables:**
   - Create a `.env` file based on `.env.example`.
   - Add your `GEMINI_API_KEY`.
   - Configure your Firebase project in `firebase-applet-config.json`.

2. **Installation:**
   ```bash
   npm install
   ```

3. **Development:**
   ```bash
   npm run dev
   ```

4. **Sample Data:**
   - Log in to the app.
   - Navigate to the **Market Hub** tab.
   - Click the **Seed Data** button to populate your account with initial sample data.

## Security
- Firestore Security Rules are implemented to ensure data privacy and ownership.
- Users can only access and modify their own farm data and resources.
