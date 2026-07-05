import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Crucial: we need to parse larger JSON payloads for base64 images
  app.use(express.json({ limit: '30mb' }));

  // Initialize Gemini
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Route for OCR coordinates from land certificate images
  app.post("/api/ocr-coordinates", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      const customApiKey = req.headers["x-gemini-key"] as string;

      if (!imageBase64) {
         res.status(400).json({ error: "Thiếu dữ liệu ảnh base64." });
         return;
      }

      // If client sent a custom API Key, use that. Otherwise use backend's default.
      let activeAi = ai;
      if (customApiKey && customApiKey.trim() !== "") {
        activeAi = new GoogleGenAI({
          apiKey: customApiKey.trim(),
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });
      } else if (!process.env.GEMINI_API_KEY) {
        res.status(400).json({ 
          error: "Chưa cấu hình API Key cho Gemini. Vui lòng nhập API Key của bạn để sử dụng tính năng này!" 
        });
        return;
      }

      // Call Gemini 3.5-flash which is perfect for Multimodal OCR
      const response = await activeAi.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              mimeType: mimeType || "image/jpeg",
              data: imageBase64
            }
          },
          {
            text: `Bạn là một chuyên gia về bản đồ địa chính Việt Nam. Hãy đọc bảng tọa độ VN-2000 từ hình ảnh sổ đỏ/sổ hồng này.
Bảng tọa độ thường có các cột: Số hiệu điểm (Mốc), Tọa độ X (m), Tọa độ Y (m), hoặc đôi khi đảo ngược Y và X.
Chú ý quan trọng:
- Ở Việt Nam, tọa độ địa chính VN-2000 thường có X khoảng từ 1,000,000 đến 2,500,000 (tọa độ Bắc - Northing) và Y khoảng từ 300,000 đến 700,000 (tọa độ Đông - Easting). Hãy đảm bảo trích xuất chính xác X và Y tương ứng theo quy chuẩn này. Nếu trên cột ghi ngược lại (ví dụ X ghi số nhỏ 500k, Y ghi số lớn 2tr), hãy tự động đảo lại để X là số lớn (~1tr - 2.5tr) và Y là số nhỏ (~300k - 700k).
- Trích xuất tất cả các hàng trong bảng tọa độ theo thứ tự tăng dần của Số hiệu điểm (từ điểm 1, 2, 3... đến điểm cuối).
- Trả về danh sách các điểm dạng JSON chứa: label (Ví dụ: "1", "2"), x (số thực), y (số thực).
- Chỉ lấy các điểm mốc chính của thửa đất, bỏ qua các điểm phụ không nằm trong bảng tọa độ chính hoặc điểm lặp lại nếu không cần thiết, nhưng tốt nhất hãy trích xuất đúng tất cả các dòng của bảng.`
          }
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
                      description: "Số hiệu điểm mốc (ví dụ: '1', '2', '3', '4')"
                    },
                    x: {
                      type: Type.NUMBER,
                      description: "Tọa độ X (số lớn, từ 1,000,000 đến 2,500,000)"
                    },
                    y: {
                      type: Type.NUMBER,
                      description: "Tọa độ Y (số nhỏ, từ 300,000 đến 700,000)"
                    }
                  },
                  required: ["label", "x", "y"]
                }
              }
            },
            required: ["points"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("Không nhận được phản hồi từ mô hình AI.");
      }

      const parsedData = JSON.parse(text);
      res.json(parsedData);
    } catch (error: any) {
      console.error("Error calling Gemini API:", error);
      res.status(500).json({ error: error?.message || "Lỗi xử lý ảnh bằng AI" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
