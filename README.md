# AgriPulse Kerala

**Live Website:** [https://remix-agripulse-kerala-796850648989.us-west1.run.app](https://remix-agripulse-kerala-796850648989.us-west1.run.app)

## Problem Statement
Farmers in Kerala often struggle with timely crop disease identification, lack of real-time monitoring for soil and environmental conditions, and difficulty in accessing up-to-date market prices and agricultural resources. Traditional farming methods lack the data-driven insights needed to optimize yields and manage resources efficiently in a changing climate.

## Project Description
AgriPulse Kerala is a comprehensive digital platform designed to empower the agricultural community with modern technology. It integrates:
- **AI-Powered Diagnostics:** Instant identification of crop diseases using computer vision.
- **Interactive Farm Mapping:** A unique "pencil sketch" style interface for farmers to map their fields and manage IoT device placements.
- **IoT Integration:** Real-time monitoring of soil moisture, temperature, and humidity via connected sensors.
- **AI Farming Assistant:** A specialized chatbot that provides expert agricultural advice while maintaining a strict focus on farming topics.
- **Market Hub:** A centralized resource for tracking market prices, finding Krishi Bhavans, and accessing seed banks.
- **Smart Calendar:** Automated crop management scheduling to ensure timely planting, fertilizing, and harvesting.

---

## Google AI Usage
### Tools / Models Used
- **Gemini 3 Flash:** Powering the AI Crop Diagnosis and the specialized AI Farming Assistant.
- **Gemini 3 Pro:** Used for complex reasoning in Soil Health Analysis and generating localized Crop Calendars.

### How Google AI Was Used
- **Crop Disease Diagnosis:** Users upload photos of affected crops. The Gemini model analyzes the visual data to identify potential diseases and provides detailed treatment recommendations.
- **Specialized AI Assistant:** A custom-tuned chat interface that uses system instructions to act as a professional agricultural expert. It is programmed to provide high-quality farming advice while politely declining non-agricultural queries.
- **Soil Health Insights:** The AI processes soil test parameters (pH, Nitrogen, Phosphorus, Potassium) to generate personalized organic and chemical fertilizer recommendations tailored to specific crops.
- **Agricultural Planning:** Gemini helps generate optimized crop calendars based on seasonal data and specific crop requirements.

---

## Demo Video
[Watch Demo](https://drive.google.com/file/d/1pOjPqbdlHoV2_9U3cRx4LkFvO4sTOZBL/view?usp=drive_link)

---

## Installation Steps

```bash
# Clone the repository
git clone https://github.com/Mifzalk/Hackaton500.git

# Go to project folder
cd agri-pulse-kerala

# Install dependencies
npm install

# Run the project
npm run dev
```
