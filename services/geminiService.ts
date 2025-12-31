import { GoogleGenAI, Type } from "@google/genai";
import { PEDAGOGICAL_SYSTEM_INSTRUCTION } from "../constants";
import { Slide, AspectRatio } from "../types";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable is missing");
  }
  return new GoogleGenAI({ apiKey });
};

export const generateScriptFromMaterials = async (
  topic: string,
  materials: string,
  audience: string
): Promise<Omit<Slide, 'id' | 'order' | 'isRegeneratingImage'>[]> => {
  const ai = getClient();
  
  const prompt = `
    Topic: ${topic}
    Target Audience: ${audience}
    Source Materials: ${materials}
    
    Generate a video script broken down into slides. Return ONLY JSON.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: PEDAGOGICAL_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            scriptText: { type: Type.STRING },
            visualPrompt: { type: Type.STRING },
          },
          required: ["scriptText", "visualPrompt"],
        },
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");

  return JSON.parse(text);
};

export const generateSlideImage = async (
  visualPrompt: string,
  aspectRatio: AspectRatio
): Promise<string> => {
  const ai = getClient();
  
  // Map aspect ratio string to API expected format if needed, 
  // currently Gemini accepts "16:9", "1:1", "9:16" directly in config for some models,
  // but for image generation specifically via prompt engineering or tools, we guide it.
  // Note: The prompt instructions specify using 'gemini-2.5-flash-image' which uses `generateContent`
  // and we parse the inlineData.

  const model = "gemini-2.5-flash-image";
  
  // Enhancing prompt for better style consistency
  const enhancedPrompt = `
    Create an educational illustration.
    Style: Clean, vector-art style, flat design, high contrast, minimalist background.
    Subject: ${visualPrompt}
    Aspect Ratio: ${aspectRatio}
    Do not include text inside the image if possible.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: enhancedPrompt,
    config: {
        // Nano banana models don't support responseMimeType/Schema for images usually, 
        // relying on the prompt for generation.
        // However, we can use 'imageConfig' if we upgraded to 'gemini-3-pro-image-preview'.
        // Sticking to 2.5 flash image as requested for general tasks unless quality is paramount.
        // Let's use the prompt to guide aspect ratio mostly, or upgrade if strictly needed.
        // To be safe and high quality let's use the prompt effectively.
    }
  });

  // Extract image
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData && part.inlineData.data) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image generated");
};

export const refineContent = async (
  currentSlide: Slide,
  feedback: string
): Promise<{ scriptText: string; visualPrompt: string }> => {
  const ai = getClient();
  
  const prompt = `
    Current Script: "${currentSlide.scriptText}"
    Current Visual Prompt: "${currentSlide.visualPrompt}"
    User Feedback/Notes: "${feedback}"

    Based on the feedback, REWRITE the script and the visual prompt.
    If the feedback focuses on visuals, update visualPrompt significantly.
    If the feedback focuses on text, update scriptText.
    
    Return JSON.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scriptText: { type: Type.STRING },
          visualPrompt: { type: Type.STRING },
        },
        required: ["scriptText", "visualPrompt"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Failed to refine content");
  return JSON.parse(text);
};
