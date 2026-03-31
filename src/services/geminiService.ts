import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const diagnoseCropDisease = async (base64Image: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `You are an expert agricultural scientist specializing in Kerala's crops (Coconut, Rubber, Banana, Pepper, etc.). 
  Analyze this image of a crop and:
  1. Identify the disease or pest.
  2. Provide a detailed organic treatment plan.
  3. Provide the response in both English and Malayalam.
  Format the response clearly with headings.`;

  const imagePart = {
    inlineData: {
      mimeType: "image/jpeg",
      data: base64Image,
    },
  };

  const response = await ai.models.generateContent({
    model,
    contents: { parts: [imagePart, { text: prompt }] },
  });

  return response.text;
};

export const getCropCalendar = async (weatherData: string) => {
  const model = "gemini-3-flash-preview";
  const prompt = `Based on the following weather data for Kerala: ${weatherData}, 
  provide a "Smart Schedule" for farmers. 
  Include:
  1. Best planting/harvesting windows for major crops.
  2. Alerts for upcoming heavy rains or dry spells.
  3. Advice on soil management.
  Format as a professional agricultural report.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text;
};

export const analyzeSoilHealth = async (soilData: { ph: number; nitrogen: number; phosphorus: number; potassium: number; crop: string }) => {
  const model = "gemini-3-flash-preview";
  const prompt = `You are an expert soil scientist and agricultural advisor specializing in Kerala's agriculture.
  Analyze the following soil test results for a ${soilData.crop} field:
  - pH: ${soilData.ph}
  - Nitrogen (N): ${soilData.nitrogen} mg/kg
  - Phosphorus (P): ${soilData.phosphorus} mg/kg
  - Potassium (K): ${soilData.potassium} mg/kg

  Based on these results, provide:
  1. A detailed assessment of the soil health.
  2. Specific recommendations for fertilization (organic and inorganic options).
  3. Advice on soil amendments (e.g., lime for acidity, organic matter).
  4. Best practices for maintaining soil health for ${soilData.crop}.
  
  Provide the response in both English and Malayalam.
  Format the response clearly with headings using Markdown.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text;
};
