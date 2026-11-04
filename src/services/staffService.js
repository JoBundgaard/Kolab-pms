import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../firebase.js";
const call = httpsCallable(getFunctions(app, "us-central1"), "staffPortal");
export const staffRequest = async (action, input = {}) =>
  (await call({ action, ...input })).data;

// Keep the ID when a caller retries the same operation after a lost response.
export const staffOperation = (action, input) => ({
  action,
  input: { ...input, actionId: crypto.randomUUID() },
});
export const runStaffOperation = ({ action, input }) =>
  staffRequest(action, input);

export async function readReceipt(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose a JPEG, PNG or WebP photo. / Chọn ảnh JPEG, PNG hoặc WebP.",
    );
  if (file.size > 15 * 1024 * 1024)
    throw new Error(
      "Photo must be smaller than 15 MB. / Ảnh phải nhỏ hơn 15 MB.",
    );
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45, 0.3]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= 700000) return data;
    }
    throw new Error(
      "Photo is too large. Try a closer photo of the receipt. / Ảnh quá lớn. Hãy chụp gần hóa đơn hơn.",
    );
  } finally {
    bitmap.close();
  }
}
