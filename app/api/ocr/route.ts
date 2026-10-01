import { NextRequest, NextResponse } from "next/server";

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getPromptForSubject, TABLE_EXTRACT_PROMPT } from "./prompts";

async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) return imageUrl;
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/png";
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  return _genAI;
}

export async function POST(req: NextRequest) {
  try {
    const { image, model, subject } = await req.json();
    const prompt = getPromptForSubject(subject);

    let result: NextResponse;
    switch (model) {
      case "gpt-table":
        result = await runGPT4o(image, TABLE_EXTRACT_PROMPT, "gpt-4o");
        break;
      case "claude-sonnet":
      case "claude-sonnet-4-5":
        result = await runClaude(image, prompt);
        break;
      case "gemini-flash":
        result = await runGemini(image, prompt);
        break;
      case "gpt-4o-mini":
        result = await runGPT4o(image, prompt, "gpt-4o-mini");
        break;
      case "gpt4o":
      case "gpt-4o":
      default:
        result = await runGPT4o(image, prompt, "gpt-4o");
        break;
    }
    return result;
  } catch (err: any) {
    console.error("OCR route error:", err);
    const detail = err?.message || err?.error?.message || "OCR failed";
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

async function runGPT4oRaw(
  image: string,
  prompt: string,
  model: "gpt-4o" | "gpt-4o-mini" = "gpt-4o",
): Promise<string> {
  const dataUri = await fetchImageAsBase64(image);
  const response = await openai.chat.completions.create({
    model,
    max_completion_tokens: 6000,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUri, detail: "high" } },
        ],
      },
    ],
  });
  return response.choices[0].message.content ?? "";
}

async function runGPT4o(
  image: string,
  prompt: string,
  model: "gpt-4o" | "gpt-4o-mini" = "gpt-4o",
) {
  const text = await runGPT4oRaw(image, prompt, model);
  return NextResponse.json({ text: postProcessOcrText(text) });
}

async function runClaude(image: string, prompt: string) {
  const dataUri = await fetchImageAsBase64(image);
  const source = {
    type: "base64" as const,
    media_type: "image/png" as const,
    data: dataUri.split(",")[1],
  };

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return NextResponse.json({ text: postProcessOcrText(text) });
}

async function runGemini(image: string, prompt: string) {
  const model = getGenAI().getGenerativeModel({ model: "gemini-1.5-flash" });
  const dataUri = await fetchImageAsBase64(image);
  const base64 = dataUri.split(",")[1];

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: "image/png", data: base64 } },
  ]);

  return NextResponse.json({
    text: postProcessOcrText(result.response.text()),
  });
}

function postProcessOcrText(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "");
}
