const { GoogleGenAI, Type } = require("@google/genai");
const { z } = require("zod");

const env = require("../config/env");

const ai = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

const linkSchema = {
  type: Type.OBJECT,
  required: ["label", "url"],
  properties: {
    label: { type: Type.STRING },
    url: { type: Type.STRING },
  },
};

const responseSchema = {
  type: Type.OBJECT,
  required: [
    "basics",
    "summary",
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "languages",
    "interests",
  ],
  properties: {
    basics: {
      type: Type.OBJECT,
      required: ["name", "title", "location", "email", "phone", "links"],
      properties: {
        name: { type: Type.STRING },
        title: { type: Type.STRING },
        location: { type: Type.STRING },
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
        links: { type: Type.ARRAY, items: linkSchema },
      },
    },
    summary: { type: Type.STRING },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["company", "role", "period", "bullets"],
        properties: {
          company: { type: Type.STRING },
          role: { type: Type.STRING },
          location: { type: Type.STRING },
          period: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["degree", "school", "period"],
        properties: {
          degree: { type: Type.STRING },
          school: { type: Type.STRING },
          location: { type: Type.STRING },
          period: { type: Type.STRING },
          details: { type: Type.STRING },
        },
      },
    },
    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
    projects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["name", "description"],
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          tech: { type: Type.ARRAY, items: { type: Type.STRING } },
          links: { type: Type.ARRAY, items: linkSchema },
        },
      },
    },
    certifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["name"],
        properties: {
          name: { type: Type.STRING },
          issuer: { type: Type.STRING },
          year: { type: Type.STRING },
        },
      },
    },
    languages: { type: Type.ARRAY, items: { type: Type.STRING } },
    interests: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

// Helper for handling null or missing strings safely
const safeString = z.string().catch("").default("");
const safeStringArray = z.array(z.string().catch("")).catch([]).default([]);

const validator = z.object({
  basics: z.object({
    name: safeString,
    title: safeString,
    location: safeString,
    email: safeString,
    phone: safeString,
    links: z.array(z.object({ label: safeString, url: safeString })).catch([]).default([]),
  }),
  summary: safeString,
  experience: z
    .array(
      z.object({
        company: safeString,
        role: safeString,
        location: safeString,
        period: safeString,
        bullets: safeStringArray,
      })
    )
    .catch([])
    .default([]),
  education: z
    .array(
      z.object({
        degree: safeString,
        school: safeString,
        location: safeString,
        period: safeString,
        details: safeString,
      })
    )
    .catch([])
    .default([]),
  skills: safeStringArray,
  projects: z
    .array(
      z.object({
        name: safeString,
        description: safeString,
        tech: safeStringArray,
        links: z.array(z.object({ label: safeString, url: safeString })).catch([]).default([]),
      })
    )
    .catch([])
    .default([]),
  certifications: z
    .array(
      z.object({
        name: safeString,
        issuer: safeString,
        year: safeString,
      })
    )
    .catch([])
    .default([]),
  languages: safeStringArray,
  interests: safeStringArray,
});

function buildPrompt(rawText) {
  return [
    "You are a resume parser. The input is text extracted from a PDF - lines may be jumbled or out of natural reading order.",
    "",
    "Extract structured data:",
    '- basics: name, professional title, location, email, phone, social links (LinkedIn / GitHub / portfolio etc.; label like "LinkedIn", full URL)',
    "- summary: the professional summary paragraph (rejoin if split across lines)",
    "- experience: jobs most recent first, with company, role, period (preserve original date format), location if available, and bullet points",
    "- education: degree, school, period, location, optional details",
    "- skills: flat array of technical skills",
    "- projects: name, one-sentence description, optional tech tags, optional links",
    "- certifications: name, issuer, year",
    "- languages: flat array",
    "- interests: flat array",
    "",
    "Rules:",
    "- Be conservative: omit fields that are not clearly present. Use empty strings/arrays where missing.",
    "- Do not invent or paraphrase - extract verbatim where possible.",
    "- Each experience bullet should read as a complete sentence.",
    "- Preserve original date formats (e.g. 'Jan 2022 - Dec 2023').",
    "",
    "RESUME TEXT:",
    "---------",
    rawText,
    "---------",
  ].join("\n");
}

const EMPTY = {
  basics: { name: "", title: "", location: "", email: "", phone: "", links: [] },
  summary: "",
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  languages: [],
  interests: [],
};

async function parseResume(rawText) {
  if (!ai || !rawText?.trim()) return EMPTY;

  const prompt = buildPrompt(rawText);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: env.geminiModel,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.1,
        },
      });

      const text = typeof result.text === "function" ? result.text() : result.text;
      if (!text) throw new Error("Empty response");

      const parsed = JSON.parse(text);
      return validator.parse(parsed);
    } catch (err) {
      if (attempt === 2) {
        console.error("Structured parse failed:", err.message);
        return EMPTY;
      }
    }
  }

  return EMPTY;
}

module.exports = { parseResume };