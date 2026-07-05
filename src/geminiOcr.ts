/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";

export interface OcrPoint {
  label: string;
  x: number;
  y: number;
}

const OCR_PROMPT = `Bạn là một chuyên gia về bản đồ địa chính Việt Nam. Hãy đọc bảng tọa độ VN-2000 từ hình ảnh sổ đỏ/sổ hồng này.
Bảng tọa độ thường có các cột: Số hiệu điểm (Mốc), Tọa độ X (m), Tọa độ Y (m), hoặc đôi khi đảo ngược Y và X.
Chú ý quan trọng:
- Ở Việt Nam, tọa độ địa chính VN-2000 thường có X khoảng từ 1,000,000 đến 2,500,000 (tọa độ Bắc - Northing) và Y khoảng từ 300,000 đến 700,000 (tọa độ Đông - Easting). Hãy đảm bảo trích xuất chính xác X và Y tương ứng theo quy chuẩn này. Nếu trên cột ghi ngược lại (ví dụ X ghi số nhỏ 500k, Y ghi số lớn 2tr), hãy tự động đảo lại để X là số lớn (~1tr - 2.5tr) và Y là số nhỏ (~300k - 700k).
- Trích xuất tất cả các hàng trong bảng tọa độ theo thứ tự tăng dần của Số hiệu điểm (từ điểm 1, 2, 3... đến điểm cuối).
- Trả về danh sách các điểm dạng JSON chứa: label (Ví dụ: "1", "2"), x (số thực), y (số thực).
- Chỉ lấy các điểm mốc chính của thửa đất, bỏ qua các điểm phụ không nằm trong bảng tọa độ chính hoặc điểm lặp lại nếu không cần thiết, nhưng tốt nhất hãy trích xuất đúng tất cả các dòng của bảng.`;

/**
 * Gọi Gemini trực tiếp từ trình duyệt để trích xuất bảng tọa độ VN-2000 từ ảnh
 * sổ đỏ/sổ hồng. Dùng khi ứng dụng được phục vụ tĩnh (GitHub Pages) và không có
 * backend Express — người dùng cung cấp API key của chính họ.
 */
export async function ocrCoordinatesWithGemini(
  apiKey: string,
  imageBase64: string,
  mimeType: string
): Promise<OcrPoint[]> {
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: imageBase64,
        },
      },
      { text: OCR_PROMPT },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          points: {
            type: Type.ARRAY,
            description: "Danh sách các điểm tọa độ trích xuất được từ bảng",
            items: {
              type: Type.OBJECT,
              properties: {
                label: {
                  type: Type.STRING,
                  description: "Số hiệu điểm mốc (ví dụ: '1', '2', '3', '4')",
                },
                x: {
                  type: Type.NUMBER,
                  description: "Tọa độ X (số lớn, từ 1,000,000 đến 2,500,000)",
                },
                y: {
                  type: Type.NUMBER,
                  description: "Tọa độ Y (số nhỏ, từ 300,000 đến 700,000)",
                },
              },
              required: ["label", "x", "y"],
            },
          },
        },
        required: ["points"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Không nhận được phản hồi từ mô hình AI.");
  }

  const parsed = JSON.parse(text);
  return (parsed.points || []) as OcrPoint[];
}
